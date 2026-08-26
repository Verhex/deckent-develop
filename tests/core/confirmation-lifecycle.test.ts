import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  confirmationContentDigest,
  createConfirmationRequest,
  listConfirmationQuarantine,
  listPendingConfirmations,
  readConfirmation,
  settleConfirmation,
  sweepExpiredConfirmations,
  type ConfirmationIdentity,
} from '../../src/core/confirmation-store.js';
import {
  approvalLifecycleProfileDigest,
  resolveApprovalLifecyclePolicy,
} from '../../src/core/approval-lifecycle-policy.js';

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'confirmation-lifecycle-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function identity(attemptId = 'attempt-1', generation = 1): ConfirmationIdentity {
  return {
    attemptId,
    generation,
    sourceDigest: confirmationContentDigest('source'),
    evidenceDigest: confirmationContentDigest('evidence'),
    revisionDigest: confirmationContentDigest('revision'),
  };
}

const base = {
  sprintId: 'sprint-609',
  taskId: '609-010',
  itemIds: ['security-review'],
  kind: 'security',
  verdict: 'UNDECIDABLE',
  adapter: 'human',
  statements: ['Owner reviewed the security boundary'],
  evidenceRequirements: ['security-report.json'],
  requestedAt: '2026-08-21T08:00:00.000Z',
  source: 'acceptance-matrix',
} as const;

describe('confirmation lifecycle store', () => {
  it('holds creation fail-closed when lifecycle policy is absent or disabled', () => {
    const root = sandbox();
    let error: unknown;
    try {
      createConfirmationRequest(root, base);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 'E_CONFIRMATION_LIFECYCLE_DISABLED' });
    expect(listPendingConfirmations(root, {
      clock: () => new Date(base.requestedAt),
    })).toEqual([]);
  });

  it('writes canonical v2 with embedded profile, digest, expiry and security risk floor', () => {
    const root = sandbox();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const created = createConfirmationRequest(root, { ...base, identity: identity() }, {
      lifecycle,
      identity: identity(),
      clock: () => new Date(base.requestedAt),
    });
    const found = readConfirmation(root, created.id, {
      lifecycle,
      clock: () => new Date(base.requestedAt),
    });
    expect(found?.state).toBe('pending');
    if (!found || found.state !== 'pending') throw new Error('expected pending confirmation');
    expect(found.request.expiresAt).toBe('2026-08-21T16:00:00.000Z');
    expect(found.request.approval).toMatchObject({
      version: '2.0', origin: 'confirmation', riskTier: 'critical', blocking: 'run',
      lifecycleGeneration: 'attempt-1:1',
    });
    expect(found.request.approval.lifecycleProfile).toEqual(lifecycle.profiles.confirmation);
    expect(found.request.approval.policySnapshotDigest).toBe(
      approvalLifecycleProfileDigest('confirmation', lifecycle.profiles.confirmation),
    );
  });

  it('keeps identical identity idempotent and requires an explicit successor after expiry', () => {
    const root = sandbox();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    let at = new Date(base.requestedAt);
    const first = createConfirmationRequest(root, { ...base, identity: identity() }, {
      lifecycle, identity: identity(), clock: () => at,
    });
    expect(createConfirmationRequest(root, { ...base, identity: identity() }, {
      lifecycle, identity: identity(), clock: () => at,
    })).toEqual({ id: first.id, created: false });
    let collision: unknown;
    try {
      createConfirmationRequest(root, {
        ...base, statements: ['different bytes under a reused identity'], identity: identity(),
      }, { lifecycle, identity: identity(), clock: () => at });
    } catch (error) {
      collision = error;
    }
    expect(collision).toMatchObject({ code: 'E_CONFIRMATION_ID_COLLISION' });

    at = new Date('2026-08-21T16:00:00.000Z');
    expect(sweepExpiredConfirmations(root, { lifecycle, clock: () => at })).toEqual([first.id]);
    const expired = readConfirmation(root, first.id, { lifecycle, clock: () => at });
    expect(expired?.state).toBe('settled');
    if (!expired || expired.state !== 'settled') throw new Error('expected settled confirmation');
    expect(expired.request.outcome).toMatchObject({
      verdict: 'UNDECIDABLE', decidedBy: 'system:expiry', closureReason: 'expired', parked: true,
    });

    const successorIdentity = identity('attempt-2', 2);
    const successor = createConfirmationRequest(root, {
      ...base,
      requestedAt: at.toISOString(),
      identity: successorIdentity,
    }, { lifecycle, identity: successorIdentity, clock: () => at });
    expect(successor.id).not.toBe(first.id);
    expect(readConfirmation(root, first.id, { lifecycle, clock: () => at })?.state).toBe('settled');
    expect(listPendingConfirmations(root, { lifecycle, clock: () => at }).map(item => item.id))
      .toEqual([successor.id]);
  });

  it('parks timeout as UNDECIDABLE and rejects a late decision', () => {
    const root = sandbox();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    let at = new Date(base.requestedAt);
    const created = createConfirmationRequest(root, { ...base, identity: identity() }, {
      lifecycle, identity: identity(), clock: () => at,
    });
    at = new Date('2026-08-21T16:00:00.001Z');
    let lateError: unknown;
    try {
      settleConfirmation(root, created.id, {
        verdict: 'CONFIRMED', decidedBy: 'human', reason: 'late', decidedAt: at.toISOString(),
      }, { lifecycle, clock: () => at });
    } catch (error) {
      lateError = error;
    }
    expect(lateError).toMatchObject({ code: 'E_CONFIRMATION_EXPIRED' });
    const found = readConfirmation(root, created.id, { lifecycle, clock: () => at });
    expect(found?.state).toBe('settled');
    if (!found || found.state !== 'settled') throw new Error('expected settled confirmation');
    expect(found.request.outcome.verdict).toBe('UNDECIDABLE');
  });

  it('quarantines corrupt pending bytes with a typed visible receipt', () => {
    const root = sandbox();
    const pending = join(root, '.deckent', 'runtime', 'confirmations', 'pending');
    mkdirSync(pending, { recursive: true });
    writeFileSync(join(pending, 'broken.json'), '{not-json', 'utf8');
    expect(listPendingConfirmations(root, { clock: () => new Date(base.requestedAt) })).toEqual([]);
    expect(listConfirmationQuarantine(root)).toEqual([
      expect.objectContaining({ file: 'broken.json', reasonCode: 'unreadable-json' }),
    ]);
  });

  it('reads legacy 16-hex records side-effect-free and pins their exact source-byte digest', () => {
    const root = sandbox();
    const pending = join(root, '.deckent', 'runtime', 'confirmations', 'pending');
    mkdirSync(pending, { recursive: true });
    const id = 'cnf-0123456789abcdef';
    const path = join(pending, `${id}.json`);
    const bytes = `${JSON.stringify({
      id,
      sprintId: 'legacy-sprint',
      taskId: 'legacy-task',
      itemIds: [],
      kind: 'audit',
      verdict: 'QUALIFIED',
      adapter: 'human',
      statements: ['legacy review'],
      evidenceRequirements: [],
      requestedAt: '2026-08-21T08:00:00.000Z',
      source: 'acceptance-matrix',
    }, null, 2)}\n`;
    writeFileSync(path, bytes, 'utf8');
    const found = readConfirmation(root, id, {
      clock: () => new Date('2026-08-21T08:00:00.000Z'),
    });
    expect(found?.state).toBe('pending');
    if (!found || found.state !== 'pending') throw new Error('expected pending legacy confirmation');
    expect(found.request.approval.source).toMatchObject({
      contractVersion: '1.0',
      requestDigest: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(readFileSync(path, 'utf8')).toBe(bytes);
  });
});
