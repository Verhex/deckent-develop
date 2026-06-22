// ─── Result Promoter ─────────────────────────────────────────────────────────
// Partial-promotion pipeline first-slice (PROMOTE-W1, sprint-303).
// Attempts to salvage in-scope work from a NO_GO result where only out-of-scope
// files caused the failure (BOUNDARY_VIOLATION or UNKNOWN category).
// Commit/revert wiring is deferred to a subsequent slice (PROMOTE-W2).

import type { Task, TaskResult, EvaluationResult } from '../core/task-types.js';
import { defaultRunTscCheck, defaultRunVitestScopeCheck } from './mid-sprint-adapter.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Result of a partial-promotion attempt */
export interface PartialPromotionResult {
  /** True when in-scope work was successfully validated and extracted */
  promoted: boolean;
  /** Human-readable reason for the outcome */
  reason: string;
  /** Files from result.filesChanged that are within task scope */
  inScopeFiles: string[];
  /** Files from result.filesChanged that are outside task scope */
  droppedFiles: string[];
  /** Copy of result with filesChanged limited to inScopeFiles; null when promoted=false */
  promotedResult: TaskResult | null;
}

/** Injectable overrides for hermetic testing */
export interface PartialPromotionOptions {
  // R8/ADR-087: the default tsc/vitest runners are async `spawn` now (they used
  // to be spawnSync, freezing the event loop). Test stubs may still return a plain
  // value — `await` on a non-Promise is a no-op.
  runTscCheck?: (projectRoot: string) => boolean | Promise<boolean>;
  runVitestScopeCheck?: (
    projectRoot: string,
    scopeDirs: string[],
  ) => { passRatio: number; passed: boolean } | Promise<{ passRatio: number; passed: boolean }>;
}

// ─── Core ────────────────────────────────────────────────────────────────────

const VITEST_MIN_PASS_RATIO = 0.5;

/**
 * Attempt to partially promote a NO_GO result by extracting only in-scope work.
 *
 * GATE-1: noGoCategory ∈ {BOUNDARY_VIOLATION, UNKNOWN} AND evaluation.filesInScope is non-empty.
 * GATE-2: tsc --noEmit passes AND vitest pass ratio ≥ 50% for in-scope directories.
 *
 * When both gates pass, returns a synthetic TaskResult with filesChanged restricted
 * to in-scope files. Commit/revert wiring is not performed in this slice.
 */
export async function attemptPartialPromotion(
  root: string,
  task: Task,
  result: TaskResult,
  evaluation: EvaluationResult,
  options?: PartialPromotionOptions,
): Promise<PartialPromotionResult> {
  const inScopeFiles = evaluation.filesInScope ?? [];
  const droppedFiles = evaluation.filesOutOfScope ?? [];

  // ── GATE-1 ───────────────────────────────────────────────────────────────
  const category = evaluation.noGoCategory;
  const isEligibleCategory =
    category === 'BOUNDARY_VIOLATION' || category === 'UNKNOWN';

  if (!isEligibleCategory) {
    return {
      promoted: false,
      reason: `gate1_fail:category_ineligible(${category ?? 'undefined'})`,
      inScopeFiles,
      droppedFiles,
      promotedResult: null,
    };
  }

  if (inScopeFiles.length === 0) {
    return {
      promoted: false,
      reason: 'gate1_fail:no_in_scope_files',
      inScopeFiles,
      droppedFiles,
      promotedResult: null,
    };
  }

  // ── GATE-2 ───────────────────────────────────────────────────────────────
  const runTsc = options?.runTscCheck ?? defaultRunTscCheck;
  const runVitest = options?.runVitestScopeCheck ?? defaultRunVitestScopeCheck;

  const tscPassed = await runTsc(root);
  if (!tscPassed) {
    return {
      promoted: false,
      reason: 'gate2_fail:tsc_error',
      inScopeFiles,
      droppedFiles,
      promotedResult: null,
    };
  }

  const scopeDirs = task.scope?.directories ?? [];
  const vitestResult = await runVitest(root, scopeDirs);
  if (vitestResult.passRatio < VITEST_MIN_PASS_RATIO) {
    return {
      promoted: false,
      reason: `gate2_fail:vitest_pass_ratio(${vitestResult.passRatio.toFixed(2)}<${VITEST_MIN_PASS_RATIO})`,
      inScopeFiles,
      droppedFiles,
      promotedResult: null,
    };
  }

  // ── EXTRACT ──────────────────────────────────────────────────────────────
  const promotedResult: TaskResult = {
    ...result,
    filesChanged: inScopeFiles,
  };

  return {
    promoted: true,
    reason: 'partial_promotion:in_scope_work_validated',
    inScopeFiles,
    droppedFiles,
    promotedResult,
  };
}
