'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ScoreBadge } from '@/components/ui/ScoreBadge';
import { formatFlow, formatPercent, SECTOR_COLUMN_EXPLANATIONS } from '@/lib/utils/format';
import type { SectorSignals } from '@/lib/utils/types';

type SortKey = keyof SectorSignals;

interface Props {
  initialData: SectorSignals[];
}

function fmtPct(val: number | null): string {
  if (val == null) return '—';
  return formatPercent(val);
}

function fmtPctRaw(val: number | null): string {
  if (val == null) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}

function flowColor(val: number | null): string {
  if (val == null) return 'text-text-tertiary';
  if (val > 0) return 'text-green';
  if (val < 0) return 'text-red';
  return 'text-text-secondary';
}

function returnColor(val: number | null): string {
  if (val == null) return 'text-text-tertiary';
  if (val > 0) return 'text-green';
  if (val < 0) return 'text-red';
  return 'text-text-secondary';
}

function RotationBadge({ signal }: { signal: SectorSignals['rotation_signal'] }) {
  if (signal === 'money_inflow') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-green/30 bg-green-bg text-green">
        Inflow
      </span>
    );
  }
  if (signal === 'money_outflow') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-red/30 bg-red-bg text-red">
        Outflow
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-border bg-bg-tertiary text-text-tertiary">
      Neutral
    </span>
  );
}

export function SectorsClient({ initialData }: Props) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('avg_sentinel_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...initialData].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return 0;
    });
  }, [initialData, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortHeader({ field, label, align }: { field: SortKey; label: string; align?: string }) {
    const explanation = SECTOR_COLUMN_EXPLANATIONS[field];
    return (
      <th
        className={`px-3 py-3 font-medium text-text-secondary whitespace-nowrap cursor-pointer select-none hover:text-text-primary transition-colors ${
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
        }`}
        onClick={() => handleSort(field)}
        title={explanation}
      >
        <span className={`inline-flex items-center gap-1 ${explanation ? 'border-b border-dotted border-text-tertiary/30' : ''}`}>
          {label}
          {sortKey === field && (
            <span className="text-green text-[10px]">{sortDir === 'desc' ? '▼' : '▲'}</span>
          )}
        </span>
      </th>
    );
  }

  if (initialData.length === 0) {
    return (
      <div className="bg-bg-secondary rounded-lg border border-border p-12 text-center">
        <p className="text-text-secondary text-sm">
          No sector data available yet. Run the pipeline to compute sector signals.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-bg-secondary text-xs">
          <tr>
            <th className="px-3 py-3 text-left text-text-tertiary w-8">#</th>
            <SortHeader field="sector" label="Sector" />
            <SortHeader field="avg_sentinel_score" label="Score" align="center" />
            <SortHeader field="avg_technical_score" label="Technical" align="right" />
            <SortHeader field="avg_return_1d" label="1D" align="right" />
            <SortHeader field="avg_return_5d" label="5D" align="right" />
            <SortHeader field="avg_return_30d" label="30D" align="right" />
            <SortHeader field="pct_above_sma50" label="> SMA50" align="right" />
            <SortHeader field="pct_above_sma200" label="> SMA200" align="right" />
            <SortHeader field="avg_volume_ratio" label="Vol Ratio" align="right" />
            <SortHeader field="net_insider_flow_30d" label="Insider Flow" align="right" />
            <SortHeader field="net_institutional_flow" label="Inst. Flow" align="right" />
            <SortHeader field="rotation_signal" label="Rotation" align="center" />
            <SortHeader field="stocks_above_75_score" label="> 75" align="right" />
            <SortHeader field="total_stocks" label="Stocks" align="right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((row, i) => (
            <tr
              key={row.sector}
              className="hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
              onClick={() => router.push(`/screener?sector=${encodeURIComponent(row.sector)}`)}
            >
              <td className="px-3 py-3 text-text-tertiary font-display text-xs">{i + 1}</td>
              <td className="px-3 py-3 font-medium text-text-primary whitespace-nowrap">
                {row.sector}
              </td>
              <td className="px-3 py-3 text-center">
                <ScoreBadge score={row.avg_sentinel_score != null ? Math.round(row.avg_sentinel_score) : null} size="sm" />
              </td>
              <td className="px-3 py-3 text-right font-display text-text-secondary">
                {row.avg_technical_score != null ? Math.round(row.avg_technical_score) : '—'}
              </td>
              <td className={`px-3 py-3 text-right font-display ${returnColor(row.avg_return_1d)}`}>
                {fmtPct(row.avg_return_1d)}
              </td>
              <td className={`px-3 py-3 text-right font-display ${returnColor(row.avg_return_5d)}`}>
                {fmtPct(row.avg_return_5d)}
              </td>
              <td className={`px-3 py-3 text-right font-display ${returnColor(row.avg_return_30d)}`}>
                {fmtPct(row.avg_return_30d)}
              </td>
              <td className="px-3 py-3 text-right font-display text-text-secondary">
                {fmtPctRaw(row.pct_above_sma50)}
              </td>
              <td className="px-3 py-3 text-right font-display text-text-secondary">
                {fmtPctRaw(row.pct_above_sma200)}
              </td>
              <td className={`px-3 py-3 text-right font-display ${
                (row.avg_volume_ratio ?? 0) >= 1.5 ? 'text-amber' : 'text-text-secondary'
              }`}>
                {row.avg_volume_ratio != null ? row.avg_volume_ratio.toFixed(2) : '—'}
              </td>
              <td className={`px-3 py-3 text-right font-display ${flowColor(row.net_insider_flow_30d)}`}>
                {formatFlow(row.net_insider_flow_30d)}
              </td>
              <td className={`px-3 py-3 text-right font-display ${flowColor(row.net_institutional_flow)}`}>
                {formatFlow(row.net_institutional_flow)}
              </td>
              <td className="px-3 py-3 text-center">
                <RotationBadge signal={row.rotation_signal} />
              </td>
              <td className="px-3 py-3 text-right font-display text-green">
                {row.stocks_above_75_score ?? 0}
              </td>
              <td className="px-3 py-3 text-right font-display text-text-secondary">
                {row.total_stocks ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
