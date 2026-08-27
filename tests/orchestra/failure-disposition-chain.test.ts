import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ResolvedConfig, Sprint, Task, TaskResult } from '../../src/core/types.js';
import {
  SprintPhase,
  SprintStatus,
  TaskEvaluation,
  TaskStatus,
} from '../../src/core/types.js';
import { resolveHostPreDispatchFailureDisposition } from '../../src/core/failure-disposition-policy.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import {
  classifyFixPhaseTasks,
  evaluateResult,
} from '../../src/orchestra/result-evaluator.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';

const roots: string[] = [];

function makeTask(
  id: string,
  dependencies: string[] = [],
  status = dependencies.length === 0 ? TaskStatus.EXECUTING : TaskStatus.PENDING,
): Task {
  return {
    id,
    title: `Disposition chain ${id}`,
    description: 'Hermetic disposition-chain fixture.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies,
    goNogo: {
      goCriteria: 'Disposition behavior is preserved.',
      noGoCriteria: 'Disposition behavior is incorrect.',
      techDebtAcceptable: 'none',
    },
    status,
    sprintId: 'sprint-699',
    createdAt: new Date().toISOString(),
    assignedAgent: 'test-guardian',
    assignedSkills: [],
  } as Task;
}

function makeResult(
  taskId: string,
  selfAssessment: TaskResult['selfAssessment'],
  overrides: Partial<TaskResult> = {},
): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: selfAssessment === 'DONE',
    coverage: 0,
    selfAssessment,
    notes: `fixture ${selfAssessment}`,
    ...overrides,
  };
}

function readResult(root: string, taskId: string): TaskResult {
  return JSON.parse(
    readFileSync(join(root, '.tasks', `task-${taskId}.result`), 'utf8'),
  ) as TaskResult;
}

function writeTask(root: string, task: Task): void {
  writeFileSync(
    join(root, '.tasks', `task-${task.id}.json`),
    JSON.stringify(task),
    'utf8',
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('failure disposition chain', () => {
  it('preserves policy-terminal exemptions while keeping worker NO_GO remediation live', async () => {
    const root = mkdtempSync(join(tmpdir(), 'failure-disposition-chain-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'), { recursive: true });

    const settled = makeTask('699-settled');
    const dependent = makeTask('699-dependent', [settled.id], TaskStatus.PAUSED);
    writeTask(root, settled);
    writeTask(root, dependent);
    const sprint = {
      id: 'sprint-699',
      number: 699,
      tasks: [settled, dependent],
      workers: [`w-${settled.id}`],
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
      startedAt: new Date().toISOString(),
    } as Sprint;
    const preDispatchResult = makeResult(settled.id, 'NO_GO', {
      preDispatchSettlement: {
        version: 1,
        state: 'NOT_DISPATCHED',
        attemptId: 'host-pre-dispatch:699-settled:test',
        reasonCode: 'PROMPT_COMPILE_FAILED',
        evidenceRef: 'host-pre-dispatch-settlement:sha256:test',
      },
    });
    writeFileSync(
      join(root, '.tasks', `task-${settled.id}.result`),
      JSON.stringify(preDispatchResult),
      'utf8',
    );

    const collected = await waitForResults(
      root,
      sprint,
      5_000,
      undefined,
      undefined,
      undefined,
      {
        dependency_pipeline_enabled: true,
        fix_phase_enabled: true,
        max_fix_retries: 2,
      } as ResolvedConfig,
    );
    const persistedSettlement = readResult(root, settled.id);
    const persistedDependent = readResult(root, dependent.id);

    expect(await evaluateResult(persistedSettlement, settled))
      .toBe(TaskEvaluation.NOT_DISPATCHED);
    expect(collected.map(result => result.taskId).sort())
      .toEqual([settled.id, dependent.id].sort());
    expect(persistedDependent).toMatchObject({
      selfAssessment: 'NO_GO',
      cascadeSkipped: true,
    });
    expect(dependent.status).toBe(TaskStatus.NO_GO);

    handleEvaluation(
      root,
      settled,
      TaskEvaluation.NOT_DISPATCHED,
      persistedSettlement,
    );
    handleEvaluation(
      root,
      dependent,
      TaskEvaluation.NO_GO,
      persistedDependent,
    );
    expect(existsSync(join(root, '.tasks', `task-${settled.id}-fix.json`))).toBe(false);
    expect(existsSync(join(root, '.tasks', `task-${dependent.id}-fix.json`))).toBe(false);

    const outbox = readFileSync(
      join(root, '.deckent', 'runtime', 'owner-notifications.jsonl'),
      'utf8',
    ).trim().split('\n').map(line => JSON.parse(line) as { id: string; kind: string });
    expect(outbox).toContainEqual(expect.objectContaining({
      id: 'disposition:sprint-699:699-settled:PROMPT_COMPILE_FAILED:NOT_DISPATCHED',
      kind: 'no-go',
    }));

    const workerNoGo = makeTask('699-worker-no-go', [], TaskStatus.NO_GO);
    writeTask(root, workerNoGo);
    const workerResult = makeResult(workerNoGo.id, 'NO_GO');
    const workerEvaluation = await evaluateResult(workerResult, workerNoGo);
    expect(workerEvaluation).toBe(TaskEvaluation.NO_GO);
    handleEvaluation(root, workerNoGo, workerEvaluation, workerResult);
    expect(existsSync(join(root, '.tasks', `task-${workerNoGo.id}-fix.json`))).toBe(true);

    const override = {
      failure_disposition: {
        pre_dispatch: {
          PROMPT_COMPILE_FAILED: { fixEligible: true },
        },
      },
    };
    expect(resolveHostPreDispatchFailureDisposition(
      'PROMPT_COMPILE_FAILED',
      override,
    ).fixEligible).toBe(true);
    expect(classifyFixPhaseTasks(
      new Map([[settled.id, TaskEvaluation.NOT_DISPATCHED]]),
      new Map([[settled.id, persistedSettlement]]),
      override,
    )).toEqual({
      fixCandidateTaskIds: [settled.id],
      reDispatchCandidateTaskIds: [],
      // sprint-700 T2: classify artık suppress-disposition kayıtlarını da döndürür.
      cascadeSkipDispositions: [],
    });
  });
});
