import { describe, it, expect } from 'vitest';
import { computeTechnicalScore, detectTechnicalFlags, detectSmaCrossover } from './technical';
import type { TechnicalSignals } from '../utils/types';

function makeSignals(overrides: Partial<TechnicalSignals> = {}): TechnicalSignals {
  return {
    symbol: 'TEST',
    sma_20: null,
    sma_50: null,
    sma_150: null,
    sma_200: null,
    ema_10: null,
    ema_21: null,
    price_vs_sma50: null,
    price_vs_sma200: null,
    pct_from_52w_high: null,
    pct_from_52w_low: null,
    rsi_14: null,
    macd: null,
    macd_signal: null,
    macd_histogram: null,
    volume_ratio_50d: null,
    rs_rank_3m: null,
    rs_rank_6m: null,
    rs_rank_12m: null,
    atr_14: null,
    atr_pct: null,
    computed_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeTechnicalScore', () => {
  it('returns 50 when all signals are null', () => {
    expect(computeTechnicalScore(makeSignals())).toBe(50);
  });

  it('returns high score for bullish signals', () => {
    const score = computeTechnicalScore(makeSignals({
      rsi_14: 55,
      price_vs_sma50: 0.1,
      price_vs_sma200: 0.15,
      macd_histogram: 2,
      sma_50: 100,
      volume_ratio_50d: 1.8,
      rs_rank_3m: 90,
      rs_rank_6m: 85,
      pct_from_52w_high: -0.02,
    }));
    expect(score).toBeGreaterThan(70);
  });

  it('returns low score for bearish signals', () => {
    const score = computeTechnicalScore(makeSignals({
      rsi_14: 80,
      price_vs_sma50: -0.1,
      price_vs_sma200: -0.15,
      macd_histogram: -2,
      sma_50: 100,
      volume_ratio_50d: 0.5,
      rs_rank_3m: 10,
      rs_rank_6m: 15,
      pct_from_52w_high: -0.35,
    }));
    expect(score).toBeLessThan(35);
  });

  it('clamps output between 0 and 100', () => {
    const score = computeTechnicalScore(makeSignals({ rsi_14: 50 }));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('detectTechnicalFlags', () => {
  it('detects RSI_OVERSOLD when RSI < 30', () => {
    const flags = detectTechnicalFlags(makeSignals({ rsi_14: 25 }));
    expect(flags).toContain('RSI_OVERSOLD');
  });

  it('detects RSI_OVERBOUGHT when RSI > 70', () => {
    const flags = detectTechnicalFlags(makeSignals({ rsi_14: 75 }));
    expect(flags).toContain('RSI_OVERBOUGHT');
  });

  it('detects VOLUME_SURGE when volume ratio >= 2.0', () => {
    const flags = detectTechnicalFlags(makeSignals({ volume_ratio_50d: 2.5 }));
    expect(flags).toContain('VOLUME_SURGE');
  });

  it('detects NEW_52W_HIGH', () => {
    const flags = detectTechnicalFlags(makeSignals({ pct_from_52w_high: 0 }));
    expect(flags).toContain('NEW_52W_HIGH');
  });

  it('detects NEAR_52W_HIGH', () => {
    const flags = detectTechnicalFlags(makeSignals({ pct_from_52w_high: -0.03 }));
    expect(flags).toContain('NEAR_52W_HIGH');
    expect(flags).not.toContain('NEW_52W_HIGH');
  });

  it('detects BELOW_SMA200', () => {
    const flags = detectTechnicalFlags(makeSignals({ price_vs_sma200: -0.1 }));
    expect(flags).toContain('BELOW_SMA200');
  });

  it('detects STAGE2_UPTREND with correct alignment', () => {
    const flags = detectTechnicalFlags(makeSignals({
      price_vs_sma50: 0.05,
      price_vs_sma200: 0.1,
      sma_50: 150,
      sma_150: 140,
      sma_200: 130,
    }));
    expect(flags).toContain('STAGE2_UPTREND');
  });

  it('detects GOLDEN_CROSS near SMA crossover', () => {
    const flags = detectTechnicalFlags(makeSignals({
      sma_50: 101,
      sma_200: 100,
    }));
    expect(flags).toContain('GOLDEN_CROSS');
  });

  it('returns empty array when no conditions met', () => {
    const flags = detectTechnicalFlags(makeSignals({ rsi_14: 50 }));
    expect(flags).toEqual([]);
  });
});

describe('detectSmaCrossover', () => {
  it('detects golden cross when SMA50 crosses above SMA200', () => {
    expect(detectSmaCrossover(98, 100, 101, 100)).toBe('golden_cross');
  });

  it('detects golden cross at exact boundary (prev equal, now above)', () => {
    expect(detectSmaCrossover(100, 100, 100.01, 100)).toBe('golden_cross');
  });

  it('detects death cross when SMA50 crosses below SMA200', () => {
    expect(detectSmaCrossover(102, 100, 99, 100)).toBe('death_cross');
  });

  it('detects death cross at exact boundary (prev equal, now below)', () => {
    expect(detectSmaCrossover(100, 100, 99.99, 100)).toBe('death_cross');
  });

  it('returns null when SMA50 stays above SMA200', () => {
    expect(detectSmaCrossover(105, 100, 106, 100)).toBeNull();
  });

  it('returns null when SMA50 stays below SMA200', () => {
    expect(detectSmaCrossover(95, 100, 96, 100)).toBeNull();
  });

  it('returns null when any input is null', () => {
    expect(detectSmaCrossover(null, 100, 101, 100)).toBeNull();
    expect(detectSmaCrossover(98, null, 101, 100)).toBeNull();
    expect(detectSmaCrossover(98, 100, null, 100)).toBeNull();
    expect(detectSmaCrossover(98, 100, 101, null)).toBeNull();
  });

  it('returns null when all inputs are null', () => {
    expect(detectSmaCrossover(null, null, null, null)).toBeNull();
  });
});
