'use client';

import { useState, useCallback } from 'react';
import { formatRelativeTime } from '@/lib/utils/format';

interface PipelineStepError {
  symbol?: string;
  message: string;
}

interface PipelineStep {
  step: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error' | 'skipped';
  stats: Record<string, number>;
  errors: PipelineStepError[];
}

interface PipelineRun {
  run_id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  steps: PipelineStep[];
  error_count: number;
}

interface Freshness {
  latestPriceDate: string | null;
  latestScoreUpdate: string | null;
  activeStocks: number;
}

interface AdminData {
  runs: PipelineRun[];
  freshness: Freshness;
}

const STATUS_ICON: Record<string, string> = {
  success: '●',
  error: '●',
  running: '◌',
  skipped: '○',
};

const STATUS_COLOR: Record<string, string> = {
  success: 'text-green',
  error: 'text-red',
  running: 'text-amber',
  skipped: 'text-text-tertiary',
};

function elapsed(start: string, end: string | null): string {
  if (!end) return 'running…';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const authenticate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Request failed' }));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const json = (await res.json()) as AdminData;
      setData(json);
      if (json.runs.length > 0) {
        setExpandedRun(json.runs[0].run_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [password]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [password]);

  if (!data) {
    return (
      <div className="max-w-md mx-auto mt-32">
        <div className="bg-bg-secondary border border-border rounded-lg p-8">
          <h1 className="font-display font-bold text-lg mb-1">System Admin</h1>
          <p className="text-text-tertiary text-sm mb-6">Enter the admin password to continue</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              authenticate();
            }}
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-green/50 transition-colors"
              autoFocus
            />
            {error && <p className="text-red text-xs mt-2">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full mt-4 bg-green/10 border border-green/30 text-green font-medium text-sm rounded-lg px-4 py-2.5 hover:bg-green/20 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {loading ? 'Authenticating…' : 'Access Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { runs, freshness } = data;
  const lastRun = runs[0] ?? null;
  const recentErrors = runs
    .flatMap((r) =>
      r.steps.flatMap((s) =>
        s.errors.map((e) => ({
          runId: r.run_id,
          step: s.step,
          date: r.started_at,
          ...e,
        })),
      ),
    )
    .slice(0, 30);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">System Admin</h1>
          <p className="text-text-secondary text-sm mt-1">Pipeline status, data freshness, and error logs</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-xs bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-text-secondary hover:text-text-primary hover:border-border/80 transition-colors disabled:opacity-40 cursor-pointer"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatusCard
          label="Last Pipeline Run"
          value={lastRun ? formatRelativeTime(lastRun.started_at) : 'Never'}
          sub={lastRun ? new Date(lastRun.started_at).toLocaleString() : undefined}
          status={lastRun?.status}
        />
        <StatusCard
          label="Latest Price Data"
          value={freshness.latestPriceDate ?? 'None'}
          sub={freshness.latestPriceDate ? staleness(freshness.latestPriceDate) : undefined}
          status={freshness.latestPriceDate ? (isFresh(freshness.latestPriceDate, 3) ? 'success' : 'error') : undefined}
        />
        <StatusCard
          label="Latest Score Update"
          value={freshness.latestScoreUpdate ? formatRelativeTime(freshness.latestScoreUpdate) : 'None'}
          sub={freshness.latestScoreUpdate ? new Date(freshness.latestScoreUpdate).toLocaleString() : undefined}
          status={freshness.latestScoreUpdate ? (isFresh(freshness.latestScoreUpdate, 2) ? 'success' : 'error') : undefined}
        />
        <StatusCard
          label="Active Stocks"
          value={freshness.activeStocks.toLocaleString()}
          sub="In universe"
        />
      </div>

      {/* Pipeline Run History */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-3">Pipeline Runs</h2>
        <div className="space-y-2">
          {runs.map((run) => {
            const isExpanded = expandedRun === run.run_id;
            return (
              <div key={run.run_id} className="bg-bg-secondary rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setExpandedRun(isExpanded ? null : run.run_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
                >
                  <span className={`text-xs ${STATUS_COLOR[run.status]}`}>{STATUS_ICON[run.status]}</span>
                  <span className="font-display text-sm font-medium text-text-primary flex-1">
                    {new Date(run.started_at).toLocaleString()}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary border border-border text-text-tertiary">
                    {run.source}
                  </span>
                  <span className="text-text-tertiary text-xs font-display">
                    {elapsed(run.started_at, run.finished_at)}
                  </span>
                  {run.error_count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red/10 border border-red/20 text-red font-bold">
                      {run.error_count} err
                    </span>
                  )}
                  <span className={`text-text-tertiary text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▸</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-2">
                    {run.steps.map((step, i) => (
                      <StepDetail key={`${run.run_id}-${step.step}-${i}`} step={step} />
                    ))}
                    {run.steps.length === 0 && (
                      <p className="text-text-tertiary text-sm">No steps recorded</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {runs.length === 0 && (
            <p className="text-text-tertiary text-sm py-6 text-center">No pipeline runs recorded yet</p>
          )}
        </div>
      </div>

      {/* Error Log */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-1">Recent Errors</h2>
        <p className="text-text-tertiary text-xs mb-3">Across last {runs.length} pipeline runs</p>
        {recentErrors.length === 0 ? (
          <div className="bg-bg-secondary rounded-lg border border-border p-5 text-center">
            <p className="text-green text-sm font-medium">No errors — all clear</p>
          </div>
        ) : (
          <div className="bg-bg-secondary rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-tertiary text-[10px] uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">Step</th>
                  <th className="text-left px-4 py-2 font-medium">Symbol</th>
                  <th className="text-left px-4 py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {recentErrors.map((err, i) => (
                  <tr key={`err-${i}`} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 text-text-tertiary text-xs font-display whitespace-nowrap">
                      {formatRelativeTime(err.date)}
                    </td>
                    <td className="px-4 py-2 text-text-secondary text-xs">{err.step}</td>
                    <td className="px-4 py-2 font-display text-xs text-amber">{err.symbol ?? '—'}</td>
                    <td className="px-4 py-2 text-red text-xs truncate max-w-[300px]">{err.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({ label, value, sub, status }: {
  label: string;
  value: string;
  sub?: string;
  status?: string;
}) {
  const borderClass = status === 'error'
    ? 'border-red/30 bg-red/5'
    : status === 'success'
    ? 'border-green/30 bg-green-bg'
    : 'border-border bg-bg-secondary';

  return (
    <div className={`rounded-lg border p-5 ${borderClass}`}>
      <p className="text-text-tertiary text-xs uppercase tracking-wider">{label}</p>
      <p className="text-lg font-display font-bold mt-2">{value}</p>
      {sub && <p className="text-xs text-text-tertiary mt-1">{sub}</p>}
    </div>
  );
}

function StepDetail({ step }: { step: PipelineStep }) {
  const statsEntries = Object.entries(step.stats);

  return (
    <div className="pl-4 border-l-2 border-border">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] ${STATUS_COLOR[step.status]}`}>{STATUS_ICON[step.status]}</span>
        <span className="text-sm font-medium text-text-primary">{step.step.replace(/_/g, ' ')}</span>
        <span className="text-text-tertiary text-xs font-display ml-auto">
          {elapsed(step.started_at, step.finished_at)}
        </span>
      </div>
      {statsEntries.length > 0 && (
        <div className="flex flex-wrap gap-3 text-[11px] text-text-secondary mt-1">
          {statsEntries.map(([key, val]) => (
            <span key={key}>
              <span className="text-text-tertiary">{key.replace(/_/g, ' ')}:</span>{' '}
              <span className="font-display">{val.toLocaleString()}</span>
            </span>
          ))}
        </div>
      )}
      {step.errors.length > 0 && (
        <div className="mt-2 space-y-1">
          {step.errors.slice(0, 5).map((err, i) => (
            <p key={`${step.step}-err-${i}`} className="text-[11px] text-red">
              {err.symbol && <span className="text-amber font-display mr-1">{err.symbol}</span>}
              {err.message}
            </p>
          ))}
          {step.errors.length > 5 && (
            <p className="text-[10px] text-text-tertiary">… and {step.errors.length - 5} more</p>
          )}
        </div>
      )}
    </div>
  );
}

function isFresh(dateStr: string, maxDaysOld: number): boolean {
  const d = new Date(dateStr);
  const diffDays = (Date.now() - d.getTime()) / 86_400_000;
  return diffDays <= maxDaysOld;
}

function staleness(dateStr: string): string {
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day old';
  return `${diffDays} days old`;
}
