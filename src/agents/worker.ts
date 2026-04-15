import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync, mkdirSync, realpathSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { promisify } from 'node:util';
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
import { TASKS_DIR } from '../core/constants.js';
import { ErrorRegistry } from '../core/errors.js';
import { redactSensitive } from '../cli/helpers/output.js';
import { detectFullStack, STACK_COMMANDS } from '../core/stack-detector.js';
import { checkAuthority, emitAuthorityViolation } from '../orchestra/authority-enforcer.js';
import { writeEvent, getCurrentSprintId, CHANNELS } from '../orchestra/event-stream.js';

// ─── Lock Operations (delegated to core/file-lock.ts) ──────────────
// Sprint 138: Lock logic migrated to core for plan-time collision detection.
// Re-exported here for backward compatibility.
import {
  acquireLock as _coreLock,
  releaseLock as _coreRelease,
  checkLock as _coreCheck,
  releaseAllLocks as _coreReleaseAll,
} from '../core/file-lock.js';

export { LockError } from '../core/file-lock.js';

// ─── Error Classes ──────────────────────────────────────────────────

export class TaskClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskClaimError';
  }
}

// LockError re-exported from core/file-lock.ts above

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

/**
 * Acquire a file lock — delegates to core/file-lock.ts.
 * @deprecated Import from '../core/file-lock.js' instead.
 */
export function acquireLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
  taskId: string,
): LockInfo {
  return _coreLock(projectRoot, filePath, workerId, taskId);
}

/**
 * Release a file lock — delegates to core/file-lock.ts.
 * @deprecated Import from '../core/file-lock.js' instead.
 */
export function releaseLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
): void {
  return _coreRelease(projectRoot, filePath, workerId);
}

/**
 * Check if a file is locked — delegates to core/file-lock.ts.
 * @deprecated Import from '../core/file-lock.js' instead.
 */
export function checkLock(
  projectRoot: string,
  filePath: string,
): LockInfo | null {
  return _coreCheck(projectRoot, filePath);
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
  backend?: 'docker' | 'tmux' | 'subprocess',
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
    backend,
  };
}

export function writeHeartbeat(projectRoot: string, heartbeat: Heartbeat, sprintId?: string): void {
  ensureDir(join(projectRoot, TASKS_DIR));
  const path = heartbeatFilePath(projectRoot, heartbeat.taskId);
  writeFileSync(path, JSON.stringify(heartbeat, null, 2), 'utf-8');

  // ADR-035: Emit WORKER→BRAIN:HEARTBEAT event to event stream (fail-safe)
  const sid = sprintId ?? getCurrentSprintId(projectRoot);
  if (sid) {
    writeEvent(projectRoot, sid, 'worker', 'brain', CHANNELS.HEARTBEAT, {
      workerId: heartbeat.workerId,
      taskId: heartbeat.taskId,
      sequence: heartbeat.sequence,
      phase: heartbeat.status,
      state: heartbeat.currentAction,
    });
  }
}

/**
 * Atomically write data to a file with fsync guarantee.
 *
 * Uses the temp-file + fsync + rename pattern:
 * 1. Write to `<path>.tmp` (crash-safe: original untouched)
 * 2. fsyncSync forces OS buffer to disk (survives SIGKILL after this point)
 * 3. renameSync atomically replaces old file (POSIX atomic rename)
 *
 * This eliminates the 5-sprint Docker exit-137 bug where writeFileSync data
 * stayed in OS buffer cache and was lost when SIGKILL arrived after SIGTERM
 * grace period expired.
 */
export function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, data, 'utf-8');
  // Force OS buffer → disk. After fsyncSync returns, data survives power loss / SIGKILL.
  const fd = openSync(tmpPath, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // POSIX atomic rename: either old file or new file exists, never partial.
  renameSync(tmpPath, filePath);
}

/**
 * Write a task result to disk and update task status.
 *
 * Uses atomic write (temp + fsync + rename) to guarantee the .result file
 * survives Docker SIGKILL (exit 137) after SIGTERM grace period expires.
 *
 * **Verify Loop Gate:** Callers MUST run `enforceVerifyLoop()` before calling this function.
 * If `enforceVerifyLoop` returns `{ok: false}`, the caller should set `result.selfAssessment = 'NO_GO'`
 * with the failure reason in `result.notes` before writing the result.
 */
export function writeResult(projectRoot: string, result: TaskResult, sprintId?: string): void {
  ensureDir(join(projectRoot, TASKS_DIR));

  // Soft warning: check if .plan file was written before result
  const planPath = planFilePath(projectRoot, result.taskId);
  if (!existsSync(planPath)) {
    console.warn(`[deckent] WARNING: task ${result.taskId} — .plan file missing. Workers should write .tasks/task-{id}.plan before coding.`);
    (result as TaskResult & { planWarning?: string }).planWarning = 'missing';
  }

  const path = resultFilePath(projectRoot, result.taskId);
  // tokenUsage is included in result when available — serialized automatically via JSON.stringify
  // Atomic write: temp file → fsync → rename (crash-safe, survives SIGKILL)
  atomicWriteFileSync(path, JSON.stringify(result, null, 2));

  // Update task status based on self-assessment
  const newStatus: TaskStatus =
    result.selfAssessment === 'NO_GO'
      ? TaskStatus.NO_GO
      : TaskStatus.DONE;

  updateTaskStatus(projectRoot, result.taskId, newStatus);

  // Write final heartbeat with DONE status so auditor does not flag as stale
  finalizeHeartbeat(projectRoot, result.taskId);

  // ADR-035: Emit WORKER→BRAIN:RESULT event to event stream (fail-safe)
  const sid = sprintId ?? getCurrentSprintId(projectRoot);
  if (sid) {
    writeEvent(projectRoot, sid, 'worker', 'brain', CHANNELS.RESULT, {
      taskId: result.taskId,
      selfAssessment: result.selfAssessment,
      filesChanged: result.filesChanged,
      rubricScores: result.rubricScores,
    });

    // ADR-035: Emit WORKER→AUDITOR:CODE_VERIFY_REQUEST — request independent verification
    writeEvent(projectRoot, sid, 'worker', 'auditor', CHANNELS.CODE_VERIFY_REQUEST, {
      taskId: result.taskId,
      filesChanged: result.filesChanged,
      evidence: result.notes ?? '',
    });
  }
}

/**
 * Remove the heartbeat file for a completed task.
 * Called by writeResult to perform task-level heartbeat cleanup, eliminating
 * false-positive stale heartbeat alerts from the auditor after task completion.
 *
 * @param projectRoot - Project root directory
 * @param taskId - Task ID whose .hb file should be removed
 * @param cleanupDelayMs - Milliseconds to wait before deleting (0 = immediate).
 *   When > 0, deletion is scheduled via setTimeout. Use 0 for synchronous cleanup.
 */
export function finalizeHeartbeat(projectRoot: string, taskId: string, cleanupDelayMs = 0): void {
  const hbPath = heartbeatFilePath(projectRoot, taskId);

  const doCleanup = (): void => {
    if (existsSync(hbPath)) {
      try {
        unlinkSync(hbPath);
      } catch {
        // File may already be removed by auditor cleanup or another process — non-fatal
      }
    }
  };

  if (cleanupDelayMs <= 0) {
    doCleanup();
  } else {
    setTimeout(doCleanup, cleanupDelayMs);
  }
}

/**
 * @deprecated Use finalizeHeartbeat (now deletes .hb on task completion).
 * Kept for backward compatibility — delegates to finalizeHeartbeat.
 */
export function writeFinishedHeartbeat(projectRoot: string, taskId: string): void {
  finalizeHeartbeat(projectRoot, taskId, 0);
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

/**
 * Release all locks owned by a specific worker — delegates to core/file-lock.ts.
 * @deprecated Import from '../core/file-lock.js' instead.
 */
export function releaseAllLocks(
  projectRoot: string,
  workerId: string,
): number {
  return _coreReleaseAll(projectRoot, workerId);
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

export function isWithinScope(filePath: string, scope: TaskScope, projectRoot?: string): boolean {
  const normalizedFile = normalize(filePath).split(sep).join('/');

  // When projectRoot is provided, resolve symlinks to prevent scope bypass (ADR-034)
  let resolvedFile = normalizedFile;
  if (projectRoot) {
    const absolutePath = join(projectRoot, normalizedFile);
    try {
      const realPath = realpathSync(absolutePath);
      const projectRealPath = realpathSync(projectRoot);
      const projectPrefix = projectRealPath + '/';
      if (realPath.startsWith(projectPrefix)) {
        resolvedFile = realPath.slice(projectPrefix.length).split(sep).join('/');
      } else if (realPath === projectRealPath) {
        resolvedFile = normalizedFile;
      } else {
        // Resolved path is outside project root — scope violation
        return false;
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err) {
        const code = (err as NodeJS.ErrnoException).code;
        // ELOOP = circular symlink — deny access
        if (code === 'ELOOP') return false;
        // ENOENT = file doesn't exist yet (new file creation) — fall through to normal check
      }
    }
  }

  for (const dir of scope.directories) {
    const normalizedDir = normalize(dir).split(sep).join('/');
    const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : `${normalizedDir}/`;
    if (resolvedFile.startsWith(dirWithSlash) || resolvedFile === normalizedDir) {
      return true;
    }
  }

  for (const f of scope.filesWrite) {
    const normalizedWrite = normalize(f).split(sep).join('/');
    if (resolvedFile === normalizedWrite) {
      return true;
    }
  }

  return false;
}

// ─── Authority Check (Sprint 139 Task 035, ADR-037) ────────────────

/**
 * Check whether a worker file write is permitted by the authority matrix.
 * Sprint 139: Soft enforcement — logs warning but allows the write to proceed.
 *
 * @param filePath - Relative file path being written
 * @param scope - Task scope from task JSON
 * @param projectRoot - Project root directory
 * @param taskId - Worker's task ID
 * @param sprintId - Current sprint ID (for event stream)
 * @param isSelfModifyingSprint - ADR-038 exception flag
 * @returns true if permitted (always true in soft mode), false would block in hard mode
 */
export function checkWorkerAuthority(
  filePath: string,
  scope: TaskScope,
  projectRoot: string,
  taskId: string,
  sprintId?: string,
  isSelfModifyingSprint = false,
): boolean {
  const result = checkAuthority({
    role: 'worker',
    action: 'write',
    target: filePath,
    taskId,
    scopeDirectories: scope.directories,
    scopeFilesWrite: scope.filesWrite,
    isSelfModifyingSprint,
  });

  if (!result.allowed) {
    console.warn(`[deckent] [ADR-037 soft] Worker ${taskId}: authority violation writing ${filePath} — ${result.reason}`);

    // Emit to event stream if sprint context is available
    if (sprintId) {
      emitAuthorityViolation(projectRoot, sprintId, {
        role: 'worker',
        action: 'write',
        target: filePath,
        taskId,
        scopeDirectories: scope.directories,
        scopeFilesWrite: scope.filesWrite,
        isSelfModifyingSprint,
      }, result);
    }

    // Sprint 139: Soft enforcement — allow the write to proceed
    return true;
  }

  return true;
}

// ─── Worker Event Emitters (ADR-035) ───────────────────────────────

/**
 * Emit a WORKER→BRAIN:QUESTION event to the event stream.
 * Use when the worker is blocked and needs Brain's guidance.
 *
 * @param projectRoot - Project root directory
 * @param taskId - Worker's current task ID
 * @param question - The question or blocker description
 * @param context - Optional additional context about the blocker
 * @param sprintId - Optional sprint ID (auto-detected from sprint-state.json if omitted)
 */
export function emitWorkerQuestion(
  projectRoot: string,
  taskId: string,
  question: string,
  context?: string,
  sprintId?: string,
): void {
  const sid = sprintId ?? getCurrentSprintId(projectRoot);
  if (!sid) return;
  writeEvent(projectRoot, sid, 'worker', 'brain', CHANNELS.QUESTION, {
    taskId,
    question,
    context: context ?? '',
  });
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

// ─── Graceful Shutdown ─────────────────────────────────────────────

/** Self-assessment values that indicate a successfully completed task */
const DONE_SET = new Set(['DONE', 'GO_WITH_TECH_DEBT']);

/**
 * Ensure a .result file is fsync'd to disk.
 *
 * If the .result file exists but was written via plain writeFileSync (pre-Sprint 139
 * code path, or shell EXIT trap fallback), its data may still be in OS buffer cache.
 * This function forces it to disk so it survives a subsequent SIGKILL.
 *
 * @returns true if fsync succeeded, false if file missing or error
 */
export function fsyncResultFile(projectRoot: string, taskId: string): boolean {
  const resPath = resultFilePath(projectRoot, taskId);
  if (!existsSync(resPath)) return false;
  try {
    const fd = openSync(resPath, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Finalize heartbeat on graceful shutdown (SIGTERM).
 *
 * When a Docker container receives SIGTERM (via `docker stop`), this function:
 * 1. Fsync's the .result file to disk (survives subsequent SIGKILL)
 * 2. Checks if the worker wrote a successful .result — if so, overwrites HB as DONE
 * 3. Uses atomicWriteFileSync for HB to guarantee disk persistence
 *
 * This is the core fix for the 5-sprint Docker exit-137 bug (Sprint 134-138).
 * Previously, .result data stayed in OS buffer cache and was lost when SIGKILL
 * arrived after the SIGTERM grace period expired.
 *
 * @param projectRoot - Project root directory
 * @param taskId - Task ID whose heartbeat should be finalized
 * @returns true if heartbeat was finalized as DONE, false otherwise
 */
export function finalizeHeartbeatOnShutdown(projectRoot: string, taskId: string): boolean {
  const resPath = resultFilePath(projectRoot, taskId);

  // Step 1: Fsync .result to disk even if we can't parse it
  // This ensures that whatever the worker wrote survives SIGKILL
  fsyncResultFile(projectRoot, taskId);

  // No result file → leave HB untouched (honest FAILED)
  if (!existsSync(resPath)) return false;

  try {
    const raw = readFileSync(resPath, 'utf-8');
    // safe: result files written by writeResult with TaskResult shape; SyntaxError handled below
    const result = JSON.parse(raw) as { selfAssessment?: string };

    if (!result.selfAssessment || !DONE_SET.has(result.selfAssessment)) {
      // Result exists but is NO_GO or unknown → leave HB untouched
      return false;
    }

    // Result is DONE or GO_WITH_TECH_DEBT → finalize HB as DONE
    // Use atomicWriteFileSync to guarantee HB survives SIGKILL too
    const hbPath = heartbeatFilePath(projectRoot, taskId);
    const hbData = JSON.stringify({
      workerId: `docker-${taskId}`,
      taskId,
      status: 'DONE',
      exitCode: 0,
      sequence: 99,
      timestamp: new Date().toISOString(),
      backend: 'docker',
      note: 'Finalized on SIGTERM — result fsynced to disk',
    }, null, 2);
    atomicWriteFileSync(hbPath, hbData);

    return true;
  } catch {
    // JSON parse error or fs error → fail-safe: leave HB untouched
    return false;
  }
}

// ─── SIGTERM Handler Registration ──────────────────────────────────

/**
 * Register a SIGTERM handler that finalizes heartbeat and flushes result on graceful shutdown.
 * Called at worker startup when running inside a Docker container.
 * Reads DECKENT_TASK_ID and DECKENT_PROJECT_ROOT from environment variables.
 *
 * Sprint 139 fix: the handler now fsync's the .result file before exiting,
 * ensuring data survives the SIGKILL that Docker sends after the grace period.
 */
function registerSigtermHandler(): void {
  const taskId = process.env['DECKENT_TASK_ID'];
  const projectRoot = process.env['DECKENT_PROJECT_ROOT'];

  if (!taskId || !projectRoot) return; // Not running as a Deckent worker

  process.on('SIGTERM', () => {
    // Fsync .result to disk first — this is the critical fix.
    // Even if finalizeHeartbeatOnShutdown fails, the .result is safe.
    fsyncResultFile(projectRoot, taskId);
    finalizeHeartbeatOnShutdown(projectRoot, taskId);
    process.exit(0);
  });
}

// Auto-register when this module is loaded in a Docker worker context
registerSigtermHandler();

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

// ─── Enforce Verify Loop (Async Gate) ──────────────────────────────

/** Verify loop gate timeout per command (ms) */
const VERIFY_LOOP_TIMEOUT_MS = 300_000;

/** Max retry attempts for enforceVerifyLoop */
const VERIFY_LOOP_MAX_ATTEMPTS = 3;

/** Result of the enforce verify loop gate */
export interface VerifyLoopResult {
  ok: boolean;
  reason?: string;
  attempts: number;
}

/**
 * Enforce a mandatory verify loop gate before writing a task result.
 *
 * Runs `tsc --noEmit` and `npx vitest run <scope>` up to 3 times.
 * If both pass on any attempt, writes a `.verify-ran` marker file and returns ok=true.
 * If all 3 attempts fail, returns ok=false with the last failure reason.
 * On timeout (300s per command), returns ok=false immediately (infrastructure failure, no retry).
 *
 * @param projectRoot - Project root directory
 * @param taskId - Task ID for marker file
 * @param scope - Test scope directories (e.g. ['src/agents/', 'src/orchestra/'])
 * @returns Promise resolving to VerifyLoopResult
 */
export async function enforceVerifyLoop(
  projectRoot: string,
  taskId: string,
  scope: string | string[],
): Promise<VerifyLoopResult> {
  // Lazy import to avoid breaking mocks that don't define exec
  const { exec: execFn } = await import('node:child_process');
  const execAsync = promisify(execFn);
  const scopeArg = Array.isArray(scope) ? scope.join(' ') : scope;
  let lastReason = '';

  for (let attempt = 1; attempt <= VERIFY_LOOP_MAX_ATTEMPTS; attempt++) {
    // Step 1: tsc --noEmit
    try {
      await execAsync('npx tsc --noEmit', {
        cwd: projectRoot,
        timeout: VERIFY_LOOP_TIMEOUT_MS,
      });
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && 'killed' in err && (err as { killed: boolean }).killed;
      if (isTimeout) {
        return { ok: false, reason: 'tsc --noEmit timeout (infrastructure failure)', attempts: attempt };
      }
      const stderr = err instanceof Error && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
      const stdout = err instanceof Error && 'stdout' in err ? String((err as { stdout: unknown }).stdout) : '';
      lastReason = `tsc --noEmit failed (attempt ${attempt}/${VERIFY_LOOP_MAX_ATTEMPTS}): ${(stderr || stdout).slice(0, 500)}`;
      continue;
    }

    // Step 2: vitest run <scope>
    const vitestCmd = scopeArg ? `npx vitest run ${scopeArg}` : 'npx vitest run';
    try {
      await execAsync(vitestCmd, {
        cwd: projectRoot,
        timeout: VERIFY_LOOP_TIMEOUT_MS,
      });
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && 'killed' in err && (err as { killed: boolean }).killed;
      if (isTimeout) {
        return { ok: false, reason: `vitest run timeout (infrastructure failure)`, attempts: attempt };
      }
      const stderr = err instanceof Error && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : '';
      const stdout = err instanceof Error && 'stdout' in err ? String((err as { stdout: unknown }).stdout) : '';
      lastReason = `vitest run failed (attempt ${attempt}/${VERIFY_LOOP_MAX_ATTEMPTS}): ${(stderr || stdout).slice(0, 500)}`;
      continue;
    }

    // Both passed — write marker and return success
    const markerPath = join(projectRoot, TASKS_DIR, `task-${taskId}.verify-ran`);
    ensureDir(join(projectRoot, TASKS_DIR));
    writeFileSync(markerPath, JSON.stringify({
      taskId,
      timestamp: new Date().toISOString(),
      attempts: attempt,
      tsc: 'PASS',
      vitest: 'PASS',
    }, null, 2), 'utf-8');

    return { ok: true, attempts: attempt };
  }

  return { ok: false, reason: lastReason, attempts: VERIFY_LOOP_MAX_ATTEMPTS };
}

// ─── Verify Delta (Honest Assessment Calibration) ──────────────────

/** The minimum completion ratio (0–1) required to claim DONE status */
export const VERIFY_DELTA_DONE_THRESHOLD = 0.8;

/** Completion ratio below this threshold triggers automatic NO_GO downgrade */
export const VERIFY_DELTA_NO_GO_THRESHOLD = 0.5;

/** Snapshot written at task start to record baseline state */
export interface VerifyDeltaBaseline {
  taskId: string;
  timestamp: string;
  filesChangedBaseline: number;
  testFailBaseline: number;
}

/** Computed delta between baseline and end state */
export interface VerifyDeltaResult {
  taskId: string;
  baseline: VerifyDeltaBaseline;
  endState: {
    filesChangedActual: number;
    testFailActual: number;
    timestamp: string;
  };
  /** 0–1 ratio of completion based on files-changed delta vs expected */
  completionRatio: number;
  /** Recommended self-assessment derived from completionRatio */
  recommendedAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  reason: string;
}

/**
 * Write a verify-delta baseline snapshot at task start.
 * Records current filesChanged count and test failure count for comparison at end.
 *
 * @param projectRoot - Project root directory
 * @param taskId - Task ID for delta file naming
 * @param filesChangedCount - Current count of changed files (start of task)
 * @param testFailCount - Current count of failing tests (start of task, 0 if unknown)
 */
export function writeVerifyDeltaBaseline(
  projectRoot: string,
  taskId: string,
  filesChangedCount: number,
  testFailCount = 0,
): VerifyDeltaBaseline {
  const baseline: VerifyDeltaBaseline = {
    taskId,
    timestamp: new Date().toISOString(),
    filesChangedBaseline: filesChangedCount,
    testFailBaseline: testFailCount,
  };
  ensureDir(join(projectRoot, TASKS_DIR));
  const deltaPath = join(projectRoot, TASKS_DIR, `task-${taskId}.verify-delta.json`);
  writeFileSync(deltaPath, JSON.stringify(baseline, null, 2), 'utf-8');
  return baseline;
}

/**
 * Read a previously written verify-delta baseline.
 * Returns null if not found.
 */
export function readVerifyDeltaBaseline(
  projectRoot: string,
  taskId: string,
): VerifyDeltaBaseline | null {
  const deltaPath = join(projectRoot, TASKS_DIR, `task-${taskId}.verify-delta.json`);
  if (!existsSync(deltaPath)) return null;
  try {
    const raw = readFileSync(deltaPath, 'utf-8');
    return JSON.parse(raw) as VerifyDeltaBaseline;
  } catch {
    return null;
  }
}

/**
 * Compute verify-delta and recommend a self-assessment.
 *
 * If no baseline file exists, returns null (delta computation not possible).
 * Otherwise computes completionRatio from files-changed delta and test-fail delta,
 * then maps to DONE / GO_WITH_TECH_DEBT / NO_GO.
 *
 * Scoring:
 * - completionRatio >= VERIFY_DELTA_DONE_THRESHOLD (0.8) → DONE
 * - completionRatio >= VERIFY_DELTA_NO_GO_THRESHOLD (0.5) → GO_WITH_TECH_DEBT
 * - completionRatio < VERIFY_DELTA_NO_GO_THRESHOLD → NO_GO
 *
 * @param projectRoot - Project root directory
 * @param taskId - Task ID
 * @param filesChangedActual - Actual count of files changed at end of task
 * @param testFailActual - Actual count of failing tests at end (0 = all pass)
 * @param expectedFilesChangedCount - Expected file changes from task scope (used as denominator)
 */
export function computeVerifyDelta(
  projectRoot: string,
  taskId: string,
  filesChangedActual: number,
  testFailActual: number,
  expectedFilesChangedCount?: number,
): VerifyDeltaResult | null {
  const baseline = readVerifyDeltaBaseline(projectRoot, taskId);
  if (!baseline) return null;

  // Compute completion based on files actually changed relative to expected
  // If expectedFilesChangedCount is given, use it as denominator.
  // Otherwise use max(filesChangedActual, 1) as a proxy.
  const denominator = expectedFilesChangedCount != null && expectedFilesChangedCount > 0
    ? expectedFilesChangedCount
    : Math.max(filesChangedActual, 1);

  // Files-changed delta (how many new files were touched beyond baseline)
  const newFilesChanged = Math.max(filesChangedActual - baseline.filesChangedBaseline, 0);
  const filesRatio = Math.min(newFilesChanged / denominator, 1);

  // Test-fail improvement: if baseline had failures, compute fix ratio
  const testBaselineFails = baseline.testFailBaseline;
  let testRatio = 1; // Default: assume tests are fine if no baseline fails
  if (testBaselineFails > 0) {
    const testFixed = Math.max(testBaselineFails - testFailActual, 0);
    testRatio = testFixed / testBaselineFails;
  } else if (testFailActual > 0) {
    // Introduced new failures → penalize
    testRatio = 0;
  }

  // Combined ratio: 60% weight on file changes, 40% on test improvement
  const completionRatio = filesRatio * 0.6 + testRatio * 0.4;

  let recommendedAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  let reason: string;

  if (completionRatio >= VERIFY_DELTA_DONE_THRESHOLD) {
    recommendedAssessment = 'DONE';
    reason = `completion ${Math.round(completionRatio * 100)}% >= ${VERIFY_DELTA_DONE_THRESHOLD * 100}% threshold`;
  } else if (completionRatio >= VERIFY_DELTA_NO_GO_THRESHOLD) {
    recommendedAssessment = 'GO_WITH_TECH_DEBT';
    reason = `completion ${Math.round(completionRatio * 100)}% < ${VERIFY_DELTA_DONE_THRESHOLD * 100}% DONE threshold`;
  } else {
    recommendedAssessment = 'NO_GO';
    reason = `completion ${Math.round(completionRatio * 100)}% < ${VERIFY_DELTA_NO_GO_THRESHOLD * 100}% minimum threshold`;
  }

  return {
    taskId,
    baseline,
    endState: {
      filesChangedActual,
      testFailActual,
      timestamp: new Date().toISOString(),
    },
    completionRatio,
    recommendedAssessment,
    reason,
  };
}

// ─── Worker Lifecycle State Machine (Sprint 139 Task 015) ────────────

/**
 * Worker lifecycle states — ordered progression from spawn to exit.
 * Each state has a well-defined set of valid transitions.
 *
 * State flow:
 *   SPAWNING → STARTING → EXECUTING → TESTING → WRITING_RESULT → DONE → EXITED
 *                                   ↘ VERIFYING → TESTING (loop)
 *                         (any) ──→ ERROR → EXITED
 *                         (any) ──→ ORPHAN
 */
export type WorkerLifecycleState =
  | 'SPAWNING'
  | 'STARTING'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'TESTING'
  | 'WRITING_RESULT'
  | 'DONE'
  | 'EXITED'
  | 'ERROR'
  | 'ORPHAN';

/** Valid state transitions — key is current state, value is array of allowed next states */
export const VALID_TRANSITIONS: Readonly<Record<WorkerLifecycleState, readonly WorkerLifecycleState[]>> = {
  SPAWNING: ['STARTING', 'ERROR', 'ORPHAN'],
  STARTING: ['EXECUTING', 'ERROR', 'ORPHAN'],
  EXECUTING: ['VERIFYING', 'TESTING', 'WRITING_RESULT', 'ERROR', 'ORPHAN'],
  VERIFYING: ['TESTING', 'EXECUTING', 'WRITING_RESULT', 'ERROR', 'ORPHAN'],
  TESTING: ['EXECUTING', 'VERIFYING', 'WRITING_RESULT', 'ERROR', 'ORPHAN'],
  WRITING_RESULT: ['DONE', 'ERROR', 'ORPHAN'],
  DONE: ['EXITED'],
  EXITED: [],
  ERROR: ['EXITED'],
  ORPHAN: [],
};

/** States in which the worker is actively running and can be stopped */
export const STOPPABLE_STATES: ReadonlySet<WorkerLifecycleState> = new Set([
  'SPAWNING', 'STARTING', 'EXECUTING', 'VERIFYING', 'TESTING', 'WRITING_RESULT',
]);

/** States that indicate the worker has finished (no docker stop needed) */
export const TERMINAL_STATES: ReadonlySet<WorkerLifecycleState> = new Set([
  'DONE', 'EXITED', 'ERROR', 'ORPHAN',
]);

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly from: WorkerLifecycleState,
    public readonly to: WorkerLifecycleState,
    public readonly workerId: string,
  ) {
    super(`Invalid worker state transition: ${from} → ${to} (worker ${workerId})`);
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Worker lifecycle state machine tracker.
 * Tracks the current state and validates transitions.
 * Each worker instance gets one tracker — created at spawn time.
 */
export class WorkerStateMachine {
  private _state: WorkerLifecycleState;
  private readonly _workerId: string;
  private readonly _history: Array<{ from: WorkerLifecycleState; to: WorkerLifecycleState; timestamp: string }> = [];

  constructor(workerId: string, initialState: WorkerLifecycleState = 'SPAWNING') {
    this._workerId = workerId;
    this._state = initialState;
  }

  /** Current lifecycle state */
  get state(): WorkerLifecycleState { return this._state; }

  /** Worker ID this state machine tracks */
  get workerId(): string { return this._workerId; }

  /** Full transition history */
  get history(): ReadonlyArray<{ from: WorkerLifecycleState; to: WorkerLifecycleState; timestamp: string }> {
    return this._history;
  }

  /**
   * Transition to a new state.
   * @throws InvalidStateTransitionError if the transition is not allowed
   */
  transition(to: WorkerLifecycleState): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(this._state, to, this._workerId);
    }
    const from = this._state;
    this._state = to;
    this._history.push({ from, to, timestamp: new Date().toISOString() });
  }

  /** Check if a transition to the given state would be valid */
  canTransition(to: WorkerLifecycleState): boolean {
    return VALID_TRANSITIONS[this._state].includes(to);
  }

  /** Whether the worker is in a state where docker stop / kill is appropriate */
  get isStoppable(): boolean {
    return STOPPABLE_STATES.has(this._state);
  }

  /** Whether the worker has reached a terminal state */
  get isTerminal(): boolean {
    return TERMINAL_STATES.has(this._state);
  }

  /**
   * Force-set state without validation (for ORPHAN recovery).
   * Should only be used by Brain when detecting stale workers.
   */
  forceState(state: WorkerLifecycleState): void {
    const from = this._state;
    this._state = state;
    this._history.push({ from, to: state, timestamp: new Date().toISOString() });
  }

  /** Serialize to plain object for heartbeat / event stream payload */
  toJSON(): { workerId: string; state: WorkerLifecycleState; history: Array<{ from: WorkerLifecycleState; to: WorkerLifecycleState; timestamp: string }> } {
    return {
      workerId: this._workerId,
      state: this._state,
      history: [...this._history],
    };
  }
}

// ─── Global Worker State Registry ────────────────────────────────────

const _workerStates = new Map<string, WorkerStateMachine>();

/**
 * Get or create a state machine for a worker.
 * If the worker already has a state machine, return it.
 * Otherwise create a new one in SPAWNING state.
 */
export function getWorkerStateMachine(workerId: string): WorkerStateMachine {
  let sm = _workerStates.get(workerId);
  if (!sm) {
    sm = new WorkerStateMachine(workerId);
    _workerStates.set(workerId, sm);
  }
  return sm;
}

/**
 * Create a fresh state machine for a worker, replacing any existing one.
 * Used at spawn time to ensure clean state.
 */
export function createWorkerStateMachine(workerId: string, initialState: WorkerLifecycleState = 'SPAWNING'): WorkerStateMachine {
  const sm = new WorkerStateMachine(workerId, initialState);
  _workerStates.set(workerId, sm);
  return sm;
}

/**
 * Remove a worker's state machine from the registry.
 * Called after the worker has fully exited and been cleaned up.
 */
export function removeWorkerStateMachine(workerId: string): boolean {
  return _workerStates.delete(workerId);
}

/**
 * Check if a worker is in a stoppable state (safe to call docker stop).
 * Returns false if the worker has no state machine (already cleaned up)
 * or is in a terminal state (DONE, EXITED, ERROR, ORPHAN).
 */
export function isWorkerStoppable(workerId: string): boolean {
  const sm = _workerStates.get(workerId);
  if (!sm) return false;
  return sm.isStoppable;
}

/**
 * Get all tracked worker state machines.
 * Useful for Brain to inspect all worker states.
 */
export function getAllWorkerStates(): ReadonlyMap<string, WorkerStateMachine> {
  return _workerStates;
}

/**
 * Clear the entire worker state registry.
 * Used in tests and sprint cleanup.
 */
export function clearWorkerStateRegistry(): void {
  _workerStates.clear();
}
