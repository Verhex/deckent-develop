import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildSprintFromTasks } from '../../src/cli/commands/finalize.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('finalize sprint artifact scope', () => {
  it('excludes results whose task record is outside the selected sprint', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-finalize-scope-'));
    roots.push(root);
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const task = {
      id: '488-001',
      sprintId: 'sprint-488',
      title: 'Selected sprint task',
      description: '',
      model: 'gpt-5.6-sol',
      effort: 'high',
      priority: 'NORMAL',
      reason: 'scope test',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'done', noGoCriteria: 'failed', techDebtAcceptable: 'none' },
      status: 'DONE',
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    const selectedResult = {
      taskId: task.id,
      workerId: 'w-488-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'selected',
    };
    const foreignResult = {
      ...selectedResult,
      taskId: 'xv-session-claim',
      workerId: 'w-xverify',
      notes: 'independent xverify result without a selected sprint task record',
    };

    writeFileSync(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task));
    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(selectedResult));
    writeFileSync(join(root, '.tasks', 'task-xv-session-claim.result'), JSON.stringify(foreignResult));

    const built = buildSprintFromTasks(root, 'sprint-488');

    expect(built.tasks.map(item => item.id)).toEqual(['488-001']);
    expect(built.results.map(item => item.taskId)).toEqual(['488-001']);
    expect([...built.evaluations.keys()]).toEqual(['488-001']);
  });
});
