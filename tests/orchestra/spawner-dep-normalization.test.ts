/**
 * Task 323-031 wire — planner dependency normalization at the SPAWN entry.
 *
 * spawnWorkers must resolve each task's free-text `dependencies` (the AI planner
 * emits sibling TITLES, not slot ids) into concrete same-sprint task ids BEFORE
 * any buildDependencyGraph runs — closing the sprint-323 EXECUTE-hang root where
 * unresolvable title-deps reached the dependency scheduler. The
 * normalizePlannerDependencies function shipped in 323-031 but had ZERO
 * production callers; this test pins the wire.
 *
 * Faithful regression: against the pre-wire spawnWorkers (no normalization call)
 * the title-dep survives unresolved, so `toEqual(['323-007'])` is RED before the
 * wire and GREEN after.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnWorkers } from '../../src/orchestra/sprint-spawner.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
} from '../helpers/budgeted-docker-execution-fixture.js';

function makeBackend(): SpawnBackend {
  return {
    name: 'mock-depnorm',
    ...TEST_MEASURED_LANDING_CAPABILITIES,
    spawn() { /* no-op — we only assert on dependency mutation, not spawn */ },
    kill() { /* no-op */ },
    list() { return []; },
    isAvailable() { return Promise.resolve(true); },
  } as unknown as SpawnBackend;
}

function createTask(id: string, title: string, dependencies: string[]): Task {
  return {
    id,
    title,
    description: `dep-norm test ${id}`,
    model: 'claude-sonnet-5' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'dep-norm-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/depnorm-${id}.ts`] },
    dependencies,
    goNogo: { goCriteria: 'x', noGoCriteria: 'x', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-323',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
    budget: TEST_REMOTE_EXECUTION_BUDGET,
    budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
  } as unknown as Task;
}

function makeConfig(): ResolvedConfig {
  // dependency_pipeline_enabled:false keeps the test minimal — normalization runs
  // at the spawnWorkers entry, ahead of (and independent of) the pipeline gate.
  return {
    dependency_pipeline_enabled: false,
    activeModeConfig: { max_workers: 8 },
    token_throttle_ms: 0,
  } as unknown as ResolvedConfig;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-323',
    number: 323,
    phase: 'SPAWN' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'],
    tasks,
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

describe('spawnWorkers — planner dependency normalization wire (323-031)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'dep-norm-'));
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
  });

  function persist(tasks: Task[]): void {
    for (const t of tasks) {
      writeFileSync(
        join(testRoot, '.tasks', `task-${t.id}.json`),
        JSON.stringify(t, null, 2),
        'utf-8',
      );
    }
  }

  async function runSpawn(sprint: Sprint): Promise<void> {
    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: makeBackend() });
    } finally {
      process.chdir(origCwd);
    }
  }

  it('resolves a sibling TITLE dependency to its concrete slot id', async () => {
    const target = createTask('323-007', 'Build REST API', []);
    const dependent = createTask('323-027', 'Frontend UI', ['Build REST API']);
    const tasks = [target, dependent];
    persist(tasks);

    await runSpawn(makeSprint(tasks));

    // Pre-wire: the free-text title survives unresolved → RED.
    // Post-wire: normalized to the resolved sibling id.
    expect(dependent.dependencies).toEqual(['323-007']);
    expect(target.dependencies).toEqual([]);
  });

  it('is behaviour-preserving for already-correct id deps (no change)', async () => {
    const target = createTask('323-007', 'Build REST API', []);
    const dependent = createTask('323-027', 'Frontend UI', ['323-007']);
    const tasks = [target, dependent];
    persist(tasks);

    await runSpawn(makeSprint(tasks));

    expect(dependent.dependencies).toEqual(['323-007']);
  });

  it('drops an unresolvable dependency (no matching sibling) without throwing', async () => {
    const only = createTask('323-007', 'Build REST API', ['No Such Task']);
    const tasks = [only];
    persist(tasks);

    await runSpawn(makeSprint(tasks));

    expect(only.dependencies).toEqual([]);
  });
});
