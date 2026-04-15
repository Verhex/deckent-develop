// ═══ Result Evaluator — Pure evaluation module ═══════════════════════
// Extracted from brain.ts (Sprint 036).
// Contains: evaluateResult, isDocTask, waitForResults, getRecentSprintStats
// tryCodeVerifiedDone migrated to auditor.ts (Sprint 138) — re-exported here.
// No side effects, no file writes — evaluation logic only.

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Task, TaskResult, EvaluationRubric, RubricScore, EvaluationResult } from '../core/types.js';
import { TaskEvaluation } from '../core/types.js';
import { BRAIN_DIR, SPRINTS_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import { validateWorkerCoverage } from './coverage-validator.js';

// ─── Source code directory detection ──────────────────────────────────

/** Source code directory prefixes — anything outside these is treated as a doc task */
const SOURCE_CODE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];

function isSourceCodeDir(dir: string): boolean {
  const normalized = dir === 'src' || dir === 'tests' || dir === 'lib';
  return normalized || SOURCE_CODE_PREFIXES.some(p => dir.startsWith(p));
}

// ─── Bash Unavailable Detection ─────────────────────────────────────

/** Bash unavailable signal patterns in worker notes */
const BASH_UNAVAILABLE_PATTERNS = [
  /bash.*unavailable/i,
  /session-env.*enoent/i,
  /enoent.*session-env/i,
  /bash\s+tool\s+(is\s+)?unavailable/i,
  /cannot\s+run\s+(tsc|vitest|npm)/i,
];

/**
 * Detects whether a worker was unable to run verification commands (tsc, vitest)
 * due to Bash tool being unavailable (e.g., session-env ENOENT).
 *
 * When Bash is unavailable, testsPassed=false and coverage=0 are expected
 * side effects of the environment constraint, not code quality issues.
 */
export function isBashUnavailable(result: TaskResult): boolean {
  const notes = result.notes ?? '';
  if (notes.length === 0) return false;
  return BASH_UNAVAILABLE_PATTERNS.some(pattern => pattern.test(notes));
}

// ─── isDocTask ────────────────────────────────────────────────────────

/**
 * Returns true if the task is doc-only (no source code directories).
 * Source code scopes: src/, tests/, lib/ — everything else is a doc task.
 */
export function isDocTask(task: Task): boolean {
  const dirs = task.scope?.directories ?? [];
  if (dirs.length === 0) return false;
  return dirs.every(d => !isSourceCodeDir(d));
}

// ─── evaluateResult ──────────────────────────────────────────────────

/**
 * Evaluates a worker's task result and returns DONE, GO_WITH_TECH_DEBT, or NO_GO.
 *
 * Brain makes the final call — worker selfAssessment is only a hint, not the decision.
 *
 * Evaluation order:
 * 1. selfAssessment NO_GO → NO_GO (hard failure always respected)
 * 2. tests failed → NO_GO (regardless of self-assessment)
 * 3. doc task → DONE (skip coverage)
 * 4. vitest JSON coverage mismatch → GO_WITH_TECH_DEBT
 * 5. tests pass + new test files written → DONE
 * 6. tests pass + no new tests + coverage < coverageThreshold → GO_WITH_TECH_DEBT
 * 7. coverage >= coverageThreshold → DONE
 * 8. worker hint GO_WITH_TECH_DEBT (fallback only) → GO_WITH_TECH_DEBT
 * 9. default → DONE
 *
 * @deprecated Use evaluateWithRubric() instead. This function uses a simpler grading
 * algorithm without rubric scoring. Sprint phases already use evaluateWithRubric()
 * for consistent EVALUATE and FIX phase evaluation. This function is retained only
 * for backward compatibility with CLI finalize command.
 */
export function evaluateResult(result: TaskResult, task: Task, vitestJsonOutput?: string, coverageThreshold = 90): TaskEvaluation {
  // Step 1: Hard failures — NO_GO regardless of self-assessment
  if (result.selfAssessment === 'NO_GO') return TaskEvaluation.NO_GO;

  // Step 1b: Bash unavailable tolerance — environment constraint, not code quality
  // When Bash tool is unavailable (session-env ENOENT), worker cannot run tsc/vitest,
  // so testsPassed=false and coverage=0 are expected. Accept as GO_WITH_TECH_DEBT
  // if the worker's self-assessment is not NO_GO and code changes were applied.
  if (!result.testsPassed && isBashUnavailable(result)) {
    return TaskEvaluation.GO_WITH_TECH_DEBT;
  }

  if (!result.testsPassed) return TaskEvaluation.NO_GO;

  // Step 2: Doc tasks — DONE if tests pass (skip coverage)
  if (isDocTask(task)) return TaskEvaluation.DONE;

  // Step 3: Brain makes the final call based on objective criteria
  // Worker self-assessment is just a HINT, not the final decision

  // Check: did worker write new test files?
  const hasNewTests = result.filesChanged?.some(f =>
    f.includes('.test.') || f.includes('.spec.')
  ) ?? false;

  // Step 3a: Validate task-specific goNogo criteria from DIRECTIVES
  // If goCriteria contains specific verification patterns, validate notes match
  if (task.goNogo?.goCriteria && task.goNogo.goCriteria.length > 30) {
    // Task has specific criteria — check that worker notes address them
    const notes = result.notes ?? '';
    const criteria = task.goNogo.goCriteria.toLowerCase();
    // If criteria mention specific verification but notes are empty → tech debt
    if (notes.length < 20 && criteria.includes('grep')) {
      return TaskEvaluation.GO_WITH_TECH_DEBT;
    }
  }

  // Check: vitest coverage validation (if JSON available)
  if (vitestJsonOutput !== undefined) {
    const coverageCheck = validateWorkerCoverage({
      reportedCoverage: result.coverage,
      vitestJsonOutput,
      taskScope: { directories: task.scope?.directories ?? [] },
    });
    if (coverageCheck && coverageCheck.level === 'WARNING') {
      return TaskEvaluation.GO_WITH_TECH_DEBT;
    }
  }

  // If tests pass AND worker wrote tests → DONE
  if (result.testsPassed && hasNewTests) {
    return TaskEvaluation.DONE;
  }

  // If tests pass but no new tests AND coverage < coverageThreshold → TECH_DEBT
  if (result.testsPassed && !hasNewTests && result.coverage < coverageThreshold) {
    return TaskEvaluation.GO_WITH_TECH_DEBT;
  }

  // Coverage >= coverageThreshold with passing tests → DONE
  if (result.coverage >= coverageThreshold) return TaskEvaluation.DONE;

  // Default: respect worker hint for edge cases only
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT') {
    return TaskEvaluation.GO_WITH_TECH_DEBT;
  }

  return TaskEvaluation.DONE;
}

// ─── waitForResults (dependency-injected version) ────────────────────

/** Options for spawning a queued task */
export interface SpawnTaskFn {
  (task: Task, opts: { autoApprove: boolean; projectDir: string }): void;
}

/** Options for killing a completed worker */
export interface KillWorkerFn {
  (taskId: string): void;
}

/** Reads a JSON file safely, returns null on error */
export interface ReadJsonFn {
  <T>(filePath: string): T | null | Promise<T | null>;
}

/** Checks if a file exists (sync or async) */
export interface FileExistsFn {
  (filePath: string): boolean | Promise<boolean>;
}

/** Watcher that resolves when a filesystem change occurs */
export interface ResultWatcher {
  waitForChange(): Promise<void>;
  close(): void;
}

/** Factory for creating result watchers */
export interface CreateResultWatcherFn {
  (projectRoot: string, fallbackMs: number): ResultWatcher;
}

/** Sprint-like structure — only what waitForResults needs */
export interface WaitableSprint {
  tasks: Array<{ id: string }>;
}

/** Options for waitForResults */
export interface WaitForResultsOptions {
  timeoutMs?: number;
  queue?: Task[];
  autoApprove?: boolean;
  spawnTask?: SpawnTaskFn;
  killWorker?: KillWorkerFn;
  readJson?: ReadJsonFn;
  fileExists?: FileExistsFn;
  createWatcher?: CreateResultWatcherFn;
  tasksDir?: string;
  buildPrompt?: (task: Task) => string;
}

/**
 * Waits for task result files to appear on disk.
 * Supports queued task execution: as workers finish, queued tasks are spawned.
 *
 * This is a dependency-injected version that accepts all IO functions as parameters,
 * making it testable without mocking filesystem or spawning processes.
 * @internal Used only within orchestra/ — external callers use waitForResults from brain.js.
 */
export async function waitForResults(
  projectRoot: string,
  sprint: WaitableSprint,
  options: WaitForResultsOptions = {},
): Promise<TaskResult[]> {
  const {
    timeoutMs = 30 * 60 * 1000,
    queue = [],
    readJson = defaultReadJson,
    fileExists = defaultFileExists,
    createWatcher = defaultCreateWatcher,
    tasksDir = '.tasks',
    killWorker: killWorkerFn,
    spawnTask: spawnTaskFn,
    autoApprove = false,
  } = options;

  const WATCH_FALLBACK_MS = 5_000;
  const startTime = Date.now();
  const results: TaskResult[] = [];
  const taskIds = new Set(sprint.tasks.map(t => t.id));
  const collected = new Set<string>();
  const remainingQueue: Task[] = [...queue];

  const collectResults = async (): Promise<string[]> => {
    const newlyCollected: string[] = [];
    for (const taskId of taskIds) {
      if (collected.has(taskId)) continue;
      const resultPath = `${projectRoot}/${tasksDir}/task-${taskId}.result`;
      if (await fileExists(resultPath)) {
        const result = await readJson<TaskResult>(resultPath);
        if (result) {
          results.push(result);
          collected.add(taskId);
          newlyCollected.push(taskId);
        }
      }
    }
    return newlyCollected;
  };

  const processQueue = (completedTaskIds: string[]): void => {
    for (const taskId of completedTaskIds) {
      if (remainingQueue.length === 0) break;
      // Kill completed worker (clean up slot)
      try {
        if (killWorkerFn) killWorkerFn(taskId);
      } catch (e) { debugLog('processQueue:killWorker', e); }
      const nextTask = remainingQueue.shift(); // length > 0 checked above
      if (!nextTask) break;
      try {
        if (spawnTaskFn) {
          spawnTaskFn(nextTask, { autoApprove, projectDir: projectRoot });
        }
      } catch (e) { debugLog('processQueue:spawnTask', e); }
    }
  };

  const initiallyCollected = await collectResults();
  processQueue(initiallyCollected);
  if (collected.size === taskIds.size) return results;

  // Use fs.watch with fallback polling
  const watcher = createWatcher(projectRoot, WATCH_FALLBACK_MS);
  try {
    while (Date.now() - startTime < timeoutMs) {
      await watcher.waitForChange();
      const newlyCollected = await collectResults();
      processQueue(newlyCollected);
      if (collected.size === taskIds.size) break;
    }
  } finally {
    watcher.close();
  }
  return results;
}

// ─── Default implementations (used when no injection provided) ───────

async function defaultReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (e) {
    debugLog('defaultReadJson:readFile', e);
    return null;
  }
}

async function defaultFileExists(filePath: string): Promise<boolean> {
  return stat(filePath).then(() => true, () => false);
}

function defaultCreateWatcher(_projectRoot: string, fallbackMs: number): ResultWatcher {
  // Simple polling fallback — the real implementation uses fs.watch
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    waitForChange(): Promise<void> {
      return new Promise(resolve => {
        timer = setTimeout(resolve, fallbackMs);
      });
    },
    close(): void {
      if (timer) clearTimeout(timer);
    },
  };
}

// ─── Recent Sprint Stats (for adaptive thresholds) ──────────────────

/** Aggregated stats from recent sprints for adaptive threshold decisions */
export interface RecentSprintStats {
  avgNoGoRate: number;
  avgCoverage: number;
  sprintCount: number;
}

/**
 * Reads the last N sprint log files from .brain/sprints/ and computes
 * average NO_GO rate and average coverage.
 * Used by applyAdaptiveThresholds to decide whether to adjust config values.
 */
export async function getRecentSprintStats(projectRoot: string, lookback: number): Promise<RecentSprintStats> {
  const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  const sprintsExists = await stat(sprintsPath).then(() => true, () => false);
  if (!sprintsExists) {
    return { avgNoGoRate: 0, avgCoverage: 0, sprintCount: 0 };
  }

  const allFiles = await readdir(sprintsPath);
  const files = allFiles
    .filter(f => f.endsWith('.md'))
    .sort()
    .slice(-lookback);

  if (files.length === 0) {
    return { avgNoGoRate: 0, avgCoverage: 0, sprintCount: 0 };
  }

  let totalNoGoRate = 0;
  let totalCoverage = 0;
  let validCount = 0;

  for (const file of files) {
    try {
      const content = await readFile(join(sprintsPath, file), 'utf-8');
      const parsed = parseSprintStats(content);
      if (parsed) {
        totalNoGoRate += parsed.noGoRate;
        totalCoverage += parsed.coverage;
        validCount++;
      }
    } catch (e) {
      debugLog('getRecentSprintStats:readFile', e);
    }
  }

  if (validCount === 0) {
    return { avgNoGoRate: 0, avgCoverage: 0, sprintCount: 0 };
  }

  return {
    avgNoGoRate: totalNoGoRate / validCount,
    avgCoverage: totalCoverage / validCount,
    sprintCount: validCount,
  };
}

// ─── Token Usage Aggregation ─────────────────────────────────────────

/**
 * Aggregates token usage data from an array of task results.
 * Returns totals for input, output, and cache read tokens.
 * Skips results that have no tokenUsage data.
 */
export function aggregateTokenUsage(results: TaskResult[]): {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  tasksWithTokenData: number;
} {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let tasksWithTokenData = 0;

  for (const result of results) {
    if (!result.tokenUsage) continue;
    tasksWithTokenData++;
    totalInputTokens += result.tokenUsage.inputTokens;
    totalOutputTokens += result.tokenUsage.outputTokens;
    totalCacheReadTokens += result.tokenUsage.cacheReadTokens ?? 0;
  }

  return { totalInputTokens, totalOutputTokens, totalCacheReadTokens, tasksWithTokenData };
}

// ─── Rubric-Based Evaluation ────────────────────────────────────────

/** Default rubric used when no custom rubric is provided */
export const DEFAULT_RUBRIC: EvaluationRubric = {
  criteria: [
    { name: 'correctness', weight: 0.4, threshold: 60, evaluator: 'auto' },
    { name: 'test_coverage', weight: 0.25, threshold: 50, evaluator: 'metric' },
    { name: 'scope_compliance', weight: 0.2, threshold: 80, evaluator: 'auto' },
    { name: 'documentation', weight: 0.15, threshold: 30, evaluator: 'pattern' },
  ],
  passingScore: 70,
  maxRetries: 0,
};

/** Score correctness based on testsPassed and selfAssessment */
export function scoreCorrectness(result: TaskResult): RubricScore {
  let score = 0;
  const reasons: string[] = [];

  if (result.testsPassed) {
    score += 60;
    reasons.push('tests passed');
  } else {
    reasons.push('tests failed');
  }

  if (result.selfAssessment === 'DONE') {
    score += 40;
    reasons.push('self-assessment DONE');
  } else if (result.selfAssessment === 'GO_WITH_TECH_DEBT') {
    score += 20;
    reasons.push('self-assessment GO_WITH_TECH_DEBT');
  } else {
    reasons.push('self-assessment NO_GO');
  }

  return { criterion: 'correctness', score, passed: score >= 60, reason: reasons.join('; ') };
}

/** Score test coverage based on coverage metric and presence of new test files */
export function scoreTestCoverage(result: TaskResult): RubricScore {
  const hasNewTests = result.filesChanged?.some(f =>
    f.includes('.test.') || f.includes('.spec.')
  ) ?? false;

  // Bash unavailable with zero coverage → neutral score (not penalized)
  if (isBashUnavailable(result) && result.coverage === 0) {
    return {
      criterion: 'test_coverage',
      score: 50,
      passed: true,
      reason: 'coverage 0% (Bash unavailable — neutral score)',
    };
  }

  let score = Math.min(result.coverage, 100);
  if (hasNewTests) score = Math.min(score + 15, 100);

  const reasons: string[] = [`coverage ${result.coverage}%`];
  if (hasNewTests) reasons.push('new test files written');

  return { criterion: 'test_coverage', score, passed: score >= 50, reason: reasons.join('; ') };
}

/** Score scope compliance by checking filesChanged against task scope */
export function scoreScopeCompliance(result: TaskResult, task: Task): RubricScore {
  const dirs = task.scope?.directories ?? [];
  const writeFiles = task.scope?.filesWrite ?? [];
  const changed = result.filesChanged ?? [];

  if (changed.length === 0) {
    return { criterion: 'scope_compliance', score: 100, passed: true, reason: 'no files changed' };
  }

  let inScope = 0;
  for (const file of changed) {
    const inDir = dirs.some(d => file.startsWith(d));
    const inWrite = writeFiles.some(w => file === w);
    if (inDir || inWrite) inScope++;
  }

  const score = Math.round((inScope / changed.length) * 100);
  return {
    criterion: 'scope_compliance',
    score,
    passed: score >= 80,
    reason: `${inScope}/${changed.length} files within scope`,
  };
}

/** Score documentation quality based on notes length and presence */
export function scoreDocumentation(result: TaskResult): RubricScore {
  const notes = result.notes ?? '';
  let score = 0;
  const reasons: string[] = [];

  if (notes.length >= 100) {
    score = 100;
    reasons.push('detailed notes');
  } else if (notes.length >= 50) {
    score = 70;
    reasons.push('moderate notes');
  } else if (notes.length >= 20) {
    score = 40;
    reasons.push('brief notes');
  } else {
    score = 10;
    reasons.push('minimal or no notes');
  }

  return { criterion: 'documentation', score, passed: score >= 30, reason: reasons.join('; ') };
}

/** Dispatch scoring for a named criterion */
function scoreCriterion(name: string, result: TaskResult, task: Task): RubricScore {
  switch (name) {
    case 'correctness': return scoreCorrectness(result);
    case 'test_coverage': return scoreTestCoverage(result);
    case 'scope_compliance': return scoreScopeCompliance(result, task);
    case 'documentation': return scoreDocumentation(result);
    default:
      return { criterion: name, score: 0, passed: false, reason: `unknown criterion: ${name}` };
  }
}

/**
 * Evaluate a task result using rubric-based grading.
 * Accepts an optional partial rubric that is merged with DEFAULT_RUBRIC.
 *
 * Scoring thresholds:
 * - totalScore >= passingScore → DONE
 * - totalScore >= passingScore * 0.7 → GO_WITH_TECH_DEBT
 * - totalScore < passingScore * 0.7 → NO_GO
 */
export function evaluateWithRubric(
  result: TaskResult,
  task: Task,
  rubric?: Partial<EvaluationRubric>,
): EvaluationResult {
  const merged: EvaluationRubric = {
    criteria: rubric?.criteria ?? DEFAULT_RUBRIC.criteria,
    passingScore: rubric?.passingScore ?? DEFAULT_RUBRIC.passingScore,
    maxRetries: Math.min(rubric?.maxRetries ?? DEFAULT_RUBRIC.maxRetries, 3),
  };

  const rubricScores: RubricScore[] = [];
  let totalScore = 0;

  for (const criterion of merged.criteria) {
    const scored = scoreCriterion(criterion.name, result, task);
    // Override passed based on per-criterion threshold
    scored.passed = scored.score >= criterion.threshold;
    rubricScores.push(scored);
    totalScore += scored.score * criterion.weight;
  }

  totalScore = Math.round(totalScore * 100) / 100;

  let decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  if (totalScore >= merged.passingScore) {
    decision = 'DONE';
  } else if (totalScore >= merged.passingScore * 0.7) {
    decision = 'GO_WITH_TECH_DEBT';
  } else {
    decision = 'NO_GO';
  }

  return {
    decision,
    totalScore,
    rubricScores,
    retryCount: merged.maxRetries,
  };
}

// ─── TECH_DEBT Downgrade Layer (Honest Assessment Calibration v2) ────

/**
 * Completion thresholds for verify-delta-based downgrade.
 * Mirrors VERIFY_DELTA_DONE_THRESHOLD and VERIFY_DELTA_NO_GO_THRESHOLD in worker.ts.
 */
export const TECH_DEBT_DOWNGRADE_DONE_THRESHOLD = 0.8;
export const TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD = 0.5;

/**
 * Result of the tech-debt downgrade check.
 * Applied as a second evaluation layer on top of rubric scoring.
 */
export interface TechDebtDowngradeResult {
  /** Final decision after applying downgrade logic */
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  /** Whether the original rubric decision was downgraded */
  downgraded: boolean;
  /** Reason for the downgrade, or null if no downgrade occurred */
  reason: string | null;
  /** Completion ratio from verify-delta (0–1), or null if delta unavailable */
  completionRatio: number | null;
}

/**
 * Apply tech-debt downgrade logic on top of an existing evaluation decision.
 *
 * This is the second evaluation layer (Auditor = Layer 1, Brain = Layer 2).
 * If a worker's verify-delta file exists and shows completion < 80%, the
 * decision is downgraded from DONE → GO_WITH_TECH_DEBT, or from DONE/TECH_DEBT
 * → NO_GO if completion < 50%.
 *
 * When no verify-delta file is available, the original decision is preserved.
 *
 * Sprint 137 canlı kanıt: worker claimed DONE but only 39% functional.
 * This layer catches that case at Brain evaluation time.
 *
 * @param originalDecision - The rubric-based evaluation decision
 * @param result - Task result (selfAssessment, filesChanged, notes)
 * @param verifyDeltaPath - Optional path to the .verify-delta.json file
 */
export function applyTechDebtDowngrade(
  originalDecision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
  _result: { selfAssessment: string; filesChanged?: string[]; notes?: string },
  verifyDeltaCompletionRatio?: number,
): TechDebtDowngradeResult {
  // NO_GO is always respected — no downgrade logic needed
  if (originalDecision === 'NO_GO') {
    return { decision: 'NO_GO', downgraded: false, reason: null, completionRatio: verifyDeltaCompletionRatio ?? null };
  }

  // If no verify-delta available, preserve original decision
  if (verifyDeltaCompletionRatio == null) {
    return { decision: originalDecision, downgraded: false, reason: null, completionRatio: null };
  }

  const ratio = verifyDeltaCompletionRatio;

  // Worker claimed DONE but completion < DONE threshold → downgrade to TECH_DEBT
  if (originalDecision === 'DONE' && ratio < TECH_DEBT_DOWNGRADE_DONE_THRESHOLD) {
    if (ratio < TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD) {
      return {
        decision: 'NO_GO',
        downgraded: true,
        reason: `verify-delta: completion ${Math.round(ratio * 100)}% < ${TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD * 100}% minimum — auto NO_GO`,
        completionRatio: ratio,
      };
    }
    return {
      decision: 'GO_WITH_TECH_DEBT',
      downgraded: true,
      reason: `verify-delta: completion ${Math.round(ratio * 100)}% < ${TECH_DEBT_DOWNGRADE_DONE_THRESHOLD * 100}% DONE threshold — downgraded`,
      completionRatio: ratio,
    };
  }

  // GO_WITH_TECH_DEBT + completion < NO_GO threshold → downgrade to NO_GO
  if (originalDecision === 'GO_WITH_TECH_DEBT' && ratio < TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD) {
    return {
      decision: 'NO_GO',
      downgraded: true,
      reason: `verify-delta: completion ${Math.round(ratio * 100)}% < ${TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD * 100}% minimum — escalated to NO_GO`,
      completionRatio: ratio,
    };
  }

  // No downgrade needed
  return { decision: originalDecision, downgraded: false, reason: null, completionRatio: ratio };
}

// ─── Token Usage Validation ─────────────────────────────────────────

/**
 * Result of validating tokenUsage on a TaskResult.
 * Sprint 139: soft warning mode — warnings are emitted but do not affect evaluation.
 * Sprint 140: warnings will become hard NO_GO.
 */
export interface TokenUsageValidationResult {
  /** Whether all required token usage fields are present and valid */
  isComplete: boolean;
  /** Human-readable warning messages for missing/invalid fields */
  warnings: string[];
  /** Whether tokenUsage was entirely absent */
  tokenUsageMissing: boolean;
}

/**
 * Validate that a TaskResult's tokenUsage contains all required fields.
 *
 * Required fields (Sprint 139 soft warning, Sprint 140 hard NO_GO):
 * - tokenUsage itself must be present
 * - inputTokens: number >= 0
 * - outputTokens: number >= 0
 * - provider: non-empty string
 * - model: non-empty string
 *
 * @param result - The task result to validate
 * @returns Validation result with warnings (soft — does not affect evaluation)
 */
export function validateTokenUsage(result: TaskResult): TokenUsageValidationResult {
  const warnings: string[] = [];

  if (!result.tokenUsage) {
    return {
      isComplete: false,
      warnings: ['tokenUsage field is missing — Sprint 140 will reject as NO_GO'],
      tokenUsageMissing: true,
    };
  }

  const { tokenUsage } = result;

  if (typeof tokenUsage.inputTokens !== 'number' || tokenUsage.inputTokens < 0) {
    warnings.push('tokenUsage.inputTokens is missing or invalid (must be a non-negative number)');
  }

  if (typeof tokenUsage.outputTokens !== 'number' || tokenUsage.outputTokens < 0) {
    warnings.push('tokenUsage.outputTokens is missing or invalid (must be a non-negative number)');
  }

  if (!tokenUsage.provider || typeof tokenUsage.provider !== 'string') {
    warnings.push('tokenUsage.provider is missing (must be "claude", "codex", or "gemini")');
  }

  if (!tokenUsage.model || typeof tokenUsage.model !== 'string') {
    warnings.push('tokenUsage.model is missing (must be a valid model identifier)');
  }

  return {
    isComplete: warnings.length === 0,
    warnings,
    tokenUsageMissing: false,
  };
}

// ─── Honesty Violation Flag ─────────────────────────────────────────

/**
 * Honesty violation flag constant.
 * Used by sprint-reporter to annotate tasks where the worker claimed
 * "pre-existing failures" but the baseline comparison proved otherwise.
 */
export const HONESTY_VIOLATION = 'HONESTY_VIOLATION' as const;

// ─── Failure Classifier (Runtime vs Code Discriminator) ─────────────
// Sprint 138 Task 1-xfix: Brain "Task 5 NO_GO → Task 1 dependency failure"
// was a false diagnosis. The actual cause was a Docker HB shutdown bug (runtime
// issue). Discriminating runtime failures from code failures prevents cascade
// blocking on transient infrastructure problems.

/** Classification of a task failure: infrastructure or code quality */
export type FailureCategory = 'RUNTIME' | 'CODE' | 'AMBIGUOUS';

/** Input to classifyFailure — subset of task + result + optional raw errors */
export interface FailureContext {
  /** Worker exit code, if available (e.g. 137 = SIGKILL) */
  exitCode?: number;
  /** Worker's self-assessment notes or any other error message text */
  notes?: string;
  /** Raw error output captured from the worker process */
  errorOutput?: string;
  /** Task result selfAssessment (if worker wrote a result file) */
  selfAssessment?: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  /** Whether the worker produced a result file at all */
  resultFilePresent?: boolean;
}

/** Result of classifyFailure() */
export interface FailureClassification {
  /** Primary failure category */
  category: FailureCategory;
  /** Signals that contributed to this classification */
  signals: string[];
  /** Human-readable reason string */
  reason: string;
}

/**
 * RUNTIME failure signal patterns.
 *
 * These patterns indicate infrastructure problems (Docker/container lifecycle,
 * OOM kill, network/timeout, process supervisor issues) rather than code quality.
 * A task that fails for runtime reasons should be RETRIED without cascading
 * a NO_GO block to its dependents.
 */
const RUNTIME_PATTERNS: readonly RegExp[] = [
  /docker\s+worker\s+exited\s+without\s+writing\s+result/i,
  /container\s+lifecycle/i,
  /no\s+such\s+container/i,
  /oomkilled/i,
  /container\s+(exited|died|stopped)/i,
  /heartbeat\s+(daemon\s+)?shutdown/i,
  /hb\s+shutdown/i,
  /worker\s+process\s+killed/i,
  /sigkill/i,
  /network\s+(timeout|error|unreachable)/i,
  /connection\s+refused/i,
  /econnrefused/i,
  /spawn\s+enoent/i,
  /backend\s+(error|failure)/i,
  /tmux\s+(session|window)\s+not\s+found/i,
  /subprocess\s+exited\s+unexpectedly/i,
];

/**
 * CODE failure signal patterns.
 *
 * These patterns indicate genuine code quality problems. A task failing
 * for code reasons should cascade-block its dependents (Task 30) and
 * trigger spawnFixWorker.
 */
const CODE_PATTERNS: readonly RegExp[] = [
  /tsc\s+(error|--noEmit|type\s+error)/i,
  /typescript\s+(error|compilation\s+failed)/i,
  /type\s+error/i,
  /test\s+(fail|failure|failed)/i,
  /vitest.*fail/i,
  /jest.*fail/i,
  /\d+\s+test(s)?\s+fail/i,
  /scope\s+violation/i,
  /files?\s+outside\s+(scope|allowed|scope\.directories)/i,
  /assertion\s+(error|fail)/i,
  /syntax\s+error/i,
  /import\s+(error|resolution\s+fail)/i,
  /module\s+not\s+found/i,
  /cannot\s+find\s+module/i,
  /build\s+(fail|error)/i,
  /lint\s+(error|fail)/i,
];

/**
 * Classify a task failure as RUNTIME, CODE, or AMBIGUOUS.
 *
 * Decision logic:
 * - exitCode 137 → RUNTIME (SIGKILL — kernel OOM or Docker stop)
 * - no result file + any runtime pattern → RUNTIME
 * - code patterns detected → CODE
 * - runtime patterns detected but no code patterns → RUNTIME
 * - mixed signals or no signals → AMBIGUOUS
 *
 * @param ctx - Failure context (exit code, notes, error output, result presence)
 * @returns FailureClassification with category, contributing signals, and reason
 */
export function classifyFailure(ctx: FailureContext): FailureClassification {
  const signals: string[] = [];
  const runtimeSignals: string[] = [];
  const codeSignals: string[] = [];

  // ── Hard rule: exitCode 137 = SIGKILL (OOM kill or Docker stop) ─────
  if (ctx.exitCode === 137) {
    runtimeSignals.push('exitCode=137 (SIGKILL)');
  }

  // ── Hard rule: missing result file is usually a runtime issue ────────
  if (ctx.resultFilePresent === false) {
    runtimeSignals.push('no result file written');
  }

  // ── Scan text fields for signal patterns ─────────────────────────────
  const textToScan = [ctx.notes ?? '', ctx.errorOutput ?? ''].join(' ');

  for (const pattern of RUNTIME_PATTERNS) {
    if (pattern.test(textToScan)) {
      runtimeSignals.push(`runtime pattern: ${pattern.source}`);
    }
  }

  for (const pattern of CODE_PATTERNS) {
    if (pattern.test(textToScan)) {
      codeSignals.push(`code pattern: ${pattern.source}`);
    }
  }

  signals.push(...runtimeSignals, ...codeSignals);

  // ── Classification decision ──────────────────────────────────────────
  const hasRuntime = runtimeSignals.length > 0;
  const hasCode = codeSignals.length > 0;

  if (hasRuntime && !hasCode) {
    return {
      category: 'RUNTIME',
      signals,
      reason: `Infrastructure failure detected (${runtimeSignals.length} runtime signal(s)). Retry without cascade.`,
    };
  }

  if (hasCode && !hasRuntime) {
    return {
      category: 'CODE',
      signals,
      reason: `Code quality failure detected (${codeSignals.length} code signal(s)). Cascade-block dependents and spawn fix worker.`,
    };
  }

  if (hasCode && hasRuntime) {
    return {
      category: 'AMBIGUOUS',
      signals,
      reason: `Mixed signals (${runtimeSignals.length} runtime, ${codeSignals.length} code). Retry without cascade (risk-taking).`,
    };
  }

  // No signals detected at all
  return {
    category: 'AMBIGUOUS',
    signals,
    reason: 'No identifiable failure signals. Retry without cascade (risk-taking).',
  };
}

/**
 * Determine the cascade action for a failed task based on its failure category.
 *
 * Decision table (Alperen Q1 risk-taking):
 * - RUNTIME  → retry=true,  cascade=false  (transient infra — retry without blocking dependents)
 * - CODE     → retry=false, cascade=true   (real code bug — block dependents + spawn fix worker)
 * - AMBIGUOUS → retry=true, cascade=false  (risk-taking: assume infra until proven otherwise)
 */
export interface CascadeDecision {
  /** Whether the task should be retried */
  shouldRetry: boolean;
  /** Whether dependent tasks should be cascade-blocked */
  shouldCascade: boolean;
  /** Whether a fix worker should be spawned (only for CODE failures) */
  spawnFixWorker: boolean;
  /** Failure category that drove this decision */
  category: FailureCategory;
  /** Human-readable explanation */
  reason: string;
}

/**
 * Determine retry and cascade behaviour for a failed task.
 *
 * This is the cross-dependency discriminator entry point.
 * Upstream callers (sprint-spawner, result-collector) call this after
 * evaluateWithRubric() returns NO_GO, then use the returned CascadeDecision
 * to decide whether to block dependents.
 *
 * @param taskId - ID of the failed task
 * @param ctx - Failure context used to classify the failure
 * @returns CascadeDecision specifying retry, cascade and fix-worker behaviour
 */
export function decideCascadeAction(taskId: string, ctx: FailureContext): CascadeDecision {
  const classification = classifyFailure(ctx);

  switch (classification.category) {
    case 'RUNTIME':
      return {
        shouldRetry: true,
        shouldCascade: false,
        spawnFixWorker: false,
        category: 'RUNTIME',
        reason: `Task ${taskId} failed due to runtime/infrastructure issue — retry without cascading block to dependents.`,
      };

    case 'CODE':
      return {
        shouldRetry: false,
        shouldCascade: true,
        spawnFixWorker: true,
        category: 'CODE',
        reason: `Task ${taskId} failed due to code quality issue — cascade-block dependents and spawn fix worker.`,
      };

    case 'AMBIGUOUS':
    default:
      return {
        shouldRetry: true,
        shouldCascade: false,
        spawnFixWorker: false,
        category: 'AMBIGUOUS',
        reason: `Task ${taskId} has ambiguous failure — retry without cascade (risk-taking per Alperen Q1 guidance).`,
      };
  }
}

/**
 * Gate failure status constant.
 * Used when brain self-audit gate (tsc/vitest/honesty/observability) fails.
 * Sprint status becomes GO_WITH_GATE_FAILURE instead of plain DONE.
 * Propagated to retro for visibility.
 */
export const GO_WITH_GATE_FAILURE = 'GO_WITH_GATE_FAILURE' as const;

/**
 * Honesty violation flag for missing verify-ran marker.
 * Flagged when a worker's notes contain phrases like "pre-existing" or "unrelated"
 * (claiming failures are not their fault) but the `.verify-ran` marker file is absent,
 * meaning the worker never actually ran the verify loop to confirm.
 */
export const HONESTY_VIOLATION_NO_VERIFY_MARKER = 'HONESTY_VIOLATION_NO_VERIFY_MARKER' as const;

/** Patterns in notes that indicate a worker is claiming failures are not their fault */
const VERIFY_MARKER_HONESTY_PATTERNS = [
  /pre-existing/i,
  /unrelated/i,
];

/**
 * Check whether a task result should be flagged for HONESTY_VIOLATION_NO_VERIFY_MARKER.
 *
 * Returns the flag string if the result's notes match honesty-trigger patterns
 * (claims about "pre-existing" or "unrelated" failures) AND the `.verify-ran` marker
 * file does not exist for this task. Returns null otherwise.
 *
 * @param projectRoot - Project root directory
 * @param taskId - Task ID to check for verify-ran marker
 * @param notes - Worker's result notes string
 * @returns HONESTY_VIOLATION_NO_VERIFY_MARKER flag or null
 */
export async function checkVerifyMarkerHonesty(
  projectRoot: string,
  taskId: string,
  notes: string,
): Promise<typeof HONESTY_VIOLATION_NO_VERIFY_MARKER | null> {
  if (!notes || notes.length === 0) return null;

  const hasHonestyPhrase = VERIFY_MARKER_HONESTY_PATTERNS.some(p => p.test(notes));
  if (!hasHonestyPhrase) return null;

  // Check if verify-ran marker exists (async — Sprint 136 async I/O migration)
  const markerPath = join(projectRoot, '.tasks', `task-${taskId}.verify-ran`);
  const markerExists = await stat(markerPath).then(() => true, () => false);
  if (markerExists) return null;

  return HONESTY_VIOLATION_NO_VERIFY_MARKER;
}

/**
 * Checks if a task result's notes contain honesty-trigger patterns
 * (claims about pre-existing or unrelated failures).
 * Re-exported from baseline-tracker for convenience.
 */
export { containsHonestyTrigger, checkWorkerHonesty } from './baseline-tracker.js';
export type { HonestyCheckResult, TestBaseline, BaselineComparison } from './baseline-tracker.js';

// ─── Code-Verified DONE Reconciliation — Re-exports from auditor.ts (Sprint 138 migration) ──
// Canonical implementation moved to ../monitor/auditor.ts (Sprint 138 Task 3).
// Re-exported here for backward compatibility.
export {
  CODE_VERIFIED_DONE,
  tryCodeVerifiedDone,
  writeCodeVerifiedResult,
  parseEvidenceCommand,
} from '../monitor/auditor.js';

export type {
  CodeVerifyOptions,
  CodeVerifyResult,
} from '../monitor/auditor.js';

/** Parse NO_GO rate and coverage from a sprint log markdown table */
function parseSprintStats(content: string): { noGoRate: number; coverage: number } | null {
  const lines = content.split('\n');
  const metricsMap = new Map<string, string>();

  for (const line of lines) {
    if (!line.startsWith('|') || line.startsWith('|---') || line.startsWith('| Metric')) continue;
    const cols = line.split('|').map(c => c.trim()).filter(c => c);
    if (cols.length >= 2 && cols[0] !== undefined && cols[1] !== undefined) {
      metricsMap.set(cols[0], cols[1]);
    }
  }

  if (metricsMap.size === 0) return null;

  const totalTasks = parseInt(metricsMap.get('Total Tasks') ?? '0', 10);
  const noGoTasks = parseInt(metricsMap.get('No-Go') ?? '0', 10);
  const coverageStr = metricsMap.get('Coverage') ?? '0';
  const coverage = parseFloat(coverageStr.replace('%', ''));

  if (isNaN(totalTasks) || totalTasks === 0) return null;

  return {
    noGoRate: noGoTasks / totalTasks,
    coverage: isNaN(coverage) ? 0 : coverage,
  };
}
