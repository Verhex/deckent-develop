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
  openSync: vi.fn(() => 42),
  closeSync: vi.fn(),
  constants: { O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128 },
}));

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';

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
