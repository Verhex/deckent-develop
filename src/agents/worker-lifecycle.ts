/**
 * Worker Lifecycle — State Machine, Shutdown, Verify-Delta, Feedback Loop
 *
 * Extracted from worker.ts (Sprint 144 God Object Split).
 * Handles worker lifecycle state tracking, graceful SIGTERM shutdown,
 * atomic file writes, verify-delta honest assessment, and feedback loop helpers.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS_DIR } from '../core/constants.js';
import type { TaskResult, FeedbackLoop } from '../core/types.js';

// ─── Internal Helpers ───────────────────────────────────────────────

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function heartbeatFilePath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
}

function resultFilePath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
}

// ─── Atomic Write ───────────────────────────────────────────────────

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
  const fd = openSync(tmpPath, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, filePath);
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
 *
 * @param projectRoot - Project root directory
 * @param taskId - Task ID whose heartbeat should be finalized
 * @returns true if heartbeat was finalized as DONE, false otherwise
 */
export function finalizeHeartbeatOnShutdown(projectRoot: string, taskId: string): boolean {
  const resPath = resultFilePath(projectRoot, taskId);

  fsyncResultFile(projectRoot, taskId);

  if (!existsSync(resPath)) return false;

  try {
    const raw = readFileSync(resPath, 'utf-8');
    const result = JSON.parse(raw) as { selfAssessment?: string };

    if (!result.selfAssessment || !DONE_SET.has(result.selfAssessment)) {
      return false;
    }

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
    return false;
  }
}

// ─── SIGTERM Handler Registration ──────────────────────────────────

/**
 * Register a SIGTERM handler that finalizes heartbeat and flushes result on graceful shutdown.
 * Called at worker startup when running inside a Docker container.
 * Reads DECKENT_TASK_ID and DECKENT_PROJECT_ROOT from environment variables.
 */
function registerSigtermHandler(): void {
  const taskId = process.env['DECKENT_TASK_ID'];
  const projectRoot = process.env['DECKENT_PROJECT_ROOT'];

  if (!taskId || !projectRoot) return;

  process.on('SIGTERM', () => {
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

  const denominator = expectedFilesChangedCount != null && expectedFilesChangedCount > 0
    ? expectedFilesChangedCount
    : Math.max(filesChangedActual, 1);

  const newFilesChanged = Math.max(filesChangedActual - baseline.filesChangedBaseline, 0);
  const filesRatio = Math.min(newFilesChanged / denominator, 1);

  const testBaselineFails = baseline.testFailBaseline;
  let testRatio = 1;
  if (testBaselineFails > 0) {
    const testFixed = Math.max(testBaselineFails - testFailActual, 0);
    testRatio = testFixed / testBaselineFails;
  } else if (testFailActual > 0) {
    testRatio = 0;
  }

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
 */
export class WorkerStateMachine {
  private _state: WorkerLifecycleState;
  private readonly _workerId: string;
  private readonly _history: Array<{ from: WorkerLifecycleState; to: WorkerLifecycleState; timestamp: string }> = [];

  constructor(workerId: string, initialState: WorkerLifecycleState = 'SPAWNING') {
    this._workerId = workerId;
    this._state = initialState;
  }

  get state(): WorkerLifecycleState { return this._state; }
  get workerId(): string { return this._workerId; }
  get history(): ReadonlyArray<{ from: WorkerLifecycleState; to: WorkerLifecycleState; timestamp: string }> {
    return this._history;
  }

  transition(to: WorkerLifecycleState): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(this._state, to, this._workerId);
    }
    const from = this._state;
    this._state = to;
    this._history.push({ from, to, timestamp: new Date().toISOString() });
  }

  canTransition(to: WorkerLifecycleState): boolean {
    return VALID_TRANSITIONS[this._state].includes(to);
  }

  get isStoppable(): boolean {
    return STOPPABLE_STATES.has(this._state);
  }

  get isTerminal(): boolean {
    return TERMINAL_STATES.has(this._state);
  }

  forceState(state: WorkerLifecycleState): void {
    const from = this._state;
    this._state = state;
    this._history.push({ from, to: state, timestamp: new Date().toISOString() });
  }

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

export function getWorkerStateMachine(workerId: string): WorkerStateMachine {
  let sm = _workerStates.get(workerId);
  if (!sm) {
    sm = new WorkerStateMachine(workerId);
    _workerStates.set(workerId, sm);
  }
  return sm;
}

export function createWorkerStateMachine(workerId: string, initialState: WorkerLifecycleState = 'SPAWNING'): WorkerStateMachine {
  const sm = new WorkerStateMachine(workerId, initialState);
  _workerStates.set(workerId, sm);
  return sm;
}

export function removeWorkerStateMachine(workerId: string): boolean {
  return _workerStates.delete(workerId);
}

export function isWorkerStoppable(workerId: string): boolean {
  const sm = _workerStates.get(workerId);
  if (!sm) return false;
  return sm.isStoppable;
}

export function getAllWorkerStates(): ReadonlyMap<string, WorkerStateMachine> {
  return _workerStates;
}

export function clearWorkerStateRegistry(): void {
  _workerStates.clear();
}
