import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import {
  ApprovalLiveSessionAuthority,
  ApprovalLiveSessionStore,
} from '../../src/core/approval-live-session.js';

const roots: string[] = [];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixture(): { base: string; projectRoot: string; stateDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-approval-session-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const stateDir = join(base, 'host-state');
  mkdirSync(projectRoot, { recursive: true });
  return { base, projectRoot, stateDir };
}

function request(): ApprovalRequest {
  return {
    version: '1.0',
    id: 'approval-session-request',
    requester: { role: 'brain', instanceId: 'brain-fixture' },
    summary: 'Approve exact execution',
    details: {},
    scopeId: 'scope-fixture',
    scope: 'lifecycle',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'tenant-fixture',
    userId: 'actor-fixture',
    createdAt: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-07-25T01:00:00.000Z',
    maskedArgs: null,
    rawArgsRef: null,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ApprovalLiveSessionStore', () => {
  it('persists only a session hash and validates the exact context after restart', () => {
    const { projectRoot, stateDir } = fixture();
    const now = new Date('2026-07-25T00:10:00.000Z');
    const store = new ApprovalLiveSessionStore({
      projectRoot,
      stateDir,
      now: () => now,
      randomBytesFactory: () => Buffer.from('ab'.repeat(32), 'hex'),
    });
    const requestDigest = sha256('request');
    const live = store.issue({
      actorId: 'actor-fixture',
      tenantId: 'tenant-fixture',
      role: 'owner',
      authorityRef: 'oidc:issuer-fixture',
      requestDigest,
      action: 'allow',
      channel: 'api-oidc',
      authenticatedAt: '2026-07-25T00:09:00.000Z',
      expiresAt: '2026-07-25T00:20:00.000Z',
    });
    const sessionRefHash = sha256(live.sessionRef);
    const leasePath = join(store.rootDir, 'leases', `${sessionRefHash}.json`);
    const persisted = readFileSync(leasePath, 'utf8');

    expect(persisted).not.toContain(live.sessionRef);
    expect(persisted).toContain(sessionRefHash);

    const reopened = new ApprovalLiveSessionStore({
      projectRoot,
      stateDir,
      now: () => now,
    });
    const authority = new ApprovalLiveSessionAuthority(reopened);
    const proof = {
      actorId: live.actorId,
      tenantId: live.tenantId,
      role: live.role ?? null,
      sessionRefHash,
      authorityRef: live.authorityRef,
      authenticatedAt: live.authenticatedAt,
      expiresAt: live.expiresAt,
    };
    const context = {
      request: request(),
      requestDigest,
      action: 'allow' as const,
      channel: 'api-oidc',
    };

    expect(authority.isSessionActive(proof, context, now)).toBe(true);
    expect(authority.isSessionActive(proof, { ...context, channel: 'rpc' }, now)).toBe(false);
    expect(authority.isSessionActive(proof, { ...context, action: 'deny' }, now)).toBe(false);
    expect(authority.isSessionActive(
      { ...proof, tenantId: 'tenant-other' },
      context,
      now,
    )).toBe(false);
  });

  it('revokes first-writer-wins and remains inactive across restart', () => {
    const { projectRoot, stateDir } = fixture();
    let now = new Date('2026-07-25T00:10:00.000Z');
    const store = new ApprovalLiveSessionStore({
      projectRoot,
      stateDir,
      now: () => now,
      randomBytesFactory: () => Buffer.from('cd'.repeat(32), 'hex'),
    });
    const requestDigest = sha256('request-revoke');
    const live = store.issue({
      actorId: 'actor-fixture',
      tenantId: 'tenant-fixture',
      role: null,
      authorityRef: 'oidc:issuer-fixture',
      requestDigest,
      action: 'allow',
      channel: 'api-oidc',
      authenticatedAt: '2026-07-25T00:09:00.000Z',
      expiresAt: '2026-07-25T00:20:00.000Z',
    });
    const proof = {
      actorId: live.actorId,
      tenantId: live.tenantId,
      role: null,
      sessionRefHash: sha256(live.sessionRef),
      authorityRef: live.authorityRef,
      authenticatedAt: live.authenticatedAt,
      expiresAt: live.expiresAt,
    };
    const context = {
      request: request(),
      requestDigest,
      action: 'allow' as const,
      channel: 'api-oidc',
    };

    expect(store.isActive(proof, context, now)).toBe(true);
    const first = store.revoke(proof.sessionRefHash, 'owner-revoked');
    const repeated = store.revoke(proof.sessionRefHash, 'different-loser-reason');
    expect(repeated).toEqual(first);

    const reopened = new ApprovalLiveSessionStore({
      projectRoot,
      stateDir,
      now: () => now,
    });
    expect(reopened.isActive(proof, context, now)).toBe(false);

    now = new Date('2026-07-25T00:21:00.000Z');
    expect(reopened.isActive(proof, context, now)).toBe(false);
  });

  it('cannot mint a lease whose authentication is future-dated or already expired', () => {
    const { projectRoot, stateDir } = fixture();
    const store = new ApprovalLiveSessionStore({
      projectRoot,
      stateDir,
      now: () => new Date('2026-07-25T00:10:00.000Z'),
    });
    const base = {
      actorId: 'actor-fixture',
      tenantId: 'tenant-fixture',
      role: null,
      authorityRef: 'oidc:issuer-fixture',
      requestDigest: sha256('invalid-time'),
      action: 'allow',
      channel: 'api-oidc',
    };

    expect(() => store.issue({
      ...base,
      authenticatedAt: '2026-07-25T00:11:00.000Z',
      expiresAt: '2026-07-25T00:20:00.000Z',
    })).toThrow(/timestamps/u);
    expect(() => store.issue({
      ...base,
      authenticatedAt: '2026-07-25T00:09:00.000Z',
      expiresAt: '2026-07-25T00:10:00.000Z',
    })).toThrow(/timestamps/u);
  });
});
