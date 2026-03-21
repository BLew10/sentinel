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

export interface SignalPerfRow {
  signal_type: string;
  total_signals: number;
  avg_return_7d: number | null;
  avg_return_30d: number | null;
  avg_return_90d: number | null;
  win_rate_30d: number | null;
  avg_alpha_30d: number | null;
  best_return: number | null;
  worst_return: number | null;
}

export async function computeSignalPerformance(): Promise<SignalPerfRow[]> {
  const db = getSupabaseServerClient();

  const { data: snapshots } = await db
    .from('signal_snapshots')
    .select('trigger_type, return_7d, return_30d, return_90d, alpha_30d')
    .not('return_30d', 'is', null);

  if (!snapshots || snapshots.length === 0) return [];

  const groups = new Map<string, Array<{
    return_7d: number | null;
    return_30d: number | null;
    return_90d: number | null;
    alpha_30d: number | null;
  }>>();

  for (const s of snapshots) {
    const type = s.trigger_type as string;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push({
      return_7d: s.return_7d != null ? Number(s.return_7d) : null,
      return_30d: s.return_30d != null ? Number(s.return_30d) : null,
      return_90d: s.return_90d != null ? Number(s.return_90d) : null,
      alpha_30d: s.alpha_30d != null ? Number(s.alpha_30d) : null,
    });
  }

  const results: SignalPerfRow[] = [];

  for (const [type, rows] of groups) {
    const r7 = rows.map((r) => r.return_7d).filter((v): v is number => v != null);
    const r30 = rows.map((r) => r.return_30d).filter((v): v is number => v != null);
    const r90 = rows.map((r) => r.return_90d).filter((v): v is number => v != null);
    const a30 = rows.map((r) => r.alpha_30d).filter((v): v is number => v != null);

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const winRate = r30.length > 0 ? r30.filter((v) => v > 0).length / r30.length : null;

    results.push({
      signal_type: type,
      total_signals: rows.length,
      avg_return_7d: avg(r7),
      avg_return_30d: avg(r30),
      avg_return_90d: avg(r90),
      win_rate_30d: winRate,
      avg_alpha_30d: avg(a30),
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
    .select('symbol, trigger_type, trigger_detail, snapshot_date, price_at_signal, sentinel_score, return_7d, return_30d')
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
    .order('computed_date', { ascending: false })
    .limit(30);

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
    .select('signal_type, period, total_signals, avg_return, median_return, win_rate, avg_alpha, best_return, worst_return, sharpe_estimate')
    .eq('period', '30d')
    .order('computed_date', { ascending: false })
    .limit(20);

  if (!data || data.length === 0) return [];

  const seen = new Set<string>();
  return data
    .filter((row) => {
      if (seen.has(row.signal_type as string)) return false;
      seen.add(row.signal_type as string);
      return true;
    })
    .map((row) => ({
      signal_type: row.signal_type as string,
      total_signals: Number(row.total_signals),
      avg_return_7d: null,
      avg_return_30d: row.avg_return != null ? Number(row.avg_return) : null,
      avg_return_90d: null,
      win_rate_30d: row.win_rate != null ? Number(row.win_rate) / 100 : null,
      avg_alpha_30d: row.avg_alpha != null ? Number(row.avg_alpha) : null,
      best_return: row.best_return != null ? Number(row.best_return) : null,
      worst_return: row.worst_return != null ? Number(row.worst_return) : null,
    }));
}
