const ADMISSION_FACETS = [
  'adapter-identity-verified',
  'bootstrap-first',
  'candidate-pre-go-excluded',
  'child-boundary-inherited',
  'control-plane-trusted',
  'descriptor-allowlist-verified',
  'host-state-unavailable',
  'native-code-constrained',
  'network-denied',
  'no-writable-source-descriptor',
  'node-permission-active',
  'process-tree-owned',
  'scratch-only-writable',
  'source-read-only',
  'startup-sanitized',
];

const SETTLEMENT_FACETS = [
  'bootstrap-observed',
  'cleanup-verified',
  'descendant-tree-empty',
  'receipt-host-owned',
  'termination-verified',
  'test-process-exited',
];

const BOUNDARY_CLASSES = [
  'none',
  'process',
  'kernel',
  'virtualized-kernel',
];

const STRONG_BOUNDARY_CLASSES = [
  'kernel',
  'virtualized-kernel',
];

const FACET_STATES = [
  'PROVEN',
  'UNPROVEN',
  'CONTRADICTED',
];

const ADMISSION_STATES = [
  'ADMITTED',
  'AUDIT_UNENFORCED',
  'HOLD',
];

const PROOF_STATES = [
  'ELIGIBLE',
  'INELIGIBLE',
  'HOLD',
];

const REFERENCE_PATTERN = /^[a-z][a-z0-9._-]*:[A-Za-z0-9._~:/=+-]+$/u;
const DIGEST_REFERENCE_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const AUTHORITY_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export const CONTAINMENT_CONTRACT_SCHEMA_VERSION = 1;

const IntrinsicWeakMap = WeakMap;
const IntrinsicWeakSet = WeakSet;

let facetAuthorityRegistryValue = null;
let weakCollectionAuthorityValue = null;

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function isNonEmptyString(value, maximum = 512) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximum;
}

function includesValue(values, value) {
  return values.includes(value);
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

function detailRecord(value) {
  if (!isRecord(value)) return {};
  return { ...value };
}

function facetAuthorityRegistry() {
  if (facetAuthorityRegistryValue === null) {
    facetAuthorityRegistryValue = new IntrinsicWeakMap();
  }
  return facetAuthorityRegistryValue;
}

function weakCollectionAuthority() {
  if (weakCollectionAuthorityValue === null) {
    weakCollectionAuthorityValue = Object.freeze({
      mapGet: Function.prototype.call.bind(WeakMap.prototype.get),
      mapSet: Function.prototype.call.bind(WeakMap.prototype.set),
      setAdd: Function.prototype.call.bind(WeakSet.prototype.add),
      setHas: Function.prototype.call.bind(WeakSet.prototype.has),
    });
  }
  return weakCollectionAuthorityValue;
}

function isDigestReference(value) {
  return typeof value === 'string' && DIGEST_REFERENCE_PATTERN.test(value);
}

function isAuthorityIdentifier(value) {
  return typeof value === 'string' && AUTHORITY_IDENTIFIER_PATTERN.test(value);
}

function facetDefinitionsForPhase(phase) {
  const identifiers = phase === 'admission' ? ADMISSION_FACETS : SETTLEMENT_FACETS;
  return identifiers.map(id => ({ id, phase, required: true }));
}

function allFacetIdentifiers() {
  return [...ADMISSION_FACETS, ...SETTLEMENT_FACETS];
}

function invalidFacetAuthority(phase, reasonCode, details = {}) {
  return freezeJson({
    state: 'INVALID',
    phase,
    reasonCode,
    requiredFacetIds: phase === 'admission'
      ? [...ADMISSION_FACETS]
      : [...SETTLEMENT_FACETS],
    provenFacetIds: [],
    blockingFacetIds: [],
    contradictedFacetIds: [],
    evidenceRefs: [],
    details: detailRecord(details),
  });
}

function evaluateFacetAuthority(observations, phase) {
  if (!Array.isArray(observations)) {
    return invalidFacetAuthority(phase, 'E_CONTAINMENT_FACETS_INVALID', {
      field: 'facets',
      actualType: typeof observations,
    });
  }

  const knownFacetIds = allFacetIdentifiers();
  const phaseFacetIds = phase === 'admission' ? ADMISSION_FACETS : SETTLEMENT_FACETS;
  const observed = [];
  const seen = [];
  const seenEvidenceRefs = [];
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index];
    if (!isRecord(observation)
      || !isNonEmptyString(observation.id, 128)
      || !includesValue(FACET_STATES, observation.state)) {
      return invalidFacetAuthority(phase, 'E_CONTAINMENT_FACET_INVALID', {
        index,
      });
    }
    if (!includesValue(knownFacetIds, observation.id)) {
      return invalidFacetAuthority(phase, 'E_CONTAINMENT_FACET_UNKNOWN', {
        facetId: observation.id,
      });
    }
    if (!includesValue(phaseFacetIds, observation.id)) {
      return invalidFacetAuthority(phase, 'E_CONTAINMENT_FACET_PHASE_INVALID', {
        facetId: observation.id,
      });
    }
    if (includesValue(seen, observation.id)) {
      return invalidFacetAuthority(phase, 'E_CONTAINMENT_FACET_DUPLICATE', {
        facetId: observation.id,
      });
    }
    if (observation.state === 'PROVEN'
      && (!isNonEmptyString(observation.evidenceRef)
        || !REFERENCE_PATTERN.test(observation.evidenceRef))) {
      return invalidFacetAuthority(phase, 'E_CONTAINMENT_FACET_EVIDENCE_INVALID', {
        facetId: observation.id,
      });
    }
    if (observation.state === 'PROVEN'
      && includesValue(seenEvidenceRefs, observation.evidenceRef)) {
      return invalidFacetAuthority(phase, 'E_CONTAINMENT_FACET_EVIDENCE_DUPLICATE', {
        facetId: observation.id,
      });
    }
    seen.push(observation.id);
    if (observation.state === 'PROVEN') {
      seenEvidenceRefs.push(observation.evidenceRef);
    }
    observed.push({
      id: observation.id,
      state: observation.state,
      evidenceRef: isNonEmptyString(observation.evidenceRef)
        ? observation.evidenceRef
        : null,
    });
  }

  const requiredFacetIds = phase === 'admission'
    ? ADMISSION_FACETS
    : SETTLEMENT_FACETS;
  const provenFacetIds = [];
  const blockingFacetIds = [];
  const contradictedFacetIds = [];
  const evidenceRefs = [];

  for (const facetId of requiredFacetIds) {
    const observation = observed.find(item => item.id === facetId);
    if (observation?.state === 'PROVEN') {
      provenFacetIds.push(facetId);
      evidenceRefs.push(observation.evidenceRef);
    } else {
      blockingFacetIds.push(facetId);
      if (observation?.state === 'CONTRADICTED') contradictedFacetIds.push(facetId);
    }
  }

  const state = blockingFacetIds.length === 0 ? 'COMPLETE' : 'INCOMPLETE';
  const reasonCode = state === 'COMPLETE'
    ? 'NONE'
    : contradictedFacetIds.length > 0
      ? 'E_CONTAINMENT_FACET_CONTRADICTED'
      : 'E_CONTAINMENT_FACET_UNPROVEN';

  return freezeJson({
    state,
    phase,
    reasonCode,
    requiredFacetIds: [...requiredFacetIds],
    provenFacetIds,
    blockingFacetIds,
    contradictedFacetIds,
    evidenceRefs,
    details: {},
  });
}

export function containmentFacetDefinitions() {
  return freezeJson([
    ...facetDefinitionsForPhase('admission'),
    ...facetDefinitionsForPhase('settlement'),
  ]);
}

function facetAuthorityFailure(reasonCode, details = {}) {
  return {
    ok: false,
    hold: createContainmentHold({
      reasonCode,
      details,
    }),
  };
}

function facetAuthorityContext(value) {
  if (!isRecord(value)
    || !exactKeys(value, [
      'runNonce',
      'adapterId',
      'boundaryClass',
      'authorityRef',
      'policyRef',
      'resourceIdentityRef',
      'executionIntentRef',
    ])
    || !isAuthorityIdentifier(value.runNonce)
    || !isAuthorityIdentifier(value.adapterId)
    || !includesValue(BOUNDARY_CLASSES, value.boundaryClass)
    || !isDigestReference(value.authorityRef)
    || !isDigestReference(value.policyRef)
    || !isDigestReference(value.resourceIdentityRef)
    || !isDigestReference(value.executionIntentRef)) {
    return null;
  }
  return {
    runNonce: value.runNonce,
    adapterId: value.adapterId,
    boundaryClass: value.boundaryClass,
    authorityRef: value.authorityRef,
    policyRef: value.policyRef,
    resourceIdentityRef: value.resourceIdentityRef,
    executionIntentRef: value.executionIntentRef,
  };
}

export function createContainmentFacetAuthority(input) {
  const context = facetAuthorityContext(input);
  if (!context) {
    return facetAuthorityFailure('E_CONTAINMENT_FACET_AUTHORITY_CONTEXT_INVALID');
  }
  const authority = Object.freeze({});
  weakCollectionAuthority().mapSet(facetAuthorityRegistry(), authority, {
    context: freezeJson(context),
    observations: new IntrinsicWeakMap(),
    admissions: new IntrinsicWeakSet(),
    proofs: new IntrinsicWeakMap(),
  });
  return { ok: true, value: authority };
}

function facetAuthorityState(authority) {
  if (!isRecord(authority)) return null;
  return weakCollectionAuthority().mapGet(facetAuthorityRegistry(), authority) ?? null;
}

export function inspectContainmentFacetAuthority(authority) {
  const state = facetAuthorityState(authority);
  if (!state) {
    return facetAuthorityFailure('E_CONTAINMENT_FACET_AUTHORITY_INVALID');
  }
  return {
    ok: true,
    value: freezeJson(structuredClone(state.context)),
  };
}

export function recordContainmentFacetObservation(input) {
  if (!isRecord(input)
    || !exactKeys(input, [
      'authority',
      'phase',
      'id',
      'state',
      'evidenceRef',
      'evidenceBindingRef',
    ])) {
    return facetAuthorityFailure('E_CONTAINMENT_FACET_OBSERVATION_INPUT_INVALID');
  }
  const state = facetAuthorityState(input.authority);
  const phaseFacetIds = input.phase === 'admission'
    ? ADMISSION_FACETS
    : input.phase === 'settlement'
      ? SETTLEMENT_FACETS
      : null;
  if (!state
    || !phaseFacetIds
    || !includesValue(phaseFacetIds, input.id)
    || !includesValue(FACET_STATES, input.state)
    || !isDigestReference(input.evidenceRef)
    || !isDigestReference(input.evidenceBindingRef)) {
    return facetAuthorityFailure('E_CONTAINMENT_FACET_OBSERVATION_INVALID');
  }
  const observation = freezeJson({
    id: input.id,
    state: input.state,
    evidenceRef: input.state === 'PROVEN' ? input.evidenceRef : null,
  });
  weakCollectionAuthority().mapSet(state.observations, observation, {
    phase: input.phase,
    id: input.id,
    state: input.state,
    evidenceRef: observation.evidenceRef,
    evidenceBindingRef: input.evidenceBindingRef,
  });
  return { ok: true, value: observation };
}

function authorizedObservations(state, observations, phase) {
  if (!Array.isArray(observations)) return false;
  return observations.every(observation => {
    const recorded = isRecord(observation)
      ? weakCollectionAuthority().mapGet(state.observations, observation)
      : null;
    return recorded
      && recorded.phase === phase
      && recorded.id === observation.id
      && recorded.state === observation.state
      && recorded.evidenceRef === observation.evidenceRef
      && isDigestReference(recorded.evidenceBindingRef);
  });
}

function authorityMatchesAdmissionInput(state, input) {
  return input.adapterId === state.context.adapterId
    && input.boundaryClass === state.context.boundaryClass;
}

export function verifyContainmentAdmissionWithFacetAuthority(input) {
  if (!isRecord(input)) {
    return facetAuthorityFailure('E_CONTAINMENT_FACET_AUTHORITY_INPUT_INVALID');
  }
  const state = facetAuthorityState(input.authority);
  if (!state
    || !isRecord(input.admission)
    || !weakCollectionAuthority().setHas(state.admissions, input.admission)) {
    return facetAuthorityFailure('E_CONTAINMENT_ADMISSION_AUTHORITY_INVALID');
  }
  return validateContainmentAdmission(input.admission);
}

export function verifyContainmentProofWithFacetAuthority(input) {
  if (!isRecord(input)) {
    return facetAuthorityFailure('E_CONTAINMENT_FACET_AUTHORITY_INPUT_INVALID');
  }
  const state = facetAuthorityState(input.authority);
  const binding = state && isRecord(input.proof)
    ? weakCollectionAuthority().mapGet(state.proofs, input.proof)
    : null;
  if (!state
    || !isRecord(input.proof)
    || !binding
    || (input.admission !== undefined && input.admission !== binding.admission)
    || (input.executionRef !== undefined && input.executionRef !== binding.executionRef)
    || (input.settlementRef !== undefined && input.settlementRef !== binding.settlementRef)
    || (input.completionRef !== undefined && input.completionRef !== binding.completionRef)) {
    return facetAuthorityFailure('E_CONTAINMENT_PROOF_AUTHORITY_INVALID');
  }
  return validateContainmentProof(input.proof);
}

export function createContainmentHold(input = {}) {
  const kind = input.kind === 'containment-proof'
    ? 'containment-proof'
    : 'containment-admission';
  const state = 'HOLD';
  const facetPhase = kind === 'containment-proof' ? 'settlement' : 'admission';
  const facetAuthority = isRecord(input.facetAuthority)
    ? input.facetAuthority
    : invalidFacetAuthority(
      facetPhase,
      isNonEmptyString(input.reasonCode) ? input.reasonCode : 'E_CONTAINMENT_HOLD',
    );
  return freezeJson({
    schemaVersion: CONTAINMENT_CONTRACT_SCHEMA_VERSION,
    kind,
    state,
    mode: input.mode === 'enforce' ? 'enforce' : 'audit',
    adapterId: isNonEmptyString(input.adapterId, 128) ? input.adapterId : null,
    boundaryClass: includesValue(BOUNDARY_CLASSES, input.boundaryClass)
      ? input.boundaryClass
      : null,
    proofEligible: false,
    reasonCode: isNonEmptyString(input.reasonCode)
      ? input.reasonCode
      : 'E_CONTAINMENT_HOLD',
    facetAuthority,
    details: detailRecord(input.details),
  });
}

function evaluateContainmentAdmissionCore(input) {
  if (!isRecord(input)) {
    return createContainmentHold({
      reasonCode: 'E_CONTAINMENT_INPUT_INVALID',
      details: { field: 'input', actualType: typeof input },
    });
  }
  if (hasOwn(input, 'proofEligible')) {
    return createContainmentHold({
      mode: input.mode,
      adapterId: input.adapterId,
      boundaryClass: input.boundaryClass,
      reasonCode: 'E_CONTAINMENT_RESERVED_FIELD',
      details: { field: 'proofEligible' },
    });
  }
  if (!includesValue(['audit', 'enforce'], input.mode)) {
    return createContainmentHold({
      reasonCode: 'E_CONTAINMENT_MODE_INVALID',
      details: { field: 'mode', actual: input.mode ?? null },
    });
  }

  const facetAuthority = evaluateFacetAuthority(input.facets, 'admission');
  const adapterId = isNonEmptyString(input.adapterId, 128) ? input.adapterId : null;
  const boundaryClass = includesValue(BOUNDARY_CLASSES, input.boundaryClass)
    ? input.boundaryClass
    : null;

  if (input.mode === 'audit') {
    return freezeJson({
      schemaVersion: CONTAINMENT_CONTRACT_SCHEMA_VERSION,
      kind: 'containment-admission',
      state: 'AUDIT_UNENFORCED',
      mode: 'audit',
      adapterId,
      boundaryClass,
      proofEligible: false,
      reasonCode: 'E_CONTAINMENT_AUDIT_UNENFORCED',
      facetAuthority,
      details: {},
    });
  }

  if (!adapterId) {
    return createContainmentHold({
      mode: 'enforce',
      boundaryClass,
      reasonCode: 'E_CONTAINMENT_ADAPTER_ID_INVALID',
      facetAuthority,
      details: { field: 'adapterId' },
    });
  }
  if (input.adapterState !== 'AVAILABLE') {
    return createContainmentHold({
      mode: 'enforce',
      adapterId,
      boundaryClass,
      reasonCode: input.adapterState === 'UNAVAILABLE'
        ? 'E_CONTAINMENT_ADAPTER_UNAVAILABLE'
        : 'E_CONTAINMENT_ADAPTER_UNPROVEN',
      facetAuthority,
      details: { adapterState: input.adapterState ?? null },
    });
  }
  if (!includesValue(STRONG_BOUNDARY_CLASSES, boundaryClass)) {
    return createContainmentHold({
      mode: 'enforce',
      adapterId,
      boundaryClass,
      reasonCode: 'E_CONTAINMENT_BOUNDARY_CLASS_INSUFFICIENT',
      facetAuthority,
      details: { boundaryClass },
    });
  }
  if (facetAuthority.state !== 'COMPLETE') {
    return createContainmentHold({
      mode: 'enforce',
      adapterId,
      boundaryClass,
      reasonCode: facetAuthority.reasonCode,
      facetAuthority,
      details: { blockingFacetIds: [...facetAuthority.blockingFacetIds] },
    });
  }

  return freezeJson({
    schemaVersion: CONTAINMENT_CONTRACT_SCHEMA_VERSION,
    kind: 'containment-admission',
    state: 'ADMITTED',
    mode: 'enforce',
    adapterId,
    boundaryClass,
    proofEligible: false,
    reasonCode: 'NONE',
    facetAuthority,
    details: {},
  });
}

export function evaluateContainmentAdmission(input) {
  const diagnostic = evaluateContainmentAdmissionCore(input);
  if (diagnostic.state !== 'ADMITTED') return diagnostic;
  return createContainmentHold({
    mode: diagnostic.mode,
    adapterId: diagnostic.adapterId,
    boundaryClass: diagnostic.boundaryClass,
    reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_REQUIRED',
    facetAuthority: diagnostic.facetAuthority,
    details: { diagnosticState: 'UNVERIFIED_ADMISSIBLE' },
  });
}

export function evaluateContainmentAdmissionWithFacetAuthority(input) {
  if (!isRecord(input)) {
    return createContainmentHold({
      reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_INPUT_INVALID',
    });
  }
  const state = facetAuthorityState(input.authority);
  if (!state
    || !authorityMatchesAdmissionInput(state, input)
    || !authorizedObservations(state, input.facets, 'admission')) {
    return createContainmentHold({
      mode: input.mode,
      adapterId: input.adapterId,
      boundaryClass: input.boundaryClass,
      reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_INVALID',
    });
  }
  const { authority, ...admissionInput } = input;
  const admission = evaluateContainmentAdmissionCore(admissionInput);
  if (admission.state === 'ADMITTED') {
    weakCollectionAuthority().setAdd(state.admissions, admission);
  }
  return admission;
}

function evaluateContainmentProofEligibilityCore(input) {
  if (!isRecord(input)) {
    return createContainmentHold({
      kind: 'containment-proof',
      reasonCode: 'E_CONTAINMENT_PROOF_INPUT_INVALID',
      details: { field: 'input', actualType: typeof input },
    });
  }
  if (hasOwn(input, 'proofEligible')) {
    return createContainmentHold({
      kind: 'containment-proof',
      mode: input.admission?.mode,
      adapterId: input.admission?.adapterId,
      boundaryClass: input.admission?.boundaryClass,
      reasonCode: 'E_CONTAINMENT_RESERVED_FIELD',
      details: { field: 'proofEligible' },
    });
  }

  const admissionValidation = validateContainmentAdmission(input.admission);
  if (!admissionValidation.ok) {
    return createContainmentHold({
      kind: 'containment-proof',
      reasonCode: 'E_CONTAINMENT_ADMISSION_INVALID',
      details: { admissionReasonCode: admissionValidation.hold.reasonCode },
    });
  }
  const admission = admissionValidation.value;
  const facetAuthority = evaluateFacetAuthority(input.facets, 'settlement');

  if (admission.state === 'AUDIT_UNENFORCED') {
    return freezeJson({
      schemaVersion: CONTAINMENT_CONTRACT_SCHEMA_VERSION,
      kind: 'containment-proof',
      state: 'INELIGIBLE',
      mode: 'audit',
      adapterId: admission.adapterId,
      boundaryClass: admission.boundaryClass,
      proofEligible: false,
      reasonCode: 'E_CONTAINMENT_AUDIT_UNENFORCED',
      facetAuthority,
      details: {},
    });
  }
  if (admission.state !== 'ADMITTED') {
    return createContainmentHold({
      kind: 'containment-proof',
      mode: admission.mode,
      adapterId: admission.adapterId,
      boundaryClass: admission.boundaryClass,
      reasonCode: 'E_CONTAINMENT_ADMISSION_NOT_STRONG',
      facetAuthority,
      details: { admissionState: admission.state },
    });
  }
  if (input.executionState !== 'SETTLED') {
    return createContainmentHold({
      kind: 'containment-proof',
      mode: admission.mode,
      adapterId: admission.adapterId,
      boundaryClass: admission.boundaryClass,
      reasonCode: 'E_CONTAINMENT_EXECUTION_UNSETTLED',
      facetAuthority,
      details: { executionState: input.executionState ?? null },
    });
  }
  if (facetAuthority.state !== 'COMPLETE') {
    return createContainmentHold({
      kind: 'containment-proof',
      mode: admission.mode,
      adapterId: admission.adapterId,
      boundaryClass: admission.boundaryClass,
      reasonCode: facetAuthority.reasonCode,
      facetAuthority,
      details: { blockingFacetIds: [...facetAuthority.blockingFacetIds] },
    });
  }

  return freezeJson({
    schemaVersion: CONTAINMENT_CONTRACT_SCHEMA_VERSION,
    kind: 'containment-proof',
    state: 'ELIGIBLE',
    mode: admission.mode,
    adapterId: admission.adapterId,
    boundaryClass: admission.boundaryClass,
    proofEligible: true,
    reasonCode: 'NONE',
    facetAuthority,
    details: {},
  });
}

export function evaluateContainmentProofEligibility(input) {
  const diagnostic = evaluateContainmentProofEligibilityCore(input);
  if (diagnostic.state !== 'ELIGIBLE') return diagnostic;
  return createContainmentHold({
    kind: 'containment-proof',
    mode: diagnostic.mode,
    adapterId: diagnostic.adapterId,
    boundaryClass: diagnostic.boundaryClass,
    reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_REQUIRED',
    facetAuthority: diagnostic.facetAuthority,
    details: { diagnosticState: 'UNVERIFIED_ELIGIBLE' },
  });
}

export function evaluateContainmentProofEligibilityWithFacetAuthority(input) {
  if (!isRecord(input)) {
    return createContainmentHold({
      kind: 'containment-proof',
      reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_INPUT_INVALID',
    });
  }
  const state = facetAuthorityState(input.authority);
  if (!state
    || !isRecord(input.admission)
    || !weakCollectionAuthority().setHas(state.admissions, input.admission)
    || input.admission.adapterId !== state.context.adapterId
    || input.admission.boundaryClass !== state.context.boundaryClass
    || !authorizedObservations(state, input.facets, 'settlement')
    || !isDigestReference(input.executionRef)
    || !isDigestReference(input.settlementRef)
    || !isDigestReference(input.completionRef)) {
    return createContainmentHold({
      kind: 'containment-proof',
      mode: input.admission?.mode,
      adapterId: input.admission?.adapterId,
      boundaryClass: input.admission?.boundaryClass,
      reasonCode: 'E_CONTAINMENT_FACET_AUTHORITY_INVALID',
    });
  }
  const {
    authority,
    executionRef,
    settlementRef,
    completionRef,
    ...proofInput
  } = input;
  const proof = evaluateContainmentProofEligibilityCore(proofInput);
  if (proof.state === 'ELIGIBLE') {
    weakCollectionAuthority().mapSet(state.proofs, proof, {
      admission: input.admission,
      executionRef,
      settlementRef,
      completionRef,
    });
  }
  return proof;
}

function sameArray(left, right) {
  return left.length === right.length
    && left.every((item, index) => item === right[index]);
}

function uniqueStrings(value, maximum = 256) {
  return Array.isArray(value)
    && value.every(item => isNonEmptyString(item, maximum))
    && new Set(value).size === value.length;
}

function orderedSubset(source, selected) {
  return source.filter(item => selected.includes(item));
}

function validateFacetAuthority(value, expectedPhase) {
  if (!isRecord(value)
    || !exactKeys(value, [
      'state',
      'phase',
      'reasonCode',
      'requiredFacetIds',
      'provenFacetIds',
      'blockingFacetIds',
      'contradictedFacetIds',
      'evidenceRefs',
      'details',
    ])
    || !includesValue(['COMPLETE', 'INCOMPLETE', 'INVALID'], value.state)
    || value.phase !== expectedPhase
    || !isNonEmptyString(value.reasonCode)
    || !uniqueStrings(value.requiredFacetIds)
    || !uniqueStrings(value.provenFacetIds)
    || !uniqueStrings(value.blockingFacetIds)
    || !uniqueStrings(value.contradictedFacetIds)
    || !uniqueStrings(value.evidenceRefs, 512)
    || !isRecord(value.details)) {
    return false;
  }

  const required = expectedPhase === 'admission'
    ? ADMISSION_FACETS
    : SETTLEMENT_FACETS;
  if (!sameArray(value.requiredFacetIds, required)) return false;
  if (!sameArray(value.provenFacetIds, orderedSubset(required, value.provenFacetIds))
    || !sameArray(value.blockingFacetIds, orderedSubset(required, value.blockingFacetIds))
    || !sameArray(
      value.contradictedFacetIds,
      orderedSubset(value.blockingFacetIds, value.contradictedFacetIds),
    )
    || value.evidenceRefs.some(reference => !REFERENCE_PATTERN.test(reference))
    || value.evidenceRefs.length !== value.provenFacetIds.length) {
    return false;
  }

  if (value.state === 'INVALID') {
    return value.reasonCode !== 'NONE'
      && value.provenFacetIds.length === 0
      && value.blockingFacetIds.length === 0
      && value.contradictedFacetIds.length === 0
      && value.evidenceRefs.length === 0;
  }

  const partition = [...value.provenFacetIds, ...value.blockingFacetIds];
  if (partition.length !== required.length
    || required.some(facetId => !partition.includes(facetId))
    || value.provenFacetIds.some(facetId => value.blockingFacetIds.includes(facetId))) {
    return false;
  }
  if (value.state === 'COMPLETE') {
    return value.reasonCode === 'NONE'
      && sameArray(value.provenFacetIds, required)
      && value.blockingFacetIds.length === 0
      && value.contradictedFacetIds.length === 0;
  }
  return value.blockingFacetIds.length > 0
    && value.reasonCode === (
      value.contradictedFacetIds.length > 0
        ? 'E_CONTAINMENT_FACET_CONTRADICTED'
        : 'E_CONTAINMENT_FACET_UNPROVEN'
    );
}

export function validateContainmentAdmission(value) {
  const valid = isRecord(value)
    && exactKeys(value, [
      'schemaVersion',
      'kind',
      'state',
      'mode',
      'adapterId',
      'boundaryClass',
      'proofEligible',
      'reasonCode',
      'facetAuthority',
      'details',
    ])
    && value.schemaVersion === CONTAINMENT_CONTRACT_SCHEMA_VERSION
    && value.kind === 'containment-admission'
    && includesValue(ADMISSION_STATES, value.state)
    && includesValue(['audit', 'enforce'], value.mode)
    && (value.adapterId === null || isNonEmptyString(value.adapterId, 128))
    && (value.boundaryClass === null || includesValue(BOUNDARY_CLASSES, value.boundaryClass))
    && value.proofEligible === false
    && isNonEmptyString(value.reasonCode)
    && validateFacetAuthority(value.facetAuthority, 'admission')
    && isRecord(value.details)
    && (value.state !== 'ADMITTED'
      || (value.mode === 'enforce'
        && isNonEmptyString(value.adapterId, 128)
        && includesValue(STRONG_BOUNDARY_CLASSES, value.boundaryClass)
        && value.reasonCode === 'NONE'
        && value.facetAuthority.state === 'COMPLETE'))
    && (value.state !== 'AUDIT_UNENFORCED'
      || (value.mode === 'audit'
        && value.reasonCode === 'E_CONTAINMENT_AUDIT_UNENFORCED'))
    && (value.state !== 'HOLD' || value.reasonCode !== 'NONE');

  if (!valid) {
    return {
      ok: false,
      hold: createContainmentHold({
        reasonCode: 'E_CONTAINMENT_ADMISSION_INVALID',
        details: { kind: isRecord(value) ? value.kind ?? null : null },
      }),
    };
  }
  return { ok: true, value: freezeJson(structuredClone(value)) };
}

export function validateContainmentProof(value) {
  const valid = isRecord(value)
    && exactKeys(value, [
      'schemaVersion',
      'kind',
      'state',
      'mode',
      'adapterId',
      'boundaryClass',
      'proofEligible',
      'reasonCode',
      'facetAuthority',
      'details',
    ])
    && value.schemaVersion === CONTAINMENT_CONTRACT_SCHEMA_VERSION
    && value.kind === 'containment-proof'
    && includesValue(PROOF_STATES, value.state)
    && includesValue(['audit', 'enforce'], value.mode)
    && (value.adapterId === null || isNonEmptyString(value.adapterId, 128))
    && (value.boundaryClass === null || includesValue(BOUNDARY_CLASSES, value.boundaryClass))
    && typeof value.proofEligible === 'boolean'
    && isNonEmptyString(value.reasonCode)
    && validateFacetAuthority(value.facetAuthority, 'settlement')
    && isRecord(value.details)
    && (value.state !== 'ELIGIBLE'
      || (value.mode === 'enforce'
        && isNonEmptyString(value.adapterId, 128)
        && value.proofEligible === true
        && value.reasonCode === 'NONE'
        && value.facetAuthority.state === 'COMPLETE'))
    && (value.state === 'ELIGIBLE' || value.proofEligible === false)
    && (value.state !== 'INELIGIBLE'
      || (value.mode === 'audit'
        && value.reasonCode === 'E_CONTAINMENT_AUDIT_UNENFORCED'))
    && (value.state !== 'HOLD' || value.reasonCode !== 'NONE');

  if (!valid) {
    return {
      ok: false,
      hold: createContainmentHold({
        kind: 'containment-proof',
        reasonCode: 'E_CONTAINMENT_PROOF_INVALID',
        details: { kind: isRecord(value) ? value.kind ?? null : null },
      }),
    };
  }
  return { ok: true, value: freezeJson(structuredClone(value)) };
}
