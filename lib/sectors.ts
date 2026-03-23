import { getSupabaseServerClient } from './db';
import type { SectorSignals } from './utils/types';

interface StockRow {
  symbol: string;
  sector: string | null;
}

interface ScoreRow {
  symbol: string;
  sentinel_score: number | null;
  technical_score: number | null;
  earnings_ai_score: number | null;
}

interface TechRow {
  symbol: string;
  price_vs_sma50: number | null;
  price_vs_sma200: number | null;
  volume_ratio_50d: number | null;
  rs_rank_3m: number | null;
}

interface InsiderRow {
  symbol: string;
  net_buy_value_30d: number | null;
}

interface InstitutionalRow {
  symbol: string;
  net_institutional_flow: number | null;
}

interface PriceRow {
  symbol: string;
  date: string;
  close: number;
}

interface SectorAccumulator {
  sentinelScores: number[];
  technicalScores: number[];
  earningsAiScores: number[];
  aboveSma50: number;
  aboveSma200: number;
  volumeRatios: number[];
  rsRanks: number[];
  insiderFlow: number;
  institutionalFlow: number;
  above75: number;
  total: number;
}

function freshAccumulator(): SectorAccumulator {
  return {
    sentinelScores: [],
    technicalScores: [],
    earningsAiScores: [],
    aboveSma50: 0,
    aboveSma200: 0,
    volumeRatios: [],
    rsRanks: [],
    insiderFlow: 0,
    institutionalFlow: 0,
    above75: 0,
    total: 0,
  };
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round1(v: number | null): number | null {
  return v != null ? Math.round(v * 10) / 10 : null;
}

function round4(v: number | null): number | null {
  return v != null ? Math.round(v * 10000) / 10000 : null;
}

function round2(v: number | null): number | null {
  return v != null ? Math.round(v * 100) / 100 : null;
}

function deriveRotationSignal(
  insiderFlow: number,
  institutionalFlow: number,
): 'money_inflow' | 'money_outflow' | 'neutral' {
  const net = insiderFlow + institutionalFlow;
  if (net > 0) return 'money_inflow';
  if (net < 0) return 'money_outflow';
  return 'neutral';
}

function computeSectorReturns(
  sectorStocks: Map<string, string[]>,
  pricesBySymbol: Map<string, { date: string; close: number }[]>,
): Map<string, { return1d: number | null; return5d: number | null; return30d: number | null }> {
  const result = new Map<string, { return1d: number | null; return5d: number | null; return30d: number | null }>();

  for (const [sector, symbols] of sectorStocks) {
    const returns1d: number[] = [];
    const returns5d: number[] = [];
    const returns30d: number[] = [];

    for (const sym of symbols) {
      const prices = pricesBySymbol.get(sym);
      if (!prices || prices.length < 2) continue;

      const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
      const latest = sorted[sorted.length - 1].close;

      if (sorted.length >= 2) {
        const prev = sorted[sorted.length - 2].close;
        if (prev > 0) returns1d.push((latest - prev) / prev);
      }
      if (sorted.length >= 6) {
        const prev5 = sorted[sorted.length - 6].close;
        if (prev5 > 0) returns5d.push((latest - prev5) / prev5);
      }
      if (sorted.length >= 22) {
        const prev30 = sorted[sorted.length - 22].close;
        if (prev30 > 0) returns30d.push((latest - prev30) / prev30);
      }
    }

    result.set(sector, {
      return1d: avg(returns1d),
      return5d: avg(returns5d),
      return30d: avg(returns30d),
    });
  }

  return result;
}

export async function computeAndStoreSectorSignals(): Promise<{
  sectors_updated: number;
  errors: number;
}> {
  const db = getSupabaseServerClient();

  const [stocksRes, scoresRes, techRes, insiderRes, instRes] = await Promise.all([
    db.from('stocks').select('symbol, sector').eq('is_active', true),
    db.from('sentinel_scores').select('symbol, sentinel_score, technical_score, earnings_ai_score'),
    db.from('technical_signals').select('symbol, price_vs_sma50, price_vs_sma200, volume_ratio_50d, rs_rank_3m'),
    db.from('insider_signals').select('symbol, net_buy_value_30d'),
    db.from('institutional_signals').select('symbol, net_institutional_flow'),
  ]);

  const stocks = (stocksRes.data ?? []) as StockRow[];
  const scoreMap = new Map((scoresRes.data ?? [] as ScoreRow[]).map(r => [r.symbol, r]));
  const techMap = new Map((techRes.data ?? [] as TechRow[]).map(r => [r.symbol, r]));
  const insiderMap = new Map((insiderRes.data ?? [] as InsiderRow[]).map(r => [r.symbol, r]));
  const instMap = new Map((instRes.data ?? [] as InstitutionalRow[]).map(r => [r.symbol, r]));

  const sectorAccumulators = new Map<string, SectorAccumulator>();
  const sectorStocks = new Map<string, string[]>();

  for (const stock of stocks) {
    const sector = stock.sector;
    if (!sector) continue;

    if (!sectorAccumulators.has(sector)) {
      sectorAccumulators.set(sector, freshAccumulator());
      sectorStocks.set(sector, []);
    }

    const acc = sectorAccumulators.get(sector)!;
    sectorStocks.get(sector)!.push(stock.symbol);
    acc.total++;

    const scores = scoreMap.get(stock.symbol);
    if (scores) {
      if (scores.sentinel_score != null) {
        const s = Number(scores.sentinel_score);
        acc.sentinelScores.push(s);
        if (s >= 75) acc.above75++;
      }
      if (scores.technical_score != null) acc.technicalScores.push(Number(scores.technical_score));
      if (scores.earnings_ai_score != null) acc.earningsAiScores.push(Number(scores.earnings_ai_score));
    }

    const tech = techMap.get(stock.symbol);
    if (tech) {
      if (tech.price_vs_sma50 != null && Number(tech.price_vs_sma50) > 0) acc.aboveSma50++;
      if (tech.price_vs_sma200 != null && Number(tech.price_vs_sma200) > 0) acc.aboveSma200++;
      if (tech.volume_ratio_50d != null) acc.volumeRatios.push(Number(tech.volume_ratio_50d));
      if (tech.rs_rank_3m != null) acc.rsRanks.push(Number(tech.rs_rank_3m));
    }

    const insider = insiderMap.get(stock.symbol);
    if (insider?.net_buy_value_30d != null) {
      acc.insiderFlow += Number(insider.net_buy_value_30d);
    }

    const inst = instMap.get(stock.symbol);
    if (inst?.net_institutional_flow != null) {
      acc.institutionalFlow += Number(inst.net_institutional_flow);
    }
  }

  const { data: priceData } = await db
    .from('daily_prices')
    .select('symbol, date, close')
    .in('symbol', stocks.map(s => s.symbol))
    .order('date', { ascending: true })
    .limit(stocks.length * 35);

  const pricesBySymbol = new Map<string, { date: string; close: number }[]>();
  for (const row of (priceData ?? []) as PriceRow[]) {
    if (!pricesBySymbol.has(row.symbol)) pricesBySymbol.set(row.symbol, []);
    pricesBySymbol.get(row.symbol)!.push({ date: row.date, close: Number(row.close) });
  }

  const sectorReturns = computeSectorReturns(sectorStocks, pricesBySymbol);

  const sectorEntries = [...sectorAccumulators.entries()];
  const avgRsRanks = sectorEntries.map(([sector, acc]) => ({
    sector,
    avgRs: avg(acc.rsRanks),
  }));
  avgRsRanks.sort((a, b) => (b.avgRs ?? 0) - (a.avgRs ?? 0));
  const rsRankMap = new Map<string, number>();
  avgRsRanks.forEach((entry, i) => rsRankMap.set(entry.sector, i + 1));

  const rows: Array<Record<string, unknown>> = [];
  for (const [sector, acc] of sectorEntries) {
    const returns = sectorReturns.get(sector);
    rows.push({
      sector,
      avg_sentinel_score: round1(avg(acc.sentinelScores)),
      avg_technical_score: round1(avg(acc.technicalScores)),
      avg_earnings_ai_score: round1(avg(acc.earningsAiScores)),
      sector_rs_rank: rsRankMap.get(sector) ?? null,
      pct_above_sma50: acc.total > 0 ? round1((acc.aboveSma50 / acc.total) * 100) : null,
      pct_above_sma200: acc.total > 0 ? round1((acc.aboveSma200 / acc.total) * 100) : null,
      net_insider_flow_30d: round2(acc.insiderFlow),
      net_institutional_flow: Math.round(acc.institutionalFlow),
      net_options_flow_5d: null,
      stocks_above_75_score: acc.above75,
      total_stocks: acc.total,
      rotation_signal: deriveRotationSignal(acc.insiderFlow, acc.institutionalFlow),
      avg_return_1d: round4(returns?.return1d ?? null),
      avg_return_5d: round4(returns?.return5d ?? null),
      avg_return_30d: round4(returns?.return30d ?? null),
      avg_volume_ratio: round2(avg(acc.volumeRatios)),
      updated_at: new Date().toISOString(),
    });
  }

  let sectors_updated = 0;
  let errors = 0;

  if (rows.length > 0) {
    const { error } = await db
      .from('sector_signals')
      .upsert(rows, { onConflict: 'sector' });

    if (error) {
      console.error('[sectors] Upsert error:', error.message);
      errors++;
    } else {
      sectors_updated = rows.length;
    }
  }

  return { sectors_updated, errors };
}

export async function getSectorSignals(): Promise<SectorSignals[]> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from('sector_signals')
    .select('*')
    .order('avg_sentinel_score', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[sectors] Read error:', error.message);
    return [];
  }

  return (data ?? []) as SectorSignals[];
}
