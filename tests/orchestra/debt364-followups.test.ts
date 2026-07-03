// 365-003 364-DEBT-CLOSE (continued by 366-002) — closes debt-364-001's own
// named follow-up gap: "add tests/orchestra covering recordDebtEntry
// TIMEOUT_WITH_WORK -> timeout-partial classification +
// injectCriticalDebtTasks skip of timeout-partial (mirror
// debt-ledger-coverage.test.ts pattern)." 364-001's write authority was
// `src/` only, so it fixed the phantom-debt loop (debt-361-001-fix: a
// killed-worker TIMEOUT_WITH_WORK result was recorded as a generic
// 'standard' debt, escalated to CRITICAL, and re-injected a no-op fix task
// every sprint) but could not add a repo regression test for it. This file
// is that regression test — nothing else from sprint-364's debt notes
// (364-003, 364-008, 364-011) falls inside this task's write authority; see
// docs/analysis/debt-close-364.md for the disk-verified accounting of all 4
// debt notes named by this task.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, TaskEvaluation, DebtPriority } from '../../src/core/types.js';
import type { Task, TaskResult, DebtItem, ModelType } from '../../src/core/types.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => { throw new Error('ENOENT: no such file'); }),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
}));

const mockDbEntries = new Map<string, any>();
const mockMemoryStore = {
  getById: vi.fn((id: string) => mockDbEntries.get(id) ?? null),
  insert: vi.fn((input: any) => {
    const entry = { ...input, metadata: JSON.stringify(input.metadata ?? {}) };
    mockDbEntries.set(input.id, entry);
    return entry;
  }),
  close: vi.fn(),
};

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemoryStore),
}));

import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { injectCriticalDebtTasks } from '../../src/orchestra/sprint-planner.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-364-001-fix',
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
    sprintId: 'sprint-364',
    assignedWorker: 'w-task-364-001-fix',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-364-001-fix',
    workerId: 'w-task-364-001-fix',
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

function resetMocks() {
  vi.clearAllMocks();
  mockDbEntries.clear();
  mockMemoryStore.getById.mockImplementation((id: string) => mockDbEntries.get(id) ?? null);
  mockMemoryStore.insert.mockImplementation((input: any) => {
    const entry = { ...input, metadata: JSON.stringify(input.metadata ?? {}) };
    mockDbEntries.set(input.id, entry);
    return entry;
  });
}

describe('handleEvaluation: TIMEOUT-PARTIAL classification (365-003, closes debt-364-001)', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('TIMEOUT_WITH_WORK selfAssessment records class=timeout-partial with an honest ledger entry', () => {
    // Reproduces the debt-361-001-fix shape: worker killed mid-execution
    // (exitCode=1) but git diff showed files -> reconciled to
    // GO_WITH_TECH_DEBT by result-evaluator, selfAssessment stays the raw
    // orchestration marker TIMEOUT_WITH_WORK.
    const task = makeTask();
    const result = makeTaskResult({
      selfAssessment: 'TIMEOUT_WITH_WORK' as TaskResult['selfAssessment'],
      notes: 'Worker timeout/killed (exitCode=1) but git diff shows 67 files modified. '
        + 'Brain should reconcile via Spurious NO_GO helper.',
    });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);

    expect(mockMemoryStore.insert).toHaveBeenCalledTimes(1);
    const insertArg = mockMemoryStore.insert.mock.calls[0]![0];
    expect(insertArg.id).toBe('debt-task-364-001-fix');
    expect(insertArg.metadata.class).toBe('timeout-partial');
    expect(insertArg.tags).toContain('timeout-partial');

    // The phantom-debt bug: the raw orchestration string used to become the
    // ledger TITLE verbatim. The honest title must NOT start with the raw
    // "Tech debt from ...: Worker timeout/killed" phrasing.
    expect(insertArg.title).not.toMatch(/^Tech debt from/);
    // Ledger titles are truncated to 80 chars (debt-manager.ts: title.slice(0, 80)).
    expect(insertArg.title).toBe(
      'Timeout-partial from task-364-001-fix: worker killed mid-execution, work accepted'.slice(0, 80),
    );

    // The original worker note must still be preserved in content for
    // traceability, even though it no longer drives the title.
    expect(insertArg.content).toContain('Worker timeout/killed (exitCode=1) but git diff shows 67 files modified');
    expect(insertArg.content).toContain('no described');
  });

  it('a normal evaluator GO_WITH_TECH_DEBT (not a timeout) still classes as standard (regression guard)', () => {
    const task = makeTask({ id: 'task-364-999' });
    const result = makeTaskResult({
      taskId: 'task-364-999',
      selfAssessment: 'DONE',
      notes: 'proof-of-function smoke failed',
    });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);

    expect(mockMemoryStore.insert).toHaveBeenCalledTimes(1);
    const insertArg = mockMemoryStore.insert.mock.calls[0]![0];
    expect(insertArg.id).toBe('debt-task-364-999');
    expect(insertArg.metadata.class).toBe('standard');
    expect(insertArg.tags).not.toContain('timeout-partial');
    expect(insertArg.title).toMatch(/^Tech debt from task-364-999:/);
  });
});

describe('injectCriticalDebtTasks: timeout-partial skip (365-003, closes debt-364-001)', () => {
  const MODEL: ModelType = 'sonnet';
  const SPRINT_ID = 'sprint-365';

  function makeDebt(overrides: Partial<DebtItem>): DebtItem {
    return {
      id: 'debt-364-001-fix',
      description: 'placeholder',
      originTaskId: '364-001-fix',
      originSprintId: 'sprint-364',
      priority: DebtPriority.CRITICAL,
      sprintsOpen: 1,
      resolved: false,
      resolvedInSprintId: undefined,
      createdAt: '2026-07-03T00:00:00.000Z',
      ...overrides,
    };
  }

  it('class=timeout-partial CRITICAL debt is skipped, not injected as a fix task', () => {
    const debt: DebtItem[] = [
      makeDebt({
        class: 'timeout-partial',
        originScope: {
          directories: ['src/orchestra/'],
          filesWrite: ['src/orchestra/sprint-phases.ts'],
        },
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toHaveLength(0);
    expect(result.skipped).toEqual(['debt-364-001-fix']);
    expect(result.nextSeq).toBe(1);
  });

  it('class=standard CRITICAL debt (contrast case) still gets a fix task injected', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'debt-364-999',
        class: 'standard',
        originScope: {
          directories: ['src/orchestra/'],
          filesWrite: ['src/orchestra/sprint-phases.ts'],
        },
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    expect(result.tasks[0]!.isPriorityFix).toBe(true);
    expect(result.tasks[0]!.fixForTaskId).toBe('364-001-fix');
  });
});
