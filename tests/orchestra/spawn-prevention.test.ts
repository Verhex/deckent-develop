/**
 * tests/orchestra/spawn-prevention.test.ts
 *
 * Validates that spawnWorkers() uses ONLY the provided SpawnBackend
 * when one is given — never falling through to legacy tmux or adapter paths.
 *
 * Sprint 127-003: İkili Spawn Prevention Testi
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';

// ─── Mocks (must be before imports of the module under test) ────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
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

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  TmuxBackend: vi.fn(),
  SubprocessBackend: vi.fn(),
  SpawnBackendFactory: { create: vi.fn() },
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
    parseDebtTable: vi.fn().mockReturnValue([]),
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
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    platform: 'linux',
    hasTmux: true,
    recommendedMaxWorkers: 4,
    cpuCores: 4,
    totalMemMB: 16000,
    freeMemMB: 8000,
  }),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/orchestra/model-selector.js', () => ({
  calculateModelScore: vi.fn(),
  inferModelFromDirective: vi.fn(),
  resolveTaskModel: vi.fn().mockReturnValue('sonnet'),
  parsePatterns: vi.fn().mockReturnValue([]),
  deduplicatePatterns: vi.fn().mockReturnValue([]),
  suggestModelFromPatterns: vi.fn(),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  createTask: vi.fn(),
  extractScopeFromDirective: vi.fn(),
  parseStructuredDirectives: vi.fn().mockReturnValue([]),
  buildWorkerPrompt: vi.fn().mockReturnValue('mock-worker-prompt'),
  plannerTaskToParams: vi.fn(),
  resolveWorkerEffort: vi.fn(),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
  decay: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  trimMemoryWithHeader: vi.fn(),
  writeRetrospective: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({
    totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 1000, coveragePercent: 90, noGoRate: 0, newDebtCount: 0,
    resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  }),
  updateProjectDocs: vi.fn(),
  buildAgentPerformance: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/coverage-validator.js', () => ({
  parseCoverageFromVitest: vi.fn(),
  validateCoverage: vi.fn(),
  validateWorkerCoverage: vi.fn().mockReturnValue(null),
  isDocOnlyTask: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn().mockReturnValue({ id: 'sp-001', sprintId: 'sprint-001', branchName: 'deckent-backup', createdAt: new Date().toISOString() }),
  rollback: vi.fn().mockReturnValue({ success: true }),
  getRollbackPolicy: vi.fn().mockReturnValue('skip'),
  recordRollbackInDebt: vi.fn(),
  saveSafetyPoint: vi.fn(),
  deleteSafetyPoint: vi.fn(),
  deleteSafetyPointFile: vi.fn(),
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(false),
  isGitRepo: vi.fn().mockReturnValue(true),
  cleanOrphanSafetyPoint: vi.fn().mockReturnValue(false),
  loadSafetyPoint: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  return {
    ...actual,
    providerRegistry: {
      getDefault: vi.fn().mockReturnValue(null),
      registerProvider: vi.fn(),
      getProvider: vi.fn().mockImplementation((name: string) => {
        throw new Error(`Provider not found: "${name}"`);
      }),
      hasProvider: vi.fn().mockReturnValue(false),
      listProviders: vi.fn().mockReturnValue([]),
      register: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    },
  };
});

vi.mock('../../src/orchestra/task-router.js', () => ({
  routeTask: vi.fn().mockReturnValue({
    provider: 'claude',
    agent: 'generic',
    skills: [],
    reason: 'default',
  }),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  clearHooks: vi.fn(),
  loadPluginHooks: vi.fn().mockResolvedValue(0),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runCiRegressionCheck: vi.fn().mockReturnValue({ regressionDetected: false, tscPassed: true, targetedTestsPassed: true, targetedTestFiles: [], alerts: [], testCountDelta: 0 }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true, tscPassed: true, testsPassed: true, testCount: 0, testPassed: 0, testFailed: 0, coverage: 0, baselineSaved: false }),
}));

vi.mock('../../src/cli/helpers/sprint-summary-rich.js', () => ({
  formatRichSprintSummary: vi.fn().mockReturnValue('Rich Summary'),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn().mockReturnValue('SPLASH'),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({ languages: [], frameworks: [], tools: [] }),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue(new Map()),
  })),
}));

vi.mock('../../src/core/skill-selector.js', () => ({
  selectSkills: vi.fn().mockReturnValue({ skills: [], reason: '' }),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue(new Map()),
    saveTempAgentToPool: vi.fn(),
    createTempAgent: vi.fn(),
    cleanupTempAgents: vi.fn(),
    cleanupPersistentTempAgents: vi.fn().mockReturnValue(0),
  })),
}));

vi.mock('../../src/core/agent-selector.js', () => ({
  selectAgent: vi.fn().mockReturnValue({ agent: null, reason: '' }),
}));

vi.mock('../../src/agents/worker-ipc.js', () => {
  const channels = new Map();
  return {
    ChannelRegistry: vi.fn().mockImplementation(() => ({
      register: vi.fn((taskId: string, ch: unknown) => channels.set(taskId, ch)),
      get: vi.fn((taskId: string) => channels.get(taskId) ?? null),
      remove: vi.fn((taskId: string) => channels.delete(taskId)),
      getAll: vi.fn(() => [...channels.entries()]),
      clear: vi.fn(() => channels.clear()),
    })),
    WorkerChannel: vi.fn(),
  };
});

vi.mock('../../src/orchestra/result-collector.js', () => ({
  resolveAgentPrompt: vi.fn().mockReturnValue(''),
  resolveSkillPrompts: vi.fn().mockReturnValue(''),
  waitForResults: vi.fn(),
  collectResults: vi.fn(),
  processQueue: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-utils.js', () => ({
  readFileSafe: vi.fn().mockReturnValue(''),
  now: vi.fn().mockReturnValue(new Date().toISOString()),
  isDocTask: vi.fn().mockReturnValue(false),
  isStaleTaskFile: vi.fn().mockReturnValue(false),
  isTmuxProvider: vi.fn().mockReturnValue(true),
  resolveDefaultUsageCli: vi.fn().mockReturnValue(''),
  getDefaultProvider: vi.fn().mockReturnValue('claude'),
  resolveTaskProvider: vi.fn().mockReturnValue('claude'),
  getProviderAdapterForTask: vi.fn().mockReturnValue(null),
  getSubprocessWorkerLogPath: vi.fn(),
  readSubprocessWorkerLog: vi.fn(),
  hasSubprocessWorkerLog: vi.fn(),
  writeSprintState: vi.fn(),
  readSprintState: vi.fn().mockReturnValue(null),
  clearSprintState: vi.fn(),
  detectOrphanWorkers: vi.fn().mockReturnValue([]),
  buildSpawnRetryHint: vi.fn().mockReturnValue(''),
  extractGoNogoCriteria: vi.fn().mockReturnValue({ goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' }),
  PAUSE_STATE_FILE: '.brain/.pause-state.json',
}));

// ─── Imports (after mocks) ──────────────────────────────────────────

import { ensureSession, spawnWorker } from '../../src/orchestra/tmux.js';
import { spawnWorkers } from '../../src/orchestra/sprint-controller.js';
import { isTmuxProvider, resolveTaskProvider, getProviderAdapterForTask } from '../../src/orchestra/sprint-utils.js';

const mockedEnsureSession = vi.mocked(ensureSession);
const mockedSpawnWorker = vi.mocked(spawnWorker);
const mockedIsTmuxProvider = vi.mocked(isTmuxProvider);
const mockedResolveTaskProvider = vi.mocked(resolveTaskProvider);
const mockedGetProviderAdapterForTask = vi.mocked(getProviderAdapterForTask);

// ─── Test Helpers ───────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'Test Task',
    description: 'A test task for spawn prevention',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'testing',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'passes', noGoCriteria: 'fails', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-test',
    number: 999,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks,
    workers: [],
  };
}

function makeConfig(): ResolvedConfig {
  return {
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
    },
  } as ResolvedConfig;
}

function makeMockBackend(): SpawnBackend {
  return {
    name: 'mock',
    spawn: vi.fn(),
    kill: vi.fn(),
    list: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('spawnWorkers — spawn prevention (backend vs legacy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveTaskProvider.mockReturnValue('claude');
    mockedIsTmuxProvider.mockReturnValue(true);
    mockedGetProviderAdapterForTask.mockReturnValue(null);
  });

  it('should call backend.spawn when SpawnBackend is provided', async () => {
    const task = makeTask();
    const sprint = makeSprint([task]);
    const config = makeConfig();
    const mockBackend = makeMockBackend();

    await spawnWorkers('/tmp/test-project', sprint, config, { spawnBackend: mockBackend });

    expect(mockBackend.spawn).toHaveBeenCalledTimes(1);
    expect(mockBackend.spawn).toHaveBeenCalledWith(
      'test-001',
      'sonnet',
      'mock-worker-prompt',
      expect.objectContaining({
        projectDir: '/tmp/test-project',
        autoApprove: false,
      }),
    );
  });

  it('should NOT call legacy tmux spawnWorker when backend is provided', async () => {
    const task = makeTask();
    const sprint = makeSprint([task]);
    const config = makeConfig();
    const mockBackend = makeMockBackend();

    await spawnWorkers('/tmp/test-project', sprint, config, { spawnBackend: mockBackend });

    // Legacy tmux path should never be reached
    expect(mockedSpawnWorker).not.toHaveBeenCalled();
  });

  it('should NOT call ensureSession when backend is provided', async () => {
    const task = makeTask();
    const sprint = makeSprint([task]);
    const config = makeConfig();
    const mockBackend = makeMockBackend();

    await spawnWorkers('/tmp/test-project', sprint, config, { spawnBackend: mockBackend });

    // ensureSession is only called when backend is absent and tmux tasks exist
    expect(mockedEnsureSession).not.toHaveBeenCalled();
  });

  it('should NOT call adapter spawn when backend is provided (non-tmux provider)', async () => {
    // Even if the task provider is non-tmux (Codex), backend takes priority
    mockedResolveTaskProvider.mockReturnValue('codex');
    mockedIsTmuxProvider.mockReturnValue(false);

    const mockAdapter = { spawn: vi.fn(), kill: vi.fn(), name: 'codex' };
    mockedGetProviderAdapterForTask.mockReturnValue(mockAdapter as never);

    const task = makeTask({ provider: 'codex' as never });
    const sprint = makeSprint([task]);
    const config = makeConfig();
    const mockBackend = makeMockBackend();

    await spawnWorkers('/tmp/test-project', sprint, config, { spawnBackend: mockBackend });

    // Backend path wins — adapter should NOT be called
    expect(mockBackend.spawn).toHaveBeenCalledTimes(1);
    expect(mockAdapter.spawn).not.toHaveBeenCalled();
    expect(mockedSpawnWorker).not.toHaveBeenCalled();
  });

  it('should fall back to legacy tmux when no backend is provided (Claude provider)', async () => {
    // No backend → isTmuxProvider returns true → legacy tmux path
    mockedIsTmuxProvider.mockReturnValue(true);

    const task = makeTask();
    const sprint = makeSprint([task]);
    const config = makeConfig();

    await spawnWorkers('/tmp/test-project', sprint, config);

    expect(mockedSpawnWorker).toHaveBeenCalledTimes(1);
    expect(mockedEnsureSession).toHaveBeenCalledTimes(1);
  });

  it('should use adapter when no backend and provider is non-tmux', async () => {
    mockedResolveTaskProvider.mockReturnValue('codex');
    mockedIsTmuxProvider.mockReturnValue(false);

    const mockAdapter = {
      name: 'codex',
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      isAvailable: vi.fn(async () => true),
    };
    mockedGetProviderAdapterForTask.mockReturnValue(mockAdapter as never);

    const task = makeTask({ provider: 'codex' as never });
    const sprint = makeSprint([task]);
    const config = makeConfig();

    await spawnWorkers('/tmp/test-project', sprint, config);

    // Adapter path — not legacy tmux, not backend
    expect(mockAdapter.spawn).toHaveBeenCalledTimes(1);
    expect(mockedSpawnWorker).not.toHaveBeenCalled();
  });

  it('should spawn multiple tasks through backend without leaking to legacy', async () => {
    const tasks = [
      makeTask({ id: 'task-a' }),
      makeTask({ id: 'task-b' }),
      makeTask({ id: 'task-c' }),
    ];
    const sprint = makeSprint(tasks);
    const config = makeConfig();
    const mockBackend = makeMockBackend();

    await spawnWorkers('/tmp/test-project', sprint, config, { spawnBackend: mockBackend });

    expect(mockBackend.spawn).toHaveBeenCalledTimes(3);
    expect(mockedSpawnWorker).not.toHaveBeenCalled();
    expect(mockedEnsureSession).not.toHaveBeenCalled();

    // Verify each task was spawned with correct ID
    const spawnedIds = (mockBackend.spawn as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(spawnedIds).toEqual(['task-a', 'task-b', 'task-c']);
  });
});
