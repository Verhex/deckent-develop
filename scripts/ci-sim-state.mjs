import { createHash } from 'node:crypto';
import { open, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { atomicJson, syncCreatedFile } from './ci-sim-durable-json.mjs';
import {
  inspectContainmentAuthoritySession,
  verifyContainmentAuthorityClaimWithSession,
  verifyContainmentAuthorityReceiptWithSession,
} from './hermeticity/containment-authority.mjs';

const LEGACY_MANIFEST_VERSION = 2;
const CONTAINMENT_MANIFEST_VERSION = 3;
const RESOURCE_TYPES = [
  'darwin-supervisor',
  'linux-namespace',
  'oci-container',
  'process-group',
  'win32-job',
  'wsl-namespace',
];
const FINALITY_STATES = ['PROVEN', 'UNPROVEN', 'VIOLATED'];
const CONTAINMENT_TRANSITIONS = {
  creating: ['ready', 'prebirth-cleanup-claimed', 'retained'],
  ready: ['prepare-intent', 'prebirth-cleanup-claimed', 'retained'],
  'prepare-intent': ['resource-claimed', 'finality-hold', 'retained'],
  'resource-claimed': ['gate-released', 'finality-hold', 'retained'],
  'gate-released': ['running', 'finality-hold', 'retained'],
  running: ['completion-recorded', 'finality-hold', 'retained'],
  'completion-recorded': ['resource-released', 'finality-hold', 'retained'],
  'finality-hold': ['retained'],
  'resource-released': ['cleanup-claimed', 'retained'],
  'cleanup-claimed': [],
  'prebirth-cleanup-claimed': [],
  retained: [],
};
const BASE_IDENTITY_FIELDS = [
  'adapterId',
  'birthToken',
  'claimNonce',
  'preparedAt',
  'recoveryRef',
  'resourceId',
  'resourceType',
  'runNonce',
  'schemaVersion',
];
const TYPE_IDENTITY_FIELDS = {
  'darwin-supervisor': [
    'profileRef',
    'supervisorAttestationRef',
    'supervisorBirthToken',
    'supervisorPid',
  ],
  'linux-namespace': [
    'cgroupIdentity',
    'leaderBirthTicks',
    'leaderPid',
    'mountNamespaceInode',
    'pidNamespaceInode',
    'userNamespaceInode',
  ],
  'oci-container': [
    'containerId',
    'imageDigest',
    'labelNonce',
    'runtimeDigest',
    'runtimeKind',
  ],
  'process-group': [
    'leaderBirthTicks',
    'leaderPid',
    'processGroupId',
  ],
  'win32-job': [
    'appContainerSid',
    'helperAttestationRef',
    'helperCreationTime',
    'helperPid',
    'jobName',
    'tokenIdentity',
  ],
  'wsl-namespace': [
    'cgroupIdentity',
    'leaderBirthTicks',
    'leaderPid',
    'mountNamespaceInode',
    'pidNamespaceInode',
    'userNamespaceInode',
    'wslVersion',
  ],
};
const DIGEST_REF_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

const PREPARE_REFERENCE_FIELDS = [
  'authoritySecretRef',
  'controlPlaneRef',
  'dependencyProjectionRef',
  'executionIntentRef',
  'planRef',
  'policyRef',
  'runtimeProjectionRef',
  'sourceRef',
];
const AUTHORITY_BINDING_FIELDS = [
  'adapterId',
  'admissionRef',
  'boundaryClass',
  'claimNonce',
  'claimRef',
  'controlPlaneRef',
  'dependencyProjectionRef',
  'executionIntentRef',
  'policyRef',
  'resourceIdentityRef',
  'runtimeProjectionRef',
  'secretRef',
  'sourceRef',
];
const FINALITY_CAPABILITY_TOKEN = {};
const CLEANUP_LEASE_TOKEN = {};
const PREBIRTH_CLEANUP_LEASE_TOKEN = {};
const PRISTINE_OBJECT_FREEZE = Object.freeze;
const PRISTINE_OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const PRISTINE_REFLECT_APPLY = Reflect.apply;

class VerifiedFinalityCapability {
  #state;
  #binding;
  #claimedBinding;
  #lease;

  constructor(token, binding) {
    if (token !== FINALITY_CAPABILITY_TOKEN) {
      throw new Error('E_CI_SIM_CONTAINMENT_FINALITY_CAPABILITY_CONSTRUCTION');
    }
    this.#state = 'ACTIVE';
    this.#binding = structuredClone(binding);
    this.#claimedBinding = null;
    this.#lease = null;
  }

  operate(token, operation, input = {}) {
    if (token !== FINALITY_CAPABILITY_TOKEN) return false;
    if (operation === 'AUTHORIZE') {
      if (this.#state === 'ACTIVE') {
        return finalityBindingMatches(
          this.#binding,
          input.manifest,
          input.resourceClaim,
        );
      }
      if (this.#state === 'RESERVED') {
        return cleanupBindingMatches(
          this.#claimedBinding,
          input.manifest,
          input.resourceClaim,
        );
      }
      return false;
    }
    if (operation === 'BEGIN_RESERVATION') {
      if (this.#state !== 'ACTIVE'
        || !finalityBindingMatches(
          this.#binding,
          input.manifest,
          input.resourceClaim,
        )) {
        return false;
      }
      this.#state = 'RESERVING';
      return true;
    }
    if (operation === 'COMMIT_RESERVATION') {
      if (this.#state !== 'RESERVING'
        || !validCleanupClaim(input.manifest?.containment?.cleanupClaim)) {
        return false;
      }
      this.#claimedBinding = cleanupManifestBinding(
        input.manifest,
        input.resourceClaim,
      );
      this.#state = 'RESERVED';
      return true;
    }
    if (operation === 'ROLLBACK_RESERVATION') {
      if (this.#state !== 'RESERVING') return false;
      this.#state = 'ACTIVE';
      return true;
    }
    if (operation === 'BEGIN_ATTEMPT') {
      if (this.#state !== 'RESERVED'
        || this.#lease !== null
        || !cleanupBindingMatches(
          this.#claimedBinding,
          input.manifest,
          input.resourceClaim,
        )) {
        return null;
      }
      const lease = new VerifiedCleanupLease(
        CLEANUP_LEASE_TOKEN,
        this,
      );
      PRISTINE_REFLECT_APPLY(
        PRISTINE_OBJECT_FREEZE,
        undefined,
        [PRISTINE_REFLECT_APPLY(
          PRISTINE_OBJECT_GET_PROTOTYPE_OF,
          undefined,
          [lease],
        )],
      );
      PRISTINE_REFLECT_APPLY(PRISTINE_OBJECT_FREEZE, undefined, [lease]);
      this.#lease = lease;
      this.#state = 'IN_USE';
      return lease;
    }
    if (operation === 'VERIFY_ATTEMPT') {
      return this.#state === 'IN_USE'
        && this.#lease === input.lease
        && cleanupBindingMatches(
          this.#claimedBinding,
          input.manifest,
          input.resourceClaim,
        );
    }
    if (operation === 'RELEASE_ATTEMPT') {
      if (this.#state !== 'IN_USE' || this.#lease !== input.lease) return false;
      this.#lease = null;
      this.#state = 'RESERVED';
      return true;
    }
    if (operation === 'COMMIT_ATTEMPT') {
      if (this.#state !== 'IN_USE' || this.#lease !== input.lease) return false;
      this.#lease = null;
      this.#binding = null;
      this.#claimedBinding = null;
      this.#state = 'CONSUMED';
      return true;
    }
    return false;
  }

  toJSON() {
    return { kind: 'verified-finality-capability' };
  }
}

class VerifiedCleanupLease {
  #capability;

  constructor(token, capability) {
    if (token !== CLEANUP_LEASE_TOKEN) {
      throw new Error('E_CI_SIM_CONTAINMENT_CLEANUP_LEASE_CONSTRUCTION');
    }
    this.#capability = capability;
  }

  operate(token, operation, input = {}) {
    if (token !== CLEANUP_LEASE_TOKEN || this.#capability === null) return false;
    if (operation !== 'VERIFY_ATTEMPT'
      && operation !== 'RELEASE_ATTEMPT'
      && operation !== 'COMMIT_ATTEMPT') {
      return false;
    }
    const result = runFinalityCapabilityOperation(
      this.#capability,
      operation,
      {
        ...input,
        lease: this,
      },
    );
    if (operation === 'COMMIT_ATTEMPT' && result === true) {
      this.#capability = null;
    }
    return result;
  }

  toJSON() {
    return { kind: 'verified-cleanup-lease' };
  }
}

class VerifiedPrebirthCleanupLease {
  #binding;
  #state;

  constructor(token, binding) {
    if (token !== PREBIRTH_CLEANUP_LEASE_TOKEN) {
      throw new Error('E_CI_SIM_CONTAINMENT_PREBIRTH_CLEANUP_LEASE_CONSTRUCTION');
    }
    this.#binding = structuredClone(binding);
    this.#state = 'IN_USE';
  }

  operate(token, operation, input = {}) {
    if (token !== PREBIRTH_CLEANUP_LEASE_TOKEN
      || this.#state !== 'IN_USE') {
      return false;
    }
    if (operation === 'VERIFY_ATTEMPT') {
      return input.resourceClaim === null
        && prebirthCleanupBindingMatches(this.#binding, input.manifest);
    }
    if (operation === 'RELEASE_ATTEMPT') {
      this.#binding = null;
      this.#state = 'HELD';
      return true;
    }
    if (operation === 'COMMIT_ATTEMPT') {
      this.#binding = null;
      this.#state = 'CONSUMED';
      return true;
    }
    return false;
  }

  toJSON() {
    return { kind: 'verified-prebirth-cleanup-lease' };
  }
}

function runFinalityCapabilityOperation(capability, operation, input = {}) {
  try {
    return PRISTINE_REFLECT_APPLY(
      VerifiedFinalityCapability.prototype.operate,
      capability,
      [FINALITY_CAPABILITY_TOKEN, operation, input],
    );
  } catch {
    return false;
  }
}

function runCleanupLeaseOperation(cleanupLease, operation, input = {}) {
  try {
    const finalityResult = PRISTINE_REFLECT_APPLY(
      VerifiedCleanupLease.prototype.operate,
      cleanupLease,
      [CLEANUP_LEASE_TOKEN, operation, input],
    );
    if (finalityResult !== false) return finalityResult;
  } catch {
    // A differently branded lease is checked below.
  }
  try {
    return PRISTINE_REFLECT_APPLY(
      VerifiedPrebirthCleanupLease.prototype.operate,
      cleanupLease,
      [PREBIRTH_CLEANUP_LEASE_TOKEN, operation, input],
    );
  } catch {
    return false;
  }
}

function createVerifiedFinalityCapability(binding) {
  const capability = new VerifiedFinalityCapability(
    FINALITY_CAPABILITY_TOKEN,
    binding,
  );
  PRISTINE_REFLECT_APPLY(
    PRISTINE_OBJECT_FREEZE,
    undefined,
    [PRISTINE_REFLECT_APPLY(
      PRISTINE_OBJECT_GET_PROTOTYPE_OF,
      undefined,
      [capability],
    )],
  );
  PRISTINE_REFLECT_APPLY(PRISTINE_OBJECT_FREEZE, undefined, [capability]);
  return capability;
}

function finalityCapabilityMatches(capability, manifest, resourceClaim) {
  try {
    if ((typeof capability !== 'object' || capability === null)
      && typeof capability !== 'function') {
      return false;
    }
    return runFinalityCapabilityOperation(
      capability,
      'AUTHORIZE',
      { manifest, resourceClaim },
    );
  } catch {
    return false;
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function finalityBindingMatches(binding, manifest, resourceClaim) {
  if (!binding || !manifest || !resourceClaim) return false;
  const finality = manifest?.containment?.finality;
  return manifest?.runNonce === binding?.runNonce
    && manifest?.revision === binding.revision
    && sha256(canonicalJson(manifest)) === binding.manifestDigest
    && sha256(canonicalJson(resourceClaim)) === binding.resourceClaimDigest
    && resourceClaim?.identityDigest === binding.identityDigest
    && finality?.authorityReceiptRef === binding.authorityReceiptRef
    && finality?.authorityClaimRef === binding.authorityClaimRef
    && finality?.executionRef === binding.executionRef
    && finality?.completionRef === binding.completionRef
    && finality?.settlementRef === binding.settlementRef;
}

function cleanupClaimPayload(value) {
  return {
    schemaVersion: value.schemaVersion,
    runNonce: value.runNonce,
    fromRevision: value.fromRevision,
    toRevision: value.toRevision,
    resourceIdentityRef: value.resourceIdentityRef,
    authorityReceiptRef: value.authorityReceiptRef,
    manifestRef: value.manifestRef,
    resourceClaimRef: value.resourceClaimRef,
    claimedAt: value.claimedAt,
  };
}

function prebirthCleanupClaimPayload(value) {
  return {
    schemaVersion: value.schemaVersion,
    runNonce: value.runNonce,
    fromRevision: value.fromRevision,
    toRevision: value.toRevision,
    manifestRef: value.manifestRef,
    claimedAt: value.claimedAt,
  };
}

function validPrebirthCleanupClaim(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !exactKeys(value, [
      'claimRef',
      'claimedAt',
      'fromRevision',
      'manifestRef',
      'runNonce',
      'schemaVersion',
      'toRevision',
    ])
    || value.schemaVersion !== 1
    || !IDENTIFIER_PATTERN.test(value.runNonce ?? '')
    || !Number.isSafeInteger(value.fromRevision)
    || value.fromRevision < 0
    || value.toRevision !== value.fromRevision + 1
    || !validDigestRef(value.manifestRef)
    || !validDigestRef(value.claimRef)
    || !validIsoTimestamp(value.claimedAt)) {
    return false;
  }
  return value.claimRef
    === `sha256:${sha256(canonicalJson(prebirthCleanupClaimPayload(value)))}`;
}

function validCleanupClaim(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !exactKeys(value, [
      'authorityReceiptRef',
      'claimRef',
      'claimedAt',
      'fromRevision',
      'manifestRef',
      'resourceClaimRef',
      'resourceIdentityRef',
      'runNonce',
      'schemaVersion',
      'toRevision',
    ])
    || value.schemaVersion !== 1
    || !IDENTIFIER_PATTERN.test(value.runNonce ?? '')
    || !Number.isSafeInteger(value.fromRevision)
    || value.fromRevision < 0
    || value.toRevision !== value.fromRevision + 1
    || !validDigestRef(value.resourceIdentityRef)
    || !validDigestRef(value.authorityReceiptRef)
    || !validDigestRef(value.manifestRef)
    || !validDigestRef(value.resourceClaimRef)
    || !validDigestRef(value.claimRef)
    || !validIsoTimestamp(value.claimedAt)) {
    return false;
  }
  return value.claimRef
    === `sha256:${sha256(canonicalJson(cleanupClaimPayload(value)))}`;
}

function prebirthCleanupManifestBinding(manifest) {
  return {
    runNonce: manifest.runNonce,
    revision: manifest.revision,
    manifestDigest: sha256(canonicalJson(manifest)),
    cleanupClaimRef: manifest.containment.prebirthCleanupClaim.claimRef,
  };
}

function prebirthCleanupBindingMatches(binding, manifest) {
  return Boolean(binding && manifest
    && manifest.state === 'prebirth-cleanup-claimed'
    && validPrebirthCleanupClaim(
      manifest?.containment?.prebirthCleanupClaim,
    )
    && manifest.runNonce === binding.runNonce
    && manifest.revision === binding.revision
    && sha256(canonicalJson(manifest)) === binding.manifestDigest
    && manifest.containment.prebirthCleanupClaim.claimRef
      === binding.cleanupClaimRef);
}

function cleanupManifestBinding(manifest, resourceClaim) {
  return {
    runNonce: manifest.runNonce,
    revision: manifest.revision,
    manifestDigest: sha256(canonicalJson(manifest)),
    resourceClaimDigest: sha256(canonicalJson(resourceClaim)),
    cleanupClaimRef: manifest.containment.cleanupClaim.claimRef,
  };
}

function cleanupBindingMatches(binding, manifest, resourceClaim) {
  return Boolean(binding && manifest && resourceClaim
    && manifest.state === 'cleanup-claimed'
    && validCleanupClaim(manifest?.containment?.cleanupClaim)
    && manifest.runNonce === binding.runNonce
    && manifest.revision === binding.revision
    && sha256(canonicalJson(manifest)) === binding.manifestDigest
    && sha256(canonicalJson(resourceClaim)) === binding.resourceClaimDigest
    && manifest.containment.cleanupClaim.claimRef === binding.cleanupClaimRef);
}

function validBoundedString(value, maxLength = 512) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
    && !value.includes('\0');
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function validPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validDigitString(value) {
  return typeof value === 'string' && /^[1-9][0-9]{0,31}$/u.test(value);
}

function validDigestRef(value) {
  return typeof value === 'string' && DIGEST_REF_PATTERN.test(value);
}

function validIsoTimestamp(value) {
  return typeof value === 'string'
    && ISO_TIMESTAMP_PATTERN.test(value)
    && Number.isFinite(Date.parse(value));
}

function validateTypeSpecificIdentity(identity) {
  if (identity.resourceType === 'oci-container') {
    return /^[a-f0-9]{64}$/u.test(identity.containerId)
      && identity.resourceId === identity.containerId
      && validDigestRef(identity.imageDigest)
      && validDigestRef(identity.runtimeDigest)
      && identity.labelNonce === identity.claimNonce
      && ['docker', 'nerdctl', 'podman'].includes(identity.runtimeKind);
  }
  if (identity.resourceType === 'win32-job') {
    return validPositiveInteger(identity.helperPid)
      && validIsoTimestamp(identity.helperCreationTime)
      && validBoundedString(identity.jobName, 256)
      && identity.resourceId === identity.jobName
      && /^S-1-15-2(?:-[0-9]+)+$/u.test(identity.appContainerSid)
      && validBoundedString(identity.tokenIdentity, 256)
      && validDigestRef(identity.helperAttestationRef);
  }
  if (identity.resourceType === 'darwin-supervisor') {
    return validPositiveInteger(identity.supervisorPid)
      && validBoundedString(identity.supervisorBirthToken, 256)
      && identity.birthToken === identity.supervisorBirthToken
      && identity.resourceId
        === `${identity.supervisorPid}:${identity.supervisorBirthToken}`
      && validDigestRef(identity.profileRef)
      && validDigestRef(identity.supervisorAttestationRef);
  }
  const processIdentityValid = validPositiveInteger(identity.leaderPid)
    && validDigitString(identity.leaderBirthTicks)
    && identity.birthToken === identity.leaderBirthTicks;
  if (identity.resourceType === 'process-group') {
    return processIdentityValid
      && validPositiveInteger(identity.processGroupId)
      && identity.resourceId === String(identity.processGroupId);
  }
  const namespaceIdentityValid = processIdentityValid
    && validDigitString(identity.pidNamespaceInode)
    && validDigitString(identity.mountNamespaceInode)
    && validDigitString(identity.userNamespaceInode)
    && validBoundedString(identity.cgroupIdentity, 512)
    && identity.resourceId === identity.cgroupIdentity;
  if (identity.resourceType === 'wsl-namespace') {
    return namespaceIdentityValid && identity.wslVersion === 2;
  }
  return namespaceIdentityValid;
}

export function containmentResourceIdentityDigest(identity) {
  return sha256(canonicalJson(validateContainmentResourceIdentity(identity)));
}

export function validateContainmentResourceIdentity(identity) {
  const typeFields = identity && typeof identity === 'object'
    ? TYPE_IDENTITY_FIELDS[identity.resourceType]
    : null;
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)
    || identity.schemaVersion !== 1
    || !typeFields
    || !exactKeys(identity, [...BASE_IDENTITY_FIELDS, ...typeFields])
    || !IDENTIFIER_PATTERN.test(identity.adapterId ?? '')
    || !validBoundedString(identity.resourceId)
    || !validBoundedString(identity.birthToken)
    || !/^[a-f0-9]{64}$/u.test(identity.claimNonce ?? '')
    || !validIsoTimestamp(identity.preparedAt)
    || !validDigestRef(identity.recoveryRef)
    || !IDENTIFIER_PATTERN.test(identity.runNonce ?? '')
    || !validateTypeSpecificIdentity(identity)) {
    throw new Error('E_CI_SIM_CONTAINMENT_RESOURCE_IDENTITY_INVALID');
  }
  return structuredClone(identity);
}

function validPrepareIntent(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && exactKeys(value, [
      'adapterId',
      'claimNonce',
      'recordedAt',
      'recoveryRef',
      'resourceType',
      ...PREPARE_REFERENCE_FIELDS,
    ])
    && IDENTIFIER_PATTERN.test(value.adapterId ?? '')
    && RESOURCE_TYPES.includes(value.resourceType)
    && /^[a-f0-9]{64}$/u.test(value.claimNonce ?? '')
    && validDigestRef(value.recoveryRef)
    && PREPARE_REFERENCE_FIELDS.every(field => validDigestRef(value[field]))
    && validIsoTimestamp(value.recordedAt);
}

function validAuthorityBinding(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && exactKeys(value, AUTHORITY_BINDING_FIELDS)
    && IDENTIFIER_PATTERN.test(value.adapterId ?? '')
    && ['kernel', 'virtualized-kernel'].includes(value.boundaryClass)
    && /^[a-f0-9]{64}$/u.test(value.claimNonce ?? '')
    && AUTHORITY_BINDING_FIELDS
      .filter(field => !['adapterId', 'boundaryClass', 'claimNonce'].includes(field))
      .every(field => validDigestRef(value[field]));
}

function authorityReceiptMatchesBinding(receipt, binding) {
  return validAuthorityBinding(binding)
    && receipt?.adapterId === binding.adapterId
    && receipt?.boundaryClass === binding.boundaryClass
    && receipt?.claimRef === binding.claimRef
    && receipt?.secretRef === binding.secretRef
    && receipt?.policyRef === binding.policyRef
    && receipt?.controlPlaneRef === binding.controlPlaneRef
    && receipt?.sourceRef === binding.sourceRef
    && receipt?.dependencyProjectionRef === binding.dependencyProjectionRef
    && receipt?.runtimeProjectionRef === binding.runtimeProjectionRef
    && receipt?.resourceIdentityRef === binding.resourceIdentityRef
    && receipt?.admissionRef === binding.admissionRef
    && receipt?.executionIntentRef === binding.executionIntentRef;
}

function validateContainmentState(value) {
  if (!value || typeof value !== 'object' || value.mode !== 'enforce'
    || typeof value.candidateBirthAuthorized !== 'boolean'
    || typeof value.resourceReleased !== 'boolean'
    || !value.finality || !FINALITY_STATES.includes(value.finality.status)
    || (value.prepareIntent !== null && !validPrepareIntent(value.prepareIntent))
    || (value.authorityBinding !== undefined
      && !validAuthorityBinding(value.authorityBinding))
    || (value.cleanupClaim !== undefined
      && !validCleanupClaim(value.cleanupClaim))
    || (value.prebirthCleanupClaim !== undefined
      && !validPrebirthCleanupClaim(value.prebirthCleanupClaim))
    || (value.candidateBirthAuthorized && !validAuthorityBinding(value.authorityBinding))) {
    throw new Error('E_CI_SIM_STALE_HOLD:INVALID_CONTAINMENT_STATE');
  }
  if (value.resourceClaimDigest !== undefined
    && !/^[a-f0-9]{64}$/u.test(value.resourceClaimDigest)) {
    throw new Error('E_CI_SIM_STALE_HOLD:INVALID_RESOURCE_CLAIM_DIGEST');
  }
  return value;
}

function validateContainmentManifestInvariants(value) {
  const containment = value.containment;
  const hasPrepare = validPrepareIntent(containment.prepareIntent);
  const hasResource = /^[a-f0-9]{64}$/u.test(containment.resourceClaimDigest ?? '')
    && validDigestRef(containment.resourceIdentityRef);
  const hasAuthority = validAuthorityBinding(containment.authorityBinding);
  const hasCleanupClaim = validCleanupClaim(containment.cleanupClaim);
  const hasPrebirthCleanupClaim = validPrebirthCleanupClaim(
    containment.prebirthCleanupClaim,
  );
  const pristine = !hasPrepare
    && !hasResource
    && !hasAuthority
    && containment.cleanupClaim === undefined
    && containment.prebirthCleanupClaim === undefined
    && containment.candidateBirthAuthorized === false
    && containment.resourceReleased === false
    && containment.finality.status === 'UNPROVEN';
  if (['creating', 'ready'].includes(value.state) && !pristine) return false;
  if (value.state === 'prepare-intent'
    && (!hasPrepare || hasResource || hasAuthority || hasCleanupClaim
      || hasPrebirthCleanupClaim
      || containment.candidateBirthAuthorized || containment.resourceReleased)) {
    return false;
  }
  if (value.state === 'resource-claimed'
    && (!hasPrepare || !hasResource || hasAuthority || hasCleanupClaim
      || hasPrebirthCleanupClaim
      || containment.candidateBirthAuthorized || containment.resourceReleased)) {
    return false;
  }
  if (['gate-released', 'running', 'completion-recorded'].includes(value.state)
    && (!hasPrepare || !hasResource || !hasAuthority
      || hasCleanupClaim
      || hasPrebirthCleanupClaim
      || !containment.candidateBirthAuthorized || containment.resourceReleased)) {
    return false;
  }
  if (value.state === 'finality-hold'
    && (!hasPrepare || containment.resourceReleased
      || hasCleanupClaim
      || hasPrebirthCleanupClaim
      || containment.finality.status === 'PROVEN')) {
    return false;
  }
  if (value.state === 'resource-released'
    && (!hasPrepare || !hasResource || !hasAuthority
      || hasCleanupClaim
      || hasPrebirthCleanupClaim
      || !containment.candidateBirthAuthorized
      || !containment.resourceReleased
      || containment.finality.status !== 'PROVEN')) {
    return false;
  }
  if (value.state === 'cleanup-claimed'
    && (!hasPrepare || !hasResource || !hasAuthority || !hasCleanupClaim
      || hasPrebirthCleanupClaim
      || !containment.candidateBirthAuthorized
      || !containment.resourceReleased
      || containment.finality.status !== 'PROVEN'
      || containment.cleanupClaim.runNonce !== value.runNonce
      || containment.cleanupClaim.fromRevision !== value.revision - 1
      || containment.cleanupClaim.toRevision !== value.revision
      || containment.cleanupClaim.resourceIdentityRef
        !== containment.resourceIdentityRef
      || containment.cleanupClaim.authorityReceiptRef
        !== containment.finality.authorityReceiptRef)) {
    return false;
  }
  if (value.state === 'prebirth-cleanup-claimed'
    && (hasPrepare || hasResource || hasAuthority || hasCleanupClaim
      || !hasPrebirthCleanupClaim
      || containment.candidateBirthAuthorized
      || containment.resourceReleased
      || containment.finality.status !== 'UNPROVEN'
      || containment.prebirthCleanupClaim.runNonce !== value.runNonce
      || containment.prebirthCleanupClaim.fromRevision !== value.revision - 1
      || containment.prebirthCleanupClaim.toRevision !== value.revision)) {
    return false;
  }
  return true;
}

export async function readCiManifest(path) {
  let value;
  try { value = JSON.parse(await readFile(path, 'utf8')); } catch {
    throw new Error(`E_CI_SIM_STALE_HOLD:MALFORMED_MANIFEST:${path}`);
  }
  if (![LEGACY_MANIFEST_VERSION, CONTAINMENT_MANIFEST_VERSION].includes(value?.schemaVersion)
    || typeof value.runNonce !== 'string'
    || typeof value.rootDir !== 'string' || typeof value.workspaceDir !== 'string'
    || !Number.isInteger(value.ownerPid) || value.ownerPid <= 0
    || (value.childPid !== undefined && (!Number.isInteger(value.childPid) || value.childPid <= 0))
    || typeof value.state !== 'string') {
    throw new Error(`E_CI_SIM_STALE_HOLD:INVALID_MANIFEST:${path}`);
  }
  if (value.schemaVersion === CONTAINMENT_MANIFEST_VERSION) {
    if (!Number.isSafeInteger(value.revision) || value.revision < 0
      || !Object.hasOwn(CONTAINMENT_TRANSITIONS, value.state)) {
      throw new Error(`E_CI_SIM_STALE_HOLD:INVALID_MANIFEST:${path}`);
    }
    validateContainmentState(value.containment);
    if (!validateContainmentManifestInvariants(value)) {
      throw new Error(`E_CI_SIM_STALE_HOLD:INVALID_CONTAINMENT_INVARIANT:${path}`);
    }
  }
  return value;
}

export async function createCiManifest(workspace) {
  const containment = workspace.containmentMode === 'enforce'
    ? {
        mode: 'enforce',
        candidateBirthAuthorized: false,
        resourceReleased: false,
        prepareIntent: null,
        finality: { status: 'UNPROVEN' },
      }
    : undefined;
  await atomicJson(workspace.manifestPath, {
    schemaVersion: containment
      ? CONTAINMENT_MANIFEST_VERSION
      : LEGACY_MANIFEST_VERSION,
    runNonce: workspace.runNonce,
    rootDir: workspace.rootDir,
    workspaceDir: workspace.workspaceDir,
    ownerPid: process.pid,
    state: 'creating',
    createdAt: new Date().toISOString(),
    ...(containment ? { revision: 0 } : {}),
    ...(containment ? { containment } : {}),
  });
}

function immutableManifestIdentityMatches(current, next) {
  return current.schemaVersion === next.schemaVersion
    && current.runNonce === next.runNonce
    && resolve(current.rootDir) === resolve(next.rootDir)
    && resolve(current.workspaceDir) === resolve(next.workspaceDir)
    && current.ownerPid === next.ownerPid
    && current.createdAt === next.createdAt;
}

async function updateCiManifest(workspace, mutate) {
  const lockPath = `${workspace.manifestPath}.update-lock`;
  let lock;
  try {
    try {
      lock = await open(lockPath, 'wx', 0o600);
      await lock.writeFile(`${JSON.stringify({
        runNonce: workspace.runNonce,
        ownerPid: process.pid,
        acquiredAt: new Date().toISOString(),
      })}\n`);
      await lock.sync();
      await syncCreatedFile(lockPath);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error('E_CI_SIM_CONTAINMENT_MANIFEST_UPDATE_CONFLICT');
      }
      throw error;
    }
    const current = await readCiManifest(workspace.manifestPath);
    if (current.runNonce !== workspace.runNonce
      || resolve(current.rootDir) !== resolve(workspace.rootDir)
      || resolve(current.workspaceDir) !== resolve(workspace.workspaceDir)) {
      throw new Error('E_CI_SIM_MANIFEST_SCOPE_MISMATCH');
    }
    const next = mutate(structuredClone(current));
    if (!next || typeof next !== 'object'
      || !immutableManifestIdentityMatches(current, next)) {
      throw new Error('E_CI_SIM_CONTAINMENT_MANIFEST_IDENTITY_MUTATION');
    }
    if (current.schemaVersion === CONTAINMENT_MANIFEST_VERSION) {
      const allowed = CONTAINMENT_TRANSITIONS[current.state] ?? [];
      if (!allowed.includes(next.state)) {
        throw new Error('E_CI_SIM_CONTAINMENT_STATE_TRANSITION_INVALID');
      }
      next.revision = current.revision + 1;
      validateContainmentState(next.containment);
      if (!validateContainmentManifestInvariants(next)) {
        throw new Error('E_CI_SIM_CONTAINMENT_MANIFEST_INVARIANT_INVALID');
      }
    }
    await atomicJson(workspace.manifestPath, next);
    return next;
  } finally {
    await lock?.close().catch(() => undefined);
    if (lock) await rm(lockPath, { force: true });
  }
}

export async function markCiWorkspaceReady(workspace, provenance) {
  return updateCiManifest(workspace, current => {
    if (current.state !== 'creating') {
      throw new Error('E_CI_SIM_MANIFEST_READY_STATE_INVALID');
    }
    return {
      ...current,
      state: 'ready',
      snapshotRef: provenance.snapshotRef,
      receipt: provenance.receipt,
      preview: provenance.preview,
    };
  });
}

export async function retainCiWorkspace(workspace) {
  return updateCiManifest(workspace, current => ({
    ...current,
    retained: true,
    state: 'retained',
  }));
}

export async function recordCiLegacyChild(workspace, childPid) {
  return updateCiManifest(workspace, current => {
    if (current.schemaVersion !== LEGACY_MANIFEST_VERSION
      || (current.childPid !== undefined && current.childPid !== childPid)
      || !['ready', 'child-recorded'].includes(current.state)) {
      throw new Error('E_CI_SIM_MANIFEST_CHILD_STATE_INVALID');
    }
    return { ...current, childPid, state: 'child-recorded' };
  });
}

export async function claimCiChild(workspace, childPid) {
  if (!Number.isInteger(childPid) || childPid <= 0) {
    throw new Error('E_CI_SIM_MANIFEST_CHILD_PID_INVALID');
  }
  const claimPath = `${workspace.manifestPath}.child-claim`;
  try {
    const handle = await open(claimPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify({ runNonce: workspace.runNonce, childPid })}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncCreatedFile(claimPath);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let claim;
    try { claim = JSON.parse(await readFile(claimPath, 'utf8')); } catch {
      throw new Error('E_CI_SIM_MANIFEST_CHILD_CLAIM_HOLD');
    }
    if (claim.runNonce !== workspace.runNonce || claim.childPid !== childPid) {
      throw new Error('E_CI_SIM_MANIFEST_CHILD_CONFLICT');
    }
  }
}

export async function readCiChildClaim(manifestPath) {
  const claimPath = `${manifestPath}.child-claim`;
  let raw;
  try { raw = await readFile(claimPath, 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  let claim;
  try { claim = JSON.parse(raw); } catch { throw new Error('E_CI_SIM_MANIFEST_CHILD_CLAIM_HOLD'); }
  if (typeof claim.runNonce !== 'string' || !Number.isInteger(claim.childPid)
    || claim.childPid <= 0) {
    throw new Error('E_CI_SIM_MANIFEST_CHILD_CLAIM_HOLD');
  }
  return claim;
}

export async function recordCiContainmentPrepareIntent(workspace, intent, authoritySession) {
  const session = inspectContainmentAuthoritySession(authoritySession);
  if (!intent || typeof intent !== 'object'
    || Array.isArray(intent)
    || !exactKeys(intent, [
      'adapterId',
      'claimNonce',
      'recoveryRef',
      'resourceType',
      ...PREPARE_REFERENCE_FIELDS.filter(field => field !== 'authoritySecretRef'),
    ])
    || !IDENTIFIER_PATTERN.test(intent.adapterId ?? '')
    || !RESOURCE_TYPES.includes(intent.resourceType)
    || !/^[a-f0-9]{64}$/u.test(intent.claimNonce ?? '')
    || !validDigestRef(intent.recoveryRef)
    || PREPARE_REFERENCE_FIELDS
      .filter(field => field !== 'authoritySecretRef')
      .some(field => !validDigestRef(intent[field]))
    || !session?.ok
    || !validDigestRef(session.value.secretRef)) {
    throw new Error('E_CI_SIM_CONTAINMENT_PREPARE_INTENT_INVALID');
  }
  return updateCiManifest(workspace, current => {
    if (current.schemaVersion !== CONTAINMENT_MANIFEST_VERSION
      || current.state !== 'ready'
      || current.containment.prepareIntent !== null
      || current.containment.candidateBirthAuthorized) {
      throw new Error('E_CI_SIM_CONTAINMENT_PREPARE_STATE_INVALID');
    }
    return {
      ...current,
      state: 'prepare-intent',
      containment: {
        ...current.containment,
        prepareIntent: {
          adapterId: intent.adapterId,
          resourceType: intent.resourceType,
          claimNonce: intent.claimNonce,
          authoritySecretRef: session.value.secretRef,
          planRef: intent.planRef,
          recoveryRef: intent.recoveryRef,
          policyRef: intent.policyRef,
          controlPlaneRef: intent.controlPlaneRef,
          sourceRef: intent.sourceRef,
          dependencyProjectionRef: intent.dependencyProjectionRef,
          runtimeProjectionRef: intent.runtimeProjectionRef,
          executionIntentRef: intent.executionIntentRef,
          recordedAt: new Date().toISOString(),
        },
      },
    };
  });
}

export async function claimCiContainmentResource(workspace, identity) {
  const normalizedIdentity = validateContainmentResourceIdentity(identity);
  if (normalizedIdentity.runNonce !== workspace.runNonce) {
    throw new Error('E_CI_SIM_CONTAINMENT_RESOURCE_RUN_MISMATCH');
  }
  const identityDigest = containmentResourceIdentityDigest(normalizedIdentity);
  const current = await readCiManifest(workspace.manifestPath);
  if (current.schemaVersion !== CONTAINMENT_MANIFEST_VERSION
    || current.containment.mode !== 'enforce') {
    throw new Error('E_CI_SIM_CONTAINMENT_MANIFEST_REQUIRED');
  }
  if (current.containment.resourceClaimDigest === identityDigest) {
    const replay = await readCiContainmentResourceClaim(workspace.manifestPath);
    if (replay?.runNonce === workspace.runNonce
      && replay.identityDigest === identityDigest
      && canonicalJson(replay.identity) === canonicalJson(normalizedIdentity)) {
      return replay;
    }
    throw new Error('E_CI_SIM_CONTAINMENT_RESOURCE_CLAIM_CONFLICT');
  }
  const intent = current.containment.prepareIntent;
  if (current.state !== 'prepare-intent'
    || current.containment.candidateBirthAuthorized
    || !intent
    || intent.adapterId !== normalizedIdentity.adapterId
    || intent.resourceType !== normalizedIdentity.resourceType
    || intent.claimNonce !== normalizedIdentity.claimNonce
    || intent.recoveryRef !== normalizedIdentity.recoveryRef) {
    throw new Error('E_CI_SIM_CONTAINMENT_RESOURCE_CLAIM_LATE');
  }
  const claimPath = `${workspace.manifestPath}.resource-claim`;
  const claim = {
    schemaVersion: 1,
    runNonce: workspace.runNonce,
    identity: normalizedIdentity,
    identityDigest,
    claimedAt: new Date().toISOString(),
  };
  let persistedClaim = claim;
  try {
    const handle = await open(claimPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(claim)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncCreatedFile(claimPath);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readCiContainmentResourceClaim(workspace.manifestPath);
    if (!existing || existing.runNonce !== workspace.runNonce
      || existing.identityDigest !== identityDigest
      || canonicalJson(existing.identity) !== canonicalJson(normalizedIdentity)) {
      throw new Error('E_CI_SIM_CONTAINMENT_RESOURCE_CLAIM_CONFLICT');
    }
    persistedClaim = existing;
  }
  const afterClaim = await readCiManifest(workspace.manifestPath);
  if (afterClaim.containment.resourceClaimDigest === identityDigest) {
    return persistedClaim;
  }
  await updateCiManifest(workspace, manifest => {
    if (manifest.state !== 'prepare-intent'
      || manifest.containment.prepareIntent?.claimNonce !== normalizedIdentity.claimNonce) {
      throw new Error('E_CI_SIM_CONTAINMENT_RESOURCE_CLAIM_STATE_INVALID');
    }
    return {
      ...manifest,
      state: 'resource-claimed',
      containment: {
        ...manifest.containment,
        adapterId: normalizedIdentity.adapterId,
        resourceType: normalizedIdentity.resourceType,
        resourceClaimDigest: identityDigest,
        resourceIdentityRef: `sha256:${identityDigest}`,
        finality: { status: 'UNPROVEN' },
      },
    };
  });
  return persistedClaim;
}

export async function readCiContainmentResourceClaim(manifestPath) {
  const claimPath = `${manifestPath}.resource-claim`;
  let raw;
  try { raw = await readFile(claimPath, 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  let claim;
  try { claim = JSON.parse(raw); } catch {
    throw new Error('E_CI_SIM_STALE_HOLD:MALFORMED_RESOURCE_CLAIM');
  }
  if (claim?.schemaVersion !== 1 || !validBoundedString(claim.runNonce, 256)
    || !/^[a-f0-9]{64}$/u.test(claim.identityDigest)
    || containmentResourceIdentityDigest(claim.identity) !== claim.identityDigest
    || claim.identity.runNonce !== claim.runNonce
    || !validIsoTimestamp(claim.claimedAt)) {
    throw new Error('E_CI_SIM_STALE_HOLD:INVALID_RESOURCE_CLAIM');
  }
  return claim;
}

export async function authorizeCiCandidateBirth(workspace, evidence) {
  if (!evidence || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || !exactKeys(evidence, ['authorityClaim', 'authoritySession', 'identityDigest'])
    || !/^[a-f0-9]{64}$/u.test(evidence.identityDigest ?? '')) {
    throw new Error('E_CI_SIM_CONTAINMENT_GATE_IDENTITY_INVALID');
  }
  const claim = await readCiContainmentResourceClaim(workspace.manifestPath);
  if (!claim || claim.runNonce !== workspace.runNonce
    || claim.identityDigest !== evidence.identityDigest) {
    throw new Error('E_CI_SIM_CONTAINMENT_GATE_CLAIM_MISMATCH');
  }
  const authorityVerification = verifyContainmentAuthorityClaimWithSession({
    session: evidence.authoritySession,
    claim: evidence.authorityClaim,
  });
  if (!authorityVerification?.ok) {
    throw new Error('E_CI_SIM_CONTAINMENT_GATE_AUTHORITY_CLAIM_INVALID');
  }
  const authorityClaim = authorityVerification.value;
  return updateCiManifest(workspace, current => {
    const intent = current.containment.prepareIntent;
    const resourceIdentityRef = `sha256:${evidence.identityDigest}`;
    if (current.schemaVersion !== CONTAINMENT_MANIFEST_VERSION
      || current.state !== 'resource-claimed'
      || current.containment.candidateBirthAuthorized
      || current.containment.resourceClaimDigest !== evidence.identityDigest
      || current.containment.resourceIdentityRef !== resourceIdentityRef
      || current.containment.finality.status !== 'UNPROVEN'
      || !intent
      || authorityClaim.runNonce !== workspace.runNonce
      || authorityClaim.adapterId !== claim.identity.adapterId
      || authorityClaim.claimNonce !== claim.identity.claimNonce
      || authorityClaim.resourceIdentityRef !== resourceIdentityRef
      || authorityClaim.secretRef !== intent.authoritySecretRef
      || authorityClaim.policyRef !== intent.policyRef
      || authorityClaim.controlPlaneRef !== intent.controlPlaneRef
      || authorityClaim.sourceRef !== intent.sourceRef
      || authorityClaim.dependencyProjectionRef !== intent.dependencyProjectionRef
      || authorityClaim.runtimeProjectionRef !== intent.runtimeProjectionRef
      || authorityClaim.executionIntentRef !== intent.executionIntentRef) {
      throw new Error('E_CI_SIM_CONTAINMENT_GATE_STATE_INVALID');
    }
    return {
      ...current,
      state: 'gate-released',
      containment: {
        ...current.containment,
        candidateBirthAuthorized: true,
        gateReleasedAt: new Date().toISOString(),
        authorityBinding: {
          adapterId: authorityClaim.adapterId,
          admissionRef: authorityClaim.admissionRef,
          boundaryClass: authorityClaim.boundaryClass,
          claimNonce: authorityClaim.claimNonce,
          claimRef: authorityClaim.claimRef,
          controlPlaneRef: authorityClaim.controlPlaneRef,
          dependencyProjectionRef: authorityClaim.dependencyProjectionRef,
          executionIntentRef: authorityClaim.executionIntentRef,
          policyRef: authorityClaim.policyRef,
          resourceIdentityRef: authorityClaim.resourceIdentityRef,
          runtimeProjectionRef: authorityClaim.runtimeProjectionRef,
          secretRef: authorityClaim.secretRef,
          sourceRef: authorityClaim.sourceRef,
        },
      },
    };
  });
}

export async function recordCiContainmentRunning(workspace, evidence) {
  if (!evidence || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || !exactKeys(evidence, ['birthObserved', 'executionIntentRef', 'identityDigest'])
    || !/^[a-f0-9]{64}$/u.test(evidence.identityDigest ?? '')
    || !validDigestRef(evidence.executionIntentRef)
    || evidence.birthObserved !== true) {
    throw new Error('E_CI_SIM_CONTAINMENT_RUNNING_EVIDENCE_INVALID');
  }
  return updateCiManifest(workspace, current => {
    if (current.schemaVersion !== CONTAINMENT_MANIFEST_VERSION
      || current.state !== 'gate-released'
      || current.containment.candidateBirthAuthorized !== true
      || current.containment.resourceClaimDigest !== evidence.identityDigest
      || current.containment.authorityBinding?.executionIntentRef
        !== evidence.executionIntentRef) {
      throw new Error('E_CI_SIM_CONTAINMENT_RUNNING_STATE_INVALID');
    }
    return {
      ...current,
      state: 'running',
      containment: {
        ...current.containment,
        executionIntentRef: evidence.executionIntentRef,
        candidateBirthObservedAt: new Date().toISOString(),
      },
    };
  });
}

export async function recordCiContainmentCompletion(workspace, evidence) {
  if (!evidence || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || !exactKeys(evidence, [
      'completionRef',
      'executionIntentRef',
      'executionRef',
      'hostOwned',
      'identityDigest',
    ])
    || !/^[a-f0-9]{64}$/u.test(evidence.identityDigest ?? '')
    || !validDigestRef(evidence.executionIntentRef)
    || !validDigestRef(evidence.executionRef)
    || !validDigestRef(evidence.completionRef)
    || evidence.hostOwned !== true) {
    throw new Error('E_CI_SIM_CONTAINMENT_COMPLETION_EVIDENCE_INVALID');
  }
  return updateCiManifest(workspace, current => {
    if (current.schemaVersion !== CONTAINMENT_MANIFEST_VERSION
      || current.state !== 'running'
      || current.containment.resourceClaimDigest !== evidence.identityDigest
      || current.containment.executionIntentRef !== evidence.executionIntentRef
      || current.containment.authorityBinding?.executionIntentRef
        !== evidence.executionIntentRef) {
      throw new Error('E_CI_SIM_CONTAINMENT_COMPLETION_STATE_INVALID');
    }
    return {
      ...current,
      state: 'completion-recorded',
      containment: {
        ...current.containment,
        executionRef: evidence.executionRef,
        completionRef: evidence.completionRef,
        completionOwner: 'host-authority',
        completionRecordedAt: new Date().toISOString(),
      },
    };
  });
}

export async function recordCiContainmentFinality(workspace, evidence) {
  const expectedFinalityFields = evidence?.status === 'PROVEN'
    ? [
        'authorityReceipt',
        'authoritySession',
        'identityDigest',
        'releaseRef',
        'resourceReleased',
        'status',
      ]
    : ['identityDigest', 'status'];
  if (!evidence || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || !exactKeys(evidence, expectedFinalityFields)
    || !FINALITY_STATES.includes(evidence.status)
    || !/^[a-f0-9]{64}$/u.test(evidence.identityDigest ?? '')) {
    throw new Error('E_CI_SIM_CONTAINMENT_FINALITY_INVALID');
  }
  const claim = await readCiContainmentResourceClaim(workspace.manifestPath);
  if (!claim || claim.runNonce !== workspace.runNonce
    || claim.identityDigest !== evidence.identityDigest) {
    throw new Error('E_CI_SIM_CONTAINMENT_FINALITY_IDENTITY_MISMATCH');
  }
  if (evidence.status !== 'PROVEN') {
    const manifest = await updateCiManifest(workspace, current => {
      if (current.schemaVersion !== CONTAINMENT_MANIFEST_VERSION
        || current.containment.resourceClaimDigest !== evidence.identityDigest
        || ['resource-released', 'retained'].includes(current.state)) {
        throw new Error('E_CI_SIM_CONTAINMENT_FINALITY_STATE_INVALID');
      }
      return {
        ...current,
        state: 'finality-hold',
        containment: {
          ...current.containment,
          finality: {
            status: evidence.status,
            identityDigest: evidence.identityDigest,
            authenticated: false,
            terminationVerified: false,
            adapterIdentityVerified: false,
            resourceReleased: false,
            recordedAt: new Date().toISOString(),
          },
        },
      };
    });
    return { manifest, cleanupAuthority: null };
  }
  const receiptVerification = verifyContainmentAuthorityReceiptWithSession({
    session: evidence.authoritySession,
    receipt: evidence.authorityReceipt,
  });
  if (!receiptVerification?.ok) {
    throw new Error('E_CI_SIM_CONTAINMENT_FINALITY_RECEIPT_INVALID');
  }
  const receipt = receiptVerification.value;
  const resourceIdentityRef = `sha256:${evidence.identityDigest}`;
  const beforeFinality = await readCiManifest(workspace.manifestPath);
  const binding = beforeFinality.containment?.authorityBinding;
  if (receipt.runNonce !== workspace.runNonce
    || receipt.adapterId !== claim.identity.adapterId
    || receipt.resourceIdentityRef !== resourceIdentityRef
    || !authorityReceiptMatchesBinding(receipt, binding)
    || receipt.executionRef !== beforeFinality.containment.executionRef
    || receipt.completionRef !== beforeFinality.containment.completionRef
    || receipt.proofEligible !== true
    || receipt.reasonCode !== 'NONE'
    || !validDigestRef(receipt.executionRef)
    || !validDigestRef(receipt.completionRef)
    || !validDigestRef(receipt.settlementRef)
    || evidence.resourceReleased !== true
    || evidence.releaseRef !== receipt.settlementRef) {
    throw new Error('E_CI_SIM_CONTAINMENT_FINALITY_RECEIPT_BINDING_INVALID');
  }
  const manifest = await updateCiManifest(workspace, current => {
    if (current.schemaVersion !== CONTAINMENT_MANIFEST_VERSION
      || current.state !== 'completion-recorded'
      || current.containment.resourceClaimDigest !== evidence.identityDigest
      || current.containment.resourceIdentityRef !== resourceIdentityRef
      || current.containment.executionRef !== receipt.executionRef
      || current.containment.completionRef !== receipt.completionRef
      || !authorityReceiptMatchesBinding(
        receipt,
        current.containment.authorityBinding,
      )
      || current.containment.resourceReleased) {
      throw new Error('E_CI_SIM_CONTAINMENT_FINALITY_STATE_INVALID');
    }
    return {
      ...current,
      state: 'resource-released',
      containment: {
        ...current.containment,
        resourceReleased: true,
        finality: {
          status: 'PROVEN',
          identityDigest: evidence.identityDigest,
          resourceIdentityRef,
          authenticated: true,
          terminationVerified: true,
          adapterIdentityVerified: true,
          resourceReleased: true,
          authorityReceiptRef: receipt.receiptRef,
          authorityClaimRef: receipt.claimRef,
          proofRef: receipt.proofRef,
          executionIntentRef: receipt.executionIntentRef,
          executionRef: receipt.executionRef,
          completionRef: receipt.completionRef,
          settlementRef: receipt.settlementRef,
          recordedAt: new Date().toISOString(),
        },
      },
    };
  });
  return {
    manifest,
    cleanupAuthority: createVerifiedFinalityCapability({
      runNonce: manifest.runNonce,
      revision: manifest.revision,
      manifestDigest: sha256(canonicalJson(manifest)),
      resourceClaimDigest: sha256(canonicalJson(claim)),
      identityDigest: evidence.identityDigest,
      authorityReceiptRef: receipt.receiptRef,
      authorityClaimRef: receipt.claimRef,
      executionRef: receipt.executionRef,
      completionRef: receipt.completionRef,
      settlementRef: receipt.settlementRef,
    }),
  };
}

function createCleanupClaim(manifest, resourceClaim) {
  const payload = {
    schemaVersion: 1,
    runNonce: manifest.runNonce,
    fromRevision: manifest.revision,
    toRevision: manifest.revision + 1,
    resourceIdentityRef: manifest.containment.resourceIdentityRef,
    authorityReceiptRef: manifest.containment.finality.authorityReceiptRef,
    manifestRef: `sha256:${sha256(canonicalJson(manifest))}`,
    resourceClaimRef: `sha256:${sha256(canonicalJson(resourceClaim))}`,
    claimedAt: new Date().toISOString(),
  };
  return {
    ...payload,
    claimRef: `sha256:${sha256(canonicalJson(payload))}`,
  };
}

function createPrebirthCleanupClaim(manifest) {
  const payload = {
    schemaVersion: 1,
    runNonce: manifest.runNonce,
    fromRevision: manifest.revision,
    toRevision: manifest.revision + 1,
    manifestRef: `sha256:${sha256(canonicalJson(manifest))}`,
    claimedAt: new Date().toISOString(),
  };
  return {
    ...payload,
    claimRef: `sha256:${sha256(canonicalJson(payload))}`,
  };
}

export async function claimCiPrebirthWorkspaceCleanup(workspace) {
  const current = await readCiManifest(workspace.manifestPath);
  const resourceClaim = await readCiContainmentResourceClaim(
    workspace.manifestPath,
  );
  const disposition = ciManifestCleanupDisposition(current, resourceClaim);
  if (disposition.decision !== 'DISPOSE'
    || disposition.code !== 'E_CI_SIM_CONTAINMENT_PRE_BIRTH_DISPOSABLE') {
    throw new Error(disposition.code);
  }
  const originalDigest = sha256(canonicalJson(current));
  const prebirthCleanupClaim = createPrebirthCleanupClaim(current);
  const claimed = await updateCiManifest(workspace, manifest => {
    if (!['creating', 'ready'].includes(manifest.state)
      || manifest.revision !== current.revision
      || sha256(canonicalJson(manifest)) !== originalDigest) {
      throw new Error('E_CI_SIM_CLEANUP_HOLD:PREBIRTH_MANIFEST_CAS_CONFLICT');
    }
    return {
      ...manifest,
      state: 'prebirth-cleanup-claimed',
      containment: {
        ...manifest.containment,
        prebirthCleanupClaim,
      },
    };
  });
  const cleanupLease = new VerifiedPrebirthCleanupLease(
    PREBIRTH_CLEANUP_LEASE_TOKEN,
    prebirthCleanupManifestBinding(claimed),
  );
  PRISTINE_REFLECT_APPLY(
    PRISTINE_OBJECT_FREEZE,
    undefined,
    [PRISTINE_REFLECT_APPLY(
      PRISTINE_OBJECT_GET_PROTOTYPE_OF,
      undefined,
      [cleanupLease],
    )],
  );
  PRISTINE_REFLECT_APPLY(PRISTINE_OBJECT_FREEZE, undefined, [cleanupLease]);
  return { manifest: claimed, cleanupLease };
}

export async function claimCiWorkspaceCleanup(
  workspace,
  resourceClaim,
  cleanupAuthority,
) {
  const current = await readCiManifest(workspace.manifestPath);
  const disposition = ciManifestCleanupDisposition(
    current,
    resourceClaim,
    cleanupAuthority,
  );
  if (disposition.decision !== 'DISPOSE') {
    throw new Error(disposition.code);
  }
  if (current.state === 'cleanup-claimed') return current;
  if (runFinalityCapabilityOperation(
    cleanupAuthority,
    'BEGIN_RESERVATION',
    { manifest: current, resourceClaim },
  ) !== true) {
    throw new Error('E_CI_SIM_CLEANUP_HOLD:CAPABILITY_RESERVATION_CONFLICT');
  }
  let reservationCommitted = false;
  try {
    const originalDigest = sha256(canonicalJson(current));
    const cleanupClaim = createCleanupClaim(current, resourceClaim);
    const claimed = await updateCiManifest(workspace, manifest => {
      if (manifest.state !== 'resource-released'
        || manifest.revision !== current.revision
        || sha256(canonicalJson(manifest)) !== originalDigest) {
        throw new Error('E_CI_SIM_CLEANUP_HOLD:MANIFEST_CAS_CONFLICT');
      }
      return {
        ...manifest,
        state: 'cleanup-claimed',
        containment: {
          ...manifest.containment,
          cleanupClaim,
        },
      };
    });
    if (runFinalityCapabilityOperation(
      cleanupAuthority,
      'COMMIT_RESERVATION',
      { manifest: claimed, resourceClaim },
    ) !== true) {
      throw new Error('E_CI_SIM_CLEANUP_HOLD:CAPABILITY_COMMIT_FAILED');
    }
    reservationCommitted = true;
    return claimed;
  } finally {
    if (!reservationCommitted) {
      runFinalityCapabilityOperation(
        cleanupAuthority,
        'ROLLBACK_RESERVATION',
      );
    }
  }
}

export function beginCiWorkspaceCleanupAttempt(
  manifest,
  resourceClaim,
  cleanupAuthority,
) {
  try {
    return runFinalityCapabilityOperation(
      cleanupAuthority,
      'BEGIN_ATTEMPT',
      { manifest, resourceClaim },
    );
  } catch {
    return null;
  }
}

export function verifyCiWorkspaceCleanupAttempt(
  cleanupLease,
  manifest,
  resourceClaim,
) {
  try {
    return runCleanupLeaseOperation(
      cleanupLease,
      'VERIFY_ATTEMPT',
      { manifest, resourceClaim },
    );
  } catch {
    return false;
  }
}

export function releaseCiWorkspaceCleanupAttempt(cleanupLease) {
  try {
    return runCleanupLeaseOperation(cleanupLease, 'RELEASE_ATTEMPT');
  } catch {
    return false;
  }
}

export function commitCiWorkspaceCleanupAttempt(cleanupLease) {
  try {
    return runCleanupLeaseOperation(cleanupLease, 'COMMIT_ATTEMPT');
  } catch {
    return false;
  }
}

export function ciManifestCleanupDisposition(
  manifest,
  resourceClaim = null,
  cleanupAuthority = null,
) {
  if (manifest.retained === true) {
    return { decision: 'RETAIN', code: 'E_CI_SIM_RETAINED' };
  }
  if (manifest.schemaVersion === LEGACY_MANIFEST_VERSION) {
    return resourceClaim
      ? { decision: 'HOLD', code: 'E_CI_SIM_STALE_HOLD:CONTAINMENT_DOWNGRADE_CONFLICT' }
      : { decision: 'DISPOSE', code: 'E_CI_SIM_LEGACY_DISPOSABLE' };
  }
  const containment = validateContainmentState(manifest.containment);
  if (!resourceClaim) {
    const pristinePreBirth = ['creating', 'ready'].includes(manifest.state)
      && containment.prepareIntent === null
      && containment.resourceClaimDigest === undefined
      && containment.resourceIdentityRef === undefined
      && containment.candidateBirthAuthorized === false
      && containment.resourceReleased === false
      && containment.finality.status === 'UNPROVEN';
    return pristinePreBirth
      ? { decision: 'DISPOSE', code: 'E_CI_SIM_CONTAINMENT_PRE_BIRTH_DISPOSABLE' }
      : { decision: 'HOLD', code: 'E_CI_SIM_STALE_HOLD:RESOURCE_CLAIM_MISSING' };
  }
  if (resourceClaim.runNonce !== manifest.runNonce
    || resourceClaim.identity.runNonce !== manifest.runNonce
    || resourceClaim.identityDigest !== containment.resourceClaimDigest
    || `sha256:${resourceClaim.identityDigest}` !== containment.resourceIdentityRef) {
    return { decision: 'HOLD', code: 'E_CI_SIM_STALE_HOLD:RESOURCE_IDENTITY_CONFLICT' };
  }
  const cleanupClaim = containment.cleanupClaim;
  const finalityStateValid = containment.resourceReleased === true
    && (
      (manifest.state === 'resource-released' && cleanupClaim === undefined)
      || (
        manifest.state === 'cleanup-claimed'
        && validCleanupClaim(cleanupClaim)
        && cleanupClaim.runNonce === manifest.runNonce
        && cleanupClaim.toRevision === manifest.revision
        && cleanupClaim.resourceIdentityRef === containment.resourceIdentityRef
        && cleanupClaim.authorityReceiptRef
          === containment.finality.authorityReceiptRef
        && cleanupClaim.resourceClaimRef
          === `sha256:${sha256(canonicalJson(resourceClaim))}`
      )
    );
  if (!finalityStateValid
    || !validAuthorityBinding(containment.authorityBinding)
    || containment.finality.status !== 'PROVEN'
    || containment.finality.identityDigest !== resourceClaim.identityDigest
    || containment.finality.resourceIdentityRef !== containment.resourceIdentityRef
    || containment.finality.resourceIdentityRef
      !== containment.authorityBinding.resourceIdentityRef
    || containment.finality.authorityClaimRef
      !== containment.authorityBinding.claimRef
    || containment.finality.executionIntentRef
      !== containment.authorityBinding.executionIntentRef
    || containment.finality.executionRef !== containment.executionRef
    || containment.finality.completionRef !== containment.completionRef
    || containment.finality.authenticated !== true
    || containment.finality.terminationVerified !== true
    || containment.finality.adapterIdentityVerified !== true
    || containment.finality.resourceReleased !== true
    || !validDigestRef(containment.finality.authorityReceiptRef)
    || !validDigestRef(containment.finality.authorityClaimRef)
    || !validDigestRef(containment.finality.proofRef)
    || !validDigestRef(containment.finality.executionIntentRef)
    || !validDigestRef(containment.finality.executionRef)
    || !validDigestRef(containment.finality.completionRef)
    || !validDigestRef(containment.finality.settlementRef)) {
    return { decision: 'HOLD', code: 'E_CI_SIM_STALE_HOLD:FINALITY_UNPROVEN' };
  }
  if (!finalityCapabilityMatches(cleanupAuthority, manifest, resourceClaim)) {
    return {
      decision: 'HOLD',
      code: 'E_CI_SIM_STALE_HOLD:VERIFIED_FINALITY_CAPABILITY_REQUIRED',
    };
  }
  return { decision: 'DISPOSE', code: 'E_CI_SIM_CONTAINMENT_FINALITY_PROVEN' };
}

export function manifestPidAlive(pid) {
  return pidAlive(pid);
}

export { acquireCiCapacity, releaseCiCapacity } from './ci-sim-capacity.mjs';

export function manifestProcessGroupAlive(pid) {
  if (process.platform === 'win32' || !Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(-pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}
