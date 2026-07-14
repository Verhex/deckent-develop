// ─── ApprovalExpiryDriver — TTL sweep + retention prune (APR-EXPIRY-DRIVER) ──
// Wires the approval TTL sweep + retention prune behind a single lifecycle-safe
// periodic driver. Each tick() runs, in order: ApprovalBroker.expire() (in-memory
// TTL close of requests THIS process submitted, resolving their local awaiters),
// ApprovalStore.sweepExpired() (the AUTHORITATIVE disk sweep — closes every
// overdue request on disk regardless of submitting process, the cross-process
// case broker.expire() cannot see), then ApprovalStore.prune() (retention cleanup
// of already-decided entries). This module is the first production caller of all.
//
// ADR-G-013 (Graceful Shutdown & Lifecycle): the periodic interval MUST NOT
// pin the coordinator process alive on its own — `start()` unref's the timer,
// mirroring the same fix applied to the worker heartbeat interval in
// providers/subprocess.ts (MOAT-2).

import type { ApprovalBroker } from './approval-broker.js';
import type { ApprovalStore } from './approval-store.js';

/** Decided approval records (approved/denied/swept-expired) are pruned from
 *  disk one week after their decision — long enough for audit/debugging,
 *  short enough that the store directory does not grow unbounded. */
const DEFAULT_PRUNE_OLDER_THAN_MS = 7 * 24 * 60 * 60 * 1000;

export interface ApprovalExpiryDriverOptions {
  broker: ApprovalBroker;
  store: ApprovalStore;
  /** How old a decided entry must be (relative to `clock()` at tick time)
   *  before `store.prune()` removes it. Default: 7 days. */
  pruneOlderThanMs?: number;
  /** Injectable clock — defaults to `() => new Date()`. Tests override this
   *  for deterministic (fake-clock) expiry/prune assertions. */
  clock?: () => Date;
  /** Fail-soft sink for tick() errors. Defaults to `console.error`. A tick
   *  failure is logged, never thrown — the driver must survive a broken
   *  broker/store call without killing the interval loop. */
  onTickError?: (error: unknown) => void;
}

/**
 * Lifecycle-safe periodic sweeper: every `intervalMs`, `tick()` runs
 * `broker.expire()` (in-memory TTL sweep) then `store.sweepExpired()` (disk TTL
 * sweep) then `store.prune()` (retention cleanup). `start()`/`stop()` are
 * idempotent; `tick()` is exposed directly for tests and for callers that want
 * to force an immediate sweep.
 */
export class ApprovalExpiryDriver {
  private readonly broker: ApprovalBroker;
  private readonly store: ApprovalStore;
  private readonly pruneOlderThanMs: number;
  private readonly clock: () => Date;
  private readonly onTickError: (error: unknown) => void;

  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: ApprovalExpiryDriverOptions) {
    this.broker = options.broker;
    this.store = options.store;
    this.pruneOlderThanMs = options.pruneOlderThanMs ?? DEFAULT_PRUNE_OLDER_THAN_MS;
    this.clock = options.clock ?? (() => new Date());
    this.onTickError =
      options.onTickError ?? ((error) => console.error('[approval-expiry-driver] tick failed:', error));
  }

  /**
   * Run a single sweep: TTL-expire due pending requests, then prune decided
   * entries older than `pruneOlderThanMs`. Returns the ids closed by the disk
   * sweep this tick (empty on a no-op or failed tick). Fail-soft — any thrown
   * error is routed to `onTickError` and swallowed; the driver never dies from a
   * single bad tick.
   *
   * Order is deliberate. `broker.expire()` runs FIRST: it TTL-closes requests
   * this process submitted in-memory and resolves their local awaiters, checking
   * only its own in-memory decision map — so it must write before the disk sweep
   * re-scans, else the sweep would re-close an already-closed id. `store
   * .sweepExpired()` then runs the AUTHORITATIVE disk sweep — it closes every
   * overdue request on disk regardless of which process submitted it (the
   * cross-process case `broker.expire()` cannot see) and re-indexes the store, so
   * `prune()` below acts on a fresh snapshot (no separate `store.index()` needed).
   */
  tick(): string[] {
    try {
      const now = this.clock();
      this.broker.expire(now);
      const swept = this.store.sweepExpired(now);
      this.store.prune(new Date(now.getTime() - this.pruneOlderThanMs));
      return swept;
    } catch (error) {
      this.onTickError(error);
      return [];
    }
  }

  /**
   * Start the periodic sweep. No-op if already running. The interval is
   * `.unref()`'d (ADR-G-013) — it never keeps the coordinator process alive
   * by itself.
   */
  start(intervalMs: number): void {
    if (this.timer !== undefined) return;
    const timer = setInterval(() => this.tick(), intervalMs);
    timer.unref?.();
    this.timer = timer;
  }

  /** Stop the sweep. Idempotent — safe when not running or called repeatedly. */
  stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Whether the periodic sweep is currently running. */
  get running(): boolean {
    return this.timer !== undefined;
  }
}
