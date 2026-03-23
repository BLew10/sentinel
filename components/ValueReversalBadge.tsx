'use client';

import type { ValueReversalResult } from '@/lib/utils/types';

interface ConditionDisplay {
  key: string;
  label: string;
  met: boolean;
  detail: string;
}

function buildConditions(vr: ValueReversalResult): ConditionDisplay[] {
  const d = vr.details;

  const pctStr = d.deep_pullback.pct_from_high != null
    ? `${Math.abs(Math.round(d.deep_pullback.pct_from_high * 100))}% from high`
    : 'N/A';

  const buyerStr = d.insider_cluster_buy.buyers.length > 0
    ? `${d.insider_cluster_buy.buyers.length} insiders, $${(d.insider_cluster_buy.total_value / 1000).toFixed(0)}K`
    : 'No cluster';

  const firstBuyStr = d.first_buy_12mo.insider ?? 'None';

  const macdStr = d.macd_shift.current_histogram != null
    ? `Histogram ${d.macd_shift.current_histogram.toFixed(2)}`
    : 'N/A';

  const fcfStr = d.fcf_yield.yield_pct != null
    ? `${(d.fcf_yield.yield_pct * 100).toFixed(1)}%`
    : 'N/A';

  const peStr = d.pe_compression.forward_pe != null && d.pe_compression.current_pe != null
    ? `${d.pe_compression.forward_pe.toFixed(1)}x fwd vs ${d.pe_compression.current_pe.toFixed(1)}x trailing`
    : 'N/A';

  return [
    { key: 'deep_pullback', label: 'Deep Pullback', met: d.deep_pullback.met, detail: pctStr },
    { key: 'insider_cluster', label: 'Insider Cluster Buy', met: d.insider_cluster_buy.met, detail: buyerStr },
    { key: 'first_buy', label: 'First Buy in 12+ Months', met: d.first_buy_12mo.met, detail: firstBuyStr },
    { key: 'macd_shift', label: 'MACD Momentum Shift', met: d.macd_shift.met, detail: macdStr },
    { key: 'fcf_yield', label: 'Strong FCF Yield', met: d.fcf_yield.met, detail: fcfStr },
    { key: 'pe_compression', label: 'P/E Compression', met: d.pe_compression.met, detail: peStr },
  ];
}

export function ValueReversalBadge({ data }: { data: ValueReversalResult }) {
  if (!data.fired) return null;

  const conditions = buildConditions(data);

  return (
    <div className="rounded-lg border border-purple/30 bg-purple-bg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-purple text-lg">&#x1F504;</span>
          <span className="text-purple font-display font-bold text-sm tracking-wide uppercase">
            Value Reversal Candidate
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-xs">
            {data.conditions_met}/6 conditions
          </span>
          <span className="text-purple font-display font-bold text-lg">
            {data.conviction}
          </span>
          <span className="text-text-tertiary text-xs">/100</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {conditions.map((c) => (
          <div
            key={c.key}
            className="flex items-center gap-2 text-xs"
          >
            <span className={c.met ? 'text-green' : 'text-red'}>
              {c.met ? '\u2705' : '\u274C'}
            </span>
            <span className="text-text-primary">{c.label}</span>
            <span className="text-text-tertiary ml-auto font-mono text-[10px]">
              {c.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
