import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry';

describe('withRetry', () => {
  it('returns immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 10 }))
      .rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects shouldRetry predicate — does not retry when false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('auth error'));

    await expect(withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      shouldRetry: () => false,
    })).rejects.toThrow('auth error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry callback with attempt info', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('ok');

    await withRetry(fn, { maxRetries: 2, baseDelayMs: 10, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });

  it('respects maxDelayMs cap', async () => {
    const delays: number[] = [];
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    await withRetry(fn, {
      maxRetries: 1,
      baseDelayMs: 50000,
      maxDelayMs: 100,
      onRetry: (_err, _attempt, delayMs) => { delays.push(delayMs); },
    });

    expect(delays[0]).toBeLessThanOrEqual(100);
  });
});
