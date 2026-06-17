// src/orchestra/autonomous/backlog-eval.ts
// Mode-independent Brain-Eval / Auditor / Cross-Verify kernels for the autonomous
// task path (CORE-UNIFORMITY slice 1). Each export is a THIN entry->kernel adapter:
// it builds a minimal Task from a BacklogEntry + its TaskResult and delegates to the
// SAME functions sprint mode calls, so a finished autonomous task passes through the
// same core evaluation. No new evaluation logic lives here — uniformity by construction.
import type { BacklogEntry } from './backlog-types.js';
import type { Task, TaskResult, RubricScore, EvaluationResult, ProviderName } from '../../core/types.js';
import { TaskStatus } from '../../core/types.js';
import { evaluateWithRubric } from '../result-evaluator.js';

export interface BacklogEvaluation {
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  /** Rubric quality score (EvaluationResult.totalScore). */
  quality: number;
  /** True when the worker self-reported NO_GO but the kernel decided otherwise. */
  reconciled: boolean;
  /** Most-informative rubric line (worst failing criterion, else "all criteria passed"). */
  reason: string;
}

/** Build the minimal Task the sprint-mode kernels expect from a backlog entry + its run
 *  result. Shared by every adapter so the entry->Task mapping is single-source. */
export function buildTaskForEval(entry: BacklogEntry, result: TaskResult): Task {
  return {
    id: result.taskId || entry.id,
    title: entry.title,
    description: entry.spec.description ?? entry.summary ?? entry.title,
    model: (entry.model ?? result.tokenUsage?.model ?? 'sonnet') as Task['model'],
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
  };
}

/** Component (1): evaluate a finished autonomous task with the SAME rubric + reconciliation
 *  sprint mode uses (disk-verify outranks a wrong self-report when projectRoot is real). */
export function evaluateBacklogResult(
  entry: BacklogEntry,
  result: TaskResult,
  projectRoot: string,
): BacklogEvaluation {
  const task = buildTaskForEval(entry, result);
  return mapEvaluation(result, evaluateWithRubric(result, task, undefined, projectRoot));
}
