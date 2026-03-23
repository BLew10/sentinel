'use client';

import { useState, useCallback, useEffect } from 'react';
import type { ScreenerFilters } from '@/lib/utils/types';

interface Props {
  open: boolean;
  onClose: () => void;
  filters: ScreenerFilters;
  onApply: (filters: ScreenerFilters) => void;
  sectors: string[];
  hasSignalData?: boolean;
}

function Toggle({ label, checked, onChange, description }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description: string;
}) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer group py-2">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-text-primary block">{label}</span>
        <span className="text-xs text-text-tertiary leading-relaxed block mt-0.5">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors mt-0.5 ${checked ? 'bg-green' : 'bg-bg-tertiary'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
    </label>
  );
}

function NumberInput({ label, value, onChange, placeholder, step, description, suffix }: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  step?: number;
  description: string;
  suffix?: string;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            placeholder={placeholder ?? '—'}
            step={step ?? 1}
            className="w-20 shrink-0 bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary text-right focus:outline-none focus:border-green/50"
          />
          {suffix && <span className="text-xs text-text-tertiary w-4">{suffix}</span>}
        </div>
      </div>
      <p className="text-xs text-text-tertiary leading-relaxed mt-1">{description}</p>
    </div>
  );
}

function SectionHeader({ title, icon, description }: { title: string; icon: string; description: string }) {
  return (
    <div className="pb-2 border-b border-border/50">
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-sm font-display font-semibold text-text-primary">{title}</h3>
      </div>
      <p className="text-xs text-text-tertiary mt-1 leading-relaxed">{description}</p>
    </div>
  );
}

export function FilterModal({ open, onClose, filters, onApply, sectors, hasSignalData }: Props) {
  const [draft, setDraft] = useState<ScreenerFilters>(filters);

  useEffect(() => {
    if (open) {
      setDraft(filters);
    }
  }, [open, filters]);

  const update = useCallback(<K extends keyof ScreenerFilters>(key: K, val: ScreenerFilters[K]) => {
    setDraft((prev) => ({ ...prev, [key]: val }));
  }, []);

  const activeCount = Object.values(draft).filter((v) =>
    v !== undefined && v !== false && v !== 0 && !(Array.isArray(v) && v.length === 0)
  ).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-bg-secondary border-l border-border h-full overflow-y-auto">
        <div className="sticky top-0 bg-bg-secondary/95 backdrop-blur-md border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-display font-bold">Filters</h2>
            {activeCount > 0 && (
              <span className="text-green text-xs font-medium">{activeCount} active</span>
            )}
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xl leading-none p-1">×</button>
        </div>

        <div className="p-6 space-y-8">

          {/* ── Signal Performance ── */}
          <section className="space-y-1">
            <SectionHeader
              icon="⚡"
              title="Signal Performance"
              description="Filter by historical signal performance. Sentinel tracks forward returns for every signal it fires — use these filters to only see stocks with proven, backtested signals."
            />
            <Toggle
              label="Has Active Signal"
              checked={draft.has_active_signal ?? false}
              onChange={(v) => update('has_active_signal', v || undefined)}
              description="Stock triggered at least one signal in the last 30 days (e.g., insider cluster buy, golden cross, volume breakout). Stocks with active signals have a catalyst."
            />
            <NumberInput
              label="Min Signal Win Rate"
              value={draft.min_signal_win_rate}
              onChange={(v) => update('min_signal_win_rate', v)}
              placeholder="0–100"
              suffix="%"
              description={
                hasSignalData
                  ? "Only show stocks whose best active signal historically has at least this win rate. 60%+ means the signal produces winners more often than not."
                  : "Only show stocks whose best active signal historically has at least this win rate. Run 'npm run backtest' then 'npm run perf' to populate signal performance data."
              }
            />
          </section>

          {/* ── Conviction Scores ── */}
          <section className="space-y-1">
            <SectionHeader
              icon="◆"
              title="Conviction Scores"
              description="Sentinel computes 7 sub-scores (0–100) and rolls them into one composite. Set minimum thresholds to filter by conviction level."
            />
            <NumberInput
              label="Sentinel Score"
              value={draft.sentinel_score_min}
              onChange={(v) => update('sentinel_score_min', v)}
              placeholder="0–100"
              description="The composite score across all dimensions. 60+ is bullish, 75+ is high conviction, 85+ is rare and extremely bullish."
            />
            <NumberInput
              label="Insider Score"
              value={draft.insider_score_min}
              onChange={(v) => update('insider_score_min', v)}
              placeholder="0–100"
              description="Measures insider buying activity and conviction. 65+ means meaningful insider accumulation, 80+ means strong cluster buying from multiple executives."
            />
            <NumberInput
              label="Institutional Score"
              value={draft.institutional_score_min}
              onChange={(v) => update('institutional_score_min', v)}
              placeholder="0–100"
              description="Tracks hedge fund and institutional ownership changes. Higher scores mean notable funds are adding positions — they do deep due diligence."
            />
            <NumberInput
              label="AI Earnings Score"
              value={draft.earnings_ai_conviction_min}
              onChange={(v) => update('earnings_ai_conviction_min', v)}
              placeholder="0–100"
              description="AI analysis of earnings calls, guidance, and management tone. Measures how bullish the AI is on the company's forward outlook."
            />
          </section>

          {/* ── Insider Activity ── */}
          <section className="space-y-1">
            <SectionHeader
              icon="👤"
              title="Insider Activity"
              description="What executives and directors are doing with their own money. Academic research shows insider buying is one of the strongest predictive signals — they know their company better than anyone."
            />
            <NumberInput
              label="Min Buyers (30 days)"
              value={draft.insider_buyers_30d_min}
              onChange={(v) => update('insider_buyers_30d_min', v)}
              placeholder="0"
              description="Number of distinct insiders buying in the last 30 days. 2+ is a 'cluster buy' — multiple insiders buying at the same time is a very strong signal."
            />
            <Toggle
              label="Net Insider Buying"
              checked={draft.insider_net_buy_positive ?? false}
              onChange={(v) => update('insider_net_buy_positive', v || undefined)}
              description="Total dollar value of insider purchases exceeds sales. Filters out companies where insider buying is overwhelmed by selling."
            />
          </section>

          {/* ── Trend & Momentum ── */}
          <section className="space-y-1">
            <SectionHeader
              icon="📈"
              title="Trend & Momentum"
              description="Moving average alignment confirms an uptrend. When price is above all major averages and they're stacked in order (50 > 150 > 200), the stock is in what Mark Minervini calls a 'Stage 2 uptrend' — the sweet spot for growth stocks."
            />
            <Toggle
              label="Price above 50-day SMA"
              checked={draft.price_above_sma50 ?? false}
              onChange={(v) => update('price_above_sma50', v || undefined)}
              description="Stock is trading above its 50-day simple moving average — confirms short-term uptrend and institutional support."
            />
            <Toggle
              label="Price above 150-day SMA"
              checked={draft.price_above_sma150 ?? false}
              onChange={(v) => update('price_above_sma150', v || undefined)}
              description="Above the 150-day average, confirming medium-term strength. This is Mark Minervini's key intermediate trend filter."
            />
            <Toggle
              label="Price above 200-day SMA"
              checked={draft.price_above_sma200 ?? false}
              onChange={(v) => update('price_above_sma200', v || undefined)}
              description="The 200-day average is the institutional line in the sand. Stocks below it are in long-term downtrends and avoided by most funds."
            />
            <Toggle
              label="50-day SMA above 150-day"
              checked={draft.sma50_above_sma150 ?? false}
              onChange={(v) => update('sma50_above_sma150', v || undefined)}
              description="Short-term trend is leading the mid-term trend — momentum is building. Part of the bullish MA alignment pattern."
            />
            <Toggle
              label="150-day SMA above 200-day"
              checked={draft.sma150_above_sma200 ?? false}
              onChange={(v) => update('sma150_above_sma200', v || undefined)}
              description="Mid-term trend leads long-term trend. When this flips bullish, it often marks the start of a multi-month run."
            />
            <Toggle
              label="200-day SMA trending up"
              checked={draft.sma200_trending_up_1mo ?? false}
              onChange={(v) => update('sma200_trending_up_1mo', v || undefined)}
              description="The 200-day average itself is rising, not just price above it. This confirms the long-term trajectory is upward, not just a temporary bounce."
            />
            <NumberInput
              label="SMA 50/200 Distance"
              value={draft.sma_distance_max_pct}
              onChange={(v) => update('sma_distance_max_pct', v)}
              placeholder="e.g. 5"
              step={1}
              suffix="%"
              description="Max gap between SMA50 and SMA200 as a percentage. 2% finds stocks near a golden or death cross. 5% finds approaching setups."
            />
            <Toggle
              label="SMA50 converging toward SMA200"
              checked={draft.sma_converging ?? false}
              onChange={(v) => update('sma_converging', v || undefined)}
              description="SMA50 is below SMA200 but accelerating upward (SMA50 > SMA150) — the gap is closing and a golden cross is building. Best combined with the distance filter above."
            />
          </section>

          {/* ── Price Position & Relative Strength ── */}
          <section className="space-y-1">
            <SectionHeader
              icon="🎯"
              title="Price Position & Relative Strength"
              description="Where the stock sits relative to its 52-week range and how it performs versus the overall market. Counter-intuitively, stocks near highs tend to keep making new highs."
            />
            <Toggle
              label="Within 10% of 52-week high"
              checked={draft.within_10pct_of_52w_high ?? false}
              onChange={(v) => update('within_10pct_of_52w_high', v || undefined)}
              description="Stock is near its highs and could be setting up for a breakout to new highs. Leaders stay near the top of their range."
            />
            <Toggle
              label="Within 25% of 52-week high"
              checked={draft.within_25pct_of_52w_high ?? false}
              onChange={(v) => update('within_25pct_of_52w_high', v || undefined)}
              description="Not too far from highs — still in a constructive pattern. Stocks more than 25% off highs are often in a downtrend."
            />
            <Toggle
              label="Above 30% from 52-week low"
              checked={draft.above_30pct_from_52w_low ?? false}
              onChange={(v) => update('above_30pct_from_52w_low', v || undefined)}
              description="Has recovered significantly from its low — the worst is likely over. Avoids stocks still in free-fall."
            />
            <NumberInput
              label="RS Rank (3-month)"
              value={draft.rs_rank_3m_min}
              onChange={(v) => update('rs_rank_3m_min', v)}
              placeholder="0–100"
              description="Relative strength percentile vs all tracked stocks over 3 months. 80+ means the stock is outperforming 80% of the market — a leading indicator of continued strength."
            />
            <NumberInput
              label="RS Rank (6-month)"
              value={draft.rs_rank_6m_min}
              onChange={(v) => update('rs_rank_6m_min', v)}
              placeholder="0–100"
              description="6-month relative strength is more reliable than 3-month. Stocks with consistently high RS over 6+ months are the true market leaders."
            />
            <NumberInput
              label="Volume Ratio (vs 50d avg)"
              value={draft.volume_ratio_50d_min}
              onChange={(v) => update('volume_ratio_50d_min', v)}
              placeholder="1.0"
              step={0.5}
              suffix="×"
              description="Current volume divided by 50-day average. 2.0× or higher means unusual institutional activity — big money is moving in or out."
            />
          </section>

          {/* ── Growth & Fundamentals ── */}
          <section className="space-y-1">
            <SectionHeader
              icon="💹"
              title="Growth & Fundamentals"
              description="Revenue and earnings growth rates. The most powerful pattern is 'acceleration' — when QoQ growth exceeds YoY growth, it means the business is gaining momentum, not just growing."
            />
            <NumberInput
              label="Revenue Growth (YoY)"
              value={draft.revenue_growth_yoy_min != null ? draft.revenue_growth_yoy_min * 100 : undefined}
              onChange={(v) => update('revenue_growth_yoy_min', v != null ? v / 100 : undefined)}
              placeholder="%"
              step={5}
              suffix="%"
              description="Year-over-year revenue growth. 20%+ is strong growth, 50%+ is exceptional. Consistent high growth is the hallmark of winning stocks."
            />
            <NumberInput
              label="Earnings Growth (YoY)"
              value={draft.earnings_growth_yoy_min != null ? draft.earnings_growth_yoy_min * 100 : undefined}
              onChange={(v) => update('earnings_growth_yoy_min', v != null ? v / 100 : undefined)}
              placeholder="%"
              step={5}
              suffix="%"
              description="Year-over-year earnings growth. Should ideally match or exceed revenue growth — if earnings grow faster, margins are expanding."
            />
            <NumberInput
              label="Revenue Growth (QoQ)"
              value={draft.revenue_growth_qoq_min != null ? draft.revenue_growth_qoq_min * 100 : undefined}
              onChange={(v) => update('revenue_growth_qoq_min', v != null ? v / 100 : undefined)}
              placeholder="%"
              step={5}
              suffix="%"
              description="Quarter-over-quarter revenue growth. When QoQ > YoY, growth is accelerating — this is the most bullish fundamental signal."
            />
            <NumberInput
              label="Earnings Growth (QoQ)"
              value={draft.earnings_growth_qoq_min != null ? draft.earnings_growth_qoq_min * 100 : undefined}
              onChange={(v) => update('earnings_growth_qoq_min', v != null ? v / 100 : undefined)}
              placeholder="%"
              step={5}
              suffix="%"
              description="Quarter-over-quarter earnings growth. Look for QoQ acceleration alongside YoY strength for the full 'CAN SLIM' earnings pattern."
            />
          </section>

          {/* ── Universe ── */}
          <section className="space-y-1">
            <SectionHeader
              icon="🌐"
              title="Universe"
              description="Narrow by sector and market capitalization. Sector filters help you focus on industries you understand. Market cap filters let you target small-cap growth or large-cap stability."
            />
            <div className="py-2">
              <span className="text-sm font-medium text-text-primary block mb-1.5">Sectors</span>
              <p className="text-xs text-text-tertiary leading-relaxed mb-2">Select one or more sectors to focus on. Leave empty to include all sectors.</p>
              <div className="flex flex-wrap gap-1.5">
                {sectors.map((s) => {
                  const selected = draft.sectors?.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        const current = draft.sectors ?? [];
                        const next = selected ? current.filter((x) => x !== s) : [...current, s];
                        update('sectors', next.length > 0 ? next : undefined);
                      }}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        selected
                          ? 'border-green/50 bg-green-bg text-green'
                          : 'border-border text-text-tertiary hover:text-text-secondary hover:border-border/80'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <NumberInput
              label="Min Market Cap"
              value={draft.market_cap_min != null ? draft.market_cap_min / 1e9 : undefined}
              onChange={(v) => update('market_cap_min', v != null ? v * 1e9 : undefined)}
              placeholder="$B"
              step={1}
              suffix="B"
              description="Minimum market capitalization in billions. $10B+ = large cap, $2B–$10B = mid cap, under $2B = small cap."
            />
            <NumberInput
              label="Max Market Cap"
              value={draft.market_cap_max != null ? draft.market_cap_max / 1e9 : undefined}
              onChange={(v) => update('market_cap_max', v != null ? v * 1e9 : undefined)}
              placeholder="$B"
              step={10}
              suffix="B"
              description="Maximum market cap. Cap the size to focus on smaller, faster-growing companies that can still multiply."
            />
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-bg-secondary/95 backdrop-blur-md border-t border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => {
              setDraft({});
              onApply({});
            }}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary border border-border rounded-lg transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="flex-1 px-4 py-2 text-sm font-medium bg-green text-bg-primary rounded-lg hover:bg-green/90 transition-colors"
          >
            Apply Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
