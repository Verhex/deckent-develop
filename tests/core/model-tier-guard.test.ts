import { describe, it, expect } from 'vitest';
import {
  enforceModelTierGuard,
  isEconomyAllowedForKind,
  isCodeKindString,
} from '../../src/core/model-tier-guard.js';
import type { TaskScope } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function codeScope(): TaskScope {
  return { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/App.tsx'] };
}
function docScope(): TaskScope {
  return { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] };
}
function auditScope(): TaskScope {
  return { directories: ['docs/audits/'], filesRead: [], filesWrite: ['docs/audits/scan.md'] };
}

// ─── isCodeKindString ───────────────────────────────────────────────

describe('isCodeKindString', () => {
  it('treats code-development as code', () => {
    expect(isCodeKindString('code-development')).toBe(true);
  });
  it('treats document-write / audit / documentation as NOT code', () => {
    expect(isCodeKindString('document-write')).toBe(false);
    expect(isCodeKindString('documentation')).toBe(false);
    expect(isCodeKindString('audit')).toBe(false);
  });
  it('treats other canonical code-like kinds (test/refactor/security/config/data/devops/design/generic) as code', () => {
    // Anything that can touch source files must be guarded — only pure doc/audit kinds are exempt.
    for (const k of ['test', 'refactor', 'security', 'config', 'data', 'devops', 'design', 'generic']) {
      expect(isCodeKindString(k)).toBe(true);
    }
  });
});

// ─── isEconomyAllowedForKind ────────────────────────────────────────

describe('isEconomyAllowedForKind', () => {
  it('forbids economy for code-development', () => {
    expect(isEconomyAllowedForKind('code-development')).toBe(false);
  });
  it('allows economy for document-write and audit', () => {
    expect(isEconomyAllowedForKind('document-write')).toBe(true);
    expect(isEconomyAllowedForKind('audit')).toBe(true);
    expect(isEconomyAllowedForKind('documentation')).toBe(true);
  });
});

// ─── enforceModelTierGuard — economy + code → UPGRADE ───────────────

describe('enforceModelTierGuard — economy on code task', () => {
  it('upgrades haiku → sonnet (standard) for a code-development task', () => {
    const out = enforceModelTierGuard({ taskKind: 'code-development', model: 'claude-haiku-4-5-20251001' });
    expect(out.upgraded).toBe(true);
    expect(out.originalModel).toBe('claude-haiku-4-5-20251001');
    expect(out.model).toBe('claude-sonnet-5');
    expect(out.reason).toMatch(/economy/i);
  });

  it('upgrades a code task classified from a .tsx scope (kind derived from scope)', () => {
    const out = enforceModelTierGuard({ scope: codeScope(), model: 'claude-haiku-4-5-20251001' });
    expect(out.upgraded).toBe(true);
    expect(out.model).toBe('claude-sonnet-5');
  });

  it('upgrades gpt-5-mini → gpt-4.1 (codex standard) honoring provider', () => {
    const out = enforceModelTierGuard({ taskKind: 'code-development', model: 'gpt-5-mini', targetProvider: 'codex' });
    expect(out.upgraded).toBe(true);
    expect(out.model).toBe('gpt-5.6-terra');
  });

  it('upgrades gemini-2.0-flash → gemini-2.5-flash (gemini standard) honoring provider', () => {
    const out = enforceModelTierGuard({ taskKind: 'code-development', model: 'gemini-2.0-flash', targetProvider: 'gemini' });
    expect(out.upgraded).toBe(true);
    expect(out.model).toBe('gemini-2.5-flash');
  });
});

// ─── enforceModelTierGuard — economy + doc/audit → ALLOWED ──────────

describe('enforceModelTierGuard — economy on doc/audit task', () => {
  it('leaves haiku untouched for a document-write task', () => {
    const out = enforceModelTierGuard({ taskKind: 'document-write', model: 'claude-haiku-4-5-20251001' });
    expect(out.upgraded).toBe(false);
    expect(out.model).toBe('claude-haiku-4-5-20251001');
  });
  it('leaves haiku untouched for a doc scope (derived)', () => {
    const out = enforceModelTierGuard({ scope: docScope(), model: 'claude-haiku-4-5-20251001' });
    expect(out.upgraded).toBe(false);
    expect(out.model).toBe('claude-haiku-4-5-20251001');
  });
  it('leaves haiku untouched for an audit scope (derived)', () => {
    const out = enforceModelTierGuard({ scope: auditScope(), model: 'claude-haiku-4-5-20251001' });
    expect(out.upgraded).toBe(false);
    expect(out.model).toBe('claude-haiku-4-5-20251001');
  });
});

// ─── enforceModelTierGuard — explicit override → HONORED ────────────

describe('enforceModelTierGuard — explicit override honored', () => {
  it('honors explicitOverride: keeps haiku on a code task but flags it', () => {
    const out = enforceModelTierGuard({ taskKind: 'code-development', model: 'claude-haiku-4-5-20251001', explicitOverride: true });
    expect(out.upgraded).toBe(false);
    expect(out.model).toBe('claude-haiku-4-5-20251001');
    expect(out.overrideHonored).toBe(true);
    expect(out.reason).toMatch(/override/i);
  });
});

// ─── enforceModelTierGuard — standard/premium + code → UNAFFECTED ───

describe('enforceModelTierGuard — non-economy unaffected', () => {
  it('leaves sonnet (standard) untouched on a code task', () => {
    const out = enforceModelTierGuard({ taskKind: 'code-development', model: 'claude-sonnet-5' });
    expect(out.upgraded).toBe(false);
    expect(out.model).toBe('claude-sonnet-5');
  });
  it('leaves opus (premium) untouched on a code task', () => {
    const out = enforceModelTierGuard({ taskKind: 'code-development', model: 'claude-opus-4-8' });
    expect(out.upgraded).toBe(false);
    expect(out.model).toBe('claude-opus-4-8');
  });
  it('leaves an unknown/ollama tag untouched (no registry tier → no guard)', () => {
    const out = enforceModelTierGuard({ taskKind: 'code-development', model: 'qwen3.6:27b' });
    expect(out.upgraded).toBe(false);
    expect(out.model).toBe('qwen3.6:27b');
  });
});
