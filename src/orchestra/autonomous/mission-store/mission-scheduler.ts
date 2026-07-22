import type {
  MissionDispatchClaim,
  MissionStore,
  WorkItem,
  Mission,
  ResultLike,
} from './mission-types.js';
import type { MissionApprovalCoordinatorLike } from './mission-approval-coordinator.js';
import type { BoundMissionRunnerRegistryV1 } from './mission-kind-admission.js';

/** Executes one claimed work item. Injected — composition root wires the real
 *  runTask/runSprint/broker; tests inject a fake. Resolve on completion; a thrown
 *  error is caught by the scheduler and recorded as failed. */
export type DispatchFn = (item: WorkItem, claim: MissionDispatchClaim) => Promise<ResultLike>;

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
  /** Optional non-blocking approval outbox/decision driver, always before claim. */
  approvalCoordinator?: MissionApprovalCoordinatorLike;
  /** Production claim+dispatch authority. When present, no separate runner path is used. */
  runtimeRegistry?: BoundMissionRunnerRegistryV1;
}

export interface MissionSchedulerSummary {
  iterations: number;
  dispatched: number;
  reason: 'aborted' | 'max_iterations' | 'drained';
}

/** Exact-CAS failure is an integrity error, never a best-effort scheduler outcome. */
export class MissionClaimSettlementError extends Error {
  readonly workItemId: string;
  readonly attemptId: string;

  constructor(claim: MissionDispatchClaim) {
    super(`MISSION_CLAIM_SETTLEMENT_CONFLICT: ${claim.workItemId} (${claim.attemptId})`);
    this.name = 'MissionClaimSettlementError';
    this.workItemId = claim.workItemId;
    this.attemptId = claim.attemptId;
  }
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
  let fatalError: MissionClaimSettlementError | null = null;

  for (;;) {
    if (fatalError) throw fatalError;
    if (opts.signal?.aborted) {
      await Promise.allSettled(inFlight);
      if (fatalError) throw fatalError;
      return { iterations, dispatched, reason: 'aborted' };
    }
    if (opts.maxIterations !== undefined && iterations >= opts.maxIterations) {
      await Promise.allSettled(inFlight);
      if (fatalError) throw fatalError;
      return { iterations, dispatched, reason: 'max_iterations' };
    }
    iterations++;

    // Dependency reconciliation precedes every claim wave. Invalid/cyclic or
    // failed-upstream items become terminal without dispatch; settle their
    // missions even when this tick performs zero provider work.
    const changedMissions = new Set<string>();
    if (opts.runtimeRegistry) {
      for (const missionId of store.reconcileRuntimeAdmission(opts.runtimeRegistry.descriptor)) {
        changedMissions.add(missionId);
      }
    }
    for (const missionId of store.reconcilePendingDependencies()) changedMissions.add(missionId);
    if (opts.approvalCoordinator) {
      const approval = await opts.approvalCoordinator.tick();
      for (const missionId of approval.changedMissionIds) changedMissions.add(missionId);
      // A deny/expiry can block an upstream item; propagate that failure before
      // this tick's claim wave so downstream work never dispatches in-between.
      for (const missionId of store.reconcilePendingDependencies()) changedMissions.add(missionId);
    }
    for (const missionId of changedMissions) {
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
      const queryOpts = {
        ...(cap === undefined ? { limit: 1 } : {}),
        ...(opts.runtimeRegistry ? { registry: opts.runtimeRegistry.descriptor } : {}),
      };
      const due = store.queryDue(queryOpts);
      if (due.length === 0) break;

      let claimedOne = false;
      for (const item of due) {
        let tenant = 'local';
        if (cap !== undefined) {
          tenant = store.getMission(item.missionId)?.tenant ?? 'local';
          if ((perTenantFlight.get(tenant) ?? 0) >= cap) continue; // tenant full → skip to next due item
        }
        if (opts.runtimeRegistry && !item.admissionFence) {
          for (const missionId of store.reconcileRuntimeAdmission(opts.runtimeRegistry.descriptor, item.id)) {
            changedMissions.add(missionId);
          }
          continue;
        }
        const claimFence = opts.runtimeRegistry && item.admissionFence
          ? {
            itemRevision: item.revision,
            admissionFence: item.admissionFence,
            registry: opts.runtimeRegistry.descriptor,
          }
          : undefined;
        const claim = store.claimItemWithAuthority(item.id, 'scheduler', claimFence);
        if (!claim) {
          try { checkMissionComplete(store, item.missionId, opts); } catch { /* fail-safe */ }
          continue; // someone else won / fence changed
        }
        claimedOne = true;
        claimedThisTick++;
        if (cap !== undefined) perTenantFlight.set(tenant, (perTenantFlight.get(tenant) ?? 0) + 1);
        let providerDispatchCounted = false;
        const p: Promise<void> = Promise.resolve()
          .then(() => (opts.runtimeRegistry ? opts.runtimeRegistry.dispatch(item, claim) : dispatch(item, claim)))
          .then((r) => {
            const parked = r.dispatchDisposition === 'parked';
            if (!parked) {
              dispatched++;
              providerDispatchCounted = true;
            }
            const settled = store.settleClaimedItem(claim, parked ? 'parked' : r.ok ? 'done' : 'failed', r);
            if (!settled) fatalError ??= new MissionClaimSettlementError(claim);
          })
          .catch((e) => {
            if (!providerDispatchCounted) dispatched++;
            const settled = store.settleClaimedItem(claim, 'failed', {
              ok: false,
              reason: String((e as Error)?.message ?? e),
            });
            if (!settled) fatalError ??= new MissionClaimSettlementError(claim);
          })
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
      if (fatalError) throw fatalError;
    } else if (claimedThisTick === 0) {
      if (opts.maxIterations !== undefined) return { iterations, dispatched, reason: 'drained' };
      await sleep(opts.intervalMs);            // idle (live)
    }
  }
}
