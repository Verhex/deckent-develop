// ═══ Spawn Routing — Host-HTTP Adapter Predicate Tests ═════════════
// Sprint 234 AS-2 Faz 2 — Task 234-001
//
// Verifies the host-HTTP adapter routing in sprint-spawner:
//   1. `isAdapterProvider` classifies host-HTTP providers (ollama) correctly,
//      and excludes claude/codex/gemini.
//   2. `spawnWorkers` routes ollama tasks through the host adapter even when
//      a docker (or any other) backend is provided — backend.spawn MUST NOT
//      be called for ollama tasks.
//   3. claude tasks regress to `backend.spawn` as before (regression-free).
//   4. `respawnEligibleTasks` (wave-2 wire) applies the same routing.
//   5. `spawn-backend-docker.getProviderBinaryForModel` rejects an Ollama
//      Docker misroute before any different provider binary can be selected.
//
// Hermetic: tmpdir + mocked SpawnBackend + adapter mocked into
// providerRegistry. No real docker, no network, no spawnSync.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { spawnWorkers, respawnEligibleTasks } from '../../src/orchestra/sprint-spawner.js';
import { isAdapterProvider } from '../../src/orchestra/sprint-utils.js';
import { getProviderBinaryForModel } from '../../src/orchestra/spawn-backend-docker.js';
import { providerRegistry, bootstrapProviders } from '../../src/core/provider.js';
// Side-effect import: registerOllamaModels(modelRegistry) — ensures the
// registry knows ollama-served models so getProviderForModel resolves the
// 'ollama' branch in getProviderBinaryForModel. The defensive honest-fail
// test below relies on this branch being reachable.
import '../../src/providers/ollama.js';
import type {
  ProviderAdapter,
  ProviderSpawnOptions,
} from '../../src/core/provider.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';

// MF-2 lazy re-check (Sprint 252): spawnWorkers/respawnEligibleTasks now call
// bootstrapProviders() when a host-adapter is missing. Stub it to a no-op so the
// tests stay hermetic — otherwise real provider detection (the dev machine's live
// ollama/codex/gemini) would register adapters into the singleton registry and
// pollute the "no adapter → honest-fail" + routing assertions. providerRegistry
// and everything else stay REAL (partial mock).
vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  return { ...actual, bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }) };
});

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
    name: 'mock-backend',
    liveUsageBudgetSupport: 'measured-stream',
    executionLandingCapability: 'cooperative-landing',
    spawn(taskId, model, prompt, opts) {
      calls.push({ taskId, model, prompt, opts });
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

// ─── Mock ProviderAdapter with refreshSupportedModels ─────────────

interface MockAdapter extends ProviderAdapter {
  spawnCalls: Array<{ taskId: string; model: ModelType; prompt: string; opts?: ProviderSpawnOptions }>;
  refreshCount: number;
}

function makeMockOllamaAdapter(): MockAdapter {
  const spawnCalls: MockAdapter['spawnCalls'] = [];
  let refreshCount = 0;
  const adapter: MockAdapter = {
    name: 'ollama',
    executionCostClass: 'local',
    supportedModels: ['qwen3.6'] as unknown as readonly ModelType[],
    spawn(taskId, model, prompt, opts) {
      spawnCalls.push({ taskId, model, prompt, opts });
    },
    kill() { /* no-op */ },
    listWorkers() { return spawnCalls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    buildCommand(model: ModelType) { return `mock-ollama ${model}`; },
    // Optional method exercised by the routing fix
    refreshSupportedModels: async () => { refreshCount++; },
    get spawnCalls() { return spawnCalls; },
    get refreshCount() { return refreshCount; },
  } as unknown as MockAdapter;
  // Above getters from the literal don't carry — set explicit accessor refs
  Object.defineProperty(adapter, 'spawnCalls', { get: () => spawnCalls });
  Object.defineProperty(adapter, 'refreshCount', { get: () => refreshCount });
  return adapter;
}

// ─── Task / Sprint / Config Factories ─────────────────────────────

function createTask(id: string, provider: 'claude' | 'ollama', model: ModelType, filesWrite: string[] = []): Task {
  const task = {
    id,
    title: `Task ${id}`,
    description: `Routing-adapter test task ${id}`,
    model,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'adapter-routing-test',
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
    type: 'code-development',
    sprintId: 'sprint-234',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider,
  } as unknown as Task;
  if (provider === 'claude') applyRemoteBudget(task);
  return task;
}

function applyRemoteBudget(task: Task): void {
  task.budget = { maxTurns: 1 };
  task.budgetPolicy = {
    state: 'allow',
    role: 'worker',
    taskKind: task.type,
    resolvedProvider: task.provider ?? 'unknown',
    executionCostClass: 'remote',
    profileRef: 'tests.orchestra.spawn-routing-adapter',
    policyDigest: '9'.repeat(64),
    admissionMode: 'unattended',
    landingPolicy: { reserve_ratio: 0.25 },
  };
}

function makeConfig(opts?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    dependency_pipeline_enabled: false,
    activeModeConfig: {
      max_workers: 4,
    },
    ...opts,
  } as unknown as ResolvedConfig;
}

function makeSprint(id: string, tasks: Task[]): Sprint {
  return {
    id,
    number: 234,
    phase: 'SPAWN' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'],
    tasks,
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

// ─── Test Lifecycle ───────────────────────────────────────────────

describe('isAdapterProvider (Sprint 234 AS-2 Faz 2)', () => {
  it('returns true for ollama (host-HTTP provider)', () => {
    expect(isAdapterProvider('ollama')).toBe(true);
  });

  it('returns false for claude (tmux + docker backed)', () => {
    expect(isAdapterProvider('claude')).toBe(false);
  });

  // Sprint 248 (Provider Parity): codex/gemini are host-process CLI adapters
  // whose OAuth session lives on the host — they MUST bypass the Docker backend
  // (which would degrade them to the claude CLI) and spawn via their adapter.
  it('returns true for codex (host-process adapter)', () => {
    expect(isAdapterProvider('codex')).toBe(true);
  });

  it('returns true for gemini (host-process adapter)', () => {
    expect(isAdapterProvider('gemini')).toBe(true);
  });
});

describe('spawnWorkers — host-HTTP adapter routing', () => {
  let testRoot: string;
  let registeredOllamaAdapter: MockAdapter | null = null;
  const origCwd = process.cwd();

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'sprint-234-spawn-routing-'));
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    process.chdir(testRoot);
  });

  afterEach(() => {
    process.chdir(origCwd);
    // Unregister any ollama adapter we registered to keep tests hermetic
    if (registeredOllamaAdapter) {
      try { providerRegistry.unregisterProvider('ollama'); } catch { /* ok */ }
      registeredOllamaAdapter = null;
    }
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
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

  it('routes ollama task to adapter.spawn even when docker backend is provided', async () => {
    // Register a mock ollama adapter into the singleton registry
    const ollamaAdapter = makeMockOllamaAdapter();
    registeredOllamaAdapter = ollamaAdapter;
    providerRegistry.registerProvider(ollamaAdapter);

    const ollamaTask = createTask('234-ROUTE-A', 'ollama', 'qwen3.6' as ModelType, ['src/foo.ts']);
    persistTasks([ollamaTask]);
    const sprint = makeSprint('sprint-234', [ollamaTask]);
    const backend = makeMockBackend();

    await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });

    // Adapter must own the spawn — backend must NOT be called for this task
    expect(ollamaAdapter.spawnCalls.map(c => c.taskId)).toContain('234-ROUTE-A');
    expect(backend.calls.map(c => c.taskId)).not.toContain('234-ROUTE-A');
    // refreshSupportedModels must have been invoked
    expect(ollamaAdapter.refreshCount).toBeGreaterThanOrEqual(1);
  });

  it('routes claude task to backend.spawn (no regression)', async () => {
    const claudeTask = createTask('234-ROUTE-B', 'claude', 'claude-sonnet-5', ['src/bar.ts']);
    persistTasks([claudeTask]);
    const sprint = makeSprint('sprint-234', [claudeTask]);
    const backend = makeMockBackend();

    await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });

    expect(backend.calls.map(c => c.taskId)).toContain('234-ROUTE-B');
  });

  it('MF-2: host-adapter provider with NO registered adapter → honest NO_GO, not docker degrade', async () => {
    // No ollama adapter registered (simulates the Sprint-249 bootstrap/FIX-respawn
    // race where getProviderAdapterForTask returns null). Old behavior fell through
    // to the docker backend and silently degraded to claude. MF-2 must honest-fail.
    const ollamaTask = createTask('250-MF2', 'ollama', 'qwen3.6' as ModelType, ['docs/x.md']);
    persistTasks([ollamaTask]);
    const sprint = makeSprint('sprint-250', [ollamaTask]);
    const backend = makeMockBackend();

    await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });

    // Must NOT silently degrade to the docker backend
    expect(backend.calls.map(c => c.taskId)).not.toContain('250-MF2');
    // Must write an honest NO_GO result the collector can read
    const resultPath = join(testRoot, '.tasks', 'task-250-MF2.result');
    expect(existsSync(resultPath)).toBe(true);
    const result = JSON.parse(readFileSync(resultPath, 'utf-8'));
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.notes).toContain('host adapter');
    expect(result.tokenUsage.provider).toBe('ollama');
  });

  it('MF-2 lazy re-check: missing adapter → re-bootstrap registers it → runs it (not honest-fail)', async () => {
    // No ollama adapter registered initially (bootstrap race). The lazy re-check
    // re-runs bootstrap, which now registers it → the task runs on the adapter
    // instead of honest-failing.
    const ollamaAdapter = makeMockOllamaAdapter();
    registeredOllamaAdapter = ollamaAdapter;
    vi.mocked(bootstrapProviders).mockImplementationOnce(async () => {
      providerRegistry.registerProvider(ollamaAdapter);
      return { registered: ['ollama'], skipped: [], defaultProvider: null } as Awaited<ReturnType<typeof bootstrapProviders>>;
    });

    const task = createTask('250-LZ', 'ollama', 'qwen3.6' as ModelType, ['src/lz.ts']);
    persistTasks([task]);
    const sprint = makeSprint('sprint-lz', [task]);
    const backend = makeMockBackend();

    await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });

    expect(ollamaAdapter.spawnCalls.map(c => c.taskId)).toContain('250-LZ');
    expect(backend.calls.map(c => c.taskId)).not.toContain('250-LZ');
    expect(existsSync(join(testRoot, '.tasks', 'task-250-LZ.result'))).toBe(false); // no honest-fail
  });

  it('PSL-1 verify hook: `- Backend: docker` forces a host-adapter provider onto the spawn backend (not host adapter)', async () => {
    // The ollama adapter IS registered — normally the task would route to it.
    // `- Backend: docker` (matching spawn_backend=docker) must bypass host-adapter
    // routing and use the spawn backend instead, so codex/gemini/ollama can be
    // exercised IN the container (PSL-1 ProviderCommandSpec + OAuth mount).
    const ollamaAdapter = makeMockOllamaAdapter();
    registeredOllamaAdapter = ollamaAdapter;
    providerRegistry.registerProvider(ollamaAdapter);

    const task: Task = { ...createTask('250-BK', 'ollama', 'qwen3.6' as ModelType, ['src/x.ts']), backend: 'docker' };
    applyRemoteBudget(task);
    persistTasks([task]);
    const sprint = makeSprint('sprint-bk', [task]);
    const backend = makeMockBackend();

    await spawnWorkers(testRoot, sprint, makeConfig({ spawn_backend: 'docker' }), { spawnBackend: backend });

    // host-adapter bypassed even though it is registered; spawn backend used instead
    expect(ollamaAdapter.spawnCalls.map(c => c.taskId)).not.toContain('250-BK');
    expect(backend.calls.map(c => c.taskId)).toContain('250-BK');
  });

  it('mixed sprint — ollama hits adapter, claude hits backend', async () => {
    const ollamaAdapter = makeMockOllamaAdapter();
    registeredOllamaAdapter = ollamaAdapter;
    providerRegistry.registerProvider(ollamaAdapter);

    const ollamaTask = createTask('234-ROUTE-C', 'ollama', 'qwen3.6' as ModelType, ['src/c.ts']);
    const claudeTask = createTask('234-ROUTE-D', 'claude', 'claude-sonnet-5', ['src/d.ts']);
    persistTasks([ollamaTask, claudeTask]);
    const sprint = makeSprint('sprint-234', [ollamaTask, claudeTask]);
    const backend = makeMockBackend();

    await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });

    expect(ollamaAdapter.spawnCalls.map(c => c.taskId)).toEqual(['234-ROUTE-C']);
    expect(backend.calls.map(c => c.taskId)).toEqual(['234-ROUTE-D']);
  });
});

describe('respawnEligibleTasks — host-HTTP adapter routing (wave-2)', () => {
  let testRoot: string;
  let registeredOllamaAdapter: MockAdapter | null = null;
  const origCwd = process.cwd();

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'sprint-234-respawn-routing-'));
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    process.chdir(testRoot);
  });

  afterEach(() => {
    process.chdir(origCwd);
    if (registeredOllamaAdapter) {
      try { providerRegistry.unregisterProvider('ollama'); } catch { /* ok */ }
      registeredOllamaAdapter = null;
    }
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('routes wave-2 ollama task to adapter.spawn (same routing as spawnWorkers)', async () => {
    const ollamaAdapter = makeMockOllamaAdapter();
    registeredOllamaAdapter = ollamaAdapter;
    providerRegistry.registerProvider(ollamaAdapter);

    // Wave-2 scenario: dependency_pipeline_enabled, blocker is DONE,
    // ollama task is PENDING with its dependency satisfied.
    const blocker = createTask('234-RESP-A', 'claude', 'claude-sonnet-5', ['src/blocker.ts']);
    blocker.status = TaskStatus.DONE;
    const ollamaTask = createTask('234-RESP-B', 'ollama', 'qwen3.6' as ModelType, ['src/wave2.ts']);
    ollamaTask.dependencies = ['234-RESP-A'];

    writeFileSync(
      join(testRoot, '.tasks', `task-${ollamaTask.id}.json`),
      JSON.stringify(ollamaTask, null, 2),
      'utf-8',
    );

    const sprint = makeSprint('sprint-234', [blocker, ollamaTask]);
    const backend = makeMockBackend();
    const config = makeConfig({ dependency_pipeline_enabled: true } as Partial<ResolvedConfig>);

    const spawned = await respawnEligibleTasks(testRoot, sprint, config, { spawnBackend: backend });

    expect(spawned).toContain('234-RESP-B');
    expect(ollamaAdapter.spawnCalls.map(c => c.taskId)).toContain('234-RESP-B');
    expect(backend.calls.map(c => c.taskId)).not.toContain('234-RESP-B');
    expect(ollamaAdapter.refreshCount).toBeGreaterThanOrEqual(1);
  });
});

describe('spawn-backend-docker — Ollama defensive honest-fail', () => {
  it('throws when an Ollama provider reaches Docker binary selection', () => {
    // Call with a registered ollama model id — getProviderForModel maps it to
    // 'ollama'. Layer-2 routing should have prevented this; the defensive
    // boundary must not substitute another provider.
    // 'llama3.2:3b' is registered by `registerOllamaModels` (side-effect of
    // importing providers/ollama at the top of this file).
    expect(() => getProviderBinaryForModel('llama3.2:3b' as ModelType))
      .toThrow(/Ollama provider cannot use the Docker CLI backend/);
  });
});
