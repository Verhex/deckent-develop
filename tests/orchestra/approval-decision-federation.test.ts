// ─── Decision federation bridge (D2a) — mirror + settle-back pins ───────────
//
// Pins: (1) origin gating — only confirmation/checkpoint are decision-
// federated; (2) settle-back writes the broker decision into the legacy
// store exactly as its consumers expect (confirmation settles CONFIRMED/
// FAILED; checkpoint file flips status pending→approved/rejected in place);
// (3) settle-back is fail-soft-typed: missing/non-pending targets report a
// reason, never throw; (4) the mirror payload is broker-schema-valid and
// idempotent by id (validated via the contract validator — no broker
// runtime needed in this unit).

import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DECISION_FEDERATED_ORIGINS,
  isDecisionFederatedOrigin,
  settleFederatedDecision,
} from '../../src/orchestra/approval-decision-federation.js';
import { createConfirmationRequest, readConfirmation } from '../../src/core/confirmation-store.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { NervousIpcQueue } from '../../src/nervous/ipc-queue.js';

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'decision-federation-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

describe('decision federation bridge', () => {
  it('gates origins: lifecycle decision federation includes pairing; panic/bot stay out', () => {
    expect([...DECISION_FEDERATED_ORIGINS])
      .toEqual(['confirmation', 'checkpoint', 'nervous', 'autonomous-trigger', 'gateway-pairing']);
    for (const origin of ['confirmation', 'checkpoint', 'nervous', 'autonomous-trigger', 'gateway-pairing'] as const) {
      expect(isDecisionFederatedOrigin(origin)).toBe(true);
    }
    for (const origin of ['panic-guard', 'bot-action'] as const) {
      expect(isDecisionFederatedOrigin(origin)).toBe(false);
    }
  });

  it('settles a nervous decision through the SAME IPC queue the executor polls', async () => {
    const root = fixtureRoot();
    const out = await settleFederatedDecision(root, 'nervous', 'ntf-abc-123', 'allow', 'unified surface');
    expect(out).toEqual({ state: 'settled', origin: 'nervous' });
    const pendingDir = new NervousIpcQueue(root).getPendingDir();
    const files = readdirSync(pendingDir);
    expect(files.length).toBe(1);
    const record = JSON.parse(readFileSync(join(pendingDir, files[0]!), 'utf-8')) as
      { notificationId: string; decision: string; reason: string };
    expect(record).toMatchObject({
      notificationId: 'ntf-abc-123', decision: 'accepted', reason: 'unified surface',
    });
  });

  it('settles an autonomous trigger through the gate authority (forged id fail-closed)', async () => {
    const root = fixtureRoot();
    const requestedAt = new Date().toISOString();
    const dir = join(root, '.deckent', 'autonomous');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pending.json'), JSON.stringify([
      { triggerId: 'trg-d2b1', action: 'run-audit', requestedBy: 'detector', enqueuedAt: requestedAt },
    ]), 'utf-8');
    const out = await settleFederatedDecision(root, 'autonomous-trigger', 'trg-d2b1', 'allow', 'unified surface');
    expect(out).toEqual({ state: 'settled', origin: 'autonomous-trigger' });
    const decisions = JSON.parse(readFileSync(join(dir, 'decisions.json'), 'utf-8')) as unknown[];
    expect(JSON.stringify(decisions)).toContain('trg-d2b1');
    // Forged/stale id: the gate refuses fail-closed with its typed code.
    const forged = await settleFederatedDecision(root, 'autonomous-trigger', 'trg-forged', 'allow', 'x');
    expect(forged.state).toBe('failed');
    if (forged.state === 'failed') expect(forged.reason).toBe('APR_UNKNOWN_REQUEST');
  });

  it('settles a confirmation back exactly as its consumers expect', async () => {
    const root = fixtureRoot();
    const requestedAt = new Date().toISOString();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const { id } = createConfirmationRequest(root, {
      sprintId: 's-1', taskId: 't-1', itemIds: [], kind: 'security',
      verdict: 'QUALIFIED', adapter: 'human', statements: ['sign-off?'],
      evidenceRequirements: [], requestedAt,
      source: 'acceptance-matrix',
    }, { lifecycle, clock: () => new Date(requestedAt) });
    const out = await settleFederatedDecision(root, 'confirmation', id, 'allow', 'unified surface');
    expect(out).toEqual({ state: 'settled', origin: 'confirmation' });
    const settled = readConfirmation(root, id);
    expect(settled?.state).toBe('settled');
    if (settled?.state === 'settled') {
      expect(settled.request.outcome).toMatchObject({
        verdict: 'CONFIRMED', decidedBy: 'human', reason: 'unified surface',
      });
    }
    // Single-shot: a second settle reports non-pending, never throws.
    expect(await settleFederatedDecision(root, 'confirmation', id, 'deny', 'again'))
      .toEqual({ state: 'failed', reason: 'confirmation-not-pending' });
  });

  it('flips a pending checkpoint file in place; deny rejects; guards are typed', async () => {
    const root = fixtureRoot();
    const dir = join(root, '.deckent', 'checkpoints');
    mkdirSync(dir, { recursive: true });
    const legacyId = 'checkpoint-sprint-9-plan';
    writeFileSync(join(dir, `${legacyId}.json`),
      JSON.stringify({ status: 'pending', createdAt: '2026-08-20T08:00:00.000Z' }, null, 2), 'utf-8');

    expect(await settleFederatedDecision(root, 'checkpoint', legacyId, 'allow', 'r'))
      .toEqual({ state: 'settled', origin: 'checkpoint' });
    const record = JSON.parse(readFileSync(join(dir, `${legacyId}.json`), 'utf-8')) as
      { status: string; createdAt: string };
    expect(record.status).toBe('approved');
    expect(record.createdAt).toBe('2026-08-20T08:00:00.000Z');

    expect(await settleFederatedDecision(root, 'checkpoint', legacyId, 'deny', 'r'))
      .toEqual({ state: 'failed', reason: 'checkpoint-not-pending' });
    expect(await settleFederatedDecision(root, 'checkpoint', 'checkpoint-missing', 'allow', 'r'))
      .toEqual({ state: 'failed', reason: 'checkpoint-file-missing' });
  });
});
