// ─── ApprovalStoreWatch — cross-process directory-watcher core (APR-XPROC-CORE) ──
// Fixes the "no store-replay on attach" gap: a relay/REPL that attaches an
// ApprovalStore AFTER another process already wrote pending requests to disk
// never learned about them (MASTER-PLAN Sıra-462). This module watches
// `storeDir` (fs.watch + an ALWAYS-ON poll fallback — fs.watch is known
// unreliable on WSL / network filesystems, Yasa #2) and reports every
// new/changed record — including everything already on disk at attach time —
// via `handlers.onPending` / `handlers.onDecided`.
//
// Deliberately a PEER, not a wrapper, of the consumption side: it reuses
// `ApprovalStore.load()` — the store's own tolerant, categorizing read helper
// — for every scan, so parsing/categorization/torn-file-tolerance is never
// re-derived here. Consumption (broker/relay wiring) is out of scope; see
// APR-XPROC-WIRE.

import { watch as fsWatch } from 'node:fs';
import { ApprovalStore, type ApprovalStoreCategory, type ApprovalStoreSnapshot } from './approval-store.js';
import type { ApprovalDecision, ApprovalRequest } from './approval-contract.js';

// ─── Handlers + options ──────────────────────────────────────────────────────

export interface ApprovalStoreWatchHandlers {
  /** Fired once per request id the first time it is observed in the `pending`
   *  category — including one already on disk at attach time (store-replay). */
  onPending?: (request: ApprovalRequest) => void;
  /** Fired once per request id the first time it is observed with a decision
   *  file on disk (approved / denied / swept-expired-via-ttl). */
  onDecided?: (id: string, decision: ApprovalDecision) => void;
}

/** Injectable fs.watch seam (tests substitute a controllable stub). Production
 *  default wraps `node:fs` `watch` on `storeDir`, unref'd. Must never throw —
 *  the poll fallback is what carries correctness when this is unavailable. */
export type ApprovalStoreWatchFsWatcher = (dir: string, onChange: () => void) => { close(): void };

export interface ApprovalStoreWatchOptions {
  /** Poll-fallback cadence. ALWAYS runs alongside fs.watch — never merely a
   *  fallback for a failed `watch()` call, since fs.watch is known to
   *  silently miss events on WSL / network filesystems. Default 1000ms. */
  pollIntervalMs?: number;
  /** Injectable clock (tests). Default real wall-clock (`() => new Date()`). */
  clock?: () => Date;
  /** Injectable fs.watch seam (tests). Default: real `node:fs` `watch`. */
  watch?: ApprovalStoreWatchFsWatcher;
  /** Injectable one-shot scan (tests). Default: `ApprovalStore.load`, the
   *  EXISTING tolerant/categorizing read helper — never re-derived here. */
  scan?: (dir: string, now: Date) => ApprovalStoreSnapshot;
  /** Injectable expiry sweep (tests substitute a throwing fake to prove
   *  fail-soft). Default: a fresh `ApprovalStore` pointed at `storeDir`,
   *  calling its own `sweepExpired`. Runs before every poll-tick's `scan()` —
   *  EXPIRE-SWEEP wiring (Task-1's `ApprovalStore.sweepExpired()`). Without
   *  this, an overdue-but-undecided request sits in the `expired` category
   *  with a `null` decision, which BOTH the pending loop (already excluded —
   *  `categorize()` buckets it `expired` by `expiresAt` alone) AND the
   *  decided loop (`if (!entry.decision) continue`) below skip — so
   *  `onDecided` never fires for it and a bot that already sent the pending
   *  card upstream waits forever (the Telegram infinite-approval-loop root
   *  cause). Sweeping writes the honest ttl-expire closure so the NEXT tick's
   *  decided loop reports it and the wait ends. */
  sweep?: (dir: string, now: Date) => void;
  /** Fail-soft sink for a sweep error (tests). Defaults to `console.error`. A
   *  sweep failure is logged, never thrown — it must never block a poll tick. */
  onSweepError?: (error: unknown) => void;
}

/** Default sweep — a fresh `ApprovalStore` instance pointed EXACTLY at `dir`
 *  (the `storeDir` override makes the first constructor argument irrelevant). */
function defaultSweep(dir: string, now: Date): void {
  new ApprovalStore(dir, { storeDir: dir }).sweepExpired(now);
}

export interface ApprovalStoreWatchHandle {
  /** Stop watching + polling and release every OS handle/timer. Idempotent;
   *  no handler fires again after this returns, even for an in-flight event. */
  dispose(): void;
}

// ─── Default fs.watch seam ───────────────────────────────────────────────────

function defaultFsWatcher(dir: string, onChange: () => void): { close(): void } {
  const watcher = fsWatch(dir, () => onChange());
  if (typeof watcher.unref === 'function') watcher.unref();
  return { close: () => watcher.close() };
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;

/** Categories a decision can land a request in — `pending` is excluded since a
 *  pending entry never carries a decision (see approval-store.ts categorize()). */
const DECIDED_CATEGORIES: readonly Exclude<ApprovalStoreCategory, 'pending'>[] = ['approved', 'denied', 'expired'];

// ─── createApprovalStoreWatch ────────────────────────────────────────────────

/**
 * Watch `storeDir` for new/changed ApprovalStore records and report them via
 * `handlers`. Runs one synchronous scan before returning — any record already
 * on disk (written by another process before this watcher attached) is
 * reported immediately, closing the store-replay gap. Every id+status pair is
 * reported at most once (see module docs); a corrupt/torn/tmp file never
 * surfaces because it never survives `ApprovalStore.load()`'s own parsing.
 */
export function createApprovalStoreWatch(
  storeDir: string,
  handlers: ApprovalStoreWatchHandlers,
  opts: ApprovalStoreWatchOptions = {},
): ApprovalStoreWatchHandle {
  const clock = opts.clock ?? (() => new Date());
  const scan = opts.scan ?? ((dir, now) => ApprovalStore.load(dir, now));
  const sweep = opts.sweep ?? defaultSweep;
  const onSweepError =
    opts.onSweepError ?? ((error: unknown) => console.error('[approval-store-watch] sweepExpired failed:', error));
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const seenPending = new Set<string>();
  const seenDecided = new Set<string>(); // key: `${id}:${category}`
  let disposed = false;

  function runScan(): void {
    if (disposed) return;

    const now = clock();
    try {
      sweep(storeDir, now);
    } catch (error) {
      onSweepError(error);
    }

    let snapshot: ApprovalStoreSnapshot;
    try {
      snapshot = scan(storeDir, now);
    } catch {
      return; // tolerant — mirrors ApprovalStore's own torn-read tolerance
    }

    for (const entry of snapshot.pending) {
      const id = entry.request.id;
      if (seenPending.has(id)) continue;
      seenPending.add(id);
      handlers.onPending?.(entry.request);
    }

    for (const category of DECIDED_CATEGORIES) {
      for (const entry of snapshot[category]) {
        if (!entry.decision) continue; // overdue-unswept expired — not decided yet
        const key = `${entry.request.id}:${category}`;
        if (seenDecided.has(key)) continue;
        seenDecided.add(key);
        handlers.onDecided?.(entry.request.id, entry.decision);
      }
    }
  }

  let fsWatcher: { close(): void } | undefined;
  try {
    fsWatcher = (opts.watch ?? defaultFsWatcher)(storeDir, runScan);
  } catch {
    fsWatcher = undefined; // unsupported platform/EMFILE/etc. — poll fallback still runs
  }

  const pollTimer = setInterval(runScan, pollIntervalMs);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();

  runScan(); // store-replay: report everything already on disk at attach time

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      clearInterval(pollTimer);
      fsWatcher?.close();
    },
  };
}
