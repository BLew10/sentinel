import { getSupabaseServerClient } from '@/lib/db';
import { ScoreBadge } from '@/components/ui/ScoreBadge';
import { SCREENER_PRESETS } from '@/lib/utils/constants';
import { formatCurrency, formatMarketCap, formatPercentRaw, formatRelativeTime, scoreVerdict, verdictColor, generateSignalSummary, detectDivergences } from '@/lib/utils/format';
import type { Divergence } from '@/lib/utils/format';
import Link from 'next/link';
import { RecentActivity, buildActivityItems } from '@/components/dashboard/RecentActivity';

export const dynamic = 'force-dynamic';

async function getTopStocks() {
  const db = getSupabaseServerClient();
  const { data } = await db
    .from('sentinel_scores')
    .select('symbol, sentinel_score, technical_score, fundamental_score, earnings_ai_score, insider_score, institutional_score, score_change_1d, rank, stocks!inner(name, sector, market_cap)')
    .not('sentinel_score', 'is', null)
    .order('sentinel_score', { ascending: false })
    .limit(10);
  return data ?? [];
}

async function getActionableStocks() {
  const db = getSupabaseServerClient();

  const { data } = await db
    .from('sentinel_scores')
    .select(`
      symbol, sentinel_score, technical_score, fundamental_score, earnings_ai_score, insider_score, institutional_score, score_change_1d,
      stocks!inner(name, sector, market_cap),
      technical_signals(rsi_14, price_vs_sma50, price_vs_sma200, pct_from_52w_high, volume_ratio_50d),
      fundamentals(revenue_growth_yoy, earnings_growth_yoy, pe_ratio)
    `)
    .gte('sentinel_score', 70)
    .not('sentinel_score', 'is', null)
    .order('sentinel_score', { ascending: false })
    .limit(8);

  return data ?? [];
}

async function getDivergenceStocks() {
  const db = getSupabaseServerClient();

  // Fetch stocks with high insider/fundamental/AI scores (regardless of technical strength)
  const { data } = await db
    .from('sentinel_scores')
    .select(`
      symbol, sentinel_score, technical_score, fundamental_score, earnings_ai_score, insider_score, institutional_score, score_change_1d,
      stocks!inner(name, sector, market_cap),
      technical_signals(rsi_14, price_vs_sma50, price_vs_sma200, pct_from_52w_high, volume_ratio_50d),
      fundamentals(revenue_growth_yoy, earnings_growth_yoy, pe_ratio)
    `)
    .not('sentinel_score', 'is', null)
    .order('insider_score', { ascending: false })
    .limit(100);

  if (!data) return [];

  type DivRow = (typeof data)[number] & { _divergences: Divergence[] };

  const withDivergences: DivRow[] = data
    .map((row) => {
      const tech = row.technical_signals as unknown as {
        rsi_14: number | null; price_vs_sma50: number | null; price_vs_sma200: number | null;
        pct_from_52w_high: number | null; volume_ratio_50d: number | null;
      } | null;
      const fund = row.fundamentals as unknown as {
        revenue_growth_yoy: number | null; earnings_growth_yoy: number | null; pe_ratio: number | null;
      } | null;

      const divs = detectDivergences({
        sentinel_score: row.sentinel_score,
        technical_score: row.technical_score,
        fundamental_score: row.fundamental_score,
        insider_score: row.insider_score,
        institutional_score: row.institutional_score,
        earnings_ai_score: row.earnings_ai_score,
        rsi_14: tech?.rsi_14 ?? null,
        price_vs_sma50: tech?.price_vs_sma50 ?? null,
        price_vs_sma200: tech?.price_vs_sma200 ?? null,
        pct_from_52w_high: tech?.pct_from_52w_high ?? null,
        volume_ratio_50d: tech?.volume_ratio_50d ?? null,
        revenue_growth_yoy: fund?.revenue_growth_yoy ?? null,
        earnings_growth_yoy: fund?.earnings_growth_yoy ?? null,
        pe_ratio: fund?.pe_ratio ?? null,
      });

      return { ...row, _divergences: divs } as DivRow;
    })
    .filter((r) => r._divergences.length > 0);

  // Sort by number of divergences (more = more interesting), then by strength
  withDivergences.sort((a, b) => {
    const aHigh = a._divergences.filter(d => d.strength === 'high').length;
    const bHigh = b._divergences.filter(d => d.strength === 'high').length;
    if (bHigh !== aHigh) return bHigh - aHigh;
    return b._divergences.length - a._divergences.length;
  });

  return withDivergences.slice(0, 6);
}

async function getMovers() {
  const db = getSupabaseServerClient();
  const { data } = await db
    .from('sentinel_scores')
    .select('symbol, sentinel_score, score_change_1d, stocks!inner(name)')
    .not('score_change_1d', 'is', null)
    .order('score_change_1d', { ascending: false })
    .limit(5);

  const { data: losers } = await db
    .from('sentinel_scores')
    .select('symbol, sentinel_score, score_change_1d, stocks!inner(name)')
    .not('score_change_1d', 'is', null)
    .order('score_change_1d', { ascending: true })
    .limit(5);

  return { gainers: data ?? [], losers: losers ?? [] };
}

async function getRecentAlerts() {
  const db = getSupabaseServerClient();
  const { data } = await db
    .from('alert_history')
    .select('symbol, alert_type, message, sentinel_score, created_at')
    .order('created_at', { ascending: false })
    .limit(6);
  return data ?? [];
}

async function getBestSignal() {
  const db = getSupabaseServerClient();
  const { data } = await db
    .from('signal_performance')
    .select('signal_type, avg_return, win_rate, total_signals, avg_alpha')
    .eq('period', '30d')
    .gte('total_signals', 5)
    .order('avg_alpha', { ascending: false })
    .limit(1)
    .single();

  return data;
}

async function getScoreAccuracy() {
  const db = getSupabaseServerClient();

  const { data: highBucket } = await db
    .from('score_bucket_performance')
    .select('avg_return, avg_alpha, win_rate, num_stocks')
    .eq('bucket', '75-100')
    .eq('period', '30d')
    .order('computed_date', { ascending: false })
    .limit(1)
    .single();

  const { data: lowBucket } = await db
    .from('score_bucket_performance')
    .select('avg_return, avg_alpha, win_rate, num_stocks')
    .eq('bucket', '0-30')
    .eq('period', '30d')
    .order('computed_date', { ascending: false })
    .limit(1)
    .single();

  return { highBucket, lowBucket };
}

async function getRecentActivity() {
  const db = getSupabaseServerClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];

  const [insiderRes, filingRes, instRes] = await Promise.all([
    db.from('insider_trades')
      .select('symbol, insider_name, insider_title, transaction_date, transaction_type, shares, price_per_share, transaction_value')
      .gte('transaction_date', thirtyDaysAgo)
      .order('transaction_date', { ascending: false })
      .limit(30),
    db.from('sec_filing_analysis')
      .select('symbol, filing_type, filing_date')
      .not('filing_date', 'is', null)
      .gte('filing_date', thirtyDaysAgo)
      .order('filing_date', { ascending: false })
      .limit(20),
    db.from('institutional_holdings')
      .select('symbol, institution_name, change_shares, change_pct, value, filing_date')
      .not('filing_date', 'is', null)
      .not('change_shares', 'is', null)
      .gte('filing_date', thirtyDaysAgo)
      .order('filing_date', { ascending: false })
      .limit(20),
  ]);

  const insiderTrades = (insiderRes.data ?? []) as Array<{
    symbol: string; insider_name: string; insider_title: string | null;
    transaction_date: string; transaction_type: string; shares: number;
    price_per_share: number | null; transaction_value: number | null;
  }>;

  const filings = (filingRes.data ?? []).map((f) => ({
    ticker: (f as Record<string, unknown>).symbol as string,
    filing_type: (f as Record<string, unknown>).filing_type as string,
    filing_date: (f as Record<string, unknown>).filing_date as string,
  }));

  const instChanges = (instRes.data ?? []) as Array<{
    symbol: string; institution_name: string; change_shares: number | null;
    change_pct: number | null; value: number | null; filing_date: string | null;
  }>;

  return buildActivityItems(insiderTrades, filings, instChanges);
}

async function getStats() {
  const db = getSupabaseServerClient();
  const [stocksRes, scoresRes, highRes, spyRes] = await Promise.all([
    db.from('stocks').select('symbol', { count: 'exact', head: true }).eq('is_active', true),
    db.from('sentinel_scores').select('symbol', { count: 'exact', head: true }).not('sentinel_score', 'is', null),
    db.from('sentinel_scores').select('symbol', { count: 'exact', head: true }).gte('sentinel_score', 75),
    db.from('daily_prices').select('date, close').eq('symbol', 'SPY').order('date', { ascending: false }).limit(2),
  ]);

  const spyPrices = spyRes.data ?? [];
  const spyPrice = spyPrices[0]?.close ? Number(spyPrices[0].close) : null;
  const spyPrev = spyPrices[1]?.close ? Number(spyPrices[1].close) : null;
  const spyChange = spyPrice && spyPrev ? (spyPrice - spyPrev) / spyPrev : null;

  return {
    totalStocks: stocksRes.count ?? 0,
    scoredStocks: scoresRes.count ?? 0,
    highConviction: highRes.count ?? 0,
    spyPrice,
    spyChange,
  };
}

export default async function Dashboard() {
  const [topStocks, actionable, divergenceStocks, movers, stats, recentAlerts, bestSignal, scoreAccuracy, activityItems] = await Promise.all([
    getTopStocks(), getActionableStocks(), getDivergenceStocks(), getMovers(), getStats(), getRecentAlerts(), getBestSignal(), getScoreAccuracy(), getRecentActivity(),
  ]);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Dashboard</h1>
        <p className="text-text-secondary text-sm mt-1">
          Sentinel composite scores across {stats.scoredStocks} stocks
        </p>
      </div>

      {/* Stats + Market Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Universe" value={stats.totalStocks.toLocaleString()} sub="Total stocks tracked" />
        <StatCard label="Scored" value={stats.scoredStocks.toLocaleString()} sub="With complete data" />
        <StatCard
          label="High Conviction"
          value={stats.highConviction.toLocaleString()}
          sub="Score ≥ 75 → Bullish or better"
          accent
        />
        <StatCard
          label="SPY"
          value={stats.spyPrice ? formatCurrency(stats.spyPrice) : '—'}
          sub={stats.spyChange != null ? formatPercentRaw(stats.spyChange * 100) : undefined}
          subColor={stats.spyChange != null ? (stats.spyChange >= 0 ? 'text-green' : 'text-red') : undefined}
        />
      </div>

      {/* Signal of the Day + Score Accuracy */}
      {(bestSignal || scoreAccuracy.highBucket) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bestSignal && (
            <Link
              href="/signals"
              className="bg-bg-secondary rounded-lg border border-border p-5 hover:border-green/30 transition-colors"
            >
              <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-2">Best Performing Signal (30d)</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green text-lg">⚡</span>
                <h3 className="font-display font-bold text-lg">
                  {({
                    golden_cross: 'Golden Cross',
                    stage2_breakout: 'Stage 2 Breakout',
                    rsi_oversold_bounce: 'RSI Oversold Bounce',
                    volume_breakout: 'Volume Breakout',
                    macd_bullish_cross: 'MACD Bullish Cross',
                    insider_cluster_buy: 'Insider Cluster Buy',
                    insider_ceo_buy: 'CEO Buy',
                    score_threshold: 'Score Spike',
                    triple_confirmation: 'Triple Confirmation',
                  } as Record<string, string>)[bestSignal.signal_type as string] ?? bestSignal.signal_type}
                </h3>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-text-secondary cursor-help" title="Average raw 30-day return after this signal fired">
                  Avg return: <span className={Number(bestSignal.avg_return) > 0 ? 'text-green font-display' : 'text-red font-display'}>{formatPercentRaw(Number(bestSignal.avg_return) * 100)}</span>
                </span>
                <span className="text-text-secondary cursor-help" title="% of signals where the stock went up within 30 days">
                  Win rate: <span className="text-text-primary font-display">{Number(bestSignal.win_rate).toFixed(0)}%</span>
                </span>
                <span className="text-text-secondary cursor-help" title="Average 30-day return vs. SPY — positive means the signal beat the market">
                  Alpha: <span className={Number(bestSignal.avg_alpha) > 0 ? 'text-green font-display' : 'text-red font-display'}>{formatPercentRaw(Number(bestSignal.avg_alpha) * 100)}</span>
                </span>
              </div>
              <p className="text-text-tertiary text-[11px] mt-2">Based on {bestSignal.total_signals} historical signals</p>
            </Link>
          )}
          {scoreAccuracy.highBucket && (
            <Link
              href="/signals"
              className="bg-bg-secondary rounded-lg border border-border p-5 hover:border-green/30 transition-colors"
            >
              <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-2">Score Accuracy (30d)</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green text-lg">🎯</span>
                <h3 className="font-display font-bold text-lg">
                  {Number(scoreAccuracy.highBucket.avg_alpha) > 0 ? 'Scores Predict Returns' : 'Under Review'}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-text-tertiary text-[10px]">Score 75-100 (30d)</p>
                  <p className={`font-display ${Number(scoreAccuracy.highBucket.avg_return) > 0 ? 'text-green' : 'text-red'}`}>
                    {formatPercentRaw(Number(scoreAccuracy.highBucket.avg_return) * 100)} avg
                  </p>
                  <p className="text-text-tertiary text-[10px] cursor-help" title="% of stocks in this bucket with a positive 30-day return">Win rate: {Number(scoreAccuracy.highBucket.win_rate).toFixed(0)}%</p>
                </div>
                {scoreAccuracy.lowBucket && (
                  <div>
                    <p className="text-text-tertiary text-[10px]">Score 0-30 (30d)</p>
                    <p className={`font-display ${Number(scoreAccuracy.lowBucket.avg_return) > 0 ? 'text-green' : 'text-red'}`}>
                      {formatPercentRaw(Number(scoreAccuracy.lowBucket.avg_return) * 100)} avg
                    </p>
                    <p className="text-text-tertiary text-[10px] cursor-help" title="% of stocks in this bucket with a positive 30-day return">Win rate: {Number(scoreAccuracy.lowBucket.win_rate).toFixed(0)}%</p>
                  </div>
                )}
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Early Signals — divergences are the real edge */}
      {divergenceStocks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-display font-semibold">Early Signals</h2>
                <span className="text-[10px] px-2 py-0.5 rounded border border-purple/30 bg-purple-bg text-purple font-medium">Edge</span>
              </div>
              <p className="text-text-tertiary text-xs mt-0.5">
                Non-price indicators disagree with the chart — insiders, fundamentals, or AI see something price hasn&apos;t reflected yet
              </p>
            </div>
            <Link href="/screener?preset=insider_contrarian" className="text-sm text-purple hover:text-purple/80 transition-colors">
              All divergences →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {divergenceStocks.map((row) => {
              const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
              const divs = row._divergences;
              const topDiv = divs[0];
              return (
                <Link
                  key={row.symbol}
                  href={`/stock/${row.symbol}`}
                  className="bg-bg-secondary rounded-lg border border-purple/20 p-4 hover:border-purple/40 transition-colors group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-bold text-purple group-hover:text-purple/80 transition-colors">{row.symbol}</h3>
                        {topDiv.strength === 'high' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-bg border border-purple/20 text-purple font-medium">HIGH</span>
                        )}
                      </div>
                      <p className="text-text-tertiary text-[11px] truncate max-w-[180px]">{stock.name}</p>
                    </div>
                    <ScoreBadge score={row.sentinel_score} size="sm" />
                  </div>
                  <p className="text-purple/90 text-xs font-medium mb-1">{topDiv.label}</p>
                  <p className="text-text-secondary text-[11px] leading-relaxed line-clamp-2">{topDiv.detail}</p>
                  {divs.length > 1 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {divs.slice(1, 3).map((d) => (
                        <span key={d.type} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-bg/50 text-purple/70 border border-purple/10">
                          {d.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-text-tertiary">
                    <span>Insider: <span className={`font-display ${(row.insider_score ?? 50) >= 65 ? 'text-green' : ''}`}>{row.insider_score ?? '—'}</span></span>
                    <span>Tech: <span className={`font-display ${(row.technical_score ?? 50) < 45 ? 'text-red' : ''}`}>{row.technical_score ?? '—'}</span></span>
                    <span>Fund: <span className="font-display">{row.fundamental_score ?? '—'}</span></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Actionable Ideas */}
      {actionable.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-display font-semibold">Actionable Ideas</h2>
              <p className="text-text-tertiary text-xs mt-0.5">Stocks with multiple bullish signals aligning — here&apos;s why they stand out</p>
            </div>
            <Link href="/screener?preset=sentinel_top_picks" className="text-sm text-green hover:text-green/80 transition-colors">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {actionable.map((row) => {
              const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
              const tech = row.technical_signals as unknown as { rsi_14: number | null; price_vs_sma50: number | null; price_vs_sma200: number | null; pct_from_52w_high: number | null; volume_ratio_50d: number | null } | null;
              const fund = row.fundamentals as unknown as { revenue_growth_yoy: number | null; earnings_growth_yoy: number | null; pe_ratio: number | null } | null;
              const verdict = scoreVerdict(row.sentinel_score);
              const signal = generateSignalSummary({
                sentinel_score: row.sentinel_score,
                technical_score: row.technical_score,
                fundamental_score: row.fundamental_score,
                institutional_score: row.institutional_score,
                rsi_14: tech?.rsi_14 ?? null,
                price_vs_sma50: tech?.price_vs_sma50 ?? null,
                price_vs_sma200: tech?.price_vs_sma200 ?? null,
                pct_from_52w_high: tech?.pct_from_52w_high ?? null,
                volume_ratio_50d: tech?.volume_ratio_50d ?? null,
                revenue_growth_yoy: fund?.revenue_growth_yoy ?? null,
                earnings_growth_yoy: fund?.earnings_growth_yoy ?? null,
                pe_ratio: fund?.pe_ratio ?? null,
                insider_score: row.insider_score,
                earnings_ai_score: row.earnings_ai_score,
              });

              return (
                <Link
                  key={row.symbol}
                  href={`/stock/${row.symbol}`}
                  className="bg-bg-secondary rounded-lg border border-border p-4 hover:border-green/30 transition-colors group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-bold text-green group-hover:text-green/80 transition-colors">{row.symbol}</h3>
                        <span className={`text-[10px] font-medium ${verdictColor(verdict)}`}>{verdict}</span>
                      </div>
                      <p className="text-text-tertiary text-[11px] truncate max-w-[200px]">{stock.name}</p>
                    </div>
                    <ScoreBadge score={row.sentinel_score} size="md" />
                  </div>
                  <p className="text-text-secondary text-xs leading-relaxed">{signal}</p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-text-tertiary">
                    <span>{stock.sector ?? '—'}</span>
                    <span>·</span>
                    <span>{stock.market_cap ? formatMarketCap(stock.market_cap) : '—'}</span>
                    {row.score_change_1d != null && row.score_change_1d !== 0 && (
                      <>
                        <span>·</span>
                        <span className={row.score_change_1d > 0 ? 'text-green' : 'text-red'}>
                          {row.score_change_1d > 0 ? '+' : ''}{row.score_change_1d} today
                        </span>
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Screens */}
      <div>
        <h2 className="text-sm font-medium text-text-secondary mb-1">Quick Screens</h2>
        <p className="text-text-tertiary text-[11px] mb-3">Pre-built filters for common trading strategies</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SCREENER_PRESETS).map(([key, preset]) => (
            <Link
              key={key}
              href={`/screener?preset=${key}`}
              className="group px-3 py-2 text-xs rounded-lg border border-border text-text-tertiary hover:text-text-secondary hover:border-border/80 transition-colors"
            >
              <span className="font-medium">{preset.name}</span>
              <span className="block text-[10px] text-text-tertiary/60 mt-0.5 group-hover:text-text-tertiary/80">{preset.description}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Top 10 Card Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-semibold">Top 10 by Score</h2>
          <Link href="/screener" className="text-sm text-green hover:text-green/80 transition-colors">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {topStocks.map((row, i) => {
            const stock = row.stocks as unknown as { name: string; sector: string | null; market_cap: number | null };
            const verdict = scoreVerdict(row.sentinel_score);
            return (
              <Link
                key={row.symbol}
                href={`/stock/${row.symbol}`}
                className="bg-bg-secondary rounded-lg border border-border p-4 hover:border-green/30 transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-text-tertiary text-[10px] font-display">#{i + 1}</span>
                    <h3 className="font-display font-bold text-green group-hover:text-green/80 transition-colors">{row.symbol}</h3>
                    <p className="text-text-tertiary text-[11px] truncate max-w-[120px]">{stock.name}</p>
                  </div>
                  <ScoreBadge score={row.sentinel_score} size="md" />
                </div>
                <div className="mt-2">
                  <span className={`text-[10px] font-medium ${verdictColor(verdict)}`}>{verdict}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px]">
                  <span className="text-text-tertiary" title="Technical score">T <span className="text-text-secondary">{row.technical_score ?? '—'}</span></span>
                  <span className="text-text-tertiary" title="Fundamental score">F <span className="text-text-secondary">{row.fundamental_score ?? '—'}</span></span>
                  {row.score_change_1d != null && row.score_change_1d !== 0 && (
                    <span className={row.score_change_1d >= 0 ? 'text-green' : 'text-red'}>
                      {row.score_change_1d > 0 ? '+' : ''}{row.score_change_1d}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-[10px] text-text-tertiary">
                  {stock.sector ?? '—'} · {stock.market_cap ? formatMarketCap(stock.market_cap) : '—'}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Score Movers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MoverSection title="Biggest Score Gainers (1d)" subtitle="Stocks with rapidly improving signals" items={movers.gainers} direction="up" />
        <MoverSection title="Biggest Score Drops (1d)" subtitle="Previously strong stocks losing momentum" items={movers.losers} direction="down" />
      </div>

      {/* Recent Alerts */}
      {recentAlerts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-text-secondary">Recent Alerts</h2>
              <p className="text-text-tertiary text-[11px]">Latest automated signal detections</p>
            </div>
            <Link href="/signals" className="text-xs text-green hover:text-green/80 transition-colors">
              Signal performance →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {recentAlerts.map((alert, i) => {
              const typeLabels: Record<string, { label: string; icon: string }> = {
                score_threshold: { label: 'Score Spike', icon: '⬆️' },
                score_drop: { label: 'Score Drop', icon: '⬇️' },
                insider_cluster_buy: { label: 'Insider Cluster', icon: '🏦' },
                insider_ceo_buy: { label: 'CEO Buy', icon: '👔' },
                triple_confirmation: { label: 'Triple Confirm', icon: '✅' },
              };
              const info = typeLabels[alert.alert_type as string] ?? { label: alert.alert_type, icon: '🔔' };
              return (
                <Link
                  key={`${alert.symbol}-${i}`}
                  href={`/stock/${alert.symbol}`}
                  className="bg-bg-secondary rounded-lg border border-border px-3 py-2.5 hover:border-green/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{info.icon}</span>
                      <span className="font-display font-semibold text-green text-sm">{alert.symbol}</span>
                      <span className="text-[10px] text-text-tertiary">{info.label}</span>
                    </div>
                    <span className="text-[10px] text-text-tertiary">{formatRelativeTime(alert.created_at as string)}</span>
                  </div>
                  <p className="text-text-secondary text-[11px] leading-snug truncate">{alert.message}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Activity Feed */}
      <RecentActivity items={activityItems} />

      {/* Legend */}
      <div className="border-t border-border pt-6">
        <h3 className="text-xs font-medium text-text-tertiary mb-3 uppercase tracking-wider">How Scores Work</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green shrink-0" />
            <span className="text-text-secondary"><span className="text-text-primary font-medium">75-100</span> — Strong Buy / Bullish</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green/60 shrink-0" />
            <span className="text-text-secondary"><span className="text-text-primary font-medium">65-74</span> — Bullish</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber shrink-0" />
            <span className="text-text-secondary"><span className="text-text-primary font-medium">45-64</span> — Neutral</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber/60 shrink-0" />
            <span className="text-text-secondary"><span className="text-text-primary font-medium">30-44</span> — Caution</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red shrink-0" />
            <span className="text-text-secondary"><span className="text-text-primary font-medium">0-29</span> — Bearish</span>
          </div>
        </div>
        <p className="text-text-tertiary text-[10px] mt-2">
          Scores combine 7 dimensions: Technical (28%), AI Analysis (22%), Fundamental (15%), Insider (15%), Institutional (10%), Sentiment (5%), Options Flow (5%)
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, subColor, accent }: {
  label: string; value: string; sub?: string; subColor?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-5 ${accent ? 'border-green/30 bg-green-bg' : 'border-border bg-bg-secondary'}`}>
      <p className="text-text-tertiary text-xs uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-display font-bold mt-2 ${accent ? 'text-green' : ''}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${subColor ?? 'text-text-tertiary'}`}>{sub}</p>}
    </div>
  );
}

function MoverSection({ title, subtitle, items, direction }: {
  title: string;
  subtitle: string;
  items: Array<{ symbol: string; sentinel_score: number | null; score_change_1d: number | null; stocks: unknown }>;
  direction: 'up' | 'down';
}) {
  if (items.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-1">{title}</h3>
        <p className="text-text-tertiary text-xs">{subtitle}</p>
        <p className="text-text-tertiary text-xs mt-3">No score changes recorded yet</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-text-secondary mb-0.5">{title}</h3>
      <p className="text-text-tertiary text-[11px] mb-3">{subtitle}</p>
      <div className="space-y-2">
        {items.map((item) => {
          const stock = item.stocks as unknown as { name: string };
          const verdict = scoreVerdict(item.sentinel_score);
          return (
            <Link
              key={item.symbol}
              href={`/stock/${item.symbol}`}
              className="flex items-center justify-between bg-bg-secondary rounded-lg border border-border px-4 py-3 hover:border-green/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-display font-semibold text-green text-sm">{item.symbol}</span>
                <span className="text-text-tertiary text-xs truncate max-w-32">{stock.name}</span>
                <span className={`text-[10px] font-medium ${verdictColor(verdict)}`}>{verdict}</span>
              </div>
              <div className="flex items-center gap-3">
                <ScoreBadge score={item.sentinel_score} size="sm" />
                {item.score_change_1d != null && (
                  <span className={`font-display text-xs font-bold ${direction === 'up' ? 'text-green' : 'text-red'}`}>
                    {item.score_change_1d > 0 ? '+' : ''}{item.score_change_1d}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
