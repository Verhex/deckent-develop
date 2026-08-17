// src/orchestra/autonomous/backlog-eval.ts
// Mode-independent Brain-Eval / Auditor / Cross-Verify kernels for the autonomous
// task path (CORE-UNIFORMITY slice 1). Each export is a THIN entry->kernel adapter:
// it builds a minimal Task from a BacklogEntry + its TaskResult and delegates to the
// SAME functions sprint mode calls, so a finished autonomous task passes through the
// same core evaluation. No new evaluation logic lives here — uniformity by construction.
import type { BacklogEntry } from './backlog-types.js';
import type { Task, TaskResult, TaskScope, RubricScore, EvaluationResult, ProviderName, TaskEvaluation } from '../../core/types.js';
import { TaskStatus } from '../../core/types.js';
import type { ResolvedConfig } from '../../core/types.js';
import { resolveDefaultModel } from '../../core/config.js';
import { evaluateWithRubric, reconcileEvaluationSpuriousNoGo } from '../result-evaluator.js';
import type { BoundaryViolation } from '../../core/monitoring-types.js';
import {
  isFileInScope, checkADRCompliance, verifyWorkerResult,
  type ADRViolation, type VerificationResult,
} from '../../monitor/auditor.js';
import { runCrossVerify, type RunCrossVerifyOptions } from '../cross-verify-runner.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';
import { TASKS_DIR } from '../../core/constants.js';

export interface BacklogEvaluation {
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  /** Rubric quality score (EvaluationResult.totalScore). */
  quality: number;
  /** True when the worker self-reported NO_GO but the kernel decided otherwise. */
  reconciled: boolean;
  /** Most-informative rubric line (worst failing criterion, else "all criteria passed"). */
  reason: string;
  /** True when the Brain NO_GO is purely a result-schema rejection (e.g. missing
   *  coverage on a comment/doc change) rather than a quality judgment — the only
   *  NO_GO the Auditor-reconcile is allowed to upgrade. */
  schemaRejected?: boolean;
}

/** Build the minimal Task the sprint-mode kernels expect from a backlog entry + its run
 *  result. Shared by every adapter so the entry->Task mapping is single-source.
 *  454-003: the model fallback (when neither the entry nor the worker's tokenUsage
 *  report one) resolves through the canonical default-model resolver — never a bare
 *  alias literal ('sonnet') that the model registry would not recognize. */
export function buildTaskForEval(entry: BacklogEntry, result: TaskResult, config?: ResolvedConfig): Task {
  return {
    id: result.taskId || entry.id,
    title: entry.title,
    description: entry.spec.description ?? entry.summary ?? entry.title,
    model: (entry.model ?? result.tokenUsage?.model ?? resolveDefaultModel(config)) as Task['model'],
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: { directories: [entry.spec.scopeDir ?? '.'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: entry.summary ?? entry.title, noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
    provider: entry.provider as ProviderName | undefined,
  };
}

/** Pick the most-informative reason: the worst FAILING criterion, else "all criteria passed". */
function pickReason(scores: RubricScore[]): string {
  if (scores.length === 0) return 'no rubric scored';
  const failed = scores.filter((s) => !s.passed);
  if (failed.length === 0) return 'all criteria passed';
  return failed.reduce((a, b) => (b.score < a.score ? b : a)).reason;
}

/** Map a kernel EvaluationResult onto the compact BacklogEvaluation. Pure — `reconciled`
 *  is derived (the kernel overrides `decision` internally but exposes no flag). */
export function mapEvaluation(result: TaskResult, evaluation: EvaluationResult): BacklogEvaluation {
  return {
    decision: evaluation.decision,
    quality: evaluation.totalScore,
    reconciled: result.selfAssessment === 'NO_GO' && evaluation.decision !== 'NO_GO',
    reason: pickReason(evaluation.rubricScores),
    schemaRejected: evaluation.rubricScores.some((s) => s.criterion === 'schema_validation' && !s.passed),
  };
}

/** Component (1): evaluate a finished autonomous task with the SAME rubric + reconciliation
 *  sprint mode uses (disk-verify outranks a wrong self-report when projectRoot is real). */
export async function evaluateBacklogResult(
  entry: BacklogEntry,
  result: TaskResult,
  projectRoot: string,
  config?: ResolvedConfig,
): Promise<BacklogEvaluation> {
  const task = buildTaskForEval(entry, result, config);
  // RUN-POLICY-DELIVERY-001: both producers below are parity-gated at the
  // result-evaluator terminal boundary (grader exit + reconcile exit).
  const evaluation = await reconcileEvaluationSpuriousNoGo(
    evaluateWithRubric(result, task, undefined, projectRoot), result, task, projectRoot);
  return mapEvaluation(result, evaluation);
}

export interface AuditVerdict {
  boundary: 'clean' | BoundaryViolation[];
  adr: 'ok' | ADRViolation[];
  functional: 'pass' | 'fail' | 'skipped';
}

export interface AuditDeps {
  /** Injected for hermetic tests (default = real verifyWorkerResult, which may spawn git/tsc). */
  verifyFunctional?: (taskId: string, projectRoot: string, result: TaskResult) => Promise<VerificationResult>;
  /** Injected for hermetic tests (default = real checkADRCompliance). */
  checkAdr?: (projectRoot: string, changedFiles: string[]) => ADRViolation[];
}

/** Component ②: post-execution Auditor verdict (advisory only — never flips the Brain
 *  decision, per ADR-037 V1.0). Reuses the auditor's scope primitive + ADR + functional
 *  checks against the worker's declared filesChanged (the post-hoc ground truth). */
export async function auditBacklogResult(
  entry: BacklogEntry,
  result: TaskResult,
  projectRoot: string,
  deps: AuditDeps = {},
): Promise<AuditVerdict> {
  // boundary — scopeDir "." / undefined means "no declared scope" → no boundary claim.
  const scopeDir = entry.spec.scopeDir;
  let boundary: 'clean' | BoundaryViolation[] = 'clean';
  if (scopeDir && scopeDir !== '.') {
    const scope: TaskScope = { directories: [scopeDir], filesRead: [], filesWrite: [] };
    const violations: BoundaryViolation[] = [];
    for (const f of result.filesChanged) {
      if (!isFileInScope(f, scope)) {
        violations.push({
          type: 'file_outside_scope',
          agentId: result.workerId || entry.id,
          detail: `File outside scope: ${f}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
    if (violations.length > 0) boundary = violations;
  }

  // adr — hermetic by default: absent .brain/memory.db → [] → 'ok'.
  const adrViolations = (deps.checkAdr ?? checkADRCompliance)(projectRoot, result.filesChanged);
  const adr: 'ok' | ADRViolation[] = adrViolations.length === 0 ? 'ok' : adrViolations;

  // functional — nothing changed → nothing to functionally verify.
  let functional: 'pass' | 'fail' | 'skipped';
  if (result.filesChanged.length === 0) {
    functional = 'skipped';
  } else {
    const verify = deps.verifyFunctional ?? ((id, pr, r) => verifyWorkerResult(id, pr, r));
    const vr = await verify(result.taskId, projectRoot, result);
    functional = vr.verdict === 'PASS' ? 'pass' : 'fail';
  }

  return { boundary, adr, functional };
}

export interface CrossVerifyVerdict {
  /** True when a 2nd-provider verifier actually ran. False = honest-skip (disabled /
   *  no 2nd provider / not-passing) — never a silent pass. */
  ran: boolean;
  verdict?: 'confirmed' | 'refuted' | 'unclear';
}

/** Brain⇄Auditor reconciliation (false-NO_GO fix). Narrowly upgrades a Brain NO_GO to
 *  GO_WITH_TECH_DEBT ONLY when that NO_GO is a result-SCHEMA rejection (e.g. a verified
 *  comment/doc change whose result omitted `coverage`), AND the Auditor's functional check
 *  passed, AND the change is in-scope (boundary clean) on real files, AND the worker did not
 *  honestly self-report NO_GO. A genuine low-quality rubric NO_GO is NOT a schema rejection
 *  and is left intact. (Note: `functional: 'pass'` can be a trivial pass-by-default for a
 *  source change lacking a co-located test — so this fires only for the schema-technicality
 *  case, never to launder a quality failure; the ceiling is GO_WITH_TECH_DEBT, never DONE.) */
export function reconcileWithAudit(
  evaluation: BacklogEvaluation,
  verdict: AuditVerdict,
  result: TaskResult,
): BacklogEvaluation {
  if (
    evaluation.decision === 'NO_GO' &&
    evaluation.schemaRejected === true &&
    result.selfAssessment !== 'NO_GO' &&
    verdict.functional === 'pass' &&
    verdict.boundary === 'clean' &&
    result.filesChanged.length > 0
  ) {
    return {
      decision: 'GO_WITH_TECH_DEBT',
      quality: evaluation.quality,
      reconciled: true,
      reason: `Brain schema-NO_GO reconciled by Auditor: functional pass + clean boundary on real work (${evaluation.reason})`,
    };
  }
  return evaluation;
}

/** Component ③ (BINDING): cross-provider verification — Anthropic's work checked by
 *  OpenAI and vice-versa. Advisory: a `refuted` verdict is surfaced + persisted but never
 *  flips the Brain decision (Brain/human decides). Honest-skip when no 2nd provider. */
export async function crossVerifyBacklogResult(
  entry: BacklogEntry,
  result: TaskResult,
  projectRoot: string,
  config: ResolvedConfig | undefined,
  evaluation: BacklogEvaluation,
  opts: RunCrossVerifyOptions = {},
): Promise<CrossVerifyVerdict> {
  const task = buildTaskForEval(entry, result, config);
  // EvaluationResult.decision strings equal the TaskEvaluation enum values.
  const decisionEnum = evaluation.decision as unknown as TaskEvaluation;
  const run = await runCrossVerify(projectRoot, task, result, decisionEnum, config, opts);
  return { ran: run.ran, ...(run.advisory ? { verdict: run.advisory.verdict } : {}) };
}

/** Merge the Brain+Auditor+CrossVerify verdict into the worker's `.result` as a
 *  `brainAssessment` field, alongside the worker's own `selfAssessment` — so the result
 *  record carries BOTH the worker's self-report AND the orchestrator's assessment
 *  (traceability + AI-operator data). Mirrors cross-verify's writeAdvisoryToResult.
 *  Fail-safe: a missing `.result` or any I/O error is swallowed — a writeback must never
 *  break the dispatch. */
export function writeBrainAssessmentToResult(
  projectRoot: string,
  taskId: string,
  assessment: NonNullable<BacklogEntry['lastResult']>,
): void {
  try {
    const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    if (!existsSync(resultPath)) return;
    const parsed = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    parsed.brainAssessment = assessment;
    atomicWriteFileSync(resultPath, JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    /* fail-safe — never let a result-writeback error break the dispatch */
  }
}
