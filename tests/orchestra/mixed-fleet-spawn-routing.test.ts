/**
 * Sprint 238 İŞ8 — Mixed-provider fleet spawn routing (hermetic e2e).
 *
 * Hermetic test of the routing split that sprint-237 proved live (a qwen3.6
 * ollama worker on the HOST running concurrently with a claude worker in
 * DOCKER, both writing `.result`). The load-bearing contract (Sprint 234 AS-2
 * Faz 2, sprint-spawner.ts:438): a host-HTTP adapter provider (`isAdapterProvider`,
 * i.e. ollama) bypasses the configured backend and spawns via `adapter.spawn`,
 * while every other provider goes through `backend.spawn`. The anti-regression
 * being guarded: a docker backend must NOT silently swallow an ollama task.
 *
 * Asserts the OUTCOME: each task reaches its correct spawn path, the docker
 * backend never receives the ollama task, and BOTH paths produce a `.result`
 * on disk (the two-result disk-verify from the live run).
 *
 * Hermetic: real spawnWorkers + tmpdir + real fs; the docker backend and the
 * ollama adapter are mocks that record their calls and write a stub `.result`.
 * The mock ollama adapter is registered into the global providerRegistry and
 * restored in afterEach so no global state leaks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnWorkers } from '../../src/orchestra/sprint-spawner.js';
import { providerRegistry } from '../../src/core/provider.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType, ProviderName } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
} from '../helpers/budgeted-docker-execution-fixture.js';

interface SpawnRec { taskId: string; model: ModelType; }

/** Mock docker-like backend: records spawns + writes a stub .result per task. */
function makeBackend(root: string): SpawnBackend & { calls: SpawnRec[] } {
  const calls: SpawnRec[] = [];
  return {
    name: 'mock-docker',
    ...TEST_MEASURED_LANDING_CAPABILITIES,
    spawn(taskId, model) {
      calls.push({ taskId, model });
      writeFileSync(
        join(root, '.tasks', `task-${taskId}.result`),
        JSON.stringify({ taskId, selfAssessment: 'DONE', via: 'docker-backend' }),
        'utf-8',
      );
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

/** Mock ollama host adapter: records spawns + refresh + writes a stub .result. */
function makeOllamaAdapter(root: string): ProviderAdapter & { calls: SpawnRec[]; refreshed: number } {
  const state = { calls: [] as SpawnRec[], refreshed: 0 };
  const adapter = {
    name: 'ollama' as ProviderName,
    executionCostClass: 'local' as const,
    buildCommand: () => 'ollama',
    isAvailable: () => Promise.resolve(true),
    spawn(taskId: string, model: ModelType) {
      state.calls.push({ taskId, model });
      writeFileSync(
        join(root, '.tasks', `task-${taskId}.result`),
        JSON.stringify({ taskId, selfAssessment: 'DONE', via: 'ollama-host-adapter' }),
        'utf-8',
      );
    },
    kill() { /* no-op */ },
    listWorkers() { return []; },
    // Optional on the contract — OllamaAdapter implements it for /api/tags.
    refreshSupportedModels() { state.refreshed++; return Promise.resolve(); },
  } as unknown as ProviderAdapter & { calls: SpawnRec[]; refreshed: number };
  Object.defineProperty(adapter, 'calls', { get: () => state.calls });
  Object.defineProperty(adapter, 'refreshed', { get: () => state.refreshed });
  return adapter;
}

function makeTask(id: string, provider: ProviderName, model: string, file: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Mixed-fleet test ${id}`,
    model: model as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'mixed-fleet-routing-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [file] },
    dependencies: [],
    goNogo: { goCriteria: 'n/a', noGoCriteria: 'n/a', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-238',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider,
    ...(provider === 'claude'
      ? {
          budget: TEST_REMOTE_EXECUTION_BUDGET,
          budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
        }
      : {}),
  } as unknown as Task;
}

function makeConfig(): ResolvedConfig {
  return {
    dependency_pipeline_enabled: false,
    activeModeConfig: { max_workers: 8 },
    token_throttle_ms: 0,
  } as unknown as ResolvedConfig;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-238',
    number: 238,
    phase: 'SPAWN' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'],
    tasks,
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

describe('Sprint 238 İŞ8 — mixed-provider fleet spawn routing', () => {
  let root: string;
  let priorOllama: ProviderAdapter | null;
  let ollama: ProviderAdapter & { calls: SpawnRec[]; refreshed: number };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mixed-fleet-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
    // Snapshot any pre-existing 'ollama' registration so we can restore it.
    priorOllama = providerRegistry.hasProvider('ollama') ? providerRegistry.getProvider('ollama') : null;
    ollama = makeOllamaAdapter(root);
    providerRegistry.registerProvider(ollama);
  });

  afterEach(() => {
    if (priorOllama) providerRegistry.registerProvider(priorOllama);
    else providerRegistry.unregisterProvider('ollama');
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  function persist(tasks: Task[]): void {
    for (const t of tasks) {
      writeFileSync(join(root, '.tasks', `task-${t.id}.json`), JSON.stringify(t, null, 2), 'utf-8');
    }
  }

  it('routes ollama→host adapter and claude→docker backend (no cross-routing)', async () => {
    const ollamaTask = makeTask('OLL-1', 'ollama', 'qwen3.6:27b', 'src/ollama-out.ts');
    const claudeTask = makeTask('CLA-1', 'claude', 'claude-sonnet-5', 'src/claude-out.ts');
    const tasks = [ollamaTask, claudeTask];
    persist(tasks);
    const backend = makeBackend(root);

    const origCwd = process.cwd();
    process.chdir(root);
    try {
      await spawnWorkers(root, makeSprint(tasks), makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    // ollama task → host adapter only.
    expect(ollama.calls.map(c => c.taskId)).toEqual(['OLL-1']);
    // claude task → docker backend only.
    expect(backend.calls.map(c => c.taskId)).toEqual(['CLA-1']);
    // Anti-regression: docker backend must NOT swallow the ollama task.
    expect(backend.calls.some(c => c.taskId === 'OLL-1')).toBe(false);
    expect(ollama.calls.some(c => c.taskId === 'CLA-1')).toBe(false);
  });

  it('refreshes the ollama adapter model acceptance before spawning', async () => {
    const ollamaTask = makeTask('OLL-2', 'ollama', 'qwen3.6:27b', 'src/o2.ts');
    persist([ollamaTask]);
    const backend = makeBackend(root);

    const origCwd = process.cwd();
    process.chdir(root);
    try {
      await spawnWorkers(root, makeSprint([ollamaTask]), makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    expect(ollama.refreshed).toBeGreaterThanOrEqual(1);
    expect(ollama.calls.map(c => c.taskId)).toEqual(['OLL-2']);
  });

  it('both fleet paths produce a .result on disk (two-result disk-verify)', async () => {
    const ollamaTask = makeTask('OLL-3', 'ollama', 'qwen3.6:27b', 'src/o3.ts');
    const claudeTask = makeTask('CLA-3', 'claude', 'claude-sonnet-5', 'src/c3.ts');
    const tasks = [ollamaTask, claudeTask];
    persist(tasks);
    const backend = makeBackend(root);

    const origCwd = process.cwd();
    process.chdir(root);
    try {
      await spawnWorkers(root, makeSprint(tasks), makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const ollamaResultPath = join(root, '.tasks', 'task-OLL-3.result');
    const claudeResultPath = join(root, '.tasks', 'task-CLA-3.result');
    expect(existsSync(ollamaResultPath)).toBe(true);
    expect(existsSync(claudeResultPath)).toBe(true);
    expect(JSON.parse(readFileSync(ollamaResultPath, 'utf-8')).via).toBe('ollama-host-adapter');
    expect(JSON.parse(readFileSync(claudeResultPath, 'utf-8')).via).toBe('docker-backend');
  });
});
