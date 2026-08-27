import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import { reduceSchedulerTick, type SchedulerSnapshot } from '../../src/orchestra/scheduler-reducer.js';

describe('scheduler repair disposition gate', () => {
  it('emits one typed NO_MINT and cascade-skips the dependent without spawning repair', () => {
    const repair = {
      id: 'root-fix', status: TaskStatus.PENDING, dependencies: [], fixForTaskId: 'root',
      repairSettlementReasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE',
    };
    const dependent = { id: 'dependent', status: TaskStatus.PENDING, dependencies: ['root'] };
    const snapshot: SchedulerSnapshot = {
      trigger: { kind: 'watcher', sequence: 1 }, strategy: 'continuous', nowMs: 0,
      costStop: false, slotBudget: 2, orderedQueue: [repair], tasks: [repair, dependent],
      assignedTaskIds: new Set(), collectedIds: new Set(), completedTaskIds: [],
      dependencyPipelineEnabled: true, deferTerminalDependencyFailure: true,
      effectiveDependencyState: {
        satisfyingIds: new Set(), terminalFailureIds: new Set(), retryEligibleIds: new Set(['root-fix', 'dependent']),
      },
      collisionBlockedIds: new Set(),
    };

    const decision = reduceSchedulerTick(snapshot);
    expect(decision.orderedEffects.filter(effect => effect.kind === 'NoMintRepair')).toEqual([{
      kind: 'NoMintRepair', taskId: 'root-fix', failedTaskId: 'root',
      reasonCode: 'PROVIDER_ADAPTER_UNAVAILABLE',
      idempotencyKey: 'no-mint:root-fix:PROVIDER_ADAPTER_UNAVAILABLE',
    }]);
    expect(decision.orderedEffects).not.toContainEqual(expect.objectContaining({ kind: 'SpawnTask', taskId: 'root-fix' }));
    expect(decision.orderedEffects).toContainEqual(expect.objectContaining({ kind: 'CascadeSkip', taskId: 'dependent', failedDependencyId: 'root' }));
  });
});
