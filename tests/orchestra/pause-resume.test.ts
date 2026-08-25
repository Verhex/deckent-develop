import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  TaskStatus, SprintPhase, SprintStatus, AlertLevel,
} from '../../src/core/types.js';
import type { Task, Sprint } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

// ─── REAL FILESYSTEM (FAZ4A-S3) ─────────────────────────────────────
// The node:fs mock is deliberately GONE. pauseSprint/resumeSprint end with
// publishCanonicalRunStatusReadModel — an atomic publication ring
// (write temp → renameSync → read back → digest compare) that verifies its own
// writes; a mocked fs cannot carry that round-trip (RunStatusReadModelError
// PERSIST_FAILED). Same root cause + fix as FAZ4A-S2 (finalize-sprint /
// sprint-finalizer). Each test gets a real scratch project root under tmpdir.

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
    // readJsonSafe / readFileSafe stay REAL: resumeSprint loads
    // .deckent/pause-state.json through readJsonSafe and the tests now feed it
    // real files instead of mock return values.
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
  // 2026-08-25 read-model fixRetry resolution: publishCanonicalRunStatusReadModel now
  // resolves max_fix_retries via getLoadedConfig(projectRoot) ?? DEFAULT_MAX_FIX_RETRIES.
  getLoadedConfig: vi.fn(() => undefined),
  DEFAULT_MAX_FIX_RETRIES: 2,
}));

vi.mock('../../src/orchestra/model-selector.js', () => ({
  calculateModelScore: vi.fn(),
  inferModelFromDirective: vi.fn(),
  resolveTaskModel: vi.fn().mockReturnValue('sonnet'),
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

// pause/resume dispatch human-gate notifications through connectors; that
// subsystem stays module-boundary-mocked (no network / messaging side effects).
vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn(async () => undefined),
  notifyProgress: vi.fn(async () => undefined),
  notifyAsync: vi.fn(),
}));

import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateDashboard } from '../../src/monitor/auditor.js';

import {
  pauseSprint,
  resumeSprint,
} from '../../src/orchestra/brain.js';

const mockedUpdateDashboard = vi.mocked(updateDashboard);

// ─── Helpers ────────────────────────────────────────────────────────

// Real per-file scratch root — assigned fresh in each describe's beforeEach.
let PROJECT_ROOT = '';
function freshProjectRoot(): string {
  if (PROJECT_ROOT) rmSync(PROJECT_ROOT, { recursive: true, force: true });
  PROJECT_ROOT = mkdtempSync(join(tmpdir(), 'deckent-pause-'));
  mkdirSync(join(PROJECT_ROOT, '.tasks'), { recursive: true });
  mkdirSync(join(PROJECT_ROOT, '.deckent', 'pids'), { recursive: true });
  // A live coordinator PID authority: resumeSprint's terminal read-model
  // publication requires canonical lifecycle ACTIVE, which production only
  // derives when the coordinator process is alive (run-status-authority.ts).
  writeFileSync(
    join(PROJECT_ROOT, '.deckent', 'pids', 'sprint-001.pid'),
    JSON.stringify({
      pid: process.pid,
      startToken: 'test-start-token',
      startedAt: new Date().toISOString(),
    }, null, 2),
    'utf-8',
  );
  return PROJECT_ROOT;
}

afterAll(() => {
  if (PROJECT_ROOT) rmSync(PROJECT_ROOT, { recursive: true, force: true });
});

function readJsonFile(path: string): any {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

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

/** A complete on-disk PauseState mirroring what pauseSprint persists (schema v2). */
function makeSavedPauseState() {
  return {
    schemaVersion: 2,
    sprintId: 'sprint-001',
    pausedAt: '2026-01-01T00:00:00.000Z',
    pausedTaskIds: ['001'],
    reason: 'test reason',
    reasonCode: 'manual-pause',
    phase: SprintPhase.EXECUTE,
    status: 'PAUSED',
    recoveryCommand: 'deckent recover sprint-001 --resume',
    finalizeCommand: 'deckent finalize --sprint sprint-001 --force',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('pauseSprint', () => {
  let projectRoot = '';

  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = freshProjectRoot();
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

    // Real files: task JSON (PAUSED) and .paused marker must exist on disk.
    const taskJsonPath = join(projectRoot, '.tasks', 'task-001.json');
    const pausedMarkerPath = join(projectRoot, '.tasks', 'task-001.paused');
    expect(existsSync(taskJsonPath)).toBe(true);
    expect(existsSync(pausedMarkerPath)).toBe(true);
    expect(readJsonFile(taskJsonPath).status).toBe(TaskStatus.PAUSED);
  });

  it('writes a .paused marker file with previousStatus', () => {
    const tasks = [makeTask('001', TaskStatus.EXECUTING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const marker = readJsonFile(join(projectRoot, '.tasks', 'task-001.paused'));
    expect(marker.previousStatus).toBe(TaskStatus.EXECUTING);
    expect(marker.taskId).toBe('001');
  });

  it('persists pause state to .deckent/pause-state.json', () => {
    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    pauseSprint(projectRoot, sprint);

    const pauseStatePath = join(projectRoot, '.deckent', 'pause-state.json');
    expect(existsSync(pauseStatePath)).toBe(true);
    const persisted = readJsonFile(pauseStatePath);
    expect(persisted.sprintId).toBe('sprint-001');
    expect(persisted.pausedTaskIds).toEqual(['001']);
    expect(persisted.status).toBe('PAUSED');
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

  it('continues gracefully when the task JSON write fails', () => {
    // Real-fs failure injection: pre-create task-001.json as a DIRECTORY so
    // production's writeFileSync throws EISDIR exactly on the task-file write
    // (previously simulated with mockImplementationOnce(() => throw 'disk full')).
    mkdirSync(join(projectRoot, '.tasks', 'task-001.json'));

    const tasks = [makeTask('001', TaskStatus.PENDING)];
    const sprint = makeSprint(tasks);

    expect(() => pauseSprint(projectRoot, sprint)).not.toThrow();
    // The failed write is contained; the rest of the pause transaction lands.
    expect(sprint.status).toBe(SprintStatus.PAUSED);
    expect(existsSync(join(projectRoot, '.deckent', 'pause-state.json'))).toBe(true);
  });
});

describe('resumeSprint', () => {
  let projectRoot = '';

  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = freshProjectRoot();
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

  it('persists ACTIVE to the canonical sprint-state authority', () => {
    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);
    sprint.status = SprintStatus.PAUSED;

    resumeSprint(projectRoot, sprint);

    const state = readJsonFile(join(projectRoot, '.deckent', 'sprint-state.json'));
    expect(state.sprintId).toBe('sprint-001');
    expect(state.status).toBe('ACTIVE');
  });

  it('writes updated task JSON for resumed tasks', () => {
    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    const taskJsonPath = join(projectRoot, '.tasks', 'task-001.json');
    expect(existsSync(taskJsonPath)).toBe(true);
    expect(readJsonFile(taskJsonPath).status).toBe(TaskStatus.PENDING);
  });

  it('removes .paused marker files when they exist', () => {
    const markerPath = join(projectRoot, '.tasks', 'task-001.paused');
    writeFileSync(
      markerPath,
      JSON.stringify({ taskId: '001', previousStatus: TaskStatus.PENDING, pausedAt: '2026-01-01T00:00:00.000Z' }, null, 2),
      'utf-8',
    );

    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(existsSync(markerPath)).toBe(false);
  });

  it('removes the pause-state.json file when it exists', () => {
    const pauseStatePath = join(projectRoot, '.deckent', 'pause-state.json');
    writeFileSync(pauseStatePath, JSON.stringify(makeSavedPauseState(), null, 2), 'utf-8');

    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    resumeSprint(projectRoot, sprint);

    expect(existsSync(pauseStatePath)).toBe(false);
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
    const savedState = makeSavedPauseState();
    writeFileSync(
      join(projectRoot, '.deckent', 'pause-state.json'),
      JSON.stringify(savedState, null, 2),
      'utf-8',
    );

    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    const result = resumeSprint(projectRoot, sprint);

    expect(result).toEqual(savedState);
  });

  it('returns null when no saved pause state exists', () => {
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

  it('continues gracefully when marker/state unlink fails', () => {
    // Real-fs failure injection: both cleanup targets are pre-created as
    // DIRECTORIES so unlinkSync throws (EISDIR/EPERM) exactly where the old
    // test injected mockedUnlinkSync throwing 'permission denied'.
    mkdirSync(join(projectRoot, '.tasks', 'task-001.paused'));
    mkdirSync(join(projectRoot, '.deckent', 'pause-state.json'));

    const tasks = [makeTask('001', TaskStatus.PAUSED)];
    const sprint = makeSprint(tasks);

    expect(() => resumeSprint(projectRoot, sprint)).not.toThrow();
    expect(sprint.status).toBe(SprintStatus.ACTIVE);
  });
});

describe('pauseSprint + resumeSprint roundtrip', () => {
  let projectRoot = '';

  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = freshProjectRoot();
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

    // Real-file roundtrip closure: markers and pause-state are gone again.
    expect(existsSync(join(projectRoot, '.tasks', 'task-001.paused'))).toBe(false);
    expect(existsSync(join(projectRoot, '.tasks', 'task-002.paused'))).toBe(false);
    expect(existsSync(join(projectRoot, '.deckent', 'pause-state.json'))).toBe(false);
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
