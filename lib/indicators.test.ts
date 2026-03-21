import { describe, it, expect } from 'vitest';
import {
  computeSMA, computeEMA, computeRSI, computeMACD,
  computeATR, computeVolumeRatio, compute52WeekRange,
  computeRelativeStrength, computePercentileRank,
} from './indicators';
import type { PriceBar } from './utils/types';

function makeBars(closes: number[], volume = 1000): PriceBar[] {
  return closes.map((close, i) => ({
    date: `2025-01-${String(i + 1).padStart(2, '0')}`,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  }));
}

describe('computeSMA', () => {
  it('returns correct average', () => {
    expect(computeSMA([10, 20, 30, 40, 50], 3)).toBeCloseTo(40);
  });

  it('returns null when insufficient data', () => {
    expect(computeSMA([10, 20], 3)).toBeNull();
  });

  it('handles single-element period', () => {
    expect(computeSMA([10, 20, 30], 1)).toBe(30);
  });
});

describe('computeEMA', () => {
  it('returns a value for valid input', () => {
    const closes = [22, 22.27, 22.19, 22.08, 22.17, 22.18, 22.13, 22.23, 22.43, 22.24, 22.29];
    const result = computeEMA(closes, 10);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(22.22, 1);
  });

  it('returns null for insufficient data', () => {
    expect(computeEMA([1, 2, 3], 5)).toBeNull();
  });
});

describe('computeRSI', () => {
  it('returns ~100 for all-up series', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const rsi = computeRSI(closes);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThan(95);
  });

  it('returns ~0 for all-down series', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
    const rsi = computeRSI(closes);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeLessThan(5);
  });

  it('returns mid-range for mixed series', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    const rsi = computeRSI(closes);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThan(20);
    expect(rsi!).toBeLessThan(80);
  });

  it('returns null for too-short array', () => {
    expect(computeRSI([1, 2, 3])).toBeNull();
  });
});

describe('computeMACD', () => {
  it('returns positive MACD line for uptrending series', () => {
    // Accelerating uptrend to avoid floating-point zero at convergence
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5 + i * i * 0.01);
    const result = computeMACD(closes);
    expect(result).not.toBeNull();
    expect(result!.macd).toBeGreaterThan(0);
  });

  it('returns negative MACD line for downtrending series', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 150 - i * 0.5 - i * i * 0.01);
    const result = computeMACD(closes);
    expect(result).not.toBeNull();
    expect(result!.macd).toBeLessThan(0);
  });

  it('returns null for insufficient data', () => {
    expect(computeMACD([1, 2, 3])).toBeNull();
  });
});

describe('computeATR', () => {
  it('returns positive value for valid bars', () => {
    const bars = makeBars(Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 5));
    const atr = computeATR(bars);
    expect(atr).not.toBeNull();
    expect(atr!).toBeGreaterThan(0);
  });

  it('returns null for insufficient bars', () => {
    const bars = makeBars([100, 101, 102]);
    expect(computeATR(bars)).toBeNull();
  });
});

describe('computeVolumeRatio', () => {
  it('returns 2.0 when current volume is double average', () => {
    const bars = makeBars(Array.from({ length: 55 }, () => 100), 1000);
    bars[bars.length - 1].volume = 2000;
    const ratio = computeVolumeRatio(bars, 50);
    expect(ratio).toBeCloseTo(2.0);
  });

  it('returns null for insufficient data', () => {
    const bars = makeBars([100, 101]);
    expect(computeVolumeRatio(bars)).toBeNull();
  });
});

describe('compute52WeekRange', () => {
  it('computes correct high/low percentages', () => {
    const closes = Array.from({ length: 252 }, (_, i) => {
      if (i < 126) return 100 + i * 0.5;
      return 163 - (i - 126) * 0.5;
    });
    const bars = makeBars(closes);
    const range = compute52WeekRange(bars);
    expect(range).not.toBeNull();
    expect(range!.high).toBeGreaterThan(range!.low);
    expect(range!.pct_from_high).toBeLessThanOrEqual(0);
    expect(range!.pct_from_low).toBeGreaterThanOrEqual(0);
  });

  it('returns null for insufficient data', () => {
    const bars = makeBars([100, 101, 102]);
    expect(compute52WeekRange(bars)).toBeNull();
  });
});

describe('computeRelativeStrength', () => {
  it('returns > 1 when stock outperforms benchmark', () => {
    const stock = Array.from({ length: 70 }, (_, i) => 100 + i * 2);
    const bench = Array.from({ length: 70 }, (_, i) => 100 + i * 0.5);
    const rs = computeRelativeStrength(stock, bench, 63);
    expect(rs).not.toBeNull();
    expect(rs!).toBeGreaterThan(1);
  });

  it('returns < 1 when stock underperforms', () => {
    const stock = Array.from({ length: 70 }, (_, i) => 100 + i * 0.2);
    const bench = Array.from({ length: 70 }, (_, i) => 100 + i * 2);
    const rs = computeRelativeStrength(stock, bench, 63);
    expect(rs).not.toBeNull();
    expect(rs!).toBeLessThan(1);
  });

  it('returns null for insufficient data', () => {
    expect(computeRelativeStrength([1, 2], [1, 2], 10)).toBeNull();
  });
});

describe('computePercentileRank', () => {
  it('returns ~50 for median value', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    expect(computePercentileRank(50, values)).toBeCloseTo(50, -1);
  });

  it('returns 0 for minimum value', () => {
    const values = [1, 2, 3, 4, 5];
    expect(computePercentileRank(1, values)).toBe(0);
  });

  it('returns near 100 for maximum value', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    expect(computePercentileRank(99, values)).toBe(99);
  });
});
