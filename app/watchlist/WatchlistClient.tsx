'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ScoreBadge } from '@/components/ui/ScoreBadge';
import { formatMarketCap, formatRelativeTime } from '@/lib/utils/format';

interface WatchlistItem {
  id: number;
  symbol: string;
  name: string;
  sector: string | null;
  market_cap: number | null;
  notes: string | null;
  target_price: number | null;
  added_at: string;
  sentinel_score: number | null;
  technical_score: number | null;
  fundamental_score: number | null;
  rank: number | null;
  score_change_1d: number | null;
}

interface Props {
  initialItems: WatchlistItem[];
}

export function WatchlistClient({ initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [addSymbol, setAddSymbol] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    const sym = addSymbol.trim().toUpperCase();
    if (!sym) return;
    setAdding(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym }),
      });
      if (res.ok) {
        setAddSymbol('');
        router.refresh();
      }
    } finally {
      setAdding(false);
    }
  }, [addSymbol, router]);

  const handleRemove = useCallback(async (symbol: string) => {
    setRemoving(symbol);
    try {
      const res = await fetch(`/api/watchlist?symbol=${symbol}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.symbol !== symbol));
      }
    } finally {
      setRemoving(null);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Add symbol */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Add symbol (e.g. AAPL)..."
          value={addSymbol}
          onChange={(e) => setAddSymbol(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary w-48 focus:outline-none focus:border-green/50"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !addSymbol.trim()}
          className="px-4 py-2 text-sm font-medium bg-green text-bg-primary rounded-lg hover:bg-green/90 transition-colors disabled:opacity-40"
        >
          {adding ? 'Adding...' : 'Add'}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-text-tertiary text-lg">Your watchlist is empty</p>
          <p className="text-text-tertiary text-sm mt-2">Add symbols above to start tracking stocks</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-secondary">
                <th className="px-4 py-3 text-left text-text-secondary font-medium">Symbol</th>
                <th className="px-4 py-3 text-left text-text-secondary font-medium">Name</th>
                <th className="px-4 py-3 text-left text-text-secondary font-medium">Sector</th>
                <th className="px-4 py-3 text-center text-text-secondary font-medium">Score</th>
                <th className="px-4 py-3 text-center text-text-secondary font-medium">Tech</th>
                <th className="px-4 py-3 text-center text-text-secondary font-medium">Fund</th>
                <th className="px-4 py-3 text-right text-text-secondary font-medium">Mkt Cap</th>
                <th className="px-4 py-3 text-right text-text-secondary font-medium">Added</th>
                <th className="px-4 py-3 text-center text-text-secondary font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.symbol}
                  className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/stock/${item.symbol}`)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-green">{item.symbol}</span>
                      {item.score_change_1d != null && item.score_change_1d !== 0 && (
                        <span className={`text-[10px] font-display ${item.score_change_1d > 0 ? 'text-green' : 'text-red'}`}>
                          {item.score_change_1d > 0 ? '+' : ''}{item.score_change_1d}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary truncate max-w-40">{item.name}</td>
                  <td className="px-4 py-2.5 text-text-tertiary text-xs">{item.sector ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center"><ScoreBadge score={item.sentinel_score} size="sm" /></td>
                  <td className="px-4 py-2.5 text-center"><ScoreBadge score={item.technical_score} size="sm" /></td>
                  <td className="px-4 py-2.5 text-center"><ScoreBadge score={item.fundamental_score} size="sm" /></td>
                  <td className="px-4 py-2.5 text-right text-text-secondary text-xs font-display">
                    {item.market_cap ? formatMarketCap(item.market_cap) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-text-tertiary text-xs">
                    {formatRelativeTime(item.added_at)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(item.symbol);
                      }}
                      disabled={removing === item.symbol}
                      className="text-text-tertiary hover:text-red transition-colors text-lg leading-none"
                      title="Remove from watchlist"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
