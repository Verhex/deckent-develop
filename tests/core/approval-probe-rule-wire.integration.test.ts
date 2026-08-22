import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  type ApprovalDecisionIntegrityAuthority,
  type LiveApprovalAuthenticator,
} from '../../src/core/approval-decision-ingress.js';
import {
  RuleEngineApprovalAuthenticator,
  liveRuleFor,
} from '../../src/core/approval-rules-engine.js';
import { saveApprovalRules, type ApprovalRule } from '../../src/core/approval-rules.js';
import {
  AttendedExecutionApprovalAuthority,
  AttendedExecutionApprovalError,
  attendedExecutionProjectId,
} from '../../src/core/attended-execution-approval.js';
import type { ProviderEvidenceProbeSubject } from '../../src/core/provider-evidence-probe-contract.js';

const NOW = new Date('2026-08-21T12:00:00.000Z');
const roots: string[] = [];

class Integrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return {
      keyId: 'rule-wire-key',
      mac: createHmac('sha256', 'rule-wire-secret').update(payload).digest('hex'),
    };
  }

  verify(keyId: string, payload: string, mac: string): boolean {
    const expected = this.sign(payload).mac;
    return keyId === 'rule-wire-key'
      && mac.length === expected.length
      && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  }
}

const unavailableHuman: LiveApprovalAuthenticator = {
  reauthenticate: async () => null,
  isSessionActive: () => false,
};

function ownerRule(overrides: Partial<ApprovalRule> = {}): ApprovalRule {
  return {
    id: 'rule-owner-01',
    createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    createdBy: 'owner-a',
    reason: 'owner delegated exact routine provider probes',
    match: {
      idPrefix: 'aprp-',
      summaryIncludes: 'exact codex probe',
      riskTierMax: 'routine',
    },
    decision: 'allow',
    source: 'manual',
    ...overrides,
  };
}

function fixture() {
  let now = NOW;
  const base = mkdtempSync(join(tmpdir(), 'approval-rule-wire-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const broker = new ApprovalBroker(projectRoot, {
    storeDir: join(base, 'broker'),
    clock: () => now,
  });
  const integrity = new Integrity();
  const ruleAuthenticator = new RuleEngineApprovalAuthenticator(projectRoot, () => now);
  const decisions = new ApprovalDecisionAuthority(integrity, unavailableHuman, ruleAuthenticator);
  const authority = new AttendedExecutionApprovalAuthority(projectRoot, broker, decisions, {
    receiptStoreDir: join(base, 'receipts'),
    proposalStoreDir: join(base, 'proposals'),
    dispatchClaimStoreDir: join(base, 'dispatch-claims'),
    operationClaimStoreDir: join(base, 'operation-claims'),
    now: () => now,
  });
  const ingress = new ApprovalDecisionIngress({
    broker,
    authenticator: ruleAuthenticator,
    integrity,
    channel: 'rules-engine',
    now: () => now,
  });
  const subject: ProviderEvidenceProbeSubject = {
    kind: 'provider-evidence-probe',
    tenantId: 'tenant-a',
    projectId: attendedExecutionProjectId(projectRoot),
    provider: 'codex',
    model: 'gpt-5.6-sol',
    backendScope: 'subprocess',
    executionProfileRef: 'probe.production-chain',
    attemptNonce: 'c'.repeat(64),
    budget: {
      billingMode: 'subscription',
      maxInputTokens: 100,
      maxOutputTokens: 10,
      maxTokens: 110,
      timeoutMs: 5_000,
    },
    ttl: {
      startsAt: new Date(NOW.getTime() - 1_000).toISOString(),
      expiresAt: new Date(NOW.getTime() + 90_000).toISOString(),
    },
  };
  const request = authority.submitProviderEvidenceProbe({
    requester: { role: 'brain', instanceId: 'brain-rule-wire' },
    userId: 'owner-a',
    summary: 'exact codex probe',
    subject,
    createdAt: NOW.toISOString(),
  });

  return {
    projectRoot,
    broker,
    authority,
    ingress,
    request,
    subject,
    setNow(value: Date) {
      now = value;
    },
  };
}

async function applyRule(
  projectRoot: string,
  ingress: ApprovalDecisionIngress,
  request: ApprovalRequest,
  now: Date,
) {
  const matched = liveRuleFor(projectRoot, request, now);
  if (matched === null) return null;
  return ingress.decide({
    requestId: request.id,
    action: matched.decision,
    idempotencyKey: `rules-engine:${request.id}:${matched.id}`,
    reason: matched.reason,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('provider probe production rule wire', () => {
  it('flows the real producer through the persisted first owner rule, signed ingress, and immutable one-shot claim', async () => {
    const f = fixture();
    saveApprovalRules(f.projectRoot, [
      ownerRule(),
      ownerRule({ id: 'rule-owner-02', reason: 'must lose first-write-wins' }),
    ]);

    expect(liveRuleFor(f.projectRoot, f.request, NOW)?.id).toBe('rule-owner-01');
    const outcome = await applyRule(f.projectRoot, f.ingress, f.request, NOW);
    expect(outcome).toMatchObject({
      kind: 'decided',
      decision: { decision: 'allow', decidedBy: 'rule:rule-owner-01', channel: 'rules-engine' },
    });
    expect(f.broker.getDecision(f.request.id)?.decidedBy).toBe('rule:rule-owner-01');

    const claim = f.authority.verifyAndClaimProviderEvidenceProbe(f.request.id, f.subject);
    expect(claim).toMatchObject({
      evidenceRef: `approval:${f.request.id}`,
      subject: f.subject,
    });
    expect(Object.isFrozen(claim)).toBe(true);
    expect(() => f.authority.verifyAndClaimProviderEvidenceProbe(f.request.id, f.subject))
      .toThrowError(expect.objectContaining<Partial<AttendedExecutionApprovalError>>({
        code: 'APPROVAL_ALREADY_CONSUMED',
      }));
  });

  it('fails closed for elevated/critical requests and a disabled owner rule', async () => {
    const f = fixture();
    saveApprovalRules(f.projectRoot, [ownerRule()]);

    for (const riskTier of ['elevated', 'critical'] as const) {
      const higherRisk = { ...f.request, riskTier } as ApprovalRequest;
      expect(liveRuleFor(f.projectRoot, higherRisk, NOW)).toBeNull();
    }

    saveApprovalRules(f.projectRoot, [ownerRule({ disabled: true })]);
    expect(await applyRule(f.projectRoot, f.ingress, f.request, NOW)).toBeNull();
    expect(f.broker.getDecision(f.request.id)).toBeNull();
    expect(() => f.authority.verifyAndClaimProviderEvidenceProbe(f.request.id, f.subject))
      .toThrowError(expect.objectContaining<Partial<AttendedExecutionApprovalError>>({
        code: 'DECISION_NOT_FOUND',
      }));
  });

  it('does not turn an expired produced request into a rule authorization or claim', async () => {
    const f = fixture();
    saveApprovalRules(f.projectRoot, [ownerRule()]);
    const expiredAt = new Date(Date.parse(f.request.expiresAt) + 1);
    f.setNow(expiredAt);

    const outcome = await applyRule(f.projectRoot, f.ingress, f.request, expiredAt);
    expect(outcome).toMatchObject({ kind: 'expired', requestId: f.request.id });
    expect(f.broker.getDecision(f.request.id)).toBeNull();
    expect(() => f.authority.verifyAndClaimProviderEvidenceProbe(f.request.id, f.subject))
      .toThrowError();
  });
});
