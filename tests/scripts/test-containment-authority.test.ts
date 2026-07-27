import { describe, expect, it } from 'vitest';

import {
  bindContainmentAuthoritySessionFacetAuthority,
  canonicalContainmentJson,
  closeContainmentAuthoritySession,
  containmentDigestRef,
  createContainmentAuthorityClaim,
  createContainmentAuthorityClaimWithSession,
  createContainmentAuthorityReceipt,
  createContainmentAuthorityReceiptWithSession,
  createContainmentAuthoritySecret,
  createContainmentAuthoritySession,
  evaluateContainmentAdmissionWithSession,
  evaluateContainmentProofEligibilityWithSession,
  inspectContainmentAuthoritySession,
  recordContainmentAuthoritySessionFacetObservation,
  resolveContainmentAuthority,
  validateContainmentAuthorityReceipt,
  verifyContainmentAuthorityClaim,
  verifyContainmentAuthorityClaimWithSession,
  verifyContainmentAuthorityReceipt,
  verifyContainmentAuthorityReceiptWithSession,
} from '../../scripts/hermeticity/containment-authority.mjs';
import {
  containmentFacetDefinitions,
  createContainmentFacetAuthority,
  evaluateContainmentAdmission,
  evaluateContainmentAdmissionWithFacetAuthority,
  evaluateContainmentProofEligibilityWithFacetAuthority,
  recordContainmentFacetObservation,
} from '../../scripts/hermeticity/containment-contract.mjs';

const SHA_A = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SHA_C = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const SHA_D = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const SHA_E = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const SHA_F = 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const SHA_1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';

const admissionAuthorities = new WeakMap<object, object>();

function indexedDigest(index: number) {
  return `sha256:${index.toString(16).padStart(64, '0')}`;
}

function facets(phase: 'admission' | 'settlement') {
  return containmentFacetDefinitions()
    .filter(facet => facet.phase === phase)
    .map(facet => ({
      id: facet.id,
      state: 'PROVEN',
      evidenceRef: `authority:${facet.id}`,
    }));
}

function admission(adapterId = 'linux-namespace-v1') {
  const created = createContainmentFacetAuthority({
    runNonce: 'run-0001',
    adapterId,
    boundaryClass: 'kernel',
    authorityRef: SHA_B,
    policyRef: SHA_A,
    resourceIdentityRef: SHA_F,
    executionIntentRef: SHA_1,
  });
  const authorizedFacets = containmentFacetDefinitions()
    .filter(facet => facet.phase === 'admission')
    .map((facet, index) => recordContainmentFacetObservation({
      authority: created.value,
      phase: 'admission',
      id: facet.id,
      state: 'PROVEN',
      evidenceRef: indexedDigest(index + 1),
      evidenceBindingRef: indexedDigest(index + 101),
    }).value);
  const admitted = evaluateContainmentAdmissionWithFacetAuthority({
    authority: created.value,
    mode: 'enforce',
    adapterId,
    adapterState: 'AVAILABLE',
    boundaryClass: 'kernel',
    facets: authorizedFacets,
  });
  admissionAuthorities.set(admitted, created.value);
  return admitted;
}

function proof(value = admission()) {
  const authority = admissionAuthorities.get(value);
  const authorizedFacets = containmentFacetDefinitions()
    .filter(facet => facet.phase === 'settlement')
    .map((facet, index) => recordContainmentFacetObservation({
      authority,
      phase: 'settlement',
      id: facet.id,
      state: 'PROVEN',
      evidenceRef: indexedDigest(index + 201),
      evidenceBindingRef: indexedDigest(index + 301),
    }).value);
  return evaluateContainmentProofEligibilityWithFacetAuthority({
    authority,
    admission: value,
    executionState: 'SETTLED',
    facets: authorizedFacets,
    executionRef: SHA_A,
    settlementRef: SHA_B,
    completionRef: SHA_C,
  });
}

function secret() {
  return createContainmentAuthoritySecret({
    randomBytes: (size: number) => new Uint8Array(size).fill(7),
  });
}

function claimInput(authoritySecret: unknown, admitted = admission()) {
  return {
    runNonce: 'run-0001',
    claimNonce: 'claim-0001',
    issuedAt: '2026-07-27T10:00:00.000Z',
    policyRef: SHA_A,
    controlPlaneRef: SHA_B,
    sourceRef: SHA_C,
    dependencyProjectionRef: SHA_D,
    runtimeProjectionRef: SHA_E,
    resourceIdentityRef: SHA_F,
    executionIntentRef: SHA_1,
    admission: admitted,
    secret: authoritySecret,
  };
}

function bindSessionFacetAuthority(session: unknown) {
  return bindContainmentAuthoritySessionFacetAuthority({
    session,
    runNonce: 'run-0001',
    adapterId: 'linux-namespace-v1',
    boundaryClass: 'kernel',
    authorityRef: SHA_B,
    policyRef: SHA_A,
    resourceIdentityRef: SHA_F,
    executionIntentRef: SHA_1,
  });
}

function sessionFacets(
  session: unknown,
  phase: 'admission' | 'settlement',
  variant = 0,
) {
  const offset = (phase === 'admission' ? 401 : 501) + (variant * 1_000);
  return containmentFacetDefinitions()
    .filter(facet => facet.phase === phase)
    .map((facet, index) => recordContainmentAuthoritySessionFacetObservation({
      session,
      phase,
      id: facet.id,
      state: 'PROVEN',
      evidenceRef: indexedDigest(index + offset),
      evidenceBindingRef: indexedDigest(index + offset + 100),
    }).value);
}

describe('containment authority', () => {
  it('canonicalizes records deterministically and rejects non-JSON authorities', () => {
    expect(canonicalContainmentJson({
      z: [3, 2, 1],
      a: { y: true, x: null },
    })).toEqual({
      ok: true,
      value: '{"a":{"x":null,"y":true},"z":[3,2,1]}',
    });
    expect(containmentDigestRef({ b: 2, a: 1 }))
      .toEqual(containmentDigestRef({ a: 1, b: 2 }));
    expect(canonicalContainmentJson(new Date('2026-07-27T10:00:00.000Z')))
      .toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_CANONICAL_TYPE_INVALID' },
      });
    expect(canonicalContainmentJson({ value: Number.NaN })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CANONICAL_NUMBER_INVALID' },
    });

    let getterReads = 0;
    const accessorRecord = {};
    Object.defineProperty(accessorRecord, 'value', {
      enumerable: true,
      get() {
        getterReads += 1;
        return 'caller-side-effect';
      },
    });
    expect(canonicalContainmentJson(accessorRecord)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CANONICAL_PROPERTY_INVALID' },
    });
    expect(getterReads).toBe(0);

    const sparseArray = new Array(2);
    sparseArray[1] = 'present';
    expect(canonicalContainmentJson(sparseArray)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CANONICAL_ARRAY_INVALID' },
    });
    const oversizedSparseArray: unknown[] = [];
    oversizedSparseArray.length = 1_000_001;
    expect(canonicalContainmentJson(oversizedSparseArray)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CANONICAL_ARRAY_INVALID' },
    });

    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    expect(canonicalContainmentJson(revocable.proxy)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CANONICAL_ACCESS_FAILED' },
    });
  });

  it('signs and verifies a claim without projecting raw secret material', () => {
    const authoritySecret = secret();
    expect(authoritySecret.ok).toBe(true);

    const claim = createContainmentAuthorityClaim(
      claimInput(authoritySecret.value),
    );
    expect(claim).toMatchObject({
      ok: true,
      value: {
        kind: 'containment-authority-claim',
        runNonce: 'run-0001',
        resourceIdentityRef: SHA_F,
        executionIntentRef: SHA_1,
        adapterId: 'linux-namespace-v1',
        boundaryClass: 'kernel',
        secretRef: authoritySecret.value.secretRef,
      },
    });
    expect(claim.value).not.toHaveProperty('secretHex');
    expect(JSON.stringify(claim.value)).not.toContain(authoritySecret.value.secretHex);
    expect(verifyContainmentAuthorityClaim({
      claim: claim.value,
      secret: authoritySecret.value,
    })).toMatchObject({ ok: true });
  });

  it('fails closed on claim identity, MAC, digest, and secret tampering', () => {
    const authoritySecret = secret();
    const claim = createContainmentAuthorityClaim(
      claimInput(authoritySecret.value),
    );

    const identityTamper = structuredClone(claim.value);
    identityTamper.resourceIdentityRef = SHA_A;
    expect(verifyContainmentAuthorityClaim({
      claim: identityTamper,
      secret: authoritySecret.value,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_CLAIM_MAC_INVALID' },
    });

    const refTamper = structuredClone(claim.value);
    refTamper.claimRef = SHA_B;
    expect(verifyContainmentAuthorityClaim({
      claim: refTamper,
      secret: authoritySecret.value,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_CLAIM_REF_INVALID' },
    });

    const otherSecret = createContainmentAuthoritySecret({
      randomBytes: (size: number) => new Uint8Array(size).fill(8),
    });
    expect(verifyContainmentAuthorityClaim({
      claim: claim.value,
      secret: otherSecret.value,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_SECRET_MISMATCH' },
    });
    expect(createContainmentAuthorityClaim({
      ...claimInput(authoritySecret.value),
      resourceIdentityRef: 'sha256:invalid',
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_CLAIM_FIELD_INVALID' },
    });

    const extraField = structuredClone(claim.value);
    extraField.unsignedAuthority = true;
    expect(verifyContainmentAuthorityClaim({
      claim: extraField,
      secret: authoritySecret.value,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_CLAIM_INVALID' },
    });

    const heldAdmission = evaluateContainmentAdmission({
      mode: 'enforce',
      adapterId: 'linux-namespace-v1',
      adapterState: 'UNAVAILABLE',
      boundaryClass: 'kernel',
      facets: facets('admission'),
    });
    expect(createContainmentAuthorityClaim(
      claimInput(authoritySecret.value, heldAdmission),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_ADMISSION_NOT_EXECUTABLE' },
    });

    const auditAdmission = evaluateContainmentAdmission({
      mode: 'audit',
      adapterId: 'audit-observer-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'process',
      facets: facets('admission'),
    });
    expect(createContainmentAuthorityClaim(
      claimInput(authoritySecret.value, auditAdmission),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_ADMISSION_NOT_EXECUTABLE' },
    });
  });

  it('binds final receipt to claim, resource identity, admission, execution, and settlement', () => {
    const authoritySecret = secret();
    const admitted = admission();
    const eligibleProof = proof(admitted);
    const claim = createContainmentAuthorityClaim(
      claimInput(authoritySecret.value, admitted),
    );
    const receipt = createContainmentAuthorityReceipt({
      claim: claim.value,
      secret: authoritySecret.value,
      admission: admitted,
      proof: eligibleProof,
      executionRef: SHA_A,
      settlementRef: SHA_B,
      completionRef: SHA_C,
    });

    expect(receipt).toMatchObject({
      ok: true,
      value: {
        runNonce: 'run-0001',
        resourceIdentityRef: SHA_F,
        executionIntentRef: SHA_1,
        completionRef: SHA_C,
        proofEligible: true,
        reasonCode: 'NONE',
      },
    });
    expect(validateContainmentAuthorityReceipt(receipt.value).ok).toBe(true);
    expect(verifyContainmentAuthorityReceipt({
      receipt: receipt.value,
      secret: authoritySecret.value,
    })).toMatchObject({ ok: true });

    const identityTamper = structuredClone(receipt.value);
    identityTamper.resourceIdentityRef = SHA_C;
    expect(verifyContainmentAuthorityReceipt({
      receipt: identityTamper,
      secret: authoritySecret.value,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_RECEIPT_MAC_INVALID' },
    });

    const intentTamper = structuredClone(receipt.value);
    intentTamper.executionIntentRef = SHA_D;
    expect(verifyContainmentAuthorityReceipt({
      receipt: intentTamper,
      secret: authoritySecret.value,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_RECEIPT_MAC_INVALID' },
    });

    const completionTamper = structuredClone(receipt.value);
    completionTamper.completionRef = SHA_D;
    expect(verifyContainmentAuthorityReceipt({
      receipt: completionTamper,
      secret: authoritySecret.value,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_RECEIPT_MAC_INVALID' },
    });

    const extraReceiptField = structuredClone(receipt.value);
    extraReceiptField.unsignedSettlement = SHA_C;
    expect(validateContainmentAuthorityReceipt(extraReceiptField)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_RECEIPT_INVALID' },
    });

    const mismatchedAdmission = admission('oci-v1');
    expect(createContainmentAuthorityReceipt({
      claim: claim.value,
      secret: authoritySecret.value,
      admission: mismatchedAdmission,
      proof: proof(mismatchedAdmission),
      executionRef: SHA_A,
      settlementRef: SHA_B,
      completionRef: SHA_C,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_RECEIPT_BINDING_INVALID' },
    });
  });

  it('keeps raw authority secret inside a branded replay-guarded host session', () => {
    const sessionResult = createContainmentAuthoritySession({
      randomBytes: (size: number) => new Uint8Array(size).fill(9),
    });
    expect(sessionResult.ok).toBe(true);
    const session = sessionResult.value;
    const descriptor = inspectContainmentAuthoritySession(session);
    expect(descriptor).toMatchObject({
      ok: true,
      value: { secretRef: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u) },
    });
    expect(descriptor.value).not.toHaveProperty('secretHex');
    expect(Object.keys(session)).toEqual([]);
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(Object.getPrototypeOf(session))).toBe(true);
    expect(JSON.stringify(session)).toBe(JSON.stringify(descriptor.value));
    expect(JSON.stringify(session)).not.toContain('secretHex');

    expect(bindSessionFacetAuthority(session)).toMatchObject({
      ok: true,
      value: { state: 'BOUND' },
    });
    expect(bindSessionFacetAuthority(session)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_FACET_BINDING_REPLAY' },
    });
    const admissionResult = evaluateContainmentAdmissionWithSession({
      session,
      mode: 'enforce',
      adapterId: 'linux-namespace-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'kernel',
      facets: sessionFacets(session, 'admission'),
    });
    expect(admissionResult).toMatchObject({
      ok: true,
      value: { state: 'ADMITTED' },
    });
    const secondAdmissionResult = evaluateContainmentAdmissionWithSession({
      session,
      mode: 'enforce',
      adapterId: 'linux-namespace-v1',
      adapterState: 'AVAILABLE',
      boundaryClass: 'kernel',
      facets: sessionFacets(session, 'admission', 1),
    });
    expect(secondAdmissionResult).toMatchObject({
      ok: true,
      value: { state: 'ADMITTED' },
    });

    const lowLevelClaimInput = claimInput(null, admissionResult.value);
    delete (lowLevelClaimInput as { secret?: unknown }).secret;
    const foreignClaimInput = claimInput(null, admission());
    delete (foreignClaimInput as { secret?: unknown }).secret;
    expect(createContainmentAuthorityClaimWithSession({
      session,
      ...foreignClaimInput,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_ADMISSION_AUTHORITY_INVALID' },
    });
    expect(createContainmentAuthorityClaimWithSession({
      session,
      ...lowLevelClaimInput,
      policyRef: SHA_C,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_ADMISSION_AUTHORITY_INVALID' },
    });
    const sessionClaim = createContainmentAuthorityClaimWithSession({
      session,
      ...lowLevelClaimInput,
    });
    expect(sessionClaim).toMatchObject({ ok: true });
    expect(createContainmentAuthorityClaimWithSession({
      session,
      ...lowLevelClaimInput,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_SESSION_CLAIM_REPLAY' },
    });
    expect(verifyContainmentAuthorityClaimWithSession({
      session,
      claim: sessionClaim.value,
    })).toMatchObject({ ok: true });

    const admitted = lowLevelClaimInput.admission;
    const crossAdmissionProof = evaluateContainmentProofEligibilityWithSession({
      session,
      admission: secondAdmissionResult.value,
      executionState: 'SETTLED',
      facets: sessionFacets(session, 'settlement', 1),
      executionRef: SHA_A,
      settlementRef: SHA_B,
      completionRef: SHA_C,
    });
    expect(crossAdmissionProof).toMatchObject({
      ok: true,
      value: { state: 'ELIGIBLE', proofEligible: true },
    });
    expect(createContainmentAuthorityReceiptWithSession({
      session,
      claim: sessionClaim.value,
      admission: admitted,
      proof: crossAdmissionProof.value,
      executionRef: SHA_A,
      settlementRef: SHA_B,
      completionRef: SHA_C,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_PROOF_AUTHORITY_INVALID' },
    });
    const proofResult = evaluateContainmentProofEligibilityWithSession({
      session,
      admission: admitted,
      executionState: 'SETTLED',
      facets: sessionFacets(session, 'settlement'),
      executionRef: SHA_A,
      settlementRef: SHA_B,
      completionRef: SHA_C,
    });
    expect(proofResult).toMatchObject({
      ok: true,
      value: { state: 'ELIGIBLE', proofEligible: true },
    });
    const sessionReceipt = createContainmentAuthorityReceiptWithSession({
      session,
      claim: sessionClaim.value,
      admission: admitted,
      proof: proofResult.value,
      executionRef: SHA_A,
      settlementRef: SHA_B,
      completionRef: SHA_C,
    });
    expect(sessionReceipt).toMatchObject({ ok: true });
    expect(createContainmentAuthorityReceiptWithSession({
      session,
      claim: sessionClaim.value,
      admission: admitted,
      proof: proofResult.value,
      executionRef: SHA_A,
      settlementRef: SHA_B,
      completionRef: SHA_C,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_SESSION_RECEIPT_REPLAY' },
    });
    expect(verifyContainmentAuthorityReceiptWithSession({
      session,
      receipt: sessionReceipt.value,
    })).toMatchObject({ ok: true });

    expect(inspectContainmentAuthoritySession({})).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_SESSION_INVALID' },
    });
    const forged = Object.create(Object.getPrototypeOf(session));
    expect(inspectContainmentAuthoritySession(forged)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_SESSION_INVALID' },
    });
    let proxyOperationRead = false;
    const proxy = new Proxy(session, {
      get(target, property, receiver) {
        if (property === 'operate') proxyOperationRead = true;
        return Reflect.get(target, property, receiver);
      },
    });
    expect(inspectContainmentAuthoritySession(proxy)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_SESSION_INVALID' },
    });
    expect(proxyOperationRead).toBe(false);
    const SessionConstructor = session.constructor;
    expect(() => new SessionConstructor({}, {})).toThrow();

    const originalWeakMapDelete = WeakMap.prototype.delete;
    const originalWeakMapGet = WeakMap.prototype.get;
    const originalWeakMapSet = WeakMap.prototype.set;
    let intrinsicSession;
    let intrinsicInspection;
    let intrinsicClose;
    try {
      WeakMap.prototype.delete = () => {
        throw new Error('patched WeakMap.delete');
      };
      WeakMap.prototype.get = () => {
        throw new Error('patched WeakMap.get');
      };
      WeakMap.prototype.set = () => {
        throw new Error('patched WeakMap.set');
      };
      intrinsicSession = createContainmentAuthoritySession({
        randomBytes: (size: number) => new Uint8Array(size).fill(10),
      });
      intrinsicInspection = inspectContainmentAuthoritySession(intrinsicSession.value);
      intrinsicClose = closeContainmentAuthoritySession(intrinsicSession.value);
    } finally {
      WeakMap.prototype.delete = originalWeakMapDelete;
      WeakMap.prototype.get = originalWeakMapGet;
      WeakMap.prototype.set = originalWeakMapSet;
    }
    expect(intrinsicSession).toMatchObject({ ok: true });
    expect(intrinsicInspection).toMatchObject({ ok: true });
    expect(intrinsicClose).toMatchObject({
      ok: true,
      value: { state: 'CLOSED' },
    });

    expect(closeContainmentAuthoritySession(session)).toMatchObject({
      ok: true,
      value: { state: 'CLOSED' },
    });
    expect(inspectContainmentAuthoritySession(session)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_AUTHORITY_SESSION_INVALID' },
    });
  });

  it('selects deterministically but cannot enroll caller-declared candidates', () => {
    const completeFacets = facets('admission');
    expect(resolveContainmentAuthority({
      mode: 'enforce',
      candidates: [
        {
          adapterId: 'z-adapter',
          boundaryClass: 'kernel',
          adapterState: 'AVAILABLE',
          priority: 20,
          facets: completeFacets,
        },
        {
          adapterId: 'a-adapter',
          boundaryClass: 'virtualized-kernel',
          adapterState: 'AVAILABLE',
          priority: 10,
          facets: completeFacets,
        },
      ],
    })).toMatchObject({
      state: 'HOLD',
      adapterId: null,
      reasonCode: 'E_CONTAINMENT_NO_ADMISSIBLE_ADAPTER',
      details: {
        candidateReasonCodes: [
          {
            adapterId: 'a-adapter',
            reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_REQUIRED',
          },
          {
            adapterId: 'z-adapter',
            reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_REQUIRED',
          },
        ],
      },
    });

    expect(resolveContainmentAuthority({
      mode: 'enforce',
      requestedAdapterId: 'missing-adapter',
      candidates: [{
        adapterId: 'available-adapter',
        boundaryClass: 'kernel',
        adapterState: 'AVAILABLE',
        priority: 1,
        facets: completeFacets,
      }],
    })).toMatchObject({
      state: 'HOLD',
      adapterId: 'missing-adapter',
      reasonCode: 'E_CONTAINMENT_REQUESTED_ADAPTER_UNAVAILABLE',
    });
  });
});
