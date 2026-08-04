/**
 * Sprint 4 — Task 004-003
 * runSprint Phase 4 debt resolution integration tests.
 *
 * Verifies that after DONE / GO_WITH_TECH_DEBT evaluation in Phase 4,
 * resolveDebt() is invoked and the debt entry is updated with
 * status='resolved' and the correct resolvedInSprintId.
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { DebtPriority } from '../../src/core/types.js';
import type { DebtItem, ResolvedConfig } from '../../src/core/types.js';
import { DEBT_TABLE_HEADER } from '../../src/core/constants.js';

// ─── Module Mocks ───────────────────────────────────────────────────

// ─── REAL FILESYSTEM (FAZ4A-S4) ─────────────────────────────────────
// The node:fs / node:fs/promises mocks are deliberately GONE. runSprint's
// PLAN phase ends in publishCanonicalRunStatusReadModel — an atomic
// publication ring (write temp → renameSync → read back → digest compare)
// that verifies its own writes; a mocked fs cannot carry that round-trip
// (RunStatusReadModelError PERSIST_FAILED). Same root cause + fix as
// FAZ4A-S2/S3 (finalize-sprint / sprint-finalizer / pause-resume). Every
// assertion in this file targets the mocked MemoryStore (upsert calls) or
// the returned Sprint object — no fs call-recording is asserted anywhere,
// so FULL removal (not the hybrid useRealFileSystem passthrough) applies.
// Each test gets a real scratch project root under tmpdir.

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
  // This fixture exercises debt resolution after result collection. Runtime
  // budget settlement has its own contract tests; resolve immediately here so
  // the hermetic backend does not wait for a host usage envelope it never emits.
  waitForTerminalRuntimeBudgetUsage: vi.fn().mockResolvedValue({
    terminal: true,
    decision: { state: 'within-budget' },
  }),
}));

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn().mockReturnValue({ id: 'sp-001', sprintId: 'sprint-001', branchName: 'deckent-backup-sprint-001', createdAt: new Date().toISOString() }),
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

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  readAuthMode: vi.fn().mockReturnValue('subscription'),
  resolveLiveTraceEnabled: vi.fn().mockReturnValue(false),
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
}));

vi.mock('../../src/core/agent-pool.js', async (importOriginal) => ({
  // Partial mock over the REAL module: new exports (getAgentRole, getAgentPrompt,
  // BUILTIN_AGENT_ROLES, ...) keep working as the surface grows — only the pool
  // manager is stubbed for this integration test.
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
const mockMemStore = {
  getById: vi.fn().mockReturnValue(null),
  getByType: vi.fn().mockReturnValue([]),
  insert: vi.fn().mockImplementation((input) => ({ ...input, metadata: JSON.stringify(input.metadata ?? {}), tag_text: (input.tags ?? []).join(' '), status: input.status ?? 'active', priority: input.priority ?? 'normal', sprint_id: input.sprint_id ?? null, sprint_num: input.sprint_num ?? 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })),
  upsert: vi.fn().mockImplementation((input) => ({ ...input, metadata: JSON.stringify(input.metadata ?? {}), tag_text: (input.tags ?? []).join(' '), status: input.status ?? 'active', priority: input.priority ?? 'normal' })),
  softDelete: vi.fn(), totalCount: vi.fn().mockReturnValue(0), countByType: vi.fn(),
  decay: vi.fn(), close: vi.fn(), getRawDb: vi.fn(),
  getRelationsFrom: vi.fn().mockReturnValue([]), getRelationsTo: vi.fn().mockReturnValue([]),
  getTagsForEntry: vi.fn().mockReturnValue([]), getByTags: vi.fn().mockReturnValue([]),
  getHistory: vi.fn().mockReturnValue([]), restore: vi.fn(), getSchemaVersion: vi.fn().mockReturnValue(1),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemStore),
}));


import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runSprint } from '../../src/orchestra/brain.js';
import { SpawnBackendFactory } from '../../src/orchestra/spawn-backend.js';

const mockedSpawnSync = vi.mocked(spawnSync);

// ─── Constants ──────────────────────────────────────────────────────

const DEBT_SEPARATOR = '|----|-------------|------|--------|----------|------|----------|----------|---------|';

// planSprint creates sprint-001 (no sprint files exist → maxNumber=0 → sprintNumber=1)
// Single directive line → one task with id '001-001'
const EXPECTED_SPRINT_ID = 'sprint-001';
const EXPECTED_TASK_ID = '001-001';
const EXPECTED_DEBT_ID = `debt-${EXPECTED_TASK_ID}`;

// ─── Real project root (fresh per test) ─────────────────────────────

let PROJECT_ROOT = '';
let attemptNonce = 0;
function freshProjectRoot(): string {
  attemptNonce += 1;
  if (PROJECT_ROOT) rmSync(PROJECT_ROOT, { recursive: true, force: true });
  PROJECT_ROOT = mkdtempSync(join(tmpdir(), 'deckent-rsd-'));
  mkdirSync(join(PROJECT_ROOT, '.tasks'), { recursive: true });
  mkdirSync(join(PROJECT_ROOT, '.deckent', 'pids'), { recursive: true });
  // memory.db must EXIST so debt-manager's getMemoryStore() opens the (mocked)
  // MemoryStore — the DB-first path all upsert assertions in this file target.
  mkdirSync(join(PROJECT_ROOT, '.brain'), { recursive: true });
  writeFileSync(join(PROJECT_ROOT, '.brain', 'memory.db'), '', 'utf-8');
  return PROJECT_ROOT;
}

afterAll(() => {
  if (PROJECT_ROOT) rmSync(PROJECT_ROOT, { recursive: true, force: true });
});

// ─── Helpers ────────────────────────────────────────────────────────

function makeDebtRow(d: Partial<DebtItem>): string {
  const id = d.id ?? EXPECTED_DEBT_ID;
  const desc = d.description ?? 'Test debt';
  const task = d.originTaskId ?? EXPECTED_TASK_ID;
  const sprint = d.originSprintId ?? 'sprint-000';
  const priority = d.priority ?? DebtPriority.NORMAL;
  const open = d.sprintsOpen ?? 0;
  const resolved = d.resolved ?? false;
  const fixedIn = d.resolvedInSprintId ?? '-';
  const created = d.createdAt ?? '2026-03-17T00:00:00.000Z';
  return `| ${id} | ${desc} | ${task} | ${sprint} | ${priority} | ${open} | ${resolved} | ${fixedIn} | ${created} |`;
}

function makeDebtTable(items: Array<Partial<DebtItem>>): string {
  const rows = items.map(d => makeDebtRow(d));
  return [DEBT_TABLE_HEADER, DEBT_SEPARATOR, ...rows].join('\n');
}

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
      roles: { worker: { default: { maxTurns: 1 } } },
      landing: { reserve_ratio: 0.25 },
    },
  };
}

function makeTaskResult(opts: {
  taskId?: string;
  selfAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  testsPassed?: boolean;
  coverage?: number;
}): string {
  const taskId = opts.taskId ?? EXPECTED_TASK_ID;
  // Host-authored claim-time attribution is part of the terminal-evidence data
  // contract (projectAttributedTaskWork): without a VERIFIED attemptId the
  // finalizer correctly refuses to settle (TERMINAL_EVIDENCE_HOLD). Shape
  // mirrors finalize-sprint.test.ts (FAZ4A-S2 fixture). The attemptId carries a
  // per-test nonce: the controller's once-ledger for terminal publications
  // (commitSprintTerminalHandoff) is module-global and keyed by the
  // logicalSettlementDigest — a byte-identical fixture across tests would be a
  // replay of the SAME settled authority and correctly HOLD as
  // DUPLICATE_PUBLICATION. A fresh attempt per test is the honest model.
  const attemptId = `attempt-${taskId}-${attemptNonce}`;
  return JSON.stringify({
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/foo.ts'],
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: opts.testsPassed ?? opts.selfAssessment !== 'NO_GO',
    coverage: opts.coverage ?? (opts.selfAssessment === 'NO_GO' ? 0 : 95),
    selfAssessment: opts.selfAssessment,
    notes: 'Integration test result',
    workAttribution: {
      state: 'VERIFIED',
      attemptId,
      baselineRef: `baseline:${attemptId}`,
      scopeDigest: attemptId.padEnd(64, '0').slice(0, 64),
    },
  });
}

/** Seed mockMemStore.getById so resolveDebt can find debt entries */
function seedDebtStore(items: Array<Partial<DebtItem>>): void {
  const entries = items.map(d => ({
    id: d.id ?? EXPECTED_DEBT_ID,
    type: 'debt' as const,
    title: d.description ?? 'Test debt',
    content: '',
    source: 'brain',
    summary: null,
    status: d.resolved ? 'resolved' : 'active',
    priority: (d.priority ?? 'NORMAL').toLowerCase(),
    sprint_id: d.originSprintId ?? 'sprint-000',
    sprint_num: 0,
    tag_text: '',
    metadata: JSON.stringify({ originTaskId: d.originTaskId ?? '', originSprintId: d.originSprintId ?? 'sprint-000', sprintsOpen: d.sprintsOpen ?? 0, resolvedInSprintId: d.resolvedInSprintId, class: d.class }),
    created_at: d.createdAt ?? '2026-03-17T00:00:00.000Z',
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }));

  mockMemStore.getById.mockImplementation((id: string) => entries.find(e => e.id === id) ?? null);
  mockMemStore.getByType.mockImplementation((type: string) => type === 'debt' ? entries.filter(e => e.status !== 'resolved') : []);
}

/**
 * Materialize a full runSprint fixture on the REAL project root.
 * @param debtTableContent  - content written to DEBT.md (legacy fallback read path)
 * @param resultJsonByTask  - map of taskId → result JSON, pre-written as real
 *                            `.tasks/task-<id>.result` files (missing = timeout path)
 * @param directives        - DIRECTIVES.md content (drives how many tasks planSprint creates)
 * @param debtItems         - debt items to seed in the mock MemoryStore
 */
function setupProject(
  debtTableContent: string,
  resultJsonByTask: Map<string, string>,
  directives = 'Build the system',
  debtItems?: Array<Partial<DebtItem>>,
): void {
  // Seed the DB mock with debt entries
  if (debtItems) {
    seedDebtStore(debtItems);
  }
  // git commands in readContext + the pre-spawn scope-gate's `git ls-files`
  // call (sprint-controller.ts) both go through this mock. `git ls-files`
  // must report a tracked src/ path so evaluateScopeGate's directory check
  // classifies legacy-fallback scopes (filesWrite: ['src/']) as
  // new-plausible instead of suspect; every other git subcommand keeps the
  // original empty-stdout behavior.
  mockedSpawnSync.mockImplementation((_command, args) => {
    const isLsFiles = Array.isArray(args) && args[0] === 'ls-files';
    return {
      status: 0, stdout: isLsFiles ? 'src/index.ts\n' : '', stderr: '', pid: 1, signal: null, output: [],
    } as never;
  });

  writeFileSync(join(PROJECT_ROOT, 'DIRECTIVES.md'), directives, 'utf-8');
  writeFileSync(join(PROJECT_ROOT, 'DEBT.md'), debtTableContent, 'utf-8');

  // Pre-written real result files: the EXECUTE collector finds them
  // immediately (worker spawn is a mocked no-op backend).
  for (const [taskId, json] of resultJsonByTask.entries()) {
    writeFileSync(join(PROJECT_ROOT, '.tasks', `task-${taskId}.result`), json, 'utf-8');
  }
}

/** Returns true if mockMemStore.upsert was called with status='resolved' and matching sprintId */
function debtWasResolved(sprintId = EXPECTED_SPRINT_ID): boolean {
  return mockMemStore.upsert.mock.calls.some((args: unknown[]) => {
    const input = args[0] as Record<string, unknown>;
    return input.status === 'resolved' &&
      typeof input.metadata === 'object' && input.metadata !== null &&
      (input.metadata as Record<string, unknown>).resolvedInSprintId === sprintId;
  });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('runSprint Phase 4 — debt resolution integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshProjectRoot();
    vi.mocked(SpawnBackendFactory.create).mockReturnValue({
      name: 'test-measured',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── DONE evaluation ─────────────────────────────────────────────

  it('resolves debt in DB when task evaluates to DONE', async () => {
    const debtItems = [{ id: EXPECTED_DEBT_ID, resolved: false }];
    const debtTable = makeDebtTable(debtItems);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupProject(debtTable, results, 'Build the system', debtItems);

    await runSprint(PROJECT_ROOT, makeConfig());

    expect(debtWasResolved()).toBe(true);
  });

  it('writes resolved status with correct sprintId for DONE evaluation', async () => {
    const debtItems = [{ id: EXPECTED_DEBT_ID, resolved: false }];
    const debtTable = makeDebtTable(debtItems);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupProject(debtTable, results, 'Build the system', debtItems);

    await runSprint(PROJECT_ROOT, makeConfig());

    // Verify upsert was called with correct resolved status and sprintId
    const upsertCalls = mockMemStore.upsert.mock.calls;
    const resolvedCall = upsertCalls.find((args: unknown[]) => {
      const input = args[0] as Record<string, unknown>;
      return input.id === EXPECTED_DEBT_ID && input.status === 'resolved';
    });
    expect(resolvedCall).toBeDefined();
    const meta = (resolvedCall![0] as Record<string, unknown>).metadata as Record<string, unknown>;
    expect(meta.resolvedInSprintId).toBe(EXPECTED_SPRINT_ID);
  });

  // ── GO_WITH_TECH_DEBT evaluation ─────────────────────────────────

  it('resolves debt in DB when task evaluates to GO_WITH_TECH_DEBT', async () => {
    const debtItems = [{ id: EXPECTED_DEBT_ID, resolved: false }];
    const debtTable = makeDebtTable(debtItems);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'GO_WITH_TECH_DEBT' }),
    ]]);
    setupProject(debtTable, results, 'Build the system', debtItems);

    await runSprint(PROJECT_ROOT, makeConfig());

    expect(debtWasResolved()).toBe(true);
  });

  it('writes resolved status with correct sprintId for GO_WITH_TECH_DEBT evaluation', async () => {
    const debtItems = [{ id: EXPECTED_DEBT_ID, resolved: false }];
    const debtTable = makeDebtTable(debtItems);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'GO_WITH_TECH_DEBT' }),
    ]]);
    setupProject(debtTable, results, 'Build the system', debtItems);

    await runSprint(PROJECT_ROOT, makeConfig());

    const upsertCalls = mockMemStore.upsert.mock.calls;
    const resolvedCall = upsertCalls.find((args: unknown[]) => {
      const input = args[0] as Record<string, unknown>;
      return input.status === 'resolved';
    });
    expect(resolvedCall).toBeDefined();
  });

  // ── isPriorityFix + DONE ─────────────────────────────────────────

  it('resolves fixForTaskId debt when isPriorityFix task evaluates to DONE', async () => {
    const originTaskId = '999-001';
    const fixDebtId = `debt-${originTaskId}`;

    const debtItems = [{
      id: fixDebtId,
      originTaskId,
      priority: DebtPriority.CRITICAL,
      resolved: false,
    }];
    const debtTable = makeDebtTable(debtItems);

    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);

    setupProject(debtTable, results, '', debtItems);

    await runSprint(PROJECT_ROOT, makeConfig());

    // resolveDebt should have been called for 'debt-999-001'
    const upsertCalls = mockMemStore.upsert.mock.calls;
    const fixDebtResolved = upsertCalls.find((args: unknown[]) => {
      const input = args[0] as Record<string, unknown>;
      return input.id === fixDebtId && input.status === 'resolved';
    });
    expect(fixDebtResolved).toBeDefined();
  });

  // ── PLAN: verified-no-result debt is resolved, not re-injected (365-001) ──

  it('PLAN resolves a verified-no-result CRITICAL debt instead of leaving it active', async () => {
    // A skip-class debt has NO follow-up code work: injectCriticalDebtTasks skips
    // it (no fix task), and the planner now resolves it so it stops re-injecting
    // every sprint. A normal CRITICAL debt rides alongside to produce the one
    // dispatched fix task (001-001) the harness expects. Its originTaskId must
    // be a FOREIGN task (like the sibling fixForTaskId test): the old fixture's
    // originTaskId=001-001 made the injected fix task a fix-for-ITSELF
    // (fixForTaskId === own id), a lineage the finalizer honestly refuses to
    // settle (TERMINAL_EVIDENCE_HOLD) — production truth, stale fixture.
    const vnrDebtId = 'debt-vnr-001';
    const debtItems = [
      { id: 'debt-998-001', originTaskId: '998-001', priority: DebtPriority.CRITICAL, resolved: false },
      { id: vnrDebtId, originTaskId: 'vnr-001', priority: DebtPriority.CRITICAL, resolved: false, class: 'verified-no-result' as const },
    ];
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);

    setupProject(makeDebtTable(debtItems), results, '', debtItems);

    await runSprint(PROJECT_ROOT, makeConfig());

    const vnrResolved = mockMemStore.upsert.mock.calls.some((args: unknown[]) => {
      const input = args[0] as Record<string, unknown>;
      return input.id === vnrDebtId && input.status === 'resolved';
    });
    expect(vnrResolved).toBe(true);
  });

  // ── NO_GO evaluation — debt must NOT be resolved ─────────────────

  it('does NOT resolve debt when task evaluates to NO_GO', async () => {
    const debtItems = [{ id: EXPECTED_DEBT_ID, resolved: false }];
    const debtTable = makeDebtTable(debtItems);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 }),
    ]]);
    setupProject(debtTable, results, 'Build the system', debtItems);

    const sprint = await runSprint(PROJECT_ROOT, makeConfig());

    expect(debtWasResolved()).toBe(false);
    // Honest lifecycle (455-003): a NO_GO with no live FIX worker parks the
    // sprint as PAUSED in FIX — never a false COMPLETE.
    expect(sprint.status).toBe('PAUSED');
  });

  it('does NOT write resolved status for NO_GO evaluation', async () => {
    const debtItems = [{ id: EXPECTED_DEBT_ID, resolved: false }];
    const debtTable = makeDebtTable(debtItems);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 }),
    ]]);
    setupProject(debtTable, results, 'Build the system', debtItems);

    await runSprint(PROJECT_ROOT, makeConfig());

    // None of the upsert calls should mark our debt as resolved
    const hasResolvedWrite = mockMemStore.upsert.mock.calls.some((args: unknown[]) => {
      const input = args[0] as Record<string, unknown>;
      return input.id === EXPECTED_DEBT_ID && input.status === 'resolved';
    });
    expect(hasResolvedWrite).toBe(false);
  });

  // ── Timeout (missing result) — debt must NOT be resolved ─────────

  it('does NOT resolve debt when task result is missing (timeout/synthetic NO_GO)', async () => {
    vi.useFakeTimers();

    const debtItems = [{ id: EXPECTED_DEBT_ID, resolved: false }];
    const debtTable = makeDebtTable(debtItems);
    setupProject(debtTable, new Map(), 'Build the system', debtItems);

    // Advance fake time in minute steps until the sprint promise settles: the
    // no-result path chains several independent timer budgets (execute timeout,
    // runtime-extension poll, 60s liveness grace-poll, FIX-phase waits), so a
    // single 31-minute jump leaves later waits pending forever.
    let settled = false;
    const sprintPromise = runSprint(PROJECT_ROOT, makeConfig()).finally(() => { settled = true; });
    for (let i = 0; i < 240 && !settled; i++) {
      await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(settled).toBe(true);
    await sprintPromise;

    expect(debtWasResolved()).toBe(false);
  }, 60_000);

  // ── Sprint ID correctness ────────────────────────────────────────

  it('uses the sprint ID from the current sprint, not a hardcoded value', async () => {
    const debtItems = [{ id: EXPECTED_DEBT_ID, resolved: false }];
    const debtTable = makeDebtTable(debtItems);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupProject(debtTable, results, 'Build the system', debtItems);

    const sprint = await runSprint(PROJECT_ROOT, makeConfig());

    // The resolvedInSprintId in the upsert metadata must match the actual sprint
    const upsertCalls = mockMemStore.upsert.mock.calls;
    const resolvedCall = upsertCalls.find((args: unknown[]) => {
      const input = args[0] as Record<string, unknown>;
      return input.id === EXPECTED_DEBT_ID && input.status === 'resolved';
    });
    expect(resolvedCall).toBeDefined();
    const meta = (resolvedCall![0] as Record<string, unknown>).metadata as Record<string, unknown>;
    expect(meta.resolvedInSprintId).toBe(sprint.id);
  });

  // ── Sprint completes regardless ──────────────────────────────────

  it('sprint completes successfully after debt resolution', async () => {
    const debtItems = [{ id: EXPECTED_DEBT_ID, resolved: false }];
    const debtTable = makeDebtTable(debtItems);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupProject(debtTable, results, 'Build the system', debtItems);

    const sprint = await runSprint(PROJECT_ROOT, makeConfig());

    expect(sprint.status).toBe('COMPLETE');
    expect(sprint.phase).toBe('COMPLETE');
  });

  it('sprint completes successfully when debt resolution finds no matching entry', async () => {
    const debtItems = [{ id: 'debt-other-999', resolved: false }];
    const debtTable = makeDebtTable(debtItems);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupProject(debtTable, results, 'Build the system', debtItems);

    const sprint = await runSprint(PROJECT_ROOT, makeConfig());

    expect(sprint.status).toBe('COMPLETE');
  });

  // ── DEBT.md content correctness ──────────────────────────────────

  it('resolveDebt only resolves the target debt, not others', async () => {
    const debtItems = [
      { id: EXPECTED_DEBT_ID, resolved: false },
      { id: 'debt-other-001', resolved: false, description: 'Other debt' },
    ];
    const debtTable = makeDebtTable(debtItems);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupProject(debtTable, results, 'Build the system', debtItems);

    await runSprint(PROJECT_ROOT, makeConfig());

    // Only EXPECTED_DEBT_ID should be resolved, not debt-other-001
    const upsertCalls = mockMemStore.upsert.mock.calls;
    const resolvedCall = upsertCalls.find((args: unknown[]) => {
      const input = args[0] as Record<string, unknown>;
      return input.id === EXPECTED_DEBT_ID && input.status === 'resolved';
    });
    expect(resolvedCall).toBeDefined();

    // debt-other-001 should NOT have been resolved
    const otherResolved = upsertCalls.find((args: unknown[]) => {
      const input = args[0] as Record<string, unknown>;
      return input.id === 'debt-other-001' && input.status === 'resolved';
    });
    expect(otherResolved).toBeUndefined();
  });
});
