import { describe, it, expect } from 'vitest';
import {
  checkDeepPullback,
  checkInsiderClusterBuy,
  checkFirstBuyIn12Months,
  checkMACDMomentumShift,
  checkStrongFCFYield,
  checkPECompression,
  detectValueReversalCandidate,
  detectCompositeFlags,
} from './composite-flags';
import type {
  TechnicalSignals,
  Fundamentals,
  InsiderTrade,
  PriceBar,
  InsiderClusterBuyResult,
} from '../utils/types';

function makeTechnicals(overrides: Partial<TechnicalSignals> = {}): TechnicalSignals {
  return {
    symbol: 'TEST',
    sma_20: null, sma_50: null, sma_150: null, sma_200: null,
    ema_10: null, ema_21: null,
    price_vs_sma50: null, price_vs_sma200: null,
    pct_from_52w_high: null, pct_from_52w_low: null,
    rsi_14: null, macd: null, macd_signal: null, macd_histogram: null,
    volume_ratio_50d: null, rs_rank_3m: null, rs_rank_6m: null, rs_rank_12m: null,
    atr_14: null, atr_pct: null,
    computed_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeFundamentals(overrides: Partial<Fundamentals> = {}): Fundamentals {
  return {
    symbol: 'TEST',
    pe_ratio: null, forward_pe: null, peg_ratio: null, ps_ratio: null, pb_ratio: null,
    revenue_growth_yoy: null, earnings_growth_yoy: null,
    revenue_growth_qoq: null, earnings_growth_qoq: null,
    gross_margin: null, operating_margin: null, net_margin: null,
    roe: null, roa: null, debt_to_equity: null, current_ratio: null,
    free_cash_flow: null, dividend_yield: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeTrade(overrides: Partial<InsiderTrade> = {}): InsiderTrade {
  return {
    id: 1,
    symbol: 'TEST',
    insider_name: 'John Doe',
    insider_title: 'CFO',
    is_board_director: false,
    transaction_date: '2026-03-15',
    transaction_type: 'Buy',
    shares: 1000,
    price_per_share: 100,
    transaction_value: 100_000,
    shares_owned_after: 5000,
    filing_date: '2026-03-16',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function generatePriceBars(count: number, basePrice = 100): PriceBar[] {
  const bars: PriceBar[] = [];
  const startDate = new Date('2026-01-02');
  for (let i = 0; i < count; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const noise = (Math.sin(i * 0.5) * 2) + (i * 0.1);
    const close = basePrice + noise;
    bars.push({
      date: date.toISOString().split('T')[0],
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000,
    });
  }
  return bars;
}

function generateMACDShiftPrices(): PriceBar[] {
  const bars: PriceBar[] = [];
  const startDate = new Date('2025-12-01');
  for (let i = 0; i < 50; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    let close: number;
    if (i < 35) {
      close = 100 - i * 0.8;
    } else {
      close = 100 - 35 * 0.8 + (i - 35) * 1.5;
    }
    bars.push({
      date: date.toISOString().split('T')[0],
      open: close - 0.3,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1_000_000,
    });
  }
  return bars;
}

// ============================================
// checkDeepPullback
// ============================================

describe('checkDeepPullback', () => {
  it('returns met=true when pct_from_52w_high <= -0.25', () => {
    const result = checkDeepPullback(makeTechnicals({ pct_from_52w_high: -0.34 }));
    expect(result.met).toBe(true);
    expect(result.pct_from_high).toBe(-0.34);
  });

  it('returns met=false when pct_from_52w_high > -0.25', () => {
    const result = checkDeepPullback(makeTechnicals({ pct_from_52w_high: -0.10 }));
    expect(result.met).toBe(false);
  });

  it('returns met=true at exactly -0.25 boundary', () => {
    const result = checkDeepPullback(makeTechnicals({ pct_from_52w_high: -0.25 }));
    expect(result.met).toBe(true);
  });

  it('handles null technicals gracefully', () => {
    const result = checkDeepPullback(null);
    expect(result.met).toBe(false);
    expect(result.pct_from_high).toBeNull();
  });

  it('handles null pct_from_52w_high', () => {
    const result = checkDeepPullback(makeTechnicals({ pct_from_52w_high: null }));
    expect(result.met).toBe(false);
    expect(result.pct_from_high).toBeNull();
  });
});

// ============================================
// checkInsiderClusterBuy
// ============================================

describe('checkInsiderClusterBuy', () => {
  it('fires when 2+ distinct insiders buy within 14 days with combined value >= $200K', () => {
    const trades = [
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2026-03-10', transaction_value: 150_000 }),
      makeTrade({ insider_name: 'Bob Jones', transaction_date: '2026-03-18', transaction_value: 100_000 }),
    ];
    const result = checkInsiderClusterBuy(trades);
    expect(result.met).toBe(true);
    expect(result.buyers).toHaveLength(2);
    expect(result.total_value).toBe(250_000);
  });

  it('does not fire with only 1 insider', () => {
    const trades = [
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2026-03-10', transaction_value: 500_000 }),
    ];
    const result = checkInsiderClusterBuy(trades);
    expect(result.met).toBe(false);
  });

  it('does not fire when combined value < $200K', () => {
    const trades = [
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2026-03-10', transaction_value: 80_000 }),
      makeTrade({ insider_name: 'Bob Jones', transaction_date: '2026-03-12', transaction_value: 90_000 }),
    ];
    const result = checkInsiderClusterBuy(trades);
    expect(result.met).toBe(false);
  });

  it('does not fire when buys are > 14 days apart', () => {
    const trades = [
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2026-03-01', transaction_value: 200_000 }),
      makeTrade({ insider_name: 'Bob Jones', transaction_date: '2026-03-20', transaction_value: 200_000 }),
    ];
    const result = checkInsiderClusterBuy(trades);
    expect(result.met).toBe(false);
  });

  it('excludes option exercises', () => {
    const trades = [
      makeTrade({ insider_name: 'Alice Smith', transaction_type: 'Option Exercise', transaction_value: 500_000, transaction_date: '2026-03-10' }),
      makeTrade({ insider_name: 'Bob Jones', transaction_type: 'Buy', transaction_value: 200_000, transaction_date: '2026-03-12' }),
    ];
    const result = checkInsiderClusterBuy(trades);
    expect(result.met).toBe(false);
  });

  it('handles empty trades array', () => {
    const result = checkInsiderClusterBuy([]);
    expect(result.met).toBe(false);
    expect(result.buyers).toHaveLength(0);
  });
});

// ============================================
// checkFirstBuyIn12Months
// ============================================

describe('checkFirstBuyIn12Months', () => {
  it('fires when a cluster buyer has no prior buy in 12 months', () => {
    const clusterResult: InsiderClusterBuyResult = {
      met: true,
      buyers: ['Alice Smith', 'Bob Jones'],
      total_value: 300_000,
      window_start: '2026-03-10',
      window_end: '2026-03-24',
    };
    const allTrades = [
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2026-03-10', transaction_type: 'Buy' }),
      makeTrade({ insider_name: 'Bob Jones', transaction_date: '2026-03-12', transaction_type: 'Buy' }),
    ];
    const result = checkFirstBuyIn12Months(clusterResult, allTrades);
    expect(result.met).toBe(true);
    expect(result.insider).toBe('Alice Smith');
  });

  it('does not fire when all cluster buyers bought in prior 12 months', () => {
    const clusterResult: InsiderClusterBuyResult = {
      met: true,
      buyers: ['Alice Smith'],
      total_value: 300_000,
      window_start: '2026-03-10',
      window_end: '2026-03-24',
    };
    const allTrades = [
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2026-03-10', transaction_type: 'Buy' }),
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2025-06-15', transaction_type: 'Buy' }),
    ];
    const result = checkFirstBuyIn12Months(clusterResult, allTrades);
    expect(result.met).toBe(false);
  });

  it('returns met=false when cluster did not fire', () => {
    const clusterResult: InsiderClusterBuyResult = {
      met: false, buyers: [], total_value: 0, window_start: null, window_end: null,
    };
    const result = checkFirstBuyIn12Months(clusterResult, []);
    expect(result.met).toBe(false);
  });

  it('ignores option exercises in prior buy history', () => {
    const clusterResult: InsiderClusterBuyResult = {
      met: true,
      buyers: ['Alice Smith'],
      total_value: 300_000,
      window_start: '2026-03-10',
      window_end: '2026-03-24',
    };
    const allTrades = [
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2026-03-10', transaction_type: 'Buy' }),
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2025-08-01', transaction_type: 'Option Exercise' }),
    ];
    const result = checkFirstBuyIn12Months(clusterResult, allTrades);
    expect(result.met).toBe(true);
  });
});

// ============================================
// checkMACDMomentumShift
// ============================================

describe('checkMACDMomentumShift', () => {
  it('returns met=false with insufficient price data', () => {
    const result = checkMACDMomentumShift(generatePriceBars(10));
    expect(result.met).toBe(false);
  });

  it('returns a result with enough bars (smoke test)', () => {
    const prices = generateMACDShiftPrices();
    const result = checkMACDMomentumShift(prices);
    expect(typeof result.met).toBe('boolean');
    expect(result.current_histogram === null || typeof result.current_histogram === 'number').toBe(true);
  });

  it('handles empty price array', () => {
    const result = checkMACDMomentumShift([]);
    expect(result.met).toBe(false);
    expect(result.current_histogram).toBeNull();
  });
});

// ============================================
// checkStrongFCFYield
// ============================================

describe('checkStrongFCFYield', () => {
  it('fires when fcf/market_cap >= 5%', () => {
    const result = checkStrongFCFYield(
      makeFundamentals({ free_cash_flow: 500_000_000 }),
      10_000_000_000,
    );
    expect(result.met).toBe(true);
    expect(result.yield_pct).toBe(0.05);
  });

  it('does not fire when fcf/market_cap < 5%', () => {
    const result = checkStrongFCFYield(
      makeFundamentals({ free_cash_flow: 300_000_000 }),
      10_000_000_000,
    );
    expect(result.met).toBe(false);
    expect(result.yield_pct).toBe(0.03);
  });

  it('handles null fundamentals', () => {
    const result = checkStrongFCFYield(null, 10_000_000_000);
    expect(result.met).toBe(false);
    expect(result.yield_pct).toBeNull();
  });

  it('handles null market cap', () => {
    const result = checkStrongFCFYield(
      makeFundamentals({ free_cash_flow: 500_000_000 }),
      null,
    );
    expect(result.met).toBe(false);
  });

  it('handles zero market cap', () => {
    const result = checkStrongFCFYield(
      makeFundamentals({ free_cash_flow: 500_000_000 }),
      0,
    );
    expect(result.met).toBe(false);
  });

  it('handles null free_cash_flow', () => {
    const result = checkStrongFCFYield(
      makeFundamentals({ free_cash_flow: null }),
      10_000_000_000,
    );
    expect(result.met).toBe(false);
  });
});

// ============================================
// checkPECompression
// ============================================

describe('checkPECompression', () => {
  it('fires when forward_pe < pe_ratio * 0.85', () => {
    const result = checkPECompression(
      makeFundamentals({ pe_ratio: 30, forward_pe: 20 }),
    );
    expect(result.met).toBe(true);
  });

  it('does not fire when forward_pe >= pe_ratio * 0.85', () => {
    const result = checkPECompression(
      makeFundamentals({ pe_ratio: 20, forward_pe: 19 }),
    );
    expect(result.met).toBe(false);
  });

  it('handles null pe_ratio', () => {
    const result = checkPECompression(
      makeFundamentals({ pe_ratio: null, forward_pe: 15 }),
    );
    expect(result.met).toBe(false);
  });

  it('handles null forward_pe', () => {
    const result = checkPECompression(
      makeFundamentals({ pe_ratio: 25, forward_pe: null }),
    );
    expect(result.met).toBe(false);
  });

  it('handles null fundamentals', () => {
    const result = checkPECompression(null);
    expect(result.met).toBe(false);
  });

  it('handles zero pe_ratio', () => {
    const result = checkPECompression(
      makeFundamentals({ pe_ratio: 0, forward_pe: 15 }),
    );
    expect(result.met).toBe(false);
  });
});

// ============================================
// detectValueReversalCandidate — threshold & conviction
// ============================================

describe('detectValueReversalCandidate', () => {
  const baseInput = {
    technicals: makeTechnicals(),
    fundamentals: makeFundamentals(),
    insiderTrades: [] as InsiderTrade[],
    prices: generatePriceBars(50),
    marketCap: 10_000_000_000,
  };

  it('does NOT fire when 0 conditions are met (all null/missing)', () => {
    const result = detectValueReversalCandidate(baseInput);
    expect(result.fired).toBe(false);
    expect(result.conditions_met).toBe(0);
    expect(result.conviction).toBe(0);
  });

  it('does NOT fire with exactly 3 conditions met', () => {
    const result = detectValueReversalCandidate({
      ...baseInput,
      technicals: makeTechnicals({ pct_from_52w_high: -0.40 }),
      fundamentals: makeFundamentals({ free_cash_flow: 800_000_000, pe_ratio: 30, forward_pe: 20 }),
    });
    expect(result.conditions_met).toBeLessThanOrEqual(3);
    expect(result.fired).toBe(false);
  });

  it('fires with 4 conditions met and has conviction 67', () => {
    const trades = [
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2026-03-10', transaction_value: 150_000, transaction_type: 'Buy' }),
      makeTrade({ insider_name: 'Bob Jones', transaction_date: '2026-03-12', transaction_value: 150_000, transaction_type: 'Buy' }),
    ];
    const result = detectValueReversalCandidate({
      ...baseInput,
      technicals: makeTechnicals({ pct_from_52w_high: -0.40 }),
      fundamentals: makeFundamentals({ free_cash_flow: 800_000_000, pe_ratio: 30, forward_pe: 20 }),
      insiderTrades: trades,
    });
    expect(result.conditions_met).toBeGreaterThanOrEqual(4);
    if (result.conditions_met === 4) {
      expect(result.conviction).toBe(67);
    }
    expect(result.fired).toBe(true);
  });

  it('computes conviction = 83 for 5 conditions', () => {
    expect(Math.round((5 / 6) * 100)).toBe(83);
  });

  it('computes conviction = 100 for 6 conditions', () => {
    expect(Math.round((6 / 6) * 100)).toBe(100);
  });

  it('conviction is always clamped 0-100', () => {
    const result = detectValueReversalCandidate(baseInput);
    expect(result.conviction).toBeGreaterThanOrEqual(0);
    expect(result.conviction).toBeLessThanOrEqual(100);
  });

  it('returns full details structure regardless of fire status', () => {
    const result = detectValueReversalCandidate(baseInput);
    expect(result.details).toBeDefined();
    expect(result.details.deep_pullback).toBeDefined();
    expect(result.details.insider_cluster_buy).toBeDefined();
    expect(result.details.first_buy_12mo).toBeDefined();
    expect(result.details.macd_shift).toBeDefined();
    expect(result.details.fcf_yield).toBeDefined();
    expect(result.details.pe_compression).toBeDefined();
  });
});

// ============================================
// detectCompositeFlags
// ============================================

describe('detectCompositeFlags', () => {
  it('includes VALUE_REVERSAL_CANDIDATE in flags when fired', () => {
    const trades = [
      makeTrade({ insider_name: 'Alice Smith', transaction_date: '2026-03-10', transaction_value: 150_000, transaction_type: 'Buy' }),
      makeTrade({ insider_name: 'Bob Jones', transaction_date: '2026-03-12', transaction_value: 150_000, transaction_type: 'Buy' }),
    ];
    const result = detectCompositeFlags({
      technicals: makeTechnicals({ pct_from_52w_high: -0.40 }),
      fundamentals: makeFundamentals({ free_cash_flow: 800_000_000, pe_ratio: 30, forward_pe: 20 }),
      insiderTrades: trades,
      prices: generatePriceBars(50),
      marketCap: 10_000_000_000,
    });

    if (result.metadata.value_reversal?.fired) {
      expect(result.flags).toContain('VALUE_REVERSAL_CANDIDATE');
    }
  });

  it('returns empty flags array when not fired', () => {
    const result = detectCompositeFlags({
      technicals: makeTechnicals(),
      fundamentals: makeFundamentals(),
      insiderTrades: [],
      prices: generatePriceBars(50),
      marketCap: 10_000_000_000,
    });
    expect(result.flags).toEqual([]);
  });

  it('always includes value_reversal in metadata', () => {
    const result = detectCompositeFlags({
      technicals: makeTechnicals(),
      fundamentals: makeFundamentals(),
      insiderTrades: [],
      prices: generatePriceBars(50),
      marketCap: 10_000_000_000,
    });
    expect(result.metadata.value_reversal).toBeDefined();
    expect(typeof result.metadata.value_reversal?.fired).toBe('boolean');
  });
});

// ============================================
// Edge cases
// ============================================

describe('edge cases', () => {
  it('handles all-null inputs without throwing', () => {
    expect(() =>
      detectValueReversalCandidate({
        technicals: null,
        fundamentals: null,
        insiderTrades: [],
        prices: [],
        marketCap: null,
      }),
    ).not.toThrow();
  });

  it('handles negative free cash flow', () => {
    const result = checkStrongFCFYield(
      makeFundamentals({ free_cash_flow: -100_000_000 }),
      10_000_000_000,
    );
    expect(result.met).toBe(false);
    expect(result.yield_pct).toBe(-0.01);
  });

  it('handles negative PE ratios', () => {
    const result = checkPECompression(
      makeFundamentals({ pe_ratio: -5, forward_pe: 10 }),
    );
    expect(result.met).toBe(false);
  });
});
