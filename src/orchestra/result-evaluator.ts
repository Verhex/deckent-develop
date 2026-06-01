// ═══ Result Evaluator — Pure evaluation module ═══════════════════════
// Extracted from brain.ts (Sprint 036).
// Contains: evaluateResult, isDocTask, waitForResults, getRecentSprintStats
// tryCodeVerifiedDone migrated to auditor.ts (Sprint 138) — re-exported here.
// No side effects, no file writes — evaluation logic only.

import { readFile, readdir, stat } from 'node:fs/promises';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Task, TaskResult, EvaluationRubric, RubricScore, EvaluationResult } from '../core/types.js';
import { TaskEvaluation } from '../core/types.js';
import { BRAIN_DIR, SPRINTS_DIR, TASKS_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import { validateWorkerCoverage } from './coverage-validator.js';
import { reconcileSpuriousNoGo, reconcileRubricNoGo } from './mid-sprint-adapter.js';
import { getRubric, coverageOptional } from './rubric-registry.js';
import {
  detectDishonestResult,
  emitDishonestResultEvent,
  type DishonestyReason,
  type GitNumstatProvider,
  type DishonestEventSink,
} from './honest-gate.js';

// Re-export the dishonest-detector surface so downstream callers can
// reach it through the single result-evaluator entry point (Sprint 194
// Task 194-002 — W-INTEGRITY I-8).
export {
  detectDishonestResult,
  emitDishonestResultEvent,
  parseNotesClaims,
  createDefaultGitNumstatProvider,
  makeStaticGitNumstatProvider,
  DISHONEST_RESULT_DETECTED_CHANNEL,
} from './honest-gate.js';
export type {
  DishonestyReason,
  DishonestyFinding,
  GitNumstatProvider,
  DetectDishonestOptions,
  NotesClaims,
  FileNumstat,
  DishonestEventSink,
} from './honest-gate.js';

// Sprint 216-002 (reconstructed Sprint 218): re-export the Proof-of-Function
// gate so callers reach it through the evaluator surface.
export { verifyProofOfFunction, PROOF_OF_FUNCTION_MISMATCH_CHANNEL } from './proof-of-function.js';

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
export function evaluateResult(result: TaskResult, task: Task, vitestJsonOutput?: string, coverageThreshold = 90, projectRoot?: string): TaskEvaluation {
  // Step 1a: Sprint 145 — TIMEOUT_WITH_WORK: worker was killed but has partial work
  // Attempt reconciliation via Spurious NO_GO helper if projectRoot available
  if ((result.selfAssessment as string) === 'TIMEOUT_WITH_WORK') {
    if (projectRoot) {
      const reconciled = reconcileSpuriousNoGo(result, task, projectRoot);
      if (reconciled.decision === 'GO_WITH_TECH_DEBT') {
        debugLog('evaluateResult:reconcile', `Task ${task.id}: TIMEOUT_WITH_WORK reconciled → GO_WITH_TECH_DEBT`);
        return TaskEvaluation.GO_WITH_TECH_DEBT;
      }
    }
    // Fallback: treat TIMEOUT_WITH_WORK as GO_WITH_TECH_DEBT even without reconciliation
    return TaskEvaluation.GO_WITH_TECH_DEBT;
  }

  // Step 1: Hard failures — NO_GO regardless of self-assessment
  // Sprint 145: Before giving up, check if git diff shows substantial work
  if (result.selfAssessment === 'NO_GO') {
    if (projectRoot) {
      const reconciled = reconcileSpuriousNoGo(result, task, projectRoot);
      if (reconciled.reconciled && reconciled.decision === 'GO_WITH_TECH_DEBT') {
        debugLog('evaluateResult:reconcile', `Task ${task.id}: Spurious NO_GO reconciled → GO_WITH_TECH_DEBT (${reconciled.linesChanged} lines changed)`);
        return TaskEvaluation.GO_WITH_TECH_DEBT;
      }
    }
    return TaskEvaluation.NO_GO;
  }

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

// ─── Aggregate Verdict (Sprint 179 W0-1 — Bug A foundation) ──────────
// Sprint 178 forensik: ana NO_GO + fix DONE → downstream depStatuses
// 22 dakika boyunca "EXECUTING" gözüktü çünkü downstream filtreleri yalnızca
// orijinal kaydı görüyordu. `getAggregateVerdict` original + tüm fix
// kayıtlarının verdict ranklarını max'lar; fix DONE üreterek dependency
// graph'ı serbest bırakır. Honest-gate: kayıtlar mutable Map — Brain
// re-evaluate UPDATE yazınca aggregate yeni değeri yansıtır.

/** Bug A aggregate domain — kept here to avoid leaking TaskStatus into result-collector pure fn. */
export type Verdict = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';

/** Rank ordering for aggregate max: NO_GO < GO_WITH_TECH_DEBT < DONE. */
export const VERDICT_RANK: Record<Verdict, number> = {
  NO_GO: 0,
  GO_WITH_TECH_DEBT: 1,
  DONE: 2,
};

/** Minimum shape needed to compute an aggregate verdict for a task. */
export interface TaskRecord {
  verdict: Verdict;
  isFix: boolean;
  originalTaskId?: string;
}

/**
 * Returns the highest verdict between a task's original record and any
 * fix-retry records that reference it via `originalTaskId`.
 *
 * Used by `planDispatch` (dep-pipeline mode) so downstream tasks unblock
 * once a fix DONE supersedes the original NO_GO. The original record is
 * never mutated — only read — so Brain honest-gate re-evaluation flows
 * are preserved (Bug C/E remain intact).
 */
export function getAggregateVerdict(
  taskId: string,
  records: ReadonlyMap<string, TaskRecord>,
): Verdict {
  const original = records.get(taskId);
  if (!original) return 'NO_GO';
  let best: Verdict = original.verdict;
  for (const rec of records.values()) {
    if (!rec.isFix) continue;
    if (rec.originalTaskId !== taskId) continue;
    if (VERDICT_RANK[rec.verdict] > VERDICT_RANK[best]) {
      best = rec.verdict;
    }
  }
  return best;
}

// ─── Worker Rollback Verdict Hook (Sprint 177 Task 1) ────────────────

/**
 * Applies the rollback verdict for a worker by inspecting the persisted
 * git-stash ref written at spawn (`setupTaskSnapshot` in `worker.ts`).
 *
 * - NO_GO          → revert the working tree, drop the stash, clear the sidecar.
 * - DONE / GWT     → drop the stash (keep changes), clear the sidecar.
 * - no stash ref   → no-op (worker was spawned before Sprint 177 wire, or
 *                    the project root is not a git working tree).
 *
 * Callers (sprint-controller after EVALUATE) invoke this once per task so the
 * working tree never carries silent partial state from failed workers, closing
 * the Sprint 176 dogfood gap.
 *
 * Imports are lazy to avoid the circular import that would arise if
 * `src/orchestra/result-evaluator.ts` and `src/agents/worker-rollback.ts`
 * pulled each other at module-load time via the `worker.ts` re-export layer.
 */
export async function applyRollbackVerdict(
  projectRoot: string,
  taskId: string,
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
): Promise<{ applied: 'rollback' | 'drop' | 'none'; stashRef: string | null }> {
  const { readStashRef, rollbackWorkerScope, dropWorkerSnapshot, clearStashRef } =
    await import('../agents/worker-rollback.js');

  const stashRef = readStashRef(projectRoot, taskId);
  if (!stashRef) {
    return { applied: 'none', stashRef: null };
  }

  try {
    if (decision === 'NO_GO') {
      rollbackWorkerScope(projectRoot, stashRef, []);
      clearStashRef(projectRoot, taskId);
      return { applied: 'rollback', stashRef };
    }
    dropWorkerSnapshot(projectRoot, stashRef);
    clearStashRef(projectRoot, taskId);
    return { applied: 'drop', stashRef };
  } catch (err) {
    debugLog(
      'applyRollbackVerdict',
      `Task ${taskId}: rollback dispatch failed (${decision}) — ${err instanceof Error ? err.message : String(err)}`,
    );
    clearStashRef(projectRoot, taskId);
    return { applied: 'none', stashRef };
  }
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

// ─── Verification Task Detection (D-1) ─────────────────────────────

/** Patterns that indicate a task is a verification/audit task (not a code-change task) */
const VERIFICATION_TASK_PATTERNS: readonly RegExp[] = [
  /\bverif(y|ication|ied)\b/i,
  /\balready\s+implemented\b/i,
  /\bsprint\s+\d+['']?de\s+yapıldı\b/i,
  /\bsprint\s+\d+\s+(completed|done|finished)\b/i,
  /\baudit\b/i,
  /\bvalidat(e|ion)\s+(existing|current)\b/i,
  /\bconfirm\s+(existing|that)\b/i,
  /\bcheck\s+(that|if|whether)\b/i,
];

/**
 * Detects whether a task is a verification/audit task that verifies existing work
 * rather than producing new code changes.
 *
 * Verification tasks legitimately have no SOURCE-CODE changes and testsPassed=true
 * because they only read and validate — they should not be penalized for
 * not changing src/tests/lib. Writing doc/audit report files (e.g.
 * docs/audits/sprint-NNN/*.md) is expected output and still qualifies.
 *
 * Sprint 151 D-1: Previously these tasks got NO_GO because correctness scored low
 * when worker self-assessed as DONE but had no file changes.
 *
 * Sprint 152 H2: filesChanged=[] was too strict — audit sprints legitimately
 * write exactly one report file per task. Now the check is "no source-code
 * changes" (src/, tests/, lib/), report files in docs/ are allowed.
 */
export function isVerificationTask(task: Task, result: TaskResult): boolean {
  // No source-code changes (doc/audit reports in docs/ are OK)
  const srcChanges = (result.filesChanged ?? []).some(f => isSourceCodeDir(f));
  if (srcChanges) return false;
  if (!result.testsPassed) return false;

  // Check task description for verification patterns
  const description = (task.description ?? '').toLowerCase();
  const title = (task.title ?? '').toLowerCase();
  const notes = (result.notes ?? '').toLowerCase();
  const textToCheck = `${description} ${title} ${notes}`;

  return VERIFICATION_TASK_PATTERNS.some(pattern => pattern.test(textToCheck));
}

// ─── Result Schema Validation (D-2) ────────────────────────────────

/**
 * Validates that a worker result contains the required schema fields.
 * Missing schema fields indicate the worker template was not followed correctly.
 *
 * Sprint 151 D-2: Workers must provide rubricScores, evaluationDecision, coverage.
 * Missing fields → NO_GO with "schema violation" reason.
 */
export interface ResultSchemaValidation {
  valid: boolean;
  missingFields: string[];
  reason: string;
}

/**
 * Validates that a worker result contains the required schema fields.
 *
 * Sprint 154 T-004: `task` parameter optional — when supplied and the task is a
 * non-code task (per rubric-registry `coverageOptional`), `coverage:null` is
 * tolerated. For code tasks, missing/non-numeric coverage still fails the schema.
 *
 * @param result - Worker task result to validate
 * @param task - Optional task definition; used to relax coverage check for non-code tasks
 * @returns ResultSchemaValidation with `valid`, `missingFields`, and human-readable `reason`
 */
export function validateResultSchema(result: TaskResult, task?: Task): ResultSchemaValidation {
  const missingFields: string[] = [];

  if (typeof result.coverage !== 'number') {
    // Sprint 154 Bug B fix: doc-write and audit tasks may report coverage:null
    // because they don't produce executable code. The rubric registry tells us
    // whether coverage is required for this task's type.
    // Sprint 207 P0-1: pass `result` so coverageOptional can use the signal-based
    // path (wrote tests / tests passed) — agent-independent, breaks the false-FIX
    // cascade where the same result was NO_GO under refactorer but DONE under bug-fixer.
    if (!(task && coverageOptional(task, result))) {
      missingFields.push('coverage');
    }
  }

  if (!result.selfAssessment) {
    missingFields.push('selfAssessment');
  }

  if (typeof result.testsPassed !== 'boolean') {
    // Sprint 171 Bug A: testsPassed is test-execution-dependent — the SAME
    // semantic field group as coverage above (512-519). Audit / non-code
    // tasks run no tests (Worker Contract "TDD YOK"), so testsPassed is
    // legitimately absent. Relax under the SAME coverageOptional(task) guard.
    // This generalizes P0-1 (Sprint 169, coverage-only) to the full
    // test-execution-dependent group — breaking the per-field spurious-NO_GO
    // patch cycle (Sprint 137-171 "her sprint farklı maske").
    if (!(task && coverageOptional(task, result))) {
      missingFields.push('testsPassed');
    }
  }

  if (!result.taskId) {
    missingFields.push('taskId');
  }

  if (!Array.isArray(result.filesChanged)) {
    missingFields.push('filesChanged');
  }

  const valid = missingFields.length === 0;
  const reason = valid
    ? 'Result schema valid'
    : `Schema violation: missing required fields [${missingFields.join(', ')}]`;

  return { valid, missingFields, reason };
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
  } else if ((result.selfAssessment as string) === 'TIMEOUT_WITH_WORK') {
    // Sprint 145: partial work exists — give partial credit (between TECH_DEBT and NO_GO)
    score += 10;
    reasons.push('self-assessment TIMEOUT_WITH_WORK (partial work)');
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

  // Sprint 207 P0-3 (forensic Sprint 206): NaN propagation guard. When a worker
  // omits coverage (undefined) or writes null, Math.min(undefined, 100) = NaN →
  // totalScore = NaN → decision NO_GO ("score=NaN/100"), a false failure even for
  // landed work. Normalize non-finite coverage to a neutral 0 here; combined with
  // hasNewTests credit and the coverageOptional schema relaxation, a test-writing
  // task is no longer punished for an unmeasured coverage number.
  const cov = (typeof result.coverage === 'number' && Number.isFinite(result.coverage))
    ? result.coverage
    : 0;
  let score = Math.min(cov, 100);
  if (hasNewTests) score = Math.min(score + 15, 100);

  const covLabel = (typeof result.coverage === 'number' && Number.isFinite(result.coverage))
    ? `${result.coverage}%`
    : 'unmeasured';
  const reasons: string[] = [`coverage ${covLabel}`];
  if (hasNewTests) reasons.push('new test files written');

  return { criterion: 'test_coverage', score, passed: score >= 50, reason: reasons.join('; ') };
}

/**
 * Auxiliary directory prefixes — files in these directories are considered
 * "task-intent compatible" even if they're outside the declared scope.
 *
 * Sprint 151 D-5: Workers touching docs/, .deckent/ etc. alongside their
 * primary scope shouldn't get scope_compliance=0. Instead, auxiliary files
 * get a -20 penalty (scored as 80) rather than 0.
 */
const AUXILIARY_DIR_PREFIXES = [
  'docs/',
  '.deckent/',
  '.tasks/',
  '.brain/',
  'CHANGELOG',
  'README',
];

function isAuxiliaryFile(filePath: string): boolean {
  return AUXILIARY_DIR_PREFIXES.some(prefix => filePath.startsWith(prefix));
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
  let auxiliary = 0;
  for (const file of changed) {
    const inDir = dirs.some(d => file.startsWith(d));
    const inWrite = writeFiles.some(w => file === w);
    if (inDir || inWrite) {
      inScope++;
    } else if (isAuxiliaryFile(file)) {
      auxiliary++;
    }
  }

  // D-5: Auxiliary files get partial credit (80 per file) instead of 0
  // Formula: (inScope * 100 + auxiliary * 80) / (changed.length * 100) * 100
  const totalScore = inScope * 100 + auxiliary * 80;
  const maxScore = changed.length * 100;
  const score = Math.round((totalScore / maxScore) * 100);

  const parts: string[] = [`${inScope}/${changed.length} files within scope`];
  if (auxiliary > 0) {
    parts.push(`${auxiliary} auxiliary files (partial credit)`);
  }

  return {
    criterion: 'scope_compliance',
    score,
    passed: score >= 80,
    reason: parts.join('; '),
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

// ─── Sprint 154 Bug B Fix — Per-TaskType Scorers ──────────────────────
// Used by AUDIT_RUBRIC and DOC_WRITE_RUBRIC. File I/O is synchronous and
// wrapped in try/catch — failure falls back to notes-derived heuristics so
// a missing report file degrades gracefully instead of crashing evaluation.

const WORD_COUNT_PATTERNS = [
  /(\d+)\s*kelime/i,
  /(\d+)\s*words?\b/i,
];

const WORD_COUNT_TARGET_PATTERNS = [
  /[≥>=]+\s*(\d+)\s*kelime/i,
  /[≥>=]+\s*(\d+)\s*words?\b/i,
  /(\d+)\s*\+\s*kelime/i,
  /(\d+)\s*\+\s*words?\b/i,
];

function extractFirstNumber(text: string, patterns: readonly RegExp[]): number | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

function readChangedFile(result: TaskResult): string | null {
  const first = result.filesChanged?.[0];
  if (!first) return null;
  try {
    return readFileSync(first, 'utf-8');
  } catch (e) {
    debugLog('readChangedFile:readFileSync', e);
    return null;
  }
}

/**
 * Score doc-write tasks by word count.
 *
 * Looks at worker notes for a self-reported word count (Turkish "kelime" or
 * English "words") and at the task description for a target ("≥800 kelime").
 * Falls back to notes length when neither is present so the criterion still
 * produces a meaningful score.
 */
export function scoreWordCount(result: TaskResult, task: Task): RubricScore {
  const notes = result.notes ?? '';
  const description = task.description ?? '';
  const actual = extractFirstNumber(notes, WORD_COUNT_PATTERNS);
  const target = extractFirstNumber(description, WORD_COUNT_TARGET_PATTERNS);

  if (actual !== null && target !== null && target > 0) {
    const score = Math.min(Math.round((actual / target) * 100), 100);
    return {
      criterion: 'word_count',
      score,
      passed: score >= 50,
      reason: `actual ${actual} / target ${target} words`,
    };
  }

  if (actual !== null) {
    const score = actual >= 200 ? 100 : actual >= 100 ? 70 : 30;
    return {
      criterion: 'word_count',
      score,
      passed: score >= 50,
      reason: `actual ${actual} words (no explicit target)`,
    };
  }

  const score = notes.length >= 200 ? 70 : 30;
  return {
    criterion: 'word_count',
    score,
    passed: score >= 50,
    reason: `no word count reported; notes length ${notes.length} chars`,
  };
}

/**
 * Score audit reports by structural completeness: headings, lists/tables,
 * and minimum length. Reads the first filesChanged entry; if unreadable,
 * falls back to notes-based heuristic to avoid hard-failing the evaluator.
 */
export function scoreAuditCompleteness(result: TaskResult, _task: Task): RubricScore {
  const content = readChangedFile(result);
  if (content === null) {
    const notes = result.notes ?? '';
    const fallback = notes.length >= 200 ? 50 : 20;
    return {
      criterion: 'audit_completeness',
      score: fallback,
      passed: fallback >= 60,
      reason: `report unreadable; notes-based fallback (${notes.length} chars)`,
    };
  }

  let score = 0;
  const reasons: string[] = [];

  if (/^#\s/m.test(content) || /^##\s/m.test(content)) {
    score += 30;
    reasons.push('headings present');
  }
  if (/^\s*[-*+]\s/m.test(content) || /^\s*\|/m.test(content)) {
    score += 40;
    reasons.push('bullets/tables present');
  }
  if (content.length >= 500) {
    score += 30;
    reasons.push(`length ${content.length}≥500`);
  } else {
    reasons.push(`length ${content.length}<500`);
  }

  return {
    criterion: 'audit_completeness',
    score,
    passed: score >= 60,
    reason: reasons.join('; '),
  };
}

const FINDING_PATTERN = /\b(finding|bug|risk|issue|drift)\b/gi;

/** Count audit findings in the report (Finding/Bug/Risk/Issue/Drift, case-insensitive). */
export function scoreFindingCount(result: TaskResult, _task: Task): RubricScore {
  const content = readChangedFile(result);
  if (content === null) {
    return {
      criterion: 'finding_count',
      score: 10,
      passed: false,
      reason: 'report unreadable',
    };
  }

  const matches = content.match(FINDING_PATTERN);
  const count = matches?.length ?? 0;

  let score: number;
  if (count === 0) score = 10;
  else if (count <= 3) score = 50;
  else if (count <= 7) score = 80;
  else score = 100;

  return {
    criterion: 'finding_count',
    score,
    passed: score >= 40,
    reason: `${count} finding(s) detected`,
  };
}

const CITATION_PATTERN = /[A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx|md|json|yml|yaml|sh)(?::\d+)?/g;
const LINE_REF_PATTERN = /\b[A-Za-z0-9_./-]+:\d+\b/g;

/** Count file:line references in the report — citation density signal. */
export function scoreCitationDensity(result: TaskResult, _task: Task): RubricScore {
  const content = readChangedFile(result);
  if (content === null) {
    return {
      criterion: 'citation_density',
      score: 20,
      passed: false,
      reason: 'report unreadable',
    };
  }

  const fileRefs = content.match(CITATION_PATTERN) ?? [];
  const lineRefs = content.match(LINE_REF_PATTERN) ?? [];
  const count = new Set([...fileRefs, ...lineRefs]).size;

  let score: number;
  if (count === 0) score = 20;
  else if (count <= 2) score = 50;
  else if (count <= 5) score = 75;
  else score = 100;

  return {
    criterion: 'citation_density',
    score,
    passed: score >= 40,
    reason: `${count} unique citation(s) detected`,
  };
}

const TRIAGE_LABEL_PATTERN = /\b(P0|P1|P2|P3|CRITICAL|HIGH|MEDIUM|LOW)\b/g;

/** Count distinct migration triage labels (P0/P1/P2/P3 + severity words). */
export function scoreMigrationTriage(result: TaskResult, _task: Task): RubricScore {
  const content = readChangedFile(result);
  if (content === null) {
    return {
      criterion: 'migration_triage',
      score: 0,
      passed: false,
      reason: 'report unreadable',
    };
  }

  const matches = content.match(TRIAGE_LABEL_PATTERN) ?? [];
  const distinct = new Set(matches.map(m => m.toUpperCase())).size;

  let score: number;
  if (distinct === 0) score = 0;
  else if (distinct <= 2) score = 50;
  else score = 100;

  return {
    criterion: 'migration_triage',
    score,
    passed: score >= 40,
    reason: `${distinct} distinct triage label(s)`,
  };
}

/** Score doc heading structure: count of H2 and H3 sections. */
export function scoreDocumentationQuality(result: TaskResult, _task: Task): RubricScore {
  const content = readChangedFile(result);
  if (content === null) {
    const notes = result.notes ?? '';
    const fallback = notes.length >= 100 ? 60 : 30;
    return {
      criterion: 'documentation_quality',
      score: fallback,
      passed: fallback >= 30,
      reason: 'doc unreadable; notes-based fallback',
    };
  }

  const h2 = (content.match(/^##\s/gm) ?? []).length;
  const h3 = (content.match(/^###\s/gm) ?? []).length;
  const total = h2 + h3;

  let score: number;
  if (total === 0) score = 30;
  else if (total <= 2) score = 60;
  else score = 100;

  return {
    criterion: 'documentation_quality',
    score,
    passed: score >= 30,
    reason: `${h2} H2 + ${h3} H3 heading(s)`,
  };
}

/** Dispatch scoring for a named criterion */
function scoreCriterion(name: string, result: TaskResult, task: Task): RubricScore {
  switch (name) {
    case 'correctness': return scoreCorrectness(result);
    case 'test_coverage': return scoreTestCoverage(result);
    case 'scope_compliance': return scoreScopeCompliance(result, task);
    case 'documentation': return scoreDocumentation(result);
    case 'audit_completeness': return scoreAuditCompleteness(result, task);
    case 'finding_count': return scoreFindingCount(result, task);
    case 'citation_density': return scoreCitationDensity(result, task);
    case 'migration_triage': return scoreMigrationTriage(result, task);
    case 'word_count': return scoreWordCount(result, task);
    case 'documentation_quality': return scoreDocumentationQuality(result, task);
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
  projectRoot?: string,
): EvaluationResult {
  // D-2: Schema validation — reject results with missing required fields
  // Sprint 154 T-004: pass `task` so coverage:null is tolerated on non-code tasks
  const schemaCheck = validateResultSchema(result, task);
  if (!schemaCheck.valid) {
    return {
      decision: 'NO_GO',
      totalScore: 0,
      rubricScores: [{
        criterion: 'schema_validation',
        score: 0,
        passed: false,
        reason: schemaCheck.reason,
      }],
      retryCount: 0,
    };
  }

  // D-1: Verification task fast-path — tasks that verify existing work
  // should get DONE when filesChanged=[] + testsPassed=true + description matches
  if (isVerificationTask(task, result)) {
    return {
      decision: 'DONE',
      totalScore: 100,
      rubricScores: [
        { criterion: 'correctness', score: 100, passed: true, reason: 'verification task — tests passed, existing work confirmed' },
        { criterion: 'test_coverage', score: 100, passed: true, reason: 'verification task — no new code to cover' },
        { criterion: 'scope_compliance', score: 100, passed: true, reason: 'verification task — no files changed (expected)' },
        { criterion: 'documentation', score: 100, passed: true, reason: 'verification task — notes provided' },
      ],
      retryCount: 0,
    };
  }

  // Sprint 154 Bug B fix: when no rubric override is supplied, dispatch to
  // the task-type-aware rubric from the registry (audit / doc-write / code).
  // Doc-only tasks no longer get graded against the code rubric, which was
  // producing false NO_GO when coverage was null.
  const baseRubric: EvaluationRubric = rubric ? DEFAULT_RUBRIC : getRubric(task);
  const merged: EvaluationRubric = {
    criteria: rubric?.criteria ?? baseRubric.criteria,
    passingScore: rubric?.passingScore ?? baseRubric.passingScore,
    maxRetries: Math.min(rubric?.maxRetries ?? baseRubric.maxRetries, 3),
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

  const evaluation: EvaluationResult = {
    decision,
    totalScore,
    rubricScores,
    retryCount: merged.maxRetries,
  };

  // Sprint 163 T-001: Spurious NO_GO reconciliation wire restore.
  // When the rubric returns NO_GO but the worker's selfAssessment + concrete
  // rubric scores prove otherwise (162-003 regression class), override the
  // decision. The helper preserves NO_GO for concrete failures (testsPassed=false,
  // scope_compliance<90) and for worker self-NO_GO.
  if (evaluation.decision === 'NO_GO') {
    const reconciled = reconcileRubricNoGo(result, evaluation);
    if (reconciled.reconciled) {
      debugLog('evaluateWithRubric:reconcile', `Task ${task.id}: ${reconciled.notes}`);
      return {
        ...evaluation,
        decision: reconciled.decision,
      };
    }

    // Sprint 191 P191-1: Spurious NO_GO recovery for OOM-killed / partial-result
    // promoted workers (Sprint 151 safety-net). evaluateWithRubric was the only
    // production EVALUATE path that did NOT call reconcileSpuriousNoGo (Sprint 145
    // helper was wired only into the deprecated evaluateResult).
    //
    // When projectRoot is provided, attempt git-diff/scope/tsc recovery as a
    // final fallback. For OOM-killed workers (Sprint 151 partial-marker promotion)
    // we accept reconcile WITHOUT vitest scope check — the worker was killed
    // before it could run tests, so expecting test pass is illogical. The
    // result will be GO_WITH_TECH_DEBT (tech debt: tests need follow-up sprint).
    if (projectRoot) {
      const isOomKilled =
        typeof result.notes === 'string' &&
        (result.notes.includes('OOM-killed') ||
          result.notes.includes('SIGKILL') ||
          result.notes.includes('partial-result promoted'));

      const spurious = reconcileSpuriousNoGo(
        result,
        task,
        projectRoot,
        isOomKilled
          ? {
              // OOM-kill path: skip vitest (worker died before tests could run).
              // Still require: git diff > 0, scope compliant, tsc clean.
              runVitestScopeCheck: () => ({ passed: true, passRatio: 0 }),
            }
          : undefined,
      );
      if (spurious.reconciled && spurious.decision === 'GO_WITH_TECH_DEBT') {
        debugLog(
          'evaluateWithRubric:spurious-reconcile',
          `Task ${task.id}: spurious NO_GO reconciled → GO_WITH_TECH_DEBT (${spurious.linesChanged} lines, ${spurious.filesChanged.length} files, oomKilled=${isOomKilled})`,
        );
        return {
          ...evaluation,
          decision: 'GO_WITH_TECH_DEBT',
        };
      }
    }
  }

  return evaluation;
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

// ─── Honest Result Gate (Sprint 165 Task 1 — Bug X Fix) ──────────────
// Eradicates the "no-result → CODE_VERIFIED_DONE" stub pattern that
// Sprint 156-011 marked CRITICAL and Sprint 164 reproduced live.
//
// The bug: when a worker died (Docker HB shutdown, OOM, scope mismatch)
// without writing .result, the auditor + sprint-finalizer pipeline wrote
// a fake-DONE stub:
//   { linesAdded: 0, testsPassed: false, selfAssessment: 'DONE',
//     codeVerified: 'CODE_VERIFIED_DONE',
//     notes: 'Code physically verified despite missing .result ...' }
// Brain then counted dead-worker tasks as successful.
//
// The gate below is the single canonical honest-eval boundary applied
// at the EVALUATE phase (sprint-phases.ts:runEvaluatePhase) and again
// before RETRO (writeHonestSentinelResult is called for missing-result
// tasks so the finalizer's tryCodeVerifiedDone sees an honest NO_GO
// instead of triggering the legacy auto-promote codepath).

/**
 * Stub-detection union: which dishonesty pattern triggered the gate.
 * - DISHONEST_DONE_STUB: selfAssessment=DONE but linesAdded=0 + tests fail
 * - CODE_VERIFIED_STUB:  legacy auditor stub (codeVerified field present)
 * - WORKER_CRASHED_NO_RESULT: no .result file on disk
 * - BOUNDARY_VIOLATION: filesChanged contains paths outside filesWrite
 * - SCOPE_VIOLATION_OR_EMPTY_WRITE: filesChanged non-empty but linesAdded=0
 */
export type HonestyViolation =
  | 'DISHONEST_DONE_STUB'
  | 'CODE_VERIFIED_STUB'
  | 'WORKER_CRASHED_NO_RESULT'
  | 'BOUNDARY_VIOLATION'
  | 'SCOPE_VIOLATION_OR_EMPTY_WRITE'
  // Sprint 194 Task 194-002 — W-INTEGRITY I-8 dishonest-result detector codes.
  // See honest-gate.ts for the detection logic; emitted by enforceHonestResultGate
  // when {@link runDishonestyCheck} fires after structural gate passes.
  | 'LOC_DELTA_MISMATCH'
  | 'FILES_NOT_TOUCHED'
  | 'NOTES_CLAIM_MISMATCH'
  // Sprint 195 195-001 — W-INTEGRITY disk-verify gate. Emitted when the
  // worker reported filesChanged=[] but on-disk evidence (git numstat /
  // ls-files --others) shows real partial work; honest-gate carries the
  // signal so result-evaluator can route it through the same downgrade path.
  | 'MISSING_RESULT_BUT_DISK_HAS_WORK';

/**
 * Result of running enforceHonestResultGate.
 * - `result`: the (possibly downgraded) TaskResult to use downstream
 * - `honest`: true if the original was honest, false if downgraded
 * - `violation`: which dishonesty pattern was detected (when !honest)
 */
export interface HonestGateResult {
  result: TaskResult;
  honest: boolean;
  violation?: HonestyViolation;
}

/**
 * Sentinel notes prefix attached to all downgraded results so the
 * downstream evaluator + auditor can identify gated tasks without
 * re-running the gate logic.
 */
const HONEST_GATE_PREFIX = '[honest-gate]';

/**
 * Detects the literal stub written by sprint-finalizer.ts's
 * writeCodeVerifiedResult — the exact shape from Sprint 164 forensic.
 */
export function isStubResult(result: TaskResult): boolean {
  if (!result) return false;
  const codeVerified = (result as TaskResult & { codeVerified?: string }).codeVerified;
  const linesAdded = result.linesAdded ?? 0;
  const testsPassed = result.testsPassed === true;
  const selfDone = result.selfAssessment === 'DONE';

  // CODE_VERIFIED_DONE marker is the strongest signal (legacy stub writer)
  if (codeVerified === 'CODE_VERIFIED_DONE' && linesAdded === 0 && !testsPassed) {
    return true;
  }
  // Even without the marker, the shape itself is dishonest
  if (selfDone && linesAdded === 0 && !testsPassed) {
    return true;
  }
  return false;
}

/**
 * Detects when filesChanged contains paths outside of task.scope.filesWrite.
 * This is the Sprint 164 164-006 scenario (worker tried to write DIRECTIVES.md
 * which was outside its scope). Returns the violating paths (empty = clean).
 */
function findBoundaryViolations(result: TaskResult, task: Task): string[] {
  const filesWrite = task.scope?.filesWrite ?? [];
  if (filesWrite.length === 0) return [];

  // Sprint 169.5 P0-2 — worker protocol files are mandated by worker-default.md
  // (plan, result, heartbeat) and must NOT be flagged as boundary violations.
  const protocolFiles = new Set([
    `.tasks/task-${task.id}.plan`,
    `.tasks/task-${task.id}.result`,
    `.tasks/task-${task.id}.hb`,
  ]);

  const allowed = new Set(filesWrite.map(f => f.replace(/\\/g, '/')));
  const violations: string[] = [];

  for (const changed of result.filesChanged ?? []) {
    const norm = changed.replace(/\\/g, '/');
    // Allow direct match OR match under any allowed directory in scope
    if (allowed.has(norm)) continue;
    if (protocolFiles.has(norm)) continue;
    // Scope-directory containment check
    const dirs = task.scope?.directories ?? [];
    const insideDir = dirs.some(d => {
      const dn = d.endsWith('/') ? d : `${d}/`;
      return norm.startsWith(dn.replace(/\\/g, '/'));
    });
    if (!insideDir) {
      violations.push(changed);
    }
  }
  return violations;
}

/**
 * Build a downgraded NO_GO copy of the input result, stripping any
 * `codeVerified` stub marker and prepending the honest-gate prefix to notes.
 */
function downgradeToNoGo(
  result: TaskResult,
  violation: HonestyViolation,
  detail: string,
): TaskResult {
  const stripped: TaskResult & { codeVerified?: string } = { ...result };
  // Strip the dishonest marker so it cannot resurface downstream
  delete stripped.codeVerified;
  const originalNotes = (result.notes ?? '').slice(0, 500);
  const newNotes = `${HONEST_GATE_PREFIX} ${violation}: ${detail}. Original: ${originalNotes}`;
  return {
    ...stripped,
    selfAssessment: 'NO_GO',
    notes: newNotes,
  };
}

/**
 * The canonical honest-eval gate. Applied to every result BEFORE the
 * rubric scorer (in runEvaluatePhase) so dishonest DONE stubs never reach
 * the downstream pipeline.
 *
 * Order of checks (first match wins):
 *   1. Stub literal (isStubResult)               → DISHONEST_DONE_STUB / CODE_VERIFIED_STUB
 *   2. filesChanged contains out-of-scope path   → BOUNDARY_VIOLATION
 *   3. filesChanged non-empty + linesAdded === 0 → SCOPE_VIOLATION_OR_EMPTY_WRITE
 *      (only when selfAssessment claims success)
 *
 * Real-work failure modes (linesAdded>0 + testsPassed=false) are left
 * untouched — the rubric scorer / mid-sprint reconciler handles those.
 */
export function enforceHonestResultGate(
  result: TaskResult,
  task: Task,
): HonestGateResult {
  if (!result) {
    return { result, honest: true };
  }

  // Check 1: stub literal (covers Sprint 156-011 CRITICAL debt + Sprint 164 replay)
  if (isStubResult(result)) {
    const codeVerified = (result as TaskResult & { codeVerified?: string }).codeVerified;
    const violation: HonestyViolation =
      codeVerified === 'CODE_VERIFIED_DONE'
        ? 'DISHONEST_DONE_STUB'
        : 'DISHONEST_DONE_STUB';
    const detail = codeVerified === 'CODE_VERIFIED_DONE'
      ? `legacy CODE_VERIFIED_DONE marker detected; linesAdded=${result.linesAdded ?? 0} testsPassed=${result.testsPassed}`
      : `selfAssessment=DONE claimed but linesAdded=${result.linesAdded ?? 0} testsPassed=${result.testsPassed} — worker likely crashed`;
    debugLog('enforceHonestResultGate', `Task ${task.id}: ${violation} — ${detail}`);
    return {
      result: downgradeToNoGo(result, violation, detail),
      honest: false,
      violation,
    };
  }

  // Check 2: boundary violation — only flag when worker claims success
  const boundaryViolations = findBoundaryViolations(result, task);
  if (
    boundaryViolations.length > 0 &&
    (result.selfAssessment === 'DONE' || result.selfAssessment === 'GO_WITH_TECH_DEBT')
  ) {
    const detail = `files outside scope.filesWrite: ${boundaryViolations.join(', ')}`;
    debugLog('enforceHonestResultGate', `Task ${task.id}: BOUNDARY_VIOLATION — ${detail}`);
    return {
      result: downgradeToNoGo(result, 'BOUNDARY_VIOLATION', `boundary: ${detail}`),
      honest: false,
      violation: 'BOUNDARY_VIOLATION',
    };
  }

  // Check 3: filesChanged non-empty but linesAdded === 0 + claimed success
  // (sprint-finalizer's synthetic result shape — caught above by isStubResult,
  // but this is a backstop for any other producer that emits the same shape)
  if (
    (result.filesChanged?.length ?? 0) > 0 &&
    (result.linesAdded ?? 0) === 0 &&
    result.selfAssessment === 'DONE'
  ) {
    debugLog('enforceHonestResultGate', `Task ${task.id}: SCOPE_VIOLATION_OR_EMPTY_WRITE`);
    return {
      result: downgradeToNoGo(
        result,
        'SCOPE_VIOLATION_OR_EMPTY_WRITE',
        `filesChanged=${result.filesChanged.length} but linesAdded=0`,
      ),
      honest: false,
      violation: 'SCOPE_VIOLATION_OR_EMPTY_WRITE',
    };
  }

  return { result, honest: true };
}

// ─── Dishonest-Result Gate (Sprint 194 Task 194-002 — W-INTEGRITY I-8) ──
//
// The structural gate above (enforceHonestResultGate) catches stub-shaped
// .result files. The extension below catches *content* dishonesty —
// claimed `linesAdded` / `filesChanged` / notes-LoC claims that don't
// match git numstat. Sprint 191 191-003 motivating incident: notes
// claimed "+220 LoC outcome-tracker" but disk delta was only a test file.

/** Options for {@link runDishonestyCheck}. */
export interface DishonestyCheckOptions {
  /** Override the default ±50% tolerance for LoC delta drift. */
  tolerance?: number;
  /** Override the default 20-line minimum claim threshold. */
  minLocThreshold?: number;
  /**
   * Sink used to emit the BRAIN→AUDITOR audit event when dishonest.
   * Defaults to {@link emitDishonestResultEvent} writing through
   * `writeEvent` from event-stream.ts. Tests pass a spy here.
   */
  emit?: DishonestEventSink;
  /** Skip emission entirely (still downgrades the result). */
  suppressEmit?: boolean;
}

/**
 * Map a {@link DishonestyReason} from honest-gate into the broader
 * {@link HonestyViolation} union used by result-evaluator. The string
 * codes are identical — this is a typing bridge only.
 */
function dishonestyReasonToViolation(r: DishonestyReason): HonestyViolation {
  return r;
}

/**
 * Run the dishonest-result detector and, when a violation is found,
 * (1) emit the BRAIN→AUDITOR:DISHONEST_RESULT_DETECTED audit event and
 * (2) return a downgraded `{honest: false, ...}` HonestGateResult that
 * the EVALUATE phase can feed straight into the existing NO_GO pipeline.
 *
 * Pure with respect to disk except for the event emit, which is
 * fail-safe through writeEvent.
 *
 * This is the canonical wire-in for Sprint 194 Task 194-002. Callers in
 * sprint-phases.ts should chain it after `enforceHonestResultGate`:
 *
 *   const structural = enforceHonestResultGate(result, task);
 *   if (!structural.honest) return structural;
 *   return runDishonestyCheck(result, task, git, { projectRoot, sprintId });
 */
export function runDishonestyCheck(
  result: TaskResult,
  task: Task,
  git: GitNumstatProvider,
  ctx: { projectRoot: string; sprintId: string },
  opts: DishonestyCheckOptions = {},
): HonestGateResult {
  const finding = detectDishonestResult(result, git, {
    tolerance: opts.tolerance,
    minLocThreshold: opts.minLocThreshold,
  });
  if (!finding.dishonest || !finding.reason) {
    return { result, honest: true };
  }

  const violation = dishonestyReasonToViolation(finding.reason);
  const detail = finding.detail ?? `dishonest-result — ${finding.reason}`;
  debugLog(
    'runDishonestyCheck',
    `Task ${task.id}: ${violation} — ${detail}`,
  );

  if (!opts.suppressEmit) {
    try {
      emitDishonestResultEvent(
        ctx.projectRoot,
        ctx.sprintId,
        task.id,
        finding,
        opts.emit,
      );
    } catch (e) {
      // Fail-safe: never crash EVALUATE phase on emit error
      debugLog('runDishonestyCheck:emit', e);
    }
  }

  return {
    result: downgradeToNoGo(result, violation, detail),
    honest: false,
    violation,
  };
}

/**
 * Input shape for classifyHonestyViolation — describes the on-disk
 * evidence the EVALUATE phase observed for a single task.
 */
export interface HonestyClassificationInput {
  /** Whether .tasks/task-{id}.result exists */
  hasResultFile: boolean;
  /** Parsed result file content (null when missing or unparseable) */
  result: TaskResult | null;
  /** The task definition (for scope checks) */
  task: Task;
  /** Filesystem evidence — paths that show modifications */
  filesOnDisk: string[];
  /** Whether the worker's heartbeat timed out (Docker SIGKILL pattern) */
  heartbeatTimedOut: boolean;
}

/**
 * Output of classifyHonestyViolation — the verdict + whether FIX phase
 * should re-spawn the task.
 */
export interface HonestyClassification {
  /** The detected violation code (or null for honest results) */
  code: HonestyViolation | null;
  /** The evaluation to set in the evaluations Map */
  evaluation: 'NO_GO' | 'DONE' | 'GO_WITH_TECH_DEBT';
  /** Whether to trigger a FIX phase respawn */
  triggersFix: boolean;
  /** Human-readable detail line for audit logs */
  detail: string;
}

/**
 * Classifies a task's honesty state using on-disk evidence. Used by
 * sprint-phases.ts BEFORE the rubric eval to decide whether the result
 * deserves a fair evaluation or an honest-NO_GO downgrade.
 *
 * Three primary outcomes:
 *   - WORKER_CRASHED_NO_RESULT — no .result + worker died → NO_GO + FIX trigger
 *   - DISHONEST_DONE_STUB       — .result exists but stub-shaped → NO_GO + FIX trigger
 *   - null (honest)             — pass through to rubric scorer
 */
export function classifyHonestyViolation(
  input: HonestyClassificationInput,
): HonestyClassification {
  // Missing .result file → worker crashed without writing
  if (!input.hasResultFile || !input.result) {
    return {
      code: 'WORKER_CRASHED_NO_RESULT',
      evaluation: 'NO_GO',
      triggersFix: true,
      detail:
        `worker-crashed-no-result — task ${input.task.id}: no .result file on disk` +
        (input.heartbeatTimedOut ? '; heartbeat timed out' : '') +
        (input.filesOnDisk.length > 0
          ? `; on-disk evidence: ${input.filesOnDisk.join(', ')} (treated as NO_GO — not stub-promoted)`
          : '; no on-disk evidence'),
    };
  }

  // .result exists but is a stub
  if (isStubResult(input.result)) {
    const cv = (input.result as TaskResult & { codeVerified?: string }).codeVerified;
    const code: HonestyViolation =
      cv === 'CODE_VERIFIED_DONE' ? 'DISHONEST_DONE_STUB' : 'DISHONEST_DONE_STUB';
    return {
      code,
      evaluation: 'NO_GO',
      triggersFix: true,
      detail:
        `dishonest-done-stub — task ${input.task.id}: linesAdded=${input.result.linesAdded ?? 0} ` +
        `testsPassed=${input.result.testsPassed} selfAssessment=${input.result.selfAssessment}` +
        (cv ? ` codeVerified=${cv}` : ''),
    };
  }

  // Boundary violation check (matches enforceHonestResultGate logic)
  const boundary = findBoundaryViolations(input.result, input.task);
  if (
    boundary.length > 0 &&
    (input.result.selfAssessment === 'DONE' || input.result.selfAssessment === 'GO_WITH_TECH_DEBT')
  ) {
    return {
      code: 'BOUNDARY_VIOLATION',
      evaluation: 'NO_GO',
      triggersFix: true,
      detail: `boundary-violation — task ${input.task.id}: out-of-scope files: ${boundary.join(', ')}`,
    };
  }

  // Honest — pass through
  return {
    code: null,
    evaluation:
      input.result.selfAssessment === 'NO_GO'
        ? 'NO_GO'
        : input.result.selfAssessment === 'GO_WITH_TECH_DEBT'
        ? 'GO_WITH_TECH_DEBT'
        : 'DONE',
    triggersFix: false,
    detail: 'honest result — pass through to rubric scorer',
  };
}

/**
 * Writes a honest NO_GO sentinel .result file for a task whose worker
 * crashed without producing a .result. Called from sprint-phases.ts
 * BEFORE finalizeSprint runs so the legacy tryCodeVerifiedDone path sees
 * a deliberate NO_GO (not the Docker auto-pattern note) and skips
 * promotion entirely.
 *
 * The sentinel:
 *   - selfAssessment: 'NO_GO'
 *   - linesAdded: 0, testsPassed: false
 *   - notes: prefixed with HONEST_GATE_PREFIX + the violation code
 *   - codeVerified field: ABSENT (never re-emitted)
 *   - notes deliberately DO NOT contain "Docker worker exited without writing result file"
 *     so tryCodeVerifiedDone returns NOT_TRIGGERED (honest NO_GO preserved).
 */
export function writeHonestSentinelResult(
  projectRoot: string,
  taskId: string,
  filesOnDisk: string[],
  reason: string,
): void {
  const tasksDir = join(projectRoot, TASKS_DIR);
  try {
    mkdirSync(tasksDir, { recursive: true });
  } catch (e) {
    debugLog('writeHonestSentinelResult:mkdir', e);
  }

  const resultPath = join(tasksDir, `task-${taskId}.result`);
  const sentinel: TaskResult = {
    taskId,
    workerId: 'brain-honest-gate',
    filesChanged: filesOnDisk,
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes:
      `${HONEST_GATE_PREFIX} ${reason} — task ${taskId} produced no .result file. ` +
      `On-disk files: ${filesOnDisk.length > 0 ? filesOnDisk.join(', ') : 'none'}. ` +
      `No real work verified; FIX phase respawn recommended.`,
  };

  try {
    writeFileSync(resultPath, JSON.stringify(sentinel, null, 2) + '\n', 'utf-8');
    debugLog('writeHonestSentinelResult', `Wrote honest NO_GO sentinel for task ${taskId}`);
  } catch (e) {
    debugLog('writeHonestSentinelResult:write', `Failed for task ${taskId}: ${e}`);
  }
}

// ─── FIX Context Enrichment (D-3) ──────────────────────────────────

/** Pattern written by tmux/docker backends when a worker exits without producing a .result file. */
const NO_RESULT_CRASH_PATTERN = 'exited without writing result';

/**
 * Build an accurate NO_GO cause description distinguishing worker self-NO_GO
 * from crash-generated synthetic results (no .result file on disk).
 *
 * Sprint 210 210-008: "Worker exited without writing result" was reported even
 * when a .result file EXISTS with selfAssessment=NO_GO, making debug harder.
 *
 * - result is a crash fallback (noResult) → "no result file (worker exited without writing result)"
 * - result is a genuine worker self-NO_GO → "worker self-NO_GO, N files, X lines added"
 */
export function buildAccurateNoGoNote(result: TaskResult): string {
  const notes = result.notes ?? '';
  const isNoResult = notes.includes(NO_RESULT_CRASH_PATTERN);
  if (isNoResult) {
    return 'no result file (worker exited without writing result)';
  }
  if (result.selfAssessment === 'NO_GO') {
    const files = result.filesChanged?.length ?? 0;
    const lines = result.linesAdded ?? 0;
    return `worker self-NO_GO, ${files} files, ${lines} lines added`;
  }
  return `evaluation NO_GO (selfAssessment=${result.selfAssessment ?? 'unknown'})`;
}

/**
 * Build an enriched reason string for FIX tasks that includes specific
 * rubric scores and failure details instead of generic "Task X NO_GO".
 *
 * Sprint 151 D-3: FIX workers need concrete failure context to break
 * the retry loop. Generic reasons like "Task X evaluated as NO_GO"
 * provide no actionable information.
 */
export function buildEnrichedFixReason(
  taskId: string,
  result: TaskResult,
  rubricResult?: EvaluationResult,
): string {
  const accurateReason = buildAccurateNoGoNote(result);
  const parts: string[] = [`Task ${taskId} evaluated as NO_GO`, accurateReason];

  if (rubricResult) {
    parts.push(`totalScore=${rubricResult.totalScore}`);
    for (const score of rubricResult.rubricScores) {
      if (!score.passed) {
        parts.push(`${score.criterion}=${score.score} (FAILED, reason: ${score.reason})`);
      }
    }
  }

  if (!result.testsPassed) parts.push('tests failed');
  if ((result.filesChanged?.length ?? 0) === 0) parts.push('no files changed');
  if (result.notes && result.notes.length > 0) {
    parts.push(`worker notes: "${result.notes.slice(0, 200)}"`);
  }

  return parts.join('; ');
}

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
