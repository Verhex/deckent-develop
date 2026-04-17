import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkerStateMachine,
  InvalidStateTransitionError,
  VALID_TRANSITIONS,
  STOPPABLE_STATES,
  TERMINAL_STATES,
  createWorkerStateMachine,
  getWorkerStateMachine,
  removeWorkerStateMachine,
  isWorkerStoppable,
  getAllWorkerStates,
  clearWorkerStateRegistry,
  atomicWriteFileSync,
  fsyncResultFile,
  finalizeHeartbeatOnShutdown,
  createFeedbackLoop,
  recordTscAttempt,
  recordTestAttempt,
  calculateSelfHealingRate,
  aggregateFeedbackLoops,
  writeVerifyDeltaBaseline,
  readVerifyDeltaBaseline,
  computeVerifyDelta,
  VERIFY_DELTA_DONE_THRESHOLD,
  VERIFY_DELTA_NO_GO_THRESHOLD,
  type WorkerLifecycleState,
} from '../../src/agents/worker-lifecycle.js';
import type { TaskResult } from '../../src/core/types.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  openSync: vi.fn(() => 42),
  closeSync: vi.fn(),
  fsyncSync: vi.fn(),
  renameSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedOpenSync = vi.mocked(openSync);
const mockedRenameSync = vi.mocked(renameSync);

beforeEach(() => {
  vi.clearAllMocks();
  clearWorkerStateRegistry();
  mockedExistsSync.mockReturnValue(false);
});

// ─── atomicWriteFileSync ────────────────────────────────────────────

describe('atomicWriteFileSync', () => {
  it('writes to tmp, fsyncs, then renames', () => {
    atomicWriteFileSync('/tmp/test.json', '{"ok":true}');

    expect(mockedWriteFileSync).toHaveBeenCalledWith('/tmp/test.json.tmp', '{"ok":true}', 'utf-8');
    expect(mockedOpenSync).toHaveBeenCalledWith('/tmp/test.json.tmp', 'r');
    expect(vi.mocked(fsyncSync)).toHaveBeenCalledWith(42);
    expect(vi.mocked(closeSync)).toHaveBeenCalledWith(42);
    expect(mockedRenameSync).toHaveBeenCalledWith('/tmp/test.json.tmp', '/tmp/test.json');
  });
});

// ─── fsyncResultFile ────────────────────────────────────────────────

describe('fsyncResultFile', () => {
  it('returns false when result file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    expect(fsyncResultFile('/project', '001')).toBe(false);
  });

  it('returns true when result file exists and fsync succeeds', () => {
    mockedExistsSync.mockReturnValue(true);
    expect(fsyncResultFile('/project', '001')).toBe(true);
  });
});

// ─── finalizeHeartbeatOnShutdown ─────────────────────────────────────

describe('finalizeHeartbeatOnShutdown', () => {
  it('returns false when no result file exists', () => {
    mockedExistsSync.mockReturnValue(false);
    expect(finalizeHeartbeatOnShutdown('/project', '001')).toBe(false);
  });

  it('returns true and writes DONE heartbeat for DONE result', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ selfAssessment: 'DONE' }) as never);

    const result = finalizeHeartbeatOnShutdown('/project', '001');
    expect(result).toBe(true);
    // atomicWriteFileSync called for HB
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it('returns false for NO_GO result', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ selfAssessment: 'NO_GO' }) as never);

    expect(finalizeHeartbeatOnShutdown('/project', '001')).toBe(false);
  });

  it('returns true for GO_WITH_TECH_DEBT result', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ selfAssessment: 'GO_WITH_TECH_DEBT' }) as never);

    expect(finalizeHeartbeatOnShutdown('/project', '001')).toBe(true);
  });
});

// ─── FeedbackLoop ───────────────────────────────────────────────────

describe('createFeedbackLoop', () => {
  it('creates a zeroed feedback loop', () => {
    const loop = createFeedbackLoop();
    expect(loop.tscAttempts).toBe(0);
    expect(loop.testAttempts).toBe(0);
    expect(loop.tscErrorsFixed).toBe(0);
    expect(loop.testFailuresFixed).toBe(0);
    expect(loop.totalRetryTimeMs).toBe(0);
  });
});

describe('recordTscAttempt', () => {
  it('increments tscAttempts and adds duration', () => {
    const loop = createFeedbackLoop();
    recordTscAttempt(loop, false, 1000);
    expect(loop.tscAttempts).toBe(1);
    expect(loop.totalRetryTimeMs).toBe(1000);
  });

  it('increments tscErrorsFixed on second successful attempt', () => {
    const loop = createFeedbackLoop();
    recordTscAttempt(loop, false, 500);
    recordTscAttempt(loop, true, 500);
    expect(loop.tscErrorsFixed).toBe(1);
  });
});

describe('recordTestAttempt', () => {
  it('increments testAttempts', () => {
    const loop = createFeedbackLoop();
    recordTestAttempt(loop, true, 200);
    expect(loop.testAttempts).toBe(1);
  });
});

describe('calculateSelfHealingRate', () => {
  it('returns 0 for empty results', () => {
    expect(calculateSelfHealingRate([])).toBe(0);
  });

  it('returns 100% when all retried tasks succeeded', () => {
    const results: TaskResult[] = [{
      taskId: '001', filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: true, coverage: 90, selfAssessment: 'DONE', notes: '',
      feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 500 },
    }];
    expect(calculateSelfHealingRate(results)).toBe(100);
  });

  it('returns 0 when all retried tasks failed', () => {
    const results: TaskResult[] = [{
      taskId: '001', filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: false, coverage: 0, selfAssessment: 'NO_GO', notes: '',
      feedbackLoop: { tscAttempts: 3, testAttempts: 3, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 3000 },
    }];
    expect(calculateSelfHealingRate(results)).toBe(0);
  });
});

describe('aggregateFeedbackLoops', () => {
  it('aggregates across multiple results', () => {
    const results: TaskResult[] = [
      {
        taskId: '001', filesChanged: [], linesAdded: 0, linesRemoved: 0,
        testsPassed: true, coverage: 90, selfAssessment: 'DONE', notes: '',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 500 },
      },
      {
        taskId: '002', filesChanged: [], linesAdded: 0, linesRemoved: 0,
        testsPassed: true, coverage: 85, selfAssessment: 'DONE', notes: '',
        feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 200 },
      },
    ];
    const agg = aggregateFeedbackLoops(results);
    expect(agg.totalTscAttempts).toBe(3);
    expect(agg.tasksWithRetries).toBe(1);
    expect(agg.tasksFirstPassSuccess).toBe(1);
  });
});

// ─── Verify Delta ───────────────────────────────────────────────────

describe('verify-delta baseline', () => {
  it('writes baseline JSON file', () => {
    mockedExistsSync.mockReturnValue(true);
    const baseline = writeVerifyDeltaBaseline('/project', '001', 3, 1);
    expect(baseline.taskId).toBe('001');
    expect(baseline.filesChangedBaseline).toBe(3);
    expect(baseline.testFailBaseline).toBe(1);
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it('readVerifyDeltaBaseline returns null when file missing', () => {
    mockedExistsSync.mockReturnValue(false);
    expect(readVerifyDeltaBaseline('/project', '001')).toBeNull();
  });

  it('readVerifyDeltaBaseline parses valid JSON', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '001', timestamp: '2026-01-01T00:00:00Z',
      filesChangedBaseline: 3, testFailBaseline: 0,
    }) as never);

    const baseline = readVerifyDeltaBaseline('/project', '001');
    expect(baseline?.taskId).toBe('001');
  });
});

describe('computeVerifyDelta', () => {
  it('returns null when no baseline exists', () => {
    mockedExistsSync.mockReturnValue(false);
    expect(computeVerifyDelta('/project', '001', 5, 0)).toBeNull();
  });

  it('returns DONE for high completion ratio', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '001', timestamp: '2026-01-01T00:00:00Z',
      filesChangedBaseline: 0, testFailBaseline: 0,
    }) as never);

    const result = computeVerifyDelta('/project', '001', 5, 0, 5);
    expect(result).not.toBeNull();
    expect(result!.recommendedAssessment).toBe('DONE');
    expect(result!.completionRatio).toBeGreaterThanOrEqual(VERIFY_DELTA_DONE_THRESHOLD);
  });

  it('returns NO_GO for low completion ratio', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '001', timestamp: '2026-01-01T00:00:00Z',
      filesChangedBaseline: 0, testFailBaseline: 0,
    }) as never);

    const result = computeVerifyDelta('/project', '001', 1, 5, 10);
    expect(result).not.toBeNull();
    expect(result!.recommendedAssessment).toBe('NO_GO');
  });
});

// ─── WorkerStateMachine ─────────────────────────────────────────────

describe('WorkerStateMachine', () => {
  it('starts in SPAWNING state by default', () => {
    const sm = new WorkerStateMachine('w-001');
    expect(sm.state).toBe('SPAWNING');
  });

  it('transitions through valid states', () => {
    const sm = new WorkerStateMachine('w-001');
    sm.transition('STARTING');
    sm.transition('EXECUTING');
    sm.transition('TESTING');
    sm.transition('WRITING_RESULT');
    sm.transition('DONE');
    expect(sm.state).toBe('DONE');
  });

  it('throws InvalidStateTransitionError on invalid transition', () => {
    const sm = new WorkerStateMachine('w-001');
    expect(() => sm.transition('DONE')).toThrow(InvalidStateTransitionError);
  });

  it('canTransition returns true for valid, false for invalid', () => {
    const sm = new WorkerStateMachine('w-001');
    expect(sm.canTransition('STARTING')).toBe(true);
    expect(sm.canTransition('DONE')).toBe(false);
  });

  it('tracks history', () => {
    const sm = new WorkerStateMachine('w-001');
    sm.transition('STARTING');
    sm.transition('EXECUTING');
    expect(sm.history.length).toBe(2);
    expect(sm.history[0]!.from).toBe('SPAWNING');
    expect(sm.history[0]!.to).toBe('STARTING');
  });

  it('isStoppable is true during active states', () => {
    const sm = new WorkerStateMachine('w-001');
    expect(sm.isStoppable).toBe(true);
    sm.transition('STARTING');
    expect(sm.isStoppable).toBe(true);
  });

  it('isTerminal is true for terminal states', () => {
    const sm = new WorkerStateMachine('w-001');
    sm.transition('ERROR');
    sm.transition('EXITED');
    expect(sm.isTerminal).toBe(true);
  });

  it('forceState bypasses validation', () => {
    const sm = new WorkerStateMachine('w-001');
    sm.forceState('ORPHAN');
    expect(sm.state).toBe('ORPHAN');
  });

  it('toJSON serializes state and history', () => {
    const sm = new WorkerStateMachine('w-001');
    sm.transition('STARTING');
    const json = sm.toJSON();
    expect(json.workerId).toBe('w-001');
    expect(json.state).toBe('STARTING');
    expect(json.history.length).toBe(1);
  });
});

// ─── Worker State Registry ──────────────────────────────────────────

describe('Worker State Registry', () => {
  it('createWorkerStateMachine creates and stores state machine', () => {
    const sm = createWorkerStateMachine('w-001');
    expect(sm.state).toBe('SPAWNING');
    expect(getAllWorkerStates().get('w-001')).toBe(sm);
  });

  it('getWorkerStateMachine creates on first access', () => {
    const sm = getWorkerStateMachine('w-002');
    expect(sm.state).toBe('SPAWNING');
  });

  it('removeWorkerStateMachine deletes entry', () => {
    createWorkerStateMachine('w-003');
    expect(removeWorkerStateMachine('w-003')).toBe(true);
    expect(getAllWorkerStates().has('w-003')).toBe(false);
  });

  it('isWorkerStoppable returns false for unknown worker', () => {
    expect(isWorkerStoppable('nonexistent')).toBe(false);
  });

  it('isWorkerStoppable returns true for active worker', () => {
    createWorkerStateMachine('w-004');
    expect(isWorkerStoppable('w-004')).toBe(true);
  });

  it('clearWorkerStateRegistry empties registry', () => {
    createWorkerStateMachine('w-005');
    clearWorkerStateRegistry();
    expect(getAllWorkerStates().size).toBe(0);
  });
});

// ─── Thresholds ─────────────────────────────────────────────────────

describe('constants', () => {
  it('VERIFY_DELTA_DONE_THRESHOLD is 0.8', () => {
    expect(VERIFY_DELTA_DONE_THRESHOLD).toBe(0.8);
  });

  it('VERIFY_DELTA_NO_GO_THRESHOLD is 0.5', () => {
    expect(VERIFY_DELTA_NO_GO_THRESHOLD).toBe(0.5);
  });
});

// ─── VALID_TRANSITIONS completeness ─────────────────────────────────

describe('VALID_TRANSITIONS', () => {
  const ALL_STATES: WorkerLifecycleState[] = [
    'SPAWNING', 'STARTING', 'EXECUTING', 'VERIFYING', 'TESTING',
    'WRITING_RESULT', 'DONE', 'EXITED', 'ERROR', 'ORPHAN',
  ];

  it('has an entry for every state', () => {
    for (const state of ALL_STATES) {
      expect(VALID_TRANSITIONS).toHaveProperty(state);
    }
  });

  it('EXITED has no valid transitions', () => {
    expect(VALID_TRANSITIONS.EXITED).toEqual([]);
  });

  it('ORPHAN has no valid transitions', () => {
    expect(VALID_TRANSITIONS.ORPHAN).toEqual([]);
  });
});

describe('State classification sets', () => {
  it('STOPPABLE_STATES contains active states', () => {
    expect(STOPPABLE_STATES.has('EXECUTING')).toBe(true);
    expect(STOPPABLE_STATES.has('DONE')).toBe(false);
  });

  it('TERMINAL_STATES contains terminal states', () => {
    expect(TERMINAL_STATES.has('DONE')).toBe(true);
    expect(TERMINAL_STATES.has('EXITED')).toBe(true);
    expect(TERMINAL_STATES.has('ERROR')).toBe(true);
    expect(TERMINAL_STATES.has('ORPHAN')).toBe(true);
    expect(TERMINAL_STATES.has('EXECUTING')).toBe(false);
  });
});
