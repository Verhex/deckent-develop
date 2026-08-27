import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOST_PRE_DISPATCH_DISPOSITION,
  HOST_PRE_DISPATCH_REASON_CODES,
  resolveHostPreDispatchFailureDisposition,
} from '../../src/core/failure-disposition-policy.js';
import { TaskEvaluation, type Task, type TaskResult } from '../../src/core/task-types.js';
import {
  classifyFixPhaseTasks,
  evaluateResult,
} from '../../src/orchestra/result-evaluator.js';

function taskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '699-001',
    workerId: 'w-699-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'failure',
    ...overrides,
  };
}

const task = { id: '699-001', title: 'policy test' } as Task;

describe('host pre-dispatch failure disposition policy', () => {
  it.each(HOST_PRE_DISPATCH_REASON_CODES)(
    'resolves the canonical disposition for %s',
    reasonCode => {
      expect(resolveHostPreDispatchFailureDisposition(reasonCode)).toEqual(
        DEFAULT_HOST_PRE_DISPATCH_DISPOSITION,
      );
    },
  );

  it('projects a settled pre-dispatch result to NOT_DISPATCHED', async () => {
    const result = taskResult({
      preDispatchSettlement: {
        version: 1,
        state: 'NOT_DISPATCHED',
        attemptId: 'host-pre-dispatch:699-001:test',
        reasonCode: 'PROMPT_COMPILE_FAILED',
        evidenceRef: 'host-pre-dispatch-settlement:sha256:test',
      },
    });

    await expect(evaluateResult(result, task)).resolves.toBe(
      TaskEvaluation.NOT_DISPATCHED,
    );
  });

  it('keeps an ordinary worker NO_GO eligible for FIX', async () => {
    const result = taskResult();
    await expect(evaluateResult(result, task)).resolves.toBe(TaskEvaluation.NO_GO);
    expect(classifyFixPhaseTasks(new Map([
      [result.taskId, TaskEvaluation.NO_GO],
    ]))).toEqual({
      fixCandidateTaskIds: [result.taskId],
      reDispatchCandidateTaskIds: [],
      cascadeSkipDispositions: [],
    });
  });

  it('merges a narrow config override and excludes non-redispatchable settlements', () => {
    const config = {
      failure_disposition: {
        pre_dispatch: {
          PROMPT_COMPILE_FAILED: { cascadeDependents: false },
        },
      },
    } as const;
    expect(resolveHostPreDispatchFailureDisposition(
      'PROMPT_COMPILE_FAILED',
      config,
    )).toEqual({
      ...DEFAULT_HOST_PRE_DISPATCH_DISPOSITION,
      cascadeDependents: false,
    });

    const result = taskResult({
      preDispatchSettlement: {
        version: 1,
        state: 'NOT_DISPATCHED',
        attemptId: 'host-pre-dispatch:699-001:test',
        reasonCode: 'PROMPT_COMPILE_FAILED',
        evidenceRef: 'host-pre-dispatch-settlement:sha256:test',
      },
    });
    expect(classifyFixPhaseTasks(
      new Map([[result.taskId, TaskEvaluation.NOT_DISPATCHED]]),
      new Map([[result.taskId, result]]),
      config,
    ).reDispatchCandidateTaskIds).toEqual([]);
  });
});
