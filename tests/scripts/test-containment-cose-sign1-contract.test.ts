import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import {
  CONTAINMENT_COSE_ALGORITHMS,
  CONTAINMENT_COSE_CONTENT_TYPE,
  CONTAINMENT_COSE_HEADER_LABELS,
  CONTAINMENT_COSE_PROFILE,
  createContainmentCoseProtectedHeaders,
  createContainmentCoseSign1,
  createContainmentCoseSigningStructure,
  createContainmentExternalAad,
  validateContainmentCoseSign1,
} from '../../scripts/hermeticity/evidence/cose-sign1-contract.mjs';
import {
  encodeDeterministicCbor,
} from '../../scripts/hermeticity/evidence/deterministic-cbor.mjs';

const keyId = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const digestA = Uint8Array.from({ length: 32 }, (_, index) => index);
const digestB = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
const digestC = Uint8Array.from({ length: 32 }, (_, index) => index ^ 0x5a);
const signature = Uint8Array.from({ length: 64 }, (_, index) => index);

function mustEncode(value: unknown): Uint8Array {
  const result = encodeDeterministicCbor(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value;
}

function mustAad(runSequence = 0): Uint8Array {
  const result = createContainmentExternalAad({
    protocol: 'deckent.containment.v2',
    schemaVersion: 3,
    kind: 'ATTESTOR_ENROLLMENT',
    sequence: runSequence,
    challenge: digestA,
    bindingsDigest: digestB,
    controlPlaneEpoch: 7,
    issuerRole: 'OWNER_POLICY_AUTHORITY',
    componentRole: 'CONTROL_PLANE',
    issuerLineageDigest: digestC,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value.bytes;
}

function mustProtected(
  algorithm: 'ESP256' | 'Ed25519' = 'ESP256',
  options: { profile?: 'fips' | 'portable'; allowEd25519?: boolean } = {},
): Uint8Array {
  const result = createContainmentCoseProtectedHeaders({
    algorithm,
    keyId,
    ...options,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value.protectedHeaders;
}

function digestRef(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function uint256(value: bigint): Uint8Array {
  const result = new Uint8Array(32);
  let remaining = value;
  for (let index = 31; index >= 0; index -= 1) {
    result[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return result;
}

function espSignature(r: bigint, s: bigint): Uint8Array {
  const result = new Uint8Array(64);
  result.set(uint256(r), 0);
  result.set(uint256(s), 32);
  return result;
}

describe('containment COSE_Sign1 structural contract', () => {
  it('builds an RFC 9864 ESP256 FIPS structure and remains proof-ineligible', () => {
    expect(CONTAINMENT_COSE_CONTENT_TYPE).toBe(
      'application/vnd.deckent.containment-evidence+cbor',
    );
    const payload = mustEncode({ kind: 'protocol-vector', value: 1 });
    const protectedHeaders = mustProtected();
    const externalAad = mustAad();
    const signing = createContainmentCoseSigningStructure({
      protectedHeaders,
      externalAad,
      payload,
      profile: 'fips',
      expectedKeyId: keyId,
      expectedAlgorithm: 'ESP256',
    });

    expect(signing).toMatchObject({
      ok: true,
      value: {
        protectedHeaders: {
          algorithm: CONTAINMENT_COSE_ALGORITHMS.ESP256,
          algorithmName: 'ESP256',
          curve: 'P-256',
          contentType: CONTAINMENT_COSE_CONTENT_TYPE,
          deckentProfile: CONTAINMENT_COSE_PROFILE,
          profile: 'fips',
        },
        proofEligible: false,
        signatureVerified: false,
        activation: 'NOT_BORN',
        digestRef: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    });
  });

  it('validates canonical envelopes without claiming authentication', () => {
    const payload = mustEncode({ phase: 'ATTESTOR_ENROLLMENT' });
    const protectedHeaders = mustProtected();
    const externalAad = mustAad();
    const envelope = createContainmentCoseSign1({
      protectedHeaders,
      externalAad,
      payload,
      signature,
      profile: 'fips',
      expectedKeyId: keyId,
      expectedAlgorithm: 'ESP256',
    });
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) throw new Error(envelope.hold.reasonCode);

    expect(validateContainmentCoseSign1(envelope.value.bytes, {
      externalAad,
      profile: 'fips',
      expectedKeyId: keyId,
      expectedAlgorithm: 'ESP256',
    })).toMatchObject({
      ok: true,
      value: {
        state: 'STRUCTURALLY_VALID',
        activation: 'NOT_BORN',
        proofEligible: false,
        signatureVerified: false,
        reasonCode: 'E_CONTAINMENT_E2_NOT_BORN',
      },
    });
  });

  it('uses only fully-specified algorithms and honest portable policy', () => {
    for (const algorithm of [-7, -8]) {
      expect(createContainmentCoseProtectedHeaders({
        algorithm,
        keyId,
      })).toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_COSE_ALGORITHM_DEPRECATED' },
      });
    }
    expect(createContainmentCoseProtectedHeaders({
      algorithm: 'Ed25519',
      keyId,
      profile: 'fips',
      allowEd25519: true,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_ALGORITHM_POLICY' },
    });
    expect(createContainmentCoseProtectedHeaders({
      algorithm: 'Ed25519',
      keyId,
      profile: 'portable',
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_ALGORITHM_POLICY' },
    });
    expect(createContainmentCoseProtectedHeaders({
      algorithm: 'Ed25519',
      keyId,
      profile: 'portable',
      allowEd25519: true,
    })).toMatchObject({
      ok: true,
      value: {
        algorithm: CONTAINMENT_COSE_ALGORITHMS.Ed25519,
        algorithmName: 'Ed25519',
        curve: 'Ed25519',
        profile: 'portable',
      },
    });
    expect(createContainmentCoseProtectedHeaders({
      algorithm: 'Ed448',
      keyId,
      profile: 'portable',
      allowEd448: true,
    })).toMatchObject({
      ok: false,
      hold: {
        reasonCode: 'E_CONTAINMENT_COSE_ALGORITHM_UNSUPPORTED',
        details: { signatureBytes: 114 },
      },
    });
  });

  it('makes only the Deckent profile header critical', () => {
    const externalAad = mustAad();
    const payload = mustEncode({ receipt: 1 });
    const missingProfile = mustEncode(new Map([
      [1, CONTAINMENT_COSE_ALGORITHMS.ESP256],
      [2, ['deckent-profile']],
      [3, CONTAINMENT_COSE_CONTENT_TYPE],
      [4, keyId],
    ]));
    expect(createContainmentCoseSigningStructure({
      protectedHeaders: missingProfile,
      externalAad,
      payload,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_PROTECTED_INVALID' },
    });

    const standardCritical = mustEncode(new Map([
      [1, CONTAINMENT_COSE_ALGORITHMS.ESP256],
      [2, [1, 3, 4]],
      [3, CONTAINMENT_COSE_CONTENT_TYPE],
      [4, keyId],
      [CONTAINMENT_COSE_HEADER_LABELS.deckentProfile, CONTAINMENT_COSE_PROFILE],
    ]));
    expect(createContainmentCoseSigningStructure({
      protectedHeaders: standardCritical,
      externalAad,
      payload,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_CRITICAL_HEADERS_INVALID' },
    });
  });

  it('binds external AAD but never exposes mutable byte/digest pairs', () => {
    const aadResult = createContainmentExternalAad({
      protocol: 'deckent.containment.v2',
      schemaVersion: 3,
      kind: 'DISCOVERY',
      sequence: 1,
      challenge: digestA,
      bindingsDigest: digestB,
      controlPlaneEpoch: 7,
      issuerRole: 'NATIVE_ATTESTOR',
      componentRole: 'LINUX_NATIVE',
      issuerLineageDigest: digestC,
    });
    expect(aadResult.ok).toBe(true);
    if (!aadResult.ok) throw new Error(aadResult.hold.reasonCode);
    const original = aadResult.value.bytes;
    original[0] ^= 0xff;
    const fresh = aadResult.value.bytes;
    expect(fresh).not.toEqual(original);
    expect(aadResult.value.digestRef).toBe(digestRef(fresh));

    const payload = mustEncode({ receipt: 1 });
    const signing = createContainmentCoseSigningStructure({
      protectedHeaders: mustProtected(),
      externalAad: fresh,
      payload,
    });
    expect(signing.ok).toBe(true);
    if (!signing.ok) throw new Error(signing.hold.reasonCode);
    const first = signing.value.bytes;
    first[0] ^= 0xff;
    expect(signing.value.digestRef).toBe(digestRef(signing.value.bytes));
    expect(signing.value.bytes).not.toEqual(first);
  });

  it('rejects accessors, proxies and shared-memory views without throwing', () => {
    let getterCount = 0;
    const getterInput = Object.defineProperty({
      algorithm: 'ESP256',
      keyId,
    }, 'unused', {
      enumerable: true,
      get() {
        getterCount += 1;
        throw new Error('must not execute');
      },
    });
    expect(() => createContainmentCoseProtectedHeaders(getterInput)).not.toThrow();
    expect(createContainmentCoseProtectedHeaders(getterInput)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_INPUT_INVALID' },
    });
    expect(getterCount).toBe(0);

    let trapCount = 0;
    const proxy = new Proxy({ algorithm: 'ESP256', keyId }, {
      ownKeys() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });
    expect(createContainmentCoseProtectedHeaders(proxy)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_INPUT_INVALID' },
    });
    expect(trapCount).toBe(0);

    if (typeof SharedArrayBuffer === 'function') {
      expect(createContainmentCoseProtectedHeaders({
        algorithm: 'ESP256',
        keyId: new Uint8Array(new SharedArrayBuffer(32)),
      })).toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_COSE_KEY_ID_INVALID' },
      });
    }
  });

  it('rejects unprotected authority, malformed scalars and high-S ESP256', () => {
    const protectedHeaders = mustProtected();
    const externalAad = mustAad();
    const payload = mustEncode({ receipt: 1 });
    const unprotectedAuthority = mustEncode([
      protectedHeaders,
      new Map([[4, keyId]]),
      payload,
      signature,
    ]);
    expect(validateContainmentCoseSign1(unprotectedAuthority, {
      externalAad,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_ENVELOPE_INVALID' },
    });

    const zeroR = new Uint8Array(64);
    zeroR[63] = 1;
    expect(createContainmentCoseSign1({
      protectedHeaders,
      externalAad,
      payload,
      signature: zeroR,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_SIGNATURE_SCALAR_INVALID' },
    });

    const p256Order =
      0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
    const highS = new Uint8Array(64);
    highS.set(uint256(1n), 0);
    highS.set(uint256((p256Order >> 1n) + 1n), 32);
    expect(createContainmentCoseSign1({
      protectedHeaders,
      externalAad,
      payload,
      signature: highS,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_SIGNATURE_MALLEABLE' },
    });

    expect(createContainmentCoseSigningStructure({
      protectedHeaders,
      externalAad,
      payload: Uint8Array.from([0x18, 0x01]),
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_PAYLOAD_NONCANONICAL' },
    });
    expect(createContainmentCoseSigningStructure({
      protectedHeaders,
      externalAad,
      payload,
      expectedKeyId: Uint8Array.from({ length: 32 }, () => 99),
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_KEY_ID_MISMATCH' },
    });
  });

  it('enforces every ESP256 scalar and raw-shape boundary', () => {
    const protectedHeaders = mustProtected();
    const externalAad = mustAad();
    const payload = mustEncode({ receipt: 1 });
    const p256Order =
      0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
    const halfOrder = p256Order >> 1n;

    for (const malformed of [
      espSignature(p256Order, 1n),
      espSignature(1n, 0n),
      espSignature(1n, p256Order),
    ]) {
      expect(createContainmentCoseSign1({
        protectedHeaders,
        externalAad,
        payload,
        signature: malformed,
      })).toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_COSE_SIGNATURE_SCALAR_INVALID' },
      });
    }
    expect(createContainmentCoseSign1({
      protectedHeaders,
      externalAad,
      payload,
      signature: espSignature(1n, halfOrder),
    }).ok).toBe(true);
    for (const byteLength of [63, 65]) {
      expect(createContainmentCoseSign1({
        protectedHeaders,
        externalAad,
        payload,
        signature: new Uint8Array(byteLength),
      })).toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_COSE_SIGNATURE_SHAPE_INVALID' },
      });
    }
  });

  it('never invokes byte species or poisoned cross-realm methods', () => {
    let speciesCount = 0;
    class AdversarialBytes extends Uint8Array {
      static get [Symbol.species](): Uint8ArrayConstructor {
        speciesCount += 1;
        throw new Error('species must not execute');
      }
    }
    const adversarialKeyId = new AdversarialBytes(32);
    adversarialKeyId.fill(7);
    expect(createContainmentCoseProtectedHeaders({
      algorithm: 'ESP256',
      keyId: adversarialKeyId,
    }).ok).toBe(true);
    expect(speciesCount).toBe(0);

    const foreign = runInNewContext(`
      (() => {
        let callCount = 0;
        const value = new Uint8Array(32);
        value.fill(8);
        Object.defineProperty(Uint8Array, Symbol.species, {
          configurable: true,
          get() {
            callCount += 1;
            throw new Error('foreign species must not execute');
          },
        });
        Uint8Array.prototype.slice = function () {
          callCount += 1;
          throw new Error('foreign slice must not execute');
        };
        return { value, calls: () => callCount };
      })()
    `);
    const result = createContainmentCoseProtectedHeaders({
      algorithm: 'ESP256',
      keyId: foreign.value,
    });
    expect(result.ok).toBe(true);
    expect(foreign.calls()).toBe(0);
  });

  it('returns typed HOLD for revoked proxies and preflights oversized bytes', () => {
    const revokedInput = Proxy.revocable({}, {});
    revokedInput.revoke();
    expect(() => createContainmentCoseProtectedHeaders(
      revokedInput.proxy as never,
    )).not.toThrow();
    expect(createContainmentCoseProtectedHeaders(
      revokedInput.proxy as never,
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_INPUT_INVALID' },
    });

    const revokedOptions = Proxy.revocable({}, {});
    revokedOptions.revoke();
    expect(() => validateContainmentCoseSign1(
      Uint8Array.from([0x80]),
      revokedOptions.proxy as never,
    )).not.toThrow();
    expect(validateContainmentCoseSign1(
      Uint8Array.from([0x80]),
      revokedOptions.proxy as never,
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_INPUT_INVALID' },
    });

    let speciesCount = 0;
    class OversizedBytes extends Uint8Array {
      static get [Symbol.species](): Uint8ArrayConstructor {
        speciesCount += 1;
        throw new Error('oversized bytes must not be copied');
      }
    }
    expect(createContainmentCoseSigningStructure({
      protectedHeaders: mustProtected(),
      externalAad: mustAad(),
      payload: new OversizedBytes((1024 * 1024) + 1),
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_SIGNING_INPUT_INVALID' },
    });
    expect(createContainmentCoseSign1({
      protectedHeaders: mustProtected(),
      externalAad: mustAad(),
      payload: mustEncode({ receipt: 1 }),
      signature: new OversizedBytes(115),
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_ENVELOPE_INPUT_INVALID' },
    });
    expect(speciesCount).toBe(0);
  });

  it('denies SharedArrayBuffer on every public byte-bearing path', () => {
    if (typeof SharedArrayBuffer !== 'function') return;
    const shared = (length: number) => new Uint8Array(
      new SharedArrayBuffer(length),
    );
    const protectedHeaders = mustProtected();
    const externalAad = mustAad();
    const payload = mustEncode({ receipt: 1 });

    expect(createContainmentCoseProtectedHeaders({
      algorithm: 'ESP256',
      keyId: shared(32),
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_KEY_ID_INVALID' },
    });
    expect(createContainmentExternalAad({
      protocol: 'deckent.containment.v2',
      schemaVersion: 3,
      kind: 'DISCOVERY',
      sequence: 1,
      challenge: shared(32),
      bindingsDigest: digestB,
      controlPlaneEpoch: 7,
      issuerRole: 'NATIVE_ATTESTOR',
      componentRole: 'LINUX_NATIVE',
      issuerLineageDigest: digestC,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_EXTERNAL_AAD_INVALID' },
    });
    expect(createContainmentCoseSigningStructure({
      protectedHeaders: shared(protectedHeaders.byteLength),
      externalAad,
      payload,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_SIGNING_INPUT_INVALID' },
    });
    expect(createContainmentCoseSigningStructure({
      protectedHeaders,
      externalAad: shared(externalAad.byteLength),
      payload,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_EXTERNAL_AAD_INVALID' },
    });
    expect(createContainmentCoseSigningStructure({
      protectedHeaders,
      externalAad,
      payload: shared(payload.byteLength),
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_SIGNING_INPUT_INVALID' },
    });
    expect(createContainmentCoseSign1({
      protectedHeaders,
      externalAad,
      payload,
      signature: shared(64),
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_ENVELOPE_INPUT_INVALID' },
    });
    expect(createContainmentCoseSigningStructure({
      protectedHeaders,
      externalAad,
      payload,
      expectedKeyId: shared(32),
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_KEY_ID_MISMATCH' },
    });
    expect(validateContainmentCoseSign1(shared(16), {
      externalAad,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_ENVELOPE_INVALID' },
    });
  });

  it('keeps all returned byte and digest pairs on private snapshots', () => {
    const mutableKeyId = Uint8Array.from(keyId);
    const headers = createContainmentCoseProtectedHeaders({
      algorithm: 'ESP256',
      keyId: mutableKeyId,
    });
    expect(headers.ok).toBe(true);
    if (!headers.ok) throw new Error(headers.hold.reasonCode);
    mutableKeyId[0] ^= 0xff;
    const firstKeyId = headers.value.keyId;
    firstKeyId[0] ^= 0xff;
    expect(headers.value.keyId).toEqual(keyId);
    const firstProtected = headers.value.protectedHeaders;
    firstProtected[0] ^= 0xff;
    expect(headers.value.protectedHeaders).not.toEqual(firstProtected);

    const payload = mustEncode({ receipt: 1 });
    const externalAad = mustAad();
    const envelope = createContainmentCoseSign1({
      protectedHeaders: headers.value.protectedHeaders,
      externalAad,
      payload,
      signature,
    });
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) throw new Error(envelope.hold.reasonCode);
    const firstEnvelope = envelope.value.bytes;
    firstEnvelope[0] ^= 0xff;
    expect(envelope.value.digestRef).toBe(digestRef(envelope.value.bytes));
    expect(envelope.value.bytes).not.toEqual(firstEnvelope);

    const validation = validateContainmentCoseSign1(envelope.value.bytes, {
      externalAad,
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error(validation.hold.reasonCode);
    const firstPayload = validation.value.payload;
    const firstSignature = validation.value.signature;
    firstPayload[0] ^= 0xff;
    firstSignature[0] ^= 0xff;
    expect(validation.value.payload).toEqual(payload);
    expect(validation.value.signature).toEqual(signature);
    expect(validation.value.payloadDigestRef).toBe(digestRef(payload));
    expect(validation.value.signatureVerified).toBe(false);
    expect(validation.value.proofEligible).toBe(false);
  });
});
