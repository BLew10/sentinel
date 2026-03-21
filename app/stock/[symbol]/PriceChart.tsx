'use client';

import { useEffect, useRef } from 'react';

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
}

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

export function PriceChart({ prices }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof import('lightweight-charts').createChart> | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!containerRef.current || prices.length === 0) return;

    let mounted = true;

    import('lightweight-charts').then(({ createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries }) => {
      if (!mounted || !containerRef.current) return;

      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

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
        timeScale: {
          borderColor: 'rgba(255,255,255,0.1)',
          timeVisible: false,
        },
      });

      chartRef.current = chart;

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });

      candleSeries.setData(
        prices.map((p) => ({ time: p.date, open: p.open, high: p.high, low: p.low, close: p.close }))
      );

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });

      volumeSeries.setData(
        prices.map((p) => ({
          time: p.date,
          value: p.volume,
          color: p.close >= p.open ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
        }))
      );

      if (prices.length >= 50) {
        const sma50Data = computeSMA(prices, 50);
        const sma50Series = chart.addSeries(LineSeries, {
          color: '#3B82F6',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        sma50Series.setData(sma50Data);
      }

      if (prices.length >= 200) {
        const sma200Data = computeSMA(prices, 200);
        const sma200Series = chart.addSeries(LineSeries, {
          color: '#F59E0B',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        sma200Series.setData(sma200Data);
      }

      chart.timeScale().fitContent();

      const resizeObserver = new ResizeObserver((entries) => {
        if (!chartRef.current) return;
        for (const entry of entries) {
          chartRef.current.applyOptions({ width: entry.contentRect.width });
        }
      });
      resizeObserver.observe(containerRef.current);
      observerRef.current = resizeObserver;
    });

    return () => {
      mounted = false;
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [prices]);

  if (prices.length === 0) {
    return <div className="h-[400px] flex items-center justify-center text-text-tertiary">No price data</div>;
  }

  return (
    <div>
      <div ref={containerRef} className="w-full" />
      <div className="flex items-center gap-4 mt-2 text-[10px] text-text-tertiary">
        <span className="flex items-center gap-1"><span className="w-3 h-px bg-[#3B82F6] inline-block" /> SMA 50</span>
        <span className="flex items-center gap-1"><span className="w-3 h-px bg-[#F59E0B] inline-block" /> SMA 200</span>
      </div>
    </div>
  );
}
