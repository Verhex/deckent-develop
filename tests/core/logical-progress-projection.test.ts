import { describe, expect, it } from 'vitest';

import { projectLogicalProgress } from '../../src/core/logical-progress-projection.js';

describe('logical progress projection', () => {
  it('folds original, FIX, and FIX-FIX into one logical task while retaining attempts', () => {
    const result = projectLogicalProgress({
      attempts: [
        { logicalTaskId: 'task-1', id: 'attempt-a', status: 'blocked', sequence: 1 },
        { logicalTaskId: 'task-1', id: 'attempt-b', status: 'active', fixForAttemptId: 'attempt-a', sequence: 2 },
        { logicalTaskId: 'task-1', id: 'attempt-c', status: 'done', fixForAttemptId: 'attempt-b', sequence: 3 },
        { logicalTaskId: 'task-2', id: 'attempt-d', status: 'active' },
      ],
      denominator: { kind: 'logical-task', total: 2 },
    });

    expect(result).toEqual({
      ok: true,
      projection: {
        done: 1,
        active: 1,
        blocked: 0,
        total: 2,
        attemptCount: 4,
        lineages: [
          {
            logicalTaskId: 'task-1',
            attemptIds: ['attempt-a', 'attempt-b', 'attempt-c'],
            attemptCount: 3,
            status: 'done',
          },
          {
            logicalTaskId: 'task-2',
            attemptIds: ['attempt-d'],
            attemptCount: 1,
            status: 'active',
          },
        ],
      },
    });
  });

  it('counts exactly one status per logical task, including an empty projection', () => {
    const empty = projectLogicalProgress({ attempts: [] });
    const populated = projectLogicalProgress({
      attempts: [
        { logicalTaskId: 'done-task', id: 'done', status: 'done' },
        { logicalTaskId: 'active-task', id: 'active', status: 'active' },
        { logicalTaskId: 'blocked-task', id: 'blocked', status: 'blocked' },
      ],
    });

    expect(empty).toEqual({
      ok: true,
      projection: { done: 0, active: 0, blocked: 0, total: 0, attemptCount: 0, lineages: [] },
    });
    expect(populated).toMatchObject({
      ok: true,
      projection: { done: 1, active: 1, blocked: 1, total: 3, attemptCount: 3 },
    });
  });

  it('rejects raw-attempt and conflicting logical denominators without replacing them', () => {
    const attempts = [
      { logicalTaskId: 'root', id: 'first', status: 'blocked' as const },
      { logicalTaskId: 'root', id: 'second', status: 'done' as const, fixForAttemptId: 'first' },
    ];

    expect(projectLogicalProgress({
      attempts,
      denominator: { kind: 'attempt', total: 2 },
    })).toEqual({ ok: false, diagnostic: 'mixed-denominator-attempts' });
    expect(projectLogicalProgress({
      attempts,
      denominator: { kind: 'logical-task', total: 2 },
    })).toEqual({ ok: false, diagnostic: 'mixed-denominator-total' });
  });

  it('rejects duplicate attempt identity instead of producing a distorted total', () => {
    expect(projectLogicalProgress({
      attempts: [
        { logicalTaskId: 'first', id: 'same', status: 'done' },
        { logicalTaskId: 'second', id: 'same', status: 'active' },
      ],
    })).toEqual({ ok: false, diagnostic: 'duplicate-attempt-id' });
  });

  it('treats exact attempt IDs as opaque and uses only explicit canonical identity', () => {
    const root = 'opaque::repair-looking-fix';
    const fix = 'unrelated/value.with-delimiters';
    const result = projectLogicalProgress({
      attempts: [
        { logicalTaskId: 'canonical-root', id: root, status: 'blocked' },
        { logicalTaskId: 'canonical-root', id: fix, status: 'done', fixForAttemptId: root },
      ],
      denominator: { kind: 'logical-task', total: 1 },
    });

    expect(result).toMatchObject({
      ok: true,
      projection: { done: 1, active: 0, blocked: 0, total: 1, attemptCount: 2 },
    });
  });

  it('rejects a repair edge with conflicting canonical logical identity', () => {
    expect(projectLogicalProgress({
      attempts: [
        { logicalTaskId: 'canonical-a', id: 'opaque-parent', status: 'blocked' },
        {
          logicalTaskId: 'canonical-b',
          id: 'opaque-child',
          status: 'done',
          fixForAttemptId: 'opaque-parent',
        },
      ],
    })).toEqual({ ok: false, diagnostic: 'conflicting-logical-task-id' });
  });

  it('rejects an empty canonical identity instead of inferring one from display identity', () => {
    expect(projectLogicalProgress({
      attempts: [{ logicalTaskId: '', id: 'display-fix-suffix', status: 'active' }],
    })).toEqual({ ok: false, diagnostic: 'invalid-logical-task-id' });
    expect(projectLogicalProgress({
      attempts: [{ id: 'legacy-display-fix', status: 'active' }],
    })).toEqual({ ok: false, diagnostic: 'invalid-logical-task-id' });
  });
});
