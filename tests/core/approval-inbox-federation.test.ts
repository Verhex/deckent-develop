// ─── Federated approval inbox (D1) — read-only federation pins ──────────────
//
// Pins: (1) every scattered store projects into origin-tagged rows with the
// surface's decide-hint key; (2) missing stores yield nothing, corrupt stores
// yield a typed unreadable row (fail-soft, never a throw); (3) non-pending
// checkpoint records are excluded; (4) rows sort by requestedAt; (5) the
// module never writes (read-only contract — store contents are byte-identical
// after a listing).

import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listFederatedPendingItems } from '../../src/core/approval-inbox-federation.js';
import { createConfirmationRequest } from '../../src/core/confirmation-store.js';

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'federated-inbox-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

describe('listFederatedPendingItems', () => {
  it('federates every store into origin-tagged rows, sorted by requestedAt', () => {
    const root = fixtureRoot();
    createConfirmationRequest(root, {
      sprintId: 's-1', taskId: 't-1', itemIds: [], kind: 'security',
      verdict: 'QUALIFIED', adapter: 'human', statements: ['sign-off?'],
      evidenceRequirements: [], requestedAt: '2026-08-20T10:00:00.000Z',
      source: 'acceptance-matrix',
    });
    mkdirSync(join(root, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'autonomous', 'pending.json'), JSON.stringify([
      { triggerId: 'trg-1', action: 'run-audit', requestedBy: 'detector', enqueuedAt: '2026-08-20T09:00:00.000Z' },
    ]), 'utf-8');
    mkdirSync(join(root, '.deckent', 'nervous'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'nervous', 'nervous-pending.json'), JSON.stringify([
      { id: 'ntf-1', shortCode: 'AB12C', title: 'stale lock detected', createdAt: '2026-08-20T11:00:00.000Z' },
    ]), 'utf-8');
    mkdirSync(join(root, '.deckent', 'panic-ipc', 'pending'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'panic-ipc', 'pending', '900-001-123.json'), '{}', 'utf-8');
    mkdirSync(join(root, '.deckent', 'checkpoints'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'checkpoints', 'checkpoint-sprint-9-plan.json'),
      JSON.stringify({ status: 'pending', createdAt: '2026-08-20T08:00:00.000Z' }), 'utf-8');
    writeFileSync(join(root, '.deckent', 'checkpoints', 'checkpoint-sprint-8-plan.json'),
      JSON.stringify({ status: 'approved', createdAt: '2026-08-20T07:00:00.000Z' }), 'utf-8');
    mkdirSync(join(root, '.deckent', 'bot-actions'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'bot-actions', 'act-1.json'), JSON.stringify({
      id: 'act-1', tool: 'deckent_kill', parkedAt: '2026-08-20T12:00:00.000Z',
      expiresAt: '2026-08-20T13:00:00.000Z',
    }), 'utf-8');
    const gatewayHomeDir = join(root, 'gateway-home');
    mkdirSync(gatewayHomeDir, { recursive: true });
    writeFileSync(join(gatewayHomeDir, 'pairings.json'), JSON.stringify([
      { code: 'PAIR42', chatKey: 'telegram:123', requestedAt: '2026-08-20T06:00:00.000Z' },
    ]), 'utf-8');

    const items = listFederatedPendingItems(root, { gatewayHomeDir });
    expect(items.map(item => item.origin)).toEqual([
      // requestedAt ascending; the panic row (no timestamp) sorts first.
      'panic-guard', 'gateway-pairing', 'checkpoint', 'autonomous-trigger',
      'confirmation', 'nervous', 'bot-action',
    ]);
    const byOrigin = Object.fromEntries(items.map(item => [item.origin, item]));
    expect(byOrigin['autonomous-trigger']).toMatchObject({
      id: 'trg-1', decideHintKey: 'approvals.federated.hint_autonomous',
    });
    expect(byOrigin['nervous']).toMatchObject({ id: 'ntf-1', summary: 'stale lock detected [AB12C]' });
    expect(byOrigin['checkpoint']!.id).toBe('checkpoint-sprint-9-plan');
    expect(byOrigin['panic-guard']!.id).toBe('panic:900-001-123');
    expect(byOrigin['gateway-pairing']).toMatchObject({ id: 'PAIR42' });
    expect(items.some(item => item.unreadable)).toBe(false);
  });

  it('is fail-soft: missing stores are empty, corrupt stores yield a typed unreadable row', () => {
    const root = fixtureRoot();
    expect(listFederatedPendingItems(root)).toEqual([]);

    mkdirSync(join(root, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'autonomous', 'pending.json'), '{not json', 'utf-8');
    const items = listFederatedPendingItems(root);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ origin: 'autonomous-trigger', unreadable: true });
  });

  it('never writes: store bytes are identical after listing (read-only contract)', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, '.deckent', 'autonomous'), { recursive: true });
    const path = join(root, '.deckent', 'autonomous', 'pending.json');
    const payload = JSON.stringify([{ triggerId: 'trg-ro', action: 'x', requestedBy: 'y', enqueuedAt: 'z' }]);
    writeFileSync(path, payload, 'utf-8');
    listFederatedPendingItems(root);
    expect(readFileSync(path, 'utf-8')).toBe(payload);
  });
});
