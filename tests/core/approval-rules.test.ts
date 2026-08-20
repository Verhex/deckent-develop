// ─── Approval rules store (DE2a) — removable-automation pins ────────────────
//
// Pins: (1) fail-soft load — missing=empty, corrupt=fault-flag, invalid rows
// dropped never trusted; (2) atomic save round-trips; (3) the ADVISORY
// matcher honors idPrefix + summaryIncludes + disabled + expiresAt with
// first-match-wins; (4) critical tier is unrepresentable in a valid rule;
// (5) promotion from an explicit decision scopes to the id-prefix family,
// records provenance and is always routine-tier.

import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  approvalRulesPath,
  loadApprovalRules,
  matchApprovalRule,
  promoteRuleFromDecision,
  saveApprovalRules,
  type ApprovalRule,
} from '../../src/core/approval-rules.js';

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'approval-rules-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function rule(over: Partial<ApprovalRule> = {}): ApprovalRule {
  return {
    id: 'rule-00000001',
    createdAt: '2026-08-20T10:00:00.000Z',
    createdBy: 'alperen',
    reason: 'probe approvals are routine',
    match: { idPrefix: 'aprp-', riskTierMax: 'routine' },
    decision: 'allow',
    source: 'manual',
    ...over,
  };
}

describe('approval rules store', () => {
  it('loads fail-soft and saves atomically (round-trip)', () => {
    const root = fixtureRoot();
    expect(loadApprovalRules(root)).toEqual({ rules: [], fault: false });

    saveApprovalRules(root, [rule()]);
    expect(loadApprovalRules(root)).toEqual({ rules: [rule()], fault: false });

    // Corrupt file: fault flagged, nothing trusted.
    writeFileSync(approvalRulesPath(root), '{broken', 'utf-8');
    expect(loadApprovalRules(root)).toEqual({ rules: [], fault: true });

    // Invalid rows (critical tier, missing prefix) are dropped WITH a fault flag.
    mkdirSync(dirname(approvalRulesPath(root)), { recursive: true });
    writeFileSync(approvalRulesPath(root), JSON.stringify({
      schemaVersion: 1,
      rules: [rule(), { ...rule({ id: 'rule-bad' }), match: { idPrefix: 'aex-', riskTierMax: 'critical' } }],
    }), 'utf-8');
    const loaded = loadApprovalRules(root);
    expect(loaded.rules.map(r => r.id)).toEqual(['rule-00000001']);
    expect(loaded.fault).toBe(true);

    // Malformed OPTIONAL fields and an invalid source are equally dropped —
    // a rules file is authority input, partial trust is forbidden.
    writeFileSync(approvalRulesPath(root), JSON.stringify({
      schemaVersion: 1,
      rules: [
        rule(),
        { ...rule({ id: 'rule-bad-exp' }), expiresAt: 'not-a-date' },
        { ...rule({ id: 'rule-bad-dis' }), disabled: 'yes' },
        { ...rule({ id: 'rule-bad-sum' }), match: { idPrefix: 'aprp-', summaryIncludes: 42, riskTierMax: 'routine' } },
        { ...rule({ id: 'rule-bad-src' }), source: 'system-minted' },
      ],
    }), 'utf-8');
    const strict = loadApprovalRules(root);
    expect(strict.rules.map(r => r.id)).toEqual(['rule-00000001']);
    expect(strict.fault).toBe(true);
  });

  it('advisory matcher: prefix + summary + disabled + expiry, first match wins', () => {
    const now = new Date('2026-08-20T12:00:00.000Z');
    const rules: ApprovalRule[] = [
      rule({ id: 'rule-disabled', disabled: true }),
      rule({ id: 'rule-expired', expiresAt: '2026-08-20T11:00:00.000Z' }),
      rule({ id: 'rule-summary', match: { idPrefix: 'aprp-', summaryIncludes: 'CODEX', riskTierMax: 'routine' } }),
      rule({ id: 'rule-broad' }),
    ];
    const codexProbe = { id: 'aprp-abc', summary: 'codex/gpt-5.6-sol hakemi için sınırlı reachability probe' };
    expect(matchApprovalRule(codexProbe, rules, now)?.id).toBe('rule-summary');
    const otherProbe = { id: 'aprp-def', summary: 'some other probe' };
    expect(matchApprovalRule(otherProbe, rules, now)?.id).toBe('rule-broad');
    expect(matchApprovalRule({ id: 'cnf-xyz', summary: 'x' }, rules, now)).toBeNull();
  });

  it('promotion scopes to the id-prefix family with provenance, routine-tier always', () => {
    const promoted = promoteRuleFromDecision({
      requestId: 'aprp-7662509635c62681',
      decision: 'allow',
      createdBy: 'alperen',
      reason: 'owner-delegated probe approvals',
      now: new Date('2026-08-20T12:00:00.000Z'),
    });
    expect(promoted.match).toEqual({ idPrefix: 'aprp-', riskTierMax: 'routine' });
    expect(promoted.source).toBe('promoted-from:aprp-7662509635c62681');
    expect(promoted.decision).toBe('allow');
    expect(promoted.id).toMatch(/^rule-[0-9a-f]{8}$/u);
  });
});
