import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../../src/core/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxConcurrent: 3 });
  });

  it('allows requests below the limit', () => {
    expect(limiter.checkLimit('tenant-a', 'sprint:start')).toBe(true);
    expect(limiter.checkLimit('tenant-a', 'sprint:start')).toBe(true);
    expect(limiter.getBucketCount('tenant-a')).toBe(2);
  });

  it('denies requests at or above the limit', () => {
    limiter.checkLimit('tenant-a', 'sprint:start');
    limiter.checkLimit('tenant-a', 'sprint:start');
    limiter.checkLimit('tenant-a', 'sprint:start');
    // 4th call should be denied
    expect(limiter.checkLimit('tenant-a', 'sprint:start')).toBe(false);
    // count must not increment on deny
    expect(limiter.getBucketCount('tenant-a')).toBe(3);
  });

  it('allows requests again after resetLimit', () => {
    limiter.checkLimit('tenant-a', 'sprint:start');
    limiter.checkLimit('tenant-a', 'sprint:start');
    limiter.checkLimit('tenant-a', 'sprint:start');
    expect(limiter.checkLimit('tenant-a', 'sprint:start')).toBe(false);

    limiter.resetLimit('tenant-a');
    expect(limiter.getBucketCount('tenant-a')).toBe(0);
    expect(limiter.checkLimit('tenant-a', 'sprint:start')).toBe(true);
  });

  it('isolates tenants — tenant B limit is independent of tenant A', () => {
    // Fill tenant-a to the limit
    limiter.checkLimit('tenant-a', 'sprint:start');
    limiter.checkLimit('tenant-a', 'sprint:start');
    limiter.checkLimit('tenant-a', 'sprint:start');
    expect(limiter.checkLimit('tenant-a', 'sprint:start')).toBe(false);

    // tenant-b should still be allowed
    expect(limiter.checkLimit('tenant-b', 'sprint:start')).toBe(true);
    expect(limiter.getBucketCount('tenant-b')).toBe(1);
  });

  it('checkLimitResult returns metadata on allow', () => {
    const result = limiter.checkLimitResult('tenant-c', 'flow:manage');
    expect(result.allowed).toBe(true);
    expect(result.tenantId).toBe('tenant-c');
    expect(result.action).toBe('flow:manage');
    expect(result.count).toBe(1);
    expect(result.limit).toBe(3);
  });

  it('checkLimitResult returns metadata on deny', () => {
    limiter.checkLimit('tenant-c', 'flow:manage');
    limiter.checkLimit('tenant-c', 'flow:manage');
    limiter.checkLimit('tenant-c', 'flow:manage');
    const result = limiter.checkLimitResult('tenant-c', 'flow:manage');
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(3);
    expect(result.limit).toBe(3);
  });

  it('uses default maxConcurrent (10) when no flow config provided', () => {
    const defaultLimiter = new RateLimiter();
    for (let i = 0; i < 10; i++) {
      expect(defaultLimiter.checkLimit('tenant-d', 'action')).toBe(true);
    }
    expect(defaultLimiter.checkLimit('tenant-d', 'action')).toBe(false);
  });

  it('resets bucket on window expiry', () => {
    const shortWindowLimiter = new RateLimiter({ maxConcurrent: 2 }, 50);
    shortWindowLimiter.checkLimit('tenant-e', 'action');
    shortWindowLimiter.checkLimit('tenant-e', 'action');
    expect(shortWindowLimiter.checkLimit('tenant-e', 'action')).toBe(false);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // After window expiry, count should reset
        expect(shortWindowLimiter.checkLimit('tenant-e', 'action')).toBe(true);
        resolve();
      }, 60);
    });
  });
});
