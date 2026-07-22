/**
 * Sprint 280 root-cause fix — adaptive per-task timeout is WIRED into spawn.
 *
 * Regression guard for the dormant-code failure mode that killed worker 280-007:
 * `emitTimeoutEvents` (the only caller of `brainEstimateTimeout`) had ZERO
 * callers, so the adaptive estimate was computed nowhere and every worker fell
 * back to the static `docker_timeout` (default 1200s = 20min) at
 * `spawn-backend-docker.ts: effectiveTimeout = opts?.taskTimeoutSeconds ?? this.timeoutSeconds`.
 *
 * These tests assert that `spawnWorkers` now passes a `taskTimeoutSeconds` equal
 * to `brainEstimateTimeout(...)` into the spawn backend opts (so docker_timeout
 * is the FALLBACK, not the de-facto cap) AND that the value scales by effort.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnWorkers } from '../../src/orchestra/sprint-spawner.js';
import { emitTimeoutEvents } from '../../src/orchestra/task-router.js';
import { brainEstimateTimeout, type SprintHistory } from '../../src/orchestra/timeout-estimator.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';

interface SpawnCall { taskId: string; opts?: SpawnBackendOptions; }

function makeRecordingBackend(): SpawnBackend & { calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  return {
    name: 'mock-timeout',
    liveUsageBudgetSupport: 'measured-stream' as const,
    spawn(taskId, _model, _prompt, opts) { calls.push({ taskId, opts }); },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

function createTask(id: string, effort: 'low' | 'normal' | 'high'): Task {
  return {
    id, title: `Task ${id}`, description: `timeout-wiring ${id}`,
    model: 'claude-sonnet-5' as ModelType, effort, priority: 'NORMAL', reason: 'tw-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/tw-${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'x', noGoCriteria: 'x', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING, sprintId: 'sprint-280',
    assignedAgent: 'generic', assignedSkills: [], provider: 'claude',
    budget: { maxTurns: 1 },
  } as unknown as Task;
}

/** Config with a real `timeout` block + sane docker bounds so the adaptive
 *  estimate is computable AND differentiable by effort (not pinned to a flat cap). */
function makeConfig(): ResolvedConfig {
  return {
    spawn_backend: 'docker',
    dependency_pipeline_enabled: false,
    activeModeConfig: { max_workers: 8 },
    token_throttle_ms: 0,
    docker_timeout: 1200, // the OLD static fallback we must NOT silently use
    timeout: {
      docker_min_timeout: 300, docker_max_timeout: 86400,
      tmux_min_timeout: 300, tmux_max_timeout: 86400,
      subprocess_min_timeout: 300, subprocess_max_timeout: 86400,
      effort_base: { low: 600, normal: 1200, high: 2400 },
      loc_scaling_enabled: true, history_scaling_enabled: true,
      runtime_extension_enabled: false, adaptive_multiplier: 1.0, runtime_extension_max: 0,
    },
  } as unknown as ResolvedConfig;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-280', number: 280, phase: 'SPAWN' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'], tasks, startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

const NO_HISTORY: SprintHistory = { avgTaskDurationMs: 0, sprintCount: 0 };

describe('spawn timeout wiring — adaptive estimate reaches the backend (Sprint 280 root-cause)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spawn-timeout-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });
  afterEach(() => { if (existsSync(root)) rmSync(root, { recursive: true, force: true }); });

  function persist(tasks: Task[]): void {
    for (const t of tasks) {
      writeFileSync(join(root, '.tasks', `task-${t.id}.json`), JSON.stringify(t, null, 2), 'utf-8');
    }
  }

  async function run(sprint: Sprint, config: ResolvedConfig, backend: SpawnBackend): Promise<void> {
    const orig = process.cwd();
    process.chdir(root);
    try { await spawnWorkers(root, sprint, config, { spawnBackend: backend }); }
    finally { process.chdir(orig); }
  }

  it('emitTimeoutEvents RETURNS the adaptive timeout (no longer a void 0-caller)', () => {
    const config = makeConfig();
    const task = createTask('R-001', 'high');
    const ret = emitTimeoutEvents(task, config, NO_HISTORY, root, 'sprint-280');
    expect(ret).toBeTypeOf('number');
    expect(ret).toBe(brainEstimateTimeout(task, config, NO_HISTORY).timeoutSeconds);
    expect(ret).toBeGreaterThan(0);
  });

  it('spawnWorkers passes taskTimeoutSeconds = brainEstimateTimeout (NOT undefined, NOT docker_timeout)', async () => {
    const config = makeConfig();
    const task = createTask('W-001', 'high');
    persist([task]);
    const backend = makeRecordingBackend();

    await run(makeSprint([task]), config, backend);

    expect(backend.calls).toHaveLength(1);
    const passed = backend.calls[0]!.opts?.taskTimeoutSeconds;
    const expected = brainEstimateTimeout(task, config, NO_HISTORY).timeoutSeconds;
    expect(passed).toBe(expected);
    // The wiring's whole point: the spawn no longer relies on the static fallback.
    expect(passed).not.toBeUndefined();
  });

  it('taskTimeoutSeconds scales by effort (high > low) — adaptive, not a flat cap', async () => {
    const config = makeConfig();
    const high = createTask('E-HIGH', 'high');
    const low = createTask('E-LOW', 'low');
    persist([high, low]);
    const backend = makeRecordingBackend();

    await run(makeSprint([high, low]), config, backend);

    const byId = new Map(backend.calls.map(c => [c.taskId, c.opts?.taskTimeoutSeconds]));
    expect(byId.get('E-HIGH')!).toBeGreaterThan(byId.get('E-LOW')!);
  });

  it('every dispatched worker receives a positive taskTimeoutSeconds (no dormant gap)', async () => {
    const config = makeConfig();
    const tasks = [createTask('M-1', 'normal'), createTask('M-2', 'high'), createTask('M-3', 'low')];
    persist(tasks);
    const backend = makeRecordingBackend();

    await run(makeSprint(tasks), config, backend);

    expect(backend.calls).toHaveLength(3);
    for (const call of backend.calls) {
      expect(call.opts?.taskTimeoutSeconds).toBeTypeOf('number');
      expect(call.opts!.taskTimeoutSeconds!).toBeGreaterThan(0);
    }
  });
});
