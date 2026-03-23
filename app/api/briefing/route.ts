import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/db';
import { PREDICTIVE_ALERT_TYPES, SIGNAL_TYPE_LABELS, SCORE_WEIGHTS } from '@/lib/utils/constants';
import { detectDivergences, formatCurrency, formatPercentRaw } from '@/lib/utils/format';
import { classifySetups } from '@/lib/setups';

export const dynamic = 'force-dynamic';

function authCheck(req: NextRequest): boolean {
  const token = process.env.BRIEFING_TOKEN;
  if (!token) return false;

  const paramToken = req.nextUrl.searchParams.get('token');
  if (paramToken === token) return true;

  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${token}`) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ error: 'Unauthorized — add ?token=YOUR_BRIEFING_TOKEN' }, { status: 401 });
  }

  try {
    const briefing = await generateBriefing();
    const format = req.nextUrl.searchParams.get('format');

    if (format === 'json') {
      return NextResponse.json(briefing);
    }

    return new NextResponse(briefing.markdown, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

interface BriefingData {
  markdown: string;
  generatedAt: string;
}

async function generateBriefing(): Promise<BriefingData> {
  const db = getSupabaseServerClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [
    alertsRes,
    topStocksRes,
    spyRes,
    statsRes,
    bestSignalRes,
    highBucketRes,
    lowBucketRes,
    recentAlertsRes,
  ] = await Promise.all([
    db
      .from('alert_history')
      .select('symbol, alert_type, message, created_at')
      .in('alert_type', [...PREDICTIVE_ALERT_TYPES])
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false }),
    db
      .from('sentinel_scores')
      .select(`
        symbol, sentinel_score, technical_score, fundamental_score,
        earnings_ai_score, insider_score, institutional_score,
        estimate_revision_score, news_sentiment_score,
        score_change_1d, flags,
        stocks!inner(name, sector, market_cap),
        technical_signals(rsi_14, price_vs_sma50, price_vs_sma200, pct_from_52w_high, volume_ratio_50d),
        fundamentals(revenue_growth_yoy, earnings_growth_yoy, pe_ratio)
      `)
      .not('sentinel_score', 'is', null)
      .order('sentinel_score', { ascending: false })
      .limit(100),
    db.from('daily_prices').select('date, close').eq('symbol', 'SPY').order('date', { ascending: false }).limit(2),
    db.from('stocks').select('symbol', { count: 'exact', head: true }).eq('is_active', true),
    db.from('signal_performance')
      .select('signal_type, avg_return, win_rate, total_signals, avg_alpha')
      .eq('period', '30d')
      .gte('total_signals', 5)
      .order('avg_alpha', { ascending: false })
      .limit(5),
    db.from('score_bucket_performance')
      .select('avg_return, avg_alpha, win_rate, num_stocks')
      .eq('bucket', '75-100').eq('period', '30d')
      .order('computed_date', { ascending: false }).limit(1).single(),
    db.from('score_bucket_performance')
      .select('avg_return, avg_alpha, win_rate, num_stocks')
      .eq('bucket', '0-30').eq('period', '30d')
      .order('computed_date', { ascending: false }).limit(1).single(),
    db.from('alert_history')
      .select('symbol, alert_type, message, sentinel_score, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const alerts = alertsRes.data ?? [];
  const topStocks = topStocksRes.data ?? [];
  const spyPrices = spyRes.data ?? [];
  const recentAlerts = recentAlertsRes.data ?? [];

  // SPY context
  const spyPrice = spyPrices[0]?.close ? Number(spyPrices[0].close) : null;
  const spyPrev = spyPrices[1]?.close ? Number(spyPrices[1].close) : null;
  const spyChange = spyPrice && spyPrev ? (spyPrice - spyPrev) / spyPrev : null;

  // Build setups from predictive alerts
  const symbolAlerts = new Map<string, string[]>();
  for (const a of alerts) {
    const sym = a.symbol as string;
    const types = symbolAlerts.get(sym) ?? [];
    if (!types.includes(a.alert_type as string)) types.push(a.alert_type as string);
    symbolAlerts.set(sym, types);
  }

  const setupStocks = topStocks
    .filter((row) => symbolAlerts.has(row.symbol as string))
    .map((row) => {
      const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
      const tech = row.technical_signals as unknown as {
        rsi_14: number | null; price_vs_sma50: number | null;
        pct_from_52w_high: number | null; volume_ratio_50d: number | null;
      } | null;
      const flags = (row.flags as string[] | null) ?? [];
      const alertTypes = symbolAlerts.get(row.symbol as string) ?? [];

      const setups = classifySetups({
        flags,
        alertTypes,
        sentinelScore: row.sentinel_score as number | null,
        technicalScore: row.technical_score as number | null,
        fundamentalScore: row.fundamental_score as number | null,
        insiderScore: row.insider_score as number | null,
        earningsAiScore: row.earnings_ai_score as number | null,
        rsi14: tech?.rsi_14 ?? null,
        priceVsSma50: tech?.price_vs_sma50 ?? null,
        pctFrom52wHigh: tech?.pct_from_52w_high ?? null,
        volumeRatio50d: tech?.volume_ratio_50d ?? null,
      });

      return {
        symbol: row.symbol as string,
        name: stock.name,
        sector: stock.sector,
        sentinelScore: row.sentinel_score as number | null,
        scores: {
          technical: row.technical_score,
          fundamental: row.fundamental_score,
          earnings_ai: row.earnings_ai_score,
          insider: row.insider_score,
          institutional: row.institutional_score,
          estimate_revision: row.estimate_revision_score,
          news_sentiment: row.news_sentiment_score,
        },
        flags,
        setups,
        alertTypes,
      };
    })
    .filter((r) => r.setups.length > 0)
    .sort((a, b) => {
      const aMax = Math.max(...a.setups.map((s) => s.conviction));
      const bMax = Math.max(...b.setups.map((s) => s.conviction));
      if (bMax !== aMax) return bMax - aMax;
      return b.setups.length - a.setups.length;
    })
    .slice(0, 10);

  // Divergences
  const divergenceStocks = topStocks
    .map((row) => {
      const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
      const tech = row.technical_signals as unknown as {
        rsi_14: number | null; price_vs_sma50: number | null; price_vs_sma200: number | null;
        pct_from_52w_high: number | null; volume_ratio_50d: number | null;
      } | null;
      const fund = row.fundamentals as unknown as {
        revenue_growth_yoy: number | null; earnings_growth_yoy: number | null; pe_ratio: number | null;
      } | null;

      const divs = detectDivergences({
        sentinel_score: row.sentinel_score as number | null,
        technical_score: row.technical_score as number | null,
        fundamental_score: row.fundamental_score as number | null,
        insider_score: row.insider_score as number | null,
        institutional_score: row.institutional_score as number | null,
        earnings_ai_score: row.earnings_ai_score as number | null,
        rsi_14: tech?.rsi_14 ?? null,
        price_vs_sma50: tech?.price_vs_sma50 ?? null,
        price_vs_sma200: tech?.price_vs_sma200 ?? null,
        pct_from_52w_high: tech?.pct_from_52w_high ?? null,
        volume_ratio_50d: tech?.volume_ratio_50d ?? null,
        revenue_growth_yoy: fund?.revenue_growth_yoy ?? null,
        earnings_growth_yoy: fund?.earnings_growth_yoy ?? null,
        pe_ratio: fund?.pe_ratio ?? null,
      });

      return {
        symbol: row.symbol as string,
        name: stock.name,
        sentinelScore: row.sentinel_score as number | null,
        divergences: divs,
      };
    })
    .filter((r) => r.divergences.length > 0)
    .sort((a, b) => {
      const aHigh = a.divergences.filter((d) => d.strength === 'high').length;
      const bHigh = b.divergences.filter((d) => d.strength === 'high').length;
      if (bHigh !== aHigh) return bHigh - aHigh;
      return b.divergences.length - a.divergences.length;
    })
    .slice(0, 8);

  // Top-scoring stocks
  const topScored = topStocks.slice(0, 10).map((row) => {
    const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
    return {
      symbol: row.symbol as string,
      name: stock.name,
      sector: stock.sector,
      sentinelScore: row.sentinel_score,
      scoreChange: row.score_change_1d,
      flags: (row.flags as string[] | null) ?? [],
      scores: {
        technical: row.technical_score,
        fundamental: row.fundamental_score,
        earnings_ai: row.earnings_ai_score,
        insider: row.insider_score,
        institutional: row.institutional_score,
        estimate_revision: row.estimate_revision_score,
        news_sentiment: row.news_sentiment_score,
      },
    };
  });

  // Setup type counts
  const setupTypeCounts = new Map<string, number>();
  for (const a of alerts) {
    const at = a.alert_type as string;
    setupTypeCounts.set(at, (setupTypeCounts.get(at) ?? 0) + 1);
  }

  // Build markdown
  const lines: string[] = [];
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  lines.push(`# Sentinel Daily Briefing — ${dateStr}`);
  lines.push('');

  // Market context
  lines.push('## Market Context');
  lines.push('');
  if (spyPrice) {
    const changeStr = spyChange != null ? ` (${spyChange >= 0 ? '+' : ''}${formatPercentRaw(spyChange * 100)})` : '';
    lines.push(`- **SPY**: ${formatCurrency(spyPrice)}${changeStr}`);
  }
  lines.push(`- **Universe**: ${statsRes.count ?? 0} active stocks`);
  const highConvCount = topStocks.filter((r) => (r.sentinel_score as number) >= 75).length;
  lines.push(`- **High Conviction (score >= 75)**: ${highConvCount} stocks`);
  lines.push('');

  // Signal performance
  const bestSignals = bestSignalRes.data ?? [];
  if (bestSignals.length > 0) {
    lines.push('## Signal Performance (30-day lookback)');
    lines.push('');
    lines.push('Which signal types have actually made money recently:');
    lines.push('');
    lines.push('| Signal | Avg Return | Win Rate | Alpha vs SPY | Signals |');
    lines.push('|--------|-----------|----------|--------------|---------|');
    for (const s of bestSignals) {
      const label = SIGNAL_TYPE_LABELS[s.signal_type as string] ?? s.signal_type;
      lines.push(`| ${label} | ${formatPercentRaw(Number(s.avg_return) * 100)} | ${Number(s.win_rate).toFixed(0)}% | ${formatPercentRaw(Number(s.avg_alpha) * 100)} | ${s.total_signals} |`);
    }
    lines.push('');
  }

  // Score accuracy
  const hb = highBucketRes.data;
  const lb = lowBucketRes.data;
  if (hb) {
    lines.push('## Score Accuracy (30-day)');
    lines.push('');
    lines.push(`- **Score 75-100**: ${formatPercentRaw(Number(hb.avg_return) * 100)} avg return, ${Number(hb.win_rate).toFixed(0)}% win rate, ${formatPercentRaw(Number(hb.avg_alpha) * 100)} alpha`);
    if (lb) {
      lines.push(`- **Score 0-30**: ${formatPercentRaw(Number(lb.avg_return) * 100)} avg return, ${Number(lb.win_rate).toFixed(0)}% win rate`);
    }
    lines.push(`- **Interpretation**: ${Number(hb.avg_alpha) > 0 ? 'High scores ARE predicting outperformance — trust the ranking.' : 'Score accuracy is weak right now — weight divergences and flags more heavily.'}`);
    lines.push('');
  }

  // Active setups
  lines.push('## Active Setups (Predictive — BEFORE the move)');
  lines.push('');
  if (setupStocks.length === 0) {
    lines.push('No active predictive setups detected today.');
  } else {
    lines.push('These stocks have converging predictive signals. Ranked by conviction (1-5):');
    lines.push('');
    for (const stock of setupStocks) {
      const setup = stock.setups[0];
      lines.push(`### ${stock.symbol} — ${stock.name}`);
      lines.push('');
      lines.push(`- **Setup**: ${setup.name} (Conviction: ${'●'.repeat(setup.conviction)}${'○'.repeat(5 - setup.conviction)})`);
      lines.push(`- **Sentinel Score**: ${stock.sentinelScore ?? '—'}`);
      lines.push(`- **Sector**: ${stock.sector ?? 'Unknown'}`);
      lines.push(`- **Thesis**: ${setup.thesis}`);
      lines.push(`- **Timeframe**: ${setup.timeframe}`);
      lines.push(`- **Watch for**:`);
      for (const w of setup.watchFor) {
        lines.push(`  - [ ] ${w}`);
      }
      lines.push(`- **Active flags**: ${stock.flags.length > 0 ? stock.flags.join(', ') : 'None'}`);
      lines.push(`- **Score breakdown**: Tech ${stock.scores.technical ?? '—'} | Fund ${stock.scores.fundamental ?? '—'} | AI ${stock.scores.earnings_ai ?? '—'} | Insider ${stock.scores.insider ?? '—'} | Inst ${stock.scores.institutional ?? '—'} | Est Rev ${stock.scores.estimate_revision ?? '—'}`);
      if (stock.setups.length > 1) {
        lines.push(`- **Other setups**: ${stock.setups.slice(1).map((s) => `${s.name} (${s.conviction}/5)`).join(', ')}`);
      }
      lines.push('');
    }
  }

  // Setup counts
  if (setupTypeCounts.size > 0) {
    lines.push('## Setups Forming Across the Universe (7 days)');
    lines.push('');
    const sorted = [...setupTypeCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sorted) {
      const label = SIGNAL_TYPE_LABELS[type] ?? type;
      lines.push(`- **${label}**: ${count} signals`);
    }
    lines.push('');
  }

  // Divergences
  lines.push('## Divergences (Edge — non-price signals disagree with the chart)');
  lines.push('');
  if (divergenceStocks.length === 0) {
    lines.push('No significant divergences detected today.');
  } else {
    lines.push('These stocks have strong non-price indicators (insiders, fundamentals, AI) that disagree with the current price action:');
    lines.push('');
    for (const stock of divergenceStocks) {
      const highDivs = stock.divergences.filter((d) => d.strength === 'high');
      const strengthTag = highDivs.length > 0 ? ' [HIGH STRENGTH]' : '';
      lines.push(`### ${stock.symbol} — ${stock.name} (Score: ${stock.sentinelScore ?? '—'})${strengthTag}`);
      lines.push('');
      for (const d of stock.divergences) {
        lines.push(`- **${d.label}** (${d.strength}): ${d.detail}`);
      }
      lines.push('');
    }
  }

  // Top-scoring stocks
  lines.push('## Top 10 by Sentinel Score');
  lines.push('');
  lines.push('| Rank | Symbol | Name | Score | Change | Flags |');
  lines.push('|------|--------|------|-------|--------|-------|');
  for (let i = 0; i < topScored.length; i++) {
    const s = topScored[i];
    const changeStr = s.scoreChange != null && s.scoreChange !== 0
      ? `${(s.scoreChange as number) > 0 ? '+' : ''}${s.scoreChange}`
      : '—';
    const flagStr = s.flags.length > 0 ? s.flags.slice(0, 4).join(', ') : '—';
    lines.push(`| ${i + 1} | ${s.symbol} | ${s.name} | ${s.sentinelScore ?? '—'} | ${changeStr} | ${flagStr} |`);
  }
  lines.push('');

  // Recent alerts
  const predictive = recentAlerts.filter((a) => PREDICTIVE_ALERT_TYPES.has(a.alert_type as string));
  const confirmatory = recentAlerts.filter((a) => !PREDICTIVE_ALERT_TYPES.has(a.alert_type as string));

  lines.push('## Recent Alerts');
  lines.push('');

  if (predictive.length > 0) {
    lines.push('### Predictive (setup forming — act BEFORE the move)');
    lines.push('');
    for (const a of predictive.slice(0, 8)) {
      const label = SIGNAL_TYPE_LABELS[a.alert_type as string] ?? a.alert_type;
      lines.push(`- **${a.symbol}** [${label}]: ${a.message}`);
    }
    lines.push('');
  }

  if (confirmatory.length > 0) {
    lines.push('### Confirmatory (move already underway)');
    lines.push('');
    for (const a of confirmatory.slice(0, 8)) {
      const label = SIGNAL_TYPE_LABELS[a.alert_type as string] ?? a.alert_type;
      lines.push(`- **${a.symbol}** [${label}]: ${a.message}`);
    }
    lines.push('');
  }

  // Score system context
  lines.push('## Scoring System Reference');
  lines.push('');
  lines.push('The Sentinel Score (0-100) is a weighted composite:');
  lines.push('');
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    lines.push(`- **${label}**: ${weight}%`);
  }
  lines.push('');
  lines.push('Scores above 75 = high conviction. A rising score matters more than the absolute level.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*Generated at ${now.toISOString()}*`);

  return {
    markdown: lines.join('\n'),
    generatedAt: now.toISOString(),
  };
}
