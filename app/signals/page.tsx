import {
  computeSignalPerformance,
  getRecentSnapshots,
  getScoreBucketPerformance,
  getSignalPerformanceFromDB,
} from '@/lib/signals';
import { SignalsClient } from './SignalsClient';

export const dynamic = 'force-dynamic';

export default async function SignalsPage() {
  const [livePerformance, dbPerformance, recent, bucketPerf] = await Promise.all([
    computeSignalPerformance(),
    getSignalPerformanceFromDB(),
    getRecentSnapshots(50),
    getScoreBucketPerformance(),
  ]);

  // Prefer DB-stored backtest data; fall back to live computation
  const performance = dbPerformance.length > 0 ? dbPerformance : livePerformance;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Signal Performance</h1>
        <p className="text-text-secondary text-sm mt-1">
          Track how Sentinel signals perform over time — backed by historical data
        </p>
      </div>
      <SignalsClient
        performance={performance}
        recentSignals={recent}
        bucketPerformance={bucketPerf}
      />
    </div>
  );
}
