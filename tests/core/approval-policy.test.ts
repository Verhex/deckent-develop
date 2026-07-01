// ─── APR-POLICY — decidePolicy tests (task 353-003) ──────────────────────────
// Faithful behavior tests for the pure policy decision engine: first-match-wins
// rule resolution, wildcard match fields, the safe-side no-match fallback from
// defaultAction, and the hard risk=critical-never-auto-approve clamp.
import { describe, it, expect } from 'vitest';
import { decidePolicy, type ApprovalPolicyRule } from '../../src/core/approval-policy.js';
import { approvalRequestSchema, type ApprovalRequest } from '../../src/core/approval-contract.js';
import type { z } from 'zod';

const CREATED_AT = '2026-07-01T21:00:00.000Z';
const EXPIRES_AT = '2026-07-01T21:15:00.000Z';

function buildRequest(overrides: Partial<z.input<typeof approvalRequestSchema>> = {}): ApprovalRequest {
  return approvalRequestSchema.parse({
    id: 'apr-353-003-001',
    requester: { role: 'worker', instanceId: 'w-353-003' },
    summary: 'worker wants to run: rm -rf build/',
    details: { command: 'rm -rf build/' },
    scopeId: 'sprint-353',
    scope: 'shell-exec',
    risk: 'medium',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  });
}

describe('decidePolicy — first-match-wins', () => {
  it('returns the first matching rule action, ignoring later matches', () => {
    const rules: ApprovalPolicyRule[] = [
      { match: { scope: 'shell-exec' }, action: 'notify' },
      { match: { scope: 'shell-exec' }, action: 'deny' },
    ];
    const result = decidePolicy(buildRequest(), rules);
    expect(result.policy).toBe('notify');
    expect(result.reason).toContain('scope=shell-exec');
  });

  it('is positional, not specificity-based — a broader earlier rule beats a narrower later one', () => {
    const rules: ApprovalPolicyRule[] = [
      { match: { risk: 'medium' }, action: 'auto-approve' },
      { match: { scope: 'shell-exec', risk: 'medium', tenantId: 'local' }, action: 'deny' },
    ];
    const result = decidePolicy(buildRequest(), rules);
    expect(result.policy).toBe('auto-approve');
  });

  it('skips non-matching rules and applies the next matching one', () => {
    const rules: ApprovalPolicyRule[] = [
      { match: { scope: 'network' }, action: 'deny' },
      { match: { scope: 'shell-exec' }, action: 'require-approval' },
    ];
    const result = decidePolicy(buildRequest(), rules);
    expect(result.policy).toBe('require-approval');
  });
});

describe('decidePolicy — wildcard match fields', () => {
  it('an empty match object matches every request', () => {
    const rules: ApprovalPolicyRule[] = [{ match: {}, action: 'notify' }];
    const result = decidePolicy(buildRequest({ scope: 'credential', risk: 'high' }), rules);
    expect(result.policy).toBe('notify');
  });

  it('matches on risk alone regardless of scope/requester/tenantId', () => {
    const rules: ApprovalPolicyRule[] = [{ match: { risk: 'high' }, action: 'require-approval' }];
    expect(decidePolicy(buildRequest({ risk: 'high', scope: 'network' }), rules).policy).toBe(
      'require-approval',
    );
    expect(decidePolicy(buildRequest({ risk: 'medium' }), rules).policy).not.toBe('require-approval');
  });

  it('matches on requester role', () => {
    const rules: ApprovalPolicyRule[] = [{ match: { requester: 'brain' }, action: 'auto-approve' }];
    const brainRequest = buildRequest({
      risk: 'low',
      requester: { role: 'brain', instanceId: 'brain-1' },
    });
    const workerRequest = buildRequest({ risk: 'low', requester: { role: 'worker', instanceId: 'w-1' } });
    expect(decidePolicy(brainRequest, rules).policy).toBe('auto-approve');
    expect(decidePolicy(workerRequest, rules).policy).not.toBe('auto-approve');
  });

  it('matches on tenantId', () => {
    const rules: ApprovalPolicyRule[] = [{ match: { tenantId: 'enterprise-42' }, action: 'notify' }];
    expect(decidePolicy(buildRequest({ risk: 'low', tenantId: 'enterprise-42' }), rules).policy).toBe(
      'notify',
    );
    expect(decidePolicy(buildRequest({ risk: 'low', tenantId: 'local' }), rules).policy).not.toBe(
      'notify',
    );
  });

  it('carries the matched rule timeoutMs through to the result', () => {
    const rules: ApprovalPolicyRule[] = [
      { match: { scope: 'shell-exec' }, action: 'require-approval', timeoutMs: 60_000 },
    ];
    const result = decidePolicy(buildRequest(), rules);
    expect(result.timeoutMs).toBe(60_000);
  });

  it('omits timeoutMs when the matched rule does not specify one', () => {
    const rules: ApprovalPolicyRule[] = [{ match: { scope: 'shell-exec' }, action: 'notify' }];
    const result = decidePolicy(buildRequest(), rules);
    expect(result.timeoutMs).toBeUndefined();
  });
});

describe('decidePolicy — no-match fallback (safe-side defaultAction mapping)', () => {
  it.each([
    ['deny', 'deny'],
    ['defer', 'require-approval'],
    ['escalate', 'notify'],
    ['allow', 'auto-approve'],
  ] as const)('defaultAction=%s -> policy=%s', (defaultAction, expectedPolicy) => {
    const request = buildRequest({ risk: 'low', defaultAction });
    const result = decidePolicy(request, []);
    expect(result.policy).toBe(expectedPolicy);
    expect(result.reason).toContain('no rule matched');
  });

  it('never elevates: an empty rule set always resolves via defaultAction, never a rule default', () => {
    const request = buildRequest({ risk: 'low', defaultAction: 'defer' });
    const result = decidePolicy(request, [{ match: { scope: 'network' }, action: 'auto-approve' }]);
    expect(result.policy).toBe('require-approval');
  });
});

describe('decidePolicy — risk=critical never auto-approve (hard clamp)', () => {
  it('clamps a matched rule that says auto-approve to deny', () => {
    const rules: ApprovalPolicyRule[] = [{ match: { scope: 'shell-exec' }, action: 'auto-approve' }];
    const result = decidePolicy(buildRequest({ risk: 'critical' }), rules);
    expect(result.policy).toBe('deny');
    expect(result.reason).toContain('clamped');
    expect(result.reason).toContain('risk=critical');
  });

  it('clamps the no-match fallback when defaultAction=allow maps to auto-approve', () => {
    const request = buildRequest({ risk: 'critical', defaultAction: 'allow' });
    const result = decidePolicy(request, []);
    expect(result.policy).toBe('deny');
    expect(result.reason).toContain('clamped');
  });

  it('does NOT clamp a matched rule that already says require-approval', () => {
    const rules: ApprovalPolicyRule[] = [{ match: { scope: 'shell-exec' }, action: 'require-approval' }];
    const result = decidePolicy(buildRequest({ risk: 'critical' }), rules);
    expect(result.policy).toBe('require-approval');
    expect(result.reason).not.toContain('clamped');
  });

  it('does NOT clamp a matched rule that says notify', () => {
    const rules: ApprovalPolicyRule[] = [{ match: { scope: 'shell-exec' }, action: 'notify' }];
    const result = decidePolicy(buildRequest({ risk: 'critical' }), rules);
    expect(result.policy).toBe('notify');
  });

  it('does NOT clamp a matched rule that says deny (already safe)', () => {
    const rules: ApprovalPolicyRule[] = [{ match: { scope: 'shell-exec' }, action: 'deny' }];
    const result = decidePolicy(buildRequest({ risk: 'critical' }), rules);
    expect(result.policy).toBe('deny');
    expect(result.reason).not.toContain('clamped');
  });

  it('non-critical risk is unaffected by the clamp — auto-approve passes through', () => {
    const rules: ApprovalPolicyRule[] = [{ match: { scope: 'shell-exec' }, action: 'auto-approve' }];
    const result = decidePolicy(buildRequest({ risk: 'high' }), rules);
    expect(result.policy).toBe('auto-approve');
  });
});

describe('decidePolicy — determinism / purity', () => {
  it('is a pure function: identical inputs always produce identical outputs', () => {
    const request = buildRequest({ risk: 'medium' });
    const rules: ApprovalPolicyRule[] = [{ match: { scope: 'shell-exec' }, action: 'notify' }];
    const first = decidePolicy(request, rules);
    const second = decidePolicy(request, rules);
    expect(first).toEqual(second);
  });

  it('does not mutate the request or the rules array', () => {
    const request = buildRequest();
    const rules: ApprovalPolicyRule[] = [{ match: { scope: 'shell-exec' }, action: 'notify' }];
    const requestSnapshot = JSON.parse(JSON.stringify(request));
    const rulesSnapshot = JSON.parse(JSON.stringify(rules));
    decidePolicy(request, rules);
    expect(request).toEqual(requestSnapshot);
    expect(rules).toEqual(rulesSnapshot);
  });
});
