import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  readTask,
  claimTask,
  acquireLock,
  releaseLock,
  writeResult,
  createHeartbeat,
  isWithinScope,
  TaskClaimError,
  LockError,
} from '../../src/agents/worker.js';
import { AgentStatus } from '../../src/core/types.js';
import type { Task, TaskResult, TaskScope } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'worker-edge-test-'));
}

function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'testing',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: [],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'tests pass',
      noGoCriteria: 'tests fail',
      techDebtAcceptable: 'none',
    },
    status: 'PENDING',
    ...overrides,
  };
}

function writeTaskFile(dir: string, task: Task): void {
  const tasksDir = path.join(dir, '.tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.writeFileSync(
    path.join(tasksDir, `task-${task.id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8',
  );
}

// ─── readTask ────────────────────────────────────────────────────────────────

describe('readTask', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('reads and parses a valid task file', () => {
    const task = makeTask();
    writeTaskFile(tmpDir, task);
    const result = readTask(tmpDir, 'test-001');
    expect(result.id).toBe('test-001');
    expect(result.status).toBe('PENDING');
  });

  it('throws with "Task file not found" when file is missing', () => {
    expect(() => readTask(tmpDir, 'nonexistent-999')).toThrow('Task file not found');
  });

  it('throws with "Invalid JSON" when file contains malformed JSON', () => {
    const tasksDir = path.join(tmpDir, '.tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.writeFileSync(path.join(tasksDir, 'task-bad-001.json'), '{ not valid json }', 'utf-8');
    expect(() => readTask(tmpDir, 'bad-001')).toThrow('Invalid JSON');
  });

  it('returns all fields from a complete task file', () => {
    const task = makeTask({ title: 'Full Task', sprintId: 'sprint-001' });
    writeTaskFile(tmpDir, task);
    const result = readTask(tmpDir, 'test-001');
    expect(result.title).toBe('Full Task');
    expect(result.sprintId).toBe('sprint-001');
  });
});

// ─── claimTask ───────────────────────────────────────────────────────────────

describe('claimTask', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('transitions task status from PENDING to CLAIMED', () => {
    const task = makeTask();
    writeTaskFile(tmpDir, task);
    const claimed = claimTask(tmpDir, 'test-001', 'worker-A');
    expect(claimed.status).toBe('CLAIMED');
    expect(claimed.assignedWorker).toBe('worker-A');
  });

  it('persists the CLAIMED status to disk', () => {
    const task = makeTask();
    writeTaskFile(tmpDir, task);
    claimTask(tmpDir, 'test-001', 'worker-A');
    const persisted = readTask(tmpDir, 'test-001');
    expect(persisted.status).toBe('CLAIMED');
    expect(persisted.assignedWorker).toBe('worker-A');
  });

  it('throws TaskClaimError when task is already CLAIMED', () => {
    const task = makeTask({ status: 'CLAIMED', assignedWorker: 'worker-B' });
    writeTaskFile(tmpDir, task);
    expect(() => claimTask(tmpDir, 'test-001', 'worker-A')).toThrow(TaskClaimError);
  });

  it('throws TaskClaimError when task status is DONE', () => {
    const task = makeTask({ status: 'DONE' });
    writeTaskFile(tmpDir, task);
    expect(() => claimTask(tmpDir, 'test-001', 'worker-A')).toThrow(TaskClaimError);
  });

  it('throws TaskClaimError when task is already assigned to another worker', () => {
    const task = makeTask({ status: 'PENDING', assignedWorker: 'worker-existing' });
    writeTaskFile(tmpDir, task);
    expect(() => claimTask(tmpDir, 'test-001', 'worker-new')).toThrow(TaskClaimError);
  });

  it('sets updatedAt timestamp', () => {
    const task = makeTask();
    writeTaskFile(tmpDir, task);
    const before = Date.now();
    const claimed = claimTask(tmpDir, 'test-001', 'worker-A');
    const after = Date.now();
    expect(claimed.updatedAt).toBeDefined();
    const ts = new Date(claimed.updatedAt!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─── acquireLock ─────────────────────────────────────────────────────────────

describe('acquireLock', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('creates a lock file and returns LockInfo', () => {
    const lockInfo = acquireLock(tmpDir, 'src/foo.ts', 'worker-A', 'task-001');
    expect(lockInfo.filePath).toBe('src/foo.ts');
    expect(lockInfo.ownerWorkerId).toBe('worker-A');
    expect(lockInfo.taskId).toBe('task-001');
  });

  it('is idempotent — same worker re-acquiring returns existing lock', () => {
    const first = acquireLock(tmpDir, 'src/foo.ts', 'worker-A', 'task-001');
    const second = acquireLock(tmpDir, 'src/foo.ts', 'worker-A', 'task-001');
    expect(second.ownerWorkerId).toBe(first.ownerWorkerId);
  });

  it('throws LockError when another worker holds the lock', () => {
    acquireLock(tmpDir, 'src/foo.ts', 'worker-A', 'task-001');
    expect(() => acquireLock(tmpDir, 'src/foo.ts', 'worker-B', 'task-002')).toThrow(LockError);
  });

  it('LockError message includes the file path', () => {
    acquireLock(tmpDir, 'src/bar.ts', 'worker-A', 'task-001');
    try {
      acquireLock(tmpDir, 'src/bar.ts', 'worker-B', 'task-002');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LockError);
      expect((err as LockError).filePath).toBe('src/bar.ts');
    }
  });

  it('handles EEXIST race condition — re-reads lock owner', () => {
    // Simulate EEXIST by pre-creating the lock file, then attempting acquire
    const locksDir = path.join(tmpDir, '.locks');
    fs.mkdirSync(locksDir, { recursive: true });
    const lockName = 'src__foo.ts.lock';
    const lockData = {
      filePath: 'src/foo.ts',
      ownerWorkerId: 'worker-X',
      acquiredAt: new Date().toISOString(),
      taskId: 'task-X',
    };
    fs.writeFileSync(path.join(locksDir, lockName), JSON.stringify(lockData), 'utf-8');

    // Now worker-Y tries to acquire — should get EEXIST path and report worker-X
    expect(() => acquireLock(tmpDir, 'src/foo.ts', 'worker-Y', 'task-Y')).toThrow(LockError);
    try {
      acquireLock(tmpDir, 'src/foo.ts', 'worker-Y', 'task-Y');
    } catch (err) {
      expect((err as LockError).message).toContain('worker-X');
    }
  });

  it('throws LockError for a corrupted lock file (cannot determine owner)', () => {
    const locksDir = path.join(tmpDir, '.locks');
    fs.mkdirSync(locksDir, { recursive: true });
    fs.writeFileSync(path.join(locksDir, 'src__corrupt.ts.lock'), 'not valid json', 'utf-8');
    // Corrupted lock falls through to O_EXCL create which fails with EEXIST
    // → reports "locked by another worker" since owner cannot be determined
    expect(() => acquireLock(tmpDir, 'src/corrupt.ts', 'worker-A', 'task-001')).toThrow(LockError);
  });
});

// ─── releaseLock ─────────────────────────────────────────────────────────────

describe('releaseLock', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  it('releases a lock held by the calling worker', () => {
    acquireLock(tmpDir, 'src/foo.ts', 'worker-A', 'task-001');
    expect(() => releaseLock(tmpDir, 'src/foo.ts', 'worker-A')).not.toThrow();

    // Verify lock file is removed
    const locksDir = path.join(tmpDir, '.locks');
    const files = fs.readdirSync(locksDir);
    expect(files).toHaveLength(0);
  });

  it('is a no-op when no lock file exists', () => {
    expect(() => releaseLock(tmpDir, 'src/nonexistent.ts', 'worker-A')).not.toThrow();
  });

  it('throws LockError when another worker tries to release the lock', () => {
    acquireLock(tmpDir, 'src/foo.ts', 'worker-A', 'task-001');
    expect(() => releaseLock(tmpDir, 'src/foo.ts', 'worker-B')).toThrow(LockError);
  });

  it('LockError message identifies actual owner vs attempted releaser', () => {
    acquireLock(tmpDir, 'src/foo.ts', 'worker-A', 'task-001');
    try {
      releaseLock(tmpDir, 'src/foo.ts', 'worker-B');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LockError);
      expect((err as LockError).message).toContain('worker-A');
      expect((err as LockError).message).toContain('worker-B');
    }
  });

  it('allows corrupted lock file to be deleted without error', () => {
    const locksDir = path.join(tmpDir, '.locks');
    fs.mkdirSync(locksDir, { recursive: true });
    fs.writeFileSync(path.join(locksDir, 'src__corrupt2.ts.lock'), 'INVALID JSON', 'utf-8');
    expect(() => releaseLock(tmpDir, 'src/corrupt2.ts', 'any-worker')).not.toThrow();
  });
});

// ─── isWithinScope ───────────────────────────────────────────────────────────

describe('isWithinScope', () => {
  const scope: TaskScope = {
    directories: ['src/core', 'src/agents'],
    filesRead: ['README.md'],
    filesWrite: ['package.json'],
  };

  it('returns true for a file within an allowed directory', () => {
    expect(isWithinScope('src/core/utils.ts', scope)).toBe(true);
  });

  it('returns true when directory has trailing separator', () => {
    const scopeWithSlash: TaskScope = {
      directories: ['src/core/'],
      filesRead: [],
      filesWrite: [],
    };
    expect(isWithinScope('src/core/utils.ts', scopeWithSlash)).toBe(true);
  });

  it('protects against prefix overlap — src/core-extra is NOT within src/core', () => {
    expect(isWithinScope('src/core-extra/file.ts', scope)).toBe(false);
  });

  it('returns true for exact directory match', () => {
    expect(isWithinScope('src/core', scope)).toBe(true);
  });

  it('returns true for a file in filesWrite', () => {
    expect(isWithinScope('package.json', scope)).toBe(true);
  });

  it('returns false for a file outside scope', () => {
    expect(isWithinScope('tests/foo.test.ts', scope)).toBe(false);
  });

  it('returns false for a file that is only in filesRead (not write scope)', () => {
    // isWithinScope checks directories + filesWrite, not filesRead
    expect(isWithinScope('README.md', scope)).toBe(false);
  });

  it('handles nested directories correctly', () => {
    expect(isWithinScope('src/agents/worker.ts', scope)).toBe(true);
  });

  it('handles empty scope gracefully', () => {
    const emptyScope: TaskScope = { directories: [], filesRead: [], filesWrite: [] };
    expect(isWithinScope('src/core/utils.ts', emptyScope)).toBe(false);
  });
});

// ─── writeResult ─────────────────────────────────────────────────────────────

describe('writeResult', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  function makeResult(selfAssessment: TaskResult['selfAssessment']): TaskResult {
    return {
      taskId: 'test-001',
      workerId: 'worker-A',
      filesChanged: ['src/foo.ts'],
      linesAdded: 10,
      linesRemoved: 2,
      testsPassed: true,
      coverage: 90,
      selfAssessment,
      notes: 'All done',
    };
  }

  it('writes result file to disk', () => {
    const task = makeTask();
    writeTaskFile(tmpDir, task);
    const result = makeResult('DONE');
    writeResult(tmpDir, result);
    const resultPath = path.join(tmpDir, '.tasks', 'task-test-001.result');
    expect(fs.existsSync(resultPath)).toBe(true);
  });

  it('DONE selfAssessment sets task status to DONE', () => {
    const task = makeTask({ status: 'EXECUTING' });
    writeTaskFile(tmpDir, task);
    writeResult(tmpDir, makeResult('DONE'));
    const updated = readTask(tmpDir, 'test-001');
    expect(updated.status).toBe('DONE');
  });

  it('GO_WITH_TECH_DEBT selfAssessment sets task status to DONE', () => {
    const task = makeTask({ status: 'EXECUTING' });
    writeTaskFile(tmpDir, task);
    writeResult(tmpDir, makeResult('GO_WITH_TECH_DEBT'));
    const updated = readTask(tmpDir, 'test-001');
    expect(updated.status).toBe('DONE');
  });

  it('NO_GO selfAssessment sets task status to NO_GO', () => {
    const task = makeTask({ status: 'EXECUTING' });
    writeTaskFile(tmpDir, task);
    writeResult(tmpDir, makeResult('NO_GO'));
    const updated = readTask(tmpDir, 'test-001');
    expect(updated.status).toBe('NO_GO');
  });

  it('persists result fields to disk', () => {
    const task = makeTask({ status: 'EXECUTING' });
    writeTaskFile(tmpDir, task);
    const result = makeResult('DONE');
    writeResult(tmpDir, result);
    const resultPath = path.join(tmpDir, '.tasks', 'task-test-001.result');
    const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as TaskResult;
    expect(parsed.linesAdded).toBe(10);
    expect(parsed.coverage).toBe(90);
    expect(parsed.selfAssessment).toBe('DONE');
  });
});

// ─── createHeartbeat ─────────────────────────────────────────────────────────

describe('createHeartbeat', () => {
  it('returns a Heartbeat object with all required fields', () => {
    const hb = createHeartbeat('worker-A', 'task-001', AgentStatus.CODING, 'Writing tests');
    expect(hb.workerId).toBe('worker-A');
    expect(hb.taskId).toBe('task-001');
    expect(hb.status).toBe(AgentStatus.CODING);
    expect(hb.currentAction).toBe('Writing tests');
    expect(hb.filesChangedCount).toBe(0);
    expect(hb.sequence).toBe(0);
  });

  it('timestamp is a valid UTC ISO 8601 string', () => {
    const before = Date.now();
    const hb = createHeartbeat('worker-A', 'task-001', AgentStatus.EXECUTING, 'Testing');
    const after = Date.now();
    const ts = new Date(hb.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    // ISO 8601 format check
    expect(hb.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('includes optional file and sequence when provided', () => {
    const hb = createHeartbeat('worker-A', 'task-001', AgentStatus.CODING, 'Editing', 'src/foo.ts', 5);
    expect(hb.currentFile).toBe('src/foo.ts');
    expect(hb.sequence).toBe(5);
  });

  it('currentFile is undefined when not provided', () => {
    const hb = createHeartbeat('worker-A', 'task-001', AgentStatus.IDLE, 'Waiting');
    expect(hb.currentFile).toBeUndefined();
  });

  it('heartbeat serializes to valid JSON', () => {
    const hb = createHeartbeat('worker-A', 'task-001', AgentStatus.DONE, 'Finished', 'src/bar.ts', 10);
    const json = JSON.stringify(hb);
    const parsed = JSON.parse(json);
    expect(parsed.workerId).toBe('worker-A');
    expect(parsed.timestamp).toBe(hb.timestamp);
  });
});
