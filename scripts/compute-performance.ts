import 'dotenv/config';
import { getSupabaseServerClient } from '../lib/db';

const PERIODS = ['7d', '30d', '60d', '90d'] as const;

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function sharpeEstimate(returns: number[]): number | null {
  if (returns.length < 5) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  return mean / std;
}

async function main() {
  console.log('=== Sentinel: Compute Signal Performance ===\n');

  const db = getSupabaseServerClient();
  const today = new Date().toISOString().split('T')[0];

  // --- Signal Performance by Type ---
  type SnapshotRow = Record<string, unknown>;
  const allData: SnapshotRow[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page } = await db
      .from('signal_snapshots')
      .select('trigger_type, symbol, return_7d, return_30d, return_60d, return_90d, alpha_7d, alpha_30d, alpha_60d, alpha_90d, max_drawdown_30d, max_drawdown_90d')
      .not('return_7d', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (!page || page.length === 0) break;
    allData.push(...(page as SnapshotRow[]));
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  const snapshots = allData;

  if (!snapshots || snapshots.length === 0) {
    console.log('No snapshots with return data. Run backfill-returns first.');
    return;
  }

  console.log(`Processing ${snapshots.length} snapshots with return data\n`);

  const groups = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const type = s.trigger_type as string;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push(s);
  }

  const perfRows: Array<Record<string, unknown>> = [];

  for (const [signalType, rows] of groups) {
    for (const period of PERIODS) {
      const returnKey = `return_${period}` as const;
      const alphaKey = `alpha_${period}` as const;

      const returns = rows
        .map((r) => r[returnKey] != null ? Number(r[returnKey]) : null)
        .filter((v): v is number => v != null);

      const alphas = rows
        .map((r) => r[alphaKey] != null ? Number(r[alphaKey]) : null)
        .filter((v): v is number => v != null);

      const ddKey = `max_drawdown_${period === '7d' ? '30d' : period}` as const;
      const drawdowns = rows
        .map((r) => r[ddKey] != null ? Number(r[ddKey]) : null)
        .filter((v): v is number => v != null);

      if (returns.length === 0) continue;

      const symbols = [...new Set(rows.map((r) => r.symbol as string))];

      perfRows.push({
        signal_type: signalType,
        period,
        computed_date: today,
        total_signals: returns.length,
        avg_return: returns.reduce((a, b) => a + b, 0) / returns.length,
        median_return: median(returns),
        win_rate: (returns.filter((r) => r > 0).length / returns.length) * 100,
        avg_alpha: alphas.length > 0 ? alphas.reduce((a, b) => a + b, 0) / alphas.length : null,
        median_alpha: median(alphas),
        avg_max_drawdown: drawdowns.length > 0 ? drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length : null,
        best_return: Math.max(...returns),
        worst_return: Math.min(...returns),
        sharpe_estimate: sharpeEstimate(returns),
        sample_start: rows.reduce((min, r) => (!min || (r.snapshot_date as string) < min) ? (r.snapshot_date as string) : min, '') || null,
        sample_end: rows.reduce((max, r) => (!max || (r.snapshot_date as string) > max) ? (r.snapshot_date as string) : max, '') || null,
        symbols_involved: symbols.slice(0, 50),
      });
    }
  }

  if (perfRows.length > 0) {
    // Clear today's entries and insert fresh
    await db.from('signal_performance').delete().eq('computed_date', today);
    for (let i = 0; i < perfRows.length; i += 50) {
      await db.from('signal_performance').insert(perfRows.slice(i, i + 50));
    }
    console.log(`Signal performance: ${perfRows.length} rows written`);
  }

  // --- Score Bucket Performance ---
  const BUCKETS = [
    { label: '0-30', min: 0, max: 30 },
    { label: '30-50', min: 30, max: 50 },
    { label: '50-65', min: 50, max: 65 },
    { label: '65-75', min: 65, max: 75 },
    { label: '75-100', min: 75, max: 100 },
  ];

  const allBucketData: Array<Record<string, unknown>> = [];
  let bOffset = 0;
  while (true) {
    const { data: page } = await db
      .from('signal_snapshots')
      .select('sentinel_score, technical_score, return_7d, return_30d, return_60d, return_90d, alpha_30d, alpha_60d, alpha_90d')
      .not('return_30d', 'is', null)
      .range(bOffset, bOffset + PAGE - 1);
    if (!page || page.length === 0) break;
    allBucketData.push(...(page as Array<Record<string, unknown>>));
    if (page.length < PAGE) break;
    bOffset += PAGE;
  }
  const allSnapshots = allBucketData;

  if (allSnapshots && allSnapshots.length > 0) {
    const bucketRows: Array<Record<string, unknown>> = [];

    for (const bucket of BUCKETS) {
      // Use technical_score for bucketing since sentinel_score may be null on backtest snapshots
      const inBucket = allSnapshots.filter((s) => {
        const score = (s.sentinel_score ?? s.technical_score) as number | null;
        return score != null && score >= bucket.min && score < bucket.max;
      });

      if (inBucket.length === 0) continue;

      for (const period of PERIODS) {
        const returnKey = `return_${period}` as const;
        const returns = inBucket
          .map((r) => r[returnKey] != null ? Number(r[returnKey]) : null)
          .filter((v): v is number => v != null);

        const alphaKey = `alpha_${period}` as const;
        const alphas = inBucket
          .map((r) => r[alphaKey] != null ? Number(r[alphaKey]) : null)
          .filter((v): v is number => v != null);

        if (returns.length === 0) continue;

        bucketRows.push({
          bucket: bucket.label,
          period,
          computed_date: today,
          num_stocks: returns.length,
          avg_return: returns.reduce((a, b) => a + b, 0) / returns.length,
          avg_alpha: alphas.length > 0 ? alphas.reduce((a, b) => a + b, 0) / alphas.length : null,
          win_rate: (returns.filter((r) => r > 0).length / returns.length) * 100,
        });
      }
    }

    if (bucketRows.length > 0) {
      await db.from('score_bucket_performance').delete().eq('computed_date', today);
      await db.from('score_bucket_performance').insert(bucketRows);
      console.log(`Score bucket performance: ${bucketRows.length} rows written`);
    }
  }

  // --- Print Summary ---
  console.log('\n=== Performance Summary ===\n');

  for (const [signalType, rows] of groups) {
    const r30 = rows.map((r) => r.return_30d != null ? Number(r.return_30d) : null).filter((v): v is number => v != null);
    const r60 = rows.map((r) => r.return_60d != null ? Number(r.return_60d) : null).filter((v): v is number => v != null);
    const r90 = rows.map((r) => r.return_90d != null ? Number(r.return_90d) : null).filter((v): v is number => v != null);
    if (r30.length === 0) continue;

    const avg = (arr: number[]) => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length * 100).toFixed(1) : ' N/A';
    const win = (arr: number[]) => arr.length > 0 ? ((arr.filter((r) => r > 0).length / arr.length) * 100).toFixed(0) : 'N/A';

    console.log(
      `  ${signalType.padEnd(25)} | ${String(r30.length).padStart(4)} sig` +
      ` | 30d: ${avg(r30).padStart(6)}% (${win(r30).padStart(2)}%W)` +
      ` | 60d: ${avg(r60).padStart(6)}%` +
      ` | 90d: ${avg(r90).padStart(6)}%`
    );
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
