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
  readFileSync: vi.fn((path: unknown) => {
    const p = String(path);
    if (p.endsWith('.skill-delivery.json')) {
      const taskId = /task-(.+)\.skill-delivery\.json$/u.exec(p)?.[1] ?? '';
      return JSON.stringify({
        version: 2,
        taskId,
        source: 'worker-prompt',
        promptSha256: 'a'.repeat(64),
        promptCompilePlanId: `prompt-compile-plan:sha256:${'b'.repeat(64)}`,
        rolePolicyIdentity: 'worker:generic',
        assignedAgentId: 'generic',
        deliveredAgentId: 'generic',
        personaSegmentSha256: 'c'.repeat(64),
        assignedSkillIds: [],
        deliveredSkillIds: [],
        forcedSkillIds: [],
        undeliveredForcedSkillIds: [],
      });
    }
    return '';
  }),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
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
  resolvePlanTimeoutMs: vi.fn(() => 900_000), // F-2: sprint-planner/do.ts resolve the plan timeout through this
  normalizePlannerDependencies: () => ({ resolvedCount: 0, dropped: [] }),
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
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
  resolveLiveTraceEnabled: () => false,  // 583/N5 — spawn gate reads it; false = pre-N5 byte-stable opts
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
  resolveTaskModel: vi.fn().mockReturnValue('claude-sonnet-5'),
  parsePatterns: vi.fn().mockReturnValue([]),
  deduplicatePatterns: vi.fn().mockReturnValue([]),
  suggestModelFromPatterns: vi.fn(),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  // Plain functions (not vi.fn) so beforeEach resetAllMocks cannot strip the
  // implementation the spawner depends on (skillDelivery.deliveredSkillIds).
  writeSkillDeliveryEvidence: () => {},
  applySkillDirectiveAuthority: (task: { assignedSkills?: string[] }) => task?.assignedSkills ?? [],
  buildSkillDeliveryEvidence: (task: { id?: string; assignedSkills?: string[]; forceSkills?: string[] }, delivered?: readonly string[]) => ({
    version: 1, taskId: task?.id ?? '', source: 'worker-prompt',
    deliveredSkillIds: [...(delivered ?? [])],
    assignedSkillIds: [...(task?.assignedSkills ?? [])],
    forcedSkillIds: [...(task?.forceSkills ?? [])],
    undeliveredForcedSkillIds: (task?.forceSkills ?? []).filter((id) => !(delivered ?? []).includes(id)),
  }),
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
  // Sprint 234 AS-2 Faz 2: sprint-spawner now consults isAdapterProvider
  // before the backend.spawn priority block. Default `false` preserves the
  // pre-Sprint-234 cascade (backend → adapter → tmux) for tests in this file.
  isAdapterProvider: vi.fn().mockReturnValue(false),
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
  const model = overrides.model ?? 'claude-sonnet-5';
  const resolvedProvider = overrides.provider
    ?? (model.startsWith('gemini-') ? 'gemini' : /^(gpt-|o\d)/.test(model) ? 'codex' : 'claude');
  return {
    id: 'test-001',
    title: 'Test Task',
    description: 'A test task for spawn prevention',
    model,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'testing',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'passes', noGoCriteria: 'fails', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    budget: resolvedProvider === 'claude' ? { maxTurns: 1 } : undefined,
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      taskKind: 'code-development',
      resolvedProvider,
      executionCostClass: resolvedProvider === 'claude' ? 'remote' : 'local',
      profileRef: 'tests.orchestra.spawn-prevention',
      policyDigest: '8'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
      finalOnlyUsage: {
        maxWallClockSeconds: 600,
        profileRef: 'execution_budget.final_only_usage',
        policyDigest: '9'.repeat(64),
      },
    },
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
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
    },
  } as ResolvedConfig;
}

function makeMockBackend(): SpawnBackend {
  return {
    name: 'docker',
    executionCostClass: 'local',
    liveUsageBudgetSupport: 'measured-stream',
    executionLandingCapability: 'cooperative-landing',
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
      'claude-sonnet-5',
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

  it('holds an owner-mismatched final-only route before backend or adapter spawn', async () => {
    // Even if the task provider is non-tmux (Codex), backend takes priority
    mockedResolveTaskProvider.mockReturnValue('codex');
    mockedIsTmuxProvider.mockReturnValue(false);

    const mockAdapter = {
      spawn: vi.fn(),
      kill: vi.fn(),
      name: 'codex',
      executionCostClass: 'local',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
    };
    mockedGetProviderAdapterForTask.mockReturnValue(mockAdapter as never);

    const task = makeTask({
      provider: 'codex' as never,
      budget: { maxTurns: 1 },
    });
    task.budgetPolicy!.executionCostClass = 'remote';
    const sprint = makeSprint([task]);
    const config = {
      ...makeConfig(),
      spawn_backend: 'docker',
    } as ResolvedConfig;
    const mockBackend = makeMockBackend();

    await expect(
      spawnWorkers('/tmp/test-project', sprint, config, { spawnBackend: mockBackend }),
    ).rejects.toThrow(
      'FINAL_ONLY_USAGE_CONTAINMENT_HOLD:owner-authorization-mismatch',
    );

    // Fail closed before either execution surface spends provider work.
    expect(mockBackend.spawn).not.toHaveBeenCalled();
    expect(mockAdapter.spawn).not.toHaveBeenCalled();
    expect(mockedSpawnWorker).not.toHaveBeenCalled();
  });

  it('should fail closed when legacy tmux cannot meter the task budget', async () => {
    mockedIsTmuxProvider.mockReturnValue(true);

    const task = makeTask({ budget: { maxTurns: 1 } });
    const sprint = makeSprint([task]);
    const config = makeConfig();

    await expect(spawnWorkers('/tmp/test-project', sprint, config)).rejects.toThrow(
      /does not declare that capability/,
    );

    expect(mockedSpawnWorker).not.toHaveBeenCalled();
    // Session bootstrap precedes per-task metering admission; provider spawn remains blocked.
    expect(mockedEnsureSession).toHaveBeenCalledOnce();
  });

  it('should use adapter when no backend and provider is non-tmux', async () => {
    mockedResolveTaskProvider.mockReturnValue('codex');
    mockedIsTmuxProvider.mockReturnValue(false);

    const mockAdapter = {
      name: 'codex',
      executionCostClass: 'local',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
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
