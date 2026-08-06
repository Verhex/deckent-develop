// ─── Chain Safety Gate E2E Tests ──────────────────────────────────────────
// Tests the chain safety gate that runs after sprint finalization.
// The gate evaluates 5 checks and decides whether to auto-trigger the next
// sprint or abort the chain with a notification.
//
// Gate checks:
//   1. doctor PASS
//   2. tsc --noEmit 0 errors
//   3. vitest ≥99% pass rate
//   4. Sprint cost <$100 (subs mode threshold)
//   5. NO_GO count <3
//
// All checks PASS → auto-trigger next sprint
// Any check FAIL → chain ABORT + notify

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MockSpawnBackend } from '../../src/orchestra/spawn-backend-mock.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';
import { calculateMetrics } from '../../src/orchestra/sprint-reporter.js';
import { TaskEvaluation, TaskStatus, SprintStatus, SprintPhase } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult, SprintMetrics } from '../../src/core/types.js';
import { providerRegistry } from '../../src/core/provider.js';
import type { ProviderAdapter } from '../../src/core/provider.js';

// 531 e2e-aile dilimi (GR-2026-08-06-COVDEBT-E2E-01): this suite predates the
// provider registry and registered nothing, so resolveTaskProvider's contract
// (explicit provider → model registry → DEFAULT provider) died at resolution
// before any gate logic ran. A minimal default adapter restores the real
// production fallback path without coupling the fixtures to any model
// identity; the gate/lifecycle pins under test are unchanged.
const e2eDefaultProviderStub: ProviderAdapter = {
  name: 'e2e-default-stub',
  supportedModels: [],
  executionCostClass: 'local',
  spawn: () => {},
  kill: () => {},
  listWorkers: () => [],
  isAvailable: async () => true,
  buildCommand: () => 'e2e-default-stub',
};

// ─── Chain Safety Gate ───────────────────────────────────────────────────

/** Chain safety gate check results */
interface ChainGateResult {
  passed: boolean;
  checks: {
    doctor: boolean;
    tsc: boolean;
    vitest: boolean;
    cost: boolean;
    noGoCount: boolean;
  };
  failReasons: string[];
  /** If passed, contains info about the next sprint to trigger */
  nextSprintTrigger?: { sprintNumber: number };
}

/** Cost info for the sprint (simulated) */
interface SprintCostInfo {
  totalCostUsd: number;
  subsMode: boolean;
  threshold: number;
}

/** External check results (simulated — in real use these come from shell commands) */
interface ExternalChecks {
  doctorPass: boolean;
  tscErrors: number;
  vitestPassRate: number; // 0-100
}

/**
 * Chain safety gate — evaluates 5 checks after sprint finalization.
 * This is the core logic being tested. In production, this would be in
 * sprint-controller.ts or a dedicated chain-gate module.
 */
function evaluateChainGate(
  metrics: SprintMetrics,
  costInfo: SprintCostInfo,
  externalChecks: ExternalChecks,
  currentSprintNumber: number,
): ChainGateResult {
  const failReasons: string[] = [];
  const checks = {
    doctor: externalChecks.doctorPass,
    tsc: externalChecks.tscErrors === 0,
    vitest: externalChecks.vitestPassRate >= 99,
    cost: costInfo.totalCostUsd < costInfo.threshold,
    noGoCount: metrics.noGoTasks < 3,
  };

  if (!checks.doctor) failReasons.push('doctor check failed');
  if (!checks.tsc) failReasons.push(`tsc has ${externalChecks.tscErrors} error(s)`);
  if (!checks.vitest) failReasons.push(`vitest pass rate ${externalChecks.vitestPassRate}% < 99%`);
  if (!checks.cost) failReasons.push(`cost $${costInfo.totalCostUsd} >= threshold $${costInfo.threshold}`);
  if (!checks.noGoCount) failReasons.push(`${metrics.noGoTasks} NO_GO tasks (max 2)`);

  const passed = failReasons.length === 0;
  return {
    passed,
    checks,
    failReasons,
    ...(passed ? { nextSprintTrigger: { sprintNumber: currentSprintNumber + 1 } } : {}),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const TEST_ROOT = path.join(process.cwd(), '.test-e2e-chain-' + process.pid);
const TASKS_DIR = path.join(TEST_ROOT, '.tasks');

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001',
    title: 'Test Task',
    description: 'Chain safety test task',
    model: 'sonnet' as Task['model'],
    effort: 'normal' as Task['effort'],
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/test.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'partial' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-143',
    createdAt: new Date().toISOString(),
    assignedAgent: 'test-agent',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[], number = 143): Sprint {
  return {
    id: `sprint-${number}`,
    number,
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

/** Default external checks — all passing */
const PASSING_CHECKS: ExternalChecks = {
  doctorPass: true,
  tscErrors: 0,
  vitestPassRate: 100,
};

/** Default cost info — under threshold */
const PASSING_COST: SprintCostInfo = {
  totalCostUsd: 42,
  subsMode: true,
  threshold: 100,
};

/** Run a mini-sprint with MockSpawnBackend and return metrics + evaluations */
async function runMiniSprint(
  taskConfigs: Array<{ id: string; scenario: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' | 'TIMEOUT' }>,
): Promise<{ metrics: SprintMetrics; evaluations: Map<string, TaskEvaluation>; results: TaskResult[] }> {
  const tasks = taskConfigs.map(tc => makeTask({ id: tc.id, title: `Task ${tc.id}` }));
  const sprint = makeSprint(tasks);

  for (const task of tasks) {
    fs.writeFileSync(path.join(TASKS_DIR, `task-${task.id}.json`), JSON.stringify(task, null, 2));
  }

  const taskScenarios: Record<string, string> = {};
  for (const tc of taskConfigs) {
    taskScenarios[tc.id] = tc.scenario;
  }

  const backend = new MockSpawnBackend(TEST_ROOT, { taskScenarios, delayMs: 30 });
  for (const task of tasks) {
    backend.spawn(task.id, task.model, 'mock prompt');
  }

  const results = await waitForResults(TEST_ROOT, sprint, 10000);
  const evaluations = new Map<string, TaskEvaluation>();
  for (const result of results) {
    evaluations.set(result.taskId, evaluateResult(result));
  }

  const metrics = calculateMetrics(sprint, evaluations, results);
  return { metrics, evaluations, results };
}

// ─── Setup / Teardown ────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  fs.mkdirSync(TASKS_DIR, { recursive: true });
  providerRegistry.clear();
  providerRegistry.registerProvider(e2eDefaultProviderStub, true);
});

afterEach(() => {
  providerRegistry.clear();
  cleanup();
});

// ─── Chain Safety Gate Tests ─────────────────────────────────────────────

describe('Chain Safety Gate E2E', () => {

  // ─── Scenario 1: All 5 checks pass → auto-trigger ─────────────────

  it('all checks PASS → gate passes and returns next sprint trigger', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'DONE' },
      { id: '001-002', scenario: 'DONE' },
      { id: '001-003', scenario: 'DONE' },
    ]);

    const gate = evaluateChainGate(metrics, PASSING_COST, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(true);
    expect(gate.failReasons).toHaveLength(0);
    expect(gate.checks.doctor).toBe(true);
    expect(gate.checks.tsc).toBe(true);
    expect(gate.checks.vitest).toBe(true);
    expect(gate.checks.cost).toBe(true);
    expect(gate.checks.noGoCount).toBe(true);
    expect(gate.nextSprintTrigger).toEqual({ sprintNumber: 144 });
  });

  // ─── Scenario 2: 3+ NO_GO → gate FAILS ────────────────────────────

  it('3+ NO_GO tasks → gate fails with noGoCount reason', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'NO_GO' },
      { id: '001-002', scenario: 'NO_GO' },
      { id: '001-003', scenario: 'NO_GO' },
    ]);

    const gate = evaluateChainGate(metrics, PASSING_COST, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(false);
    expect(gate.checks.noGoCount).toBe(false);
    expect(gate.failReasons).toContain('3 NO_GO tasks (max 2)');
    expect(gate.nextSprintTrigger).toBeUndefined();
  });

  // ─── Scenario 3: Cost exceeds threshold → gate FAILS ──────────────

  it('cost >$100 threshold → gate fails with cost reason', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'DONE' },
      { id: '001-002', scenario: 'DONE' },
      { id: '001-003', scenario: 'DONE' },
    ]);

    const expensiveCost: SprintCostInfo = { totalCostUsd: 150, subsMode: true, threshold: 100 };
    const gate = evaluateChainGate(metrics, expensiveCost, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(false);
    expect(gate.checks.cost).toBe(false);
    expect(gate.failReasons).toContain('cost $150 >= threshold $100');
  });

  // ─── Scenario 4: Doctor failure → gate FAILS ──────────────────────

  it('doctor check fails → gate fails', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'DONE' },
    ]);

    const failedDoctor: ExternalChecks = { ...PASSING_CHECKS, doctorPass: false };
    const gate = evaluateChainGate(metrics, PASSING_COST, failedDoctor, 143);

    expect(gate.passed).toBe(false);
    expect(gate.checks.doctor).toBe(false);
    expect(gate.failReasons).toContain('doctor check failed');
  });

  // ─── Scenario 5: tsc errors → gate FAILS ──────────────────────────

  it('tsc errors → gate fails with error count', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'DONE' },
    ]);

    const tscFail: ExternalChecks = { ...PASSING_CHECKS, tscErrors: 7 };
    const gate = evaluateChainGate(metrics, PASSING_COST, tscFail, 143);

    expect(gate.passed).toBe(false);
    expect(gate.checks.tsc).toBe(false);
    expect(gate.failReasons).toContain('tsc has 7 error(s)');
  });

  // ─── Scenario 6: vitest <99% → gate FAILS ─────────────────────────

  it('vitest pass rate below 99% → gate fails', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'DONE' },
    ]);

    const lowVitest: ExternalChecks = { ...PASSING_CHECKS, vitestPassRate: 95 };
    const gate = evaluateChainGate(metrics, PASSING_COST, lowVitest, 143);

    expect(gate.passed).toBe(false);
    expect(gate.checks.vitest).toBe(false);
    expect(gate.failReasons).toContain('vitest pass rate 95% < 99%');
  });

  // ─── Scenario 7: Boundary — exactly 2 NO_GO → still PASS ─────────

  it('exactly 2 NO_GO tasks → gate passes (boundary)', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'DONE' },
      { id: '001-002', scenario: 'NO_GO' },
      { id: '001-003', scenario: 'NO_GO' },
      { id: '001-004', scenario: 'DONE' },
    ]);

    expect(metrics.noGoTasks).toBe(2);
    const gate = evaluateChainGate(metrics, PASSING_COST, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(true);
    expect(gate.checks.noGoCount).toBe(true);
    expect(gate.nextSprintTrigger).toEqual({ sprintNumber: 144 });
  });

  // ─── Scenario 8: Boundary — cost exactly $100 → still PASS ────────

  it('cost exactly at threshold ($100) → gate fails (strict less-than)', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'DONE' },
    ]);

    // The gate uses strict < not <=, so exactly $100 fails
    const exactCost: SprintCostInfo = { totalCostUsd: 100, subsMode: true, threshold: 100 };
    const gate = evaluateChainGate(metrics, exactCost, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(false);
    expect(gate.checks.cost).toBe(false);
  });

  // ─── Scenario 9: Multiple failures at once ────────────────────────

  it('multiple failures (cost + NO_GO + tsc) → all captured in failReasons', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'NO_GO' },
      { id: '001-002', scenario: 'NO_GO' },
      { id: '001-003', scenario: 'NO_GO' },
      { id: '001-004', scenario: 'NO_GO' },
    ]);

    const expensiveCost: SprintCostInfo = { totalCostUsd: 200, subsMode: true, threshold: 100 };
    const tscFail: ExternalChecks = { ...PASSING_CHECKS, tscErrors: 3 };
    const gate = evaluateChainGate(metrics, expensiveCost, tscFail, 143);

    expect(gate.passed).toBe(false);
    expect(gate.failReasons.length).toBeGreaterThanOrEqual(3);
    expect(gate.failReasons.some(r => r.includes('NO_GO'))).toBe(true);
    expect(gate.failReasons.some(r => r.includes('cost'))).toBe(true);
    expect(gate.failReasons.some(r => r.includes('tsc'))).toBe(true);
    expect(gate.nextSprintTrigger).toBeUndefined();
  });

  // ─── Scenario 10: Empty sprint → PASS ─────────────────────────────

  it('empty sprint (0 tasks) → gate passes', () => {
    const sprint = makeSprint([], 143);
    const evaluations = new Map<string, TaskEvaluation>();
    const metrics = calculateMetrics(sprint, evaluations, []);

    expect(metrics.totalTasks).toBe(0);
    expect(metrics.noGoTasks).toBe(0);

    const gate = evaluateChainGate(metrics, PASSING_COST, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(true);
    expect(gate.nextSprintTrigger).toEqual({ sprintNumber: 144 });
  });

  // ─── Scenario 11: All NO_GO → FAIL + abort ────────────────────────

  it('all tasks NO_GO → gate fails with abort signal', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'NO_GO' },
      { id: '001-002', scenario: 'NO_GO' },
      { id: '001-003', scenario: 'NO_GO' },
      { id: '001-004', scenario: 'NO_GO' },
      { id: '001-005', scenario: 'NO_GO' },
    ]);

    expect(metrics.noGoTasks).toBe(5);
    expect(metrics.completedTasks).toBe(0);

    const gate = evaluateChainGate(metrics, PASSING_COST, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(false);
    expect(gate.checks.noGoCount).toBe(false);
    expect(gate.nextSprintTrigger).toBeUndefined();
  });

  // ─── Scenario 12: vitest exactly 99% → PASS (boundary) ────────────

  it('vitest pass rate exactly 99% → gate passes (boundary)', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'DONE' },
    ]);

    const exact99: ExternalChecks = { ...PASSING_CHECKS, vitestPassRate: 99 };
    const gate = evaluateChainGate(metrics, exact99, PASSING_CHECKS, 143);

    // vitest check uses >= 99, so exactly 99 passes
    // But we also need to check against PASSING_CHECKS for cost etc.
    // Let's use the correct checks parameter
    const gateCorrect = evaluateChainGate(metrics, PASSING_COST, exact99, 143);

    expect(gateCorrect.passed).toBe(true);
    expect(gateCorrect.checks.vitest).toBe(true);
  });

  // ─── Scenario 13: Mixed DONE + TECH_DEBT → PASS if <3 NO_GO ──────

  it('mixed DONE and TECH_DEBT with 0 NO_GO → gate passes', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'DONE' },
      { id: '001-002', scenario: 'GO_WITH_TECH_DEBT' },
      { id: '001-003', scenario: 'GO_WITH_TECH_DEBT' },
    ]);

    expect(metrics.completedTasks).toBe(3);
    expect(metrics.techDebtTasks).toBe(2);
    expect(metrics.noGoTasks).toBe(0);

    const gate = evaluateChainGate(metrics, PASSING_COST, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(true);
    expect(gate.nextSprintTrigger).toEqual({ sprintNumber: 144 });
  });

  // ─── Scenario 14: Cost just under threshold → PASS ────────────────

  it('cost $99.99 just under $100 threshold → gate passes', async () => {
    const { metrics } = await runMiniSprint([
      { id: '001-001', scenario: 'DONE' },
    ]);

    const justUnder: SprintCostInfo = { totalCostUsd: 99.99, subsMode: true, threshold: 100 };
    const gate = evaluateChainGate(metrics, justUnder, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(true);
    expect(gate.checks.cost).toBe(true);
  });
});

// ─── Chain Gate Integration — Full Pipeline ──────────────────────────────

describe('Chain Safety Gate — Full Pipeline Simulation', () => {

  it('3-task sprint → finalize → gate → auto-trigger decision', async () => {
    // Phase 1: Run mini-sprint (PLAN → SPAWN → EXECUTE)
    const tasks = [
      makeTask({ id: '143-001', title: 'Shell Injection Fix' }),
      makeTask({ id: '143-002', title: 'Path Traversal Fix' }),
      makeTask({ id: '143-003', title: 'Git Tracking Fix' }),
    ];
    const sprint = makeSprint(tasks, 143);

    for (const task of tasks) {
      fs.writeFileSync(
        path.join(TASKS_DIR, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
      );
    }

    const backend = new MockSpawnBackend(TEST_ROOT, {
      taskScenarios: {
        '143-001': 'DONE',
        '143-002': 'GO_WITH_TECH_DEBT',
        '143-003': 'DONE',
      },
      delayMs: 30,
    });

    for (const task of tasks) {
      backend.spawn(task.id, task.model, 'mock prompt');
    }

    // Phase 2: Collect results (EVALUATE)
    const results = await waitForResults(TEST_ROOT, sprint, 10000);
    expect(results).toHaveLength(3);

    const evaluations = new Map<string, TaskEvaluation>();
    for (const r of results) evaluations.set(r.taskId, evaluateResult(r));

    // Phase 3: Calculate metrics (RETRO)
    const metrics = calculateMetrics(sprint, evaluations, results);
    expect(metrics.totalTasks).toBe(3);
    expect(metrics.completedTasks).toBe(3);
    expect(metrics.techDebtTasks).toBe(1);
    expect(metrics.noGoTasks).toBe(0);

    // Phase 4: Chain safety gate
    const gate = evaluateChainGate(metrics, PASSING_COST, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(true);
    expect(gate.nextSprintTrigger).toEqual({ sprintNumber: 144 });
  });

  it('sprint with failures → gate blocks chain', async () => {
    // Phase 1: Run mini-sprint with failures
    const tasks = [
      makeTask({ id: '143-001', title: 'Task A' }),
      makeTask({ id: '143-002', title: 'Task B' }),
      makeTask({ id: '143-003', title: 'Task C' }),
      makeTask({ id: '143-004', title: 'Task D' }),
      makeTask({ id: '143-005', title: 'Task E' }),
    ];
    const sprint = makeSprint(tasks, 143);

    for (const task of tasks) {
      fs.writeFileSync(
        path.join(TASKS_DIR, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
      );
    }

    const backend = new MockSpawnBackend(TEST_ROOT, {
      taskScenarios: {
        '143-001': 'DONE',
        '143-002': 'NO_GO',
        '143-003': 'NO_GO',
        '143-004': 'NO_GO',
        '143-005': 'GO_WITH_TECH_DEBT',
      },
      delayMs: 30,
    });

    for (const task of tasks) {
      backend.spawn(task.id, task.model, 'mock prompt');
    }

    // Phase 2: Collect results
    const results = await waitForResults(TEST_ROOT, sprint, 10000);
    expect(results).toHaveLength(5);

    const evaluations = new Map<string, TaskEvaluation>();
    for (const r of results) evaluations.set(r.taskId, evaluateResult(r));

    // Phase 3: Metrics
    const metrics = calculateMetrics(sprint, evaluations, results);
    expect(metrics.noGoTasks).toBe(3);

    // Phase 4: Gate MUST block
    const gate = evaluateChainGate(metrics, PASSING_COST, PASSING_CHECKS, 143);

    expect(gate.passed).toBe(false);
    expect(gate.checks.noGoCount).toBe(false);
    expect(gate.failReasons).toContain('3 NO_GO tasks (max 2)');
    expect(gate.nextSprintTrigger).toBeUndefined();
  });
});
