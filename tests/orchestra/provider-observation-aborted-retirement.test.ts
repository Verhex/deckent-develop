import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { MemoryStore } from '../../src/core/memory-store.js';
import {
  PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH,
  ProviderExecutionObservationStore,
} from '../../src/core/provider-execution-observation-store.js';
import { SprintPhase, SprintStatus, TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import {
  forceAbortSprint,
  resolveProviderExecutionObservationRunId,
} from '../../src/orchestra/sprint-finalizer.js';

const roots: string[] = [];
const TASK_ID = '636-004';
const ATTEMPT_ID = 'be7a6a72-8615-4c48-9c42-6a8375a2dc04';
const PRINCIPAL = 'principal-636';

function fixture(): { root: string; sprint: Sprint; result: TaskResult } {
  const root = mkdtempSync(join(tmpdir(), 'deckent-aborted-observation-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  const memory = new MemoryStore(join(root, '.brain', 'memory.db'));
  memory.close();
  const task: Task = {
    id: TASK_ID, title: 'Terminal attempt', description: 'Retirement fixture',
    model: 'gpt-5.6-terra', effort: 'high', priority: 'NORMAL', reason: 'test',
    provider: 'codex', authMode: 'subscription',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'test', noGoCriteria: 'test', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE, sprintId: 'sprint-636', createdAt: '2026-08-23T00:00:00.000Z',
  };
  const sprint: Sprint = {
    id: 'sprint-636', number: 636, status: SprintStatus.PAUSED, phase: SprintPhase.FIX,
    tasks: [task], workers: [], startedAt: '2026-08-23T00:00:00.000Z',
  };
  const result: TaskResult = {
    taskId: TASK_ID, workerId: 'w-636-004', filesChanged: [], linesAdded: 0, linesRemoved: 0,
    testsPassed: true, coverage: 0, selfAssessment: 'DONE', notes: '',
    workAttribution: {
      state: 'VERIFIED', attemptId: ATTEMPT_ID, baselineRef: 'baseline:636',
      scopeDigest: 'a'.repeat(64),
    },
  };
  writeFileSync(join(root, '.tasks', `task-${TASK_ID}.json`), JSON.stringify(task));
  writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
    sprintId: sprint.id, phase: sprint.phase, status: sprint.status, taskIds: [task.id],
  }));
  return { root, sprint, result };
}

function putOpen(
  store: ProviderExecutionObservationStore,
  executionId: string,
  runId: string,
  attemptId: string,
): void {
  store.put({ source: 'provider-runtime', observation: {
    type: 'start', executionId, runId, taskId: TASK_ID, attemptId,
    providerPrincipalDigest: PRINCIPAL, fence: 'fence-636', sequence: 1,
    observedAt: '2026-08-23T00:00:00.000Z',
  } });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ABORTED provider-observation retirement', () => {
  it('retires only terminalTruth exact UUID rows, preserves foreign and legacy rows, and is idempotent', () => {
    const { root, sprint, result } = fixture();
    const store = new ProviderExecutionObservationStore(root);
    const ownedRunId = resolveProviderExecutionObservationRunId(root);
    putOpen(store, 'owned-execution', ownedRunId, ATTEMPT_ID);
    putOpen(store, 'same-run-other-attempt', ownedRunId, '1b50d54a-bad2-4b43-9b0a-503ac5ce2e61');
    putOpen(store, 'foreign-run', 'foreign-run-id', ATTEMPT_ID);
    putOpen(store, 'legacy-unowned', ownedRunId, ATTEMPT_ID);
    store.close();

    const dbPath = join(root, PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH);
    const db = new Database(dbPath);
    db.prepare('UPDATE provider_execution_intervals SET run_id = NULL WHERE execution_id = ?')
      .run('legacy-unowned');
    db.close();

    forceAbortSprint(root, sprint, new Map([[TASK_ID, TaskEvaluation.DONE]]), [result]);
    const afterFirst = new ProviderExecutionObservationStore(root);
    expect(afterFirst.listIntervals(PRINCIPAL)
      .map(interval => [interval.executionId, interval.retired])
      .sort(([left], [right]) => left.localeCompare(right)))
      .toEqual([
        ['foreign-run', false],
        ['legacy-unowned', false],
        ['owned-execution', true],
        ['same-run-other-attempt', false],
      ]);
    afterFirst.close();

    forceAbortSprint(root, sprint, new Map([[TASK_ID, TaskEvaluation.DONE]]), [result]);
    const afterReplay = new ProviderExecutionObservationStore(root);
    expect(afterReplay.listIntervals(PRINCIPAL).filter(interval => interval.retired)).toHaveLength(1);
    afterReplay.close();
  });

  it('fails closed after receipt publication when retirement authority errors', () => {
    const { root, sprint, result } = fixture();
    mkdirSync(join(root, PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH));

    expect(() => forceAbortSprint(
      root, sprint, new Map([[TASK_ID, TaskEvaluation.DONE]]), [result],
    )).toThrow(/PROVIDER_EXECUTION_OBSERVATION_RETIREMENT_FAILED/);
    expect(existsSync(join(root, '.deckent', 'recently-works', 'sprint-636-terminal-receipt.json'))).toBe(true);
    expect(existsSync(join(root, '.deckent', 'archive', 'sprints', sprint.id))).toBe(false);
    expect(sprint.status).toBe(SprintStatus.PAUSED);
  });
});
