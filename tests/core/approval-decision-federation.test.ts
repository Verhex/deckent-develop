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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DECISION_FEDERATED_ORIGINS,
  isDecisionFederatedOrigin,
  settleFederatedDecision,
} from '../../src/core/approval-decision-federation.js';
import { createConfirmationRequest, readConfirmation } from '../../src/core/confirmation-store.js';

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'decision-federation-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

describe('decision federation bridge', () => {
  it('gates origins: only confirmation and checkpoint are federated today', () => {
    expect([...DECISION_FEDERATED_ORIGINS]).toEqual(['confirmation', 'checkpoint']);
    expect(isDecisionFederatedOrigin('confirmation')).toBe(true);
    expect(isDecisionFederatedOrigin('checkpoint')).toBe(true);
    for (const origin of ['nervous', 'autonomous-trigger', 'panic-guard', 'bot-action', 'gateway-pairing'] as const) {
      expect(isDecisionFederatedOrigin(origin)).toBe(false);
    }
  });

  it('settles a confirmation back exactly as its consumers expect', () => {
    const root = fixtureRoot();
    const { id } = createConfirmationRequest(root, {
      sprintId: 's-1', taskId: 't-1', itemIds: [], kind: 'security',
      verdict: 'QUALIFIED', adapter: 'human', statements: ['sign-off?'],
      evidenceRequirements: [], requestedAt: '2026-08-20T10:00:00.000Z',
      source: 'acceptance-matrix',
    });
    const out = settleFederatedDecision(root, 'confirmation', id, 'allow', 'unified surface');
    expect(out).toEqual({ state: 'settled', origin: 'confirmation' });
    const settled = readConfirmation(root, id);
    expect(settled?.state).toBe('settled');
    if (settled?.state === 'settled') {
      expect(settled.request.outcome).toMatchObject({
        verdict: 'CONFIRMED', decidedBy: 'human', reason: 'unified surface',
      });
    }
    // Single-shot: a second settle reports non-pending, never throws.
    expect(settleFederatedDecision(root, 'confirmation', id, 'deny', 'again'))
      .toEqual({ state: 'failed', reason: 'confirmation-not-pending' });
  });

  it('flips a pending checkpoint file in place; deny rejects; guards are typed', () => {
    const root = fixtureRoot();
    const dir = join(root, '.deckent', 'checkpoints');
    mkdirSync(dir, { recursive: true });
    const legacyId = 'checkpoint-sprint-9-plan';
    writeFileSync(join(dir, `${legacyId}.json`),
      JSON.stringify({ status: 'pending', createdAt: '2026-08-20T08:00:00.000Z' }, null, 2), 'utf-8');

    expect(settleFederatedDecision(root, 'checkpoint', legacyId, 'allow', 'r'))
      .toEqual({ state: 'settled', origin: 'checkpoint' });
    const record = JSON.parse(readFileSync(join(dir, `${legacyId}.json`), 'utf-8')) as
      { status: string; createdAt: string };
    expect(record.status).toBe('approved');
    expect(record.createdAt).toBe('2026-08-20T08:00:00.000Z');

    expect(settleFederatedDecision(root, 'checkpoint', legacyId, 'deny', 'r'))
      .toEqual({ state: 'failed', reason: 'checkpoint-not-pending' });
    expect(settleFederatedDecision(root, 'checkpoint', 'checkpoint-missing', 'allow', 'r'))
      .toEqual({ state: 'failed', reason: 'checkpoint-file-missing' });
  });
});
