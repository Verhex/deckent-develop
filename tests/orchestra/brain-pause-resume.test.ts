/**
 * brain-pause-resume.test.ts
 *
 * Real-environment validation of pauseSprint and resumeSprint.
 * Covers:
 *  1. pauseSprint stops all active workers (tmux killWorker + IPC PAUSE)
 *  2. .paused marker files written in correct format
 *  3. resumeSprint PAUSED → PENDING transition
 *  4. IPC RESUME sent to subprocess workers on resume
 *  5. Dashboard shows PAUSED phase/status
 */

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
    readJsonSafe: vi.fn().mockReturnValue(null),
    readFileSafe: vi.fn().mockReturnValue(''),
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

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  clearHooks: vi.fn(),
  loadPluginHooks: vi.fn().mockResolvedValue(0),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runCiRegressionCheck: vi.fn().mockReturnValue({ regressionDetected: false }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true, baselineSaved: false }),
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
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
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
  calculateMetrics: vi.fn().mockReturnValue({
    totalTasks: 0, completedTasks: 0, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 0, coveragePercent: 0, noGoRate: 0, newDebtCount: 0,
    resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  }),
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

// ─── Imports after mocks ─────────────────────────────────────────────

import { writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { updateDashboard } from '../../src/monitor/auditor.js';
import { killWorker } from '../../src/orchestra/tmux.js';
import { readJsonSafe } from '../../src/core/utils.js';

import {
  pauseSprint,
  resumeSprint,
  getChannelRegistry,
} from '../../src/orchestra/brain.js';

const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedUpdateDashboard = vi.mocked(updateDashboard);
const mockedKillWorker = vi.mocked(killWorker);
const mockedReadJsonSafe = vi.mocked(readJsonSafe);

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

function makeConfig(): ResolvedConfig {
  return {
    projectName: 'test',
    activeModeConfig: {
      max_workers: 4,
      default_model: 'claude-sonnet-5',
      brain_model: 'claude-opus-4-8',
      brain_planning: 'auto',
      haiku_allowed: false,
    },
  } as unknown as ResolvedConfig;
}

/** Creates a mock WorkerChannel and registers it in the module's ChannelRegistry. */
function registerMockChannel(taskId: string) {
  const channel = {
    send: vi.fn().mockReturnValue(true),
    onMessage: vi.fn(),
    close: vi.fn(),
    pause: vi.fn().mockReturnValue(true),
    resume: vi.fn().mockReturnValue(true),
  };
  getChannelRegistry().register(taskId, channel as never);
  return channel;
}

// ─── pauseSprint — worker-stopping behavior ──────────────────────────

describe('pauseSprint — stops active workers', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdirSync.mockReturnValue(undefined as unknown as ReturnType<typeof mkdirSync>);
    // Clear the channel registry between tests
    getChannelRegistry().clear?.();
  });

  it('calls killWorker for EXECUTING tasks without an IPC channel (tmux backend)', () => {
    const tasks = [makeTask('001', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(mockedKillWorker).toHaveBeenCalledWith('001');
  });

  it('calls killWorker for PENDING tasks without an IPC channel', () => {
    const tasks = [makeTask('002', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(mockedKillWorker).toHaveBeenCalledWith('002');
  });

  it('calls killWorker for CLAIMED tasks without an IPC channel', () => {
    const tasks = [makeTask('003', TaskStatus.CLAIMED)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(mockedKillWorker).toHaveBeenCalledWith('003');
  });

  it('calls killWorker for TESTING and DOCUMENTING tasks without an IPC channel', () => {
    const tasks = [
      makeTask('004', TaskStatus.TESTING),
      makeTask('005', TaskStatus.DOCUMENTING),
    ];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(mockedKillWorker).toHaveBeenCalledWith('004');
    expect(mockedKillWorker).toHaveBeenCalledWith('005');
  });

  it('does NOT call killWorker when an IPC channel is registered (subprocess backend)', () => {
    const channel = registerMockChannel('010');
    const tasks = [makeTask('010', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(mockedKillWorker).not.toHaveBeenCalledWith('010');
    expect(channel.pause).toHaveBeenCalled();
  });

  it('sends IPC PAUSE via channel for subprocess backend workers', () => {
    const channel = registerMockChannel('011');
    const tasks = [makeTask('011', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(channel.pause).toHaveBeenCalledTimes(1);
  });

  it('does NOT call killWorker for DONE tasks', () => {
    const tasks = [makeTask('099', TaskStatus.DONE)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(mockedKillWorker).not.toHaveBeenCalledWith('099');
  });

  it('does NOT call killWorker for NO_GO tasks', () => {
    const tasks = [makeTask('098', TaskStatus.NO_GO)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(mockedKillWorker).not.toHaveBeenCalledWith('098');
  });

  it('continues gracefully when killWorker throws', () => {
    mockedKillWorker.mockImplementationOnce(() => { throw new Error('session not found'); });
    const tasks = [makeTask('012', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    expect(() => pauseSprint(projectRoot, sprint)).not.toThrow();
    expect(tasks[0].status).toBe(TaskStatus.PAUSED);
  });

  it('kills multiple tmux workers in a single pause call', () => {
    const tasks = [
      makeTask('020', TaskStatus.EXECUTING),
      makeTask('021', TaskStatus.PENDING),
      makeTask('022', TaskStatus.TESTING),
    ];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(mockedKillWorker).toHaveBeenCalledTimes(3);
    expect(mockedKillWorker).toHaveBeenCalledWith('020');
    expect(mockedKillWorker).toHaveBeenCalledWith('021');
    expect(mockedKillWorker).toHaveBeenCalledWith('022');
  });
});

// ─── pauseSprint — .paused file format ──────────────────────────────

describe('pauseSprint — .paused file format', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdirSync.mockReturnValue(undefined as unknown as ReturnType<typeof mkdirSync>);
    getChannelRegistry().clear?.();
  });

  it('writes .paused marker with taskId, previousStatus, and pausedAt', () => {
    const tasks = [makeTask('030', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const call = mockedWriteFileSync.mock.calls.find(
      c => (c[0] as string).includes('task-030.paused'),
    );
    expect(call).toBeDefined();
    const content = JSON.parse(call![1] as string);
    expect(content.taskId).toBe('030');
    expect(content.previousStatus).toBe(TaskStatus.EXECUTING);
    expect(typeof content.pausedAt).toBe('string');
    expect(content.pausedAt.length).toBeGreaterThan(0);
  });

  it('records PENDING as previousStatus when task was PENDING', () => {
    const tasks = [makeTask('031', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const call = mockedWriteFileSync.mock.calls.find(
      c => (c[0] as string).includes('task-031.paused'),
    );
    const content = JSON.parse(call![1] as string);
    expect(content.previousStatus).toBe(TaskStatus.PENDING);
  });

  it('records TESTING as previousStatus when task was TESTING', () => {
    const tasks = [makeTask('032', TaskStatus.TESTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const call = mockedWriteFileSync.mock.calls.find(
      c => (c[0] as string).includes('task-032.paused'),
    );
    const content = JSON.parse(call![1] as string);
    expect(content.previousStatus).toBe(TaskStatus.TESTING);
  });

  it('writes task JSON with PAUSED status alongside .paused marker', () => {
    const tasks = [makeTask('033', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const jsonCall = mockedWriteFileSync.mock.calls.find(
      c => (c[0] as string).includes('task-033.json'),
    );
    expect(jsonCall).toBeDefined();
    const task = JSON.parse(jsonCall![1] as string);
    expect(task.status).toBe(TaskStatus.PAUSED);
  });
});

// ─── pauseSprint — dashboard ─────────────────────────────────────────

describe('pauseSprint — dashboard shows PAUSED state', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdirSync.mockReturnValue(undefined as unknown as ReturnType<typeof mkdirSync>);
    getChannelRegistry().clear?.();
  });

  it('calls updateDashboard with SprintStatus.PAUSED', () => {
    const tasks = [makeTask('040', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint, 'Limit exceeded');

    expect(mockedUpdateDashboard).toHaveBeenCalled();
    const dashState = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashState.sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('dashboard preserves sprint phase during pause', () => {
    const tasks = [makeTask('041', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);
    sprint.phase = SprintPhase.EXECUTE;

    pauseSprint(projectRoot, sprint);

    const dashState = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashState.sprint.phase).toBe(SprintPhase.EXECUTE);
  });

  it('dashboard alert level is WARNING with the pause reason', () => {
    const tasks = [makeTask('042', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint, 'Weekly budget reached');

    const dashState = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashState.alerts).toHaveLength(1);
    expect(dashState.alerts[0].level).toBe(AlertLevel.WARNING);
    expect(dashState.alerts[0].message).toContain('Weekly budget reached');
  });

  it('dashboard progress.active is 0 after pause', () => {
    const tasks = [makeTask('043', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const dashState = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashState.progress.active).toBe(0);
  });

  it('dashboard progress.blocked equals number of paused tasks', () => {
    const tasks = [
      makeTask('044', TaskStatus.EXECUTING),
      makeTask('045', TaskStatus.PENDING),
      makeTask('046', TaskStatus.DONE), // should not be counted
    ];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const dashState = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashState.progress.blocked).toBe(2);
    expect(dashState.progress.done).toBe(1);
  });
});

// ─── resumeSprint — PAUSED → PENDING transition ──────────────────────

describe('resumeSprint — PAUSED → PENDING transition', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedReadJsonSafe.mockReturnValue(null);
    getChannelRegistry().clear?.();
  });

  it('transitions all PAUSED tasks to PENDING', () => {
    const tasks = [
      makeTask('050', TaskStatus.PAUSED),
      makeTask('051', TaskStatus.PAUSED),
    ];
    const sprint = makeSprint(tasks);
    sprint.status = SprintStatus.PAUSED;

    resumeSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.PENDING);
    expect(tasks[1].status).toBe(TaskStatus.PENDING);
  });

  it('leaves DONE tasks unchanged on resume', () => {
    const tasks = [
      makeTask('052', TaskStatus.DONE),
      makeTask('053', TaskStatus.PAUSED),
    ];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.DONE);
    expect(tasks[1].status).toBe(TaskStatus.PENDING);
  });

  it('leaves NO_GO tasks unchanged on resume', () => {
    const tasks = [
      makeTask('054', TaskStatus.NO_GO),
      makeTask('055', TaskStatus.PAUSED),
    ];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.NO_GO);
    expect(tasks[1].status).toBe(TaskStatus.PENDING);
  });

  it('sets sprint status to ACTIVE after resume', () => {
    const tasks = [makeTask('056', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);
    sprint.status = SprintStatus.PAUSED;

    resumeSprint(projectRoot, sprint);

    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('writes updated task JSON with PENDING status', () => {
    const tasks = [makeTask('057', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    const jsonCall = mockedWriteFileSync.mock.calls.find(
      c => (c[0] as string).includes('task-057.json'),
    );
    expect(jsonCall).toBeDefined();
    const task = JSON.parse(jsonCall![1] as string);
    expect(task.status).toBe(TaskStatus.PENDING);
  });

  it('removes .paused marker file for each resumed task', () => {
    mockedExistsSync.mockImplementation((p) => (p as string).includes('.paused'));
    const tasks = [makeTask('058', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(mockedUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('task-058.paused'),
    );
  });

  it('removes pause-state.json on resume', () => {
    mockedExistsSync.mockImplementation((p) => (p as string).includes('pause-state.json'));
    const tasks = [makeTask('059', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(mockedUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('pause-state.json'),
    );
  });
});

// ─── resumeSprint — IPC RESUME for subprocess backend ────────────────

describe('resumeSprint — IPC RESUME signal', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedReadJsonSafe.mockReturnValue(null);
    getChannelRegistry().clear?.();
  });

  it('sends IPC RESUME to subprocess workers that have a registered channel', () => {
    const channel = registerMockChannel('060');
    const tasks = [makeTask('060', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(channel.resume).toHaveBeenCalledTimes(1);
  });

  it('sends IPC RESUME to all subprocess workers', () => {
    const ch1 = registerMockChannel('061');
    const ch2 = registerMockChannel('062');
    const tasks = [
      makeTask('061', TaskStatus.PAUSED),
      makeTask('062', TaskStatus.PAUSED),
    ];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(ch1.resume).toHaveBeenCalledTimes(1);
    expect(ch2.resume).toHaveBeenCalledTimes(1);
  });

  it('does NOT send RESUME for DONE tasks even if channel exists', () => {
    const channel = registerMockChannel('063');
    const tasks = [makeTask('063', TaskStatus.DONE)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(channel.resume).not.toHaveBeenCalled();
  });

  it('continues gracefully when IPC resume throws', () => {
    const channel = registerMockChannel('064');
    (channel.resume as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('channel closed');
    });
    const tasks = [makeTask('064', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    expect(() => resumeSprint(projectRoot, sprint)).not.toThrow();
    expect(tasks[0].status).toBe(TaskStatus.PENDING);
  });

  it('does not send RESUME when no IPC channel registered (tmux backend)', () => {
    // No channel registered for task 065
    const tasks = [makeTask('065', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    // No IPC calls expected — tmux workers re-spawn through sprint loop
    expect(mockedUpdateDashboard).toHaveBeenCalled();
    expect(tasks[0].status).toBe(TaskStatus.PENDING);
  });
});

// ─── resumeSprint — dashboard ────────────────────────────────────────

describe('resumeSprint — dashboard shows ACTIVE state', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedReadJsonSafe.mockReturnValue(null);
    getChannelRegistry().clear?.();
  });

  it('calls updateDashboard with SprintStatus.ACTIVE', () => {
    const tasks = [makeTask('070', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(mockedUpdateDashboard).toHaveBeenCalled();
    const dashState = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashState.sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('dashboard progress.active equals number of resumed tasks', () => {
    const tasks = [
      makeTask('071', TaskStatus.PAUSED),
      makeTask('072', TaskStatus.PAUSED),
      makeTask('073', TaskStatus.DONE),
    ];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    const dashState = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashState.progress.active).toBe(2);
  });

  it('dashboard progress.blocked is 0 after resume', () => {
    const tasks = [makeTask('074', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    const dashState = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashState.progress.blocked).toBe(0);
  });

  it('dashboard alerts are empty after successful resume', () => {
    const tasks = [makeTask('075', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    const dashState = mockedUpdateDashboard.mock.calls[0][1];
    expect(dashState.alerts).toHaveLength(0);
  });
});

// ─── Full pause/resume roundtrip ─────────────────────────────────────

describe('pause/resume roundtrip', () => {
  const projectRoot = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdirSync.mockReturnValue(undefined as unknown as ReturnType<typeof mkdirSync>);
    mockedReadJsonSafe.mockReturnValue(null);
    getChannelRegistry().clear?.();
  });

  it('EXECUTING → PAUSED → PENDING full cycle (tmux worker gets killed then must re-spawn)', () => {
    const tasks = [makeTask('080', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);
    expect(tasks[0].status).toBe(TaskStatus.PAUSED);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
    expect(mockedKillWorker).toHaveBeenCalledWith('080');

    resumeSprint(projectRoot, sprint);
    expect(tasks[0].status).toBe(TaskStatus.PENDING);
    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });

  it('IPC subprocess: pause sends PAUSE, resume sends RESUME', () => {
    const channel = registerMockChannel('081');
    const tasks = [makeTask('081', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);
    expect(channel.pause).toHaveBeenCalledTimes(1);
    expect(mockedKillWorker).not.toHaveBeenCalledWith('081');

    resumeSprint(projectRoot, sprint);
    expect(channel.resume).toHaveBeenCalledTimes(1);
  });

  it('DONE tasks survive the full pause/resume cycle unchanged', () => {
    const tasks = [
      makeTask('082', TaskStatus.DONE),
      makeTask('083', TaskStatus.PENDING),
    ];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);
    resumeSprint(projectRoot, sprint);

    expect(tasks[0].status).toBe(TaskStatus.DONE);
    expect(tasks[1].status).toBe(TaskStatus.PENDING);
  });

  it('mixed tmux+IPC workers: each handled correctly', () => {
    const channel = registerMockChannel('084');
    const tasks = [
      makeTask('084', TaskStatus.EXECUTING), // IPC (subprocess)
      makeTask('085', TaskStatus.EXECUTING), // tmux
    ];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    expect(channel.pause).toHaveBeenCalledTimes(1);
    expect(mockedKillWorker).toHaveBeenCalledWith('085');
    expect(mockedKillWorker).not.toHaveBeenCalledWith('084');

    resumeSprint(projectRoot, sprint);

    expect(channel.resume).toHaveBeenCalledTimes(1);
  });
});

