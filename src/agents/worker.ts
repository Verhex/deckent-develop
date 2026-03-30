import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, openSync, closeSync, constants as fsConstants } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, normalize, sep } from 'node:path';
import { TaskStatus, AgentStatus } from '../core/types.js';
import type {
  Task,
  TaskPlan,
  TaskResult,
  Heartbeat,
  LockInfo,
  TaskScope,
  FeedbackLoop,
  VerifyTestsResult,
} from '../core/types.js';
import { TASKS_DIR, LOCKS_DIR } from '../core/constants.js';
import { ErrorRegistry } from '../core/errors.js';
import { redactSensitive } from '../cli/helpers/output.js';
import { detectFullStack, STACK_COMMANDS } from '../core/stack-detector.js';

// ─── Error Classes ──────────────────────────────────────────────────

export class TaskClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskClaimError';
  }
}

export class LockError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
  ) {
    super(message);
    this.name = 'LockError';
  }
}

export class ScopeViolationError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly scope: TaskScope,
  ) {
    super(message);
    this.name = 'ScopeViolationError';
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────

function taskFilePath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
}

function planFilePath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.plan`);
}

function heartbeatFilePath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
}

function resultFilePath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
}

function lockFilePathFor(projectRoot: string, filePath: string): string {
  const lockName = filePath.replace(/[/\\]/g, '__') + '.lock';
  return join(projectRoot, LOCKS_DIR, lockName);
}

function now(): string {
  return new Date().toISOString();
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// ─── Stack-Aware Verify Commands ────────────────────────────────────

/**
 * Get build and test commands for the current project stack.
 * Falls back to TypeScript commands if stack is unknown.
 */
export function getVerifyCommands(projectRoot: string): { build: string; test: string } {
  const stack = detectFullStack(projectRoot);
  const key = stack.language === 'java'
    ? `java_${stack.buildTool}`
    : stack.language === 'c' || stack.language === 'cpp'
    ? `c_${stack.buildTool}`
    : stack.language;
  const commands = STACK_COMMANDS[key];
  if (commands) {
    return { build: commands.build, test: commands.test };
  }
  // Unknown stack: use detected commands from full stack detection, or empty (skip verification)
  return { build: stack.commands.build || '', test: stack.commands.test || '' };
}

// ─── Progress Calculation ───────────────────────────────────────────

export function calculateProgress(heartbeat: { status: AgentStatus | string; filesChangedCount?: number }): number {
  // safe: status is AgentStatus | string — String() handles both enum values and plain strings
  const status = String(heartbeat.status);
  const filesChanged = heartbeat.filesChangedCount ?? 0;
  switch (status) {
    case 'EXECUTING': return 10;
    case 'CODING': return 30 + Math.min(filesChanged, 5) * 6;
    case 'VERIFYING': return 65;
    case 'TESTING': return 70;
    case 'DOCUMENTING': return 85;
    case 'DONE': return 100;
    default: return 0;
  }
}

// ─── Public API ─────────────────────────────────────────────────────

export function readTask(projectRoot: string, taskId: string): Task {
  const path = taskFilePath(projectRoot, taskId);
  try {
    const content = readFileSync(path, 'utf-8');
    // safe: task files written by createTask/updateTaskStatus with Task shape; SyntaxError handled below
    return JSON.parse(content) as Task;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw ErrorRegistry.createError('DECKENT_E060', { message: `Invalid JSON in task file: ${path}` });
    }
    throw ErrorRegistry.createError('DECKENT_E061', { message: `Task file not found: ${path}` });
  }
}

export function claimTask(
  projectRoot: string,
  taskId: string,
  workerId: string,
): Task {
  const task = readTask(projectRoot, taskId);

  if (task.status !== 'PENDING') {
    throw new TaskClaimError(
      `Cannot claim task ${taskId}: status is ${task.status}, expected PENDING`,
    );
  }

  if (task.assignedWorker) {
    throw new TaskClaimError(
      `Cannot claim task ${taskId}: already assigned to ${task.assignedWorker}`,
    );
  }

  task.status = TaskStatus.CLAIMED;
  task.assignedWorker = workerId;
  task.updatedAt = now();

  ensureDir(join(projectRoot, TASKS_DIR));
  writeFileSync(taskFilePath(projectRoot, taskId), JSON.stringify(task, null, 2), 'utf-8');

  return task;
}

export function writeTaskPlan(projectRoot: string, plan: TaskPlan): void {
  ensureDir(join(projectRoot, TASKS_DIR));
  const path = planFilePath(projectRoot, plan.taskId);
  writeFileSync(path, JSON.stringify(plan, null, 2), 'utf-8');
}

export function acquireLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
  taskId: string,
): LockInfo {
  ensureDir(join(projectRoot, LOCKS_DIR));
  const lockPath = lockFilePathFor(projectRoot, filePath);

  // Check existing lock
  if (existsSync(lockPath)) {
    try {
      // safe: lock files always written by acquireLock with LockInfo shape
      const existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
      if (existing.ownerWorkerId === workerId) {
        // Idempotent — same worker already holds the lock
        return existing;
      }
      throw new LockError(
        `File ${filePath} is locked by ${existing.ownerWorkerId}`,
        filePath,
      );
    } catch (err) {
      if (err instanceof LockError) throw err;
      // Corrupted lock file — overwrite
    }
  }

  const lockInfo: LockInfo = {
    filePath,
    ownerWorkerId: workerId,
    acquiredAt: now(),
    taskId,
  };

  // Atomic lock creation — O_EXCL ensures only one process can create
  const data = JSON.stringify(lockInfo, null, 2);
  try {
    const fd = openSync(lockPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL);
    writeFileSync(fd, data, 'utf-8');
    closeSync(fd);
  } catch (err: unknown) {
    // EEXIST = another worker created the lock between our check and create
    // safe: 'code' in err confirms property exists; NodeJS.ErrnoException extends Error with code
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST') {
      // Re-read to get the actual owner
      try {
        // safe: lock file written by acquireLock with LockInfo shape
        const actual = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
        throw new LockError(`File ${filePath} is locked by ${actual.ownerWorkerId}`, filePath);
      } catch (innerErr) {
        if (innerErr instanceof LockError) throw innerErr;
        throw new LockError(`File ${filePath} is locked by another worker`, filePath);
      }
    }
    throw err;
  }
  return lockInfo;
}

export function releaseLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
): void {
  const lockPath = lockFilePathFor(projectRoot, filePath);

  if (!existsSync(lockPath)) return; // No-op if no lock

  try {
    // safe: lock file written by acquireLock with LockInfo shape
    const existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
    if (existing.ownerWorkerId !== workerId) {
      throw new LockError(
        `Cannot release lock on ${filePath}: owned by ${existing.ownerWorkerId}, not ${workerId}`,
        filePath,
      );
    }
  } catch (err) {
    if (err instanceof LockError) throw err;
    // Corrupted lock — allow deletion
  }

  unlinkSync(lockPath);
}

export function checkLock(
  projectRoot: string,
  filePath: string,
): LockInfo | null {
  const lockPath = lockFilePathFor(projectRoot, filePath);

  if (!existsSync(lockPath)) return null;

  try {
    // safe: lock file written by acquireLock with LockInfo shape
    return JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
  } catch {
    return null;
  }
}

export function createHeartbeat(
  workerId: string,
  taskId: string,
  status: AgentStatus,
  action: string,
  file?: string,
  sequence?: number,
  filesChangedCount?: number,
  agentId?: string,
): Heartbeat {
  const count = filesChangedCount ?? 0;
  return {
    workerId,
    taskId,
    status,
    currentAction: action,
    currentFile: file,
    timestamp: now(),
    filesChangedCount: count,
    sequence: sequence ?? 0,
    progress: calculateProgress({ status, filesChangedCount: count }),
    agentId,
  };
}

export function writeHeartbeat(projectRoot: string, heartbeat: Heartbeat): void {
  ensureDir(join(projectRoot, TASKS_DIR));
  const path = heartbeatFilePath(projectRoot, heartbeat.taskId);
  writeFileSync(path, JSON.stringify(heartbeat, null, 2), 'utf-8');
}

export function writeResult(projectRoot: string, result: TaskResult): void {
  ensureDir(join(projectRoot, TASKS_DIR));
  const path = resultFilePath(projectRoot, result.taskId);
  writeFileSync(path, JSON.stringify(result, null, 2), 'utf-8');

  // Update task status based on self-assessment
  const newStatus: TaskStatus =
    result.selfAssessment === 'NO_GO'
      ? TaskStatus.NO_GO
      : TaskStatus.DONE;

  updateTaskStatus(projectRoot, result.taskId, newStatus);

  // Write final heartbeat with DONE status so auditor does not flag as stale
  finalizeHeartbeat(projectRoot, result.taskId);
}

/**
 * Write a final DONE heartbeat for a completed task.
 * Updates the existing heartbeat file with status DONE and a fresh timestamp,
 * preventing the auditor from flagging it as stale after task completion.
 */
export function finalizeHeartbeat(projectRoot: string, taskId: string): void {
  const hbPath = heartbeatFilePath(projectRoot, taskId);
  let workerId = `worker-${taskId}`;

  // Read existing heartbeat to preserve workerId
  if (existsSync(hbPath)) {
    try {
      const existing = JSON.parse(readFileSync(hbPath, 'utf-8')) as Heartbeat;
      if (existing.workerId) {
        workerId = existing.workerId;
      }
    } catch {
      // Corrupted heartbeat — use default workerId
    }
  }

  const hb = createHeartbeat(
    workerId,
    taskId,
    AgentStatus.DONE,
    'Task completed',
    undefined,
    undefined,
    undefined,
  );
  writeHeartbeat(projectRoot, hb);
}

export function updateTaskStatus(
  projectRoot: string,
  taskId: string,
  status: TaskStatus,
): Task {
  const task = readTask(projectRoot, taskId);
  task.status = status;
  task.updatedAt = now();

  ensureDir(join(projectRoot, TASKS_DIR));
  writeFileSync(taskFilePath(projectRoot, taskId), JSON.stringify(task, null, 2), 'utf-8');

  return task;
}

export function releaseAllLocks(
  projectRoot: string,
  workerId: string,
): number {
  const locksDir = join(projectRoot, LOCKS_DIR);

  if (!existsSync(locksDir)) return 0;

  const files = readdirSync(locksDir).filter((f) => f.endsWith('.lock'));
  let released = 0;

  for (const file of files) {
    const lockPath = join(locksDir, file);
    try {
      // safe: lock file written by acquireLock with LockInfo shape
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
      if (lock.ownerWorkerId === workerId) {
        unlinkSync(lockPath);
        released++;
      }
    } catch {
      // Skip corrupted lock files
    }
  }

  return released;
}

export function readWorkerLog(projectRoot: string, taskId: string): string | null {
  const logPath = join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
  if (!existsSync(logPath)) return null;
  const raw = readFileSync(logPath, 'utf-8');
  return redactSensitive(raw);
}

// ─── Test Verify Loop ───────────────────────────────────────────────

/** Max retry attempts for the test verify loop */
export const MAX_TEST_RETRIES = 3;

/**
 * Parse vitest output to extract failing test names and summary.
 * Handles both verbose and default vitest output formats.
 */
export function parseVitestOutput(output: string): { failedTests: string[]; summary: string } {
  const failedTests: string[] = [];

  // Match vitest FAIL lines: "FAIL tests/foo.test.ts > suite > test name"
  // or "× test name" patterns
  const failLineRegex = /^\s*(?:FAIL|×|✕)\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = failLineRegex.exec(output)) !== null) {
    const testName = (match[1] ?? '').trim();
    if (testName && !failedTests.includes(testName)) {
      failedTests.push(testName);
    }
  }

  // Also match "FAIL" file-level markers: "FAIL  tests/agents/worker.test.ts"
  const failFileRegex = /^\s*FAIL\s+([\w/.\\-]+\.test\.\w+)/gm;
  while ((match = failFileRegex.exec(output)) !== null) {
    const fileName = (match[1] ?? '').trim();
    if (fileName && !failedTests.includes(fileName)) {
      failedTests.push(fileName);
    }
  }

  // Extract summary line: "Tests  3 failed | 12 passed (15)"
  const summaryMatch = output.match(/Tests?\s+.*(?:failed|passed).*$/m);
  const summary = summaryMatch ? summaryMatch[0].trim() : '';

  return { failedTests, summary };
}

/**
 * Run test verification with optional scope filtering and return structured results.
 * Uses stack-detected test command (e.g. `npx vitest run` for TypeScript,
 * `pytest` for Python, `go test ./...` for Go). If test command is empty,
 * skips verification and returns success.
 */
export function verifyTests(
  projectRoot: string,
  scope?: string[],
  taskScope?: TaskScope,
): VerifyTestsResult {
  // Skip verification for doc-only tasks
  if (isDocOnlyScope(taskScope)) {
    return { success: true, failedTests: [], output: '' };
  }

  const { test: testCmd } = getVerifyCommands(projectRoot);

  // Empty test command means no test step for this stack
  if (!testCmd) {
    return { success: true, failedTests: [], output: '' };
  }

  const scopeArgs = scope && scope.length > 0 ? ` ${scope.join(' ')}` : '';
  // For vitest, add --reporter=verbose; for other test runners, use as-is
  const command = testCmd.includes('vitest')
    ? `${testCmd} --reporter=verbose${scopeArgs}`
    : `${testCmd}${scopeArgs}`;

  try {
    const stdout = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      success: true,
      failedTests: [],
      output: stdout,
    };
  } catch (err: unknown) {
    // execSync throws on non-zero exit code — vitest returns 1 on test failures
    const output =
      err instanceof Error && 'stdout' in err
        ? String((err as { stdout: unknown }).stdout)
        : err instanceof Error && 'stderr' in err
          ? String((err as { stderr: unknown }).stderr)
          : err instanceof Error
            ? err.message
            : String(err);

    const { failedTests } = parseVitestOutput(output);

    return {
      success: false,
      failedTests,
      output,
    };
  }
}

/**
 * Run the full test verify loop: execute vitest, retry on failure up to MAX_TEST_RETRIES.
 * Returns the final result and the number of attempts made.
 * The `runFix` callback is invoked between retries to allow the caller to fix failing tests.
 */
export function runTestVerifyLoop(
  projectRoot: string,
  scope?: string[],
  runFix?: (failedTests: string[], output: string) => void,
  taskScope?: TaskScope,
): { result: VerifyTestsResult; attempts: number; failuresFixed: number } {
  // Skip verification for doc-only tasks
  if (isDocOnlyScope(taskScope)) {
    return { result: { success: true, failedTests: [], output: '' }, attempts: 0, failuresFixed: 0 };
  }

  let attempts = 0;
  let failuresFixed = 0;
  let lastResult: VerifyTestsResult = { success: false, failedTests: [], output: '' };

  for (let i = 0; i < MAX_TEST_RETRIES; i++) {
    attempts++;
    lastResult = verifyTests(projectRoot, scope, taskScope);

    if (lastResult.success) {
      return { result: lastResult, attempts, failuresFixed };
    }

    // If not the last attempt, invoke fix callback
    if (i < MAX_TEST_RETRIES - 1 && runFix) {
      const prevFailCount = lastResult.failedTests.length;
      runFix(lastResult.failedTests, lastResult.output);
      failuresFixed += prevFailCount;
    }
  }

  return { result: lastResult, attempts, failuresFixed };
}

// ─── Compilation Verify Loop ─────────────────────────────────────────

// ─── Doc-Only Task Detection ─────────────────────────────────────────

/** Source code directory prefixes — mirrors isDocTask() logic in result-evaluator.ts */
const DOC_SKIP_SOURCE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];
const DOC_SKIP_SOURCE_EXACT = ['src', 'tests', 'lib'];

/**
 * Returns true if the scope contains only non-source-code directories.
 * When true, tsc and vitest verification should be skipped.
 * Scope with only docs/, *.md, or other non-source paths qualifies.
 * Empty directories array returns false (no scope = no skip).
 */
export function isDocOnlyScope(scope?: TaskScope): boolean {
  const dirs = scope?.directories ?? [];
  if (dirs.length === 0) return false;
  return dirs.every(d => {
    if (DOC_SKIP_SOURCE_EXACT.includes(d)) return false;
    return !DOC_SKIP_SOURCE_PREFIXES.some(p => d.startsWith(p));
  });
}

/** Max retry attempts for the compilation verify loop */
export const MAX_COMPILATION_RETRIES = 3;

export interface CompilationResult {
  success: boolean;
  errors: string[];
}

export interface CompilationLoopResult {
  success: boolean;
  attempts: number;
  errors: string[];
}

/**
 * Parse tsc error output into individual error strings.
 * Extracts lines matching TypeScript error patterns (e.g., file.ts(line,col): error TS1234).
 * Falls back to first 20 non-empty lines if no TS error patterns found.
 */
export function parseCompilationErrors(err: unknown): string[] {
  let output = '';
  if (err && typeof err === 'object') {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    output = execErr.stdout || execErr.stderr || execErr.message || '';
  } else if (typeof err === 'string') {
    output = err;
  }
  if (!output) return ['Unknown compilation error'];

  const lines = output.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return ['Unknown compilation error'];

  // Filter to lines that look like TS errors (file.ts(line,col): error TS...)
  const errorLines = lines.filter((line) =>
    /\(\d+,\d+\):\s*error\s+TS\d+/.test(line) || /error\s+TS\d+/.test(line),
  );

  return errorLines.length > 0 ? errorLines : lines.slice(0, 20);
}

/**
 * Run build verification in the given project root and return success/errors.
 * Uses stack-detected build command (e.g. `npx tsc --noEmit` for TypeScript,
 * `go build ./...` for Go). If build command is empty, skips verification.
 * This is a single-shot check — use `runCompilationLoop` for retry logic.
 */
export function verifyCompilation(projectRoot: string, taskScope?: TaskScope): CompilationResult {
  // Skip verification for doc-only tasks
  if (isDocOnlyScope(taskScope)) {
    return { success: true, errors: [] };
  }

  const { build } = getVerifyCommands(projectRoot);

  // Empty build command means no compilation step (e.g. some C projects with no lint)
  if (!build) {
    return { success: true, errors: [] };
  }

  // For TypeScript, add --noEmit flag to avoid generating output files
  const command = build === 'npx tsc' ? 'npx tsc --noEmit' : build;

  try {
    execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    return { success: true, errors: [] };
  } catch (err: unknown) {
    const errors = parseCompilationErrors(err);
    return { success: false, errors };
  }
}

/**
 * Run compilation verification with retry loop.
 * Updates heartbeat on each attempt with VERIFYING status.
 * Returns the loop result including total attempts and remaining errors.
 *
 * @param projectRoot - Project root directory
 * @param workerId - Worker ID for heartbeat updates
 * @param taskId - Task ID for heartbeat updates
 * @param maxRetries - Maximum number of retry attempts (default: MAX_COMPILATION_RETRIES)
 * @param onAttempt - Optional callback invoked after each failed attempt (for logging/fixing)
 */
export function runCompilationLoop(
  projectRoot: string,
  workerId: string,
  taskId: string,
  maxRetries: number = MAX_COMPILATION_RETRIES,
  onAttempt?: (attempt: number, maxRetries: number, errors: string[]) => void,
  taskScope?: TaskScope,
): CompilationLoopResult {
  // Skip verification for doc-only tasks
  if (isDocOnlyScope(taskScope)) {
    return { success: true, attempts: 0, errors: [] };
  }

  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Update heartbeat to VERIFYING
    const hb = createHeartbeat(
      workerId,
      taskId,
      AgentStatus.VERIFYING,
      `Type checking (attempt ${attempt}/${maxRetries})`,
      undefined,
      undefined,
      undefined,
    );
    writeHeartbeat(projectRoot, hb);

    const result = verifyCompilation(projectRoot);

    if (result.success) {
      return { success: true, attempts: attempt, errors: [] };
    }

    lastErrors = result.errors;

    // Notify caller of failed attempt (for logging/fixing)
    if (onAttempt) {
      onAttempt(attempt, maxRetries, result.errors);
    }
  }

  return { success: false, attempts: maxRetries, errors: lastErrors };
}

export function isWithinScope(filePath: string, scope: TaskScope): boolean {
  const normalizedFile = normalize(filePath).split(sep).join('/');

  for (const dir of scope.directories) {
    const normalizedDir = normalize(dir).split(sep).join('/');
    const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : `${normalizedDir}/`;
    if (normalizedFile.startsWith(dirWithSlash) || normalizedFile === normalizedDir) {
      return true;
    }
  }

  for (const f of scope.filesWrite) {
    const normalizedWrite = normalize(f).split(sep).join('/');
    if (normalizedFile === normalizedWrite) {
      return true;
    }
  }

  return false;
}

// ─── Worker Log Formatting ──────────────────────────────────────────

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

// ─── Feedback Loop Helpers ──────────────────────────────────────────

/** Create a fresh FeedbackLoop tracker with zero counts */
export function createFeedbackLoop(): FeedbackLoop {
  return {
    tscAttempts: 0,
    testAttempts: 0,
    tscErrorsFixed: 0,
    testFailuresFixed: 0,
    totalRetryTimeMs: 0,
  };
}

/**
 * Record a tsc verification attempt.
 * @param loop - The feedback loop tracker to update (mutated in place)
 * @param success - Whether tsc passed on this attempt
 * @param durationMs - Time spent on this attempt
 */
export function recordTscAttempt(loop: FeedbackLoop, success: boolean, durationMs: number): void {
  loop.tscAttempts += 1;
  loop.totalRetryTimeMs += durationMs;
  if (success && loop.tscAttempts > 1) {
    loop.tscErrorsFixed += 1;
  }
}

/**
 * Record a test verification attempt.
 * @param loop - The feedback loop tracker to update (mutated in place)
 * @param success - Whether tests passed on this attempt
 * @param durationMs - Time spent on this attempt
 */
export function recordTestAttempt(loop: FeedbackLoop, success: boolean, durationMs: number): void {
  loop.testAttempts += 1;
  loop.totalRetryTimeMs += durationMs;
  if (success && loop.testAttempts > 1) {
    loop.testFailuresFixed += 1;
  }
}

/**
 * Calculate self-healing rate from an array of task results.
 * Self-healing rate = percentage of tasks that needed retries AND succeeded.
 * @returns Rate between 0 and 100 (percentage), or 0 if no tasks needed retries
 */
export function calculateSelfHealingRate(results: TaskResult[]): number {
  const withFeedback = results.filter(r => r.feedbackLoop != null);
  if (withFeedback.length === 0) return 0;

  const neededRetries = withFeedback.filter(r => {
    const fl = r.feedbackLoop;
    if (!fl) return false;
    return fl.tscAttempts > 1 || fl.testAttempts > 1;
  });

  if (neededRetries.length === 0) return 0;

  const selfHealed = neededRetries.filter(r => r.selfAssessment !== 'NO_GO');
  return Math.round((selfHealed.length / neededRetries.length) * 100);
}

/**
 * Aggregate feedback loop stats across multiple results.
 */
export function aggregateFeedbackLoops(results: TaskResult[]): {
  totalTscAttempts: number;
  totalTestAttempts: number;
  totalTscErrorsFixed: number;
  totalTestFailuresFixed: number;
  totalRetryTimeMs: number;
  tasksWithRetries: number;
  tasksFirstPassSuccess: number;
} {
  let totalTscAttempts = 0;
  let totalTestAttempts = 0;
  let totalTscErrorsFixed = 0;
  let totalTestFailuresFixed = 0;
  let totalRetryTimeMs = 0;
  let tasksWithRetries = 0;
  let tasksFirstPassSuccess = 0;

  for (const r of results) {
    const fl = r.feedbackLoop;
    if (!fl) continue;

    totalTscAttempts += fl.tscAttempts;
    totalTestAttempts += fl.testAttempts;
    totalTscErrorsFixed += fl.tscErrorsFixed;
    totalTestFailuresFixed += fl.testFailuresFixed;
    totalRetryTimeMs += fl.totalRetryTimeMs;

    if (fl.tscAttempts > 1 || fl.testAttempts > 1) {
      tasksWithRetries += 1;
    } else {
      tasksFirstPassSuccess += 1;
    }
  }

  return {
    totalTscAttempts,
    totalTestAttempts,
    totalTscErrorsFixed,
    totalTestFailuresFixed,
    totalRetryTimeMs,
    tasksWithRetries,
    tasksFirstPassSuccess,
  };
}
