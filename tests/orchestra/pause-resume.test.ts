import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus, SprintPhase, SprintStatus, AlertLevel,
} from '../../src/core/types.js';
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
    readJsonSafe: vi.fn().mockReturnValue(null),
    readFileSafe: vi.fn().mockReturnValue(''),
  };
});

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  clearHooks: vi.fn(),
  loadPluginHooks: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({ recommendedMaxWorkers: 4 }),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
}));

vi.mock('../../src/orchestra/model-selector.js', () => ({
  calculateModelScore: vi.fn(),
  inferModelFromDirective: vi.fn(),
  resolveTaskModel: vi.fn().mockReturnValue('sonnet'),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
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
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  trimMemoryWithHeader: vi.fn(),
  writeRetrospective: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({ totalTasks: 0, completedTasks: 0, techDebtTasks: 0, noGoTasks: 0, durationMs: 0, coveragePercent: 0, noGoRate: 0, newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0 }),
  updateProjectDocs: vi.fn(),
}));

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    getDefault: vi.fn().mockReturnValue({
      name: 'claude',
      buildCommand: vi.fn().mockReturnValue('claude --model opus /dev/null'),
    }),
    registerProvider: vi.fn(),
    getProvider: vi.fn(),
    listProviders: vi.fn().mockReturnValue([]),
    hasProvider: vi.fn().mockReturnValue(false),
    setDefault: vi.fn(),
  },
  ProviderError: class ProviderError extends Error {},
  getProviderForModel: vi.fn().mockReturnValue('claude'),
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { updateDashboard } from '../../src/monitor/auditor.js';
import { readJsonSafe } from '../../src/core/utils.js';

import {
  pauseSprint,
  resumeSprint,
  checkAndAutoPause,
} from '../../src/orchestra/brain.js';

const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedUpdateDashboard = vi.mocked(updateDashboard);
const mockedReadJsonSafe = vi.mocked(readJsonSafe);
const mockedSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(id: string, status: TaskStatus): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status,
    sprintId: 'sprint-001',
    createdAt: new Date().toISOString(),
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
}

function makeConfig(fiveHrPct: number = 0.5, weeklyPct: number = 0.3): ResolvedConfig {
  return {
    projectName: 'test',
    activeModeConfig: {
      max_workers: 4,
      default_model: 'sonnet',
      brain_model: 'opus',
      brain_planning: 'auto',
      haiku_allowed: false,
      usage_thresholds: { '5hr': fiveHrPct, weekly: weeklyPct },
    },
  } as unknown as ResolvedConfig;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('pauseSprint', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdirSync.mockReturnValue(undefined as unknown as ReturnType<typeof mkdirSync>);
  });

  it('transitions PENDING tasks to PAUSED', () => {
    const tasks = [makeTask('001', TaskStatus.PENDING), makeTask('002', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.PAUSED);
    expect(tasks[1].status).toBe(TaskStatus.PAUSED);
  });

  it('transitions EXECUTING tasks to PAUSED', () => {
    const tasks = [makeTask('001', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.PAUSED);
  });

  it('transitions CLAIMED, TESTING, DOCUMENTING tasks to PAUSED', () => {
    const tasks = [
      makeTask('001', TaskStatus.CLAIMED),
      makeTask('002', TaskStatus.TESTING),
      makeTask('003', TaskStatus.DOCUMENTING),
    ];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    for (const task of tasks) {
      expect(task.status).toBe(TaskStatus.PAUSED);
    }
  });

  it('does NOT pause DONE tasks', () => {
    const tasks = [makeTask('001', TaskStatus.DONE), makeTask('002', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    const result = pauseSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.DONE);
    expect(tasks[1].status).toBe(TaskStatus.PAUSED);
    expect(result.pausedTaskIds).toEqual(['002']);
  });

  it('does NOT pause NO_GO tasks', () => {
    const tasks = [makeTask('001', TaskStatus.NO_GO)];
    const sprint = makeSprint(tasks);

    const result = pauseSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.NO_GO);
    expect(result.pausedTaskIds).toHaveLength(0);
  });

  it('sets sprint status to PAUSED', () => {
    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('returns a PauseState with the correct sprintId and pausedTaskIds', () => {
    const tasks = [makeTask('001', TaskStatus.PENDING), makeTask('002', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    const result = pauseSprint(projectRoot, sprint, 'test reason');

    expect(result.sprintId).toBe('sprint-001');
    expect(result.reason).toBe('test reason');
    expect(result.pausedTaskIds).toEqual(['001', '002']);
    expect(result.pausedAt).toBeTruthy();
  });

  it('writes task JSON files for paused tasks', () => {
    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    // Should write task JSON and .paused marker
    const writeFileCalls = mockedWriteFileSync.mock.calls.map(c => c[0] as string);
    expect(writeFileCalls.some(p => p.includes('task-001.json'))).toBe(true);
    expect(writeFileCalls.some(p => p.includes('task-001.paused'))).toBe(true);
  });

  it('writes a .paused marker file with previousStatus', () => {
    const tasks = [makeTask('001', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const pausedWrite = mockedWriteFileSync.mock.calls.find(
      c => (c[0] as string).includes('task-001.paused'),
    );
    expect(pausedWrite).toBeDefined();
    const content = JSON.parse(pausedWrite![1] as string);
    expect(content.previousStatus).toBe(TaskStatus.EXECUTING);
    expect(content.taskId).toBe('001');
  });

  it('persists pause state to .deckent/pause-state.json', () => {
    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const writeFileCalls = mockedWriteFileSync.mock.calls.map(c => c[0] as string);
    expect(writeFileCalls.some(p => p.includes('pause-state.json'))).toBe(true);
  });

  it('updates dashboard with PAUSED sprint status', () => {
    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint, 'limit exceeded');

    expect(mockedUpdateDashboard).toHaveBeenCalled();
    const dashCall = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashCall.sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('includes an alert with the pause reason in dashboard update', () => {
    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint, 'Usage limit reached');

    const dashCall = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashCall.alerts[0].message).toContain('Usage limit reached');
    expect(dashCall.alerts[0].level).toBe(AlertLevel.WARNING);
  });

  it('handles empty task list gracefully', () => {
    const sprint = makeSprint([]);

    const result = pauseSprint(projectRoot, sprint);

    expect(result.pausedTaskIds).toHaveLength(0);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('uses "Manual pause" as default reason', () => {
    const sprint = makeSprint([]);

    const result = pauseSprint(projectRoot, sprint);

    expect(result.reason).toBe('Manual pause');
  });

  it('counts DONE tasks correctly in dashboard progress', () => {
    const tasks = [
      makeTask('001', TaskStatus.DONE),
      makeTask('002', TaskStatus.PENDING),
    ];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const dashCall = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashCall.progress.done).toBe(1);
    expect(dashCall.progress.blocked).toBe(1);
    expect(dashCall.progress.total).toBe(2);
  });

  it('continues gracefully when writeFileSync throws', () => {
    mockedWriteFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });

    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    expect(() => pauseSprint(projectRoot, sprint)).not.toThrow();
  });
});

describe('resumeSprint', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedReadJsonSafe.mockReturnValue(null);
  });

  it('transitions PAUSED tasks back to PENDING', () => {
    const tasks = [makeTask('001', TaskStatus.PAUSED), makeTask('002', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);
    sprint.status = SprintStatus.PAUSED;

    resumeSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.PENDING);
    expect(tasks[1].status).toBe(TaskStatus.PENDING);
  });

  it('does NOT modify non-PAUSED tasks', () => {
    const tasks = [makeTask('001', TaskStatus.DONE), makeTask('002', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.DONE);
    expect(tasks[1].status).toBe(TaskStatus.PENDING);
  });

  it('sets sprint status to ACTIVE', () => {
    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);
    sprint.status = SprintStatus.PAUSED;

    resumeSprint(projectRoot, sprint);

    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('writes updated task JSON for resumed tasks', () => {
    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    const writeFileCalls = mockedWriteFileSync.mock.calls.map(c => c[0] as string);
    expect(writeFileCalls.some(p => p.includes('task-001.json'))).toBe(true);
  });

  it('removes .paused marker files when they exist', () => {
    mockedExistsSync.mockImplementation((p) => (p as string).includes('.paused'));

    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(mockedUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('task-001.paused'),
    );
  });

  it('removes the pause-state.json file when it exists', () => {
    mockedExistsSync.mockImplementation((p) => (p as string).includes('pause-state.json'));

    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(mockedUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('pause-state.json'),
    );
  });

  it('updates dashboard with ACTIVE sprint status', () => {
    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(mockedUpdateDashboard).toHaveBeenCalled();
    const dashCall = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashCall.sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('returns the previously saved PauseState', () => {
    const savedState = {
      sprintId: 'sprint-001',
      pausedAt: '2026-01-01T00:00:00.000Z',
      pausedTaskIds: ['001'],
      reason: 'test reason',
    };
    // readJsonSafe is now imported from core/utils.js — mock it to return the saved state
    mockedReadJsonSafe.mockReturnValueOnce(savedState);

    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    const result = resumeSprint(projectRoot, sprint);

    expect(result).toEqual(savedState);
  });

  it('returns null when no saved pause state exists', () => {
    mockedReadJsonSafe.mockReturnValue(null);

    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    const result = resumeSprint(projectRoot, sprint);

    expect(result).toBeNull();
  });

  it('handles empty task list gracefully', () => {
    const sprint = makeSprint([]);
    sprint.status = SprintStatus.PAUSED;

    expect(() => resumeSprint(projectRoot, sprint)).not.toThrow();
    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('correctly reflects active task count in dashboard progress', () => {
    const tasks = [
      makeTask('001', TaskStatus.PAUSED),
      makeTask('002', TaskStatus.PAUSED),
      makeTask('003', TaskStatus.DONE),
    ];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    const dashCall = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashCall.progress.active).toBe(2);
    expect(dashCall.progress.done).toBe(1);
    expect(dashCall.progress.blocked).toBe(0);
  });

  it('continues gracefully when unlinkSync throws', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedUnlinkSync.mockImplementation(() => { throw new Error('permission denied'); });

    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    expect(() => resumeSprint(projectRoot, sprint)).not.toThrow();
  });
});

describe('checkAndAutoPause', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdirSync.mockReturnValue(undefined as unknown as ReturnType<typeof mkdirSync>);
  });

  function mockUsageOutput(fiveHrPct: number, weeklyPct: number): void {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: `5hr: ${fiveHrPct}%\nweekly: ${weeklyPct}%`,
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);
  }

  it('returns false and does not pause when usage is below thresholds', () => {
    // Config thresholds: 5hr=80%, weekly=70%
    const config = makeConfig(0.8, 0.7);
    mockUsageOutput(50, 40);

    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    const result = checkAndAutoPause(projectRoot, sprint, config);

    expect(result).toBe(false);
    expect(sprint.status).toBe(SprintStatus.ACTIVE);
    expect(tasks[0].status).toBe(TaskStatus.PENDING);
  });

  it('pauses when 5hr usage exceeds threshold', () => {
    const config = makeConfig(0.8, 0.9); // thresholds: 80% and 90%
    mockUsageOutput(85, 40); // 5hr at 85% — exceeded

    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    const result = checkAndAutoPause(projectRoot, sprint, config);

    expect(result).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
    expect(tasks[0].status).toBe(TaskStatus.PAUSED);
  });

  it('pauses when weekly usage exceeds threshold', () => {
    const config = makeConfig(0.9, 0.7); // thresholds: 90% and 70%
    mockUsageOutput(50, 75); // weekly at 75% — exceeded

    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    const result = checkAndAutoPause(projectRoot, sprint, config);

    expect(result).toBe(true);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('includes 5hr usage info in pause reason', () => {
    const config = makeConfig(0.8, 0.9);
    mockUsageOutput(85, 40);

    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    checkAndAutoPause(projectRoot, sprint, config);

    // Check that writeFileSync was called with pause state containing the reason
    const pauseStateWrite = mockedWriteFileSync.mock.calls.find(
      c => (c[0] as string).includes('pause-state.json'),
    );
    expect(pauseStateWrite).toBeDefined();
    const state = JSON.parse(pauseStateWrite![1] as string);
    expect(state.reason).toContain('5hr usage limit exceeded');
  });

  it('includes weekly usage info in pause reason when weekly exceeded', () => {
    const config = makeConfig(0.99, 0.7);
    mockUsageOutput(50, 75);

    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    checkAndAutoPause(projectRoot, sprint, config);

    const pauseStateWrite = mockedWriteFileSync.mock.calls.find(
      c => (c[0] as string).includes('pause-state.json'),
    );
    const state = JSON.parse(pauseStateWrite![1] as string);
    expect(state.reason).toContain('Weekly usage limit exceeded');
  });

  it('pauses when both thresholds are exceeded (prioritizes 5hr message)', () => {
    const config = makeConfig(0.8, 0.7);
    mockUsageOutput(90, 80); // both exceeded

    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    const result = checkAndAutoPause(projectRoot, sprint, config);

    expect(result).toBe(true);
    // 5hr is checked first, so the reason should mention 5hr
    const pauseStateWrite = mockedWriteFileSync.mock.calls.find(
      c => (c[0] as string).includes('pause-state.json'),
    );
    const state = JSON.parse(pauseStateWrite![1] as string);
    expect(state.reason).toContain('5hr');
  });

  it('returns false when claude command fails to report usage', () => {
    const config = makeConfig(0.8, 0.7);
    mockedSpawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'error',
      pid: 1,
      output: [],
      signal: null,
    } as ReturnType<typeof spawnSync>);

    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    // With safe defaults (50% / 30%) and thresholds (80% / 70%), should NOT pause
    const result = checkAndAutoPause(projectRoot, sprint, config);

    expect(result).toBe(false);
  });
});

describe('pauseSprint + resumeSprint roundtrip', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdirSync.mockReturnValue(undefined as unknown as ReturnType<typeof mkdirSync>);
  });

  it('tasks go PENDING → PAUSED → PENDING after pause/resume', () => {
    const tasks = [makeTask('001', TaskStatus.PENDING), makeTask('002', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.PAUSED);
    expect(tasks[1].status).toBe(TaskStatus.PAUSED);
    expect(sprint.status).toBe(SprintStatus.PAUSED);

    resumeSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.PENDING);
    expect(tasks[1].status).toBe(TaskStatus.PENDING);
    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('DONE tasks remain DONE through the full pause/resume cycle', () => {
    const tasks = [
      makeTask('001', TaskStatus.DONE),
      makeTask('002', TaskStatus.PENDING),
    ];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);
    resumeSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.DONE);
    expect(tasks[1].status).toBe(TaskStatus.PENDING);
  });
});
