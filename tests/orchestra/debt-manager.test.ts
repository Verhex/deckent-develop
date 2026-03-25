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
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    countBrainLines: vi.fn().mockReturnValue(100),
  };
});

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { updateTaskStatus, releaseAllLocks } from '../../src/agents/worker.js';
import { countBrainLines, parseDebtTable, generateDebtTable } from '../../src/core/utils.js';
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

// ─── Tests ──────────────────────────────────────────────────────────

describe('handleEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('GO_WITH_TECH_DEBT: writes debt entry to DEBT.md', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const task = makeTask();
    const result = makeTaskResult({ notes: 'tech debt note' });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);
    expect(mkdirSync).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalled();
    const writtenContent = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    expect(writtenContent).toContain('debt-task-001');
  });

  it('GO_WITH_TECH_DEBT: appends to existing debt entries', () => {
    const existingItem = makeDebtItem({ id: 'debt-existing' });
    const existingContent = makeDebtTableContent([existingItem]);
    vi.mocked(readFileSync).mockReturnValue(existingContent);
    const task = makeTask();
    const result = makeTaskResult({ notes: 'another debt' });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);
    const writtenContent = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    expect(writtenContent).toContain('debt-existing');
    expect(writtenContent).toContain('debt-task-001');
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
    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'NO_GO', notes: 'failed' });
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);
    const writtenContent = JSON.parse(vi.mocked(writeFileSync).mock.calls[0]![1] as string);
    expect(writtenContent.isPriorityFix).toBe(true);
    expect(writtenContent.priority).toBe('CRITICAL');
    expect(writtenContent.status).toBe(TaskStatus.PENDING);
    expect(writtenContent.fixForTaskId).toBe('task-001');
  });

  it('NO_GO: does not release locks', () => {
    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'NO_GO', notes: 'failed' });
    handleEvaluation('/root', task, TaskEvaluation.NO_GO, result);
    expect(releaseAllLocks).not.toHaveBeenCalled();
  });
});

// ─── handleCrossDependencies ────────────────────────────────────────

describe('handleCrossDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const result = handleCrossDependencies('/root', sprint, evaluations);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('task-001-xfix');
    expect(result[0]!.isPriorityFix).toBe(true);
    expect(result[0]!.priority).toBe('CRITICAL');
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
    vi.clearAllMocks();
  });

  it('does nothing when DEBT.md is empty/missing', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    escalateDebt('/root');
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('increments sprintsOpen for unresolved items', () => {
    const item = makeDebtItem({ sprintsOpen: 0 });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([item]));
    escalateDebt('/root');
    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    const items = parseDebtTable(written);
    expect(items[0]!.sprintsOpen).toBe(1);
  });

  it('escalates NORMAL to HIGH after 2 sprints open', () => {
    const item = makeDebtItem({ sprintsOpen: 1, priority: DebtPriority.NORMAL });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([item]));
    escalateDebt('/root');
    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    const items = parseDebtTable(written);
    expect(items[0]!.priority).toBe(DebtPriority.HIGH);
    expect(items[0]!.sprintsOpen).toBe(2);
  });

  it('escalates to CRITICAL after 3+ sprints open', () => {
    const item = makeDebtItem({ sprintsOpen: 2, priority: DebtPriority.HIGH });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([item]));
    escalateDebt('/root');
    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    const items = parseDebtTable(written);
    expect(items[0]!.priority).toBe(DebtPriority.CRITICAL);
    expect(items[0]!.sprintsOpen).toBe(3);
  });

  it('does not escalate resolved items', () => {
    const item = makeDebtItem({ sprintsOpen: 5, resolved: true, priority: DebtPriority.NORMAL });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([item]));
    escalateDebt('/root');
    // Resolved items are skipped entirely — no write happens
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('does not re-escalate CRITICAL items', () => {
    const item = makeDebtItem({ sprintsOpen: 5, priority: DebtPriority.CRITICAL });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([item]));
    escalateDebt('/root');
    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    const items = parseDebtTable(written);
    expect(items[0]!.priority).toBe(DebtPriority.CRITICAL);
  });
});

// ─── resolveDebt ────────────────────────────────────────────────────

describe('resolveDebt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when DEBT.md is empty/missing', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const result = resolveDebt('/root', 'debt-001', 'sprint-002');
    expect(result).toBe(false);
  });

  it('returns false when debt id not found', () => {
    const item = makeDebtItem({ id: 'debt-999' });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([item]));
    const result = resolveDebt('/root', 'debt-001', 'sprint-002');
    expect(result).toBe(false);
  });

  it('returns false when debt is already resolved', () => {
    const item = makeDebtItem({ id: 'debt-001', resolved: true, resolvedInSprintId: 'sprint-001' });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([item]));
    const result = resolveDebt('/root', 'debt-001', 'sprint-002');
    expect(result).toBe(false);
  });

  it('marks debt as resolved and returns true', () => {
    const item = makeDebtItem({ id: 'debt-001', resolved: false });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([item]));
    const result = resolveDebt('/root', 'debt-001', 'sprint-002');
    expect(result).toBe(true);
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('writes resolvedInSprintId correctly', () => {
    const item = makeDebtItem({ id: 'debt-001', resolved: false });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([item]));
    resolveDebt('/root', 'debt-001', 'sprint-005');
    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    const items = parseDebtTable(written);
    expect(items[0]!.resolved).toBe(true);
    expect(items[0]!.resolvedInSprintId).toBe('sprint-005');
  });
});

// ─── runDecay ───────────────────────────────────────────────────────

describe('runDecay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(countBrainLines).mockReturnValue(100);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it('returns early (no decay) when below budget and no force', () => {
    vi.mocked(countBrainLines).mockReturnValue(100); // under 600
    const result = runDecay('/root', 'sprint-001');
    expect(result.linesBefore).toBe(100);
    expect(result.linesAfter).toBe(100);
    expect(result.archivedSprints).toEqual([]);
    expect(result.removedDebtCount).toBe(0);
    expect(result.removedPatternCount).toBe(0);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('runs decay when force=true even under budget', () => {
    vi.mocked(countBrainLines).mockReturnValue(100);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const result = runDecay('/root', 'sprint-001', { force: true });
    // Should have run (didn't return early)
    expect(result.linesBefore).toBe(100);
  });

  it('runs decay when over budget', () => {
    vi.mocked(countBrainLines).mockReturnValue(700); // over 600
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const result = runDecay('/root', 'sprint-001');
    expect(result.linesBefore).toBe(700);
  });

  it('removes resolved patterns from PATTERNS.json', () => {
    vi.mocked(countBrainLines).mockReturnValue(700);
    // existsSync: true for PATTERNS file, false for sprints dir
    vi.mocked(existsSync).mockImplementation((p: any) =>
      String(p).includes('PATTERNS') ? true : false
    );
    const patterns: PatternEntry[] = [
      { pattern: 'active', occurrences: 1, firstDetectedInSprint: 'sprint-001', lastDetectedInSprint: 'sprint-001', resolved: false },
      { pattern: 'resolved', occurrences: 1, firstDetectedInSprint: 'sprint-001', lastDetectedInSprint: 'sprint-001', resolved: true },
    ];
    // readFileSync: return patterns JSON for PATTERNS path, throw for everything else
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('PATTERNS')) return JSON.stringify(patterns);
      throw new Error('ENOENT');
    });
    const result = runDecay('/root', 'sprint-005');
    expect(result.removedPatternCount).toBe(1);
    const patternsWrite = vi.mocked(writeFileSync).mock.calls.find(c =>
      (c[0] as string).includes('PATTERNS')
    );
    expect(patternsWrite).toBeDefined();
    const written = JSON.parse(patternsWrite![1] as string) as PatternEntry[];
    expect(written).toHaveLength(1);
    expect(written[0]!.pattern).toBe('active');
  });

  it('archives old sprint logs keeping last 2', () => {
    vi.mocked(countBrainLines).mockReturnValue(700);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      'sprint-001.md', 'sprint-002.md', 'sprint-003.md', 'sprint-004.md',
    ] as any);
    // readFileSync: return content for sprint files, throw for PATTERNS/DEBT
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('sprint-')) return '# Sprint content';
      throw new Error('ENOENT');
    });
    const result = runDecay('/root', 'sprint-005');
    expect(result.archivedSprints).toHaveLength(2);
    expect(result.archivedSprints).toContain('sprint-001.md');
    expect(result.archivedSprints).toContain('sprint-002.md');
    expect(unlinkSync).toHaveBeenCalledTimes(2);
  });

  it('removes resolved debt entries old enough', () => {
    vi.mocked(countBrainLines).mockReturnValue(700);
    vi.mocked(existsSync).mockReturnValue(false);
    const resolvedItem = makeDebtItem({
      id: 'debt-old',
      resolved: true,
      resolvedInSprintId: 'sprint-001',
    });
    const activeItem = makeDebtItem({ id: 'debt-active', resolved: false });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([resolvedItem, activeItem]));
    const result = runDecay('/root', 'sprint-010'); // 9 sprints later > 3 retention
    expect(result.removedDebtCount).toBe(1);
  });

  it('returns correct linesBefore and linesAfter', () => {
    vi.mocked(countBrainLines)
      .mockReturnValueOnce(400)  // linesBefore
      .mockReturnValue(250);     // subsequent calls
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const result = runDecay('/root', 'sprint-001', { force: true });
    expect(result.linesBefore).toBe(400);
    expect(result.linesAfter).toBe(250);
  });
});

// ─── decay ──────────────────────────────────────────────────────────

describe('decay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(countBrainLines).mockReturnValue(100);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(existsSync).mockReturnValue(false);
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
    vi.clearAllMocks();
  });

  it('handleEvaluation: GO_WITH_TECH_DEBT truncates long notes to 80 chars', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const task = makeTask();
    const longNotes = 'A'.repeat(200);
    const result = makeTaskResult({ notes: longNotes });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);
    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    const items = parseDebtTable(written);
    expect(items[0]!.description.length).toBeLessThanOrEqual(80);
  });

  it('handleEvaluation: GO_WITH_TECH_DEBT with empty sprintId uses empty string', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const task = makeTask({ sprintId: undefined });
    const result = makeTaskResult({ notes: 'note' });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);
    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    const items = parseDebtTable(written);
    expect(items[0]!.originSprintId).toBe('');
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

  it('resolveDebt: handles DEBT.md with multiple items — only resolves the correct one', () => {
    const item1 = makeDebtItem({ id: 'debt-001', resolved: false });
    const item2 = makeDebtItem({ id: 'debt-002', resolved: false });
    vi.mocked(readFileSync).mockReturnValue(makeDebtTableContent([item1, item2]));
    resolveDebt('/root', 'debt-001', 'sprint-003');
    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    const items = parseDebtTable(written);
    expect(items[0]!.resolved).toBe(true);
    expect(items[1]!.resolved).toBe(false);
  });

  it('runDecay: no sprint files — archivedSprints is empty', () => {
    vi.mocked(countBrainLines).mockReturnValue(400);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as any);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const result = runDecay('/root', 'sprint-005');
    expect(result.archivedSprints).toEqual([]);
  });
});

// ─── F) Tolerant sprint number regex ────────────────────────────────

describe('runDecay: tolerant sprint number regex (F)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches "## Sprint 1-5 Özet" format for memory trimming', () => {
    // Sprint number formats that were previously broken
    vi.mocked(countBrainLines)
      .mockReturnValueOnce(700)  // linesBefore > budget, trigger decay
      .mockReturnValueOnce(700)  // still over budget, trigger memory trim
      .mockReturnValue(400);     // after trim
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as any);
    const memoryContent = [
      '## Sprint 1-5 Özet',
      '- sleepSync → async geçişi',
      '## Sprint sprint-010 Learnings',
      '- Recent learning here',
    ].join('\n');
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('MEMORY')) return memoryContent;
      throw new Error('ENOENT');
    });
    // Should not throw — tolerant regex should match "Sprint 1-5"
    expect(() => runDecay('/root', 'sprint-015', { force: true })).not.toThrow();
  });

  it('matches "## Sprint sprint-NNN Learnings" format', () => {
    vi.mocked(countBrainLines)
      .mockReturnValueOnce(700)
      .mockReturnValueOnce(700)
      .mockReturnValue(400);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as any);
    const memoryContent = [
      '## Sprint sprint-001 Learnings',
      '- Old learning',
      '## Sprint sprint-010 Learnings',
      '- Recent learning',
    ].join('\n');
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('MEMORY')) return memoryContent;
      throw new Error('ENOENT');
    });
    expect(() => runDecay('/root', 'sprint-015', { force: true })).not.toThrow();
  });
});

// ─── E) Smart truncation preserves headers ───────────────────────────

describe('runDecay: smart truncation preserves sprint headers (E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not truncate to bare 50 lines — preserves section context', () => {
    // Over budget even after all other decay steps
    vi.mocked(countBrainLines).mockReturnValue(900);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as any);

    // Memory content with many sections
    const sections = Array.from({ length: 10 }, (_, i) =>
      `## Sprint ${i + 1} Özet\n- Learning item ${i + 1}\n- Another item ${i + 1}`,
    );
    const memoryContent = sections.join('\n');
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('MEMORY')) return memoryContent;
      throw new Error('ENOENT');
    });

    runDecay('/root', 'sprint-015', { force: true });

    const memWriteCalls = vi.mocked(writeFileSync).mock.calls.filter(c =>
      (c[0] as string).includes('MEMORY'),
    );
    expect(memWriteCalls.length).toBeGreaterThan(0);
    const written = memWriteCalls[memWriteCalls.length - 1]![1] as string;
    // Should preserve at least one ## header
    expect(written).toMatch(/^##/m);
  });
});

// ─── G) Archive .gitignore fix ───────────────────────────────────────

describe('runDecay: archive directory git tracking (G)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes .gitignore negation file in archive directory when archiving sprints', () => {
    vi.mocked(countBrainLines).mockReturnValue(700);
    vi.mocked(existsSync).mockImplementation((p: any) => {
      // sprints dir exists, archive .gitignore does NOT exist yet
      if (String(p).includes('archive') && String(p).includes('.gitignore')) return false;
      return true;
    });
    vi.mocked(readdirSync).mockReturnValue([
      'sprint-001.md', 'sprint-002.md', 'sprint-003.md',
    ] as any);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('sprint-')) return '# Sprint content';
      throw new Error('ENOENT');
    });

    runDecay('/root', 'sprint-005');

    const gitignoreWrite = vi.mocked(writeFileSync).mock.calls.find(c =>
      (c[0] as string).includes('archive') && (c[0] as string).includes('.gitignore'),
    );
    expect(gitignoreWrite).toBeDefined();
    // Content should include negation to allow files
    expect(gitignoreWrite![1] as string).toContain('!*');
  });

  it('does not overwrite .gitignore if it already exists', () => {
    vi.mocked(countBrainLines).mockReturnValue(700);
    vi.mocked(existsSync).mockImplementation((p: any) => {
      // archive .gitignore already exists
      if (String(p).includes('archive') && String(p).includes('.gitignore')) return true;
      return true;
    });
    vi.mocked(readdirSync).mockReturnValue([
      'sprint-001.md', 'sprint-002.md', 'sprint-003.md',
    ] as any);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('sprint-')) return '# Sprint content';
      throw new Error('ENOENT');
    });

    runDecay('/root', 'sprint-005');

    const gitignoreWrites = vi.mocked(writeFileSync).mock.calls.filter(c =>
      (c[0] as string).includes('archive') && (c[0] as string).includes('.gitignore'),
    );
    // Should NOT write .gitignore again since it already exists
    expect(gitignoreWrites).toHaveLength(0);
  });
});
