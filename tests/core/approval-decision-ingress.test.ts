import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  approvalRequestDigest,
  type ApprovalDecisionIntegrityAuthority,
  type LiveApprovalAuthenticator,
  type LiveApprovalAuthentication,
  type LiveApprovalSessionProof,
} from '../../src/core/approval-decision-ingress.js';
import type { ApprovalRequest } from '../../src/core/approval-contract.js';

const NOW = new Date('2026-07-23T09:00:00.000Z');
const KEY = Buffer.from('approval-ingress-hermetic-key-v1');
const roots: string[] = [];

class TestIntegrityAuthority implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return { keyId: 'test-key-v1', mac: createHmac('sha256', KEY).update(payload).digest('hex') };
  }

  verify(keyId: string, payload: string, mac: string): boolean {
    if (keyId !== 'test-key-v1' || !/^[a-f0-9]{64}$/u.test(mac)) return false;
    const expected = this.sign(payload).mac;
    return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'));
  }
}

class TestAuthenticator implements LiveApprovalAuthenticator {
  available = true;
  identity: LiveApprovalAuthentication = {
    actorId: 'owner-a',
    tenantId: 'tenant-a',
    role: 'owner',
    sessionRef: 'raw-session-secret-never-persist',
    authorityRef: 'test-session-authority:v1',
    authenticatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
  };
  private readonly active = new Set<string>();

  constructor() {
    this.active.add(this.hash(this.identity.sessionRef));
  }

  async reauthenticate(): Promise<LiveApprovalAuthentication | null> {
    if (!this.available) return null;
    return this.identity;
  }

  isSessionActive(proof: LiveApprovalSessionProof): boolean {
    return this.available
      && proof.authorityRef === this.identity.authorityRef
      && proof.actorId === this.identity.actorId
      && proof.tenantId === this.identity.tenantId
      && this.active.has(proof.sessionRefHash);
  }

  revoke(): void {
    this.active.clear();
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}

function fixture(now: () => Date = () => NOW) {
  const root = mkdtempSync(join(tmpdir(), 'approval-ingress-'));
  roots.push(root);
  const broker = new ApprovalBroker(root);
  const authenticator = new TestAuthenticator();
  const integrity = new TestIntegrityAuthority();
  const ingress = new ApprovalDecisionIngress({
    broker,
    authenticator,
    integrity,
    channel: 'terminal',
    now,
  });
  const request = broker.submit({
    id: 'apr-live-1',
    requester: { role: 'brain', instanceId: 'goal-v2' },
    summary: 'Approve guarded work',
    details: { workItemId: 'guarded' },
    scopeId: 'mission-a',
    scope: 'lifecycle',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'tenant-a',
    userId: 'owner-a',
    createdAt: new Date(NOW.getTime() - 10_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 120_000).toISOString(),
  });
  return { root, broker, authenticator, integrity, ingress, request };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ApprovalDecisionIngress', () => {
  it('accepts an interactive re-auth minted seconds after decide() entry, and still fails closed on mid-prompt request expiry', async () => {
    // Bulgu #8 regression: a human typing at a TTY takes seconds; the ingress
    // must judge authenticatedAt against a POST-prompt clock, not the entry
    // snapshot — otherwise every genuinely interactive decision reads as
    // "authenticated in the future" and dies unauthorized.
    let current = NOW;
    const fx = fixture(() => current);
    const promptLatencyMs = 8_000;
    fx.authenticator.reauthenticate = async () => {
      current = new Date(current.getTime() + promptLatencyMs);
      return {
        ...fx.authenticator.identity,
        authenticatedAt: current.toISOString(),
        expiresAt: new Date(current.getTime() + 60_000).toISOString(),
      };
    };
    const outcome = await fx.ingress.decide({
      requestId: fx.request.id,
      action: 'allow',
      idempotencyKey: 'interactive-latency-1',
    });
    expect(outcome.kind).toBe('decided');

    // A request that expires DURING the prompt must not mint: expired, not decided.
    const late = fixture(() => current);
    current = new Date(Date.parse(late.request.expiresAt) - 1_000);
    late.authenticator.reauthenticate = async () => {
      current = new Date(current.getTime() + promptLatencyMs);
      return {
        ...late.authenticator.identity,
        authenticatedAt: current.toISOString(),
        expiresAt: new Date(current.getTime() + 60_000).toISOString(),
      };
    };
    const lateOutcome = await late.ingress.decide({
      requestId: late.request.id,
      action: 'allow',
      idempotencyKey: 'interactive-latency-2',
    });
    expect(lateOutcome.kind).toBe('expired');
  });

  it('derives identity from live auth, binds the exact request, and persists no raw session secret', async () => {
    const f = fixture();
    const outcome = await f.ingress.decide({
      requestId: f.request.id,
      action: 'allow',
      idempotencyKey: 'terminal-command-1',
      reason: 'approved after review',
    });

    expect(outcome.kind).toBe('decided');
    if (outcome.kind !== 'decided') return;
    expect(outcome.decision).toMatchObject({
      decidedBy: 'owner-a',
      channel: 'terminal',
      authorization: {
        schemaVersion: 1,
        kind: 'live-session',
        requestDigest: approvalRequestDigest(f.request),
        actorId: 'owner-a',
        tenantId: 'tenant-a',
        authorityRef: 'test-session-authority:v1',
      },
    });
    const disk = readFileSync(join(f.root, '.deckent', 'approvals', `${f.request.id}.decision.json`), 'utf8');
    expect(disk).not.toContain(f.authenticator.identity.sessionRef);
    expect(disk).not.toContain('raw-session-secret');
    expect(new ApprovalDecisionAuthority(f.integrity, f.authenticator)
      .validate(f.request, outcome.decision, NOW)).toMatchObject({ ok: true });
  });

  it('reauthenticates every replay, returns the immutable winner for the same command, and rejects nonce reuse drift', async () => {
    const f = fixture();
    const command = {
      requestId: f.request.id,
      action: 'allow' as const,
      idempotencyKey: 'same-command',
      reason: 'reviewed',
    };
    expect((await f.ingress.decide(command)).kind).toBe('decided');
    expect((await f.ingress.decide(command)).kind).toBe('idempotent');
    expect((await f.ingress.decide({ ...command, action: 'deny' })).kind).toBe('rejected');

    f.authenticator.available = false;
    await expect(f.ingress.decide(command)).resolves.toEqual({ kind: 'rejected', reason: 'unauthorized' });
  });

  it('rejects wrong actor or tenant and never writes a decision', async () => {
    const f = fixture();
    f.authenticator.identity = { ...f.authenticator.identity, actorId: 'attacker' };
    await expect(f.ingress.decide({
      requestId: f.request.id,
      action: 'allow',
      idempotencyKey: 'wrong-actor',
    })).resolves.toEqual({ kind: 'rejected', reason: 'unauthorized' });
    expect(f.broker.getDecision(f.request.id)).toBeNull();
  });

  it('fails closed on expired request, expired auth, and authenticator failure', async () => {
    const expiredNow = new Date(NOW.getTime() + 180_000);
    const expired = fixture(() => expiredNow);
    await expect(expired.ingress.decide({
      requestId: expired.request.id,
      action: 'allow',
      idempotencyKey: 'expired-request',
    })).resolves.toMatchObject({ kind: 'expired', requestId: expired.request.id });

    const authExpired = fixture();
    authExpired.authenticator.identity = {
      ...authExpired.authenticator.identity,
      expiresAt: new Date(NOW.getTime() - 1).toISOString(),
    };
    await expect(authExpired.ingress.decide({
      requestId: authExpired.request.id,
      action: 'allow',
      idempotencyKey: 'expired-auth',
    })).resolves.toEqual({ kind: 'rejected', reason: 'unauthorized' });

    const unavailable = fixture();
    unavailable.authenticator.reauthenticate = async () => { throw new Error('identity service down'); };
    await expect(unavailable.ingress.decide({
      requestId: unavailable.request.id,
      action: 'allow',
      idempotencyKey: 'unavailable-auth',
    })).resolves.toEqual({ kind: 'rejected', reason: 'unavailable' });
  });
});

describe('ApprovalDecisionAuthority', () => {
  it('rejects request/decision tampering, session revocation, and legacy allow', async () => {
    const f = fixture();
    const outcome = await f.ingress.decide({
      requestId: f.request.id,
      action: 'allow',
      idempotencyKey: 'tamper-check',
    });
    if (outcome.kind !== 'decided') throw new Error('fixture decision failed');
    const authority = new ApprovalDecisionAuthority(f.integrity, f.authenticator);

    const changedRequest: ApprovalRequest = { ...f.request, risk: 'critical' };
    expect(authority.validate(changedRequest, outcome.decision, NOW))
      .toEqual({ ok: false, reason: 'request-digest-mismatch' });
    expect(authority.validate(f.request, { ...outcome.decision, reason: 'changed' }, NOW))
      .toEqual({ ok: false, reason: 'command-digest-mismatch' });
    f.authenticator.revoke();
    expect(authority.validate(f.request, outcome.decision, NOW))
      .toEqual({ ok: false, reason: 'session-inactive' });

    const { authorization: _authorization, ...legacy } = outcome.decision;
    expect(authority.validate(f.request, legacy, NOW))
      .toEqual({ ok: false, reason: 'missing-authorization' });
  });
});
