/**
 * 413-004 SCHED3 — canonical spawn executor tests.
 *
 * docs/analysis/scheduler-unify-design-2026-07-11.md (Sprint-3 slice): before
 * this task, two divergent spawn executors existed — the heavyweight
 * dependency-respawn path (sprint-spawner.ts respawnEligibleTasks) applied
 * fix-task routing-lineage inheritance and persisted task-<id>.json; the
 * local queue-driven path (result-collector.ts spawnIfNotAssigned, shared by
 * processQueue / forceRescanIfIdle / dispatchReadyTasks) did neither. A
 * task's routing fate depended on which trigger happened to spawn it.
 *
 * This suite pins:
 *   1. `executeSpawnTask` (scheduler-effects.ts) applies fix-routing-lineage
 *      inheritance BEFORE prompt/provider/backend/effort resolution, and
 *      preserves an explicit fix-task override instead of clobbering it.
 *   2. `executeSpawnTask` returns an honest `routing-lineage-missing`
 *      disposition (spawn blocked, no persistence) instead of the prior
 *      fail-soft no-op when the original task cannot be read.
 *   3. `executeSpawnTask` persists task-<id>.json exactly once, on every
 *      caller.
 *   4. Resolution parity: the SAME fix-task fixture resolves to the SAME
 *      forceModel/provider/backend/modelEffort regardless of whether it is
 *      invoked with "local path"-shaped deps (processQueue / forceRescanIfIdle
 *      / dispatchReadyTasks — all three share ONE spawnIfNotAssigned closure,
 *      so one representative deps shape covers all three trigger call sites)
 *      or "heavyweight respawn"-shaped deps (respawnEligibleTasks).
 *   5. Two CONSCIOUS behavior changes, each independently pinned via a live
 *      `waitForResults` integration test that exercises the real wiring (not
 *      just the executor in isolation):
 *        (a) the local/queue path now applies fix-task routing inheritance
 *            (queue-completion trigger, i.e. processQueue).
 *        (b) the local/queue path now persists task-<id>.json after spawn
 *            (dep-ready trigger, i.e. dispatchReadyTasks).
 *      The third live trigger (forceRescanIfIdle / idle-rescan) shares the
 *      identical `spawnIfNotAssigned` closure reference as the two triggers
 *      above (see result-collector.ts — processQueue/forceRescanIfIdle/
 *      dispatchReadyTasks/drainNervousRespawns all call `spawnIfNotAssigned`)
 *      and is gated by a real 5-minute idle clock with no injectable override,
 *      so its parity is established structurally (same function reference,
 *      same deps-construction code) rather than independently live-tested.
 */
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

vi.mock('../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn(() => 'mock-prompt'),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  })),
}));

import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, ResolvedConfig, Sprint } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import { executeSpawnTask, type SpawnTaskDeps } from '../../src/orchestra/scheduler-effects.js';
import { spawnWorker } from '../../src/orchestra/tmux.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${randomBytes(4).toString('hex')}`);
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  writeFileSync(
    join(dir, '.deckent', 'cost-config.json'),
    readFileSync(join(process.cwd(), 'src', 'core', 'pricing-data-baseline.json'), 'utf-8'),
    'utf-8',
  );
  return dir;
}

function makeTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `desc ${id}`,
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'no' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-sched3',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
    budget: { maxTurns: 1 },
    ...overrides,
  } as Task;
}

interface MockSpawnCall {
  taskId: string;
  model: string;
  prompt: string;
  opts?: SpawnBackendOptions;
}

function makeMockBackend(): SpawnBackend & { calls: MockSpawnCall[] } {
  const calls: MockSpawnCall[] = [];
  return {
    name: 'mock-backend',
    liveUsageBudgetSupport: 'measured-stream',
    spawn(taskId, model, prompt, opts) {
      calls.push({ taskId, model: model as unknown as string, prompt, opts });
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

function baseDeps(projectRoot: string, overrides?: Partial<SpawnTaskDeps>): SpawnTaskDeps {
  return {
    projectRoot,
    sprintFallbackId: 'sprint-sched3',
    config: undefined,
    resolveAgentPrompt: async () => undefined,
    resolveSkillPrompts: async () => [],
    buildWriteTargets: () => ['.tasks/'],
    ...overrides,
  };
}

function writeOriginalTask(root: string, task: Task): void {
  writeFileSync(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task, null, 2), 'utf-8');
}

// ─── executeSpawnTask — fix-routing lineage inheritance ──────────────────────

describe('executeSpawnTask — fix-task routing-lineage inheritance', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-inherit'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('inherits forceModel/provider/modelEffort from the original when the fix-task left them unset (behavior a)', async () => {
    const original = makeTask('700-001', { forceModel: 'claude-opus-4-8', provider: 'claude', modelEffort: 'high' });
    writeOriginalTask(root, original);

    const fixTask = makeTask('700-001-fix', { isPriorityFix: true, fixForTaskId: '700-001' });
    const backend = makeMockBackend();

    const disposition = await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend }));

    expect(disposition.kind).toBe('spawned');
    expect(fixTask.forceModel).toBe('claude-opus-4-8');
    expect(fixTask.provider).toBe('claude');
    expect(fixTask.modelEffort).toBe('high');
    // reasoning-effort resolution runs AFTER inheritance, so the inherited
    // modelEffort ('high') must be what's actually sent to the backend.
    expect(backend.calls).toHaveLength(1);
    expect(backend.calls[0]!.opts?.reasoningEffort).toBe('high');
  });

  it('preserves an explicit fix-task override instead of clobbering it with the original value', async () => {
    const original = makeTask('700-002', { modelEffort: 'high', provider: 'claude' });
    writeOriginalTask(root, original);

    const fixTask = makeTask('700-002-fix', {
      isPriorityFix: true,
      fixForTaskId: '700-002',
      modelEffort: 'low', // conscious override — must survive untouched
      provider: 'claude',
    });
    const backend = makeMockBackend();

    await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend }));

    expect(fixTask.modelEffort).toBe('low');
    expect(backend.calls[0]!.opts?.reasoningEffort).toBe('low');
  });

  it('inherits the backend field; when the inherited value matches config.spawn_backend the injected backend is reused (no real backend-factory spawn)', async () => {
    const original = makeTask('700-003', { backend: 'docker' });
    writeOriginalTask(root, original);

    const fixTask = makeTask('700-003-fix', { isPriorityFix: true, fixForTaskId: '700-003' });
    const backend = makeMockBackend();
    const config = { spawn_backend: 'docker' } as unknown as ResolvedConfig;

    const disposition = await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend, config }));

    expect(disposition.kind).toBe('spawned');
    expect(fixTask.backend).toBe('docker');
    expect(backend.calls).toHaveLength(1);
  });

  it('persists task-<id>.json with status EXECUTING and the inherited fields after a successful spawn (behavior b)', async () => {
    const original = makeTask('700-004', { modelEffort: 'high' });
    writeOriginalTask(root, original);

    const fixTask = makeTask('700-004-fix', { isPriorityFix: true, fixForTaskId: '700-004' });
    const backend = makeMockBackend();

    await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend }));

    const persistedPath = join(root, '.tasks', 'task-700-004-fix.json');
    expect(existsSync(persistedPath)).toBe(true);
    const persisted = JSON.parse(readFileSync(persistedPath, 'utf-8'));
    expect(persisted.status).toBe(TaskStatus.EXECUTING);
    expect(persisted.modelEffort).toBe('high');
  });

  it('returns routing-lineage-missing and blocks the spawn when the original task file cannot be read', async () => {
    const fixTask = makeTask('700-005-fix', { isPriorityFix: true, fixForTaskId: 'does-not-exist' });
    const backend = makeMockBackend();

    const disposition = await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend }));

    expect(disposition.kind).toBe('routing-lineage-missing');
    if (disposition.kind === 'routing-lineage-missing') {
      expect(disposition.fixForTaskId).toBe('does-not-exist');
    }
    expect(backend.calls).toHaveLength(0);
    expect(existsSync(join(root, '.tasks', 'task-700-005-fix.json'))).toBe(false);
  });

  it('returns routing-lineage-missing when the original task file is corrupt JSON', async () => {
    writeFileSync(join(root, '.tasks', 'task-700-006.json'), '{ not valid json', 'utf-8');
    const fixTask = makeTask('700-006-fix', { isPriorityFix: true, fixForTaskId: '700-006' });
    const backend = makeMockBackend();

    const disposition = await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend }));

    expect(disposition.kind).toBe('routing-lineage-missing');
    expect(backend.calls).toHaveLength(0);
  });

  it('is a no-op for a non-fix task (no lineage lookup, spawns normally)', async () => {
    const task = makeTask('700-007');
    const backend = makeMockBackend();

    const disposition = await executeSpawnTask({ task }, baseDeps(root, { backend }));

    expect(disposition.kind).toBe('spawned');
    expect(backend.calls).toHaveLength(1);
  });
});

// ─── executeSpawnTask — resolution parity across trigger-shaped deps ────────

describe('executeSpawnTask — resolution parity across caller-shaped deps (three-trigger parity)', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-parity'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('resolves identical forceModel/provider/modelEffort for the same fix-task fixture whether invoked with local-path-shaped or heavyweight-respawn-shaped deps', async () => {
    const original = makeTask('701-001', { forceModel: 'claude-opus-4-8', provider: 'claude', modelEffort: 'high' });
    writeOriginalTask(root, original);

    // "local" deps — represents processQueue / forceRescanIfIdle /
    // dispatchReadyTasks, which all delegate to the SAME spawnIfNotAssigned
    // closure in result-collector.ts (queue-completion / idle-rescan /
    // dep-ready are three call sites of one function, not three divergent
    // implementations). config-less mirrors processQueue's own legacy
    // signature (waitForResults' config param is optional).
    const localBackend = makeMockBackend();
    const localFixTask = makeTask('701-001-fix-local', { isPriorityFix: true, fixForTaskId: '701-001' });
    const localDisposition = await executeSpawnTask(
      { task: localFixTask },
      baseDeps(root, { backend: localBackend, config: undefined }),
    );

    // "heavyweight" deps — represents respawnEligibleTasks, which always has
    // a full ResolvedConfig.
    const heavyBackend = makeMockBackend();
    const heavyFixTask = makeTask('701-001-fix-heavy', { isPriorityFix: true, fixForTaskId: '701-001' });
    const fullConfig = {
      spawn_backend: undefined,
      activeModeConfig: { max_workers: 3, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5', haiku_allowed: true },
    } as unknown as ResolvedConfig;
    const heavyDisposition = await executeSpawnTask(
      { task: heavyFixTask },
      baseDeps(root, { backend: heavyBackend, config: fullConfig }),
    );

    expect(localDisposition.kind).toBe('spawned');
    expect(heavyDisposition.kind).toBe('spawned');
    expect(localFixTask.forceModel).toBe(heavyFixTask.forceModel);
    expect(localFixTask.provider).toBe(heavyFixTask.provider);
    expect(localFixTask.modelEffort).toBe(heavyFixTask.modelEffort);
    expect(localBackend.calls[0]!.opts?.reasoningEffort)
      .toBe(heavyBackend.calls[0]!.opts?.reasoningEffort);

    // Both callers persisted — persistence is no longer heavyweight-only.
    expect(existsSync(join(root, '.tasks', 'task-701-001-fix-local.json'))).toBe(true);
    expect(existsSync(join(root, '.tasks', 'task-701-001-fix-heavy.json'))).toBe(true);
  });
});

// ─── Live wiring — queue-completion trigger (processQueue) ──────────────────

describe('waitForResults — queue-completion trigger (processQueue) delegates to executeSpawnTask', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-queue'); vi.clearAllMocks(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('spawns the queued fix-task with inherited routing fields and persists task-<id>.json (behavior a + b, live wiring)', async () => {
    const original = makeTask('702-001', { modelEffort: 'high', provider: 'claude' });
    writeOriginalTask(root, original);

    const active = makeTask('702-000', { status: TaskStatus.EXECUTING, budget: undefined });
    const fixTask = makeTask('702-001-fix', { isPriorityFix: true, fixForTaskId: '702-001' });

    const sprint: Sprint = {
      id: 'sprint-sched3',
      number: 1,
      tasks: [active, fixTask],
      workers: ['w-702-000', 'w-702-001-fix'],
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
      planningMode: 'structured',
    } as Sprint;

    // The active task's result is already on disk — processQueue picks the
    // fix-task off the FIFO queue in the very first dispatch tick.
    writeFileSync(
      join(root, '.tasks', 'task-702-000.result'),
      JSON.stringify({
        taskId: '702-000', workerId: 'w-702-000', filesChanged: [], linesAdded: 0, linesRemoved: 0,
        testsPassed: true, coverage: 100, selfAssessment: 'DONE', notes: 'ok',
        tokenUsage: {
          inputTokens: 10,
          outputTokens: 2,
          cacheReadTokens: 0,
          source: 'provider-adapter',
          provider: 'claude',
          model: 'claude-sonnet-5',
        },
        cost: { usd: 0.01, currency: 'USD', pricingSource: 'provider-envelope', isLocal: false },
      }),
    );

    const backend = makeMockBackend();
    await waitForResults(root, sprint, 300, [fixTask], { spawnBackend: backend });

    expect(backend.calls.map(call => call.taskId)).toContain('702-001-fix');
    expect(vi.mocked(spawnWorker)).not.toHaveBeenCalled();
    expect(fixTask.provider).toBe('claude');
    expect(fixTask.modelEffort).toBe('high');

    const persisted = JSON.parse(readFileSync(join(root, '.tasks', 'task-702-001-fix.json'), 'utf-8'));
    expect(persisted.status).toBe(TaskStatus.EXECUTING);
    expect(persisted.modelEffort).toBe('high');
  });
});

// ─── Live wiring — dep-ready trigger (dispatchReadyTasks) ───────────────────

describe('waitForResults — dep-ready trigger (dispatchReadyTasks) delegates to executeSpawnTask', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-depready'); vi.clearAllMocks(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('spawns a dependency-ready fix-task with inherited routing fields and persists task-<id>.json (behavior a + b, live wiring)', async () => {
    const original = makeTask('703-001', { modelEffort: 'high', provider: 'claude' });
    writeOriginalTask(root, original);

    const dep = makeTask('703-000', { status: TaskStatus.DONE });
    const fixTask = makeTask('703-001-fix', {
      isPriorityFix: true,
      fixForTaskId: '703-001',
      dependencies: ['703-000'],
    });

    const sprint: Sprint = {
      id: 'sprint-sched3',
      number: 1,
      tasks: [dep, fixTask],
      workers: ['w-703-000', 'w-703-001-fix'],
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
      planningMode: 'structured',
    } as Sprint;

    const config = {
      dependency_pipeline_enabled: false,
      activeModeConfig: { max_workers: 3, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5', haiku_allowed: true },
    } as unknown as ResolvedConfig;

    const backend = makeMockBackend();
    await waitForResults(
      root,
      sprint,
      300,
      undefined,
      { spawnBackend: backend },
      undefined,
      config,
    );

    expect(backend.calls.map(call => call.taskId)).toContain('703-001-fix');
    expect(vi.mocked(spawnWorker)).not.toHaveBeenCalled();
    expect(fixTask.provider).toBe('claude');
    expect(fixTask.modelEffort).toBe('high');

    const persisted = JSON.parse(readFileSync(join(root, '.tasks', 'task-703-001-fix.json'), 'utf-8'));
    expect(persisted.status).toBe(TaskStatus.EXECUTING);
  });
});
