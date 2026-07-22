/**
 * tests/orchestra/brain-provider.test.ts — Brain Provider Integration Tests
 *
 * Tests the ProviderAdapter and SpawnBackend integration in brain.ts:
 * - spawnWorkers uses provided SpawnBackend
 * - spawnWorkers falls back to tmux when no backend provided
 * - waitForResults uses SpawnBackend in processQueue
 * - cleanup uses SpawnBackend list/kill methods
 * - cleanup removes .tasks/.prompt-* hidden tmpfiles
 * - getDefaultProvider returns registered provider or null
 * - RunSprintOptions accepts spawnBackend and provider
 * - runSprint creates SpawnBackend via factory when none provided
 * - runSprint uses provider for usage check when available
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, SprintPhase, SprintStatus, AgentStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../../src/core/provider.js';
import type { ModelType } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  // Sprint 156 Task 4: archivePromptFiles uses renameSync to move .prompt-*.txt
  // and .worker-*.sh into .tasks/archive/sprint-{id}/ instead of unlinking.
  renameSync: vi.fn(),
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  resetDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
  startScanLoop: vi.fn().mockReturnValue(setInterval(() => {}, 99999)),
  writeScanToDashboard: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    countBrainLines: vi.fn().mockReturnValue(100),
    getNextSprintId: vi.fn().mockReturnValue('sprint-001'),
    updateLastSprintId: vi.fn(),
  };
});

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
  createWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    getState: vi.fn(() => 'SPAWNING'),
    stop: vi.fn(),
  })),
  removeWorkerStateMachine: vi.fn(() => true),
  isWorkerStoppable: vi.fn(() => true),
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  normalizePlannerDependencies: () => ({ resolvedCount: 0, dropped: [] }),
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/orchestra/spawn-backend.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/spawn-backend.js')>();
  return {
    ...actual,
    SpawnBackendFactory: {
      create: vi.fn().mockReturnValue({
        name: 'tmux',
        spawn: vi.fn(),
        kill: vi.fn(),
        list: vi.fn().mockReturnValue([]),
        isAvailable: vi.fn().mockResolvedValue(true),
      }),
      isTmuxAvailable: vi.fn().mockReturnValue(true),
      createAsync: vi.fn(),
    },
  };
});

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  return {
    ...actual,
    providerRegistry: {
      getDefault: vi.fn().mockReturnValue({
        name: 'claude',
        buildCommand: vi.fn().mockReturnValue('claude --model opus /dev/null'),
      }),
      registerProvider: vi.fn(),
      getProvider: vi.fn(),
      listProviders: vi.fn().mockReturnValue([]),
      hasProvider: vi.fn().mockReturnValue(false),
      unregisterProvider: vi.fn().mockReturnValue(false),
      clear: vi.fn(),
      setDefault: vi.fn(),
      size: 0,
    },
  };
});

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/agents/worker-ipc.js', () => ({
  ChannelRegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    remove: vi.fn(),
    get: vi.fn().mockReturnValue(null),
    has: vi.fn().mockReturnValue(false),
    clear: vi.fn(),
    size: 0,
  })),
}));

// Sprint-spawner dependencies (extracted from sprint-controller in Sprint 136)
vi.mock('../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('mock worker prompt'),
  createTask: vi.fn(),
  extractScopeFromDirective: vi.fn(),
  parseStructuredDirectives: vi.fn(),
  plannerTaskToParams: vi.fn(),
  resolveWorkerEffort: vi.fn(),
}));

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config.js')>();
  return {
    ...actual,
    resolveEffectiveWorkers: vi.fn().mockImplementation((config: { activeModeConfig?: { max_workers?: number } }) => {
      return config?.activeModeConfig?.max_workers ?? 4;
    }),
  };
});

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({ cpuCores: 4, memoryGB: 16, platform: 'linux' }),
}));

vi.mock('../../src/orchestra/sprint-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/sprint-utils.js')>();
  return {
    ...actual,
    now: vi.fn().mockReturnValue('2026-03-16T00:00:00.000Z'),
    writeSprintState: vi.fn(),
    clearSprintState: vi.fn(),
    readSprintState: vi.fn(),
    detectOrphanWorkers: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../../src/orchestra/task-router.js', () => ({
  routeTask: vi.fn().mockReturnValue({ provider: 'claude', agent: 'generic', skills: [] }),
}));

vi.mock('../../src/orchestra/parallel-pipeline.js', () => ({
  ParallelPipelineManager: vi.fn().mockImplementation(() => ({
    createPipeline: vi.fn().mockReturnValue([]),
  })),
  DependencyCycleError: class DependencyCycleError extends Error {},
}));

vi.mock('../../src/core/observability.js', () => ({
  metric: vi.fn(),
  trace: vi.fn((_name: string, fn: () => unknown) => fn()),
  structuredLog: vi.fn(),
  initObservability: vi.fn(),
  setObservabilitySprintId: vi.fn(),
  getObservabilitySprintId: vi.fn().mockReturnValue(null),
  getMetricsPath: vi.fn().mockReturnValue('/tmp/metrics.jsonl'),
  getPerSprintMetricsPath: vi.fn().mockReturnValue(null),
  resetObservability: vi.fn(),
  generateLoadReport: vi.fn().mockResolvedValue('# Load Report\n'),
  TELEMETRY_ENABLED: false,
}));

// Result collector mock (resolveAgentPrompt + resolveSkillPrompts now live here)
vi.mock('../../src/orchestra/result-collector.js', () => ({
  waitForResults: vi.fn().mockResolvedValue([]),
  resolveAgentPrompt: vi.fn().mockResolvedValue(undefined),
  resolveSkillPrompts: vi.fn().mockResolvedValue([]),
  buildResultsMap: vi.fn().mockReturnValue(new Map()),
  estimateTokenUsage: vi.fn().mockReturnValue({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: 'claude-sonnet-5' }),
  enrichResultTokenUsage: vi.fn(),
  handleWorkerQuestion: vi.fn(),
  checkWorkerQuestions: vi.fn().mockReturnValue([]),
}));

// Sub-module mocks
vi.mock('../../src/orchestra/model-selector.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/model-selector.js')>();
  return { ...actual };
});

vi.mock('../../src/orchestra/debt-manager.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/debt-manager.js')>();
  return {
    ...actual,
    handleEvaluation: vi.fn(),
    handleCrossDependencies: vi.fn(),
    escalateDebt: vi.fn(),
    resolveDebt: vi.fn(),
    runDecay: vi.fn(),
  };
});

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  writeRetrospective: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({
    sprintId: 'sprint-001',
    totalTasks: 0,
    doneTasks: 0,
    techDebtTasks: 0,
    noGoTasks: 0,
    successRate: 1,
  }),
  updateProjectDocs: vi.fn(),
  compareWithPreviousSprint: vi.fn(),
  readPreviousSprintMetrics: vi.fn(),
  trimMemoryWithHeader: vi.fn(),
}));

vi.mock('../../src/orchestra/coverage-validator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/coverage-validator.js')>();
  return { ...actual };
});

// ─── Imports after mocks ──────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ensureSession, spawnWorker, killWorker, listWorkers } from '../../src/orchestra/tmux.js';
import { updateDashboard, detectDeadlocks } from '../../src/monitor/auditor.js';
import { getNextSprintId } from '../../src/core/utils.js';
import { providerRegistry } from '../../src/core/provider.js';

import {
  spawnWorkers,
  waitForResults,
  cleanup,
  getDefaultProvider,
  SpawnBackendFactory,
} from '../../src/orchestra/brain.js';

// ─── Helpers ─────────────────────────────────────────────────────

const ROOT = '/project';

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: false,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: ROOT,
    version: '0.1.0',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'A test task',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-001',
    createdAt: '2026-03-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks: [makeTask()],
    workers: ['w-001-001'],
    startedAt: '2026-03-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeMockBackend(): SpawnBackend & {
  spawn: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  isAvailable: ReturnType<typeof vi.fn>;
} {
  return {
    name: 'mock-backend',
    spawn: vi.fn(),
    kill: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

function makeMockProvider(): ProviderAdapter {
  return {
    name: 'mock-provider',
    supportedModels: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'] as const,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('claude -p -'),
  };
}

const spawnOk = { status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(readdirSync).mockReturnValue([] as never);
  vi.mocked(listWorkers).mockReturnValue([]);
  vi.mocked(detectDeadlocks).mockReturnValue([]);
  vi.mocked(spawnSync).mockReturnValue(spawnOk);
  vi.mocked(getNextSprintId).mockReturnValue('sprint-001');
  vi.mocked(providerRegistry.getDefault).mockImplementation(() => {
    throw new Error('No providers registered');
  });
});

// ═══ Tests ═══════════════════════════════════════════════════════════

describe('getDefaultProvider', () => {
  it('returns null when no provider is registered', () => {
    vi.mocked(providerRegistry.getDefault).mockImplementation(() => {
      throw new Error('No providers registered');
    });
    const result = getDefaultProvider();
    expect(result).toBeNull();
  });

  it('returns the default registered provider', () => {
    const mockProvider = makeMockProvider();
    vi.mocked(providerRegistry.getDefault).mockReturnValue(mockProvider);
    const result = getDefaultProvider();
    expect(result).toBe(mockProvider);
  });

  it('handles any error from providerRegistry gracefully', () => {
    vi.mocked(providerRegistry.getDefault).mockImplementation(() => {
      throw new TypeError('Unexpected error');
    });
    expect(() => getDefaultProvider()).not.toThrow();
    expect(getDefaultProvider()).toBeNull();
  });
});

describe('spawnWorkers with SpawnBackend', () => {
  it('uses provided spawnBackend.spawn() for each task', async () => {
    const backend = makeMockBackend();
    const sprint = makeSprint();
    const config = makeConfig();

    await spawnWorkers(ROOT, sprint, config, { spawnBackend: backend });

    expect(backend.spawn).toHaveBeenCalledOnce();
    expect(backend.spawn).toHaveBeenCalledWith(
      '001-001',
      'claude-sonnet-5',
      expect.any(String),
      expect.objectContaining({ projectDir: ROOT }),
    );
  });

  it('does NOT call ensureSession when spawnBackend is provided', async () => {
    const backend = makeMockBackend();
    const sprint = makeSprint();
    const config = makeConfig();

    await spawnWorkers(ROOT, sprint, config, { spawnBackend: backend });

    expect(ensureSession).not.toHaveBeenCalled();
  });

  it('does NOT call spawnWorker (tmux) when spawnBackend is provided', async () => {
    const backend = makeMockBackend();
    const sprint = makeSprint();
    const config = makeConfig();

    await spawnWorkers(ROOT, sprint, config, { spawnBackend: backend });

    expect(spawnWorker).not.toHaveBeenCalled();
  });

  it('uses legacy tmux path when no spawnBackend provided', async () => {
    const sprint = makeSprint();
    const config = makeConfig();

    await spawnWorkers(ROOT, sprint, config);

    expect(ensureSession).toHaveBeenCalledOnce();
    expect(spawnWorker).toHaveBeenCalledOnce();
  });

  it('passes autoApprove to spawnBackend', async () => {
    const backend = makeMockBackend();
    const sprint = makeSprint();
    const config = makeConfig();

    await spawnWorkers(ROOT, sprint, config, { spawnBackend: backend, autoApprove: true });

    expect(backend.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ autoApprove: true }),
    );
  });

  it('passes allowedTools derived from task scope', async () => {
    const backend = makeMockBackend();
    const task = makeTask({ scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] } });
    const sprint = makeSprint({ tasks: [task] });
    const config = makeConfig();

    await spawnWorkers(ROOT, sprint, config, { spawnBackend: backend });

    expect(backend.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ allowedTools: expect.stringContaining('src/') }),
    );
  });

  it('handles multiple tasks up to maxWorkers', async () => {
    const backend = makeMockBackend();
    const tasks = [
      makeTask({ id: '001-001' }),
      makeTask({ id: '001-002' }),
      makeTask({ id: '001-003' }),
    ];
    const sprint = makeSprint({ tasks });
    const config = makeConfig({ activeModeConfig: { max_workers: 2, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5', haiku_allowed: false } });

    const queued = await spawnWorkers(ROOT, sprint, config, { spawnBackend: backend });

    expect(backend.spawn).toHaveBeenCalledTimes(2);
    expect(queued).toHaveLength(1);
  });
});

describe('cleanup with SpawnBackend', () => {
  it('uses spawnBackend.list() instead of listWorkers()', () => {
    const backend = makeMockBackend();
    vi.mocked(backend.list).mockReturnValue(['001-001', '001-002']);
    const sprint = makeSprint();

    cleanup(ROOT, sprint, backend);

    expect(backend.list).toHaveBeenCalledOnce();
    expect(listWorkers).not.toHaveBeenCalled();
  });

  it('calls spawnBackend.kill() for each active worker', () => {
    const backend = makeMockBackend();
    vi.mocked(backend.list).mockReturnValue(['001-001', '001-002']);
    const sprint = makeSprint();

    cleanup(ROOT, sprint, backend);

    expect(backend.kill).toHaveBeenCalledTimes(2);
    expect(backend.kill).toHaveBeenCalledWith('001-001');
    expect(backend.kill).toHaveBeenCalledWith('001-002');
  });

  it('does NOT call killWorker (tmux) when spawnBackend is provided', () => {
    const backend = makeMockBackend();
    vi.mocked(backend.list).mockReturnValue(['001-001']);
    const sprint = makeSprint();

    cleanup(ROOT, sprint, backend);

    expect(killWorker).not.toHaveBeenCalled();
  });

  it('uses legacy tmux killWorker when no backend provided', () => {
    vi.mocked(listWorkers).mockReturnValue(['001-001']);
    const sprint = makeSprint();

    cleanup(ROOT, sprint);

    expect(listWorkers).toHaveBeenCalledOnce();
    expect(killWorker).toHaveBeenCalledWith('001-001');
  });

  it('archives .tasks/.prompt-*.txt hidden tmpfiles into archive/sprint-{id}/', () => {
    // Sprint 156 Task 4: prompt files are archived (renameSync) instead of unlinked
    // so they retain post-mortem forensic value. Production filter requires `.txt`.
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      'task-001-001.json',
      '.prompt-abc123.txt',
      '.prompt-def456.txt',
      'task-001-001.hb',
    ] as never);
    const sprint = makeSprint();

    cleanup(ROOT, sprint);

    // Both .prompt-*.txt files should be renamed (archived), not deleted.
    expect(renameSync).toHaveBeenCalledWith(
      expect.stringContaining('.prompt-abc123.txt'),
      expect.stringContaining('archive'),
    );
    expect(renameSync).toHaveBeenCalledWith(
      expect.stringContaining('.prompt-def456.txt'),
      expect.stringContaining('archive'),
    );
  });

  it('does not archive non-prompt hidden files', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    // F0.3 (05a1fd42): archivePromptFiles also drains .tasks/archive/_orphaned/
    // via its own readdirSync call. A blanket single-list mock makes
    // '.prompt-xyz.txt' appear in both the main .tasks/ scan and the
    // _orphaned scan, producing 2 renames instead of 1. Path-aware mock:
    // main .tasks/ listing vs. archive/* listings (staging + retention root) are separate.
    vi.mocked(readdirSync).mockImplementation((p: any) => {
      const path = String(p);
      if (path.includes('archive')) return [] as any;
      return [
        '.gitkeep',
        '.dashboard',
        '.prompt-xyz.txt',
      ] as any;
    });
    const sprint = makeSprint();

    cleanup(ROOT, sprint);

    // Only .prompt-xyz.txt should be archived, not .gitkeep or .dashboard
    const archivedPaths = vi.mocked(renameSync).mock.calls.map(c => c[0] as string);
    const archivedPrompt = archivedPaths.filter(p => p.includes('.prompt-'));
    const archivedOthers = archivedPaths.filter(p => p.includes('.gitkeep') || p.includes('.dashboard'));

    expect(archivedPrompt).toHaveLength(1);
    expect(archivedOthers).toHaveLength(0);
  });

  it('handles cleanup errors gracefully (does not throw)', () => {
    const backend = makeMockBackend();
    vi.mocked(backend.list).mockReturnValue(['001-001']);
    vi.mocked(backend.kill).mockImplementation(() => { throw new Error('kill failed'); });
    const sprint = makeSprint();

    expect(() => cleanup(ROOT, sprint, backend)).not.toThrow();
  });
});

describe('SpawnBackendFactory re-export', () => {
  it('SpawnBackendFactory.create is callable and accessible from brain module', () => {
    // SpawnBackendFactory is re-exported from brain.ts for external callers
    expect(typeof SpawnBackendFactory.create).toBe('function');
  });

  it('spawnWorkers with spawnBackend does not call SpawnBackendFactory.create', async () => {
    const backend = makeMockBackend();
    const sprint = makeSprint();
    const config = makeConfig();

    await spawnWorkers(ROOT, sprint, config, { spawnBackend: backend });

    // Factory should NOT be called — backend was provided directly
    expect(SpawnBackendFactory.create).not.toHaveBeenCalled();
  });
});

