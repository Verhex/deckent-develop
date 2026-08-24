import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, TaskEvaluation, DebtPriority } from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, DebtItem, PatternEntry } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => { throw new Error('ENOENT: no such file'); }),
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

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
  };
});

// ── MemoryStore mock ─────────────────────────────────────────────────
// debt-manager now uses MemoryStore (DB-first) instead of file I/O for debt operations.
const mockDbEntries = new Map<string, any>();
const mockMemoryStore = {
  getById: vi.fn((id: string) => mockDbEntries.get(id) ?? null),
  getByType: vi.fn((type: string) => {
    const results: any[] = [];
    for (const e of mockDbEntries.values()) { if (e.type === type) results.push(e); }
    return results;
  }),
  insert: vi.fn((input: any) => {
    const entry = {
      ...input,
      metadata: JSON.stringify(input.metadata ?? {}),
      tag_text: (input.tags ?? []).join(' '),
      status: input.status ?? 'active',
      priority: input.priority ?? 'normal',
      sprint_id: input.sprint_id ?? null,
      sprint_num: input.sprint_num ?? 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    mockDbEntries.set(input.id, entry);
    return entry;
  }),
  upsert: vi.fn((input: any) => {
    const entry = {
      ...input,
      metadata: JSON.stringify(input.metadata ?? {}),
      tag_text: (input.tags ?? []).join(' '),
      status: input.status ?? 'active',
      priority: input.priority ?? 'normal',
      sprint_id: input.sprint_id ?? null,
      sprint_num: input.sprint_num ?? 0,
      created_at: mockDbEntries.get(input.id)?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    mockDbEntries.set(input.id, entry);
    return entry;
  }),
  softDelete: vi.fn(),
  totalCount: vi.fn(() => mockDbEntries.size),
  countByType: vi.fn(),
  decay: vi.fn(),
  close: vi.fn(),
  getRawDb: vi.fn(),
  getRelationsFrom: vi.fn().mockReturnValue([]),
  getRelationsTo: vi.fn().mockReturnValue([]),
  getTagsForEntry: vi.fn().mockReturnValue([]),
  getByTags: vi.fn().mockReturnValue([]),
  getHistory: vi.fn().mockReturnValue([]),
  restore: vi.fn(),
  getSchemaVersion: vi.fn().mockReturnValue(1),
};

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemoryStore),
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { updateTaskStatus, releaseAllLocks } from '../../src/agents/worker.js';
import { parseDebtTable, generateDebtTable } from '../../src/core/utils.js';
import { MEMORY_DB_FILE } from '../../src/core/constants.js';
import {
  handleEvaluation,
  handleCrossDependencies,
  escalateDebt,
  resolveDebt,
  runDecay,
  decay,
} from '../../src/orchestra/debt-manager.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001',
    title: 'Test task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-001',
    assignedWorker: 'w-task-001',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-001',
    workerId: 'w-task-001',
    filesChanged: ['src/foo.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'all good',
    ...overrides,
  };
}

function makeDebtTableContent(items: DebtItem[]): string {
  return generateDebtTable(items);
}

function makeDebtItem(overrides: Partial<DebtItem> = {}): DebtItem {
  return {
    id: 'debt-001',
    description: 'Some tech debt',
    originTaskId: 'task-001',
    originSprintId: 'sprint-001',
    priority: DebtPriority.NORMAL,
    sprintsOpen: 0,
    resolved: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const promptCostCanaryAuthority = {
  version: 1 as const,
  logicalLineageId: `prompt-cost-lineage:sha256:${'1'.repeat(64)}`,
  workloadDigest: '1'.repeat(64),
  featureDigest: '2'.repeat(64),
  authorityDigest: '3'.repeat(64),
  featureSnapshot: {
    excludeDynamicSystemPromptSections: true,
    workerCoreSystemPrompt: true,
    codexCoreChannel: false,
    codexSuppressProjectDoc: false,
    catalogMountMask: false,
  },
};

// ─── Shared reset ──────────────────────────────────────────────────
function resetMocks() {
  vi.clearAllMocks();
  mockDbEntries.clear();
  // Re-wire mockMemoryStore after clearAllMocks resets implementations
  mockMemoryStore.getById.mockImplementation((id: string) => mockDbEntries.get(id) ?? null);
  mockMemoryStore.getByType.mockImplementation((type: string) => {
    const results: any[] = [];
    for (const e of mockDbEntries.values()) { if (e.type === type) results.push(e); }
    return results;
  });
  mockMemoryStore.insert.mockImplementation((input: any) => {
    const entry = {
      ...input,
      metadata: JSON.stringify(input.metadata ?? {}),
      tag_text: (input.tags ?? []).join(' '),
      status: input.status ?? 'active',
      priority: input.priority ?? 'normal',
      sprint_id: input.sprint_id ?? null,
      sprint_num: input.sprint_num ?? 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    mockDbEntries.set(input.id, entry);
    return entry;
  });
  mockMemoryStore.upsert.mockImplementation((input: any) => {
    const entry = {
      ...input,
      metadata: JSON.stringify(input.metadata ?? {}),
      tag_text: (input.tags ?? []).join(' '),
      status: input.status ?? 'active',
      priority: input.priority ?? 'normal',
      sprint_id: input.sprint_id ?? null,
      sprint_num: input.sprint_num ?? 0,
      created_at: mockDbEntries.get(input.id)?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    mockDbEntries.set(input.id, entry);
    return entry;
  });
  mockMemoryStore.totalCount.mockImplementation(() => mockDbEntries.size);
  mockMemoryStore.close.mockImplementation(() => {});
  mockMemoryStore.decay.mockImplementation(() => {});
  // existsSync defaults: true for DB path, false otherwise
  vi.mocked(existsSync).mockImplementation((p: any) => {
    if (String(p).includes(MEMORY_DB_FILE)) return true;
    return false;
  });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('handleEvaluation', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('DONE: updates task status to DONE and releases locks', () => {
    const task = makeTask();
    const result = makeTaskResult();
    handleEvaluation('/root', task, TaskEvaluation.DONE, result);
    expect(updateTaskStatus).toHaveBeenCalledWith('/root', 'task-001', TaskStatus.DONE);
    expect(releaseAllLocks).toHaveBeenCalledWith('/root', 'w-task-001');
  });

  it('DONE: does not write debt file', () => {
    const task = makeTask();
    const result = makeTaskResult();
    handleEvaluation('/root', task, TaskEvaluation.DONE, result);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('DONE: uses w-{id} as worker fallback when assignedWorker is missing', () => {
    const task = makeTask({ assignedWorker: undefined });
    const result = makeTaskResult();
    handleEvaluation('/root', task, TaskEvaluation.DONE, result);
    expect(releaseAllLocks).toHaveBeenCalledWith('/root', 'w-task-001');
  });

  it('GO_WITH_TECH_DEBT: updates task status to DONE', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'GO_WITH_TECH_DEBT', notes: 'minor issue' });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);
    expect(updateTaskStatus).toHaveBeenCalledWith('/root', 'task-001', TaskStatus.DONE);
    expect(releaseAllLocks).toHaveBeenCalledWith('/root', 'w-task-001');
  });

  it('GO_WITH_TECH_DEBT: writes debt entry via MemoryStore', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const task = makeTask();
    const result = makeTaskResult({ notes: 'tech debt note' });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);
    expect(mockMemoryStore.insert).toHaveBeenCalled();
    const insertArg = mockMemoryStore.insert.mock.calls[0]![0];
    expect(insertArg.id).toBe('debt-task-001');
    expect(insertArg.type).toBe('debt');
    expect(mockMemoryStore.close).toHaveBeenCalled();
  });

  it('GO_WITH_TECH_DEBT: derives debt sprint_id from task id when task.sprintId is missing (B10)', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    // task.sprintId is optional — when absent the debt entry must still be
    // sprint-associated (derived from the NNN-MMM task id) so sprint-range
    // queries, escalation and decay never miss it.
    const task = makeTask({ id: '200-005', assignedWorker: 'w-200-005', sprintId: undefined });
    const result = makeTaskResult({ taskId: '200-005', notes: 'tech debt note' });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);
    const insertArg = mockMemoryStore.insert.mock.calls[0]![0];
    expect(insertArg.sprint_id).toBe('sprint-200');
    expect(insertArg.sprint_num).toBe(200);
    expect(insertArg.metadata.originSprintId).toBe('sprint-200');
  });

  it('GO_WITH_TECH_DEBT: does not insert duplicate debt entry', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    // Simulate existing entry
    mockMemoryStore.getById.mockReturnValueOnce({ id: 'debt-task-001', type: 'debt' });
    const task = makeTask();
    const result = makeTaskResult({ notes: 'another debt' });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);
    expect(mockMemoryStore.insert).not.toHaveBeenCalled();
    expect(mockMemoryStore.close).toHaveBeenCalled();
  });

  it('NO_GO: updates task status to NO_GO', () => {
    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'NO_GO', notes: 'failed badly' });
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);
    expect(updateTaskStatus).toHaveBeenCalledWith('/root', 'task-001', TaskStatus.NO_GO);
  });

  it('NO_GO: creates a fix task file', () => {
    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'NO_GO', notes: 'critical failure' });
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);
    expect(writeFileSync).toHaveBeenCalled();
    const writtenPath = vi.mocked(writeFileSync).mock.calls[0]![0] as string;
    expect(writtenPath).toContain('task-task-001-fix.json');
  });

  it('NO_GO: fix task has isPriorityFix=true and CRITICAL priority', () => {
    const task = makeTask({ type: 'code-development', promptCostCanary: promptCostCanaryAuthority });
    const result = makeTaskResult({ selfAssessment: 'NO_GO', notes: 'failed' });
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);
    const writtenContent = JSON.parse(vi.mocked(writeFileSync).mock.calls[0]![1] as string);
    expect(writtenContent.isPriorityFix).toBe(true);
    expect(writtenContent.priority).toBe('CRITICAL');
    expect(writtenContent.status).toBe(TaskStatus.PENDING);
    expect(writtenContent.fixForTaskId).toBe('task-001');
    expect(writtenContent.type).toBe('code-development');
    expect(writtenContent.promptCostCanary).toEqual(promptCostCanaryAuthority);
  });

  it('NO_GO: does not release locks', () => {
    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'NO_GO', notes: 'failed' });
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);
    expect(releaseAllLocks).not.toHaveBeenCalled();
  });

  it('identical typed acceptance failure after one FIX pauses instead of creating fix-fix', () => {
    const goNogo = {
      goCriteria: 'artifact exists', noGoCriteria: 'artifact absent', techDebtAcceptable: 'none',
      items: [{
        id: 'artifact-produced', statement: 'artifact exists', polarity: 'go' as const,
        evidenceRequirements: ['file:"src/generated.ts"'],
      }],
    };
    const original = makeTask({ goNogo });
    const originalResult = makeTaskResult({
      selfAssessment: 'NO_GO', filesChanged: [], linesAdded: 0, testsPassed: false,
    });
    handleEvaluation('/root', original, TaskEvaluation.NO_GO, originalResult);
    const firstFix = JSON.parse(vi.mocked(writeFileSync).mock.calls[0]![1] as string) as Task & {
      acceptanceFailureFingerprint: string;
    };

    vi.mocked(writeFileSync).mockClear();
    handleEvaluation('/root', firstFix, TaskEvaluation.NO_GO, {
      ...originalResult,
      taskId: firstFix.id,
    });

    expect(updateTaskStatus).toHaveBeenLastCalledWith('/root', firstFix.id, TaskStatus.PAUSED);
    const taskPaths = vi.mocked(writeFileSync).mock.calls.map(call => String(call[0]));
    expect(taskPaths.some(path => path.endsWith(`task-${firstFix.id}-fix.json`))).toBe(false);
  });
});

// ─── handleCrossDependencies ────────────────────────────────────────

describe('handleCrossDependencies', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('returns empty array when no NO_GO tasks', () => {
    const task1 = makeTask({ id: 'task-001' });
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [task1], workers: [],
    };
    const evaluations = new Map([['task-001', TaskEvaluation.DONE]]);
    const result = handleCrossDependencies('/root', sprint, evaluations);
    expect(result).toEqual([]);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('returns empty array when NO_GO task has no dependencies', () => {
    const task1 = makeTask({ id: 'task-001', dependencies: [] });
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [task1], workers: [],
    };
    const evaluations = new Map([['task-001', TaskEvaluation.NO_GO]]);
    const result = handleCrossDependencies('/root', sprint, evaluations);
    expect(result).toEqual([]);
  });

  it('creates cross-fix task when NO_GO depends on DONE task', () => {
    const task1 = makeTask({
      id: 'task-001',
      dependencies: [],
      type: 'code-development',
      promptCostCanary: promptCostCanaryAuthority,
    });
    const task2 = makeTask({ id: 'task-002', dependencies: ['task-001'] });
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [task1, task2], workers: [],
    };
    const evaluations = new Map([
      ['task-001', TaskEvaluation.DONE],
      ['task-002', TaskEvaluation.NO_GO],
    ]);
    const result = handleCrossDependencies('/root', sprint, evaluations);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('task-001-xfix');
    expect(result[0]!.isPriorityFix).toBe(true);
    expect(result[0]!.priority).toBe('CRITICAL');
    expect(result[0]!.type).toBe('code-development');
    expect(result[0]!.promptCostCanary).toEqual(promptCostCanaryAuthority);
  });

  it('does not create a concurrent cross-fix while the NO_GO task direct fix is pending', () => {
    const task1 = makeTask({ id: 'task-001', dependencies: [] });
    const task2 = makeTask({ id: 'task-002', dependencies: ['task-001'] });
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [task1, task2], workers: [],
    };
    const evaluations = new Map([
      ['task-001', TaskEvaluation.DONE],
      ['task-002', TaskEvaluation.NO_GO],
    ]);
    vi.mocked(existsSync).mockImplementation(path =>
      String(path).endsWith('task-task-002-fix.json'),
    );

    expect(handleCrossDependencies('/root', sprint, evaluations)).toEqual([]);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('does not create a late cross-fix after the direct fix lineage settled', () => {
    const task1 = makeTask({ id: 'task-001', dependencies: [] });
    const task2 = makeTask({ id: 'task-002', dependencies: ['task-001'] });
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [task1, task2], workers: [],
    };
    const evaluations = new Map([
      ['task-001', TaskEvaluation.DONE],
      ['task-002', TaskEvaluation.NO_GO],
    ]);
    vi.mocked(existsSync).mockImplementation(path => {
      const value = String(path);
      return value.endsWith('task-task-002-fix.json')
        || value.endsWith('task-task-002-fix.result');
    });

    expect(handleCrossDependencies('/root', sprint, evaluations)).toEqual([]);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('creates cross-fix task when NO_GO depends on GO_WITH_TECH_DEBT task', () => {
    const task1 = makeTask({ id: 'task-001', dependencies: [] });
    const task2 = makeTask({ id: 'task-002', dependencies: ['task-001'] });
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [task1, task2], workers: [],
    };
    const evaluations = new Map([
      ['task-001', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['task-002', TaskEvaluation.NO_GO],
    ]);
    const result = handleCrossDependencies('/root', sprint, evaluations);
    expect(result).toHaveLength(1);
    expect(result[0]!.fixForTaskId).toBe('task-001');
  });

  it('writes cross-fix task JSON file', () => {
    const task1 = makeTask({ id: 'task-001', dependencies: [] });
    const task2 = makeTask({ id: 'task-002', dependencies: ['task-001'] });
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [task1, task2], workers: [],
    };
    const evaluations = new Map([
      ['task-001', TaskEvaluation.DONE],
      ['task-002', TaskEvaluation.NO_GO],
    ]);
    handleCrossDependencies('/root', sprint, evaluations);
    expect(writeFileSync).toHaveBeenCalled();
    const writtenPath = vi.mocked(writeFileSync).mock.calls[0]![0] as string;
    expect(writtenPath).toContain('task-task-001-xfix.json');
  });

  it('does not create cross-fix when NO_GO depends on NO_GO', () => {
    const task1 = makeTask({ id: 'task-001', dependencies: [] });
    const task2 = makeTask({ id: 'task-002', dependencies: ['task-001'] });
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [task1, task2], workers: [],
    };
    const evaluations = new Map([
      ['task-001', TaskEvaluation.NO_GO],
      ['task-002', TaskEvaluation.NO_GO],
    ]);
    const result = handleCrossDependencies('/root', sprint, evaluations);
    expect(result).toEqual([]);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('skips dependency not in sprint tasks', () => {
    const task2 = makeTask({ id: 'task-002', dependencies: ['task-999'] });
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [task2], workers: [],
    };
    const evaluations = new Map([
      ['task-002', TaskEvaluation.NO_GO],
    ]);
    const result = handleCrossDependencies('/root', sprint, evaluations);
    expect(result).toEqual([]);
  });
});

// ─── escalateDebt ───────────────────────────────────────────────────

describe('escalateDebt', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('does nothing when no debt entries in DB', () => {
    escalateDebt('/root');
    expect(mockMemoryStore.upsert).not.toHaveBeenCalled();
  });

  it('increments sprintsOpen for unresolved items', () => {
    // Seed an active debt entry in the mock
    mockDbEntries.set('debt-001', {
      id: 'debt-001', type: 'debt', title: 'Some debt', content: 'desc',
      source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: JSON.stringify({ sprintsOpen: 0 }),
      tag_text: 'debt', created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), deleted_at: null,
    });
    escalateDebt('/root');
    expect(mockMemoryStore.upsert).toHaveBeenCalled();
    const upsertArg = mockMemoryStore.upsert.mock.calls[0]![0];
    expect(upsertArg.metadata.sprintsOpen).toBe(1);
  });

  it('escalates NORMAL to HIGH after 2 sprints open', () => {
    mockDbEntries.set('debt-001', {
      id: 'debt-001', type: 'debt', title: 'Some debt', content: 'desc',
      source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: JSON.stringify({ sprintsOpen: 1 }),
      tag_text: 'debt', created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), deleted_at: null,
    });
    escalateDebt('/root');
    const upsertArg = mockMemoryStore.upsert.mock.calls[0]![0];
    expect(upsertArg.priority).toBe('high');
    expect(upsertArg.metadata.sprintsOpen).toBe(2);
  });

  it('escalates to CRITICAL after 3+ sprints open', () => {
    mockDbEntries.set('debt-001', {
      id: 'debt-001', type: 'debt', title: 'Some debt', content: 'desc',
      source: 'brain', status: 'active', priority: 'high',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: JSON.stringify({ sprintsOpen: 2 }),
      tag_text: 'debt', created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), deleted_at: null,
    });
    escalateDebt('/root');
    const upsertArg = mockMemoryStore.upsert.mock.calls[0]![0];
    expect(upsertArg.priority).toBe('critical');
    expect(upsertArg.metadata.sprintsOpen).toBe(3);
  });

  it('does not escalate resolved items', () => {
    mockDbEntries.set('debt-001', {
      id: 'debt-001', type: 'debt', title: 'Some debt', content: 'desc',
      source: 'brain', status: 'resolved', priority: 'normal',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: JSON.stringify({ sprintsOpen: 5 }),
      tag_text: 'debt', created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), deleted_at: null,
    });
    escalateDebt('/root');
    expect(mockMemoryStore.upsert).not.toHaveBeenCalled();
  });

  it('does not re-escalate CRITICAL items', () => {
    mockDbEntries.set('debt-001', {
      id: 'debt-001', type: 'debt', title: 'Some debt', content: 'desc',
      source: 'brain', status: 'active', priority: 'critical',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: JSON.stringify({ sprintsOpen: 5 }),
      tag_text: 'debt', created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), deleted_at: null,
    });
    escalateDebt('/root');
    const upsertArg = mockMemoryStore.upsert.mock.calls[0]![0];
    expect(upsertArg.priority).toBe('critical');
  });
});

// ─── resolveDebt ────────────────────────────────────────────────────

describe('resolveDebt', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('returns false when no debt entries in DB', () => {
    const result = resolveDebt('/root', 'debt-001', 'sprint-002');
    expect(result).toBe(false);
  });

  it('returns false when debt id not found', () => {
    mockDbEntries.set('debt-999', {
      id: 'debt-999', type: 'debt', title: 'Other', content: 'x',
      source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: '{}', tag_text: 'debt',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
    });
    const result = resolveDebt('/root', 'debt-001', 'sprint-002');
    expect(result).toBe(false);
  });

  it('returns false when debt is already resolved', () => {
    mockDbEntries.set('debt-001', {
      id: 'debt-001', type: 'debt', title: 'Debt', content: 'x',
      source: 'brain', status: 'resolved', priority: 'normal',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: JSON.stringify({ resolvedInSprintId: 'sprint-001' }),
      tag_text: 'debt', created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), deleted_at: null,
    });
    const result = resolveDebt('/root', 'debt-001', 'sprint-002');
    expect(result).toBe(false);
  });

  it('marks debt as resolved and returns true', () => {
    mockDbEntries.set('debt-001', {
      id: 'debt-001', type: 'debt', title: 'Debt', content: 'x',
      source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: '{}', tag_text: 'debt',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
    });
    const result = resolveDebt('/root', 'debt-001', 'sprint-002');
    expect(result).toBe(true);
    expect(mockMemoryStore.upsert).toHaveBeenCalled();
  });

  it('writes resolvedInSprintId correctly', () => {
    mockDbEntries.set('debt-001', {
      id: 'debt-001', type: 'debt', title: 'Debt', content: 'x',
      source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: '{}', tag_text: 'debt',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
    });
    resolveDebt('/root', 'debt-001', 'sprint-005');
    const upsertArg = mockMemoryStore.upsert.mock.calls[0]![0];
    expect(upsertArg.status).toBe('resolved');
    expect(upsertArg.metadata.resolvedInSprintId).toBe('sprint-005');
  });

  it('does not resolve acceptance-route debt through the generic unscoped path', () => {
    mockDbEntries.set('debt-confirmation-001', {
      id: 'debt-confirmation-001', type: 'debt', title: 'Acceptance route', content: 'pending',
      source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: JSON.stringify({ class: 'acceptance-route', provisional: true }),
      tag_text: 'debt', created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), deleted_at: null,
    });

    expect(resolveDebt('/root', 'debt-confirmation-001', 'sprint-002')).toBe(false);
    expect(mockMemoryStore.upsert).not.toHaveBeenCalled();
    expect(mockDbEntries.get('debt-confirmation-001')?.status).toBe('active');
  });
});

// ─── runDecay ───────────────────────────────────────────────────────

describe('runDecay', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('returns early (no decay) when below budget and no force', () => {
    // totalCount returns small number (under budget)
    mockMemoryStore.totalCount.mockReturnValue(100);
    const result = runDecay('/root', 'sprint-001');
    expect(result.linesBefore).toBe(100);
    expect(result.linesAfter).toBe(100);
    expect(result.archivedSprints).toEqual([]);
    expect(result.removedDebtCount).toBe(0);
    expect(result.removedPatternCount).toBe(0);
    expect(mockMemoryStore.decay).not.toHaveBeenCalled();
  });

  it('runs decay when force=true even under budget', () => {
    mockMemoryStore.totalCount.mockReturnValue(100);
    const result = runDecay('/root', 'sprint-001', { force: true });
    expect(result.linesBefore).toBe(100);
    expect(mockMemoryStore.decay).toHaveBeenCalled();
  });

  it('runs decay when over budget', () => {
    mockMemoryStore.totalCount.mockReturnValueOnce(1000).mockReturnValue(800);
    const result = runDecay('/root', 'sprint-001');
    expect(result.linesBefore).toBe(1000);
    expect(mockMemoryStore.decay).toHaveBeenCalled();
  });

  it('calls store.decay with correct sprint number', () => {
    mockMemoryStore.totalCount.mockReturnValue(1000);
    runDecay('/root', 'sprint-005', { force: true });
    expect(mockMemoryStore.decay).toHaveBeenCalledWith(5, expect.any(Number));
  });

  it('returns totalCount before and after decay', () => {
    mockMemoryStore.totalCount
      .mockReturnValueOnce(400)   // linesBefore
      .mockReturnValue(250);      // linesAfter
    const result = runDecay('/root', 'sprint-001', { force: true });
    expect(result.linesBefore).toBe(400);
    expect(result.linesAfter).toBe(250);
  });

  it('closes the store even on forced decay', () => {
    mockMemoryStore.totalCount.mockReturnValue(100);
    runDecay('/root', 'sprint-001', { force: true });
    expect(mockMemoryStore.close).toHaveBeenCalled();
  });
});

// ─── decay ──────────────────────────────────────────────────────────

describe('decay', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('is a function that can be called', () => {
    expect(typeof decay).toBe('function');
  });

  it('calls runDecay internally (no error thrown)', () => {
    expect(() => decay('/root', 'sprint-001')).not.toThrow();
  });

  it('does not return a value (void)', () => {
    const result = decay('/root', 'sprint-001');
    expect(result).toBeUndefined();
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────

describe('Edge cases', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('handleEvaluation: GO_WITH_TECH_DEBT truncates long notes to 80 chars', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const task = makeTask();
    const longNotes = 'A'.repeat(200);
    const result = makeTaskResult({ notes: longNotes });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);
    expect(mockMemoryStore.insert).toHaveBeenCalled();
    const insertArg = mockMemoryStore.insert.mock.calls[0]![0];
    expect(insertArg.title.length).toBeLessThanOrEqual(80);
  });

  it('handleEvaluation: GO_WITH_TECH_DEBT with empty sprintId uses empty string', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const task = makeTask({ sprintId: undefined });
    const result = makeTaskResult({ notes: 'note' });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);
    expect(mockMemoryStore.insert).toHaveBeenCalled();
    const insertArg = mockMemoryStore.insert.mock.calls[0]![0];
    expect(insertArg.metadata.originSprintId).toBe('');
  });

  it('handleCrossDependencies: empty sprint tasks returns empty array', () => {
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [], workers: [],
    };
    const evaluations = new Map<string, TaskEvaluation>();
    const result = handleCrossDependencies('/root', sprint, evaluations);
    expect(result).toEqual([]);
  });

  it('handleCrossDependencies: multiple cross-fix tasks from multiple NO_GO tasks', () => {
    const task1 = makeTask({ id: 'task-001', dependencies: [] });
    const task2 = makeTask({ id: 'task-002', dependencies: [] });
    const task3 = makeTask({ id: 'task-003', dependencies: ['task-001'] });
    const task4 = makeTask({ id: 'task-004', dependencies: ['task-002'] });
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: 'ACTIVE' as any, phase: 'EXECUTE' as any,
      tasks: [task1, task2, task3, task4], workers: [],
    };
    const evaluations = new Map([
      ['task-001', TaskEvaluation.DONE],
      ['task-002', TaskEvaluation.DONE],
      ['task-003', TaskEvaluation.NO_GO],
      ['task-004', TaskEvaluation.NO_GO],
    ]);
    const result = handleCrossDependencies('/root', sprint, evaluations);
    expect(result).toHaveLength(2);
  });

  it('escalateDebt: handles empty content gracefully (no parseDebtTable call expected)', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(() => escalateDebt('/root')).not.toThrow();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('resolveDebt: with multiple items — only resolves the correct one', () => {
    mockDbEntries.set('debt-001', {
      id: 'debt-001', type: 'debt', title: 'Debt 1', content: 'x',
      source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: '{}', tag_text: 'debt',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
    });
    mockDbEntries.set('debt-002', {
      id: 'debt-002', type: 'debt', title: 'Debt 2', content: 'x',
      source: 'brain', status: 'active', priority: 'normal',
      sprint_id: 'sprint-001', sprint_num: 1,
      metadata: '{}', tag_text: 'debt',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
    });
    resolveDebt('/root', 'debt-001', 'sprint-003');
    expect(mockMemoryStore.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockMemoryStore.upsert.mock.calls[0]![0];
    expect(upsertArg.id).toBe('debt-001');
    expect(upsertArg.status).toBe('resolved');
  });

  it('runDecay: under budget — archivedSprints is empty', () => {
    mockMemoryStore.totalCount.mockReturnValue(100);
    const result = runDecay('/root', 'sprint-005');
    expect(result.archivedSprints).toEqual([]);
  });
});

// ─── F) Decay delegates to MemoryStore (DB-first) ─────────────────

describe('runDecay: MemoryStore delegation (F)', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('parses sprint number from sprint-015 format', () => {
    mockMemoryStore.totalCount.mockReturnValue(1000);
    runDecay('/root', 'sprint-015', { force: true });
    expect(mockMemoryStore.decay).toHaveBeenCalledWith(15, expect.any(Number));
  });

  it('parses sprint number from sprint-001 format', () => {
    mockMemoryStore.totalCount.mockReturnValue(1000);
    runDecay('/root', 'sprint-001', { force: true });
    expect(mockMemoryStore.decay).toHaveBeenCalledWith(1, expect.any(Number));
  });
});

// ─── E) Decay result shape ──────────────────────────────────────────

describe('runDecay: result shape (E)', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('returns zero counts from DB-first decay', () => {
    mockMemoryStore.totalCount
      .mockReturnValueOnce(1000)
      .mockReturnValue(800);
    const result = runDecay('/root', 'sprint-015', { force: true });
    // DB-first runDecay returns removedDebtCount=0 and removedPatternCount=0
    // because cleanup is handled internally by store.decay()
    expect(result.removedDebtCount).toBe(0);
    expect(result.removedPatternCount).toBe(0);
    expect(result.archivedSprints).toEqual([]);
  });
});

// ─── G) Store close always called ───────────────────────────────────

describe('runDecay: store lifecycle (G)', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('closes store after decay run', () => {
    mockMemoryStore.totalCount.mockReturnValue(1000);
    runDecay('/root', 'sprint-005');
    expect(mockMemoryStore.close).toHaveBeenCalled();
  });

  it('closes store even when under budget (early return)', () => {
    mockMemoryStore.totalCount.mockReturnValue(100);
    runDecay('/root', 'sprint-005');
    expect(mockMemoryStore.close).toHaveBeenCalled();
  });
});
