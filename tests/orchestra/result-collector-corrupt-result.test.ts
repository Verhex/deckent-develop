import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Sprint, Task } from '../../src/core/types.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';

vi.mock('../../src/orchestra/tmux.js', () => ({ killWorker: vi.fn() }));
vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 2))),
    close: vi.fn(),
  })),
}));

import { waitForResults } from '../../src/orchestra/result-collector.js';

const roots: string[] = [];

function fixture(taskId: string): { root: string; resultPath: string; sprint: Sprint } {
  const root = mkdtempSync(join(tmpdir(), 'collector-corrupt-'));
  roots.push(root);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  const task = {
    id: taskId,
    title: 'parse truth',
    description: 'parse truth',
    model: 'gpt-5.6-sol',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'typed evidence', noGoCriteria: 'false success', techDebtAcceptable: 'none' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-corrupt',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
  } as Task;
  return {
    root,
    resultPath: join(root, '.tasks', `task-${taskId}.result`),
    sprint: {
      id: 'sprint-corrupt', number: 1, tasks: [task], workers: [`w-${taskId}`],
      phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE, startedAt: new Date().toISOString(),
    } as Sprint,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('result collector parse truth', () => {
  it('collects malformed bytes as typed NO_GO without enriching or replacing the source', async () => {
    const { root, resultPath, sprint } = fixture('malformed');
    const raw = '{"taskId":"malformed","selfAssessment":"DONE"';
    writeFileSync(resultPath, raw, 'utf-8');

    const [collected] = await waitForResults(root, sprint, 100);

    expect(collected).toMatchObject({ taskId: 'malformed', selfAssessment: 'NO_GO', testsPassed: false });
    expect(collected?.notes).toContain('RESULT_JSON_PARSE_FAILURE');
    expect(collected?.tokenUsage).toBeUndefined();
    expect(readFileSync(resultPath, 'utf-8')).toBe(raw);
    expect(sprint.tasks[0]?.status).toBe(TaskStatus.NO_GO);
  });

  it('turns identity drift into typed evidence instead of normalizing a foreign DONE', async () => {
    const { root, resultPath, sprint } = fixture('expected');
    const raw = JSON.stringify({
      taskId: 'foreign', workerId: 'w-foreign', filesChanged: [], linesAdded: 0,
      linesRemoved: 0, testsPassed: true, coverage: 100, selfAssessment: 'DONE', notes: 'success',
    });
    writeFileSync(resultPath, raw, 'utf-8');

    const [collected] = await waitForResults(root, sprint, 100);

    expect(collected).toMatchObject({ taskId: 'expected', selfAssessment: 'NO_GO', testsPassed: false });
    expect(collected?.notes).toContain('RESULT_IDENTITY_DRIFT');
    expect(readFileSync(resultPath, 'utf-8')).toBe(raw);
  });

  it('routes live, timeout-race, and final sweeps through the same authority helper', () => {
    const source = readFileSync(join(process.cwd(), 'src/orchestra/result-collector.ts'), 'utf-8');
    expect(source.match(/readCollectorResult\(/g)).toHaveLength(4); // definition + three consumers
  });
});
