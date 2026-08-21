import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import {
  APPROVAL_CONTRACT_V1_VERSION,
  APPROVAL_CONTRACT_V2_VERSION,
  type ApprovalRequest,
  type ApprovalRequestV2,
} from '../../src/core/approval-contract.js';
import {
  approvalLifecycleProfileDigest,
  DEFAULT_APPROVAL_LIFECYCLE_POLICY,
} from '../../src/core/approval-lifecycle-policy.js';
import type { ResolvedApprovalLifecycleConfig } from '../../src/core/config-types.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  approvalRequestDigest,
  type ApprovalDecisionIntegrityAuthority,
  type LiveApprovalAuthenticator,
} from '../../src/core/approval-decision-ingress.js';

const NOW = new Date('2026-08-21T10:00:00.000Z');
const KEY = 'versioned-digest-test-key';

class Integrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return { keyId: 'test-key', mac: createHmac('sha256', KEY).update(payload).digest('hex') };
  }
  verify(keyId: string, payload: string, mac: string): boolean {
    const expected = this.sign(payload).mac;
    return keyId === 'test-key' && mac.length === expected.length
      && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  }
}

const sessions: LiveApprovalAuthenticator = {
  reauthenticate: async () => ({
    actorId: 'owner', tenantId: 'main', role: 'owner', sessionRef: 'session',
    authorityRef: 'test:v1', authenticatedAt: NOW.toISOString(),
    expiresAt: '2026-08-21T10:10:00.000Z',
  }),
  isSessionActive: () => true,
};

function versionedRequest(source: ApprovalRequest): ApprovalRequestV2 {
  const lifecycleProfile = {
    ttlMs: 7_200_000,
    slaMs: [120_000, 600_000, 1_200_000] as [number, number, number],
    riskTier: 'routine' as const,
    timeoutDisposition: 'request-default' as const,
    blocking: 'request' as const,
  };
  return {
    ...source,
    version: APPROVAL_CONTRACT_V2_VERSION,
    origin: 'broker-native', riskTier: 'critical', blocking: 'request', lifecycleProfile,
    policySnapshotDigest: approvalLifecycleProfileDigest('broker-native', lifecycleProfile),
    source: {
      contractVersion: APPROVAL_CONTRACT_V1_VERSION,
      requestDigest: approvalRequestDigest(source),
      reference: `approval:v1:${source.id}`,
    },
    lifecycleGeneration: 'generation-1', slaStage: 'initial',
  };
}

describe('version-aware approval request digest', () => {
  it('projects v1 exactly while binding every v2 lineage field', () => {
    const source = {
      version: '1.0', id: 'digest-v1', requester: { role: 'brain', instanceId: 'b1' },
      summary: 'approve', details: {}, scopeId: 'p', scope: 'lifecycle', risk: 'high',
      policy: 'require-approval', defaultAction: 'deny', tenantId: 'main', userId: 'owner',
      createdAt: '2026-08-21T09:00:00.000Z', expiresAt: '2026-08-21T11:00:00.000Z',
      maskedArgs: null, rawArgsRef: null,
    } as ApprovalRequest;
    expect(approvalRequestDigest({ ...source, riskTier: 'critical' } as never))
      .toBe(approvalRequestDigest(source));
    const v2 = versionedRequest(source);
    expect(approvalRequestDigest({ ...v2, riskTier: 'routine' }))
      .not.toBe(approvalRequestDigest(v2));
    expect(approvalRequestDigest({ ...v2, source: { ...v2.source, reference: 'tampered' } }))
      .not.toBe(approvalRequestDigest(v2));
  });

  it('mints and validates against the durable v2 envelope, not the plain source', async () => {
    const root = mkdtempSync(join(tmpdir(), 'approval-v2-digest-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const lifecycle = {
      ...DEFAULT_APPROVAL_LIFECYCLE_POLICY,
      enabled: true,
    } as ResolvedApprovalLifecycleConfig;
    const broker = new ApprovalBroker(root, { lifecycle, clock: () => NOW });
    const source = {
      version: APPROVAL_CONTRACT_V1_VERSION,
      id: 'digest-v2', requester: { role: 'brain', instanceId: 'b1' }, summary: 'approve', details: {},
      scopeId: 'p', scope: 'lifecycle', risk: 'high', policy: 'require-approval', defaultAction: 'deny',
      tenantId: 'main', userId: 'owner', createdAt: '2026-08-21T09:59:00.000Z',
      expiresAt: '2026-08-21T11:00:00.000Z',
      maskedArgs: null, rawArgsRef: null,
    } as ApprovalRequest;
    const published = await broker.submitLifecycle(versionedRequest(source));
    if ('state' in published) throw new Error(`unexpected lifecycle HOLD: ${published.reasonCode}`);
    const request = published;
    const integrity = new Integrity();
    const ingress = new ApprovalDecisionIngress({
      broker, authenticator: sessions, integrity, channel: 'terminal', now: () => NOW,
    });
    const outcome = await ingress.decide({ requestId: request.id, action: 'allow', idempotencyKey: 'v2-1' });
    expect(outcome.kind).toBe('decided');
    if (outcome.kind !== 'decided') return;
    expect(outcome.decision.authorization?.requestDigest).toBe(approvalRequestDigest(request));
    const authority = new ApprovalDecisionAuthority(integrity, sessions);
    expect(authority.validate(request, outcome.decision, NOW)).toMatchObject({ ok: true });
    expect(authority.validate({ ...request, riskTier: 'routine' }, outcome.decision, NOW))
      .toEqual({ ok: false, reason: 'request-digest-mismatch' });
  });
});
