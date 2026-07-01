// 354-011 DEBT-LEDGER-COVERAGE — regression coverage for the self-DEBT ledger
// gap: evaluateWithRubric's numeric score can promote a task to DONE even
// when the worker itself declared GO_WITH_TECH_DEBT (sprint-352 005/010/012:
// rubric 89.33 -> DONE, self-DEBT silently dropped). handleEvaluation must
// record a debt-ledger entry for BOTH sources — evaluator-driven
// (evaluation === GO_WITH_TECH_DEBT) and worker-self-driven (evaluation ===
// DONE but result.selfAssessment === GO_WITH_TECH_DEBT) — without ever
// double-recording (idempotent debt-${task.id} key).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus, TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

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

import { updateTaskStatus } from '../../src/agents/worker.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';

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
    sprintId: 'sprint-352',
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

describe('handleEvaluation: DEBT-LEDGER-COVERAGE (354-011)', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('self-DEBT: evaluation DONE + selfAssessment GO_WITH_TECH_DEBT still records a ledger entry', () => {
    // Reproduces sprint-352 005/010/012 shape: rubric promoted DONE, but the
    // worker's own selfAssessment stayed GO_WITH_TECH_DEBT.
    const task = makeTask();
    const result = makeTaskResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'SCOPE CONFLICT: follow-up needed outside write authority',
    });
    handleEvaluation('/root', task, TaskEvaluation.DONE, result);

    expect(updateTaskStatus).toHaveBeenCalledWith('/root', 'task-001', TaskStatus.DONE);
    expect(mockMemoryStore.insert).toHaveBeenCalledTimes(1);
    const insertArg = mockMemoryStore.insert.mock.calls[0]![0];
    expect(insertArg.id).toBe('debt-task-001');
    expect(insertArg.type).toBe('debt');
    expect(insertArg.metadata.debtSource).toBe('self');
    expect(insertArg.content).toContain('SCOPE CONFLICT');
  });

  it('evaluator-DEBT: evaluation GO_WITH_TECH_DEBT still records a ledger entry (regression guard)', () => {
    // Reproduces sprint-352 008/013 shape: worker self-assessed DONE, but
    // Brain's evaluation (downstream gate) landed on GO_WITH_TECH_DEBT.
    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'DONE', notes: 'proof-of-function smoke failed' });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);

    expect(updateTaskStatus).toHaveBeenCalledWith('/root', 'task-001', TaskStatus.DONE);
    expect(mockMemoryStore.insert).toHaveBeenCalledTimes(1);
    const insertArg = mockMemoryStore.insert.mock.calls[0]![0];
    expect(insertArg.id).toBe('debt-task-001');
    expect(insertArg.metadata.debtSource).toBe('evaluator');
  });

  it('DONE + selfAssessment DONE: no ledger entry (common case unaffected)', () => {
    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'DONE' });
    handleEvaluation('/root', task, TaskEvaluation.DONE, result);

    expect(mockMemoryStore.insert).not.toHaveBeenCalled();
  });

  it('idempotent: pre-existing ledger row is not duplicated by the self-DEBT path', () => {
    mockDbEntries.set('debt-task-001', { id: 'debt-task-001', type: 'debt' });
    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'GO_WITH_TECH_DEBT', notes: 'already recorded' });
    handleEvaluation('/root', task, TaskEvaluation.DONE, result);

    expect(mockMemoryStore.insert).not.toHaveBeenCalled();
  });

  it('idempotent: pre-existing ledger row is not duplicated by the evaluator-DEBT path', () => {
    mockDbEntries.set('debt-task-001', { id: 'debt-task-001', type: 'debt' });
    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'DONE', notes: 'already recorded' });
    handleEvaluation('/root', task, TaskEvaluation.GO_WITH_TECH_DEBT, result);

    expect(mockMemoryStore.insert).not.toHaveBeenCalled();
  });
});
