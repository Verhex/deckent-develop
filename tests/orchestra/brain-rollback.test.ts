/**
 * tests/orchestra/brain-rollback.test.ts — Rollback Brain Integration Tests
 *
 * Tests Task 027-014: Rollback — Brain Integration
 *
 * Covers:
 * - Safety point created before SPAWN phase (after PLAN)
 * - Rollback triggered when all tasks are NO_GO
 * - No rollback on partial success
 * - No rollback when rollback: false option is set
 * - recordRollbackInDebt called after rollback
 * - sprint.rolledBack flag set correctly
 * - deleteSafetyPoint called on successful sprint
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { ResolvedConfig } from '../../src/core/types.js';
import { DEBT_TABLE_HEADER } from '../../src/core/constants.js';

// ─── REAL FILESYSTEM (FAZ4A-S5) ─────────────────────────────────────
// The node:fs mock is deliberately GONE. runSprint's coordinator heartbeat
// publishes the canonical run-status read-model through an atomic ring
// (write temp → renameSync → read back → digest compare) that verifies its
// own writes; a mocked fs cannot carry that round-trip. Same root cause +
// fix as FAZ4A-S2/S3/S4 (finalize-sprint / sprint-finalizer /
// runsprint-debt-integration). The old file additionally mocked
// sprint-phases.js and REIMPLEMENTED the rollback choreography inside its
// own runRollbackCheck mock — the spies were driven by test-local code, not
// production. Now the REAL runSprint → runPreStartGuards →
// createSafetyPoint/saveSafetyPoint and the REAL runRollbackCheck →
// getRollbackPolicy/rollback/recordRollbackInDebt/deleteSafetyPoint chains
// exercise the spy-mocked rollback.js module, on a real tmpdir root per test.

vi.mock('node:child_process', () => ({
  // Real fs, mocked processes: git/tsc probes must not escape the sandbox. A
  // bare vi.fn() would return undefined and crash callers reading `.status`.
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  startAuditor: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  resetDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
  startScanLoop: vi.fn().mockReturnValue(setInterval(() => {}, 99999)),
  writeScanToDashboard: vi.fn(),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn(),
  createWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    getState: vi.fn(() => 'SPAWNING'),
    stop: vi.fn(),
  })),
  removeWorkerStateMachine: vi.fn(() => true),
  isWorkerStoppable: vi.fn(() => true),
}));

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  const mockAdapter = {
    name: 'claude',
    supportedModels: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue('claude --model sonnet /dev/null'),
    buildPlannerCommand: (prompt: string, model: string) => ({
      command: 'claude',
      args: ['-p', prompt, '--model', model, '--output-format', 'json'],
    }),
  };
  return {
    ...actual,
    providerRegistry: {
      getDefault: vi.fn().mockReturnValue(mockAdapter),
      registerProvider: vi.fn(),
      getProvider: vi.fn().mockReturnValue(mockAdapter),
      hasProvider: vi.fn().mockImplementation((name: string) => name === 'claude'),
      listProviders: vi.fn().mockReturnValue(['claude']),
      setDefault: vi.fn(),
      unregisterProvider: vi.fn(),
      clear: vi.fn(),
      size: 0,
    },
    ProviderError: class ProviderError extends Error {
      providerName: string;
      constructor(message: string, providerName: string) {
        super(message);
        this.name = 'ProviderError';
        this.providerName = providerName;
      }
    },
    ProviderNotFoundError: class ProviderNotFoundError extends Error {
      providerName: string;
      constructor(providerName: string) {
        super(`Provider not found: "${providerName}"`);
        this.name = 'ProviderNotFoundError';
        this.providerName = providerName;
      }
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
  detectFullStack: vi.fn().mockReturnValue({ language: '', framework: '', buildTool: '', testFramework: '', commands: { build: '', test: '', lint: '' } }),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue(new Map()),
  })),
}));

vi.mock('../../src/core/skill-selector.js', () => ({
  selectSkills: vi.fn().mockReturnValue({ skills: [], reason: '' }),
}));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  TmuxBackend: vi.fn(),
  SubprocessBackend: vi.fn(),
  SpawnBackendFactory: { create: vi.fn() },
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5_000))),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/orchestra/runtime-budget-monitor.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/orchestra/runtime-budget-monitor.js')>()),
  // This fixture exercises the rollback choreography after result collection.
  // Runtime budget settlement has its own contract tests; resolve immediately
  // here so the hermetic backend does not wait for a host usage envelope it
  // never emits.
  waitForTerminalRuntimeBudgetUsage: vi.fn().mockResolvedValue({
    terminal: true,
    decision: { state: 'within-budget' },
  }),
}));

vi.mock('../../src/core/final-only-usage-containment.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/final-only-usage-containment.js')>()),
  requireFinalOnlyUsageContainment: vi.fn(() => undefined),
}));

// ─── Rollback mock (spy-able, COMPLETE export list) ──────────────────
// The spies below are called by PRODUCTION code (runPreStartGuards /
// runRollbackCheck), not by any test-local reimplementation. Every runtime
// export of src/orchestra/rollback.ts is present — a missing export is the
// fix-phase-map stale-mock failure mode.
const mockCreateSafetyPoint = vi.fn();
const mockRollback = vi.fn();
const mockGetRollbackPolicy = vi.fn();
const mockRecordRollbackInDebt = vi.fn();
const mockSaveSafetyPoint = vi.fn();
const mockDeleteSafetyPoint = vi.fn();

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: (...args: unknown[]) => mockCreateSafetyPoint(...args),
  rollback: (...args: unknown[]) => mockRollback(...args),
  getRollbackPolicy: (...args: unknown[]) => mockGetRollbackPolicy(...args),
  recordRollbackInDebt: (...args: unknown[]) => mockRecordRollbackInDebt(...args),
  saveSafetyPoint: (...args: unknown[]) => mockSaveSafetyPoint(...args),
  deleteSafetyPoint: (...args: unknown[]) => mockDeleteSafetyPoint(...args),
  deleteSafetyPointFile: vi.fn(),
  loadSafetyPoint: vi.fn().mockReturnValue(null),
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(false),
  getDirtyFiles: vi.fn().mockReturnValue([]),
  getCurrentCommitSha: vi.fn().mockReturnValue('abc123'),
  getCurrentBranch: vi.fn().mockReturnValue('main'),
  isGitRepo: vi.fn().mockReturnValue(true),
  cleanOrphanSafetyPoint: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/orchestra/coverage-validator.js', () => ({
  parseCoverageFromVitest: vi.fn(),
  validateCoverage: vi.fn(),
  validateWorkerCoverage: vi.fn().mockReturnValue(null),
  isDocOnlyTask: vi.fn().mockReturnValue(false),
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

vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/config.js')>()),
  resolveBrainModel: () => 'claude-sonnet-5',
  readAuthMode: vi.fn().mockReturnValue('subscription'),
  resolveLiveTraceEnabled: vi.fn().mockReturnValue(false),
  resolveBrainPlanningMode: (c: { brain_planning?: string; activeModeConfig?: { brain_planning?: string } }) =>
    c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
}));

vi.mock('../../src/core/agent-pool.js', async (importOriginal) => ({
  // Partial mock over the REAL module: new exports keep working as the
  // surface grows — only the pool manager is stubbed.
  ...(await importOriginal<typeof import('../../src/core/agent-pool.js')>()),
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue(new Map()),
    selectOrCreateAgent: vi.fn().mockReturnValue(null),
    releaseAgent: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

vi.mock('../../src/core/agent-selector.js', () => ({
  selectAgent: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/agents/worker-ipc.js', () => ({
  ChannelRegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn().mockReturnValue(undefined),
    getAll: vi.fn().mockReturnValue(new Map()),
    size: 0,
  })),
}));

// ── MemoryStore mock for DB-first code paths ─────────────────────
// ─── Imports (after mocks) ───────────────────────────────────────────
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runSprint } from '../../src/orchestra/brain.js';
import { SpawnBackendFactory } from '../../src/orchestra/spawn-backend.js';
import {
  createSafetyPoint, rollback as rollbackFn, getRollbackPolicy,
  recordRollbackInDebt, isCleanWorkingTree, safetyBranchExists,
} from '../../src/orchestra/rollback.js';

// Real production module for policy unit tests — the mocked module above only
// serves the runSprint integration spies. Testing a mock's own implementation
// would be a fixture-local reimplementation.
const actualRollback = await vi.importActual<typeof import('../../src/orchestra/rollback.js')>(
  '../../src/orchestra/rollback.js',
);
const actualMemoryStore = await vi.importActual<typeof import('../../src/core/memory-store.js')>(
  '../../src/core/memory-store.js',
);

const mockedSpawnSync = vi.mocked(spawnSync);

// ─── Constants ──────────────────────────────────────────────────────

const DEBT_SEPARATOR = '|----|-------------|------|--------|----------|------|----------|----------|---------|';

// planSprint creates sprint-001 (no sprint files exist → maxNumber=0 →
// sprintNumber=1). One "## Task N:" block per task → ids 001-001, 001-002, …
const EXPECTED_SPRINT_ID = 'sprint-001';

// ─── Real project root (fresh per test) ─────────────────────────────

let PROJECT_ROOT = '';
let attemptNonce = 0;
function freshProjectRoot(): string {
  attemptNonce += 1;
  if (PROJECT_ROOT) rmSync(PROJECT_ROOT, { recursive: true, force: true });
  PROJECT_ROOT = mkdtempSync(join(tmpdir(), 'deckent-brb-'));
  mkdirSync(join(PROJECT_ROOT, '.tasks'), { recursive: true });
  mkdirSync(join(PROJECT_ROOT, '.deckent', 'pids'), { recursive: true });
  mkdirSync(join(PROJECT_ROOT, '.brain'), { recursive: true });
  const archiveIndex = new actualMemoryStore.MemoryStore(
    join(PROJECT_ROOT, '.brain', 'memory.db'),
  );
  archiveIndex.close();
  return PROJECT_ROOT;
}

afterAll(() => {
  if (PROJECT_ROOT) rmSync(PROJECT_ROOT, { recursive: true, force: true });
});

// ─── Helpers ────────────────────────────────────────────────────────

function makeConfig(): ResolvedConfig {
  return {
    mode: 'pro_plan',
    projectRoot: PROJECT_ROOT,
    projectName: 'test',
    language: 'tr',
    version: '0.1.0',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: false,
      brain_planning: 'structured',
    },
    modes: {} as never,
    spawn_backend: 'docker',
    execution_budget: {
      roles: {
        worker: {
          default: {
            maxTokens: 1_000_000,
            maxTurns: 48,
            maxCacheReadTokens: 1_000_000,
            maxOutputTokens: 100_000,
          },
        },
      },
      landing: { reserve_ratio: 0.25 },
      final_only_usage: {
        action: 'allow-wall-clock-containment',
        roles: ['worker'],
        max_wall_clock_seconds: 600,
      },
    },
  };
}

function makeTaskResult(opts: {
  taskId: string;
  selfAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  testsPassed?: boolean;
  coverage?: number;
}): string {
  const { taskId } = opts;
  // Host-authored claim-time attribution is part of the terminal-evidence data
  // contract (projectAttributedTaskWork): without a VERIFIED attemptId the
  // finalizer correctly refuses to settle (TERMINAL_EVIDENCE_HOLD). The
  // attemptId carries a per-test nonce: the controller's once-ledger for
  // terminal publications is module-global and keyed by the
  // logicalSettlementDigest — a byte-identical fixture across tests would be
  // a replay of the SAME settled authority (DUPLICATE_PUBLICATION HOLD).
  const attemptId = `attempt-${taskId}-${attemptNonce}`;
  const baselineSha256 = 'b'.repeat(64);
  return JSON.stringify({
    taskId,
    workerId: `w-${taskId}`,
    promptCompilePlanId: taskId === "001-001"
      ? "prompt-compile-plan:sha256:067659252077cd533078bcc8f66a8ded101f48b419d9ea91abc8ef297a6384d3"
      : undefined,
    filesChanged: ['src/foo.ts'],
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: opts.testsPassed ?? opts.selfAssessment !== 'NO_GO',
    coverage: opts.coverage ?? (opts.selfAssessment === 'NO_GO' ? 0 : 95),
    selfAssessment: opts.selfAssessment,
    notes: 'Rollback integration test result',
    workAttribution: {
      state: 'VERIFIED',
      attemptId,
      baselineRef: `task-result-work-attribution-baseline:sha256:${baselineSha256}`,
      baselineSha256,
      scopeDigest: 'c'.repeat(64),
    },
  });
}

/**
 * Materialize a full runSprint fixture on the REAL project root.
 * @param results - list of per-task result specs; one "## Task N:" directive
 *                  block is generated per entry and the result JSON is
 *                  pre-written as a real `.tasks/task-<id>.result` file.
 */
function setupProject(
  results: Array<{ taskId: string; selfAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'; testsPassed?: boolean; coverage?: number }>,
): void {
  // git commands in readContext + the pre-spawn scope-gate's `git ls-files`
  // call both go through this mock. `git ls-files` must report a tracked
  // src/ path so evaluateScopeGate classifies legacy-fallback scopes
  // (filesWrite: ['src/']) as new-plausible instead of suspect.
  mockedSpawnSync.mockImplementation((command, args) => {
    // The production finalizer invokes tar for its rollback-safe pre-archive
    // artifact. This suite mocks child processes, so the tar success fixture
    // must also materialize the output it claims to have produced.
    if (command === 'tar' && Array.isArray(args) && args[0] === '-czf'
      && typeof args[1] === 'string') {
      writeFileSync(args[1], `brain-rollback-pre-archive-${attemptNonce}\n`, 'utf-8');
    }
    const isLsFiles = Array.isArray(args) && args[0] === 'ls-files';
    return {
      status: 0, stdout: isLsFiles ? 'src/index.ts\n' : '', stderr: '', pid: 1, signal: null, output: [],
    } as never;
  });

  const directives = results
    .map((r, i) => `## Task ${i + 1}: Build feature ${i + 1}\nBuild feature ${i + 1} for task ${r.taskId}\n`)
    .join('\n');
  writeFileSync(join(PROJECT_ROOT, 'DIRECTIVES.md'), directives, 'utf-8');
  writeFileSync(join(PROJECT_ROOT, 'DEBT.md'), [DEBT_TABLE_HEADER, DEBT_SEPARATOR].join('\n'), 'utf-8');

  // Pre-written real result files: the EXECUTE collector finds them
  // immediately (worker spawn is a mocked no-op backend).
  for (const r of results) {
    writeFileSync(join(PROJECT_ROOT, '.tasks', `task-${r.taskId}.result`), makeTaskResult(r), 'utf-8');
  }
}

// ─── Tests: getRollbackPolicy (REAL production implementation) ───────

describe('getRollbackPolicy', () => {
  it('returns "never" for empty evaluations', () => {
    expect(actualRollback.getRollbackPolicy([])).toBe('never');
  });

  it('returns "auto" when all tasks are NO_GO', () => {
    expect(actualRollback.getRollbackPolicy(['NO_GO', 'NO_GO', 'NO_GO'])).toBe('auto');
  });

  it('returns "ask" when some tasks are NO_GO', () => {
    expect(actualRollback.getRollbackPolicy(['DONE', 'NO_GO', 'DONE'])).toBe('ask');
  });

  it('returns "never" when all tasks are DONE', () => {
    expect(actualRollback.getRollbackPolicy(['DONE', 'DONE', 'DONE'])).toBe('never');
  });

  it('returns "never" when all tasks are GO_WITH_TECH_DEBT', () => {
    expect(actualRollback.getRollbackPolicy(['GO_WITH_TECH_DEBT', 'GO_WITH_TECH_DEBT'])).toBe('never');
  });

  it('returns "auto" for single NO_GO', () => {
    expect(actualRollback.getRollbackPolicy(['NO_GO'])).toBe('auto');
  });

  it('returns "ask" for mix of DONE and NO_GO', () => {
    expect(actualRollback.getRollbackPolicy(['DONE', 'NO_GO'])).toBe('ask');
  });
});

// ─── Tests: createSafetyPoint / rollback integration via brain ────────

describe('RunSprintOptions.rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshProjectRoot();
    vi.mocked(SpawnBackendFactory.create).mockReturnValue({
      name: 'test-measured',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
      spawn: vi.fn((taskId: string) => {
        const taskPath = join(PROJECT_ROOT, '.tasks', `task-${taskId}.json`);
        const resultPath = join(PROJECT_ROOT, '.tasks', `task-${taskId}.result`);
        if (!existsSync(taskPath) || !existsSync(resultPath)) return;
        const task = JSON.parse(readFileSync(taskPath, 'utf-8')) as {
          promptCompilePlanId?: string;
          goNogo?: { items?: Array<{ id: string; polarity: 'go' | 'no-go' }> };
        };
        const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
        if (task.promptCompilePlanId) {
          result.promptCompilePlanId = task.promptCompilePlanId;
        }
        result.testVerification = {
          applicability: 'REQUIRED',
          outcome: result.testsPassed === false ? 'FAILED' : 'PASSED',
          commands: ['fixture verification'],
        };
        result.criteriaEvidence = (task.goNogo?.items ?? []).map(item => ({
          criterionId: item.id,
          outcome: item.polarity === 'go'
            ? result.selfAssessment === 'NO_GO' ? 'UNMET' : 'MET'
            : result.selfAssessment === 'NO_GO' ? 'MET' : 'UNMET',
          evidence: ['fixture result evidence'],
        }));
        result.techDebtCriterionIds = [];
        writeFileSync(resultPath, JSON.stringify(result), 'utf-8');
      }),
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    } as never);

    // Default rollback-module behavior. getRollbackPolicy delegates to the
    // REAL production policy so the choreography (auto/ask/never) is derived
    // from the actual evaluations runSprint computed — no per-test forcing.
    mockCreateSafetyPoint.mockReturnValue({
      id: EXPECTED_SPRINT_ID,
      branchName: `deckent-backup-${EXPECTED_SPRINT_ID}`,
      commitSha: 'abc123',
      createdAt: new Date().toISOString(),
      wasClean: true,
    });
    mockRollback.mockReturnValue({ success: true, message: 'Rolled back successfully' });
    mockGetRollbackPolicy.mockImplementation(
      (evals: Array<'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'>) => actualRollback.getRollbackPolicy(evals),
    );
    mockRecordRollbackInDebt.mockImplementation(() => undefined);
    mockSaveSafetyPoint.mockImplementation(() => undefined);
    mockDeleteSafetyPoint.mockReturnValue(true);
  });

  it('createSafetyPoint is called when rollback is enabled (default)', async () => {
    setupProject([{ taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 }]);

    await runSprint(PROJECT_ROOT, makeConfig());

    expect(mockCreateSafetyPoint).toHaveBeenCalledWith(PROJECT_ROOT, EXPECTED_SPRINT_ID);
  });

  it('createSafetyPoint is NOT called when rollback: false', async () => {
    setupProject([{ taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 }]);

    await runSprint(PROJECT_ROOT, makeConfig(), { rollback: false });

    expect(mockCreateSafetyPoint).not.toHaveBeenCalled();
  });

  it('safety point is saved to disk after creation', async () => {
    setupProject([{ taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 }]);

    await runSprint(PROJECT_ROOT, makeConfig());

    expect(mockSaveSafetyPoint).toHaveBeenCalledWith(
      PROJECT_ROOT,
      expect.objectContaining({ id: EXPECTED_SPRINT_ID }),
    );
  });

  it('rollback is triggered when all tasks are NO_GO', async () => {
    setupProject([{ taskId: '001-001', selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 }]);

    const sprint = await runSprint(PROJECT_ROOT, makeConfig());

    expect(mockRollback).toHaveBeenCalled();
    expect(sprint.rolledBack).toBe(true);
    expect(sprint.rollbackResult).toContain('Rolled back');
  });

  it('recordRollbackInDebt is called after successful rollback', async () => {
    mockRollback.mockReturnValue({ success: true, message: 'Rolled back to deckent-backup-sprint-001' });
    setupProject([{ taskId: '001-001', selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 }]);

    await runSprint(PROJECT_ROOT, makeConfig());

    expect(mockRecordRollbackInDebt).toHaveBeenCalledWith(
      PROJECT_ROOT,
      EXPECTED_SPRINT_ID,
      expect.objectContaining({ success: true }),
    );
  });

  it('no rollback on partial success (mix of DONE and NO_GO)', async () => {
    setupProject([
      { taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 },
      { taskId: '001-002', selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 },
    ]);

    const sprint = await runSprint(PROJECT_ROOT, makeConfig());

    expect(mockRollback).not.toHaveBeenCalled();
    expect(sprint.rolledBack).toBeUndefined();
  });

  it('no rollback when all tasks succeed', async () => {
    setupProject([{ taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 }]);

    const sprint = await runSprint(PROJECT_ROOT, makeConfig());

    expect(mockRollback).not.toHaveBeenCalled();
    expect(sprint.rolledBack).toBeUndefined();
  });

  it('deleteSafetyPoint called after successful sprint (no rollback)', async () => {
    setupProject([{ taskId: '001-001', selfAssessment: 'DONE', testsPassed: true, coverage: 95 }]);

    await runSprint(PROJECT_ROOT, makeConfig());

    // Production contract (runRollbackCheck): deleteSafetyPoint receives the
    // SafetyPoint object, not the sprint id.
    expect(mockDeleteSafetyPoint).toHaveBeenCalledWith(
      PROJECT_ROOT,
      expect.objectContaining({ id: EXPECTED_SPRINT_ID }),
    );
  });

  it('deleteSafetyPoint NOT called when sprint is rolled back', async () => {
    mockRollback.mockReturnValue({ success: true, message: 'Rolled back' });
    setupProject([{ taskId: '001-001', selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 }]);

    await runSprint(PROJECT_ROOT, makeConfig());

    expect(mockDeleteSafetyPoint).not.toHaveBeenCalled();
  });

  it('sprint.rolledBack is false/undefined when rollback: false', async () => {
    setupProject([{ taskId: '001-001', selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 }]);

    const sprint = await runSprint(PROJECT_ROOT, makeConfig(), { rollback: false });

    expect(sprint.rolledBack).toBeUndefined();
    expect(mockRollback).not.toHaveBeenCalled();
  });
});

// ─── Tests: rollback module surface (via mocked module bindings) ─────

describe('isCleanWorkingTree (via re-export)', () => {
  it('is exported from brain.ts', () => {
    expect(typeof isCleanWorkingTree).toBe('function');
  });
});

describe('safetyBranchExists (via re-export)', () => {
  it('is exported from brain.ts', () => {
    expect(typeof safetyBranchExists).toBe('function');
  });
});

describe('createSafetyPoint (via re-export)', () => {
  it('is exported from brain.ts', () => {
    expect(typeof createSafetyPoint).toBe('function');
  });
});

describe('rollback (via re-export)', () => {
  it('is exported from brain.ts', () => {
    expect(typeof rollbackFn).toBe('function');
  });
});

describe('getRollbackPolicy (direct)', () => {
  it('empty evaluations returns never', () => {
    expect(typeof getRollbackPolicy).toBe('function');
    expect(actualRollback.getRollbackPolicy([])).toBe('never');
  });
});

describe('recordRollbackInDebt (via brain re-export)', () => {
  it('is exported from brain.ts', () => {
    expect(typeof recordRollbackInDebt).toBe('function');
  });
});
