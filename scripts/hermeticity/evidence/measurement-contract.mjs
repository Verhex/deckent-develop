import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';

import {
  decodeDeterministicCbor,
  encodeDeterministicCbor,
} from './deterministic-cbor.mjs';
import { validateContainmentCoseSign1 } from './cose-sign1-contract.mjs';
import {
  CONTAINMENT_PLATFORM_COMPONENT_ROLE_AUTHORITY,
} from './platform-evidence-policy.mjs';

export const CONTAINMENT_MEASUREMENT_SCHEMA_VERSION = 2;
export const CONTAINMENT_MEASUREMENT_PROTOCOL = 'deckent.containment.v2';
export const CONTAINMENT_MEASUREMENT_MAX_BYTES = 1024 * 1024;

export const CONTAINMENT_RECEIPT_KINDS = Object.freeze([
  'ATTESTOR_ENROLLMENT',
  'DISCOVERY',
  'PROJECTION',
  'RESOURCE_PREPARED',
  'ADMISSION',
  'BIRTH_BOOTSTRAP',
  'RUNNING_COMPLETION',
  'SETTLEMENT_FINALITY',
  'CLEANUP_COMMIT',
]);

export const CONTAINMENT_E2_HOLD_REASONS = Object.freeze([
  'E_CONTAINMENT_E2_NOT_BORN',
  'E_CONTAINMENT_E2_INPUT_INVALID',
  'E_CONTAINMENT_E2_SCHEMA_INVALID',
  'E_CONTAINMENT_E2_KIND_INVALID',
  'E_CONTAINMENT_E2_SEQUENCE_INVALID',
  'E_CONTAINMENT_E2_PREVIOUS_RECEIPT_INVALID',
  'E_CONTAINMENT_E2_CHALLENGE_INVALID',
  'E_CONTAINMENT_E2_CHALLENGE_MISMATCH',
  'E_CONTAINMENT_E2_EPOCH_INVALID',
  'E_CONTAINMENT_E2_EPOCH_MISMATCH',
  'E_CONTAINMENT_E2_BINDING_INVALID',
  'E_CONTAINMENT_E2_BINDING_MISMATCH',
  'E_CONTAINMENT_E2_MEASUREMENT_INVALID',
  'E_CONTAINMENT_E2_MEASUREMENT_SET_INVALID',
  'E_CONTAINMENT_E2_VERDICT_INVALID',
  'E_CONTAINMENT_E2_COSE_INVALID',
  'E_CONTAINMENT_E2_KEY_LINEAGE_INVALID',
  'E_CONTAINMENT_E2_REPLAY_OR_FORK',
  'E_CONTAINMENT_E2_CHAIN_INCOMPLETE',
  'E_CONTAINMENT_E2_EXTERNAL_AAD_MISMATCH',
  'E_CONTAINMENT_E2_PLATFORM_UNSUPPORTED',
  'E_CONTAINMENT_E2_TRUST_POLICY_HOLD',
]);

export const CONTAINMENT_MEASUREMENT_SOURCES = Object.freeze([
  'native-attestor',
  'kernel',
  'host-control-plane',
  'rootless-oci-runtime',
  'windows-kernel',
  'virtualized-kernel',
]);

export const CONTAINMENT_PLATFORM_CLASSES = Object.freeze([
  'linux-native',
  'darwin-terminal',
  'darwin-signed-app',
  'darwin-virtualized-kernel',
  'win32-native',
  'wsl2',
  'oci-rootless',
]);

export const CONTAINMENT_AUTHORITY_ROLES = Object.freeze([
  'root-trust',
  'control-plane',
  'platform-attestor',
  'runtime-attestor',
  'resource-broker',
  'cleanup-authority',
]);

export const CONTAINMENT_KEY_PROFILES = Object.freeze({
  ESP256: Object.freeze({
    algorithm: 'ESP256',
    coseAlgorithm: -9,
    curve: 'P-256',
    supported: true,
  }),
  Ed25519: Object.freeze({
    algorithm: 'Ed25519',
    coseAlgorithm: -19,
    curve: 'Ed25519',
    supported: true,
  }),
  Ed448: Object.freeze({
    algorithm: 'Ed448',
    coseAlgorithm: -53,
    curve: 'Ed448',
    supported: false,
  }),
});

export const CONTAINMENT_MEASUREMENT_REQUIREMENTS = Object.freeze({
  ATTESTOR_ENROLLMENT: Object.freeze([
    'attestor-binary',
    'attestor-public-key',
    'platform-boot',
  ]),
  DISCOVERY: Object.freeze([
    'platform-capabilities',
    'kernel-identity',
    'host-identity',
  ]),
  PROJECTION: Object.freeze([
    'source-projection',
    'dependency-projection',
    'runtime-projection',
    'policy',
  ]),
  RESOURCE_PREPARED: Object.freeze([
    'resource-handles',
    'scratch-root',
    'boundary-plan',
  ]),
  ADMISSION: Object.freeze([
    'admission-grant-consumed',
    'admission-decision',
    'descriptor-set',
  ]),
  BIRTH_BOOTSTRAP: Object.freeze([
    'process-identity',
    'bootstrap-attestation',
    'boundary-inheritance',
  ]),
  RUNNING_COMPLETION: Object.freeze([
    'process-completion',
    'output-set',
    'descendant-set',
  ]),
  SETTLEMENT_FINALITY: Object.freeze([
    'exit-finality',
    'settlement-ledger',
    'resource-finality',
  ]),
  CLEANUP_COMMIT: Object.freeze([
    'cleanup-target-set',
    'cleanup-commit',
    'resource-empty',
  ]),
});

const RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'protocol',
  'kind',
  'sequence',
  'challenge',
  'previousEnvelopeDigest',
  'epochs',
  'bindings',
  'issuerLineage',
  'artifactRefs',
  'measurements',
  'verdict',
  'activation',
  'proofEligible',
]);
const EPOCH_KEYS = Object.freeze([
  'trust',
  'key',
  'session',
  'controlPlane',
]);
const BINDING_KEYS = Object.freeze([
  'tenantId',
  'projectId',
  'workspaceId',
  'goalId',
  'missionId',
  'flowId',
  'runId',
  'workItemId',
  'attemptId',
  'operationId',
  'executionInstanceId',
  'platformClass',
  'platformInstanceId',
  'policyId',
  'policyVersion',
  'policyDigest',
  'controlPlaneDigest',
  'fencingTokenDigest',
  'projectionDigest',
  'executionDigest',
  'resourceDigest',
]);
const LINEAGE_KEYS = Object.freeze([
  'issuerId',
  'authorityRole',
  'parentIssuerId',
  'enrollmentId',
  'enrollmentDigest',
  'keyId',
  'keyEpoch',
  'algorithm',
  'curve',
]);
const ARTIFACT_REF_KEYS = Object.freeze([
  'authorityGraphDigest',
  'componentAttestationSetDigest',
  'authorizationArtifactSetDigest',
  'admissionGrantDigest',
  'cleanupGrantDigest',
]);
const MEASUREMENT_KEYS = Object.freeze([
  'type',
  'source',
  'digestAlgorithm',
  'digest',
  'status',
]);
const VERDICT_KEYS = Object.freeze(['state', 'reasonCode']);
const EVIDENCE_ENVELOPE_KEYS = Object.freeze([
  'schemaVersion',
  'protocol',
  'kind',
  'receipt',
  'componentAttestations',
  'authorizationArtifacts',
  'authorityGraph',
  'activation',
  'proofEligible',
]);
const SIGNED_ITEM_KEYS = Object.freeze(['envelope', 'externalAad']);
const COMPONENT_KEYS = Object.freeze([
  'componentId',
  'componentRole',
  'platformClass',
  'authorityId',
  'signed',
]);
const AUTHORIZATION_KEYS = Object.freeze([
  'artifactId',
  'kind',
  'issuerId',
  'authorityRole',
  'subjectAuthorityId',
  'subjectExecutionInstanceId',
  'signed',
]);
const AUTHORITY_GRAPH_KEYS = Object.freeze(['nodes', 'edges']);
const AUTHORITY_NODE_KEYS = Object.freeze([
  'authorityId',
  'authorityRole',
  'parentAuthorityId',
  'platformClass',
  'enrollmentId',
  'enrollmentDigest',
  'keyId',
  'keyEpoch',
  'algorithm',
  'curve',
]);
const AUTHORITY_EDGE_KEYS = Object.freeze([
  'parentAuthorityId',
  'childAuthorityId',
  'relationship',
]);
const COMPONENT_PAYLOAD_KEYS = Object.freeze([
  'schemaVersion',
  'protocol',
  'kind',
  'sequence',
  'componentId',
  'componentRole',
  'platformClass',
  'challenge',
  'bindingsDigest',
  'issuerLineageDigest',
  'measurementDigest',
  'activation',
  'proofEligible',
]);
const GRANT_PAYLOAD_KEYS = Object.freeze([
  'schemaVersion',
  'protocol',
  'kind',
  'sequence',
  'artifactId',
  'challenge',
  'bindingsDigest',
  'subjectAuthorityId',
  'subjectExecutionInstanceId',
  'issuerLineageDigest',
  'authorizedAfterSequence',
  'authorizedEnvelopeDigest',
  'resourceDigest',
  'targetSetDigest',
  'fencingTokenDigest',
  'activation',
  'proofEligible',
]);
const ENROLLMENT_CREDENTIAL_PAYLOAD_KEYS = Object.freeze([
  'schemaVersion',
  'protocol',
  'kind',
  'sequence',
  'artifactId',
  'challenge',
  'bindingsDigest',
  'subjectAuthorityId',
  'credentialSubjectDigest',
  'issuerLineageDigest',
  'activation',
  'proofEligible',
]);
const CREDENTIAL_SUBJECT_KEYS = Object.freeze([
  'authorityId',
  'authorityRole',
  'parentAuthorityId',
  'enrollmentId',
  'keyId',
  'keyEpoch',
  'algorithm',
  'curve',
]);
const RECEIPT_INPUT_KEYS = Object.freeze([
  'kind',
  'sequence',
  'challenge',
  'previousEnvelopeDigest',
  'epochs',
  'bindings',
  'issuerLineage',
  'artifactRefs',
  'measurements',
  'verdict',
]);
const EVIDENCE_INPUT_KEYS = Object.freeze([
  'receipt',
  'componentAttestations',
  'authorizationArtifacts',
  'authorityGraph',
]);
const COMPONENT_INPUT_KEYS = Object.freeze([
  'sequence',
  'componentId',
  'componentRole',
  'platformClass',
  'challenge',
  'bindingsDigest',
  'issuerLineageDigest',
  'measurementDigest',
]);
const AUTHORIZATION_INPUT_KEYS = Object.freeze([
  'kind',
  'sequence',
  'artifactId',
  'challenge',
  'bindingsDigest',
  'subjectAuthorityId',
  'subjectExecutionInstanceId',
  'credentialSubjectDigest',
  'issuerLineageDigest',
  'authorizedAfterSequence',
  'authorizedEnvelopeDigest',
  'resourceDigest',
  'targetSetDigest',
  'fencingTokenDigest',
]);
const VALIDATION_OPTION_KEYS = Object.freeze([
  'expectedChallenge',
  'expectedIssuerLineage',
  'profile',
  'allowEd25519',
]);
const EXTERNAL_AAD_KEYS = Object.freeze([
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
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const AAD_ROLE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/u;
const MEASUREMENT_TYPE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const IntrinsicMap = Map;
const IntrinsicUint8Array = Uint8Array;
const intrinsicGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
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
      get: Function.prototype.call.bind(Map.prototype.get),
      has: Function.prototype.call.bind(Map.prototype.has),
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
    const lengthGetter = intrinsicGetOwnPropertyDescriptor(
      typedArrayPrototype,
      'length',
    ).get;
    typedArrayAuthorityValue = Object.freeze({
      buffer: Function.prototype.call.bind(bufferGetter),
      length: Function.prototype.call.bind(lengthGetter),
      set: Function.prototype.call.bind(IntrinsicUint8Array.prototype.set),
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

function freezeJson(value) {
  if (intrinsicIsProxy(value)) return '[unavailable]';
  if (intrinsicIsUint8Array(value)) {
    return bytes(value) ?? '[invalid-bytes]';
  }
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson));
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = freezeJson(item);
    return Object.freeze(result);
  }
  return value;
}

function hold(reasonCode, details = {}) {
  return {
    ok: false,
    hold: Object.freeze({
      schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
      kind: 'containment-measurement',
      state: 'HOLD',
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
      reasonCode,
      details: freezeJson(details),
    }),
  };
}

function bytes(value) {
  if (intrinsicIsProxy(value) || !intrinsicIsUint8Array(value)) return null;
  try {
    if (intrinsicIsSharedArrayBuffer(typedArrayAuthority().buffer(value))) {
      return null;
    }
    const length = typedArrayAuthority().length(value);
    if (!Number.isSafeInteger(length)
      || length < 0
      || length > CONTAINMENT_MEASUREMENT_MAX_BYTES) return null;
    const snapshot = new IntrinsicUint8Array(length);
    typedArrayAuthority().set(snapshot, value, 0);
    return snapshot;
  } catch {
    return null;
  }
}

function defineSnapshotField(target, key, value) {
  const byteValue = bytes(value);
  if (byteValue !== null) {
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: false,
      get() {
        const snapshot = new IntrinsicUint8Array(byteValue.byteLength);
        typedArrayAuthority().set(snapshot, byteValue, 0);
        return snapshot;
      },
    });
    return;
  }
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: false,
    writable: false,
    value: immutableSnapshot(value),
  });
}

function immutableSnapshot(value) {
  if (value === null || typeof value !== 'object') return value;
  if (intrinsicIsProxy(value)) {
    throw new TypeError('invalid private snapshot');
  }
  const byteValue = bytes(value);
  if (byteValue !== null) {
    const snapshot = new IntrinsicUint8Array(byteValue.byteLength);
    typedArrayAuthority().set(snapshot, byteValue, 0);
    return snapshot;
  }
  if (Array.isArray(value)) {
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      defineSnapshotField(result, String(index), value[index]);
    }
    return Object.freeze(result);
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    defineSnapshotField(result, key, item);
  }
  return Object.freeze(result);
}

function digestBytes(value) {
  const digest = createHash('sha256').update(value).digest();
  const snapshot = bytes(digest);
  if (snapshot === null) throw new TypeError('invalid digest snapshot');
  return snapshot;
}

function digestRef(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function safeMapSize(value) {
  if (intrinsicIsProxy(value) || !intrinsicIsMap(value)) return -1;
  try {
    return mapAuthority().size(value);
  } catch {
    return -1;
  }
}

function record(value, keys) {
  if (intrinsicIsProxy(value)) return null;
  if (intrinsicIsMap(value)) {
    if (safeMapSize(value) !== keys.length
      || keys.some(key => !mapContains(value, key))) return null;
    const result = {};
    for (const key of keys) result[key] = mapValue(value, key);
    return result;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  let prototype;
  let actual;
  try {
    prototype = intrinsicGetPrototypeOf(value);
    actual = intrinsicOwnKeys(value);
  } catch {
    return null;
  }
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (actual.length !== keys.length
    || actual.some(key => typeof key !== 'string' || !keys.includes(key))) return null;
  const result = {};
  for (const key of keys) {
    let descriptor;
    try {
      descriptor = intrinsicGetOwnPropertyDescriptor(value, key);
    } catch {
      return null;
    }
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function ownDataRecord(value, allowedKeys, requiredKeys = []) {
  if (intrinsicIsProxy(value)
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)) return null;
  let prototype;
  let keys;
  try {
    prototype = intrinsicGetPrototypeOf(value);
    keys = intrinsicOwnKeys(value);
  } catch {
    return null;
  }
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (keys.length > allowedKeys.length
    || keys.some(key => typeof key !== 'string' || !allowedKeys.includes(key))
    || requiredKeys.some(key => !keys.includes(key))) return null;
  const result = Object.create(null);
  for (const key of keys) {
    let descriptor;
    try {
      descriptor = intrinsicGetOwnPropertyDescriptor(value, key);
    } catch {
      return null;
    }
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function arrayValues(value, maximum = 64) {
  if (intrinsicIsProxy(value) || !Array.isArray(value)) return null;
  let lengthDescriptor;
  let ownKeys;
  try {
    lengthDescriptor = intrinsicGetOwnPropertyDescriptor(value, 'length');
  } catch {
    return null;
  }
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length)
    || length < 0
    || length > maximum) return null;
  try {
    ownKeys = intrinsicOwnKeys(value);
  } catch {
    return null;
  }
  if (ownKeys.some(key => typeof key === 'symbol')
    || ownKeys.length !== length + 1) return null;
  const result = [];
  for (let index = 0; index < length; index += 1) {
    let descriptor;
    try {
      descriptor = intrinsicGetOwnPropertyDescriptor(value, String(index));
    } catch {
      return null;
    }
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true) return null;
    result.push(descriptor.value);
  }
  return result;
}

function validId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validAadRole(value) {
  return typeof value === 'string' && AAD_ROLE_PATTERN.test(value);
}

function compareAscii(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function aadRole(value) {
  return value.replaceAll('-', '_').toUpperCase();
}

function digest32(value, nullable = false) {
  if (nullable && value === null) return null;
  const copy = bytes(value);
  return copy !== null && copy.byteLength === 32 ? copy : undefined;
}

function canonicalDigest(value) {
  const encoded = encodeDeterministicCbor(value);
  if (!encoded.ok) return null;
  return Object.freeze({
    bytes: digestBytes(encoded.value),
    digestRef: digestRef(encoded.value),
  });
}

function normalizeEpochs(value) {
  const input = record(value, EPOCH_KEYS);
  if (!input) return null;
  const result = {};
  for (const key of EPOCH_KEYS) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 1) return null;
    result[key] = input[key];
  }
  return Object.freeze(result);
}

function normalizeBindings(value, sequence) {
  const input = record(value, BINDING_KEYS);
  if (!input
    || !validId(input.tenantId)
    || !validId(input.projectId)
    || !validId(input.workspaceId)
    || !validId(input.goalId)
    || !validId(input.missionId)
    || !validId(input.flowId)
    || !validId(input.runId)
    || !validId(input.workItemId)
    || !validId(input.attemptId)
    || !validId(input.operationId)
    || !validId(input.executionInstanceId)
    || !CONTAINMENT_PLATFORM_CLASSES.includes(input.platformClass)
    || !validId(input.platformInstanceId)
    || !validId(input.policyId)
    || !validId(input.policyVersion)) return null;
  const policyDigest = digest32(input.policyDigest);
  const controlPlaneDigest = digest32(input.controlPlaneDigest);
  const executionDigest = digest32(input.executionDigest);
  const fencingTokenDigest = digest32(input.fencingTokenDigest, sequence < 3);
  const projectionDigest = digest32(input.projectionDigest, sequence < 2);
  const resourceDigest = digest32(input.resourceDigest, sequence < 3);
  if (policyDigest === undefined
    || controlPlaneDigest === undefined
    || executionDigest === undefined
    || fencingTokenDigest === undefined
    || projectionDigest === undefined
    || resourceDigest === undefined
    || (sequence >= 2 && projectionDigest === null)
    || (sequence >= 3 && resourceDigest === null)
    || (sequence >= 3 && fencingTokenDigest === null)
    || (sequence < 2 && projectionDigest !== null)
    || (sequence < 3 && resourceDigest !== null)
    || (sequence < 3 && fencingTokenDigest !== null)) return null;
  return Object.freeze({
    tenantId: input.tenantId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    goalId: input.goalId,
    missionId: input.missionId,
    flowId: input.flowId,
    runId: input.runId,
    workItemId: input.workItemId,
    attemptId: input.attemptId,
    operationId: input.operationId,
    executionInstanceId: input.executionInstanceId,
    platformClass: input.platformClass,
    platformInstanceId: input.platformInstanceId,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    policyDigest,
    controlPlaneDigest,
    fencingTokenDigest,
    projectionDigest,
    executionDigest,
    resourceDigest,
  });
}

function normalizeLineage(value) {
  const input = record(value, LINEAGE_KEYS);
  if (!input
    || !validId(input.issuerId)
    || !CONTAINMENT_AUTHORITY_ROLES.includes(input.authorityRole)
    || (input.parentIssuerId !== null && !validId(input.parentIssuerId))
    || !validId(input.enrollmentId)
    || !Number.isSafeInteger(input.keyEpoch)
    || input.keyEpoch < 1) return null;
  const enrollmentDigest = digest32(input.enrollmentDigest);
  const keyId = bytes(input.keyId);
  const profile = CONTAINMENT_KEY_PROFILES[input.algorithm];
  if (enrollmentDigest === undefined
    || keyId === null
    || keyId.byteLength < 16
    || keyId.byteLength > 64
    || !profile
    || profile.curve !== input.curve) return null;
  return Object.freeze({
    issuerId: input.issuerId,
    authorityRole: input.authorityRole,
    parentIssuerId: input.parentIssuerId,
    enrollmentId: input.enrollmentId,
    enrollmentDigest,
    keyId,
    keyEpoch: input.keyEpoch,
    algorithm: profile.algorithm,
    curve: profile.curve,
  });
}

function normalizeArtifactRefs(value, sequence) {
  const input = record(value, ARTIFACT_REF_KEYS);
  if (!input) return null;
  const authorityGraphDigest = digest32(input.authorityGraphDigest);
  const componentAttestationSetDigest = digest32(
    input.componentAttestationSetDigest,
  );
  const authorizationArtifactSetDigest = digest32(
    input.authorizationArtifactSetDigest,
  );
  const admissionGrantDigest = digest32(
    input.admissionGrantDigest,
    sequence < 4,
  );
  const cleanupGrantDigest = digest32(
    input.cleanupGrantDigest,
    sequence < 8,
  );
  if (authorityGraphDigest === undefined
    || componentAttestationSetDigest === undefined
    || authorizationArtifactSetDigest === undefined
    || admissionGrantDigest === undefined
    || cleanupGrantDigest === undefined
    || (sequence < 4 && admissionGrantDigest !== null)
    || (sequence >= 4 && admissionGrantDigest === null)
    || (sequence < 8 && cleanupGrantDigest !== null)
    || (sequence >= 8 && cleanupGrantDigest === null)) return null;
  return Object.freeze({
    authorityGraphDigest,
    componentAttestationSetDigest,
    authorizationArtifactSetDigest,
    admissionGrantDigest,
    cleanupGrantDigest,
  });
}

function normalizeMeasurement(value) {
  const input = record(value, MEASUREMENT_KEYS);
  if (!input
    || typeof input.type !== 'string'
    || !MEASUREMENT_TYPE_PATTERN.test(input.type)
    || !CONTAINMENT_MEASUREMENT_SOURCES.includes(input.source)
    || input.digestAlgorithm !== 'sha-256'
    || !['MEASURED', 'CONTRADICTED'].includes(input.status)) return null;
  const digest = digest32(input.digest);
  if (digest === undefined) return null;
  return Object.freeze({
    type: input.type,
    source: input.source,
    digestAlgorithm: 'sha-256',
    digest,
    status: input.status,
  });
}

function normalizeMeasurements(value, kind) {
  const entries = arrayValues(value);
  if (!entries) return null;
  const normalized = entries.map(normalizeMeasurement);
  if (normalized.some(item => item === null)) return null;
  const required = CONTAINMENT_MEASUREMENT_REQUIREMENTS[kind];
  if (!required || normalized.length !== required.length) return null;
  const seen = new Set();
  for (const item of normalized) {
    if (!required.includes(item.type) || seen.has(item.type)) return null;
    seen.add(item.type);
  }
  return Object.freeze(
    [...normalized].sort((left, right) => compareAscii(left.type, right.type)),
  );
}

function normalizeVerdict(value, measurements) {
  const input = record(value, VERDICT_KEYS);
  if (!input
    || !['OBSERVED', 'HOLD'].includes(input.state)
    || typeof input.reasonCode !== 'string') return null;
  const contradicted = measurements.some(item => item.status === 'CONTRADICTED');
  if (input.state === 'OBSERVED'
    && (input.reasonCode !== 'NONE' || contradicted)) return null;
  if (input.state === 'HOLD'
    && (input.reasonCode === 'NONE'
      || !CONTAINMENT_E2_HOLD_REASONS.includes(input.reasonCode))) return null;
  return Object.freeze({
    state: input.state,
    reasonCode: input.reasonCode,
  });
}

function normalizeReceipt(value) {
  const input = record(value, RECEIPT_KEYS);
  if (!input
    || input.schemaVersion !== CONTAINMENT_MEASUREMENT_SCHEMA_VERSION
    || input.protocol !== CONTAINMENT_MEASUREMENT_PROTOCOL
    || !CONTAINMENT_RECEIPT_KINDS.includes(input.kind)
    || !Number.isSafeInteger(input.sequence)
    || input.sequence !== CONTAINMENT_RECEIPT_KINDS.indexOf(input.kind)
    || input.activation !== 'NOT_BORN'
    || input.proofEligible !== false) {
    return hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  }
  const challenge = digest32(input.challenge);
  const previousEnvelopeDigest = digest32(
    input.previousEnvelopeDigest,
    input.sequence === 0,
  );
  if (challenge === undefined) {
    return hold('E_CONTAINMENT_E2_CHALLENGE_INVALID');
  }
  if (previousEnvelopeDigest === undefined
    || (input.sequence === 0 && previousEnvelopeDigest !== null)
    || (input.sequence > 0 && previousEnvelopeDigest === null)) {
    return hold('E_CONTAINMENT_E2_PREVIOUS_RECEIPT_INVALID');
  }
  const epochs = normalizeEpochs(input.epochs);
  if (!epochs) return hold('E_CONTAINMENT_E2_EPOCH_INVALID');
  const bindings = normalizeBindings(input.bindings, input.sequence);
  if (!bindings) return hold('E_CONTAINMENT_E2_BINDING_INVALID');
  const issuerLineage = normalizeLineage(input.issuerLineage);
  if (!issuerLineage
    || issuerLineage.keyEpoch !== epochs.key) {
    return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID');
  }
  const artifactRefs = normalizeArtifactRefs(input.artifactRefs, input.sequence);
  if (!artifactRefs) return hold('E_CONTAINMENT_E2_BINDING_INVALID');
  const measurements = normalizeMeasurements(input.measurements, input.kind);
  if (!measurements) return hold('E_CONTAINMENT_E2_MEASUREMENT_SET_INVALID');
  const verdict = normalizeVerdict(input.verdict, measurements);
  if (!verdict) return hold('E_CONTAINMENT_E2_VERDICT_INVALID');
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
      protocol: CONTAINMENT_MEASUREMENT_PROTOCOL,
      kind: input.kind,
      sequence: input.sequence,
      challenge,
      previousEnvelopeDigest,
      epochs,
      bindings,
      issuerLineage,
      artifactRefs,
      measurements,
      verdict,
      activation: 'NOT_BORN',
      proofEligible: false,
    }),
  };
}

function validateTrustedExpectations(receipt, options) {
  const expectedChallenge = digest32(options?.expectedChallenge);
  const expectedLineage = normalizeLineage(options?.expectedIssuerLineage);
  if (expectedChallenge === undefined || !expectedLineage) {
    return hold('E_CONTAINMENT_E2_INPUT_INVALID', {
      required: ['expectedChallenge', 'expectedIssuerLineage'],
    });
  }
  if (!bytesEqual(receipt.challenge, expectedChallenge)) {
    return hold('E_CONTAINMENT_E2_CHALLENGE_MISMATCH');
  }
  if (!lineagesEqual(receipt.issuerLineage, expectedLineage)) {
    return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID');
  }
  return { ok: true, value: Object.freeze({ expectedChallenge, expectedLineage }) };
}

export function validateContainmentMeasurementReceipt(value, options = {}) {
  const optionRecord = ownDataRecord(
    options,
    VALIDATION_OPTION_KEYS,
    ['expectedChallenge', 'expectedIssuerLineage'],
  );
  if (!optionRecord) return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  const normalized = normalizeReceipt(value);
  if (!normalized.ok) return normalized;
  const trusted = validateTrustedExpectations(normalized.value, optionRecord);
  if (!trusted.ok) return trusted;
  return {
    ok: true,
    value: immutableSnapshot({
      ...normalized.value,
      signatureVerified: false,
    }),
  };
}

export function createContainmentMeasurementReceipt(input = {}) {
  const inputRecord = ownDataRecord(
    input,
    RECEIPT_INPUT_KEYS,
    RECEIPT_INPUT_KEYS,
  );
  if (!inputRecord) return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  const payload = {
    schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
    protocol: CONTAINMENT_MEASUREMENT_PROTOCOL,
    kind: inputRecord.kind,
    sequence: inputRecord.sequence,
    challenge: inputRecord.challenge,
    previousEnvelopeDigest: inputRecord.previousEnvelopeDigest,
    epochs: inputRecord.epochs,
    bindings: inputRecord.bindings,
    issuerLineage: inputRecord.issuerLineage,
    artifactRefs: inputRecord.artifactRefs,
    measurements: inputRecord.measurements,
    verdict: inputRecord.verdict,
    activation: 'NOT_BORN',
    proofEligible: false,
  };
  const normalized = normalizeReceipt(payload);
  if (!normalized.ok) return normalized;
  const encoded = encodeDeterministicCbor(normalized.value);
  if (!encoded.ok) {
    return hold('E_CONTAINMENT_E2_SCHEMA_INVALID', {
      cborReasonCode: encoded.hold.reasonCode,
    });
  }
  return {
    ok: true,
    value: immutableSnapshot({
      payload: normalized.value,
      bytes: encoded.value,
      payloadDigestRef: digestRef(encoded.value),
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
    }),
  };
}

function compareStableBindings(first, current) {
  for (const key of [
    'tenantId',
    'projectId',
    'workspaceId',
    'goalId',
    'missionId',
    'flowId',
    'runId',
    'workItemId',
    'attemptId',
    'operationId',
    'executionInstanceId',
    'platformClass',
    'platformInstanceId',
    'policyId',
    'policyVersion',
    'policyDigest',
    'controlPlaneDigest',
    'executionDigest',
  ]) {
    const left = first[key];
    const right = current[key];
    if (typeof left === 'string') {
      if (left !== right) return false;
    } else if (!bytesEqual(left, right)) {
      return false;
    }
  }
  return true;
}

function validateProjectionAndResourceLineage(previous, current) {
  if (previous.projectionDigest !== null
    && (current.projectionDigest === null
      || !bytesEqual(previous.projectionDigest, current.projectionDigest))) return false;
  if (previous.resourceDigest !== null
    && (current.resourceDigest === null
      || !bytesEqual(previous.resourceDigest, current.resourceDigest))) return false;
  if (previous.fencingTokenDigest !== null
    && (current.fencingTokenDigest === null
      || !bytesEqual(previous.fencingTokenDigest, current.fencingTokenDigest))) return false;
  return true;
}

function lineagesEqual(left, right) {
  return left.issuerId === right.issuerId
    && left.authorityRole === right.authorityRole
    && left.parentIssuerId === right.parentIssuerId
    && left.enrollmentId === right.enrollmentId
    && bytesEqual(left.enrollmentDigest, right.enrollmentDigest)
    && bytesEqual(left.keyId, right.keyId)
    && left.keyEpoch === right.keyEpoch
    && left.algorithm === right.algorithm
    && left.curve === right.curve;
}

function artifactRefsProgress(previous, current, sequence) {
  if (!bytesEqual(
    previous.authorityGraphDigest,
    current.authorityGraphDigest,
  )) return false;
  if (![1, 4, 8].includes(sequence) && !bytesEqual(
    previous.authorizationArtifactSetDigest,
    current.authorizationArtifactSetDigest,
  )) return false;
  if (sequence >= 5 && !bytesEqual(
    previous.admissionGrantDigest,
    current.admissionGrantDigest,
  )) return false;
  if (sequence >= 9 && !bytesEqual(
    previous.cleanupGrantDigest,
    current.cleanupGrantDigest,
  )) return false;
  return true;
}

function validateSequenceReceipts(entries, options, checkEnvelopeLinks) {
  if (entries.length !== CONTAINMENT_RECEIPT_KINDS.length) {
    return hold('E_CONTAINMENT_E2_CHAIN_INCOMPLETE');
  }
  const first = entries[0].payload;
  const trusted = validateTrustedExpectations(first, options);
  if (!trusted.ok) return trusted;
  for (let index = 0; index < entries.length; index += 1) {
    const current = entries[index].payload;
    if (current.sequence !== index || current.kind !== CONTAINMENT_RECEIPT_KINDS[index]) {
      return hold('E_CONTAINMENT_E2_SEQUENCE_INVALID', { index });
    }
    if (!bytesEqual(first.challenge, current.challenge)
      || !bytesEqual(trusted.value.expectedChallenge, current.challenge)) {
      return hold('E_CONTAINMENT_E2_CHALLENGE_MISMATCH', { index });
    }
    if (current.epochs.trust !== first.epochs.trust
      || current.epochs.key !== first.epochs.key
      || current.epochs.session !== first.epochs.session
      || current.epochs.controlPlane !== first.epochs.controlPlane) {
      return hold('E_CONTAINMENT_E2_EPOCH_MISMATCH', { index });
    }
    if (!lineagesEqual(first.issuerLineage, current.issuerLineage)
      || !lineagesEqual(trusted.value.expectedLineage, current.issuerLineage)) {
      return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID', { index });
    }
    if (!compareStableBindings(first.bindings, current.bindings)) {
      return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', { index });
    }
    if (index > 0) {
      const previous = entries[index - 1];
      if (checkEnvelopeLinks
        && !bytesEqual(current.previousEnvelopeDigest, previous.envelopeDigest)) {
        return hold('E_CONTAINMENT_E2_REPLAY_OR_FORK', { index });
      }
      if (!validateProjectionAndResourceLineage(
        previous.payload.bindings,
        current.bindings,
      ) || !artifactRefsProgress(
        previous.payload.artifactRefs,
        current.artifactRefs,
        index,
      )) {
        return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', { index });
      }
    }
  }
  return aggregateSequence(entries, checkEnvelopeLinks);
}

function aggregateSequence(entries, envelopeLinksVerified) {
  const phaseResults = entries.map((entry, index) => {
    const contradictedMeasurementTypes = entry.payload.measurements
      .filter(measurement => measurement.status === 'CONTRADICTED')
      .map(measurement => measurement.type);
    return Object.freeze({
      sequence: index,
      kind: entry.payload.kind,
      verdictState: entry.payload.verdict.state,
      reasonCode: entry.payload.verdict.reasonCode,
      contradictedMeasurementTypes: Object.freeze(contradictedMeasurementTypes),
      receiptDigestRef: entry.receiptDigestRef,
      envelopeDigestRef: entry.envelopeDigestRef ?? null,
    });
  });
  const firstHeld = phaseResults.find(phase => phase.verdictState === 'HOLD');
  const allObserved = firstHeld === undefined;
  return {
    ok: true,
    value: immutableSnapshot({
      schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
      kind: envelopeLinksVerified
        ? 'containment-measurement-evidence-chain'
        : 'containment-measurement-diagnostic-sequence',
      structuralState: 'COMPLETE',
      verdictState: allObserved ? 'COMPLETE_OBSERVED' : 'COMPLETE_HELD',
      phaseResults: Object.freeze(phaseResults),
      allObserved,
      primaryHoldReason: firstHeld?.reasonCode ?? null,
      envelopeLinksVerified,
      state: 'HOLD',
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
      reasonCode: firstHeld?.reasonCode ?? 'E_CONTAINMENT_E2_NOT_BORN',
      receiptCount: entries.length,
      bindings: entries[0].payload.bindings,
      epochs: entries[0].payload.epochs,
      issuerLineage: entries[0].payload.issuerLineage,
    }),
  };
}

export function validateContainmentMeasurementDiagnosticSequence(value, options = {}) {
  const optionRecord = ownDataRecord(
    options,
    VALIDATION_OPTION_KEYS,
    ['expectedChallenge', 'expectedIssuerLineage'],
  );
  if (!optionRecord) return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  const receiptBytes = arrayValues(value, CONTAINMENT_RECEIPT_KINDS.length);
  if (!receiptBytes || receiptBytes.length !== CONTAINMENT_RECEIPT_KINDS.length) {
    return hold('E_CONTAINMENT_E2_CHAIN_INCOMPLETE');
  }
  const entries = [];
  for (let index = 0; index < receiptBytes.length; index += 1) {
    const canonicalBytes = bytes(receiptBytes[index]);
    if (canonicalBytes === null) {
      return hold('E_CONTAINMENT_E2_INPUT_INVALID', { index });
    }
    const decoded = decodeDeterministicCbor(canonicalBytes);
    if (!decoded.ok) {
      return hold('E_CONTAINMENT_E2_SCHEMA_INVALID', {
        index,
        cborReasonCode: decoded.hold.reasonCode,
      });
    }
    const receipt = normalizeReceipt(decoded.value);
    if (!receipt.ok) return hold(receipt.hold.reasonCode, { index });
    entries.push(Object.freeze({
      payload: receipt.value,
      receiptDigestRef: digestRef(canonicalBytes),
    }));
  }
  return validateSequenceReceipts(entries, optionRecord, false);
}

function normalizeSignedItem(value) {
  const input = record(value, SIGNED_ITEM_KEYS);
  if (!input) return null;
  const envelope = bytes(input.envelope);
  const externalAad = bytes(input.externalAad);
  if (envelope === null || envelope.byteLength === 0
    || externalAad === null || externalAad.byteLength === 0) return null;
  return Object.freeze({ envelope, externalAad });
}

function normalizeComponent(value) {
  const input = record(value, COMPONENT_KEYS);
  if (!input
    || !validId(input.componentId)
    || !validAadRole(input.componentRole)
    || !CONTAINMENT_PLATFORM_CLASSES.includes(input.platformClass)
    || !validId(input.authorityId)) return null;
  const signed = normalizeSignedItem(input.signed);
  if (!signed) return null;
  return Object.freeze({
    componentId: input.componentId,
    componentRole: input.componentRole,
    platformClass: input.platformClass,
    authorityId: input.authorityId,
    signed,
  });
}

function normalizeAuthorization(value) {
  const input = record(value, AUTHORIZATION_KEYS);
  if (!input
    || !validId(input.artifactId)
    || ![
      'ENROLLMENT_CREDENTIAL',
      'ADMISSION_GRANT',
      'CLEANUP_GRANT',
    ].includes(input.kind)
    || !validId(input.issuerId)
    || !CONTAINMENT_AUTHORITY_ROLES.includes(input.authorityRole)) return null;
  const credential = input.kind === 'ENROLLMENT_CREDENTIAL';
  if (credential
    ? (!validId(input.subjectAuthorityId)
      || input.subjectExecutionInstanceId !== null)
    : (input.subjectAuthorityId !== null
      || !validId(input.subjectExecutionInstanceId))) return null;
  const signed = normalizeSignedItem(input.signed);
  if (!signed) return null;
  return Object.freeze({
    artifactId: input.artifactId,
    kind: input.kind,
    issuerId: input.issuerId,
    authorityRole: input.authorityRole,
    subjectAuthorityId: input.subjectAuthorityId,
    subjectExecutionInstanceId: input.subjectExecutionInstanceId,
    signed,
  });
}

function normalizeAuthorityNode(value) {
  const input = record(value, AUTHORITY_NODE_KEYS);
  if (!input
    || !validId(input.authorityId)
    || !CONTAINMENT_AUTHORITY_ROLES.includes(input.authorityRole)
    || (input.parentAuthorityId !== null && !validId(input.parentAuthorityId))
    || !CONTAINMENT_PLATFORM_CLASSES.includes(input.platformClass)
    || !validId(input.enrollmentId)
    || !Number.isSafeInteger(input.keyEpoch)
    || input.keyEpoch < 1) return null;
  const enrollmentDigest = digest32(input.enrollmentDigest);
  const keyId = bytes(input.keyId);
  const profile = CONTAINMENT_KEY_PROFILES[input.algorithm];
  if (enrollmentDigest === undefined
    || keyId === null
    || keyId.byteLength < 16
    || keyId.byteLength > 64
    || !profile
    || profile.curve !== input.curve) return null;
  return Object.freeze({
    authorityId: input.authorityId,
    authorityRole: input.authorityRole,
    parentAuthorityId: input.parentAuthorityId,
    platformClass: input.platformClass,
    enrollmentId: input.enrollmentId,
    enrollmentDigest,
    keyId,
    keyEpoch: input.keyEpoch,
    algorithm: profile.algorithm,
    curve: profile.curve,
  });
}

function normalizeAuthorityEdge(value) {
  const input = record(value, AUTHORITY_EDGE_KEYS);
  if (!input
    || !validId(input.parentAuthorityId)
    || !validId(input.childAuthorityId)
    || input.parentAuthorityId === input.childAuthorityId
    || input.relationship !== 'DELEGATES') return null;
  return Object.freeze({
    parentAuthorityId: input.parentAuthorityId,
    childAuthorityId: input.childAuthorityId,
    relationship: 'DELEGATES',
  });
}

function normalizeAuthorityGraph(value) {
  const input = record(value, AUTHORITY_GRAPH_KEYS);
  if (!input) return null;
  const nodeValues = arrayValues(input.nodes, 64);
  const edgeValues = arrayValues(input.edges, 128);
  if (!nodeValues || !edgeValues || nodeValues.length === 0) return null;
  const nodes = nodeValues.map(normalizeAuthorityNode);
  const edges = edgeValues.map(normalizeAuthorityEdge);
  if (nodes.some(node => node === null) || edges.some(edge => edge === null)) return null;
  const nodeIds = new Set();
  for (const node of nodes) {
    if (nodeIds.has(node.authorityId)) return null;
    nodeIds.add(node.authorityId);
  }
  const rootNodes = nodes.filter(node => node.parentAuthorityId === null);
  if (rootNodes.length !== 1
    || rootNodes[0].authorityRole !== 'root-trust'
    || nodes.some(node => (
      node !== rootNodes[0] && node.authorityRole === 'root-trust'
    ))) return null;
  const parentByChild = new Map();
  for (const edge of edges) {
    if (!nodeIds.has(edge.parentAuthorityId)
      || !nodeIds.has(edge.childAuthorityId)
      || parentByChild.has(edge.childAuthorityId)) return null;
    parentByChild.set(edge.childAuthorityId, edge.parentAuthorityId);
  }
  for (const node of nodes) {
    if (node.parentAuthorityId === null) {
      if (parentByChild.has(node.authorityId)) return null;
    } else if (parentByChild.get(node.authorityId) !== node.parentAuthorityId) {
      return null;
    }
    const visited = new Set([node.authorityId]);
    let cursor = node.parentAuthorityId;
    while (cursor !== null) {
      if (visited.has(cursor)) return null;
      visited.add(cursor);
      const parent = nodes.find(candidate => candidate.authorityId === cursor);
      if (!parent) return null;
      cursor = parent.parentAuthorityId;
    }
  }
  const sortedNodes = [...nodes].sort(
    (left, right) => compareAscii(left.authorityId, right.authorityId),
  );
  const sortedEdges = [...edges].sort((left, right) => (
    compareAscii(left.parentAuthorityId, right.parentAuthorityId)
    || compareAscii(left.childAuthorityId, right.childAuthorityId)
  ));
  return Object.freeze({
    nodes: Object.freeze(sortedNodes),
    edges: Object.freeze(sortedEdges),
  });
}

function normalizeEvidenceEnvelope(value) {
  const input = record(value, EVIDENCE_ENVELOPE_KEYS);
  if (!input
    || input.schemaVersion !== CONTAINMENT_MEASUREMENT_SCHEMA_VERSION
    || input.protocol !== CONTAINMENT_MEASUREMENT_PROTOCOL
    || input.kind !== 'CONTAINMENT_EVIDENCE_ENVELOPE'
    || input.activation !== 'NOT_BORN'
    || input.proofEligible !== false) return null;
  const receipt = normalizeSignedItem(input.receipt);
  const componentValues = arrayValues(input.componentAttestations, 64);
  const authorizationValues = arrayValues(input.authorizationArtifacts, 66);
  const authorityGraph = normalizeAuthorityGraph(input.authorityGraph);
  if (!receipt
    || !componentValues
    || componentValues.length === 0
    || !authorizationValues
    || !authorityGraph) return null;
  const componentAttestations = componentValues.map(normalizeComponent);
  const authorizationArtifacts = authorizationValues.map(normalizeAuthorization);
  if (componentAttestations.some(component => component === null)
    || authorizationArtifacts.some(artifact => artifact === null)) return null;
  const componentIds = new Set();
  for (const component of componentAttestations) {
    if (componentIds.has(component.componentId)) return null;
    componentIds.add(component.componentId);
  }
  const artifactIds = new Set();
  const grantKinds = new Set();
  for (const artifact of authorizationArtifacts) {
    if (artifactIds.has(artifact.artifactId)
      || (artifact.kind !== 'ENROLLMENT_CREDENTIAL'
        && grantKinds.has(artifact.kind))) return null;
    artifactIds.add(artifact.artifactId);
    if (artifact.kind !== 'ENROLLMENT_CREDENTIAL') {
      grantKinds.add(artifact.kind);
    }
  }
  const sortedArtifacts = [...authorizationArtifacts].sort(
    (left, right) => compareAscii(left.artifactId, right.artifactId),
  );
  return Object.freeze({
    schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
    protocol: CONTAINMENT_MEASUREMENT_PROTOCOL,
    kind: 'CONTAINMENT_EVIDENCE_ENVELOPE',
    receipt,
    componentAttestations: Object.freeze(componentAttestations),
    authorizationArtifacts: Object.freeze(sortedArtifacts),
    authorityGraph,
    activation: 'NOT_BORN',
    proofEligible: false,
  });
}

export function createContainmentEvidenceEnvelope(input = {}) {
  const inputRecord = ownDataRecord(
    input,
    EVIDENCE_INPUT_KEYS,
    EVIDENCE_INPUT_KEYS,
  );
  if (!inputRecord) return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  const normalized = normalizeEvidenceEnvelope({
    schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
    protocol: CONTAINMENT_MEASUREMENT_PROTOCOL,
    kind: 'CONTAINMENT_EVIDENCE_ENVELOPE',
    receipt: inputRecord.receipt,
    componentAttestations: inputRecord.componentAttestations,
    authorizationArtifacts: inputRecord.authorizationArtifacts,
    authorityGraph: inputRecord.authorityGraph,
    activation: 'NOT_BORN',
    proofEligible: false,
  });
  if (!normalized) return hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  const encoded = encodeDeterministicCbor(normalized);
  if (!encoded.ok) {
    return hold('E_CONTAINMENT_E2_SCHEMA_INVALID', {
      cborReasonCode: encoded.hold.reasonCode,
    });
  }
  return {
    ok: true,
    value: immutableSnapshot({
      payload: normalized,
      bytes: encoded.value,
      envelopeDigestRef: digestRef(encoded.value),
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
    }),
  };
}

function normalizeComponentPayload(value) {
  const input = record(value, COMPONENT_PAYLOAD_KEYS);
  if (!input
    || input.schemaVersion !== CONTAINMENT_MEASUREMENT_SCHEMA_VERSION
    || input.protocol !== CONTAINMENT_MEASUREMENT_PROTOCOL
    || input.kind !== 'COMPONENT_ATTESTATION'
    || !Number.isSafeInteger(input.sequence)
    || input.sequence < 0
    || input.sequence >= CONTAINMENT_RECEIPT_KINDS.length
    || !validId(input.componentId)
    || !validAadRole(input.componentRole)
    || !CONTAINMENT_PLATFORM_CLASSES.includes(input.platformClass)
    || input.activation !== 'NOT_BORN'
    || input.proofEligible !== false) return null;
  const challenge = digest32(input.challenge);
  const bindingsDigest = digest32(input.bindingsDigest);
  const issuerLineageDigest = digest32(input.issuerLineageDigest);
  const measurementDigest = digest32(input.measurementDigest);
  if (challenge === undefined
    || bindingsDigest === undefined
    || issuerLineageDigest === undefined
    || measurementDigest === undefined) return null;
  return Object.freeze({
    schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
    protocol: CONTAINMENT_MEASUREMENT_PROTOCOL,
    kind: 'COMPONENT_ATTESTATION',
    sequence: input.sequence,
    componentId: input.componentId,
    componentRole: input.componentRole,
    platformClass: input.platformClass,
    challenge,
    bindingsDigest,
    issuerLineageDigest,
    measurementDigest,
    activation: 'NOT_BORN',
    proofEligible: false,
  });
}

function normalizeGrantPayload(value) {
  const input = record(value, GRANT_PAYLOAD_KEYS);
  if (!input
    || input.schemaVersion !== CONTAINMENT_MEASUREMENT_SCHEMA_VERSION
    || input.protocol !== CONTAINMENT_MEASUREMENT_PROTOCOL
    || !['ADMISSION_GRANT', 'CLEANUP_GRANT'].includes(input.kind)
    || !Number.isSafeInteger(input.sequence)
    || input.sequence < 0
    || input.sequence >= CONTAINMENT_RECEIPT_KINDS.length
    || !validId(input.artifactId)
    || input.subjectAuthorityId !== null
    || !validId(input.subjectExecutionInstanceId)
    || !Number.isSafeInteger(input.authorizedAfterSequence)
    || input.authorizedAfterSequence !== (
      input.kind === 'ADMISSION_GRANT' ? 3 : 7
    )
    || input.sequence !== (
      input.kind === 'ADMISSION_GRANT' ? 4 : 8
    )
    || input.activation !== 'NOT_BORN'
    || input.proofEligible !== false) return null;
  const challenge = digest32(input.challenge);
  const bindingsDigest = digest32(input.bindingsDigest);
  const issuerLineageDigest = digest32(input.issuerLineageDigest);
  const authorizedEnvelopeDigest = digest32(input.authorizedEnvelopeDigest);
  const resourceDigest = digest32(input.resourceDigest);
  const targetSetDigest = digest32(input.targetSetDigest);
  const fencingTokenDigest = digest32(input.fencingTokenDigest);
  if (challenge === undefined
    || bindingsDigest === undefined
    || issuerLineageDigest === undefined
    || authorizedEnvelopeDigest === undefined
    || resourceDigest === undefined
    || targetSetDigest === undefined
    || fencingTokenDigest === undefined) return null;
  return Object.freeze({
    schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
    protocol: CONTAINMENT_MEASUREMENT_PROTOCOL,
    kind: input.kind,
    sequence: input.sequence,
    artifactId: input.artifactId,
    challenge,
    bindingsDigest,
    subjectAuthorityId: null,
    subjectExecutionInstanceId: input.subjectExecutionInstanceId,
    issuerLineageDigest,
    authorizedAfterSequence: input.authorizedAfterSequence,
    authorizedEnvelopeDigest,
    resourceDigest,
    targetSetDigest,
    fencingTokenDigest,
    activation: 'NOT_BORN',
    proofEligible: false,
  });
}

function normalizeCredentialSubject(value) {
  const input = record(value, CREDENTIAL_SUBJECT_KEYS);
  if (!input
    || !validId(input.authorityId)
    || !CONTAINMENT_AUTHORITY_ROLES.includes(input.authorityRole)
    || (input.parentAuthorityId !== null && !validId(input.parentAuthorityId))
    || !validId(input.enrollmentId)
    || !Number.isSafeInteger(input.keyEpoch)
    || input.keyEpoch < 1) return null;
  const keyId = bytes(input.keyId);
  const profile = CONTAINMENT_KEY_PROFILES[input.algorithm];
  if (keyId === null
    || keyId.byteLength < 16
    || keyId.byteLength > 64
    || !profile
    || profile.curve !== input.curve) return null;
  return Object.freeze({
    authorityId: input.authorityId,
    authorityRole: input.authorityRole,
    parentAuthorityId: input.parentAuthorityId,
    enrollmentId: input.enrollmentId,
    keyId,
    keyEpoch: input.keyEpoch,
    algorithm: profile.algorithm,
    curve: profile.curve,
  });
}

function normalizeEnrollmentCredentialPayload(value) {
  const input = record(value, ENROLLMENT_CREDENTIAL_PAYLOAD_KEYS);
  if (!input
    || input.schemaVersion !== CONTAINMENT_MEASUREMENT_SCHEMA_VERSION
    || input.protocol !== CONTAINMENT_MEASUREMENT_PROTOCOL
    || input.kind !== 'ENROLLMENT_CREDENTIAL'
    || input.sequence !== 0
    || !validId(input.artifactId)
    || !validId(input.subjectAuthorityId)
    || input.activation !== 'NOT_BORN'
    || input.proofEligible !== false) return null;
  const challenge = digest32(input.challenge);
  const bindingsDigest = digest32(input.bindingsDigest);
  const credentialSubjectDigest = digest32(input.credentialSubjectDigest);
  const issuerLineageDigest = digest32(input.issuerLineageDigest);
  if (challenge === undefined
    || bindingsDigest === undefined
    || credentialSubjectDigest === undefined
    || issuerLineageDigest === undefined) return null;
  return Object.freeze({
    schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
    protocol: CONTAINMENT_MEASUREMENT_PROTOCOL,
    kind: 'ENROLLMENT_CREDENTIAL',
    sequence: 0,
    artifactId: input.artifactId,
    challenge,
    bindingsDigest,
    subjectAuthorityId: input.subjectAuthorityId,
    credentialSubjectDigest,
    issuerLineageDigest,
    activation: 'NOT_BORN',
    proofEligible: false,
  });
}

function normalizeAuthorizationPayload(value) {
  return normalizeGrantPayload(value)
    ?? normalizeEnrollmentCredentialPayload(value);
}

function externalAadRecord(value) {
  const decoded = decodeDeterministicCbor(value);
  if (!decoded.ok) return null;
  const input = record(decoded.value, EXTERNAL_AAD_KEYS);
  if (!input
    || input.protocol !== CONTAINMENT_MEASUREMENT_PROTOCOL
    || input.schemaVersion !== CONTAINMENT_MEASUREMENT_SCHEMA_VERSION
    || typeof input.kind !== 'string'
    || !Number.isSafeInteger(input.sequence)
    || input.sequence < 0
    || input.sequence >= CONTAINMENT_RECEIPT_KINDS.length
    || !Number.isSafeInteger(input.controlPlaneEpoch)
    || input.controlPlaneEpoch < 1
    || !validAadRole(input.issuerRole)
    || !validAadRole(input.componentRole)) return null;
  const challenge = digest32(input.challenge);
  const bindingsDigest = digest32(input.bindingsDigest);
  const issuerLineageDigest = digest32(input.issuerLineageDigest);
  if (challenge === undefined
    || bindingsDigest === undefined
    || issuerLineageDigest === undefined) return null;
  return Object.freeze({
    protocol: input.protocol,
    schemaVersion: input.schemaVersion,
    kind: input.kind,
    sequence: input.sequence,
    challenge,
    bindingsDigest,
    controlPlaneEpoch: input.controlPlaneEpoch,
    issuerRole: input.issuerRole,
    componentRole: input.componentRole,
    issuerLineageDigest,
  });
}

function lineageForAuthorityNode(node) {
  return Object.freeze({
    issuerId: node.authorityId,
    authorityRole: node.authorityRole,
    parentIssuerId: node.parentAuthorityId,
    enrollmentId: node.enrollmentId,
    enrollmentDigest: node.enrollmentDigest,
    keyId: node.keyId,
    keyEpoch: node.keyEpoch,
    algorithm: node.algorithm,
    curve: node.curve,
  });
}

function validateCoseLineage(cose, lineage) {
  const profile = CONTAINMENT_KEY_PROFILES[lineage.algorithm];
  if (!profile || profile.supported !== true
    || cose.value.protectedHeaders.algorithm !== profile.coseAlgorithm
    || cose.value.protectedHeaders.algorithmName !== profile.algorithm
    || cose.value.protectedHeaders.curve !== profile.curve
    || !bytesEqual(cose.value.protectedHeaders.keyId, lineage.keyId)) {
    return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID');
  }
  return { ok: true, value: lineage };
}

function validateCoseEnvelope(signed, lineage, options) {
  const profile = CONTAINMENT_KEY_PROFILES[lineage.algorithm];
  if (!profile || profile.supported !== true) {
    return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID', {
      algorithm: lineage.algorithm,
    });
  }
  const cose = validateContainmentCoseSign1(signed.envelope, {
    externalAad: signed.externalAad,
    profile: options.profile,
    allowEd25519: options.allowEd25519,
    allowEd448: false,
    expectedKeyId: lineage.keyId,
    expectedAlgorithm: profile.coseAlgorithm,
  });
  if (!cose.ok) {
    if ([
      'E_CONTAINMENT_COSE_KEY_ID_MISMATCH',
      'E_CONTAINMENT_COSE_ALGORITHM_MISMATCH',
    ].includes(cose.hold.reasonCode)) {
      return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID', {
        coseReasonCode: cose.hold.reasonCode,
      });
    }
    return hold('E_CONTAINMENT_E2_COSE_INVALID', {
      coseReasonCode: cose.hold.reasonCode,
    });
  }
  const lineageResult = validateCoseLineage(cose, lineage);
  if (!lineageResult.ok) return lineageResult;
  return cose;
}

function aadMatches(
  aad,
  expected,
) {
  return aad.protocol === CONTAINMENT_MEASUREMENT_PROTOCOL
    && aad.schemaVersion === CONTAINMENT_MEASUREMENT_SCHEMA_VERSION
    && aad.kind === expected.kind
    && aad.sequence === expected.sequence
    && aad.controlPlaneEpoch === expected.controlPlaneEpoch
    && aad.issuerRole === expected.issuerRole
    && aad.componentRole === expected.componentRole
    && bytesEqual(aad.challenge, expected.challenge)
    && bytesEqual(aad.bindingsDigest, expected.bindingsDigest)
    && bytesEqual(aad.issuerLineageDigest, expected.issuerLineageDigest);
}

function graphNode(graph, authorityId) {
  return graph.nodes.find(node => node.authorityId === authorityId) ?? null;
}

function credentialSubjectForNode(node) {
  return normalizeCredentialSubject({
    authorityId: node.authorityId,
    authorityRole: node.authorityRole,
    parentAuthorityId: node.parentAuthorityId,
    enrollmentId: node.enrollmentId,
    keyId: node.keyId,
    keyEpoch: node.keyEpoch,
    algorithm: node.algorithm,
    curve: node.curve,
  });
}

function receiptMeasurement(receipt, type) {
  return receipt.measurements.find(measurement => measurement.type === type)
    ?? null;
}

function validatePlatformComponentRoles(evidence, receipt) {
  const requiredRoles =
    CONTAINMENT_PLATFORM_COMPONENT_ROLE_AUTHORITY[
      receipt.bindings.platformClass
    ];
  if (!Array.isArray(requiredRoles)
    || receipt.bindings.platformClass === 'darwin-terminal'
    || requiredRoles.includes('UNSUPPORTED')) {
    return hold('E_CONTAINMENT_E2_PLATFORM_UNSUPPORTED', {
      platformClass: receipt.bindings.platformClass,
    });
  }
  const receivedRoles = evidence.componentAttestations.map(
    component => component.componentRole,
  );
  const receivedSet = new Set(receivedRoles);
  const receivedAuthorities = new Set(
    evidence.componentAttestations.map(component => component.authorityId),
  );
  if (receivedRoles.length !== requiredRoles.length
    || receivedSet.size !== receivedRoles.length
    || receivedRoles.some((role, index) => role !== requiredRoles[index])
    || evidence.componentAttestations.some(
      component => (
        component.platformClass !== receipt.bindings.platformClass
      ),
    )
    || (requiredRoles.length > 1
      && receivedAuthorities.size !== requiredRoles.length)) {
    return hold('E_CONTAINMENT_E2_TRUST_POLICY_HOLD', {
      platformClass: receipt.bindings.platformClass,
      requiredRoles,
      receivedRoles,
      receivedPlatformClasses: evidence.componentAttestations.map(
        component => component.platformClass,
      ),
      receivedAuthorityIds: evidence.componentAttestations.map(
        component => component.authorityId,
      ),
    });
  }
  return { ok: true };
}

function validateEvidenceEnvelopeBytes(value, options) {
  const envelopeBytes = bytes(value);
  if (envelopeBytes === null) {
    return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  }
  const decoded = decodeDeterministicCbor(envelopeBytes);
  if (!decoded.ok) {
    return hold('E_CONTAINMENT_E2_SCHEMA_INVALID', {
      cborReasonCode: decoded.hold.reasonCode,
    });
  }
  const evidence = normalizeEvidenceEnvelope(decoded.value);
  if (!evidence) return hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  const receiptCose = validateContainmentCoseSign1(evidence.receipt.envelope, {
    externalAad: evidence.receipt.externalAad,
    profile: options.profile,
    allowEd25519: options.allowEd25519,
    allowEd448: false,
    expectedKeyId: options.expectedIssuerLineage.keyId,
    expectedAlgorithm: CONTAINMENT_KEY_PROFILES[
      options.expectedIssuerLineage.algorithm
    ]?.coseAlgorithm,
  });
  if (!receiptCose.ok) {
    if ([
      'E_CONTAINMENT_COSE_KEY_ID_MISMATCH',
      'E_CONTAINMENT_COSE_ALGORITHM_MISMATCH',
    ].includes(receiptCose.hold.reasonCode)) {
      return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID', {
        coseReasonCode: receiptCose.hold.reasonCode,
      });
    }
    return hold('E_CONTAINMENT_E2_COSE_INVALID', {
      coseReasonCode: receiptCose.hold.reasonCode,
    });
  }
  const decodedReceipt = decodeDeterministicCbor(receiptCose.value.payload);
  const receipt = decodedReceipt.ok
    ? normalizeReceipt(decodedReceipt.value)
    : hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  if (!receipt.ok) return receipt;
  const trusted = validateTrustedExpectations(receipt.value, options);
  if (!trusted.ok) return trusted;
  const receiptLineage = validateCoseLineage(receiptCose, receipt.value.issuerLineage);
  if (!receiptLineage.ok) return receiptLineage;
  const receiptBindingDigest = canonicalDigest(receipt.value.bindings);
  const receiptLineageDigest = canonicalDigest(receipt.value.issuerLineage);
  const receiptAad = externalAadRecord(evidence.receipt.externalAad);
  if (!receiptBindingDigest
    || !receiptLineageDigest
    || !receiptAad
    || !aadMatches(receiptAad, {
      kind: receipt.value.kind,
      sequence: receipt.value.sequence,
      challenge: receipt.value.challenge,
      bindingsDigest: receiptBindingDigest.bytes,
      controlPlaneEpoch: receipt.value.epochs.controlPlane,
      issuerRole: aadRole(receipt.value.issuerLineage.authorityRole),
      componentRole: 'RECEIPT',
      issuerLineageDigest: receiptLineageDigest.bytes,
    })) return hold('E_CONTAINMENT_E2_EXTERNAL_AAD_MISMATCH');
  const issuerNode = graphNode(
    evidence.authorityGraph,
    receipt.value.issuerLineage.issuerId,
  );
  if (!issuerNode
    || !lineagesEqual(
      receipt.value.issuerLineage,
      lineageForAuthorityNode(issuerNode),
    )) return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID');
  const authorityGraphDigest = canonicalDigest(evidence.authorityGraph);
  const componentSetDigest = canonicalDigest(evidence.componentAttestations);
  const authorizationSetDigest = canonicalDigest(evidence.authorizationArtifacts);
  if (!authorityGraphDigest || !componentSetDigest || !authorizationSetDigest) {
    return hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  }
  if (!bytesEqual(
    receipt.value.artifactRefs.authorityGraphDigest,
    authorityGraphDigest.bytes,
  ) || !bytesEqual(
    receipt.value.artifactRefs.componentAttestationSetDigest,
    componentSetDigest.bytes,
  ) || !bytesEqual(
    receipt.value.artifactRefs.authorizationArtifactSetDigest,
    authorizationSetDigest.bytes,
  )) return hold('E_CONTAINMENT_E2_BINDING_MISMATCH');
  const platformRoles = validatePlatformComponentRoles(evidence, receipt.value);
  if (!platformRoles.ok) return platformRoles;
  const receiptMeasurementSetDigest = canonicalDigest(receipt.value.measurements);
  if (!receiptMeasurementSetDigest) {
    return hold('E_CONTAINMENT_E2_MEASUREMENT_INVALID');
  }
  for (let index = 0; index < evidence.componentAttestations.length; index += 1) {
    const component = evidence.componentAttestations[index];
    const node = graphNode(evidence.authorityGraph, component.authorityId);
    if (!node || node.platformClass !== component.platformClass) {
      return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID', { componentIndex: index });
    }
    const lineage = lineageForAuthorityNode(node);
    const cose = validateCoseEnvelope(component.signed, lineage, options);
    if (!cose.ok) return cose;
    const decodedPayload = decodeDeterministicCbor(cose.value.payload);
    const payload = decodedPayload.ok
      ? normalizeComponentPayload(decodedPayload.value)
      : null;
    const lineageDigest = canonicalDigest(lineage);
    const aad = externalAadRecord(component.signed.externalAad);
    if (!payload
      || !lineageDigest
      || payload.sequence !== receipt.value.sequence
      || payload.componentId !== component.componentId
      || payload.componentRole !== component.componentRole
      || payload.platformClass !== component.platformClass
      || !bytesEqual(payload.challenge, receipt.value.challenge)
      || !bytesEqual(payload.bindingsDigest, receiptBindingDigest.bytes)
      || !bytesEqual(payload.issuerLineageDigest, lineageDigest.bytes)
      || !bytesEqual(
        payload.measurementDigest,
        receiptMeasurementSetDigest.bytes,
      )
      || !aad
      || !aadMatches(aad, {
        kind: payload.kind,
        sequence: payload.sequence,
        challenge: payload.challenge,
        bindingsDigest: payload.bindingsDigest,
        controlPlaneEpoch: receipt.value.epochs.controlPlane,
        issuerRole: aadRole(node.authorityRole),
        componentRole: aadRole(payload.componentRole),
        issuerLineageDigest: payload.issuerLineageDigest,
      })) return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', {
        componentIndex: index,
      });
  }
  const grants = {};
  const credentialsBySubject = new Map();
  for (let index = 0; index < evidence.authorizationArtifacts.length; index += 1) {
    const artifact = evidence.authorizationArtifacts[index];
    const node = graphNode(evidence.authorityGraph, artifact.issuerId);
    if (!node || node.authorityRole !== artifact.authorityRole) {
      return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID', { artifactIndex: index });
    }
    const lineage = lineageForAuthorityNode(node);
    const cose = validateCoseEnvelope(artifact.signed, lineage, options);
    if (!cose.ok) return cose;
    const decodedPayload = decodeDeterministicCbor(cose.value.payload);
    const payload = decodedPayload.ok
      ? normalizeAuthorizationPayload(decodedPayload.value)
      : null;
    const lineageDigest = canonicalDigest(lineage);
    const aad = externalAadRecord(artifact.signed.externalAad);
    if (!payload || !lineageDigest || !aad) {
      return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', {
        artifactIndex: index,
        field: 'authorizationArtifactSchema',
      });
    }
    if (payload.kind !== artifact.kind
      || payload.artifactId !== artifact.artifactId) {
      return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', {
        artifactIndex: index,
        field: 'authorizationArtifactIdentity',
      });
    }
    if (!bytesEqual(payload.challenge, receipt.value.challenge)
      || !bytesEqual(payload.bindingsDigest, receiptBindingDigest.bytes)
      || !bytesEqual(payload.issuerLineageDigest, lineageDigest.bytes)) {
      return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', {
        artifactIndex: index,
        field: 'authorizationArtifactBinding',
      });
    }
    if (!aadMatches(aad, {
        kind: payload.kind,
        sequence: payload.sequence,
        challenge: payload.challenge,
        bindingsDigest: payload.bindingsDigest,
        controlPlaneEpoch: receipt.value.epochs.controlPlane,
        issuerRole: aadRole(node.authorityRole),
        componentRole: 'AUTHORIZATION_ARTIFACT',
        issuerLineageDigest: payload.issuerLineageDigest,
      })) return hold('E_CONTAINMENT_E2_EXTERNAL_AAD_MISMATCH', {
        artifactIndex: index,
        field: 'authorizationArtifactAad',
      });
    const signedEnvelopeDigest = digestBytes(artifact.signed.envelope);
    if (payload.kind === 'ENROLLMENT_CREDENTIAL') {
      const subjectNode = graphNode(
        evidence.authorityGraph,
        artifact.subjectAuthorityId,
      );
      const subject = subjectNode
        ? credentialSubjectForNode(subjectNode)
        : null;
      const subjectDigest = subject ? canonicalDigest(subject) : null;
      if (receipt.value.sequence !== 0
        || payload.sequence !== 0
        || artifact.subjectExecutionInstanceId !== null
        || payload.subjectAuthorityId !== artifact.subjectAuthorityId
        || !subjectNode
        || subjectNode.parentAuthorityId === null
        || subjectNode.parentAuthorityId !== artifact.issuerId
        || !subjectDigest
        || !bytesEqual(
          payload.credentialSubjectDigest,
          subjectDigest.bytes,
        )
        || !bytesEqual(subjectNode.enrollmentDigest, signedEnvelopeDigest)
        || credentialsBySubject.has(subjectNode.authorityId)) {
        return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID', {
          artifactIndex: index,
          field: 'enrollmentCredential',
        });
      }
      credentialsBySubject.set(subjectNode.authorityId, Object.freeze({
        payload,
        envelopeDigest: signedEnvelopeDigest,
      }));
      continue;
    }
    const requiredIssuerRole = payload.kind === 'ADMISSION_GRANT'
      ? 'control-plane'
      : 'cleanup-authority';
    const targetMeasurementType = payload.kind === 'ADMISSION_GRANT'
      ? 'descriptor-set'
      : 'cleanup-target-set';
    if (artifact.subjectAuthorityId !== null
      || payload.subjectAuthorityId !== null
      || payload.subjectExecutionInstanceId
        !== artifact.subjectExecutionInstanceId
      || payload.subjectExecutionInstanceId
        !== receipt.value.bindings.executionInstanceId
      || receipt.value.sequence < payload.sequence
      || artifact.authorityRole !== requiredIssuerRole
      || node.authorityRole !== requiredIssuerRole
      || !bytesEqual(
        payload.resourceDigest,
        receipt.value.bindings.resourceDigest,
      )
      || !bytesEqual(
        payload.fencingTokenDigest,
        receipt.value.bindings.fencingTokenDigest,
      )) {
      return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', {
        artifactIndex: index,
        field: 'authorizationGrantAuthority',
      });
    }
    if (receipt.value.sequence === payload.sequence) {
      const targetMeasurement = receiptMeasurement(
        receipt.value,
        targetMeasurementType,
      );
      if (receipt.value.previousEnvelopeDigest === null
        || !bytesEqual(
          payload.authorizedEnvelopeDigest,
          receipt.value.previousEnvelopeDigest,
        )
        || !targetMeasurement
        || !bytesEqual(payload.targetSetDigest, targetMeasurement.digest)) {
        return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', {
          artifactIndex: index,
          field: 'authorizationGrantCausality',
        });
      }
    }
    grants[payload.kind] = Object.freeze({
      payload,
      envelopeDigest: signedEnvelopeDigest,
    });
  }
  const sequence = receipt.value.sequence;
  const nonRootAuthorities = evidence.authorityGraph.nodes.filter(
    node => node.parentAuthorityId !== null,
  );
  if (sequence === 0) {
    if (credentialsBySubject.size !== nonRootAuthorities.length
      || nonRootAuthorities.some(
        node => !credentialsBySubject.has(node.authorityId),
      )) {
      return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID', {
        field: 'enrollmentCredentialSet',
      });
    }
  } else if (credentialsBySubject.size !== 0) {
    return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID', {
      field: 'enrollmentCredentialPhase',
    });
  }
  const expectedAdmission = sequence >= 4;
  const expectedCleanup = sequence >= 8;
  if ((grants.ADMISSION_GRANT !== undefined) !== expectedAdmission
    || (grants.CLEANUP_GRANT !== undefined) !== expectedCleanup) {
    return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', {
      field: 'authorizationArtifacts',
      sequence,
    });
  }
  if (expectedAdmission && !bytesEqual(
    receipt.value.artifactRefs.admissionGrantDigest,
    grants.ADMISSION_GRANT.envelopeDigest,
  )) return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', {
    field: 'admissionGrantDigest',
  });
  if (expectedCleanup && !bytesEqual(
    receipt.value.artifactRefs.cleanupGrantDigest,
    grants.CLEANUP_GRANT.envelopeDigest,
  )) return hold('E_CONTAINMENT_E2_BINDING_MISMATCH', {
    field: 'cleanupGrantDigest',
  });
  return {
    ok: true,
    value: immutableSnapshot({
      evidence,
      receipt: receipt.value,
      receiptDigestRef: digestRef(receiptCose.value.payload),
      envelopeDigest: digestBytes(envelopeBytes),
      envelopeDigestRef: digestRef(envelopeBytes),
      componentAuthorityCount: new Set(
        evidence.componentAttestations.map(component => component.authorityId),
      ).size,
      authorizationArtifactCount: evidence.authorizationArtifacts.length,
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
    }),
  };
}

export function validateContainmentEvidenceEnvelope(value, options = {}) {
  const optionRecord = ownDataRecord(
    options,
    VALIDATION_OPTION_KEYS,
    ['expectedChallenge', 'expectedIssuerLineage'],
  );
  if (!optionRecord) return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  const expectedLineage = normalizeLineage(optionRecord.expectedIssuerLineage);
  const expectedChallenge = digest32(optionRecord.expectedChallenge);
  if (!expectedLineage || expectedChallenge === undefined) {
    return hold('E_CONTAINMENT_E2_INPUT_INVALID', {
      required: ['expectedChallenge', 'expectedIssuerLineage'],
    });
  }
  return validateEvidenceEnvelopeBytes(value, {
    ...optionRecord,
    expectedChallenge,
    expectedIssuerLineage: expectedLineage,
  });
}

export function validateContainmentMeasurementEnvelopeChain(value, options = {}) {
  const envelopeValues = arrayValues(value, CONTAINMENT_RECEIPT_KINDS.length);
  if (!envelopeValues || envelopeValues.length !== CONTAINMENT_RECEIPT_KINDS.length) {
    return hold('E_CONTAINMENT_E2_CHAIN_INCOMPLETE');
  }
  const optionRecord = ownDataRecord(
    options,
    VALIDATION_OPTION_KEYS,
    ['expectedChallenge', 'expectedIssuerLineage'],
  );
  if (!optionRecord) return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  const expectedLineage = normalizeLineage(optionRecord.expectedIssuerLineage);
  const expectedChallenge = digest32(optionRecord.expectedChallenge);
  if (!expectedLineage || expectedChallenge === undefined) {
    return hold('E_CONTAINMENT_E2_INPUT_INVALID', {
      required: ['expectedChallenge', 'expectedIssuerLineage'],
    });
  }
  const trustedOptions = {
    ...optionRecord,
    expectedChallenge,
    expectedIssuerLineage: expectedLineage,
  };
  const entries = [];
  for (let index = 0; index < envelopeValues.length; index += 1) {
    const evidence = validateEvidenceEnvelopeBytes(
      envelopeValues[index],
      trustedOptions,
    );
    if (!evidence.ok) {
      return hold(evidence.hold.reasonCode, {
        index,
        ...evidence.hold.details,
      });
    }
    entries.push(Object.freeze({
      payload: evidence.value.receipt,
      receiptDigestRef: evidence.value.receiptDigestRef,
      envelopeDigest: evidence.value.envelopeDigest,
      envelopeDigestRef: evidence.value.envelopeDigestRef,
      componentAuthorityCount: evidence.value.componentAuthorityCount,
    }));
  }
  const sequence = validateSequenceReceipts(entries, trustedOptions, true);
  if (!sequence.ok) return sequence;
  return {
    ok: true,
    value: immutableSnapshot({
      ...sequence.value,
      kind: 'containment-measurement-evidence-chain',
      evidenceEnvelopeState: 'STRUCTURALLY_VALID',
      componentAuthorityCount: Math.max(
        ...entries.map(entry => entry.componentAuthorityCount),
      ),
      finalEnvelopeDigestRef: entries.at(-1).envelopeDigestRef,
    }),
  };
}

export function containmentEvidenceDigest(value) {
  const encoded = bytes(value);
  if (encoded === null || encoded.byteLength === 0) {
    return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  }
  return {
    ok: true,
    value: immutableSnapshot({
      bytes: digestBytes(encoded),
      digestRef: digestRef(encoded),
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
    }),
  };
}

export function createContainmentComponentPayload(input = {}) {
  const inputRecord = ownDataRecord(
    input,
    COMPONENT_INPUT_KEYS,
    COMPONENT_INPUT_KEYS,
  );
  if (!inputRecord) return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  const normalized = normalizeComponentPayload({
    schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
    protocol: CONTAINMENT_MEASUREMENT_PROTOCOL,
    kind: 'COMPONENT_ATTESTATION',
    sequence: inputRecord.sequence,
    componentId: inputRecord.componentId,
    componentRole: inputRecord.componentRole,
    platformClass: inputRecord.platformClass,
    challenge: inputRecord.challenge,
    bindingsDigest: inputRecord.bindingsDigest,
    issuerLineageDigest: inputRecord.issuerLineageDigest,
    measurementDigest: inputRecord.measurementDigest,
    activation: 'NOT_BORN',
    proofEligible: false,
  });
  if (!normalized) return hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  const encoded = encodeDeterministicCbor(normalized);
  if (!encoded.ok) return hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  return {
    ok: true,
    value: immutableSnapshot({
      payload: normalized,
      bytes: encoded.value,
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
    }),
  };
}

export function createContainmentAuthorizationPayload(input = {}) {
  const inputRecord = ownDataRecord(
    input,
    AUTHORIZATION_INPUT_KEYS,
    ['kind'],
  );
  if (!inputRecord) return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  const payload = inputRecord.kind === 'ENROLLMENT_CREDENTIAL'
    ? {
      schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
      protocol: CONTAINMENT_MEASUREMENT_PROTOCOL,
      kind: 'ENROLLMENT_CREDENTIAL',
      sequence: inputRecord.sequence,
      artifactId: inputRecord.artifactId,
      challenge: inputRecord.challenge,
      bindingsDigest: inputRecord.bindingsDigest,
      subjectAuthorityId: inputRecord.subjectAuthorityId,
      credentialSubjectDigest: inputRecord.credentialSubjectDigest,
      issuerLineageDigest: inputRecord.issuerLineageDigest,
      activation: 'NOT_BORN',
      proofEligible: false,
    }
    : {
      schemaVersion: CONTAINMENT_MEASUREMENT_SCHEMA_VERSION,
      protocol: CONTAINMENT_MEASUREMENT_PROTOCOL,
      kind: inputRecord.kind,
      sequence: inputRecord.sequence,
      artifactId: inputRecord.artifactId,
      challenge: inputRecord.challenge,
      bindingsDigest: inputRecord.bindingsDigest,
      subjectAuthorityId: inputRecord.subjectAuthorityId,
      subjectExecutionInstanceId: inputRecord.subjectExecutionInstanceId,
      issuerLineageDigest: inputRecord.issuerLineageDigest,
      authorizedAfterSequence: inputRecord.authorizedAfterSequence,
      authorizedEnvelopeDigest: inputRecord.authorizedEnvelopeDigest,
      resourceDigest: inputRecord.resourceDigest,
      targetSetDigest: inputRecord.targetSetDigest,
      fencingTokenDigest: inputRecord.fencingTokenDigest,
      activation: 'NOT_BORN',
      proofEligible: false,
    };
  const normalized = normalizeAuthorizationPayload(payload);
  if (!normalized) return hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  const encoded = encodeDeterministicCbor(normalized);
  if (!encoded.ok) return hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  return {
    ok: true,
    value: immutableSnapshot({
      payload: normalized,
      bytes: encoded.value,
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
    }),
  };
}

export function containmentCredentialSubjectDigest(value) {
  const subject = normalizeCredentialSubject(value);
  if (!subject) return hold('E_CONTAINMENT_E2_KEY_LINEAGE_INVALID');
  const result = canonicalDigest(subject);
  if (!result) return hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  return {
    ok: true,
    value: immutableSnapshot({
      subject,
      bytes: result.bytes,
      digestRef: result.digestRef,
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
    }),
  };
}

export function containmentCanonicalDigest(value) {
  const result = canonicalDigest(value);
  if (!result) return hold('E_CONTAINMENT_E2_SCHEMA_INVALID');
  return {
    ok: true,
    value: immutableSnapshot({
      ...result,
      activation: 'NOT_BORN',
      proofEligible: false,
      signatureVerified: false,
    }),
  };
}
