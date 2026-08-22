import { describe, expect, it, onTestFinished } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  confirmationContentDigest,
  createAcceptanceConfirmationRequest,
  createConfirmationRequest,
  readAcceptanceConfirmation,
  readAcceptanceConfirmationTerminalTruth,
  settleConfirmation,
  type AcceptanceConfirmationRequest,
  type ConfirmationAcceptanceLineage,
  type ConfirmationIdentity,
} from '../../src/core/confirmation-store.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';

const requestedAt = '2026-08-21T08:00:00.000Z';
const digest = (value: string) => confirmationContentDigest(value);

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'confirmation-lineage-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function authority(attemptId = 'attempt-1', generation = 1) {
  const identity: ConfirmationIdentity = {
    attemptId,
    generation,
    sourceDigest: digest('source'),
    evidenceDigest: digest('evidence'),
    revisionDigest: digest('revision'),
  };
  const acceptanceLineage: ConfirmationAcceptanceLineage = {
    tenantId: 'tenant-a', projectId: 'project-a', sprintId: 'sprint-610', taskId: '610-006',
    attemptId, generation, evaluationDigest: digest('evaluation'),
    resultDigest: digest('result'),
    policyDigest: digest('policy'),
    sourceDigest: identity.sourceDigest,
  };
  return { identity, acceptanceLineage };
}

const request = {
  sprintId: 'sprint-610', taskId: '610-006', itemIds: ['owner'], kind: 'audit',
  verdict: 'UNDECIDABLE', adapter: 'human', statements: ['Owner confirms acceptance'],
  evidenceRequirements: ['result.json'], requestedAt, source: 'acceptance-matrix',
} as const;

describe('confirmation acceptance lineage and terminal truth', () => {
  it('pins tenant/attempt/generation/source parity and settlement integrity', () => {
    const root = sandbox();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const { identity, acceptanceLineage } = authority();
    const created = createAcceptanceConfirmationRequest(root, { ...request, identity, acceptanceLineage }, {
      lifecycle, tenantId: 'tenant-a', projectId: 'project-a', clock: () => new Date(requestedAt),
    });
    const pending = readAcceptanceConfirmation(
      root, created.id, acceptanceLineage, { lifecycle, clock: () => new Date(requestedAt) },
    );
    expect(pending?.state).toBe('pending');
    if (!pending || pending.state !== 'pending') throw new Error('expected pending confirmation');
    expect(pending.request.acceptanceLineage).toEqual(acceptanceLineage);

    const settled = settleConfirmation(root, created.id, {
      verdict: 'CONFIRMED', decidedBy: 'human', reason: 'approved', decidedAt: requestedAt,
    }, { lifecycle, clock: () => new Date('2026-08-21T08:01:00.000Z') });
    expect(settled.settlementDigest).toBe(confirmationContentDigest({
      request: Object.fromEntries(Object.entries(settled).filter(([key]) => !['outcome', 'settlementDigest'].includes(key))),
      outcome: settled.outcome,
    }));
    expect(readAcceptanceConfirmationTerminalTruth(root, created.id, acceptanceLineage, { lifecycle })).toEqual({
      id: created.id, acceptanceLineage, outcome: settled.outcome, settlementDigest: settled.settlementDigest,
    });
    expect(() => readAcceptanceConfirmationTerminalTruth(root, created.id, {
      ...acceptanceLineage, sourceDigest: digest('stale-source'),
    }, { lifecycle })).toThrow(/lineage/u);
  });

  it.each([
    ['tenant', (lineage: ConfirmationAcceptanceLineage) => ({ ...lineage, tenantId: 'tenant-b' })],
    ['project', (lineage: ConfirmationAcceptanceLineage) => ({ ...lineage, projectId: 'project-b' })],
    ['attempt', (lineage: ConfirmationAcceptanceLineage) => ({ ...lineage, attemptId: 'attempt-x' })],
    ['generation', (lineage: ConfirmationAcceptanceLineage) => ({ ...lineage, generation: 2 })],
    ['source', (lineage: ConfirmationAcceptanceLineage) => ({ ...lineage, sourceDigest: digest('other-source') })],
  ] as const)('rejects %s lineage mismatch before publication', (_label, mutate) => {
    const root = sandbox();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const { identity, acceptanceLineage } = authority();
    expect(() => createAcceptanceConfirmationRequest(root, {
      ...request, identity, acceptanceLineage: mutate(acceptanceLineage),
    }, {
      lifecycle, tenantId: 'tenant-a', projectId: 'project-a',
      clock: () => new Date(requestedAt),
    })).toThrow(/lineage/u);
  });

  it('rejects incomplete acceptance authority without publishing while retaining the generic writer', () => {
    const root = sandbox();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const { identity } = authority();
    expect(() => createAcceptanceConfirmationRequest(root, {
      ...request, identity,
    } as AcceptanceConfirmationRequest, {
      lifecycle, tenantId: 'tenant-a', projectId: 'project-a',
      clock: () => new Date(requestedAt),
    })).toThrow(/lineage/u);
    expect(existsSync(join(root, '.deckent', 'runtime', 'confirmations', 'pending'))).toBe(false);

    expect(createConfirmationRequest(root, { ...request, identity }, {
      lifecycle, identity, clock: () => new Date(requestedAt),
    }).created).toBe(true);
  });

  it.each([
    ['park-undecidable', 'UNDECIDABLE', true],
    ['deny-expire', 'FAILED', false],
  ] as const)('fresh-reads %s expiry as distinct canonical terminal truth', (timeoutDisposition, verdict, parked) => {
    const root = sandbox();
    const lifecycle = resolveApprovalLifecyclePolicy({
      enabled: true,
      profiles: { confirmation: { ttlMs: 10_000, slaMs: [1_000, 2_000, 3_000], timeoutDisposition } },
    });
    const { identity, acceptanceLineage } = authority();
    const created = createAcceptanceConfirmationRequest(root, { ...request, identity, acceptanceLineage }, {
      lifecycle, tenantId: 'tenant-a', projectId: 'project-a', clock: () => new Date(requestedAt),
    });
    const late = new Date('2026-08-21T08:00:10.001Z');
    const truth = readAcceptanceConfirmationTerminalTruth(
      root, created.id, acceptanceLineage, { lifecycle, clock: () => late },
    );
    expect(truth?.outcome).toMatchObject({ verdict, closureReason: 'expired', ...(parked ? { parked: true } : {}) });

    const path = join(root, '.deckent', 'runtime', 'confirmations', 'settled', `${created.id}.json`);
    const before = readFileSync(path, 'utf8');
    expect(() => settleConfirmation(root, created.id, {
      verdict: 'CONFIRMED', decidedBy: 'human', reason: 'late', decidedAt: late.toISOString(),
    }, { lifecycle, clock: () => late })).toThrow(/expired/u);
    expect(readFileSync(path, 'utf8')).toBe(before);

    const successorAuthority = authority('attempt-2', 2);
    const successor = createAcceptanceConfirmationRequest(root, {
      ...request, requestedAt: late.toISOString(), ...successorAuthority,
    }, {
      lifecycle, tenantId: 'tenant-a', projectId: 'project-a', clock: () => late,
    });
    expect(successor.id).not.toBe(created.id);
  });
});
