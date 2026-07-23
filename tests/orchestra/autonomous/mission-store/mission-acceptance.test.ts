import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { createGoalMission } from '../../../../src/orchestra/autonomous/mission-store/goal-mission.js';
import {
  buildMissionAcceptanceDecision,
  createGoalAcceptanceContract,
  readGoalAcceptanceContract,
} from '../../../../src/orchestra/autonomous/mission-store/mission-acceptance.js';
import { settleMissionItem } from '../../../helpers/mission-store.js';

const roots: string[] = [];
function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'mission-acceptance-'));
  roots.push(value);
  return value;
}
function open(projectRoot: string): SqliteMissionStore {
  const store = new SqliteMissionStore(projectRoot);
  store.migrate();
  return store;
}
afterEach(() => {
  for (const projectRoot of roots.splice(0)) rmSync(projectRoot, { recursive: true, force: true });
});

describe('goal acceptance contract', () => {
  it('binds the exact criterion text, author provenance, and timestamp into the digest', () => {
    const opts = {
      authoredAt: '2026-07-22T00:00:00.000Z',
      authoredBy: { surface: 'cli' as const, actorId: null },
    };
    const first = createGoalAcceptanceContract('tests pass.', opts);
    const replay = createGoalAcceptanceContract('tests pass.', opts);
    const punctuationChange = createGoalAcceptanceContract('tests pass', opts);

    expect(replay).toEqual(first);
    expect(punctuationChange.digest).not.toBe(first.digest);
    expect(first.criteria).toEqual([{
      id: expect.stringMatching(/^criterion-[a-f0-9]{24}$/),
      text: 'tests pass.',
      critical: true,
    }]);
  });

  it('fails loud when a persisted contract is present but digest-corrupt', () => {
    expect(() => readGoalAcceptanceContract({
      spec: {
        acceptanceContract: {
          schemaVersion: 1,
          criteria: [{ id: 'criterion-x', text: 'x', critical: true }],
          authoredAt: '2026-07-22T00:00:00.000Z',
          authoredBy: { surface: 'cli', actorId: null },
          digest: '0'.repeat(64),
        },
      },
    })).toThrow(/GOAL_ACCEPTANCE_CONTRACT_INVALID.*digest mismatch/);
  });
});

describe('SqliteMissionStore acceptance decision fence', () => {
  it('is exact-replay idempotent, rejects a changed same-round decision, and survives restart', () => {
    const projectRoot = root();
    let store = open(projectRoot);
    createGoalMission(store, {
      id: 'goal-fence',
      title: 'Fence',
      goal: 'ship',
      acceptance: 'tests pass',
      acceptanceAuthoredAt: '2026-07-22T00:00:00.000Z',
      acceptanceAuthoredBy: { surface: 'cli', actorId: null },
    });
    store.enqueueItem({ id: 'goal-fence-test', missionId: 'goal-fence', kind: 'task' });
    settleMissionItem(store, 'goal-fence-test', 'done', { ok: true, reason: 'all tests passed' });
    const mission = store.getMission('goal-fence')!;
    const contract = readGoalAcceptanceContract(mission)!;
    const items = store.listItems('goal-fence');
    const evaluation = {
      outcome: 'accepted' as const,
      criteria: [{
        criterionId: contract.criteria[0]!.id,
        verdict: 'met' as const,
        evidenceRefs: ['work-item:goal-fence-test'],
        rationale: 'durable task result proves the criterion',
      }],
      evaluator: { role: 'brain' as const, instanceId: 'evaluator-1' },
      invocationReceiptRef: {
        schemaVersion: 1 as const,
        invocationId: 'inv-accept-fence',
        tenantId: 'local',
        projectId: 'project-test',
      },
      decidedAt: '2026-07-22T00:05:00.000Z',
    };
    const decision = buildMissionAcceptanceDecision('goal-fence', contract, 1, evaluation, items);

    const first = store.recordAcceptanceDecision(decision);
    const replay = store.recordAcceptanceDecision(decision);
    expect(replay).toEqual(first);
    expect(store.listAcceptanceDecisions('goal-fence')).toHaveLength(1);

    const conflicting = buildMissionAcceptanceDecision('goal-fence', contract, 1, {
      ...evaluation,
      criteria: [{ ...evaluation.criteria[0]!, rationale: 'changed rationale' }],
    }, items);
    expect(() => store.recordAcceptanceDecision(conflicting)).toThrow(/MISSION_ACCEPTANCE_CONFLICT/);

    store.close();
    store = open(projectRoot);
    expect(store.listAcceptanceDecisions('goal-fence')).toEqual([first]);
    expect(store.getMission('goal-fence')!.status).toBe('completed');
    expect(store.getMission('goal-fence')!.lastResult?.['acceptanceDecision']).toEqual(decision);
    store.close();
  });

  it('rolls back the decision insert when mission settlement fails in the same transaction', () => {
    const projectRoot = root();
    const store = open(projectRoot);
    createGoalMission(store, {
      id: 'goal-atomic',
      title: 'Atomic',
      goal: 'ship',
      acceptance: 'tests pass',
      acceptanceAuthoredAt: '2026-07-22T00:00:00.000Z',
    });
    store.enqueueItem({ id: 'goal-atomic-test', missionId: 'goal-atomic', kind: 'task' });
    settleMissionItem(store, 'goal-atomic-test', 'done', { ok: true, reason: 'passed' });
    const contract = readGoalAcceptanceContract(store.getMission('goal-atomic')!)!;
    const decision = buildMissionAcceptanceDecision('goal-atomic', contract, 1, {
      outcome: 'accepted',
      criteria: [{
        criterionId: contract.criteria[0]!.id,
        verdict: 'met',
        evidenceRefs: ['work-item:goal-atomic-test'],
        rationale: 'passed result',
      }],
      evaluator: { role: 'brain', instanceId: 'atomic-evaluator' },
      invocationReceiptRef: {
        schemaVersion: 1,
        invocationId: 'inv-atomic',
        tenantId: 'local',
        projectId: 'project-test',
      },
      decidedAt: '2026-07-22T00:05:00.000Z',
    }, store.listItems('goal-atomic'));
    store.__rawExec(`CREATE TRIGGER reject_goal_atomic BEFORE UPDATE OF status ON missions
      WHEN NEW.id='goal-atomic' BEGIN SELECT RAISE(ABORT, 'settlement rejected'); END`);

    expect(() => store.recordAcceptanceDecision(decision)).toThrow(/MISSION_ACCEPTANCE_CONFLICT/);
    expect(store.__rawGet("SELECT COUNT(*) AS count FROM mission_acceptance_decisions WHERE mission_id='goal-atomic'").count).toBe(0);
    expect(store.getMission('goal-atomic')!.status).toBe('pending');
    store.close();
  });
});
