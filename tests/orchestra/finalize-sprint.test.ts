/**
 * tests/orchestra/finalize-sprint.test.ts
 *
 * Tests for finalizeSprint function and the deckent finalize CLI command builder.
 * Covers: sprint log writing, MEMORY.md update, RETRO.md writing,
 *         PROJECT-IDENTITY.md update, last_sprint_id config update,
 *         decay trigger, afterSprint hooks, idempotency, edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  TaskStatus, TaskEvaluation, SprintPhase,
  SprintStatus,
} from '../../src/core/types.js';
import type { Task, Sprint, SprintMetrics, TaskResult, ResolvedConfig } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

// ─── REAL FILESYSTEM (FAZ4A-S2) ─────────────────────────────────────
// The node:fs mock is deliberately GONE. The finalizer's atomic publication ring
// (write temp → renameSync → read back → digest compare, e.g. run-status-read-model
// PERSIST_FAILED) verifies its own writes; a mocked fs cannot carry that round-trip
// — two recorded mock-layering attempts failed exactly here. Each test gets a real
// scratch project root under tmpdir instead (hermetic, removed in afterEach).

vi.mock('node:child_process', () => ({
  // Real fs, mocked processes: git/tsc probes must not escape the sandbox. A bare
  // vi.fn() would return undefined and crash callers reading `.status`.
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
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
    getNextSprintId: vi.fn().mockReturnValue('sprint-042'),
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
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
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
  buildWorkerPrompt: vi.fn().mockReturnValue('prompt'),
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
  auditBrainBudget: vi.fn().mockReturnValue({ decayableLines: 1000, permanentLines: 200, totalLines: 1200, status: 'OVER' }),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  trimMemoryWithHeader: vi.fn(),
  writeRetrospective: vi.fn(),
  appendRetroSection: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({
    totalTasks: 3, completedTasks: 2, techDebtTasks: 1, noGoTasks: 0,
    durationMs: 60000, coveragePercent: 90, noGoRate: 0, newDebtCount: 1,
    resolvedDebtCount: 0, totalOpenDebt: 2, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  }),
  updateProjectDocs: vi.fn(),
}));

vi.mock('../../src/orchestra/coverage-validator.js', () => ({
  parseCoverageFromVitest: vi.fn(),
  validateCoverage: vi.fn(),
  validateWorkerCoverage: vi.fn().mockReturnValue(null),
  isDocOnlyTask: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn().mockReturnValue({ id: 'sp-001', sprintId: 'sprint-042', branchName: 'backup', createdAt: new Date().toISOString() }),
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
      register: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    },
  };
});

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  clearHooks: vi.fn(),
  loadPluginHooks: vi.fn().mockResolvedValue(0),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runCiRegressionCheck: vi.fn().mockReturnValue({ regressionDetected: false, tscPassed: true, targetedTestsPassed: true, targetedTestFiles: [], alerts: [], testCountDelta: 0 }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true, tscPassed: true, testsPassed: true, testCount: 0, testPassed: 0, testFailed: 0, coverage: 0, baselineSaved: false }),
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
    loadAgents: vi.fn().mockReturnValue([]),
    getAgent: vi.fn().mockReturnValue(undefined),
    updateAgentStats: vi.fn(),
  })),
}));

// F5 wire (B11): spy on prompt-version recording so the faithful test can assert
// finalizeSprint records a use per task agent. Hoisted so the mock factory can
// reference it. Pre-fix the call did not exist → spy never called → test RED.
const { recordVersionUseSpy } = vi.hoisted(() => ({ recordVersionUseSpy: vi.fn() }));
vi.mock('../../src/agents/prompt-version.js', () => ({
  PromptVersionManager: vi.fn().mockImplementation(() => ({
    recordCurrentVersionUse: recordVersionUseSpy,
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

// ─── Imports (after mocks) ───────────────────────────────────────────

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeSprint } from '../../src/orchestra/sprint-controller.js';
import type { FinalizeSprintOptions } from '../../src/orchestra/sprint-controller.js';
import { writeRetrospective, writeSprintLog, calculateMetrics, updateProjectDocs } from '../../src/orchestra/sprint-reporter.js';
import { runDecay } from '../../src/orchestra/debt-manager.js';
import { updateLastSprintId } from '../../src/core/utils.js';
import { runHooks } from '../../src/core/plugin-hooks.js';

// ─── Test Helpers ────────────────────────────────────────────────────

// Real per-file scratch root — assigned fresh in each describe's beforeEach.
let PROJECT_ROOT = '';
const freshProjectRoot = (): string => {
  if (PROJECT_ROOT) rmSync(PROJECT_ROOT, { recursive: true, force: true });
  PROJECT_ROOT = mkdtempSync(join(tmpdir(), 'deckent-finalize-'));
  return PROJECT_ROOT;
};
afterAll(() => {
  if (PROJECT_ROOT) rmSync(PROJECT_ROOT, { recursive: true, force: true });
});

function createTestTask(id: string, title: string = `Task ${id}`): Task {
  return {
    id,
    title,
    description: `Description for ${title}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-042',
    createdAt: new Date().toISOString(),
  };
}

function createTestResult(taskId: string, passed: boolean = true, coverage: number = 95): TaskResult {
  // Host-authored claim-time attribution is part of the terminal-evidence data
  // contract (projectAttributedTaskWork): without a VERIFIED attemptId the
  // finalizer correctly refuses to settle (TERMINAL_EVIDENCE_HOLD). The old
  // fixture pre-dated that contract — the production behavior was right and the
  // fixture was stale. Shape mirrors sprint-finalizer-terminal-wire.test.ts.
  const attemptId = `attempt-${taskId}`;
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/test.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: passed,
    coverage,
    selfAssessment: passed ? 'DONE' : 'NO_GO',
    notes: 'test result',
    workAttribution: {
      state: 'VERIFIED' as const,
      attemptId,
      baselineRef: `baseline:${attemptId}`,
      scopeDigest: attemptId.padEnd(64, '0').slice(0, 64),
    },
  };
}

function createTestSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-042',
    number: 42,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    startedAt: new Date(Date.now() - 60000).toISOString(),
    completedAt: new Date().toISOString(),
  };
}

const defaultMetrics: SprintMetrics = {
  totalTasks: 3,
  completedTasks: 2,
  techDebtTasks: 1,
  noGoTasks: 0,
  durationMs: 60000,
  coveragePercent: 90,
  noGoRate: 0,
  newDebtCount: 1,
  resolvedDebtCount: 0,
  totalOpenDebt: 2,
  boundaryViolations: 0,
  crossAssignments: 0,
  contextLinesUsed: 0,
  unevaluatedTasks: 0,
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('finalizeSprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calculateMetrics).mockReturnValue({ ...defaultMetrics });
    freshProjectRoot();
  });

  it('should return calculated metrics', async () => {
    const tasks = [createTestTask('042-001'), createTestTask('042-002')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map<string, TaskEvaluation>([
      ['042-001', TaskEvaluation.DONE],
      ['042-002', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    const results = [createTestResult('042-001'), createTestResult('042-002', true, 80)];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(metrics).toBeDefined();
    // Terminal truth OVERRIDES calculateMetrics for logical fields
    // (metrics = { ...baseMetrics, ...terminalTruth.logicalMetrics }): the mocked
    // totalTasks:3 fantasy loses to the fixture's two real logical tasks. The old
    // assertion pinned the mock, i.e. tested nothing about the sprint.
    expect(metrics.totalTasks).toBe(2);
    // calculateMetrics now receives the LOGICAL projections (rebuilt sprint/eval/
    // result views + DB-first debt), not the raw caller arguments.
    expect(vi.mocked(calculateMetrics)).toHaveBeenCalledTimes(1);
  });

  it('should set sprint.metrics', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(sprint.metrics).toBeDefined();
    // Truth-derived: one logical task in the fixture (mock value 3 is overridden).
    expect(sprint.metrics?.totalTasks).toBe(1);
  });

  it('should call writeSprintLog', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(writeSprintLog)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      sprint,
      expect.objectContaining({ totalTasks: 1 }),
      evaluations,
    );
  });

  it('should call writeRetrospective (updates MEMORY.md and RETRO.md)', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(writeRetrospective)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      sprint,
      evaluations,
      expect.objectContaining({ totalTasks: 1 }),
      undefined, // agentMap
      undefined, // skillMap
      results,
      // Sprint 192 Task 192-005: createIfMissing opts forwarded by finalizeSprint
      // to defend against the chronic Sprint 167+ DB-gap on fresh projects.
      { createIfMissing: true },
    );
  });

  it('should call updateLastSprintId', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(updateLastSprintId)).toHaveBeenCalledWith(PROJECT_ROOT, 'sprint-042');
  });

  it('should call runDecay', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(runDecay)).toHaveBeenCalledWith(PROJECT_ROOT, 'sprint-042', { force: true, memoryBudget: 900 });
  });

  it('should skip decay when skipDecay option is true', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, { skipDecay: true });

    expect(vi.mocked(runDecay)).not.toHaveBeenCalled();
  });

  it('should run afterSprint hooks', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(runHooks)).toHaveBeenCalledWith('afterSprint', expect.objectContaining({
      hook: 'afterSprint',
      sprint,
      projectRoot: PROJECT_ROOT,
    }));
  });

  it('should skip hooks when skipHooks option is true', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, { skipHooks: true });

    expect(vi.mocked(runHooks)).not.toHaveBeenCalled();
  });

  it('should call updateProjectDocs when config is provided', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];
    const config = { projectRoot: PROJECT_ROOT, projectName: 'test' } as ResolvedConfig;

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, { config });

    expect(vi.mocked(updateProjectDocs)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      expect.objectContaining({ sprint, evaluations }),
      config,
      results,
    );
  });

  it('should NOT call updateProjectDocs when config is not provided', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(vi.mocked(updateProjectDocs)).not.toHaveBeenCalled();
  });

  it('refuses to settle an unevaluated task (fail-closed, was: empty evaluations gracefully)', async () => {
    // Old semantic ("return zero metrics and carry on") is exactly the false-COMPLETE
    // class the 485-490 recovery train eliminated: a task with no evaluation is
    // UNKNOWN evidence, and unknown evidence may never finalize as a completed sprint.
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map<string, TaskEvaluation>();
    const results: TaskResult[] = [];

    await expect(finalizeSprint(PROJECT_ROOT, sprint, evaluations, results))
      .rejects.toThrow(/TERMINAL_EVIDENCE_HOLD/);
    // KNOWN GAP, deliberately not asserted stronger here: the human sprint-log/retro
    // projections are still written BEFORE the terminal-receipt gate throws, so a held
    // finalize leaves a log entry without a receipt. That ordering defect is owned by
    // RECOVERY-BORN-490-SPRINT-LOG-PROJECTION-001 (OPEN) — asserting not-called now
    // would pin this slice to another slice's unfinished contract.
  });

  it('refuses to archive a zero-task sprint (fail-closed, was: empty tasks gracefully)', async () => {
    // cleanupEligibility adds NO_LOGICAL_TASKS → BLOCKED: an empty sprint has no
    // evidence to archive as COMPLETE, so publication is typed-refused instead of
    // minting a hollow terminal receipt.
    const sprint = createTestSprint([]);
    const evaluations = new Map<string, TaskEvaluation>();
    const results: TaskResult[] = [];

    await expect(finalizeSprint(PROJECT_ROOT, sprint, evaluations, results))
      .rejects.toThrow(/TERMINAL_PUBLICATION_ZERO_TASK_HOLD/);
  });

  it('should survive writeSprintLog failure', async () => {
    vi.mocked(writeSprintLog).mockImplementationOnce(() => { throw new Error('disk full'); });
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    // Should not throw
    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    expect(metrics).toBeDefined();
    // Other actions still run
    expect(vi.mocked(writeRetrospective)).toHaveBeenCalled();
  });

  it('should survive writeRetrospective failure', async () => {
    vi.mocked(writeRetrospective).mockImplementationOnce(() => { throw new Error('disk full'); });
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    expect(metrics).toBeDefined();
    expect(vi.mocked(updateLastSprintId)).toHaveBeenCalled();
  });

  it('should survive runDecay failure', async () => {
    vi.mocked(runDecay).mockImplementationOnce(() => { throw new Error('decay error'); });
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    expect(metrics).toBeDefined();
    expect(vi.mocked(runHooks)).toHaveBeenCalled();
  });

  it('should survive afterSprint hook failure', async () => {
    vi.mocked(runHooks).mockRejectedValueOnce(new Error('hook error'));
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    expect(metrics).toBeDefined();
  });

  it('should be idempotent-safe: calling twice does not throw', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics1 = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);
    const metrics2 = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(metrics1).toBeDefined();
    expect(metrics2).toBeDefined();
    // Both should have been called twice (idempotent = safe to call twice)
    expect(vi.mocked(writeSprintLog)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateLastSprintId)).toHaveBeenCalledTimes(2);
  });

  it('refuses plain finalize while a logical task is NO_GO (fail-closed, was: mixed evaluations)', async () => {
    // A settled NO_GO leaves the lineage FAILED → LINEAGE_NOT_COMPLETED blocks the
    // archive boundary. Real runs resolve this via FIX lineage or the owner-gated
    // force-finalize/ABORTED path (sprint-488 canonical receipt) — never via a plain
    // COMPLETE that the old "graceful" expectation encoded.
    const tasks = [
      createTestTask('042-001', 'Feature A'),
      createTestTask('042-002', 'Feature B'),
      createTestTask('042-003', 'Feature C'),
    ];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map<string, TaskEvaluation>([
      ['042-001', TaskEvaluation.DONE],
      ['042-002', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['042-003', TaskEvaluation.NO_GO],
    ]);
    const results = [
      createTestResult('042-001', true, 95),
      createTestResult('042-002', true, 75),
      createTestResult('042-003', false, 0),
    ];

    await expect(finalizeSprint(PROJECT_ROOT, sprint, evaluations, results))
      .rejects.toThrow(/TERMINAL_PUBLICATION_NOT_CLEANUP_CANDIDATE/);
  });

  it('should combine all options correctly', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];
    const config = { projectRoot: PROJECT_ROOT, projectName: 'test' } as ResolvedConfig;

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, {
      skipDecay: true,
      skipHooks: true,
      config,
    });

    expect(vi.mocked(runDecay)).not.toHaveBeenCalled();
    expect(vi.mocked(runHooks)).not.toHaveBeenCalled();
    expect(vi.mocked(updateProjectDocs)).toHaveBeenCalled();
    expect(vi.mocked(writeSprintLog)).toHaveBeenCalled();
    expect(vi.mocked(writeRetrospective)).toHaveBeenCalled();
    expect(vi.mocked(updateLastSprintId)).toHaveBeenCalled();
  });
});

describe('FinalizeSprintOptions type', () => {
  it('should accept empty options object', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    // Should compile and run without error
    const opts: FinalizeSprintOptions = {};
    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, opts);
    expect(metrics).toBeDefined();
  });

  it('should accept undefined options', async () => {
    const tasks = [createTestTask('042-001')];
    const sprint = createTestSprint(tasks);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    const metrics = await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, undefined);
    expect(metrics).toBeDefined();
  });
});

// ─── F5 prompt-version stats wire (B11) ──────────────────────────────
// Faithful regression: finalizeSprint must record a use of each task agent's
// current prompt version (recordCurrentVersionUse) so the F5 analytics see real
// uses/successRate. Pre-fix the call did not exist → recordVersionUseSpy is never
// called → these tests fail.
describe('finalizeSprint — F5 prompt-version stats wire (B11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calculateMetrics).mockReturnValue({ ...defaultMetrics });
    freshProjectRoot();
  });

  it('records a prompt-version use per task agent (V1 routing path)', async () => {
    const task = { ...createTestTask('042-001'), assignedAgent: 'bug-fixer' };
    const sprint = createTestSprint([task]);
    const evaluations = new Map([['042-001', TaskEvaluation.DONE]]);
    const results = [createTestResult('042-001')];

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results);

    expect(recordVersionUseSpy).toHaveBeenCalledWith('bug-fixer', TaskEvaluation.DONE);
  });

  it('records a prompt-version use on the V2 routing path too (dogfood path)', async () => {
    const task = { ...createTestTask('042-002'), assignedAgent: 'api-builder' };
    const sprint = createTestSprint([task]);
    const evaluations = new Map([['042-002', TaskEvaluation.GO_WITH_TECH_DEBT]]);
    const results = [createTestResult('042-002')];
    const config = { projectRoot: PROJECT_ROOT, projectName: 'test', routing_engine: 'v2' } as unknown as ResolvedConfig;

    await finalizeSprint(PROJECT_ROOT, sprint, evaluations, results, { config });

    expect(recordVersionUseSpy).toHaveBeenCalledWith('api-builder', TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('does not record for a DEFERRED task (worker never executed)', async () => {
    // DEFERRED is not a terminal verdict: the attempt stays UNSETTLED and the
    // finalizer holds instead of settling — which also proves the original claim,
    // since a held finalize can never reach the prompt-version stats wire.
    const task = { ...createTestTask('042-003'), assignedAgent: 'bug-fixer' };
    const sprint = createTestSprint([task]);
    const evaluations = new Map([['042-003', TaskEvaluation.DEFERRED]]);
    const results: TaskResult[] = [];

    await expect(finalizeSprint(PROJECT_ROOT, sprint, evaluations, results))
      .rejects.toThrow(/TERMINAL_EVIDENCE_HOLD/);
    expect(recordVersionUseSpy).not.toHaveBeenCalled();
  });
});

// PROD-SPRINT-PREFIX-PAD-001 regression: task ids/files carry the sprint ID's PADDED
// segment ('007-001', 'task-007-001.json') while sprint.number is numeric (7). The old
// `task-${sprint.number}-` prefix never matched below sprint 100, silently blinding
// finalizer attempt-task discovery (runtime-born FIX children invisible on fresh installs).
describe('loadFinalizerAttemptTasks padded-prefix authority', () => {
  it('discovers disk-born FIX tasks for sprints below 100', async () => {
    const { loadFinalizerAttemptTasks } = await import('../../src/orchestra/sprint-finalizer.js');
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const root = mkdtempSync(join(tmpdir(), 'deckent-prefix-pad-'));
    try {
      mkdirSync(join(root, '.tasks'), { recursive: true });
      const fixTask = {
        id: '007-001-fix',
        title: 'fix',
        description: 'runtime-born fix',
        status: 'PENDING',
        sprintId: 'sprint-007',
        fixForTaskId: '007-001',
      };
      writeFileSync(join(root, '.tasks', 'task-007-001-fix.json'), JSON.stringify(fixTask), 'utf-8');

      const attempts = loadFinalizerAttemptTasks(root, {
        id: 'sprint-007',
        number: 7,
        status: 'ACTIVE',
        phase: 'FIX',
        tasks: [{ id: '007-001', title: 'root', status: 'DONE' }],
        workers: [],
      } as never);

      expect(attempts.map(candidate => candidate.id)).toEqual(['007-001', '007-001-fix']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
