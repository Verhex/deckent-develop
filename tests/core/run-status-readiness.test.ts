import { describe, expect, it } from 'vitest';

import {
  buildCanonicalRunStatusReadModel,
  projectCanonicalRunLogicalProgress,
  resolveRunStatusReadiness,
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
    sprintId: 'sprint-674',
    title: id,
    description: id,
    status: TaskStatus.NO_GO,
    dependencies: [],
    scope: { filesRead: [], filesWrite: [] },
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  } as Task;
}

describe('run status readiness', () => {
  it('treats resumable PAUSED authority as self-sufficient before resumability', () => {
    const paused = authority({ lifecycle: 'PAUSED', resumable: true, sprintId: 'sprint-674' });
    expect(resolveRunStatusReadiness(paused, null)).toEqual({
      state: 'SELF_SUFFICIENT', reason: 'reconciled-paused',
    });
  });

  it('holds an unproven ACTIVE authority without a matching model', () => {
    const active = authority({ lifecycle: 'ACTIVE', active: true, coordinator: 'dead' });
    expect(resolveRunStatusReadiness(active, null)).toEqual({
      state: 'HOLD', code: 'RUN_STATUS_READ_MODEL_UNAVAILABLE',
    });
  });

  it('treats proven ACTIVE liveness as self-sufficient', () => {
    const active = authority({ lifecycle: 'ACTIVE', active: true, coordinator: 'alive' });
    expect(resolveRunStatusReadiness(active, null)).toEqual({
      state: 'SELF_SUFFICIENT', reason: 'proven-active-liveness',
    });
  });

  it('returns READY for a model matching the exact authority', () => {
    const current = authority();
    const model = buildCanonicalRunStatusReadModel({
      authority: current,
      tasks: [],
      providerConcurrency: [],
      terminalPublication: { version: 1, state: 'open', receipt: null },
      runGeneration: null,
      publishedAt: '2026-08-25T00:00:00.000Z',
    });
    expect(resolveRunStatusReadiness(current, model)).toEqual({ state: 'READY', model });
  });

  it('projects retry-pending and budget-exhausted blocked FIX lineages', () => {
    const original = task('674-001');
    const firstFix = task('674-001-fix', {
      isPriorityFix: true,
      fixForTaskId: original.id,
      updatedAt: '2026-08-25T00:01:00.000Z',
    });
    const exhausted = task('674-001-fix-2', {
      isPriorityFix: true,
      fixForTaskId: firstFix.id,
      updatedAt: '2026-08-25T00:02:00.000Z',
    });

    expect(projectCanonicalRunLogicalProgress([original], 2).fixRetry).toEqual([
      { logicalTaskId: original.id, attemptCount: 1, maxFixRetries: 2,
        disposition: 'retry-pending' },
    ]);
    expect(projectCanonicalRunLogicalProgress([original, firstFix, exhausted], 2).fixRetry)
      .toEqual([
        { logicalTaskId: original.id, attemptCount: 3, maxFixRetries: 2,
          disposition: 'budget-exhausted' },
      ]);
  });
});
