// tests/cli/repl/approval-card-facts.test.tsx
// ═══ TERMINAL-TOOLS-012 — ApprovalCard §4 shared focus-rail field set ═══════
//
// Single-surface contract §4 "Approval": identity, current condition and AGE ·
// requestor and responsible principal · proposed action and affected resource ·
// tenant/workspace and bounded scope · source policy and effective authority ·
// expiry, risk and timeout/default outcome · downstream consequence and known
// rollback/reconciliation limit · safe, redacted arguments. Finding #4: the
// collapsed card omitted requestor, scope, expiry, default outcome, consequence
// and rollback limits. The facts are a pure projection of the contract
// (buildApprovalFacts) rendered as label/value rows; a fact the producer did not
// declare is shown as "not declared" — never invented.
//
// TERMINAL-TOOLS-013 (design-critic closure): the object of the decision leads
// (action · resource, then the untruncated redacted arguments), the countdown
// is minute-grained above a minute (no once-a-second churn), the expiry →
// outcome relation is a worded catalog template (no structural arrow in the
// mechanism), and undeclared consequence/rollback on a high/critical request is
// emphasized rather than dimmed. Hermetic (ink-testing-library, fixed clock).

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ApprovalCard, buildApprovalFacts, formatRemaining } from '../../../src/cli/repl/approval-card.js';
import { buildApprovalLabels } from '../../../src/cli/repl/run.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';
import { validateApprovalRequest, type ApprovalRequest } from '../../../src/core/approval-contract.js';
import { approvalLifecycleProfileDigest } from '../../../src/core/approval-lifecycle-policy.js';
import type { ApprovalStreamEvent } from '../../../src/core/approval-eventstream.js';

const EN = buildApprovalLabels((k) => getMessage(k, 'en'));
const TR = buildApprovalLabels((k) => getMessage(k, 'tr'));
const NOW = Date.parse('2026-07-16T00:00:01.000Z');
const tick = (ms = 25): Promise<void> => new Promise((r) => setTimeout(r, ms));

function v1(details: Record<string, unknown> = { note: 'test' }, risk: ApprovalRequest['risk'] = 'high'): ApprovalRequest {
  const result = validateApprovalRequest({
    id: 'apr-facts-1',
    requester: { role: 'worker', instanceId: 'w-712' },
    summary: 'run rm -rf ./build',
    details,
    scopeId: 'sprint-712',
    scope: 'shell-exec',
    risk,
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'acme',
    userId: 'alperen',
    createdAt: '2026-07-16T00:00:00.000Z',
    expiresAt: '2026-07-16T00:15:00.000Z',
    maskedArgs: { cmd: '***REDACTED*** '.repeat(8).trim() },
  });
  if (!result.ok) throw new Error(`invalid fixture: ${result.errors.join('; ')}`);
  return result.value;
}

const V2_PROFILE = { ttlMs: 7_200_000, slaMs: [60_000, 600_000, 3_600_000] as [number, number, number], riskTier: 'critical' as const, timeoutDisposition: 'park-alert' as const, blocking: 'run' as const };

function v2(): ApprovalRequest {
  const result = validateApprovalRequest({
    id: 'apr-facts-2',
    version: '2.0',
    requester: { role: 'brain', instanceId: 'decision-federation:autonomous-trigger' },
    summary: 'autonomous trigger: deploy preview',
    details: { schemaVersion: 1, consequence: 'preview environment is replaced', rollbackLimit: 'no automatic rollback after DNS cut-over' },
    scopeId: 'autonomous-trigger',
    scope: 'lifecycle',
    risk: 'critical',
    policy: 'require-approval',
    defaultAction: 'defer',
    tenantId: 'acme',
    userId: 'ops',
    createdAt: '2026-07-16T00:00:00.000Z',
    expiresAt: '2026-07-16T02:00:00.000Z',
    maskedArgs: null,
    rawArgsRef: 'raw-ref-must-never-render',
    origin: 'autonomous-trigger',
    riskTier: 'critical',
    blocking: 'run',
    lifecycleProfile: V2_PROFILE,
    policySnapshotDigest: approvalLifecycleProfileDigest('autonomous-trigger', V2_PROFILE),
    source: { contractVersion: '2.0', requestDigest: 'b'.repeat(64), reference: 'trigger:42' },
    lifecycleGeneration: 'gen-1',
    slaStage: 'renotify',
  });
  if (!result.ok) throw new Error(`invalid fixture: ${result.errors.join('; ')}`);
  return result.value;
}

async function* oneRequest(request: ApprovalRequest): AsyncGenerator<ApprovalStreamEvent> {
  yield { kind: 'pending', request };
  await new Promise<void>(() => { /* keep mounted */ });
}

const u = EN.facts.units;

describe('formatRemaining — quiet, coarse-to-fine, catalog unit suffixes', () => {
  it('is minute-grained above a minute and second-grained only in the last minute; the past clamps to zero', () => {
    expect(formatRemaining(14 * 60_000 + 59_000, u)).toBe(`14${u.minutes}`);
    expect(formatRemaining(2 * 3_600_000 + 5 * 60_000, u)).toBe(`2${u.hours} 5${u.minutes}`);
    expect(formatRemaining(59_000, u)).toBe(`59${u.seconds}`);
    expect(formatRemaining(7_000, u)).toBe(`7${u.seconds}`);
    expect(formatRemaining(-5, u)).toBe(`0${u.seconds}`);
  });
});

describe('buildApprovalFacts — the §4 field set as a pure projection', () => {
  it('v1: action leads, then requester, tenant, policy, age, expiry→outcome (worded template), and honest not-declared rows', () => {
    const facts = buildApprovalFacts(v1(), EN, NOW);
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f]));
    expect(facts.map((f) => f.key)).toEqual(['action', 'requester', 'tenant', 'policy', 'age', 'expiry', 'consequence', 'rollback']);
    expect(byKey['action']).toMatchObject({ label: EN.facts.action, value: `${EN.facts.scopeLabels['shell-exec']} · sprint-712`, emphasis: true });
    expect(byKey['requester']).toMatchObject({ label: EN.facts.requester, value: 'worker · w-712', emphasis: false });
    expect(byKey['tenant']!.value).toBe('acme · alperen');
    expect(byKey['policy']!.value).toBe(EN.facts.policyLabels['require-approval']);
    expect(byKey['age']!.value).toBe(EN.facts.justNow);                                   // 1 s old → never a ticking "1s ago"
    expect(buildApprovalFacts(v1(), EN, NOW + 5 * 60_000).find((f) => f.key === 'age')!.value).toBe(EN.facts.ago.replace('{duration}', `5${u.minutes}`));
    expect(byKey['expiry']!.value).toBe(EN.facts.expiryOutcome.replace('{remaining}', `14${u.minutes}`).replace('{outcome}', EN.facts.actionLabels['deny']));
    expect(byKey['expiry']!.value).not.toContain('→');
    expect(byKey['consequence']).toMatchObject({ value: EN.facts.notDeclared, emphasis: true });   // high risk + undeclared
    expect(byKey['rollback']).toMatchObject({ value: EN.facts.notDeclared, emphasis: true });
  });

  it('undeclared consequence/rollback on a low-risk request is not emphasized; declared strings surface verbatim', () => {
    const low = buildApprovalFacts(v1({ note: 'x' }, 'low'), EN, NOW);
    expect(low.find((f) => f.key === 'consequence')).toMatchObject({ value: EN.facts.notDeclared, emphasis: false });
    const declared = buildApprovalFacts(v1({ consequence: 'build output is deleted', rollbackLimit: 'none — rebuild required' }), EN, NOW);
    const byKey = Object.fromEntries(declared.map((f) => [f.key, f]));
    expect(byKey['consequence']).toMatchObject({ value: 'build output is deleted', emphasis: false });
    expect(byKey['rollback']).toMatchObject({ value: 'none — rebuild required', emphasis: false });
  });

  it('v2: adds the lifecycle row (origin · tier · blocking · SLA stage) and the timeout disposition on the expiry row', () => {
    const facts = buildApprovalFacts(v2(), EN, NOW);
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.value]));
    expect(facts.map((f) => f.key)).toEqual(['action', 'requester', 'tenant', 'policy', 'lifecycle', 'age', 'expiry', 'consequence', 'rollback']);
    expect(byKey['lifecycle']).toBe(`${EN.facts.originLabels['autonomous-trigger']} · ${EN.facts.riskTierLabels['critical']} · ${EN.facts.blockingLabels['run']} · ${EN.facts.slaStageLabels['renotify']}`);
    expect(byKey['expiry']).toContain(EN.facts.actionLabels['defer']);
    expect(byKey['expiry']).toContain(EN.facts.timeoutDispositionLabels['park-alert']);
    expect(byKey['consequence']).toBe('preview environment is replaced');
  });

  it('an expired request says so (worded template) instead of a negative countdown', () => {
    const facts = buildApprovalFacts(v1(), EN, NOW + 3_600_000);
    const expiry = facts.find((f) => f.key === 'expiry')!.value;
    expect(expiry).toBe(EN.facts.expiredOutcome.replace('{outcome}', EN.facts.actionLabels['deny']));
  });
});

describe('ApprovalCard collapsed render — every §4 fact visible, arguments untruncated, raw args never', () => {
  it('shows the fact rows in en and tr, the full masked arguments, and never renders rawArgsRef', async () => {
    for (const labels of [EN, TR]) {
      const { lastFrame } = render(
        <ApprovalCard events={oneRequest(v2())} onDecide={() => {}} decidedBy="terminal" channel="terminal" labels={labels} now={() => NOW} />,
      );
      await tick();
      const frame = lastFrame() ?? '';
      expect(frame).toContain(labels.facts.requester);
      expect(frame).toContain('decision-federation:autonomous-trigger');
      expect(frame).toContain(labels.facts.scopeLabels['lifecycle']);
      expect(frame).toContain(labels.facts.policyLabels['require-approval']);
      expect(frame).toContain(labels.facts.actionLabels['defer']);
      expect(frame).toContain('preview environment is replaced');
      expect(frame).not.toContain('raw-ref-must-never-render');
    }
    const { lastFrame } = render(
      <ApprovalCard events={oneRequest(v1())} onDecide={() => {}} decidedBy="terminal" channel="terminal" labels={EN} now={() => NOW} />,
    );
    await tick();
    // Ink wraps the long argument line inside the bordered box: drop the box
    // border glyphs and collapse whitespace so the wrapped words re-join.
    const frame = (lastFrame() ?? '').replace(/│/g, ' ').replace(/\s+/g, ' ');
    expect(frame).toContain('cmd=' + '***REDACTED*** '.repeat(8).trim());   // 8 × 15 chars > the old 80-char ceiling
    expect(frame).not.toContain('…');
  });

  it('catalog rows exist in en and tr for the new fact labels', () => {
    for (const key of ['tui.approval_card.fact_requester', 'tui.approval_card.fact_age', 'tui.approval_card.ago', 'tui.approval_card.just_now', 'tui.approval_card.fact_rollback', 'tui.approval_card.not_declared', 'tui.approval_card.expiry_outcome', 'tui.approval_card.expired_outcome', 'tui.approval_card.policy.require_approval', 'tui.approval_card.action.escalate', 'tui.approval_card.scope.git_mutation', 'tui.approval_card.origin.gateway_pairing', 'tui.approval_card.timeout.park_undecidable']) {
      expect(getMessageLanguages(key), key).toEqual(expect.arrayContaining(['en', 'tr']));
    }
    expect(getMessage('tui.approval_card.fact_expiry', 'tr')).toBe('süre sonu');
  });

  void React;
});
