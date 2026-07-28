import { describe, expect, it } from 'vitest';

import {
  CROSS_VERIFY_ADJUDICATION_PROTOCOL,
  CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
  canonicalCrossVerifyAdjudicationContractV2,
  createCrossVerifyAdjudicationContractV2,
  deriveCrossVerifyAdjudicationV2,
  digestCrossVerifyAdjudicationContractV2,
  digestCrossVerifyClaimV2,
  digestCrossVerifyEvidenceManifestV2,
  parseCrossVerifyAdjudicationContractV2,
  parseCrossVerifyAdjudicationResponseV2,
} from '../../src/core/cross-verify-adjudication.js';

const D1 = `sha256:${'1'.repeat(64)}`;
const D2 = `sha256:${'2'.repeat(64)}`;

function claim() {
  return {
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    claimId: 'claim-001',
    summary: 'The implementation and its dependency order are supported.',
    assertions: [
      {
        id: 'A1',
        kind: 'factual' as const,
        polarity: 'go' as const,
        statement: 'The implementation validates the input before use.',
        evidenceRequirements: [
          {
            id: 'R1',
            statement: 'The exact implementation snapshot shows input validation.',
            anyOfEvidenceIds: ['E1'],
          },
        ],
      },
      {
        id: 'A2',
        kind: 'dependency-order' as const,
        polarity: 'go' as const,
        statement: 'Input validation precedes persistence.',
        dependsOn: ['A1'],
        evidenceRequirements: [
          {
            id: 'R2',
            statement: 'The ordering receipt proves validation before persistence.',
            anyOfEvidenceIds: ['E2'],
          },
        ],
      },
    ],
  };
}

function manifest() {
  return {
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    entries: [
      {
        evidenceId: 'E1',
        kind: 'file-snapshot' as const,
        locator: 'src/input.ts#L10-L20',
        contentSha256: D1,
      },
      {
        evidenceId: 'E2',
        kind: 'receipt' as const,
        locator: 'test-receipt:input-before-persist',
        contentSha256: D2,
      },
    ],
  };
}

function supportedResponse(
  contract = createCrossVerifyAdjudicationContractV2(claim(), manifest()),
) {
  return {
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    protocol: CROSS_VERIFY_ADJUDICATION_PROTOCOL,
    claimDigest: contract.claimDigest,
    evidenceManifestDigest: contract.evidenceManifestDigest,
    assertionResults: [
      {
        assertionId: 'A1',
        status: 'supported' as const,
        citations: [
          {
            evidenceId: 'E1',
            locator: 'src/input.ts#L10-L20',
            evidenceSha256: D1,
          },
        ],
        reason: 'The bounded snapshot shows validation before use.',
      },
      {
        assertionId: 'A2',
        status: 'supported' as const,
        citations: [
          {
            evidenceId: 'E2',
            locator: 'test-receipt:input-before-persist',
            evidenceSha256: D2,
          },
        ],
        reason: 'The immutable receipt proves the required order.',
      },
    ],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('CrossVerifyAdjudicationV2 contract', () => {
  it('creates a canonical, content-addressed, deeply immutable contract', () => {
    const contract = createCrossVerifyAdjudicationContractV2(claim(), manifest());
    const repeated = createCrossVerifyAdjudicationContractV2(claim(), manifest());
    const explicitUndefined = claim();
    explicitUndefined.assertions[0]!.dependsOn = undefined;

    expect(contract).toEqual(repeated);
    expect(contract.claimDigest).toBe(digestCrossVerifyClaimV2(claim()));
    expect(contract.claimDigest).toBe(digestCrossVerifyClaimV2(explicitUndefined));
    expect(contract.evidenceManifestDigest)
      .toBe(digestCrossVerifyEvidenceManifestV2(manifest()));
    expect(digestCrossVerifyAdjudicationContractV2(contract))
      .toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(canonicalCrossVerifyAdjudicationContractV2(contract))
      .toBe(canonicalCrossVerifyAdjudicationContractV2(repeated));
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.claim.assertions)).toBe(true);
    expect(Object.isFrozen(contract.evidenceManifest.entries[0])).toBe(true);
    expect(parseCrossVerifyAdjudicationContractV2(contract)).toEqual(contract);
  });

  it('rejects duplicate assertions, dependency cycles, and unknown evidence references', () => {
    const duplicate = claim();
    duplicate.assertions[1]!.id = 'A1';
    expect(() => createCrossVerifyAdjudicationContractV2(duplicate, manifest()))
      .toThrow(/duplicate identifiers/i);

    const cyclic = claim();
    cyclic.assertions[0]!.dependsOn = ['A2'];
    expect(() => createCrossVerifyAdjudicationContractV2(cyclic, manifest()))
      .toThrow(/dependency cycle/i);

    const unknownEvidence = claim();
    unknownEvidence.assertions[0]!.evidenceRequirements[0]!.anyOfEvidenceIds = ['E404'];
    expect(() => createCrossVerifyAdjudicationContractV2(unknownEvidence, manifest()))
      .toThrow(/unknown evidence E404/i);
  });

  it('rejects contract digest substitution', () => {
    const contract = createCrossVerifyAdjudicationContractV2(claim(), manifest());
    const substituted = { ...contract, claimDigest: `sha256:${'f'.repeat(64)}` };

    expect(() => parseCrossVerifyAdjudicationContractV2(substituted))
      .toThrow(/digest mismatch/i);
  });
});

describe('CrossVerifyAdjudicationV2 host derivation', () => {
  it('derives CONFIRMED only when every assertion has required host-bound evidence', () => {
    const contract = createCrossVerifyAdjudicationContractV2(claim(), manifest());
    const decision = deriveCrossVerifyAdjudicationV2({
      contract,
      response: supportedResponse(contract),
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'confirmed',
    });

    expect(decision).toMatchObject({
      verdict: 'confirmed',
      disposition: 'accepted',
      reasonCode: 'confirmed-all-criteria-satisfied',
      providerDeclaredVerdict: 'confirmed',
      claimDigest: contract.claimDigest,
      evidenceManifestDigest: contract.evidenceManifestDigest,
    });
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it('derives REFUTED from a cited contradiction and UNCLEAR from an exact missing map', () => {
    const contract = createCrossVerifyAdjudicationContractV2(claim(), manifest());
    const supported = supportedResponse(contract);
    const refuted = {
      ...supported,
      assertionResults: supported.assertionResults.map((result, index) => index === 0
        ? {
            ...result,
            status: 'contradicted',
            reason: 'The snapshot directly shows use before validation.',
          }
        : result),
    };

    expect(deriveCrossVerifyAdjudicationV2({
      contract,
      response: refuted,
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'refuted',
    })).toMatchObject({
      verdict: 'refuted',
      disposition: 'accepted',
      reasonCode: 'refuted-authored-criterion-triggered',
    });

    const unclear = {
      ...supported,
      assertionResults: supported.assertionResults.map((result, index) => index === 1
        ? {
            assertionId: 'A2',
            status: 'undecidable',
            citations: [],
            missingRequirementIds: ['R2'],
            reason: 'The required ordering receipt was not available.',
          }
        : result),
    };
    expect(deriveCrossVerifyAdjudicationV2({
      contract,
      response: unclear,
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'unclear',
    })).toMatchObject({
      verdict: 'unclear',
      disposition: 'accepted',
      reasonCode: 'unclear-authored-criterion-undecidable',
    });
  });

  it('inverts NO-GO polarity without rewriting the authored statement', () => {
    const noGoClaim = claim();
    noGoClaim.assertions[0]!.polarity = 'no-go';
    noGoClaim.assertions[0]!.statement = 'An input reaches persistence before validation.';
    const contract = createCrossVerifyAdjudicationContractV2(noGoClaim, manifest());
    const triggered = supportedResponse(contract);

    expect(deriveCrossVerifyAdjudicationV2({
      contract,
      response: triggered,
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'refuted',
    })).toMatchObject({
      verdict: 'refuted',
      reasonCode: 'refuted-authored-criterion-triggered',
    });

    const absent = supportedResponse(contract);
    absent.assertionResults[0] = {
      ...absent.assertionResults[0]!,
      status: 'contradicted',
      reason: 'The exact snapshot contradicts the authored NO-GO condition.',
    };
    expect(deriveCrossVerifyAdjudicationV2({
      contract,
      response: absent,
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'confirmed',
    })).toMatchObject({
      verdict: 'confirmed',
      reasonCode: 'confirmed-all-criteria-satisfied',
    });
  });

  it('rejects a provider-authored top-level verdict field instead of treating it as authority', () => {
    const contract = createCrossVerifyAdjudicationContractV2(claim(), manifest());
    const response = {
      ...supportedResponse(contract),
      verdict: 'confirmed',
    };

    expect(() => parseCrossVerifyAdjudicationResponseV2(response))
      .toThrow(/unrecognized key.*verdict/i);
    expect(deriveCrossVerifyAdjudicationV2({
      contract,
      response,
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'confirmed',
    })).toMatchObject({
      verdict: 'unclear',
      disposition: 'fail-closed',
      reasonCode: 'response-invalid',
    });
  });

  it('fails closed for missing, duplicate, and unknown assertion results', () => {
    const contract = createCrossVerifyAdjudicationContractV2(claim(), manifest());

    const missing = supportedResponse(contract);
    missing.assertionResults.splice(1, 1);
    expect(deriveCrossVerifyAdjudicationV2({
      contract,
      response: missing,
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'confirmed',
    })).toMatchObject({
      verdict: 'unclear',
      disposition: 'fail-closed',
      reasonCode: 'assertion-coverage-invalid',
    });

    const duplicate = supportedResponse(contract);
    duplicate.assertionResults[1] = {
      ...duplicate.assertionResults[0]!,
      reason: 'Duplicate result must not be accepted.',
    };
    expect(deriveCrossVerifyAdjudicationV2({
      contract,
      response: duplicate,
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'confirmed',
    })).toMatchObject({
      verdict: 'unclear',
      disposition: 'fail-closed',
      reasonCode: 'response-invalid',
    });

    const unknown = supportedResponse(contract);
    unknown.assertionResults[1] = {
      ...unknown.assertionResults[1]!,
      assertionId: 'A404',
    };
    expect(deriveCrossVerifyAdjudicationV2({
      contract,
      response: unknown,
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'confirmed',
    })).toMatchObject({
      verdict: 'unclear',
      disposition: 'fail-closed',
      reasonCode: 'assertion-coverage-invalid',
    });
  });

  it('fails closed on claim/manifest digest mismatch', () => {
    const contract = createCrossVerifyAdjudicationContractV2(claim(), manifest());
    const response = {
      ...supportedResponse(contract),
      claimDigest: `sha256:${'a'.repeat(64)}`,
    };

    expect(deriveCrossVerifyAdjudicationV2({
      contract,
      response,
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'confirmed',
    })).toMatchObject({
      verdict: 'unclear',
      disposition: 'fail-closed',
      reasonCode: 'digest-mismatch',
    });
  });

  it.each([
    ['unknown evidence', { evidenceId: 'E404' }],
    ['locator drift', { locator: 'src/input.ts#L1-L2' }],
    ['content digest drift', { evidenceSha256: `sha256:${'e'.repeat(64)}` }],
  ])('fails closed on invalid citation: %s', (_label, citationPatch) => {
    const contract = createCrossVerifyAdjudicationContractV2(claim(), manifest());
    const response = supportedResponse(contract);
    response.assertionResults[0]!.citations[0] = {
      ...response.assertionResults[0]!.citations[0]!,
      ...citationPatch,
    };

    expect(deriveCrossVerifyAdjudicationV2({
      contract,
      response,
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'confirmed',
    })).toMatchObject({
      verdict: 'unclear',
      disposition: 'fail-closed',
      reasonCode: 'citation-invalid',
    });
  });

  it.each(['budget-exhausted', 'failed', 'unavailable'] as const)(
    'never confirms an incomplete execution: %s',
    executionOutcome => {
      const contract = createCrossVerifyAdjudicationContractV2(claim(), manifest());
      expect(deriveCrossVerifyAdjudicationV2({
        contract,
        response: supportedResponse(contract),
        executionOutcome,
        providerDeclaredVerdict: 'confirmed',
      })).toMatchObject({
        verdict: 'unclear',
        disposition: 'fail-closed',
        reasonCode: 'execution-incomplete',
      });
    },
  );

  it('fails closed when the provider terminal token disagrees with the host derivation', () => {
    const contract = createCrossVerifyAdjudicationContractV2(claim(), manifest());
    const decision = deriveCrossVerifyAdjudicationV2({
      contract,
      response: supportedResponse(contract),
      executionOutcome: 'completed',
      providerDeclaredVerdict: 'refuted',
    });

    expect(decision).toMatchObject({
      verdict: 'unclear',
      disposition: 'fail-closed',
      reasonCode: 'provider-verdict-mismatch',
      providerDeclaredVerdict: 'refuted',
    });
  });

  it('does not mutate caller-owned inputs while validating', () => {
    const claimInput = claim();
    const manifestInput = manifest();
    const beforeClaim = clone(claimInput);
    const beforeManifest = clone(manifestInput);

    createCrossVerifyAdjudicationContractV2(claimInput, manifestInput);

    expect(claimInput).toEqual(beforeClaim);
    expect(manifestInput).toEqual(beforeManifest);
    expect(Object.isFrozen(claimInput)).toBe(false);
    expect(Object.isFrozen(manifestInput)).toBe(false);
  });
});
