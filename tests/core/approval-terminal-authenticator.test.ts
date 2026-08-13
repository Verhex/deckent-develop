import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  type ApprovalDecisionIntegrityAuthority,
} from '../../src/core/approval-decision-ingress.js';
import { ApprovalLiveSessionStore } from '../../src/core/approval-live-session.js';
import { LocalTerminalLiveApprovalAuthenticator } from '../../src/core/approval-terminal-authenticator.js';

const NOW = new Date('2026-08-12T10:00:00.000Z');
const roots: string[] = [];

class Integrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return { keyId: 'terminal-test', mac: createHmac('sha256', 'terminal-key').update(payload).digest('hex') };
  }
  verify(keyId: string, payload: string, mac: string): boolean {
    const expected = this.sign(payload).mac;
    return keyId === 'terminal-test' && mac.length === expected.length
      && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('LocalTerminalLiveApprovalAuthenticator', () => {
  it('mints a durable authorization envelope and fails closed after re-auth expiry', async () => {
    const root = mkdtempSync(join(tmpdir(), 'terminal-approval-'));
    roots.push(root);
    const projectRoot = join(root, 'project');
    mkdirSync(projectRoot);
    const broker = new ApprovalBroker(projectRoot);
    const sessions = new ApprovalLiveSessionStore({ projectRoot, stateDir: join(root, 'host-state'), now: () => NOW });
    const provider = {
      reauthenticate: async () => ({
        actorId: 'owner-a', tenantId: 'tenant-a', role: 'owner',
        authorityRef: 'local-terminal:os-session',
        authenticatedAt: new Date(NOW.getTime() - 1_000).toISOString(),
        expiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
      }),
    };
    const authenticator = new LocalTerminalLiveApprovalAuthenticator({ provider, sessions, now: () => NOW });
    const integrity = new Integrity();
    const request = broker.submit({
      id: 'terminal-auth-1', requester: { role: 'brain', instanceId: 'brain-a' },
      summary: 'Authorize terminal operation', details: {}, scopeId: 'project-a',
      scope: 'network', risk: 'high', policy: 'require-approval', defaultAction: 'deny',
      tenantId: 'tenant-a', userId: 'owner-a',
      createdAt: new Date(NOW.getTime() - 2_000).toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });
    const ingress = new ApprovalDecisionIngress({ broker, authenticator, integrity, channel: 'local-terminal', now: () => NOW });
    const outcome = await ingress.decide({ requestId: request.id, action: 'allow', idempotencyKey: 'terminal-1' });
    expect(outcome.kind).toBe('decided');
    if (outcome.kind !== 'decided') return;
    expect(outcome.decision.authorization).toMatchObject({
      authorityRef: 'local-terminal:os-session',
      authenticatedAt: new Date(NOW.getTime() - 1_000).toISOString(),
      authExpiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
    });
    const authority = new ApprovalDecisionAuthority(integrity, authenticator);
    expect(authority.validate(request, outcome.decision, NOW)).toMatchObject({ ok: true });
    expect(authority.validate(request, outcome.decision, new Date(NOW.getTime() + 30_000)))
      .toEqual({ ok: false, reason: 'session-expired' });
  });
});
