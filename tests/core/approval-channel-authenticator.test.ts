import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ApprovalRequest, ApprovalRisk } from '../../src/core/approval-contract.js';
import {
  APPROVAL_CHANNEL_AUTHORITY_REF,
  ChannelLiveApprovalAuthenticator,
  InMemoryApprovalChannelNonceVerifier,
  channelTierFor,
} from '../../src/core/approval-channel-authenticator.js';
import { ApprovalDecisionAuthority } from '../../src/core/approval-decision-ingress.js';
import type { LiveApprovalAuthenticator } from '../../src/core/approval-decision-ingress.js';
import { openApprovalAuthorityRuntime } from '../../src/core/approval-authority-runtime.js';
import { writeApprovalAuthorityFixtureRevision } from '../helpers/approval-authority-fixture.js';

const NOW = new Date('2026-08-21T10:00:00.000Z');
const BINDING_DIGEST = 'b'.repeat(64);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function request(risk: ApprovalRisk = 'high'): ApprovalRequest {
  return {
    version: 1,
    id: 'channel-approval-1',
    requester: { role: 'brain', instanceId: 'brain-a' },
    summary: 'Approve from an authorized channel',
    details: {},
    scopeId: 'project-a',
    scope: 'shell-exec',
    risk,
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'tenant-a',
    userId: 'owner-a',
    createdAt: new Date(NOW.getTime() - 1_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    maskedArgs: null,
    rawArgsRef: null,
  };
}

function context(risk: ApprovalRisk = 'high') {
  return {
    request: request(risk),
    requestDigest: 'a'.repeat(64),
    action: 'allow' as const,
    channel: 'telegram',
  };
}

function fixture(authorized: () => boolean = () => true) {
  const nonces = new InMemoryApprovalChannelNonceVerifier(['nonce-1']);
  return new ChannelLiveApprovalAuthenticator({
    connector: 'telegram',
    principal: { userId: 'owner-a', role: 'owner' },
    chatKey: 'telegram:chat-42',
    bindingDigest: BINDING_DIGEST,
    nonce: 'nonce-1',
    isAuthorized: authorized,
    consumeNonce: nonces.consume,
    now: () => NOW,
  });
}

describe('ChannelLiveApprovalAuthenticator', () => {
  it('LIVE-DEFECT PIN (2026-08-21): the channel principal need NOT equal the request userId', async () => {
    // The request was opened by the host account (userId owner-a); the deciding
    // chat identity is a different universe. The owner's real Telegram tap was
    // rejected by an accidental equality — this pin keeps that class dead.
    const nonces = new InMemoryApprovalChannelNonceVerifier(['nonce-9']);
    const auth = new ChannelLiveApprovalAuthenticator({
      connector: 'telegram',
      principal: { userId: 'tg-999-different', role: 'owner' },
      chatKey: 'telegram:chat-42',
      bindingDigest: BINDING_DIGEST,
      nonce: 'nonce-9',
      isAuthorized: () => true,
      consumeNonce: nonces.consume,
      now: () => NOW,
    });
    const minted = await auth.reauthenticate(context('high'));
    expect(minted).not.toBeNull();
    expect(minted!.actorId).toBe('channel:telegram:tg-999-different');
  });

  it('mints the pinned person actor and digest-bound live proof', async () => {
    const authenticator = fixture();
    const ctx = context();
    const minted = await authenticator.reauthenticate(ctx);

    expect(minted).toEqual({
      actorId: 'channel:telegram:owner-a',
      tenantId: 'tenant-a',
      role: 'owner',
      sessionRef: BINDING_DIGEST,
      authorityRef: APPROVAL_CHANNEL_AUTHORITY_REF,
      authenticatedAt: NOW.toISOString(),
      expiresAt: request().expiresAt,
    });
    expect(authenticator.isSessionActive({
      actorId: minted!.actorId,
      tenantId: minted!.tenantId,
      role: minted!.role ?? null,
      sessionRefHash: createHash('sha256').update(minted!.sessionRef).digest('hex'),
      authorityRef: minted!.authorityRef,
      authenticatedAt: minted!.authenticatedAt,
      expiresAt: minted!.expiresAt,
    }, ctx, NOW)).toBe(true);
  });

  it('returns null for critical risk without consuming the nonce', async () => {
    const nonces = new InMemoryApprovalChannelNonceVerifier(['critical-nonce']);
    const authenticator = new ChannelLiveApprovalAuthenticator({
      connector: 'telegram', principal: { userId: 'owner-a' }, chatKey: 'chat-42',
      bindingDigest: BINDING_DIGEST, nonce: 'critical-nonce', isAuthorized: () => true,
      consumeNonce: nonces.consume, now: () => NOW,
    });
    await expect(authenticator.reauthenticate(context('critical'))).resolves.toBeNull();
    expect(nonces.consume('critical-nonce')).toBe(true);
  });

  it('kills an in-flight proof when the chat falls off the live allowlist', async () => {
    let authorized = true;
    const authenticator = fixture(() => authorized);
    const ctx = context('medium');
    const minted = await authenticator.reauthenticate(ctx);
    const proof = {
      actorId: minted!.actorId, tenantId: minted!.tenantId, role: minted!.role ?? null,
      sessionRefHash: createHash('sha256').update(minted!.sessionRef).digest('hex'),
      authorityRef: minted!.authorityRef, authenticatedAt: minted!.authenticatedAt,
      expiresAt: minted!.expiresAt,
    };
    expect(authenticator.isSessionActive(proof, ctx, NOW)).toBe(true);
    authorized = false;
    expect(authenticator.isSessionActive(proof, ctx, NOW)).toBe(false);
  });

  it('rejects a second use of the same nonce', async () => {
    const authenticator = fixture();
    await expect(authenticator.reauthenticate(context('low'))).resolves.not.toBeNull();
    await expect(authenticator.reauthenticate(context('low'))).resolves.toBeNull();
  });

  it.each<[ApprovalRisk, ReturnType<typeof channelTierFor>]>([
    ['none', 'routine'],
    ['low', 'routine'],
    ['medium', 'elevated'],
    ['high', 'elevated'],
    ['critical', 'critical'],
  ])('pins the D3-delta 5-to-3 tier mapping: %s -> %s', (risk, tier) => {
    expect(channelTierFor(risk)).toBe(tier);
  });

  it('END-TO-END: decideChannel writes a channel envelope and only a wired validator trusts it', async () => {
    const base = mkdtempSync(join(tmpdir(), 'approval-channel-runtime-'));
    roots.push(base);
    const projectRoot = join(base, 'project');
    const hostRoot = join(base, 'host');
    mkdirSync(projectRoot, { recursive: true });
    writeApprovalAuthorityFixtureRevision({
      dataDir: hostRoot,
      revision: 1,
      previousRevisionHash: null,
      activeKeyId: 'approval-key-0001',
      keys: [{
        keyId: 'approval-key-0001', status: 'active',
        createdAt: '2026-08-21T09:00:00.000Z', retiredAt: null,
        keyMaterialHex: '77'.repeat(32),
      }],
    });
    const opened = openApprovalAuthorityRuntime({
      projectRoot, tenantId: 'tenant-a', platform: 'linux',
      env: { DECKENT_HOME: hostRoot }, now: () => NOW,
    });
    expect(opened.state).toBe('ready');
    if (opened.state !== 'ready') throw new Error(opened.reasonCode);
    const approval = opened.service.broker.submit({
      ...request('high'),
      version: '1.0',
      id: 'channel-runtime-1',
      scopeId: projectRoot,
    });
    const authenticator = fixture();
    const outcome = await opened.service.decideChannel(projectRoot, authenticator, {
      requestId: approval.id,
      action: 'allow',
      idempotencyKey: 'channel-runtime-nonce-1',
    });
    expect(outcome.kind).toBe('decided');
    if (outcome.kind !== 'decided') return;
    expect(outcome.decision).toMatchObject({
      decidedBy: 'channel:telegram:owner-a',
      channel: 'channel',
      authorization: { authorityRef: APPROVAL_CHANNEL_AUTHORITY_REF },
    });

    const deadSessions: LiveApprovalAuthenticator = {
      reauthenticate: async () => null,
      isSessionActive: () => false,
    };
    const wired = new ApprovalDecisionAuthority(
      opened.service.custody, deadSessions, undefined, authenticator,
    );
    expect(wired.validate(approval, outcome.decision, NOW)).toMatchObject({ ok: true });
    const unwired = new ApprovalDecisionAuthority(opened.service.custody, deadSessions);
    expect(unwired.validate(approval, outcome.decision, NOW))
      .toEqual({ ok: false, reason: 'session-inactive' });
    opened.service.close();
  });

  it('decideChannel rejects a critical request when the authenticator returns null', async () => {
    const base = mkdtempSync(join(tmpdir(), 'approval-channel-critical-'));
    roots.push(base);
    const projectRoot = join(base, 'project');
    const hostRoot = join(base, 'host');
    mkdirSync(projectRoot, { recursive: true });
    writeApprovalAuthorityFixtureRevision({
      dataDir: hostRoot, revision: 1, previousRevisionHash: null,
      activeKeyId: 'approval-key-0001',
      keys: [{ keyId: 'approval-key-0001', status: 'active',
        createdAt: '2026-08-21T09:00:00.000Z', retiredAt: null,
        keyMaterialHex: '66'.repeat(32) }],
    });
    const opened = openApprovalAuthorityRuntime({
      projectRoot, tenantId: 'tenant-a', platform: 'linux',
      env: { DECKENT_HOME: hostRoot }, now: () => NOW,
    });
    if (opened.state !== 'ready') throw new Error(opened.reasonCode);
    const approval = opened.service.broker.submit({
      ...request('critical'), version: '1.0', id: 'channel-critical-1', scopeId: projectRoot,
    });
    await expect(opened.service.decideChannel(projectRoot, fixture(), {
      requestId: approval.id, action: 'allow', idempotencyKey: 'critical-channel-1',
    })).resolves.toEqual({ kind: 'rejected', reason: 'unauthorized' });
    expect(opened.service.broker.getDecision(approval.id)).toBeNull();
    opened.service.close();
  });
});
