/**
 * tests/orchestra/brain-autopause.test.ts — checkAndAutoPause / checkAndAutoResume Tests
 *
 * Task 027-016: checkAndAutoPause Real Environment Fix
 *
 * Covers:
 * - Pause triggered when 5hr threshold exceeded
 * - Pause triggered when weekly threshold exceeded
 * - No pause when usage is below thresholds
 * - pauseSprint called with correct reason message
 * - Sprint status is PAUSED after checkAndAutoPause
 * - Resume triggered when usage drops below 80% of threshold (new feature)
 * - No resume when sprint is not PAUSED
 * - No resume when usage is still too high
 * - Hysteresis: resume threshold is 80% of pause threshold
 * - checkAndAutoResume returns false for non-PAUSED sprints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

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
}));

vi.mock('../../src/core/spawn-backend.js', () => ({
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
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    platform: 'linux',
    hasTmux: true,
    recommendedMaxWorkers: 4,
  }),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }),
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
  writeRetrospective: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 1000,
    coveragePercent: 90,
    noGoRate: 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
  }),
  updateProjectDocs: vi.fn(),
  trimMemoryWithHeader: vi.fn(),
  compareWithPreviousSprint: vi.fn(),
  readPreviousSprintMetrics: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/usage-tracker.js', () => ({
  UsageTracker: vi.fn().mockImplementation(() => ({
    recordCall: vi.fn(),
    getSprintUsage: vi.fn().mockReturnValue({ sprintId: 'sprint-001', entries: [], totalCalls: 0, totalTokens: 0, modelBreakdown: [] }),
    getTotalUsage: vi.fn(),
    getModelBreakdown: vi.fn().mockReturnValue([]),
    listSprints: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/orchestra/coverage-validator.js', () => ({
  parseCoverageFromVitest: vi.fn(),
  validateCoverage: vi.fn(),
  validateWorkerCoverage: vi.fn().mockReturnValue({ valid: true, level: 'OK', message: '' }),
  isDocOnlyTask: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn().mockResolvedValue({ id: 'sp-001', sprintId: 'sprint-001', branchName: 'deckent-backup-sprint-001', createdAt: new Date().toISOString() }),
  rollback: vi.fn().mockResolvedValue({ success: true }),
  getRollbackPolicy: vi.fn().mockReturnValue({ autoRollback: false, offerRollback: true }),
  recordRollbackInDebt: vi.fn(),
  saveSafetyPoint: vi.fn(),
  deleteSafetyPoint: vi.fn(),
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn().mockReturnValue(null),
    register: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockReturnValue([]),
  },
}));

// ─── Imports (after mocks) ───────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { checkAndAutoPause, checkAndAutoResume } from '../../src/orchestra/brain.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'desc',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-001',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  const tasks = [makeTask()];
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.SPAWN,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    ...overrides,
  };
}

function makeConfig(thresholds = { '5hr': 0.8, weekly: 0.9 }): ResolvedConfig {
  return {
    projectName: 'test',
    mode: 'tmux',
    activeModeConfig: {
      max_workers: 4,
      default_model: 'opus',
      haiku_allowed: false,
      brain_planning: 'structured',
      brain_model: 'opus',
      usage_thresholds: thresholds,
    },
  } as unknown as ResolvedConfig;
}

/** Set up spawnSync to simulate claude /usage output */
function mockClaudeUsage(fiveHrPercent: number, weeklyPercent: number): void {
  mockedSpawnSync.mockReturnValue({
    status: 0,
    stdout: `5hr: ${fiveHrPercent}%\nweekly: ${weeklyPercent}%`,
    stderr: '',
    pid: 1,
    output: [],
    signal: null,
  } as ReturnType<typeof spawnSync>);
}

function setupFileMocks(): void {
  mockedExistsSync.mockReturnValue(false);
  mockedReaddirSync.mockReturnValue([]);
  mockedReadFileSync.mockReturnValue('');
  mockedWriteFileSync.mockReturnValue(undefined);
  mockedMkdirSync.mockReturnValue(undefined as never);
  mockedUnlinkSync.mockReturnValue(undefined);
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('checkAndAutoPause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFileMocks();
  });

  it('returns false when usage is below both thresholds', () => {
    mockClaudeUsage(50, 60); // 50% < 80%, 60% < 90%
    const sprint = makeSprint();
    const config = makeConfig();

    const result = checkAndAutoPause('/tmp/test', sprint, config);

    expect(result).toBe(false);
  });

  it('returns true and pauses sprint when 5hr threshold exceeded', () => {
    mockClaudeUsage(85, 60); // 85% >= 80% threshold
    const sprint = makeSprint();
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoPause('/tmp/test', sprint, config);

    expect(result).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('returns true and pauses sprint when weekly threshold exceeded', () => {
    mockClaudeUsage(50, 95); // 95% >= 90% weekly threshold
    const sprint = makeSprint();
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoPause('/tmp/test', sprint, config);

    expect(result).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('pauses with 5hr reason message when 5hr is the trigger', () => {
    mockClaudeUsage(85, 60);
    const sprint = makeSprint();
    const config = makeConfig();

    checkAndAutoPause('/tmp/test', sprint, config);

    // Verify pause state written to disk mentions 5hr
    const writeCall = mockedWriteFileSync.mock.calls.find(call =>
      typeof call[1] === 'string' && call[1].includes('5hr usage limit'),
    );
    expect(writeCall).toBeDefined();
  });

  it('pauses with weekly reason message when weekly is the trigger', () => {
    mockClaudeUsage(50, 95);
    const sprint = makeSprint();
    const config = makeConfig();

    checkAndAutoPause('/tmp/test', sprint, config);

    const writeCall = mockedWriteFileSync.mock.calls.find(call =>
      typeof call[1] === 'string' && call[1].includes('Weekly usage limit'),
    );
    expect(writeCall).toBeDefined();
  });

  it('pauses when both thresholds exceeded — uses 5hr reason', () => {
    mockClaudeUsage(90, 95); // both exceeded
    const sprint = makeSprint();
    const config = makeConfig();

    const result = checkAndAutoPause('/tmp/test', sprint, config);

    expect(result).toBe(true);
    const writeCall = mockedWriteFileSync.mock.calls.find(call =>
      typeof call[1] === 'string' && call[1].includes('5hr usage limit'),
    );
    expect(writeCall).toBeDefined();
  });

  it('does not pause when usage exactly equals threshold minus epsilon', () => {
    // 79.9% < 80% threshold
    mockClaudeUsage(79.9, 60);
    const sprint = makeSprint();
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoPause('/tmp/test', sprint, config);

    expect(result).toBe(false);
  });

  it('pauses when usage exactly equals threshold', () => {
    // 80% >= 80% threshold
    mockClaudeUsage(80, 60);
    const sprint = makeSprint();
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoPause('/tmp/test', sprint, config);

    expect(result).toBe(true);
  });

  it('transitions pending tasks to PAUSED status', () => {
    mockClaudeUsage(90, 60);
    const tasks = [
      makeTask({ id: '001-001', status: TaskStatus.PENDING }),
      makeTask({ id: '001-002', status: TaskStatus.EXECUTING }),
    ];
    const sprint = makeSprint({ tasks });

    checkAndAutoPause('/tmp/test', sprint, makeConfig());

    expect(tasks[0].status).toBe(TaskStatus.PAUSED);
    expect(tasks[1].status).toBe(TaskStatus.PAUSED);
  });

  it('respects custom threshold values', () => {
    // Custom: 5hr = 0.5 (50%), weekly = 0.6 (60%)
    mockClaudeUsage(55, 40); // 55% >= 50% custom threshold
    const sprint = makeSprint();
    const config = makeConfig({ '5hr': 0.5, weekly: 0.6 });

    const result = checkAndAutoPause('/tmp/test', sprint, config);

    expect(result).toBe(true);
  });
});

describe('checkAndAutoResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFileMocks();
    // Existing pause state file
    mockedExistsSync.mockImplementation((p: unknown) => {
      if (typeof p === 'string' && p.includes('pause-state.json')) return true;
      return false;
    });
    mockedReadFileSync.mockImplementation((p: unknown) => {
      if (typeof p === 'string' && p.includes('pause-state.json')) {
        return JSON.stringify({
          sprintId: 'sprint-001',
          pausedAt: new Date().toISOString(),
          pausedTaskIds: ['001-001'],
          reason: '5hr usage limit exceeded',
        });
      }
      return '';
    });
  });

  it('returns false when sprint is not PAUSED', () => {
    mockClaudeUsage(10, 10);
    const sprint = makeSprint({ status: SprintStatus.ACTIVE });
    const config = makeConfig();

    const result = checkAndAutoResume('/tmp/test', sprint, config);

    expect(result).toBe(false);
  });

  it('returns false when sprint is PLANNING (not PAUSED)', () => {
    mockClaudeUsage(10, 10);
    const sprint = makeSprint({ status: SprintStatus.PLANNING });
    const config = makeConfig();

    const result = checkAndAutoResume('/tmp/test', sprint, config);

    expect(result).toBe(false);
  });

  it('returns true when PAUSED sprint usage drops below resume threshold', () => {
    // 5hr threshold = 80%, resume threshold = 64% (80% * 0.8)
    // weekly threshold = 90%, resume threshold = 72%
    mockClaudeUsage(50, 60); // both well below resume thresholds
    const tasks = [makeTask({ status: TaskStatus.PAUSED })];
    const sprint = makeSprint({ status: SprintStatus.PAUSED, tasks });
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoResume('/tmp/test', sprint, config);

    expect(result).toBe(true);
    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('returns false when 5hr usage still above resume threshold', () => {
    // 5hr threshold = 80%, resume threshold = 64%
    mockClaudeUsage(70, 50); // 70% >= 64% resume threshold for 5hr
    const sprint = makeSprint({ status: SprintStatus.PAUSED });
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoResume('/tmp/test', sprint, config);

    expect(result).toBe(false);
  });

  it('returns false when weekly usage still above resume threshold', () => {
    // weekly threshold = 90%, resume threshold = 72%
    mockClaudeUsage(40, 75); // 75% >= 72% resume threshold for weekly
    const sprint = makeSprint({ status: SprintStatus.PAUSED });
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const result = checkAndAutoResume('/tmp/test', sprint, config);

    expect(result).toBe(false);
  });

  it('resumes sprint tasks from PAUSED to PENDING', () => {
    mockClaudeUsage(20, 20);
    const tasks = [
      makeTask({ id: '001-001', status: TaskStatus.PAUSED }),
      makeTask({ id: '001-002', status: TaskStatus.PAUSED }),
    ];
    const sprint = makeSprint({ status: SprintStatus.PAUSED, tasks });
    const config = makeConfig();

    checkAndAutoResume('/tmp/test', sprint, config);

    expect(tasks[0].status).toBe(TaskStatus.PENDING);
    expect(tasks[1].status).toBe(TaskStatus.PENDING);
  });

  it('hysteresis — resume threshold is 80% of pause threshold', () => {
    // Pause at 80% (5hr threshold). Resume should only happen below 64% (80% * 80%)
    // At 65%, should NOT resume
    mockClaudeUsage(65, 40); // 65% > 64% resume threshold
    const sprint = makeSprint({ status: SprintStatus.PAUSED });
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    const notResumed = checkAndAutoResume('/tmp/test', sprint, config);
    expect(notResumed).toBe(false);

    // At 63%, should resume
    mockClaudeUsage(63, 40); // 63% < 64% resume threshold
    const tasks2 = [makeTask({ status: TaskStatus.PAUSED })];
    const sprint2 = makeSprint({ status: SprintStatus.PAUSED, tasks: tasks2 });

    const resumed = checkAndAutoResume('/tmp/test', sprint2, config);
    expect(resumed).toBe(true);
  });

  it('removes pause state file after resume', () => {
    mockClaudeUsage(20, 20);
    const tasks = [makeTask({ status: TaskStatus.PAUSED })];
    const sprint = makeSprint({ status: SprintStatus.PAUSED, tasks });

    checkAndAutoResume('/tmp/test', sprint, makeConfig());

    const unlinkCalls = mockedUnlinkSync.mock.calls.map(c => c[0]);
    expect(unlinkCalls.some(p => typeof p === 'string' && p.includes('pause-state.json'))).toBe(true);
  });
});

describe('checkAndAutoPause + checkAndAutoResume integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFileMocks();
  });

  it('pause then resume cycle works correctly', () => {
    const tasks = [
      makeTask({ id: '001-001', status: TaskStatus.PENDING }),
      makeTask({ id: '001-002', status: TaskStatus.EXECUTING }),
    ];
    const sprint = makeSprint({ tasks });
    const config = makeConfig({ '5hr': 0.8, weekly: 0.9 });

    // Step 1: usage spikes — should pause
    mockClaudeUsage(85, 60);
    const paused = checkAndAutoPause('/tmp/test', sprint, config);
    expect(paused).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);

    // Step 2: usage drops below resume threshold — should resume
    // Setup pause state for resume
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      sprintId: 'sprint-001',
      pausedAt: new Date().toISOString(),
      pausedTaskIds: ['001-001', '001-002'],
      reason: '5hr usage limit exceeded (85.0%)',
    }));

    mockClaudeUsage(60, 50); // 60% < 64% resume threshold
    const resumed = checkAndAutoResume('/tmp/test', sprint, config);
    expect(resumed).toBe(true);
    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('does not resume ACTIVE sprint even with low usage', () => {
    mockClaudeUsage(10, 10);
    const sprint = makeSprint({ status: SprintStatus.ACTIVE });
    const config = makeConfig();

    const result = checkAndAutoResume('/tmp/test', sprint, config);

    expect(result).toBe(false);
    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });
});
