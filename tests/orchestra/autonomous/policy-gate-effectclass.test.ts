// tests/orchestra/autonomous/policy-gate-effectclass.test.ts
// Tests for computeEntryEffectClass + its integration with decidePolicy (G3 risk layer).
import { describe, it, expect } from 'vitest';
import {
  computeEntryEffectClass,
  decidePolicy,
} from '../../../src/orchestra/autonomous/policy-gate.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

const base: BacklogEntry = {
  id: 'e1', title: 'test entry', kind: 'task',
  spec: { description: '', scopeDir: '' },
  policy: 'risk-tagged',
  trigger: { type: 'one-off' }, status: 'pending',
  lastRun: null, lastResult: null,
};

// ─── computeEntryEffectClass unit tests ───────────────────────────────────────

describe('computeEntryEffectClass', () => {
  it('docs/audits/ scope → pure', () => {
    const entry: BacklogEntry = { ...base, spec: { scopeDir: 'docs/audits/' } };
    expect(computeEntryEffectClass(entry)).toBe('pure');
  });

  it('docs/ scope (non-audit) → reversible', () => {
    const entry: BacklogEntry = { ...base, spec: { scopeDir: 'docs/guides/' } };
    expect(computeEntryEffectClass(entry)).toBe('reversible');
  });

  it('src/ scope → reversible', () => {
    const entry: BacklogEntry = { ...base, spec: { scopeDir: 'src/core/' } };
    expect(computeEntryEffectClass(entry)).toBe('reversible');
  });

  it('kind=sprint (no scopeDir) → reversible', () => {
    const entry: BacklogEntry = { ...base, kind: 'sprint', spec: {} };
    expect(computeEntryEffectClass(entry)).toBe('reversible');
  });

  it('"npm publish" in description → critical-irreversible', () => {
    const entry: BacklogEntry = { ...base, spec: { description: 'Run npm publish to release v2.0' } };
    expect(computeEntryEffectClass(entry)).toBe('critical-irreversible');
  });

  it('"webhook" keyword in description → compensable', () => {
    const entry: BacklogEntry = { ...base, spec: { description: 'Call outbound webhook to notify upstream' } };
    expect(computeEntryEffectClass(entry)).toBe('compensable');
  });

  it('"db-migration" keyword in description → idempotent', () => {
    const entry: BacklogEntry = { ...base, spec: { description: 'Apply db-migration for new user table' } };
    expect(computeEntryEffectClass(entry)).toBe('idempotent');
  });

  it('no scope, no description → fail-safe critical-irreversible', () => {
    const entry: BacklogEntry = { ...base, spec: {} };
    expect(computeEntryEffectClass(entry)).toBe('critical-irreversible');
  });

  it('irreversible keyword takes priority over scope', () => {
    // Even if scope looks doc-like, an irreversible keyword in description wins.
    const entry: BacklogEntry = { ...base, spec: { description: 'publish', scopeDir: 'docs/' } };
    expect(computeEntryEffectClass(entry)).toBe('critical-irreversible');
  });
});

// ─── Integration: computeEntryEffectClass + decidePolicy G3 wire ──────────────

describe('decidePolicy G3 — risk-tagged entries with computed EffectClass', () => {
  it('(a) pure scope + risk-tagged → auto', () => {
    const entry: BacklogEntry = {
      ...base, policy: 'risk-tagged', spec: { scopeDir: 'docs/audits/' },
    };
    const result = decidePolicy(entry, computeEntryEffectClass(entry));
    expect(result.decision).toBe('auto');
  });

  it('(a2) reversible scope + risk-tagged → auto', () => {
    const entry: BacklogEntry = {
      ...base, policy: 'risk-tagged', spec: { scopeDir: 'src/' },
    };
    const result = decidePolicy(entry, computeEntryEffectClass(entry));
    expect(result.decision).toBe('auto');
  });

  it('(b) critical-irreversible description + risk-tagged → park', () => {
    const entry: BacklogEntry = {
      ...base, policy: 'risk-tagged', spec: { description: 'npm publish the package' },
    };
    const result = decidePolicy(entry, computeEntryEffectClass(entry));
    expect(result.decision).toBe('park');
  });

  it('(b2) compensable description + risk-tagged → park', () => {
    const entry: BacklogEntry = {
      ...base, policy: 'risk-tagged', spec: { description: 'send webhook notification' },
    };
    const result = decidePolicy(entry, computeEntryEffectClass(entry));
    expect(result.decision).toBe('park');
  });

  it('(c) unknown nature (no spec) + risk-tagged → fail-safe park', () => {
    const entry: BacklogEntry = { ...base, policy: 'risk-tagged', spec: {} };
    const result = decidePolicy(entry, computeEntryEffectClass(entry));
    expect(result.decision).toBe('park');
  });

  it('(d) decidePolicy called without effect → backward-compat (default reversible → auto)', () => {
    const riskEntry: BacklogEntry = { ...base, policy: 'risk-tagged', spec: {} };
    // Calling without the second argument should still behave as reversible (backward).
    expect(decidePolicy(riskEntry).decision).toBe('auto');
  });

  it('auto policy always → auto regardless of computed effect', () => {
    const entry: BacklogEntry = {
      ...base, policy: 'auto', spec: { description: 'npm publish' },
    };
    expect(decidePolicy(entry, computeEntryEffectClass(entry)).decision).toBe('auto');
  });

  it('approval-required policy always → park regardless of computed effect', () => {
    const entry: BacklogEntry = {
      ...base, policy: 'approval-required', spec: { scopeDir: 'docs/audits/' },
    };
    expect(decidePolicy(entry, computeEntryEffectClass(entry)).decision).toBe('park');
  });

  it('result carries a non-empty reason string in all branches', () => {
    const pure = { ...base, policy: 'risk-tagged' as const, spec: { scopeDir: 'docs/audits/' } };
    const irrev = { ...base, policy: 'risk-tagged' as const, spec: { description: 'npm publish' } };
    expect(decidePolicy(pure, computeEntryEffectClass(pure)).reason.length).toBeGreaterThan(0);
    expect(decidePolicy(irrev, computeEntryEffectClass(irrev)).reason.length).toBeGreaterThan(0);
  });
});
