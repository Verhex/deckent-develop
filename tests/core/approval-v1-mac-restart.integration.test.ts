import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  type ApprovalDecisionIntegrityAuthority,
  type LiveApprovalAuthenticator,
} from '../../src/core/approval-decision-ingress.js';

const NOW = new Date('2026-08-21T10:00:00.000Z');

class Integrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return { keyId: 'restart-key', mac: createHmac('sha256', 'restart-secret').update(payload).digest('hex') };
  }
  verify(keyId: string, payload: string, mac: string): boolean {
    const expected = this.sign(payload).mac;
    return keyId === 'restart-key' && mac.length === expected.length
      && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  }
}

const sessions: LiveApprovalAuthenticator = {
  reauthenticate: async () => ({
    actorId: 'owner', tenantId: 'main', role: 'owner', sessionRef: 'restart-session',
    authorityRef: 'test:v1', authenticatedAt: NOW.toISOString(), expiresAt: '2026-08-21T10:30:00.000Z',
  }),
  isSessionActive: () => true,
};

describe('stored v1 signed decision restart compatibility', () => {
  it('validates the persisted v1 MAC after a fresh broker hydration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'approval-v1-restart-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const storeDir = join(root, '.deckent', 'approvals');
    mkdirSync(storeDir, { recursive: true });
    const legacySource = {
      id: 'signed-v1-restart', requester: { role: 'brain', instanceId: 'b1' }, summary: 'approve', details: {},
      scopeId: 'p', scope: 'lifecycle', risk: 'high', policy: 'require-approval', defaultAction: 'deny',
      tenantId: 'main', userId: 'owner', createdAt: '2026-08-21T09:59:00.000Z',
      expiresAt: '2026-08-21T11:00:00.000Z',
    };
    writeFileSync(join(storeDir, `${legacySource.id}.request.json`), JSON.stringify(legacySource), 'utf8');
    const first = new ApprovalBroker(root, { clock: () => NOW });
    const request = first.getRequest(legacySource.id);
    expect(request).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(request, 'version')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(request, 'maskedArgs')).toBe(false);
    const integrity = new Integrity();
    const ingress = new ApprovalDecisionIngress({
      broker: first, authenticator: sessions, integrity, channel: 'terminal', now: () => NOW,
    });
    const outcome = await ingress.decide({ requestId: request!.id, action: 'allow', idempotencyKey: 'restart-1' });
    expect(outcome.kind).toBe('decided');

    const restarted = new ApprovalBroker(root, { clock: () => NOW });
    const hydratedRequest = restarted.getRequest(request!.id);
    const hydratedDecision = restarted.getDecision(request!.id);
    expect(hydratedRequest).not.toBeNull();
    expect(hydratedDecision).not.toBeNull();
    expect(new ApprovalDecisionAuthority(integrity, sessions)
      .validate(hydratedRequest!, hydratedDecision!, NOW)).toMatchObject({ ok: true });
  });
});
