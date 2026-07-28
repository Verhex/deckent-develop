import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  admitStartAttempt,
  listStartAttempts,
  loadPlannedSprint,
  loadRunHandle,
  prepareStartAttempt,
  recordStartAttemptProcessSpawned,
  RunFlowStoreError,
  settleStartAttempt,
  savePlannedSprint,
} from '../../src/core/run-flow-store.js';

describe('run-flow planned sprint exact lookup', () => {
  it('selects v2 records by exact revision+digest+version instead of latest', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-plan-store-'));
    savePlannedSprint(root, 'flow-1', {
      revision: 1,
      planDigest: 'a'.repeat(64),
      planDigestVersion: 2,
      sprint: { id: 'sprint-one' },
    });
    savePlannedSprint(root, 'flow-1', {
      revision: 2,
      planDigest: 'b'.repeat(64),
      planDigestVersion: 2,
      sprint: { id: 'sprint-two' },
    });

    expect(loadPlannedSprint(root, 'flow-1', {
      revision: 1,
      planDigest: 'a'.repeat(64),
      planDigestVersion: 2,
    })?.sprint).toEqual({ id: 'sprint-one' });
    expect(loadPlannedSprint(root, 'flow-1', {
      revision: 1,
      planDigest: 'c'.repeat(64),
      planDigestVersion: 2,
    })).toBeUndefined();
  });

  it('keeps version-absent records on the explicit legacy-v1 revision path', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-plan-store-legacy-'));
    savePlannedSprint(root, 'flow-legacy', { revision: 1, sprint: { id: 'legacy' } });
    expect(loadPlannedSprint(root, 'flow-legacy', {
      revision: 1,
      planDigest: 'legacy-opaque-digest',
    })?.sprint).toEqual({ id: 'legacy' });
    expect(loadPlannedSprint(root, 'flow-legacy', {
      revision: 1,
      planDigest: 'legacy-opaque-digest',
      planDigestVersion: 2,
    })).toBeUndefined();
  });
});

const verifiedProcess = {
  pid: 4321,
  startToken: 's100',
  evidence: 'verified' as const,
};

function prepareInput(flowId: string, idempotencyKey: string) {
  return {
    flowId,
    revision: 1,
    planDigest: `digest-${flowId}`,
    attemptId: `attempt-${flowId}`,
    preparedAt: '2026-07-28T10:00:00.000Z',
    lineage: {
      tenantId: 'tenant-1',
      projectId: 'project-1',
      actor: { id: 'actor-1' },
      origin: 'api' as const,
      correlationId: `correlation-${flowId}`,
      idempotencyKey,
      parentPlanLineageHash: 'a'.repeat(64),
      parentCorrelationId: `plan-${flowId}`,
      authorizationAuthority: 'approved-actor:actor-1',
    },
    owner: {
      process: verifiedProcess,
      ownerNonce: `nonce-${flowId}`,
      leaseUntil: '2026-07-28T10:01:00.000Z',
    },
  };
}

describe('run-flow canonical start-attempt journal', () => {
  it('enforces idempotency/CAS and publishes a handle only with ADMITTED', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-start-attempt-'));
    const prepared = prepareStartAttempt(root, prepareInput('flow-a', 'idem-a'));
    expect(prepared.applied).toBe(true);
    expect(loadRunHandle(root, 'flow-a')).toBeUndefined();

    const idempotent = prepareStartAttempt(root, {
      ...prepareInput('flow-a', 'idem-a'),
      attemptId: 'another-random-attempt-id',
    });
    expect(idempotent.applied).toBe(false);
    expect(idempotent.attempt.attemptId).toBe('attempt-flow-a');

    const capability = {
      flowId: 'flow-a',
      revision: 1,
      planDigest: 'digest-flow-a',
      generation: 1,
      attemptId: 'attempt-flow-a',
      ownerNonce: 'nonce-flow-a',
    };
    recordStartAttemptProcessSpawned(root, {
      ...capability,
      process: verifiedProcess,
      spawnedAt: '2026-07-28T10:00:10.000Z',
    });
    expect(loadRunHandle(root, 'flow-a')).toBeUndefined();

    const admitted = admitStartAttempt(root, {
      ...capability,
      process: verifiedProcess,
      handle: { flowId: 'flow-a', jobId: 'job-a', logRef: 'log-a' },
      admittedAt: '2026-07-28T10:00:20.000Z',
    });
    expect(admitted.attempt.state).toBe('ADMITTED');
    expect(loadRunHandle(root, 'flow-a')).toMatchObject({
      pid: 4321,
      startToken: 's100',
      handle: { jobId: 'job-a' },
    });

    expect(() => recordStartAttemptProcessSpawned(root, {
      ...capability,
      ownerNonce: 'forged',
      process: verifiedProcess,
      spawnedAt: '2026-07-28T10:00:30.000Z',
    })).toThrow(RunFlowStoreError);
  });

  it('requires explicit terminal predecessor CAS and a fresh idempotency key for a new generation', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-start-generation-'));
    const first = prepareStartAttempt(root, prepareInput('flow-b', 'idem-b1')).attempt;
    settleStartAttempt(root, {
      flowId: first.flowId,
      revision: first.revision,
      planDigest: first.planDigest,
      generation: first.generation,
      attemptId: first.attemptId,
      ownerNonce: first.owner.ownerNonce,
      settlement: {
        state: 'BLOCKED',
        code: 'GATE_HOLD',
        settledAt: '2026-07-28T10:00:30.000Z',
      },
      authority: { kind: 'owner-capability' },
    });

    const second = prepareStartAttempt(root, {
      ...prepareInput('flow-b', 'idem-b2'),
      attemptId: 'attempt-flow-b-retry',
      expectedPrevious: {
        generation: first.generation,
        attemptId: first.attemptId,
      },
    });
    expect(second.attempt.generation).toBe(2);

    const replayOldSpend = prepareStartAttempt(root, {
      ...prepareInput('flow-b', 'idem-b1'),
      attemptId: 'must-not-create-generation-three',
    });
    expect(replayOldSpend.applied).toBe(false);
    expect(replayOldSpend.attempt.generation).toBe(1);
  });

  it('paginates latest attempts with a deterministic bounded cursor', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-start-page-'));
    for (const flowId of ['flow-a', 'flow-b', 'flow-c']) {
      prepareStartAttempt(root, prepareInput(flowId, `idem-${flowId}`));
    }
    const first = listStartAttempts(root, { limit: 2 });
    expect(first.attempts.map((attempt) => attempt.flowId)).toEqual(['flow-a', 'flow-b']);
    expect(first.nextCursor).toBe('flow-b');
    const second = listStartAttempts(root, { limit: 2, afterFlowId: first.nextCursor });
    expect(second.attempts.map((attempt) => attempt.flowId)).toEqual(['flow-c']);
    expect(() => listStartAttempts(root, { limit: 1_001 })).toThrow(RunFlowStoreError);
  });
});
