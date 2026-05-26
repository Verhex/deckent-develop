/**
 * Worker — Core Task Operations & Re-export Router
 *
 * Sprint 144 God Object Split: 1670 LoC → 4 modules.
 * This file retains core task I/O (read, claim, heartbeat, result, scope check)
 * and re-exports everything from the 3 extracted modules for backward compatibility.
 *
 * Extracted modules:
 *   - worker-verify.ts: Build & test verification loops
 *   - worker-lifecycle.ts: State machine, shutdown, verify-delta, feedback loop
 *   - worker-log.ts: Structured log formatting & I/O
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, realpathSync, openSync, closeSync, fsyncSync, fstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, normalize, sep } from 'node:path';
import { TaskStatus, AgentStatus } from '../core/types.js';
import type {
  Task,
  TaskPlan,
  TaskResult,
  Heartbeat,
  LockInfo,
  TaskScope,
} from '../core/types.js';
import { TASKS_DIR } from '../core/constants.js';
import { ErrorRegistry } from '../core/errors.js';
import { checkAuthority, emitAuthorityViolation } from '../orchestra/authority-enforcer.js';
import { writeEvent, getCurrentSprintId, CHANNELS } from '../orchestra/event-stream.js';
import { atomicWriteFileSync as _atomicWrite } from './worker-lifecycle.js';
import {
  snapshotWorkerScope as _snapshotWorkerScope,
  writeStashRef as _writeStashRef,
} from './worker-rollback.js';

// ─── Re-export: worker-rollback.ts (Sprint 177 Task 1) ─────────────
export {
  snapshotWorkerScope,
  rollbackWorkerScope,
  dropWorkerSnapshot,
  writeStashRef,
  readStashRef,
  clearStashRef,
} from './worker-rollback.js';

// ─── Re-export: worker-verify.ts ───────────────────────────────────
export {
  getVerifyCommands,
  isDocOnlyScope,
  parseVitestOutput,
  verifyTests,
  runTestVerifyLoop,
  MAX_TEST_RETRIES,
  parseCompilationErrors,
  verifyCompilation,
  runCompilationLoop,
  MAX_COMPILATION_RETRIES,
  enforceVerifyLoop,
} from './worker-verify.js';
export type {
  CompilationResult,
  CompilationLoopResult,
  VerifyLoopResult,
} from './worker-verify.js';

// ─── Re-export: worker-lifecycle.ts ────────────────────────────────
export {
  atomicWriteFileSync,
  fsyncResultFile,
  finalizeHeartbeatOnShutdown,
  createFeedbackLoop,
  recordTscAttempt,
  recordTestAttempt,
  calculateSelfHealingRate,
  aggregateFeedbackLoops,
  VERIFY_DELTA_DONE_THRESHOLD,
  VERIFY_DELTA_NO_GO_THRESHOLD,
  writeVerifyDeltaBaseline,
  readVerifyDeltaBaseline,
  computeVerifyDelta,
  WorkerStateMachine,
  InvalidStateTransitionError,
  VALID_TRANSITIONS,
  STOPPABLE_STATES,
  TERMINAL_STATES,
  getWorkerStateMachine,
  createWorkerStateMachine,
  removeWorkerStateMachine,
  isWorkerStoppable,
  getAllWorkerStates,
  clearWorkerStateRegistry,
} from './worker-lifecycle.js';
export type {
  WorkerLifecycleState,
  VerifyDeltaBaseline,
  VerifyDeltaResult,
} from './worker-lifecycle.js';

// ─── Re-export: worker-log.ts ──────────────────────────────────────
export {
  formatWorkerLog,
  formatScopeLog,
  formatTestLog,
  formatVerifyLog,
  formatDoneLog,
  appendWorkerLog,
  readWorkerLog,
} from './worker-log.js';
export type { WorkerLogAction } from './worker-log.js';

// ─── Re-export: Lock Operations (core/file-lock.ts) ────────────────
export { LockError } from '../core/file-lock.js';
import {
  acquireLock as _coreLock,
  releaseLock as _coreRelease,
  checkLock as _coreCheck,
  releaseAllLocks as _coreReleaseAll,
} from '../core/file-lock.js';

// Lock re-exports — direct delegation to core/file-lock.ts
export function acquireLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
  taskId: string,
): LockInfo {
  return _coreLock(projectRoot, filePath, workerId, taskId);
}

export function releaseLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
): void {
  return _coreRelease(projectRoot, filePath, workerId);
}

export function checkLock(
  projectRoot: string,
  filePath: string,
): LockInfo | null {
  return _coreCheck(projectRoot, filePath);
}

export function releaseAllLocks(
  projectRoot: string,
  workerId: string,
): number {
  return _coreReleaseAll(projectRoot, workerId);
}

// ─── Error Classes ──────────────────────────────────────────────────

export class TaskClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskClaimError';
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

function now(): string {
  return new Date().toISOString();
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// ─── Progress Calculation ───────────────────────────────────────────

export function calculateProgress(heartbeat: { status: AgentStatus | string; filesChangedCount?: number }): number {
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

// ─── Worker Snapshot Setup (Sprint 177 Task 1) ────────────────────

/**
 * Captures a pre-spawn git-stash snapshot of the working tree and persists
 * the ref via the `.tasks/task-{id}.stash-ref` sidecar so the result-evaluator
 * can later rollback (NO_GO) or drop (DONE / GO_WITH_TECH_DEBT) the snapshot.
 *
 * Designed to be called by spawn-backend / tmux backends just before launching
 * a worker process. Returns the captured stash ref, or `null` if the project
 * root is not a git working tree (graceful degradation).
 *
 * @param projectRoot — absolute path to the project repository
 * @param taskId — task identifier (matches the worker's `task-{id}.json`)
 * @returns the captured stash ref (e.g. `stash@\{0\}`) or `null` on non-git roots
 */
export function setupTaskSnapshot(projectRoot: string, taskId: string): string | null {
  if (!existsSync(join(projectRoot, '.git'))) {
    return null;
  }
  try {
    const ref = _snapshotWorkerScope(projectRoot, taskId);
    _writeStashRef(projectRoot, taskId, ref);
    return ref;
  } catch (err) {
    console.warn(
      `[deckent] setupTaskSnapshot failed for task ${taskId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─── Core Task Operations ───────────────────────────────────────────

export function readTask(projectRoot: string, taskId: string): Task {
  const path = taskFilePath(projectRoot, taskId);
  try {
    const content = readFileSync(path, 'utf-8');
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
 * Write a task result to disk and update task status.
 *
 * Uses atomic write (temp + fsync + rename) to guarantee the .result file
 * survives Docker SIGKILL (exit 137) after SIGTERM grace period expires.
 *
 * **Verify Loop Gate:** Callers MUST run `enforceVerifyLoop()` before calling this function.
 */
export function writeResult(projectRoot: string, result: TaskResult, sprintId?: string): void {
  ensureDir(join(projectRoot, TASKS_DIR));

  const planPath = planFilePath(projectRoot, result.taskId);
  if (!existsSync(planPath)) {
    console.warn(`[deckent] WARNING: task ${result.taskId} — .plan file missing. Workers should write .tasks/task-{id}.plan before coding.`);
    (result as TaskResult & { planWarning?: string }).planWarning = 'missing';
  }

  // ── Worker Self-Honesty (Sprint 165 Task 1 — Bug X) ──────────────
  // A worker that claims DONE but reports linesAdded=0 + testsPassed=false
  // is producing the exact stub shape the Sprint 156-011 / Sprint 164 bug
  // exploited. Downgrade to NO_GO at the write boundary so the dishonest
  // shape never reaches Brain's EVALUATE pipeline. The stripped
  // codeVerified field guarantees the legacy auto-promote path cannot
  // re-fire on a second-chance read.
  const linesAdded = result.linesAdded ?? 0;
  const testsPassed = result.testsPassed === true;
  const codeVerified = (result as TaskResult & { codeVerified?: string }).codeVerified;
  const looksLikeStub =
    (result.selfAssessment === 'DONE' && linesAdded === 0 && !testsPassed) ||
    (codeVerified === 'CODE_VERIFIED_DONE' && linesAdded === 0 && !testsPassed);
  if (looksLikeStub) {
    const stripped: TaskResult & { codeVerified?: string } = { ...result };
    delete stripped.codeVerified;
    const origNotes = (result.notes ?? '').slice(0, 400);
    result = {
      ...stripped,
      selfAssessment: 'NO_GO',
      notes:
        `[honest-gate] worker-self-stub: linesAdded=${linesAdded} testsPassed=${testsPassed} — ` +
        `DONE claim downgraded to NO_GO. Original: ${origNotes}`,
    };
  }

  const path = resultFilePath(projectRoot, result.taskId);
  _atomicWrite(path, JSON.stringify(result, null, 2));

  const newStatus: TaskStatus =
    result.selfAssessment === 'NO_GO'
      ? TaskStatus.NO_GO
      : TaskStatus.DONE;

  updateTaskStatus(projectRoot, result.taskId, newStatus);
  finalizeHeartbeat(projectRoot, result.taskId);

  const sid = sprintId ?? getCurrentSprintId(projectRoot);
  if (sid) {
    writeEvent(projectRoot, sid, 'worker', 'brain', CHANNELS.RESULT, {
      taskId: result.taskId,
      selfAssessment: result.selfAssessment,
      filesChanged: result.filesChanged,
      rubricScores: result.rubricScores,
    });

    writeEvent(projectRoot, sid, 'worker', 'auditor', CHANNELS.CODE_VERIFY_REQUEST, {
      taskId: result.taskId,
      filesChanged: result.filesChanged,
      evidence: result.notes ?? '',
    });
  }
}

/**
 * Sprint 183 W1-3: post-write `.result` disk-persistence verification.
 *
 * Returns whether the `.tasks/task-{id}.result` file is physically present on
 * disk *and* forces an fsync to flush any lingering OS buffer cache. Designed
 * to be called immediately after {@link writeResult} so the orchestrator can
 * confirm the artifact survives a subsequent SIGKILL — closes the Sprint 182
 * "exitCode=0 but no .result" gap where workers reported normal exit yet the
 * result file never appeared (`docs/audits/sprint-183/worker-timeout-rc.md`).
 *
 * - `persisted=false, size=0` → file missing or unreadable; caller should
 *   treat the worker as having lost its result and schedule a fix-spawn.
 * - `persisted=true, size>0` → file present, fsync'd; safe to proceed to
 *   EVALUATE.
 */
export function verifyResultPersisted(
  projectRoot: string,
  taskId: string,
): { persisted: boolean; size: number } {
  const path = resultFilePath(projectRoot, taskId);
  if (!existsSync(path)) return { persisted: false, size: 0 };
  try {
    const fd = openSync(path, 'r');
    try {
      fsyncSync(fd);
      const stat = fstatSync(fd);
      return { persisted: true, size: stat.size };
    } finally {
      closeSync(fd);
    }
  } catch {
    return { persisted: false, size: 0 };
  }
}

/**
 * Remove the heartbeat file for a completed task.
 */
export function finalizeHeartbeat(projectRoot: string, taskId: string, cleanupDelayMs = 0): void {
  const hbPath = heartbeatFilePath(projectRoot, taskId);

  const doCleanup = (): void => {
    if (existsSync(hbPath)) {
      try {
        unlinkSync(hbPath);
      } catch {
        // File may already be removed — non-fatal
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
 * @deprecated Use finalizeHeartbeat — kept for backward compatibility.
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

// ─── Scope Check ────────────────────────────────────────────────────

export function isWithinScope(filePath: string, scope: TaskScope, projectRoot?: string): boolean {
  const normalizedFile = normalize(filePath).split(sep).join('/');

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
        return false;
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ELOOP') return false;
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

// ─── Authority Check (ADR-037) ──────────────────────────────────────

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

    return true;
  }

  return true;
}

// ─── Worker Event Emitters (ADR-035) ───────────────────────────────

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

// ─── Sprint 194 W-AUTH A-1: Pre-spawn auth health check ─────────────
//
// Sprint 192 RC: /login during an active sprint caused worker containers to
// lose Claude CLI auth → container exited with code 0 and an empty .result
// (silent fail). Brain marked these as synthetic NO_GO with no diagnosable
// signal. authHealthCheck() turns auth loss into an honest worker result so
// Brain treats it as a real NO_GO and the sprint retro can count failures.
//
// Activation contract (env-gated, fail-open by default):
//   • Skipped entirely unless `CLAUDE_AUTH_REQUIRED=1` — local/tmux/subprocess
//     backends remain backward-compatible.
//   • Bypassed when `DECKENT_AUTH_SKIP=1` — for test env / CI where the
//     `claude` binary is intentionally unavailable.
//   • spawn-backend-docker.ts sets `CLAUDE_AUTH_REQUIRED=1` on container env
//     so docker workers always run this check before the actual task.

export interface AuthHealthCheckResult {
  /** true = auth OK or check skipped; false = AUTH_FAILED .result was written */
  ok: boolean;
  /** Set when ok=false — short stderr/diagnostic captured from claude CLI */
  stderr?: string;
  /** True when the check was skipped (env not set or test bypass) */
  skipped?: boolean;
}

/**
 * Run a pre-spawn Claude CLI auth health check.
 *
 * Behavior:
 *   - When neither `CLAUDE_AUTH_REQUIRED` nor `DECKENT_AUTH_SKIP` indicates we
 *     should check, returns `{ok: true, skipped: true}` without touching disk.
 *   - When `CLAUDE_AUTH_REQUIRED=1` AND `DECKENT_AUTH_SKIP` unset:
 *       runs `claude --version` (5s timeout). If exit != 0 OR stdout empty,
 *       writes a real `.result` (selfAssessment NO_GO, notes `AUTH_FAILED: ...`,
 *       filesChanged=[]) AND emits a `WORKER→BRAIN:AUTH_FAILED` event, then
 *       returns `{ok: false, stderr}`. Caller should `process.exit(1)` so Brain
 *       sees a clean fail with a real result on disk.
 *   - When `DECKENT_AUTH_SKIP=1`, returns `{ok: true, skipped: true}`.
 */
export function authHealthCheck(
  projectRoot: string,
  taskId: string,
  sprintId?: string,
  env: NodeJS.ProcessEnv = process.env,
): AuthHealthCheckResult {
  const required = env.CLAUDE_AUTH_REQUIRED === '1';
  const bypass = env.DECKENT_AUTH_SKIP === '1';
  if (!required || bypass) {
    return { ok: true, skipped: true };
  }

  let exitCode: number | null = null;
  let stdout = '';
  let stderr = '';
  try {
    const r = spawnSync('claude', ['--version'], {
      encoding: 'utf-8',
      timeout: 5_000,
      shell: process.platform === 'win32',
    });
    exitCode = r.status;
    stdout = (r.stdout ?? '').trim();
    stderr = (r.stderr ?? '').trim();
  } catch (err) {
    exitCode = -1;
    stderr = err instanceof Error ? err.message : String(err);
  }

  if (exitCode === 0 && stdout.length > 0) {
    return { ok: true };
  }

  const diag = stderr.length > 0
    ? stderr.slice(0, 400)
    : `claude --version exitCode=${exitCode ?? 'null'} stdout="${stdout.slice(0, 60)}"`;

  try {
    const result: TaskResult = {
      taskId,
      workerId: env.DECKENT_WORKER_ID ?? `w-${taskId}`,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: `AUTH_FAILED: ${diag}`,
    };
    writeResult(projectRoot, result, sprintId);
  } catch (err) {
    console.warn(`[deckent] authHealthCheck: writeResult failed for ${taskId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const sid = sprintId ?? getCurrentSprintId(projectRoot);
  if (sid) {
    writeEvent(projectRoot, sid, 'worker', 'brain', CHANNELS.AUTH_FAILED, {
      taskId,
      exitCode,
      stderr: diag,
    });
  }

  return { ok: false, stderr: diag };
}
