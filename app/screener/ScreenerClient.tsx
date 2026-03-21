'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ScoreBadge } from '@/components/ui/ScoreBadge';
import { FilterModal } from '@/components/screener/FilterModal';
import { formatMarketCap, formatPercent, generateSignalSummary, scoreVerdict, verdictColor, COLUMN_EXPLANATIONS, detectDivergences } from '@/lib/utils/format';
import { SCREENER_PRESETS, PRESET_TO_SIGNAL_TYPE, SIGNAL_TYPE_LABELS } from '@/lib/utils/constants';
import type { ScreenerFilters, ActiveSignal, SignalPerformanceStats } from '@/lib/utils/types';

interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string | null;
  market_cap: number | null;
  sentinel_score: number | null;
  technical_score: number | null;
  fundamental_score: number | null;
  earnings_ai_score: number | null;
  insider_score: number | null;
  institutional_score: number | null;
  options_flow_score: number | null;
  rank: number | null;
  percentile: number | null;
  rsi_14: number | null;
  price_vs_sma50: number | null;
  price_vs_sma200: number | null;
  pct_from_52w_high: number | null;
  pct_from_52w_low: number | null;
  volume_ratio_50d: number | null;
  rs_rank_3m: number | null;
  rs_rank_6m: number | null;
  sma_50: number | null;
  sma_150: number | null;
  sma_200: number | null;
  pe_ratio: number | null;
  revenue_growth_yoy: number | null;
  earnings_growth_yoy: number | null;
  revenue_growth_qoq: number | null;
  earnings_growth_qoq: number | null;
  num_buyers_30d: number | null;
  num_sellers_30d: number | null;
  net_buy_value_30d: number | null;
  active_signals: ActiveSignal[];
}

interface Props {
  initialData: ScreenerRow[];
  sectors: string[];
  signalPerformance: Record<string, SignalPerformanceStats>;
}

type SortKey = keyof Omit<ScreenerRow, 'active_signals'> | 'best_signal_win_rate';
const PAGE_SIZES = [25, 50, 100] as const;

function fmtPct(val: number | null): string {
  if (val == null) return '—';
  return formatPercent(val);
}

function fmtNum(val: number | null, decimals = 1): string {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

function getBestSignalWinRate(
  signals: ActiveSignal[],
  perfMap: Record<string, SignalPerformanceStats>,
): number | null {
  if (signals.length === 0) return null;
  let best: number | null = null;
  for (const s of signals) {
    const perf = perfMap[s.trigger_type];
    if (perf && (best === null || perf.win_rate > best)) {
      best = perf.win_rate;
    }
  }
  return best;
}

function matchesFilters(
  row: ScreenerRow,
  filters: ScreenerFilters,
  perfMap: Record<string, SignalPerformanceStats>,
): boolean {
  // Score filters
  if (filters.sentinel_score_min != null && (row.sentinel_score ?? 0) < filters.sentinel_score_min) return false;
  if (filters.insider_score_min != null && (row.insider_score ?? 0) < filters.insider_score_min) return false;
  if (filters.institutional_score_min != null && (row.institutional_score ?? 0) < filters.institutional_score_min) return false;
  if (filters.earnings_ai_conviction_min != null && (row.earnings_ai_score ?? 0) < filters.earnings_ai_conviction_min) return false;
  if (filters.options_flow_score_min != null && (row.options_flow_score ?? 50) < filters.options_flow_score_min) return false;

  // Insider activity filters
  if (filters.insider_buyers_30d_min != null && (row.num_buyers_30d ?? 0) < filters.insider_buyers_30d_min) return false;
  if (filters.insider_net_buy_positive && (row.net_buy_value_30d == null || row.net_buy_value_30d <= 0)) return false;

  // Trend filters
  if (filters.price_above_sma50 && (row.price_vs_sma50 == null || row.price_vs_sma50 < 0)) return false;
  if (filters.price_above_sma200 && (row.price_vs_sma200 == null || row.price_vs_sma200 < 0)) return false;
  if (filters.price_above_sma150) {
    if (row.sma_150 == null || row.sma_50 == null) return false;
    if (row.price_vs_sma50 == null || row.price_vs_sma50 < 0) return false;
    if (row.sma_50 <= row.sma_150) return false;
  }

  // SMA alignment filters
  if (filters.sma50_above_sma150 && (row.sma_50 == null || row.sma_150 == null || row.sma_50 <= row.sma_150)) return false;
  if (filters.sma150_above_sma200 && (row.sma_150 == null || row.sma_200 == null || row.sma_150 <= row.sma_200)) return false;
  if (filters.sma200_trending_up_1mo) {
    if (row.price_vs_sma200 == null || row.price_vs_sma200 < 0) return false;
    if (row.sma_150 != null && row.sma_200 != null && row.sma_150 < row.sma_200) return false;
  }

  // 52-week range filters
  if (filters.within_10pct_of_52w_high && (row.pct_from_52w_high == null || row.pct_from_52w_high < -0.1)) return false;
  if (filters.within_25pct_of_52w_high && (row.pct_from_52w_high == null || row.pct_from_52w_high < -0.25)) return false;
  if (filters.above_30pct_from_52w_low && (row.pct_from_52w_low == null || row.pct_from_52w_low < 0.3)) return false;

  // Relative strength & volume
  if (filters.rs_rank_3m_min != null && row.rs_rank_3m != null && row.rs_rank_3m < filters.rs_rank_3m_min) return false;
  if (filters.rs_rank_6m_min != null && row.rs_rank_6m != null && row.rs_rank_6m < filters.rs_rank_6m_min) return false;
  if (filters.volume_ratio_50d_min != null && row.volume_ratio_50d != null && row.volume_ratio_50d < filters.volume_ratio_50d_min) return false;

  // Growth filters
  if (filters.revenue_growth_yoy_min != null && row.revenue_growth_yoy != null && row.revenue_growth_yoy < filters.revenue_growth_yoy_min) return false;
  if (filters.earnings_growth_yoy_min != null && row.earnings_growth_yoy != null && row.earnings_growth_yoy < filters.earnings_growth_yoy_min) return false;
  if (filters.revenue_growth_qoq_min != null && row.revenue_growth_qoq != null && row.revenue_growth_qoq < filters.revenue_growth_qoq_min) return false;
  if (filters.earnings_growth_qoq_min != null && row.earnings_growth_qoq != null && row.earnings_growth_qoq < filters.earnings_growth_qoq_min) return false;

  // Universe filters
  if (filters.sectors && filters.sectors.length > 0 && !filters.sectors.includes(row.sector ?? '')) return false;
  if (filters.market_cap_min != null && (row.market_cap ?? 0) < filters.market_cap_min) return false;
  if (filters.market_cap_max != null && (row.market_cap ?? Infinity) > filters.market_cap_max) return false;

  // Signal performance filters
  if (filters.has_active_signal && row.active_signals.length === 0) return false;
  if (filters.min_signal_win_rate != null) {
    const best = getBestSignalWinRate(row.active_signals, perfMap);
    if (best === null || best < filters.min_signal_win_rate) return false;
  }

  return true;
}

function SignalChip({ triggerType, perf }: {
  triggerType: string;
  perf: SignalPerformanceStats | undefined;
}) {
  const label = SIGNAL_TYPE_LABELS[triggerType] ?? triggerType;
  const winRate = perf?.win_rate;
  const hasEdge = winRate != null && winRate >= 50;
  const isStrong = winRate != null && winRate >= 60;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border whitespace-nowrap ${
        isStrong
          ? 'border-green/30 bg-green-bg text-green'
          : hasEdge
          ? 'border-amber/30 bg-amber/5 text-amber'
          : 'border-border bg-bg-tertiary text-text-tertiary'
      }`}
      title={perf ? `${label}: ${winRate?.toFixed(0)}% win rate, ${(perf.avg_alpha * 100).toFixed(1)}% alpha (N=${perf.total_signals})` : label}
    >
      {label}
      {winRate != null && (
        <span className="font-display">{winRate.toFixed(0)}%</span>
      )}
    </span>
  );
}

export function ScreenerClient({ initialData, sectors, signalPerformance }: Props) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('sentinel_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ScreenerFilters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(50);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const hasSignalPerf = Object.keys(signalPerformance).length > 0;

  const activeFilterCount = Object.values(filters).filter((v) =>
    v !== undefined && v !== false && v !== 0 && !(Array.isArray(v) && v.length === 0)
  ).length;

  const presetLimit = activePreset ? SCREENER_PRESETS[activePreset]?.limit : undefined;

  const filtered = useMemo(() => {
    let rows = initialData;
    if (search) {
      const q = search.toUpperCase();
      rows = rows.filter((r) => r.symbol.toUpperCase().includes(q) || r.name.toUpperCase().includes(q));
    }
    if (activeFilterCount > 0) {
      rows = rows.filter((r) => matchesFilters(r, filters, signalPerformance));
    }
    if (presetLimit != null) {
      rows = rows.slice(0, presetLimit);
    }
    return rows;
  }, [initialData, search, filters, activeFilterCount, presetLimit, signalPerformance]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === 'best_signal_win_rate') {
        const aWr = getBestSignalWinRate(a.active_signals, signalPerformance);
        const bWr = getBestSignalWinRate(b.active_signals, signalPerformance);
        if (aWr == null && bWr == null) return 0;
        if (aWr == null) return 1;
        if (bWr == null) return -1;
        return sortDir === 'asc' ? aWr - bWr : bWr - aWr;
      }
      const av = a[sortKey as keyof ScreenerRow];
      const bv = b[sortKey as keyof ScreenerRow];
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
  }, [filtered, sortKey, sortDir, signalPerformance]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  }

  function applyPreset(presetKey: string) {
    const preset = SCREENER_PRESETS[presetKey];
    if (!preset) return;
    setFilters(preset.filters);
    if (preset.sort) {
      setSortKey(preset.sort.field as SortKey);
      setSortDir(preset.sort.direction);
    }
    setActivePreset(presetKey);
    setPage(0);
  }

  function getPresetPerf(presetKey: string): SignalPerformanceStats | undefined {
    const signalType = PRESET_TO_SIGNAL_TYPE[presetKey];
    if (!signalType) return undefined;
    return signalPerformance[signalType];
  }

  function SortHeader({ field, label, align }: { field: SortKey; label: string; align?: string }) {
    const explanation = field !== 'best_signal_win_rate' ? COLUMN_EXPLANATIONS[field] : 'Best historical win rate among active signals on this stock';
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

  const colSpan = 17;

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {Object.entries(SCREENER_PRESETS).map(([key, preset]) => {
            const perf = getPresetPerf(key);
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => isActive ? (setFilters({}), setActivePreset(null), setPage(0)) : applyPreset(key)}
                className={`group relative px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  isActive
                    ? 'border-green/50 bg-green-bg text-green'
                    : 'border-border text-text-tertiary hover:text-text-secondary hover:border-border/80'
                }`}
              >
                <span>{preset.name}</span>
                {perf && perf.total_signals >= 5 && (
                  <span className={`ml-1.5 font-display text-[10px] ${
                    perf.win_rate >= 60 ? 'text-green' : perf.win_rate >= 50 ? 'text-amber' : 'text-text-tertiary'
                  }`}>
                    {perf.win_rate.toFixed(0)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {activePreset && SCREENER_PRESETS[activePreset] && (
          <div className="text-xs text-text-tertiary px-1 space-y-0.5">
            <p>
              <span className="text-green font-medium">{SCREENER_PRESETS[activePreset].name}:</span>{' '}
              {SCREENER_PRESETS[activePreset].description}
              {presetLimit != null && <span className="text-text-tertiary/60"> · Limited to top {presetLimit}</span>}
            </p>
            {(() => {
              const perf = getPresetPerf(activePreset);
              if (!perf || perf.total_signals < 5) return null;
              return (
                <p className="flex items-center gap-3">
                  <span className="text-text-tertiary/60">Historical performance:</span>
                  <span>
                    Win rate: <span className={`font-display ${perf.win_rate >= 50 ? 'text-green' : 'text-red'}`}>{perf.win_rate.toFixed(0)}%</span>
                  </span>
                  <span>
                    Avg alpha: <span className={`font-display ${perf.avg_alpha > 0 ? 'text-green' : 'text-red'}`}>
                      {perf.avg_alpha > 0 ? '+' : ''}{(perf.avg_alpha * 100).toFixed(1)}%
                    </span>
                  </span>
                  <span>
                    Avg return: <span className={`font-display ${perf.avg_return > 0 ? 'text-green' : 'text-red'}`}>
                      {perf.avg_return > 0 ? '+' : ''}{(perf.avg_return * 100).toFixed(1)}%
                    </span>
                  </span>
                  <span className="text-text-tertiary/40">N={perf.total_signals}</span>
                </p>
              );
            })()}
          </div>
        )}
      </div>

      {/* Search + Filter Button */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search symbol or name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary w-64 focus:outline-none focus:border-green/50"
        />
        <button
          onClick={() => setFilterOpen(true)}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
            activeFilterCount > 0
              ? 'border-green/50 bg-green-bg text-green'
              : 'border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
        <span className="text-text-tertiary text-xs ml-auto">
          {sorted.length} results
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-secondary">
              <SortHeader field="rank" label="#" align="center" />
              <SortHeader field="symbol" label="Symbol" />
              <th className="px-3 py-3 text-left font-medium text-text-secondary">Name</th>
              <SortHeader field="sentinel_score" label="Score" align="center" />
              <th className="px-3 py-3 text-left font-medium text-text-secondary" title="AI-generated summary of the most important signals for this stock">
                <span className="border-b border-dotted border-text-tertiary/30">Signal Summary</span>
              </th>
              <SortHeader field="best_signal_win_rate" label="Signals" />
              <SortHeader field="sector" label="Sector" />
              <SortHeader field="technical_score" label="Tech" align="center" />
              <SortHeader field="fundamental_score" label="Fund" align="center" />
              <SortHeader field="rsi_14" label="RSI" align="right" />
              <SortHeader field="price_vs_sma50" label="vs SMA50" align="right" />
              <SortHeader field="pct_from_52w_high" label="vs 52wH" align="right" />
              <SortHeader field="volume_ratio_50d" label="Vol Ratio" align="right" />
              <SortHeader field="rs_rank_3m" label="RS Rank" align="right" />
              <SortHeader field="pe_ratio" label="PE" align="right" />
              <SortHeader field="revenue_growth_yoy" label="Rev YoY" align="right" />
              <SortHeader field="market_cap" label="Mkt Cap" align="right" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const verdict = scoreVerdict(row.sentinel_score);
              const signal = generateSignalSummary(row);
              const divs = detectDivergences(row);
              const uniqueSignals = row.active_signals.reduce<ActiveSignal[]>((acc, s) => {
                if (!acc.some((x) => x.trigger_type === s.trigger_type)) acc.push(s);
                return acc;
              }, []);
              return (
                <tr
                  key={row.symbol}
                  onClick={() => router.push(`/stock/${row.symbol}`)}
                  className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
                >
                  <td className="px-3 py-2.5 text-center text-text-tertiary font-display text-xs">{row.rank ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-display font-semibold text-green">{row.symbol}</span>
                  </td>
                  <td className="px-3 py-2.5 text-text-secondary truncate max-w-40">{row.name}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="inline-flex flex-col items-center gap-0.5">
                      <ScoreBadge score={row.sentinel_score} size="sm" />
                      <span className={`text-[9px] font-medium ${verdictColor(verdict)}`}>{verdict}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs max-w-56">
                    <span className={`leading-relaxed ${divs.length > 0 ? 'text-purple font-medium' : 'text-text-secondary'}`}>{signal}</span>
                    {divs.length > 0 && (
                      <span className="block text-[9px] text-purple/60 mt-0.5">{divs.length} leading {divs.length === 1 ? 'signal' : 'signals'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {uniqueSignals.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-36">
                        {uniqueSignals.slice(0, 3).map((s) => (
                          <SignalChip
                            key={s.trigger_type}
                            triggerType={s.trigger_type}
                            perf={signalPerformance[s.trigger_type]}
                          />
                        ))}
                        {uniqueSignals.length > 3 && (
                          <span className="text-[9px] text-text-tertiary">+{uniqueSignals.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-tertiary text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-text-tertiary text-xs">{row.sector ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center"><ScoreBadge score={row.technical_score} size="sm" /></td>
                  <td className="px-3 py-2.5 text-center"><ScoreBadge score={row.fundamental_score} size="sm" /></td>
                  <td className="px-3 py-2.5 text-right font-display text-xs">{fmtNum(row.rsi_14)}</td>
                  <td className="px-3 py-2.5 text-right font-display text-xs">
                    <span className={row.price_vs_sma50 != null ? (row.price_vs_sma50 > 0 ? 'text-green' : 'text-red') : 'text-text-tertiary'}>
                      {fmtPct(row.price_vs_sma50)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-display text-xs">{fmtPct(row.pct_from_52w_high)}</td>
                  <td className="px-3 py-2.5 text-right font-display text-xs">{fmtNum(row.volume_ratio_50d, 2)}</td>
                  <td className="px-3 py-2.5 text-right font-display text-xs">{row.rs_rank_3m ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-display text-xs">{fmtNum(row.pe_ratio)}</td>
                  <td className="px-3 py-2.5 text-right font-display text-xs">
                    <span className={row.revenue_growth_yoy != null ? (row.revenue_growth_yoy > 0 ? 'text-green' : 'text-red') : 'text-text-tertiary'}>
                      {fmtPct(row.revenue_growth_yoy)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-display text-xs text-text-secondary">{formatMarketCap(row.market_cap ?? 0)}</td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-text-tertiary">No stocks match your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-text-tertiary text-xs">Rows:</span>
          {PAGE_SIZES.map((s) => (
            <button
              key={s}
              onClick={() => { setPageSize(s); setPage(0); }}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                pageSize === s ? 'bg-bg-tertiary text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-3 py-1.5 text-xs rounded border border-border text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-text-tertiary text-xs">
            {safePage + 1} / {totalPages}
          </span>
          <button
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="px-3 py-1.5 text-xs rounded border border-border text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Filter Modal */}
      <FilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={(f) => { setFilters(f); setPage(0); setActivePreset(null); }}
        sectors={sectors}
        hasSignalData={hasSignalPerf}
      />
    </div>
  );
}
