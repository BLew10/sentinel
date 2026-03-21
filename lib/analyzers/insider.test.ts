import { describe, it, expect } from 'vitest';
import { computeInsiderScore, computeInstitutionalScore } from './insider';

describe('computeInsiderScore', () => {
  it('returns 50 for null input', () => {
    expect(computeInsiderScore(null)).toBe(50);
  });

  it('returns high score for heavy insider buying', () => {
    const score = computeInsiderScore({
      symbol: 'TEST',
      signal_type: 'cluster_buy',
      num_buyers_30d: 4,
      num_sellers_30d: 0,
      net_buy_value_30d: 3_000_000,
      largest_transaction_value: 1_500_000,
      largest_transaction_name: 'CEO',
      conviction_score: null,
      ai_summary: null,
      updated_at: new Date().toISOString(),
    });
    expect(score).toBeGreaterThan(70);
  });

  it('returns low score for heavy insider selling', () => {
    const score = computeInsiderScore({
      symbol: 'TEST',
      signal_type: 'cluster_sell',
      num_buyers_30d: 0,
      num_sellers_30d: 5,
      net_buy_value_30d: -8_000_000,
      largest_transaction_value: 3_000_000,
      largest_transaction_name: 'CFO',
      conviction_score: null,
      ai_summary: null,
      updated_at: new Date().toISOString(),
    });
    expect(score).toBeLessThan(35);
  });

  it('returns neutral score when no activity', () => {
    const score = computeInsiderScore({
      symbol: 'TEST',
      signal_type: null,
      num_buyers_30d: 0,
      num_sellers_30d: 0,
      net_buy_value_30d: 0,
      largest_transaction_value: null,
      largest_transaction_name: null,
      conviction_score: null,
      ai_summary: null,
      updated_at: new Date().toISOString(),
    });
    expect(score).toBe(50);
  });

  it('clamps output between 0 and 100', () => {
    const score = computeInsiderScore({
      symbol: 'TEST',
      signal_type: null,
      num_buyers_30d: 10,
      num_sellers_30d: 0,
      net_buy_value_30d: 100_000_000,
      largest_transaction_value: 50_000_000,
      largest_transaction_name: 'CEO',
      conviction_score: null,
      ai_summary: null,
      updated_at: new Date().toISOString(),
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('computeInstitutionalScore', () => {
  it('returns 50 for null input', () => {
    expect(computeInstitutionalScore(null)).toBe(50);
  });

  it('returns high score for net accumulation', () => {
    const score = computeInstitutionalScore({
      num_new_positions: 10,
      num_increased: 15,
      num_decreased: 3,
      num_closed: 1,
      net_institutional_flow: 50_000_000,
    });
    expect(score).toBeGreaterThan(60);
  });

  it('returns low score for net distribution', () => {
    const score = computeInstitutionalScore({
      num_new_positions: 1,
      num_increased: 2,
      num_decreased: 12,
      num_closed: 8,
      net_institutional_flow: -30_000_000,
    });
    expect(score).toBeLessThan(30);
  });

  it('returns neutral when no activity', () => {
    const score = computeInstitutionalScore({
      num_new_positions: 0,
      num_increased: 0,
      num_decreased: 0,
      num_closed: 0,
      net_institutional_flow: null,
    });
    expect(score).toBe(50);
  });
});
