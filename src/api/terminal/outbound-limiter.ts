const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WARN_FRACTION = 0.5;

export type OutboundAction = 'pass' | 'warn' | 'kill';

export interface OutboundTrackResult {
  action: OutboundAction;
  bytesUsed: number;
  bytesRemaining: number;
}

export interface OutboundLimiterOptions {
  quotaBytes: number;
  windowMs?: number;
  warnFraction?: number;
  now?: () => number;
}

interface TenantState {
  bytes: number;
  warned: boolean;
  windowStart: number;
}

/**
 * Per-tenant outbound byte budget for the WS gateway send hook (W4-10).
 *
 * Invariant I5 — tenant isolation: each tenant's quota is partitioned;
 * one tenant exhausting its budget MUST NOT affect another tenant's pass/warn
 * decision (zero cross-tenant leakage).
 *
 * Decision contract:
 *   - bytesUsed < warn threshold → 'pass'
 *   - bytesUsed crosses warn threshold (first time in window) → 'warn'
 *   - subsequent calls in same window stay 'pass' (one-shot warn) until kill
 *   - bytesUsed ≥ quotaBytes → 'kill' (sticky for the rest of the window)
 *
 * The window auto-rotates on the first `track()` call after `windowMs`
 * elapses since `windowStart`.
 */
export class OutboundLimiter {
  private state = new Map<string, TenantState>();
  private readonly quotaBytes: number;
  private readonly windowMs: number;
  private readonly warnThreshold: number;
  private readonly now: () => number;

  constructor(opts: OutboundLimiterOptions) {
    if (opts.quotaBytes <= 0) {
      throw new Error('OutboundLimiter: quotaBytes must be > 0');
    }
    this.quotaBytes = opts.quotaBytes;
    this.windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
    const fraction = opts.warnFraction ?? DEFAULT_WARN_FRACTION;
    this.warnThreshold = Math.floor(this.quotaBytes * fraction);
    this.now = opts.now ?? (() => Date.now());
  }

  track(tenantId: string, bytes: number): OutboundTrackResult {
    if (bytes < 0) bytes = 0;
    const t = this.now();
    let s = this.state.get(tenantId);
    if (!s || t - s.windowStart >= this.windowMs) {
      s = { bytes: 0, warned: false, windowStart: t };
      this.state.set(tenantId, s);
    }
    s.bytes += bytes;
    const bytesUsed = s.bytes;
    const bytesRemaining = Math.max(0, this.quotaBytes - bytesUsed);
    if (bytesUsed >= this.quotaBytes) {
      return { action: 'kill', bytesUsed, bytesRemaining: 0 };
    }
    if (!s.warned && bytesUsed >= this.warnThreshold) {
      s.warned = true;
      return { action: 'warn', bytesUsed, bytesRemaining };
    }
    return { action: 'pass', bytesUsed, bytesRemaining };
  }

  usage(tenantId: string): number {
    const s = this.state.get(tenantId);
    if (!s) return 0;
    if (this.now() - s.windowStart >= this.windowMs) return 0;
    return s.bytes;
  }

  reset(tenantId?: string): void {
    if (tenantId === undefined) this.state.clear();
    else this.state.delete(tenantId);
  }
}
