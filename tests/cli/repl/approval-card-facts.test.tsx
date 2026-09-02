// tests/cli/repl/approval-card-facts.test.tsx
// ═══ TERMINAL-TOOLS-012 — ApprovalCard §4 shared focus-rail field set ═══════
//
// Single-surface contract §4 "Approval": requestor and responsible principal ·
// proposed action and affected resource · tenant/workspace and bounded scope ·
// source policy and effective authority · expiry, risk and timeout/default
// outcome · downstream consequence and known rollback/reconciliation limit ·
// safe, redacted arguments. Finding #4: the collapsed card omitted requestor,
// scope, expiry, default outcome, consequence and rollback limits. The facts
// are a pure projection of the contract (buildApprovalFacts) rendered as
// label/value rows; a fact the producer did not declare is shown as "not
// declared" — never invented. Hermetic (ink-testing-library, fixed clock).

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

function v1(details: Record<string, unknown> = { note: 'test' }): ApprovalRequest {
  const result = validateApprovalRequest({
    id: 'apr-facts-1',
    requester: { role: 'worker', instanceId: 'w-712' },
    summary: 'run rm -rf ./build',
    details,
    scopeId: 'sprint-712',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'acme',
    userId: 'alperen',
    createdAt: '2026-07-16T00:00:00.000Z',
    expiresAt: '2026-07-16T00:15:00.000Z',
    maskedArgs: { cmd: '***REDACTED***' },
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

describe('formatRemaining — catalog unit suffixes, coarse-to-fine', () => {
  it('renders h/m/s with the injected units and clamps the past to zero seconds', () => {
    const u = EN.facts.units;
    expect(formatRemaining(14 * 60_000 + 59_000, u)).toBe(`14${u.minutes} 59${u.seconds}`);
    expect(formatRemaining(2 * 3_600_000, u)).toBe(`2${u.hours} 0${u.minutes}`);
    expect(formatRemaining(7_000, u)).toBe(`7${u.seconds}`);
    expect(formatRemaining(-5, u)).toBe(`0${u.seconds}`);
  });
});

describe('buildApprovalFacts — the §4 field set as a pure projection', () => {
  it('v1: requester, action/resource, tenant, policy, expiry→default outcome, and honest not-declared rows', () => {
    const facts = buildApprovalFacts(v1(), EN, NOW);
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f]));
    expect(facts.map((f) => f.key)).toEqual(['requester', 'action', 'tenant', 'policy', 'expiry', 'consequence', 'rollback']);
    expect(byKey['requester']).toMatchObject({ label: EN.facts.requester, value: 'worker · w-712' });
    expect(byKey['action']!.value).toBe(`${EN.facts.scopeLabels['shell-exec']} · sprint-712`);
    expect(byKey['tenant']!.value).toBe('acme · alperen');
    expect(byKey['policy']!.value).toBe(EN.facts.policyLabels['require-approval']);
    expect(byKey['expiry']!.value).toBe(`${EN.facts.expiresIn.replace('{duration}', `14${EN.facts.units.minutes} 59${EN.facts.units.seconds}`)} → ${EN.facts.actionLabels['deny']}`);
    expect(byKey['consequence']!.value).toBe(EN.facts.notDeclared);
    expect(byKey['rollback']!.value).toBe(EN.facts.notDeclared);
  });

  it('v1 with declared consequence/rollback strings in details surfaces them verbatim', () => {
    const facts = buildApprovalFacts(v1({ consequence: 'build output is deleted', rollbackLimit: 'none — rebuild required' }), EN, NOW);
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.value]));
    expect(byKey['consequence']).toBe('build output is deleted');
    expect(byKey['rollback']).toBe('none — rebuild required');
  });

  it('v2: adds the lifecycle row (origin · tier · blocking · SLA stage) and the timeout disposition on the expiry row', () => {
    const facts = buildApprovalFacts(v2(), EN, NOW);
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.value]));
    expect(facts.map((f) => f.key)).toEqual(['requester', 'action', 'tenant', 'policy', 'lifecycle', 'expiry', 'consequence', 'rollback']);
    expect(byKey['lifecycle']).toBe(`${EN.facts.originLabels['autonomous-trigger']} · ${EN.facts.riskTierLabels['critical']} · ${EN.facts.blockingLabels['run']} · ${EN.facts.slaStageLabels['renotify']}`);
    expect(byKey['expiry']).toContain(`→ ${EN.facts.actionLabels['defer']}`);
    expect(byKey['expiry']).toContain(EN.facts.timeoutDispositionLabels['park-alert']);
    expect(byKey['consequence']).toBe('preview environment is replaced');
  });

  it('an expired request says so instead of a negative countdown', () => {
    const facts = buildApprovalFacts(v1(), EN, NOW + 3_600_000);
    const expiry = facts.find((f) => f.key === 'expiry')!.value;
    expect(expiry.startsWith(EN.facts.expired)).toBe(true);
  });
});

describe('ApprovalCard collapsed render — every §4 fact visible, raw args never', () => {
  it('shows the fact rows in en and tr and never renders rawArgsRef', async () => {
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
  });

  it('catalog rows exist in en and tr for the new fact labels', () => {
    for (const key of ['tui.approval_card.fact_requester', 'tui.approval_card.fact_rollback', 'tui.approval_card.not_declared', 'tui.approval_card.expires_in', 'tui.approval_card.expired', 'tui.approval_card.policy.require_approval', 'tui.approval_card.action.escalate', 'tui.approval_card.scope.git_mutation', 'tui.approval_card.origin.gateway_pairing', 'tui.approval_card.timeout.park_undecidable']) {
      expect(getMessageLanguages(key), key).toEqual(expect.arrayContaining(['en', 'tr']));
    }
  });

  void React;
});
