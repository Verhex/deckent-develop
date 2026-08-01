import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    reconcileEvaluationSpuriousNoGo: vi.fn(),
  };
});

import type { EvaluationResult, Task, TaskResult } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import {
  enforceRecoveryBornEvaluationHonesty,
  safeRubricReconcile,
} from '../../src/orchestra/sprint-phases.js';
import {
  evaluateWithRubric,
  reconcileEvaluationSpuriousNoGo,
} from '../../src/orchestra/result-evaluator.js';

const noGoRubric: EvaluationResult = {
  decision: 'NO_GO',
  totalScore: 95,
  rubricScores: [
    { criterion: 'correctness', score: 95, passed: true, reason: 'disk proof' },
    { criterion: 'test_coverage', score: 95, passed: true, reason: 'test proof' },
  ],
  retryCount: 0,
};

const promotedRubric: EvaluationResult = {
  ...noGoRubric,
  decision: 'GO_WITH_TECH_DEBT',
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: '483-003',
    title: 'Sprint 483 recovery-born evaluation regression',
    description: 'attempt-scoped artifacts and authored criteria',
    model: 'test-model',
    effort: 'high',
    priority: 'HIGH',
    reason: 'regression',
    scope: {
      directories: ['src/orchestra/', 'tests/orchestra/'],
      filesRead: [],
      filesWrite: [
        'src/orchestra/sprint-phases.ts',
        'tests/orchestra/sprint-phases.test.ts',
      ],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'attempt-scoped artifact exists; authored criteria pass',
      noGoCriteria: 'concrete failure evidence',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-483',
    ...overrides,
  } as Task;
}

function result(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '483-003',
    workerId: 'w-483-003',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'zero diff; focused tests failed',
    ...overrides,
  } as TaskResult;
}

afterEach(() => vi.clearAllMocks());

describe('RECOVERY-BORN-483-EVALUATION-HONESTY-001', () => {
  it('reproduces 483-003: zero diff + testsPassed=false + explicit NO_GO stays NO_GO and repair-eligible', async () => {
    vi.mocked(evaluateWithRubric).mockReturnValue(noGoRubric);
    vi.mocked(reconcileEvaluationSpuriousNoGo).mockResolvedValue(promotedRubric);

    const evaluation = await safeRubricReconcile('/hermetic/project', 'sprint-483', task(), result());

    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.decision).not.toBe('GO_WITH_TECH_DEBT');
    expect(reconcileEvaluationSpuriousNoGo).not.toHaveBeenCalled();
    // NO_GO remains the standard repair-routing input; it is not projected to PAUSE/HOLD.
    expect(evaluation.decision === 'NO_GO').toBe(true);
  });

  it.each([
    ['explicit worker NO_GO', result({ testsPassed: true, selfAssessment: 'NO_GO' })],
    ['failed tests', result({ testsPassed: false, selfAssessment: 'DONE' })],
    ['typed attribution HOLD', result({
      testsPassed: true,
      selfAssessment: 'DONE',
      workAttribution: {
        state: 'HOLD',
        attemptId: 'attempt-483-003',
        baselineRef: '.tasks/task-483-003.scope-baseline',
        scopeDigest: 'a'.repeat(64),
        reasonCode: 'ATTRIBUTION_AUTHORITY_UNAVAILABLE',
      },
    } as Partial<TaskResult>)],
  ])('terminal boundary prevents promotion for %s', (_label, concreteResult) => {
    expect(enforceRecoveryBornEvaluationHonesty(concreteResult, promotedRubric).decision).toBe('NO_GO');
  });

  it('permits legitimate spurious-NO_GO recovery with exact scoped artifact and criterion proof', async () => {
    const exactResult = result({
      filesChanged: task().scope.filesWrite,
      linesAdded: 42,
      testsPassed: true,
      selfAssessment: 'DONE',
      workAttribution: {
        state: 'VERIFIED',
        attemptId: 'attempt-483-003',
        baselineRef: '.tasks/task-483-003.scope-baseline',
        scopeDigest: 'b'.repeat(64),
      },
    } as Partial<TaskResult>);
    vi.mocked(evaluateWithRubric).mockReturnValue(noGoRubric);
    vi.mocked(reconcileEvaluationSpuriousNoGo).mockResolvedValue(promotedRubric);

    await expect(safeRubricReconcile('/hermetic/project', 'sprint-483', task(), exactResult))
      .resolves.toMatchObject({ decision: 'GO_WITH_TECH_DEBT' });
  });

  it.each([
    ['empty attributed change set', result({
      filesChanged: [],
      linesAdded: 0,
      testsPassed: true,
      selfAssessment: 'DONE',
      workAttribution: {
        state: 'VERIFIED',
        attemptId: 'attempt-483-003',
        baselineRef: '.tasks/task-483-003.scope-baseline',
        scopeDigest: 'c'.repeat(64),
      },
    } as Partial<TaskResult>), noGoRubric],
    ['unproven authored criterion', result({
      filesChanged: task().scope.filesWrite,
      linesAdded: 20,
      testsPassed: true,
      selfAssessment: 'DONE',
      workAttribution: {
        state: 'VERIFIED',
        attemptId: 'attempt-483-003',
        baselineRef: '.tasks/task-483-003.scope-baseline',
        scopeDigest: 'd'.repeat(64),
      },
    } as Partial<TaskResult>), {
      ...noGoRubric,
      rubricScores: [
        ...noGoRubric.rubricScores,
        { criterion: 'authored_acceptance', score: 40, passed: false, reason: 'not proven' },
      ],
    }],
  ])('refuses recovery with %s while preserving standard FIX routing', async (_label, candidate, scored) => {
    vi.mocked(evaluateWithRubric).mockReturnValue(scored as EvaluationResult);
    vi.mocked(reconcileEvaluationSpuriousNoGo).mockResolvedValue(promotedRubric);

    const evaluation = await safeRubricReconcile('/hermetic/project', 'sprint-483', task(), candidate);
    expect(evaluation.decision).toBe('NO_GO');
  });

  it('does not reinterpret unused WRITE authority as a missing mandatory artifact', async () => {
    const boundedResult = result({
      filesChanged: ['src/orchestra/sprint-phases.ts'],
      linesAdded: 20,
      testsPassed: true,
      selfAssessment: 'DONE',
      workAttribution: {
        state: 'VERIFIED',
        attemptId: 'attempt-483-003',
        baselineRef: '.tasks/task-483-003.scope-baseline',
        scopeDigest: 'f'.repeat(64),
      },
    } as Partial<TaskResult>);
    vi.mocked(evaluateWithRubric).mockReturnValue(noGoRubric);
    vi.mocked(reconcileEvaluationSpuriousNoGo).mockResolvedValue(promotedRubric);

    await expect(safeRubricReconcile('/hermetic/project', 'sprint-483', task(), boundedResult))
      .resolves.toMatchObject({ decision: 'GO_WITH_TECH_DEBT' });
  });

  it('keeps typed PAUSE status and HOLD evidence distinct while both remain non-promotable', () => {
    const pausedTask = task({ status: TaskStatus.PAUSED });
    const heldResult = result({
      testsPassed: true,
      selfAssessment: 'DONE',
      workAttribution: {
        state: 'HOLD',
        attemptId: 'attempt-483-003',
        baselineRef: '.tasks/task-483-003.scope-baseline',
        scopeDigest: 'e'.repeat(64),
        reasonCode: 'ATTRIBUTION_AUTHORITY_MISMATCH',
      },
    } as Partial<TaskResult>);

    expect(pausedTask.status).toBe(TaskStatus.PAUSED);
    expect(heldResult.workAttribution?.state).toBe('HOLD');
    expect(enforceRecoveryBornEvaluationHonesty(heldResult, promotedRubric).decision).toBe('NO_GO');
  });
});
