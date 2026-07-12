// ─── Sprint 427 Task 1 (TERM5-FIN) — sprint-finalizer rich completion-record ──
//
// Covers `buildSprintCompletionRecord`, the pure, additive data-foundation for
// the design doc's "Ölecek / compatibility-only parçalar" row "Exit-code-only
// evaluate → Rich finalizer result'ıyla değiştirilir" (docs/analysis/
// term-flow-unify-design-2026-07-11.md). Later TERM5 tasks (2-6) correlate on
// `flowId`; this task only builds the record and appends it as a NEW
// `completionRecord` key on the existing Step-13 job-completion-summary
// artifact — every pre-existing field there stays untouched.
//
// Pure function, no I/O: unlike `finalizeSprint` itself (which spawns real
// subprocesses via `runSelfAuditGate`), `buildSprintCompletionRecord` needs no
// fs/child_process mocking — exercised directly at its real seam.

import { describe, it, expect } from 'vitest';

import { buildSprintCompletionRecord } from '../../src/orchestra/sprint-finalizer.js';
import { SprintStatus, SprintPhase } from '../../src/core/sprint-types.js';
import type { Sprint } from '../../src/core/sprint-types.js';
import { TaskEvaluation } from '../../src/core/task-types.js';
import type { TaskResult } from '../../src/core/task-types.js';

/** Minimal Sprint whose `tasks` carry only id/title — all the record reads. */
function mkSprint(tasks: Array<{ id: string; title: string }>): Sprint {
  return {
    id: 'sprint-427',
    number: 427,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: tasks as Sprint['tasks'],
    workers: [],
  };
}

/** A structurally-valid TaskResult; only `selfAssessment` matters for the record. */
function mkResult(taskId: string, selfAssessment: TaskResult['selfAssessment']): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment,
    notes: '',
  };
}

describe('buildSprintCompletionRecord — TERM5-FIN rich completion-record', () => {
  it('counts DONE/GO_WITH_TECH_DEBT/NO_GO verdicts correctly', () => {
    const sprint = mkSprint([
      { id: '427-001', title: 'Task A' },
      { id: '427-002', title: 'Task B' },
      { id: '427-003', title: 'Task C' },
      { id: '427-004', title: 'Task D' },
    ]);
    const evaluations = new Map<string, TaskEvaluation>([
      ['427-001', TaskEvaluation.DONE],
      ['427-002', TaskEvaluation.DONE],
      ['427-003', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['427-004', TaskEvaluation.NO_GO],
    ]);
    const resultsMap = new Map<string, TaskResult>([
      ['427-001', mkResult('427-001', 'DONE')],
      ['427-002', mkResult('427-002', 'DONE')],
      ['427-003', mkResult('427-003', 'GO_WITH_TECH_DEBT')],
      ['427-004', mkResult('427-004', 'NO_GO')],
    ]);

    const record = buildSprintCompletionRecord(sprint, evaluations, resultsMap);

    expect(record.verdictSummary).toEqual({ done: 2, techDebt: 1, noGo: 1 });
  });

  it('omits flowId when not provided (current callers pass none)', () => {
    const sprint = mkSprint([{ id: '427-001', title: 'Task A' }]);
    const evaluations = new Map<string, TaskEvaluation>([['427-001', TaskEvaluation.DONE]]);
    const resultsMap = new Map<string, TaskResult>([['427-001', mkResult('427-001', 'DONE')]]);

    const record = buildSprintCompletionRecord(sprint, evaluations, resultsMap);

    expect(record.flowId).toBeUndefined();
    expect('flowId' in record).toBe(false);
  });

  it('includes flowId when provided by a run-flow-v2 caller', () => {
    const sprint = mkSprint([{ id: '427-001', title: 'Task A' }]);
    const evaluations = new Map<string, TaskEvaluation>([['427-001', TaskEvaluation.DONE]]);
    const resultsMap = new Map<string, TaskResult>([['427-001', mkResult('427-001', 'DONE')]]);

    const record = buildSprintCompletionRecord(sprint, evaluations, resultsMap, 'flow-abc-123');

    expect(record.flowId).toBe('flow-abc-123');
  });

  it('builds an ordered task-summary array with title + evaluation + selfAssessment', () => {
    const sprint = mkSprint([
      { id: '427-001', title: 'TERM5-FIN' },
      { id: '427-002', title: 'TERM5-FEED' },
    ]);
    const evaluations = new Map<string, TaskEvaluation>([
      ['427-001', TaskEvaluation.DONE],
      ['427-002', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    const resultsMap = new Map<string, TaskResult>([
      ['427-001', mkResult('427-001', 'DONE')],
      ['427-002', mkResult('427-002', 'GO_WITH_TECH_DEBT')],
    ]);

    const record = buildSprintCompletionRecord(sprint, evaluations, resultsMap);

    expect(record.taskSummary).toEqual([
      { taskId: '427-001', title: 'TERM5-FIN', evaluation: TaskEvaluation.DONE, selfAssessment: 'DONE' },
      { taskId: '427-002', title: 'TERM5-FEED', evaluation: TaskEvaluation.GO_WITH_TECH_DEBT, selfAssessment: 'GO_WITH_TECH_DEBT' },
    ]);
  });

  it('falls back to the evaluation string when no result is present for a task (never throws)', () => {
    const sprint = mkSprint([{ id: '427-005', title: 'Untracked' }]);
    const evaluations = new Map<string, TaskEvaluation>([['427-005', TaskEvaluation.NO_GO]]);
    const resultsMap = new Map<string, TaskResult>(); // no result recorded

    const record = buildSprintCompletionRecord(sprint, evaluations, resultsMap);

    expect(record.taskSummary).toEqual([
      { taskId: '427-005', title: 'Untracked', evaluation: TaskEvaluation.NO_GO, selfAssessment: 'NO_GO' },
    ]);
    expect(record.verdictSummary).toEqual({ done: 0, techDebt: 0, noGo: 1 });
  });

  it('returns an empty-but-valid record for a sprint with no evaluations', () => {
    const sprint = mkSprint([]);
    const record = buildSprintCompletionRecord(sprint, new Map(), new Map());

    expect(record.verdictSummary).toEqual({ done: 0, techDebt: 0, noGo: 0 });
    expect(record.taskSummary).toEqual([]);
    expect(record.flowId).toBeUndefined();
  });
});
