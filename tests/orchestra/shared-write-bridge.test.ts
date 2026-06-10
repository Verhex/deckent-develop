// Tests for Sprint 278 COMM-1: worker .result sharedNotes → SharedMemory bridge
// All tests are hermetic (tmpdir, real SharedMemory, no network).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import type { Task, Sprint, TaskResult, ResolvedConfig } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import { getSharedMemory } from '../../src/orchestra/result-collector.js';

// ─── Mocks required to load result-collector without side-effects ─────────────
vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn(() => 'mock prompt'),
}));

import { waitForResults } from '../../src/orchestra/result-collector.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `deckent-test-swb-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function makeTask(id: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-test',
    number: 1,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: new Date().toISOString(),
  } as Sprint;
}

function makeConfig(enabled: boolean): ResolvedConfig {
  return {
    worker_comms: {
      enabled,
      shared_memory_ttl_ms: 3_600_000,
      inject_handoffs: true,
      inject_shared: true,
    },
  } as unknown as ResolvedConfig;
}

function writeResult(dir: string, taskId: string, result: TaskResult): void {
  const { writeFileSync } = require('node:fs');
  writeFileSync(
    join(dir, '.tasks', `task-${taskId}.result`),
    JSON.stringify(result),
    'utf-8',
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('shared-write-bridge', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
  });

  function tmp(): string {
    const d = makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  it('getSharedMemory factory creates a SharedMemory instance', () => {
    const dir = tmp();
    const sm = getSharedMemory(dir, 3_600_000);
    expect(sm).toBeDefined();
    expect(typeof sm.write).toBe('function');
    expect(typeof sm.read).toBe('function');
    expect(typeof sm.listKeys).toBe('function');
  });

  it('writes sharedNotes to SharedMemory when worker_comms.enabled and selfAssessment=DONE', async () => {
    const dir = tmp();
    const task = makeTask('001');
    const sprint = makeSprint([task]);
    const config = makeConfig(true);

    const result: TaskResult = {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'done',
      sharedNotes: [{ key: 'api-schema', value: 'v2' }],
    };
    writeResult(dir, '001', result);

    await waitForResults(dir, sprint, 100, [], undefined, undefined, config);

    const sm = getSharedMemory(dir, 3_600_000);
    const entry = sm.read('api-schema');
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe('v2');
    expect(entry!.writerId).toBe('001');
  });

  it('writes sharedNotes when selfAssessment=GO_WITH_TECH_DEBT', async () => {
    const dir = tmp();
    const task = makeTask('002');
    const sprint = makeSprint([task]);
    const config = makeConfig(true);

    const result: TaskResult = {
      taskId: '002',
      workerId: 'w-002',
      filesChanged: [],
      linesAdded: 5,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 80,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'partial',
      sharedNotes: [{ key: 'schema-version', value: '3' }],
    };
    writeResult(dir, '002', result);

    await waitForResults(dir, sprint, 100, [], undefined, undefined, config);

    const sm = getSharedMemory(dir, 3_600_000);
    const entry = sm.read('schema-version');
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe('3');
  });

  it('does NOT write sharedNotes when worker_comms is disabled', async () => {
    const dir = tmp();
    const task = makeTask('003');
    const sprint = makeSprint([task]);
    const config = makeConfig(false);

    const result: TaskResult = {
      taskId: '003',
      workerId: 'w-003',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'done',
      sharedNotes: [{ key: 'should-not-appear', value: 'x' }],
    };
    writeResult(dir, '003', result);

    await waitForResults(dir, sprint, 100, [], undefined, undefined, config);

    const sm = getSharedMemory(dir, 3_600_000);
    expect(sm.read('should-not-appear')).toBeNull();
  });

  it('does NOT write sharedNotes when config is absent', async () => {
    const dir = tmp();
    const task = makeTask('004');
    const sprint = makeSprint([task]);

    const result: TaskResult = {
      taskId: '004',
      workerId: 'w-004',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'done',
      sharedNotes: [{ key: 'no-config-key', value: 'y' }],
    };
    writeResult(dir, '004', result);

    // No config passed
    await waitForResults(dir, sprint, 100);

    const sm = getSharedMemory(dir, 3_600_000);
    expect(sm.read('no-config-key')).toBeNull();
  });

  it('skips malformed/empty-key notes without throwing', async () => {
    const dir = tmp();
    const task = makeTask('005');
    const sprint = makeSprint([task]);
    const config = makeConfig(true);

    const result: TaskResult = {
      taskId: '005',
      workerId: 'w-005',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'done',
      sharedNotes: [
        { key: '', value: 'invalid-empty-key' },
        { key: 'valid-key', value: 'good' },
        null as unknown as { key: string; value: string },
      ],
    };
    writeResult(dir, '005', result);

    await waitForResults(dir, sprint, 100, [], undefined, undefined, config);

    const sm = getSharedMemory(dir, 3_600_000);
    // valid-key should be written
    expect(sm.read('valid-key')).not.toBeNull();
    // empty-key entry was skipped (no file named _.json for it to matter)
    expect(sm.listKeys()).toContain('valid-key');
  });

  it('writes multiple sharedNotes from a single result', async () => {
    const dir = tmp();
    const task = makeTask('006');
    const sprint = makeSprint([task]);
    const config = makeConfig(true);

    const result: TaskResult = {
      taskId: '006',
      workerId: 'w-006',
      filesChanged: [],
      linesAdded: 10,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'DONE',
      notes: 'done',
      sharedNotes: [
        { key: 'note-a', value: 'alpha' },
        { key: 'note-b', value: 'beta' },
        { key: 'note-c', value: 'gamma' },
      ],
    };
    writeResult(dir, '006', result);

    await waitForResults(dir, sprint, 100, [], undefined, undefined, config);

    const sm = getSharedMemory(dir, 3_600_000);
    expect(sm.read('note-a')!.value).toBe('alpha');
    expect(sm.read('note-b')!.value).toBe('beta');
    expect(sm.read('note-c')!.value).toBe('gamma');
    expect(sm.listKeys().sort()).toEqual(['note-a', 'note-b', 'note-c']);
  });

  it('does NOT write sharedNotes when selfAssessment=NO_GO', async () => {
    const dir = tmp();
    const task = makeTask('007');
    const sprint = makeSprint([task]);
    const config = makeConfig(true);

    const result: TaskResult = {
      taskId: '007',
      workerId: 'w-007',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'failed',
      sharedNotes: [{ key: 'nogo-key', value: 'should-not-write' }],
    };
    writeResult(dir, '007', result);

    await waitForResults(dir, sprint, 100, [], undefined, undefined, config);

    const sm = getSharedMemory(dir, 3_600_000);
    expect(sm.read('nogo-key')).toBeNull();
  });
});
