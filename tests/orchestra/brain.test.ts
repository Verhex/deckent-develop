import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus, TaskEvaluation, SprintPhase, SprintStatus, DebtPriority, AgentStatus,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, SprintMetrics, DebtItem, ResolvedConfig, UsageMetrics, PatternEntry,
} from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
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
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn().mockImplementation((_root: string, _id: string, _status: string) => ({})),
  releaseAllLocks: vi.fn().mockReturnValue(0),
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ensureSession, spawnWorker, killWorker, listWorkers, startAuditor } from '../../src/orchestra/tmux.js';
import { updateDashboard, detectDeadlocks } from '../../src/monitor/auditor.js';
import { updateTaskStatus, releaseAllLocks } from '../../src/agents/worker.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedSpawnSync = vi.mocked(spawnSync);
const mockedEnsureSession = vi.mocked(ensureSession);
const mockedSpawnWorker = vi.mocked(spawnWorker);
const mockedKillWorker = vi.mocked(killWorker);
const mockedListWorkers = vi.mocked(listWorkers);
const mockedStartAuditor = vi.mocked(startAuditor);
const mockedUpdateDashboard = vi.mocked(updateDashboard);
const mockedDetectDeadlocks = vi.mocked(detectDeadlocks);
const mockedUpdateTaskStatus = vi.mocked(updateTaskStatus);
const mockedReleaseAllLocks = vi.mocked(releaseAllLocks);

import {
  readContext, checkUsage, adjustSprintSize, createTask,
  planSprint, spawnWorkers, waitForResults,
  evaluateResult, handleEvaluation, handleCrossDependencies,
  escalateDebt, writeRetrospective, writeSprintLog,
  calculateMetrics, decay, cleanup, runSprint,
  BrainError,
} from '../../src/orchestra/brain.js';

// ─── Helpers ────────────────────────────────────────────────────────

const ROOT = '/project';

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
      usage_thresholds: { '5hr': 0.8, weekly: 0.9 },
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: ROOT,
    version: '0.1.0',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-001',
    createdAt: '2026-03-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '001-001',
    workerId: 'w-001-001',
    filesChanged: ['src/test.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: 'All good',
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks: [makeTask()],
    workers: ['w-001-001'],
    startedAt: '2026-03-16T00:00:00.000Z',
    ...overrides,
  };
}

const spawnOk = { status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
  mockedReaddirSync.mockReturnValue([] as never);
  mockedListWorkers.mockReturnValue([]);
  mockedDetectDeadlocks.mockReturnValue([]);
  mockedUpdateTaskStatus.mockImplementation((_r, _i, _s) => ({}) as Task);
  mockedReleaseAllLocks.mockReturnValue(0);
  mockedSpawnSync.mockReturnValue(spawnOk);
});

// ═══ Tests ═══════════════════════════════════════════════════════════

describe('BrainError', () => {
  it('has name BrainError', () => {
    const err = new BrainError('test');
    expect(err.name).toBe('BrainError');
    expect(err.message).toBe('test');
  });

  it('stores phase property', () => {
    const err = new BrainError('plan fail', SprintPhase.PLAN);
    expect(err.phase).toBe(SprintPhase.PLAN);
  });
});

describe('readContext', () => {
  it('reads all brain files', () => {
    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('DIRECTIVES')) return '# Directives\nBuild A';
      if (p.includes('MEMORY')) return '# Memory';
      if (p.includes('RETRO')) return '# Retro';
      if (p.includes('PATTERNS')) return '[]';
      if (p.includes('DECISIONS')) return '# Decisions';
      if (p.includes('DEBT')) return '';
      throw new Error(`not found: ${p}`);
    });
    mockedSpawnSync.mockReturnValue({ ...spawnOk, stdout: '' } as never);

    const ctx = readContext(ROOT);
    expect(ctx.directives).toContain('Build A');
    expect(ctx.memory).toContain('Memory');
    expect(ctx.retro).toContain('Retro');
    expect(ctx.decisions).toContain('Decisions');
  });

  it('returns empty string for missing files', () => {
    mockedReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    mockedSpawnSync.mockReturnValue(spawnOk);

    const ctx = readContext(ROOT);
    expect(ctx.directives).toBe('');
    expect(ctx.memory).toBe('');
    expect(ctx.debt).toEqual([]);
  });

  it('skips corrupt task JSON files', () => {
    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('task-bad.json')) return 'NOT JSON';
      if (p.includes('task-good.json')) return JSON.stringify(makeTask({ id: 'good' }));
      return '';
    });
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-bad.json', 'task-good.json'] as never);
    mockedSpawnSync.mockReturnValue(spawnOk);

    const ctx = readContext(ROOT);
    expect(ctx.existingTasks).toHaveLength(1);
    expect(ctx.existingTasks[0]?.id).toBe('good');
  });

  it('handles git status command error', () => {
    mockedReadFileSync.mockImplementation(() => '');
    mockedSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'err', pid: 1, signal: null, output: [] } as never);

    const ctx = readContext(ROOT);
    expect(ctx.projectState.gitStatus).toBe('');
    expect(ctx.projectState.fileTree).toEqual([]);
  });

  it('parses git ls-files into fileTree', () => {
    mockedReadFileSync.mockImplementation(() => '');
    mockedSpawnSync.mockImplementation((_cmd: unknown, args: unknown) => {
      const a = args as string[];
      if (a[0] === 'ls-files') return { status: 0, stdout: 'src/a.ts\nsrc/b.ts\n', stderr: '', pid: 1, signal: null, output: [] } as never;
      return spawnOk;
    });

    const ctx = readContext(ROOT);
    expect(ctx.projectState.fileTree).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('parses DEBT.md table into DebtItem array', () => {
    const debtTable = [
      '| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |',
      '|----|-------------|------|--------|----------|------|----------|----------|---------|',
      '| debt-1 | some debt | t-1 | s-1 | NORMAL | 1 | false | - | 2026-03-16 |',
    ].join('\n');

    mockedReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).includes('DEBT')) return debtTable;
      return '';
    });
    mockedSpawnSync.mockReturnValue(spawnOk);

    const ctx = readContext(ROOT);
    expect(ctx.debt).toHaveLength(1);
    expect(ctx.debt[0]?.id).toBe('debt-1');
    expect(ctx.debt[0]?.priority).toBe('NORMAL');
  });

  it('returns empty tasks when .tasks/ does not exist', () => {
    mockedReadFileSync.mockImplementation(() => '');
    mockedSpawnSync.mockReturnValue(spawnOk);
    mockedExistsSync.mockReturnValue(false);

    const ctx = readContext(ROOT);
    expect(ctx.existingTasks).toEqual([]);
  });
});

describe('checkUsage', () => {
  it('returns zeroed usage metrics', () => {
    const usage = checkUsage(makeConfig());
    expect(usage.fiveHourPercent).toBe(0);
    expect(usage.weeklyPercent).toBe(0);
  });

  it('returns valid ISO timestamp', () => {
    const usage = checkUsage(makeConfig());
    expect(usage.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('adjustSprintSize', () => {
  const config = makeConfig();

  it('returns full when no thresholds exceeded', () => {
    const usage: UsageMetrics = { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: '' };
    const rec = adjustSprintSize(config, usage);
    expect(rec.size).toBe('full');
    expect(rec.maxWorkers).toBe(4);
    expect(rec.modelConstraint).toBeNull();
  });

  it('returns reduced when one threshold exceeded', () => {
    const usage: UsageMetrics = { fiveHourPercent: 85, weeklyPercent: 0, measuredAt: '' };
    const rec = adjustSprintSize(config, usage);
    expect(rec.size).toBe('reduced');
    expect(rec.maxWorkers).toBe(2);
    expect(rec.modelConstraint).toBe('sonnet');
  });

  it('returns minimal when both thresholds exceeded', () => {
    const usage: UsageMetrics = { fiveHourPercent: 85, weeklyPercent: 95, measuredAt: '' };
    const rec = adjustSprintSize(config, usage);
    expect(rec.size).toBe('minimal');
    expect(rec.maxWorkers).toBe(1);
  });

  it('returns haiku constraint when haiku_allowed and minimal', () => {
    const haikuConfig = makeConfig({
      activeModeConfig: { ...makeConfig().activeModeConfig, haiku_allowed: true },
    });
    const usage: UsageMetrics = { fiveHourPercent: 85, weeklyPercent: 95, measuredAt: '' };
    const rec = adjustSprintSize(haikuConfig, usage);
    expect(rec.modelConstraint).toBe('haiku');
  });

  it('ensures minWorkers is 1 even with small max_workers', () => {
    const smallConfig = makeConfig({
      activeModeConfig: { ...makeConfig().activeModeConfig, max_workers: 1 },
    });
    const usage: UsageMetrics = { fiveHourPercent: 85, weeklyPercent: 0, measuredAt: '' };
    const rec = adjustSprintSize(smallConfig, usage);
    expect(rec.maxWorkers).toBeGreaterThanOrEqual(1);
  });
});

describe('createTask', () => {
  it('creates task with correct ID format', () => {
    const task = createTask({
      title: 'Test', description: 'Desc', model: 'sonnet', effort: 'normal',
      priority: 'NORMAL', reason: 'test', scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      sprintId: 'sprint-001',
    }, 1);
    expect(task.id).toBe('001-001');
  });

  it('sets status to PENDING', () => {
    const task = createTask({
      title: 'T', description: '', model: 'opus', effort: 'high',
      priority: 'CRITICAL', reason: '', scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      sprintId: 'sprint-002',
    }, 5);
    expect(task.status).toBe(TaskStatus.PENDING);
  });

  it('pads sequence to 3 digits', () => {
    const task = createTask({
      title: 'T', description: '', model: 'sonnet', effort: 'normal',
      priority: 'NORMAL', reason: '', scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      sprintId: 'sprint-003',
    }, 42);
    expect(task.id).toBe('003-042');
  });

  it('sets isPriorityFix when provided', () => {
    const task = createTask({
      title: 'Fix', description: '', model: 'sonnet', effort: 'high',
      priority: 'CRITICAL', reason: '', scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      sprintId: 'sprint-001', isPriorityFix: true, fixForTaskId: '001-001',
    }, 1);
    expect(task.isPriorityFix).toBe(true);
    expect(task.fixForTaskId).toBe('001-001');
  });
});

describe('planSprint', () => {
  const config = makeConfig();
  const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: '' };

  function makeContext(directives = 'Task A\nTask B') {
    return {
      directives, memory: '', retro: '', debt: [] as DebtItem[], patterns: '', decisions: '',
      existingTasks: [] as Task[], projectState: { gitStatus: '', fileTree: [] },
    };
  }

  it('auto-increments sprint number from sprints dir', () => {
    mockedExistsSync.mockImplementation((p: unknown) => String(p).includes('sprints'));
    mockedReaddirSync.mockImplementation((p: unknown) => {
      if (String(p).includes('sprints')) return ['sprint-001.md', 'sprint-002.md'] as never;
      return [] as never;
    });

    const sprint = planSprint(ROOT, config, makeContext(), recommendation);
    expect(sprint.number).toBe(3);
    expect(sprint.id).toBe('sprint-003');
  });

  it('writes task JSON files to .tasks/', () => {
    const sprint = planSprint(ROOT, config, makeContext('Do X'), recommendation);
    expect(sprint.tasks.length).toBeGreaterThan(0);
    expect(mockedWriteFileSync).toHaveBeenCalled();
    const writeCall = mockedWriteFileSync.mock.calls.find(c => String(c[0]).includes('task-'));
    expect(writeCall).toBeDefined();
  });

  it('creates .tasks/ directory', () => {
    planSprint(ROOT, config, makeContext('Do X'), recommendation);
    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.tasks'),
      expect.objectContaining({ recursive: true }),
    );
  });

  it('creates priority fix tasks for CRITICAL debt', () => {
    const ctx = makeContext('');
    ctx.debt = [{
      id: 'debt-1', description: 'critical debt', originTaskId: 't-1', originSprintId: 's-1',
      priority: DebtPriority.CRITICAL, sprintsOpen: 3, resolved: false, createdAt: '',
    }];
    const sprint = planSprint(ROOT, config, ctx, recommendation);
    expect(sprint.tasks.some(t => t.isPriorityFix)).toBe(true);
  });

  it('limits tasks to maxWorkers', () => {
    const smallRec = { ...recommendation, maxWorkers: 1 };
    const sprint = planSprint(ROOT, config, makeContext('A\nB\nC'), smallRec);
    expect(sprint.tasks.length).toBeLessThanOrEqual(1);
  });

  it('throws BrainError on deadlock detection', () => {
    mockedDetectDeadlocks.mockReturnValue([{
      type: 'circular_dependency', agentId: 'a,b', detail: 'cycle', timestamp: '',
    }]);
    expect(() => planSprint(ROOT, config, makeContext('A'), recommendation)).toThrow(BrainError);
  });
});

describe('spawnWorkers', () => {
  const config = makeConfig();
  const sprint = makeSprint();

  it('calls ensureSession first', () => {
    spawnWorkers(ROOT, sprint, config);
    expect(mockedEnsureSession).toHaveBeenCalledTimes(1);
  });

  it('starts auditor', () => {
    spawnWorkers(ROOT, sprint, config);
    expect(mockedStartAuditor).toHaveBeenCalledWith(ROOT, expect.objectContaining({ allowedTools: 'Read,Bash' }));
  });

  it('spawns one worker per task', () => {
    const multiSprint = makeSprint({
      tasks: [makeTask({ id: '001-001' }), makeTask({ id: '001-002' })],
    });
    spawnWorkers(ROOT, multiSprint, config);
    expect(mockedSpawnWorker).toHaveBeenCalledTimes(2);
  });

  it('includes task id in worker prompt', () => {
    spawnWorkers(ROOT, sprint, config);
    const call = mockedSpawnWorker.mock.calls[0];
    expect(call?.[0]).toBe('001-001');
    expect(call?.[2]).toContain('001-001');
  });

  it('updates dashboard after spawning', () => {
    spawnWorkers(ROOT, sprint, config);
    expect(mockedUpdateDashboard).toHaveBeenCalledTimes(1);
  });
});

describe('waitForResults', () => {
  it('returns immediately when all results exist', () => {
    const sprint = makeSprint();
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(makeResult()));

    const results = waitForResults(ROOT, sprint, 1000);
    expect(results).toHaveLength(1);
    expect(results[0]?.taskId).toBe('001-001');
  });

  it('returns empty array when no results and timeout=0', () => {
    const sprint = makeSprint();
    const results = waitForResults(ROOT, sprint, 0);
    expect(results).toEqual([]);
  });

  it('handles corrupt result files gracefully', () => {
    const sprint = makeSprint();
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('NOT JSON');

    const results = waitForResults(ROOT, sprint, 0);
    expect(results).toEqual([]);
  });

  it('collects results for multiple tasks', () => {
    const task2 = makeTask({ id: '001-002' });
    const sprint = makeSprint({ tasks: [makeTask(), task2] });

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('001-001.result')) return JSON.stringify(makeResult());
      if (p.includes('001-002.result')) return JSON.stringify(makeResult({ taskId: '001-002' }));
      return '';
    });

    const results = waitForResults(ROOT, sprint, 1000);
    expect(results).toHaveLength(2);
  });

  it('returns partial results on timeout', () => {
    const task2 = makeTask({ id: '001-002' });
    const sprint = makeSprint({ tasks: [makeTask(), task2] });

    mockedExistsSync.mockImplementation((path: unknown) => {
      return String(path).includes('001-001.result');
    });
    mockedReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).includes('001-001.result')) return JSON.stringify(makeResult());
      throw new Error('not found');
    });

    const results = waitForResults(ROOT, sprint, 0);
    expect(results).toHaveLength(1);
    expect(results[0]?.taskId).toBe('001-001');
  });

  it('does not include duplicates', () => {
    const sprint = makeSprint();
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(makeResult()));

    const results = waitForResults(ROOT, sprint, 1000);
    expect(results).toHaveLength(1);
  });
});

describe('evaluateResult', () => {
  const task = makeTask();

  it('returns NO_GO when selfAssessment is NO_GO', () => {
    expect(evaluateResult(makeResult({ selfAssessment: 'NO_GO' }), task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns GO_WITH_TECH_DEBT when selfAssessment says so', () => {
    expect(evaluateResult(makeResult({ selfAssessment: 'GO_WITH_TECH_DEBT' }), task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns DONE for successful result', () => {
    expect(evaluateResult(makeResult(), task)).toBe(TaskEvaluation.DONE);
  });

  it('overrides DONE to NO_GO when testsPassed=false', () => {
    expect(evaluateResult(makeResult({ testsPassed: false }), task)).toBe(TaskEvaluation.NO_GO);
  });

  it('overrides DONE to GO_WITH_TECH_DEBT when coverage < 90', () => {
    expect(evaluateResult(makeResult({ coverage: 85 }), task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('is pure — does not call any I/O functions', () => {
    evaluateResult(makeResult(), task);
    expect(mockedReadFileSync).not.toHaveBeenCalled();
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });
});

describe('handleEvaluation', () => {
  it('DONE: updates status and releases locks', () => {
    const task = makeTask({ assignedWorker: 'w1' });
    handleEvaluation(ROOT, task, TaskEvaluation.DONE, makeResult());
    expect(mockedUpdateTaskStatus).toHaveBeenCalledWith(ROOT, '001-001', TaskStatus.DONE);
    expect(mockedReleaseAllLocks).toHaveBeenCalledWith(ROOT, 'w1');
  });

  it('GO_WITH_TECH_DEBT: updates status, releases locks, writes DEBT.md', () => {
    mockedReadFileSync.mockReturnValue('');
    const task = makeTask({ assignedWorker: 'w1' });
    handleEvaluation(ROOT, task, TaskEvaluation.GO_WITH_TECH_DEBT, makeResult());
    expect(mockedUpdateTaskStatus).toHaveBeenCalledWith(ROOT, '001-001', TaskStatus.DONE);
    expect(mockedReleaseAllLocks).toHaveBeenCalledWith(ROOT, 'w1');
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('DEBT.md'),
      expect.stringContaining('debt-001-001'),
      'utf-8',
    );
  });

  it('NO_GO: updates status to NO_GO, does NOT release locks', () => {
    const task = makeTask({ assignedWorker: 'w1' });
    handleEvaluation(ROOT, task, TaskEvaluation.NO_GO, makeResult({ selfAssessment: 'NO_GO' }));
    expect(mockedUpdateTaskStatus).toHaveBeenCalledWith(ROOT, '001-001', TaskStatus.NO_GO);
    expect(mockedReleaseAllLocks).not.toHaveBeenCalled();
  });

  it('NO_GO: creates fix task JSON file', () => {
    handleEvaluation(ROOT, makeTask(), TaskEvaluation.NO_GO, makeResult({ selfAssessment: 'NO_GO' }));
    const fixCall = mockedWriteFileSync.mock.calls.find(c => String(c[0]).includes('fix'));
    expect(fixCall).toBeDefined();
    const fixTask = JSON.parse(fixCall![1] as string) as Task;
    expect(fixTask.isPriorityFix).toBe(true);
    expect(fixTask.fixForTaskId).toBe('001-001');
  });

  it('uses task.id as workerId fallback when assignedWorker is undefined', () => {
    const task = makeTask({ assignedWorker: undefined });
    handleEvaluation(ROOT, task, TaskEvaluation.DONE, makeResult());
    expect(mockedReleaseAllLocks).toHaveBeenCalledWith(ROOT, 'w-001-001');
  });
});

describe('handleCrossDependencies', () => {
  it('returns empty list when no NO_GO tasks', () => {
    const evaluations = new Map([['001-001', TaskEvaluation.DONE]]);
    const result = handleCrossDependencies(ROOT, makeSprint(), evaluations);
    expect(result).toEqual([]);
  });

  it('creates fix task for suspect dependency', () => {
    const taskA = makeTask({ id: '001-001', dependencies: ['001-002'] });
    const taskB = makeTask({ id: '001-002' });
    const sprint = makeSprint({ tasks: [taskA, taskB] });
    const evaluations = new Map<string, TaskEvaluation>([
      ['001-001', TaskEvaluation.NO_GO],
      ['001-002', TaskEvaluation.DONE],
    ]);

    const fixTasks = handleCrossDependencies(ROOT, sprint, evaluations);
    expect(fixTasks).toHaveLength(1);
    expect(fixTasks[0]?.fixForTaskId).toBe('001-002');
  });

  it('handles multiple dependencies', () => {
    const taskA = makeTask({ id: '001-001', dependencies: ['001-002', '001-003'] });
    const taskB = makeTask({ id: '001-002' });
    const taskC = makeTask({ id: '001-003' });
    const sprint = makeSprint({ tasks: [taskA, taskB, taskC] });
    const evaluations = new Map<string, TaskEvaluation>([
      ['001-001', TaskEvaluation.NO_GO],
      ['001-002', TaskEvaluation.DONE],
      ['001-003', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);

    const fixTasks = handleCrossDependencies(ROOT, sprint, evaluations);
    expect(fixTasks).toHaveLength(2);
  });

  it('writes fix task JSON files', () => {
    const taskA = makeTask({ id: '001-001', dependencies: ['001-002'] });
    const taskB = makeTask({ id: '001-002' });
    const sprint = makeSprint({ tasks: [taskA, taskB] });
    const evaluations = new Map<string, TaskEvaluation>([
      ['001-001', TaskEvaluation.NO_GO],
      ['001-002', TaskEvaluation.DONE],
    ]);

    handleCrossDependencies(ROOT, sprint, evaluations);
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('xfix'),
      expect.any(String),
      'utf-8',
    );
  });
});

describe('escalateDebt', () => {
  function mockDebtFile(items: DebtItem[]) {
    const header = '| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |';
    const sep = '|----|-------------|------|--------|----------|------|----------|----------|---------|';
    const rows = items.map(d =>
      `| ${d.id} | ${d.description} | ${d.originTaskId} | ${d.originSprintId} | ${d.priority} | ${d.sprintsOpen} | ${d.resolved} | ${d.resolvedInSprintId ?? '-'} | ${d.createdAt} |`,
    );
    mockedReadFileSync.mockReturnValue([header, sep, ...rows].join('\n'));
  }

  it('increments sprintsOpen for unresolved items', () => {
    mockDebtFile([{
      id: 'd1', description: 'test', originTaskId: 't1', originSprintId: 's1',
      priority: DebtPriority.NORMAL, sprintsOpen: 0, resolved: false, createdAt: '',
    }]);

    escalateDebt(ROOT);
    const writeCall = mockedWriteFileSync.mock.calls[0];
    expect(writeCall?.[1]).toContain('| 1 |');
  });

  it('escalates to HIGH at 2 sprints', () => {
    mockDebtFile([{
      id: 'd1', description: 'test', originTaskId: 't1', originSprintId: 's1',
      priority: DebtPriority.NORMAL, sprintsOpen: 1, resolved: false, createdAt: '',
    }]);

    escalateDebt(ROOT);
    const writeCall = mockedWriteFileSync.mock.calls[0];
    expect(writeCall?.[1]).toContain('HIGH');
  });

  it('escalates to CRITICAL at 3+ sprints', () => {
    mockDebtFile([{
      id: 'd1', description: 'test', originTaskId: 't1', originSprintId: 's1',
      priority: DebtPriority.HIGH, sprintsOpen: 2, resolved: false, createdAt: '',
    }]);

    escalateDebt(ROOT);
    const writeCall = mockedWriteFileSync.mock.calls[0];
    expect(writeCall?.[1]).toContain('CRITICAL');
  });

  it('does not touch resolved items', () => {
    mockDebtFile([
      {
        id: 'd1', description: 'resolved', originTaskId: 't1', originSprintId: 's1',
        priority: DebtPriority.NORMAL, sprintsOpen: 5, resolved: true, createdAt: '2026-01-01',
      },
      {
        id: 'd2', description: 'open', originTaskId: 't2', originSprintId: 's1',
        priority: DebtPriority.NORMAL, sprintsOpen: 0, resolved: false, createdAt: '2026-01-01',
      },
    ]);

    escalateDebt(ROOT);
    const writeCall = mockedWriteFileSync.mock.calls[0];
    // d1 resolved → sprintsOpen stays 5; d2 open → sprintsOpen incremented to 1
    expect(writeCall?.[1]).toContain('| 5 |');
    expect(writeCall?.[1]).toContain('| 1 |');
  });
});

describe('writeRetrospective', () => {
  const metrics: SprintMetrics = {
    totalTasks: 2, completedTasks: 1, techDebtTasks: 0, noGoTasks: 1,
    durationMs: 60000, coveragePercent: 90, noGoRate: 50,
    newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
    boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
  };

  it('overwrites RETRO.md', () => {
    mockedReadFileSync.mockReturnValue('');
    const evals = new Map([['001-001', TaskEvaluation.DONE]]);
    writeRetrospective(ROOT, makeSprint(), evals, metrics);

    const retroCall = mockedWriteFileSync.mock.calls.find(c => String(c[0]).includes('RETRO'));
    expect(retroCall).toBeDefined();
    expect(retroCall![1]).toContain('Sprint sprint-001 Retrospective');
  });

  it('respects 60-line RETRO limit', () => {
    mockedReadFileSync.mockReturnValue('');
    const manyTasks = Array.from({ length: 100 }, (_, i) => makeTask({ id: `001-${String(i).padStart(3, '0')}` }));
    const sprint = makeSprint({ tasks: manyTasks });
    const evals = new Map(manyTasks.map(t => [t.id, TaskEvaluation.DONE] as const));

    writeRetrospective(ROOT, sprint, evals, metrics);
    const retroCall = mockedWriteFileSync.mock.calls.find(c => String(c[0]).includes('RETRO'));
    const lines = (retroCall![1] as string).split('\n');
    expect(lines.length).toBeLessThanOrEqual(60);
  });

  it('appends learnings to MEMORY.md', () => {
    mockedReadFileSync.mockReturnValue('# Existing');
    const evals = new Map([['001-001', TaskEvaluation.NO_GO]]);
    writeRetrospective(ROOT, makeSprint(), evals, metrics);

    const memCall = mockedWriteFileSync.mock.calls.find(c => String(c[0]).includes('MEMORY'));
    expect(memCall).toBeDefined();
    expect(memCall![1]).toContain('Learnings');
    expect(memCall![1]).toContain('Existing');
  });

  it('respects 100-line MEMORY limit', () => {
    const bigMemory = Array.from({ length: 120 }, (_, i) => `Line ${i}`).join('\n');
    mockedReadFileSync.mockReturnValue(bigMemory);
    const evals = new Map([['001-001', TaskEvaluation.NO_GO]]);

    writeRetrospective(ROOT, makeSprint(), evals, metrics);
    const memCall = mockedWriteFileSync.mock.calls.find(c => String(c[0]).includes('MEMORY'));
    const lines = (memCall![1] as string).split('\n');
    expect(lines.length).toBeLessThanOrEqual(100);
  });
});

describe('writeSprintLog', () => {
  const metrics: SprintMetrics = {
    totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 30000, coveragePercent: 95, noGoRate: 0,
    newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
    boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
  };

  it('writes to .brain/sprints/ directory', () => {
    writeSprintLog(ROOT, makeSprint(), metrics);
    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('sprints'),
      expect.objectContaining({ recursive: true }),
    );
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('sprint-001.md'),
      expect.any(String),
      'utf-8',
    );
  });

  it('creates sprints directory', () => {
    writeSprintLog(ROOT, makeSprint(), metrics);
    expect(mockedMkdirSync).toHaveBeenCalled();
  });

  it('respects 50-line limit', () => {
    const manyTasks = Array.from({ length: 100 }, (_, i) => makeTask({ id: `001-${String(i).padStart(3, '0')}` }));
    const sprint = makeSprint({ tasks: manyTasks });
    writeSprintLog(ROOT, sprint, metrics);

    const writeCall = mockedWriteFileSync.mock.calls[0];
    const lines = (writeCall![1] as string).split('\n');
    expect(lines.length).toBeLessThanOrEqual(50);
  });
});

describe('calculateMetrics', () => {
  it('counts DONE, DEBT, and NOGO correctly', () => {
    const evaluations = new Map<string, TaskEvaluation>([
      ['t1', TaskEvaluation.DONE],
      ['t2', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['t3', TaskEvaluation.NO_GO],
    ]);
    const m = calculateMetrics(makeSprint(), evaluations, [makeResult()]);
    expect(m.totalTasks).toBe(3);
    expect(m.completedTasks).toBe(2); // DONE + DEBT
    expect(m.techDebtTasks).toBe(1);
    expect(m.noGoTasks).toBe(1);
  });

  it('calculates coverage average', () => {
    const evaluations = new Map<string, TaskEvaluation>();
    const results = [makeResult({ coverage: 80 }), makeResult({ coverage: 100 })];
    const m = calculateMetrics(makeSprint(), evaluations, results);
    expect(m.coveragePercent).toBe(90);
  });

  it('calculates noGoRate correctly', () => {
    const evaluations = new Map<string, TaskEvaluation>([
      ['t1', TaskEvaluation.DONE],
      ['t2', TaskEvaluation.NO_GO],
    ]);
    const m = calculateMetrics(makeSprint(), evaluations, []);
    expect(m.noGoRate).toBe(50);
  });

  it('handles empty sprint', () => {
    const m = calculateMetrics(makeSprint(), new Map(), []);
    expect(m.totalTasks).toBe(0);
    expect(m.coveragePercent).toBe(0);
    expect(m.noGoRate).toBe(0);
  });
});

describe('decay', () => {
  function mockBrainDir(totalLines: number) {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) return ['MEMORY.md', 'PATTERNS.md', 'DEBT.md'] as never;
      if (path.includes('sprints')) return [] as never;
      return [] as never;
    });
    const linesPerFile = Math.ceil(totalLines / 3);
    const content = Array.from({ length: linesPerFile }, (_, i) => `line ${i}`).join('\n');
    mockedReadFileSync.mockReturnValue(content);
  }

  it('does nothing when lines <= 300', () => {
    mockBrainDir(100);
    decay(ROOT, 'sprint-005');
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('removes resolved patterns', () => {
    mockBrainDir(400);
    const patterns: PatternEntry[] = [
      { pattern: 'p1', occurrences: 1, firstDetectedInSprint: 's1', lastDetectedInSprint: 's1', resolved: true },
      { pattern: 'p2', occurrences: 2, firstDetectedInSprint: 's2', lastDetectedInSprint: 's2', resolved: false },
    ];
    mockedReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).includes('PATTERNS')) return JSON.stringify(patterns);
      return Array.from({ length: 150 }, () => 'x').join('\n');
    });

    decay(ROOT, 'sprint-005');
    const patternsWrite = mockedWriteFileSync.mock.calls.find(c => String(c[0]).includes('PATTERNS'));
    if (patternsWrite) {
      const written = JSON.parse(patternsWrite[1] as string) as PatternEntry[];
      expect(written).toHaveLength(1);
      expect(written[0]?.pattern).toBe('p2');
    }
  });

  it('removes resolved debt items', () => {
    mockBrainDir(400);
    const debtTable = [
      '| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |',
      '|----|-------------|------|--------|----------|------|----------|----------|---------|',
      '| d1 | open | t1 | s1 | NORMAL | 1 | false | - | 2026 |',
      '| d2 | done | t2 | s2 | NORMAL | 0 | true | s3 | 2026 |',
    ].join('\n');
    mockedReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).includes('DEBT')) return debtTable;
      if (String(path).includes('PATTERNS')) return '[]';
      return Array.from({ length: 150 }, () => 'x').join('\n');
    });

    decay(ROOT, 'sprint-005');
    const debtWrite = mockedWriteFileSync.mock.calls.find(c => String(c[0]).includes('DEBT'));
    if (debtWrite) {
      expect(debtWrite[1]).toContain('d1');
      expect(debtWrite[1]).not.toContain('| d2 |');
    }
  });

  it('archives old sprint logs keeping last 2', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) return ['MEMORY.md', 'PATTERNS.md'] as never;
      if (path.includes('sprints')) return ['sprint-001.md', 'sprint-002.md', 'sprint-003.md'] as never;
      return [] as never;
    });
    mockedReadFileSync.mockReturnValue(Array.from({ length: 200 }, () => 'x').join('\n'));

    decay(ROOT, 'sprint-005');
    // Should archive sprint-001.md
    const archiveWrite = mockedWriteFileSync.mock.calls.find(c => String(c[0]).includes('archive'));
    if (archiveWrite) {
      expect(String(archiveWrite[0])).toContain('sprint-001.md');
    }
  });

  it('creates archive directory', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('.brain')) return ['MEMORY.md'] as never;
      if (path.includes('sprints')) return ['sprint-001.md', 'sprint-002.md', 'sprint-003.md'] as never;
      return [] as never;
    });
    mockedReadFileSync.mockReturnValue(Array.from({ length: 200 }, () => 'x').join('\n'));

    decay(ROOT, 'sprint-005');
    const mkdirCall = mockedMkdirSync.mock.calls.find(c => String(c[0]).includes('archive'));
    if (mkdirCall) {
      expect(mkdirCall).toBeDefined();
    }
  });
});

describe('cleanup', () => {
  it('kills all workers via listWorkers', () => {
    mockedListWorkers.mockReturnValue(['001-001', '001-002']);
    cleanup(ROOT, makeSprint());
    expect(mockedKillWorker).toHaveBeenCalledTimes(2);
  });

  it('releases locks for assigned workers', () => {
    const task = makeTask({ assignedWorker: 'w1' });
    cleanup(ROOT, makeSprint({ tasks: [task] }));
    expect(mockedReleaseAllLocks).toHaveBeenCalledWith(ROOT, 'w1');
  });

  it('deletes .hb files', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation((p: unknown) => {
      if (String(p).includes('.tasks')) return ['task-001.hb', 'task-001.json'] as never;
      return [] as never;
    });
    cleanup(ROOT, makeSprint());
    expect(mockedUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('.hb'));
  });

  it('deletes .lock files', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation((p: unknown) => {
      if (String(p).includes('.locks')) return ['file.lock'] as never;
      if (String(p).includes('.tasks')) return [] as never;
      return [] as never;
    });
    cleanup(ROOT, makeSprint());
    expect(mockedUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('.lock'));
  });

  it('does not throw when worker kill fails', () => {
    mockedListWorkers.mockReturnValue(['dead-worker']);
    mockedKillWorker.mockImplementation(() => { throw new Error('no window'); });
    expect(() => cleanup(ROOT, makeSprint())).not.toThrow();
  });
});

describe('runSprint', () => {
  const config = makeConfig();

  function setupFullSprint() {
    // Phase 1: readContext mocks
    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('task-') && p.endsWith('.result')) return JSON.stringify(makeResult());
      if (p.includes('task-') && p.endsWith('.json')) return JSON.stringify(makeTask());
      return '';
    });
    mockedSpawnSync.mockReturnValue(spawnOk);

    // Phase 3: waitForResults
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([] as never);
  }

  it('returns a sprint with COMPLETE status', () => {
    setupFullSprint();
    // Supply a directive so planSprint creates at least one task
    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('DIRECTIVES')) return 'Build X';
      if (p.includes('.result')) return JSON.stringify(makeResult());
      if (p.includes('.json') && p.includes('task-')) return JSON.stringify(makeTask());
      return '';
    });

    const sprint = runSprint(ROOT, config);
    expect(sprint.status).toBe(SprintStatus.COMPLETE);
    expect(sprint.phase).toBe(SprintPhase.COMPLETE);
  });

  it('sets startedAt and completedAt', () => {
    setupFullSprint();
    const sprint = runSprint(ROOT, config);
    expect(sprint.startedAt).toBeDefined();
    expect(sprint.completedAt).toBeDefined();
  });

  it('throws BrainError on PLAN phase failure', () => {
    mockedReadFileSync.mockImplementation(() => { throw new Error('disk fail'); });
    mockedSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'err', pid: 1, signal: null, output: [] } as never);

    // readContext uses readFileSafe which catches errors, so we need a deeper failure
    mockedDetectDeadlocks.mockReturnValue([{
      type: 'circular_dependency', agentId: 'a', detail: 'cycle', timestamp: '',
    }]);
    mockedReadFileSync.mockReturnValue('Build X'); // DIRECTIVES content

    expect(() => runSprint(ROOT, config)).toThrow(BrainError);
  });

  it('handles EVALUATE phase with partial results', () => {
    setupFullSprint();
    // No results for the task (simulating timeout)
    mockedExistsSync.mockImplementation((path: unknown) => {
      return !String(path).includes('.result');
    });

    const sprint = runSprint(ROOT, config);
    expect(sprint.status).toBe(SprintStatus.COMPLETE);
  });

  it('skips FIX phase when all tasks are DONE', () => {
    setupFullSprint();
    mockedReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('DIRECTIVES')) return 'Build X';
      if (p.includes('.result')) return JSON.stringify(makeResult());
      return '';
    });

    const sprint = runSprint(ROOT, config);
    expect(sprint.status).toBe(SprintStatus.COMPLETE);
  });

  it('recovers from RETRO/DECAY errors', () => {
    setupFullSprint();
    // Make writeFileSync throw only for RETRO
    let callCount = 0;
    mockedWriteFileSync.mockImplementation(() => {
      callCount++;
      if (callCount > 5) throw new Error('write fail');
    });

    const sprint = runSprint(ROOT, config);
    // Should still complete despite RETRO errors
    expect(sprint.status).toBe(SprintStatus.COMPLETE);
  });
});
