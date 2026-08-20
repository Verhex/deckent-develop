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

import type { Task, TaskResult } from '../core/types.js';
import type { EvaluationResult } from '../core/task-types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import {
  normalizeAcceptanceOverride,
  resolveAcceptance,
  type AcceptanceOutcome,
} from '../core/acceptance-matrix.js';
import type { ConfirmationRequest } from '../core/confirmation-store.js';
import { fromRubricDecision } from '../core/verdict-types.js';
import { resolveCanonicalTaskKind } from './rubric-registry.js';
import { debugLog } from '../core/utils.js';

export interface AcceptanceEnforcementResult {
  readonly evaluation: EvaluationResult;
  /** The policy outcome that was observed/enforced (audit stamp input). */
  readonly outcome: AcceptanceOutcome;
  readonly enforced: boolean;
  /** Set when ROUTE fired in enforce mode — sprint-phases persists it. */
  readonly pendingConfirmation?: Omit<ConfirmationRequest, 'id' | 'requestedAt'>;
  /** Typed cause for the B1 verdict-source chain when the verdict changed. */
  readonly postRubricCause?: string;
}

type AcceptanceConfig = Pick<ResolvedConfig, 'acceptance_matrix' | 'acceptance_enforcement'>;

/**
 * Resolve and (in enforce mode) apply the acceptance policy for one
 * evaluation. The UNDECIDABLE cell is consulted when the criterion kernel
 * left undecidable items; otherwise the cell of the verdict itself.
 */
export function applyAcceptanceEnforcement(
  evaluation: EvaluationResult,
  task: Task,
  result: TaskResult,
  sprintId: string,
  config?: AcceptanceConfig,
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
    return { evaluation, outcome: resolveAcceptance(kind, 'FAILED', override), enforced: false };
  }
  const outcome = resolveAcceptance(kind, verdict, override);

  const enforce = config?.acceptance_enforcement === 'enforce';
  if (!enforce || outcome.action === 'ACCEPT') {
    return { evaluation, outcome, enforced: false };
  }

  if (outcome.action === 'REJECT') {
    if (evaluation.decision === 'NO_GO') return { evaluation, outcome, enforced: false };
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
      enforced: true,
      postRubricCause: cause,
    };
  }

  // ROUTE — never on a NO_GO (there is nothing to confirm into acceptance).
  if (evaluation.decision === 'NO_GO') return { evaluation, outcome, enforced: false };
  const statements = undecidable.length > 0
    ? undecidable.map(item => item.statement)
    : [task.goNogo?.goCriteria ?? task.title];
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
    enforced: true,
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
      ...(result.tokenUsage?.provider ? { authorProvider: result.tokenUsage.provider } : {}),
    },
    ...(evaluation.decision === 'DONE'
      ? { postRubricCause: `acceptance-policy:route:${outcome.adapter}` }
      : {}),
  };
  return routed;
}
