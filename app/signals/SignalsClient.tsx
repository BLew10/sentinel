'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SignalPerfRow, BucketPerfRow } from '@/lib/signals';

interface RecentSignal {
  symbol: string;
  trigger_type: string;
  trigger_detail: string | null;
  snapshot_date: string;
  price_at_signal: number;
  sentinel_score: number | null;
  return_7d: number | null;
  return_30d: number | null;
}

interface Props {
  performance: SignalPerfRow[];
  recentSignals: RecentSignal[];
  bucketPerformance: BucketPerfRow[];
}

const SIGNAL_LABELS: Record<string, string> = {
  score_threshold: 'Score Spike (75+)',
  score_drop: 'Score Drop',
  insider_cluster_buy: 'Insider Cluster Buy',
  insider_ceo_buy: 'CEO Buy',
  triple_confirmation: 'Triple Confirmation',
  golden_cross: 'Golden Cross',
  stage2_breakout: 'Stage 2 Breakout',
  rsi_oversold_bounce: 'RSI Oversold Bounce',
  volume_breakout: 'Volume Breakout',
  macd_bullish_cross: 'MACD Bullish Cross',
};

const BUCKET_ORDER = ['0-30', '30-50', '50-65', '65-75', '75-100'];

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function returnColor(v: number | null): string {
  if (v == null) return 'text-text-tertiary';
  return v > 0 ? 'text-green' : v < 0 ? 'text-red' : 'text-text-secondary';
}

type Tab = 'performance' | 'buckets' | 'recent';

export function SignalsClient({ performance, recentSignals, bucketPerformance }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('performance');

  const bucket30d = bucketPerformance
    .filter((b) => b.period === '30d')
    .sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket));

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-bg-secondary rounded-lg p-1 w-fit">
        {([
          { key: 'performance' as Tab, label: 'By Signal Type' },
          { key: 'buckets' as Tab, label: 'By Score Bucket' },
          { key: 'recent' as Tab, label: 'Recent Signals' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === t.key
                ? 'bg-bg-tertiary text-text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'performance' && (
        performance.length === 0 ? (
          <EmptyState
            title="No signal performance data yet"
            sub="Run: npm run backtest → npm run backfill:returns → npm run perf"
          />
        ) : (
          <div className="space-y-4">
            <p className="text-text-tertiary text-xs">
              30-day forward return performance for each signal type, based on historical backtesting.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary">
                    <th className="px-4 py-3 text-left text-text-secondary font-medium">Signal Type</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium">Count</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium cursor-help" title="% of signals with a positive 30-day return (stock went up)">Win Rate</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium cursor-help" title="Average raw 30-day return of the stock after the signal fired">Avg Return</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium cursor-help" title="Average 30-day return vs. SPY — positive alpha means the signal beat the market">Avg Alpha</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium cursor-help" title="Best single 30-day return from this signal type">Best</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium cursor-help" title="Worst single 30-day return from this signal type">Worst</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map((row) => (
                    <tr key={row.signal_type} className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">
                        {SIGNAL_LABELS[row.signal_type] ?? row.signal_type}
                      </td>
                      <td className="px-4 py-2.5 text-center text-text-secondary font-display">{row.total_signals}</td>
                      <td className="px-4 py-2.5 text-center">
                        {row.win_rate_30d != null ? (
                          <span className={row.win_rate_30d >= 0.5 ? 'text-green' : 'text-red'}>
                            {(row.win_rate_30d * 100).toFixed(0)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-center font-display ${returnColor(row.avg_return_30d)}`}>
                        {fmtPct(row.avg_return_30d)}
                      </td>
                      <td className={`px-4 py-2.5 text-center font-display ${returnColor(row.avg_alpha_30d)}`}>
                        {fmtPct(row.avg_alpha_30d)}
                      </td>
                      <td className={`px-4 py-2.5 text-center font-display ${returnColor(row.best_return)}`}>
                        {fmtPct(row.best_return)}
                      </td>
                      <td className={`px-4 py-2.5 text-center font-display ${returnColor(row.worst_return)}`}>
                        {fmtPct(row.worst_return)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-text-tertiary text-[11px]">
              Win Rate = % of signals where the stock had a positive 30-day return.
              Alpha = stock return minus SPY return over the same period — positive alpha means the signal outperformed the market.
            </p>
          </div>
        )
      )}

      {tab === 'buckets' && (
        bucket30d.length === 0 ? (
          <EmptyState
            title="No score bucket performance data yet"
            sub="Run: npm run backtest → npm run backfill:returns → npm run perf"
          />
        ) : (
          <div className="space-y-4">
            <p className="text-text-tertiary text-xs">
              Does a higher Sentinel Score predict better 30-day returns? This table groups historical signals by score range.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary">
                    <th className="px-4 py-3 text-left text-text-secondary font-medium">Score Bucket</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium">Signals</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium cursor-help" title="Average raw 30-day stock return after the signal">Avg 30D Return</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium cursor-help" title="Average 30-day return vs. SPY — positive means the signal beat the market">Avg 30D Alpha</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium cursor-help" title="% of signals with a positive 30-day return (stock went up)">Win Rate</th>
                    <th className="px-4 py-3 text-center text-text-secondary font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {bucket30d.map((row) => {
                    const verdict = row.avg_alpha != null
                      ? row.avg_alpha > 0.02 ? 'Strong Alpha'
                      : row.avg_alpha > 0 ? 'Slight Alpha'
                      : 'No Edge'
                      : '—';
                    const verdictClass = row.avg_alpha != null
                      ? row.avg_alpha > 0.02 ? 'text-green'
                      : row.avg_alpha > 0 ? 'text-amber'
                      : 'text-red'
                      : 'text-text-tertiary';

                    return (
                      <tr key={row.bucket} className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors">
                        <td className="px-4 py-3 font-display font-semibold">{row.bucket}</td>
                        <td className="px-4 py-3 text-center text-text-secondary font-display">{row.num_stocks}</td>
                        <td className={`px-4 py-3 text-center font-display ${returnColor(row.avg_return)}`}>
                          {fmtPct(row.avg_return)}
                        </td>
                        <td className={`px-4 py-3 text-center font-display ${returnColor(row.avg_alpha)}`}>
                          {fmtPct(row.avg_alpha)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.win_rate != null ? (
                            <span className={row.win_rate >= 50 ? 'text-green' : 'text-red'}>
                              {row.win_rate.toFixed(0)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-center text-xs font-medium ${verdictClass}`}>
                          {verdict}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-text-tertiary text-[11px]">
              Alpha = stock return minus SPY return over the same period.
              If high-score buckets show consistently higher alpha, the scoring model has predictive power.
            </p>
          </div>
        )
      )}

      {tab === 'recent' && (
        recentSignals.length === 0 ? (
          <EmptyState
            title="No signals recorded yet"
            sub="Run the backtest or alert scan to start capturing signal snapshots"
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-secondary">
                  <th className="px-4 py-3 text-left text-text-secondary font-medium">Symbol</th>
                  <th className="px-4 py-3 text-left text-text-secondary font-medium">Signal</th>
                  <th className="px-4 py-3 text-center text-text-secondary font-medium">Date</th>
                  <th className="px-4 py-3 text-right text-text-secondary font-medium">Price</th>
                  <th className="px-4 py-3 text-center text-text-secondary font-medium">Score</th>
                  <th className="px-4 py-3 text-center text-text-secondary font-medium">7D Return</th>
                  <th className="px-4 py-3 text-center text-text-secondary font-medium">30D Return</th>
                </tr>
              </thead>
              <tbody>
                {recentSignals.map((s, i) => (
                  <tr
                    key={`${s.symbol}-${s.snapshot_date}-${i}`}
                    className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/stock/${s.symbol}`)}
                  >
                    <td className="px-4 py-2.5 font-display font-semibold text-green">{s.symbol}</td>
                    <td className="px-4 py-2.5 text-text-secondary text-xs">
                      {SIGNAL_LABELS[s.trigger_type] ?? s.trigger_type}
                    </td>
                    <td className="px-4 py-2.5 text-center text-text-tertiary text-xs">{s.snapshot_date}</td>
                    <td className="px-4 py-2.5 text-right font-display">${Number(s.price_at_signal).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-center font-display">{s.sentinel_score ?? '—'}</td>
                    <td className={`px-4 py-2.5 text-center font-display ${returnColor(s.return_7d ? Number(s.return_7d) : null)}`}>
                      {s.return_7d != null ? fmtPct(Number(s.return_7d)) : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-center font-display ${returnColor(s.return_30d ? Number(s.return_30d) : null)}`}>
                      {s.return_30d != null ? fmtPct(Number(s.return_30d)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-text-tertiary text-lg">{title}</p>
      <p className="text-text-tertiary text-sm mt-2 font-mono">{sub}</p>
    </div>
  );
}
