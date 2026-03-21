import { getSupabaseServerClient } from './db';
import type { ScreenerFilters } from './utils/types';

export interface ScreenerResult {
  symbol: string;
  name: string;
  sector: string | null;
  market_cap: number | null;
  sentinel_score: number | null;
  technical_score: number | null;
  fundamental_score: number | null;
  earnings_ai_score: number | null;
  insider_score: number | null;
  institutional_score: number | null;
  rank: number | null;
  percentile: number | null;
  rsi_14: number | null;
  price_vs_sma50: number | null;
  price_vs_sma200: number | null;
  pct_from_52w_high: number | null;
  volume_ratio_50d: number | null;
  rs_rank_3m: number | null;
  pe_ratio: number | null;
  revenue_growth_yoy: number | null;
  earnings_growth_yoy: number | null;
}

export interface ScreenerOptions {
  filters: ScreenerFilters;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export async function runScreener(options: ScreenerOptions): Promise<{
  results: ScreenerResult[];
  total: number;
}> {
  const db = getSupabaseServerClient();
  const { filters, sortField = 'sentinel_score', sortDirection = 'desc', limit = 50, offset = 0 } = options;

  // Build the query joining stocks, sentinel_scores, technical_signals, and fundamentals
  let query = db
    .from('stocks')
    .select(`
      symbol, name, sector, market_cap,
      sentinel_scores!inner(sentinel_score, technical_score, fundamental_score, earnings_ai_score, insider_score, institutional_score, rank, percentile),
      technical_signals(rsi_14, price_vs_sma50, price_vs_sma200, pct_from_52w_high, pct_from_52w_low, volume_ratio_50d, rs_rank_3m, rs_rank_6m, sma_50, sma_150, sma_200),
      fundamentals(pe_ratio, revenue_growth_yoy, earnings_growth_yoy, revenue_growth_qoq, earnings_growth_qoq)
    `, { count: 'exact' })
    .eq('is_active', true);

  // Sector filter
  if (filters.sectors && filters.sectors.length > 0) {
    query = query.in('sector', filters.sectors);
  }

  // Market cap filters
  if (filters.market_cap_min != null) {
    query = query.gte('market_cap', filters.market_cap_min);
  }
  if (filters.market_cap_max != null) {
    query = query.lte('market_cap', filters.market_cap_max);
  }

  // Sentinel score filter
  if (filters.sentinel_score_min != null) {
    query = query.gte('sentinel_scores.sentinel_score', filters.sentinel_score_min);
  }

  const { data, count, error } = await query
    .order('sentinel_scores(sentinel_score)', { ascending: sortDirection === 'asc' })
    .range(offset, offset + limit - 1);

  if (error || !data) {
    console.error('Screener query error:', error?.message);
    return { results: [], total: 0 };
  }

  // Post-query filtering for technical and fundamental criteria
  // (Supabase doesn't support filtering on nested joins well, so we filter in-memory)
  type RawRow = typeof data[number] & {
    sentinel_scores: Record<string, unknown>;
    technical_signals: Record<string, unknown> | null;
    fundamentals: Record<string, unknown> | null;
  };

  const filtered = (data as unknown as RawRow[]).filter((row) => {
    const tech = row.technical_signals;
    const fund = row.fundamentals;

    if (filters.price_above_sma50 && tech) {
      const val = tech.price_vs_sma50 as number | null;
      if (val == null || val <= 0) return false;
    }
    if (filters.price_above_sma200 && tech) {
      const val = tech.price_vs_sma200 as number | null;
      if (val == null || val <= 0) return false;
    }
    if (filters.price_above_sma150 && tech) {
      const sma150 = tech.sma_150 as number | null;
      const sma50 = tech.sma_50 as number | null;
      if (sma150 == null || sma50 == null) return false;
    }
    if (filters.sma50_above_sma150 && tech) {
      const s50 = tech.sma_50 as number | null;
      const s150 = tech.sma_150 as number | null;
      if (s50 == null || s150 == null || s50 <= s150) return false;
    }
    if (filters.sma150_above_sma200 && tech) {
      const s150 = tech.sma_150 as number | null;
      const s200 = tech.sma_200 as number | null;
      if (s150 == null || s200 == null || s150 <= s200) return false;
    }
    if (filters.within_25pct_of_52w_high && tech) {
      const val = tech.pct_from_52w_high as number | null;
      if (val == null || val < -0.25) return false;
    }
    if (filters.within_10pct_of_52w_high && tech) {
      const val = tech.pct_from_52w_high as number | null;
      if (val == null || val < -0.1) return false;
    }
    if (filters.above_30pct_from_52w_low && tech) {
      const val = tech.pct_from_52w_low as number | null;
      if (val == null || val < 0.3) return false;
    }
    if (filters.rs_rank_3m_min != null && tech) {
      const val = tech.rs_rank_3m as number | null;
      if (val == null || val < filters.rs_rank_3m_min) return false;
    }
    if (filters.rs_rank_6m_min != null && tech) {
      const val = tech.rs_rank_6m as number | null;
      if (val == null || val < filters.rs_rank_6m_min) return false;
    }
    if (filters.volume_ratio_50d_min != null && tech) {
      const val = tech.volume_ratio_50d as number | null;
      if (val == null || val < filters.volume_ratio_50d_min) return false;
    }
    if (filters.revenue_growth_qoq_min != null && fund) {
      const val = fund.revenue_growth_qoq as number | null;
      if (val == null || val < filters.revenue_growth_qoq_min) return false;
    }
    if (filters.earnings_growth_qoq_min != null && fund) {
      const val = fund.earnings_growth_qoq as number | null;
      if (val == null || val < filters.earnings_growth_qoq_min) return false;
    }
    if (filters.revenue_growth_yoy_min != null && fund) {
      const val = fund.revenue_growth_yoy as number | null;
      if (val == null || val < filters.revenue_growth_yoy_min) return false;
    }
    if (filters.earnings_growth_yoy_min != null && fund) {
      const val = fund.earnings_growth_yoy as number | null;
      if (val == null || val < filters.earnings_growth_yoy_min) return false;
    }

    return true;
  });

  const results: ScreenerResult[] = filtered.map((row) => {
    const s = row.sentinel_scores as Record<string, unknown>;
    const t = row.technical_signals as Record<string, unknown> | null;
    const f = row.fundamentals as Record<string, unknown> | null;

    return {
      symbol: row.symbol as string,
      name: row.name as string,
      sector: row.sector as string | null,
      market_cap: row.market_cap as number | null,
      sentinel_score: (s?.sentinel_score as number) ?? null,
      technical_score: (s?.technical_score as number) ?? null,
      fundamental_score: (s?.fundamental_score as number) ?? null,
      earnings_ai_score: (s?.earnings_ai_score as number) ?? null,
      insider_score: (s?.insider_score as number) ?? null,
      institutional_score: (s?.institutional_score as number) ?? null,
      rank: (s?.rank as number) ?? null,
      percentile: (s?.percentile as number) ?? null,
      rsi_14: (t?.rsi_14 as number) ?? null,
      price_vs_sma50: (t?.price_vs_sma50 as number) ?? null,
      price_vs_sma200: (t?.price_vs_sma200 as number) ?? null,
      pct_from_52w_high: (t?.pct_from_52w_high as number) ?? null,
      volume_ratio_50d: (t?.volume_ratio_50d as number) ?? null,
      rs_rank_3m: (t?.rs_rank_3m as number) ?? null,
      pe_ratio: (f?.pe_ratio as number) ?? null,
      revenue_growth_yoy: (f?.revenue_growth_yoy as number) ?? null,
      earnings_growth_yoy: (f?.earnings_growth_yoy as number) ?? null,
    };
  });

  return { results, total: count ?? results.length };
}
