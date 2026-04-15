/**
 * Sprint 4 — Task 004-003
 * runSprint Phase 4 debt resolution integration tests.
 *
 * Verifies that after DONE / GO_WITH_TECH_DEBT evaluation in Phase 4,
 * resolveDebt() is invoked and DEBT.md is updated with resolved=true and
 * the correct resolvedInSprintId.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DebtPriority } from '../../src/core/types.js';
import type { DebtItem, ResolvedConfig } from '../../src/core/types.js';
import { DEBT_TABLE_HEADER } from '../../src/core/constants.js';

// ─── Module Mocks ───────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
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

vi.mock('../../src/core/provider.js', () => {
  const mockAdapter = {
    name: 'claude',
    supportedModels: ['opus', 'sonnet', 'haiku'],
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
    providerRegistry: {
      getDefault: vi.fn().mockReturnValue(mockAdapter),
      registerProvider: vi.fn(),
      getProvider: vi.fn().mockReturnValue(mockAdapter),
      hasProvider: vi.fn().mockReturnValue(false),
      listProviders: vi.fn().mockReturnValue([]),
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

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn().mockReturnValue({ id: 'sp-001', sprintId: 'sprint-001', branchName: 'deckent-backup-sprint-001', createdAt: new Date().toISOString() }),
  rollback: vi.fn().mockReturnValue({ success: true }),
  getRollbackPolicy: vi.fn().mockReturnValue('skip'),
  recordRollbackInDebt: vi.fn(),
  saveSafetyPoint: vi.fn(),
  deleteSafetyPoint: vi.fn(),
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(false),
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
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
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

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runSprint } from '../../src/orchestra/brain.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedSpawnSync = vi.mocked(spawnSync);

// ─── Constants ──────────────────────────────────────────────────────

const ROOT = '/project';
const DEBT_SEPARATOR = '|----|-------------|------|--------|----------|------|----------|----------|---------|';

// planSprint creates sprint-001 (no sprint files exist → maxNumber=0 → sprintNumber=1)
// Single directive line → one task with id '001-001'
const EXPECTED_SPRINT_ID = 'sprint-001';
const EXPECTED_TASK_ID = '001-001';
const EXPECTED_DEBT_ID = `debt-${EXPECTED_TASK_ID}`;

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
    projectRoot: ROOT,
    projectName: 'test',
    language: 'tr',
    version: '0.1.0',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
    },
    modes: {} as never,
  };
}

function makeTaskResult(opts: {
  taskId?: string;
  selfAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  testsPassed?: boolean;
  coverage?: number;
}): string {
  return JSON.stringify({
    taskId: opts.taskId ?? EXPECTED_TASK_ID,
    workerId: `w-${opts.taskId ?? EXPECTED_TASK_ID}`,
    filesChanged: ['src/foo.ts'],
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: opts.testsPassed ?? opts.selfAssessment !== 'NO_GO',
    coverage: opts.coverage ?? (opts.selfAssessment === 'NO_GO' ? 0 : 95),
    selfAssessment: opts.selfAssessment,
    notes: 'Integration test result',
  });
}

/**
 * Set up mocks for a full runSprint run.
 * @param debtTableContent  - content returned for any DEBT.md read
 * @param resultJsonByTask  - map of taskId → result JSON (undefined = file missing)
 * @param directives        - DIRECTIVES.md content (drives how many tasks planSprint creates)
 */
function setupMocks(
  debtTableContent: string,
  resultJsonByTask: Map<string, string>,
  directives = 'Build the system',
): void {
  // git commands in readContext
  mockedSpawnSync.mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  } as never);

  mockedExistsSync.mockImplementation((path: unknown) => {
    const p = String(path);
    // Result files present only for tasks listed in resultJsonByTask
    if (p.endsWith('.result')) {
      for (const taskId of resultJsonByTask.keys()) {
        if (p.includes(`task-${taskId}.result`)) return true;
      }
      return false;
    }
    // Tasks directory exists for planSprint to write into
    if (p.includes('.tasks')) return true;
    // Brain dir does NOT exist → countBrainLines returns 0 → decay is a no-op
    return false;
  });

  // Return empty arrays everywhere → sprint number = 1, no pre-existing tasks/fix-tasks
  mockedReaddirSync.mockReturnValue([] as never);

  mockedReadFileSync.mockImplementation((path: unknown) => {
    const p = String(path);
    if (p.includes('DIRECTIVES')) return directives;
    if (p.includes('DEBT.md')) return debtTableContent;
    // Return result JSON for the matching task
    for (const [taskId, json] of resultJsonByTask.entries()) {
      if (p.includes(`task-${taskId}.result`)) return json;
    }
    return '';
  });
}

/** Filter writeFileSync calls targeting DEBT.md */
function debtWrites(): Array<[string, string]> {
  return mockedWriteFileSync.mock.calls
    .filter(c => String(c[0]).includes('DEBT.md'))
    .map(c => [String(c[0]), String(c[1])]);
}

/** Returns true if any DEBT.md write contains the resolved marker for the given sprint */
function debtWasResolved(sprintId = EXPECTED_SPRINT_ID): boolean {
  // resolveDebt writes: `| true | <sprintId> |` in adjacent columns
  const marker = `| true | ${sprintId} |`;
  return debtWrites().some(([, content]) => content.includes(marker));
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('runSprint Phase 4 — debt resolution integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── DONE evaluation ─────────────────────────────────────────────

  it('resolves debt in DEBT.md when task evaluates to DONE', async () => {
    const debtTable = makeDebtTable([{ id: EXPECTED_DEBT_ID, resolved: false }]);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupMocks(debtTable, results);

    await runSprint(ROOT, makeConfig());

    expect(debtWasResolved()).toBe(true);
  });

  it('writes resolved=true with correct sprintId for DONE evaluation', async () => {
    const debtTable = makeDebtTable([{ id: EXPECTED_DEBT_ID, resolved: false }]);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupMocks(debtTable, results);

    await runSprint(ROOT, makeConfig());

    const writes = debtWrites();
    const resolvedWrite = writes.find(([, c]) =>
      c.includes(EXPECTED_DEBT_ID) && c.includes(`| true | ${EXPECTED_SPRINT_ID} |`),
    );
    expect(resolvedWrite).toBeDefined();
    expect(resolvedWrite![1]).toContain(EXPECTED_DEBT_ID);
    expect(resolvedWrite![1]).toContain('| true |');
    expect(resolvedWrite![1]).toContain(`| ${EXPECTED_SPRINT_ID} |`);
  });

  // ── GO_WITH_TECH_DEBT evaluation ─────────────────────────────────

  it('resolves debt in DEBT.md when task evaluates to GO_WITH_TECH_DEBT', async () => {
    const debtTable = makeDebtTable([{ id: EXPECTED_DEBT_ID, resolved: false }]);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'GO_WITH_TECH_DEBT' }),
    ]]);
    setupMocks(debtTable, results);

    await runSprint(ROOT, makeConfig());

    expect(debtWasResolved()).toBe(true);
  });

  it('writes resolved=true with correct sprintId for GO_WITH_TECH_DEBT evaluation', async () => {
    const debtTable = makeDebtTable([{ id: EXPECTED_DEBT_ID, resolved: false }]);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'GO_WITH_TECH_DEBT' }),
    ]]);
    setupMocks(debtTable, results);

    await runSprint(ROOT, makeConfig());

    const writes = debtWrites();
    const resolvedWrite = writes.find(([, c]) =>
      c.includes(EXPECTED_DEBT_ID) && c.includes(`| true | ${EXPECTED_SPRINT_ID} |`),
    );
    expect(resolvedWrite).toBeDefined();
  });

  // ── isPriorityFix + DONE ─────────────────────────────────────────

  it('resolves fixForTaskId debt when isPriorityFix task evaluates to DONE', async () => {
    // originTaskId is what planSprint uses as fixForTaskId.
    // Phase 4 calls: resolveDebt(ROOT, 'debt-' + fixForTaskId, sprint.id)
    // = resolveDebt(ROOT, 'debt-999-001', sprint.id)
    const originTaskId = '999-001';
    const fixDebtId = `debt-${originTaskId}`;

    const debtTable = makeDebtTable([{
      id: fixDebtId,
      originTaskId,
      priority: DebtPriority.CRITICAL,
      resolved: false,
    }]);

    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);

    // Use EMPTY directives so planSprint only creates the CRITICAL-debt priority-fix task
    // (id='001-001', isPriorityFix=true, fixForTaskId='999-001').
    // With a non-empty directive line AND CRITICAL debt, planSprint would create 2 tasks
    // causing waitForResults to poll for the second task and time out.
    setupMocks(debtTable, results, '');

    await runSprint(ROOT, makeConfig());

    // resolveDebt should have been called for 'debt-999-001'
    const writes = debtWrites();
    const fixDebtResolved = writes.find(([, c]) =>
      c.includes(fixDebtId) && c.includes(`| true | ${EXPECTED_SPRINT_ID} |`),
    );
    expect(fixDebtResolved).toBeDefined();
  });

  // ── NO_GO evaluation — debt must NOT be resolved ─────────────────

  it('does NOT resolve debt when task evaluates to NO_GO', async () => {
    const debtTable = makeDebtTable([{ id: EXPECTED_DEBT_ID, resolved: false }]);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 }),
    ]]);
    setupMocks(debtTable, results);

    await runSprint(ROOT, makeConfig());

    expect(debtWasResolved()).toBe(false);
  });

  it('does NOT write resolved=true to DEBT.md for NO_GO evaluation', async () => {
    const debtTable = makeDebtTable([{ id: EXPECTED_DEBT_ID, resolved: false }]);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'NO_GO', testsPassed: false, coverage: 0 }),
    ]]);
    setupMocks(debtTable, results);

    await runSprint(ROOT, makeConfig());

    // None of the DEBT.md writes should mark our debt as resolved
    const writes = debtWrites();
    const hasResolvedWrite = writes.some(([, c]) =>
      c.includes(EXPECTED_DEBT_ID) && c.includes(`| true | ${EXPECTED_SPRINT_ID} |`),
    );
    expect(hasResolvedWrite).toBe(false);
  });

  // ── Timeout (missing result) — debt must NOT be resolved ─────────

  it('does NOT resolve debt when task result is missing (timeout/synthetic NO_GO)', async () => {
    // waitForResults polls for 30 min by default — use fake timers to advance quickly.
    vi.useFakeTimers();

    const debtTable = makeDebtTable([{ id: EXPECTED_DEBT_ID, resolved: false }]);
    // Empty map → no result file exists for task-001-001
    setupMocks(debtTable, new Map());

    const sprintPromise = runSprint(ROOT, makeConfig());

    // Advance virtual time past the 30-minute waitForResults timeout so the
    // polling loop exits with no results → Phase 4 generates a synthetic NO_GO.
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);

    await sprintPromise;

    expect(debtWasResolved()).toBe(false);
  }, 30_000);

  // ── Sprint ID correctness ────────────────────────────────────────

  it('uses the sprint ID from the current sprint, not a hardcoded value', async () => {
    const debtTable = makeDebtTable([{ id: EXPECTED_DEBT_ID, resolved: false }]);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupMocks(debtTable, results);

    const sprint = await runSprint(ROOT, makeConfig());

    // The sprint ID used in the resolvedInSprintId column must match the actual sprint
    const writes = debtWrites();
    const resolvedWrite = writes.find(([, c]) =>
      c.includes(EXPECTED_DEBT_ID) && c.includes('| true |'),
    );
    expect(resolvedWrite).toBeDefined();
    expect(resolvedWrite![1]).toContain(`| ${sprint.id} |`);
  });

  // ── Sprint completes regardless ──────────────────────────────────

  it('sprint completes successfully after debt resolution', async () => {
    const debtTable = makeDebtTable([{ id: EXPECTED_DEBT_ID, resolved: false }]);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupMocks(debtTable, results);

    const sprint = await runSprint(ROOT, makeConfig());

    expect(sprint.status).toBe('COMPLETE');
    expect(sprint.phase).toBe('COMPLETE');
  });

  it('sprint completes successfully when debt resolution finds no matching entry', async () => {
    // DEBT.md exists but no entry matches the task ID → resolveDebt returns false
    const debtTable = makeDebtTable([{ id: 'debt-other-999', resolved: false }]);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupMocks(debtTable, results);

    const sprint = await runSprint(ROOT, makeConfig());

    expect(sprint.status).toBe('COMPLETE');
  });

  // ── DEBT.md content correctness ──────────────────────────────────

  it('resolveDebt write preserves other debt items untouched', async () => {
    const debtTable = makeDebtTable([
      { id: EXPECTED_DEBT_ID, resolved: false },
      { id: 'debt-other-001', resolved: false, description: 'Other debt' },
    ]);
    const results = new Map([[
      EXPECTED_TASK_ID,
      makeTaskResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
    ]]);
    setupMocks(debtTable, results);

    await runSprint(ROOT, makeConfig());

    const writes = debtWrites();
    const resolvedWrite = writes.find(([, c]) =>
      c.includes(EXPECTED_DEBT_ID) && c.includes(`| true | ${EXPECTED_SPRINT_ID} |`),
    );
    expect(resolvedWrite).toBeDefined();

    // 'debt-other-001' should still appear in the write (not dropped)
    expect(resolvedWrite![1]).toContain('debt-other-001');
  });
});
