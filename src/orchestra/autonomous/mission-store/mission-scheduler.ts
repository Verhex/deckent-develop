import type { MissionStore, WorkItem, Mission, ResultLike } from './mission-types.js';

/** Executes one claimed work item. Injected — composition root wires the real
 *  runTask/runSprint/broker; tests inject a fake. Resolve on completion; a thrown
 *  error is caught by the scheduler and recorded as failed. */
export type DispatchFn = (item: WorkItem) => Promise<ResultLike>;

export interface MissionSchedulerOptions {
  poolSize: number;
  intervalMs: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
  maxIterations?: number;
  onMissionSettled?: (mission: Mission) => void;
  /**
   * Optional per-tenant concurrency cap (enterprise fair-share). When set, no
   * single tenant may hold more than this many items in flight at once, so a
   * flooding tenant cannot consume the whole global `poolSize` and starve the
   * rest. UNDEFINED → no cap → behaviour identical to the global-only scheduler
   * (v1-default). A mission's tenant is resolved via `store.getMission`.
   */
  perTenantPoolSize?: number;
}

export interface MissionSchedulerSummary {
  iterations: number;
  dispatched: number;
  reason: 'aborted' | 'max_iterations' | 'drained';
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Settle a mission when all its items are terminal. Fail-safe (caller wraps in try/catch). */
function checkMissionComplete(store: MissionStore, missionId: string, opts: MissionSchedulerOptions): void {
  const items = store.listItems(missionId);
  if (items.length === 0) return;
  if (items.some((i) => i.status !== 'done' && i.status !== 'failed' && i.status !== 'blocked')) return; // still active
  const failed = items.some((i) => i.status === 'failed' || i.status === 'blocked');
  store.updateMissionStatus(missionId, failed ? 'failed' : 'completed',
    { ok: !failed, reason: failed ? 'one or more items failed' : 'all items done' });
  store.setMissionProgress(missionId, { done: items.filter((i) => i.status === 'done').length, total: items.length });
  if (opts.onMissionSettled) {
    const m = store.getMission(missionId);
    if (m) opts.onMissionSettled(m);
  }
}

/** Concurrent, race-free runtime over a MissionStore. Serial atomic-claim + concurrent execute. */
export async function runMissionScheduler(
  store: MissionStore,
  dispatch: DispatchFn,
  opts: MissionSchedulerOptions,
): Promise<MissionSchedulerSummary> {
  const sleep = opts.sleep ?? defaultSleep;
  const inFlight = new Set<Promise<void>>();
  // Per-tenant in-flight counters (run-scoped). Only consulted when
  // perTenantPoolSize is set; the global-only path never touches this map.
  const perTenantFlight = new Map<string, number>();
  const cap = opts.perTenantPoolSize;
  let iterations = 0;
  let dispatched = 0;

  for (;;) {
    if (opts.signal?.aborted) { await Promise.allSettled(inFlight); return { iterations, dispatched, reason: 'aborted' }; }
    if (opts.maxIterations !== undefined && iterations >= opts.maxIterations) {
      await Promise.allSettled(inFlight); return { iterations, dispatched, reason: 'max_iterations' };
    }
    iterations++;

    // Dependency reconciliation precedes every claim wave. Invalid/cyclic or
    // failed-upstream items become terminal without dispatch; settle their
    // missions even when this tick performs zero provider work.
    for (const missionId of store.reconcilePendingDependencies()) {
      try { checkMissionComplete(store, missionId, opts); } catch { /* fail-safe */ }
    }

    // serial claim up to free slots — atomic, race-free
    let claimedThisTick = 0;
    while (inFlight.size < opts.poolSize) {
      // No cap → original single-item FIFO (limit:1; zero extra store calls,
      // behaviour + perf unchanged). Cap set → scan the full pending FIFO and
      // claim the first item whose tenant is still below its concurrency cap, so
      // a tenant flooding more than `poolSize` items cannot hide every other
      // tenant behind it (limit:poolSize would). FIFO within a tenant is kept.
      const due = cap !== undefined ? store.queryDue() : store.queryDue({ limit: 1 });
      if (due.length === 0) break;

      let claimedOne = false;
      for (const item of due) {
        let tenant = 'local';
        if (cap !== undefined) {
          tenant = store.getMission(item.missionId)?.tenant ?? 'local';
          if ((perTenantFlight.get(tenant) ?? 0) >= cap) continue; // tenant full → skip to next due item
        }
        if (!store.claimItem(item.id, 'scheduler')) continue; // someone else won → try next due item
        claimedOne = true;
        dispatched++; claimedThisTick++;
        if (cap !== undefined) perTenantFlight.set(tenant, (perTenantFlight.get(tenant) ?? 0) + 1);
        const p: Promise<void> = Promise.resolve()
          .then(() => dispatch(item))
          .then((r) => store.updateItemStatus(item.id, r.ok ? 'done' : 'failed', r))
          .catch((e) => store.updateItemStatus(item.id, 'failed', { ok: false, reason: String((e as Error)?.message ?? e) }))
          .finally(() => {
            inFlight.delete(p);
            if (cap !== undefined) perTenantFlight.set(tenant, (perTenantFlight.get(tenant) ?? 1) - 1);
            try { checkMissionComplete(store, item.missionId, opts); } catch { /* fail-safe */ }
          });
        inFlight.add(p);
        break; // claimed one → re-evaluate free slots from the top
      }
      if (!claimedOne) break; // nothing eligible this pass (all due tenants at cap / lost the claim race)
    }

    if (inFlight.size > 0) {
      await Promise.race(inFlight);            // an item settles → a slot frees
    } else if (claimedThisTick === 0) {
      if (opts.maxIterations !== undefined) return { iterations, dispatched, reason: 'drained' };
      await sleep(opts.intervalMs);            // idle (live)
    }
  }
}
