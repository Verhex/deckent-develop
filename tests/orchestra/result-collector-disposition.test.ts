import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ResolvedConfig, Sprint, Task, TaskResult } from '../../src/core/types.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';

const { spawnWorker } = vi.hoisted(() => ({ spawnWorker: vi.fn() }));
vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker,
  killWorker: vi.fn(),
  listWorkers: vi.fn(() => []),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  writeSkillDeliveryEvidence: () => {},
  applySkillDirectiveAuthority: (task: { assignedSkills?: string[] }) =>
    task.assignedSkills ?? [],
  buildSkillDeliveryEvidence: (
    task: { id?: string; assignedSkills?: string[]; forceSkills?: string[] },
    delivered?: readonly string[],
  ) => ({
    version: 1,
    taskId: task.id ?? '',
    source: 'worker-prompt',
    deliveredSkillIds: [...(delivered ?? [])],
    assignedSkillIds: [...(task.assignedSkills ?? [])],
    forcedSkillIds: [...(task.forceSkills ?? [])],
    undeliveredForcedSkillIds: (task.forceSkills ?? []).filter(
      id => !(delivered ?? []).includes(id),
    ),
  }),
  buildWorkerPrompt: vi.fn(() => 'bounded prompt'),
}));

import { waitForResults } from '../../src/orchestra/result-collector.js';

const roots: string[] = [];

function task(id: string, dependencies: string[] = []): Task {
  return {
    id,
    title: `Disposition fixture ${id}`,
    description: 'hermetic collector disposition fixture',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies,
    goNogo: {
      goCriteria: 'terminal collector output',
      noGoCriteria: 'collector remains blocked',
      techDebtAcceptable: 'none',
    },
    status: dependencies.length === 0 ? TaskStatus.EXECUTING : TaskStatus.PENDING,
    sprintId: 'sprint-disposition',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
  } as Task;
}

function result(
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
    notes: selfAssessment,
    ...overrides,
  };
}

afterEach(() => {
  spawnWorker.mockClear();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('result collector pre-dispatch disposition cascade', () => {
  it('terminally cascade-skips a dependent without entering the FIX lane', async () => {
    const root = mkdtempSync(join(tmpdir(), 'collector-disposition-'));
    roots.push(root);
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });

    const done = task('699-done');
    const rejected = task('699-not-dispatched');
    const dependent = task('699-dependent', [rejected.id]);
    // Replay the production failure mode: the generic repair path parked this
    // task before the upstream admission settlement became collector-visible.
    dependent.status = TaskStatus.PAUSED;
    const sprint = {
      id: 'sprint-disposition',
      number: 699,
      tasks: [done, rejected, dependent],
      workers: [`w-${done.id}`, `w-${rejected.id}`],
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
      startedAt: new Date().toISOString(),
    } as Sprint;

    writeFileSync(
      join(tasksDir, `task-${done.id}.result`),
      JSON.stringify(result(done.id, 'DONE')),
      'utf-8',
    );
    writeFileSync(
      join(tasksDir, `task-${rejected.id}.result`),
      JSON.stringify(result(rejected.id, 'NO_GO', {
        preDispatchSettlement: {
          version: 1,
          state: 'NOT_DISPATCHED',
          attemptId: 'host-pre-dispatch:699-not-dispatched:test',
          reasonCode: 'PROMPT_COMPILE_FAILED',
          evidenceRef: 'host-pre-dispatch-settlement:sha256:test',
        },
      })),
      'utf-8',
    );

    const config = {
      dependency_pipeline_enabled: true,
      fix_phase_enabled: true,
      max_fix_retries: 2,
    } as ResolvedConfig;
    const collected = await waitForResults(
      root,
      sprint,
      5_000,
      undefined,
      undefined,
      undefined,
      config,
    );

    expect(collected.map(item => item.taskId).sort()).toEqual(
      [done.id, rejected.id, dependent.id].sort(),
    );
    expect(collected.find(item => item.taskId === rejected.id))
      .toMatchObject({ preDispatchSettlement: { state: 'NOT_DISPATCHED' } });
    expect(collected.find(item => item.taskId === dependent.id)).toMatchObject({
      selfAssessment: 'NO_GO',
      cascadeSkipped: true,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
    });
    expect(dependent.status).toBe(TaskStatus.NO_GO);
    expect(spawnWorker).not.toHaveBeenCalled();

    const persisted = JSON.parse(
      readFileSync(join(tasksDir, `task-${dependent.id}.result`), 'utf-8'),
    ) as TaskResult;
    expect(persisted.cascadeSkipped).toBe(true);
  });
});
