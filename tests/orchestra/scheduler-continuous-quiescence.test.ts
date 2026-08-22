import { describe, expect, it } from 'vitest';

import { TaskStatus } from '../../src/core/types.js';
import type { SchedulerSnapshot, SchedulerTaskSnapshot } from '../../src/orchestra/scheduler-reducer.js';
import { reduceSchedulerTick } from '../../src/orchestra/scheduler-reducer.js';

function task(
  id: string,
  status: TaskStatus,
  dependencies: readonly string[] = [],
): SchedulerTaskSnapshot {
  return { id, status, dependencies };
}

function snapshot(
  tasks: readonly SchedulerTaskSnapshot[],
  overrides: Partial<SchedulerSnapshot> = {},
): SchedulerSnapshot {
  const terminalFailureIds = new Set(
    tasks
      .filter(item => item.status === TaskStatus.NO_GO || item.status === TaskStatus.MANUAL_REVIEW_REQUIRED)
      .map(item => item.id),
  );
  return {
    trigger: { kind: 'watcher', sequence: 1 },
    strategy: 'continuous',
    nowMs: 1_800_000_000_000,
    costStop: false,
    slotBudget: 4,
    orderedQueue: [],
    tasks,
    assignedTaskIds: new Set(),
    collectedIds: new Set(),
    completedTaskIds: [],
    dependencyPipelineEnabled: true,
    effectiveDependencyState: {
      satisfyingIds: new Set(),
      terminalFailureIds,
      retryEligibleIds: new Set(tasks.map(item => item.id)),
    },
    collisionBlockedIds: new Set(),
    ...overrides,
  };
}

function skips(decision: ReturnType<typeof reduceSchedulerTick>) {
  return decision.orderedEffects.filter(
    (effect): effect is Extract<typeof effect, { kind: 'CascadeSkip' }> => effect.kind === 'CascadeSkip',
  );
}

describe('continuous scheduler quiescence', () => {
  it('terminalizes a deterministic PENDING/PAUSED dead-dependency chain instead of idling', () => {
    const input = snapshot([
      task('root', TaskStatus.NO_GO),
      task('pending-child', TaskStatus.PENDING, ['root']),
      task('paused-grandchild', TaskStatus.PAUSED, ['pending-child']),
    ]);

    const first = reduceSchedulerTick(input);
    const replay = reduceSchedulerTick(input);

    expect(skips(first)).toEqual([
      {
        kind: 'CascadeSkip',
        taskId: 'pending-child',
        failedDependencyId: 'root',
        idempotencyKey: 'cascade-skip:pending-child:root',
      },
      {
        kind: 'CascadeSkip',
        taskId: 'paused-grandchild',
        failedDependencyId: 'pending-child',
        quiescenceReason: 'continuous-dead-dependency',
        idempotencyKey: 'cascade-skip:paused-grandchild:pending-child',
      },
    ]);
    expect(replay.orderedEffects).toEqual(first.orderedEffects);
  });

  it('preserves a recoverable paused descendant while repair is enabled', () => {
    const decision = reduceSchedulerTick(snapshot([
      task('root', TaskStatus.NO_GO),
      task('paused-for-repair', TaskStatus.PAUSED, ['root']),
    ], { deferTerminalDependencyFailure: true }));

    expect(skips(decision)).toEqual([]);
    expect(decision.dispositions.has('paused-for-repair')).toBe(false);
  });

  it('does not declare quiescence while live work remains', () => {
    const decision = reduceSchedulerTick(snapshot([
      task('root', TaskStatus.NO_GO),
      task('live', TaskStatus.EXECUTING),
      task('paused', TaskStatus.PAUSED, ['root']),
    ], {
      slotBudget: 0,
      assignedTaskIds: new Set(['live']),
    }));

    expect(skips(decision).map(effect => effect.taskId)).not.toContain('paused');
  });

  it('does not treat an ordinary approval/operator pause as terminal', () => {
    const decision = reduceSchedulerTick(snapshot([
      task('awaiting-approval', TaskStatus.PAUSED),
    ]));

    expect(skips(decision)).toEqual([]);
    expect(decision.dispositions.has('awaiting-approval')).toBe(false);
  });

  it('does not apply the quiescence terminalizer to legacy FIFO', () => {
    const decision = reduceSchedulerTick(snapshot([
      task('root', TaskStatus.NO_GO),
      task('paused', TaskStatus.PAUSED, ['root']),
    ], { strategy: 'legacy-fifo' }));

    expect(skips(decision)).toEqual([]);
  });
});
