import type {
  Mission, MissionStore, NewWorkItem, WorkItem,
} from './mission-types.js';
import type { InvocationReceiptRef } from '../../../core/invocation-receipt.js';
import {
  admitWorkItemBatch,
  assertCanonicalWorkItemKind,
  type MissionRuntimeAdmission,
} from './mission-kind-admission.js';
import {
  buildMissionAcceptanceDecision,
  createGoalAcceptanceContract,
  readGoalAcceptanceContract,
  type GoalAcceptanceContractV1,
  type GoalAcceptanceEvaluation,
  type GoalAcceptanceReceiptVerification,
} from './mission-acceptance.js';

/** Type-2 (goal) mission specification — "run until the goal is reached". */
export interface GoalMissionSpec {
  id: string;
  title: string;
  /** The goal statement the loop works toward. */
  goal: string;
  /** Optional acceptance criteria (evaluated by the injected `accept`). */
  acceptance?: string;
  /** Host-known author surface. `actorId:null` is honest when no principal exists. */
  acceptanceAuthoredBy?: GoalAcceptanceContractV1['authoredBy'];
  /** Test/replay seam; production defaults to the current host time. */
  acceptanceAuthoredAt?: string;
  tenant?: string;
  deliverTo?: string;
}

/**
 * Outcome of a single goal-loop step.
 *
 * Note: the original directive lists `authored | accepted | exhausted`. The
 * "open work-item present → no-op" case needs an honest distinct outcome rather
 * than forcing one of the action verbs, so `waiting` is added for that no-op.
 */
export type GoalAdvanceOutcome = 'authored' | 'accepted' | 'exhausted' | 'waiting' | 'held';

export const GOAL_INVOCATION_HOLD_SCHEMA_VERSION = 1 as const;

export type GoalInvocationHoldReason =
  | 'authority_unavailable'
  | 'authority_identity_mismatch'
  | 'authority_failure'
  | 'fallback_exhausted'
  | 'reservation_not_executable'
  | 'store_failure'
  | 'receipt_unavailable';

const GOAL_INVOCATION_HOLD_REASONS = new Set<GoalInvocationHoldReason>([
  'authority_unavailable',
  'authority_identity_mismatch',
  'authority_failure',
  'fallback_exhausted',
  'reservation_not_executable',
  'store_failure',
  'receipt_unavailable',
]);

export interface GoalInvocationHoldV1 {
  schemaVersion: typeof GOAL_INVOCATION_HOLD_SCHEMA_VERSION;
  reasonCode: GoalInvocationHoldReason;
  /** Exact upstream provider-authority reason; additive provenance, never an allow signal. */
  providerAuthorityReasonCode?: string;
  evidenceRefs: readonly string[];
  invocationReceiptRef: InvocationReceiptRef | null;
  heldAt: string;
}

/** Only this validated host signal may turn an invocation failure into retryable HOLD. */
export class GoalInvocationHeldError extends Error {
  constructor(readonly hold: GoalInvocationHoldV1) {
    super(`GOAL_INVOCATION_HOLD:${hold.reasonCode}`);
    this.name = 'GoalInvocationHeldError';
    if (hold.schemaVersion !== GOAL_INVOCATION_HOLD_SCHEMA_VERSION
      || !GOAL_INVOCATION_HOLD_REASONS.has(hold.reasonCode)
      || hold.evidenceRefs.length === 0
      || hold.evidenceRefs.some((ref) => !/^[a-z][a-z0-9-]*:.+$/u.test(ref))
      || new Set(hold.evidenceRefs).size !== hold.evidenceRefs.length
      || (hold.providerAuthorityReasonCode !== undefined
        && !/^[a-z][a-z0-9_]*$/u.test(hold.providerAuthorityReasonCode))
      || !Number.isFinite(Date.parse(hold.heldAt))
      || new Date(hold.heldAt).toISOString() !== hold.heldAt) {
      throw new TypeError('GOAL_INVOCATION_HOLD_INVALID');
    }
    const ref = hold.invocationReceiptRef;
    if (ref !== null && (ref.schemaVersion !== 1 || !ref.invocationId.trim()
      || !ref.tenantId.trim() || !ref.projectId.trim())) {
      throw new TypeError('GOAL_INVOCATION_HOLD_INVALID_RECEIPT_REF');
    }
  }
}

function persistInvocationHold(
  store: MissionStore,
  mission: Mission,
  error: GoalInvocationHeldError,
): GoalAdvanceOutcome {
  const status = mission.status === 'pending' ? 'pending' : 'active';
  store.updateMissionStatus(mission.id, status, {
    ok: false,
    reason: error.message,
    goalInvocationHold: error.hold,
  });
  return 'held';
}

/** Injected dependencies for one goal-loop step. */
export interface GoalAdvanceDeps {
  /** Plan the next work-items for the goal given the prior items. Empty ⇒ nothing more to do. */
  author(
    goal: string,
    priorItems: WorkItem[],
    acceptanceContract?: GoalAcceptanceContractV1,
  ): Promise<NewWorkItem[]>;
  /** Decide whether the goal is reached given the (settled) items. */
  accept(
    goal: string,
    items: WorkItem[],
    acceptanceContract?: GoalAcceptanceContractV1,
  ): Promise<boolean | GoalAcceptanceEvaluation>;
  /** Host-owned cross-ledger receipt verification. Missing fails explicit decisions closed. */
  verifyAcceptanceReceipt?(
    mission: Pick<Mission, 'id' | 'tenant'>,
    evaluation: GoalAcceptanceEvaluation,
  ): GoalAcceptanceReceiptVerification | Promise<GoalAcceptanceReceiptVerification>;
  /**
   * Infinite-loop guard — maximum cumulative work-items the goal may author
   * before being force-exhausted. Defaults to `Infinity` (rely on `author`
   * eventually returning `[]`).
   */
  maxRounds?: number;
  /** Runtime capability truth used to reject an unsupported authored batch before enqueue. */
  admission?: MissionRuntimeAdmission;
}

/**
 * Real-world bindings for the goal-loop, named for what they actually are in
 * production: a `planner` (e.g. realPlannerComplete-style — turns a goal +
 * prior work into the next batch of work-items) and an `accepter` (an
 * LLM/Brain-eval that decides whether the goal is reached). {@link buildGoalDeps}
 * adapts these onto the loop's generic {@link GoalAdvanceDeps} surface
 * (`author`/`accept`) consumed by {@link advanceGoalMission}.
 */
export interface GoalDeps {
  /** Real planner — produce the next work-items for the goal given prior items. */
  planner(
    goal: string,
    priorItems: WorkItem[],
    acceptanceContract?: GoalAcceptanceContractV1,
  ): Promise<NewWorkItem[]>;
  /** Real acceptance evaluator (LLM / Brain-eval) — is the goal reached? */
  accepter(
    goal: string,
    items: WorkItem[],
    acceptanceContract?: GoalAcceptanceContractV1,
  ): Promise<boolean | GoalAcceptanceEvaluation>;
  verifyAcceptanceReceipt?: GoalAdvanceDeps['verifyAcceptanceReceipt'];
  /** Infinite-loop guard, forwarded verbatim to {@link advanceGoalMission}. */
  maxRounds?: number;
  /** Runtime capability truth used to reject an unsupported authored batch before enqueue. */
  admission?: MissionRuntimeAdmission;
}

/**
 * Inject-based adapter: bind a real `planner`/`accepter` (the production
 * functions, wired at the composition root) onto the loop's `author`/`accept`
 * interface. Intentionally thin — it exists so the live engine and the tests
 * share ONE seam: production passes the real planner + Brain-eval; tests pass
 * fakes. Keeping the names distinct (planner/accepter vs author/accept) lets the
 * loop stay domain-agnostic while the call-site reads in real-world terms.
 */
export function buildGoalDeps(deps: GoalDeps): GoalAdvanceDeps {
  return {
    author: (goal, priorItems, acceptanceContract) => acceptanceContract
      ? deps.planner(goal, priorItems, acceptanceContract)
      : deps.planner(goal, priorItems),
    accept: (goal, items, acceptanceContract) => acceptanceContract
      ? deps.accepter(goal, items, acceptanceContract)
      : deps.accepter(goal, items),
    ...(deps.maxRounds !== undefined ? { maxRounds: deps.maxRounds } : {}),
    ...(deps.admission ? { admission: deps.admission } : {}),
    ...(deps.verifyAcceptanceReceipt ? { verifyAcceptanceReceipt: deps.verifyAcceptanceReceipt } : {}),
  };
}

/**
 * Type-2: create a `kind='goal'` mission (renderAs `goal`). The goal + acceptance
 * are persisted in the mission spec; the loop is driven by {@link advanceGoalMission}.
 */
export function createGoalMission(store: MissionStore, spec: GoalMissionSpec): Mission {
  const acceptanceContract = spec.acceptance === undefined
    ? null
    : createGoalAcceptanceContract(spec.acceptance, {
      ...(spec.acceptanceAuthoredAt ? { authoredAt: spec.acceptanceAuthoredAt } : {}),
      authoredBy: spec.acceptanceAuthoredBy ?? { surface: 'unknown', actorId: null },
    });
  return store.createMission({
    id: spec.id,
    kind: 'goal',
    title: spec.title,
    tenant: spec.tenant,
    deliverTo: spec.deliverTo,
    renderAs: 'goal',
    spec: { goal: spec.goal, acceptanceContract },
  });
}

function readGoal(mission: Mission): string {
  const g = mission.spec?.goal;
  return typeof g === 'string' ? g : '';
}

/**
 * Drive ONE step of the goal-loop. The scheduler runs the work-items; this fn
 * advances rounds at the boundary where all items have settled.
 *
 * - open (pending/running/parked) item present → `'waiting'` (no-op; scheduler
 *   is working or owner reconciliation is required).
 * - else `author` produces next work-items → enqueue them → `'authored'`.
 * - else `accept` true  → mission `completed` → `'accepted'`.
 * - else (no new work, not accepted) → mission `failed` → `'exhausted'`.
 * - maxRounds guard tripped → mission `failed` → `'exhausted'`.
 */
export async function advanceGoalMission(
  store: MissionStore,
  missionId: string,
  deps: GoalAdvanceDeps,
): Promise<GoalAdvanceOutcome> {
  const mission = store.getMission(missionId);
  if (!mission) throw new Error(`goal mission not found: ${missionId}`);

  const all = store.listItems(missionId);
  const open = all.filter((i) => i.status === 'pending' || i.status === 'running' || i.status === 'parked');
  if (open.length > 0) return 'waiting';

  const goal = readGoal(mission);
  const acceptanceContract = readGoalAcceptanceContract(mission);

  // Infinite-loop guard: bound cumulative authored work-items.
  const maxRounds = deps.maxRounds ?? Infinity;
  if (all.length >= maxRounds) {
    store.updateMissionStatus(missionId, 'failed', {
      ok: false,
      reason: 'goal not reached, max rounds exhausted',
    });
    return 'exhausted';
  }

  // Ask the planner for the next batch of work.
  let next: NewWorkItem[];
  try {
    next = acceptanceContract
      ? await deps.author(goal, all, acceptanceContract)
      : await deps.author(goal, all);
  } catch (error) {
    if (error instanceof GoalInvocationHeldError) return persistInvocationHold(store, mission, error);
    throw error;
  }
  if (next.length > 0) {
    const scopedNext = next.map((item) => ({ ...item, missionId }));
    let admittedNext: NewWorkItem[];
    try {
      if (deps.admission) admittedNext = admitWorkItemBatch(scopedNext, deps.admission);
      else {
        for (const item of scopedNext) assertCanonicalWorkItemKind(item.kind, item.id);
        admittedNext = scopedNext;
      }
    } catch (error) {
      store.updateMissionStatus(missionId, 'failed', {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      });
      return 'exhausted';
    }
    // One admitted planner batch is one durable mutation. A mid-batch conflict
    // cannot strand a partial goal round.
    store.enqueueItems(admittedNext);
    return 'authored';
  }

  // No further work — decide acceptance.
  let accepted: boolean | GoalAcceptanceEvaluation;
  try {
    accepted = acceptanceContract
      ? await deps.accept(goal, all, acceptanceContract)
      : await deps.accept(goal, all);
  } catch (error) {
    if (error instanceof GoalInvocationHeldError) return persistInvocationHold(store, mission, error);
    throw error;
  }
  if (acceptanceContract) {
    const evaluation: GoalAcceptanceEvaluation = typeof accepted === 'boolean'
      ? {
        outcome: accepted ? 'accepted' : 'rejected',
        criteria: [],
        evaluator: { role: 'brain', instanceId: null },
        invocationReceiptRef: null,
        decidedAt: new Date().toISOString(),
      }
      : accepted;
    const invocationVerification = evaluation.outcome === 'unknown'
      ? { verified: false, errors: [] as readonly string[] }
      : deps.verifyAcceptanceReceipt
        ? await deps.verifyAcceptanceReceipt(mission, evaluation)
        : { verified: false, errors: ['invocation receipt verifier unavailable'] };
    const invocationErrors = evaluation.outcome === 'unknown' || invocationVerification.verified
      ? []
      : invocationVerification.errors.length > 0
        ? invocationVerification.errors
        : ['invocation receipt verification failed'];
    const decision = buildMissionAcceptanceDecision(
      missionId,
      acceptanceContract,
      all.length,
      evaluation,
      all,
      invocationErrors,
    );
    const record = store.recordAcceptanceDecision(decision);
    return record.effectiveOutcome === 'accepted' ? 'accepted' : 'exhausted';
  }
  if (accepted === true) {
    store.updateMissionStatus(missionId, 'completed', { ok: true });
    return 'accepted';
  }

  store.updateMissionStatus(missionId, 'failed', {
    ok: false,
    reason: 'goal not reached, no further work',
  });
  return 'exhausted';
}
