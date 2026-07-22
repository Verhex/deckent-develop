/**
 * Sprint 202 Task 202-004 — Token throttle live-wire tests.
 *
 * Verifies that `spawnWorkers` honors `config.token_throttle_ms` by inserting
 * an inter-worker sleep between back-to-back `backend.spawn(...)` calls. The
 * first spawn happens immediately; each subsequent spawn waits at least
 * `token_throttle_ms` ms.
 */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
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
    liveUsageBudgetSupport: 'measured-stream' as const,
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
    model: 'claude-sonnet-5' as ModelType,
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
    budget: { maxTurns: 1 },
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
    vi.useFakeTimers();
    try {
      const spawnPromise = spawnWorkers(testRoot, sprint, config, { spawnBackend: backend });
      await vi.runAllTimersAsync();
      await spawnPromise;
    } finally {
      vi.useRealTimers();
      process.chdir(origCwd);
    }

    expect(backend.calls).toHaveLength(3);
    // born-632: with token_throttle_ms=0 the throttle branch never calls
    // sleep(), so no fake timer ever fires and the mocked clock cannot
    // advance between spawn calls — the span is deterministically 0, proving
    // by construction that no throttle delay was injected (previously a
    // "<50ms" wall-clock guess that measured 522ms under CI fork pressure).
    const totalSpan = backend.calls[2]!.timestamp - backend.calls[0]!.timestamp;
    expect(totalSpan).toBe(0);
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
    vi.useFakeTimers();
    try {
      const spawnPromise = spawnWorkers(testRoot, sprint, config, { spawnBackend: backend });
      await vi.runAllTimersAsync();
      await spawnPromise;
    } finally {
      vi.useRealTimers();
      process.chdir(origCwd);
    }

    expect(backend.calls).toHaveLength(3);
    // born-632: under fake timers, Date.now() advances in exact lockstep with
    // the setTimeout delay sleep() was invoked with — the gap is now an exact,
    // deterministic reflection of the throttle floor argument rather than a
    // real-scheduler measurement, so no slack constant is needed anymore
    // (previously required a real-clock tolerance band below the floor).
    const gap1 = backend.calls[1]!.timestamp - backend.calls[0]!.timestamp;
    const gap2 = backend.calls[2]!.timestamp - backend.calls[1]!.timestamp;
    expect(gap1).toBe(THROTTLE);
    expect(gap2).toBe(THROTTLE);
  });

  it('does not delay the first spawn (only inter-worker pacing)', async () => {
    const THROTTLE = 200;
    const tasks = [createTask('THR-G')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-202', tasks);
    const backend = makeTimedBackend();
    const config = makeConfig(THROTTLE);

    const origCwd = process.cwd();
    process.chdir(testRoot);
    vi.useFakeTimers();
    let elapsed: number;
    try {
      const t0 = Date.now();
      const spawnPromise = spawnWorkers(testRoot, sprint, config, { spawnBackend: backend });
      await vi.runAllTimersAsync();
      await spawnPromise;
      elapsed = Date.now() - t0;
    } finally {
      vi.useRealTimers();
      process.chdir(origCwd);
    }

    expect(backend.calls).toHaveLength(1);
    // born-632: a single-task wave never enters the throttle branch
    // (spawnedThisWave stays 0), so no timer fires and the fake clock cannot
    // advance — elapsed is deterministically 0, proving no floor delay was
    // injected before the first (and only) spawn.
    expect(elapsed).toBe(0);
  });
});
