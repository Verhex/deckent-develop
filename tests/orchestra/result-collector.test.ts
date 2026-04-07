import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import type { Task, Sprint, TaskResult } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';

// We test the timeout-detection logic in collectResults by calling waitForResults
// with a minimal sprint containing one task that has a .timeout file.

// Mock tmux and result-watcher to avoid real fs.watch and tmux calls
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

function makeTmpDir(): string {
  const dir = join(tmpdir(), `deckent-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function makeTask(id: string): Task {
  return {
    id,
    title: `Test task ${id}`,
    description: 'test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'partial' },
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

describe('result-collector timeout detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('detects .timeout file and writes synthetic NO_GO result', async () => {
    const task = makeTask('test-001');
    const sprint = makeSprint([task]);

    // Write a .timeout marker (simulates worker killed by timeout)
    writeFileSync(join(tmpDir, '.tasks', 'task-test-001.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    expect(results[0]!.taskId).toBe('test-001');
    expect(results[0]!.selfAssessment).toBe('NO_GO');
    expect(results[0]!.notes).toContain('timeout');

    // Verify the synthetic .result was also written to disk
    const resultPath = join(tmpDir, '.tasks', 'task-test-001.result');
    expect(existsSync(resultPath)).toBe(true);
  });

  it('prefers real .result over .timeout when both exist', async () => {
    const task = makeTask('test-002');
    const sprint = makeSprint([task]);

    // Write both .result and .timeout — .result should take precedence
    const realResult: TaskResult = {
      taskId: 'test-002',
      workerId: 'w-test-002',
      filesChanged: ['src/foo.ts'],
      linesAdded: 10,
      linesRemoved: 2,
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'All good',
    };
    writeFileSync(join(tmpDir, '.tasks', 'task-test-002.result'), JSON.stringify(realResult), 'utf-8');
    writeFileSync(join(tmpDir, '.tasks', 'task-test-002.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    expect(results[0]!.selfAssessment).toBe('DONE');
    expect(results[0]!.notes).toBe('All good');
  });

  it('collects normal results without timeout marker', async () => {
    const task = makeTask('test-003');
    const sprint = makeSprint([task]);

    const result: TaskResult = {
      taskId: 'test-003',
      workerId: 'w-test-003',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'Done',
    };
    writeFileSync(join(tmpDir, '.tasks', 'task-test-003.result'), JSON.stringify(result), 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    expect(results[0]!.selfAssessment).toBe('DONE');
  });

  it('handles multiple tasks with mixed results and timeouts', async () => {
    const task1 = makeTask('test-004');
    const task2 = makeTask('test-005');
    const sprint = makeSprint([task1, task2]);

    // task1 has normal result, task2 timed out
    const result1: TaskResult = {
      taskId: 'test-004',
      workerId: 'w-test-004',
      filesChanged: ['a.ts'],
      linesAdded: 5,
      linesRemoved: 1,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Partial',
    };
    writeFileSync(join(tmpDir, '.tasks', 'task-test-004.result'), JSON.stringify(result1), 'utf-8');
    writeFileSync(join(tmpDir, '.tasks', 'task-test-005.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(2);
    const r1 = results.find(r => r.taskId === 'test-004');
    const r2 = results.find(r => r.taskId === 'test-005');
    expect(r1!.selfAssessment).toBe('GO_WITH_TECH_DEBT');
    expect(r2!.selfAssessment).toBe('NO_GO');
    expect(r2!.notes).toContain('timeout');
  });
});
