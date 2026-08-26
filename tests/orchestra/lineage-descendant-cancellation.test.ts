import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computeLogicalTaskProgress } from '../../src/core/task-lineage.js';
import { TaskStatus, type Task } from '../../src/core/types.js';
import { settleRedundantRepairDescendants } from '../../src/orchestra/sprint-controller.js';

let root: string | undefined;
function task(id: string, status: TaskStatus, fixForTaskId?: string): Task {
  return {
    id, title: id, description: id, model: 'sonnet', effort: 'normal',
    priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src'], filesRead: [], filesWrite: [`src/${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status, isPriorityFix: fixForTaskId !== undefined, fixForTaskId,
  };
}
function project(): string {
  root = mkdtempSync(join(tmpdir(), 'deckent-lineage-cancel-'));
  mkdirSync(join(root, '.tasks'));
  return root;
}
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe('transactional redundant repair descendant cancellation', () => {
  it('replays sprint-490: accepted second FIX supersedes the queued third repair', () => {
    const tasks = [
      task('490-013', TaskStatus.NO_GO),
      task('490-013-fix', TaskStatus.NO_GO, '490-013'),
      task('490-013-xfix', TaskStatus.DONE, '490-013-fix'),
      task('490-013-repair-3', TaskStatus.PENDING, '490-013-xfix'),
    ];
    const settlement = settleRedundantRepairDescendants(project(), tasks, '490-013-xfix');
    expect(settlement.decisions).toMatchObject([
      { descendantAttemptId: '490-013-repair-3', action: 'SUPERSEDE_QUEUED' },
    ]);
    expect(tasks[3]!.status).toBe(TaskStatus.PAUSED);
    expect(readFileSync(join(root!, '.tasks/task-490-013-repair-3.json'), 'utf8'))
      .toContain('REDUNDANT_REPAIR_DESCENDANT');
    expect(computeLogicalTaskProgress(tasks)).toEqual({ done: 1, active: 0, blocked: 0, total: 1 });
  });

  it('returns typed active cancellation without force-killing', () => {
    const tasks = [
      task('root', TaskStatus.NO_GO),
      task('root-fix', TaskStatus.DONE, 'root'),
      task('root-xfix', TaskStatus.EXECUTING, 'root-fix'),
    ];
    const settlement = settleRedundantRepairDescendants(project(), tasks, 'root-fix');
    expect(settlement.decisions).toMatchObject([
      { descendantAttemptId: 'root-xfix', action: 'CANCEL_ACTIVE' },
    ]);
    expect(settlement.supersededAttemptIds.has('root-xfix')).toBe(true);
    expect(tasks[2]!.status).toBe(TaskStatus.PAUSED);
    expect(computeLogicalTaskProgress(tasks)).toEqual({ done: 1, active: 0, blocked: 0, total: 1 });
  });

  it('does not touch queued work from an unrelated lineage', () => {
    const tasks = [
      task('root', TaskStatus.NO_GO), task('root-fix', TaskStatus.DONE, 'root'),
      task('root-xfix', TaskStatus.PENDING, 'root-fix'),
      task('other', TaskStatus.NO_GO), task('other-fix', TaskStatus.PENDING, 'other'),
    ];
    const settlement = settleRedundantRepairDescendants(project(), tasks, 'root-fix');
    expect([...settlement.supersededAttemptIds]).toEqual(['root-xfix']);
    expect(tasks[4]!.status).toBe(TaskStatus.PENDING);
  });
});
