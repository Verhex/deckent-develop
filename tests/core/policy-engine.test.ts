import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '../../src/core/policy-engine.js';
import type { PolicyInput } from '../../src/core/policy-engine.js';
import type { TaskDNA, ActivationConfig } from '../../src/core/routing-types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────
// tenantId 'acme' satisfies TENANT_ID_RE (/^[a-z0-9][a-z0-9-]{0,62}$/) so RBAC's
// can() is not short-circuited by tenant validation — the role/permission matrix
// is what actually drives the rbac-layer outcome.

const TENANT = 'acme';

function securityDNA(): TaskDNA {
  return {
    intent: { primary: 'security', secondary: ['testing'], confidence: 0.85 },
    tags: [],
    domains: [{ name: 'auth', weight: 0.6 }],
    operations: [{ type: 'modify', weight: 0.7 }],
    complexity: { fileCount: 2, moduleCount: 1, crossCutting: false, estimatedSize: 'small' },
    scope: { writeRatio: { 'src/': 1.0 }, primaryWriteTarget: 'src/', testWriteRatio: 0 },
  };
}

/** Activation config that strongly matches securityDNA → score 10 ≥ minScore 5. */
function strongActivation(): ActivationConfig {
  return {
    rules: [{ name: 'security-primary', when: { 'intent.primary': 'security' }, score: 10 }],
    exclude: [],
    minScore: 5,
  };
}

/** Activation config whose rules do NOT match securityDNA → score 0 < minScore 5. */
function weakActivation(): ActivationConfig {
  return {
    rules: [{ name: 'design-primary', when: { 'intent.primary': 'design' }, score: 10 }],
    exclude: [],
    minScore: 5,
  };
}

/** Activation config whose exclusion rule matches securityDNA → excluded:true. */
function excludingActivation(): ActivationConfig {
  return {
    rules: [{ name: 'security-primary', when: { 'intent.primary': 'security' }, score: 10 }],
    exclude: [{ name: 'no-security', when: { 'intent.primary': 'security' }, reason: 'security off-limits' }],
    minScore: 5,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('policy-engine', () => {
  describe('evaluatePolicy — decision paths', () => {
    it('permits when every evaluated layer passes', () => {
      const input: PolicyInput = {
        rbac: { role: 'viewer', action: 'read', tenantId: TENANT },
        activation: { taskDNA: securityDNA(), config: strongActivation() },
        condition: { data: { ready: true }, when: { ready: true } },
      };
      const result = evaluatePolicy(input);
      expect(result.decision).toBe('permit');
      expect(result.layers.rbac?.allowed).toBe(true);
      expect(result.layers.activation?.meetsMinScore).toBe(true);
      expect(result.layers.condition?.passed).toBe(true);
    });

    it('permits an empty policy (no layers ⇒ nothing blocks)', () => {
      const result = evaluatePolicy({});
      expect(result.decision).toBe('permit');
      expect(result.layers).toEqual({ rbac: null, activation: null, condition: null });
      expect(result.reasons).toEqual([]);
    });

    it('denies on RBAC authorization failure (hard)', () => {
      // viewer lacks WRITE in PERMISSION_MATRIX → can() returns false.
      const result = evaluatePolicy({
        rbac: { role: 'viewer', action: 'write', tenantId: TENANT },
      });
      expect(result.decision).toBe('deny');
      expect(result.layers.rbac?.allowed).toBe(false);
      expect(result.reasons.some(r => r.includes('denied'))).toBe(true);
    });

    it('denies when an activation exclusion rule matches (hard)', () => {
      const result = evaluatePolicy({
        activation: { taskDNA: securityDNA(), config: excludingActivation() },
      });
      expect(result.decision).toBe('deny');
      expect(result.layers.activation?.excluded).toBe(true);
      expect(result.layers.activation?.excludeReason).toBe('security off-limits');
    });

    it('parks when the condition gate fails (precondition unmet, not forbidden)', () => {
      const result = evaluatePolicy({
        rbac: { role: 'viewer', action: 'read', tenantId: TENANT },
        condition: { data: { ready: false }, when: { ready: true } },
      });
      expect(result.decision).toBe('park');
      expect(result.layers.condition?.passed).toBe(false);
    });

    it('suggests when activation is below minScore (permitted-but-weak)', () => {
      const result = evaluatePolicy({
        rbac: { role: 'viewer', action: 'read', tenantId: TENANT },
        activation: { taskDNA: securityDNA(), config: weakActivation() },
      });
      expect(result.decision).toBe('suggest');
      expect(result.layers.activation?.meetsMinScore).toBe(false);
      expect(result.layers.activation?.score).toBe(0);
    });
  });

  describe('precedence', () => {
    it('RBAC deny outranks a failing condition gate (deny beats park)', () => {
      const result = evaluatePolicy({
        rbac: { role: 'viewer', action: 'write', tenantId: TENANT }, // denied
        condition: { data: { ready: false }, when: { ready: true } }, // would park
      });
      expect(result.decision).toBe('deny');
    });

    it('activation exclusion outranks weak activation and a failing gate', () => {
      const result = evaluatePolicy({
        activation: { taskDNA: securityDNA(), config: excludingActivation() },
        condition: { data: { ready: false }, when: { ready: true } },
      });
      expect(result.decision).toBe('deny');
    });

    it('failing gate (park) outranks weak activation (suggest)', () => {
      const result = evaluatePolicy({
        activation: { taskDNA: securityDNA(), config: weakActivation() }, // would suggest
        condition: { data: { ready: false }, when: { ready: true } },      // parks
      });
      expect(result.decision).toBe('park');
    });
  });

  describe('delegation — outcomes are driven by the real underlying functions', () => {
    it('rbac layer reflects can(): admin+admin permitted, viewer+admin denied', () => {
      const permit = evaluatePolicy({ rbac: { role: 'admin', action: 'admin', tenantId: TENANT } });
      expect(permit.layers.rbac?.allowed).toBe(true);
      expect(permit.decision).toBe('permit');

      const deny = evaluatePolicy({ rbac: { role: 'viewer', action: 'admin', tenantId: TENANT } });
      expect(deny.layers.rbac?.allowed).toBe(false);
      expect(deny.decision).toBe('deny');
    });

    it('rbac layer denies on an invalid tenantId (delegates to isValidTenantId via can())', () => {
      // 'Bad_Tenant' violates TENANT_ID_RE → can() returns false even for a valid role/perm.
      const result = evaluatePolicy({ rbac: { role: 'admin', action: 'admin', tenantId: 'Bad_Tenant' } });
      expect(result.layers.rbac?.allowed).toBe(false);
      expect(result.decision).toBe('deny');
    });

    it('activation layer reflects evaluateActivation() score + matched rules', () => {
      const result = evaluatePolicy({
        activation: { taskDNA: securityDNA(), config: strongActivation() },
      });
      expect(result.layers.activation?.score).toBe(10);
      expect(result.layers.activation?.matchedRules).toContain('security-primary');
    });

    it('condition layer reflects evaluateCondition() operator semantics ($gt)', () => {
      const pass = evaluatePolicy({ condition: { data: { count: 7 }, when: { count: { $gt: 5 } } } });
      expect(pass.layers.condition?.passed).toBe(true);
      expect(pass.decision).toBe('permit');

      const fail = evaluatePolicy({ condition: { data: { count: 3 }, when: { count: { $gt: 5 } } } });
      expect(fail.layers.condition?.passed).toBe(false);
      expect(fail.decision).toBe('park');
    });
  });

  describe('purity', () => {
    it('does not mutate the input', () => {
      const input: PolicyInput = {
        rbac: { role: 'viewer', action: 'read', tenantId: TENANT },
        activation: { taskDNA: securityDNA(), config: strongActivation() },
      };
      const snapshot = JSON.stringify(input);
      evaluatePolicy(input);
      expect(JSON.stringify(input)).toBe(snapshot);
    });
  });
});
