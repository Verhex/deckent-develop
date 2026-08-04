/**
 * born-585 PROJECTROOT-THREAD (Sprint 395 Task 395-001)
 *
 * buildWorkerPrompt(task, agentPrompt, skillPrompts, projectRoot?) accepts an
 * explicit projectRoot (defaults to process.cwd() only when the caller omits
 * it — sprint-391 T1). Seven production call sites previously omitted the 4th
 * arg entirely, silently falling back to process.cwd(). Today cwd === the
 * caller's real projectRoot everywhere in this repo's own workflow, so the
 * omission was byte-identical in practice — but it is structurally wrong for
 * MCP-cwd-!=-projectRoot and global-install scenarios.
 *
 * This test pins the two heaviest call sites end-to-end (no mocking of
 * buildWorkerPrompt itself — the real function, the real spawn/collector
 * pipeline) using the same ADR-injection observability seam as the sibling
 * fix at task-builder.test.ts "loads the ADR block from projectRoot, not
 * process.cwd()" (391-001 TASK-BUILDER-ADR-CWD-LEAK): seed a fixture ADR only
 * under the real projectRoot's `.brain/memory.db`, chdir the process to a
 * DIFFERENT, ADR-less directory, and assert the rendered worker prompt still
 * contains the fixture marker. That is only possible if buildWorkerPrompt
 * received the caller's projectRoot — not process.cwd().
 *
 *   1. spawn-path    — sprint-spawner.ts:647 spawnWorkers()
 *   2. collector-path — result-collector.ts:1204 waitForResults() queue dispatch
 *      of a dependency-just-satisfied PENDING task (mirrors
 *      dispatch-evaluate-race.test.ts test 8 / cost-guard-enabled-path.test.ts
 *      "control" test, which already exercise this exact dispatch branch).
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, TaskResult, ModelType } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
} from '../helpers/budgeted-docker-execution-fixture.js';

// Short-tick watcher so waitForResults' main loop iterates promptly instead of
// falling back to its 5s poll (mirrors cost-guard-enabled-path.test.ts / dispatch-evaluate-race.test.ts).
vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: () => ({
    waitForChange: () => Promise.resolve(),
    close: () => {},
  }),
}));

// This suite verifies projectRoot propagation, not the host budget ledger.
// Keep the remote fixture finite while preventing a 45s wait for Docker-owned
// terminal usage evidence that this in-memory backend cannot produce.
vi.mock('../../src/orchestra/runtime-budget-monitor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/runtime-budget-monitor.js')>();
  const terminalUsage = () => ({
    terminal: true,
    decision: {
      state: 'within-budget' as const,
      reasons: [],
      counters: {
        turns: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 0,
        maxContextTokens: 0,
      },
    },
  });
  return {
    ...actual,
    readRuntimeBudgetUsage: terminalUsage,
    waitForTerminalRuntimeBudgetUsage: () => Promise.resolve(terminalUsage()),
  };
});

import { spawnWorkers } from '../../src/orchestra/sprint-spawner.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';

// ─── Helpers ────────────────────────────────────────────────────────

interface SpawnCall {
  taskId: string;
  model: ModelType;
  prompt: string;
  opts?: SpawnBackendOptions;
}

function makeCapturingBackend(onSpawn?: (taskId: string) => void): SpawnBackend & { calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  return {
    name: 'mock',
    ...TEST_MEASURED_LANDING_CAPABILITIES,
    spawn(taskId, model, prompt, opts) {
      calls.push({ taskId, model, prompt, opts });
      onSpawn?.(taskId);
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

/** Seed `<projectRoot>/.brain/memory.db` with a single accepted ADR whose
 * content contains `marker`, force-included by referencing its id in the
 * task description text (adr-selector.ts extractExplicitAdrRefs). */
function seedFixtureAdr(projectRoot: string, id: string, marker: string): void {
  mkdirSync(join(projectRoot, '.brain'), { recursive: true });
  const store = new MemoryStore(join(projectRoot, '.brain', 'memory.db'));
  try {
    store.insert({
      id,
      type: 'adr',
      title: `Fixture Marker ADR ${id}`,
      content: `# ${id.toUpperCase()}: Fixture Marker\n\n**Status:** accepted\n\n${marker}.\n`,
      status: 'accepted',
      sprint_id: 'sprint-395',
      sprint_num: 395,
    });
  } finally {
    store.close();
  }
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'claude-sonnet-5' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-395',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
    type: 'code-development',
    budget: TEST_REMOTE_EXECUTION_BUDGET,
    budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
    ...overrides,
  } as Task;
}

function makeSprint(id: string, tasks: Task[]): Sprint {
  return {
    id,
    number: 395,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: '2026-07-10T00:00:00.000Z',
  } as Sprint;
}

function makeSpawnConfig(): ResolvedConfig {
  return {
    dependency_pipeline_enabled: false,
    activeModeConfig: { max_workers: 4 },
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
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      source: 'provider-adapter',
      provider: 'claude',
      model: 'claude-sonnet-5',
    },
    cost: {
      usd: 0,
      currency: 'USD',
      pricingSource: 'provider-envelope',
      isLocal: false,
    },
  };
}

// ─── 1. spawn-path — sprint-spawner.ts:647 spawnWorkers() ────────────

describe('buildWorkerPrompt projectRoot thread — spawn-path (sprint-spawner.ts spawnWorkers)', () => {
  it('renders the fixture ADR sourced from the caller-supplied projectRoot, not process.cwd()', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'pr-thread-spawn-root-'));
    const cwdFixture = mkdtempSync(join(tmpdir(), 'pr-thread-spawn-cwd-'));
    const marker = 'PROJECTROOT_THREAD_SPAWN_MARKER_XYZ';
    const originalCwd = process.cwd();

    try {
      mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
      mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
      seedFixtureAdr(projectRoot, 'adr-991', marker);
      // cwd has NO .brain/memory.db — a cwd-based ADR read finds nothing here.
      expect(existsSync(join(cwdFixture, '.brain'))).toBe(false);

      const task = makeTask('991-001', {
        description: 'Implements ADR-991 fixture behavior for the spawn-path projectRoot thread test.',
      });
      const sprint = makeSprint('sprint-991', [task]);
      const backend = makeCapturingBackend();

      process.chdir(cwdFixture);
      await spawnWorkers(projectRoot, sprint, makeSpawnConfig(), { spawnBackend: backend });

      expect(backend.calls).toHaveLength(1);
      expect(backend.calls[0]!.prompt).toContain(marker);
    } finally {
      process.chdir(originalCwd);
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(cwdFixture, { recursive: true, force: true });
    }
  });
});

// ─── 2. collector-path — result-collector.ts:1204 waitForResults() queue dispatch ──

describe('buildWorkerPrompt projectRoot thread — collector-path (result-collector.ts waitForResults queue dispatch)', () => {
  it('renders the fixture ADR sourced from the caller-supplied projectRoot when dispatching a dependency-just-satisfied task', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'pr-thread-collector-root-'));
    const cwdFixture = mkdtempSync(join(tmpdir(), 'pr-thread-collector-cwd-'));
    const marker = 'PROJECTROOT_THREAD_COLLECTOR_MARKER_XYZ';
    const originalCwd = process.cwd();

    try {
      mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
      seedFixtureAdr(projectRoot, 'adr-992', marker);
      expect(existsSync(join(cwdFixture, '.brain'))).toBe(false);

      // a is EXECUTING with its .result already on disk; b is PENDING dep=[a] —
      // dependency-just-satisfied, dispatched via the queue path (result-collector
      // findReadyUndispatchedTasks → buildWorkerPrompt at line ~1204).
      const a = makeTask('a', { status: TaskStatus.EXECUTING });
      const b = makeTask('b', {
        status: TaskStatus.PENDING,
        dependencies: ['a'],
        description: 'Implements ADR-992 fixture behavior for the collector-path projectRoot thread test.',
      });
      const sprint = makeSprint('sprint-395', [a, b]);
      writeFileSync(join(projectRoot, '.tasks', 'task-a.result'), JSON.stringify(doneResult('a')), 'utf-8');

      const backend = makeCapturingBackend(taskId => {
        if (taskId === 'b') {
          writeFileSync(
            join(projectRoot, '.tasks', 'task-b.result'),
            JSON.stringify(doneResult('b')),
            'utf-8',
          );
        }
      });

      process.chdir(cwdFixture);
      // auth_mode is REQUIRED for the queue dispatch path: billing-mode
      // resolution fails closed when a real config leaves it unresolved
      // (evaluateRunCostBudget → runBudgetHold → dispatch suppressed +
      // dispatchHoldShouldComplete early exit). Mirrors makeConfig in
      // dispatch-evaluate-race.test.ts (the green sibling of this branch).
      const results = await waitForResults(
        projectRoot, sprint, 3000, undefined,
        { spawnBackend: backend, autoApprove: true }, undefined,
        {
          dependency_pipeline_enabled: false,
          activeModeConfig: { max_workers: 4 },
          auth_mode: 'api',
        } as unknown as ResolvedConfig,
      );

      const bCall = backend.calls.find(c => c.taskId === 'b');
      expect(bCall).toBeDefined();
      expect(bCall!.prompt).toContain(marker);
      expect(results.map(r => r.taskId).sort()).toEqual(['a', 'b']);
    } finally {
      process.chdir(originalCwd);
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(cwdFixture, { recursive: true, force: true });
    }
  }, 10_000);
});
