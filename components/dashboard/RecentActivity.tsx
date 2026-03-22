'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils/format';
import type { ActivityCategory, ActivityItem } from './activity-utils';

export type { ActivityCategory, ActivityItem };

const CATEGORY_META: Record<ActivityCategory, { label: string; icon: string; color: string }> = {
  insider:        { label: 'Insider',       icon: '👤', color: 'text-green' },
  filing:         { label: 'SEC Filing',    icon: '📄', color: 'text-purple' },
  institutional:  { label: 'Institutional', icon: '🏦', color: 'text-cyan' },
};

const ALL_CATS: ActivityCategory[] = ['insider', 'filing', 'institutional'];

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  const [filter, setFilter] = useState<ActivityCategory | 'all'>('all');

  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-display font-semibold">Recent Activity</h2>
          <p className="text-text-tertiary text-xs mt-0.5">
            Latest insider trades, SEC filings, and institutional moves across the universe
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
        {ALL_CATS.map((cat) => (
          <FilterChip
            key={cat}
            active={filter === cat}
            onClick={() => setFilter(cat)}
            label={`${CATEGORY_META[cat].icon} ${CATEGORY_META[cat].label}`}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-text-tertiary text-sm py-6 text-center">No recent activity recorded</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((item) => {
            const meta = CATEGORY_META[item.category];
            return (
              <Link
                key={item.id}
                href={`/stock/${item.symbol}`}
                className="flex items-start gap-3 bg-bg-secondary rounded-lg border border-border px-4 py-3 hover:border-green/30 transition-colors group"
              >
                <span className="text-sm mt-0.5 shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-display font-semibold text-green text-sm group-hover:text-green/80 transition-colors">
                      {item.symbol}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      item.sentiment === 'bullish'
                        ? 'border-green/20 bg-green-bg text-green'
                        : item.sentiment === 'bearish'
                        ? 'border-red/20 bg-red-bg text-red'
                        : 'border-border bg-bg-tertiary text-text-tertiary'
                    }`}>
                      {item.headline}
                    </span>
                  </div>
                  <p className="text-text-secondary text-[11px] leading-snug truncate">{item.detail}</p>
                </div>
                <span className="text-[10px] text-text-tertiary shrink-0 mt-1">{formatRelativeTime(item.date)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${
        active
          ? 'border-green/40 bg-green-bg text-green font-medium'
          : 'border-border bg-bg-secondary text-text-tertiary hover:text-text-secondary hover:border-border/80'
      }`}
    >
      {label}
    </button>
  );
}

export { buildActivityItems } from './activity-utils';
