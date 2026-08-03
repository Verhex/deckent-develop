import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ProviderExecutionObservationStore } from '../../src/core/provider-execution-observation-store.js';
import {
  buildCanonicalRunStatusReadModel,
  publishCanonicalRunStatusReadModel,
  readCanonicalRunStatusReadModel,
} from '../../src/core/run-status-read-model.js';
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

  it('persists IDLE with retired open observations as forensic HOLD, not current concurrency', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-run-status-model-'));
    try {
      putOpenObservation(root, '488-002');
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
      expect(model.holds).toContainEqual(expect.objectContaining({
        reasonCode: 'unresolved-provider-observation',
      }));
      expect(readCanonicalRunStatusReadModel(root)).toEqual(model);
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
