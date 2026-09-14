import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH,
  ProviderExecutionObservationStore,
} from '../../src/core/provider-execution-observation-store.js';
import {
  buildCanonicalRunStatusReadModel,
  publishCanonicalRunStatusReadModel,
  readCanonicalRunStatusReadModel,
  runStatusReadModelMatchesCurrentGeneration,
  projectCanonicalRunLogicalProgress,
} from '../../src/core/run-status-read-model.js';
import { writePid } from '../../src/orchestra/sprint-pid-manager.js';
import type { CanonicalRunStatus } from '../../src/core/run-status-authority.js';
import { TaskStatus, type Task } from '../../src/core/types.js';

function authority(overrides: Partial<CanonicalRunStatus> = {}): CanonicalRunStatus {
  return {
    schemaVersion: 1,
    lifecycle: 'IDLE',
    active: false,
    resumable: false,
    sprintId: null,
    phase: null,
    status: null,
    reason: null,
    recoveryCommand: null,
    finalizeCommand: null,
    coordinator: 'absent',
    conflicts: [],
    ...overrides,
  };
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    sprintId: 'sprint-900',
    title: id,
    description: id,
    status: TaskStatus.PENDING,
    dependencies: [],
    scope: { filesRead: [], filesWrite: [] },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as Task;
}

function putOpenObservation(root: string, taskId: string): void {
  const store = new ProviderExecutionObservationStore(root);
  try {
    store.put({
      source: 'provider-runtime',
      observation: {
        type: 'start',
        executionId: `execution-${taskId}`,
        // v2 binds every observation to its owning run. Derived from the task id so
        // '900-001' stays inside sprint-900 (the current run) while '488-002' remains
        // evidence of a different, finished run — which is exactly what the
        // "counts only exact current-run task observations" case distinguishes.
        runId: `sprint-${taskId.split('-')[0]}`,
        taskId,
        attemptId: `attempt-${taskId}`,
        providerPrincipalDigest: 'principal-900',
        fence: `fence-${taskId}`,
        sequence: 1,
        observedAt: '2026-08-01T00:00:00.000Z',
      },
    });
  } finally {
    store.close();
  }
}

describe('canonical run status read model', () => {
  it('folds FIX attempts into one logical denominator and advances revision only on semantic change', () => {
    const original = task('900-001', { status: TaskStatus.NO_GO });
    const fix = task('900-001-fix', {
      status: TaskStatus.DONE,
      isPriorityFix: true,
      fixForTaskId: original.id,
      updatedAt: '2026-08-01T00:01:00.000Z',
    });
    const first = buildCanonicalRunStatusReadModel({
      authority: authority({ lifecycle: 'ACTIVE', active: true, sprintId: 'sprint-900' }),
      tasks: [original, fix],
      providerConcurrency: [],
      terminalPublication: { version: 1, state: 'open', receipt: null },
      runGeneration: 'lease:generation-900',
      publishedAt: '2026-08-01T00:02:00.000Z',
    });
    expect(first.logicalProgress).toMatchObject({
      done: 1, active: 0, blocked: 0, total: 1, attemptCount: 2,
    });
    expect(first.logicalProgress.lineages).toEqual([
      expect.objectContaining({
        logicalTaskId: '900-001', attemptIds: ['900-001', '900-001-fix'], attemptCount: 2,
      }),
    ]);

    const unchanged = buildCanonicalRunStatusReadModel({
      authority: first.authority,
      tasks: [original, fix],
      providerConcurrency: [],
      terminalPublication: first.terminalPublication,
      runGeneration: first.runGeneration,
      previous: first,
      publishedAt: '2026-08-01T00:03:00.000Z',
    });
    expect(unchanged).toBe(first);
  });

  it('keeps IDLE historical observations forensic without carrying a run HOLD', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-run-status-model-'));
    try {
      putOpenObservation(root, '488-002');
      expect(readFileSync(join(root, PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH))).toBeInstanceOf(Buffer);
      const model = publishCanonicalRunStatusReadModel(root, {
        authority: authority(),
        publishedAt: '2026-08-01T01:00:00.000Z',
      });
      expect(model.authority.lifecycle).toBe('IDLE');
      expect(model.providerConcurrency).toEqual([
        expect.objectContaining({
          currentAttained: 0,
          peakAttained: 0,
          unresolvedOpenIntervals: 1,
          observationScope: 'exact-task-set',
        }),
      ]);
      expect(model.holds).not.toContainEqual(expect.objectContaining({
        reasonCode: 'unresolved-provider-observation',
      }));
      expect(readCanonicalRunStatusReadModel(root)).toEqual(model);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    {
      label: 'COMPLETE',
      status: authority({
        lifecycle: 'COMPLETE', sprintId: 'sprint-900', phase: 'COMPLETE', status: 'COMPLETE',
      }),
      currentTask: null,
    },
    {
      label: 'the next ACTIVE run',
      status: authority({
        lifecycle: 'ACTIVE', active: true, sprintId: 'sprint-901', phase: 'EXECUTE',
        status: 'RUNNING', coordinator: 'alive',
      }),
      currentTask: task('901-001', { sprintId: 'sprint-901' }),
    },
  ])('keeps foreign history visible but non-blocking for $label', ({ status, currentTask }) => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-run-status-model-'));
    try {
      putOpenObservation(root, '488-002');
      if (currentTask !== null) {
        mkdirSync(join(root, '.tasks'), { recursive: true });
        mkdirSync(join(root, '.deckent'), { recursive: true });
        writeFileSync(join(root, '.tasks', `task-${currentTask.id}.json`), JSON.stringify(currentTask));
        writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
          sprintId: currentTask.sprintId,
          taskIds: [currentTask.id],
          phase: 'EXECUTE',
          status: 'RUNNING',
        }));
      }

      const model = publishCanonicalRunStatusReadModel(root, {
        authority: status,
        publishedAt: '2026-08-01T01:00:00.000Z',
      });

      expect(model.providerConcurrency).toEqual([
        expect.objectContaining({
          currentAttained: 0,
          peakAttained: 0,
          unresolvedOpenIntervals: 1,
        }),
      ]);
      expect(model.holds).not.toContainEqual(expect.objectContaining({
        reasonCode: 'unresolved-provider-observation',
      }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('counts only exact current-run task observations and rejects digest tampering', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-run-status-model-'));
    try {
      mkdirSync(join(root, '.tasks'), { recursive: true });
      mkdirSync(join(root, '.deckent'), { recursive: true });
      const current = task('900-001');
      writeFileSync(join(root, '.tasks', 'task-900-001.json'), JSON.stringify(current));
      writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
        sprintId: 'sprint-900', taskIds: ['900-001'], phase: 'EXECUTE', status: 'RUNNING',
      }));
      putOpenObservation(root, '900-001');
      putOpenObservation(root, '488-002');
      const model = publishCanonicalRunStatusReadModel(root, {
        authority: authority({
          lifecycle: 'ACTIVE', active: true, sprintId: 'sprint-900', phase: 'EXECUTE', status: 'RUNNING',
          coordinator: 'alive',
        }),
        publishedAt: '2026-08-01T01:00:00.000Z',
      });
      // No host-owned dispatched settlement authority exists in this fixture,
      // therefore neither open provider claim may become current concurrency.
      expect(model.providerConcurrency[0]).toMatchObject({
        currentAttained: 0,
        peakAttained: 0,
        unresolvedOpenIntervals: 2,
      });
      // The exact current task remains an anomaly even though foreign history
      // is only forensic. Status must not suppress the owned interval with the
      // historical one.
      expect(model.holds).toContainEqual(expect.objectContaining({
        reasonCode: 'unresolved-provider-observation',
      }));

      const path = join(root, '.deckent', 'runtime', 'run-status-read-model.json');
      const tampered = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
      tampered.revision = 99;
      tampered.authority = authority();
      writeFileSync(path, JSON.stringify(tampered));
      expect(() => readCanonicalRunStatusReadModel(root)).toThrow(/digest mismatch/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});


describe('coordinator snapshot custody', () => {
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'deckent-coordinator-progress-'));
    mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
    const pidPath = join(root, '.deckent', 'pids', 'sprint-900.pid');
    writeFileSync(pidPath, JSON.stringify({ leaseId: 'current' }));
    const live = authority({
      lifecycle: 'ACTIVE', active: true, sprintId: 'sprint-900', coordinator: 'alive',
    });
    const tasks = Array.from({ length: 8 }, (_, index) => task(`900-${index + 1}`));
    tasks[0]!.status = TaskStatus.EXECUTING;
    tasks[1]!.status = TaskStatus.DONE;
    tasks[2]!.status = TaskStatus.EXECUTING;
    return { root, pidPath, live, tasks, snapshot: {
      sprintId: 'sprint-900', runGeneration: 'lease:current', tasks, heldTaskIds: ['900-1'],
    } };
  }

  it('publishes all eight planned tasks and committed progress despite stale materialized files', () => {
    const { root, live, tasks, snapshot } = fixture();
    try {
      mkdirSync(join(root, '.tasks'));
      for (const t of tasks.slice(0, 3)) writeFileSync(
        join(root, '.tasks', `task-${t.id}.json`), JSON.stringify({ ...t, status: TaskStatus.EXECUTING }),
      );
      const model = publishCanonicalRunStatusReadModel(root, { authority: live, coordinatorSnapshot: snapshot });
      expect(model.logicalProgress).toMatchObject({ total: 8, done: 1, active: 1, blocked: 6, fixRetry: [] });
      expect(model.holds).toContainEqual(expect.objectContaining({
        reasonCode: 'exact-result-authority-hold', evidenceRef: 'coordinator:lease:current:task:900-1',
      }));
      expect(tasks[0]!.status).toBe(TaskStatus.EXECUTING);
      expect(runStatusReadModelMatchesCurrentGeneration(root, model, live)).toBe(true);
      expect(readCanonicalRunStatusReadModel(root)?.modelDigest).toBe(model.modelDigest);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.each(['lease', 'sprint', 'task', 'duplicate', 'hold'])('rejects foreign snapshot %s without replacing persisted progress', kind => {
    const { root, live, snapshot } = fixture();
    try {
      const first = publishCanonicalRunStatusReadModel(root, { authority: live, coordinatorSnapshot: snapshot });
      const invalid = { ...snapshot, tasks: [...snapshot.tasks] };
      if (kind === 'lease') invalid.runGeneration = 'lease:old';
      if (kind === 'sprint') invalid.sprintId = 'sprint-901';
      if (kind === 'task') invalid.tasks[0] = { ...invalid.tasks[0]!, sprintId: 'sprint-901' };
      if (kind === 'duplicate') invalid.tasks.push(invalid.tasks[0]!);
      if (kind === 'hold') invalid.heldTaskIds = ['foreign'];
      expect(() => publishCanonicalRunStatusReadModel(root, { authority: live, coordinatorSnapshot: invalid })).toThrow(/authority mismatch/u);
      expect(readCanonicalRunStatusReadModel(root)?.modelDigest).toBe(first.modelDigest);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects an old lease with identical lifecycle and sprint identity; missing live identity also fails closed', () => {
    const { root, pidPath, live, snapshot } = fixture();
    try {
      const model = publishCanonicalRunStatusReadModel(root, { authority: live, coordinatorSnapshot: snapshot });
      writeFileSync(pidPath, JSON.stringify({ leaseId: 'successor' }));
      expect(runStatusReadModelMatchesCurrentGeneration(root, model, live)).toBe(false);
      writeFileSync(pidPath, '{}');
      expect(runStatusReadModelMatchesCurrentGeneration(root, model, live)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('only the current NO_GO lineage projects retry pending, never a queued or held FIX', () => {
    const tasks = [task('a', { status: TaskStatus.NO_GO }), task('b'), task('c', { status: TaskStatus.PAUSED })];
    expect(projectCanonicalRunLogicalProgress(tasks).fixRetry.map(row => row.logicalTaskId)).toEqual(['a']);
    tasks.push(task('a-fix', { isPriorityFix: true, fixForTaskId: 'a', status: TaskStatus.PAUSED }));
    expect(projectCanonicalRunLogicalProgress(tasks).fixRetry).toEqual([]);
  });
});


describe('fresh coordinator publication before task materialization', () => {
  it.each([false, true])('resolves its live lease without injected authority (historical dashboard=%s)', historical => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-fresh-progress-'));
    try {
      if (historical) writeFileSync(join(root, '.dashboard'), JSON.stringify({
        sprint: { id: 'sprint-899', status: 'ABORTED', phase: 'EXECUTE' },
      }));
      const writer = writePid(root, 'sprint-900', new Date().toISOString());
      const snapshot = { sprintId: writer.sprintId, runGeneration: `lease:${writer.leaseId}`,
        tasks: [task('900-001')], heldTaskIds: [] };
      const model = publishCanonicalRunStatusReadModel(root, { coordinatorSnapshot: snapshot });
      expect(model.authority).toMatchObject({ sprintId: writer.sprintId, active: true, coordinator: 'alive' });
      expect(model.logicalProgress.total).toBe(1);
      expect(() => publishCanonicalRunStatusReadModel(root, {
        coordinatorSnapshot: { ...snapshot, runGeneration: 'lease:foreign' },
      })).toThrow(/authority mismatch/u);
      expect(readCanonicalRunStatusReadModel(root)?.modelDigest).toBe(model.modelDigest);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('does not let a snapshot hint override a persisted different active run', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-fresh-progress-conflict-'));
    try {
      const writer = writePid(root, 'sprint-900', new Date().toISOString());
      writeFileSync(join(root, '.deckent', 'sprint-active.json'), JSON.stringify({ sprintId: 'sprint-901' }));
      expect(() => publishCanonicalRunStatusReadModel(root, { coordinatorSnapshot: {
        sprintId: writer.sprintId, runGeneration: `lease:${writer.leaseId}`, tasks: [task('900-001')], heldTaskIds: [],
      } })).toThrow(/authority mismatch/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
