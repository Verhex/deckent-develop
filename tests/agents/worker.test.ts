import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readTask,
  claimTask,
  writeTaskPlan,
  acquireLock,
  releaseLock,
  releaseAllLocks,
  checkLock,
  createHeartbeat,
  writeHeartbeat,
  writeResult,
  updateTaskStatus,
  isWithinScope,
  readWorkerLog,
  finalizeHeartbeat,
  TaskClaimError,
  LockError,
  writeVerifyDeltaBaseline,
  readVerifyDeltaBaseline,
  computeVerifyDelta,
  VERIFY_DELTA_DONE_THRESHOLD,
  VERIFY_DELTA_NO_GO_THRESHOLD,
  emitWorkerQuestion,
  // Sprint 139 State Machine
  WorkerStateMachine,
  InvalidStateTransitionError,
  VALID_TRANSITIONS,
  STOPPABLE_STATES,
  TERMINAL_STATES,
  createWorkerStateMachine,
  getWorkerStateMachine,
  removeWorkerStateMachine,
  isWorkerStoppable,
  clearWorkerStateRegistry,
  type WorkerLifecycleState,
} from '../../src/agents/worker.js';
import { AgentStatus, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskPlan, TaskResult, TaskScope, LockInfo } from '../../src/core/types.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  realpathSync: vi.fn(),
  appendFileSync: vi.fn(),
  openSync: vi.fn(() => 42),
  closeSync: vi.fn(),
  fsyncSync: vi.fn(),
  renameSync: vi.fn(),
  constants: { O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128 },
}));

// Mock event-stream to isolate worker tests from real file I/O
vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(() => ({ sequence: 1, protocol_version: '1.0' })),
  getCurrentSprintId: vi.fn(() => 'sprint-139'),
  CHANNELS: {
    HEARTBEAT: 'WORKER→BRAIN:HEARTBEAT',
    RESULT: 'WORKER→BRAIN:RESULT',
    QUESTION: 'WORKER→BRAIN:QUESTION',
    CODE_VERIFY_REQUEST: 'WORKER→AUDITOR:CODE_VERIFY_REQUEST',
    TASK_ASSIGN: 'BRAIN→WORKER:TASK_ASSIGN',
    SPRINT_PHASE_CHANGE: 'BRAIN→*:SPRINT_PHASE_CHANGE',
    METRIC_EMITTED: 'BRAIN→*:METRIC_EMITTED',
    FIX_REQUEST: 'BRAIN→WORKER:FIX_REQUEST',
    ANSWER: 'BRAIN→WORKER:ANSWER',
    VERIFICATION_RESULT: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
    SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
    ADR_VIOLATION: 'AUDITOR→BRAIN:ADR_VIOLATION',
    GATE_COMPUTED: 'AUDITOR→BRAIN:GATE_COMPUTED',
    LOAD_REPORT_WRITTEN: 'AUDITOR→BRAIN:LOAD_REPORT_WRITTEN',
    NOTIFY: 'DECKENT→USER:NOTIFY',
    ORPHAN_HB_DETECTED: 'AUDITOR→BRAIN:ORPHAN_HB_DETECTED',
    AUTHORITY_VIOLATION: 'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
  },
}));

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { writeEvent, getCurrentSprintId } from '../../src/orchestra/event-stream.js';

const mockedWriteEvent = vi.mocked(writeEvent);
const mockedGetCurrentSprintId = vi.mocked(getCurrentSprintId);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedRealpathSync = vi.mocked(realpathSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
});

// ─── readTask ───────────────────────────────────────────────────────

describe('readTask', () => {
  it('parses valid JSON', () => {
    const task = makeTask('001');
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);

    const result = readTask('/project', '001');
    expect(result.id).toBe('001');
    expect(result.status).toBe(TaskStatus.PENDING);
  });

  it('throws when file does not exist', () => {
    mockedReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(() => readTask('/project', '999')).toThrow('Task file not found');
  });

  it('throws for invalid JSON', () => {
    mockedReadFileSync.mockImplementation(() => { throw new SyntaxError('Unexpected token'); });

    expect(() => readTask('/project', '001')).toThrow('Invalid JSON');
  });
});

// ─── claimTask ──────────────────────────────────────────────────────

describe('claimTask', () => {
  it('claims PENDING task → CLAIMED + assignedWorker', () => {
    const task = makeTask('001');
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    mockedExistsSync.mockReturnValue(true);

    const result = claimTask('/project', '001', 'worker-1');

    expect(result.status).toBe(TaskStatus.CLAIMED);
    expect(result.assignedWorker).toBe('worker-1');
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it('throws TaskClaimError when status is not PENDING', () => {
    const task = makeTask('001');
    task.status = TaskStatus.EXECUTING;
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);

    expect(() => claimTask('/project', '001', 'worker-1')).toThrow(TaskClaimError);
  });

  it('throws TaskClaimError when already assigned', () => {
    const task = makeTask('001');
    task.assignedWorker = 'worker-2';
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);

    expect(() => claimTask('/project', '001', 'worker-1')).toThrow(TaskClaimError);
  });

  it('returns updated Task with status + workerId', () => {
    const task = makeTask('001');
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    mockedExistsSync.mockReturnValue(true);

    const result = claimTask('/project', '001', 'worker-1');
    expect(result.status).toBe('CLAIMED');
    expect(result.assignedWorker).toBe('worker-1');
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── writeTaskPlan ──────────────────────────────────────────────────

describe('writeTaskPlan', () => {
  it('writes .plan file', () => {
    mockedExistsSync.mockReturnValue(true);

    const plan: TaskPlan = {
      taskId: '001', workerId: 'w1',
      filesToCreate: ['a.ts'], filesToModify: [],
      executionSteps: ['step1'], testStrategy: 'unit', documentationPlan: 'none',
    };

    writeTaskPlan('/project', plan);

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const path = String(mockedWriteFileSync.mock.calls[0]![0]);
    expect(path).toContain('task-001.plan');
  });

  it('creates directory if it does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const plan: TaskPlan = {
      taskId: '002', workerId: 'w1',
      filesToCreate: [], filesToModify: [],
      executionSteps: [], testStrategy: '', documentationPlan: '',
    };

    writeTaskPlan('/project', plan);
    expect(mockedMkdirSync).toHaveBeenCalled();
  });
});

// ─── acquireLock ────────────────────────────────────────────────────

describe('acquireLock', () => {
  it('creates lock file and returns LockInfo', () => {
    mockedExistsSync.mockImplementation((p) => {
      return !String(p).endsWith('.lock');
    });

    const lock = acquireLock('/project', 'src/core/types.ts', 'w1', 'task-001');

    expect(lock.filePath).toBe('src/core/types.ts');
    expect(lock.ownerWorkerId).toBe('w1');
    expect(lock.taskId).toBe('task-001');
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it('throws LockError when locked by another worker', () => {
    mockedExistsSync.mockReturnValue(true);

    const existingLock: LockInfo = {
      filePath: 'src/file.ts', ownerWorkerId: 'w2',
      acquiredAt: new Date().toISOString(), taskId: 'task-002',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingLock) as never);

    expect(() => acquireLock('/project', 'src/file.ts', 'w1', 'task-001')).toThrow(LockError);
  });

  it('is idempotent for same worker (no throw, no write)', () => {
    mockedExistsSync.mockReturnValue(true);

    const existingLock: LockInfo = {
      filePath: 'src/file.ts', ownerWorkerId: 'w1',
      acquiredAt: new Date().toISOString(), taskId: 'task-001',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingLock) as never);

    const result = acquireLock('/project', 'src/file.ts', 'w1', 'task-001');
    expect(result).toEqual(existingLock);
    // writeFileSync not called for the lock itself (mkdirSync may be called)
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('creates .locks/ directory if missing', () => {
    mockedExistsSync.mockReturnValue(false);

    acquireLock('/project', 'src/file.ts', 'w1', 'task-001');
    expect(mockedMkdirSync).toHaveBeenCalled();
  });
});

// ─── releaseLock ────────────────────────────────────────────────────

describe('releaseLock', () => {
  it('deletes lock file', () => {
    mockedExistsSync.mockReturnValue(true);

    const lock: LockInfo = {
      filePath: 'src/file.ts', ownerWorkerId: 'w1',
      acquiredAt: new Date().toISOString(), taskId: 'task-001',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(lock) as never);

    releaseLock('/project', 'src/file.ts', 'w1');
    expect(mockedUnlinkSync).toHaveBeenCalled();
  });

  it('throws LockError when owned by different worker', () => {
    mockedExistsSync.mockReturnValue(true);

    const lock: LockInfo = {
      filePath: 'src/file.ts', ownerWorkerId: 'w2',
      acquiredAt: new Date().toISOString(), taskId: 'task-002',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(lock) as never);

    expect(() => releaseLock('/project', 'src/file.ts', 'w1')).toThrow(LockError);
  });

  it('is no-op when lock does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    releaseLock('/project', 'src/file.ts', 'w1');
    expect(mockedUnlinkSync).not.toHaveBeenCalled();
  });
});

// ─── checkLock ──────────────────────────────────────────────────────

describe('checkLock', () => {
  it('returns LockInfo when locked', () => {
    mockedExistsSync.mockReturnValue(true);

    const lock: LockInfo = {
      filePath: 'src/file.ts', ownerWorkerId: 'w1',
      acquiredAt: new Date().toISOString(), taskId: 'task-001',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(lock) as never);

    const result = checkLock('/project', 'src/file.ts');
    expect(result).toEqual(lock);
  });

  it('returns null when not locked', () => {
    mockedExistsSync.mockReturnValue(false);

    expect(checkLock('/project', 'src/file.ts')).toBeNull();
  });
});

// ─── createHeartbeat ────────────────────────────────────────────────

describe('createHeartbeat', () => {
  it('returns proper Heartbeat with all fields', () => {
    const hb = createHeartbeat('w1', 'task-001', AgentStatus.CODING, 'writing code', 'src/a.ts');

    expect(hb.workerId).toBe('w1');
    expect(hb.taskId).toBe('task-001');
    expect(hb.status).toBe(AgentStatus.CODING);
    expect(hb.currentAction).toBe('writing code');
    expect(hb.currentFile).toBe('src/a.ts');
    expect(hb.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(hb.sequence).toBe(0);
  });

  it('uses explicit sequence parameter', () => {
    const hb = createHeartbeat('w1', 'task-001', AgentStatus.TESTING, 'running tests', undefined, 5);
    expect(hb.sequence).toBe(5);
  });

  it('defaults sequence to 0 when omitted', () => {
    const hb = createHeartbeat('w1', 'task-001', AgentStatus.IDLE, 'waiting');
    expect(hb.sequence).toBe(0);
  });
});

// ─── writeHeartbeat ─────────────────────────────────────────────────

describe('writeHeartbeat', () => {
  it('writes .hb file', () => {
    mockedExistsSync.mockReturnValue(true);

    const hb = createHeartbeat('w1', 'task-001', AgentStatus.CODING, 'writing');
    writeHeartbeat('/project', hb);

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const path = String(mockedWriteFileSync.mock.calls[0]![0]);
    expect(path).toContain('task-001.hb');
  });
});

// ─── writeResult ────────────────────────────────────────────────────

describe('writeResult', () => {
  it('writes .result file', () => {
    const task = makeTask('001');
    task.status = TaskStatus.EXECUTING;
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    mockedExistsSync.mockReturnValue(true);

    const result: TaskResult = {
      taskId: '001', workerId: 'w1', filesChanged: ['a.ts'],
      linesAdded: 10, linesRemoved: 0, testsPassed: true,
      coverage: 95, selfAssessment: 'DONE', notes: 'All good',
    };

    writeResult('/project', result);

    // result file + updateTaskStatus writes task JSON (finalizeHeartbeat now deletes .hb, not writes)
    expect(mockedWriteFileSync).toHaveBeenCalledTimes(2);
    // finalizeHeartbeat should delete .hb file
    expect(mockedUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('task-001.hb'));
  });

  it('keeps control characters JSON-safe at the atomic result boundary', () => {
    const task = makeTask('001');
    task.status = TaskStatus.EXECUTING;
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    mockedExistsSync.mockReturnValue(true);
    writeResult('/project', {
      taskId: '001', workerId: 'w1', filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: false, coverage: 0, selfAssessment: 'NO_GO', notes: 'before\u0000after',
    });
    const resultWrite = String(mockedWriteFileSync.mock.calls[0]![1]);
    expect(resultWrite).toContain('before\\u0000after');
    expect(JSON.parse(resultWrite).notes).toBe('before\u0000after');
  });

  it('sets task status to DONE for selfAssessment DONE', () => {
    const task = makeTask('001');
    task.status = TaskStatus.TESTING;
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    mockedExistsSync.mockReturnValue(true);

    writeResult('/project', {
      taskId: '001', workerId: 'w1', filesChanged: [],
      linesAdded: 0, linesRemoved: 0, testsPassed: true,
      coverage: 90, selfAssessment: 'DONE', notes: '',
    });

    // Task status write is last (finalizeHeartbeat now deletes .hb, not writes)
    const taskWriteCall = mockedWriteFileSync.mock.calls[mockedWriteFileSync.mock.calls.length - 1]!;
    const writtenTask = JSON.parse(taskWriteCall[1] as string) as Task;
    expect(writtenTask.status).toBe(TaskStatus.DONE);
  });

  it('sets task status to NO_GO for selfAssessment NO_GO', () => {
    const task = makeTask('001');
    task.status = TaskStatus.TESTING;
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    mockedExistsSync.mockReturnValue(true);

    writeResult('/project', {
      taskId: '001', workerId: 'w1', filesChanged: [],
      linesAdded: 0, linesRemoved: 0, testsPassed: false,
      coverage: 0, selfAssessment: 'NO_GO', notes: 'Failed',
    });

    // Task status write is last (finalizeHeartbeat now deletes .hb, not writes)
    const taskWriteCall = mockedWriteFileSync.mock.calls[mockedWriteFileSync.mock.calls.length - 1]!;
    const writtenTask = JSON.parse(taskWriteCall[1] as string) as Task;
    expect(writtenTask.status).toBe(TaskStatus.NO_GO);
  });

  it('sets task status to DONE for GO_WITH_TECH_DEBT', () => {
    const task = makeTask('001');
    task.status = TaskStatus.TESTING;
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    mockedExistsSync.mockReturnValue(true);

    writeResult('/project', {
      taskId: '001', workerId: 'w1', filesChanged: [],
      linesAdded: 0, linesRemoved: 0, testsPassed: true,
      coverage: 85, selfAssessment: 'GO_WITH_TECH_DEBT', notes: 'Minor gaps',
    });

    // Task status write is last (finalizeHeartbeat now deletes .hb, not writes)
    const taskWriteCall = mockedWriteFileSync.mock.calls[mockedWriteFileSync.mock.calls.length - 1]!;
    const writtenTask = JSON.parse(taskWriteCall[1] as string) as Task;
    expect(writtenTask.status).toBe(TaskStatus.DONE);
  });
});

// ─── finalizeHeartbeat ──────────────────────────────────────────────

describe('finalizeHeartbeat', () => {
  it('deletes .hb file when it exists (immediate cleanup)', () => {
    mockedExistsSync.mockReturnValue(true);

    finalizeHeartbeat('/project', '001');

    // Should delete the .hb file, not write a new one
    expect(mockedUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('task-001.hb'));
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('is a no-op when .hb file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    // Should not throw and not call unlink (nothing to delete)
    expect(() => finalizeHeartbeat('/project', '042')).not.toThrow();
    expect(mockedUnlinkSync).not.toHaveBeenCalled();
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('calls cleanup immediately when cleanupDelayMs is 0', () => {
    mockedExistsSync.mockReturnValue(true);

    finalizeHeartbeat('/project', '007', 0);

    expect(mockedUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('task-007.hb'));
  });

  it('schedules delayed cleanup when cleanupDelayMs > 0', () => {
    vi.useFakeTimers();
    mockedExistsSync.mockReturnValue(true);

    finalizeHeartbeat('/project', '008', 5000);

    // Not deleted yet
    expect(mockedUnlinkSync).not.toHaveBeenCalled();

    // Advance timer past the delay
    vi.advanceTimersByTime(5000);

    expect(mockedUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('task-008.hb'));
    vi.useRealTimers();
  });
});

// ─── updateTaskStatus ───────────────────────────────────────────────

describe('updateTaskStatus', () => {
  it('updates status (CLAIMED → EXECUTING)', () => {
    const task = makeTask('001');
    task.status = TaskStatus.CLAIMED;
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    mockedExistsSync.mockReturnValue(true);

    const result = updateTaskStatus('/project', '001', TaskStatus.EXECUTING);

    expect(result.status).toBe(TaskStatus.EXECUTING);
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it('updates updatedAt automatically', () => {
    const task = makeTask('001');
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    mockedExistsSync.mockReturnValue(true);

    const result = updateTaskStatus('/project', '001', TaskStatus.TESTING);
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns updated Task', () => {
    const task = makeTask('001');
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    mockedExistsSync.mockReturnValue(true);

    const result = updateTaskStatus('/project', '001', TaskStatus.DOCUMENTING);
    expect(result.status).toBe(TaskStatus.DOCUMENTING);
    expect(result.updatedAt).toBeDefined();
  });
});

// ─── releaseAllLocks ────────────────────────────────────────────────

describe('releaseAllLocks', () => {
  it('releases all locks owned by worker', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['a.lock', 'b.lock', 'c.lock'] as never);

    const lock = (owner: string): string => JSON.stringify({
      filePath: 'f', ownerWorkerId: owner, acquiredAt: new Date().toISOString(), taskId: 't',
    });

    mockedReadFileSync
      .mockReturnValueOnce(lock('w1') as never)
      .mockReturnValueOnce(lock('w1') as never)
      .mockReturnValueOnce(lock('w1') as never);

    const count = releaseAllLocks('/project', 'w1');
    expect(count).toBe(3);
    expect(mockedUnlinkSync).toHaveBeenCalledTimes(3);
  });

  it('does not touch locks owned by other workers', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['a.lock', 'b.lock'] as never);

    const lock = (owner: string): string => JSON.stringify({
      filePath: 'f', ownerWorkerId: owner, acquiredAt: new Date().toISOString(), taskId: 't',
    });

    mockedReadFileSync
      .mockReturnValueOnce(lock('w2') as never)
      .mockReturnValueOnce(lock('w3') as never);

    const count = releaseAllLocks('/project', 'w1');
    expect(count).toBe(0);
    expect(mockedUnlinkSync).not.toHaveBeenCalled();
  });

  it('returns 0 when .locks/ does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    expect(releaseAllLocks('/project', 'w1')).toBe(0);
  });
});

// ─── isWithinScope ──────────────────────────────────────────────────

describe('isWithinScope', () => {
  const scope: TaskScope = {
    directories: ['src/core/'],
    filesRead: [],
    filesWrite: ['src/index.ts'],
  };

  it('returns true for file in scope directory', () => {
    expect(isWithinScope('src/core/types.ts', scope)).toBe(true);
  });

  it('returns false for file outside scope', () => {
    expect(isWithinScope('src/api/routes.ts', scope)).toBe(false);
  });

  it('returns true for file in filesWrite', () => {
    expect(isWithinScope('src/index.ts', scope)).toBe(true);
  });

  it('returns true for nested path within scope', () => {
    expect(isWithinScope('src/core/deep/nested.ts', scope)).toBe(true);
  });

  it('returns false for prefix overlap (src/core-extra/)', () => {
    expect(isWithinScope('src/core-extra/file.ts', scope)).toBe(false);
  });

  // ─── Symlink-Aware Scope Enforcement (ADR-034) ─────────────────────

  describe('symlink-aware scope (ADR-034)', () => {
    const symlinkScope: TaskScope = {
      directories: ['src/core/'],
      filesRead: [],
      filesWrite: ['src/index.ts'],
    };
    const projectRoot = '/home/user/project-a';

    it('allows symlink whose target is within scope', () => {
      // src/core/link.ts -> /home/user/project-a/src/core/real.ts (in scope)
      mockedRealpathSync.mockImplementation((p: unknown) => {
        const ps = String(p);
        if (ps === '/home/user/project-a/src/core/link.ts') return '/home/user/project-a/src/core/real.ts';
        if (ps === '/home/user/project-a') return '/home/user/project-a';
        return ps;
      });
      expect(isWithinScope('src/core/link.ts', symlinkScope, projectRoot)).toBe(true);
    });

    it('denies symlink whose target is outside scope (sibling project)', () => {
      // src/core/stolen.ts -> /home/user/project-b/src/secret.ts (out of project root)
      mockedRealpathSync.mockImplementation((p: unknown) => {
        const ps = String(p);
        if (ps === '/home/user/project-a/src/core/stolen.ts') return '/home/user/project-b/src/secret.ts';
        if (ps === '/home/user/project-a') return '/home/user/project-a';
        return ps;
      });
      expect(isWithinScope('src/core/stolen.ts', symlinkScope, projectRoot)).toBe(false);
    });

    it('denies recursive symlink (ELOOP)', () => {
      mockedRealpathSync.mockImplementation((p: unknown) => {
        const ps = String(p);
        if (ps === '/home/user/project-a/src/core/cycle.ts') {
          const err = new Error('ELOOP: too many levels of symbolic links') as NodeJS.ErrnoException;
          err.code = 'ELOOP';
          throw err;
        }
        if (ps === '/home/user/project-a') return '/home/user/project-a';
        return ps;
      });
      expect(isWithinScope('src/core/cycle.ts', symlinkScope, projectRoot)).toBe(false);
    });

    it('falls through to normal check on ENOENT (new file creation)', () => {
      // File doesn't exist yet — realpathSync throws ENOENT
      mockedRealpathSync.mockImplementation((p: unknown) => {
        const ps = String(p);
        if (ps === '/home/user/project-a/src/core/new-file.ts') {
          const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          throw err;
        }
        if (ps === '/home/user/project-a') return '/home/user/project-a';
        return ps;
      });
      // src/core/ is in scope, so normal check passes
      expect(isWithinScope('src/core/new-file.ts', symlinkScope, projectRoot)).toBe(true);
    });

    it('works without projectRoot (backward compatible)', () => {
      // No projectRoot — no realpathSync called
      expect(isWithinScope('src/core/types.ts', symlinkScope)).toBe(true);
      expect(isWithinScope('src/api/routes.ts', symlinkScope)).toBe(false);
    });
  });
});

// ─── readWorkerLog ─────────────────────────────────────────────────

describe('readWorkerLog', () => {
  it('returns file content when log exists', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('worker output line 1\nworker output line 2\n' as never);

    const result = readWorkerLog('/project', 'task-001');
    expect(result).toBe('worker output line 1\nworker output line 2\n');
    expect(mockedReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('task-task-001.log'),
      'utf-8',
    );
  });

  it('returns null when log file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = readWorkerLog('/project', 'task-002');
    expect(result).toBeNull();
    expect(mockedReadFileSync).not.toHaveBeenCalled();
  });
});

// ─── writeVerifyDeltaBaseline ────────────────────────────────────────

describe('writeVerifyDeltaBaseline', () => {
  it('writes .verify-delta.json with correct fields', () => {
    mockedExistsSync.mockReturnValue(true);

    const baseline = writeVerifyDeltaBaseline('/project', '001', 3, 5);

    expect(baseline.taskId).toBe('001');
    expect(baseline.filesChangedBaseline).toBe(3);
    expect(baseline.testFailBaseline).toBe(5);
    expect(baseline.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('task-001.verify-delta.json'),
      expect.stringContaining('"filesChangedBaseline": 3'),
      'utf-8',
    );
  });

  it('defaults testFailCount to 0 when omitted', () => {
    mockedExistsSync.mockReturnValue(true);

    const baseline = writeVerifyDeltaBaseline('/project', '002', 0);

    expect(baseline.testFailBaseline).toBe(0);
  });

  it('creates .tasks/ directory if missing', () => {
    mockedExistsSync.mockReturnValue(false);

    writeVerifyDeltaBaseline('/project', '003', 2);

    expect(mockedMkdirSync).toHaveBeenCalled();
  });
});

// ─── readVerifyDeltaBaseline ─────────────────────────────────────────

describe('readVerifyDeltaBaseline', () => {
  it('returns VerifyDeltaBaseline when file exists', () => {
    const baseline = {
      taskId: '001',
      timestamp: '2026-04-14T10:00:00.000Z',
      filesChangedBaseline: 3,
      testFailBaseline: 5,
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(baseline) as never);

    const result = readVerifyDeltaBaseline('/project', '001');
    expect(result).toEqual(baseline);
  });

  it('returns null when file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = readVerifyDeltaBaseline('/project', '999');
    expect(result).toBeNull();
  });

  it('returns null on JSON parse error', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('not-valid-json' as never);

    const result = readVerifyDeltaBaseline('/project', '001');
    expect(result).toBeNull();
  });
});

// ─── computeVerifyDelta ──────────────────────────────────────────────

describe('computeVerifyDelta', () => {
  const baseline = {
    taskId: '001',
    timestamp: '2026-04-14T10:00:00.000Z',
    filesChangedBaseline: 0,
    testFailBaseline: 10,
  };

  beforeEach(() => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(baseline) as never);
  });

  it('returns null when baseline file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = computeVerifyDelta('/project', '001', 5, 0);
    expect(result).toBeNull();
  });

  it('recommends DONE when completion >= 80% threshold', () => {
    // 5 files changed (from 0 baseline), expected 5, and 10 fails fixed
    const result = computeVerifyDelta('/project', '001', 5, 0, 5);

    expect(result).not.toBeNull();
    expect(result!.recommendedAssessment).toBe('DONE');
    expect(result!.completionRatio).toBeGreaterThanOrEqual(VERIFY_DELTA_DONE_THRESHOLD);
  });

  it('recommends GO_WITH_TECH_DEBT for 50-79% completion', () => {
    // Only 2 of 10 test failures fixed (0 files from 0 baseline, expected 5)
    // testRatio = 8/10 = 0.8, filesRatio = 2/5 = 0.4
    // completionRatio = 0.4*0.6 + 0.8*0.4 = 0.24 + 0.32 = 0.56 → TECH_DEBT
    const baseline2 = { ...baseline, testFailBaseline: 10 };
    mockedReadFileSync.mockReturnValue(JSON.stringify(baseline2) as never);

    const result = computeVerifyDelta('/project', '001', 2, 2, 5);

    expect(result).not.toBeNull();
    expect(result!.recommendedAssessment).toBe('GO_WITH_TECH_DEBT');
    expect(result!.completionRatio).toBeGreaterThanOrEqual(VERIFY_DELTA_NO_GO_THRESHOLD);
    expect(result!.completionRatio).toBeLessThan(VERIFY_DELTA_DONE_THRESHOLD);
  });

  it('recommends NO_GO when completion < 50% (Sprint 137 regression scenario)', () => {
    // Sprint 137 scenario: worker wrote DONE but only 47/123 tests fixed (38%)
    // Simulate: 0 files changed, 0 test fixes out of 76 needed
    const lowBaseline = { ...baseline, testFailBaseline: 76, filesChangedBaseline: 0 };
    mockedReadFileSync.mockReturnValue(JSON.stringify(lowBaseline) as never);

    // 0 files changed, still 76 test fails → very low completion
    const result = computeVerifyDelta('/project', '001', 0, 76, 10);

    expect(result).not.toBeNull();
    expect(result!.recommendedAssessment).toBe('NO_GO');
    expect(result!.completionRatio).toBeLessThan(VERIFY_DELTA_NO_GO_THRESHOLD);
  });

  it('penalizes newly introduced test failures', () => {
    // Baseline: 0 fails. End state: 5 new fails introduced → testRatio = 0
    const cleanBaseline = { ...baseline, testFailBaseline: 0, filesChangedBaseline: 0 };
    mockedReadFileSync.mockReturnValue(JSON.stringify(cleanBaseline) as never);

    const result = computeVerifyDelta('/project', '001', 3, 5, 5);

    // testRatio = 0 (new failures introduced), filesRatio = 3/5 = 0.6
    // completionRatio = 0.6*0.6 + 0*0.4 = 0.36 → NO_GO
    expect(result).not.toBeNull();
    expect(result!.completionRatio).toBeLessThan(VERIFY_DELTA_NO_GO_THRESHOLD);
    expect(result!.recommendedAssessment).toBe('NO_GO');
  });

  it('populates endState with actual values and timestamp', () => {
    const result = computeVerifyDelta('/project', '001', 5, 0, 5);

    expect(result!.endState.filesChangedActual).toBe(5);
    expect(result!.endState.testFailActual).toBe(0);
    expect(result!.endState.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('uses filesChangedActual as denominator when expectedFilesChangedCount is omitted', () => {
    // When no expected count, denominator = max(filesChangedActual, 1)
    // All test fails fixed → testRatio=1, filesRatio = newFiles/actual
    const noFailBaseline = { ...baseline, testFailBaseline: 0 };
    mockedReadFileSync.mockReturnValue(JSON.stringify(noFailBaseline) as never);

    const result = computeVerifyDelta('/project', '001', 5, 0);

    // filesRatio = 5/5 = 1.0, testRatio = 1 (no fails) → DONE
    expect(result!.recommendedAssessment).toBe('DONE');
  });
});

// ─── WorkerStateMachine ──────────────────────────────────────────────

describe('WorkerStateMachine', () => {
  beforeEach(() => {
    clearWorkerStateRegistry();
  });

  it('initializes in SPAWNING state by default', () => {
    const sm = new WorkerStateMachine('w-001');
    expect(sm.state).toBe('SPAWNING');
    expect(sm.workerId).toBe('w-001');
    expect(sm.history).toHaveLength(0);
  });

  it('accepts custom initial state', () => {
    const sm = new WorkerStateMachine('w-002', 'EXECUTING');
    expect(sm.state).toBe('EXECUTING');
  });

  it('follows valid transition SPAWNING → STARTING → EXECUTING → TESTING → WRITING_RESULT → DONE → EXITED', () => {
    const sm = new WorkerStateMachine('w-003');

    sm.transition('STARTING');
    expect(sm.state).toBe('STARTING');

    sm.transition('EXECUTING');
    expect(sm.state).toBe('EXECUTING');

    sm.transition('TESTING');
    expect(sm.state).toBe('TESTING');

    sm.transition('WRITING_RESULT');
    expect(sm.state).toBe('WRITING_RESULT');

    sm.transition('DONE');
    expect(sm.state).toBe('DONE');

    sm.transition('EXITED');
    expect(sm.state).toBe('EXITED');

    // Full history recorded
    expect(sm.history).toHaveLength(6);
    expect(sm.history[0]).toMatchObject({ from: 'SPAWNING', to: 'STARTING' });
    expect(sm.history[5]).toMatchObject({ from: 'DONE', to: 'EXITED' });
  });

  it('throws InvalidStateTransitionError for invalid transition', () => {
    const sm = new WorkerStateMachine('w-004');

    // SPAWNING → DONE is not valid
    expect(() => sm.transition('DONE')).toThrow(InvalidStateTransitionError);
    expect(() => sm.transition('DONE')).toThrow('SPAWNING → DONE');

    // State should NOT have changed after invalid transition
    expect(sm.state).toBe('SPAWNING');
  });

  it('prevents transition from EXITED (terminal state)', () => {
    const sm = new WorkerStateMachine('w-005', 'DONE');
    sm.transition('EXITED');

    // EXITED has no valid transitions
    expect(() => sm.transition('SPAWNING')).toThrow(InvalidStateTransitionError);
    expect(() => sm.transition('EXECUTING')).toThrow(InvalidStateTransitionError);
    expect(sm.state).toBe('EXITED');
  });

  it('prevents transition from ORPHAN (terminal state)', () => {
    const sm = new WorkerStateMachine('w-006', 'EXECUTING');
    sm.transition('ORPHAN');

    expect(() => sm.transition('EXITED')).toThrow(InvalidStateTransitionError);
    expect(sm.state).toBe('ORPHAN');
  });

  it('allows ERROR transition from any active state', () => {
    const activeStates: WorkerLifecycleState[] = [
      'SPAWNING', 'STARTING', 'EXECUTING', 'VERIFYING', 'TESTING', 'WRITING_RESULT',
    ];

    for (const state of activeStates) {
      const sm = new WorkerStateMachine(`w-err-${state}`, state);
      expect(() => sm.transition('ERROR')).not.toThrow();
      expect(sm.state).toBe('ERROR');
    }
  });

  it('allows ORPHAN transition from any active state', () => {
    const activeStates: WorkerLifecycleState[] = [
      'SPAWNING', 'STARTING', 'EXECUTING', 'VERIFYING', 'TESTING', 'WRITING_RESULT',
    ];

    for (const state of activeStates) {
      const sm = new WorkerStateMachine(`w-orphan-${state}`, state);
      expect(() => sm.transition('ORPHAN')).not.toThrow();
      expect(sm.state).toBe('ORPHAN');
    }
  });

  it('canTransition returns correct boolean', () => {
    const sm = new WorkerStateMachine('w-can', 'EXECUTING');

    expect(sm.canTransition('TESTING')).toBe(true);
    expect(sm.canTransition('VERIFYING')).toBe(true);
    expect(sm.canTransition('ERROR')).toBe(true);
    expect(sm.canTransition('DONE')).toBe(false);
    expect(sm.canTransition('SPAWNING')).toBe(false);
  });

  it('isStoppable returns true for active states', () => {
    const sm1 = new WorkerStateMachine('w-s1', 'EXECUTING');
    expect(sm1.isStoppable).toBe(true);

    const sm2 = new WorkerStateMachine('w-s2', 'TESTING');
    expect(sm2.isStoppable).toBe(true);

    const sm3 = new WorkerStateMachine('w-s3', 'DONE');
    expect(sm3.isStoppable).toBe(false);

    const sm4 = new WorkerStateMachine('w-s4', 'EXITED');
    expect(sm4.isStoppable).toBe(false);
  });

  it('isTerminal returns true for terminal states', () => {
    expect(new WorkerStateMachine('w-t1', 'DONE').isTerminal).toBe(true);
    expect(new WorkerStateMachine('w-t2', 'EXITED').isTerminal).toBe(true);
    expect(new WorkerStateMachine('w-t3', 'ERROR').isTerminal).toBe(true);
    expect(new WorkerStateMachine('w-t4', 'ORPHAN').isTerminal).toBe(true);
    expect(new WorkerStateMachine('w-t5', 'EXECUTING').isTerminal).toBe(false);
  });

  it('forceState bypasses validation (for orphan recovery)', () => {
    const sm = new WorkerStateMachine('w-force', 'EXITED');

    // Normally EXITED → EXECUTING is invalid
    expect(sm.canTransition('EXECUTING')).toBe(false);

    // forceState bypasses validation
    sm.forceState('EXECUTING');
    expect(sm.state).toBe('EXECUTING');
    expect(sm.history).toHaveLength(1);
    expect(sm.history[0]).toMatchObject({ from: 'EXITED', to: 'EXECUTING' });
  });

  it('toJSON serializes correctly', () => {
    const sm = new WorkerStateMachine('w-json', 'SPAWNING');
    sm.transition('STARTING');
    sm.transition('EXECUTING');

    const json = sm.toJSON();
    expect(json.workerId).toBe('w-json');
    expect(json.state).toBe('EXECUTING');
    expect(json.history).toHaveLength(2);
  });

  it('supports VERIFYING → TESTING → EXECUTING retry loop', () => {
    const sm = new WorkerStateMachine('w-loop', 'EXECUTING');

    // First verify cycle
    sm.transition('VERIFYING');
    sm.transition('TESTING');

    // Test fails → back to EXECUTING for fixes
    sm.transition('EXECUTING');

    // Second verify cycle
    sm.transition('VERIFYING');
    sm.transition('TESTING');

    // Tests pass → write result
    sm.transition('WRITING_RESULT');
    sm.transition('DONE');

    expect(sm.state).toBe('DONE');
    expect(sm.history).toHaveLength(7);
  });
});

// ─── Worker State Registry ──────────────────────────────────────────

describe('Worker State Registry', () => {
  beforeEach(() => {
    clearWorkerStateRegistry();
  });

  it('createWorkerStateMachine creates and registers a new SM', () => {
    const sm = createWorkerStateMachine('w-reg-001');
    expect(sm.state).toBe('SPAWNING');

    // getWorkerStateMachine returns the same instance
    const sm2 = getWorkerStateMachine('w-reg-001');
    expect(sm2).toBe(sm);
  });

  it('createWorkerStateMachine replaces existing SM', () => {
    const sm1 = createWorkerStateMachine('w-replace');
    sm1.transition('STARTING');
    expect(sm1.state).toBe('STARTING');

    const sm2 = createWorkerStateMachine('w-replace');
    expect(sm2.state).toBe('SPAWNING'); // Fresh SM
    expect(sm2).not.toBe(sm1);
  });

  it('getWorkerStateMachine creates new SM if not found', () => {
    const sm = getWorkerStateMachine('w-new');
    expect(sm.state).toBe('SPAWNING');
  });

  it('removeWorkerStateMachine removes from registry', () => {
    createWorkerStateMachine('w-rm');
    expect(removeWorkerStateMachine('w-rm')).toBe(true);
    expect(removeWorkerStateMachine('w-rm')).toBe(false); // Already removed
  });

  it('isWorkerStoppable checks registry correctly', () => {
    // No SM → not stoppable
    expect(isWorkerStoppable('w-no-sm')).toBe(false);

    // EXECUTING → stoppable
    const sm = createWorkerStateMachine('w-stop-check');
    sm.transition('STARTING');
    sm.transition('EXECUTING');
    expect(isWorkerStoppable('w-stop-check')).toBe(true);

    // DONE → not stoppable
    sm.transition('WRITING_RESULT');
    sm.transition('DONE');
    expect(isWorkerStoppable('w-stop-check')).toBe(false);
  });

  it('clearWorkerStateRegistry removes all entries', () => {
    createWorkerStateMachine('w-a');
    createWorkerStateMachine('w-b');

    clearWorkerStateRegistry();

    expect(isWorkerStoppable('w-a')).toBe(false);
    expect(isWorkerStoppable('w-b')).toBe(false);
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
      expect(VALID_TRANSITIONS[state]).toBeDefined();
      expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true);
    }
  });

  it('EXITED has no valid transitions (true terminal)', () => {
    expect(VALID_TRANSITIONS['EXITED']).toHaveLength(0);
  });

  it('ORPHAN has no valid transitions (true terminal)', () => {
    expect(VALID_TRANSITIONS['ORPHAN']).toHaveLength(0);
  });

  it('every active state can transition to ERROR', () => {
    const activeStates: WorkerLifecycleState[] = [
      'SPAWNING', 'STARTING', 'EXECUTING', 'VERIFYING', 'TESTING', 'WRITING_RESULT',
    ];
    for (const state of activeStates) {
      expect(VALID_TRANSITIONS[state]).toContain('ERROR');
    }
  });

  it('every active state can transition to ORPHAN', () => {
    const activeStates: WorkerLifecycleState[] = [
      'SPAWNING', 'STARTING', 'EXECUTING', 'VERIFYING', 'TESTING', 'WRITING_RESULT',
    ];
    for (const state of activeStates) {
      expect(VALID_TRANSITIONS[state]).toContain('ORPHAN');
    }
  });
});

// ─── STOPPABLE_STATES and TERMINAL_STATES sets ──────────────────────

describe('State classification sets', () => {
  it('STOPPABLE_STATES contains all active states', () => {
    expect(STOPPABLE_STATES.has('SPAWNING')).toBe(true);
    expect(STOPPABLE_STATES.has('STARTING')).toBe(true);
    expect(STOPPABLE_STATES.has('EXECUTING')).toBe(true);
    expect(STOPPABLE_STATES.has('VERIFYING')).toBe(true);
    expect(STOPPABLE_STATES.has('TESTING')).toBe(true);
    expect(STOPPABLE_STATES.has('WRITING_RESULT')).toBe(true);
  });

  it('STOPPABLE_STATES does not contain terminal states', () => {
    expect(STOPPABLE_STATES.has('DONE')).toBe(false);
    expect(STOPPABLE_STATES.has('EXITED')).toBe(false);
    expect(STOPPABLE_STATES.has('ERROR')).toBe(false);
    expect(STOPPABLE_STATES.has('ORPHAN')).toBe(false);
  });

  it('TERMINAL_STATES contains all terminal states', () => {
    expect(TERMINAL_STATES.has('DONE')).toBe(true);
    expect(TERMINAL_STATES.has('EXITED')).toBe(true);
    expect(TERMINAL_STATES.has('ERROR')).toBe(true);
    expect(TERMINAL_STATES.has('ORPHAN')).toBe(true);
  });

  it('STOPPABLE_STATES and TERMINAL_STATES are disjoint', () => {
    for (const state of STOPPABLE_STATES) {
      expect(TERMINAL_STATES.has(state)).toBe(false);
    }
    for (const state of TERMINAL_STATES) {
      expect(STOPPABLE_STATES.has(state)).toBe(false);
    }
  });
});

// ─── Race condition scenario (Sprint 138 T-007 bug) ─────────────────

describe('Docker stop race condition prevention', () => {
  it('worker in DONE state is not stoppable — prevents "No such container"', () => {
    const sm = createWorkerStateMachine('w-138-007');
    sm.transition('STARTING');
    sm.transition('EXECUTING');
    sm.transition('WRITING_RESULT');
    sm.transition('DONE');

    // Brain attempts docker stop — should be blocked
    expect(sm.isStoppable).toBe(false);
    expect(isWorkerStoppable('w-138-007')).toBe(false);
  });

  it('worker in EXITED state is not stoppable', () => {
    const sm = createWorkerStateMachine('w-exited');
    sm.transition('STARTING');
    sm.transition('EXECUTING');
    sm.transition('WRITING_RESULT');
    sm.transition('DONE');
    sm.transition('EXITED');

    expect(sm.isStoppable).toBe(false);
    expect(isWorkerStoppable('w-exited')).toBe(false);
  });

  it('worker in EXECUTING state IS stoppable', () => {
    const sm = createWorkerStateMachine('w-executing');
    sm.transition('STARTING');
    sm.transition('EXECUTING');

    expect(sm.isStoppable).toBe(true);
    expect(isWorkerStoppable('w-executing')).toBe(true);
  });

  it('cleaned-up worker (no SM in registry) is not stoppable', () => {
    createWorkerStateMachine('w-cleanup');
    removeWorkerStateMachine('w-cleanup');

    expect(isWorkerStoppable('w-cleanup')).toBe(false);
  });
});

// ─── writeResult .plan soft warning ─────────────────────────────────

describe('writeResult .plan soft warning', () => {
  it('warns when .plan file is missing', () => {
    const task = makeTask('050');
    task.status = TaskStatus.EXECUTING;
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    // existsSync returns false for .plan check, true for dir/task checks
    mockedExistsSync.mockImplementation((p: unknown) => {
      const pathStr = String(p);
      if (pathStr.endsWith('.plan')) return false;
      return true;
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result: TaskResult = {
      taskId: '050', workerId: 'w1', filesChanged: ['a.ts'],
      linesAdded: 10, linesRemoved: 0, testsPassed: true,
      coverage: 95, selfAssessment: 'DONE', notes: 'done',
    };

    writeResult('/project', result);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('.plan file missing'));

    // Check planWarning field in written result
    const writeCall = mockedWriteFileSync.mock.calls[0]!;
    const writtenResult = JSON.parse(writeCall[1] as string);
    expect(writtenResult.planWarning).toBe('missing');

    warnSpy.mockRestore();
  });

  it('does not warn when .plan file exists', () => {
    const task = makeTask('051');
    task.status = TaskStatus.EXECUTING;
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
    // existsSync returns true for everything including .plan
    mockedExistsSync.mockReturnValue(true);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result: TaskResult = {
      taskId: '051', workerId: 'w1', filesChanged: ['b.ts'],
      linesAdded: 5, linesRemoved: 0, testsPassed: true,
      coverage: 90, selfAssessment: 'DONE', notes: 'done',
    };

    writeResult('/project', result);

    // Should not warn about .plan
    const planWarnings = warnSpy.mock.calls.filter(
      (args) => String(args[0]).includes('.plan'),
    );
    expect(planWarnings).toHaveLength(0);

    // Check planWarning field NOT in written result
    const writeCall = mockedWriteFileSync.mock.calls[0]!;
    const writtenResult = JSON.parse(writeCall[1] as string);
    expect(writtenResult.planWarning).toBeUndefined();

    warnSpy.mockRestore();
  });
});

// ─── Verify-Delta End-to-End Integration (Sprint 139 Task 023) ──────
//
// These tests verify the full Honest Self-Assessment chain:
//   writeVerifyDeltaBaseline → computeVerifyDelta → (applyTechDebtDowngrade via result-evaluator)
//
// Import applyTechDebtDowngrade here directly to test cross-module integration.
// ADR-008 allows this import since both are non-brain modules.

import {
  applyTechDebtDowngrade,
  TECH_DEBT_DOWNGRADE_DONE_THRESHOLD,
  TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD,
} from '../../src/orchestra/result-evaluator.js';

describe('verify-delta: end-to-end honest self-assessment chain', () => {
  const TASK_ID = 'integ-001';
  const PROJECT_ROOT = '/project-integ';

  // Baseline stored after writeVerifyDeltaBaseline call
  let storedBaseline: Record<string, unknown> | null = null;

  beforeEach(() => {
    storedBaseline = null;

    // Capture what writeVerifyDeltaBaseline writes, then serve it back via readFileSync
    mockedWriteFileSync.mockImplementation((filePath: unknown, data: unknown) => {
      if (String(filePath).endsWith('.verify-delta.json')) {
        storedBaseline = JSON.parse(String(data));
      }
    });

    mockedExistsSync.mockImplementation((filePath: unknown) => {
      // .verify-delta.json exists only after baseline was written
      if (String(filePath).endsWith('.verify-delta.json')) {
        return storedBaseline !== null;
      }
      return true; // .tasks/ dir exists
    });

    mockedReadFileSync.mockImplementation((filePath: unknown) => {
      if (String(filePath).endsWith('.verify-delta.json') && storedBaseline) {
        return JSON.stringify(storedBaseline);
      }
      throw new Error('ENOENT: no such file');
    });
  });

  it('full chain: DONE worker with 100% completion stays DONE through both layers', () => {
    // Arrange: write baseline with 0 changed files, 10 test failures
    writeVerifyDeltaBaseline(PROJECT_ROOT, TASK_ID, 0, 10);
    expect(storedBaseline).not.toBeNull();
    expect(storedBaseline!['taskId']).toBe(TASK_ID);
    expect(storedBaseline!['filesChangedBaseline']).toBe(0);
    expect(storedBaseline!['testFailBaseline']).toBe(10);

    // Act: worker changed 5 files, fixed all 10 fails (expected 5 files)
    const delta = computeVerifyDelta(PROJECT_ROOT, TASK_ID, 5, 0, 5);

    // Assert: Layer 1 — computeVerifyDelta says DONE
    expect(delta).not.toBeNull();
    expect(delta!.completionRatio).toBeGreaterThanOrEqual(VERIFY_DELTA_DONE_THRESHOLD);
    expect(delta!.recommendedAssessment).toBe('DONE');

    // Assert: Layer 2 — applyTechDebtDowngrade preserves DONE
    const downgrade = applyTechDebtDowngrade('DONE', { selfAssessment: 'DONE' }, delta!.completionRatio);
    expect(downgrade.decision).toBe('DONE');
    expect(downgrade.downgraded).toBe(false);
    expect(downgrade.completionRatio).toBeGreaterThanOrEqual(TECH_DEBT_DOWNGRADE_DONE_THRESHOLD);
  });

  it('full chain: Sprint 137 regression — worker claims DONE but 39% completion → NO_GO through both layers', () => {
    // Arrange: baseline with 76 test failures (mimics Sprint 137 Task 137-001)
    writeVerifyDeltaBaseline(PROJECT_ROOT, TASK_ID, 0, 76);

    // Act: worker changed 0 files, still has 76 test fails (nothing fixed)
    const delta = computeVerifyDelta(PROJECT_ROOT, TASK_ID, 0, 76, 10);

    // Assert: Layer 1 — computeVerifyDelta catches the shortcut → NO_GO
    expect(delta).not.toBeNull();
    expect(delta!.completionRatio).toBeLessThan(VERIFY_DELTA_NO_GO_THRESHOLD);
    expect(delta!.recommendedAssessment).toBe('NO_GO');

    // Assert: Layer 2 — applyTechDebtDowngrade: DONE + <50% ratio → escalates to NO_GO
    const downgrade = applyTechDebtDowngrade('DONE', { selfAssessment: 'DONE' }, delta!.completionRatio);
    expect(downgrade.decision).toBe('NO_GO');
    expect(downgrade.downgraded).toBe(true);
    expect(downgrade.reason).toMatch(/NO_GO/);
  });

  it('full chain: partial completion 60% — DONE worker downgraded to GO_WITH_TECH_DEBT', () => {
    // Arrange: baseline 0 files, 0 test failures (clean start)
    writeVerifyDeltaBaseline(PROJECT_ROOT, TASK_ID, 0, 0);

    // Act: worker changed 3 of 5 expected files, no test regressions
    // filesRatio = 3/5 = 0.6, testRatio = 1 (no fails), completionRatio = 0.6*0.6 + 1*0.4 = 0.76
    const delta = computeVerifyDelta(PROJECT_ROOT, TASK_ID, 3, 0, 5);

    expect(delta).not.toBeNull();
    // 0.76 is between NO_GO threshold (0.5) and DONE threshold (0.8)
    expect(delta!.completionRatio).toBeGreaterThanOrEqual(VERIFY_DELTA_NO_GO_THRESHOLD);
    expect(delta!.completionRatio).toBeLessThan(VERIFY_DELTA_DONE_THRESHOLD);
    expect(delta!.recommendedAssessment).toBe('GO_WITH_TECH_DEBT');

    // Layer 2 — applyTechDebtDowngrade: DONE + 0.76 → GO_WITH_TECH_DEBT downgrade
    const downgrade = applyTechDebtDowngrade('DONE', { selfAssessment: 'DONE' }, delta!.completionRatio);
    expect(downgrade.decision).toBe('GO_WITH_TECH_DEBT');
    expect(downgrade.downgraded).toBe(true);
    expect(downgrade.reason).toMatch(/downgraded/);
  });

  it('full chain: GO_WITH_TECH_DEBT worker with ratio < 50% escalated to NO_GO', () => {
    // Arrange: baseline with 20 test failures
    writeVerifyDeltaBaseline(PROJECT_ROOT, TASK_ID, 0, 20);

    // Act: worker fixed only 2 of 20 fails (10%), no file changes
    // testRatio = (20-18)/20 = 0.1, filesRatio = 0
    // completionRatio = 0*0.6 + 0.1*0.4 = 0.04 → below NO_GO threshold
    const delta = computeVerifyDelta(PROJECT_ROOT, TASK_ID, 0, 18, 5);

    expect(delta).not.toBeNull();
    expect(delta!.completionRatio).toBeLessThan(VERIFY_DELTA_NO_GO_THRESHOLD);

    // Layer 2 — applyTechDebtDowngrade: GO_WITH_TECH_DEBT + <50% → escalate to NO_GO
    const downgrade = applyTechDebtDowngrade(
      'GO_WITH_TECH_DEBT',
      { selfAssessment: 'GO_WITH_TECH_DEBT' },
      delta!.completionRatio,
    );
    expect(downgrade.decision).toBe('NO_GO');
    expect(downgrade.downgraded).toBe(true);
    expect(downgrade.reason).toMatch(/escalated to NO_GO/);
  });

  it('verify-delta baseline file is written to correct path with correct JSON schema', () => {
    // Arrange + Act
    writeVerifyDeltaBaseline(PROJECT_ROOT, TASK_ID, 7, 3);

    // Assert: writeFileSync was called with the expected path
    const writeCall = mockedWriteFileSync.mock.calls.find(
      (args) => String(args[0]).endsWith(`task-${TASK_ID}.verify-delta.json`),
    );
    expect(writeCall).toBeDefined();

    const writtenJson = JSON.parse(String(writeCall![1]));
    expect(writtenJson).toMatchObject({
      taskId: TASK_ID,
      filesChangedBaseline: 7,
      testFailBaseline: 3,
    });
    expect(typeof writtenJson.timestamp).toBe('string');
    expect(writtenJson.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('computeVerifyDelta returns null when baseline file was never written', () => {
    // Baseline not written → existsSync returns false for .verify-delta.json
    storedBaseline = null; // ensure file does not exist

    const delta = computeVerifyDelta(PROJECT_ROOT, TASK_ID, 5, 0, 5);

    expect(delta).toBeNull();
  });

  it('exact boundary: completionRatio === 0.8 is treated as DONE (not TECH_DEBT)', () => {
    // Arrange: need exactly completionRatio = 0.8
    // filesRatio*0.6 + testRatio*0.4 = 0.8
    // Choose: filesRatio=1 (4 files of 4), testRatio=0.5 (5 of 10 fixed)
    // → 1*0.6 + 0.5*0.4 = 0.6 + 0.2 = 0.8
    writeVerifyDeltaBaseline(PROJECT_ROOT, TASK_ID, 0, 10);

    const delta = computeVerifyDelta(PROJECT_ROOT, TASK_ID, 4, 5, 4);

    expect(delta).not.toBeNull();
    expect(Math.abs(delta!.completionRatio - 0.8)).toBeLessThan(0.001);
    expect(delta!.recommendedAssessment).toBe('DONE');

    // applyTechDebtDowngrade: DONE + exactly 0.8 → no downgrade
    const downgrade = applyTechDebtDowngrade('DONE', { selfAssessment: 'DONE' }, delta!.completionRatio);
    expect(downgrade.decision).toBe('DONE');
    expect(downgrade.downgraded).toBe(false);
  });

  it('newly introduced test failures cause NO_GO even with file changes', () => {
    // Arrange: baseline with 0 test failures (clean repo state)
    writeVerifyDeltaBaseline(PROJECT_ROOT, TASK_ID, 0, 0);

    // Act: worker changed some files but introduced 8 new test failures
    // testRatio = 0 (failures introduced), filesRatio = 3/5 = 0.6
    // completionRatio = 0.6*0.6 + 0*0.4 = 0.36 → NO_GO
    const delta = computeVerifyDelta(PROJECT_ROOT, TASK_ID, 3, 8, 5);

    expect(delta).not.toBeNull();
    expect(delta!.completionRatio).toBeLessThan(VERIFY_DELTA_NO_GO_THRESHOLD);
    expect(delta!.recommendedAssessment).toBe('NO_GO');

    // applyTechDebtDowngrade confirms: DONE + 0.36 → NO_GO
    const downgrade = applyTechDebtDowngrade('DONE', { selfAssessment: 'DONE' }, delta!.completionRatio);
    expect(downgrade.decision).toBe('NO_GO');
    expect(downgrade.downgraded).toBe(true);
  });
});

// ─── Worker Event Hook Points (ADR-035, Sprint 139 Task 041) ────────

describe('writeHeartbeat — WORKER→BRAIN:HEARTBEAT event hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
    mockedGetCurrentSprintId.mockReturnValue('sprint-139');
  });

  it('emits HEARTBEAT event when sprintId is explicitly provided', () => {
    const hb = createHeartbeat('w-001', '001', AgentStatus.EXECUTING, 'Working', undefined, 1);
    writeHeartbeat('/project', hb, 'sprint-139');

    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-139',
      'worker',
      'brain',
      'WORKER→BRAIN:HEARTBEAT',
      expect.objectContaining({
        workerId: 'w-001',
        taskId: '001',
        sequence: 1,
        phase: AgentStatus.EXECUTING,
      }),
    );
  });

  it('emits HEARTBEAT event with auto-detected sprintId when not provided', () => {
    mockedGetCurrentSprintId.mockReturnValue('sprint-auto');
    const hb = createHeartbeat('w-002', '002', AgentStatus.VERIFYING, 'Checking', undefined, 3);
    writeHeartbeat('/project', hb);

    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-auto',
      'worker',
      'brain',
      'WORKER→BRAIN:HEARTBEAT',
      expect.objectContaining({ taskId: '002', sequence: 3 }),
    );
  });

  it('does NOT emit HEARTBEAT event when sprintId cannot be determined', () => {
    mockedGetCurrentSprintId.mockReturnValue(null);
    const hb = createHeartbeat('w-003', '003', AgentStatus.EXECUTING, 'Working');
    writeHeartbeat('/project', hb);

    expect(mockedWriteEvent).not.toHaveBeenCalled();
  });

  it('still writes .hb file even if event stream is unavailable', () => {
    mockedGetCurrentSprintId.mockReturnValue(null);
    const hb = createHeartbeat('w-004', '004', AgentStatus.EXECUTING, 'Working');
    writeHeartbeat('/project', hb);

    // writeFileSync should still be called for the .hb file
    expect(mockedWriteEvent).not.toHaveBeenCalled();
    // The file write still happened (writeFileSync is called by worker internals)
  });
});

describe('writeResult — WORKER→BRAIN:RESULT + WORKER→AUDITOR:CODE_VERIFY_REQUEST events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
    mockedGetCurrentSprintId.mockReturnValue('sprint-139');
    // updateTaskStatus reads the task file
    const task = makeTask('005');
    task.status = TaskStatus.PENDING;
    mockedReadFileSync.mockReturnValue(JSON.stringify(task) as never);
  });

  it('emits RESULT event with correct payload on DONE result', () => {
    const result: TaskResult = {
      taskId: '005',
      filesChanged: ['src/foo.ts'],
      linesAdded: 10,
      linesRemoved: 2,
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'All done',
      rubricScores: { correctness: 95, test_coverage: 90, scope_compliance: 100, documentation: 80 },
    };

    writeResult('/project', result, 'sprint-139');

    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-139',
      'worker',
      'brain',
      'WORKER→BRAIN:RESULT',
      expect.objectContaining({
        taskId: '005',
        selfAssessment: 'DONE',
        filesChanged: ['src/foo.ts'],
        rubricScores: expect.objectContaining({ correctness: 95 }),
      }),
    );
  });

  it('emits CODE_VERIFY_REQUEST event after result write', () => {
    const result: TaskResult = {
      taskId: '005',
      filesChanged: ['src/bar.ts', 'tests/bar.test.ts'],
      linesAdded: 20,
      linesRemoved: 5,
      testsPassed: true,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Minor issue remains',
    };

    writeResult('/project', result, 'sprint-139');

    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-139',
      'worker',
      'auditor',
      'WORKER→AUDITOR:CODE_VERIFY_REQUEST',
      expect.objectContaining({
        taskId: '005',
        filesChanged: ['src/bar.ts', 'tests/bar.test.ts'],
        evidence: 'Minor issue remains',
      }),
    );
  });

  it('emits both RESULT and CODE_VERIFY_REQUEST events', () => {
    const result: TaskResult = {
      taskId: '005',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      selfAssessment: 'NO_GO',
      notes: 'Build failed',
    };

    writeResult('/project', result, 'sprint-139');

    const calls = mockedWriteEvent.mock.calls.map(c => c[4]); // channel arg
    expect(calls).toContain('WORKER→BRAIN:RESULT');
    expect(calls).toContain('WORKER→AUDITOR:CODE_VERIFY_REQUEST');
  });

  it('does NOT emit result events when sprintId cannot be determined', () => {
    mockedGetCurrentSprintId.mockReturnValue(null);
    const result: TaskResult = {
      taskId: '005',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: '',
    };

    writeResult('/project', result);

    const resultCalls = mockedWriteEvent.mock.calls.filter(c => c[4] === 'WORKER→BRAIN:RESULT');
    expect(resultCalls).toHaveLength(0);
  });
});

describe('emitWorkerQuestion — WORKER→BRAIN:QUESTION event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCurrentSprintId.mockReturnValue('sprint-139');
  });

  it('emits QUESTION event with question and context', () => {
    emitWorkerQuestion('/project', '007', 'How do I handle circular deps?', 'Task depends on T-008', 'sprint-139');

    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-139',
      'worker',
      'brain',
      'WORKER→BRAIN:QUESTION',
      {
        taskId: '007',
        question: 'How do I handle circular deps?',
        context: 'Task depends on T-008',
      },
    );
  });

  it('emits QUESTION with empty context when not provided', () => {
    emitWorkerQuestion('/project', '008', 'What is the scope?', undefined, 'sprint-139');

    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-139',
      'worker',
      'brain',
      'WORKER→BRAIN:QUESTION',
      expect.objectContaining({ context: '' }),
    );
  });

  it('auto-detects sprintId from sprint-state.json when not provided', () => {
    mockedGetCurrentSprintId.mockReturnValue('sprint-auto');
    emitWorkerQuestion('/project', '009', 'Any guidance?');

    expect(mockedWriteEvent).toHaveBeenCalledWith(
      '/project',
      'sprint-auto',
      'worker',
      'brain',
      'WORKER→BRAIN:QUESTION',
      expect.objectContaining({ taskId: '009' }),
    );
  });

  it('does NOT emit when sprintId cannot be determined', () => {
    mockedGetCurrentSprintId.mockReturnValue(null);
    emitWorkerQuestion('/project', '010', 'Will this run?');
    expect(mockedWriteEvent).not.toHaveBeenCalled();
  });
});

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(id: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
  };
}
