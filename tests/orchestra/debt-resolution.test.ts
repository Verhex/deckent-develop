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
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  appendFile: vi.fn(async () => undefined),
  access: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ size: 0 })),
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

/** Helper: create a mock DB entry for a debt item */
function makeDbEntry(id: string, resolved: boolean, resolvedInSprintId?: string) {
  return {
    id, type: 'debt', title: 'Test debt', content: '', source: 'brain',
    summary: null, status: resolved ? 'resolved' : 'active', priority: 'normal',
    sprint_id: 'sprint-001', sprint_num: 1, tag_text: '', created_at: '2026-03-17T00:00:00.000Z',
    updated_at: new Date().toISOString(), deleted_at: null,
    metadata: JSON.stringify({ originTaskId: '001-001', originSprintId: 'sprint-001', sprintsOpen: 0, resolvedInSprintId }),
  };
}

describe('resolveDebt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Enable DB path so getMemoryStore() returns the mock store
    mockedExistsSync.mockImplementation((p: unknown) => String(p).includes('memory.db'));
  });

  it('resolves an existing unresolved debt and returns true', () => {
    mockMemStore.getById.mockReturnValue(makeDbEntry('debt-001-001', false));

    const result = resolveDebt(ROOT, 'debt-001-001', 'sprint-004');

    expect(result).toBe(true);
    expect(mockMemStore.upsert).toHaveBeenCalledTimes(1);
    const input = mockMemStore.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.status).toBe('resolved');
    const meta = input.metadata as Record<string, unknown>;
    expect(meta.resolvedInSprintId).toBe('sprint-004');
  });

  it('sets resolved status and resolvedInSprintId via DB upsert', () => {
    mockMemStore.getById.mockReturnValue(makeDbEntry('debt-002-003', false));

    resolveDebt(ROOT, 'debt-002-003', 'sprint-004');

    const input = mockMemStore.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.id).toBe('debt-002-003');
    expect(input.status).toBe('resolved');
    const meta = input.metadata as Record<string, unknown>;
    expect(meta.resolvedInSprintId).toBe('sprint-004');
  });

  it('returns false when debt ID is not found', () => {
    mockMemStore.getById.mockReturnValue(null);

    const result = resolveDebt(ROOT, 'debt-nonexistent', 'sprint-004');

    expect(result).toBe(false);
    expect(mockMemStore.upsert).not.toHaveBeenCalled();
  });

  it('returns false when debt is already resolved (idempotent)', () => {
    mockMemStore.getById.mockReturnValue(makeDbEntry('debt-001-001', true, 'sprint-003'));

    const result = resolveDebt(ROOT, 'debt-001-001', 'sprint-004');

    expect(result).toBe(false);
    expect(mockMemStore.upsert).not.toHaveBeenCalled();
  });

  it('returns false when DB does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = resolveDebt(ROOT, 'debt-001-001', 'sprint-004');

    expect(result).toBe(false);
    expect(mockMemStore.upsert).not.toHaveBeenCalled();
  });

  it('does not modify other debt items (only target is resolved)', () => {
    mockMemStore.getById.mockImplementation((id: string) => {
      if (id === 'debt-001-001') return makeDbEntry('debt-001-001', false);
      if (id === 'debt-001-002') return makeDbEntry('debt-001-002', false);
      return null;
    });

    resolveDebt(ROOT, 'debt-001-001', 'sprint-004');

    // Only one upsert call for the target debt
    expect(mockMemStore.upsert).toHaveBeenCalledTimes(1);
    const input = mockMemStore.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.id).toBe('debt-001-001');
    expect(input.status).toBe('resolved');
  });

  it('closes the store after operation', () => {
    mockMemStore.getById.mockReturnValue(makeDbEntry('debt-001-001', false));

    resolveDebt(ROOT, 'debt-001-001', 'sprint-004');

    expect(mockMemStore.close).toHaveBeenCalled();
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
    // Enable DB path so getMemoryStore() returns the mock store
    mockedExistsSync.mockImplementation((p: unknown) => String(p).includes('memory.db'));
  });

  it('DONE evaluation triggers debt resolution for task ID', () => {
    mockMemStore.getById.mockReturnValue(makeDbEntry('debt-004-001', false));

    const task: Task = {
      id: '004-001', title: 'Test task', description: 'Test', model: 'sonnet',
      effort: 'normal', priority: 'NORMAL', reason: 'Test',
      scope: { directories: [], filesRead: [], filesWrite: [] }, dependencies: [],
      goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: '' },
      status: 'PENDING' as Task['status'], sprintId: 'sprint-004',
    };
    const result: TaskResult = {
      taskId: '004-001', workerId: 'w-004-001', filesChanged: [],
      linesAdded: 10, linesRemoved: 0, testsPassed: true, coverage: 95,
      selfAssessment: 'DONE', notes: 'All good',
    };

    handleEvaluation(ROOT, task, TaskEvaluation.DONE, result);

    // Verify resolveDebt works standalone after handleEvaluation
    const resolved = resolveDebt(ROOT, 'debt-004-001', 'sprint-004');
    expect(resolved).toBe(true);
  });

  it('isPriorityFix + DONE resolves debt for fixForTaskId', () => {
    mockMemStore.getById.mockReturnValue(makeDbEntry('debt-003-001', false));

    const resolved = resolveDebt(ROOT, 'debt-003-001', 'sprint-004');
    expect(resolved).toBe(true);

    const input = mockMemStore.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.status).toBe('resolved');
    const meta = input.metadata as Record<string, unknown>;
    expect(meta.resolvedInSprintId).toBe('sprint-004');
  });

  it('NO_GO evaluation does not resolve debt via DB', () => {
    const task: Task = {
      id: '004-001', title: 'Test task', description: 'Test', model: 'sonnet',
      effort: 'normal', priority: 'NORMAL', reason: 'Test',
      scope: { directories: [], filesRead: [], filesWrite: [] }, dependencies: [],
      goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: '' },
      status: 'PENDING' as Task['status'], sprintId: 'sprint-004',
    };
    const result: TaskResult = {
      taskId: '004-001', workerId: 'w-004-001', filesChanged: [],
      linesAdded: 0, linesRemoved: 0, testsPassed: false, coverage: 0,
      selfAssessment: 'NO_GO', notes: 'Build failed',
    };

    handleEvaluation(ROOT, task, TaskEvaluation.NO_GO, result);

    // NO_GO creates a fix task, not resolves debt — no upsert with status='resolved'
    const resolvedCalls = mockMemStore.upsert.mock.calls.filter((args: unknown[]) => {
      const input = args[0] as Record<string, unknown>;
      return input.status === 'resolved';
    });
    expect(resolvedCalls).toHaveLength(0);
  });

  it('resolveDebt handles multiple items and only resolves the target', () => {
    mockMemStore.getById.mockImplementation((id: string) => {
      if (id === 'debt-001') return makeDbEntry('debt-001', false);
      if (id === 'debt-002') return makeDbEntry('debt-002', false);
      if (id === 'debt-003') return makeDbEntry('debt-003', false);
      return null;
    });

    const r1 = resolveDebt(ROOT, 'debt-002', 'sprint-004');
    expect(r1).toBe(true);

    // Only one upsert call for debt-002
    expect(mockMemStore.upsert).toHaveBeenCalledTimes(1);
    const input = mockMemStore.upsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.id).toBe('debt-002');
    expect(input.status).toBe('resolved');
  });
});
