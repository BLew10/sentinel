'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatRelativeTime, formatCurrency } from '@/lib/utils/format';

export type ActivityCategory = 'insider' | 'filing' | 'institutional';

export interface ActivityItem {
  id: string;
  date: string;
  category: ActivityCategory;
  symbol: string;
  headline: string;
  detail: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

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

export function buildActivityItems(
  insiderTrades: Array<{
    symbol: string;
    insider_name: string;
    insider_title: string | null;
    transaction_date: string;
    transaction_type: string;
    shares: number;
    price_per_share: number | null;
    transaction_value: number | null;
  }>,
  filings: Array<{
    ticker: string;
    filing_type: string;
    filing_date: string;
  }>,
  institutionalChanges: Array<{
    symbol: string;
    institution_name: string;
    change_shares: number | null;
    change_pct: number | null;
    value: number | null;
    filing_date: string | null;
  }>,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const t of insiderTrades) {
    const isBuy = t.transaction_type.toLowerCase().includes('buy') || t.transaction_type.toLowerCase().includes('purchase');
    const valueStr = t.transaction_value ? ` (${formatCurrency(t.transaction_value, { compact: true })})` : '';
    items.push({
      id: `ins-${t.symbol}-${t.transaction_date}-${t.insider_name}`,
      date: t.transaction_date,
      category: 'insider',
      symbol: t.symbol,
      headline: isBuy ? 'Buy' : 'Sale',
      detail: `${t.insider_name}${t.insider_title ? ` (${t.insider_title})` : ''} — ${t.transaction_type} ${t.shares.toLocaleString()} shares${valueStr}`,
      sentiment: isBuy ? 'bullish' : 'bearish',
    });
  }

  for (const f of filings) {
    const bearishTypes = ['S-3', 'S-1', 'SC 13D/A'];
    const isBearish = bearishTypes.some((bt) => f.filing_type.includes(bt));
    items.push({
      id: `fil-${f.ticker}-${f.filing_date}-${f.filing_type}`,
      date: f.filing_date,
      category: 'filing',
      symbol: f.ticker,
      headline: f.filing_type,
      detail: `SEC ${f.filing_type} filed`,
      sentiment: isBearish ? 'bearish' : 'neutral',
    });
  }

  for (const h of institutionalChanges) {
    if (!h.filing_date) continue;
    const isIncrease = (h.change_shares ?? 0) > 0;
    const pctStr = h.change_pct != null ? ` (${h.change_pct > 0 ? '+' : ''}${(h.change_pct * 100).toFixed(1)}%)` : '';
    const valStr = h.value ? ` · ${formatCurrency(h.value, { compact: true })}` : '';
    items.push({
      id: `inst-${h.symbol}-${h.filing_date}-${h.institution_name}`,
      date: h.filing_date,
      category: 'institutional',
      symbol: h.symbol,
      headline: isIncrease ? 'Increased' : 'Decreased',
      detail: `${h.institution_name}${pctStr}${valStr}`,
      sentiment: isIncrease ? 'bullish' : 'bearish',
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items.slice(0, 20);
}
