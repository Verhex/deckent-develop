/**
 * tests/orchestra/forced-skill-lineage-wire.test.ts
 *
 * 487-023 FORCED-SKILL-LINEAGE: proves an operator's explicit `- Skills:`
 * forceSkills id survives every choke point between plan-time assignment and
 * the actual worker prompt/spawn:
 *
 *   1. buildWorkerPrompt (task-builder.ts) — a forced skill that scores 0
 *      under filterSkillPromptsByDNA must still be re-added to the rendered
 *      prompt (comment: "487-023 FORCED-SKILL-LINEAGE" in task-builder.ts).
 *   2. routeSprintTasks (sprint-spawner.ts) — the single spawn-routing choke
 *      point every task passes through must union a forced skill id back
 *      into task.assignedSkills if it is ever missing there (comment:
 *      "486-018 FORCED-SKILL-PRESERVE" in sprint-spawner.ts).
 *   3. spawnWorkers (sprint-spawner.ts) — a forced skill whose SKILL.md
 *      failed to resolve (missing) or resolved but is administratively
 *      disabled (inactive) must produce a typed NO_GO via
 *      writeForcedSkillUnavailableNoGo, never a silent spawn without it.
 *
 * FIX rotation (debt-manager.ts rotatedSkills → forceSkills) is out of this
 * task's write scope (src/orchestra/task-builder.ts, src/orchestra/sprint-spawner.ts
 * only) and already sets `forceSkills: rotatedSkills` on the FIX task, so the
 * rotated ids flow through the same (1)+(2)+(3) checkpoints proven here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, ProviderName } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';
import type { TaskDNA } from '../../src/core/routing-types.js';

// ═══════════════════════════════════════════════════════════════════
// Part 1 + 2 — buildWorkerPrompt + routeSprintTasks (no heavy mocking;
// these are pure/near-pure functions exercised directly, same pattern as
// tests/orchestra/task-builder-skill.test.ts and
// tests/orchestra/spawner-single-authority.test.ts).
// ═══════════════════════════════════════════════════════════════════

import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { routeSprintTasks } from '../../src/orchestra/sprint-spawner.js';

function makeLightTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '487-023-t',
    title: 'Forced skill lineage test',
    description: 'desc',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-487',
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  } as Task;
}

/** DNA whose primary intent is 'documentation' — scores a TS-affinity skill 0. */
function makeDocDNA(): TaskDNA {
  return {
    intent: { primary: 'documentation', secondary: [], confidence: 0.9 },
    tags: [],
    domains: [],
    operations: [{ type: 'modify', weight: 1 }],
    complexity: { fileCount: 1, moduleCount: 1, crossCutting: false, estimatedSize: 'small' },
    scope: { writeRatio: {}, primaryWriteTarget: 'docs/', testWriteRatio: 0 },
  };
}

describe('buildWorkerPrompt — forced skill survives DNA filtering (487-023)', () => {
  it('re-adds a forceSkills id that filterSkillPromptsByDNA scored 0 for an unrelated task intent', () => {
    const task = makeLightTask({
      forceSkills: ['typescript-expert'],
      routingMeta: { routingVersion: 'v2', taskDNA: makeDocDNA() },
    });
    const skillPrompts = [
      { name: 'documentation-writer', content: 'A skill for writing documentation and guides.' },
      { name: 'typescript-expert', content: 'A skill for strict-mode generics and module design.' },
    ];

    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);

    // Both the DNA-relevant and the forced (DNA-irrelevant) skill reach the prompt.
    expect(prompt).toContain('--- documentation-writer ---');
    expect(prompt).toContain('--- typescript-expert ---');
    expect(prompt).toContain('A skill for strict-mode generics and module design.');
  });

  it('does not duplicate a forced skill that DNA filtering already kept', () => {
    const task = makeLightTask({
      forceSkills: ['documentation-writer'],
      routingMeta: { routingVersion: 'v2', taskDNA: makeDocDNA() },
    });
    const skillPrompts = [
      { name: 'documentation-writer', content: 'A skill for writing documentation and guides.' },
    ];

    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);

    const occurrences = prompt.split('--- documentation-writer ---').length - 1;
    expect(occurrences).toBe(1);
  });

  it('a non-forced skill that scores 0 under DNA filtering is dropped as before (487-023 does not weaken filtering)', () => {
    const task = makeLightTask({
      // typescript-expert is NOT in forceSkills here — only documentation-writer was requested.
      forceSkills: ['documentation-writer'],
      routingMeta: { routingVersion: 'v2', taskDNA: makeDocDNA() },
    });
    const skillPrompts = [
      { name: 'documentation-writer', content: 'A skill for writing documentation and guides.' },
      { name: 'typescript-expert', content: 'A skill for strict-mode generics and module design.' },
    ];

    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);

    expect(prompt).toContain('--- documentation-writer ---');
    expect(prompt).not.toContain('--- typescript-expert ---');
  });
});

describe('routeSprintTasks — forced skill unioned back into assignedSkills (486-018/487-023)', () => {
  const allProviders: ProviderName[] = ['claude', 'codex', 'gemini'];
  const config = {} as unknown as ResolvedConfig;

  it('adds a missing forceSkills id back into assignedSkills after routing', () => {
    const tasks = [makeLightTask({ forceSkills: ['testing-expert'], assignedSkills: [] })];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedSkills).toContain('testing-expert');
  });

  it('preserves a forced skill id alongside an unrelated already-assigned skill (union, not replace)', () => {
    const tasks = [makeLightTask({ forceSkills: ['testing-expert'], assignedSkills: ['other-skill'] })];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedSkills).toEqual(expect.arrayContaining(['other-skill', 'testing-expert']));
  });

  it('does not duplicate a forced skill id already present in assignedSkills', () => {
    const tasks = [makeLightTask({ forceSkills: ['testing-expert'], assignedSkills: ['testing-expert'] })];
    routeSprintTasks(tasks, config, allProviders);
    const occurrences = tasks[0]!.assignedSkills!.filter(id => id === 'testing-expert').length;
    expect(occurrences).toBe(1);
  });

  it('leaves assignedSkills untouched when no forceSkills is declared', () => {
    const tasks = [makeLightTask({ assignedSkills: ['auto-picked'] })];
    routeSprintTasks(tasks, config, allProviders);
    expect(tasks[0]!.assignedSkills).toEqual(['auto-picked']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Part 3 — spawnWorkers honest-NO_GO for missing/inactive forced skills.
// Heavy mock harness mirrors tests/orchestra/spawn-prevention.test.ts
// (proven working for this exact spawnWorkers function under test).
// ═══════════════════════════════════════════════════════════════════

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
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
  resolvePlanTimeoutMs: vi.fn(() => 900_000),
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
  resolveBrainModel: () => 'claude-sonnet-5',
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
  resolveLiveTraceEnabled: () => false,
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

// task-builder.js is NOT mocked here (unlike spawn-prevention.test.ts) — Part 1
// of this suite imports the REAL buildWorkerPrompt to prove forced-skill DNA
// preservation, and vi.mock is hoisted file-wide so a mock here would also
// replace it for those tests. spawnWorkers' own call into the real
// buildWorkerPrompt (Part 3's positive-control case) degrades gracefully:
// ADR loading is best-effort/try-caught, so a non-existent memory.db under the
// fake projectRoot is harmless.

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

// Configurable per-test: getSkill controls the "inactive" (enabled:false) path.
vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue(new Map()),
    getSkill: vi.fn().mockReturnValue(undefined),
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

// Configurable per-test: resolveSkillPrompts controls the "missing" path
// (a forceSkills id absent from the resolved prompt list).
vi.mock('../../src/orchestra/result-collector.js', () => ({
  resolveAgentPrompt: vi.fn().mockReturnValue(''),
  resolveSkillPrompts: vi.fn().mockResolvedValue([]),
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
  isAdapterProvider: vi.fn().mockReturnValue(false),
  resolveDefaultUsageCli: vi.fn().mockReturnValue(''),
  getDefaultProvider: vi.fn().mockReturnValue('claude'),
  getDefaultProviderName: vi.fn().mockReturnValue('claude'),
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

import { writeFileSync } from 'node:fs';
import { spawnWorkers } from '../../src/orchestra/sprint-controller.js';
import { resolveSkillPrompts } from '../../src/orchestra/result-collector.js';
import { SkillPoolManager } from '../../src/core/skill-pool.js';

const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedResolveSkillPrompts = vi.mocked(resolveSkillPrompts);
const mockedSkillPoolManager = vi.mocked(SkillPoolManager);

function makeSpawnTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-487',
    title: 'Forced skill spawn test',
    description: 'A test task for forced skill honest-NO_GO',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'testing',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'passes', noGoCriteria: 'fails', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    budget: { maxTurns: 1 },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      taskKind: 'code-development',
      resolvedProvider: 'claude',
      executionCostClass: 'remote',
      profileRef: 'tests.orchestra.forced-skill-lineage-wire',
      policyDigest: '8'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
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
    name: 'mock',
    liveUsageBudgetSupport: 'measured-stream',
    executionLandingCapability: 'cooperative-landing',
    spawn: vi.fn(),
    kill: vi.fn(),
    list: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
  };
}

function findResultWrite(taskId: string): Record<string, unknown> | undefined {
  const call = mockedWriteFileSync.mock.calls.find(
    (c) => typeof c[0] === 'string' && (c[0] as string).endsWith(`task-${taskId}.result`),
  );
  return call ? JSON.parse(call[1] as string) : undefined;
}

describe('spawnWorkers — forced skill honest NO_GO (487-023 FORCED-SKILL-LINEAGE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveSkillPrompts.mockResolvedValue([]);
    mockedSkillPoolManager.mockImplementation(() => ({
      loadSkills: vi.fn().mockReturnValue(new Map()),
      getSkill: vi.fn().mockReturnValue(undefined),
    }) as unknown as InstanceType<typeof SkillPoolManager>);
  });

  it('writes a typed NO_GO and skips spawn when a forced skill failed to resolve (missing)', async () => {
    mockedResolveSkillPrompts.mockResolvedValue([]); // forced skill never resolved

    const task = makeSpawnTask({ forceSkills: ['typescript-expert'], assignedSkills: ['typescript-expert'] });
    const sprint = makeSprint([task]);
    const config = makeConfig();
    const mockBackend = makeMockBackend();

    await spawnWorkers('/tmp/test-project', sprint, config, { spawnBackend: mockBackend });

    expect(mockBackend.spawn).not.toHaveBeenCalled();
    expect(task.status).toBe(TaskStatus.NO_GO);

    const result = findResultWrite('test-487');
    expect(result).toBeDefined();
    expect(result!.selfAssessment).toBe('NO_GO');
    expect(result!.notes as string).toContain('typescript-expert');
    expect(result!.notes as string).toContain('SKILL.md');
  });

  it('writes a typed NO_GO and skips spawn when a forced skill is administratively disabled (inactive)', async () => {
    // Forced skill's SKILL.md content resolved fine...
    mockedResolveSkillPrompts.mockResolvedValue([{ name: 'testing-expert', content: 'Testing rules' }]);
    // ...but the pool marks it enabled:false.
    mockedSkillPoolManager.mockImplementation(() => ({
      loadSkills: vi.fn().mockReturnValue(new Map()),
      getSkill: vi.fn().mockImplementation((id: string) =>
        id === 'testing-expert' ? { id, enabled: false } : undefined),
    }) as unknown as InstanceType<typeof SkillPoolManager>);

    const task = makeSpawnTask({ forceSkills: ['testing-expert'], assignedSkills: ['testing-expert'] });
    const sprint = makeSprint([task]);
    const config = makeConfig();
    const mockBackend = makeMockBackend();

    await spawnWorkers('/tmp/test-project', sprint, config, { spawnBackend: mockBackend });

    expect(mockBackend.spawn).not.toHaveBeenCalled();
    expect(task.status).toBe(TaskStatus.NO_GO);

    const result = findResultWrite('test-487');
    expect(result).toBeDefined();
    expect(result!.selfAssessment).toBe('NO_GO');
    expect(result!.notes as string).toContain('testing-expert');
    expect(result!.notes as string).toContain('disabled');
  });

  it('spawns normally when the forced skill resolves and is active (positive control)', async () => {
    mockedResolveSkillPrompts.mockResolvedValue([{ name: 'testing-expert', content: 'Testing rules' }]);
    mockedSkillPoolManager.mockImplementation(() => ({
      loadSkills: vi.fn().mockReturnValue(new Map()),
      getSkill: vi.fn().mockImplementation((id: string) =>
        id === 'testing-expert' ? { id, enabled: true } : undefined),
    }) as unknown as InstanceType<typeof SkillPoolManager>);

    const task = makeSpawnTask({ forceSkills: ['testing-expert'], assignedSkills: ['testing-expert'] });
    const sprint = makeSprint([task]);
    const config = makeConfig();
    const mockBackend = makeMockBackend();

    await spawnWorkers('/tmp/test-project', sprint, config, { spawnBackend: mockBackend });

    expect(mockBackend.spawn).toHaveBeenCalledTimes(1);
    expect(task.status).not.toBe(TaskStatus.NO_GO);
    expect(findResultWrite('test-487')).toBeUndefined();
  });

  it('does not honest-fail a task with no forceSkills even if assignedSkills fails to resolve', async () => {
    mockedResolveSkillPrompts.mockResolvedValue([]); // nothing resolved, but nothing was forced either

    const task = makeSpawnTask({ assignedSkills: ['auto-picked-but-unreadable'] });
    const sprint = makeSprint([task]);
    const config = makeConfig();
    const mockBackend = makeMockBackend();

    await spawnWorkers('/tmp/test-project', sprint, config, { spawnBackend: mockBackend });

    expect(mockBackend.spawn).toHaveBeenCalledTimes(1);
    expect(task.status).not.toBe(TaskStatus.NO_GO);
  });
});
