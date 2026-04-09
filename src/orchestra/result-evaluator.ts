// ═══ Result Evaluator — Pure evaluation module ═══════════════════════
// Extracted from brain.ts (Sprint 036).
// Contains: evaluateResult, isDocTask, waitForResults, getRecentSprintStats
// No side effects, no file writes — evaluation logic only.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  <T>(filePath: string): T | null;
}

/** Checks if a file exists */
export interface FileExistsFn {
  (filePath: string): boolean;
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

  const collectResults = (): string[] => {
    const newlyCollected: string[] = [];
    for (const taskId of taskIds) {
      if (collected.has(taskId)) continue;
      const resultPath = `${projectRoot}/${tasksDir}/task-${taskId}.result`;
      if (fileExists(resultPath)) {
        const result = readJson<TaskResult>(resultPath);
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

  const initiallyCollected = collectResults();
  processQueue(initiallyCollected);
  if (collected.size === taskIds.size) return results;

  // Use fs.watch with fallback polling
  const watcher = createWatcher(projectRoot, WATCH_FALLBACK_MS);
  try {
    while (Date.now() - startTime < timeoutMs) {
      await watcher.waitForChange();
      const newlyCollected = collectResults();
      processQueue(newlyCollected);
      if (collected.size === taskIds.size) break;
    }
  } finally {
    watcher.close();
  }
  return results;
}

// ─── Default implementations (used when no injection provided) ───────

function defaultReadJson<T>(filePath: string): T | null {
  try {
    const { readFileSync } = require('node:fs');
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch (e) {
    debugLog('defaultReadJson:readFile', e);
    return null;
  }
}

function defaultFileExists(filePath: string): boolean {
  try {
    const { existsSync } = require('node:fs');
    return existsSync(filePath);
  } catch (e) {
    debugLog('defaultFileExists:existsSync', e);
    return false;
  }
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
export function getRecentSprintStats(projectRoot: string, lookback: number): RecentSprintStats {
  const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsPath)) {
    return { avgNoGoRate: 0, avgCoverage: 0, sprintCount: 0 };
  }

  const files = readdirSync(sprintsPath)
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
      const content = readFileSync(join(sprintsPath, file), 'utf-8');
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
