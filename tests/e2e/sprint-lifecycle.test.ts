// ─── Sprint Lifecycle E2E Tests ───────────────────────────────────────────
// Tests the FULL sprint lifecycle using MockSpawnBackend.
// No real Claude CLI calls — workers write .result files instantly.
// This is the test that was MISSING and caused the kısır döngü.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MockSpawnBackend } from '../../src/orchestra/spawn-backend-mock.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';
import { calculateMetrics } from '../../src/orchestra/sprint-reporter.js';
import { TaskEvaluation, TaskStatus, SprintStatus, SprintPhase } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult, SprintMetrics } from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

const TEST_ROOT = path.join(process.cwd(), '.test-e2e-sprint-' + process.pid);
const TASKS_DIR = path.join(TEST_ROOT, '.tasks');

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001',
    title: 'Test Task',
    description: 'E2E test task',
    model: 'sonnet' as Task['model'],
    effort: 'normal' as Task['effort'],
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/test.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'partial' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    assignedAgent: 'test-agent',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-test',
    number: 999,
    status: SprintStatus.RUNNING,
    phase: SprintPhase.EXECUTE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    startedAt: new Date().toISOString(),
  } as Sprint;
}

function evaluateResult(result: TaskResult): TaskEvaluation {
  if (result.selfAssessment === 'NO_GO') return TaskEvaluation.NO_GO;
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT') return TaskEvaluation.GO_WITH_TECH_DEBT;
  if (!result.testsPassed) return TaskEvaluation.NO_GO;
  return TaskEvaluation.DONE;
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(TASKS_DIR, { recursive: true });
});

afterEach(cleanup);

// ─── Full Lifecycle ───────────────────────────────────────────────────────

describe('Sprint Lifecycle E2E', () => {
  it('single task DONE → correct evaluation and metrics', async () => {
    const task = makeTask();
    const sprint = makeSprint([task]);

    // Write task JSON (as Brain would)
    fs.writeFileSync(path.join(TASKS_DIR, `task-${task.id}.json`), JSON.stringify(task, null, 2));

    // Spawn worker (mock instantly writes .result)
    const backend = new MockSpawnBackend(TEST_ROOT, { defaultScenario: 'DONE', delayMs: 50 });
    backend.spawn(task.id, task.model, 'mock prompt');

    // Collect results (as Brain would)
    const results = await waitForResults(TEST_ROOT, sprint, 5000);

    // Evaluate (as Brain would)
    expect(results).toHaveLength(1);
    const evaluation = evaluateResult(results[0]!);
    expect(evaluation).toBe(TaskEvaluation.DONE);

    // Calculate metrics (as finalizeSprint would)
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set(task.id, evaluation);
    const metrics = calculateMetrics(sprint, evaluations, results);

    expect(metrics.totalTasks).toBe(1);
    expect(metrics.completedTasks).toBe(1);
    expect(metrics.techDebtTasks).toBe(0);
    expect(metrics.noGoTasks).toBe(0);
  });

  it('mixed results → correct counts (no double counting)', async () => {
    const tasks = [
      makeTask({ id: '001-001', title: 'Task A' }),
      makeTask({ id: '001-002', title: 'Task B' }),
      makeTask({ id: '001-003', title: 'Task C' }),
    ];
    const sprint = makeSprint(tasks);

    for (const task of tasks) {
      fs.writeFileSync(path.join(TASKS_DIR, `task-${task.id}.json`), JSON.stringify(task, null, 2));
    }

    const backend = new MockSpawnBackend(TEST_ROOT, {
      taskScenarios: {
        '001-001': 'DONE',
        '001-002': 'GO_WITH_TECH_DEBT',
        '001-003': 'NO_GO',
      },
      delayMs: 50,
    });

    for (const task of tasks) {
      backend.spawn(task.id, task.model, 'mock prompt');
    }

    const results = await waitForResults(TEST_ROOT, sprint, 5000);
    expect(results).toHaveLength(3);

    const evaluations = new Map<string, TaskEvaluation>();
    for (const result of results) {
      evaluations.set(result.taskId, evaluateResult(result));
    }

    const metrics = calculateMetrics(sprint, evaluations, results);

    // KEY ASSERTION: No double counting
    expect(metrics.totalTasks).toBe(3);
    expect(metrics.completedTasks).toBe(2); // DONE + GO_WITH_TECH_DEBT
    expect(metrics.techDebtTasks).toBe(1);  // Only GO_WITH_TECH_DEBT
    expect(metrics.noGoTasks).toBe(1);      // Only NO_GO

    // Verify: completed + noGo = total
    expect(metrics.completedTasks + metrics.noGoTasks).toBe(metrics.totalTasks);

    // Verify: donePure + techDebt + noGo = total
    const donePure = metrics.completedTasks - metrics.techDebtTasks;
    expect(donePure + metrics.techDebtTasks + metrics.noGoTasks).toBe(metrics.totalTasks);
  });

  it('timeout task → detected via .timeout marker', async () => {
    const task = makeTask({ id: '001-001' });
    const sprint = makeSprint([task]);

    fs.writeFileSync(path.join(TASKS_DIR, `task-${task.id}.json`), JSON.stringify(task, null, 2));

    const backend = new MockSpawnBackend(TEST_ROOT, {
      taskScenarios: { '001-001': 'TIMEOUT' },
      delayMs: 50,
    });
    backend.spawn(task.id, task.model, 'mock prompt');

    const results = await waitForResults(TEST_ROOT, sprint, 5000);

    // Timeout creates synthetic NO_GO result via result-collector
    expect(results).toHaveLength(1);
    expect(results[0]!.selfAssessment).toBe('NO_GO');
    expect(results[0]!.notes).toMatch(/timeout/i);
  });

  it('multiple workers with queue → all results collected', async () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeTask({ id: `001-00${i + 1}`, title: `Task ${i + 1}` }),
    );
    const sprint = makeSprint(tasks);

    for (const task of tasks) {
      fs.writeFileSync(path.join(TASKS_DIR, `task-${task.id}.json`), JSON.stringify(task, null, 2));
    }

    const backend = new MockSpawnBackend(TEST_ROOT, { defaultScenario: 'DONE', delayMs: 30 });
    for (const task of tasks) {
      backend.spawn(task.id, task.model, 'mock prompt');
    }

    const results = await waitForResults(TEST_ROOT, sprint, 10000);
    expect(results).toHaveLength(6);

    const evaluations = new Map<string, TaskEvaluation>();
    for (const r of results) evaluations.set(r.taskId, evaluateResult(r));

    const metrics = calculateMetrics(sprint, evaluations, results);
    expect(metrics.totalTasks).toBe(6);
    expect(metrics.completedTasks).toBe(6);
    expect(metrics.noGoTasks).toBe(0);
  });

  it('empty sprint → zero metrics', () => {
    const sprint = makeSprint([]);
    const evaluations = new Map<string, TaskEvaluation>();
    const metrics = calculateMetrics(sprint, evaluations, []);

    expect(metrics.totalTasks).toBe(0);
    expect(metrics.completedTasks).toBe(0);
    expect(metrics.noGoTasks).toBe(0);
  });
});

// ─── MockSpawnBackend Unit Tests ──────────────────────────────────────────

describe('MockSpawnBackend', () => {
  it('writes .result file for DONE scenario', async () => {
    const backend = new MockSpawnBackend(TEST_ROOT, { defaultScenario: 'DONE', delayMs: 10 });
    backend.spawn('test-001', 'sonnet' as Task['model'], 'prompt');
    await new Promise(r => setTimeout(r, 50));

    const resultPath = path.join(TASKS_DIR, 'task-test-001.result');
    expect(fs.existsSync(resultPath)).toBe(true);
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    expect(result.selfAssessment).toBe('DONE');
    expect(result.testsPassed).toBe(true);
  });

  it('writes .timeout file for TIMEOUT scenario', async () => {
    const backend = new MockSpawnBackend(TEST_ROOT, { defaultScenario: 'TIMEOUT', delayMs: 10 });
    backend.spawn('test-001', 'sonnet' as Task['model'], 'prompt');
    await new Promise(r => setTimeout(r, 50));

    expect(fs.existsSync(path.join(TASKS_DIR, 'task-test-001.timeout'))).toBe(true);
    expect(fs.existsSync(path.join(TASKS_DIR, 'task-test-001.result'))).toBe(false);
  });

  it('writes .hb heartbeat file', async () => {
    const backend = new MockSpawnBackend(TEST_ROOT, { defaultScenario: 'DONE', delayMs: 10 });
    backend.spawn('test-001', 'sonnet' as Task['model'], 'prompt');

    // Heartbeat written immediately
    const hbPath = path.join(TASKS_DIR, 'task-test-001.hb');
    expect(fs.existsSync(hbPath)).toBe(true);
  });

  it('list() returns active workers', () => {
    const backend = new MockSpawnBackend(TEST_ROOT, { defaultScenario: 'DONE', delayMs: 5000 });
    backend.spawn('w-001', 'sonnet' as Task['model'], 'prompt');
    backend.spawn('w-002', 'sonnet' as Task['model'], 'prompt');
    expect(backend.list()).toContain('w-001');
    expect(backend.list()).toContain('w-002');
  });

  it('isAvailable() returns true', async () => {
    const backend = new MockSpawnBackend(TEST_ROOT);
    expect(await backend.isAvailable()).toBe(true);
  });
});

// ─── Sprint Finalize → Chain Gate Integration ────────────────────────────

describe('Sprint Lifecycle — Chain Gate Ready', () => {
  it('finalized sprint produces metrics compatible with chain safety gate', async () => {
    const tasks = [
      makeTask({ id: '001-001', title: 'Task A' }),
      makeTask({ id: '001-002', title: 'Task B' }),
      makeTask({ id: '001-003', title: 'Task C' }),
    ];
    const sprint = makeSprint(tasks);

    for (const task of tasks) {
      fs.writeFileSync(path.join(TASKS_DIR, `task-${task.id}.json`), JSON.stringify(task, null, 2));
    }

    const backend = new MockSpawnBackend(TEST_ROOT, {
      taskScenarios: {
        '001-001': 'DONE',
        '001-002': 'GO_WITH_TECH_DEBT',
        '001-003': 'NO_GO',
      },
      delayMs: 30,
    });

    for (const task of tasks) {
      backend.spawn(task.id, task.model, 'mock prompt');
    }

    const results = await waitForResults(TEST_ROOT, sprint, 10000);
    const evaluations = new Map<string, TaskEvaluation>();
    for (const r of results) evaluations.set(r.taskId, evaluateResult(r));

    const metrics = calculateMetrics(sprint, evaluations, results);

    // Metrics must contain all fields needed by chain safety gate
    expect(metrics).toHaveProperty('totalTasks');
    expect(metrics).toHaveProperty('completedTasks');
    expect(metrics).toHaveProperty('techDebtTasks');
    expect(metrics).toHaveProperty('noGoTasks');
    expect(metrics).toHaveProperty('noGoRate');
    expect(metrics).toHaveProperty('coveragePercent');

    // noGoTasks is the key field for chain gate check #5
    expect(metrics.noGoTasks).toBe(1);
    // completedTasks includes DONE + TECH_DEBT
    expect(metrics.completedTasks).toBe(2);
    // Invariant: completed + noGo = total
    expect(metrics.completedTasks + metrics.noGoTasks).toBe(metrics.totalTasks);
  });
});
