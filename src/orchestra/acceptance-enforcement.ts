// ─── Acceptance Enforcement (ADR-G-040 adapter-runtime slice) ───────────────
//
// Applies the acceptance matrix to a finished rubric evaluation — the
// post-rubric layer the B1 verdict-source chain already audits. Pure
// function: it returns the (possibly) adjusted evaluation plus the typed
// ConfirmationRequest INTENT; the EVALUATE phase persists the request and
// stamps the audit record (side effects stay in sprint-phases).
//
// Mode 'observe' (default): nothing changes — the audit stamp alone shows
// what the policy WOULD do. Mode 'enforce':
//   REJECT — the verdict caps at NO_GO with an `acceptance:reject:<kind>`
//            row; that row is salvage-proof (hasUnsalvageableContractFailure)
//            because a configured policy rejection, like deterministic disk
//            evidence, cannot be argued away by worker-reported signals.
//   ROUTE  — a DONE downgrades to GO_WITH_TECH_DEBT (accepting it clean
//            while a confirmation is still owed would be an early closure);
//            an `acceptance:route:<adapter>` info row is added and a
//            ConfirmationRequest intent is returned. The routed questions
//            are the kernel's undecidable criterion statements when the
//            UNDECIDABLE cell fired, else the task's go-criteria line.
//   ACCEPT — verdict untouched.
// HOLD projections never reach this layer (DecidableVerdict typing).

import { createHash } from 'node:crypto';

import type { Task, TaskResult as LegacyTaskResult } from '../core/types.js';
import type { EvaluationResult } from '../core/task-types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import {
  canonicalTaskAttemptCustodyJson,
  type CanonicalJsonBounds,
  type Sha256Digest,
} from '../core/task-attempt-custody-store.js';
import {
  taskResultV2Digest,
  validateProductionTaskResultV2,
  type TaskResultV2,
} from '../core/task-result-schema.js';
import {
  normalizeAcceptanceOverride,
  resolveAcceptance,
  type AcceptanceOutcome,
} from '../core/acceptance-matrix.js';
import type { ConfirmationRequest } from '../core/confirmation-store.js';
import {
  reduceAcceptanceSettlement,
  type AcceptanceSettlement,
} from '../core/acceptance-settlement.js';
import { fromRubricDecision } from '../core/verdict-types.js';
import { resolveCanonicalTaskKind } from './rubric-registry.js';
import { debugLog } from '../core/utils.js';
import {
  ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION,
  acceptanceConfirmationDigest,
  deriveAcceptanceConfirmationId,
  parseAcceptanceConfirmationLineage,
  type AcceptanceConfirmationLineage,
} from '../core/acceptance-confirmation-contract.js';
import type { ExactAcceptedTaskResultAuthorityMetadata } from './task-result-authority.js';
import type { ExactTaskEvaluationPolicyAuthorityV2 } from './exact-evaluation-policy-authority.js';

export interface AcceptanceRouteAuthority {
  readonly tenantId: string;
  readonly projectId: string;
  readonly generation: number;
}

export interface AcceptanceRouteClaim {
  readonly schemaVersion: typeof ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION;
  readonly confirmationId: string;
  readonly lineage: AcceptanceConfirmationLineage;
  /** Compatibility projection of the canonical lineage evaluation digest. */
  readonly evaluationDigest: AcceptanceConfirmationLineage['evaluationDigest'];
  readonly sourceVerdict: AcceptanceOutcome['verdict'];
  readonly adapter: NonNullable<AcceptanceOutcome['adapter']>;
  readonly claimDigest: string;
}

export interface AcceptanceEnforcementResult {
  readonly evaluation: EvaluationResult;
  /** The policy outcome that was observed/enforced (audit stamp input). */
  readonly outcome: AcceptanceOutcome;
  /** Pure source-verdict/debt projection for the exact matrix cell. */
  readonly settlement: AcceptanceSettlement;
  readonly enforced: boolean;
  /** Set when ROUTE fired in enforce mode — sprint-phases persists it. */
  readonly pendingConfirmation?: Omit<ConfirmationRequest, 'id' | 'requestedAt'>;
  /** Canonical, content-addressed lineage for the pending ROUTE intent. */
  readonly routeClaim?: AcceptanceRouteClaim;
  /** Typed cause for the B1 verdict-source chain when the verdict changed. */
  readonly postRubricCause?: string;
}

type AcceptanceConfig = Pick<ResolvedConfig, 'acceptance_matrix' | 'acceptance_enforcement'>;
type AcceptanceResultInput = LegacyTaskResult | TaskResultV2;

export type ExactAcceptanceEnforcementHoldReason =
  | 'invalid-exact-result'
  | 'task-identity-mismatch'
  | 'attempt-identity-mismatch'
  | 'admission-mismatch'
  | 'result-digest-mismatch'
  | 'evaluation-policy-mismatch'
  | 'route-authority-unavailable';

export type ExactAcceptanceEnforcementResult =
  | {
      readonly state: 'applied';
      readonly enforcement: AcceptanceEnforcementResult;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode: ExactAcceptanceEnforcementHoldReason;
    };

/** Host-revalidated projection of the immutable exact Docker dispatch snapshot. */
export interface ExactAcceptanceTaskAuthority {
  readonly task: Task;
  readonly taskSnapshotSha256: Sha256Digest;
  readonly dispatchTaskMaterialDigest: Sha256Digest;
  readonly sprintId: string;
  readonly evaluationPolicy: ExactTaskEvaluationPolicyAuthorityV2;
}

function sameExactIdentity(
  left: ExactAcceptedTaskResultAuthorityMetadata['identity'],
  right: ExactAcceptedTaskResultAuthorityMetadata['identity'],
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.backend === right.backend
    && left.projectRootSha256 === right.projectRootSha256
    && left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.generation === right.generation;
}

/**
 * Resolve and (in enforce mode) apply the acceptance policy for one
 * evaluation. The UNDECIDABLE cell is consulted when the criterion kernel
 * left undecidable items; otherwise the cell of the verdict itself.
 */
export function applyAcceptanceEnforcement(
  evaluation: EvaluationResult,
  task: Task,
  result: LegacyTaskResult,
  sprintId: string,
  config?: AcceptanceConfig,
  routeAuthority?: AcceptanceRouteAuthority,
): AcceptanceEnforcementResult {
  return applyAcceptanceEnforcementWithAttempt(
    evaluation,
    task,
    result,
    sprintId,
    config,
    routeAuthority,
    undefined,
  );
}

/**
 * Exact normal-Docker acceptance boundary. The accepted-result digest and full
 * attempt identity are revalidated before any matrix decision can become a T11
 * receipt input. Public/worker attempt fields cannot mint this authority.
 */
export function applyExactAcceptanceEnforcement(input: {
  readonly evaluation: EvaluationResult;
  readonly taskAuthority: ExactAcceptanceTaskAuthority;
  readonly result: TaskResultV2;
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly jsonBounds: CanonicalJsonBounds;
}): ExactAcceptanceEnforcementResult {
  const validated = validateProductionTaskResultV2(input.result, input.jsonBounds);
  if (!validated.ok) return { state: 'hold', reasonCode: 'invalid-exact-result' };
  const identity = validated.value.attemptCustody.identity;
  let observedTaskDigest: Sha256Digest;
  try {
    observedTaskDigest = `sha256:${createHash('sha256')
      .update(canonicalTaskAttemptCustodyJson(input.taskAuthority.task, input.jsonBounds))
      .digest('hex')}`;
  } catch {
    return { state: 'hold', reasonCode: 'task-identity-mismatch' };
  }
  if (
    input.taskAuthority.task.id !== validated.value.taskId
    || input.acceptedAuthority.identity.taskId !== validated.value.taskId
    || (validated.value.sprintId !== undefined
      && validated.value.sprintId !== input.taskAuthority.sprintId)
    || observedTaskDigest !== input.taskAuthority.dispatchTaskMaterialDigest
  ) return { state: 'hold', reasonCode: 'task-identity-mismatch' };
  if (
    !sameExactIdentity(identity, input.acceptedAuthority.identity)
    || !sameExactIdentity(
      input.acceptedAuthority.acceptedResultRef.identity,
      input.acceptedAuthority.identity,
    )
  ) return { state: 'hold', reasonCode: 'attempt-identity-mismatch' };
  if (
    validated.value.attemptCustody.admissionReceiptDigest
      !== input.acceptedAuthority.admissionReceiptDigest
  ) return { state: 'hold', reasonCode: 'admission-mismatch' };
  if (taskResultV2Digest(validated.value, input.jsonBounds) !== input.acceptedAuthority.resultDigest) {
    return { state: 'hold', reasonCode: 'result-digest-mismatch' };
  }
  const kind = resolveCanonicalTaskKind(input.taskAuthority.task);
  const evaluationPolicy = input.taskAuthority.evaluationPolicy;
  if (
    evaluationPolicy.taskId !== input.taskAuthority.task.id
    || evaluationPolicy.sprintId !== input.taskAuthority.sprintId
    || evaluationPolicy.dispatchTaskMaterialDigest
      !== input.taskAuthority.dispatchTaskMaterialDigest
    || evaluationPolicy.taskKind !== kind
  ) return { state: 'hold', reasonCode: 'evaluation-policy-mismatch' };
  const undecidable = input.evaluation.contractSummary?.undecidableItems ?? [];
  const verdict = undecidable.length > 0
    ? 'UNDECIDABLE'
    : fromRubricDecision(input.evaluation.decision);
  if (verdict === 'HOLD') return { state: 'hold', reasonCode: 'evaluation-policy-mismatch' };
  const cell = evaluationPolicy.acceptance.row[verdict];
  if (cell === undefined) return { state: 'hold', reasonCode: 'evaluation-policy-mismatch' };
  const outcome: AcceptanceOutcome = Object.freeze({
    kind,
    verdict,
    action: cell.action,
    ...(cell.adapter !== null ? { adapter: cell.adapter } : {}),
    source: cell.source,
  });
  const enforcement = applyResolvedAcceptanceEnforcementWithAttempt(
    input.evaluation,
    input.taskAuthority.task,
    validated.value,
    input.taskAuthority.sprintId,
    outcome,
    evaluationPolicy.acceptance.enforcement === 'enforce',
    {
      tenantId: input.taskAuthority.task.actor?.tenantId ?? 'local',
      projectId: identity.projectId,
      generation: identity.generation,
    },
    Object.freeze({ attemptId: identity.attemptId, generation: identity.generation }),
  );
  if (
    evaluationPolicy.acceptance.enforcement === 'enforce'
    && enforcement.outcome.action === 'ROUTE'
    && enforcement.evaluation.decision !== 'NO_GO'
    && (enforcement.routeClaim === undefined
      || enforcement.pendingConfirmation === undefined)
  ) return { state: 'hold', reasonCode: 'route-authority-unavailable' };
  return { state: 'applied', enforcement };
}

function applyAcceptanceEnforcementWithAttempt(
  evaluation: EvaluationResult,
  task: Task,
  result: AcceptanceResultInput,
  sprintId: string,
  config?: AcceptanceConfig,
  routeAuthority?: AcceptanceRouteAuthority,
  exactAttempt?: Readonly<{ readonly attemptId: string; readonly generation: number }>,
): AcceptanceEnforcementResult {
  const kind = resolveCanonicalTaskKind(task);
  const { override, rejected } = normalizeAcceptanceOverride(config?.acceptance_matrix);
  if (rejected.length > 0) {
    debugLog('acceptance-enforcement', `dropped invalid override rules: ${rejected.join(' | ')}`);
  }

  const undecidable = evaluation.contractSummary?.undecidableItems ?? [];
  // The routed question set decides WHICH matrix cell fires: open undecidable
  // criteria consult the UNDECIDABLE cell; a fully-decided evaluation
  // consults its own verdict's cell.
  const verdict = undecidable.length > 0 ? 'UNDECIDABLE' : fromRubricDecision(evaluation.decision);
  if (verdict === 'HOLD') {
    // Unreachable with the current 3-value decision surface; typed guard.
    const outcome = resolveAcceptance(kind, 'FAILED', override);
    return {
      evaluation,
      outcome,
      settlement: reduceAcceptanceSettlement({
        sourceVerdict: outcome.verdict,
        matrixDecision: outcome,
        confirmation: { status: 'MISSING' },
      }),
      enforced: false,
    };
  }
  const outcome = resolveAcceptance(kind, verdict, override);
  return applyResolvedAcceptanceEnforcementWithAttempt(
    evaluation,
    task,
    result,
    sprintId,
    outcome,
    config?.acceptance_enforcement === 'enforce',
    routeAuthority,
    exactAttempt,
  );
}

function applyResolvedAcceptanceEnforcementWithAttempt(
  evaluation: EvaluationResult,
  task: Task,
  result: AcceptanceResultInput,
  sprintId: string,
  outcome: AcceptanceOutcome,
  enforce: boolean,
  routeAuthority?: AcceptanceRouteAuthority,
  exactAttempt?: Readonly<{ readonly attemptId: string; readonly generation: number }>,
): AcceptanceEnforcementResult {
  const kind = outcome.kind;
  const verdict = outcome.verdict;
  const undecidable = evaluation.contractSummary?.undecidableItems ?? [];
  // Keep the immutable rubric verdict and the exact resolved cell together.
  // This is intent only: the EVALUATE service remains the durability boundary
  // that decides whether a routed downgrade can become authoritative.
  const settlement = reduceAcceptanceSettlement({
    sourceVerdict: verdict,
    matrixDecision: outcome,
    confirmation: { status: 'MISSING' },
  });

  if (!enforce || outcome.action === 'ACCEPT') {
    return { evaluation, outcome, settlement, enforced: false };
  }

  if (outcome.action === 'REJECT') {
    if (evaluation.decision === 'NO_GO') return { evaluation, outcome, settlement, enforced: false };
    const cause = `acceptance-policy:reject:${kind}·${verdict}`;
    return {
      evaluation: {
        ...evaluation,
        decision: 'NO_GO',
        rubricScores: [...evaluation.rubricScores, {
          criterion: `acceptance:reject:${kind}`,
          score: 0,
          passed: false,
          reason: `${verdict} is not acceptable for ${kind} per the acceptance matrix (${outcome.source}) — capped at NO_GO`,
        }],
      },
      outcome,
      settlement,
      enforced: true,
      postRubricCause: cause,
    };
  }

  // ROUTE — never on a NO_GO (there is nothing to confirm into acceptance).
  if (evaluation.decision === 'NO_GO') return { evaluation, outcome, settlement, enforced: false };
  const attemptId = exactAttempt?.attemptId ?? (result.workAttribution?.state === 'VERIFIED'
    ? result.workAttribution.attemptId
    : undefined);
  if (!routeAuthority || !attemptId) {
    // A route without explicit tenancy/project/generation and verified attempt
    // identity cannot be made canonical. Do not manufacture defaults and do
    // not withhold the baseline verdict for an intent that cannot be persisted.
    return { evaluation, outcome, settlement, enforced: false };
  }
  let evaluationDigest: string;
  let lineage: AcceptanceConfirmationLineage;
  try {
    const resultDigest = acceptanceConfirmationDigest(result);
    evaluationDigest = acceptanceConfirmationDigest(evaluation);
    const policyDigest = acceptanceConfirmationDigest(outcome);
    // Each authority binds its own source bytes. In particular, never alias
    // the result and evaluation digests: they attest different producer
    // inputs even when those inputs happen to describe the same verdict.
    const sourceDigest = acceptanceConfirmationDigest({
      verdict,
      undecidableItems: undecidable,
    });
    const parsed = parseAcceptanceConfirmationLineage({
      tenantId: routeAuthority.tenantId,
      projectId: routeAuthority.projectId,
      sprintId,
      taskId: task.id,
      attemptId,
      generation: routeAuthority.generation,
      evaluationDigest,
      resultDigest,
      policyDigest,
      sourceDigest,
    });
    if (!parsed.ok) return { evaluation, outcome, settlement, enforced: false };
    lineage = parsed.value;
  } catch {
    // Non-canonical input bytes cannot authorize a route intent.
    return { evaluation, outcome, settlement, enforced: false };
  }
  const confirmationId = deriveAcceptanceConfirmationId(lineage);
  const unsignedRouteClaim = {
    schemaVersion: ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION,
    confirmationId,
    lineage,
    evaluationDigest: lineage.evaluationDigest,
    sourceVerdict: verdict,
    adapter: outcome.adapter!,
  };
  const routeClaim: AcceptanceRouteClaim = Object.freeze({
    ...unsignedRouteClaim,
    lineage: Object.freeze(lineage),
    claimDigest: acceptanceConfirmationDigest(unsignedRouteClaim),
  });
  const statements = undecidable.length > 0
    ? undecidable.map(item => item.statement)
    : [task.goNogo?.goCriteria ?? task.title];
  const authorProvider = 'provider' in result && typeof result.provider === 'string'
    ? result.provider
    : result.tokenUsage !== undefined
      && 'provider' in result.tokenUsage
      && typeof result.tokenUsage.provider === 'string'
      ? result.tokenUsage.provider
      : undefined;
  const routed: AcceptanceEnforcementResult = {
    evaluation: {
      ...evaluation,
      decision: evaluation.decision === 'DONE' ? 'GO_WITH_TECH_DEBT' : evaluation.decision,
      rubricScores: [...evaluation.rubricScores, {
        criterion: `acceptance:route:${outcome.adapter}`,
        score: 100,
        passed: true,
        reason: `${verdict} for ${kind} routes to the ${outcome.adapter} adapter (${outcome.source}) — confirmation pending, clean DONE withheld`,
      }],
    },
    outcome,
    settlement,
    enforced: true,
    routeClaim,
    pendingConfirmation: {
      sprintId,
      taskId: task.id,
      itemIds: undecidable.map(item => item.itemId),
      kind,
      verdict,
      adapter: outcome.adapter!,
      statements,
      evidenceRequirements: (task.goNogo?.items ?? [])
        .filter(item => undecidable.some(u => u.itemId === item.id))
        .flatMap(item => item.evidenceRequirements ?? []),
      source: 'acceptance-matrix',
      // Provider identity for the llm adapter's cross-provider separation;
      // absent identity stays absent (no guessed default).
      ...(authorProvider !== undefined ? { authorProvider } : {}),
    },
    ...(evaluation.decision === 'DONE'
      ? { postRubricCause: `acceptance-policy:route:${outcome.adapter}` }
      : {}),
  };
  return routed;
}
