import { getSupabaseServerClient } from '@/lib/db';
import { ScoreBadge } from '@/components/ui/ScoreBadge';
import { PREDICTIVE_ALERT_TYPES, SIGNAL_TYPE_LABELS } from '@/lib/utils/constants';
import { formatCurrency, formatMarketCap, formatPercentRaw, formatRelativeTime, scoreVerdict, verdictColor, generateSignalSummary, detectDivergences } from '@/lib/utils/format';
import type { Divergence } from '@/lib/utils/format';
import Link from 'next/link';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { buildActivityItems } from '@/components/dashboard/activity-utils';
import { SetupCard } from '@/components/dashboard/SetupCard';
import { classifySetups } from '@/lib/setups';

export const dynamic = 'force-dynamic';

// ── Data Fetchers ──

async function getActiveSetups() {
  const db = getSupabaseServerClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { data: alerts } = await db
    .from('alert_history')
    .select('symbol, alert_type, message, created_at')
    .in('alert_type', [...PREDICTIVE_ALERT_TYPES])
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false });

  if (!alerts || alerts.length === 0) return [];

  const symbolAlerts = new Map<string, string[]>();
  for (const a of alerts) {
    const sym = a.symbol as string;
    const types = symbolAlerts.get(sym) ?? [];
    if (!types.includes(a.alert_type as string)) types.push(a.alert_type as string);
    symbolAlerts.set(sym, types);
  }

  const symbols = [...symbolAlerts.keys()].slice(0, 20);

  const { data: scoreData } = await db
    .from('sentinel_scores')
    .select(`
      symbol, sentinel_score, technical_score, fundamental_score,
      earnings_ai_score, insider_score, institutional_score, flags,
      stocks!inner(name, sector, market_cap),
      technical_signals(rsi_14, price_vs_sma50, pct_from_52w_high, volume_ratio_50d)
    `)
    .in('symbol', symbols);

  if (!scoreData) return [];

  return scoreData
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
        sentinelScore: row.sentinel_score,
        technicalScore: row.technical_score,
        fundamentalScore: row.fundamental_score,
        insiderScore: row.insider_score,
        earningsAiScore: row.earnings_ai_score,
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
    .slice(0, 5);
}

async function getSetupCounts() {
  const db = getSupabaseServerClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { data } = await db
    .from('alert_history')
    .select('alert_type, symbol')
    .in('alert_type', [...PREDICTIVE_ALERT_TYPES])
    .gte('created_at', sevenDaysAgo);

  if (!data) return [];

  const counts = new Map<string, Set<string>>();
  for (const row of data) {
    const at = row.alert_type as string;
    const set = counts.get(at) ?? new Set<string>();
    set.add(row.symbol as string);
    counts.set(at, set);
  }

  return [...counts.entries()]
    .map(([alertType, symbols]) => ({
      alertType,
      label: SIGNAL_TYPE_LABELS[alertType] ?? alertType,
      count: symbols.size,
    }))
    .sort((a, b) => b.count - a.count);
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
    .limit(6);
  return data ?? [];
}

async function getDivergenceStocks() {
  const db = getSupabaseServerClient();
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

  withDivergences.sort((a, b) => {
    const aHigh = a._divergences.filter((d) => d.strength === 'high').length;
    const bHigh = b._divergences.filter((d) => d.strength === 'high').length;
    if (bHigh !== aHigh) return bHigh - aHigh;
    return b._divergences.length - a._divergences.length;
  });

  return withDivergences.slice(0, 6);
}

async function getRecentAlerts() {
  const db = getSupabaseServerClient();
  const { data } = await db
    .from('alert_history')
    .select('symbol, alert_type, message, sentinel_score, created_at')
    .order('created_at', { ascending: false })
    .limit(9);
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

// ── Dashboard ──

export default async function Dashboard() {
  const [activeSetups, setupCounts, actionable, divergenceStocks, stats, recentAlerts, bestSignal, scoreAccuracy, activityItems] = await Promise.all([
    getActiveSetups(), getSetupCounts(), getActionableStocks(), getDivergenceStocks(), getStats(), getRecentAlerts(), getBestSignal(), getScoreAccuracy(), getRecentActivity(),
  ]);

  const predictiveAlerts = recentAlerts.filter((a) => PREDICTIVE_ALERT_TYPES.has(a.alert_type as string));
  const confirmatoryAlerts = recentAlerts.filter((a) => !PREDICTIVE_ALERT_TYPES.has(a.alert_type as string));

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
          sub="Score >= 75"
          accent
        />
        <StatCard
          label="SPY"
          value={stats.spyPrice ? formatCurrency(stats.spyPrice) : '—'}
          sub={stats.spyChange != null ? formatPercentRaw(stats.spyChange * 100) : undefined}
          subColor={stats.spyChange != null ? (stats.spyChange >= 0 ? 'text-green' : 'text-red') : undefined}
        />
      </div>

      {/* Signal Performance + Score Accuracy */}
      {(bestSignal || scoreAccuracy.highBucket) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bestSignal && (
            <Link href="/signals" className="bg-bg-secondary rounded-lg border border-border p-5 hover:border-green/30 transition-colors">
              <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-2">Best Performing Signal (30d)</p>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-display font-bold text-lg">
                  {SIGNAL_TYPE_LABELS[bestSignal.signal_type as string] ?? bestSignal.signal_type}
                </h3>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-text-secondary">
                  Return: <span className={Number(bestSignal.avg_return) > 0 ? 'text-green font-display' : 'text-red font-display'}>{formatPercentRaw(Number(bestSignal.avg_return) * 100)}</span>
                </span>
                <span className="text-text-secondary">
                  Win: <span className="text-text-primary font-display">{Number(bestSignal.win_rate).toFixed(0)}%</span>
                </span>
                <span className="text-text-secondary">
                  Alpha: <span className={Number(bestSignal.avg_alpha) > 0 ? 'text-green font-display' : 'text-red font-display'}>{formatPercentRaw(Number(bestSignal.avg_alpha) * 100)}</span>
                </span>
              </div>
              <p className="text-text-tertiary text-[11px] mt-2">Based on {bestSignal.total_signals} signals</p>
            </Link>
          )}
          {scoreAccuracy.highBucket && (
            <Link href="/signals" className="bg-bg-secondary rounded-lg border border-border p-5 hover:border-green/30 transition-colors">
              <p className="text-text-tertiary text-[10px] uppercase tracking-wider mb-2">Score Accuracy (30d)</p>
              <h3 className="font-display font-bold text-lg mb-2">
                {Number(scoreAccuracy.highBucket.avg_alpha) > 0 ? 'Scores Predict Returns' : 'Under Review'}
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-text-tertiary text-[10px]">Score 75-100</p>
                  <p className={`font-display ${Number(scoreAccuracy.highBucket.avg_return) > 0 ? 'text-green' : 'text-red'}`}>
                    {formatPercentRaw(Number(scoreAccuracy.highBucket.avg_return) * 100)} avg
                  </p>
                  <p className="text-text-tertiary text-[10px]">Win rate: {Number(scoreAccuracy.highBucket.win_rate).toFixed(0)}%</p>
                </div>
                {scoreAccuracy.lowBucket && (
                  <div>
                    <p className="text-text-tertiary text-[10px]">Score 0-30</p>
                    <p className={`font-display ${Number(scoreAccuracy.lowBucket.avg_return) > 0 ? 'text-green' : 'text-red'}`}>
                      {formatPercentRaw(Number(scoreAccuracy.lowBucket.avg_return) * 100)} avg
                    </p>
                    <p className="text-text-tertiary text-[10px]">Win rate: {Number(scoreAccuracy.lowBucket.win_rate).toFixed(0)}%</p>
                  </div>
                )}
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ── TODAY'S BEST SETUPS (Hero) ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-display font-semibold">Today&apos;s Best Setups</h2>
              <span className="text-[10px] px-2 py-0.5 rounded border border-purple/30 bg-purple-bg text-purple font-medium">Predictive</span>
            </div>
            <p className="text-text-tertiary text-xs mt-0.5">
              Stocks with converging predictive signals — these setups are forming BEFORE the move
            </p>
          </div>
          <Link href="/screener?preset=volatility_squeeze" className="text-sm text-purple hover:text-purple/80 transition-colors">
            All setups →
          </Link>
        </div>
        {activeSetups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSetups.map((stock) => (
              <SetupCard
                key={stock.symbol}
                symbol={stock.symbol}
                name={stock.name}
                sentinelScore={stock.sentinelScore}
                setup={stock.setups[0]}
                sector={stock.sector}
              />
            ))}
          </div>
        ) : (
          <div className="bg-bg-secondary rounded-lg border border-border p-8 text-center">
            <p className="text-text-tertiary text-sm">No active setups detected today.</p>
            <p className="text-text-tertiary text-xs mt-1">
              Check the <Link href="/screener" className="text-purple hover:text-purple/80 underline">screener</Link> for emerging patterns.
            </p>
          </div>
        )}
      </div>

      {/* ── SETUPS FORMING NOW ── */}
      {setupCounts.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-text-secondary mb-1">Setups Forming Now</h2>
          <p className="text-text-tertiary text-[11px] mb-3">Active predictive signals across the universe (last 7 days)</p>
          <div className="flex flex-wrap gap-2">
            {setupCounts.map(({ alertType, label, count }) => (
              <Link
                key={alertType}
                href={`/screener?preset=${alertType === 'bb_squeeze' ? 'volatility_squeeze' : alertType === 'rsi_divergence' ? 'rsi_divergence_plays' : alertType === 'accumulation_divergence' || alertType === 'volume_dry_up' ? 'accumulation_before_breakout' : alertType === 'pre_earnings_setup' ? 'pre_earnings_setup' : 'sentinel_top_picks'}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-purple/20 bg-bg-secondary hover:border-purple/40 transition-colors"
              >
                <span className="text-purple font-display font-bold text-sm">{count}</span>
                <span className="text-text-secondary text-xs">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── DIVERGENCES ── */}
      {divergenceStocks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-display font-semibold">Divergences</h2>
                <span className="text-[10px] px-2 py-0.5 rounded border border-purple/30 bg-purple-bg text-purple font-medium">Edge</span>
              </div>
              <p className="text-text-tertiary text-xs mt-0.5">
                Non-price indicators disagree with the chart — insiders, fundamentals, or AI see something price hasn&apos;t reflected
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

      {/* ── CONFIRMATORY: ACTIONABLE IDEAS ── */}
      {actionable.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-display font-semibold">Already Moving</h2>
                <span className="text-[10px] px-2 py-0.5 rounded border border-green/30 bg-green-bg text-green font-medium">Confirmatory</span>
              </div>
              <p className="text-text-tertiary text-xs mt-0.5">High-score stocks with multiple bullish signals aligned — moves already underway</p>
            </div>
            <Link href="/screener?preset=sentinel_top_picks" className="text-sm text-green hover:text-green/80 transition-colors">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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

      {/* ── STRATEGY PATHS ── */}
      <div>
        <h2 className="text-sm font-medium text-text-secondary mb-1">Find Your Edge</h2>
        <p className="text-text-tertiary text-[11px] mb-3">Screener strategies organized by approach</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StrategyPath
            href="/screener?preset=volatility_squeeze"
            title="Find Setups"
            description="Volatility squeezes, divergences, and pre-breakout patterns forming now"
            accent="purple"
          />
          <StrategyPath
            href="/screener?preset=insider_contrarian"
            title="Insider Edge"
            description="Follow insider buying into weak prices — the highest-conviction contrarian signal"
            accent="green"
          />
          <StrategyPath
            href="/screener?preset=value_reversal_candidates"
            title="Value Plays"
            description="Deeply oversold quality companies with fresh insider conviction buying"
            accent="cyan"
          />
          <StrategyPath
            href="/screener?preset=minervini_trend_template"
            title="Momentum"
            description="Stage 2 uptrends with improving relative strength — buy pullbacks"
            accent="amber"
          />
        </div>
      </div>

      {/* ── RECENT ALERTS (split predictive / confirmatory) ── */}
      {recentAlerts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-text-secondary">Recent Alerts</h2>
              <p className="text-text-tertiary text-[11px]">Latest signal detections — predictive signals fire BEFORE the move</p>
            </div>
            <Link href="/signals" className="text-xs text-green hover:text-green/80 transition-colors">
              Signal performance →
            </Link>
          </div>
          {predictiveAlerts.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-purple font-medium uppercase tracking-wider mb-2">Predictive (setup forming)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {predictiveAlerts.slice(0, 6).map((alert, i) => (
                  <AlertCard key={`p-${alert.symbol}-${i}`} alert={alert} isPredictive />
                ))}
              </div>
            </div>
          )}
          {confirmatoryAlerts.length > 0 && (
            <div>
              <p className="text-[10px] text-text-tertiary font-medium uppercase tracking-wider mb-2">Confirmatory (move detected)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {confirmatoryAlerts.slice(0, 6).map((alert, i) => (
                  <AlertCard key={`c-${alert.symbol}-${i}`} alert={alert} isPredictive={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Activity Feed */}
      <RecentActivity items={activityItems} />
    </div>
  );
}

// ── Helper Components ──

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

function StrategyPath({ href, title, description, accent }: {
  href: string; title: string; description: string; accent: string;
}) {
  const borderColor = accent === 'purple' ? 'hover:border-purple/40' : accent === 'green' ? 'hover:border-green/40' : accent === 'cyan' ? 'hover:border-cyan/40' : 'hover:border-amber/40';
  const textColor = accent === 'purple' ? 'text-purple' : accent === 'green' ? 'text-green' : accent === 'cyan' ? 'text-cyan' : 'text-amber';

  return (
    <Link
      href={href}
      className={`bg-bg-secondary rounded-lg border border-border p-4 ${borderColor} transition-colors group`}
    >
      <h3 className={`font-display font-bold text-sm ${textColor} mb-1`}>{title}</h3>
      <p className="text-text-tertiary text-[11px] leading-relaxed">{description}</p>
    </Link>
  );
}

function AlertCard({ alert, isPredictive }: {
  alert: { symbol: unknown; alert_type: unknown; message: unknown; sentinel_score: unknown; created_at: unknown };
  isPredictive: boolean;
}) {
  const label = SIGNAL_TYPE_LABELS[alert.alert_type as string] ?? (alert.alert_type as string);
  const borderClass = isPredictive ? 'border-purple/20 hover:border-purple/40' : 'border-border hover:border-green/30';

  return (
    <Link
      href={`/stock/${alert.symbol}`}
      className={`bg-bg-secondary rounded-lg border ${borderClass} px-3 py-2.5 transition-colors`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className={`font-display font-semibold text-sm ${isPredictive ? 'text-purple' : 'text-green'}`}>{alert.symbol as string}</span>
          <span className="text-[10px] text-text-tertiary">{label}</span>
        </div>
        <span className="text-[10px] text-text-tertiary">{formatRelativeTime(alert.created_at as string)}</span>
      </div>
      <p className="text-text-secondary text-[11px] leading-snug truncate">{alert.message as string}</p>
    </Link>
  );
}
