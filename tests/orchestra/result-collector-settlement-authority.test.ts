import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';

vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 5))),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn(() => 'bounded prompt'),
}));

import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  taskResultSettlementPath,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';
import { pollForResultFile } from '../../src/orchestra/sprint-phases.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(taskId: string): { root: string; tasksDir: string; task: Task; sprint: Sprint } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-collector-settlement-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  const task = {
    id: taskId,
    title: 'Settlement authority task',
    description: 'prove host result authority',
    model: 'claude-fable-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'host truth', noGoCriteria: 'raw wins', techDebtAcceptable: 'none' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-settlement-authority',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
  } as Task;
  const sprint = {
    id: 'sprint-settlement-authority',
    number: 1,
    tasks: [task],
    workers: [`w-${taskId}`],
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: new Date().toISOString(),
  } as Sprint;
  return { root, tasksDir, task, sprint };
}

function result(taskId: string, selfAssessment: TaskResult['selfAssessment'], notes: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: selfAssessment === 'DONE',
    coverage: 0,
    selfAssessment,
    notes,
  };
}

afterEach(() => {
  vi.useRealTimers();
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('result collector settlement authority wire', () => {
  it('waits past an early raw Docker DONE and collects the later host settlement', async () => {
    const taskId = 'collector-host-truth';
    const { root, tasksDir, sprint } = fixture(taskId);
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      JSON.stringify(result(taskId, 'DONE', 'untrusted early raw')),
      'utf-8',
    );
    writeFileSync(join(tasksDir, `task-${taskId}.timeout`), 'WORKER_TIMEOUT', 'utf-8');
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    const pending = waitForResults(root, sprint, 1_000);
    const hostResult = result(taskId, 'NO_GO', 'immutable host settlement');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 1,
      result: hostResult as unknown as Record<string, unknown>,
    }));
    const receiptOnly = await Promise.race([
      pending.then(() => 'resolved'),
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 75)),
    ]);
    expect(receiptOnly).toBe('pending');
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });

    const results = await pending;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      taskId,
      selfAssessment: 'NO_GO',
      notes: 'immutable host settlement',
    });
  });

  it('bounded polling ignores raw Docker output until host settlement exists', async () => {
    const taskId = 'poll-host-truth';
    const { root, tasksDir } = fixture(taskId);
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      JSON.stringify(result(taskId, 'DONE', 'raw only')),
      'utf-8',
    );
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    await expect(pollForResultFile(root, taskId, 20, 5))
      .rejects.toMatchObject({ code: 'DECKENT_E077' });

    const hostResult = result(taskId, 'NO_GO', 'settled truth');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 1,
      result: hostResult as unknown as Record<string, unknown>,
    }));
    await expect(pollForResultFile(root, taskId, 20, 5))
      .rejects.toMatchObject({ code: 'DECKENT_E077' });
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    await expect(pollForResultFile(root, taskId, 20, 5)).resolves.toMatchObject({
      selfAssessment: 'NO_GO',
      notes: 'settled truth',
    });
  });

  it('bounded polling propagates corrupt settlement evidence instead of fabricating NO_GO', async () => {
    const taskId = 'poll-corrupt-settlement';
    const { root, tasksDir } = fixture(taskId);
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      JSON.stringify(result(taskId, 'DONE', 'raw fallback forbidden')),
      'utf-8',
    );
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeFileSync(taskResultSettlementPath(ref), '{}', 'utf-8');

    await expect(pollForResultFile(root, taskId, 20, 5))
      .rejects.toThrow(/Corrupt host-owned Docker result settlement/);
  });

  it('repairs a malformed raw result through terminal-only reconciliation during the live wait', async () => {
    const taskId = 'collector-live-malformed';
    const { root, tasksDir, sprint } = fixture(taskId);
    writeFileSync(
      join(tasksDir, `task-${taskId}.result`),
      `${JSON.stringify(result(taskId, 'DONE', 'raw'))}\\n`,
      'utf-8',
    );
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    const reconcilePendingAttempts = vi.fn(async () => {
      const hostResult = result(taskId, 'NO_GO', 'host repaired malformed raw result');
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref,
        exitCode: 1,
        result: hostResult as unknown as Record<string, unknown>,
      }));
      writeTaskResultSettlementClosureAtomic(ref, {
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });
      return {
        adopted: [],
        closedNotDispatched: [],
        closedAbsentAfterExit: [taskId],
        retiredLanded: [],
        resumedContinuations: [],
      };
    });
    const backend = {
      name: 'test-recovery',
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn(() => []),
      isAvailable: vi.fn(async () => true),
      reconcilePendingAttempts,
    };

    const results = await waitForResults(
      root,
      sprint,
      1_000,
      [],
      { spawnBackend: backend },
    );

    expect(reconcilePendingAttempts).toHaveBeenCalledWith({ mode: 'terminal-only' });
    expect(results).toEqual([
      expect.objectContaining({
        taskId,
        selfAssessment: 'NO_GO',
        notes: 'host repaired malformed raw result',
      }),
    ]);
  });
});
