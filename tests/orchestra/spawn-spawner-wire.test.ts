/**
 * Sprint 168 W2.5 — Spawn-Spawner C0c wire integration test.
 *
 * C0c shipped two pure helpers (sprint-controller.ts):
 *   - readTaskJsonFresh(projectRoot, taskId): Task    — always disk-read
 *   - consultCollisionDecision(root, sprintId, payload): SpawnDecision
 *
 * BUT the spawn pipeline (sprint-spawner.ts:189 spawnWorkers) did not consult
 * them — only emitted SCOPE_COLLISION_DETECTED and continued spawning. This
 * test asserts the live wire:
 *
 *   1. When two PENDING tasks scope-collide on the same filesWrite,
 *      spawnWorkers consults the decision (action='block') and emits
 *      BRAIN→SPAWN:BLOCKED with the offending taskIds + files.
 *   2. The blocked tasks DO NOT emit TASK_ASSIGN.
 *   3. The blocked tasks DO NOT invoke backend.spawn(...).
 *   4. Non-colliding tasks proceed normally (TASK_ASSIGN emitted, spawn called).
 *
 * The integration is contract-only: `consultCollisionDecision` is the C0c
 * RC2 wire layer and writes the BLOCKED event itself; sprint-spawner just
 * checks the returned `action === 'block'` and short-circuits.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnWorkers } from '../../src/orchestra/sprint-spawner.js';
import { readEvents, CHANNELS } from '../../src/orchestra/event-stream.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';

// ─── Mock SpawnBackend ────────────────────────────────────────────

interface SpawnCall {
  taskId: string;
  model: ModelType;
  prompt: string;
  opts?: SpawnBackendOptions;
}

function makeMockBackend(): SpawnBackend & { calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  return {
    name: 'mock',
    spawn(taskId, model, prompt, opts) {
      calls.push({ taskId, model, prompt, opts });
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

// ─── Task Factory ─────────────────────────────────────────────────

function createTask(id: string, filesWrite: string[]): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Wire test task ${id}`,
    model: 'sonnet' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'wire-integration-test',
    scope: {
      directories: [],
      filesRead: [],
      filesWrite,
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'no test',
      noGoCriteria: 'no test',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-168',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
  } as unknown as Task;
}

function makeConfig(): ResolvedConfig {
  return {
    dependency_pipeline_enabled: false,
    activeModeConfig: {
      max_workers: 4,
    },
  } as unknown as ResolvedConfig;
}

function makeSprint(id: string, tasks: Task[]): Sprint {
  return {
    id,
    number: 168,
    phase: 'SPAWN' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'],
    tasks,
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

// ─── Tests ────────────────────────────────────────────────────────

describe('spawnWorkers — C0c wire (Sprint 168 W2.5)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'w25-spawn-wire-'));
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    // sprint-state.json absent — getCurrentSprintId returns null and code
    // falls back to sprint.id ('sprint-168') passed in the Sprint fixture.
  });

  afterEach(() => {
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  function persistTasks(tasks: Task[]): void {
    for (const t of tasks) {
      writeFileSync(
        join(testRoot, '.tasks', `task-${t.id}.json`),
        JSON.stringify(t, null, 2),
        'utf-8',
      );
    }
  }

  it('emits BRAIN→SPAWN:BLOCKED when two tasks collide on filesWrite', async () => {
    const t1 = createTask('168-W25-A', ['src/shared.ts']);
    const t2 = createTask('168-W25-B', ['src/shared.ts']);
    persistTasks([t1, t2]);
    const sprint = makeSprint('sprint-168', [t1, t2]);
    const backend = makeMockBackend();

    // Cast away the chdir requirement — spawnWorkers reads projectRoot directly
    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const events = readEvents(testRoot, 'sprint-168');
    const blockedEvents = events.filter(e => e.channel === CHANNELS.SPAWN_BLOCKED);

    expect(blockedEvents.length).toBeGreaterThanOrEqual(1);
    const blocked = blockedEvents[0]!;
    expect(blocked.source).toBe('brain');
    const payload = blocked.payload as { taskIds: string[]; files: string[]; reason: string };
    expect(payload.taskIds).toEqual(expect.arrayContaining(['168-W25-A', '168-W25-B']));
    expect(payload.files).toContain('src/shared.ts');
    expect(payload.reason).toContain('src/shared.ts');
  });

  it('does NOT emit TASK_ASSIGN for blocked colliding tasks', async () => {
    const t1 = createTask('168-W25-C', ['src/clash.ts']);
    const t2 = createTask('168-W25-D', ['src/clash.ts']);
    persistTasks([t1, t2]);
    const sprint = makeSprint('sprint-168', [t1, t2]);
    const backend = makeMockBackend();

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const events = readEvents(testRoot, 'sprint-168');
    const assignEvents = events.filter(e => e.channel === CHANNELS.TASK_ASSIGN);
    const assignedTaskIds = assignEvents.map(e => (e.payload as { taskId: string }).taskId);

    expect(assignedTaskIds).not.toContain('168-W25-C');
    expect(assignedTaskIds).not.toContain('168-W25-D');
    // And no spawn() invoked for the blocked tasks
    expect(backend.calls.map(c => c.taskId)).not.toContain('168-W25-C');
    expect(backend.calls.map(c => c.taskId)).not.toContain('168-W25-D');
  });

  it('TASK_ASSIGN payload uses readTaskJsonFresh disk read (not stale in-memory)', async () => {
    const t1 = createTask('168-W25-E', ['src/solo.ts']);
    persistTasks([t1]);
    const sprint = makeSprint('sprint-168', [t1]);
    const backend = makeMockBackend();

    // PLAN-time in-memory task lists 'src/solo.ts' but disk has been patched
    // between PLAN and SPAWN (operator manual recovery). The disk state must win.
    const patched = { ...t1, scope: { ...t1.scope!, filesWrite: ['src/patched.ts'] } };
    writeFileSync(
      join(testRoot, '.tasks', `task-${t1.id}.json`),
      JSON.stringify(patched, null, 2),
      'utf-8',
    );

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const events = readEvents(testRoot, 'sprint-168');
    const assignEvents = events.filter(e => e.channel === CHANNELS.TASK_ASSIGN);
    expect(assignEvents.length).toBe(1);
    const payload = assignEvents[0]!.payload as { scope: { filesWrite: string[] } };
    // The TASK_ASSIGN must reflect the disk-patched scope, not the stale in-memory one
    expect(payload.scope.filesWrite).toContain('src/patched.ts');
    expect(payload.scope.filesWrite).not.toContain('src/solo.ts');
  });

  it('non-colliding tasks proceed normally after a collision blocks others', async () => {
    const colliderA = createTask('168-W25-F', ['src/collide.ts']);
    const colliderB = createTask('168-W25-G', ['src/collide.ts']);
    const solo = createTask('168-W25-H', ['src/independent.ts']);
    persistTasks([colliderA, colliderB, solo]);
    const sprint = makeSprint('sprint-168', [colliderA, colliderB, solo]);
    const backend = makeMockBackend();

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const events = readEvents(testRoot, 'sprint-168');
    const assignEvents = events.filter(e => e.channel === CHANNELS.TASK_ASSIGN);
    const assignedIds = assignEvents.map(e => (e.payload as { taskId: string }).taskId);

    expect(assignedIds).toContain('168-W25-H');             // solo proceeds
    expect(assignedIds).not.toContain('168-W25-F');         // collider blocked
    expect(assignedIds).not.toContain('168-W25-G');         // collider blocked

    const spawnedIds = backend.calls.map(c => c.taskId);
    expect(spawnedIds).toContain('168-W25-H');
    expect(spawnedIds).not.toContain('168-W25-F');
    expect(spawnedIds).not.toContain('168-W25-G');
  });
});
