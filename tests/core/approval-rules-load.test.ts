// ─── APR-RULES-LOAD — loadApprovalRules tests (task 354-012) ────────────────
// Faithful behavior tests for the pure config -> ApprovalPolicyRule[] loader:
// valid/broken/mixed rule sets, the safe-default fallback path, fail-soft
// warnings (never silent drop, never throw), and end-to-end compatibility with
// decidePolicy (output requires zero adaptation).
import { describe, it, expect } from 'vitest';
import {
  loadApprovalRules,
  SAFE_DEFAULT_APPROVAL_RULES,
} from '../../src/core/approval-rules-load.js';
import { decidePolicy } from '../../src/core/approval-policy.js';
import { approvalRequestSchema, type ApprovalRequest } from '../../src/core/approval-contract.js';
import type { z } from 'zod';

const CREATED_AT = '2026-07-01T21:00:00.000Z';
const EXPIRES_AT = '2026-07-01T21:15:00.000Z';

function buildRequest(overrides: Partial<z.input<typeof approvalRequestSchema>> = {}): ApprovalRequest {
  return approvalRequestSchema.parse({
    id: 'apr-354-012-001',
    requester: { role: 'worker', instanceId: 'w-354-012' },
    summary: 'worker wants to run: rm -rf build/',
    details: { command: 'rm -rf build/' },
    scopeId: 'sprint-354',
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

describe('loadApprovalRules — valid rule sets', () => {
  it('loads a fully valid rule set in original order', () => {
    const result = loadApprovalRules({
      approval: {
        rules: [
          { match: { scope: 'network' }, action: 'deny' },
          { match: { risk: 'high' }, action: 'require-approval', timeoutMs: 30_000 },
          { match: {}, action: 'notify' },
        ],
      },
    });
    expect(result.warnings).toEqual([]);
    expect(result.rules).toEqual([
      { match: { scope: 'network' }, action: 'deny' },
      { match: { risk: 'high' }, action: 'require-approval', timeoutMs: 30_000 },
      { match: {}, action: 'notify' },
    ]);
  });

  it('accepts every match field (scope, risk, requester, tenantId) combined', () => {
    const result = loadApprovalRules({
      approval: {
        rules: [
          {
            match: { scope: 'credential', risk: 'critical', requester: 'connector', tenantId: 'enterprise-42' },
            action: 'deny',
          },
        ],
      },
    });
    expect(result.warnings).toEqual([]);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]).toEqual({
      match: { scope: 'credential', risk: 'critical', requester: 'connector', tenantId: 'enterprise-42' },
      action: 'deny',
    });
  });

  it('omits timeoutMs from the output when not provided on input', () => {
    const result = loadApprovalRules({ approval: { rules: [{ match: {}, action: 'notify' }] } });
    expect(result.rules[0]).not.toHaveProperty('timeoutMs');
  });
});

describe('loadApprovalRules — broken rule sets (fail-soft, never throws)', () => {
  it('skips a rule with an unknown field and records a warning', () => {
    const result = loadApprovalRules({
      approval: {
        rules: [{ match: {}, action: 'notify', bogusField: 'nope' }],
      },
    });
    expect(result.rules).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('approval.rules[0] skipped');
  });

  it('skips a rule with an unknown enum value on match.risk', () => {
    const result = loadApprovalRules({
      approval: {
        rules: [{ match: { risk: 'ultra-mega-critical' }, action: 'deny' }],
      },
    });
    expect(result.rules).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('approval.rules[0] skipped');
  });

  it('skips a rule with an unknown enum value on action', () => {
    const result = loadApprovalRules({
      approval: { rules: [{ match: {}, action: 'yolo-approve' }] },
    });
    expect(result.rules).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('skips a rule with a missing required field (action)', () => {
    const result = loadApprovalRules({
      approval: { rules: [{ match: { scope: 'network' } }] },
    });
    expect(result.rules).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('skips a rule with an unknown field nested inside match', () => {
    const result = loadApprovalRules({
      approval: { rules: [{ match: { risk: 'high', bogus: true }, action: 'deny' }] },
    });
    expect(result.rules).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('skips a rule with a non-positive timeoutMs', () => {
    const result = loadApprovalRules({
      approval: { rules: [{ match: {}, action: 'notify', timeoutMs: -5 }] },
    });
    expect(result.rules).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('never throws — a rule entry of the wrong type (string) is skipped, not fatal', () => {
    expect(() =>
      loadApprovalRules({ approval: { rules: ['not-an-object', 42, null] } }),
    ).not.toThrow();
    const result = loadApprovalRules({ approval: { rules: ['not-an-object', 42, null] } });
    expect(result.rules).toEqual([]);
    expect(result.warnings).toHaveLength(3);
  });

  it('an all-invalid array does NOT silently fall back to safe defaults', () => {
    const result = loadApprovalRules({
      approval: { rules: [{ match: {}, action: 'bogus' }] },
    });
    expect(result.rules).toEqual([]);
    expect(result.rules).not.toEqual(SAFE_DEFAULT_APPROVAL_RULES);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('loadApprovalRules — mixed valid/invalid rule sets', () => {
  it('keeps valid entries, skips invalid ones, warns once per skip, preserves valid order', () => {
    const result = loadApprovalRules({
      approval: {
        rules: [
          { match: { scope: 'network' }, action: 'deny' },
          { match: { risk: 'nonsense' }, action: 'deny' },
          { match: { risk: 'medium' }, action: 'notify' },
          { match: {}, action: 'invalid-action' },
          { match: { requester: 'brain' }, action: 'auto-approve' },
        ],
      },
    });
    expect(result.rules).toEqual([
      { match: { scope: 'network' }, action: 'deny' },
      { match: { risk: 'medium' }, action: 'notify' },
      { match: { requester: 'brain' }, action: 'auto-approve' },
    ]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('approval.rules[1]');
    expect(result.warnings[1]).toContain('approval.rules[3]');
  });
});

describe('loadApprovalRules — empty/absent -> safe default set', () => {
  it('returns safe defaults with no warnings when config has no approval field', () => {
    const result = loadApprovalRules({});
    expect(result.warnings).toEqual([]);
    expect(result.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
  });

  it('returns safe defaults with no warnings when approval is null', () => {
    const result = loadApprovalRules({ approval: null });
    expect(result.warnings).toEqual([]);
    expect(result.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
  });

  it('returns safe defaults with no warnings when approval has no rules field', () => {
    const result = loadApprovalRules({ approval: {} });
    expect(result.warnings).toEqual([]);
    expect(result.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
  });

  it('returns safe defaults with no warnings when approval.rules is null', () => {
    const result = loadApprovalRules({ approval: { rules: null } });
    expect(result.warnings).toEqual([]);
    expect(result.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
  });

  it('returns safe defaults with no warnings when approval.rules is an empty array', () => {
    const result = loadApprovalRules({ approval: { rules: [] } });
    expect(result.warnings).toEqual([]);
    expect(result.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
  });

  it('returns safe defaults + a warning when approval.rules is not an array', () => {
    const result = loadApprovalRules({ approval: { rules: 'not-an-array' } });
    expect(result.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('approval.rules must be an array');
  });

  it('returns safe defaults + a warning when approval is not an object', () => {
    const result = loadApprovalRules({ approval: 'nope' });
    expect(result.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
    expect(result.warnings).toHaveLength(1);
  });

  it.each([null, undefined, 42, 'str', []] as const)(
    'returns safe defaults with no warnings for a non-object root config: %p',
    (rawConfig) => {
      const result = loadApprovalRules(rawConfig);
      expect(result.warnings).toEqual([]);
      expect(result.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
    },
  );
});

describe('SAFE_DEFAULT_APPROVAL_RULES — safe-ordered default set', () => {
  it('has exactly 5 rules, risk-ordered critical -> high -> medium -> low -> none', () => {
    expect(SAFE_DEFAULT_APPROVAL_RULES.map((r) => r.match.risk)).toEqual([
      'critical',
      'high',
      'medium',
      'low',
      'none',
    ]);
  });

  it('maps critical and high to require-approval', () => {
    expect(SAFE_DEFAULT_APPROVAL_RULES.find((r) => r.match.risk === 'critical')?.action).toBe(
      'require-approval',
    );
    expect(SAFE_DEFAULT_APPROVAL_RULES.find((r) => r.match.risk === 'high')?.action).toBe(
      'require-approval',
    );
  });

  it('maps medium to notify', () => {
    expect(SAFE_DEFAULT_APPROVAL_RULES.find((r) => r.match.risk === 'medium')?.action).toBe('notify');
  });

  it('maps low and none to auto-approve', () => {
    expect(SAFE_DEFAULT_APPROVAL_RULES.find((r) => r.match.risk === 'low')?.action).toBe('auto-approve');
    expect(SAFE_DEFAULT_APPROVAL_RULES.find((r) => r.match.risk === 'none')?.action).toBe('auto-approve');
  });
});

describe('loadApprovalRules — output feeds decidePolicy() directly (no adaptation)', () => {
  it('default rules resolve every risk tier through decidePolicy as documented', () => {
    const { rules } = loadApprovalRules({});
    expect(decidePolicy(buildRequest({ risk: 'critical' }), rules).policy).toBe('require-approval');
    expect(decidePolicy(buildRequest({ risk: 'high' }), rules).policy).toBe('require-approval');
    expect(decidePolicy(buildRequest({ risk: 'medium' }), rules).policy).toBe('notify');
    expect(decidePolicy(buildRequest({ risk: 'low' }), rules).policy).toBe('auto-approve');
    expect(decidePolicy(buildRequest({ risk: 'none' }), rules).policy).toBe('auto-approve');
  });

  it('a loaded custom rule set resolves through decidePolicy identically to a hand-built one', () => {
    const { rules } = loadApprovalRules({
      approval: { rules: [{ match: { scope: 'credential' }, action: 'deny' }] },
    });
    const result = decidePolicy(buildRequest({ scope: 'credential', risk: 'low' }), rules);
    expect(result.policy).toBe('deny');
    expect(result.reason).toContain('scope=credential');
  });
});

describe('loadApprovalRules — purity', () => {
  it('does not mutate the input config object', () => {
    const config = { approval: { rules: [{ match: { risk: 'high' }, action: 'deny' }] } };
    const snapshot = JSON.parse(JSON.stringify(config));
    loadApprovalRules(config);
    expect(config).toEqual(snapshot);
  });

  it('is a pure function: identical input always produces an equivalent result', () => {
    const config = { approval: { rules: [{ match: { risk: 'high' }, action: 'deny' }] } };
    const first = loadApprovalRules(config);
    const second = loadApprovalRules(config);
    expect(first).toEqual(second);
  });
});
