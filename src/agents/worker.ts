import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import type {
  Task,
  TaskStatus,
  TaskPlan,
  TaskResult,
  Heartbeat,
  LockInfo,
  TaskScope,
  AgentStatus,
} from '../core/types.js';
import { TASKS_DIR, LOCKS_DIR } from '../core/constants.js';

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

// ─── Public API ─────────────────────────────────────────────────────

export function readTask(projectRoot: string, taskId: string): Task {
  const path = taskFilePath(projectRoot, taskId);
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as Task;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON in task file: ${path}`);
    }
    throw new Error(`Task file not found: ${path}`);
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

  task.status = 'CLAIMED' as TaskStatus;
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

  writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2), 'utf-8');
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
): Heartbeat {
  return {
    workerId,
    taskId,
    status,
    currentAction: action,
    currentFile: file,
    timestamp: now(),
    filesChangedCount: 0,
    sequence: sequence ?? 0,
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
      ? ('NO_GO' as TaskStatus)
      : ('DONE' as TaskStatus);

  updateTaskStatus(projectRoot, result.taskId, newStatus);
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
  return readFileSync(logPath, 'utf-8');
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
