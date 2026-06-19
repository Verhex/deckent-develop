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
  if (items.some((i) => i.status !== 'done' && i.status !== 'failed')) return; // still active
  const failed = items.some((i) => i.status === 'failed');
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
  let iterations = 0;
  let dispatched = 0;

  for (;;) {
    if (opts.signal?.aborted) { await Promise.allSettled(inFlight); return { iterations, dispatched, reason: 'aborted' }; }
    if (opts.maxIterations !== undefined && iterations >= opts.maxIterations) {
      await Promise.allSettled(inFlight); return { iterations, dispatched, reason: 'max_iterations' };
    }
    iterations++;

    // serial claim up to free slots — atomic, race-free
    let claimedThisTick = 0;
    while (inFlight.size < opts.poolSize) {
      const due = store.queryDue({ limit: 1 });
      if (due.length === 0) break;
      const item = due[0]!;
      if (!store.claimItem(item.id, 'scheduler')) continue; // someone else won → re-query
      dispatched++; claimedThisTick++;
      const p: Promise<void> = Promise.resolve()
        .then(() => dispatch(item))
        .then((r) => store.updateItemStatus(item.id, r.ok ? 'done' : 'failed', r))
        .catch((e) => store.updateItemStatus(item.id, 'failed', { ok: false, reason: String((e as Error)?.message ?? e) }))
        .finally(() => { inFlight.delete(p); try { checkMissionComplete(store, item.missionId, opts); } catch { /* fail-safe */ } });
      inFlight.add(p);
    }

    if (inFlight.size > 0) {
      await Promise.race(inFlight);            // an item settles → a slot frees
    } else if (claimedThisTick === 0) {
      if (opts.maxIterations !== undefined) return { iterations, dispatched, reason: 'drained' };
      await sleep(opts.intervalMs);            // idle (live)
    }
  }
}
