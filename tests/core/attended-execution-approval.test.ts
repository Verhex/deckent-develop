import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  type ApprovalDecisionIntegrityAuthority,
  type LiveApprovalAuthentication,
  type LiveApprovalAuthenticator,
  type LiveApprovalSessionProof,
} from '../../src/core/approval-decision-ingress.js';
import {
  AttendedExecutionApprovalAuthority,
  VerifiedAttendedExecutionApproval,
  attendedExecutionProjectId,
  createAttendedExecutionApprovalBinding,
} from '../../src/core/attended-execution-approval.js';
import { assertExecutionLandingSupport } from '../../src/core/live-execution-budget.js';
import { createAttendedExecutionProposalDigests } from '../../src/core/attended-execution-proposal.js';

const NOW = new Date('2026-07-24T09:00:00.000Z');
const KEY = Buffer.from('attended-execution-approval-test-key-v1');
const roots: string[] = [];

class TestIntegrityAuthority implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return { keyId: 'approval-test-key-v1', mac: createHmac('sha256', KEY).update(payload).digest('hex') };
  }

  verify(keyId: string, payload: string, mac: string): boolean {
    if (keyId !== 'approval-test-key-v1' || !/^[a-f0-9]{64}$/u.test(mac)) return false;
    const expected = this.sign(payload).mac;
    return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'));
  }
}

class TestAuthenticator implements LiveApprovalAuthenticator {
  active = true;
  readonly identity: LiveApprovalAuthentication = {
    actorId: 'owner-a',
    tenantId: 'tenant-a',
    role: 'owner',
    sessionRef: 'test-session-secret',
    authorityRef: 'test-session-authority:v1',
    authenticatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
  };

  async reauthenticate(): Promise<LiveApprovalAuthentication | null> {
    return this.active ? this.identity : null;
  }

  isSessionActive(proof: LiveApprovalSessionProof): boolean {
    return this.active
      && proof.actorId === this.identity.actorId
      && proof.tenantId === this.identity.tenantId
      && proof.authorityRef === this.identity.authorityRef
      && proof.sessionRefHash === createHash('sha256').update(this.identity.sessionRef).digest('hex');
  }
}

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'attended-execution-approval-'));
  roots.push(base);
  const root = join(base, 'project');
  const broker = new ApprovalBroker(root, { storeDir: join(base, 'host-broker') });
  const authenticator = new TestAuthenticator();
  const integrity = new TestIntegrityAuthority();
  const decisionAuthority = new ApprovalDecisionAuthority(integrity, authenticator);
  const authority = new AttendedExecutionApprovalAuthority(
    root,
    broker,
    decisionAuthority,
    {
      receiptStoreDir: join(base, 'host-receipts'),
      now: () => NOW,
    },
  );
  const binding = createAttendedExecutionApprovalBinding({
    ...createAttendedExecutionProposalDigests({
      task: { id: 'task-a', model: 'claude-fable-5' },
      prompt: 'bounded prompt',
      scope: { filesRead: [], filesWrite: [] },
      acceptance: { goCriteria: 'exact dispatch', noGoCriteria: 'drift' },
    }),
    tenantId: 'tenant-a',
    projectId: attendedExecutionProjectId(root),
    runId: 'run-a',
    taskId: 'task-a',
    attemptId: '123e4567-e89b-42d3-a456-426614174000',
    provider: 'claude',
    model: 'claude-fable-5',
    backend: 'subprocess',
    budget: { maxTurns: 4, maxCacheReadTokens: 50_000 },
    policy: {
      profileRef: 'execution_budget.roles.worker.default',
      policyDigest: 'a'.repeat(64),
      landing: { reserve_ratio: 0.25, attended_unsupported: 'allow-hard-stop' },
    },
    expiresAt: new Date(NOW.getTime() + 120_000).toISOString(),
  });
  const request = authority.submit({
    requester: { role: 'brain', instanceId: 'run-a' },
    userId: 'owner-a',
    summary: 'Approve one attended hard-stop attempt',
    binding,
    createdAt: new Date(NOW.getTime() - 1_000).toISOString(),
  });
  const ingress = new ApprovalDecisionIngress({
    broker,
    authenticator,
    integrity,
    channel: 'terminal',
    now: () => NOW,
  });
  const expected = {
    proposalDigest: binding.proposalDigest,
    taskDigest: binding.taskDigest,
    promptDigest: binding.promptDigest,
    scopeDigest: binding.scopeDigest,
    acceptanceDigest: binding.acceptanceDigest,
    tenantId: binding.tenantId,
    projectId: binding.projectId,
    runId: binding.runId,
    taskId: binding.taskId,
    provider: binding.provider,
    model: binding.model,
    backend: binding.backend,
    budget: binding.budget,
    policy: binding.policy,
  };
  return {
    root,
    receiptStoreDir: join(base, 'host-receipts'),
    broker,
    authenticator,
    authority,
    binding,
    request,
    ingress,
    expected,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('AttendedExecutionApprovalAuthority', () => {
  it('binds a live-session allow to the exact final dispatch and writes one immutable receipt', async () => {
    const f = fixture();
    const decision = await f.ingress.decide({
      requestId: f.request.id,
      action: 'allow',
      idempotencyKey: 'allow-attempt-a',
      reason: 'owner reviewed the hard-stop risk',
    });
    expect(decision.kind).toBe('decided');

    const grant = f.authority.verifyAndClaim(f.request.id, f.expected);
    expect(grant.receipt).toMatchObject({
      requestId: f.request.id,
      binding: f.binding,
    });
    expect(readFileSync(
      join(f.receiptStoreDir, `${grant.receipt.receiptId}.json`),
      'utf-8',
    )).not.toContain(f.authenticator.identity.sessionRef);

    expect(() => assertExecutionLandingSupport({
      budget: f.binding.budget,
      policy: f.binding.policy.landing,
      mode: 'attended',
      capability: 'unsupported',
      executor: 'subprocess',
      approvalGrant: grant,
      approvalExpectedDispatch: f.expected,
    })).not.toThrow();
  });

  it('rejects legacy/raw evidence, exact-binding drift, and receipt replay before dispatch', async () => {
    const f = fixture();
    expect(() => assertExecutionLandingSupport({
      budget: f.binding.budget,
      policy: f.binding.policy.landing,
      mode: 'attended',
      capability: 'unsupported',
      executor: 'subprocess',
      approvalEvidenceRef: f.request.id,
      approvalExpectedDispatch: f.expected,
    })).toThrow('exact verified approval receipt');

    await f.ingress.decide({
      requestId: f.request.id,
      action: 'allow',
      idempotencyKey: 'allow-attempt-a',
    });
    expect(() => f.authority.verifyAndClaim(f.request.id, {
      ...f.expected,
      model: 'claude-sonnet-5',
    })).toThrow('does not exactly match');
    expect(() => f.authority.verifyAndClaim(f.request.id, {
      ...f.expected,
      policy: {
        ...f.expected.policy,
        policyDigest: 'f'.repeat(64),
      },
    })).toThrow('does not exactly match');

    f.authority.verifyAndClaim(f.request.id, f.expected);
    expect(() => f.authority.verifyAndClaim(f.request.id, f.expected))
      .toThrow('already consumed');
  });

  it('does not expose a constructible verified-grant shortcut', () => {
    expect(() => new VerifiedAttendedExecutionApproval({} as never, Symbol('forged')))
      .toThrow('can only be issued by the approval authority');
  });

  it('rejects unsigned, denied, expired, and revoked-session decisions', async () => {
    const unsigned = fixture();
    unsigned.broker.decide(unsigned.request.id, {
      decision: 'allow',
      decidedBy: 'owner-a',
      channel: 'legacy',
      decidedAt: NOW.toISOString(),
      reason: 'legacy decision',
    });
    expect(() => unsigned.authority.verifyAndClaim(unsigned.request.id, unsigned.expected))
      .toThrow('missing-authorization');

    const denied = fixture();
    await denied.ingress.decide({
      requestId: denied.request.id,
      action: 'deny',
      idempotencyKey: 'deny-attempt',
    });
    expect(() => denied.authority.verifyAndClaim(denied.request.id, denied.expected))
      .toThrow('was not allowed');

    const revoked = fixture();
    await revoked.ingress.decide({
      requestId: revoked.request.id,
      action: 'allow',
      idempotencyKey: 'allow-then-revoke',
    });
    revoked.authenticator.active = false;
    expect(() => revoked.authority.verifyAndClaim(revoked.request.id, revoked.expected))
      .toThrow('session-inactive');
  });
});
