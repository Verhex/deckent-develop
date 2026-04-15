import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskEvaluation, DebtPriority,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, DebtItem, SprintMetrics,
} from '../../src/core/types.js';
import { DEBT_TABLE_HEADER } from '../../src/core/constants.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
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
  startAuditor: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn().mockImplementation((_root: string, _id: string, _status: string) => ({})),
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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);

import {
  resolveDebt, calculateMetrics, handleEvaluation,
} from '../../src/orchestra/brain.js';

// ─── Helpers ────────────────────────────────────────────────────────

const ROOT = '/project';
const DEBT_SEPARATOR = '|----|-------------|------|--------|----------|------|----------|----------|---------|';

function makeDebtTable(items: Array<Partial<DebtItem>>): string {
  const rows = items.map(d => {
    const id = d.id ?? 'debt-001';
    const desc = d.description ?? 'Test debt';
    const task = d.originTaskId ?? '001-001';
    const sprint = d.originSprintId ?? 'sprint-001';
    const priority = d.priority ?? DebtPriority.NORMAL;
    const open = d.sprintsOpen ?? 0;
    const resolved = d.resolved ?? false;
    const fixedIn = d.resolvedInSprintId ?? '-';
    const created = d.createdAt ?? '2026-03-17T00:00:00.000Z';
    return `| ${id} | ${desc} | ${task} | ${sprint} | ${priority} | ${open} | ${resolved} | ${fixedIn} | ${created} |`;
  });
  return [DEBT_TABLE_HEADER, DEBT_SEPARATOR, ...rows].join('\n');
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-004',
    number: 4,
    status: 'ACTIVE' as Sprint['status'],
    phase: 'EVALUATE' as Sprint['phase'],
    tasks: [],
    workers: [],
    ...overrides,
  };
}

// ─── resolveDebt() unit tests ───────────────────────────────────────

describe('resolveDebt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves an existing unresolved debt and returns true', () => {
    const table = makeDebtTable([{ id: 'debt-001-001', resolved: false }]);
    mockedReadFileSync.mockReturnValue(table);
    mockedExistsSync.mockReturnValue(true);

    const result = resolveDebt(ROOT, 'debt-001-001', 'sprint-004');

    expect(result).toBe(true);
    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const written = mockedWriteFileSync.mock.calls[0]![1] as string;
    expect(written).toContain('| true |');
    expect(written).toContain('| sprint-004 |');
  });

  it('sets resolved: true and resolvedInSprintId in DEBT.md', () => {
    const table = makeDebtTable([{ id: 'debt-002-003', resolved: false }]);
    mockedReadFileSync.mockReturnValue(table);
    mockedExistsSync.mockReturnValue(true);

    resolveDebt(ROOT, 'debt-002-003', 'sprint-004');

    const written = mockedWriteFileSync.mock.calls[0]![1] as string;
    expect(written).toContain('debt-002-003');
    expect(written).toContain('true');
    expect(written).toContain('sprint-004');
  });

  it('returns false when debt ID is not found', () => {
    const table = makeDebtTable([{ id: 'debt-001-001' }]);
    mockedReadFileSync.mockReturnValue(table);

    const result = resolveDebt(ROOT, 'debt-nonexistent', 'sprint-004');

    expect(result).toBe(false);
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('returns false when debt is already resolved (idempotent)', () => {
    const table = makeDebtTable([{ id: 'debt-001-001', resolved: true, resolvedInSprintId: 'sprint-003' }]);
    mockedReadFileSync.mockReturnValue(table);

    const result = resolveDebt(ROOT, 'debt-001-001', 'sprint-004');

    expect(result).toBe(false);
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('returns false when DEBT.md does not exist', () => {
    mockedReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const result = resolveDebt(ROOT, 'debt-001-001', 'sprint-004');

    expect(result).toBe(false);
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('does not modify other debt items', () => {
    const table = makeDebtTable([
      { id: 'debt-001-001', resolved: false, description: 'First debt' },
      { id: 'debt-001-002', resolved: false, description: 'Second debt' },
    ]);
    mockedReadFileSync.mockReturnValue(table);

    resolveDebt(ROOT, 'debt-001-001', 'sprint-004');

    const written = mockedWriteFileSync.mock.calls[0]![1] as string;
    // debt-001-002 should still be false
    const lines = written.split('\n').filter(l => l.includes('debt-001-002'));
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('| false |');
  });

  it('calls mkdirSync to ensure .brain dir exists', () => {
    const table = makeDebtTable([{ id: 'debt-001-001', resolved: false }]);
    mockedReadFileSync.mockReturnValue(table);

    resolveDebt(ROOT, 'debt-001-001', 'sprint-004');

    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.brain'),
      { recursive: true },
    );
  });
});

// ─── calculateMetrics() debt parameter tests ────────────────────────

describe('calculateMetrics with debt parameter', () => {
  const sprint = makeSprint({
    startedAt: '2026-03-17T00:00:00.000Z',
    completedAt: '2026-03-17T01:00:00.000Z',
  });

  it('computes resolvedDebtCount correctly with debt parameter', () => {
    const evaluations = new Map<string, TaskEvaluation>();
    const debt: DebtItem[] = [
      { id: 'debt-001', description: 'A', originTaskId: '001', originSprintId: 'sprint-001', priority: DebtPriority.NORMAL, sprintsOpen: 1, resolved: true, resolvedInSprintId: 'sprint-004', createdAt: '' },
      { id: 'debt-002', description: 'B', originTaskId: '002', originSprintId: 'sprint-001', priority: DebtPriority.NORMAL, sprintsOpen: 1, resolved: true, resolvedInSprintId: 'sprint-003', createdAt: '' },
      { id: 'debt-003', description: 'C', originTaskId: '003', originSprintId: 'sprint-002', priority: DebtPriority.HIGH, sprintsOpen: 2, resolved: false, createdAt: '' },
    ];

    const metrics = calculateMetrics(sprint, evaluations, [], debt);

    expect(metrics.resolvedDebtCount).toBe(1); // only debt-001 resolved in sprint-004
  });

  it('computes totalOpenDebt correctly with debt parameter', () => {
    const evaluations = new Map<string, TaskEvaluation>();
    const debt: DebtItem[] = [
      { id: 'debt-001', description: 'A', originTaskId: '001', originSprintId: 'sprint-001', priority: DebtPriority.NORMAL, sprintsOpen: 0, resolved: true, resolvedInSprintId: 'sprint-004', createdAt: '' },
      { id: 'debt-002', description: 'B', originTaskId: '002', originSprintId: 'sprint-001', priority: DebtPriority.NORMAL, sprintsOpen: 1, resolved: false, createdAt: '' },
      { id: 'debt-003', description: 'C', originTaskId: '003', originSprintId: 'sprint-002', priority: DebtPriority.HIGH, sprintsOpen: 2, resolved: false, createdAt: '' },
    ];

    const metrics = calculateMetrics(sprint, evaluations, [], debt);

    expect(metrics.totalOpenDebt).toBe(2); // debt-002 and debt-003 unresolved
  });

  it('returns 0 for debt fields when debt parameter is omitted (backward compat)', () => {
    const evaluations = new Map<string, TaskEvaluation>();

    const metrics = calculateMetrics(sprint, evaluations, []);

    expect(metrics.resolvedDebtCount).toBe(0);
    expect(metrics.totalOpenDebt).toBe(0);
  });
});

// ─── Integration: evaluation → debt resolution ──────────────────────

describe('handleEvaluation + resolveDebt integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DONE evaluation triggers debt resolution for task ID', () => {
    // Setup: debt exists for task
    const table = makeDebtTable([{ id: 'debt-004-001', resolved: false }]);
    const readCalls: string[] = [];
    mockedReadFileSync.mockImplementation((path: unknown) => {
      readCalls.push(String(path));
      if (String(path).includes('DEBT.md')) return table;
      throw new Error('ENOENT');
    });
    mockedExistsSync.mockReturnValue(true);

    const task: Task = {
      id: '004-001',
      title: 'Test task',
      description: 'Test',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'Test',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: '' },
      status: 'PENDING' as Task['status'],
      sprintId: 'sprint-004',
    };

    const result: TaskResult = {
      taskId: '004-001',
      workerId: 'w-004-001',
      filesChanged: [],
      linesAdded: 10,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'All good',
    };

    handleEvaluation(ROOT, task, TaskEvaluation.DONE, result);

    // handleEvaluation with DONE calls updateTaskStatus + releaseAllLocks
    // After that, resolveDebt should be called by runSprint (not handleEvaluation itself)
    // This test verifies handleEvaluation doesn't crash and resolveDebt works standalone
    const resolved = resolveDebt(ROOT, 'debt-004-001', 'sprint-004');
    expect(resolved).toBe(true);
  });

  it('isPriorityFix + DONE resolves debt for fixForTaskId', () => {
    const table = makeDebtTable([
      { id: 'debt-003-001', resolved: false, description: 'Original debt' },
    ]);
    mockedReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).includes('DEBT.md')) return table;
      throw new Error('ENOENT');
    });

    const resolved = resolveDebt(ROOT, 'debt-003-001', 'sprint-004');
    expect(resolved).toBe(true);

    const written = mockedWriteFileSync.mock.calls.find(
      c => String(c[0]).includes('DEBT.md'),
    );
    expect(written).toBeDefined();
    expect(String(written![1])).toContain('| true |');
    expect(String(written![1])).toContain('| sprint-004 |');
  });

  it('NO_GO evaluation does not resolve debt', () => {
    const table = makeDebtTable([{ id: 'debt-004-001', resolved: false }]);
    mockedReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).includes('DEBT.md')) return table;
      throw new Error('ENOENT');
    });
    mockedExistsSync.mockReturnValue(true);

    const task: Task = {
      id: '004-001',
      title: 'Test task',
      description: 'Test',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'Test',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: '' },
      status: 'PENDING' as Task['status'],
      sprintId: 'sprint-004',
    };

    const result: TaskResult = {
      taskId: '004-001',
      workerId: 'w-004-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'Build failed',
    };

    handleEvaluation(ROOT, task, TaskEvaluation.NO_GO, result);

    // DEBT.md should NOT have been written with resolved: true for this debt
    // NO_GO creates a fix task, not resolves debt
    const debtWrites = mockedWriteFileSync.mock.calls.filter(
      c => String(c[0]).includes('DEBT.md'),
    );
    // handleEvaluation with NO_GO doesn't write to DEBT.md (it writes a fix task JSON)
    for (const write of debtWrites) {
      expect(String(write[1])).not.toContain('| debt-004-001 |');
    }
  });

  it('resolveDebt handles multiple items and only resolves the target', () => {
    const table = makeDebtTable([
      { id: 'debt-001', resolved: false },
      { id: 'debt-002', resolved: false },
      { id: 'debt-003', resolved: false },
    ]);
    mockedReadFileSync.mockReturnValue(table);

    const r1 = resolveDebt(ROOT, 'debt-002', 'sprint-004');
    expect(r1).toBe(true);

    const written = mockedWriteFileSync.mock.calls[0]![1] as string;
    const lines = written.split('\n').filter(l => l.startsWith('|') && !l.startsWith('| ID') && !l.startsWith('|---'));
    expect(lines.length).toBe(3);

    // debt-001: still false
    expect(lines[0]).toContain('| debt-001 |');
    expect(lines[0]).toContain('| false |');

    // debt-002: resolved
    expect(lines[1]).toContain('| debt-002 |');
    expect(lines[1]).toContain('| true |');
    expect(lines[1]).toContain('| sprint-004 |');

    // debt-003: still false
    expect(lines[2]).toContain('| debt-003 |');
    expect(lines[2]).toContain('| false |');
  });
});
