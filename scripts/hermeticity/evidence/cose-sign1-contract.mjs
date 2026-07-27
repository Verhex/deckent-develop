import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';

import {
  DETERMINISTIC_CBOR_LIMITS,
  decodeDeterministicCbor,
  encodeDeterministicCbor,
} from './deterministic-cbor.mjs';

export const COSE_SIGN1_CONTRACT_VERSION = 2;
export const CONTAINMENT_COSE_CONTENT_TYPE =
  'application/vnd.deckent.containment-evidence+cbor';
export const CONTAINMENT_COSE_PROFILE =
  'deckent.containment.cose-sign1.v2';

// RFC 9864 fully-specified COSE algorithm identifiers. The deprecated
// polymorphic ES256 (-7) and EdDSA (-8) identifiers are intentionally denied.
export const CONTAINMENT_COSE_ALGORITHMS = Object.freeze({
  ESP256: -9,
  Ed25519: -19,
  Ed448: -53,
});

export const CONTAINMENT_COSE_HEADER_LABELS = Object.freeze({
  algorithm: 1,
  critical: 2,
  contentType: 3,
  keyId: 4,
  deckentProfile: 'deckent-profile',
});

const DEPRECATED_POLYMORPHIC_ALGORITHMS = Object.freeze([-7, -8]);
const REQUIRED_PROTECTED_LABELS = Object.freeze([
  1,
  2,
  3,
  4,
  'deckent-profile',
]);
const REQUIRED_CRITICAL_LABELS = Object.freeze([
  'deckent-profile',
]);
const AAD_KEYS = Object.freeze([
  'protocol',
  'schemaVersion',
  'kind',
  'sequence',
  'challenge',
  'bindingsDigest',
  'controlPlaneEpoch',
  'issuerRole',
  'componentRole',
  'issuerLineageDigest',
]);
const PROTECTED_INPUT_KEYS = Object.freeze([
  'algorithm',
  'keyId',
  'profile',
  'allowEd25519',
  'allowEd448',
]);
const SIGNING_INPUT_KEYS = Object.freeze([
  'protectedHeaders',
  'externalAad',
  'payload',
  'profile',
  'allowEd25519',
  'allowEd448',
  'expectedKeyId',
  'expectedAlgorithm',
]);
const SIGN1_INPUT_KEYS = Object.freeze([
  ...SIGNING_INPUT_KEYS,
  'signature',
]);
const VALIDATE_OPTION_KEYS = Object.freeze([
  'externalAad',
  'profile',
  'allowEd25519',
  'allowEd448',
  'expectedKeyId',
  'expectedAlgorithm',
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const ROLE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/u;
const P256_ORDER =
  0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const P256_HALF_ORDER = P256_ORDER >> 1n;
const MAX_CANONICAL_BYTES = DETERMINISTIC_CBOR_LIMITS.maxBytes;
const MAX_PROTECTED_HEADER_BYTES = 4096;
const MAX_EXTERNAL_AAD_BYTES = 16 * 1024;
const MAX_SIGNATURE_BYTES = 114;

const IntrinsicMap = Map;
const IntrinsicUint8Array = Uint8Array;
const intrinsicIsArray = Array.isArray;
const intrinsicGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const intrinsicGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const intrinsicGetPrototypeOf = Object.getPrototypeOf;
const intrinsicIsMap = nodeTypes.isMap;
const intrinsicIsProxy = nodeTypes.isProxy;
const intrinsicIsSharedArrayBuffer = nodeTypes.isSharedArrayBuffer;
const intrinsicIsUint8Array = nodeTypes.isUint8Array;
const intrinsicOwnKeys = Reflect.ownKeys;
let mapAuthorityValue = null;
let typedArrayAuthorityValue = null;

function mapAuthority() {
  if (mapAuthorityValue === null) {
    const sizeGetter = intrinsicGetOwnPropertyDescriptor(
      IntrinsicMap.prototype,
      'size',
    ).get;
    mapAuthorityValue = Object.freeze({
      get: Function.prototype.call.bind(IntrinsicMap.prototype.get),
      has: Function.prototype.call.bind(IntrinsicMap.prototype.has),
      size: Function.prototype.call.bind(sizeGetter),
    });
  }
  return mapAuthorityValue;
}

function typedArrayAuthority() {
  if (typedArrayAuthorityValue === null) {
    const typedArrayPrototype = intrinsicGetPrototypeOf(
      IntrinsicUint8Array.prototype,
    );
    const bufferGetter = intrinsicGetOwnPropertyDescriptor(
      typedArrayPrototype,
      'buffer',
    ).get;
    const byteLengthGetter = intrinsicGetOwnPropertyDescriptor(
      typedArrayPrototype,
      'byteLength',
    ).get;
    typedArrayAuthorityValue = Object.freeze({
      buffer: Function.prototype.call.bind(bufferGetter),
      byteLength: Function.prototype.call.bind(byteLengthGetter),
    });
  }
  return typedArrayAuthorityValue;
}

function mapValue(value, key) {
  return mapAuthority().get(value, key);
}

function mapContains(value, key) {
  return mapAuthority().has(value, key);
}

function freezeDetails(value) {
  if (intrinsicIsArray(value)) return Object.freeze(value.map(freezeDetails));
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = freezeDetails(item);
    }
    return Object.freeze(result);
  }
  return value;
}

function hold(reasonCode, details = {}) {
  return {
    ok: false,
    hold: Object.freeze({
      schemaVersion: COSE_SIGN1_CONTRACT_VERSION,
      kind: 'containment-cose-sign1',
      state: 'HOLD',
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
      reasonCode,
      details: freezeDetails(details),
    }),
  };
}

function coseBoundary(reasonCode, operation) {
  try {
    return operation();
  } catch {
    return hold(reasonCode);
  }
}

function ownDataRecord(value, allowedKeys, requiredKeys = []) {
  if (value === null
    || typeof value !== 'object'
    || intrinsicIsProxy(value)
    || intrinsicIsArray(value)) {
    return null;
  }
  let prototype;
  let keys;
  let descriptors;
  try {
    prototype = intrinsicGetPrototypeOf(value);
    keys = intrinsicOwnKeys(value);
    if (keys.length > allowedKeys.length
      || keys.some(key => typeof key !== 'string' || !allowedKeys.includes(key))) {
      return null;
    }
    descriptors = intrinsicGetOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptorKeys = intrinsicOwnKeys(descriptors);
  if (descriptorKeys.length !== keys.length
    || descriptorKeys.some((key, index) => key !== keys[index])
    || requiredKeys.some(key => !descriptorKeys.includes(key))) {
    return null;
  }
  const result = Object.create(null);
  for (const key of descriptorKeys) {
    const descriptor = descriptors[key];
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true) {
      return null;
    }
    result[key] = descriptor.value;
  }
  return result;
}

function byteViewMetadata(value) {
  if (intrinsicIsProxy(value) || !intrinsicIsUint8Array(value)) return null;
  try {
    if (intrinsicIsSharedArrayBuffer(typedArrayAuthority().buffer(value))) {
      return null;
    }
    const byteLength = typedArrayAuthority().byteLength(value);
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) return null;
    return Object.freeze({ byteLength });
  } catch {
    return null;
  }
}

function bytes(value, maximum = MAX_CANONICAL_BYTES, minimum = 0) {
  const metadata = byteViewMetadata(value);
  if (metadata === null
    || metadata.byteLength < minimum
    || metadata.byteLength > maximum) {
    return null;
  }
  const result = new IntrinsicUint8Array(metadata.byteLength);
  for (let index = 0; index < metadata.byteLength; index += 1) {
    result[index] = value[index];
  }
  return result;
}

function immutableByteFields(fields, byteFields) {
  const result = { ...fields };
  for (const [key, value] of Object.entries(byteFields)) {
    const snapshot = bytes(value, MAX_CANONICAL_BYTES);
    if (snapshot === null) throw new TypeError('invalid private byte snapshot');
    const byteLength = typedArrayAuthority().byteLength(snapshot);
    Object.defineProperty(result, key, {
      enumerable: true,
      configurable: false,
      get() {
        const copy = bytes(snapshot, byteLength, byteLength);
        if (copy === null) throw new TypeError('private byte snapshot unavailable');
        return copy;
      },
    });
  }
  return Object.freeze(result);
}

function bytesEqual(left, right) {
  const leftLength = typedArrayAuthority().byteLength(left);
  const rightLength = typedArrayAuthority().byteLength(right);
  if (leftLength !== rightLength) return false;
  for (let index = 0; index < leftLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function digestRef(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function safeMapSize(value) {
  if (intrinsicIsProxy(value) || !intrinsicIsMap(value)) return -1;
  try {
    return mapAuthority().size(value);
  } catch {
    return -1;
  }
}

function validId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validRole(value) {
  return typeof value === 'string' && ROLE_PATTERN.test(value);
}

function validDigest(value) {
  return bytes(value, 32, 32);
}

function algorithmLabel(value) {
  if (value === 'ESP256' || value === CONTAINMENT_COSE_ALGORITHMS.ESP256) {
    return CONTAINMENT_COSE_ALGORITHMS.ESP256;
  }
  if (value === 'Ed25519' || value === CONTAINMENT_COSE_ALGORITHMS.Ed25519) {
    return CONTAINMENT_COSE_ALGORITHMS.Ed25519;
  }
  if (value === 'Ed448' || value === CONTAINMENT_COSE_ALGORITHMS.Ed448) {
    return CONTAINMENT_COSE_ALGORITHMS.Ed448;
  }
  return null;
}

function algorithmName(value) {
  if (value === CONTAINMENT_COSE_ALGORITHMS.ESP256) return 'ESP256';
  if (value === CONTAINMENT_COSE_ALGORITHMS.Ed25519) return 'Ed25519';
  if (value === CONTAINMENT_COSE_ALGORITHMS.Ed448) return 'Ed448';
  return null;
}

function validateAlgorithmPolicy(algorithm, options) {
  const profile = options.profile ?? 'fips';
  if (profile !== 'fips' && profile !== 'portable') {
    return hold('E_CONTAINMENT_COSE_POLICY_INVALID', { field: 'profile' });
  }
  if (DEPRECATED_POLYMORPHIC_ALGORITHMS.includes(algorithm)) {
    return hold('E_CONTAINMENT_COSE_ALGORITHM_DEPRECATED', { algorithm });
  }
  if (algorithm === CONTAINMENT_COSE_ALGORITHMS.Ed448) {
    return hold('E_CONTAINMENT_COSE_ALGORITHM_UNSUPPORTED', {
      algorithm,
      algorithmName: 'Ed448',
      signatureBytes: 114,
    });
  }
  if (algorithm !== CONTAINMENT_COSE_ALGORITHMS.ESP256
    && algorithm !== CONTAINMENT_COSE_ALGORITHMS.Ed25519) {
    return hold('E_CONTAINMENT_COSE_ALGORITHM_INVALID', { algorithm });
  }
  if (profile === 'fips'
    && algorithm !== CONTAINMENT_COSE_ALGORITHMS.ESP256) {
    return hold('E_CONTAINMENT_COSE_ALGORITHM_POLICY', {
      profile,
      algorithm,
      required: 'ESP256',
    });
  }
  if (algorithm === CONTAINMENT_COSE_ALGORITHMS.Ed25519
    && (profile !== 'portable' || options.allowEd25519 !== true)) {
    return hold('E_CONTAINMENT_COSE_ALGORITHM_POLICY', {
      profile,
      algorithm,
      requiredAuthorization: 'allowEd25519',
    });
  }
  return {
    ok: true,
    value: Object.freeze({
      profile,
      algorithm,
      algorithmName: algorithmName(algorithm),
      curve: algorithm === CONTAINMENT_COSE_ALGORITHMS.ESP256
        ? 'P-256'
        : 'Ed25519',
      signatureBytes: 64,
    }),
  };
}

function protectedHeaderView(value) {
  return immutableByteFields({
    algorithm: value.algorithm,
    algorithmName: value.algorithmName,
    curve: value.curve,
    contentType: value.contentType,
    deckentProfile: value.deckentProfile,
    profile: value.profile,
  }, {
    keyId: value.keyId,
  });
}

function parseProtectedHeaders(protectedBytes, options) {
  const decoded = decodeDeterministicCbor(protectedBytes);
  if (!decoded.ok) {
    return hold('E_CONTAINMENT_COSE_PROTECTED_NONCANONICAL', {
      cborReasonCode: decoded.hold.reasonCode,
    });
  }
  const headerMap = decoded.value;
  if (!intrinsicIsMap(headerMap)
    || safeMapSize(headerMap) !== REQUIRED_PROTECTED_LABELS.length
    || REQUIRED_PROTECTED_LABELS.some(label => !mapContains(headerMap, label))) {
    return hold('E_CONTAINMENT_COSE_PROTECTED_INVALID');
  }
  const algorithm = mapValue(headerMap, CONTAINMENT_COSE_HEADER_LABELS.algorithm);
  const critical = mapValue(headerMap, CONTAINMENT_COSE_HEADER_LABELS.critical);
  const contentType = mapValue(
    headerMap,
    CONTAINMENT_COSE_HEADER_LABELS.contentType,
  );
  const keyId = bytes(
    mapValue(headerMap, CONTAINMENT_COSE_HEADER_LABELS.keyId),
    64,
    16,
  );
  const deckentProfile = mapValue(
    headerMap,
    CONTAINMENT_COSE_HEADER_LABELS.deckentProfile,
  );
  if (!intrinsicIsArray(critical)
    || critical.length !== REQUIRED_CRITICAL_LABELS.length
    || critical.some((label, index) => (
      label !== REQUIRED_CRITICAL_LABELS[index]
      || !mapContains(headerMap, label)
    ))) {
    return hold('E_CONTAINMENT_COSE_CRITICAL_HEADERS_INVALID');
  }
  if (contentType !== CONTAINMENT_COSE_CONTENT_TYPE) {
    return hold('E_CONTAINMENT_COSE_CONTENT_TYPE_INVALID');
  }
  if (deckentProfile !== CONTAINMENT_COSE_PROFILE) {
    return hold('E_CONTAINMENT_COSE_PROFILE_INVALID');
  }
  if (keyId === null) {
    return hold('E_CONTAINMENT_COSE_KEY_ID_INVALID');
  }
  const policy = validateAlgorithmPolicy(algorithm, options);
  if (!policy.ok) return policy;
  const expectedKeyId = options.expectedKeyId === undefined
    ? null
    : bytes(options.expectedKeyId, 64, 16);
  if (options.expectedKeyId !== undefined
    && (expectedKeyId === null || !bytesEqual(expectedKeyId, keyId))) {
    return hold('E_CONTAINMENT_COSE_KEY_ID_MISMATCH');
  }
  if (options.expectedAlgorithm !== undefined) {
    const expectedAlgorithm = algorithmLabel(options.expectedAlgorithm);
    if (expectedAlgorithm === null || expectedAlgorithm !== algorithm) {
      return hold('E_CONTAINMENT_COSE_ALGORITHM_MISMATCH');
    }
  }
  return {
    ok: true,
    value: Object.freeze({
      algorithm,
      algorithmName: policy.value.algorithmName,
      curve: policy.value.curve,
      contentType,
      deckentProfile,
      keyId,
      profile: policy.value.profile,
      signatureBytes: policy.value.signatureBytes,
    }),
  };
}

function uint256BigEndian(value, offset) {
  let result = 0n;
  for (let index = offset; index < offset + 32; index += 1) {
    result = (result << 8n) | BigInt(value[index]);
  }
  return result;
}

function validateSignatureShape(signature, algorithm) {
  const signatureLength = typedArrayAuthority().byteLength(signature);
  if (algorithm === CONTAINMENT_COSE_ALGORITHMS.ESP256) {
    if (signatureLength !== 64) {
      return hold('E_CONTAINMENT_COSE_SIGNATURE_SHAPE_INVALID');
    }
    const r = uint256BigEndian(signature, 0);
    const s = uint256BigEndian(signature, 32);
    if (r < 1n || r >= P256_ORDER || s < 1n || s >= P256_ORDER) {
      return hold('E_CONTAINMENT_COSE_SIGNATURE_SCALAR_INVALID');
    }
    if (s > P256_HALF_ORDER) {
      return hold('E_CONTAINMENT_COSE_SIGNATURE_MALLEABLE');
    }
    return { ok: true };
  }
  if (algorithm === CONTAINMENT_COSE_ALGORITHMS.Ed25519
    && signatureLength === 64) {
    return { ok: true };
  }
  return hold('E_CONTAINMENT_COSE_SIGNATURE_SHAPE_INVALID');
}

function createContainmentCoseProtectedHeadersInternal(input) {
  const record = ownDataRecord(input, PROTECTED_INPUT_KEYS);
  if (!record) return hold('E_CONTAINMENT_COSE_INPUT_INVALID');
  const algorithm = algorithmLabel(record.algorithm ?? 'ESP256');
  if (algorithm === null) {
    if (DEPRECATED_POLYMORPHIC_ALGORITHMS.includes(record.algorithm)) {
      return hold('E_CONTAINMENT_COSE_ALGORITHM_DEPRECATED', {
        algorithm: record.algorithm,
      });
    }
    return hold('E_CONTAINMENT_COSE_ALGORITHM_INVALID');
  }
  const policy = validateAlgorithmPolicy(algorithm, record);
  if (!policy.ok) return policy;
  const keyId = bytes(record.keyId, 64, 16);
  if (keyId === null) {
    return hold('E_CONTAINMENT_COSE_KEY_ID_INVALID');
  }
  const headers = new IntrinsicMap([
    [CONTAINMENT_COSE_HEADER_LABELS.algorithm, algorithm],
    [CONTAINMENT_COSE_HEADER_LABELS.critical, [...REQUIRED_CRITICAL_LABELS]],
    [CONTAINMENT_COSE_HEADER_LABELS.contentType, CONTAINMENT_COSE_CONTENT_TYPE],
    [CONTAINMENT_COSE_HEADER_LABELS.keyId, keyId],
    [CONTAINMENT_COSE_HEADER_LABELS.deckentProfile, CONTAINMENT_COSE_PROFILE],
  ]);
  const encoded = encodeDeterministicCbor(headers);
  if (!encoded.ok) {
    return hold('E_CONTAINMENT_COSE_PROTECTED_ENCODING', {
      cborReasonCode: encoded.hold.reasonCode,
    });
  }
  return {
    ok: true,
    value: immutableByteFields({
      algorithm,
      algorithmName: policy.value.algorithmName,
      curve: policy.value.curve,
      profile: policy.value.profile,
      deckentProfile: CONTAINMENT_COSE_PROFILE,
      proofEligible: false,
      activation: 'NOT_BORN',
    }, {
      protectedHeaders: encoded.value,
      keyId,
    }),
  };
}

function createContainmentExternalAadInternal(input) {
  const record = ownDataRecord(input, AAD_KEYS, AAD_KEYS);
  if (!record
    || record.protocol !== 'deckent.containment.v2'
    || !Number.isSafeInteger(record.schemaVersion)
    || record.schemaVersion < 1
    || !validId(record.kind)
    || !Number.isSafeInteger(record.sequence)
    || record.sequence < 0
    || !Number.isSafeInteger(record.controlPlaneEpoch)
    || record.controlPlaneEpoch < 1
    || !validRole(record.issuerRole)
    || !validRole(record.componentRole)) {
    return hold('E_CONTAINMENT_COSE_EXTERNAL_AAD_INVALID');
  }
  const challenge = validDigest(record.challenge);
  const bindingsDigest = validDigest(record.bindingsDigest);
  const issuerLineageDigest = validDigest(record.issuerLineageDigest);
  if (challenge === null
    || bindingsDigest === null
    || issuerLineageDigest === null) {
    return hold('E_CONTAINMENT_COSE_EXTERNAL_AAD_INVALID', {
      field: 'digest',
    });
  }
  const encoded = encodeDeterministicCbor({
    protocol: record.protocol,
    schemaVersion: record.schemaVersion,
    kind: record.kind,
    sequence: record.sequence,
    challenge,
    bindingsDigest,
    controlPlaneEpoch: record.controlPlaneEpoch,
    issuerRole: record.issuerRole,
    componentRole: record.componentRole,
    issuerLineageDigest,
  });
  if (!encoded.ok) {
    return hold('E_CONTAINMENT_COSE_EXTERNAL_AAD_INVALID', {
      cborReasonCode: encoded.hold.reasonCode,
    });
  }
  return {
    ok: true,
    value: immutableByteFields({
      digestRef: digestRef(encoded.value),
      proofEligible: false,
      activation: 'NOT_BORN',
    }, {
      bytes: encoded.value,
    }),
  };
}

function validateExternalAad(value) {
  const aad = bytes(value, MAX_EXTERNAL_AAD_BYTES, 1);
  if (aad === null) {
    return hold('E_CONTAINMENT_COSE_EXTERNAL_AAD_INVALID');
  }
  const decoded = decodeDeterministicCbor(aad);
  if (!decoded.ok || !intrinsicIsMap(decoded.value)) {
    return hold('E_CONTAINMENT_COSE_EXTERNAL_AAD_INVALID', {
      cborReasonCode: decoded.ok ? null : decoded.hold.reasonCode,
    });
  }
  if (safeMapSize(decoded.value) !== AAD_KEYS.length
    || AAD_KEYS.some(key => !mapContains(decoded.value, key))) {
    return hold('E_CONTAINMENT_COSE_EXTERNAL_AAD_INVALID');
  }
  const reconstructed = Object.create(null);
  for (const key of AAD_KEYS) reconstructed[key] = mapValue(decoded.value, key);
  const normalized = createContainmentExternalAad(reconstructed);
  if (!normalized.ok) return normalized;
  const normalizedBytes = normalized.value.bytes;
  if (!bytesEqual(normalizedBytes, aad)) {
    return hold('E_CONTAINMENT_COSE_EXTERNAL_AAD_INVALID');
  }
  return {
    ok: true,
    value: immutableByteFields({
      digestRef: digestRef(aad),
    }, {
      bytes: aad,
    }),
  };
}

function createContainmentCoseSigningStructureInternal(input) {
  const record = ownDataRecord(input, SIGNING_INPUT_KEYS, [
    'protectedHeaders',
    'externalAad',
    'payload',
  ]);
  if (!record) return hold('E_CONTAINMENT_COSE_SIGNING_INPUT_INVALID');
  const protectedHeaders = bytes(
    record.protectedHeaders,
    MAX_PROTECTED_HEADER_BYTES,
    1,
  );
  const payload = bytes(record.payload, MAX_CANONICAL_BYTES, 1);
  if (protectedHeaders === null || payload === null) {
    return hold('E_CONTAINMENT_COSE_SIGNING_INPUT_INVALID');
  }
  const headers = parseProtectedHeaders(protectedHeaders, record);
  if (!headers.ok) return headers;
  const externalAad = validateExternalAad(record.externalAad);
  if (!externalAad.ok) return externalAad;
  const canonicalPayload = decodeDeterministicCbor(payload);
  if (!canonicalPayload.ok) {
    return hold('E_CONTAINMENT_COSE_PAYLOAD_NONCANONICAL', {
      cborReasonCode: canonicalPayload.hold.reasonCode,
    });
  }
  const externalAadBytes = externalAad.value.bytes;
  const encoded = encodeDeterministicCbor([
    'Signature1',
    protectedHeaders,
    externalAadBytes,
    payload,
  ]);
  if (!encoded.ok) {
    return hold('E_CONTAINMENT_COSE_SIGNING_STRUCTURE_INVALID', {
      cborReasonCode: encoded.hold.reasonCode,
    });
  }
  return {
    ok: true,
    value: immutableByteFields({
      digestRef: digestRef(encoded.value),
      protectedHeaders: protectedHeaderView(headers.value),
      externalAadDigestRef: externalAad.value.digestRef,
      payloadDigestRef: digestRef(payload),
      proofEligible: false,
      signatureVerified: false,
      activation: 'NOT_BORN',
    }, {
      bytes: encoded.value,
    }),
  };
}

function createContainmentCoseSign1Internal(input) {
  const record = ownDataRecord(input, SIGN1_INPUT_KEYS, [
    'protectedHeaders',
    'externalAad',
    'payload',
    'signature',
  ]);
  if (!record) return hold('E_CONTAINMENT_COSE_ENVELOPE_INPUT_INVALID');
  const protectedHeaders = bytes(
    record.protectedHeaders,
    MAX_PROTECTED_HEADER_BYTES,
    1,
  );
  const payload = bytes(record.payload, MAX_CANONICAL_BYTES, 1);
  const signature = bytes(record.signature, MAX_SIGNATURE_BYTES);
  if (protectedHeaders === null || payload === null || signature === null) {
    return hold('E_CONTAINMENT_COSE_ENVELOPE_INPUT_INVALID');
  }
  const signing = createContainmentCoseSigningStructure({
    protectedHeaders,
    externalAad: record.externalAad,
    payload,
    profile: record.profile,
    allowEd25519: record.allowEd25519,
    allowEd448: record.allowEd448,
    expectedKeyId: record.expectedKeyId,
    expectedAlgorithm: record.expectedAlgorithm,
  });
  if (!signing.ok) return signing;
  const signatureShape = validateSignatureShape(
    signature,
    signing.value.protectedHeaders.algorithm,
  );
  if (!signatureShape.ok) return signatureShape;
  const encoded = encodeDeterministicCbor([
    protectedHeaders,
    new IntrinsicMap(),
    payload,
    signature,
  ]);
  if (!encoded.ok) {
    return hold('E_CONTAINMENT_COSE_ENVELOPE_ENCODING', {
      cborReasonCode: encoded.hold.reasonCode,
    });
  }
  return {
    ok: true,
    value: immutableByteFields({
      digestRef: digestRef(encoded.value),
      payloadDigestRef: signing.value.payloadDigestRef,
      protectedHeaders: signing.value.protectedHeaders,
      proofEligible: false,
      signatureVerified: false,
      activation: 'NOT_BORN',
    }, {
      bytes: encoded.value,
      signingStructure: signing.value.bytes,
    }),
  };
}

function validateContainmentCoseSign1Internal(value, options) {
  const record = ownDataRecord(options, VALIDATE_OPTION_KEYS, ['externalAad']);
  if (!record) return hold('E_CONTAINMENT_COSE_INPUT_INVALID');
  const envelope = bytes(value, MAX_CANONICAL_BYTES, 1);
  if (envelope === null) return hold('E_CONTAINMENT_COSE_ENVELOPE_INVALID');
  const decoded = decodeDeterministicCbor(envelope);
  if (!decoded.ok) {
    return hold('E_CONTAINMENT_COSE_ENVELOPE_NONCANONICAL', {
      cborReasonCode: decoded.hold.reasonCode,
    });
  }
  const envelopeValue = decoded.value;
  if (!intrinsicIsArray(envelopeValue) || envelopeValue.length !== 4) {
    return hold('E_CONTAINMENT_COSE_ENVELOPE_INVALID');
  }
  const protectedHeaders = bytes(
    envelopeValue[0],
    MAX_PROTECTED_HEADER_BYTES,
    1,
  );
  const unprotected = envelopeValue[1];
  const payload = bytes(envelopeValue[2], MAX_CANONICAL_BYTES, 1);
  const signature = bytes(envelopeValue[3], MAX_SIGNATURE_BYTES);
  if (protectedHeaders === null
    || !intrinsicIsMap(unprotected)
    || safeMapSize(unprotected) !== 0
    || payload === null
    || signature === null) {
    return hold('E_CONTAINMENT_COSE_ENVELOPE_INVALID');
  }
  const signing = createContainmentCoseSigningStructure({
    protectedHeaders,
    externalAad: record.externalAad,
    payload,
    profile: record.profile,
    allowEd25519: record.allowEd25519,
    allowEd448: record.allowEd448,
    expectedKeyId: record.expectedKeyId,
    expectedAlgorithm: record.expectedAlgorithm,
  });
  if (!signing.ok) return signing;
  const signatureShape = validateSignatureShape(
    signature,
    signing.value.protectedHeaders.algorithm,
  );
  if (!signatureShape.ok) return signatureShape;
  return {
    ok: true,
    value: immutableByteFields({
      schemaVersion: COSE_SIGN1_CONTRACT_VERSION,
      kind: 'containment-cose-sign1-validation',
      state: 'STRUCTURALLY_VALID',
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
      reasonCode: 'E_CONTAINMENT_E2_NOT_BORN',
      envelopeDigestRef: digestRef(envelope),
      protectedHeaders: signing.value.protectedHeaders,
      externalAadDigestRef: signing.value.externalAadDigestRef,
      payloadDigestRef: signing.value.payloadDigestRef,
    }, {
      payload,
      signature,
      signingStructure: signing.value.bytes,
    }),
  };
}

export function createContainmentCoseProtectedHeaders(input = {}) {
  return coseBoundary(
    'E_CONTAINMENT_COSE_INPUT_INVALID',
    () => createContainmentCoseProtectedHeadersInternal(input),
  );
}

export function createContainmentExternalAad(input) {
  return coseBoundary(
    'E_CONTAINMENT_COSE_EXTERNAL_AAD_INVALID',
    () => createContainmentExternalAadInternal(input),
  );
}

export function createContainmentCoseSigningStructure(input = {}) {
  return coseBoundary(
    'E_CONTAINMENT_COSE_SIGNING_INPUT_INVALID',
    () => createContainmentCoseSigningStructureInternal(input),
  );
}

export function createContainmentCoseSign1(input = {}) {
  return coseBoundary(
    'E_CONTAINMENT_COSE_ENVELOPE_INPUT_INVALID',
    () => createContainmentCoseSign1Internal(input),
  );
}

export function validateContainmentCoseSign1(value, options = {}) {
  return coseBoundary(
    'E_CONTAINMENT_COSE_INPUT_INVALID',
    () => validateContainmentCoseSign1Internal(value, options),
  );
}
