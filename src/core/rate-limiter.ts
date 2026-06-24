// ═══ Rate Limiter ════════════════════════════════════════════════════════════
// F4 enterprise hardening — per-tenant rate/resource limit guard (ROADMAP F4-003).
// Sprint 211 (211-007): token-bucket limit check, no real async throttle.
// checkLimit(tenantId, action) → boolean (allowed / denied).

import type { FlowConfig } from './enterprise-config.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BucketState {
  count: number;
  windowStart: number;
}

export interface RateLimitResult {
  allowed: boolean;
  tenantId: string;
  action: string;
  count: number;
  limit: number;
}

// ─── TenantRateLimiter ───────────────────────────────────────────────────────

/**
 * Per-tenant token-bucket rate limiter.
 * Tracks concurrent action count per tenant; denies when count >= maxConcurrent.
 * Resets automatically after windowMs (default 60 000 ms).
 * `action` is accepted for API surface completeness; per-action limits are a V2 concern.
 */
export class TenantRateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly maxConcurrent: number;
  private readonly windowMs: number;

  constructor(flow?: Pick<FlowConfig, 'maxConcurrent'>, windowMs = 60_000) {
    this.maxConcurrent = flow?.maxConcurrent ?? 10;
    this.windowMs = windowMs;
  }

  /**
   * Check whether tenantId may perform action.
   * Increments the bucket count on allow; returns false without incrementing on deny.
   */
  checkLimit(tenantId: string, _action: string): boolean {
    const now = Date.now();
    const bucket = this.getOrCreateBucket(tenantId, now);

    if (now - bucket.windowStart >= this.windowMs) {
      bucket.count = 0;
      bucket.windowStart = now;
    }

    if (bucket.count >= this.maxConcurrent) {
      return false;
    }

    bucket.count += 1;
    return true;
  }

  /**
   * Check limit and return full result object including metadata.
   */
  checkLimitResult(tenantId: string, action: string): RateLimitResult {
    const before = this.getBucketCount(tenantId);
    const allowed = this.checkLimit(tenantId, action);
    return {
      allowed,
      tenantId,
      action,
      count: allowed ? before + 1 : before,
      limit: this.maxConcurrent,
    };
  }

  /** Reset bucket for a tenant (explicit release or window expiry). */
  resetLimit(tenantId: string): void {
    this.buckets.delete(tenantId);
  }

  /** Current count for tenant (0 if no bucket exists). */
  getBucketCount(tenantId: string): number {
    return this.buckets.get(tenantId)?.count ?? 0;
  }

  private getOrCreateBucket(tenantId: string, now: number): BucketState {
    let bucket = this.buckets.get(tenantId);
    if (!bucket) {
      bucket = { count: 0, windowStart: now };
      this.buckets.set(tenantId, bucket);
    }
    return bucket;
  }
}
