import { getSupabaseServerClient } from '@/lib/db';
import { getSignalPerformanceMap, getActiveSignalsBySymbol } from '@/lib/signals';
import { ScreenerClient } from './ScreenerClient';
import type { ActiveSignal } from '@/lib/utils/types';

export const dynamic = 'force-dynamic';

async function getScreenerData(activeSignals: Record<string, ActiveSignal[]>) {
  const db = getSupabaseServerClient();

  const { data, error } = await db
    .from('stocks')
    .select(`
      symbol, name, sector, market_cap,
      sentinel_scores(sentinel_score, technical_score, fundamental_score, earnings_ai_score, insider_score, institutional_score, options_flow_score, rank, percentile, flags),
      technical_signals(rsi_14, price_vs_sma50, price_vs_sma200, pct_from_52w_high, pct_from_52w_low, volume_ratio_50d, rs_rank_3m, rs_rank_6m, sma_50, sma_150, sma_200),
      fundamentals(pe_ratio, revenue_growth_yoy, earnings_growth_yoy, revenue_growth_qoq, earnings_growth_qoq, gross_margin, net_margin),
      insider_signals(num_buyers_30d, num_sellers_30d, net_buy_value_30d)
    `)
    .eq('is_active', true)
    .not('sentinel_scores.sentinel_score', 'is', null);

  if (error) {
    console.error('Screener data error:', error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.sentinel_scores != null)
    .map((row) => {
      const scores = row.sentinel_scores as unknown as Record<string, number | null>;
      const tech = row.technical_signals as unknown as Record<string, number | null> | null;
      const fund = row.fundamentals as unknown as Record<string, number | null> | null;
      const insider = row.insider_signals as unknown as Record<string, number | null> | null;

      return {
        symbol: row.symbol,
        name: row.name,
        sector: row.sector,
        market_cap: row.market_cap,
        sentinel_score: scores?.sentinel_score ?? null,
        technical_score: scores?.technical_score ?? null,
        fundamental_score: scores?.fundamental_score ?? null,
        earnings_ai_score: scores?.earnings_ai_score ?? null,
        insider_score: scores?.insider_score ?? null,
        institutional_score: scores?.institutional_score ?? null,
        options_flow_score: scores?.options_flow_score ?? null,
        rank: scores?.rank ?? null,
        percentile: scores?.percentile ?? null,
        rsi_14: tech?.rsi_14 ?? null,
        price_vs_sma50: tech?.price_vs_sma50 ?? null,
        price_vs_sma200: tech?.price_vs_sma200 ?? null,
        pct_from_52w_high: tech?.pct_from_52w_high ?? null,
        pct_from_52w_low: tech?.pct_from_52w_low ?? null,
        volume_ratio_50d: tech?.volume_ratio_50d ?? null,
        rs_rank_3m: tech?.rs_rank_3m ?? null,
        rs_rank_6m: tech?.rs_rank_6m ?? null,
        sma_50: tech?.sma_50 ?? null,
        sma_150: tech?.sma_150 ?? null,
        sma_200: tech?.sma_200 ?? null,
        pe_ratio: fund?.pe_ratio ?? null,
        revenue_growth_yoy: fund?.revenue_growth_yoy ?? null,
        earnings_growth_yoy: fund?.earnings_growth_yoy ?? null,
        revenue_growth_qoq: fund?.revenue_growth_qoq ?? null,
        earnings_growth_qoq: fund?.earnings_growth_qoq ?? null,
        num_buyers_30d: insider?.num_buyers_30d ?? null,
        num_sellers_30d: insider?.num_sellers_30d ?? null,
        net_buy_value_30d: insider?.net_buy_value_30d ?? null,
        flags: (scores as Record<string, unknown>)?.flags as string[] ?? [],
        active_signals: activeSignals[row.symbol] ?? [],
      };
    })
    .sort((a, b) => (b.sentinel_score ?? 0) - (a.sentinel_score ?? 0));
}

async function getSectors() {
  const db = getSupabaseServerClient();
  const { data } = await db
    .from('stocks')
    .select('sector')
    .eq('is_active', true)
    .not('sector', 'is', null);

  const sectors = [...new Set((data ?? []).map((d) => d.sector as string))].sort();
  return sectors;
}

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sectorParam = typeof params.sector === 'string' ? params.sector : undefined;

  const [sectors, signalPerformance, activeSignals] = await Promise.all([
    getSectors(),
    getSignalPerformanceMap(),
    getActiveSignalsBySymbol(),
  ]);

  const rows = await getScreenerData(activeSignals);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Screener</h1>
        <p className="text-text-secondary text-sm mt-1">
          Filter and sort {rows.length} scored stocks
        </p>
      </div>
      <ScreenerClient
        initialData={rows}
        sectors={sectors}
        signalPerformance={signalPerformance}
        initialSector={sectorParam}
      />
    </div>
  );
}
