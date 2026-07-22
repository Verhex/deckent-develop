import { describe, expect, it } from 'vitest';

import {
  CANONICAL_WORK_ITEM_KINDS,
  PRODUCTION_V2_ADMISSION,
  PRODUCTION_V2_RUNNER_REGISTRY,
  assertCanonicalWorkItemKind,
  assertWorkItemBatchAdmitted,
  bindMissionRunnerRegistry,
  computeSprintSnapshotDigest,
  createMissionRunnerRegistry,
  isCanonicalWorkItemKind,
  listRuntimeAdmittedKinds,
  type MissionRuntimeAdmission,
} from '../../../../src/orchestra/autonomous/mission-store/mission-kind-admission.js';

const allWired: MissionRuntimeAdmission = createMissionRunnerRegistry({
  registryRevision: 'test-all-runners-v1',
  runners: CANONICAL_WORK_ITEM_KINDS.map((kind) => ({
    kind,
    runnerContract: `${kind}-contract-v1`,
    runnerRevision: `${kind}-runner-v1`,
  })),
});

describe('mission kind admission registry', () => {
  it('contains exactly the four canonical work-item kinds', () => {
    expect(CANONICAL_WORK_ITEM_KINDS).toEqual(['task', 'sprint', 'capability', 'process']);
    expect(CANONICAL_WORK_ITEM_KINDS.every(isCanonicalWorkItemKind)).toBe(true);
    expect(isCanonicalWorkItemKind('deploy')).toBe(false);
    expect(() => assertCanonicalWorkItemKind('deploy' as never, 'bad')).toThrow('UNKNOWN_KIND');
    expect(listRuntimeAdmittedKinds(PRODUCTION_V2_ADMISSION)).toEqual(['task']);
    expect(PRODUCTION_V2_ADMISSION).toBe(PRODUCTION_V2_RUNNER_REGISTRY);
    expect(PRODUCTION_V2_RUNNER_REGISTRY.registryDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds exactly the handlers declared by the immutable registry', () => {
    const task = async () => ({ ok: true });
    expect(bindMissionRunnerRegistry(PRODUCTION_V2_RUNNER_REGISTRY, { task }).descriptor)
      .toBe(PRODUCTION_V2_RUNNER_REGISTRY);
    expect(() => bindMissionRunnerRegistry(PRODUCTION_V2_RUNNER_REGISTRY, {}))
      .toThrow('MISSION_RUNNER_BINDING_MISMATCH');
    expect(() => bindMissionRunnerRegistry(PRODUCTION_V2_RUNNER_REGISTRY, {
      task,
      sprint: task,
    })).toThrow('MISSION_RUNNER_BINDING_MISMATCH');
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

  it('validates the immutable sprint snapshot digest before runner admission', () => {
    const payload = {
      version: 1 as const,
      revision: 'runflow-r7',
      approvalEvidenceRef: 'audit://approval/42',
      directives: '# Approved directives',
      executionPlan: { tasks: [{ id: 'one' }], concurrency: 1 },
    };
    const snapshot = { ...payload, digest: computeSprintSnapshotDigest(payload) };
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-ok', kind: 'sprint', spec: { sprintSnapshot: snapshot } },
    ], allWired)).not.toThrow();
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-mutated', kind: 'sprint', spec: { sprintSnapshot: { ...snapshot, directives: '# Changed' } } },
    ], allWired)).toThrow('SPRINT_SNAPSHOT_DIGEST_MISMATCH');
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-extra-mutated', kind: 'sprint', spec: { sprintSnapshot: { ...snapshot, hiddenMutation: true } } },
    ], allWired)).toThrow('SPRINT_SNAPSHOT_DIGEST_MISMATCH');
    expect(() => assertWorkItemBatchAdmitted([
      { id: 'sprint-unwired', kind: 'sprint', spec: { sprintSnapshot: snapshot } },
    ], PRODUCTION_V2_ADMISSION)).toThrow('SPRINT_SNAPSHOT_RUNNER_UNWIRED');
  });
});
