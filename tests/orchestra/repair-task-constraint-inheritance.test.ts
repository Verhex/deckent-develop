import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TaskEvaluation, TaskStatus, type Task, type TaskResult } from '../../src/core/types.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function originalTask(): Task {
  return {
    id: 'constraint-root',
    title: 'Constrained task',
    description: 'Persist the repaired task without losing operator constraints.',
    model: 'gpt-5.6-terra',
    forceModel: 'gpt-5.6-terra',
    forceSkills: ['ci-testing', 'typescript-expert'],
    effort: 'high',
    priority: 'HIGH',
    reason: 'constraint inheritance integration fixture',
    // An empty write set keeps the fixture hermetic and avoids scope re-gating.
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'repair artifact persists', noGoCriteria: 'repair absent', techDebtAcceptable: 'none' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-700',
    createdAt: '2026-08-27T00:00:00.000Z',
  };
}

function failedResult(): TaskResult {
  return {
    taskId: 'constraint-root',
    workerId: 'w-constraint-root',
    filesChanged: ['src/orchestra/fixture.ts'],
    linesAdded: 1,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'targeted verification failed after a real attempted change',
  } as TaskResult;
}

describe('repair task constraint inheritance', () => {
  it('persists one repair task with the original forceSkills and forceModel verbatim', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deckent-repair-inheritance-'));
    roots.push(root);
    const task = originalTask();
    await mkdir(join(root, '.tasks'), { recursive: true });
    await writeFile(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task), 'utf8');

    handleEvaluation(root, task, TaskEvaluation.NO_GO, failedResult());

    const repairPath = join(root, '.tasks', `task-${task.id}-fix.json`);
    const persistedRepair = JSON.parse(await readFile(repairPath, 'utf8')) as Task;
    expect(persistedRepair.fixForTaskId).toBe(task.id);
    expect(persistedRepair.forceSkills).toEqual(task.forceSkills);
    expect(persistedRepair.forceModel).toBe(task.forceModel);
    expect(persistedRepair.forceSkills).not.toBe(task.forceSkills);
  });
});
