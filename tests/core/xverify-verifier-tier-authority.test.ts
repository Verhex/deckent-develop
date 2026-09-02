import { describe, expect, it } from 'vitest';
import type { XVerifyVerifierTierAuthority } from '../../src/core/config-types.js';
import { modelRegistry } from '../../src/core/model-registry.js';
import {
  resolveXVerifyVerifierTierAuthority,
  validateXVerifyVerifierTierAuthority,
  XVERIFY_VERIFIER_TIER_AUTHORITY_MAX_DECISIONS,
} from '../../src/core/xverify-verifier-tier-authority.js';

const allow = {
  author_model: 'gpt-5.6-sol', verifier_model: 'claude-fable-5', decision: 'allow' as const,
  decision_ref: 'owner-live-2026-08-24-opus5-xverify-accepted',
};
function authority(decisions = [allow]): XVerifyVerifierTierAuthority {
  return { schema_version: 1, decisions };
}

describe('xverify verifier tier authority', () => {
  it('admits only the exact different-provider pair and projects its decision ref without changing tiers', () => {
    const authorTier = modelRegistry.getOrThrow(allow.author_model).tier;
    const verifierTier = modelRegistry.getOrThrow(allow.verifier_model).tier;
    expect(resolveXVerifyVerifierTierAuthority({ authority: authority(), authorModel: allow.author_model, verifierModel: allow.verifier_model })).toEqual({
      admitted: true, decision: 'allow', authorModel: allow.author_model, verifierModel: allow.verifier_model, decisionRef: allow.decision_ref,
    });
    expect(modelRegistry.getOrThrow(allow.author_model).tier).toBe(authorTier);
    expect(modelRegistry.getOrThrow(allow.verifier_model).tier).toBe(verifierTier);
  });

  it('fails closed for absent, foreign-version, wildcard, and non-matching authority', () => {
    expect(resolveXVerifyVerifierTierAuthority({ authority: undefined, authorModel: allow.author_model, verifierModel: allow.verifier_model })).toMatchObject({ admitted: false, reason: 'authority_absent' });
    expect(resolveXVerifyVerifierTierAuthority({ authority: { ...authority(), schema_version: 2 } as unknown as XVerifyVerifierTierAuthority, authorModel: allow.author_model, verifierModel: allow.verifier_model })).toMatchObject({ admitted: false, reason: 'authority_malformed' });
    expect(validateXVerifyVerifierTierAuthority(authority([{ ...allow, author_model: '*' }]))).not.toEqual([]);
    expect(resolveXVerifyVerifierTierAuthority({ authority: authority(), authorModel: 'gpt-5.6-terra', verifierModel: allow.verifier_model })).toMatchObject({ admitted: false, reason: 'pair_not_admitted' });
  });

  it('rejects unknown authority and decision fields instead of ignoring owner constraints', () => {
    const unknownAuthority = { ...authority(), default_decision: 'allow' };
    const unknownDecision = authority([{ ...allow, expires_at: '2026-08-25T00:00:00Z' }]);
    const symbolDecision = authority([{ ...allow, [Symbol('foreign')]: true }]);

    expect(validateXVerifyVerifierTierAuthority(unknownAuthority))
      .toEqual(expect.arrayContaining([expect.stringContaining('unknown field default_decision')]));
    expect(validateXVerifyVerifierTierAuthority(unknownDecision))
      .toEqual(expect.arrayContaining([expect.stringContaining('unknown field expires_at')]));
    expect(validateXVerifyVerifierTierAuthority(symbolDecision))
      .toEqual(expect.arrayContaining([expect.stringContaining('Symbol(foreign)')]));
    expect(resolveXVerifyVerifierTierAuthority({
      authority: unknownAuthority,
      authorModel: allow.author_model,
      verifierModel: allow.verifier_model,
    })).toMatchObject({ admitted: false, reason: 'authority_malformed' });
  });

  it('returns an auditable owner refusal', () => {
    expect(resolveXVerifyVerifierTierAuthority({ authority: authority([{ ...allow, decision: 'refuse' }]), authorModel: allow.author_model, verifierModel: allow.verifier_model })).toMatchObject({ admitted: false, reason: 'owner_refused', decisionRef: allow.decision_ref });
  });

  it('rejects unknown identities, same providers, deprecated verifiers and bad refs', () => {
    expect(validateXVerifyVerifierTierAuthority(authority([{ ...allow, verifier_model: 'not-registered' }]))).toEqual(expect.arrayContaining([expect.stringContaining('exact canonical registry identity')]));
    expect(validateXVerifyVerifierTierAuthority(authority([{ ...allow, verifier_model: 'gpt-5.6-terra' }]))).toEqual(expect.arrayContaining([expect.stringContaining('different providers')]));
    expect(validateXVerifyVerifierTierAuthority(authority([{ ...allow, decision_ref: ' not canonical ' }]))).toEqual(expect.arrayContaining([expect.stringContaining('canonical decision reference')]));
    // The fixture clones Fable 5, which (since Fable 5.1 joined claude/premium_plus,
    // 2026-09-02) carries `preferredForTier`; a clone must not claim the tier
    // preference too, or the registry's sole-preference guard rejects it.
    modelRegistry.register({ ...modelRegistry.getOrThrow('claude-fable-5'), id: 'deprecated-test-verifier', apiId: 'deprecated-test-verifier', status: 'deprecated', preferredForTier: false });
    try {
      expect(validateXVerifyVerifierTierAuthority(authority([{ ...allow, verifier_model: 'deprecated-test-verifier' }]))).toEqual(expect.arrayContaining([expect.stringContaining('must not be deprecated')]));
    } finally { modelRegistry.unregister('deprecated-test-verifier'); }
  });

  it('rejects deprecated authors and registered legacy aliases as non-canonical identities', () => {
    modelRegistry.register({
      ...modelRegistry.getOrThrow('gpt-5.5'),
      id: 'deprecated-test-author',
      apiId: 'deprecated-test-author',
      status: 'deprecated',
      preferredForTier: false,
    });
    modelRegistry.register({
      ...modelRegistry.getOrThrow('gpt-5.5'),
      id: 'gpt-5',
      apiId: 'gpt-5',
      preferredForTier: false,
    });
    try {
      expect(validateXVerifyVerifierTierAuthority(authority([{
        ...allow,
        author_model: 'deprecated-test-author',
      }]))).toEqual(expect.arrayContaining([expect.stringContaining('author_model must not be deprecated')]));
      const legacyAuthority = authority([{ ...allow, author_model: 'gpt-5' }]);
      expect(validateXVerifyVerifierTierAuthority(legacyAuthority))
        .toEqual(expect.arrayContaining([expect.stringContaining('exact canonical registry identity')]));
      expect(resolveXVerifyVerifierTierAuthority({
        authority: legacyAuthority,
        authorModel: 'gpt-5',
        verifierModel: allow.verifier_model,
      })).toMatchObject({ admitted: false, reason: 'authority_malformed' });
    } finally {
      modelRegistry.unregister('gpt-5');
      modelRegistry.unregister('deprecated-test-author');
    }
  });

  it('rejects duplicate/conflicting pairs and an over-bounded list', () => {
    expect(validateXVerifyVerifierTierAuthority(authority([allow, { ...allow }]))).toEqual(expect.arrayContaining([expect.stringContaining('duplicates')]));
    expect(validateXVerifyVerifierTierAuthority(authority([allow, { ...allow, decision: 'refuse' }]))).toEqual(expect.arrayContaining([expect.stringContaining('conflicts')]));
    expect(validateXVerifyVerifierTierAuthority(authority(Array.from({ length: XVERIFY_VERIFIER_TIER_AUTHORITY_MAX_DECISIONS + 1 }, () => ({ ...allow }))))).toEqual(expect.arrayContaining([expect.stringContaining('at most')]));
  });
});
