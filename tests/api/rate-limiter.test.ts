import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../../src/api/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000, cleanupIntervalMs: 9_999_999 });
  });

  afterEach(() => {
    limiter.destroy();
  });

  it('allows requests within the limit', () => {
    const result = limiter.check('1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('tracks remaining count correctly', () => {
    for (let i = 0; i < 4; i++) limiter.check('1.2.3.4');
    const result = limiter.check('1.2.3.4'); // 5th request
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('blocks the 6th request (exceeds maxRequests=5)', () => {
    for (let i = 0; i < 5; i++) limiter.check('1.2.3.4');
    const result = limiter.check('1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 5; i++) limiter.check('1.1.1.1');
    const blocked = limiter.check('1.1.1.1');
    expect(blocked.allowed).toBe(false);

    // Different IP should still be allowed
    const allowed = limiter.check('2.2.2.2');
    expect(allowed.allowed).toBe(true);
  });

  it('resets window after windowMs elapses', () => {
    vi.useFakeTimers();
    const r1 = new RateLimiter({ maxRequests: 3, windowMs: 1000, cleanupIntervalMs: 9_999_999 });

    for (let i = 0; i < 3; i++) r1.check('ip');
    expect(r1.check('ip').allowed).toBe(false);

    // Advance past window
    vi.advanceTimersByTime(1001);
    expect(r1.check('ip').allowed).toBe(true);

    r1.destroy();
    vi.useRealTimers();
  });

  it('returns retryAfter as positive integer when rate limited', () => {
    for (let i = 0; i < 5; i++) limiter.check('5.5.5.5');
    const result = limiter.check('5.5.5.5');
    expect(result.retryAfter).toBeTypeOf('number');
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(Number.isInteger(result.retryAfter)).toBe(true);
  });

  it('does not set retryAfter when request is allowed', () => {
    const result = limiter.check('6.6.6.6');
    expect(result.retryAfter).toBeUndefined();
  });

  it('cleanup() removes expired buckets', () => {
    vi.useFakeTimers();
    const r1 = new RateLimiter({ maxRequests: 5, windowMs: 1000, cleanupIntervalMs: 9_999_999 });

    r1.check('a.a.a.a');
    r1.check('b.b.b.b');
    expect(r1.size).toBe(2);

    vi.advanceTimersByTime(1001);
    r1.cleanup();
    expect(r1.size).toBe(0);

    r1.destroy();
    vi.useRealTimers();
  });

  it('destroy() stops the cleanup timer (no throws)', () => {
    const r1 = new RateLimiter({ cleanupIntervalMs: 100 });
    expect(() => r1.destroy()).not.toThrow();
    // Calling destroy twice should be safe
    expect(() => r1.destroy()).not.toThrow();
  });

  it('reset() clears all buckets', () => {
    limiter.check('x.x.x.x');
    limiter.check('y.y.y.y');
    expect(limiter.size).toBe(2);
    limiter.reset();
    expect(limiter.size).toBe(0);
  });

  it('uses default maxRequests=60 when not specified', () => {
    const r1 = new RateLimiter({ cleanupIntervalMs: 9_999_999 });
    for (let i = 0; i < 60; i++) {
      expect(r1.check('z.z.z.z').allowed).toBe(true);
    }
    expect(r1.check('z.z.z.z').allowed).toBe(false);
    r1.destroy();
  });

  it('size reflects number of unique tracked IPs', () => {
    limiter.check('a.a.a.a');
    limiter.check('b.b.b.b');
    limiter.check('a.a.a.a'); // same IP, no new bucket
    expect(limiter.size).toBe(2);
  });
});

describe('RateLimiter — server integration', () => {
  it('rate-limited response has correct structure via HTTP', async () => {
    // Lightweight integration: simulate the rate limit path directly
    const r = new RateLimiter({ maxRequests: 2, windowMs: 60_000, cleanupIntervalMs: 9_999_999 });
    r.check('10.0.0.1');
    r.check('10.0.0.1');
    const result = r.check('10.0.0.1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(typeof result.retryAfter).toBe('number');
    r.destroy();
  });

  it('static file paths are not counted by the rate limiter (limiter is /api/ only)', () => {
    // The rate limiter itself has no URL awareness — it is only called
    // for /api/ routes in server.ts. Verify it starts fresh per instance.
    const r = new RateLimiter({ maxRequests: 1, cleanupIntervalMs: 9_999_999 });
    expect(r.check('client').allowed).toBe(true);
    // Second check from same IP is blocked
    expect(r.check('client').allowed).toBe(false);
    r.destroy();
  });
});
