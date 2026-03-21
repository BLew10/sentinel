import { getSupabaseServerClient } from './db';
import type { ActiveSignal, SignalPerformanceStats } from './utils/types';

interface SnapshotInput {
  symbol: string;
  triggerType: string;
  triggerDetail?: string;
  priceAtSignal: number;
  sentinelScore: number | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  earningsAiScore: number | null;
  insiderScore: number | null;
  institutionalScore: number | null;
  newsSentimentScore: number | null;
  optionsFlowScore: number | null;
  sector: string | null;
}

export async function snapshotSignal(input: SnapshotInput): Promise<void> {
  const db = getSupabaseServerClient();

  await db.from('signal_snapshots').insert({
    symbol: input.symbol,
    snapshot_date: new Date().toISOString().split('T')[0],
    price_at_signal: input.priceAtSignal,
    sentinel_score: input.sentinelScore,
    technical_score: input.technicalScore,
    fundamental_score: input.fundamentalScore,
    earnings_ai_score: input.earningsAiScore,
    insider_score: input.insiderScore,
    institutional_score: input.institutionalScore,
    news_sentiment_score: input.newsSentimentScore,
    options_flow_score: input.optionsFlowScore,
    sector: input.sector,
    trigger_type: input.triggerType,
    trigger_detail: input.triggerDetail ?? null,
  });
}

export type PerfPeriod = '30d' | '60d' | '90d';

export interface SignalPerfRow {
  signal_type: string;
  total_signals: number;
  avg_return_7d: number | null;
  avg_return_30d: number | null;
  avg_return_60d: number | null;
  avg_return_90d: number | null;
  win_rate_30d: number | null;
  win_rate_60d: number | null;
  win_rate_90d: number | null;
  avg_alpha_30d: number | null;
  avg_alpha_60d: number | null;
  avg_alpha_90d: number | null;
  best_return: number | null;
  worst_return: number | null;
}

export async function computeSignalPerformance(): Promise<SignalPerfRow[]> {
  const db = getSupabaseServerClient();

  const { data: snapshots } = await db
    .from('signal_snapshots')
    .select('trigger_type, return_7d, return_30d, return_60d, return_90d, alpha_30d, alpha_60d, alpha_90d')
    .not('return_30d', 'is', null);

  if (!snapshots || snapshots.length === 0) return [];

  const groups = new Map<string, Array<Record<string, number | null>>>();

  for (const s of snapshots) {
    const type = s.trigger_type as string;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push({
      return_7d: s.return_7d != null ? Number(s.return_7d) : null,
      return_30d: s.return_30d != null ? Number(s.return_30d) : null,
      return_60d: s.return_60d != null ? Number(s.return_60d) : null,
      return_90d: s.return_90d != null ? Number(s.return_90d) : null,
      alpha_30d: s.alpha_30d != null ? Number(s.alpha_30d) : null,
      alpha_60d: s.alpha_60d != null ? Number(s.alpha_60d) : null,
      alpha_90d: s.alpha_90d != null ? Number(s.alpha_90d) : null,
    });
  }

  const results: SignalPerfRow[] = [];

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const winRate = (arr: number[]) => arr.length > 0 ? arr.filter((v) => v > 0).length / arr.length : null;
  const nums = (rows: Array<Record<string, number | null>>, key: string) =>
    rows.map((r) => r[key]).filter((v): v is number => v != null);

  for (const [type, rows] of groups) {
    const r30 = nums(rows, 'return_30d');

    results.push({
      signal_type: type,
      total_signals: rows.length,
      avg_return_7d: avg(nums(rows, 'return_7d')),
      avg_return_30d: avg(r30),
      avg_return_60d: avg(nums(rows, 'return_60d')),
      avg_return_90d: avg(nums(rows, 'return_90d')),
      win_rate_30d: winRate(r30),
      win_rate_60d: winRate(nums(rows, 'return_60d')),
      win_rate_90d: winRate(nums(rows, 'return_90d')),
      avg_alpha_30d: avg(nums(rows, 'alpha_30d')),
      avg_alpha_60d: avg(nums(rows, 'alpha_60d')),
      avg_alpha_90d: avg(nums(rows, 'alpha_90d')),
      best_return: r30.length > 0 ? Math.max(...r30) : null,
      worst_return: r30.length > 0 ? Math.min(...r30) : null,
    });
  }

  return results.sort((a, b) => b.total_signals - a.total_signals);
}

export async function getRecentSnapshots(limit = 20) {
  const db = getSupabaseServerClient();

  const { data } = await db
    .from('signal_snapshots')
    .select('symbol, trigger_type, trigger_detail, snapshot_date, price_at_signal, sentinel_score, return_7d, return_30d, return_60d, return_90d')
    .order('created_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}

export interface BucketPerfRow {
  bucket: string;
  period: string;
  num_stocks: number;
  avg_return: number | null;
  avg_alpha: number | null;
  win_rate: number | null;
}

export async function getScoreBucketPerformance(): Promise<BucketPerfRow[]> {
  const db = getSupabaseServerClient();

  const { data } = await db
    .from('score_bucket_performance')
    .select('bucket, period, num_stocks, avg_return, avg_alpha, win_rate')
    .in('period', ['7d', '30d', '60d', '90d'])
    .order('computed_date', { ascending: false })
    .limit(80);

  if (!data || data.length === 0) return [];

  // Deduplicate to latest computed_date per bucket+period
  const seen = new Set<string>();
  return data
    .filter((row) => {
      const key = `${row.bucket}:${row.period}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({
      bucket: row.bucket as string,
      period: row.period as string,
      num_stocks: Number(row.num_stocks),
      avg_return: row.avg_return != null ? Number(row.avg_return) : null,
      avg_alpha: row.avg_alpha != null ? Number(row.avg_alpha) : null,
      win_rate: row.win_rate != null ? Number(row.win_rate) : null,
    }));
}

export async function getSignalPerformanceMap(): Promise<Record<string, SignalPerformanceStats>> {
  const db = getSupabaseServerClient();

  const { data } = await db
    .from('signal_performance')
    .select('signal_type, total_signals, avg_return, win_rate, avg_alpha')
    .eq('period', '30d')
    .order('computed_date', { ascending: false })
    .limit(30);

  if (!data || data.length === 0) return {};

  const result: Record<string, SignalPerformanceStats> = {};
  for (const row of data) {
    const type = row.signal_type as string;
    if (result[type]) continue;
    result[type] = {
      win_rate: row.win_rate != null ? Number(row.win_rate) : 0,
      avg_return: row.avg_return != null ? Number(row.avg_return) : 0,
      avg_alpha: row.avg_alpha != null ? Number(row.avg_alpha) : 0,
      total_signals: Number(row.total_signals),
    };
  }
  return result;
}

export async function getActiveSignalsBySymbol(): Promise<Record<string, ActiveSignal[]>> {
  const db = getSupabaseServerClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

  const { data } = await db
    .from('signal_snapshots')
    .select('symbol, trigger_type, snapshot_date, return_7d, return_30d')
    .gte('snapshot_date', cutoff)
    .order('snapshot_date', { ascending: false });

  if (!data || data.length === 0) return {};

  const result: Record<string, ActiveSignal[]> = {};
  for (const row of data) {
    const sym = row.symbol as string;
    if (!result[sym]) result[sym] = [];
    result[sym].push({
      trigger_type: row.trigger_type as string,
      snapshot_date: row.snapshot_date as string,
      return_7d: row.return_7d != null ? Number(row.return_7d) : null,
      return_30d: row.return_30d != null ? Number(row.return_30d) : null,
    });
  }
  return result;
}

export async function getSignalPerformanceFromDB(): Promise<SignalPerfRow[]> {
  const db = getSupabaseServerClient();

  const { data } = await db
    .from('signal_performance')
    .select('signal_type, period, total_signals, avg_return, win_rate, avg_alpha, best_return, worst_return')
    .in('period', ['7d', '30d', '60d', '90d'])
    .order('computed_date', { ascending: false })
    .limit(100);

  if (!data || data.length === 0) return [];

  // Keep only the latest row per signal_type+period
  const latest = new Map<string, Map<string, Record<string, unknown>>>();
  for (const row of data) {
    const type = row.signal_type as string;
    const period = row.period as string;
    if (!latest.has(type)) latest.set(type, new Map());
    const typeMap = latest.get(type)!;
    if (!typeMap.has(period)) typeMap.set(period, row as Record<string, unknown>);
  }

  const results: SignalPerfRow[] = [];
  for (const [signalType, periodMap] of Array.from(latest.entries())) {
    const num = (period: string, field: string): number | null => {
      const row = periodMap.get(period);
      if (!row || row[field] == null) return null;
      return Number(row[field]);
    };
    const wr = (period: string): number | null => {
      const v = num(period, 'win_rate');
      return v != null ? v / 100 : null;
    };

    results.push({
      signal_type: signalType,
      total_signals: num('30d', 'total_signals') ?? 0,
      avg_return_7d: num('7d', 'avg_return'),
      avg_return_30d: num('30d', 'avg_return'),
      avg_return_60d: num('60d', 'avg_return'),
      avg_return_90d: num('90d', 'avg_return'),
      win_rate_30d: wr('30d'),
      win_rate_60d: wr('60d'),
      win_rate_90d: wr('90d'),
      avg_alpha_30d: num('30d', 'avg_alpha'),
      avg_alpha_60d: num('60d', 'avg_alpha'),
      avg_alpha_90d: num('90d', 'avg_alpha'),
      best_return: num('30d', 'best_return'),
      worst_return: num('30d', 'worst_return'),
    });
  }

  return results;
}
