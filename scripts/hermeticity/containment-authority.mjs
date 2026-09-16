import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  CONTAINMENT_CONTRACT_SCHEMA_VERSION,
  createContainmentFacetAuthority,
  createContainmentHold,
  evaluateContainmentAdmission,
  evaluateContainmentAdmissionWithFacetAuthority,
  evaluateContainmentProofEligibilityWithFacetAuthority,
  inspectContainmentFacetAuthority,
  recordContainmentFacetObservation,
  validateContainmentAdmission,
  validateContainmentProof,
  verifyContainmentAdmissionWithFacetAuthority,
  verifyContainmentProofWithFacetAuthority,
} from './containment-contract.mjs';

const SHA256_REFERENCE_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const HEX_SECRET_PATTERN = /^[a-f0-9]{64}$/u;
const HMAC_PATTERN = /^[a-f0-9]{64}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_CANONICAL_COLLECTION_ENTRIES = 1_000_000;

const IntrinsicWeakMap = WeakMap;

let authoritySessionTokenValue = null;
let authoritySessionRegistryValue = null;
let weakMapAuthorityValue = null;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCanonicalRecord(value) {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function isIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function isDigestReference(value) {
  return typeof value === 'string' && SHA256_REFERENCE_PATTERN.test(value);
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function freezeJson(value) {
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) freezeJson(value[key]);
    return Object.freeze(value);
  }
  return value;
}

function authorityHold(reasonCode, details = {}) {
  return {
    ok: false,
    hold: createContainmentHold({
      reasonCode,
      details,
    }),
  };
}

function authoritySessionToken() {
  if (authoritySessionTokenValue === null) authoritySessionTokenValue = {};
  return authoritySessionTokenValue;
}

function authoritySessionRegistry() {
  if (authoritySessionRegistryValue === null) {
    authoritySessionRegistryValue = new IntrinsicWeakMap();
  }
  return authoritySessionRegistryValue;
}

function weakMapAuthority() {
  if (weakMapAuthorityValue === null) {
    weakMapAuthorityValue = Object.freeze({
      delete: Function.prototype.call.bind(WeakMap.prototype.delete),
      get: Function.prototype.call.bind(WeakMap.prototype.get),
      set: Function.prototype.call.bind(WeakMap.prototype.set),
    });
  }
  return weakMapAuthorityValue;
}

class ContainmentAuthoritySession {
  #token;
  #secret;
  #secretRef;
  #claimRef;
  #receiptRef;
  #facetAuthority;
  #facetContext;
  #closed;

  constructor(token, secret) {
    if (token !== authoritySessionToken()) {
      throw new TypeError('E_CONTAINMENT_AUTHORITY_SESSION_CONSTRUCTOR_DENIED');
    }
    this.#token = token;
    this.#secret = secret;
    this.#secretRef = secret.secretRef;
    this.#claimRef = null;
    this.#receiptRef = null;
    this.#facetAuthority = null;
    this.#facetContext = null;
    this.#closed = false;
  }

  operate(token, operation, input) {
    if (token !== this.#token || this.#closed || this.#secret === null) {
      return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INVALID');
    }
    if (operation === 'inspect') {
      return {
        ok: true,
        value: freezeJson({ secretRef: this.#secretRef }),
      };
    }
    if (operation === 'bind-facet-authority') {
      if (this.#facetAuthority !== null || this.#claimRef !== null) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_FACET_BINDING_REPLAY');
      }
      const created = createContainmentFacetAuthority(input);
      if (!created.ok) return created;
      const inspected = inspectContainmentFacetAuthority(created.value);
      if (!inspected.ok) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_FACET_BINDING_INVALID');
      }
      this.#facetAuthority = created.value;
      this.#facetContext = inspected.value;
      return {
        ok: true,
        value: freezeJson({ state: 'BOUND' }),
      };
    }
    if (operation === 'record-facet') {
      if (this.#facetAuthority === null) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_FACET_AUTHORITY_REQUIRED');
      }
      return recordContainmentFacetObservation({
        ...input,
        authority: this.#facetAuthority,
      });
    }
    if (operation === 'evaluate-admission') {
      if (this.#facetAuthority === null) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_FACET_AUTHORITY_REQUIRED');
      }
      return {
        ok: true,
        value: evaluateContainmentAdmissionWithFacetAuthority({
          ...input,
          authority: this.#facetAuthority,
        }),
      };
    }
    if (operation === 'evaluate-proof') {
      if (this.#facetAuthority === null) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_FACET_AUTHORITY_REQUIRED');
      }
      return {
        ok: true,
        value: evaluateContainmentProofEligibilityWithFacetAuthority({
          ...input,
          authority: this.#facetAuthority,
        }),
      };
    }
    if (operation === 'create-claim') {
      if (this.#claimRef !== null) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_CLAIM_REPLAY');
      }
      const admissionAuthority = verifyContainmentAdmissionWithFacetAuthority({
        authority: this.#facetAuthority,
        admission: input.admission,
      });
      if (!admissionAuthority.ok
        || input.runNonce !== this.#facetContext?.runNonce
        || input.controlPlaneRef !== this.#facetContext?.authorityRef
        || input.policyRef !== this.#facetContext?.policyRef
        || input.resourceIdentityRef !== this.#facetContext?.resourceIdentityRef
        || input.executionIntentRef !== this.#facetContext?.executionIntentRef
        || input.admission?.adapterId !== this.#facetContext?.adapterId
        || input.admission?.boundaryClass !== this.#facetContext?.boundaryClass) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_ADMISSION_AUTHORITY_INVALID');
      }
      const result = createContainmentAuthorityClaim({
        ...input,
        secret: this.#secret,
      });
      if (result.ok) this.#claimRef = result.value.claimRef;
      return result;
    }
    if (operation === 'verify-claim') {
      if (this.#claimRef === null || input?.claim?.claimRef !== this.#claimRef) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_CLAIM_BINDING_INVALID');
      }
      return verifyContainmentAuthorityClaim({
        claim: input.claim,
        secret: this.#secret,
      });
    }
    if (operation === 'create-receipt') {
      if (this.#claimRef === null || input?.claim?.claimRef !== this.#claimRef) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_CLAIM_BINDING_INVALID');
      }
      if (this.#receiptRef !== null) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_RECEIPT_REPLAY');
      }
      const admissionAuthority = verifyContainmentAdmissionWithFacetAuthority({
        authority: this.#facetAuthority,
        admission: input.admission,
      });
      const proofAuthority = verifyContainmentProofWithFacetAuthority({
        authority: this.#facetAuthority,
        admission: input.admission,
        proof: input.proof,
        executionRef: input.executionRef,
        settlementRef: input.settlementRef,
        completionRef: input.completionRef,
      });
      if (!admissionAuthority.ok || !proofAuthority.ok) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_PROOF_AUTHORITY_INVALID');
      }
      const result = createContainmentAuthorityReceipt({
        ...input,
        secret: this.#secret,
      });
      if (result.ok) this.#receiptRef = result.value.receiptRef;
      return result;
    }
    if (operation === 'verify-receipt') {
      if (this.#receiptRef === null
        || input?.receipt?.receiptRef !== this.#receiptRef
        || input.receipt.claimRef !== this.#claimRef) {
        return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_RECEIPT_BINDING_INVALID');
      }
      return verifyContainmentAuthorityReceipt({
        receipt: input.receipt,
        secret: this.#secret,
      });
    }
    if (operation === 'close') {
      this.#closed = true;
      this.#secret = null;
      this.#facetAuthority = null;
      this.#facetContext = null;
      return {
        ok: true,
        value: freezeJson({
          secretRef: this.#secretRef,
          state: 'CLOSED',
        }),
      };
    }
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_OPERATION_INVALID');
  }

  toJSON() {
    return { secretRef: this.#secretRef };
  }
}

function runAuthoritySessionOperation(session, operation, input = {}) {
  try {
    const registry = authoritySessionRegistry();
    const handler = isRecord(session)
      ? weakMapAuthority().get(registry, session)
      : null;
    if (typeof handler !== 'function') {
      return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INVALID');
    }
    const result = handler(operation, input);
    if (operation === 'close' && result.ok) {
      weakMapAuthority().delete(registry, session);
    }
    return result;
  } catch {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INVALID');
  }
}

function canonicalize(value, ancestors) {
  if (value === null) return { ok: true, value: 'null' };
  if (typeof value === 'string' || typeof value === 'boolean') {
    return { ok: true, value: JSON.stringify(value) };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ok: true, value: JSON.stringify(value) }
      : { ok: false, reasonCode: 'E_CONTAINMENT_CANONICAL_NUMBER_INVALID' };
  }
  if (Array.isArray(value)) {
    if (ancestors.includes(value)) {
      return { ok: false, reasonCode: 'E_CONTAINMENT_CANONICAL_CYCLE' };
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const descriptorKeys = Reflect.ownKeys(descriptors);
    const lengthDescriptor = descriptors.length;
    if (!isRecord(lengthDescriptor)
      || !hasOwn(lengthDescriptor, 'value')
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > MAX_CANONICAL_COLLECTION_ENTRIES) {
      return { ok: false, reasonCode: 'E_CONTAINMENT_CANONICAL_ARRAY_INVALID' };
    }
    if (descriptorKeys.some(key => typeof key === 'symbol')
      || descriptorKeys.length !== lengthDescriptor.value + 1
      || !hasOwn(descriptors, 'length')) {
      return { ok: false, reasonCode: 'E_CONTAINMENT_CANONICAL_ARRAY_INVALID' };
    }
    const nextAncestors = [...ancestors, value];
    const items = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        return { ok: false, reasonCode: 'E_CONTAINMENT_CANONICAL_ARRAY_INVALID' };
      }
      const item = canonicalize(descriptor.value, nextAncestors);
      if (!item.ok) return item;
      items.push(item.value);
    }
    return { ok: true, value: `[${items.join(',')}]` };
  }
  if (!isCanonicalRecord(value)) {
    return {
      ok: false,
      reasonCode: 'E_CONTAINMENT_CANONICAL_TYPE_INVALID',
      details: { actualType: typeof value },
    };
  }
  if (ancestors.includes(value)) {
    return { ok: false, reasonCode: 'E_CONTAINMENT_CANONICAL_CYCLE' };
  }

  const nextAncestors = [...ancestors, value];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key === 'symbol')) {
    return {
      ok: false,
      reasonCode: 'E_CONTAINMENT_CANONICAL_PROPERTY_INVALID',
    };
  }
  const members = [];
  const keys = Object.keys(descriptors).sort();
  if (keys.length > MAX_CANONICAL_COLLECTION_ENTRIES) {
    return {
      ok: false,
      reasonCode: 'E_CONTAINMENT_CANONICAL_CAPACITY_EXCEEDED',
    };
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      return {
        ok: false,
        reasonCode: 'E_CONTAINMENT_CANONICAL_PROPERTY_INVALID',
      };
    }
    const item = canonicalize(descriptor.value, nextAncestors);
    if (!item.ok) return item;
    members.push(`${JSON.stringify(key)}:${item.value}`);
  }
  return { ok: true, value: `{${members.join(',')}}` };
}

export function canonicalContainmentJson(value) {
  let result;
  try {
    result = canonicalize(value, []);
  } catch {
    return authorityHold('E_CONTAINMENT_CANONICAL_ACCESS_FAILED');
  }
  if (!result.ok) {
    return authorityHold(
      result.reasonCode,
      isRecord(result.details) ? result.details : {},
    );
  }
  return { ok: true, value: result.value };
}

export function containmentDigestRef(value) {
  const canonical = canonicalContainmentJson(value);
  if (!canonical.ok) return canonical;
  const digest = createHash('sha256').update(canonical.value).digest('hex');
  return { ok: true, value: `sha256:${digest}` };
}

function validateSecret(value) {
  return isRecord(value)
    && exactKeys(value, [
      'schemaVersion',
      'kind',
      'secretHex',
      'secretRef',
    ])
    && value.schemaVersion === CONTAINMENT_CONTRACT_SCHEMA_VERSION
    && value.kind === 'containment-authority-secret'
    && typeof value.secretHex === 'string'
    && HEX_SECRET_PATTERN.test(value.secretHex)
    && isDigestReference(value.secretRef);
}

function secretReference(secretHex) {
  const digest = createHash('sha256')
    .update(Buffer.from(secretHex, 'hex'))
    .digest('hex');
  return `sha256:${digest}`;
}

export function createContainmentAuthoritySecret(options = {}) {
  if (!isRecord(options)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SECRET_OPTIONS_INVALID');
  }
  const randomSource = options.randomBytes ?? randomBytes;
  if (typeof randomSource !== 'function') {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RANDOM_SOURCE_INVALID');
  }

  let bytes;
  try {
    bytes = randomSource(32);
  } catch (error) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RANDOM_SOURCE_FAILED', {
      errorCode: isRecord(error) && typeof error.code === 'string'
        ? error.code
        : null,
    });
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SECRET_LENGTH_INVALID', {
      actualLength: bytes instanceof Uint8Array ? bytes.byteLength : null,
    });
  }

  const secretHex = Buffer.from(bytes).toString('hex');
  return {
    ok: true,
    value: freezeJson({
      schemaVersion: CONTAINMENT_CONTRACT_SCHEMA_VERSION,
      kind: 'containment-authority-secret',
      secretHex,
      secretRef: secretReference(secretHex),
    }),
  };
}

export function createContainmentAuthoritySession(options = {}) {
  const secret = createContainmentAuthoritySecret(options);
  if (!secret.ok) return secret;
  try {
    const token = authoritySessionToken();
    const session = new ContainmentAuthoritySession(token, secret.value);
    Object.freeze(Object.getPrototypeOf(session));
    Object.freeze(session);
    weakMapAuthority().set(
      authoritySessionRegistry(),
      session,
      (operation, input) => session.operate(token, operation, input),
    );
    return {
      ok: true,
      value: session,
    };
  } catch {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_CREATE_FAILED');
  }
}

export function inspectContainmentAuthoritySession(session) {
  return runAuthoritySessionOperation(session, 'inspect');
}

export function bindContainmentAuthoritySessionFacetAuthority(input) {
  if (!isRecord(input)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INPUT_INVALID');
  }
  const { session, ...context } = input;
  return runAuthoritySessionOperation(session, 'bind-facet-authority', context);
}

export function recordContainmentAuthoritySessionFacetObservation(input) {
  if (!isRecord(input)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INPUT_INVALID');
  }
  const { session, ...observation } = input;
  return runAuthoritySessionOperation(session, 'record-facet', observation);
}

export function evaluateContainmentAdmissionWithSession(input) {
  if (!isRecord(input)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INPUT_INVALID');
  }
  const { session, ...admissionInput } = input;
  return runAuthoritySessionOperation(session, 'evaluate-admission', admissionInput);
}

export function evaluateContainmentProofEligibilityWithSession(input) {
  if (!isRecord(input)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INPUT_INVALID');
  }
  const { session, ...proofInput } = input;
  return runAuthoritySessionOperation(session, 'evaluate-proof', proofInput);
}

export function createContainmentAuthorityClaimWithSession(input) {
  if (!isRecord(input)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INPUT_INVALID');
  }
  const { session, ...claimInput } = input;
  return runAuthoritySessionOperation(session, 'create-claim', claimInput);
}

export function verifyContainmentAuthorityClaimWithSession(input) {
  if (!isRecord(input)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INPUT_INVALID');
  }
  return runAuthoritySessionOperation(input.session, 'verify-claim', {
    claim: input.claim,
  });
}

export function createContainmentAuthorityReceiptWithSession(input) {
  if (!isRecord(input)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INPUT_INVALID');
  }
  const { session, ...receiptInput } = input;
  return runAuthoritySessionOperation(session, 'create-receipt', receiptInput);
}

export function verifyContainmentAuthorityReceiptWithSession(input) {
  if (!isRecord(input)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SESSION_INPUT_INVALID');
  }
  return runAuthoritySessionOperation(input.session, 'verify-receipt', {
    receipt: input.receipt,
  });
}

export function closeContainmentAuthoritySession(session) {
  return runAuthoritySessionOperation(session, 'close');
}

function validateClaimShape(claim) {
  return isRecord(claim)
    && exactKeys(claim, [
      'schemaVersion',
      'kind',
      'runNonce',
      'claimNonce',
      'issuedAt',
      'adapterId',
      'boundaryClass',
      'policyRef',
      'controlPlaneRef',
      'sourceRef',
      'dependencyProjectionRef',
      'runtimeProjectionRef',
      'resourceIdentityRef',
      'executionIntentRef',
      'admissionRef',
      'secretRef',
      'claimMac',
      'claimRef',
    ])
    && claim.schemaVersion === CONTAINMENT_CONTRACT_SCHEMA_VERSION
    && claim.kind === 'containment-authority-claim'
    && isIdentifier(claim.runNonce)
    && isIdentifier(claim.claimNonce)
    && isIsoTimestamp(claim.issuedAt)
    && isIdentifier(claim.adapterId)
    && ['none', 'process', 'kernel', 'virtualized-kernel'].includes(claim.boundaryClass)
    && isDigestReference(claim.policyRef)
    && isDigestReference(claim.controlPlaneRef)
    && isDigestReference(claim.sourceRef)
    && isDigestReference(claim.dependencyProjectionRef)
    && isDigestReference(claim.runtimeProjectionRef)
    && isDigestReference(claim.resourceIdentityRef)
    && isDigestReference(claim.executionIntentRef)
    && isDigestReference(claim.admissionRef)
    && isDigestReference(claim.secretRef)
    && typeof claim.claimMac === 'string'
    && HMAC_PATTERN.test(claim.claimMac)
    && isDigestReference(claim.claimRef);
}

function claimPayload(claim) {
  return {
    schemaVersion: claim.schemaVersion,
    kind: claim.kind,
    runNonce: claim.runNonce,
    claimNonce: claim.claimNonce,
    issuedAt: claim.issuedAt,
    adapterId: claim.adapterId,
    boundaryClass: claim.boundaryClass,
    policyRef: claim.policyRef,
    controlPlaneRef: claim.controlPlaneRef,
    sourceRef: claim.sourceRef,
    dependencyProjectionRef: claim.dependencyProjectionRef,
    runtimeProjectionRef: claim.runtimeProjectionRef,
    resourceIdentityRef: claim.resourceIdentityRef,
    executionIntentRef: claim.executionIntentRef,
    admissionRef: claim.admissionRef,
    secretRef: claim.secretRef,
  };
}

function hmacHex(secretHex, value) {
  const canonical = canonicalContainmentJson(value);
  if (!canonical.ok) return canonical;
  const digest = createHmac('sha256', Buffer.from(secretHex, 'hex'))
    .update(canonical.value)
    .digest('hex');
  return { ok: true, value: digest };
}

function equalHex(left, right) {
  if (typeof left !== 'string'
    || typeof right !== 'string'
    || left.length !== right.length
    || !HMAC_PATTERN.test(left)
    || !HMAC_PATTERN.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function createContainmentAuthorityClaim(input) {
  if (!isRecord(input)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_CLAIM_INPUT_INVALID');
  }
  if (hasOwn(input, 'proofEligible')
    || hasOwn(input, 'claimMac')
    || hasOwn(input, 'claimRef')) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RESERVED_FIELD', {
      phase: 'claim',
    });
  }
  if (!validateSecret(input.secret)
    || secretReference(input.secret?.secretHex ?? '') !== input.secret?.secretRef) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SECRET_INVALID');
  }

  const admissionValidation = validateContainmentAdmission(input.admission);
  if (!admissionValidation.ok) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_ADMISSION_INVALID', {
      reasonCode: admissionValidation.hold.reasonCode,
    });
  }
  const admission = admissionValidation.value;
  if (admission.state !== 'ADMITTED'
    || admission.mode !== 'enforce'
    || !['kernel', 'virtualized-kernel'].includes(admission.boundaryClass)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_ADMISSION_NOT_EXECUTABLE', {
      admissionState: admission.state,
    });
  }
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const claimNonce = input.claimNonce ?? input.runNonce;
  const referenceFields = [
    'policyRef',
    'controlPlaneRef',
    'sourceRef',
    'dependencyProjectionRef',
    'runtimeProjectionRef',
    'resourceIdentityRef',
    'executionIntentRef',
  ];
  const invalidReference = referenceFields.find(field => !isDigestReference(input[field]));
  if (!isIdentifier(input.runNonce)
    || !isIdentifier(claimNonce)
    || !isIsoTimestamp(issuedAt)
    || invalidReference) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_CLAIM_FIELD_INVALID', {
      field: invalidReference ?? 'identity',
    });
  }
  if (!isIdentifier(admission.adapterId)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_ADAPTER_INVALID', {
      admissionState: admission.state,
    });
  }
  if (!['none', 'process', 'kernel', 'virtualized-kernel'].includes(
    admission.boundaryClass,
  )) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_BOUNDARY_INVALID', {
      admissionState: admission.state,
    });
  }

  const admissionRef = containmentDigestRef(admission);
  if (!admissionRef.ok) return admissionRef;
  const payload = {
    schemaVersion: CONTAINMENT_CONTRACT_SCHEMA_VERSION,
    kind: 'containment-authority-claim',
    runNonce: input.runNonce,
    claimNonce,
    issuedAt,
    adapterId: admission.adapterId,
    boundaryClass: admission.boundaryClass,
    policyRef: input.policyRef,
    controlPlaneRef: input.controlPlaneRef,
    sourceRef: input.sourceRef,
    dependencyProjectionRef: input.dependencyProjectionRef,
    runtimeProjectionRef: input.runtimeProjectionRef,
    resourceIdentityRef: input.resourceIdentityRef,
    executionIntentRef: input.executionIntentRef,
    admissionRef: admissionRef.value,
    secretRef: input.secret.secretRef,
  };
  const claimMac = hmacHex(input.secret.secretHex, payload);
  if (!claimMac.ok) return claimMac;
  const claimWithoutRef = { ...payload, claimMac: claimMac.value };
  const claimRef = containmentDigestRef(claimWithoutRef);
  if (!claimRef.ok) return claimRef;

  return {
    ok: true,
    value: freezeJson({
      ...claimWithoutRef,
      claimRef: claimRef.value,
    }),
  };
}

export function verifyContainmentAuthorityClaim(input) {
  if (!isRecord(input)
    || !validateClaimShape(input.claim)
    || !validateSecret(input.secret)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_CLAIM_INVALID');
  }
  if (secretReference(input.secret.secretHex) !== input.secret.secretRef
    || input.claim.secretRef !== input.secret.secretRef) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SECRET_MISMATCH');
  }

  const expectedMac = hmacHex(input.secret.secretHex, claimPayload(input.claim));
  if (!expectedMac.ok || !equalHex(expectedMac.value, input.claim.claimMac)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_CLAIM_MAC_INVALID');
  }
  const expectedRef = containmentDigestRef({
    ...claimPayload(input.claim),
    claimMac: input.claim.claimMac,
  });
  if (!expectedRef.ok || expectedRef.value !== input.claim.claimRef) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_CLAIM_REF_INVALID');
  }

  return {
    ok: true,
    value: freezeJson(structuredClone(input.claim)),
  };
}

function normalizeCandidate(candidate, index) {
  if (!isRecord(candidate)
    || !isIdentifier(candidate.adapterId)
    || !Number.isSafeInteger(candidate.priority)
    || candidate.priority < 0
    || candidate.priority > 1_000_000) {
    return {
      ok: false,
      hold: createContainmentHold({
        reasonCode: 'E_CONTAINMENT_AUTHORITY_CANDIDATE_INVALID',
        details: { index },
      }),
    };
  }
  return {
    ok: true,
    value: {
      adapterId: candidate.adapterId,
      boundaryClass: candidate.boundaryClass,
      adapterState: candidate.adapterState,
      priority: candidate.priority,
      facets: candidate.facets,
    },
  };
}

export function resolveContainmentAuthority(input) {
  if (!isRecord(input)
    || !['audit', 'enforce'].includes(input.mode)
    || !Array.isArray(input.candidates)) {
    return createContainmentHold({
      mode: isRecord(input) ? input.mode : null,
      reasonCode: 'E_CONTAINMENT_AUTHORITY_INPUT_INVALID',
    });
  }

  const candidates = [];
  const seen = [];
  for (let index = 0; index < input.candidates.length; index += 1) {
    const normalized = normalizeCandidate(input.candidates[index], index);
    if (!normalized.ok) return normalized.hold;
    if (seen.includes(normalized.value.adapterId)) {
      return createContainmentHold({
        mode: input.mode,
        adapterId: normalized.value.adapterId,
        reasonCode: 'E_CONTAINMENT_AUTHORITY_CANDIDATE_DUPLICATE',
      });
    }
    seen.push(normalized.value.adapterId);
    candidates.push(normalized.value);
  }

  const requestedAdapterId = input.requestedAdapterId ?? null;
  if (requestedAdapterId !== null && !isIdentifier(requestedAdapterId)) {
    return createContainmentHold({
      mode: input.mode,
      reasonCode: 'E_CONTAINMENT_AUTHORITY_REQUEST_INVALID',
    });
  }
  const eligibleCandidates = requestedAdapterId === null
    ? candidates
    : candidates.filter(candidate => candidate.adapterId === requestedAdapterId);
  eligibleCandidates.sort((left, right) => (
    left.priority - right.priority
      || (left.adapterId < right.adapterId ? -1 : left.adapterId > right.adapterId ? 1 : 0)
  ));

  if (eligibleCandidates.length === 0) {
    return createContainmentHold({
      mode: input.mode,
      adapterId: requestedAdapterId,
      reasonCode: requestedAdapterId
        ? 'E_CONTAINMENT_REQUESTED_ADAPTER_UNAVAILABLE'
        : 'E_CONTAINMENT_NO_ADAPTER_CANDIDATE',
    });
  }

  const evaluated = eligibleCandidates.map(candidate => evaluateContainmentAdmission({
    mode: input.mode,
    adapterId: candidate.adapterId,
    boundaryClass: candidate.boundaryClass,
    adapterState: candidate.adapterState,
    facets: candidate.facets,
  }));
  const admitted = evaluated.find(result => (
    result.state === 'ADMITTED' || result.state === 'AUDIT_UNENFORCED'
  ));
  if (admitted) return admitted;

  return createContainmentHold({
    mode: input.mode,
    adapterId: requestedAdapterId,
    reasonCode: 'E_CONTAINMENT_NO_ADMISSIBLE_ADAPTER',
    details: {
      candidateReasonCodes: evaluated.map(result => ({
        adapterId: result.adapterId,
        reasonCode: result.reasonCode,
      })),
    },
  });
}

function receiptPayload(receipt) {
  return {
    schemaVersion: receipt.schemaVersion,
    kind: receipt.kind,
    runNonce: receipt.runNonce,
    claimRef: receipt.claimRef,
    policyRef: receipt.policyRef,
    controlPlaneRef: receipt.controlPlaneRef,
    sourceRef: receipt.sourceRef,
    dependencyProjectionRef: receipt.dependencyProjectionRef,
    runtimeProjectionRef: receipt.runtimeProjectionRef,
    resourceIdentityRef: receipt.resourceIdentityRef,
    executionIntentRef: receipt.executionIntentRef,
    admissionRef: receipt.admissionRef,
    proofRef: receipt.proofRef,
    executionRef: receipt.executionRef,
    settlementRef: receipt.settlementRef,
    completionRef: receipt.completionRef,
    adapterId: receipt.adapterId,
    boundaryClass: receipt.boundaryClass,
    proofEligible: receipt.proofEligible,
    reasonCode: receipt.reasonCode,
    secretRef: receipt.secretRef,
  };
}

function validateReceiptShape(receipt) {
  return isRecord(receipt)
    && exactKeys(receipt, [
      'schemaVersion',
      'kind',
      'runNonce',
      'claimRef',
      'policyRef',
      'controlPlaneRef',
      'sourceRef',
      'dependencyProjectionRef',
      'runtimeProjectionRef',
      'resourceIdentityRef',
      'executionIntentRef',
      'admissionRef',
      'proofRef',
      'executionRef',
      'settlementRef',
      'completionRef',
      'adapterId',
      'boundaryClass',
      'proofEligible',
      'reasonCode',
      'secretRef',
      'receiptMac',
      'receiptRef',
    ])
    && receipt.schemaVersion === CONTAINMENT_CONTRACT_SCHEMA_VERSION
    && receipt.kind === 'containment-authority-receipt'
    && isIdentifier(receipt.runNonce)
    && isIdentifier(receipt.adapterId)
    && ['none', 'process', 'kernel', 'virtualized-kernel'].includes(receipt.boundaryClass)
    && typeof receipt.proofEligible === 'boolean'
    && typeof receipt.reasonCode === 'string'
    && receipt.reasonCode.length > 0
    && [
      'claimRef',
      'policyRef',
      'controlPlaneRef',
      'sourceRef',
      'dependencyProjectionRef',
      'runtimeProjectionRef',
      'resourceIdentityRef',
      'executionIntentRef',
      'admissionRef',
      'proofRef',
      'executionRef',
      'settlementRef',
      'completionRef',
      'secretRef',
      'receiptRef',
    ].every(field => isDigestReference(receipt[field]))
    && typeof receipt.receiptMac === 'string'
    && HMAC_PATTERN.test(receipt.receiptMac);
}

export function createContainmentAuthorityReceipt(input) {
  if (!isRecord(input)
    || hasOwn(input, 'proofEligible')
    || hasOwn(input, 'receiptMac')
    || hasOwn(input, 'receiptRef')) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RECEIPT_INPUT_INVALID');
  }

  const claimVerification = verifyContainmentAuthorityClaim({
    claim: input.claim,
    secret: input.secret,
  });
  if (!claimVerification.ok) return claimVerification;
  const admissionValidation = validateContainmentAdmission(input.admission);
  if (!admissionValidation.ok) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_ADMISSION_INVALID');
  }
  const proofValidation = validateContainmentProof(input.proof);
  if (!proofValidation.ok) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_PROOF_INVALID');
  }
  if (!isDigestReference(input.executionRef)
    || !isDigestReference(input.settlementRef)
    || !isDigestReference(input.completionRef)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RECEIPT_REF_INVALID');
  }

  const admission = admissionValidation.value;
  const proof = proofValidation.value;
  const claim = claimVerification.value;
  const admissionRef = containmentDigestRef(admission);
  const proofRef = containmentDigestRef(proof);
  if (!admissionRef.ok || !proofRef.ok) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RECEIPT_DIGEST_INVALID');
  }
  if (admissionRef.value !== claim.admissionRef
    || proof.adapterId !== admission.adapterId
    || proof.boundaryClass !== admission.boundaryClass
    || proof.mode !== admission.mode) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RECEIPT_BINDING_INVALID');
  }

  const payload = {
    schemaVersion: CONTAINMENT_CONTRACT_SCHEMA_VERSION,
    kind: 'containment-authority-receipt',
    runNonce: claim.runNonce,
    claimRef: claim.claimRef,
    policyRef: claim.policyRef,
    controlPlaneRef: claim.controlPlaneRef,
    sourceRef: claim.sourceRef,
    dependencyProjectionRef: claim.dependencyProjectionRef,
    runtimeProjectionRef: claim.runtimeProjectionRef,
    resourceIdentityRef: claim.resourceIdentityRef,
    executionIntentRef: claim.executionIntentRef,
    admissionRef: admissionRef.value,
    proofRef: proofRef.value,
    executionRef: input.executionRef,
    settlementRef: input.settlementRef,
    completionRef: input.completionRef,
    adapterId: admission.adapterId,
    boundaryClass: admission.boundaryClass,
    proofEligible: proof.proofEligible,
    reasonCode: proof.reasonCode,
    secretRef: claim.secretRef,
  };
  const receiptMac = hmacHex(input.secret.secretHex, payload);
  if (!receiptMac.ok) return receiptMac;
  const withoutRef = { ...payload, receiptMac: receiptMac.value };
  const receiptRef = containmentDigestRef(withoutRef);
  if (!receiptRef.ok) return receiptRef;

  return {
    ok: true,
    value: freezeJson({
      ...withoutRef,
      receiptRef: receiptRef.value,
    }),
  };
}

export function validateContainmentAuthorityReceipt(value) {
  if (!validateReceiptShape(value)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RECEIPT_INVALID');
  }
  if ((value.proofEligible && value.reasonCode !== 'NONE')
    || (!value.proofEligible && value.reasonCode === 'NONE')) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RECEIPT_ELIGIBILITY_INVALID');
  }
  return {
    ok: true,
    value: freezeJson(structuredClone(value)),
  };
}

export function verifyContainmentAuthorityReceipt(input) {
  if (!isRecord(input) || !validateSecret(input.secret)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RECEIPT_VERIFY_INPUT_INVALID');
  }
  const validation = validateContainmentAuthorityReceipt(input.receipt);
  if (!validation.ok) return validation;
  const receipt = validation.value;
  if (secretReference(input.secret.secretHex) !== input.secret.secretRef
    || receipt.secretRef !== input.secret.secretRef) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_SECRET_MISMATCH');
  }
  const expectedMac = hmacHex(input.secret.secretHex, receiptPayload(receipt));
  if (!expectedMac.ok || !equalHex(expectedMac.value, receipt.receiptMac)) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RECEIPT_MAC_INVALID');
  }
  const expectedRef = containmentDigestRef({
    ...receiptPayload(receipt),
    receiptMac: receipt.receiptMac,
  });
  if (!expectedRef.ok || expectedRef.value !== receipt.receiptRef) {
    return authorityHold('E_CONTAINMENT_AUTHORITY_RECEIPT_REF_INVALID');
  }
  return { ok: true, value: receipt };
}
