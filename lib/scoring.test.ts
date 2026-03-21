import { describe, it, expect } from 'vitest';
import { computeCompositeScore } from './scoring';
import { SCORE_WEIGHTS } from './utils/constants';

describe('SCORE_WEIGHTS', () => {
  it('weights sum to 100', () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBe(100);
  });
});

describe('computeCompositeScore', () => {
  it('returns all 50 when all inputs are null', () => {
    const result = computeCompositeScore({
      technical: null,
      fundamentals: null,
      insider: null,
      institutional: null,
      news: null,
    });
    expect(result.sentinel_score).toBe(50);
    expect(result.technical_score).toBe(50);
    expect(result.fundamental_score).toBe(50);
    expect(result.insider_score).toBe(50);
    expect(result.institutional_score).toBe(50);
    expect(result.news_sentiment_score).toBe(50);
    expect(result.options_flow_score).toBe(50);
  });

  it('returns integer scores', () => {
    const result = computeCompositeScore({
      technical: null,
      fundamentals: null,
      insider: null,
      institutional: null,
      news: null,
    });
    expect(Number.isInteger(result.sentinel_score)).toBe(true);
    expect(Number.isInteger(result.technical_score)).toBe(true);
    expect(Number.isInteger(result.fundamental_score)).toBe(true);
  });

  it('incorporates earningsAiScore when provided', () => {
    const withDefault = computeCompositeScore({
      technical: null,
      fundamentals: null,
      insider: null,
      institutional: null,
      news: null,
    });

    const withHighAi = computeCompositeScore({
      technical: null,
      fundamentals: null,
      insider: null,
      institutional: null,
      news: null,
      earningsAiScore: 90,
    });

    expect(withHighAi.earnings_ai_score).toBe(90);
    expect(withHighAi.sentinel_score).toBeGreaterThan(withDefault.sentinel_score);
  });

  it('clamps sentinel_score between 0 and 100', () => {
    const result = computeCompositeScore({
      technical: null,
      fundamentals: null,
      insider: null,
      institutional: null,
      news: null,
      earningsAiScore: 100,
    });
    expect(result.sentinel_score).toBeGreaterThanOrEqual(0);
    expect(result.sentinel_score).toBeLessThanOrEqual(100);
  });

  it('produces correct structure shape', () => {
    const result = computeCompositeScore({
      technical: null,
      fundamentals: null,
      insider: null,
      institutional: null,
      news: null,
    });

    expect(result).toHaveProperty('sentinel_score');
    expect(result).toHaveProperty('technical_score');
    expect(result).toHaveProperty('fundamental_score');
    expect(result).toHaveProperty('earnings_ai_score');
    expect(result).toHaveProperty('insider_score');
    expect(result).toHaveProperty('institutional_score');
    expect(result).toHaveProperty('news_sentiment_score');
    expect(result).toHaveProperty('options_flow_score');
  });
});
