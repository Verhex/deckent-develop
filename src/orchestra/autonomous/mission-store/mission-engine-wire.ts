// Autonomous v2 — flag-gated cutover: wire MissionStore + MissionScheduler into
// the live runtime. This module is the composition root for the v2 engine; the
// live CLI (`deckent autonomous start`) calls `runV2Engine` ONLY when
// `config.autonomous.engine === 'v2'` (see `isV2Engine`). The default (engine
// absent or 'v1') leaves the existing v1 loop untouched — a safe cutover.
//
// All execution primitives (runTask / runSprint / runCapability / notify) are
// INJECTED so this module is hermetically testable: the live CLI passes the real
// spawn+wait wiring; tests pass fakes and a real SqliteMissionStore at a tmpdir.
import { randomUUID } from 'node:crypto';
import type { ResolvedConfig } from '../../../core/config-types.js';
import { SqliteMissionStore } from './sqlite-mission-store.js';
import { buildMissionDispatch, type MissionTaskContext } from './mission-dispatch.js';
import { makeMissionDeliver, type MissionNotifyPayload } from './mission-deliver.js';
import { migrateBacklogJson } from './mission-migrate.js';
import {
  PRODUCTION_V2_RUNNER_REGISTRY,
  bindMissionRunnerRegistry,
  type BoundMissionRunnerRegistryV1,
} from './mission-kind-admission.js';
import {
  MissionEngineLeaseLostError,
  runMissionScheduler,
  type DispatchFn,
  type MissionSchedulerSummary,
} from './mission-scheduler.js';
import { advanceGoalMission, type GoalAdvanceDeps } from './goal-mission.js';
import { auditMissionLifecycle } from './mission-audit-bridge.js';
import type { MissionApprovalCoordinatorLike } from './mission-approval-coordinator.js';
import type {
  MissionWorkerInvocationCoordinatorLike,
  MissionWorkerInvocationExecution,
  MissionWorkerInvocationExecutionGrant,
  MissionWorkerInvocationClaimBinding,
  MissionWorkerExactExecutionContext,
} from './mission-worker-invocation-coordinator.js';
import type {
  MissionWorkerInvocationRecoveryReconcilerLike,
} from './mission-worker-invocation-recovery.js';
import type {
  Mission,
  MissionDispatchClaim,
  MissionEngineLease,
  MissionStore,
  ResultLike,
  SettleDetail,
} from './mission-types.js';

/**
 * Pure flag predicate — true only when the project config opts into the v2
 * engine. `autonomous.engine` is not (yet) on the ResolvedConfig type, so it is
 * read via the same cast the live code uses for other off-type autonomous fields
 * (e.g. `result_timeout_ms`). Adding `engine?: 'v1' | 'v2'` to config-types is a
 * separate, type-only follow-up; behaviour here is correct either way.
 */
export function isV2Engine(config: ResolvedConfig): boolean {
  const engine = (config.autonomous as Record<string, unknown> | undefined)?.['engine'];
  return engine === 'v2';
}

/** Injected execution + delivery primitives for `runV2Engine`. */
export interface RunV2EngineDeps {
  /** kind='task' — run a single worker for the item's description (→ ResultLike). */
  /** Exact claim is host-private and never embedded in MissionTaskContext. */
  runTask: (ctx: MissionTaskContext, claim: MissionDispatchClaim) => Promise<ResultLike>;
  /** Exact route-locked provider executor + measured terminal evidence bundle. */
  runAdmittedTask?: (
    ctx: MissionWorkerExactExecutionContext,
    claim: MissionWorkerInvocationClaimBinding,
    grant: Readonly<MissionWorkerInvocationExecutionGrant>,
  ) => Promise<MissionWorkerInvocationExecution>;
  /** kind='sprint' — run the full sprint lifecycle (success unless it throws). */
  runSprint: (projectRoot: string, config: ResolvedConfig) => Promise<unknown>;
  /** kind='capability' — optional broker; absent → capability items fail clearly. */
  runCapability?: (target: unknown) => Promise<ResultLike>;
  /** Settle-delivery channel. Absent → no-op (mission still settles silently). */
  notify?: (payload: MissionNotifyPayload) => void | Promise<void>;
  /** Idle-tick interval ms. Default: config.autonomous.interval_ms ?? 5000. */
  intervalMs?: number;
  /** Bounded run — stop after N scheduler iterations (tests pass this). */
  maxIterations?: number;
  /** Cooperative cancellation (SIGINT / stop-marker). */
  signal?: AbortSignal;
  /** UI language for delivery messages. Default 'en'. */
  lang?: string;
  /**
   * Runtime-wide durable approval driver. The composition root must build this
   * from a trusted actor/approval descriptor; the engine never invents identity,
   * risk, or scope. When absent, approval-required items remain non-claimable.
   */
  approvalCoordinator?: MissionApprovalCoordinatorLike;
  /**
   * Host-only provider admission/receipt/dispatch/settlement authority. When
   * present, the exact executor is unreachable until this coordinator returns
   * a unique provider grant. A null-authority coordinator therefore parks live
   * production work before Task JSON, prompt, or provider side effects.
   */
  workerInvocationCoordinator?: MissionWorkerInvocationCoordinatorLike;
  /**
   * Crash-takeover receipt closer. It consumes immutable recovery captures
   * before any scheduler claim and never re-drives an uncertain provider call.
   */
  workerInvocationRecoveryReconciler?: MissionWorkerInvocationRecoveryReconcilerLike;
  /**
   * Type-2 (goal) loop bindings. When present, `runV2Engine` interleaves a
   * goal-driver with the scheduler: idle `kind='goal'` missions are advanced
   * (author→enqueue new work-items → scheduler runs them; accept→complete;
   * exhausted→failed). Build these at the composition root with
   * `buildGoalDeps({ planner, accepter })` (real planner + Brain-eval); tests
   * pass fakes. ABSENT → behaviour is unchanged: the scheduler-only path that
   * drives list/sprint missions exactly as before.
   */
  goalDeps?: GoalAdvanceDeps;
  /**
   * Test seam — inject a real MissionStore (e.g. SqliteMissionStore at a tmpdir)
   * so setup, run and assertions share one instance. When provided the engine
   * does NOT close it (caller owns its lifecycle); when absent the engine opens
   * its own SqliteMissionStore(projectRoot) and closes it on completion.
   */
  store?: MissionStore;
  /** Internal single-host lease identity seam; production generates a unique process instance id. */
  engineLeaseOwnerId?: string;
  /** Internal lease TTL seam. Default 30s; must exceed the renewal interval. */
  engineLeaseTtlMs?: number;
  /** Internal heartbeat interval seam. Default 10s; must be positive and below TTL. */
  engineLeaseRenewIntervalMs?: number;
}

const DEFAULT_ENGINE_LEASE_TTL_MS = 30_000;
const DEFAULT_ENGINE_LEASE_RENEW_INTERVAL_MS = 10_000;

/** Another live Goal-v2 engine owns the same single-host MissionStore. */
export class MissionEngineLeaseUnavailableError extends Error {
  readonly ownerId: string;

  constructor(ownerId: string) {
    super(`MISSION_ENGINE_LEASE_UNAVAILABLE: ${ownerId}`);
    this.name = 'MissionEngineLeaseUnavailableError';
    this.ownerId = ownerId;
  }
}

function assertEngineLeaseTiming(ttlMs: number, renewIntervalMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new TypeError('MISSION_ENGINE_LEASE_INVALID: ttlMs');
  }
  if (!Number.isSafeInteger(renewIntervalMs) || renewIntervalMs <= 0 || renewIntervalMs >= ttlMs) {
    throw new TypeError('MISSION_ENGINE_LEASE_INVALID: renewIntervalMs');
  }
}

function startEngineLeaseHeartbeat(
  store: MissionStore,
  lease: MissionEngineLease,
  ttlMs: number,
  renewIntervalMs: number,
): { stop: () => void } {
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    try {
      if (!store.renewEngineLease(lease, ttlMs)) stopped = true;
    } catch {
      // A transient store failure does not invent a renewal. Runtime checks the
      // durable row before every claim/dispatch/settlement and will fail closed
      // when the last proven expiry passes.
    }
  }, renewIntervalMs);
  timer.unref();
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

/**
 * Canonical DONE/DEBT/NO_GO → settle-outcome mapping (mission-w1 honesty fix). Trusts
 * an explicit `settleDetail` if the caller already set one (e.g. a composition root
 * that forwards the worker's raw selfAssessment — `NO_GO` → 'failed', `GO_WITH_TECH_DEBT`
 * → 'debt', `DONE` → 'done'); otherwise falls back to the safe `ok`-derived binary, so
 * older/fake callers that only return `{ ok }` keep working unchanged.
 */
export function deriveSettleDetail(result: Pick<ResultLike, 'ok' | 'settleDetail'>): SettleDetail {
  if (result.settleDetail) return result.settleDetail;
  return result.ok ? 'done' : 'failed';
}

/**
 * Wrap an injected `runTask` so every task-kind ResultLike dispatched through this
 * engine run always carries a normalized `settleDetail`. This is the single point
 * (shared by both the scheduler-only and the goal-driven path, since both consume the
 * same `dispatch`) where the DEBT-vs-clean-DONE nuance survives into the persisted
 * WorkItem.lastResult — `ok` alone (as already correctly derived at the CLI composition
 * root, `ok: selfAssessment !== 'NO_GO'`) cannot distinguish a clean DONE from an honest
 * GO_WITH_TECH_DEBT, so a mission built entirely of DEBT items must still settle
 * 'completed', never 'failed'.
 */
function withSettleDetail(runTask: RunV2EngineDeps['runTask']): RunV2EngineDeps['runTask'] {
  return async (ctx, claim) => {
    const res = await runTask(ctx, claim);
    if (res.dispatchDisposition !== undefined) {
      const held: ResultLike = { ...res };
      delete held.settleDetail;
      return held;
    }
    return { ...res, settleDetail: deriveSettleDetail(res) };
  };
}

function withWorkerInvocationCoordinator(
  store: MissionStore,
  engineLease: MissionEngineLease,
  coordinator: MissionWorkerInvocationCoordinatorLike | undefined,
  runAdmittedTask: RunV2EngineDeps['runAdmittedTask'],
): RunV2EngineDeps['runTask'] {
  if (!coordinator) {
    return withSettleDetail(async () => ({
      ok: false,
      dispatchDisposition: 'parked',
      reason: 'MISSION_WORKER_INVOCATION_AUTHORITY_UNAVAILABLE',
    }));
  }
  return withSettleDetail(async (ctx, claim) => {
    const mission = store.getMission(claim.missionId);
    if (!mission) {
      return {
        ok: false,
        dispatchDisposition: 'parked',
        reason: 'MISSION_WORKER_INVOCATION_HOLD:mission_not_found',
      };
    }
    if (!runAdmittedTask) {
      return {
        ok: false,
        dispatchDisposition: 'parked',
        reason: 'MISSION_WORKER_INVOCATION_HOLD:exact_executor_unavailable',
      };
    }
    const { provider: _requestedProvider, model: _requestedModel, ...safeContext } = ctx;
    const { fenceToken: _rawFenceToken, ...claimBinding } = claim;
    return coordinator.execute({
      mission,
      context: ctx,
      claim,
      isClaimActive: () => store.isDispatchClaimActive(claim, engineLease),
    }, grant => runAdmittedTask(
      Object.freeze(safeContext),
      Object.freeze(claimBinding),
      grant,
    ));
  });
}

/** Resolve a concrete scheduler pool size from config (never < 1). */
function resolvePoolSize(config: ResolvedConfig): number {
  const fromAutonomous = config.autonomous?.pool_size;
  if (typeof fromAutonomous === 'number' && fromAutonomous >= 1) return Math.floor(fromAutonomous);
  const maxWorkers = config.activeModeConfig?.max_workers;
  if (typeof maxWorkers === 'number' && maxWorkers >= 1) return Math.floor(maxWorkers);
  return 1; // 'auto' / unset → serial-safe default (matches autonomous.pool_size default)
}

/**
 * Resolve the optional per-tenant concurrency cap from config. Read via the same
 * off-type cast `isV2Engine` uses for `autonomous.engine` — `per_tenant_pool_size`
 * is not (yet) on the ResolvedConfig type; adding it is a separate type-only
 * follow-up. A value < 1 or non-number → undefined → NO cap → v1-default
 * (global-only scheduling, single-tenant localhost unaffected).
 */
function resolvePerTenantPoolSize(config: ResolvedConfig): number | undefined {
  const raw = (config.autonomous as Record<string, unknown> | undefined)?.['per_tenant_pool_size'];
  if (typeof raw === 'number' && raw >= 1) return Math.floor(raw);
  return undefined;
}

/**
 * Boot + run the autonomous-v2 engine to completion (or abort).
 *
 * 1. Open + migrate the durable mission store (SqliteMissionStore @ projectRoot).
 * 2. One-time backlog.json → store import (no-op if missions already exist).
 * 3. Build the real DispatchFn (kind → injected runTask/runSprint/runCapability).
 * 4. Build the settle → notify delivery handler.
 * 5. Run the concurrent, race-free scheduler with a config-resolved pool size.
 */
export async function runV2Engine(
  projectRoot: string,
  config: ResolvedConfig,
  deps: RunV2EngineDeps,
): Promise<MissionSchedulerSummary> {
  const ownsStore = deps.store === undefined;
  const store: MissionStore = deps.store ?? new SqliteMissionStore(projectRoot);
  let engineLease: MissionEngineLease | null = null;
  let heartbeat: { stop: () => void } | null = null;
  try {
    store.migrate();
    const leaseTtlMs = deps.engineLeaseTtlMs ?? DEFAULT_ENGINE_LEASE_TTL_MS;
    const leaseRenewIntervalMs = deps.engineLeaseRenewIntervalMs ?? DEFAULT_ENGINE_LEASE_RENEW_INTERVAL_MS;
    assertEngineLeaseTiming(leaseTtlMs, leaseRenewIntervalMs);
    const leaseOwnerId = deps.engineLeaseOwnerId ?? `goal-v2:${process.pid}:${randomUUID()}`;
    engineLease = store.acquireEngineLease(leaseOwnerId, leaseTtlMs);
    if (!engineLease) throw new MissionEngineLeaseUnavailableError(leaseOwnerId);
    heartbeat = startEngineLeaseHeartbeat(store, engineLease, leaseTtlMs, leaseRenewIntervalMs);

    const kindDispatch = buildMissionDispatch({
      projectRoot,
      config,
      runTask: withWorkerInvocationCoordinator(
        store,
        engineLease,
        deps.workerInvocationCoordinator,
        deps.runAdmittedTask,
      ),
      runSprint: deps.runSprint,
      ...(deps.runCapability ? { runCapability: deps.runCapability } : {}),
    });
    // A generic primitive merely being injected does not admit its kind. The
    // production registry and its exact bound handlers are one authority.
    const runtimeRegistry = bindMissionRunnerRegistry(PRODUCTION_V2_RUNNER_REGISTRY, {
      task: kindDispatch,
    }, (claim) => store.isDispatchClaimActive(claim, engineLease!));

    // B11 crash-recovery wire (ADR-043): a previous engine run that crashed or was
    // killed mid-dispatch leaves work_items stuck in 'running' (claimed but never
    // settled). Blind redrive could duplicate a provider side effect, so recover()
    // parks those rows for owner reconciliation. Idempotent and narrow: only
    // touches status='running' rows; a clean boot is a no-op.
    const recoveredDispatches = store.recover(engineLease);
    deps.workerInvocationRecoveryReconciler?.reconcile(
      store,
      recoveredDispatches,
      engineLease,
    );
    // Boot: import the legacy backlog into a `legacy` mission (no-op if missions exist).
    migrateBacklogJson(projectRoot, store, { admission: runtimeRegistry.descriptor });
    store.reconcileRuntimeAdmission(runtimeRegistry.descriptor);
    const dispatch = runtimeRegistry.dispatch;

    const deliver = makeMissionDeliver({
      notify: deps.notify ?? ((): void => { /* no delivery channel — settle silently */ }),
      ...(deps.lang ? { lang: deps.lang } : {}),
    });
    // Single settle wrap-point: audit the mission lifecycle (tamper-evident,
    // fail-safe) BEFORE delivery. Both the scheduler-only path and the
    // goal-driven path consume this handler, so wrapping here covers both.
    const onMissionSettled = (mission: Mission): void => {
      if (!store.isEngineLeaseActive(engineLease!)) {
        throw new MissionEngineLeaseLostError(engineLease!);
      }
      auditMissionLifecycle(projectRoot, {
        tenantId: mission.tenant,
        actor: 'scheduler',
        action: 'missions:settle',
        missionId: mission.id,
        metadata: { status: mission.status, ok: mission.lastResult?.ok ?? null },
      });
      deliver(mission);
    };

    const intervalMs = deps.intervalMs ?? config.autonomous?.interval_ms ?? 5000;
    const poolSize = resolvePoolSize(config);
    const perTenantPoolSize = resolvePerTenantPoolSize(config);

    // Goal-driven path (Type-2): interleave the goal-driver with the scheduler.
    // Only taken when goal bindings are injected — otherwise the existing
    // scheduler-only behaviour (list/sprint missions) is preserved verbatim.
    if (deps.goalDeps) {
      return await runGoalDrivenEngine({
        store,
        dispatch,
        poolSize,
        intervalMs,
        onMissionSettled,
        goalDeps: deps.goalDeps,
        runtimeRegistry,
        engineLease,
        ...(deps.approvalCoordinator ? { approvalCoordinator: deps.approvalCoordinator } : {}),
        ...(perTenantPoolSize !== undefined ? { perTenantPoolSize } : {}),
        ...(deps.signal ? { signal: deps.signal } : {}),
        ...(deps.maxIterations !== undefined ? { maxIterations: deps.maxIterations } : {}),
      });
    }

    return await runMissionScheduler(store, dispatch, {
      poolSize,
      intervalMs,
      onMissionSettled,
      runtimeRegistry,
      engineLease,
      ...(deps.approvalCoordinator ? { approvalCoordinator: deps.approvalCoordinator } : {}),
      ...(perTenantPoolSize !== undefined ? { perTenantPoolSize } : {}),
      ...(deps.signal ? { signal: deps.signal } : {}),
      ...(deps.maxIterations !== undefined ? { maxIterations: deps.maxIterations } : {}),
    });
  } finally {
    heartbeat?.stop();
    if (engineLease) store.releaseEngineLease(engineLease);
    if (ownsStore) store.close();
  }
}

/** Internal options for the goal-driven engine loop. */
interface GoalDrivenEngineOpts {
  store: MissionStore;
  dispatch: DispatchFn;
  poolSize: number;
  intervalMs: number;
  onMissionSettled: (mission: Mission) => void;
  goalDeps: GoalAdvanceDeps;
  runtimeRegistry: BoundMissionRunnerRegistryV1;
  engineLease: MissionEngineLease;
  approvalCoordinator?: MissionApprovalCoordinatorLike;
  signal?: AbortSignal;
  maxIterations?: number;
  /** Per-tenant fair-share cap, threaded into each scheduler drain pass. */
  perTenantPoolSize?: number;
}

/**
 * Upper bound for a single scheduler drain pass. The scheduler returns 'drained'
 * the moment no pending work remains (it never sleeps when maxIterations is set),
 * so this only caps a pathological busy round — it is not a normal exit path.
 */
const GOAL_DRAIN_BOUND = 100_000;

/**
 * Goal-driven engine: an outer loop alternating a goal-driver pass with a bounded
 * scheduler drain pass. Each iteration:
 *
 *   1. For every LIVE goal mission (`kind='goal'`, not yet settled by the loop,
 *      not cancelled) with no open work-item → `advanceGoalMission`:
 *        - 'authored'           → mark mission active; flag progress made.
   *        - 'held'                 → keep non-terminal with durable authority evidence.
   *        - 'accepted'/'exhausted' → record as loop-finalized + deliver settlement.
 *   2. Run the scheduler to drain all currently-pending items (goal rounds + any
 *      list/sprint work). Goal-mission settlements are filtered OUT of the
 *      scheduler's delivery — the scheduler's item-based `checkMissionComplete`
 *      fires a false-positive 'completed' after each authored round, so the
 *      goal-driver (not the scheduler) owns goal settlement + delivery. Liveness
 *      is therefore tracked via the loop-owned `finalized` set, NOT SQL status:
 *      a scheduler-"completed" goal is re-driven until the loop accepts/exhausts.
 *   3. Terminate (drained) when no goal authored new work AND the scheduler
 *      dispatched nothing this pass. `signal`/`maxIterations` bound the loop.
 */
async function runGoalDrivenEngine(opts: GoalDrivenEngineOpts): Promise<MissionSchedulerSummary> {
  const { store, dispatch, poolSize, intervalMs, onMissionSettled, runtimeRegistry, signal } = opts;
  const goalDeps: GoalAdvanceDeps = { ...opts.goalDeps, admission: runtimeRegistry.descriptor };
  const maxIterations = opts.maxIterations ?? Infinity;
  // A durably failed goal is terminal. Seed it as finalized so a clean engine
  // restart does not re-deliver the same settlement. This is at-most-once
  // restart containment, not a substitute for a delivery receipt/fence across
  // a crash between the status write and the external notification.
  const finalized = new Set<string>(
    store.listMissions()
      .filter((mission) => mission.kind === 'goal' && mission.status === 'failed')
      .map((mission) => mission.id),
  );
  let dispatched = 0;
  let iterations = 0;

  // The scheduler must not deliver successful goal-round settlements (round-based
  // ownership belongs to the goal-driver). A dependency-reconciliation failure is
  // terminal, however, so deliver it once in this engine run and finalize the goal.
  // List/sprint missions continue to settle + notify here.
  const schedOnSettled = (mission: Mission): void => {
    if (mission.kind === 'goal') {
      if (mission.status === 'failed' && !finalized.has(mission.id)) {
        finalized.add(mission.id);
        onMissionSettled(mission);
      }
      return;
    }
    onMissionSettled(mission);
  };

  for (;;) {
    if (!store.isEngineLeaseActive(opts.engineLease)) {
      throw new MissionEngineLeaseLostError(opts.engineLease);
    }
    if (signal?.aborted) return { iterations, dispatched, reason: 'aborted' };
    if (iterations >= maxIterations) return { iterations, dispatched, reason: 'max_iterations' };
    iterations++;

    // 1. Goal-driver pass.
    let authoredAny = false;
    for (const mission of store.listMissions()) {
      if (mission.kind !== 'goal' || finalized.has(mission.id) || mission.status === 'cancelled') continue;
      if (mission.status === 'failed') {
        finalized.add(mission.id);
        onMissionSettled(mission);
        continue;
      }
      const items = store.listItems(mission.id);
      if (items.some((i) => i.status === 'pending' || i.status === 'running' || i.status === 'parked')) {
        continue; // round in flight or recovery reconciliation required
      }
      const outcome = await advanceGoalMission(store, mission.id, goalDeps);
      if (!store.isEngineLeaseActive(opts.engineLease)) {
        throw new MissionEngineLeaseLostError(opts.engineLease);
      }
      if (outcome === 'authored') {
        authoredAny = true;
        // The scheduler may have flipped this mission to 'completed' after the
        // previous round; reflect that it is running a fresh round again.
        store.updateMissionStatus(mission.id, 'active');
      } else if (outcome === 'accepted' || outcome === 'exhausted') {
        finalized.add(mission.id);
        const settled = store.getMission(mission.id);
        if (settled) onMissionSettled(settled);
      }
    }

    // 2. Scheduler drain pass — run every currently-pending item to completion.
    const summary = await runMissionScheduler(store, dispatch, {
      poolSize,
      intervalMs,
      onMissionSettled: schedOnSettled,
      runtimeRegistry,
      engineLease: opts.engineLease,
      maxIterations: GOAL_DRAIN_BOUND,
      ...(opts.approvalCoordinator ? { approvalCoordinator: opts.approvalCoordinator } : {}),
      ...(opts.perTenantPoolSize !== undefined ? { perTenantPoolSize: opts.perTenantPoolSize } : {}),
      ...(signal ? { signal } : {}),
    });
    dispatched += summary.dispatched;
    if (summary.reason === 'aborted') return { iterations, dispatched, reason: 'aborted' };

    // 3. Quiescent → done: no goal advanced a new round and nothing was dispatched.
    if (!authoredAny && summary.dispatched === 0) {
      return { iterations, dispatched, reason: 'drained' };
    }
  }
}
