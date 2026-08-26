import { describe, expect, it } from 'vitest';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task } from '../../src/core/types.js';
import { captureShadowSchedulerSnapshot } from '../../src/orchestra/scheduler-driver.js';
import { reduceSchedulerTick } from '../../src/orchestra/scheduler-reducer.js';
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import type { SpawnBackend } from "../../src/orchestra/spawn-backend.js";
import { reconcileSpawnBackendBeforeRestore } from "../../src/orchestra/sprint-controller.js";

function task(id: string, file: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: id,
    model: 'gpt-5.6-sol',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'collision-wire-test',
    scope: { directories: [], filesRead: [], filesWrite: [file] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-collision-wire',
    assignedAgent: 'implementer',
    assignedSkills: [],
    budget: { maxTurns: 1 },
    ...overrides,
  } as Task;
}

function sprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-collision-wire',
    number: 487,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks,
    workers: [],
    planningMode: 'structured',
  } as Sprint;
}

function decide(tasks: Task[], slotBudget: number, collectedIds = new Set<string>()) {
  const snapshot = captureShadowSchedulerSnapshot({
    trigger: { kind: 'watcher', sequence: 1 },
    strategy: 'continuous',
    nowMs: 1,
    costStop: false,
    slotBudget,
    dependencyPipelineEnabled: true,
    sprint: sprint(tasks),
    remainingQueue: [],
    assignedTaskIds: new Set(tasks.filter(t => t.status === TaskStatus.EXECUTING).map(t => t.id)),
    collectedIds,
    completedTaskIds: [],
  });
  return reduceSchedulerTick(snapshot);
}

describe('scheduler collision reorder production wire', () => {
  it('suppresses original/FIX and FIX/FIX lineage self-collisions', () => {
    const original = task('487-001', 'src/shared.ts', { status: TaskStatus.NO_GO });
    const fixOne = task('487-001-fix', 'src/shared.ts', { fixForTaskId: original.id });
    const fixTwo = task('487-001-fix-2', 'src/shared.ts', { fixForTaskId: fixOne.id });

    const decision = decide([original, fixOne, fixTwo], 2);

    expect(decision.orderedEffects.filter(effect => effect.kind === 'Blocked')).toEqual([]);
    expect(decision.orderedEffects.filter(effect => effect.kind === 'SpawnTask').map(effect => effect.taskId))
      .toEqual(['487-001-fix', '487-001-fix-2']);
  });

  it('serializes real competing writers without spending the available slot on the blocked task', () => {
    const owner = task('487-010', 'src/shared.ts', { status: TaskStatus.EXECUTING });
    const competitor = task('487-011', 'src/shared.ts');
    const independent = task('487-012', 'src/independent.ts');

    const decision = decide([owner, competitor, independent], 1);

    expect(decision.orderedEffects).toContainEqual({
      kind: 'Blocked',
      taskId: competitor.id,
      reason: 'scope-collision',
      blockingId: owner.id,
    });
    expect(decision.orderedEffects).toContainEqual({
      kind: 'SpawnTask',
      taskId: independent.id,
      reason: 'pending-slot-fill',
    });
  });

  it('automatically releases the next writer after its exact predecessor becomes satisfying', () => {
    const owner = task('487-020', 'src/shared.ts', { status: TaskStatus.DONE });
    const competitor = task('487-021', 'src/shared.ts');

    const decision = decide([owner, competitor], 1);

    expect(decision.orderedEffects).toContainEqual({
      kind: 'SpawnTask',
      taskId: competitor.id,
      reason: 'pending-slot-fill',
    });
    expect(decision.dispositions.get(competitor.id)).toBe('spawn');
  });

  it('releases only a synthetic collision after a NO_GO predecessor is collected', () => {
    const failedWriter = task('487-030', 'src/shared.ts', { status: TaskStatus.NO_GO });
    const collisionOnly = task('487-031', 'src/shared.ts');
    const realDependant = task('487-032', 'src/independent.ts', {
      dependencies: [failedWriter.id],
    });

    const decision = decide(
      [failedWriter, collisionOnly, realDependant],
      2,
      new Set([failedWriter.id]),
    );

    expect(decision.orderedEffects).toContainEqual({
      kind: 'SpawnTask',
      taskId: collisionOnly.id,
      reason: 'pending-slot-fill',
    });
    expect(decision.orderedEffects).toContainEqual({
      kind: 'CascadeSkip',
      taskId: realDependant.id,
      failedDependencyId: failedWriter.id,
      idempotencyKey: `cascade-skip:${realDependant.id}:${failedWriter.id}`,
    });
    expect(decision.orderedEffects).not.toContainEqual(expect.objectContaining({
      kind: 'SpawnTask',
      taskId: realDependant.id,
    }));
  });
});

// WIRE-037: physically merged from tests/orchestra/sprint-restart-reconcile-wire.test.ts.
{
function backend(reconcilePendingAttempts?: SpawnBackend['reconcilePendingAttempts']): SpawnBackend {
    return {
        name: 'test',
        spawn: vi.fn(),
        kill: vi.fn(),
        list: vi.fn(() => []),
        isAvailable: vi.fn(async () => true),
        ...(reconcilePendingAttempts ? { reconcilePendingAttempts } : {}),
    };
}

describe('runSprint restart reconciliation seam', () => {
    it('keeps recovery after project leadership and before checkpoint interpretation', () => {
        const source = readFileSync(join(process.cwd(), 'src/orchestra/sprint-controller.ts'), 'utf-8');
        // 2026-08-25: stale-lock reconciliation retry made the binding mutable
        // (`let lockAcquired`) so a cleared-stale lease can re-acquire; the ordering
        // contract (lock → backend reconcile → checkpoint restore) is unchanged.
        const lockIndex = source.indexOf('let lockAcquired = acquireSprintLock');
        const reconcileIndex = source.indexOf('await reconcileSpawnBackendBeforeRestore(recoveryBackend)');
        const restoreIndex = source.indexOf('const recovery = restoreSprintFromCheckpoint');
        expect(lockIndex).toBeGreaterThan(-1);
        expect(reconcileIndex).toBeGreaterThan(lockIndex);
        expect(restoreIndex).toBeGreaterThan(reconcileIndex);
    });
    it('propagates checkpoint execution-authority HOLD instead of falling through to PLAN', () => {
        const source = readFileSync(join(process.cwd(), 'src/orchestra/sprint-controller.ts'), 'utf-8');
        const restoreIndex = source.indexOf('const recovery = restoreSprintFromCheckpoint');
        const recoveryCatchIndex = source.indexOf('catch (e) {', restoreIndex);
        const recoveryCatchEnd = source.indexOf('// ─── Outer-scope variables', recoveryCatchIndex);
        const boundary = source.slice(recoveryCatchIndex, recoveryCatchEnd);
        expect(boundary).toContain("e instanceof DeckentError && e.code === 'DECKENT_E077'");
        expect(boundary).toContain('throw e');
    });
    it('awaits the backend recovery authority exactly once', async () => {
        const reconcile = vi.fn(async () => ({
            adopted: ['task-a'],
            closedNotDispatched: [],
            closedAbsentAfterExit: [],
            retiredLanded: [],
            resumedContinuations: [],
        }));
        await reconcileSpawnBackendBeforeRestore(backend(reconcile));
        expect(reconcile).toHaveBeenCalledTimes(1);
    });
    it('propagates recovery HOLD/failure instead of continuing to checkpoint restore', async () => {
        const error = new Error('DECKENT_E091:ambiguous-dispatch-container-absent');
        const reconcile = vi.fn(async () => { throw error; });
        await expect(reconcileSpawnBackendBeforeRestore(backend(reconcile))).rejects.toBe(error);
    });
    it('is a no-op for backends without a durable attempt journal', async () => {
        await expect(reconcileSpawnBackendBeforeRestore(backend())).resolves.toBeUndefined();
    });
});
}
