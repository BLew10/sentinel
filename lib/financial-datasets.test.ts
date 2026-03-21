import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyApiError, FDApiError, getCircuitBreakerState, resetCircuitBreaker } from './financial-datasets';

describe('classifyApiError', () => {
  it('classifies 401 as auth', () => {
    expect(classifyApiError(401)).toBe('auth');
  });

  it('classifies 403 as auth', () => {
    expect(classifyApiError(403)).toBe('auth');
  });

  it('classifies 429 as rate_limit', () => {
    expect(classifyApiError(429)).toBe('rate_limit');
  });

  it('classifies 404 as not_found', () => {
    expect(classifyApiError(404)).toBe('not_found');
  });

  it('classifies 500 as server_error', () => {
    expect(classifyApiError(500)).toBe('server_error');
  });

  it('classifies 502 as server_error', () => {
    expect(classifyApiError(502)).toBe('server_error');
  });

  it('classifies 503 as server_error', () => {
    expect(classifyApiError(503)).toBe('server_error');
  });

  it('classifies 400 as unknown', () => {
    expect(classifyApiError(400)).toBe('unknown');
  });

  it('classifies 418 as unknown', () => {
    expect(classifyApiError(418)).toBe('unknown');
  });
});

describe('FDApiError', () => {
  it('sets category based on status code', () => {
    const err = new FDApiError(429, 'Rate limited', '/api/test');
    expect(err.category).toBe('rate_limit');
    expect(err.status).toBe(429);
    expect(err.url).toBe('/api/test');
    expect(err.name).toBe('FDApiError');
  });

  it('sets circuit_open category for status 0', () => {
    const err = new FDApiError(0, 'Circuit open', '/api/test');
    expect(err.category).toBe('circuit_open');
  });

  it('is an instance of Error', () => {
    const err = new FDApiError(500, 'Server error', '/api/test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FDApiError);
  });
});

describe('circuit breaker state', () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  it('starts closed', () => {
    const state = getCircuitBreakerState();
    expect(state.open).toBe(false);
    expect(state.failures).toBe(0);
    expect(state.threshold).toBe(5);
  });

  it('resets correctly', () => {
    resetCircuitBreaker();
    const state = getCircuitBreakerState();
    expect(state.open).toBe(false);
    expect(state.failures).toBe(0);
  });
});
