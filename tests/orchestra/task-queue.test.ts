/**
 * Task 019-001: Task Queue — Planner Task Sayısı vs Worker Limiti Ayrımı
 *
 * Tests for the task queue mechanism:
 * - planSprint creates ALL tasks regardless of max_workers
 * - spawnWorkers spawns only up to max_workers initially, returns queue
 * - waitForResults processes queue: spawn next task when one completes
 * - Dashboard total = all tasks count
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, ResolvedConfig, BrainContext } from '../../src/core/types.js';
import {
  TASKS_DIR, BRAIN_DIR, DECKENT_DIR, SPRINTS_DIR,
  DIRECTIVES_FILE, DASHBOARD_FILE,
} from '../../src/core/constants.js';

// ─── Mocks (no outer variable references — hoisted by vitest) ────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  isSessionActive: vi.fn().mockReturnValue(false),
  startAuditor: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  sendKeys: vi.fn(),
  TmuxError: class TmuxError extends Error {
    command?: string;
    constructor(m: string, c?: string) { super(m); this.name = 'TmuxError'; this.command = c; }
  },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  }),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  })),
}));

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn().mockResolvedValue('y'),
    close: vi.fn(),
  })),
}));

// ─── Import after mocks ──────────────────────────────────────────────

import { spawnWorker, killWorker } from '../../src/orchestra/tmux.js';
import { planSprint, spawnWorkers, waitForResults } from '../../src/orchestra/brain.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function setupProjectDir(root: string): void {
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, BRAIN_DIR, SPRINTS_DIR), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  // Initialize dashboard file so updateDashboard in spawnWorkers can write to it
  const emptyDash = {
    sprint: null, agents: [], progress: { done: 0, active: 0, blocked: 0, total: 0 },
    alerts: [], updatedAt: '',
  };
  writeFileSync(join(root, DASHBOARD_FILE), JSON.stringify(emptyDash));
}

function setupBrainDir(root: string, directives = ''): void {
  writeFileSync(join(root, DECKENT_DIR, 'config.json'), JSON.stringify({ mode: 'max_plan' }, null, 2));
  writeFileSync(join(root, DIRECTIVES_FILE), directives);
  writeFileSync(join(root, BRAIN_DIR, 'MEMORY.md'), '# Memory\n');
  writeFileSync(join(root, BRAIN_DIR, 'DECISIONS.md'), '# Decisions\n');
  writeFileSync(join(root, BRAIN_DIR, 'DEBT.md'), '# Debt\n\n| ID | Description | Priority | Resolved |\n|---|---|---|---|\n');
  writeFileSync(join(root, BRAIN_DIR, 'PATTERNS.md'), '[]');
  writeFileSync(join(root, BRAIN_DIR, 'RETRO.md'), '# Retro\n');
}

function makeTask(id: string, sprintId = 'sprint-001', overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeConfig(root: string, maxWorkers = 3): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: maxWorkers,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: true,
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test',
    projectRoot: root,
    version: '0.1.0',
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: 'planning' as Sprint['status'],
    phase: 'PLAN' as Sprint['phase'],
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    planningMode: 'structured',
  };
}

function writeTaskResult(root: string, taskId: string): void {
  const result: TaskResult = {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/foo.ts'],
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: 'Done',
  };
  writeFileSync(
    join(root, TASKS_DIR, `task-${taskId}.result`),
    JSON.stringify(result, null, 2),
  );
}

function makeBrainContext(directives: string): BrainContext {
  return {
    directives,
    memory: '',
    decisions: '',
    debt: [],
    patterns: [],
    retro: '',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// GROUP 1: planSprint — no max_workers cap on task creation
// ═══════════════════════════════════════════════════════════════════════

describe('planSprint — no max_workers cap on task count', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'deckent-queue-plan-'));
    setupProjectDir(root);
    setupBrainDir(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates 5 tasks when max_workers=3 and 5 directives provided', async () => {
    const context = makeBrainContext(
      '- Task one\n- Task two\n- Task three\n- Task four\n- Task five',
    );
    const config = makeConfig(root, 3);
    const recommendation = { size: 'full' as const, maxWorkers: 3, modelConstraint: null, reason: '' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    expect(sprint.tasks.length).toBe(5);
  });

  it('creates 10 tasks when max_workers=8 and 10 directives provided', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `- Directive task ${i + 1}`).join('\n');
    const context = makeBrainContext(lines);
    const config = makeConfig(root, 8);
    const recommendation = { size: 'full' as const, maxWorkers: 8, modelConstraint: null, reason: '' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    expect(sprint.tasks.length).toBe(10);
  });

  it('writes all 10 task JSON files to .tasks/ when max_workers=8', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `- Task ${i + 1}`).join('\n');
    const context = makeBrainContext(lines);
    const config = makeConfig(root, 8);
    const recommendation = { size: 'full' as const, maxWorkers: 8, modelConstraint: null, reason: '' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    const taskFiles = readdirSync(join(root, TASKS_DIR)).filter(f => f.endsWith('.json'));
    expect(taskFiles.length).toBe(10);
    expect(sprint.tasks.length).toBe(10);
  });

  it('creates tasks equal to directive count when max_workers < directive count', async () => {
    const lines = Array.from({ length: 6 }, (_, i) => `- Task ${i + 1}`).join('\n');
    const context = makeBrainContext(lines);
    const config = makeConfig(root, 2);
    const recommendation = { size: 'full' as const, maxWorkers: 2, modelConstraint: null, reason: '' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    expect(sprint.tasks.length).toBe(6);
    expect(sprint.workers.length).toBe(6);
  });

  it('creates tasks up to directive count regardless of very low max_workers', async () => {
    const lines = Array.from({ length: 4 }, (_, i) => `- Task ${i + 1}`).join('\n');
    const context = makeBrainContext(lines);
    const config = makeConfig(root, 1);
    const recommendation = { size: 'full' as const, maxWorkers: 1, modelConstraint: null, reason: '' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    expect(sprint.tasks.length).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 2: spawnWorkers — initial batch limited to max_workers
// ═══════════════════════════════════════════════════════════════════════

describe('spawnWorkers — initial batch and queue return', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'deckent-queue-spawn-'));
    setupProjectDir(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('spawns only max_workers tasks when tasks > max_workers', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => makeTask(`001-00${i + 1}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 3);

    await spawnWorkers(root, sprint, config);

    expect(vi.mocked(spawnWorker)).toHaveBeenCalledTimes(3);
  });

  it('returns the remaining queued tasks when tasks > max_workers', async () => {
    const tasks = Array.from({ length: 5 }, (_, i) => makeTask(`001-00${i + 1}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 3);

    const queue = await spawnWorkers(root, sprint, config);

    expect(queue.length).toBe(2);
    expect(queue[0].id).toBe('001-004');
    expect(queue[1].id).toBe('001-005');
  });

  it('returns empty queue when tasks <= max_workers', async () => {
    const tasks = [makeTask('001-001'), makeTask('001-002')];
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 3);

    const queue = await spawnWorkers(root, sprint, config);

    expect(queue.length).toBe(0);
    expect(vi.mocked(spawnWorker)).toHaveBeenCalledTimes(2);
  });

  it('dashboard progress.total equals all tasks (not just active workers)', async () => {
    const tasks = Array.from({ length: 8 }, (_, i) => makeTask(`001-00${i + 1}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 3);

    await spawnWorkers(root, sprint, config);

    const dashboard = JSON.parse(readFileSync(join(root, DASHBOARD_FILE), 'utf-8'));
    expect(dashboard.progress.total).toBe(8);
    expect(dashboard.progress.active).toBe(3);
  });

  it('dashboard progress.total equals all tasks when tasks == max_workers', async () => {
    const tasks = [makeTask('001-001'), makeTask('001-002'), makeTask('001-003')];
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 3);

    await spawnWorkers(root, sprint, config);

    const dashboard = JSON.parse(readFileSync(join(root, DASHBOARD_FILE), 'utf-8'));
    expect(dashboard.progress.total).toBe(3);
    expect(dashboard.progress.active).toBe(3);
  });

  it('spawns all tasks and returns empty queue when tasks == max_workers', async () => {
    const tasks = Array.from({ length: 3 }, (_, i) => makeTask(`001-00${i + 1}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 3);

    const queue = await spawnWorkers(root, sprint, config);

    expect(vi.mocked(spawnWorker)).toHaveBeenCalledTimes(3);
    expect(queue.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 3: waitForResults — queue processing
// ═══════════════════════════════════════════════════════════════════════

describe('waitForResults — queue processing', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'deckent-queue-wait-'));
    setupProjectDir(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns results for all tasks when no queue', async () => {
    const tasks = [makeTask('001-001'), makeTask('001-002'), makeTask('001-003')];
    const sprint = makeSprint(tasks);

    for (const t of tasks) writeTaskResult(root, t.id);

    const results = await waitForResults(root, sprint, 5000);

    expect(results.length).toBe(3);
  });

  it('spawns queued task when active task result is found', async () => {
    const task1 = makeTask('001-001');
    const task2 = makeTask('001-002'); // queued
    const sprint = makeSprint([task1, task2]);

    // Both results available immediately
    writeTaskResult(root, '001-001');
    writeTaskResult(root, '001-002');

    const queue = [task2];
    const results = await waitForResults(root, sprint, 5000, queue);

    // killWorker called for task1 (completed, has a queue entry to replace)
    expect(vi.mocked(killWorker)).toHaveBeenCalledWith('001-001');
    // spawnWorker called for task2 (from queue)
    expect(vi.mocked(spawnWorker)).toHaveBeenCalledWith(
      '001-002',
      expect.any(String),
      expect.any(String),
      root,
      expect.any(Object),
    );
    expect(results.length).toBe(2);
  });

  it('does NOT kill worker when queue is empty', async () => {
    const task1 = makeTask('001-001');
    const sprint = makeSprint([task1]);

    writeTaskResult(root, '001-001');

    await waitForResults(root, sprint, 5000, []);

    expect(vi.mocked(killWorker)).not.toHaveBeenCalled();
  });

  it('does NOT kill worker when no queue provided', async () => {
    const task1 = makeTask('001-001');
    const sprint = makeSprint([task1]);

    writeTaskResult(root, '001-001');

    await waitForResults(root, sprint, 5000);

    expect(vi.mocked(killWorker)).not.toHaveBeenCalled();
  });

  it('collects results for all sprint tasks including those from queue', async () => {
    const tasks = Array.from({ length: 5 }, (_, i) => makeTask(`001-00${i + 1}`));
    const sprint = makeSprint(tasks);

    for (const t of tasks) writeTaskResult(root, t.id);

    const results = await waitForResults(root, sprint, 5000);

    expect(results.length).toBe(5);
  });

  it('spawns next queued task for each completed active worker', async () => {
    const tasks = Array.from({ length: 4 }, (_, i) => makeTask(`001-00${i + 1}`));
    const sprint = makeSprint(tasks);
    const queue = [tasks[2], tasks[3]]; // tasks 3 and 4 are queued

    for (const t of tasks) writeTaskResult(root, t.id);

    await waitForResults(root, sprint, 5000, queue);

    // killWorker called once per queue entry consumed (task1 and task2)
    expect(vi.mocked(killWorker)).toHaveBeenCalledTimes(2);
    // spawnWorker called for task3 and task4
    expect(vi.mocked(spawnWorker)).toHaveBeenCalledTimes(2);
  });

  it('returns partial results when timeout elapses without all completing', async () => {
    const task1 = makeTask('001-001');
    const task2 = makeTask('001-002');
    const sprint = makeSprint([task1, task2]);

    // Only task1 result available
    writeTaskResult(root, '001-001');

    const results = await waitForResults(root, sprint, 100); // 100ms timeout

    expect(results.some(r => r.taskId === '001-001')).toBe(true);
  });
});
