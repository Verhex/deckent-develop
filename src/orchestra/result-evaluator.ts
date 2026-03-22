// ═══ Result Evaluator — Pure evaluation module ═══════════════════════
// Extracted from brain.ts (Sprint 036).
// Contains: evaluateResult, isDocTask, waitForResults
// No side effects, no file writes — evaluation logic only.

import type { Task, TaskResult } from '../core/types.js';
import { TaskEvaluation } from '../core/types.js';
import { validateWorkerCoverage } from './coverage-validator.js';

// ─── Source code directory detection ──────────────────────────────────

/** Source code directory prefixes — anything outside these is treated as a doc task */
const SOURCE_CODE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];

function isSourceCodeDir(dir: string): boolean {
  const normalized = dir === 'src' || dir === 'tests' || dir === 'lib';
  return normalized || SOURCE_CODE_PREFIXES.some(p => dir.startsWith(p));
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
 * Evaluation order:
 * 1. If selfAssessment is NO_GO → NO_GO
 * 2. If selfAssessment is GO_WITH_TECH_DEBT → GO_WITH_TECH_DEBT
 * 3. If tests failed → NO_GO
 * 4. If doc task → DONE (skip coverage)
 * 5. If vitest JSON provided and coverage mismatch → GO_WITH_TECH_DEBT
 * 6. If coverage < 90% → GO_WITH_TECH_DEBT
 * 7. Otherwise → DONE
 */
export function evaluateResult(result: TaskResult, task: Task, vitestJsonOutput?: string): TaskEvaluation {
  if (result.selfAssessment === 'NO_GO') return TaskEvaluation.NO_GO;
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT') return TaskEvaluation.GO_WITH_TECH_DEBT;
  if (!result.testsPassed) return TaskEvaluation.NO_GO;
  if (isDocTask(task)) return TaskEvaluation.DONE;

  // Coverage validation: if vitest JSON output provided, validate reported vs actual
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

  if (result.coverage < 90) return TaskEvaluation.GO_WITH_TECH_DEBT;
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
      } catch { /* ignore */ }
      const nextTask = remainingQueue.shift(); // length > 0 checked above
      if (!nextTask) break;
      try {
        if (spawnTaskFn) {
          spawnTaskFn(nextTask, { autoApprove, projectDir: projectRoot });
        }
      } catch { /* ignore spawn errors — task will timeout */ }
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
  } catch {
    return null;
  }
}

function defaultFileExists(filePath: string): boolean {
  try {
    const { existsSync } = require('node:fs');
    return existsSync(filePath);
  } catch {
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
