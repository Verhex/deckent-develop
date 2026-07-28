// ═══ run-job-service — TERM-FLOW-UNIFY Sprint-4 dilim (426-001) ════════════
//
// docs/analysis/term-flow-unify-design-2026-07-11.md ("Net Öneri" + Sprint-4
// row "Yeni run-job-service.ts... start önce digest'i CAS ile doğrular").
// The approved-snapshot-CONSUMING start path: given a caller-supplied
// (flowId, expectedRevision, expectedPlanDigest) CAS key plus the snapshot
// the caller already loaded from a durable store, this decides whether the
// actual run may proceed — and, critically, NEVER decides to re-plan or
// perform a start side effect. Process birth/idempotency/admission lives in
// exact-plan-start-service.ts; this module is the pure exact-plan guard.
//
// PURITY-ADJACENT CONTRACT (binding — mirrors run-flow-reducer.ts's
// "structural not procedural" discipline): this module imports NOTHING from
// `./sprint-controller.js`, `./sprint-phases.js`, or `./brain.js` — "flag-
// açıkken fresh-replan ölür" holds because the import graph makes a replan
// call impossible from here, not because of a runtime if-check a future edit
// could accidentally bypass. tests/orchestra/run-job-service.test.ts pins
// this with a static source-scan guard (same technique
// tests/orchestra/run-flow-reducer.test.ts already uses for the reducer).
//
// ADR-D-004 (Layer-1 import direction, C2 — orchestra/ MUST NOT import cli/):
// this module deliberately does NOT import cli/repl/run-flow-store.ts. Every
// caller (cli/commands/start.ts, mcp/tools/start.ts) loads the approved
// snapshot / existing run-handle itself and passes the plain data in —
// `ApprovedRunSnapshotInput`/`ExistingRunHandleInput` below are duck-typed
// against run-flow-store.ts's `StoredApprovedSnapshot`/`StoredRunHandleRecord`
// (same field shape) without importing that module, so TypeScript's
// structural typing accepts a store record directly with zero adapter code.
//
// START EFFECT AUTHORITY: deliberately absent. A guard that also spawns cannot
// atomically journal PREPARED before birth or defer handle publication until
// admission. exact-plan-start-service.ts owns those transitions.

import type { ActorContext } from '../core/work-model.js';
import type { Sprint } from '../core/types.js';
import {
  computeExecutionPlanDigestByVersion,
  type ExecutionPlanDigestContext,
} from '../core/execution-plan-digest.js';

// ─── RunHandle (duck-typed vs. core/run-flow-contract.ts, NOT imported) ───
//
// core/run-flow-contract.ts already declares an identical `RunHandle` shape
// ({flowId, jobId, logRef}) — this is deliberately a LOCAL re-declaration,
// not an import, so this module (and every caller that re-exports this type
// instead of reaching into core/run-flow-contract.ts directly) stays off
// tests/orchestra/run-flow-reducer.test.ts's "known-consumer allowlist" pin
// (a hard-locked list of the ONLY files permitted to import run-flow-
// contract.ts/run-flow-reducer.ts, evolved sprint-by-sprint by Sprint-1/2/3
// — that test file is outside this task's write scope, so this module earns
// its own zero-cost structural type instead of asking for a new allowlist
// entry it cannot grant itself).
export interface RunHandle {
  readonly flowId: string;
  readonly jobId: string;
  readonly logRef: string;
}

// ─── Injected input shapes (duck-typed vs. run-flow-store.ts) ─────────────

export interface ApprovedRunSnapshotInput {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  /** Absent is the explicit legacy-v1 compatibility path. */
  readonly planDigestVersion?: number;
  readonly planDigestContext?: ExecutionPlanDigestContext;
  readonly approvedBy: ActorContext;
  readonly approvedAt: string;
  readonly sprint: Sprint;
}

// ─── Typed errors (never a silent no-op — see run-flow-reducer.ts precedent) ─

export type RunJobErrorCode =
  | 'RUN_JOB_FLOW_NOT_APPROVED'
  | 'RUN_JOB_DIGEST_MISMATCH'
  | 'RUN_JOB_BUDGET_HOLD'
  | 'RUN_JOB_TOPOLOGY_HOLD';

export abstract class RunJobError extends Error {
  abstract readonly code: RunJobErrorCode;
  public readonly flowId: string;

  constructor(flowId: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.flowId = flowId;
  }
}

/** No approved snapshot exists for this flowId at all — start cannot proceed. */
export class RunJobFlowNotApprovedError extends RunJobError {
  readonly code = 'RUN_JOB_FLOW_NOT_APPROVED' as const;

  constructor(flowId: string) {
    super(flowId, `run-job-service: no approved snapshot found for flowId=${flowId} — start refused`);
  }
}

/** The caller's expected (revision, planDigest) does not CAS-match the
 *  stored approved snapshot — start refused with a typed error, never a
 *  silent fallback to whatever happens to be on disk. */
export class RunJobDigestMismatchError extends RunJobError {
  readonly code = 'RUN_JOB_DIGEST_MISMATCH' as const;
  public readonly expectedRevision: number;
  public readonly expectedPlanDigest: string;
  public readonly actualRevision: number;
  public readonly actualPlanDigest: string;

  constructor(
    flowId: string,
    expectedRevision: number,
    expectedPlanDigest: string,
    actualRevision: number,
    actualPlanDigest: string,
  ) {
    super(
      flowId,
      `run-job-service: start targets revision=${expectedRevision}/digest=${expectedPlanDigest}, ` +
      `but the approved snapshot is revision=${actualRevision}/digest=${actualPlanDigest} (flowId=${flowId})`,
    );
    this.expectedRevision = expectedRevision;
    this.expectedPlanDigest = expectedPlanDigest;
    this.actualRevision = actualRevision;
    this.actualPlanDigest = actualPlanDigest;
  }
}

export interface HeldBudgetTask {
  readonly slot: number;
  readonly title: string;
  readonly profileRef: string;
  readonly reasonCode: string;
  readonly resolvedProvider: string;
  readonly executionCostClass: 'remote' | 'local';
}

/** One or more tasks have no executable owner-budget authority. Approval does
 *  not override this state; start is refused before any provider side effect. */
export class RunJobBudgetHoldError extends RunJobError {
  readonly code = 'RUN_JOB_BUDGET_HOLD' as const;
  readonly heldTasks: readonly HeldBudgetTask[];

  constructor(flowId: string, heldTasks: readonly HeldBudgetTask[]) {
    const ordered = [...heldTasks].sort((a, b) => a.slot - b.slot);
    super(
      flowId,
      `run-job-service: execution budget HOLD for ${ordered.map((item) =>
        `slot-${item.slot} '${item.title}'[${item.reasonCode}:${item.profileRef}]`).join(', ')} — start refused`,
    );
    this.heldTasks = Object.freeze(ordered.map(item => Object.freeze({ ...item })));
  }
}

/** A v3 approved snapshot contains a structural topology blocker. Human
 * approval is not an override for an undeclared shared-writer collision. */
export class RunJobTopologyHoldError extends RunJobError {
  readonly code = 'RUN_JOB_TOPOLOGY_HOLD' as const;

  constructor(flowId: string) {
    super(flowId, `run-job-service: structural execution topology HOLD for flowId=${flowId} — start refused`);
  }
}

// ─── startApprovedRun ───────────────────────────────────────────────────

export interface StartApprovedRunDeps {
  readonly flowId: string;
  readonly expectedRevision: number;
  readonly expectedPlanDigest: string;
  /** Already loaded by the caller (e.g. cli/repl/run-flow-store.ts's
   *  loadApprovedSnapshot) — undefined when nothing was ever approved. */
  readonly approvedSnapshot: ApprovedRunSnapshotInput | undefined;
}

export interface StartApprovedRunResult {
  readonly status: 'validated';
  readonly sprint: Sprint;
}

function matchesCasKey(
  a: { readonly revision: number; readonly planDigest: string },
  revision: number,
  planDigest: string,
): boolean {
  return a.revision === revision && a.planDigest === planDigest;
}

/**
 * Consume an approved plan snapshot and start it — CAS-verified,
 * side-effect-free, and structurally incapable of triggering a fresh plan.
 * Throws a typed {@link RunJobError} subclass for every refusal path and
 * returns the exact approved Sprint on success.
 */
export function startApprovedRun(deps: StartApprovedRunDeps): StartApprovedRunResult {
  const { flowId, expectedRevision, expectedPlanDigest, approvedSnapshot } = deps;

  if (!approvedSnapshot) {
    throw new RunJobFlowNotApprovedError(flowId);
  }
  if (!matchesCasKey(approvedSnapshot, expectedRevision, expectedPlanDigest)) {
    throw new RunJobDigestMismatchError(
      flowId,
      expectedRevision,
      expectedPlanDigest,
      approvedSnapshot.revision,
      approvedSnapshot.planDigest,
    );
  }

  // V2 binds the opaque CAS string to the exact stored Sprint. Legacy records
  // (version absent) retain the explicit v1 compatibility path; a versioned
  // record can never downgrade to that path by omitting its context.
  let versionedBudgetHolds: readonly HeldBudgetTask[] | undefined;
  if (approvedSnapshot.planDigestVersion !== undefined) {
    let digestResult;
    try {
      digestResult = approvedSnapshot.planDigestContext
        ? computeExecutionPlanDigestByVersion(
            approvedSnapshot.planDigestVersion,
            approvedSnapshot.sprint,
            approvedSnapshot.planDigestContext,
          )
        : undefined;
    } catch {
      digestResult = undefined;
    }
    const actualDigest = digestResult?.digest ?? 'invalid-versioned-plan-digest-metadata';
    if (actualDigest !== approvedSnapshot.planDigest) {
      throw new RunJobDigestMismatchError(
        flowId,
        expectedRevision,
        approvedSnapshot.planDigest,
        approvedSnapshot.revision,
        actualDigest,
      );
    }
    if (digestResult?.topology?.verdict === 'block') {
      throw new RunJobTopologyHoldError(flowId);
    }
    versionedBudgetHolds = digestResult!.budgetHolds;
  }

  const legacyBudgetHolds = approvedSnapshot.sprint.tasks.flatMap((task, index): HeldBudgetTask[] => {
    const policy = task.budgetPolicy;
    if (policy?.state !== 'hold') return [];
    return [{
      slot: index + 1,
      title: task.title,
      profileRef: policy.profileRef,
      reasonCode: policy.reasonCode ?? 'unspecified-hold',
      resolvedProvider: policy.resolvedProvider,
      executionCostClass: policy.executionCostClass,
    }];
  });
  const heldTasks = versionedBudgetHolds ?? legacyBudgetHolds;
  if (heldTasks.length > 0) {
    throw new RunJobBudgetHoldError(flowId, heldTasks);
  }

  return { status: 'validated', sprint: approvedSnapshot.sprint };
}
