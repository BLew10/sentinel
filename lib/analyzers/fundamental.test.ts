import { describe, it, expect } from 'vitest';
import { computeFundamentalScore, detectFundamentalFlags } from './fundamental';
import type { Fundamentals } from '../utils/types';

function makeFundamentals(overrides: Partial<Fundamentals> = {}): Fundamentals {
  return {
    symbol: 'TEST',
    pe_ratio: null,
    forward_pe: null,
    peg_ratio: null,
    ps_ratio: null,
    pb_ratio: null,
    revenue_growth_yoy: null,
    earnings_growth_yoy: null,
    revenue_growth_qoq: null,
    earnings_growth_qoq: null,
    gross_margin: null,
    operating_margin: null,
    net_margin: null,
    roe: null,
    roa: null,
    debt_to_equity: null,
    current_ratio: null,
    free_cash_flow: null,
    dividend_yield: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeFundamentalScore', () => {
  it('returns 50 when all metrics are null', () => {
    expect(computeFundamentalScore(makeFundamentals())).toBe(50);
  });

  it('returns high score for strong fundamentals', () => {
    const score = computeFundamentalScore(makeFundamentals({
      pe_ratio: 12,
      peg_ratio: 0.8,
      ps_ratio: 2,
      revenue_growth_yoy: 0.35,
      earnings_growth_yoy: 0.4,
      revenue_growth_qoq: 0.12,
      gross_margin: 0.65,
      operating_margin: 0.3,
      net_margin: 0.2,
      roe: 0.35,
      debt_to_equity: 0.3,
      current_ratio: 2.5,
    }));
    expect(score).toBeGreaterThan(70);
  });

  it('returns low score for weak fundamentals', () => {
    const score = computeFundamentalScore(makeFundamentals({
      pe_ratio: 55,
      peg_ratio: 2.8,
      ps_ratio: 18,
      revenue_growth_yoy: -0.08,
      earnings_growth_yoy: -0.15,
      gross_margin: 0.15,
      operating_margin: -0.03,
      net_margin: -0.08,
      roe: 0.02,
      debt_to_equity: 2.8,
      current_ratio: 0.6,
    }));
    expect(score).toBeLessThan(30);
  });

  it('clamps output between 0 and 100', () => {
    const score = computeFundamentalScore(makeFundamentals({ pe_ratio: 10 }));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('ignores negative PE ratios', () => {
    const withNegPe = computeFundamentalScore(makeFundamentals({ pe_ratio: -5 }));
    const withNull = computeFundamentalScore(makeFundamentals({ pe_ratio: null }));
    expect(withNegPe).toBe(withNull);
  });
});

describe('detectFundamentalFlags', () => {
  it('detects DEEP_VALUE', () => {
    const flags = detectFundamentalFlags(makeFundamentals({
      pe_ratio: 8,
      pb_ratio: 1.5,
    }));
    expect(flags).toContain('DEEP_VALUE');
  });

  it('detects HIGH_GROWTH', () => {
    const flags = detectFundamentalFlags(makeFundamentals({
      revenue_growth_yoy: 0.3,
      earnings_growth_yoy: 0.3,
    }));
    expect(flags).toContain('HIGH_GROWTH');
  });

  it('detects ACCELERATING_REVENUE', () => {
    const flags = detectFundamentalFlags(makeFundamentals({
      revenue_growth_qoq: 0.15,
      revenue_growth_yoy: 0.1,
    }));
    expect(flags).toContain('ACCELERATING_REVENUE');
  });

  it('detects ACCELERATING_EARNINGS', () => {
    const flags = detectFundamentalFlags(makeFundamentals({
      earnings_growth_qoq: 0.2,
      earnings_growth_yoy: 0.15,
    }));
    expect(flags).toContain('ACCELERATING_EARNINGS');
  });

  it('detects MARGIN_EXPANSION', () => {
    const flags = detectFundamentalFlags(makeFundamentals({
      operating_margin: 0.25,
      gross_margin: 0.55,
    }));
    expect(flags).toContain('MARGIN_EXPANSION');
  });

  it('detects HIGH_ROE', () => {
    const flags = detectFundamentalFlags(makeFundamentals({ roe: 0.3 }));
    expect(flags).toContain('HIGH_ROE');
  });

  it('detects OVER_LEVERAGED', () => {
    const flags = detectFundamentalFlags(makeFundamentals({ debt_to_equity: 3.0 }));
    expect(flags).toContain('OVER_LEVERAGED');
  });

  it('detects NEGATIVE_EARNINGS', () => {
    const flags = detectFundamentalFlags(makeFundamentals({ net_margin: -0.1 }));
    expect(flags).toContain('NEGATIVE_EARNINGS');
  });

  it('detects CASH_MACHINE', () => {
    const flags = detectFundamentalFlags(makeFundamentals({
      net_margin: 0.2,
      roe: 0.25,
      debt_to_equity: 0.5,
    }));
    expect(flags).toContain('CASH_MACHINE');
  });

  it('returns empty array when no conditions met', () => {
    const flags = detectFundamentalFlags(makeFundamentals({
      pe_ratio: 20,
      revenue_growth_yoy: 0.05,
    }));
    expect(flags).toEqual([]);
  });
});
