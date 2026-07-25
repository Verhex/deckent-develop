/**
 * born-562 enabled-path — LIVE integration tests for the mid-sprint cost guard
 * inside waitForResults (result-collector). The dormant/disabled path is
 * covered by cost-guard-dispatch-gate.test.ts; the trip machinery by
 * mid-sprint-cost-abort.test.ts. This file proves the ENABLED path end-to-end
 * against the real wait loop via the costGuardOpts test seam
 * (injected getLimitCost + intervalMs — no real transcript/ledger I/O):
 *
 *   1. guard-trip → new-task dispatch STOPS (dep-satisfied PENDING never
 *      spawned) and the loop completes gracefully once in-flight tasks report
 *      (bounded timeout — returns well before the deadline).
 *   2. same under sprint_timeout_minutes:0 (timeoutMs=0, unlimited) — the
 *      costGuardShouldComplete break is the ONLY exit → live hang-fix proof.
 *   3. control: enabled but under-threshold → identical topology DOES dispatch
 *      the dependent task (proves test 1 measures the gate, not eligibility).
 *   4. nervous worker-respawn drain under cost-stop: the stale worker is
 *      killed but NOT respawned (spawnIfNotAssigned bypasses the dispatch
 *      gate — this pins the drain-side gate) and the loop still completes.
 *
 * Hermetic: tmpdir root, mocked result-watcher (short tick), mock
 * SpawnBackend; injected getLimitCost never touches HOME/global transcripts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Short-tick watcher: a real setTimeout (not resolve-immediately) so the
// monitor's setInterval is guaranteed scheduling room on every loop pass.
vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: () => ({
    waitForChange: () => new Promise<void>(resolve => { setTimeout(resolve, 5); }),
    close: () => {},
  }),
}));

import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint, TaskResult } from '../../src/core/types.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';
import { requestWorkerRespawn } from '../../src/nervous/respawn-request.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
  settleTestRuntimeBudget,
} from '../helpers/budgeted-docker-execution-fixture.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'claude-sonnet-5',
    provider: 'claude',
    type: 'code-development',
    budget: TEST_REMOTE_EXECUTION_BUDGET,
    budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-cg',
    createdAt: '2026-07-09T00:00:00.000Z',
    assignedAgent: 'generic',
    assignedSkills: [],
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-cg',
    number: 1,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: '2026-07-09T00:00:00.000Z',
  } as Sprint;
}

function makeConfig(extra?: Record<string, unknown>): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 2,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: true,
    },
    modes: {},
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    // max_limit_cost_usd MUST be > 0 — checkMidSprintCostGuard no-ops otherwise.
    cost_guard: { enabled: true, max_limit_cost_usd: 1 },
    ...extra,
  } as unknown as ResolvedConfig;
}

function doneResult(id: string): TaskResult {
  return {
    taskId: id,
    workerId: `w-${id}`,
    filesChanged: [`src/${id}.ts`],
    linesAdded: 5,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'ran',
    tokenUsage: {
      inputTokens: 10,
      outputTokens: 2,
      cacheReadTokens: 0,
      source: 'provider-adapter',
      provider: 'claude',
      model: 'claude-sonnet-5',
    },
    cost: {
      usd: 0.01,
      currency: 'USD',
      pricingSource: 'provider-envelope',
      isLocal: false,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

/**
 * Deferred trip signal: getLimitCost resolves over-threshold and signals the
 * test on its FIRST call. The monitor latches stopDispatch a microtask after
 * getLimitCost resolves (createCostGuardMonitor's .then), so callers must
 * allow a settle margin (~60ms) after `tripped` before acting on the latch.
 */
function makeTrippingCostGetter(costUsd: number): {
  getLimitCost: (root: string) => Promise<number>;
  tripped: Promise<void>;
} {
  let signal: () => void = () => {};
  const tripped = new Promise<void>(resolve => { signal = resolve; });
  return {
    getLimitCost: async () => { signal(); return costUsd; },
    tripped,
  };
}

// ═════════════════════════════════════════════════════════════════════

describe('born-562 enabled-path — cost-guard trip inside the live wait loop', () => {
  let root: string;
  let spawned: string[];
  let killed: string[];
  let backend: SpawnBackend;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-cg-enabled-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
    spawned = [];
    killed = [];
    backend = {
      ...TEST_MEASURED_LANDING_CAPABILITIES,
      name: 'mock',
      spawn: (taskId: string) => {
        spawned.push(taskId);
        settleTestRuntimeBudget(root, taskId);
        writeFileSync(
          join(root, '.tasks', `task-${taskId}.result`),
          JSON.stringify(doneResult(taskId)),
          'utf-8',
        );
      },
      kill: (taskId: string) => { killed.push(taskId); },
      list: () => [],
      isAvailable: async () => true,
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('trip stops new dispatch and completes gracefully before the bounded deadline', async () => {
    // a: in-flight (result arrives only AFTER the trip). b: PENDING dep=[a] —
    // would be dispatched on a's completion if the gate were open (see control).
    const a = makeTask('a', { status: TaskStatus.EXECUTING });
    const b = makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] });
    const sprint = makeSprint([a, b]);
    const { getLimitCost, tripped } = makeTrippingCostGetter(999);

    const start = Date.now();
    const pending = waitForResults(
      root, sprint, 8_000, undefined,
      { spawnBackend: backend, autoApprove: true }, undefined, makeConfig(),
      { getLimitCost, intervalMs: 10 },
    );
    await tripped;
    await sleep(60); // stopDispatch latch settle (microtask after getLimitCost)
    settleTestRuntimeBudget(root, 'a');
    writeFileSync(join(root, '.tasks', 'task-a.result'), JSON.stringify(doneResult('a')), 'utf-8');
    const results = await pending;
    const elapsed = Date.now() - start;

    expect(spawned).not.toContain('b');            // gate held — no new dispatch
    expect(results.map(r => r.taskId)).toEqual(['a']); // in-flight finished + collected
    expect(elapsed).toBeLessThan(4_000);           // graceful break, not the 8s deadline
  }, 10_000);

  it('trip completes the loop under timeoutMs=0 (unlimited) — live hang-fix proof', async () => {
    // Under unlimited timeout the costGuardShouldComplete break is the ONLY
    // possible exit once dispatch is stopped: without it this test times out.
    const a = makeTask('a', { status: TaskStatus.EXECUTING });
    const b = makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] });
    const sprint = makeSprint([a, b]);
    const { getLimitCost, tripped } = makeTrippingCostGetter(999);

    const pending = waitForResults(
      root, sprint, 0, undefined,
      { spawnBackend: backend, autoApprove: true }, undefined, makeConfig(),
      { getLimitCost, intervalMs: 10 },
    );
    await tripped;
    await sleep(60);
    settleTestRuntimeBudget(root, 'a');
    writeFileSync(join(root, '.tasks', 'task-a.result'), JSON.stringify(doneResult('a')), 'utf-8');
    const results = await pending;

    expect(spawned).not.toContain('b');
    expect(results.map(r => r.taskId)).toEqual(['a']);
  }, 10_000);

  it('control: enabled but under-threshold → identical topology DOES dispatch the dependent task', async () => {
    // Proves tests 1-2 measure the gate, not b's eligibility: same sprint
    // shape, cost stays below max_limit_cost_usd → b spawns after a reports.
    const a = makeTask('a', { status: TaskStatus.EXECUTING });
    const b = makeTask('b', { status: TaskStatus.PENDING, dependencies: ['a'] });
    const sprint = makeSprint([a, b]);
    const { getLimitCost, tripped } = makeTrippingCostGetter(0); // $0 < $1 → never trips

    const pending = waitForResults(
      root, sprint, 8_000, undefined,
      { spawnBackend: backend, autoApprove: true }, undefined, makeConfig(),
      { getLimitCost, intervalMs: 10 },
    );
    await tripped; // ≥1 monitor tick ran (same rhythm as tests 1-2)
    await sleep(60);
    settleTestRuntimeBudget(root, 'a');
    writeFileSync(join(root, '.tasks', 'task-a.result'), JSON.stringify(doneResult('a')), 'utf-8');
    const results = await pending;

    expect(spawned).toContain('b');                // gate open — b dispatched
    expect(results.map(r => r.taskId).sort()).toEqual(['a', 'b']);
  }, 10_000);

  it('nervous respawn drain under cost-stop: kills the stale worker but does NOT respawn', async () => {
    // spawnIfNotAssigned bypasses the main-loop dispatch gate — this pins the
    // drain-side gate: post-trip respawn request → kill yes, spawn NO, task
    // left PENDING (counts into stillPending → loop completes with 0 results).
    const a = makeTask('a', { status: TaskStatus.EXECUTING });
    const sprint = makeSprint([a]);
    const { getLimitCost, tripped } = makeTrippingCostGetter(999);

    const pending = waitForResults(
      root, sprint, 3_000, undefined,
      { spawnBackend: backend, autoApprove: true }, undefined,
      makeConfig({ nervous_system: { worker_respawn: true } }),
      { getLimitCost, intervalMs: 10 },
    );
    await tripped;
    await sleep(60); // latch settle BEFORE the request — drain must see stopped=true
    requestWorkerRespawn(root, 'a');
    const results = await pending;

    expect(killed).toContain('a');                 // stale token-burner killed
    expect(spawned).toEqual([]);                   // no respawn under cost stop
    expect(results).toEqual([]);                   // nothing collected — honest empty
    expect(a.status).toBe(TaskStatus.PENDING);     // stillPending → graceful complete
  }, 10_000);
});
