// ─── Approval rules ENGINE (D2b-2a) — automation-safety pins ────────────────
//
// Pins: (1) the automation allowlist — only provider-evidence-probe kinds are
// automatable; mirrors/unknown kinds never; (2) liveRuleFor fresh-loads and a
// fault-flagged file automates NOTHING; (3) the authenticator dies with the
// rule: disable/remove between mint and verify invalidates the session (the
// digest-bound proof); (4) the envelope actor is rule:<id> under the engine's
// authorityRef.

import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  APPROVAL_RULES_ENGINE_AUTHORITY_REF,
  RuleEngineApprovalAuthenticator,
  liveRuleFor,
  requestTierFor,
} from '../../src/core/approval-rules-engine.js';
import { saveApprovalRules, type ApprovalRule } from '../../src/core/approval-rules.js';
import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import { ApprovalBroker } from '../../src/core/approval-broker.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  type ApprovalDecisionIntegrityAuthority,
  type LiveApprovalAuthenticator,
} from '../../src/core/approval-decision-ingress.js';

class Integrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return { keyId: 'rules-test', mac: createHmac('sha256', 'rules-key').update(payload).digest('hex') };
  }
  verify(keyId: string, payload: string, mac: string): boolean {
    const expected = this.sign(payload).mac;
    return keyId === 'rules-test' && mac.length === expected.length
      && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  }
}

const NOW = new Date('2026-08-20T18:00:00.000Z');

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'rules-engine-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function probeRequest(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    version: 1,
    id: 'aprp-' + 'a'.repeat(64),
    requester: { role: 'brain', instanceId: 'xverify' },
    summary: 'codex/gpt-5.6-sol hakemi için sınırlı reachability probe',
    details: { schemaVersion: 1, kind: 'provider-evidence-probe' },
    scopeId: 'p', scope: 'network', risk: 'low', policy: 'require-approval',
    defaultAction: 'deny', tenantId: 'main', userId: 'alperen',
    createdAt: '2026-08-20T17:59:00.000Z', expiresAt: '2026-08-20T18:30:00.000Z',
    maskedArgs: null, rawArgsRef: null,
    ...over,
  } as ApprovalRequest;
}

function rule(over: Partial<ApprovalRule> = {}): ApprovalRule {
  return {
    id: 'rule-engine01', createdAt: '2026-08-20T17:00:00.000Z', createdBy: 'alperen',
    reason: 'probe approvals are routine',
    match: { idPrefix: 'aprp-', riskTierMax: 'routine' },
    decision: 'allow', source: 'manual',
    ...over,
  };
}

describe('approval rules engine', () => {
  it('automation allowlist: probes are routine; mirrors/unknown kinds are untouchable', () => {
    expect(requestTierFor(probeRequest())).toBe('routine');
    expect(requestTierFor(probeRequest({
      details: { schemaVersion: 1, kind: 'decision-federation-mirror' },
    }))).toBeNull();
    expect(requestTierFor(probeRequest({ details: {} }))).toBeNull();
  });

  it('liveRuleFor fresh-loads; a fault-flagged file automates nothing', () => {
    const root = fixtureRoot();
    expect(liveRuleFor(root, probeRequest(), NOW)).toBeNull();
    saveApprovalRules(root, [rule()]);
    expect(liveRuleFor(root, probeRequest(), NOW)?.id).toBe('rule-engine01');
    // A disabled rule dies immediately.
    saveApprovalRules(root, [rule({ disabled: true })]);
    expect(liveRuleFor(root, probeRequest(), NOW)).toBeNull();
  });

  it('the authenticator mints rule:<id> under the engine authorityRef and dies with the file', async () => {
    const root = fixtureRoot();
    saveApprovalRules(root, [rule()]);
    const auth = new RuleEngineApprovalAuthenticator(root, () => NOW);
    const context = { request: probeRequest() } as Parameters<RuleEngineApprovalAuthenticator['reauthenticate']>[0];

    const minted = await auth.reauthenticate(context);
    expect(minted).toMatchObject({
      actorId: 'rule:rule-engine01',
      authorityRef: APPROVAL_RULES_ENGINE_AUTHORITY_REF,
      tenantId: 'main',
    });
    const proof = {
      actorId: minted!.actorId, tenantId: minted!.tenantId, role: null,
      sessionRefHash: createHash('sha256').update(minted!.sessionRef, 'utf-8').digest('hex'),
      authorityRef: minted!.authorityRef,
    } as Parameters<RuleEngineApprovalAuthenticator['isSessionActive']>[0];
    expect(auth.isSessionActive(proof, context, NOW)).toBe(true);

    // Removing the rule AFTER mint kills the session (digest + live-rule both fail).
    saveApprovalRules(root, []);
    expect(auth.isSessionActive(proof, context, NOW)).toBe(false);
  });

  it('END-TO-END: a rule decision flows through the real ingress to a decided broker envelope', async () => {
    // Pins the full decideByRules path — the live-proof defect (2026-08-20)
    // was an ingress pre-check that forced actorId===userId for ALL actors,
    // rejecting every rule decision despite a passing authenticator suite.
    const root = fixtureRoot();
    saveApprovalRules(root, [rule()]);
    const broker = new ApprovalBroker(root);
    const request = broker.submit({
      id: 'aprp-' + 'b'.repeat(64),
      requester: { role: 'brain', instanceId: 'xverify' },
      summary: 'codex/gpt-5.6-sol hakemi için sınırlı reachability probe',
      details: { schemaVersion: 1, kind: 'provider-evidence-probe' },
      scopeId: 'p', scope: 'network', risk: 'low', policy: 'require-approval',
      defaultAction: 'deny', tenantId: 'main', userId: 'alperen',
      createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
      expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    });
    const ingress = new ApprovalDecisionIngress({
      broker,
      authenticator: new RuleEngineApprovalAuthenticator(root, () => NOW),
      integrity: new Integrity(),
      channel: 'rules-engine',
      now: () => NOW,
    });
    const outcome = await ingress.decide({
      requestId: request.id, action: 'allow',
      idempotencyKey: `rules-engine:${request.id}:allow`,
      reason: 'probe approvals are routine',
    });
    expect(outcome.kind).toBe('decided');
    if (outcome.kind !== 'decided') return;
    expect(outcome.decision).toMatchObject({
      decidedBy: 'rule:rule-engine01',
      channel: 'rules-engine',
    });
    expect(outcome.decision.authorization?.authorityRef).toBe(APPROVAL_RULES_ENGINE_AUTHORITY_REF);
    expect(broker.getDecision(request.id)?.decidedBy).toBe('rule:rule-engine01');

    // CONSUMER SIDE (the approval_untrusted live-proof defect): a validator
    // wired with the rule authenticator trusts the envelope; one without it
    // fails closed; deleting the rule kills trust at claim time.
    const integrity = new Integrity();
    const ruleAuth = new RuleEngineApprovalAuthenticator(root, () => NOW);
    const deadSessions: LiveApprovalAuthenticator = {
      reauthenticate: async () => null,
      isSessionActive: () => false,
    };
    const wired = new ApprovalDecisionAuthority(integrity, deadSessions, ruleAuth);
    expect(wired.validate(request, outcome.decision, NOW)).toMatchObject({ ok: true });
    const unwired = new ApprovalDecisionAuthority(integrity, deadSessions);
    expect(unwired.validate(request, outcome.decision, NOW))
      .toEqual({ ok: false, reason: 'session-inactive' });
    saveApprovalRules(root, []);
    expect(wired.validate(request, outcome.decision, NOW))
      .toEqual({ ok: false, reason: 'session-inactive' });
  });
});
