/**
 * Worker Log Formatting & I/O
 *
 * Extracted from worker.ts (Sprint 144 God Object Split).
 * Handles structured worker log formatting (action indicators, scope, test, verify, done)
 * and log file append/read operations.
 */
import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS_DIR } from '../core/constants.js';
import { redactSensitive } from '../core/redact-sensitive.js';

// ─── Internal Helpers ───────────────────────────────────────────────

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// ─── Worker Log Action Types ────────────────────────────────────────

/** Action types for worker log entries */
export type WorkerLogAction =
  | 'Starting'
  | 'Scope'
  | 'Writing'
  | 'Verify'
  | 'Test'
  | 'Fix'
  | 'Retry'
  | 'Done'
  | 'Error'
  | 'Info';

const ACTION_INDICATORS: Record<WorkerLogAction, string> = {
  Starting: '▶',
  Scope: '📂',
  Writing: '✏',
  Verify: '🔍',
  Test: '🧪',
  Fix: '🔧',
  Retry: '🔄',
  Done: '✅',
  Error: '❌',
  Info: 'ℹ',
};

const ACTION_INDICATORS_PLAIN: Record<WorkerLogAction, string> = {
  Starting: '>',
  Scope: '#',
  Writing: '*',
  Verify: '?',
  Test: 'T',
  Fix: 'F',
  Retry: 'R',
  Done: '+',
  Error: '!',
  Info: 'i',
};

// ─── Format Functions ───────────────────────────────────────────────

/**
 * Format a single worker log line.
 * @param taskId - Task identifier (e.g. "040-003")
 * @param action - Log action type
 * @param detail - Human-readable detail string
 * @param options - Optional: noColor disables emoji indicators
 * @returns Formatted log line like "[040-003] Starting: Planner Provider Decoupling"
 */
export function formatWorkerLog(
  taskId: string,
  action: WorkerLogAction,
  detail: string,
  options?: { noColor?: boolean },
): string {
  const indicator = options?.noColor
    ? ACTION_INDICATORS_PLAIN[action]
    : ACTION_INDICATORS[action];
  return `[${taskId}] ${indicator} ${action}: ${detail}`;
}

/**
 * Format a scope summary line.
 * @param taskId - Task identifier
 * @param directories - List of scope directories
 * @param fileCount - Number of files in scope
 * @param options - Optional: noColor
 */
export function formatScopeLog(
  taskId: string,
  directories: string[],
  fileCount: number,
  options?: { noColor?: boolean },
): string {
  const dirList = directories.join(', ');
  const fileSuffix = fileCount === 1 ? '1 file' : `${fileCount} files`;
  return formatWorkerLog(taskId, 'Scope', `${dirList} (${fileSuffix})`, options);
}

/**
 * Format a test result log line.
 * @param taskId - Task identifier
 * @param passed - Whether tests passed
 * @param detail - Additional detail (e.g. failure count)
 * @param attempt - Current attempt number (for retries)
 * @param maxAttempts - Maximum attempts
 * @param options - Optional: noColor
 */
export function formatTestLog(
  taskId: string,
  passed: boolean,
  detail: string,
  attempt?: number,
  maxAttempts?: number,
  options?: { noColor?: boolean },
): string {
  const retryInfo = attempt && maxAttempts && attempt > 1
    ? ` (attempt ${attempt}/${maxAttempts})`
    : '';
  const status = passed ? 'Pass' : `Fail ${detail}`;
  return formatWorkerLog(taskId, 'Test', `${status}${retryInfo}`, options);
}

/**
 * Format a compilation verification log line.
 * @param taskId - Task identifier
 * @param passed - Whether tsc passed
 * @param errorCount - Number of errors (when failed)
 * @param options - Optional: noColor
 */
export function formatVerifyLog(
  taskId: string,
  passed: boolean,
  errorCount?: number,
  options?: { noColor?: boolean },
): string {
  const status = passed
    ? 'tsc --noEmit... Pass'
    : `tsc --noEmit... Fail ${errorCount ?? 0} errors`;
  return formatWorkerLog(taskId, 'Verify', status, options);
}

/**
 * Format a done/result log line with timing and retry info.
 * @param taskId - Task identifier
 * @param result - Self-assessment result (DONE, GO_WITH_TECH_DEBT, NO_GO)
 * @param retries - Number of retries
 * @param durationMin - Duration in minutes
 * @param options - Optional: noColor
 */
export function formatDoneLog(
  taskId: string,
  result: string,
  retries: number,
  durationMin: number,
  options?: { noColor?: boolean },
): string {
  const retryInfo = retries > 0 ? `${retries} retry, ` : '';
  return formatWorkerLog(
    taskId,
    result === 'NO_GO' ? 'Error' : 'Done',
    `${result} (${retryInfo}${durationMin} min)`,
    options,
  );
}

// ─── Log File I/O ───────────────────────────────────────────────────

/**
 * Append a formatted log line to the worker's log file.
 * @param projectRoot - Project root directory
 * @param taskId - Task identifier
 * @param line - Pre-formatted log line
 */
export function appendWorkerLog(
  projectRoot: string,
  taskId: string,
  line: string,
): void {
  ensureDir(join(projectRoot, TASKS_DIR));
  const logPath = join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
  const timestamp = new Date().toISOString();
  const entry = `${timestamp} ${line}\n`;
  appendFileSync(logPath, entry, 'utf-8');
}

export function readWorkerLog(projectRoot: string, taskId: string): string | null {
  const logPath = join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
  if (!existsSync(logPath)) return null;
  const raw = readFileSync(logPath, 'utf-8');
  return redactSensitive(raw);
}
