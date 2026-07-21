// ═══ run-flow-decision-service — shared decide/start use-case (SURF-6) ═══════
//
// The ONE approve→snapshot-persist / reject / start→detached-spawn sequence,
// shared by every surface: the API's decision/start routes, the CLI's
// `deckent runs <n> --approve|--reject|--start`, and the REPL's /runs card.
// Extracted verbatim from api/run-flow-routes.ts's handleDecision/handleStart
// bodies so no surface re-implements the glue (the full-spectrum "no second
// implementation" invariant) — and the first concrete slice of the typed
// application-service layer (MASTER-PLAN 587).
//
// Layering (ADR-D-004 C3): surfaces must not import one another — api/ and
// cli/ both import THIS module (orchestra/), never each other.
//
// Cross-surface convergence: commandIds are deterministic
// (`approve-<flowId>-r<rev>`, `reject-<flowId>-r<rev>`, `start-<flowId>-r<rev>`,
// `run-started-<flowId>-r<rev>`) so the SAME decision issued from two surfaces
// (Desktop Telegraph AND the CLI) deduplicates by coordinator
// command-idempotency instead of racing — first writer wins, the second is a
// no-op fold of the identical command.
//
// Event visibility: this module never touches SSE. Inside the daemon process
// the shared coordinator's `onEvent` publishes every durable event live; from
// a foreign process (CLI) the daemon picks the appended events up via the
// SURF-5 freshness probe and re-publishes them onto open streams.

import { getRunFlowCoordinator } from './run-flow-coordinator-registry.js';
import {
  loadPlannedSprint,
  loadRunHandle,
  saveApprovedSnapshot,
  type StoredApprovedSnapshot,
} from '../core/run-flow-store.js';
import { startApprovedRun } from './run-job-service.js';
import type { RunFlowContext, RunHandle } from '../core/run-flow-contract.js';
import type { ActorContext } from '../core/work-model.js';
import type { Sprint } from '../core/types.js';
import {
  computeExecutionPlanDigest,
  EXECUTION_PLAN_DIGEST_VERSION,
} from '../core/execution-plan-digest.js';
import type { PlanPreview } from '../core/run-flow-contract.js';

// ─── Typed refusals (surfaces map these to 409 / an honest CLI line) ─────────

export type RunFlowDecisionRefusalCode =
  | 'NO_LIVE_PREVIEW'
  | 'PLANNED_SPRINT_MISSING'
  | 'PLANNED_SPRINT_DIGEST_MISMATCH'
  | 'NOT_APPROVED';

/** A refusal that is a state-of-the-world fact, not a transition bug —
 *  API adapters answer 409, the CLI prints the message and exits non-zero. */
export class RunFlowDecisionError extends Error {
  constructor(
    readonly code: RunFlowDecisionRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = 'RunFlowDecisionError';
  }
}

// ─── decide (approve / reject) ────────────────────────────────────────────────

export interface DecideRunFlowInput {
  readonly decision: 'approve' | 'reject';
  /** Recorded with a rejection; ignored for approve. */
  readonly reason?: string;
  /** Who decided — e.g. `{id:'repl-user'}`, `{id:'cli-operator'}`, or the
   *  API's derived request principal. */
  readonly actor: ActorContext;
}

function loadAndVerifyPlannedSprint(
  projectRoot: string,
  flowId: string,
  preview: Pick<PlanPreview, 'revision' | 'planDigest' | 'planDigestVersion' | 'planDigestContext'>,
): NonNullable<ReturnType<typeof loadPlannedSprint>> {
  const planned = loadPlannedSprint(projectRoot, flowId, {
    revision: preview.revision,
    planDigest: preview.planDigest,
    ...(preview.planDigestVersion !== undefined ? { planDigestVersion: preview.planDigestVersion } : {}),
  });
  if (!planned) {
    throw new RunFlowDecisionError(
      'PLANNED_SPRINT_MISSING',
      'run-flow: exact planned sprint record missing for this revision/digest',
    );
  }
  if (preview.planDigestVersion !== undefined) {
    const context = planned.planDigestContext;
    const actual = preview.planDigestVersion === EXECUTION_PLAN_DIGEST_VERSION && context
      ? computeExecutionPlanDigest(planned.sprint as Sprint, context).digest
      : 'invalid-versioned-plan-digest-metadata';
    if (actual !== preview.planDigest || planned.planDigest !== preview.planDigest) {
      throw new RunFlowDecisionError(
        'PLANNED_SPRINT_DIGEST_MISMATCH',
        `run-flow: planned sprint content digest mismatch (expected=${preview.planDigest}, actual=${actual})`,
      );
    }
  }
  return planned;
}

/**
 * Apply an approval decision to a flow. Approve additionally persists the
 * durable ApprovedPlanSnapshot (from the plan captured at preview time), so an
 * approve AFTER a process restart still snapshots correctly.
 *
 * Throws {@link RunFlowDecisionError} for state refusals,
 * `FlowNotFoundError` for unknown flows, and the coordinator's transition
 * errors (`RunFlowTransitionError`/`InvalidTransitionError`) for CAS/stale
 * conflicts — callers map, never swallow.
 */
export function decideRunFlow(
  projectRoot: string,
  flowId: string,
  input: DecideRunFlowInput,
): RunFlowContext {
  const coordinator = getRunFlowCoordinator(projectRoot);
  const existing = coordinator.getFlow(flowId);

  if (input.decision === 'approve') {
    const { preview } = existing;
    if (!preview) {
      throw new RunFlowDecisionError('NO_LIVE_PREVIEW', 'run-flow: no live preview to approve');
    }
    // Verify the durable exact snapshot BEFORE emitting APPROVAL_GRANTED.
    const planned = loadAndVerifyPlannedSprint(projectRoot, flowId, preview);
    const result = coordinator.grantApproval({
      flowId,
      revision: preview.revision,
      planDigest: preview.planDigest,
      approvedBy: input.actor,
      commandId: `approve-${flowId}-r${preview.revision}`,
    });
    const context = result.context;
    if (context.state === 'APPROVED' && context.approvedSnapshot) {
      // The captured plan is durable (savePlannedSprint at preview time) —
      // an approve AFTER a process restart still snapshots correctly.
      const stored: StoredApprovedSnapshot = {
        flowId,
        revision: context.approvedSnapshot.revision,
        planDigest: context.approvedSnapshot.planDigest,
        ...(preview.planDigestVersion !== undefined ? { planDigestVersion: preview.planDigestVersion } : {}),
        ...(planned.planDigestContext !== undefined ? { planDigestContext: planned.planDigestContext } : {}),
        approvedBy: context.approvedSnapshot.approvedBy,
        approvedAt: context.approvedSnapshot.approvedAt,
        sprint: planned.sprint as Sprint,
      };
      saveApprovedSnapshot(projectRoot, stored);
    }
    return context;
  }

  const result = coordinator.rejectApproval({
    flowId,
    revision: existing.preview?.revision ?? existing.proposal?.revision ?? 1,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    commandId: `reject-${flowId}-r${existing.preview?.revision ?? 1}`,
  });
  return result.context;
}

// ─── start (APPROVED → detached run) ─────────────────────────────────────────

export interface StartRunFlowOptions {
  /** The ONLY way a real process starts. Injectable for hermetic tests;
   *  surfaces pass their detached-spawn closure (the CLI-args shape lives
   *  with the callers — cli/helpers/detached-start.ts — because orchestra/
   *  must not depend on a surface). */
  readonly spawnStart: (sprint: Sprint, flowId: string) => RunHandle;
}

export interface StartRunFlowResult {
  readonly status: 'started' | 'noop-duplicate';
  readonly context: RunFlowContext;
}

/**
 * Start an APPROVED flow: START_REQUESTED via the coordinator, detached spawn
 * through the caller's closure, RUN_STARTED recorded — the child stays the
 * single handle-writer (born-681). Double-start is a safe `'noop-duplicate'`
 * (CAS on the existing run handle inside startApprovedRun).
 */
export function startRunFlow(
  projectRoot: string,
  flowId: string,
  options: StartRunFlowOptions,
): StartRunFlowResult {
  const coordinator = getRunFlowCoordinator(projectRoot);
  const existing = coordinator.getFlow(flowId);
  const snapshot = existing.approvedSnapshot;
  if (existing.state !== 'APPROVED' || !snapshot) {
    throw new RunFlowDecisionError('NOT_APPROVED', `run-flow: flow is ${existing.state}, not APPROVED`);
  }

  const planned = loadAndVerifyPlannedSprint(projectRoot, flowId, {
    revision: snapshot.revision,
    planDigest: snapshot.planDigest,
    ...(existing.preview?.planDigestVersion !== undefined
      ? { planDigestVersion: existing.preview.planDigestVersion }
      : {}),
    ...(existing.preview?.planDigestContext !== undefined
      ? { planDigestContext: existing.preview.planDigestContext }
      : {}),
  });
  coordinator.requestStart({
    flowId,
    revision: snapshot.revision,
    planDigest: snapshot.planDigest,
    commandId: `start-${flowId}-r${snapshot.revision}`,
  });
  const stored: StoredApprovedSnapshot = {
    flowId,
    revision: snapshot.revision,
    planDigest: snapshot.planDigest,
    ...(existing.preview?.planDigestVersion !== undefined
      ? { planDigestVersion: existing.preview.planDigestVersion }
      : {}),
    ...(planned.planDigestContext !== undefined ? { planDigestContext: planned.planDigestContext } : {}),
    approvedBy: snapshot.approvedBy,
    approvedAt: snapshot.approvedAt,
    sprint: planned.sprint as Sprint,
  };

  const existingRunHandle = loadRunHandle(projectRoot, flowId);
  const result = startApprovedRun({
    flowId,
    expectedRevision: snapshot.revision,
    expectedPlanDigest: snapshot.planDigest,
    approvedSnapshot: stored,
    ...(existingRunHandle ? { existingRunHandle } : {}),
    spawnStart: options.spawnStart,
  });

  const final = coordinator.recordRunStarted({
    handle: result.handle,
    commandId: `run-started-${flowId}-r${snapshot.revision}`,
  });
  return { status: result.status, context: final.context };
}
