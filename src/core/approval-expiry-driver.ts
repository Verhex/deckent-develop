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
import type { ApprovalStore, ApprovalTimeoutReceipt } from './approval-store.js';
import type { ApprovalRequestV2 } from './approval-contract.js';
import type { ApprovalSlaEvidence, ApprovalSlaJournal } from './approval-sla.js';

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
  /** Idempotent downstream settlement hook. Durable receipt bytes are written
   * before this callback is invoked; async failures are routed to onTickError. */
  onTimeoutReceipt?: (receipt: ApprovalTimeoutReceipt) => void | Promise<void>;
  /** Scheduled sweep for durable origin stores that predate ApprovalStore.
   * Production composition supplies confirmation/autonomous/pairing adapters. */
  onLegacyLifecycleSweep?: (observedAt: Date) => void | Promise<void>;
  slaJournal?: ApprovalSlaJournal;
  onLifecycleStage?: (request: ApprovalRequestV2, evidence: ApprovalSlaEvidence) => void | Promise<void>;
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
  private readonly onTimeoutReceipt: ((receipt: ApprovalTimeoutReceipt) => void | Promise<void>) | undefined;
  private readonly onLegacyLifecycleSweep: ((observedAt: Date) => void | Promise<void>) | undefined;
  private readonly slaJournal: ApprovalSlaJournal | undefined;
  private readonly onLifecycleStage:
    ((request: ApprovalRequestV2, evidence: ApprovalSlaEvidence) => void | Promise<void>) | undefined;

  private timer: ReturnType<typeof setInterval> | undefined;
  private lifecycleTickInFlight: Promise<string[]> | undefined;
  private readonly deliveredTimeoutReceipts = new Set<string>();
  private readonly timeoutReceiptDeliveryInFlight = new Set<string>();

  constructor(options: ApprovalExpiryDriverOptions) {
    this.broker = options.broker;
    this.store = options.store;
    this.pruneOlderThanMs = options.pruneOlderThanMs ?? DEFAULT_PRUNE_OLDER_THAN_MS;
    this.clock = options.clock ?? (() => new Date());
    this.onTickError =
      options.onTickError ?? ((error) => console.error('[approval-expiry-driver] tick failed:', error));
    this.onTimeoutReceipt = options.onTimeoutReceipt;
    this.onLegacyLifecycleSweep = options.onLegacyLifecycleSweep;
    this.slaJournal = options.slaJournal;
    this.onLifecycleStage = options.onLifecycleStage;
  }

  private receiptDeliveryKey(receipt: ApprovalTimeoutReceipt): string {
    return `${receipt.requestId}\u0000${receipt.lifecycleGeneration}\u0000${receipt.decidedAt}`;
  }

  private deliverTimeoutReceipt(receipt: ApprovalTimeoutReceipt): void | Promise<void> {
    if (!this.onTimeoutReceipt) return;
    const key = this.receiptDeliveryKey(receipt);
    if (this.deliveredTimeoutReceipts.has(key) || this.timeoutReceiptDeliveryInFlight.has(key)) return;
    try {
      const result = this.onTimeoutReceipt(receipt);
      if (result instanceof Promise) {
        this.timeoutReceiptDeliveryInFlight.add(key);
        return result.then(() => {
          this.deliveredTimeoutReceipts.add(key);
        }).finally(() => {
          this.timeoutReceiptDeliveryInFlight.delete(key);
        });
      }
      this.deliveredTimeoutReceipts.add(key);
    } catch (error) {
      this.onTickError(error);
    }
  }

  private recoveredTimeoutReceipts(): ApprovalTimeoutReceipt[] {
    return this.store.listTimeoutReceipts();
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
      if (this.onLegacyLifecycleSweep) {
        try {
          const result = this.onLegacyLifecycleSweep(now);
          if (result instanceof Promise) result.catch(this.onTickError);
        } catch (error) {
          this.onTickError(error);
        }
      }
      this.store.persistPolicyTransitions?.(now);
      const brokerSwept = this.broker.expire(now).map((decision) => decision.requestId);
      const storeSwept = this.store.sweepExpired(now);
      const swept = [...new Set([...brokerSwept, ...storeSwept])];
      for (const receipt of this.recoveredTimeoutReceipts()) {
        const delivery = this.deliverTimeoutReceipt(receipt);
        if (delivery instanceof Promise) delivery.catch(this.onTickError);
      }
      this.store.prune(new Date(now.getTime() - this.pruneOlderThanMs));
      return swept;
    } catch (error) {
      this.onTickError(error);
      return [];
    }
  }

  /** Full lifecycle tick used by production composition. SLA audit/outbox
   * bytes are durable before delivery; ACK is durable only after the channel
   * callback succeeds. Overdue closure and receipt settle after stage advance. */
  async tickLifecycle(): Promise<string[]> {
    try {
      const now = this.clock();
      if (this.onLegacyLifecycleSweep) {
        try {
          await this.onLegacyLifecycleSweep(now);
        } catch (error) {
          this.onTickError(error);
        }
      }
      this.store.persistPolicyTransitions?.(now);
      const snapshot = this.store.index(now);
      if (this.slaJournal && this.onLifecycleStage) {
        for (const entry of [...snapshot.pending, ...snapshot.expired]) {
          if (entry.request.version !== '2.0' || !entry.lifecycle || entry.decision) continue;
          const advanced = this.slaJournal.advance({
            requestId: entry.request.id,
            lifecycleGeneration: entry.request.lifecycleGeneration,
            createdAt: entry.request.createdAt,
            expiresAt: entry.lifecycle.effectiveExpiresAt,
            policy: {
              slaMs: entry.lifecycle.appliedProfile.slaMs,
              authoredPolicyDigest: entry.lifecycle.authoredPolicyDigest,
              appliedPolicyDigest: entry.lifecycle.appliedPolicyDigest,
            },
            clock: { now: () => now },
          });
          for (const evidence of advanced.outbound) {
            await this.onLifecycleStage(entry.request, evidence);
            this.slaJournal.acknowledge(evidence);
          }
        }
      }
      const brokerSwept = this.broker.expire(now).map((decision) => decision.requestId);
      const storeSwept = this.store.sweepExpired(now);
      const swept = [...new Set([...brokerSwept, ...storeSwept])];
      for (const receipt of this.recoveredTimeoutReceipts()) {
        const delivery = this.deliverTimeoutReceipt(receipt);
        if (delivery instanceof Promise) await delivery;
      }
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
    const run = (): void => {
      if ((this.slaJournal && this.onLifecycleStage) || this.onLegacyLifecycleSweep) {
        if (this.lifecycleTickInFlight) return;
        this.lifecycleTickInFlight = this.tickLifecycle()
          .finally(() => { this.lifecycleTickInFlight = undefined; });
      } else this.tick();
    };
    run();
    const timer = setInterval(run, intervalMs);
    timer.unref?.();
    this.timer = timer;
  }

  /** Stop the sweep. Idempotent — safe when not running or called repeatedly. */
  stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Await the currently admitted async tick during graceful shutdown. */
  async settleInFlight(): Promise<void> {
    await this.lifecycleTickInFlight;
  }

  /** Whether the periodic sweep is currently running. */
  get running(): boolean {
    return this.timer !== undefined;
  }
}
