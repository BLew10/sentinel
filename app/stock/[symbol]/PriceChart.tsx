'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChartEvent, ChartEventCategory } from '@/lib/utils/types';

interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  prices: PriceBar[];
  sma50: number | null;
  sma200: number | null;
  events?: ChartEvent[];
}

interface MarkerData {
  time: string;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color: string;
  text: string;
}

const CATEGORY_CONFIG: Record<ChartEventCategory, {
  shape: MarkerData['shape'];
  position: MarkerData['position'];
  color: string;
  legendLabel: string;
  legendIcon: string;
}> = {
  insider_buy:  { shape: 'arrowUp',   position: 'belowBar', color: '#22c55e', legendLabel: 'Insider Buys',  legendIcon: '▲' },
  insider_sell: { shape: 'arrowDown', position: 'aboveBar', color: '#ef4444', legendLabel: 'Insider Sells', legendIcon: '▼' },
  earnings:     { shape: 'circle',    position: 'belowBar', color: '#F59E0B', legendLabel: 'Earnings',      legendIcon: '●' },
  sec_filing:   { shape: 'square',    position: 'aboveBar', color: '#A855F7', legendLabel: 'SEC Filings',   legendIcon: '■' },
};

const ALL_CATEGORIES: ChartEventCategory[] = ['insider_buy', 'insider_sell', 'earnings', 'sec_filing'];

function computeSMA(prices: PriceBar[], period: number): { time: string; value: number }[] {
  const result: { time: string; value: number }[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += prices[j].close;
    }
    result.push({ time: prices[i].date, value: sum / period });
  }
  return result;
}

function buildMarkers(
  events: ChartEvent[],
  visibleCategories: Set<ChartEventCategory>,
  dateRange: { start: string; end: string },
): MarkerData[] {
  const filtered = events.filter(
    (e) => visibleCategories.has(e.category) && e.date >= dateRange.start && e.date <= dateRange.end,
  );

  const grouped = new Map<string, ChartEvent[]>();
  for (const e of filtered) {
    const key = `${e.date}|${e.category}`;
    const arr = grouped.get(key);
    if (arr) arr.push(e);
    else grouped.set(key, [e]);
  }

  const markers: MarkerData[] = [];
  for (const [, group] of grouped) {
    const { category, date } = group[0];
    const cfg = CATEGORY_CONFIG[category];
    let text: string;
    if (group.length === 1) {
      text = group[0].label.length > 22 ? group[0].label.slice(0, 20) + '..' : group[0].label;
    } else {
      text = `${group.length} ${cfg.legendLabel}`;
    }
    markers.push({ time: date, position: cfg.position, shape: cfg.shape, color: cfg.color, text });
  }

  markers.sort((a, b) => a.time.localeCompare(b.time));
  return markers;
}

export function PriceChart({ prices, events = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof import('lightweight-charts').createChart> | null>(null);
  const markersRef = useRef<{ setMarkers: (m: MarkerData[]) => void; detach: () => void } | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<Set<ChartEventCategory>>(new Set(ALL_CATEGORIES));

  const dateRange = prices.length > 0
    ? { start: prices[0].date, end: prices[prices.length - 1].date }
    : null;

  const toggleCategory = useCallback((cat: ChartEventCategory) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!markersRef.current || !dateRange) return;
    markersRef.current.setMarkers(buildMarkers(events, visibleCategories, dateRange));
  }, [visibleCategories, events, dateRange?.start, dateRange?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!containerRef.current || prices.length === 0) return;

    let mounted = true;

    import('lightweight-charts').then(({ createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers }) => {
      if (!mounted || !containerRef.current) return;

      if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
      if (markersRef.current) { markersRef.current.detach(); markersRef.current = null; }
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 400,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#9CA3AF',
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.04)' },
          horzLines: { color: 'rgba(255,255,255,0.04)' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
        timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: false },
      });
      chartRef.current = chart;

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      });
      candleSeries.setData(prices.map((p) => ({ time: p.date, open: p.open, high: p.high, low: p.low, close: p.close })));

      const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volumeSeries.setData(prices.map((p) => ({
        time: p.date, value: p.volume,
        color: p.close >= p.open ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
      })));

      if (prices.length >= 50) {
        const sma50Series = chart.addSeries(LineSeries, { color: '#3B82F6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        sma50Series.setData(computeSMA(prices, 50));
      }
      if (prices.length >= 200) {
        const sma200Series = chart.addSeries(LineSeries, { color: '#F59E0B', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        sma200Series.setData(computeSMA(prices, 200));
      }

      if (events.length > 0) {
        const dr = { start: prices[0].date, end: prices[prices.length - 1].date };
        const initialMarkers = buildMarkers(events, visibleCategories, dr);
        // Lightweight Charts v5 generic variance requires widening the series type
        const series = candleSeries as unknown as Parameters<typeof createSeriesMarkers<string>>[0];
        const markersPrimitive = createSeriesMarkers(series, initialMarkers);
        markersRef.current = markersPrimitive as unknown as { setMarkers: (m: MarkerData[]) => void; detach: () => void };
      }

      chart.timeScale().fitContent();

      const resizeObserver = new ResizeObserver((entries) => {
        if (!chartRef.current) return;
        for (const entry of entries) chartRef.current.applyOptions({ width: entry.contentRect.width });
      });
      resizeObserver.observe(containerRef.current);
      observerRef.current = resizeObserver;
    });

    return () => {
      mounted = false;
      if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
      if (markersRef.current) { markersRef.current.detach(); markersRef.current = null; }
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [prices]); // eslint-disable-line react-hooks/exhaustive-deps

  if (prices.length === 0) {
    return <div className="h-[400px] flex items-center justify-center text-text-tertiary">No price data</div>;
  }

  const hasEvents = events.length > 0;

  return (
    <div>
      <div ref={containerRef} className="w-full" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-text-tertiary">
        <span className="flex items-center gap-1"><span className="w-3 h-px bg-[#3B82F6] inline-block" /> SMA 50</span>
        <span className="flex items-center gap-1"><span className="w-3 h-px bg-[#F59E0B] inline-block" /> SMA 200</span>
        {hasEvents && <span className="w-px h-3 bg-border mx-1" />}
        {hasEvents && ALL_CATEGORIES.map((cat) => {
          const cfg = CATEGORY_CONFIG[cat];
          const active = visibleCategories.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`flex items-center gap-1 transition-opacity cursor-pointer ${active ? 'opacity-100' : 'opacity-30'}`}
            >
              <span style={{ color: cfg.color }}>{cfg.legendIcon}</span>
              <span>{cfg.legendLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
