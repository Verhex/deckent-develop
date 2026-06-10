/**
 * Sprint 274 Task 274-002 — Cache-warm spawn strategy (F1-TOK Faz 2).
 *
 * Verifies that `spawnWorkers` honors the opt-in `config.cache_warm` block:
 * when `cache_warm.enabled === true` AND it is the sprint's first spawn wave
 * (`firstWave: true`), the FIRST dispatched worker (the "warmer", which WRITES
 * the shared prompt-prefix to the provider cache) spawns immediately and the
 * rest of the wave is delayed ONCE by `warm_delay_ms` (so the fleet READS the
 * now-warm cache). Subsequent dispatches / FIX-phase respawns (`firstWave`
 * omitted) stay NORMAL — byte-identical existing behavior.
 *
 * All timing is exercised through an injected `sleepFn` stub (no real waiting):
 * the stub records the delay and the relative ordering of spawn vs sleep into a
 * shared timeline, so the suite runs instantly even with the 45s default delay.
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
  model: ModelType;
  prompt: string;
  opts?: SpawnBackendOptions;
}

/**
 * A spawn backend that records every spawn into `calls` AND appends a
 * `spawn:<taskId>` marker to the shared timeline so ordering vs the injected
 * sleep can be asserted.
 */
function makeTimedBackend(timeline: string[]): SpawnBackend & { calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  return {
    name: 'mock-timed',
    spawn(taskId, model, prompt, opts) {
      calls.push({ taskId, model, prompt, opts });
      timeline.push(`spawn:${taskId}`);
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

/**
 * Injectable cache-warm sleep stub. Records each requested delay into
 * `sleepCalls` and appends a `sleep:<ms>` marker to the timeline. Never waits.
 * When `throwOnCall` is set it records the attempt then throws — to exercise
 * the fail-safe path (a timer fault must NOT block the wave).
 */
function makeSleepFn(
  timeline: string[],
  sleepCalls: number[],
  throwOnCall = false,
): (ms: number) => Promise<void> {
  return async (ms: number) => {
    sleepCalls.push(ms);
    if (throwOnCall) throw new Error('injected timer fault');
    timeline.push(`sleep:${ms}`);
  };
}

function createTask(id: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Cache-warm test task ${id}`,
    model: 'sonnet' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'cache-warm-test',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: [`src/cw-${id}.ts`],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'no test',
      noGoCriteria: 'no test',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-274',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
  } as unknown as Task;
}

function makeConfig(cacheWarm?: { enabled: boolean; warm_delay_ms?: number }): ResolvedConfig {
  return {
    dependency_pipeline_enabled: false,
    activeModeConfig: { max_workers: 8 },
    // Isolate the cache-warm delay from the Sprint-202 token throttle.
    token_throttle_ms: 0,
    cache_warm: cacheWarm,
  } as unknown as ResolvedConfig;
}

function makeSprint(id: string, tasks: Task[]): Sprint {
  return {
    id,
    number: 274,
    phase: 'SPAWN' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'],
    tasks,
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

describe('sprint-spawner — cache_warm spawn (Sprint 274 Task 274-002)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'cache-warm-'));
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

  async function run(
    sprint: Sprint,
    config: ResolvedConfig,
    backend: SpawnBackend,
    opts: { firstWave?: boolean; sleepFn?: (ms: number) => Promise<void> },
  ): Promise<void> {
    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, config, { spawnBackend: backend, ...opts });
    } finally {
      process.chdir(origCwd);
    }
  }

  it('enabled + firstWave: warmer spawns immediately, rest of the wave delayed ONCE', async () => {
    const timeline: string[] = [];
    const sleepCalls: number[] = [];
    const tasks = [createTask('E1-A'), createTask('E1-B'), createTask('E1-C')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-274', tasks);
    const backend = makeTimedBackend(timeline);
    const config = makeConfig({ enabled: true, warm_delay_ms: 45000 });

    await run(sprint, config, backend, {
      firstWave: true,
      sleepFn: makeSleepFn(timeline, sleepCalls),
    });

    expect(backend.calls).toHaveLength(3);
    // Exactly one warm delay, equal to the configured warm_delay_ms.
    expect(sleepCalls).toEqual([45000]);
    // Warmer (first task) dispatched BEFORE the single delay; the rest AFTER.
    expect(timeline).toEqual(['spawn:E1-A', 'sleep:45000', 'spawn:E1-B', 'spawn:E1-C']);
  });

  it('disabled (cache_warm absent): no warm delay, all spawn immediately (regression)', async () => {
    const timeline: string[] = [];
    const sleepCalls: number[] = [];
    const tasks = [createTask('D1-A'), createTask('D1-B'), createTask('D1-C')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-274', tasks);
    const backend = makeTimedBackend(timeline);
    const config = makeConfig(undefined);

    await run(sprint, config, backend, {
      firstWave: true,
      sleepFn: makeSleepFn(timeline, sleepCalls),
    });

    expect(backend.calls).toHaveLength(3);
    expect(sleepCalls).toEqual([]);
    expect(timeline).toEqual(['spawn:D1-A', 'spawn:D1-B', 'spawn:D1-C']);
  });

  it('disabled (enabled:false): no warm delay even with firstWave', async () => {
    const timeline: string[] = [];
    const sleepCalls: number[] = [];
    const tasks = [createTask('D2-A'), createTask('D2-B')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-274', tasks);
    const backend = makeTimedBackend(timeline);
    const config = makeConfig({ enabled: false, warm_delay_ms: 45000 });

    await run(sprint, config, backend, {
      firstWave: true,
      sleepFn: makeSleepFn(timeline, sleepCalls),
    });

    expect(backend.calls).toHaveLength(2);
    expect(sleepCalls).toEqual([]);
    expect(timeline).toEqual(['spawn:D2-A', 'spawn:D2-B']);
  });

  it('firstWave omitted (FIX-phase respawn) + enabled: no warm delay (gate is firstWave)', async () => {
    const timeline: string[] = [];
    const sleepCalls: number[] = [];
    const tasks = [createTask('F1-A'), createTask('F1-B'), createTask('F1-C')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-274', tasks);
    const backend = makeTimedBackend(timeline);
    const config = makeConfig({ enabled: true, warm_delay_ms: 45000 });

    // No firstWave → mirrors the FIX-phase spawnWorkers call site.
    await run(sprint, config, backend, {
      sleepFn: makeSleepFn(timeline, sleepCalls),
    });

    expect(backend.calls).toHaveLength(3);
    expect(sleepCalls).toEqual([]);
    expect(timeline).toEqual(['spawn:F1-A', 'spawn:F1-B', 'spawn:F1-C']);
  });

  it('timer-throw → fail-safe: the wave still spawns every worker', async () => {
    const timeline: string[] = [];
    const sleepCalls: number[] = [];
    const tasks = [createTask('T1-A'), createTask('T1-B'), createTask('T1-C')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-274', tasks);
    const backend = makeTimedBackend(timeline);
    const config = makeConfig({ enabled: true, warm_delay_ms: 45000 });

    await run(sprint, config, backend, {
      firstWave: true,
      sleepFn: makeSleepFn(timeline, sleepCalls, /* throwOnCall */ true),
    });

    // Delay was attempted once, then threw — but every worker still spawned.
    expect(sleepCalls).toEqual([45000]);
    expect(backend.calls).toHaveLength(3);
    expect(backend.calls.map(c => c.taskId)).toEqual(['T1-A', 'T1-B', 'T1-C']);
  });

  it('single-task sprint + enabled + firstWave: NO delay (never reaches a 2nd spawn)', async () => {
    const timeline: string[] = [];
    const sleepCalls: number[] = [];
    const tasks = [createTask('S1-A')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-274', tasks);
    const backend = makeTimedBackend(timeline);
    const config = makeConfig({ enabled: true, warm_delay_ms: 45000 });

    await run(sprint, config, backend, {
      firstWave: true,
      sleepFn: makeSleepFn(timeline, sleepCalls),
    });

    expect(backend.calls).toHaveLength(1);
    expect(sleepCalls).toEqual([]);
    expect(timeline).toEqual(['spawn:S1-A']);
  });

  it('custom warm_delay_ms is honored (not the default)', async () => {
    const timeline: string[] = [];
    const sleepCalls: number[] = [];
    const tasks = [createTask('C1-A'), createTask('C1-B')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-274', tasks);
    const backend = makeTimedBackend(timeline);
    const config = makeConfig({ enabled: true, warm_delay_ms: 9000 });

    await run(sprint, config, backend, {
      firstWave: true,
      sleepFn: makeSleepFn(timeline, sleepCalls),
    });

    expect(backend.calls).toHaveLength(2);
    expect(sleepCalls).toEqual([9000]);
    expect(timeline).toEqual(['spawn:C1-A', 'sleep:9000', 'spawn:C1-B']);
  });

  it('default warm_delay_ms (45000) applied when warm_delay_ms omitted', async () => {
    const timeline: string[] = [];
    const sleepCalls: number[] = [];
    const tasks = [createTask('DF-A'), createTask('DF-B')];
    persistTasks(tasks);
    const sprint = makeSprint('sprint-274', tasks);
    const backend = makeTimedBackend(timeline);
    const config = makeConfig({ enabled: true });

    await run(sprint, config, backend, {
      firstWave: true,
      sleepFn: makeSleepFn(timeline, sleepCalls),
    });

    expect(backend.calls).toHaveLength(2);
    expect(sleepCalls).toEqual([45000]);
  });
});
