// ─── Token-Bucket Rate Limiter ───────────────────────────────────────────────
// In-memory, per-IP, no external dependencies.

export interface RateLimiterOptions {
  /** Maximum requests per window (default: 60) */
  maxRequests?: number;
  /** Window duration in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
  /** Cleanup interval in milliseconds (default: 300_000 = 5 minutes) */
  cleanupIntervalMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Seconds until rate limit resets (only set when not allowed) */
  retryAfter?: number;
}

interface Bucket {
  /** Number of requests in current window */
  count: number;
  /** When the current window started (ms since epoch) */
  windowStart: number;
}

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly buckets: Map<string, Bucket> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: RateLimiterOptions = {}) {
    this.maxRequests = opts.maxRequests ?? 60;
    this.windowMs = opts.windowMs ?? 60_000;
    const cleanupMs = opts.cleanupIntervalMs ?? 300_000;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupMs);
    // Allow process to exit without waiting for this timer
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Check and consume one request slot for the given IP.
   * Returns whether the request is allowed, remaining slots, and retryAfter if blocked.
   */
  check(ip: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(ip);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      // New window
      bucket = { count: 1, windowStart: now };
      this.buckets.set(ip, bucket);
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (bucket.count >= this.maxRequests) {
      const windowEnd = bucket.windowStart + this.windowMs;
      const retryAfter = Math.ceil((windowEnd - now) / 1000);
      return { allowed: false, remaining: 0, retryAfter };
    }

    bucket.count++;
    return { allowed: true, remaining: this.maxRequests - bucket.count };
  }

  /** Remove buckets whose window has expired */
  cleanup(): void {
    const now = Date.now();
    for (const [ip, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.windowMs) {
        this.buckets.delete(ip);
      }
    }
  }

  /** Stop the background cleanup timer */
  destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Number of tracked IPs (for testing) */
  get size(): number {
    return this.buckets.size;
  }

  /** Reset all buckets (for testing) */
  reset(): void {
    this.buckets.clear();
  }
}
