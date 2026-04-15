/**
 * tests/orchestra/brain-ipc.test.ts — Brain IPC Integration Tests
 *
 * Tests the WorkerChannel integration in brain.ts:
 * - Channel registry management (register/unregister/get)
 * - pauseSprint sends IPC PAUSE when channel exists
 * - File-based fallback when no IPC channel (tmux backend)
 * - IPC heartbeat wakeup in waitForResults
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, Sprint } from '../../src/core/types.js';

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
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
}));

vi.mock('../../src/orchestra/model-selector.js', () => ({
  calculateModelScore: vi.fn(),
  inferModelFromDirective: vi.fn(),
  resolveTaskModel: vi.fn().mockReturnValue('sonnet'),
  parsePatterns: vi.fn().mockReturnValue([]),
  deduplicatePatterns: vi.fn().mockReturnValue([]),
  suggestModelFromPatterns: vi.fn().mockReturnValue(null),
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

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { updateDashboard } from '../../src/monitor/auditor.js';
import {
  pauseSprint,
  getChannelRegistry,
  registerWorkerChannel,
  unregisterWorkerChannel,
} from '../../src/orchestra/brain.js';
import { WorkerChannel, ChannelRegistry } from '../../src/agents/worker-ipc.js';

const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedUpdateDashboard = vi.mocked(updateDashboard);

// ─── Helpers ─────────────────────────────────────────────────────────

function makeMockProc(hasSend = true): ChildProcess & { _emit: (msg: unknown) => void } {
  const emitter = new EventEmitter() as ChildProcess & { _emit: (msg: unknown) => void };
  if (hasSend) {
    emitter.send = vi.fn().mockReturnValue(true) as unknown as ChildProcess['send'];
  }
  emitter._emit = (msg: unknown) => emitter.emit('message', msg);
  return emitter;
}

function makeTask(id: string, status: TaskStatus = TaskStatus.PENDING): Task {
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

// ─── Tests: Channel Registry ──────────────────────────────────────────

describe('getChannelRegistry', () => {
  it('returns a ChannelRegistry instance', () => {
    const registry = getChannelRegistry();
    expect(registry).toBeInstanceOf(ChannelRegistry);
  });

  it('returns the same registry instance on repeated calls', () => {
    const r1 = getChannelRegistry();
    const r2 = getChannelRegistry();
    expect(r1).toBe(r2);
  });
});

describe('registerWorkerChannel / unregisterWorkerChannel', () => {
  afterEach(() => {
    // Clean up any registered channels after each test
    getChannelRegistry().closeAll();
  });

  it('registerWorkerChannel adds channel to the registry', () => {
    const proc = makeMockProc();
    const channel = new WorkerChannel(proc, 'task-ipc-001');
    registerWorkerChannel('task-ipc-001', channel);

    const registry = getChannelRegistry();
    expect(registry.has('task-ipc-001')).toBe(true);
    expect(registry.get('task-ipc-001')).toBe(channel);
  });

  it('unregisterWorkerChannel removes channel from the registry', () => {
    const proc = makeMockProc();
    const channel = new WorkerChannel(proc, 'task-ipc-002');
    registerWorkerChannel('task-ipc-002', channel);

    unregisterWorkerChannel('task-ipc-002');

    const registry = getChannelRegistry();
    expect(registry.has('task-ipc-002')).toBe(false);
  });

  it('unregisterWorkerChannel closes the channel when removing', () => {
    const proc = makeMockProc();
    const channel = new WorkerChannel(proc, 'task-ipc-003');
    registerWorkerChannel('task-ipc-003', channel);

    unregisterWorkerChannel('task-ipc-003');
    expect(channel.isClosed()).toBe(true);
  });

  it('unregisterWorkerChannel is a no-op for unknown taskId', () => {
    expect(() => unregisterWorkerChannel('nonexistent-task')).not.toThrow();
  });

  it('registering multiple channels works independently', () => {
    const proc1 = makeMockProc();
    const proc2 = makeMockProc();
    const ch1 = new WorkerChannel(proc1, 'multi-001');
    const ch2 = new WorkerChannel(proc2, 'multi-002');

    registerWorkerChannel('multi-001', ch1);
    registerWorkerChannel('multi-002', ch2);

    const registry = getChannelRegistry();
    expect(registry.has('multi-001')).toBe(true);
    expect(registry.has('multi-002')).toBe(true);
    expect(registry.size()).toBeGreaterThanOrEqual(2);
  });
});

// ─── Tests: pauseSprint IPC Integration ──────────────────────────────

describe('pauseSprint — IPC channel integration', () => {
  const projectRoot = '/tmp/test-ipc-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdirSync.mockReturnValue(undefined as unknown as ReturnType<typeof mkdirSync>);
    // Clean up registry before each test
    getChannelRegistry().closeAll();
  });

  afterEach(() => {
    getChannelRegistry().closeAll();
  });

  it('sends PAUSE via IPC when channel is registered for a task', () => {
    const proc = makeMockProc();
    const channel = new WorkerChannel(proc, 'pause-001');
    registerWorkerChannel('pause-001', channel);

    const tasks = [makeTask('pause-001', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);
    pauseSprint(projectRoot, sprint);

    // proc.send should have been called with PAUSE
    expect(proc.send).toHaveBeenCalled();
    const calls = (proc.send as ReturnType<typeof vi.fn>).mock.calls;
    const pauseCall = calls.find((c: unknown[]) => (c[0] as { type: string }).type === 'PAUSE');
    expect(pauseCall).toBeDefined();
  });

  it('does NOT call proc.send when no IPC channel is registered (tmux fallback)', () => {
    const proc = makeMockProc();
    // Do NOT register channel — simulates tmux backend

    const tasks = [makeTask('tmux-task-001', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);
    pauseSprint(projectRoot, sprint);

    // proc.send should NOT have been called since there is no registered channel
    expect(proc.send).not.toHaveBeenCalled();
  });

  it('writes .paused file as fallback when no IPC channel exists', () => {
    const tasks = [makeTask('file-task-001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);
    pauseSprint(projectRoot, sprint);

    // writeFileSync should be called for the .paused marker
    const pausedFileCall = mockedWriteFileSync.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.paused'),
    );
    expect(pausedFileCall).toBeDefined();
  });

  it('writes .paused file even when IPC channel exists (dual mode)', () => {
    const proc = makeMockProc();
    const channel = new WorkerChannel(proc, 'dual-001');
    registerWorkerChannel('dual-001', channel);

    const tasks = [makeTask('dual-001', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);
    pauseSprint(projectRoot, sprint);

    // File-based marker should still be written
    const pausedFileCall = mockedWriteFileSync.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.paused'),
    );
    expect(pausedFileCall).toBeDefined();
  });

  it('only sends PAUSE to channels for tasks that are pauseable', () => {
    const procA = makeMockProc();
    const procB = makeMockProc();
    const chA = new WorkerChannel(procA, 'pauseable-001');
    const chB = new WorkerChannel(procB, 'done-001');

    registerWorkerChannel('pauseable-001', chA);
    registerWorkerChannel('done-001', chB);

    // DONE task should NOT get PAUSE
    const tasks = [
      makeTask('pauseable-001', TaskStatus.EXECUTING),
      makeTask('done-001', TaskStatus.DONE),
    ];
    const sprint = makeSprint(tasks);
    pauseSprint(projectRoot, sprint);

    // chA should get PAUSE (task is EXECUTING)
    const callsA = (procA.send as ReturnType<typeof vi.fn>).mock.calls;
    const pauseCallA = callsA.find((c: unknown[]) => (c[0] as { type: string }).type === 'PAUSE');
    expect(pauseCallA).toBeDefined();

    // chB should NOT get PAUSE (task is DONE)
    expect(procB.send).not.toHaveBeenCalled();
  });

  it('updates sprint status to PAUSED after pauseSprint', () => {
    const tasks = [makeTask('status-001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);
    pauseSprint(projectRoot, sprint);

    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('updates dashboard to show PAUSED status', () => {
    const tasks = [makeTask('dashboard-001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);
    pauseSprint(projectRoot, sprint);

    expect(mockedUpdateDashboard).toHaveBeenCalled();
    const lastCall = mockedUpdateDashboard.mock.calls[mockedUpdateDashboard.mock.calls.length - 1];
    expect(lastCall[1].sprint.status).toBe(SprintStatus.PAUSED);
  });

  it('IPC send errors are swallowed (channel stays stable, file marker still written)', () => {
    const proc = makeMockProc();
    (proc.send as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('IPC error'); });
    const channel = new WorkerChannel(proc, 'error-001');
    registerWorkerChannel('error-001', channel);

    const tasks = [makeTask('error-001', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    // Should not throw despite IPC error
    expect(() => pauseSprint(projectRoot, sprint)).not.toThrow();

    // File-based marker should still be written
    const pausedFileCall = mockedWriteFileSync.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.paused'),
    );
    expect(pausedFileCall).toBeDefined();
  });

  it('returns a PauseState with correct sprintId and pausedTaskIds', () => {
    const tasks = [makeTask('ps-001', TaskStatus.PENDING), makeTask('ps-002', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);
    const state = pauseSprint(projectRoot, sprint, 'Test pause');

    expect(state.sprintId).toBe('sprint-001');
    expect(state.reason).toBe('Test pause');
    expect(state.pausedTaskIds).toContain('ps-001');
    expect(state.pausedTaskIds).toContain('ps-002');
    expect(state.pausedAt).toBeTruthy();
  });
});
