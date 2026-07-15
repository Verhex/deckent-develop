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
import { emitWorkerActivity } from './worker-activity.js';
import { atomicWriteFileSync as _atomicWrite } from './worker-lifecycle.js';
import { SharedMemory } from '../orchestra/shared-memory.js';
export type { SharedMemoryEntry } from '../orchestra/shared-memory.js';
export { SharedMemory };
import {
  createWorkerApprovalGate,
  type WorkerApprovalGateFactoryOptions,
  type WorkerApprovalGateHandle,
} from '../agent/permission-store.js';
import { WorkerApprovalGate, type GateVerdict } from '../core/approval-worker-gate.js';
import type { ApprovalScope, ApprovalRisk, Requester } from '../core/approval-contract.js';

// ─── Token usage: orchestrator/adapter-owned (Worker Output Contract §1.1) ─
//
// The worker no longer self-counts tokens. The old `defaultTokenUsageStub`
// helper emitted a zeroed `inputTokens`/`outputTokens` placeholder so a worker
// could attach a self-report — but an LLM cannot reliably count its own
// consumption (Sprint 195 195-002-fix saw a 5.6× gap between the worker's
// `3.9K` guess and the measured `22K`). Under the Worker Output Contract,
// `tokenUsage` is captured authoritatively from the provider adapter's parsed
// response (`extractUsage()`), with a tokenizer fallback when the provider
// reports nothing — never a worker-authored zero. The worker now contributes
// only the subjective block (`selfAssessment`, `goCriteria`, `notes`); every
// measurable field is derived by the orchestrator/adapter.

// ─── Re-export: worker-verify.ts ───────────────────────────────────
export {
  getVerifyCommands,
  isDocOnlyScope,
  parseVitestFailedTests,
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

// ─── Re-export: worker-verify-tool.ts (TT555 verify_task tool surface) ──
// The platform-neutral one-turn verify helper (honest, separately-captured
// lint+test exit codes — never a `cmd | tail` masked 0) plus the sprint-start
// env-probe. Lives in orchestra/ (core-only deps, ADR-D-004 C2); surfaced here
// so every worker entrypoint that already imports the worker module reaches it
// through one canonical router — the same re-export-as-tool-surface pattern the
// lock / lifecycle / verify blocks above use.
export {
  verifyTask,
  runVerifyTask,
  resolveVerifyCommands,
  spawnCommandRunner,
  probeToolInventory,
  formatToolInventory,
  PROBED_TOOLS,
} from '../orchestra/worker-verify-tool.js';
export type {
  ResolvedVerifyCommands,
  StackCommandResolver,
  CommandOutcome,
  CommandRunner,
  VerifyStepResult,
  VerifyTaskResult,
  VerifyTaskInput,
  ProbedTool,
  ToolInventory,
  ToolExistsFn,
} from '../orchestra/worker-verify-tool.js';

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

// ─── Shared Memory — Worker Context ────────────────────────────────

/**
 * Returns a SharedMemory instance scoped to the given project root.
 * Workers in the same sprint share the same .tasks/shared/ directory,
 * making this read-mostly inter-worker coordination available without
 * going through the orchestrator.
 */
export function getSharedMemory(projectRoot: string, ttlMs?: number): SharedMemory {
  return new SharedMemory(projectRoot, ttlMs);
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
  pid?: number,
): Heartbeat {
  const count = filesChangedCount ?? 0;
  // TT553 (task 418-002): `pid` is an ADDITIVE, optional field — the input the
  // subprocess host-liveness probe (heartbeat-monitor.ts, `process-pid` signal)
  // reads so a native worker's liveness is judged by the OS (`kill(pid,0)`), NOT
  // by whether/when this `.hb` was written. Defaults to the running worker's own
  // pid so a deckent-native worker publishes it automatically; a caller may pass
  // an explicit pid or `undefined` to omit it. Backward-compatible: legacy readers
  // ignore the extra key, and liveness never depends on it being present.
  const resolvedPid = pid ?? process.pid;
  const hb: Heartbeat & { pid?: number } = {
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
  if (typeof resolvedPid === 'number' && resolvedPid > 0) hb.pid = resolvedPid;
  return hb;
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
    // WORKER-LIVE-LOG (#582): every heartbeat is also a live short-form
    // activity row (status + current action + files-changed) — the "what is
    // the worker doing RIGHT NOW" feed. Same flag as the progress stream.
    emitWorkerActivity(
      projectRoot,
      isLiveTraceEnabled(projectRoot),
      {
        taskId: heartbeat.taskId,
        ...(heartbeat.workerId ? { workerId: heartbeat.workerId } : {}),
        line: `${heartbeat.status}${heartbeat.currentAction ? ` — ${heartbeat.currentAction}` : ''}`,
        kind: 'status',
        detail: {
          sequence: heartbeat.sequence,
          filesChangedCount: heartbeat.filesChangedCount ?? 0,
          ...(heartbeat.currentFile ? { currentFile: heartbeat.currentFile } : {}),
        },
      },
      sid,
    );
  }
}

// live_trace flag, read once per process (workers are per-task processes; a
// mid-task config flip applying on the NEXT task is the intended semantics).
let liveTraceEnabledCache: boolean | null = null;
function isLiveTraceEnabled(projectRoot: string): boolean {
  if (liveTraceEnabledCache !== null) return liveTraceEnabledCache;
  try {
    const raw = readFileSync(join(projectRoot, '.deckent', 'config.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { live_trace?: { enabled?: boolean } };
    liveTraceEnabledCache = parsed.live_trace?.enabled === true;
  } catch {
    liveTraceEnabledCache = false;
  }
  return liveTraceEnabledCache;
}

/** @internal test seam — reset the per-process live_trace flag cache. */
export function __resetLiveTraceCacheForTests(): void {
  liveTraceEnabledCache = null;
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
  opts?: { enforceRbac?: boolean },
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

    // ADR-037 V2 hard-deny: honor enforce_rbac flag when on; soft (allow) when off.
    if (opts?.enforceRbac === true) {
      return false;
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

// ─── WorkerApprovalGate — risky-action wiring (born-573 REDO, task 382-001) ─
//
// Relocated from the orphan `src/orchestra/worker.ts` (task 380-003/born-573
// wrote the real gate-instantiation logic to a scope.filesWrite path that did
// not exist in the repo at assignment time, so it landed in a brand-new file
// nothing ever imported). This is the canonical, disk-backed instantiation
// point now, living in the worker module every real entrypoint
// (http-agentic-worker.ts, agentic-worker-entry.ts, cli/, spawn-backend-*)
// already imports. Broker/gate construction is NOT re-implemented here — it
// delegates to `agent/permission-store.ts`'s `createWorkerApprovalGate`
// (already Sprint-1-wired) so there is exactly one place that does
// `new ApprovalBroker` + `new WorkerApprovalGate`.
// `src/orchestra/worker.ts` now re-exports these same 4 symbols as a thin
// compatibility shim (the ADR-D-004 D004-E2 re-export-after-relocation
// pattern) so its existing test keeps resolving a single canonical
// definition instead of a second copy.

export const RISKY_APPROVAL_SCOPES: readonly ApprovalScope[] = ['shell-exec', 'git-mutation', 'network'] as const;

export interface RiskyClassification {
  scope: ApprovalScope;
  risk: ApprovalRisk;
  reason: string;
}

interface RiskPattern {
  re: RegExp;
  risk: ApprovalRisk;
  reason: string;
}

// Ordered most- to least-severe; the FIRST match wins within each class.
const GIT_MUTATION_PATTERNS: readonly RiskPattern[] = [
  { re: /\bgit\s+push\b[^|;&]*(--force\b|-f\b)/i, risk: 'critical', reason: 'git push --force' },
  { re: /\bgit\s+reset\b[^|;&]*--hard\b/i, risk: 'critical', reason: 'git reset --hard' },
  { re: /\bgit\s+clean\b[^|;&]*-[a-z]*f/i, risk: 'critical', reason: 'git clean -f' },
  { re: /\bgit\s+branch\b[^|;&]*-D\b/i, risk: 'high', reason: 'git branch -D (force delete)' },
  { re: /\bgit\s+push\b/i, risk: 'high', reason: 'git push' },
  {
    re: /\bgit\s+(commit|merge|rebase|reset|tag|cherry-pick|revert|rm|am|filter-branch)\b/i,
    risk: 'high',
    reason: 'git history/state mutation',
  },
];

const NETWORK_PATTERNS: readonly RiskPattern[] = [
  { re: /\b(npm|yarn|pnpm)\s+publish\b/i, risk: 'high', reason: 'package publish' },
  { re: /\b(curl|wget)\b/i, risk: 'medium', reason: 'HTTP client invocation' },
  { re: /\b(ssh|scp|sftp|rsync)\b/i, risk: 'medium', reason: 'remote-host transfer' },
  { re: /\b(npm|yarn|pnpm)\s+(install|i|ci|add|update|up)\b/i, risk: 'medium', reason: 'package registry install' },
  { re: /\bgit\s+(clone|pull|fetch)\b/i, risk: 'low', reason: 'git network fetch' },
];

function matchPattern(cmd: string, patterns: readonly RiskPattern[]): RiskPattern | undefined {
  return patterns.find((p) => p.re.test(cmd));
}

/**
 * Classify a shell command a worker is about to run into one of the 3 risky
 * `ApprovalScope` classes. Always returns a classification for a non-empty
 * command — shell-exec is itself risky, so an unrecognized command is gated
 * at minimum as shell-exec/medium; a recognized git-mutation or network
 * sub-pattern upgrades scope/risk (git-mutation > network priority).
 */
export function classifyRiskyWorkerCommand(cmd: string): RiskyClassification {
  const gitMatch = matchPattern(cmd, GIT_MUTATION_PATTERNS);
  if (gitMatch) return { scope: 'git-mutation', risk: gitMatch.risk, reason: gitMatch.reason };

  const networkMatch = matchPattern(cmd, NETWORK_PATTERNS);
  if (networkMatch) return { scope: 'network', risk: networkMatch.risk, reason: networkMatch.reason };

  return { scope: 'shell-exec', risk: 'medium', reason: 'shell command execution' };
}

/**
 * Real, disk-backed instantiation point for a worker's `WorkerApprovalGate` —
 * thin delegate to `agent/permission-store.ts`'s `createWorkerApprovalGate`
 * (builds the `ApprovalBroker` persisting to `.deckent/approvals/` under
 * `projectRoot`, the same store the terminal's own broker uses) scoped to
 * the given worker's identity. Not a fake/mock — `guard()` on the returned
 * gate does a genuine submit + await-decision (or fallback-on-timeout).
 */
export function createOrchestraWorkerApprovalGate(
  projectRoot: string,
  workerId: string,
  opts: WorkerApprovalGateFactoryOptions = {},
): WorkerApprovalGateHandle {
  const requester: Requester = { role: 'worker', instanceId: workerId };
  return createWorkerApprovalGate(projectRoot, requester, opts);
}

const SUMMARY_MAX_LENGTH = 200;

function buildSummary(cmd: string, classification: RiskyClassification): string {
  const prefix = `worker run_bash (${classification.scope}): `;
  const budget = SUMMARY_MAX_LENGTH - prefix.length;
  const truncated = cmd.length > budget ? `${cmd.slice(0, Math.max(0, budget - 1))}…` : cmd;
  return `${prefix}${truncated}`;
}

function buildDeniedError(classification: RiskyClassification, extra?: string): string {
  const suffix = extra ? ` (${extra})` : '';
  return `[approval-denied] tool=run_bash scope=${classification.scope} risk=${classification.risk} reason="${classification.reason}"${suffix}`;
}

export interface GuardRiskyWorkerActionResult {
  verdict: GateVerdict;
  /** Structured `[approval-denied] ...` string, present only when verdict === 'deny'. */
  deniedOutput?: string;
}

/**
 * Gate a risky shell command for a worker BEFORE it runs. Classifies `cmd`,
 * submits it to the real gate's `guard()`, and on 'deny' returns a structured
 * `[approval-denied] ...` string so a caller can surface the denial without a
 * second ad-hoc deny path.
 */
export async function guardRiskyWorkerAction(
  gate: WorkerApprovalGate,
  scopeId: string,
  cmd: string,
): Promise<GuardRiskyWorkerActionResult> {
  const classification = classifyRiskyWorkerCommand(cmd);
  try {
    const verdict = await gate.guard({
      summary: buildSummary(cmd, classification),
      details: { tool: 'run_bash', scope: classification.scope, risk: classification.risk, reason: classification.reason },
      scopeId,
      scope: classification.scope,
      risk: classification.risk,
      policy: 'require-approval',
      defaultAction: 'deny',
      rawArgs: { cmd },
    });
    if (verdict === 'deny') return { verdict, deniedOutput: buildDeniedError(classification) };
    return { verdict };
  } catch (err) {
    return {
      verdict: 'deny',
      deniedOutput: buildDeniedError(classification, `gate error: ${err instanceof Error ? err.message : String(err)}`),
    };
  }
}
