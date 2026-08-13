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
import {
  AttendedExecutionApprovalAuthority,
  AttendedExecutionApprovalError,
  attendedExecutionProjectId,
} from '../../src/core/attended-execution-approval.js';
import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ProviderEvidenceProbeSubject } from '../../src/core/provider-evidence-probe-contract.js';

const NOW = new Date('2026-08-12T11:00:00.000Z');
const roots: string[] = [];

class Integrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return {
      keyId: 'probe-test',
      mac: createHmac('sha256', 'probe-key').update(payload).digest('hex'),
    };
  }

  verify(keyId: string, payload: string, mac: string): boolean {
    const expected = this.sign(payload).mac;
    return keyId === 'probe-test'
      && mac.length === expected.length
      && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  }
}

interface ProbeFixture {
  readonly broker: ApprovalBroker;
  readonly authority: AttendedExecutionApprovalAuthority;
  readonly ingress: ApprovalDecisionIngress;
  readonly request: ApprovalRequest;
  readonly subject: ProviderEvidenceProbeSubject;
  setNow(value: Date): void;
}

function fixture(authExpiresAt = new Date(NOW.getTime() + 45_000)): ProbeFixture {
  let currentTime = NOW;
  const root = mkdtempSync(join(tmpdir(), 'probe-approval-'));
  roots.push(root);
  const projectRoot = join(root, 'project');
  mkdirSync(projectRoot);
  const host = join(root, 'host');
  const broker = new ApprovalBroker(projectRoot);
  const sessions = new ApprovalLiveSessionStore({
    projectRoot,
    stateDir: join(host, 'state'),
    now: () => currentTime,
  });
  const authenticator = new LocalTerminalLiveApprovalAuthenticator({
    sessions,
    now: () => currentTime,
    provider: {
      reauthenticate: async () => ({
        actorId: 'owner-a',
        tenantId: 'tenant-a',
        authorityRef: 'local-terminal:pam',
        role: 'owner',
        authenticatedAt: new Date(NOW.getTime() - 1_000).toISOString(),
        expiresAt: authExpiresAt.toISOString(),
      }),
    },
  });
  const integrity = new Integrity();
  const decisions = new ApprovalDecisionAuthority(integrity, authenticator);
  const authority = new AttendedExecutionApprovalAuthority(projectRoot, broker, decisions, {
    receiptStoreDir: join(host, 'receipts'),
    proposalStoreDir: join(host, 'proposals'),
    dispatchClaimStoreDir: join(host, 'dispatch-claims'),
    operationClaimStoreDir: join(host, 'operation-claims'),
    now: () => currentTime,
  });
  const subject: ProviderEvidenceProbeSubject = {
    kind: 'provider-evidence-probe',
    tenantId: 'tenant-a',
    projectId: attendedExecutionProjectId(projectRoot),
    provider: 'codex',
    model: 'model-a',
    backendScope: 'docker',
    executionProfileRef: 'probe.profile',
    budget: {
      billingMode: 'subscription',
      maxInputTokens: 100,
      maxOutputTokens: 10,
      maxTokens: 110,
      timeoutMs: 5_000,
    },
    ttl: {
      startsAt: new Date(NOW.getTime() - 5_000).toISOString(),
      expiresAt: new Date(NOW.getTime() + 90_000).toISOString(),
    },
  } as ProviderEvidenceProbeSubject;
  const request = authority.submitProviderEvidenceProbe({
    requester: { role: 'brain', instanceId: 'brain-probe' },
    userId: 'owner-a',
    summary: 'Approve provider probe',
    subject,
    createdAt: NOW.toISOString(),
  });
  return {
    broker,
    authority,
    ingress: new ApprovalDecisionIngress({
      broker,
      authenticator,
      integrity,
      channel: 'local-terminal',
      now: () => currentTime,
    }),
    request,
    subject,
    setNow(value: Date) {
      currentTime = value;
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('provider-evidence-probe approval subject', () => {
  it('progresses request to terminal-authenticated decision, verification, and one host-global claim', async () => {
    const f = fixture();
    const { request } = f;
    const outcome = await f.ingress.decide({
      requestId: request.id,
      action: 'allow',
      idempotencyKey: 'probe-decision-1',
    });
    expect(outcome.kind).toBe('decided');
    const claim = f.authority.verifyAndClaimProviderEvidenceProbe(request.id, f.subject);
    expect(claim).toMatchObject({
      evidenceRef: `approval:${request.id}`,
      grantedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 45_000).toISOString(),
      subject: { kind: 'provider-evidence-probe' },
    });
    expect(() => f.authority.verifyAndClaimProviderEvidenceProbe(request.id, f.subject))
      .toThrowError(expect.objectContaining<Partial<AttendedExecutionApprovalError>>({ code: 'APPROVAL_ALREADY_CONSUMED' }));
  });

  it('refuses a claim after the live re-authentication expires', async () => {
    const authExpiresAt = new Date(NOW.getTime() + 10_000);
    const f = fixture(authExpiresAt);
    const { request } = f;
    await expect(f.ingress.decide({
      requestId: request.id,
      action: 'allow',
      idempotencyKey: 'probe-expiry',
    })).resolves.toMatchObject({ kind: 'decided' });

    f.setNow(authExpiresAt);
    expect(() => f.authority.verifyAndClaimProviderEvidenceProbe(request.id, f.subject))
      .toThrowError(expect.objectContaining<Partial<AttendedExecutionApprovalError>>({
        code: 'DECISION_UNTRUSTED',
      }));
  });

  it('keeps a decision without live authorization fail-closed', () => {
    const f = fixture();
    const { request } = f;
    f.broker.decide(request.id, {
      decision: 'allow',
      decidedBy: 'owner-a',
      channel: 'legacy',
      decidedAt: NOW.toISOString(),
      reason: 'unsigned decision',
    });

    expect(() => f.authority.verifyAndClaimProviderEvidenceProbe(request.id, f.subject))
      .toThrowError(expect.objectContaining<Partial<AttendedExecutionApprovalError>>({
        code: 'DECISION_UNTRUSTED',
      }));
  });
});
