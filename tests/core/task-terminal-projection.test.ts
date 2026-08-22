import { describe, expect, it } from 'vitest';

import {
  createTaskTerminalProjection,
  reduceTaskTerminalProjection,
  type TaskTerminalEvidence,
} from '../../src/core/task-terminal-projection.js';

const base = () => createTaskTerminalProjection({
  logicalTaskId: 'logical-1',
  generation: 4,
  winnerAttemptId: 'attempt-fix',
});

describe('task terminal projection', () => {
  it.each([
    ['DONE', 'DONE', false, false],
    ['NO_GO', 'NO_GO', false, false],
  ] as const)('projects winning attempt result %s', (outcome, status, cascadeSkipped, neverDispatched) => {
    const result = reduceTaskTerminalProjection(base(), {
      kind: 'attempt-result', logicalTaskId: 'logical-1', generation: 4,
      attemptId: 'attempt-fix', outcome,
    });
    expect(result).toMatchObject({
      decision: 'applied',
      projection: { terminal: outcome, status, cascadeSkipped, neverDispatched },
    });
  });

  it.each([
    ['ABORTED', 'ABORTED', false, false],
    ['CASCADE_SKIPPED', 'NO_GO', true, false],
    ['NEVER_DISPATCHED', 'NO_GO', false, true],
  ] as const)('preserves gate distinction %s', (outcome, status, cascadeSkipped, neverDispatched) => {
    const result = reduceTaskTerminalProjection(base(), {
      kind: 'gate-terminal', logicalTaskId: 'logical-1', generation: 4,
      attemptId: null, outcome,
    });
    expect(result).toMatchObject({
      decision: 'applied',
      projection: { terminal: outcome, status, cascadeSkipped, neverDispatched },
    });
  });

  it('accepts only the selected attempt winner', () => {
    expect(reduceTaskTerminalProjection(base(), {
      kind: 'attempt-result', logicalTaskId: 'logical-1', generation: 4,
      attemptId: 'attempt-original', outcome: 'DONE',
    })).toMatchObject({ decision: 'hold', reasonCode: 'non-winning-attempt', projection: { terminal: null } });
  });

  it.each([
    [3, 'stale-generation'],
    [5, 'foreign-generation'],
  ] as const)('fails closed for generation %s', (generation, reasonCode) => {
    expect(reduceTaskTerminalProjection(base(), {
      kind: 'attempt-result', logicalTaskId: 'logical-1', generation,
      attemptId: 'attempt-fix', outcome: 'DONE',
    })).toMatchObject({ decision: 'hold', reasonCode, projection: { terminal: null } });
  });

  it('is replay-stable and never lets a stale result or gate retract terminal truth', () => {
    const done: TaskTerminalEvidence = {
      kind: 'attempt-result', logicalTaskId: 'logical-1', generation: 4,
      attemptId: 'attempt-fix', outcome: 'DONE',
    };
    const applied = reduceTaskTerminalProjection(base(), done);
    expect(applied.decision).toBe('applied');
    const projection = applied.projection;

    const replay = reduceTaskTerminalProjection(projection, done);
    expect(replay).toEqual({ decision: 'idempotent', projection });
    expect(replay.projection).toBe(projection);

    expect(reduceTaskTerminalProjection(projection, {
      ...done, generation: 3, outcome: 'NO_GO',
    })).toMatchObject({ decision: 'hold', reasonCode: 'stale-generation', projection: { terminal: 'DONE' } });
    expect(reduceTaskTerminalProjection(projection, {
      kind: 'gate-terminal', logicalTaskId: 'logical-1', generation: 4,
      attemptId: null, outcome: 'ABORTED',
    })).toMatchObject({ decision: 'hold', reasonCode: 'terminal-conflict', projection: { terminal: 'DONE' } });
  });

  it('rejects foreign logical-task evidence without mutation', () => {
    const projection = base();
    const result = reduceTaskTerminalProjection(projection, {
      kind: 'gate-terminal', logicalTaskId: 'logical-2', generation: 4,
      attemptId: null, outcome: 'NEVER_DISPATCHED',
    });
    expect(result).toEqual({ decision: 'hold', reasonCode: 'foreign-logical-task', projection });
    expect(result.projection).toBe(projection);
  });
});
