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
//   5. `spawn-backend-docker.getProviderBinaryForModel` no longer silently
//      degrades ollama to claude — the defensive fallback now emits an
//      explicit warning (honest-fail).
//
// Hermetic: tmpdir + mocked SpawnBackend + adapter mocked into
// providerRegistry. No real docker, no network, no spawnSync.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { spawnWorkers, respawnEligibleTasks } from '../../src/orchestra/sprint-spawner.js';
import { isAdapterProvider } from '../../src/orchestra/sprint-utils.js';
import { getProviderBinaryForModel } from '../../src/orchestra/spawn-backend-docker.js';
import { providerRegistry } from '../../src/core/provider.js';
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
  return {
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
    sprintId: 'sprint-234',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider,
  } as unknown as Task;
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
    const claudeTask = createTask('234-ROUTE-B', 'claude', 'sonnet' as ModelType, ['src/bar.ts']);
    persistTasks([claudeTask]);
    const sprint = makeSprint('sprint-234', [claudeTask]);
    const backend = makeMockBackend();

    await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });

    expect(backend.calls.map(c => c.taskId)).toContain('234-ROUTE-B');
  });

  it('mixed sprint — ollama hits adapter, claude hits backend', async () => {
    const ollamaAdapter = makeMockOllamaAdapter();
    registeredOllamaAdapter = ollamaAdapter;
    providerRegistry.registerProvider(ollamaAdapter);

    const ollamaTask = createTask('234-ROUTE-C', 'ollama', 'qwen3.6' as ModelType, ['src/c.ts']);
    const claudeTask = createTask('234-ROUTE-D', 'claude', 'sonnet' as ModelType, ['src/d.ts']);
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
    const blocker = createTask('234-RESP-A', 'claude', 'sonnet' as ModelType, ['src/blocker.ts']);
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

describe('spawn-backend-docker — ollama defensive honest-fail', () => {
  it('emits explicit warning when ollama provider reaches Docker backend (no silent claude swap)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* swallow for test */ });

    // Call with a registered ollama model id — getProviderForModel maps it to
    // 'ollama'. Layer-2 routing should have prevented this; the defensive
    // fallback now surfaces a loud warning instead of silently picking claude.
    // 'llama-3.2-3b' is registered by `registerOllamaModels` (side-effect of
    // importing providers/ollama at the top of this file).
    const binary = getProviderBinaryForModel('llama-3.2-3b' as ModelType);

    // Legacy contract preserved: returns 'claude' so an in-flight container
    // does not crash mid-sprint. But the warning MUST be visible.
    expect(binary).toBe('claude');
    expect(warnSpy).toHaveBeenCalled();
    const warningMessage = warnSpy.mock.calls.map(args => String(args[0])).join('\n');
    expect(warningMessage).toMatch(/ollama/i);
    expect(warningMessage).toMatch(/sprint-spawner|isAdapterProvider/);

    warnSpy.mockRestore();
  });
});
