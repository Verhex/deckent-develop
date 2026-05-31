/**
 * Sprint 202 Task 202-004 — Token throttle live-wire tests.
 *
 * Verifies that `spawnWorkers` honors `config.token_throttle_ms` by inserting
 * an inter-worker sleep between back-to-back `backend.spawn(...)` calls. The
 * first spawn happens immediately; each subsequent spawn waits at least
 * `token_throttle_ms` ms.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnWorkers } from '../../src/orchestra/sprint-spawner.js';
import { TaskStatus } from '../../src/core/types.js';
import type {
  Sprint, Task, ResolvedConfig, ModelType,
} from '../../src/core/types.js';
import type {
  SpawnBackend, SpawnBackendOptions,
} from '../../src/orchestra/spawn-backend.js';

interface SpawnCall {
  taskId: string;
  timestamp: number;
  model: ModelType;
  prompt: string;
  opts?: SpawnBackendOptions;
}

function makeTimedBackend(): SpawnBackend & { calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  return {
    name: 'mock-timed',
    spawn(taskId, model, prompt, opts) {
      calls.push({ taskId, timestamp: Date.now(), model, prompt, opts });
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

function createTask(id: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Throttle test task ${id}`,
    model: 'sonnet' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'token-throttle-test',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: [`src/throttle-${id}.ts`],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'no test',
      noGoCriteria: 'no test',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-202',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
  } as unknown as Task;
}

function makeConfig(throttleMs: number): ResolvedConfig {
  return {
    dependency_pipeline_enabled: false,
    activeModeConfig: { max_workers: 8 },
    token_throttle_ms: throttleMs,
  } as unknown as ResolvedConfig;
}

function makeSprint(id: string, tasks: Task[]): Sprint {
  return {
    id,
    number: 202,
    phase: 'SPAWN' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'],
    tasks,
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

describe('sprint-spawner — token_throttle_ms wire (Sprint 202 Task 202-004)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'token-throttle-'));
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
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

  it('spawns immediately when token_throttle_ms is 0 (no inter-worker delay)', async () => {
    const tasks = [createTask('THR-A'), createTask('THR-B'), createTask('THR-C')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-202', tasks);
    const backend = makeTimedBackend();
    const config = makeConfig(0);

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, config, { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    expect(backend.calls).toHaveLength(3);
    // With no throttle, all three spawns should happen well under 50ms total.
    const totalSpan = backend.calls[2]!.timestamp - backend.calls[0]!.timestamp;
    expect(totalSpan).toBeLessThan(50);
  });

  it('inserts at least token_throttle_ms between consecutive spawn calls', async () => {
    const THROTTLE = 60;
    const tasks = [createTask('THR-D'), createTask('THR-E'), createTask('THR-F')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-202', tasks);
    const backend = makeTimedBackend();
    const config = makeConfig(THROTTLE);

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, config, { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    expect(backend.calls).toHaveLength(3);
    // Each subsequent spawn must wait >= THROTTLE ms after the previous one.
    // Allow a small timer-resolution tolerance (~10 ms below the floor).
    const SCHEDULER_SLACK = 10;
    const gap1 = backend.calls[1]!.timestamp - backend.calls[0]!.timestamp;
    const gap2 = backend.calls[2]!.timestamp - backend.calls[1]!.timestamp;
    expect(gap1).toBeGreaterThanOrEqual(THROTTLE - SCHEDULER_SLACK);
    expect(gap2).toBeGreaterThanOrEqual(THROTTLE - SCHEDULER_SLACK);
  });

  it('does not delay the first spawn (only inter-worker pacing)', async () => {
    const THROTTLE = 200;
    const tasks = [createTask('THR-G')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-202', tasks);
    const backend = makeTimedBackend();
    const config = makeConfig(THROTTLE);

    const t0 = Date.now();
    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, config, { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }
    const elapsed = Date.now() - t0;

    expect(backend.calls).toHaveLength(1);
    // A single-task wave must NOT wait the throttle floor.
    expect(elapsed).toBeLessThan(THROTTLE);
  });
});
