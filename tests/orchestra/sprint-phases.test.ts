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
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import {
  enforceRecoveryBornEvaluationHonesty,
  partitionFixTasksByFailureDisposition,
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

// ─── 652-004: FIX durable audit fan-in ───────────────────────────────────
// The FIX task receipt is emitted by completeResultEvaluationAttempt. The
// reconciliation projection below must use the same audit adapter as initial
// evaluation so the root record retains applicability and normative fields.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluationAuditPath } from '../../src/orchestra/evaluation-audit-trail.js';
import { recordFixEvaluationAudit } from '../../src/orchestra/sprint-phases.js';

describe('652-004 FIX audit projection fan-in', () => {
  it('projects a recovered doc root through the canonical audit adapter', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deckent-fix-fanin-'));
    try {
      const original = task({
        id: '652-004-root',
        type: 'documentation',
        scope: {
          directories: ['docs/'], filesRead: [], filesWrite: ['docs/recovered.md'],
        },
      });
      const fix = task({ id: '652-004-root-fix', fixForTaskId: original.id });
      const rubric: EvaluationResult = {
        decision: 'DONE', totalScore: 88, retryCount: 0,
        rubricScores: [
          { criterion: 'applicability:test_execution', score: 100, passed: true, reason: 'applicability=NOT_APPLICABLE' },
          { criterion: 'applicability:coverage', score: 100, passed: true, reason: 'applicability=NOT_APPLICABLE' },
        ],
      };

      recordFixEvaluationAudit(
        root, 'sprint-652', fix, rubric, TaskEvaluation.DONE, true,
        { rootTaskId: original.id, logicalAttempt: 2 }, original,
      );

      const record = JSON.parse(await readFile(
        evaluationAuditPath(root, 'sprint-652', original.id, 2), 'utf-8',
      )) as {
        normativeVerdict: string;
        acceptance?: { kind: string };
        criterionScores: Array<{ name: string; reason: string }>;
      };
      expect(record.normativeVerdict).toBe('CONFIRMED');
      expect(record.acceptance?.kind).toBe('documentation');
      expect(record.criterionScores).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'applicability:test_execution', reason: 'applicability=NOT_APPLICABLE' }),
        expect.objectContaining({ name: 'applicability:coverage', reason: 'applicability=NOT_APPLICABLE' }),
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('700-002 FIX entry failure-disposition gate', () => {
  it('rejects a repair candidate for a fix-ineligible host settlement', () => {
    const original = task({ id: 'root' });
    const fix = task({ id: 'root-fix', fixForTaskId: 'root', isPriorityFix: true });
    const settled = result({
      taskId: 'root',
      preDispatchSettlement: {
        state: 'NOT_DISPATCHED', reasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE',
        attemptId: 'attempt-root', evidenceRef: 'host:provider',
      },
    } as Partial<TaskResult>);

    const partition = partitionFixTasksByFailureDisposition([fix], [settled], undefined);
    expect(partition.eligible).toEqual([]);
    expect(partition.noMint).toHaveLength(1);
    expect(partition.noMint[0]).toMatchObject({ failedTaskId: original.id, reasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE' });
  });
});
