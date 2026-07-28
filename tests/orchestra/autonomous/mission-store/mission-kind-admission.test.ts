import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import {
  CANONICAL_WORK_ITEM_KINDS,
  PRODUCTION_V2_ADMISSION,
  PRODUCTION_V2_RUNNER_REGISTRY,
  assertCanonicalWorkItemKind,
  assertWorkItemBatchAdmitted,
  admitWorkItemBatch,
  bindMissionRunnerRegistry,
  createMissionRunnerRegistry,
  isCanonicalWorkItemKind,
  listRuntimeAdmittedKinds,
  type MissionRuntimeAdmission,
} from '../../../../src/orchestra/autonomous/mission-store/mission-kind-admission.js';
import type {
  MissionDispatchClaim,
  WorkItem,
} from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';

const allWired: MissionRuntimeAdmission = createMissionRunnerRegistry({
  registryRevision: 'test-all-runners-v1',
  runners: CANONICAL_WORK_ITEM_KINDS.map((kind) => ({
    kind,
    runnerContract: `${kind}-contract-v1`,
    runnerRevision: `${kind}-runner-v1`,
  })),
});

function productionItem(): WorkItem {
  const admitted = admitWorkItemBatch([{
    id: 'task-a',
    missionId: 'mission-a',
    kind: 'task' as const,
    spec: { description: 'bounded' },
  }], PRODUCTION_V2_RUNNER_REGISTRY)[0]!;
  return {
    ...admitted,
    status: 'pending',
    policy: 'auto',
    renderAs: 'task',
    progress: null,
    dependsOn: [],
    trigger: null,
    claimedAt: null,
    claimedBy: null,
    revision: 0,
    claimRegistryRevision: null,
    claimRegistryDigest: null,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    lastResult: null,
  };
}

function productionClaim(overrides: Partial<MissionDispatchClaim> = {}): MissionDispatchClaim {
  const fenceToken = 'host-private-token';
  return Object.freeze({
    schemaVersion: 1,
    workItemId: 'task-a',
    missionId: 'mission-a',
    claimedBy: 'scheduler',
    claimedAt: '2026-07-22T00:00:00.000Z',
    itemRevision: 1,
    attemptId: 'attempt-1',
    fenceToken,
    fenceTokenHash: createHash('sha256').update(fenceToken).digest('hex'),
    claimRegistryRevision: PRODUCTION_V2_RUNNER_REGISTRY.registryRevision,
    claimRegistryDigest: PRODUCTION_V2_RUNNER_REGISTRY.registryDigest,
    ...overrides,
  });
}

describe('mission kind admission registry', () => {
  it('contains exactly the four canonical work-item kinds', () => {
    expect(CANONICAL_WORK_ITEM_KINDS).toEqual(['task', 'sprint', 'capability', 'process']);
    expect(CANONICAL_WORK_ITEM_KINDS.every(isCanonicalWorkItemKind)).toBe(true);
    expect(isCanonicalWorkItemKind('deploy')).toBe(false);
    expect(() => assertCanonicalWorkItemKind('deploy' as never, 'bad')).toThrow('UNKNOWN_KIND');
    expect(listRuntimeAdmittedKinds(PRODUCTION_V2_ADMISSION)).toEqual(['task']);
    expect(PRODUCTION_V2_ADMISSION).toBe(PRODUCTION_V2_RUNNER_REGISTRY);
    expect(PRODUCTION_V2_RUNNER_REGISTRY.registryDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(PRODUCTION_V2_RUNNER_REGISTRY).toMatchObject({
      registryRevision: 'goal-v2-production-v2',
      runners: [{
        kind: 'task',
        runnerContract: 'mission-task-host-authority-v2',
        runnerRevision: 'task-mode-runner-v2',
      }],
    });
  });

  it('binds exactly the handlers declared by the immutable registry', () => {
    const task = async () => ({ ok: true });
    expect(bindMissionRunnerRegistry(PRODUCTION_V2_RUNNER_REGISTRY, { task }, () => true).descriptor)
      .toBe(PRODUCTION_V2_RUNNER_REGISTRY);
    expect(() => bindMissionRunnerRegistry(PRODUCTION_V2_RUNNER_REGISTRY, {}, () => true))
      .toThrow('MISSION_RUNNER_BINDING_MISMATCH');
    expect(() => bindMissionRunnerRegistry(PRODUCTION_V2_RUNNER_REGISTRY, {
      task,
      sprint: task,
    }, () => true)).toThrow('MISSION_RUNNER_BINDING_MISMATCH');
  });

  it('validates the complete frozen attempt authority before the bound handler runs', async () => {
    let calls = 0;
    const activeClaim = productionClaim();
    const bound = bindMissionRunnerRegistry(PRODUCTION_V2_RUNNER_REGISTRY, {
      task: async () => { calls++; return { ok: true }; },
    }, (claim) => claim === activeClaim);
    const item = productionItem();

    await expect(bound.dispatch(item, activeClaim)).resolves.toEqual({ ok: true });
    expect(calls).toBe(1);

    const invalidClaims: Array<[MissionDispatchClaim, string]> = [
      [{ ...productionClaim() }, 'AUTHORITY_MUTABLE'],
      [productionClaim({ workItemId: 'other-task' }), 'ITEM_IDENTITY_MISMATCH'],
      [productionClaim({ itemRevision: 2 }), 'ITEM_REVISION_MISMATCH'],
      [productionClaim({ claimedAt: 'not-a-timestamp' }), 'CLAIMED_AT_INVALID'],
      [productionClaim({ fenceTokenHash: '0'.repeat(64) }), 'FENCE_TOKEN_HASH_MISMATCH'],
      [productionClaim({ claimRegistryRevision: 'goal-v2-production-v1' }), 'CLAIM_REGISTRY_MISMATCH'],
    ];
    for (const [claim, code] of invalidClaims) {
      await expect(bound.dispatch(item, claim)).resolves.toMatchObject({
        ok: false,
        dispatchDisposition: 'parked',
        reason: `MISSION_DISPATCH_CLAIM_INVALID: ${code}`,
      });
    }
    const structurallyValidButUnissued = productionClaim();
    await expect(bound.dispatch(item, structurallyValidButUnissued)).resolves.toMatchObject({
      ok: false,
      dispatchDisposition: 'parked',
      reason: 'MISSION_DISPATCH_CLAIM_INVALID: PERSISTED_AUTHORITY_MISMATCH',
    });
    expect(calls).toBe(1);
  });

  it('admits a described task in production and rejects an empty description', () => {
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'task-ok', kind: 'task', spec: { description: 'Do the bounded change' } },
    ], PRODUCTION_V2_ADMISSION)).not.toThrow();
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'task-empty', kind: 'task', spec: { description: '  ' } },
    ], PRODUCTION_V2_ADMISSION)).toThrow('TASK_DESCRIPTION_REQUIRED');
  });

  it('requires a capability target and a live broker', () => {
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'cap-empty', kind: 'capability', spec: {} },
    ], allWired)).toThrow('CAPABILITY_TARGET_REQUIRED');
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'cap-unwired', kind: 'capability', spec: { capabilityTarget: { capability: 'db.query' } } },
    ], PRODUCTION_V2_ADMISSION)).toThrow('CAPABILITY_BROKER_UNWIRED');
  });

  it('requires a real process definition and runner', () => {
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'process-empty', kind: 'process', spec: {} },
    ], allWired)).toThrow('PROCESS_DEFINITION_REQUIRED');
    expect(() => assertWorkItemBatchAdmitted([{
      id: 'process-unwired',
      kind: 'process',
      spec: { processDefinition: { revision: 'r1', steps: [{ id: 'one' }] } },
    }], PRODUCTION_V2_ADMISSION)).toThrow('PROCESS_RUNNER_UNWIRED');
  });

  it('requires exactly one canonical exact-plan or unplanned source before runner admission', () => {
    const exactPlanRef = {
      schemaVersion: 1 as const,
      flowId: 'runflow-r7',
      revision: 7,
      planDigest: 'a'.repeat(64),
    };
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-ok', kind: 'sprint', spec: { exactPlanRef } },
    ], allWired)).not.toThrow();
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-directives', kind: 'sprint', spec: { directivesRef: 'DIRECTIVES.md' } },
    ], allWired)).not.toThrow();
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-intent', kind: 'sprint', spec: { intent: 'Execute the accepted goal' } },
    ], allWired)).not.toThrow();
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-missing', kind: 'sprint', spec: {} },
    ], allWired)).toThrow('SPRINT_EXECUTION_SOURCE_REQUIRED');
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-conflict', kind: 'sprint', spec: { exactPlanRef, directivesRef: 'DIRECTIVES.md' } },
    ], allWired)).toThrow('SPRINT_EXECUTION_SOURCE_CONFLICT');
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-invalid-unplanned', kind: 'sprint', spec: { directivesRef: ' DIRECTIVES.md ' } },
    ], allWired)).toThrow('SPRINT_UNPLANNED_SOURCE_INVALID');
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-mutated', kind: 'sprint', spec: { exactPlanRef: { ...exactPlanRef, planDigest: 'A'.repeat(64) } } },
    ], allWired)).toThrow('SPRINT_EXACT_PLAN_REF_INVALID');
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-extra-mutated', kind: 'sprint', spec: { exactPlanRef: { ...exactPlanRef, hiddenMutation: true } } },
    ], allWired)).toThrow('SPRINT_EXACT_PLAN_REF_INVALID');
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-unwired', kind: 'sprint', spec: { exactPlanRef } },
    ], PRODUCTION_V2_ADMISSION)).toThrow('SPRINT_RUNNER_UNWIRED');
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-unwired-directives', kind: 'sprint', spec: { directivesRef: 'DIRECTIVES.md' } },
    ], PRODUCTION_V2_ADMISSION)).toThrow('SPRINT_RUNNER_UNWIRED');
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-embedded', kind: 'sprint', spec: { directivesRef: 'DIRECTIVES.md', sprintSnapshot: {} } },
    ], allWired)).toThrow('SPRINT_EMBEDDED_SNAPSHOT_RETIRED');
  });
});
