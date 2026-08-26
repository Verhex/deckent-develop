import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';

import { TaskEvaluation } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import {
  FinalizerTerminalEvidenceError,
  buildFinalizerTerminalTruth,
  publishFencedAbortedSprintTerminalReceipt,
  publishFencedSprintTerminalReceipt,
} from '../../src/orchestra/sprint-finalizer.js';

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-finalizer-projection-'));
  mkdirSync(join(value, '.tasks'), { recursive: true });
  onTestFinished(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function task(id: string, status: Task['status'] = 'EXECUTING', fixForTaskId?: string): Task {
  return {
    id, title: id, description: '', model: 'gpt-5.6-sol', effort: 'high', priority: 'NORMAL',
    reason: 'projection test', provider: 'codex', authMode: 'subscription',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'terminal projection', noGoCriteria: 'stale task', techDebtAcceptable: 'none' },
    status, sprintId: 'sprint-621', assignedWorker: `w-${id}`,
    createdAt: '2026-08-22T00:00:00.000Z',
    ...(fixForTaskId ? { fixForTaskId } : {}),
  } as Task;
}

function result(taskId: string, attemptId: string, verdict: 'DONE' | 'NO_GO'): TaskResult {
  const baselineSha256 = 'a'.repeat(64);
  return {
    taskId, workerId: `w-${taskId}`, filesChanged: [], linesAdded: 0, linesRemoved: 0,
    testsPassed: true, coverage: verdict === 'DONE' ? 100 : 0, selfAssessment: verdict, notes: '',
    workAttribution: {
      state: 'VERIFIED', attemptId,
      baselineRef: `task-result-work-attribution-baseline:sha256:${baselineSha256}`,
      baselineSha256,
      scopeDigest: 'b'.repeat(64),
    },
  };
}

function persistTasks(projectRoot: string, tasks: readonly Task[]): void {
  for (const item of tasks) {
    writeFileSync(join(projectRoot, '.tasks', `task-${item.id}.json`), JSON.stringify(item, null, 2));
  }
}

function sprint(tasks: readonly Task[]): Sprint {
  return { id: 'sprint-621', number: 621, tasks: [...tasks] } as Sprint;
}

describe('finalizer task terminal projection wiring', () => {
  it('durably projects every attempt to the receipt logical winner before publishing', () => {
    const projectRoot = root();
    const tasks = [task('621-001'), task('621-001-fix', 'EXECUTING', '621-001')];
    persistTasks(projectRoot, tasks);
    const truth = buildFinalizerTerminalTruth({
      tasks,
      evaluations: new Map([
        ['621-001', TaskEvaluation.NO_GO],
        ['621-001-fix', TaskEvaluation.DONE],
      ]),
      results: [result('621-001', 'attempt-original', 'NO_GO'), result('621-001-fix', 'attempt-winner', 'DONE')],
    });

    const publication = publishFencedSprintTerminalReceipt({
      projectRoot, sprint: sprint(tasks), truth, runId: 'run-621', coordinatorGeneration: 4,
    });

    expect(publication.terminalEvidence.logicalTasks[0]?.resolvingAttempt).toEqual({
      taskId: '621-001-fix', attemptId: 'attempt-winner',
    });
    for (const item of tasks) {
      const projection = JSON.parse(readFileSync(
        join(projectRoot, '.tasks', `task-${item.id}.json`), 'utf-8',
      )) as { status: string; terminalProjection: Record<string, unknown> };
      expect(projection).toMatchObject({
        status: 'DONE',
        terminalProjection: {
          logicalTaskId: '621-001', generation: 4, winnerAttemptId: 'attempt-winner', terminal: 'DONE',
        },
      });
    }
    expect(existsSync(publication.artifactPath)).toBe(true);
  });

  it('holds a rejected COMPLETE receipt before mutating task terminal projections', () => {
    const projectRoot = root();
    const failed = task('621-002', 'PENDING');
    persistTasks(projectRoot, [failed]);
    const truth = buildFinalizerTerminalTruth({
      tasks: [failed],
      evaluations: new Map([['621-002', TaskEvaluation.NO_GO]]),
      results: [result('621-002', 'attempt-failed', 'NO_GO')],
    });

    expect(() => publishFencedSprintTerminalReceipt({
      projectRoot, sprint: sprint([failed]), truth, coordinatorGeneration: 2,
    })).toThrow(FinalizerTerminalEvidenceError);

    expect(JSON.parse(readFileSync(join(projectRoot, '.tasks', 'task-621-002.json'), 'utf-8')))
      .toMatchObject({ status: 'PENDING' });
    expect(JSON.parse(readFileSync(join(projectRoot, '.tasks', 'task-621-002.json'), 'utf-8')))
      .not.toHaveProperty('terminalProjection');
    expect(existsSync(join(projectRoot, '.deckent', 'recently-works', 'sprint-621-terminal-receipt.json')))
      .toBe(false);
  });

  it('keeps exact task truth when a later recovery generation aborts the outer run', () => {
    const projectRoot = root();
    const done = task('621-004', 'DONE');
    const failed = task('621-005', 'NO_GO');
    for (const [item, attemptId, terminal] of [
      [done, 'attempt-done', 'DONE'],
      [failed, 'attempt-failed', 'NO_GO'],
    ] as const) {
      writeFileSync(join(projectRoot, '.tasks', `task-${item.id}.json`), JSON.stringify({
        ...item,
        terminalProjection: {
          logicalTaskId: item.id, generation: 1, winnerAttemptId: attemptId,
          terminal, status: terminal, cascadeSkipped: false, neverDispatched: false,
        },
      }, null, 2));
    }
    const truth = buildFinalizerTerminalTruth({
      tasks: [done, failed],
      evaluations: new Map([
        ['621-004', TaskEvaluation.DONE],
        ['621-005', TaskEvaluation.NO_GO],
      ]),
      results: [result('621-004', 'attempt-done', 'DONE'), result('621-005', 'attempt-failed', 'NO_GO')],
    });

    const publication = publishFencedAbortedSprintTerminalReceipt({
      projectRoot,
      sprint: sprint([done, failed]),
      truth,
      coordinatorGeneration: 6,
    });

    expect(publication.receipt).toMatchObject({
      terminalOutcome: 'ABORTED',
      coordinatorGeneration: 6,
    });
    expect(JSON.parse(readFileSync(join(projectRoot, '.tasks', 'task-621-004.json'), 'utf-8')))
      .toMatchObject({ terminalProjection: { generation: 1, terminal: 'DONE' } });
    expect(JSON.parse(readFileSync(join(projectRoot, '.tasks', 'task-621-005.json'), 'utf-8')))
      .toMatchObject({ terminalProjection: { generation: 1, terminal: 'NO_GO' } });
  });

  it('fails closed on a foreign generation instead of blind rewriting or publishing', () => {
    const projectRoot = root();
    const item = task('621-003');
    writeFileSync(join(projectRoot, '.tasks', 'task-621-003.json'), JSON.stringify({
      ...item,
      terminalProjection: {
        logicalTaskId: '621-003', generation: 8, winnerAttemptId: 'attempt-winner',
        terminal: null, status: null, cascadeSkipped: false, neverDispatched: false,
      },
    }, null, 2));
    const truth = buildFinalizerTerminalTruth({
      tasks: [item], evaluations: new Map([['621-003', TaskEvaluation.DONE]]),
      results: [result('621-003', 'attempt-winner', 'DONE')],
    });

    expect(() => publishFencedSprintTerminalReceipt({
      projectRoot, sprint: sprint([item]), truth, coordinatorGeneration: 7,
    })).toThrow(/TASK_TERMINAL_PROJECTION_STALE_GENERATION_HOLD/);
    expect(JSON.parse(readFileSync(join(projectRoot, '.tasks', 'task-621-003.json'), 'utf-8')))
      .toMatchObject({ status: 'EXECUTING', terminalProjection: { generation: 8, terminal: null } });
    expect(existsSync(join(projectRoot, '.deckent', 'recently-works', 'sprint-621-terminal-receipt.json')))
      .toBe(false);
  });
});
