import { describe, expect, it } from 'vitest';
import { createRateLimiter, NoopRateLimiter, TokenBucket } from '../src/providers/rate-limiter.ts';

describe('TokenBucket rate limiter', () => {
  it('paces acquisitions to roughly the requested rps', async () => {
    const limiter = new TokenBucket({ rps: 100, burst: 1 });
    const start = Date.now();
    for (let i = 0; i < 5; i++) await limiter.acquire();
    const elapsed = Date.now() - start;
    // 5 acquisitions at 100 rps => ~40ms minimum spacing in total.
    expect(elapsed).toBeGreaterThanOrEqual(35);
    expect(elapsed).toBeLessThan(2_000);
  });

  it('is safe under concurrent consumers', async () => {
    const limiter = new TokenBucket({ rps: 200, burst: 1 });
    const start = Date.now();
    await Promise.all(Array.from({ length: 6 }, () => limiter.acquire()));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(20);
    expect(limiter.snapshot().queued).toBe(0);
  });

  it('rejects invalid configuration', () => {
    expect(() => new TokenBucket({ rps: 0 })).toThrow();
    expect(() => new TokenBucket({ rps: -1 })).toThrow();
  });
});

describe('factory + noop limiter', () => {
  it('createRateLimiter returns Noop for falsy/zero values', () => {
    expect(createRateLimiter(null)).toBeInstanceOf(NoopRateLimiter);
    expect(createRateLimiter(0)).toBeInstanceOf(NoopRateLimiter);
    expect(createRateLimiter(undefined)).toBeInstanceOf(NoopRateLimiter);
  });

  it('createRateLimiter returns a TokenBucket for positive rps', () => {
    expect(createRateLimiter(5)).toBeInstanceOf(TokenBucket);
  });

  it('Noop limiter never blocks', async () => {
    const start = Date.now();
    for (let i = 0; i < 50; i++) await new NoopRateLimiter().acquire();
    expect(Date.now() - start).toBeLessThan(100);
  });
});
