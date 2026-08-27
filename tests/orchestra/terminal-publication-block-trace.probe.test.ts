import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { TaskEvaluation, type Task, type TaskResult } from '../../src/core/types.js';
import { buildFinalizerTerminalTruth } from '../../src/orchestra/sprint-finalizer.js';

let root: string | undefined;

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

function task(id: string): Task {
  return {
    id, title: id, description: 'terminal verdict semantics pin', type: 'code-development',
    status: 'DONE', priority: 'NORMAL', model: 'gpt-5.6-terra', effort: 'medium', provider: 'codex',
    dependencies: [], sprintId: 'sprint-703-semantics',
    scope: { directories: ['src/orchestra'], filesRead: [], filesWrite: [] },
    goNogo: { goCriteria: 'fixture', noGoCriteria: 'fixture', techDebtAcceptable: 'none' },
  } as unknown as Task;
}

function result(taskId: string): TaskResult {
  return {
    taskId, workerId: `w-${taskId}`, filesChanged: [], linesAdded: 0, linesRemoved: 0,
    testsPassed: true, coverage: 0, selfAssessment: 'DONE', notes: 'semantics fixture',
    workAttribution: {
      state: 'VERIFIED', attemptId: `attempt:${taskId}`,
      baselineRef: `task-result-work-attribution-baseline:sha256:${'a'.repeat(64)}`,
      baselineSha256: 'a'.repeat(64), scopeDigest: 'b'.repeat(64),
    },
  } as TaskResult;
}

describe('terminal publication verdict semantics', () => {
  it('preserves observable asTerminalVerdict behavior for established evaluations', async () => {
    root = await mkdtemp(join(tmpdir(), 'deckent-terminal-verdict-'));
    const tasks = ['done', 'debt', 'failed', 'not-dispatched'].map(task);
    await writeFile(join(root, 'fixture.json'), JSON.stringify(tasks), 'utf8');
    const truth = buildFinalizerTerminalTruth({
      tasks, results: tasks.map(item => result(item.id)),
      evaluations: new Map([
        ['done', TaskEvaluation.DONE],
        ['debt', TaskEvaluation.GO_WITH_TECH_DEBT],
        ['failed', TaskEvaluation.NO_GO],
        ['not-dispatched', TaskEvaluation.NOT_DISPATCHED],
      ]),
    });

    expect(truth.attempts.map(item => [item.identity.taskId, item.authority.state,
      item.authority.state === 'TERMINAL' ? item.authority.verdict : null])).toEqual([
      ['debt', 'TERMINAL', 'GO_WITH_TECH_DEBT'],
      ['done', 'TERMINAL', 'DONE'],
      ['failed', 'TERMINAL', 'NO_GO'],
      ['not-dispatched', 'UNSETTLED', null],
    ]);
  });
});
