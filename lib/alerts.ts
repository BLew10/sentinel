import { getSupabaseServerClient } from './db';
import { getSECFilings } from './financial-datasets';
import {
  detectVolumeAnomalies,
  detectPriceSpikeReversal,
  computeBollingerBands,
  computeOBVSlope,
  detectRSIDivergence,
  detectVolumeDryUp,
} from './indicators';
import { detectFilingFlags } from './analyzers/sec-filings';
import { snapshotSignal } from './signals';
import { formatVolume } from './utils/format';
import type { SentinelScore, InsiderTrade, PriceBar, FDSECFiling, ValueReversalResult } from './utils/types';

export type SignalNature = 'predictive' | 'confirmatory';

export interface Alert {
  symbol: string;
  name: string;
  sector: string | null;
  alert_type: string;
  sentinel_score: number;
  detail: string;
  channel_env: string;
  signal_nature: SignalNature;
}

function fmtDollars(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function today(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export async function detectAlerts(): Promise<Alert[]> {
  const db = getSupabaseServerClient();
  const alerts: Alert[] = [];

  const { data: scores } = await db
    .from('sentinel_scores')
    .select('symbol, sentinel_score, score_change_1d, score_change_7d, technical_score, fundamental_score, insider_score, institutional_score, rank, percentile, stocks!inner(name, sector, market_cap)')
    .not('sentinel_score', 'is', null);

  if (!scores) return alerts;

  // 24h cooldown per symbol+type
  const recentAlerts = new Set<string>();
  const { data: history } = await db
    .from('alert_history')
    .select('symbol, alert_type')
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString());

  for (const h of history ?? []) {
    recentAlerts.add(`${h.symbol}:${h.alert_type}`);
  }

  for (const row of scores) {
    const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
    const score = row as unknown as SentinelScore;
    const sym = row.symbol as string;
    const ss = score.sentinel_score ?? 0;
    const tech = score.technical_score ?? 0;
    const fund = score.fundamental_score ?? 0;
    const ins = score.insider_score ?? 0;
    const inst = score.institutional_score ?? 0;

    if (ss >= 75 && !recentAlerts.has(`${sym}:score_threshold`)) {
      const change1d = score.score_change_1d != null ? ` (${score.score_change_1d > 0 ? '+' : ''}${score.score_change_1d} today)` : '';
      const topStr = score.percentile != null ? ` · Top ${score.percentile}%` : '';
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'score_threshold',
        sentinel_score: ss,
        detail: `Score hit **${ss}**/100${change1d}${topStr}\nTechnical ${tech} · Fundamental ${fund} · Insider ${ins} · Institutional ${inst}\n_${today()}_`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
        signal_nature: 'confirmatory',
      });
    }

    if ((score.score_change_1d ?? 0) <= -10 && ss >= 60 && !recentAlerts.has(`${sym}:score_drop`)) {
      const prev = ss - (score.score_change_1d ?? 0);
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'score_drop',
        sentinel_score: ss,
        detail: `Score dropped **${prev} → ${ss}** (${score.score_change_1d} points) in 1 day\nTechnical ${tech} · Fundamental ${fund} · Insider ${ins}\n_Was ranked in the top stocks yesterday — investigate what changed_\n_${today()}_`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
        signal_nature: 'confirmatory',
      });
    }

    if (tech >= 70 && ins >= 70 && inst >= 70 && !recentAlerts.has(`${sym}:triple_confirmation`)) {
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'triple_confirmation',
        sentinel_score: ss,
        detail: `Three independent signal categories are aligned bullish:\n• Technical: **${tech}** (price trend + momentum)\n• Insider: **${ins}** (insider buying activity)\n• Institutional: **${inst}** (fund flows)\nComposite score: **${ss}**/100\n_${today()}_`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
        signal_nature: 'confirmatory',
      });
    }
  }

  // RSI Oversold Bounce
  const { data: rsiSignals } = await db
    .from('signal_snapshots')
    .select('symbol, trigger_detail, price_at_signal, snapshot_date')
    .eq('trigger_type', 'rsi_oversold_bounce')
    .gte('snapshot_date', new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0])
    .order('created_at', { ascending: false });

  if (rsiSignals) {
    for (const sig of rsiSignals) {
      const sym = sig.symbol as string;
      if (recentAlerts.has(`${sym}:rsi_oversold_bounce`)) continue;
      const scoreRow = scores.find((s) => s.symbol === sym);
      if (!scoreRow) continue;
      const stock = scoreRow.stocks as unknown as { name: string; sector: string | null };
      const price = sig.price_at_signal != null ? `$${Number(sig.price_at_signal).toFixed(2)}` : 'N/A';
      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: 'rsi_oversold_bounce',
        sentinel_score: (scoreRow as unknown as SentinelScore).sentinel_score ?? 0,
        detail: `${(sig.trigger_detail as string) ?? 'RSI crossed above 30 from oversold'}\nPrice at signal: **${price}** · Date: ${sig.snapshot_date}\nSentinel Score: **${(scoreRow as unknown as SentinelScore).sentinel_score ?? 0}**/100\n_Oversold bounce — selling may be exhausted, watch for follow-through_`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
        signal_nature: 'confirmatory',
      });
    }
  }

  // SMA50/200 Golden Cross / Death Cross
  const { data: smaCrossSignals } = await db
    .from('signal_snapshots')
    .select('symbol, trigger_type, trigger_detail, price_at_signal, snapshot_date')
    .in('trigger_type', ['golden_cross', 'death_cross'])
    .gte('snapshot_date', new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0])
    .order('created_at', { ascending: false });

  if (smaCrossSignals) {
    for (const sig of smaCrossSignals) {
      const sym = sig.symbol as string;
      const triggerType = sig.trigger_type as string;
      if (recentAlerts.has(`${sym}:${triggerType}`)) continue;
      const scoreRow = scores.find((s) => s.symbol === sym);
      if (!scoreRow) continue;
      const stock = scoreRow.stocks as unknown as { name: string; sector: string | null };
      const ss = (scoreRow as unknown as SentinelScore).sentinel_score ?? 0;
      const price = sig.price_at_signal != null ? `$${Number(sig.price_at_signal).toFixed(2)}` : 'N/A';
      const isGolden = triggerType === 'golden_cross';
      const label = isGolden ? 'Golden Cross' : 'Death Cross';
      const emoji = isGolden ? '🟢' : '🔴';
      const commentary = isGolden
        ? '_SMA50 crossing above SMA200 is historically one of the strongest long-term buy signals — confirms the trend has shifted bullish_'
        : '_SMA50 crossing below SMA200 signals a bearish trend shift — institutional buyers often wait for this to recover before re-entering_';

      alerts.push({
        symbol: sym,
        name: stock.name,
        sector: stock.sector,
        alert_type: triggerType,
        sentinel_score: ss,
        detail: `${emoji} **${label}** detected on ${sig.snapshot_date}\n${(sig.trigger_detail as string) ?? `SMA50 crossed ${isGolden ? 'above' : 'below'} SMA200`}\nPrice at signal: **${price}** · Sentinel Score: **${ss}**/100\n${commentary}`,
        channel_env: 'DISCORD_CHANNEL_ALERTS',
        signal_nature: 'confirmatory',
      });
    }
  }

  // Insider trades
  const { data: insiderTrades } = await db
    .from('insider_trades')
    .select('symbol, insider_name, insider_title, transaction_type, transaction_value, transaction_date, shares, price_per_share')
    .gte('transaction_date', new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0])
    .order('transaction_date', { ascending: false });

  if (insiderTrades) {
    const buysBySymbol = new Map<string, InsiderTrade[]>();
    for (const t of insiderTrades) {
      const type = (t.transaction_type as string).toLowerCase();
      if (!type.includes('buy') && !type.includes('purchase')) continue;
      const sym = t.symbol as string;
      if (!buysBySymbol.has(sym)) buysBySymbol.set(sym, []);
      buysBySymbol.get(sym)!.push(t as unknown as InsiderTrade);
    }

    for (const [sym, buys] of Array.from(buysBySymbol.entries())) {
      if (buys.length >= 2 && !recentAlerts.has(`${sym}:insider_cluster_buy`)) {
        const scoreRow = scores.find((s) => s.symbol === sym);
        if (!scoreRow) continue;
        const stock = scoreRow.stocks as unknown as { name: string; sector: string | null };
        const totalValue = buys.reduce((sum, b) => sum + Math.abs(b.transaction_value ?? 0), 0);
        const buyerDetails = buys.slice(0, 4).map((b) => {
          const val = b.transaction_value != null ? ` (${fmtDollars(Math.abs(b.transaction_value))})` : '';
          return `• ${b.insider_name}${b.insider_title ? ` — ${b.insider_title}` : ''}${val} on ${b.transaction_date}`;
        }).join('\n');

        alerts.push({
          symbol: sym,
          name: stock.name,
          sector: stock.sector,
          alert_type: 'insider_cluster_buy',
          sentinel_score: (scoreRow as unknown as SentinelScore).sentinel_score ?? 0,
          detail: `**${buys.length} insiders** bought in the last 30 days — total ${fmtDollars(totalValue)}\n${buyerDetails}\n_Multiple insiders buying at once is historically one of the strongest signals_`,
          channel_env: 'DISCORD_CHANNEL_INSIDERS',
          signal_nature: 'confirmatory',
        });
      }

      for (const buy of buys) {
        const title = (buy.insider_title ?? '').toLowerCase();
        if ((title.includes('ceo') || title.includes('chief executive')) && !recentAlerts.has(`${sym}:insider_ceo_buy`)) {
          const scoreRow = scores.find((s) => s.symbol === sym);
          if (!scoreRow) continue;
          const stock = scoreRow.stocks as unknown as { name: string; sector: string | null };
          const val = buy.transaction_value != null ? fmtDollars(Math.abs(buy.transaction_value)) : 'undisclosed';
          const shares = buy.shares != null ? `${buy.shares.toLocaleString()} shares` : '';
          const price = buy.price_per_share != null ? ` @ $${buy.price_per_share.toFixed(2)}` : '';
          alerts.push({
            symbol: sym,
            name: stock.name,
            sector: stock.sector,
            alert_type: 'insider_ceo_buy',
            sentinel_score: (scoreRow as unknown as SentinelScore).sentinel_score ?? 0,
            detail: `CEO **${buy.insider_name}** purchased ${shares}${price} — **${val}**\nFiled: ${buy.transaction_date}\n_CEO open-market purchases are the highest-conviction insider signal_`,
            channel_env: 'DISCORD_CHANNEL_INSIDERS',
            signal_nature: 'confirmatory',
          });
          break;
        }
      }
    }
  }

  // Value Reversal Candidate alerts
  await detectValueReversalAlerts(scores, recentAlerts, alerts);

  // Signal-based alerts: volume spikes, SEC filings, price spike reversals
  await detectSignalAlerts(scores, recentAlerts, alerts);

  // Predictive alerts: BB squeeze, RSI divergence, OBV accumulation, volume dry-up, SMA convergence
  await detectPredictiveAlerts(scores, recentAlerts, alerts);

  return alerts;
}

async function detectValueReversalAlerts(
  scores: Array<Record<string, unknown>>,
  recentAlerts: Set<string>,
  alerts: Alert[],
): Promise<void> {
  const db = getSupabaseServerClient();

  const { data: flaggedScores } = await db
    .from('sentinel_scores')
    .select('symbol, sentinel_score, technical_score, fundamental_score, earnings_ai_score, insider_score, institutional_score, news_sentiment_score, options_flow_score, flags, score_metadata')
    .not('flags', 'is', null);

  if (!flaggedScores) return;

  for (const row of flaggedScores) {
    const flags = row.flags as string[] | null;
    if (!flags || !flags.includes('VALUE_REVERSAL_CANDIDATE')) continue;

    const sym = row.symbol as string;
    if (recentAlerts.has(`${sym}:value_reversal`)) continue;

    const scoreRow = scores.find((s) => s.symbol === sym);
    if (!scoreRow) continue;
    const stock = scoreRow.stocks as unknown as { name: string; sector: string | null };
    const ss = (scoreRow as unknown as SentinelScore).sentinel_score ?? 0;

    const metadata = row.score_metadata as Record<string, unknown> | null;
    const vr = metadata?.value_reversal as ValueReversalResult | undefined;
    if (!vr) continue;

    const d = vr.details;

    const pctFromHigh = d.deep_pullback.pct_from_high != null
      ? `${Math.abs(Math.round(d.deep_pullback.pct_from_high * 100))}%`
      : 'N/A';

    const buyerCount = d.insider_cluster_buy.buyers.length;
    const totalVal = fmtDollars(d.insider_cluster_buy.total_value);
    const fcfStr = d.fcf_yield.yield_pct != null
      ? `${(d.fcf_yield.yield_pct * 100).toFixed(1)}%`
      : 'N/A';
    const peStr = d.pe_compression.current_pe != null
      ? `${d.pe_compression.current_pe.toFixed(1)}x`
      : 'N/A';
    const fwdPeStr = d.pe_compression.forward_pe != null
      ? `${d.pe_compression.forward_pe.toFixed(1)}x`
      : 'N/A';
    const histStr = d.macd_shift.current_histogram != null
      ? d.macd_shift.current_histogram.toFixed(2)
      : 'N/A';

    const check = (met: boolean) => met ? '\u2705' : '\u274C';
    const conditions = [
      `${check(d.deep_pullback.met)} Deep pullback (${pctFromHigh} from high)`,
      `${check(d.insider_cluster_buy.met)} Insider cluster buy (${fmtDollars(d.insider_cluster_buy.total_value)}, ${buyerCount} insiders)`,
      `${check(d.first_buy_12mo.met)} First buy in 12+ months${d.first_buy_12mo.insider ? ` (${d.first_buy_12mo.insider})` : ''}`,
      `${check(d.macd_shift.met)} MACD momentum shift`,
      `${check(d.fcf_yield.met)} Strong FCF yield (${fcfStr})`,
      `${check(d.pe_compression.met)} P/E compression (${peStr} trailing, ${fwdPeStr} forward)`,
    ].join('\n');

    const detail = [
      `Conviction: **${vr.conviction}**/100 (${vr.conditions_met}/6 conditions)`,
      `${pctFromHigh} from 52W high · FCF Yield: ${fcfStr} · P/E: ${peStr}`,
      `Insider buying: ${buyerCount} insiders, ${totalVal}`,
      `MACD Histogram: ${histStr}`,
      '',
      'Conditions:',
      conditions,
      '',
      `_${today()}_`,
    ].join('\n');

    const latestPrice = await getLatestPrice(db, sym);

    try {
      await snapshotSignal({
        symbol: sym,
        triggerType: 'value_reversal',
        triggerDetail: JSON.stringify(vr.details),
        priceAtSignal: latestPrice,
        sentinelScore: ss,
        technicalScore: row.technical_score as number | null,
        fundamentalScore: row.fundamental_score as number | null,
        earningsAiScore: row.earnings_ai_score as number | null,
        insiderScore: row.insider_score as number | null,
        institutionalScore: row.institutional_score as number | null,
        newsSentimentScore: row.news_sentiment_score as number | null,
        optionsFlowScore: row.options_flow_score as number | null,
        sector: stock.sector,
      });
    } catch {
      // Signal snapshot is supplemental — don't block alert delivery
    }

    alerts.push({
      symbol: sym,
      name: stock.name,
      sector: stock.sector,
      alert_type: 'value_reversal',
      sentinel_score: ss,
      detail,
      channel_env: 'DISCORD_CHANNEL_ALERTS',
      signal_nature: 'predictive',
    });
  }
}

async function getLatestPrice(db: ReturnType<typeof getSupabaseServerClient>, symbol: string): Promise<number> {
  const { data } = await db
    .from('daily_prices')
    .select('close')
    .eq('symbol', symbol)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  return data?.close != null ? Number(data.close) : 0;
}

async function detectSignalAlerts(
  scores: Array<Record<string, unknown>>,
  recentAlerts: Set<string>,
  alerts: Alert[],
): Promise<void> {
  const db = getSupabaseServerClient();

  for (const row of scores) {
    const sym = row.symbol as string;
    const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
    const ss = (row as unknown as SentinelScore).sentinel_score ?? 0;

    // Volume anomaly detection
    if (!recentAlerts.has(`${sym}:volume_spike`)) {
      const { data: pricesData } = await db
        .from('daily_prices')
        .select('date, open, high, low, close, volume')
        .eq('symbol', sym)
        .order('date', { ascending: true })
        .limit(100);

      if (pricesData && pricesData.length >= 51) {
        const prices: PriceBar[] = pricesData.map((p) => ({
          date: p.date as string,
          open: Number(p.open),
          high: Number(p.high),
          low: Number(p.low),
          close: Number(p.close),
          volume: Number(p.volume),
        }));

        const anomalies = detectVolumeAnomalies(prices, sym);
        const recentAnomaly = anomalies.find((a) => {
          const daysAgo = (Date.now() - new Date(a.date).getTime()) / 86_400_000;
          return daysAgo <= 3 && (a.anomaly_severity === 'extreme' || a.anomaly_severity === 'high');
        });

        if (recentAnomaly) {
          const ratioStr = recentAnomaly.volume_ratio >= 1000
            ? `${Math.round(recentAnomaly.volume_ratio / 100) * 100}x`
            : `${Math.round(recentAnomaly.volume_ratio)}x`;

          alerts.push({
            symbol: sym,
            name: stock.name,
            sector: stock.sector,
            alert_type: 'volume_spike',
            sentinel_score: ss,
            detail: `**${formatVolume(recentAnomaly.volume)}** shares traded on ${recentAnomaly.date} — **${ratioStr}** the 50-day average (${formatVolume(recentAnomaly.avg_volume_50d)}/day)\nSeverity: **${recentAnomaly.anomaly_severity.toUpperCase()}** · Sentinel Score: ${ss}\n_Extreme volume precedes major moves — investigate what's driving the activity_`,
            channel_env: 'DISCORD_CHANNEL_ALERTS',
            signal_nature: 'confirmatory',
          });
        }

        // Price spike + reversal
        if (!recentAlerts.has(`${sym}:price_spike_reversal`)) {
          const spike = detectPriceSpikeReversal(prices);
          if (spike) {
            alerts.push({
              symbol: sym,
              name: stock.name,
              sector: stock.sector,
              alert_type: 'price_spike_reversal',
              sentinel_score: ss,
              detail: `Stock spiked **+${spike.spike_pct}%** in ${spike.days_to_peak} days ($${spike.spike_start_price.toFixed(2)} → $${spike.spike_peak_price.toFixed(2)}), now reversed **-${spike.reversal_pct}%** from peak\nPeak: ${spike.spike_peak_date} · Current: $${spike.current_price.toFixed(2)}\n_Spike-and-fade pattern — often a speculative blow-off top, not a sustainable move_`,
              channel_env: 'DISCORD_CHANNEL_ALERTS',
              signal_nature: 'confirmatory',
            });
          }
        }
      }
    }

    // SEC filing flags (only check stocks that had recent score changes or high scores)
    const scoreChange = (row as unknown as SentinelScore).score_change_1d;
    const shouldCheckFilings = ss >= 60 || (scoreChange != null && Math.abs(scoreChange) >= 5);
    if (shouldCheckFilings && !recentAlerts.has(`${sym}:dilution_filing`)) {
      try {
        const filings = await getSECFilings(sym, { limit: 10 });
        const flags = detectFilingFlags(filings);

        for (const flag of flags) {
          const alertType = flag.type === 'DILUTION_FILING' ? 'dilution_filing' : flag.type === '13D_AMENDMENT' ? '13d_amendment' : 'insider_form4';
          if (recentAlerts.has(`${sym}:${alertType}`)) continue;

          const configs: Record<string, { channel: string; desc: string }> = {
            DILUTION_FILING: {
              channel: 'DISCORD_CHANNEL_ALERTS',
              desc: `**${flag.filing.filing_type}** filed on ${flag.filing.filing_date}\n_Dilution filing — stock offering or prospectus supplement, typically bearish for shareholders_`,
            },
            '13D_AMENDMENT': {
              channel: 'DISCORD_CHANNEL_ALERTS',
              desc: `**Schedule 13D** filed on ${flag.filing.filing_date}\n_Major shareholder (5%+) is changing their position — watch for activist activity_`,
            },
            INSIDER_FORM4: {
              channel: 'DISCORD_CHANNEL_INSIDERS',
              desc: `**Form 4** insider ownership change on ${flag.filing.filing_date}\n_Check whether this is a buy, sell, or grant exercise_`,
            },
          };

          const cfg = configs[flag.type];
          if (!cfg) continue;

          alerts.push({
            symbol: sym,
            name: stock.name,
            sector: stock.sector,
            alert_type: alertType,
            sentinel_score: ss,
            detail: `${cfg.desc}\nSentinel Score: **${ss}**/100`,
            channel_env: cfg.channel,
            signal_nature: 'confirmatory',
          });
          break;
        }
      } catch {
        // SEC filings are supplemental — skip on API failure
      }
    }
  }
}

async function detectPredictiveAlerts(
  scores: Array<Record<string, unknown>>,
  recentAlerts: Set<string>,
  alerts: Alert[],
): Promise<void> {
  const db = getSupabaseServerClient();

  for (const row of scores) {
    const sym = row.symbol as string;
    const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
    const ss = (row as unknown as SentinelScore).sentinel_score ?? 0;

    const { data: pricesData } = await db
      .from('daily_prices')
      .select('date, open, high, low, close, volume')
      .eq('symbol', sym)
      .order('date', { ascending: false })
      .limit(120);

    if (!pricesData || pricesData.length < 60) continue;

    const prices: PriceBar[] = pricesData
      .map((p) => ({
        date: p.date as string,
        open: Number(p.open),
        high: Number(p.high),
        low: Number(p.low),
        close: Number(p.close),
        volume: Number(p.volume),
      }))
      .reverse();

    const closes = prices.map((b) => b.close);

    // Bollinger Band Squeeze: volatility compressed, big move imminent
    if (!recentAlerts.has(`${sym}:bb_squeeze`)) {
      const bb = computeBollingerBands(closes);
      if (bb?.is_squeeze) {
        const direction = (row as unknown as SentinelScore).technical_score != null
          && (row as unknown as SentinelScore).technical_score! >= 55
          ? 'bullish bias' : 'direction unclear';
        alerts.push({
          symbol: sym,
          name: stock.name,
          sector: stock.sector,
          alert_type: 'bb_squeeze',
          sentinel_score: ss,
          detail: `Bollinger Band width at **${(bb.width * 100).toFixed(1)}%** — volatility squeeze detected\nBands: $${bb.lower.toFixed(2)} – $${bb.upper.toFixed(2)} (${direction})\n_Volatility contraction predicts expansion — a large move is forming_\n_${today()}_`,
          channel_env: 'DISCORD_CHANNEL_ALERTS',
          signal_nature: 'predictive',
        });
      }
    }

    // RSI Divergence: reversal forming before price confirms
    if (!recentAlerts.has(`${sym}:rsi_divergence`)) {
      const div = detectRSIDivergence(prices);
      if (div) {
        const label = div.type === 'bullish' ? 'Bullish' : 'Bearish';
        const desc = div.type === 'bullish'
          ? '_Price made lower low but RSI made higher low — selling pressure weakening, reversal likely forming_'
          : '_Price made higher high but RSI made lower high — buying momentum fading, top may be forming_';
        alerts.push({
          symbol: sym,
          name: stock.name,
          sector: stock.sector,
          alert_type: 'rsi_divergence',
          sentinel_score: ss,
          detail: `**${label} RSI Divergence** detected\nPrice: $${div.price_1.toFixed(2)} (${div.price_date_1}) → $${div.price_2.toFixed(2)} (${div.price_date_2})\nRSI: ${div.rsi_1.toFixed(1)} → ${div.rsi_2.toFixed(1)}\n${desc}\n_${today()}_`,
          channel_env: 'DISCORD_CHANNEL_ALERTS',
          signal_nature: 'predictive',
        });
      }
    }

    // OBV Accumulation Divergence: volume buying while price flat/declining
    if (!recentAlerts.has(`${sym}:accumulation_divergence`)) {
      const obvSlope = computeOBVSlope(prices, 20);
      if (obvSlope != null && obvSlope > 0.15) {
        const priceReturn = closes.length >= 20
          ? (closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20]
          : null;
        if (priceReturn != null && priceReturn <= 0.02) {
          alerts.push({
            symbol: sym,
            name: stock.name,
            sector: stock.sector,
            alert_type: 'accumulation_divergence',
            sentinel_score: ss,
            detail: `OBV trending **up** while price flat/declining over 20 days\nPrice: ${(priceReturn * 100).toFixed(1)}% · OBV slope: +${(obvSlope * 100).toFixed(0)}%\n_Volume-confirmed accumulation without price follow-through — breakout setup forming_\n_${today()}_`,
            channel_env: 'DISCORD_CHANNEL_ALERTS',
            signal_nature: 'predictive',
          });
        }
      }
    }

    // Volume Dry-Up: pre-breakout pattern
    if (!recentAlerts.has(`${sym}:volume_dry_up`)) {
      const dryUp = detectVolumeDryUp(prices);
      if (dryUp) {
        const rangeLabel = dryUp.price_range_pct <= 5
          ? 'tight consolidation'
          : 'narrowing range';
        alerts.push({
          symbol: sym,
          name: stock.name,
          sector: stock.sector,
          alert_type: 'volume_dry_up',
          sentinel_score: ss,
          detail: `**${dryUp.consecutive_low_volume_days} consecutive days** of below-average volume (${dryUp.avg_ratio}x avg)\nPrice range: ${dryUp.price_range_pct}% — ${rangeLabel}\n_Volume contraction into a narrow range often precedes a breakout_\n_${today()}_`,
          channel_env: 'DISCORD_CHANNEL_ALERTS',
          signal_nature: 'predictive',
        });
      }
    }

    // SMA Convergence: golden/death cross is forming
    if (!recentAlerts.has(`${sym}:sma_convergence`)) {
      const { data: techRow } = await db
        .from('technical_signals')
        .select('sma_50, sma_200')
        .eq('symbol', sym)
        .single();

      if (techRow?.sma_50 != null && techRow?.sma_200 != null) {
        const sma50 = Number(techRow.sma_50);
        const sma200 = Number(techRow.sma_200);
        const gap = Math.abs(sma50 - sma200) / sma200;

        if (gap <= 0.01 && gap > 0) {
          const crossType = sma50 > sma200 ? 'Golden Cross' : 'Death Cross';
          const direction = sma50 > sma200 ? 'bullish' : 'bearish';
          alerts.push({
            symbol: sym,
            name: stock.name,
            sector: stock.sector,
            alert_type: 'sma_convergence',
            sentinel_score: ss,
            detail: `SMA50 ($${sma50.toFixed(2)}) within **${(gap * 100).toFixed(2)}%** of SMA200 ($${sma200.toFixed(2)})\n**${crossType}** is forming — ${direction} trend shift approaching\n_Convergence detected BEFORE the cross — early positioning opportunity_\n_${today()}_`,
            channel_env: 'DISCORD_CHANNEL_ALERTS',
            signal_nature: 'predictive',
          });
        }
      }
    }
  }
}

export async function recordAlert(alert: Alert, discordMessageId?: string): Promise<void> {
  const db = getSupabaseServerClient();
  await db.from('alert_history').insert({
    symbol: alert.symbol,
    alert_type: alert.alert_type,
    message: alert.detail,
    sentinel_score: alert.sentinel_score,
    discord_message_id: discordMessageId ?? null,
  });
}
