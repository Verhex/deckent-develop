import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { JOBS_DIR, TASKS_DIR } from '../../core/constants.js';
import { executionJobTimestamp } from '../../core/execution-job-identity.js';
export { createExecutionJobId as createJobId } from '../../core/execution-job-identity.js';

export interface TaskSummary {
  taskId: string;
  title: string;
  evaluation: string;
  agent: string;
  skills: string[];
  notes: string;
}

export interface JobInvocationProjection {
  readonly schemaVersion: 1;
  readonly invocationId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly state: 'not-dispatched' | 'dispatch-started' | 'reconciliation-required';
  readonly executionMode: 'normal-docker-exact' | 'legacy-non-docker';
  readonly executionEvidenceRef: string | null;
  readonly attemptId: string | null;
}

export interface JobState {
  jobId: string;
  status: 'RUNNING' | 'ACCEPTED_AWAITING_EVALUATION' | 'COMPLETE' | 'FAILED';
  startedAt: string;
  /** Compatibility projection only; the immutable invocation receipt remains authority. */
  taskId?: string;
  invocation?: JobInvocationProjection;
  completedAt?: string;
  error?: string;
  sprintId?: string;
  /** Task-level evaluations and summaries (populated on COMPLETE) */
  tasks?: TaskSummary[];
  /** High-level sprint metrics */
  metrics?: {
    totalTasks: number;
    done: number;
    techDebt: number;
    noGo: number;
    duration: string;
  };
  /** Human-readable completion summary */
  summary?: string;
  /** Agent usage breakdown: agentId → task count */
  agentBreakdown?: Record<string, number>;
}

export class JobStateProjectionError extends Error {
  constructor(
    readonly code:
      | 'JOB_STATE_IDENTITY_INVALID'
      | 'JOB_STATE_WRITE_CONFLICT'
      | 'JOB_STATE_TERMINAL_CONFLICT'
      | 'JOB_STATE_DURABILITY_HOLD',
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'JobStateProjectionError';
  }
}

const JOB_ID = /^(?:job-[0-9]{13}-[0-9a-f-]+|sprint-[A-Za-z0-9_.-]+|run-[A-Za-z0-9_.-]+)$/iu;

function jobStateBytes(state: JobState): Buffer {
  if (!JOB_ID.test(state.jobId) || state.jobId.includes('..')) {
    throw new JobStateProjectionError('JOB_STATE_IDENTITY_INVALID');
  }
  return Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function readStableJobState(path: string, jobId: string): { state: JobState; digest: string } {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.size > 4 * 1024 * 1024) {
      throw new JobStateProjectionError('JOB_STATE_WRITE_CONFLICT');
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) {
      throw new JobStateProjectionError('JOB_STATE_WRITE_CONFLICT');
    }
    const parsed = JSON.parse(bytes.toString('utf8')) as JobState;
    if (!parsed || parsed.jobId !== jobId) {
      throw new JobStateProjectionError('JOB_STATE_WRITE_CONFLICT');
    }
    return {
      state: parsed,
      digest: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (cause) {
    if (cause instanceof JobStateProjectionError) throw cause;
    throw new JobStateProjectionError('JOB_STATE_WRITE_CONFLICT', { cause });
  } finally {
    closeSync(fd);
  }
}

function assertJobStateTransition(previous: JobState, next: JobState): void {
  if (previous.jobId !== next.jobId || previous.startedAt !== next.startedAt) {
    throw new JobStateProjectionError('JOB_STATE_WRITE_CONFLICT');
  }
  if (
    (previous.status === 'COMPLETE' || previous.status === 'FAILED')
    && JSON.stringify(previous) !== JSON.stringify(next)
  ) {
    throw new JobStateProjectionError('JOB_STATE_TERMINAL_CONFLICT');
  }
}

export function writeJobState(projectRoot: string, state: JobState): void {
  const jobsDir = join(projectRoot, JOBS_DIR);
  mkdirSync(jobsDir, { recursive: true });
  const target = join(jobsDir, `${state.jobId}.json`);
  const lockPath = join(jobsDir, `.${state.jobId}.projection.lock`);
  const stagePath = join(jobsDir, `.${state.jobId}.${randomUUID()}.tmp`);
  const bytes = jobStateBytes(state);
  let lockFd: number | undefined;
  let lockIdentity: { dev: number; ino: number } | undefined;
  let staged = false;
  try {
    try {
      lockFd = openSync(lockPath, 'wx', 0o600);
    } catch (cause) {
      throw new JobStateProjectionError('JOB_STATE_WRITE_CONFLICT', { cause });
    }
    const lockStat = fstatSync(lockFd);
    lockIdentity = { dev: lockStat.dev, ino: lockStat.ino };
    writeFileSync(lockFd, `${process.pid}\n`, 'utf8');
    fsyncSync(lockFd);
    fsyncDirectory(jobsDir);

    if (existsSync(target)) {
      const current = readStableJobState(target, state.jobId);
      const desiredDigest = createHash('sha256').update(bytes).digest('hex');
      if (current.digest === desiredDigest) return;
      assertJobStateTransition(current.state, state);
    }

    const stageFd = openSync(stagePath, 'wx', 0o600);
    try {
      writeFileSync(stageFd, bytes);
      fsyncSync(stageFd);
    } finally {
      closeSync(stageFd);
    }
    staged = true;
    renameSync(stagePath, target);
    staged = false;
    fsyncDirectory(jobsDir);
    const published = readStableJobState(target, state.jobId);
    if (published.digest !== createHash('sha256').update(bytes).digest('hex')) {
      throw new JobStateProjectionError('JOB_STATE_DURABILITY_HOLD');
    }
  } catch (cause) {
    if (cause instanceof JobStateProjectionError) throw cause;
    throw new JobStateProjectionError('JOB_STATE_DURABILITY_HOLD', { cause });
  } finally {
    if (staged) {
      try { unlinkSync(stagePath); } catch { /* private residue is not projection authority */ }
    }
    if (lockFd !== undefined) closeSync(lockFd);
    if (lockIdentity) {
      try {
        const observed = lstatSync(lockPath);
        if (observed.isFile()
          && observed.dev === lockIdentity.dev
          && observed.ino === lockIdentity.ino) {
          unlinkSync(lockPath);
          fsyncDirectory(jobsDir);
        }
      } catch {
        // A retained lock is an explicit fail-closed HOLD on later writers.
      }
    }
  }
}

export function readJobState(projectRoot: string, jobId: string): JobState | null {
  const jobPath = join(projectRoot, JOBS_DIR, `${jobId}.json`);
  if (!existsSync(jobPath)) return null;
  try {
    return JSON.parse(readFileSync(jobPath, 'utf-8')) as JobState;
  } catch { return null; }
}

/**
 * Build TaskSummary array from sprint tasks + result files on disk.
 * Public worker-writable result files are observational only: they may provide
 * bounded notes but can never provide a host evaluation decision.  Until a
 * host-private settlement authority is supplied to this projection, the
 * summary remains UNKNOWN rather than manufacturing terminal truth.  Falls
 * back gracefully when result files are missing (e.g., after cleanup).
 */
export function buildTaskSummaries(
  projectRoot: string,
  tasks: ReadonlyArray<{ id: string; title: string; assignedAgent?: string; assignedSkills?: string[] }>,
): TaskSummary[] {
  return tasks.map(task => {
    const resultPath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
    const evaluation = 'UNKNOWN';
    let notes = '';
    if (existsSync(resultPath)) {
      try {
        const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as {
          notes?: unknown;
        };
        notes = typeof result.notes === 'string' ? result.notes.substring(0, 200) : '';
      } catch { /* skip malformed result file */ }
    }
    return {
      taskId: task.id,
      title: task.title,
      evaluation,
      agent: task.assignedAgent ?? 'generic',
      skills: task.assignedSkills ?? [],
      notes,
    };
  });
}

export function readLatestJobState(projectRoot: string): JobState | null {
  const jobsDir = join(projectRoot, JOBS_DIR);
  if (!existsSync(jobsDir)) return null;
  try {
    const jobFiles = readdirSync(jobsDir)
      .filter(f => f.endsWith('.json'))
      .sort((left, right) => {
        const byTimestamp = executionJobTimestamp(right) - executionJobTimestamp(left);
        return byTimestamp !== 0 ? byTimestamp : right.localeCompare(left);
      });
    if (jobFiles.length === 0) return null;
    const jobId = (jobFiles[0] ?? '').replace('.json', '');
    return readJobState(projectRoot, jobId);
  } catch { return null; }
}
