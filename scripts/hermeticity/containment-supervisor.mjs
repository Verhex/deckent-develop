import { randomBytes } from 'node:crypto';
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';

import {
  authorizeCiCandidateBirth,
  claimCiContainmentResource,
  recordCiContainmentCompletion,
  recordCiContainmentFinality,
  recordCiContainmentPrepareIntent,
  recordCiContainmentRunning,
  validateContainmentResourceIdentity,
} from '../ci-sim-state.mjs';
import {
  bindContainmentAuthoritySessionFacetAuthority,
  closeContainmentAuthoritySession,
  containmentDigestRef,
  createContainmentAuthorityClaimWithSession,
  createContainmentAuthorityReceiptWithSession,
  createContainmentAuthoritySession,
  evaluateContainmentAdmissionWithSession,
  evaluateContainmentProofEligibilityWithSession,
  recordContainmentAuthoritySessionFacetObservation,
  verifyContainmentAuthorityReceiptWithSession,
} from './containment-authority.mjs';
import {
  containmentFacetDefinitions,
} from './containment-contract.mjs';
import { executeOwnedCandidate } from './owned-execution.mjs';
import { bootstrapClaimedProcess } from './process-bootstrap.mjs';

function reasonCode(value, fallback) {
  const candidate = value?.hold?.reasonCode
    ?? value?.reasonCode
    ?? (value instanceof Error ? value.message : null);
  return typeof candidate === 'string' && /^[A-Z][A-Z0-9_:.-]+$/u.test(candidate)
    ? candidate
    : fallback;
}

function hold(code, details = {}) {
  return {
    state: 'HOLD',
    code,
    proofEligible: false,
    receiptAuthenticated: false,
    retain: true,
    candidateBirth: 'NOT_BORN',
    finality: {
      status: 'UNPROVEN',
      authenticated: false,
      terminationVerified: false,
      adapterIdentityVerified: false,
    },
    ...details,
  };
}

function validReference(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function facetIds(phase) {
  return containmentFacetDefinitions()
    .filter(facet => facet.phase === phase)
    .map(facet => facet.id);
}

function recordSessionFacetEvidence(session, phase, evidence, seenEvidence) {
  const expectedIds = facetIds(phase);
  if (!Array.isArray(evidence)
    || evidence.length !== expectedIds.length
    || !(seenEvidence?.refs instanceof Set)
    || !(seenEvidence?.bindingRefs instanceof Set)) {
    return {
      ok: false,
      code: 'E_CONTAINMENT_HOLD_FACET_EVIDENCE_INVALID',
    };
  }
  const observations = [];
  for (let index = 0; index < expectedIds.length; index += 1) {
    const item = evidence[index];
    if (!exactKeys(item, [
      'evidenceBindingRef',
      'evidenceRef',
      'id',
      'state',
    ])
      || item.id !== expectedIds[index]
      || !validReference(item.evidenceRef)
      || !validReference(item.evidenceBindingRef)
      || seenEvidence.refs.has(item.evidenceRef)
      || seenEvidence.bindingRefs.has(item.evidenceBindingRef)) {
      return {
        ok: false,
        code: 'E_CONTAINMENT_HOLD_FACET_EVIDENCE_INVALID',
      };
    }
    const recorded = recordContainmentAuthoritySessionFacetObservation({
      session,
      phase,
      id: item.id,
      state: item.state,
      evidenceRef: item.evidenceRef,
      evidenceBindingRef: item.evidenceBindingRef,
    });
    if (!recorded.ok) {
      return {
        ok: false,
        code: reasonCode(
          recorded,
          'E_CONTAINMENT_HOLD_FACET_EVIDENCE_INVALID',
        ),
      };
    }
    seenEvidence.refs.add(item.evidenceRef);
    seenEvidence.bindingRefs.add(item.evidenceBindingRef);
    observations.push(recorded.value);
  }
  return { ok: true, value: observations };
}

function authorityReferences(input) {
  const references = {
    policyRef: input.policyRef,
    controlPlaneRef: input.controlPlaneRef,
    sourceRef: input.sourceRef,
    dependencyProjectionRef: input.dependencyProjectionRef,
    runtimeProjectionRef: input.runtimeProjectionRef,
  };
  return Object.values(references).every(validReference) ? references : null;
}

const STARTUP_INJECTION_KEYS = [
  'BASH_ENV',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'ELECTRON_RUN_AS_NODE',
  'ENV',
  'GCONV_PATH',
  'LD_AUDIT',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_CHANNEL_FD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_REPL_EXTERNAL_MODULE',
  'NODE_V8_COVERAGE',
  'OPENSSL_CONF',
];

function pathInside(root, candidate) {
  const path = relative(resolve(root), resolve(candidate));
  return path === ''
    || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function candidateDescriptor(candidate, workspace) {
  if (!candidate || typeof candidate !== 'object'
    || typeof candidate.command !== 'string'
    || resolve(candidate.command) !== resolve(process.execPath)
    || candidate.command.length === 0
    || candidate.command.length > 32_768
    || !Array.isArray(candidate.args)
    || candidate.args.length === 0
    || candidate.args.length > 4_096
    || candidate.args.some(argument => (
      typeof argument !== 'string'
      || argument.length > 32_768
      || argument.includes('\0')
    ))
    || typeof candidate.cwd !== 'string'
    || candidate.cwd.length === 0
    || candidate.cwd.length > 32_768
    || !candidate.env
    || typeof candidate.env !== 'object'
    || Array.isArray(candidate.env)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(candidate.env))
    || resolve(candidate.cwd) !== resolve(workspace.workspaceDir)) {
    return null;
  }
  const environmentEntries = Object.entries(candidate.env);
  const normalizedEnvironmentKeys = new Set(
    environmentEntries.map(([key]) => key.toUpperCase()),
  );
  if (environmentEntries.length > 256
    || environmentEntries.some(([key, value]) => (
      !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)
      || typeof value !== 'string'
      || value.length > 32_768
      || value.includes('\0')
    ))
    || STARTUP_INJECTION_KEYS.some(key => normalizedEnvironmentKeys.has(key))) {
    return null;
  }
  const bootstrapIndex = candidate.args.findIndex(argument => !argument.startsWith('-'));
  if (bootstrapIndex < 0
    || resolve(candidate.args[bootstrapIndex]) !== resolve(
      workspace.workspaceDir,
      'scripts',
      'hermeticity',
      'process-bootstrap.mjs',
    )
    || candidate.args[bootstrapIndex + 1] !== '--entry'
    || resolve(candidate.args[bootstrapIndex + 2] ?? '') !== resolve(
      workspace.workspaceDir,
      'node_modules',
      'vitest',
      'vitest.mjs',
    )
    || candidate.args[bootstrapIndex + 3] !== '--') {
    return null;
  }
  const leadingArguments = candidate.args.slice(0, bootstrapIndex);
  let permissionFlagCount = 0;
  for (const argument of leadingArguments) {
    if (argument === '--permission') {
      permissionFlagCount += 1;
      continue;
    }
    if (argument === '--frozen-intrinsics'
      || argument === '--disable-warning=ExperimentalWarning') {
      continue;
    }
    const equalsIndex = argument.indexOf('=');
    const name = equalsIndex < 0 ? argument : argument.slice(0, equalsIndex);
    const path = equalsIndex < 0 ? '' : argument.slice(equalsIndex + 1);
    if (!path || !isAbsolute(path)) return null;
    if (name === '--allow-fs-read'
      && (pathInside(workspace.workspaceDir, path)
        || ['/dev/fd', '/proc/self/fd'].includes(resolve(path)))) {
      continue;
    }
    if (name === '--allow-fs-write'
      && pathInside(workspace.homeDir, path)) {
      continue;
    }
    return null;
  }
  if (permissionFlagCount !== 1) return null;
  return {
    command: candidate.command,
    args: [...candidate.args],
    cwd: candidate.cwd,
    environment: Object.fromEntries(
      environmentEntries.sort(([left], [right]) => left.localeCompare(right)),
    ),
    bootstrapIndex,
  };
}

function preparedResourceMatches(value, expected) {
  return value?.state === 'PREPARED'
    && value.verified === true
    && value.adapterId === expected.adapterId
    && value.resourceType === expected.resourceType
    && value.resourceId === expected.resourceId
    && typeof value.spawn === 'function'
    && typeof value.terminateAndVerify === 'function'
    && value.identity
    && typeof value.identity === 'object';
}

async function persistUnprovenFinality(operations, identityDigest) {
  try {
    return await operations.recordFinality({
      status: 'UNPROVEN',
      identityDigest,
    });
  } catch {
    return null;
  }
}

/**
 * Trusted in-process supervisor. The HMAC secret remains inside an opaque,
 * one-shot authority session; it is never returned, persisted, inherited, or
 * passed to the candidate/receipt transport.
 */
export async function superviseContainedExecution(input = {}) {
  const adapterId = input.executionAdapter?.adapterId;
  const boundaryClass = input.boundaryClass;
  if (input.mode !== 'enforce'
    || typeof adapterId !== 'string'
    || !['kernel', 'virtualized-kernel'].includes(boundaryClass)) {
    return hold('E_CONTAINMENT_HOLD_STRONG_ADMISSION_REQUIRED');
  }
  const references = authorityReferences(input);
  if (!references) return hold('E_CONTAINMENT_HOLD_AUTHORITY_REFERENCE_INVALID');
  if (!input.workspace || typeof input.workspace !== 'object') {
    return hold('E_CONTAINMENT_HOLD_WORKSPACE_REQUIRED');
  }
  if (input.workspace.runNonce !== input.runNonce) {
    return hold('E_CONTAINMENT_HOLD_RUN_NONCE_MISMATCH');
  }
  if (typeof input.resourceType !== 'string'
    || typeof input.resourceId !== 'string'
    || input.resourceId.length === 0
    || input.executionAdapter?.resourceType !== input.resourceType) {
    return hold('E_CONTAINMENT_HOLD_RESOURCE_IDENTITY_INVALID');
  }
  const recoveryRef = input.recoveryRef ?? input.executionAdapter.recoveryRef;
  if (!validReference(recoveryRef)) {
    return hold('E_CONTAINMENT_HOLD_RECOVERY_REFERENCE_INVALID');
  }
  let descriptor;
  try {
    descriptor = candidateDescriptor(input.candidate, input.workspace);
  } catch {
    descriptor = null;
  }
  if (!descriptor) return hold('E_CONTAINMENT_HOLD_BOOTSTRAP_CANDIDATE_REQUIRED');
  const planReference = validReference(input.planRef)
    ? { ok: true, value: input.planRef }
    : containmentDigestRef(input.adapterPlan);
  if (!planReference.ok) {
    return hold('E_CONTAINMENT_HOLD_ADAPTER_PLAN_REFERENCE_INVALID');
  }

  const randomSource = input.randomBytes ?? randomBytes;
  const now = input.now ?? (() => new Date().toISOString());
  const operations = {
    recordPrepareIntent: input.recordPrepareIntent
      ?? ((intent, authoritySession) => recordCiContainmentPrepareIntent(
        input.workspace,
        intent,
        authoritySession,
      )),
    claimResource: input.claimResource
      ?? (identity => claimCiContainmentResource(input.workspace, identity)),
    authorizeBirth: input.authorizeBirth
      ?? (evidence => authorizeCiCandidateBirth(input.workspace, evidence)),
    recordRunning: input.recordRunning
      ?? (evidence => recordCiContainmentRunning(input.workspace, evidence)),
    recordCompletion: input.recordCompletion
      ?? (evidence => recordCiContainmentCompletion(input.workspace, evidence)),
    recordFinality: input.recordFinality
      ?? (evidence => recordCiContainmentFinality(input.workspace, evidence)),
    acceptCleanupAuthority: input.acceptCleanupAuthority,
    execute: input.executeOwned ?? executeOwnedCandidate,
    prepareResource: input.prepareResource
      ?? input.executionAdapter.prepareSuspendedResource
      ?? input.executionAdapter.prepareClaimedResource,
  };
  if (Object.values(operations).some(operation => typeof operation !== 'function')) {
    return hold('E_CONTAINMENT_HOLD_SUPERVISOR_OPERATION_INVALID');
  }

  let authoritySession;
  let claimNonce;
  let issuedAt;
  try {
    const sessionResult = createContainmentAuthoritySession({ randomBytes: randomSource });
    if (!sessionResult.ok) {
      return hold(reasonCode(
        sessionResult,
        'E_CONTAINMENT_HOLD_AUTHORITY_SECRET_CREATION',
      ));
    }
    authoritySession = sessionResult.value;
    const nonceBytes = randomSource(32);
    if (!(nonceBytes instanceof Uint8Array) || nonceBytes.byteLength !== 32) {
      throw new Error('E_CONTAINMENT_HOLD_RANDOM_SOURCE_INVALID');
    }
    claimNonce = Buffer.from(nonceBytes).toString('hex');
    issuedAt = now();
  } catch (error) {
    if (authoritySession) closeContainmentAuthoritySession(authoritySession);
    return hold(reasonCode(error, 'E_CONTAINMENT_HOLD_RANDOM_SOURCE_INVALID'));
  }

  const executionIntentReference = containmentDigestRef({
    schemaVersion: 1,
    kind: 'containment-execution-intent',
    runNonce: input.runNonce,
    adapterId,
    candidate: descriptor,
    limits: input.limits ?? {},
    planRef: planReference.value,
  });
  if (!executionIntentReference.ok) {
    closeContainmentAuthoritySession(authoritySession);
    return hold('E_CONTAINMENT_HOLD_EXECUTION_INTENT_REFERENCE');
  }

  try {
  try {
    await operations.recordPrepareIntent({
      adapterId,
      resourceType: input.resourceType,
      claimNonce,
      planRef: planReference.value,
      recoveryRef,
      ...references,
      executionIntentRef: executionIntentReference.value,
    }, authoritySession);
  } catch (error) {
    return hold(reasonCode(error, 'E_CONTAINMENT_HOLD_PREPARE_INTENT'));
  }

  let preparedResource;
  let identity;
  try {
    preparedResource = await operations.prepareResource({
      runNonce: input.runNonce,
      adapterId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      claimNonce,
      recoveryRef,
      preparedAt: issuedAt,
    });
    if (!preparedResourceMatches(preparedResource, {
      adapterId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    })) {
      return hold('E_CONTAINMENT_HOLD_PREPARED_RESOURCE_INVALID');
    }
    identity = validateContainmentResourceIdentity(preparedResource.identity);
    if (identity.runNonce !== input.runNonce
      || identity.adapterId !== adapterId
      || identity.resourceType !== input.resourceType
      || identity.resourceId !== input.resourceId
      || identity.claimNonce !== claimNonce
      || identity.recoveryRef !== recoveryRef) {
      return hold('E_CONTAINMENT_HOLD_RESOURCE_IDENTITY_BINDING');
    }
  } catch (error) {
    return hold(reasonCode(error, 'E_CONTAINMENT_HOLD_RESOURCE_PREPARATION'));
  }

  let durableClaim;
  try {
    durableClaim = await operations.claimResource(identity);
  } catch (error) {
    return hold(reasonCode(error, 'E_CONTAINMENT_HOLD_DURABLE_RESOURCE_CLAIM'));
  }
  if (!durableClaim
    || durableClaim.runNonce !== input.runNonce
    || durableClaim.identity?.adapterId !== adapterId
    || !/^[a-f0-9]{64}$/u.test(durableClaim.identityDigest ?? '')) {
    return hold('E_CONTAINMENT_HOLD_DURABLE_RESOURCE_CLAIM_INVALID');
  }
  const resourceIdentityRef = `sha256:${durableClaim.identityDigest}`;
  const seenFacetEvidence = {
    refs: new Set(),
    bindingRefs: new Set(),
  };
  const claimedPreparedResource = Object.freeze({
    state: preparedResource.state,
    verified: preparedResource.verified,
    adapterId: preparedResource.adapterId,
    resourceType: preparedResource.resourceType,
    resourceId: preparedResource.resourceId,
    identityDigest: durableClaim.identityDigest,
    spawn: preparedResource.spawn.bind(preparedResource),
    terminateAndVerify:
      preparedResource.terminateAndVerify.bind(preparedResource),
  });
  const facetAuthorityBinding = bindContainmentAuthoritySessionFacetAuthority({
    session: authoritySession,
    runNonce: input.runNonce,
    adapterId,
    boundaryClass,
    authorityRef: references.controlPlaneRef,
    policyRef: references.policyRef,
    resourceIdentityRef,
    executionIntentRef: executionIntentReference.value,
  });
  if (!facetAuthorityBinding.ok) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold(reasonCode(
      facetAuthorityBinding,
      'E_CONTAINMENT_HOLD_FACET_AUTHORITY_BINDING',
    ));
  }
  const admissionFacetEvidence = recordSessionFacetEvidence(
    authoritySession,
    'admission',
    input.admissionFacets,
    seenFacetEvidence,
  );
  if (!admissionFacetEvidence.ok) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold(admissionFacetEvidence.code);
  }
  const admissionResult = evaluateContainmentAdmissionWithSession({
    session: authoritySession,
    mode: 'enforce',
    adapterId,
    adapterState: 'AVAILABLE',
    boundaryClass,
    facets: admissionFacetEvidence.value,
  });
  if (!admissionResult.ok
    || admissionResult.value?.state !== 'ADMITTED'
    || admissionResult.value.proofEligible !== false) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold(
      reasonCode(
        admissionResult?.value ?? admissionResult,
        'E_CONTAINMENT_HOLD_STRONG_ADMISSION_REQUIRED',
      ),
      { admission: admissionResult?.value },
    );
  }
  const admission = admissionResult.value;
  const claimResult = createContainmentAuthorityClaimWithSession({
    session: authoritySession,
    runNonce: input.runNonce,
    claimNonce,
    issuedAt,
    ...references,
    resourceIdentityRef,
    executionIntentRef: executionIntentReference.value,
    admission,
  });
  if (!claimResult.ok) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold(reasonCode(claimResult, 'E_CONTAINMENT_HOLD_AUTHORITY_CLAIM'));
  }
  const authorityClaim = claimResult.value;
  let runningRecorded = false;
  let completionRecorded = false;
  let executionRef;
  let completionRef;
  const bootstrap = await bootstrapClaimedProcess({
    durableClaim,
    authorizeCandidateBirth: identityDigest => operations.authorizeBirth({
      identityDigest,
      authoritySession,
      authorityClaim,
    }),
    spawnCandidate: async binding => {
      return operations.execute({
        candidate: input.candidate,
        preparedResource: claimedPreparedResource,
        limits: input.limits,
        binding,
        onCandidateBirth: async () => {
          await operations.recordRunning({
            identityDigest: durableClaim.identityDigest,
            executionIntentRef: executionIntentReference.value,
            birthObserved: true,
          });
          runningRecorded = true;
        },
        onCompletion: async outcome => {
          const execution = containmentDigestRef({
            schemaVersion: 1,
            kind: 'containment-execution',
            executionIntentRef: executionIntentReference.value,
            outcome,
          });
          if (!execution.ok) {
            throw new Error('E_CONTAINMENT_HOLD_EXECUTION_REFERENCE');
          }
          const reference = containmentDigestRef({
            schemaVersion: 1,
            kind: 'containment-host-completion',
            executionIntentRef: executionIntentReference.value,
            executionRef: execution.value,
            outcome,
          });
          if (!reference.ok) {
            throw new Error('E_CONTAINMENT_HOLD_COMPLETION_REFERENCE');
          }
          await operations.recordCompletion({
            identityDigest: durableClaim.identityDigest,
            executionIntentRef: executionIntentReference.value,
            executionRef: execution.value,
            completionRef: reference.value,
            hostOwned: true,
          });
          executionRef = execution.value;
          completionRef = reference.value;
          completionRecorded = true;
        },
      });
    },
  });
  if (bootstrap.state !== 'STARTED') {
    if (durableClaim?.identityDigest) {
      await persistUnprovenFinality(operations, durableClaim.identityDigest);
    }
    return hold(bootstrap.code, {
      candidateBirth: bootstrap.candidateBirth,
      nonIpcGo: bootstrap.nonIpcGo === true,
    });
  }

  const execution = bootstrap.execution;
  if (!runningRecorded
    || !completionRecorded
    || !validReference(executionRef)
    || !validReference(completionRef)) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold('E_CONTAINMENT_HOLD_LIFECYCLE_EVIDENCE_MISSING', {
      candidateBirth: bootstrap.candidateBirth,
      execution,
    });
  }
  const physicalFinalityProven = execution.finality?.status === 'PROVEN'
    && execution.finality.terminationVerified === true
    && execution.finality.adapterIdentityVerified === true;
  if (!physicalFinalityProven) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold('E_CONTAINMENT_HOLD_FINALITY_UNKNOWN', {
      candidateBirth: bootstrap.candidateBirth,
      execution,
    });
  }
  const settlementRef = containmentDigestRef({
    schemaVersion: 1,
    kind: 'containment-settlement',
    executionIntentRef: executionIntentReference.value,
    executionRef,
    completionRef,
    finality: execution.finality,
  });
  if (!settlementRef.ok) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold('E_CONTAINMENT_HOLD_EXECUTION_DIGEST', { execution });
  }
  const settlementFacetEvidence = recordSessionFacetEvidence(
    authoritySession,
    'settlement',
    input.settlementFacets,
    seenFacetEvidence,
  );
  if (!settlementFacetEvidence.ok) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold(settlementFacetEvidence.code, {
      candidateBirth: bootstrap.candidateBirth,
      execution,
    });
  }
  const proofResult = evaluateContainmentProofEligibilityWithSession({
    session: authoritySession,
    admission,
    executionState: execution.state,
    facets: settlementFacetEvidence.value,
    executionRef,
    settlementRef: settlementRef.value,
    completionRef,
  });
  if (!proofResult.ok) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold(
      reasonCode(
        proofResult,
        'E_CONTAINMENT_HOLD_PROOF_AUTHORITY_INVALID',
      ),
      {
        candidateBirth: bootstrap.candidateBirth,
        execution,
      },
    );
  }
  const proof = proofResult.value;
  if (proof.state !== 'ELIGIBLE' || proof.proofEligible !== true) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold(proof.reasonCode, {
      candidateBirth: bootstrap.candidateBirth,
      execution,
      proof,
    });
  }

  const receiptResult = createContainmentAuthorityReceiptWithSession({
    session: authoritySession,
    claim: authorityClaim,
    admission,
    proof,
    executionRef,
    completionRef,
    settlementRef: settlementRef.value,
  });
  if (!receiptResult.ok) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold(reasonCode(
      receiptResult,
      'E_CONTAINMENT_HOLD_RECEIPT_CREATION',
    ), { execution });
  }

  let transportedReceipt;
  try {
    transportedReceipt = input.receiptTransport
      ? await input.receiptTransport(receiptResult.value)
      : receiptResult.value;
  } catch {
    transportedReceipt = null;
  }
  const receiptVerification = transportedReceipt
    ? verifyContainmentAuthorityReceiptWithSession({
        receipt: transportedReceipt,
        session: authoritySession,
      })
    : null;
  if (!receiptVerification?.ok) {
    await persistUnprovenFinality(operations, durableClaim.identityDigest);
    return hold(
      transportedReceipt
        ? 'E_CONTAINMENT_HOLD_RECEIPT_FORGED'
        : 'E_CONTAINMENT_HOLD_RECEIPT_MISSING',
      {
        candidateBirth: bootstrap.candidateBirth,
        execution,
      },
    );
  }

  let persistedFinality;
  try {
    persistedFinality = await operations.recordFinality({
      status: 'PROVEN',
      identityDigest: durableClaim.identityDigest,
      authoritySession,
      authorityReceipt: receiptVerification.value,
      resourceReleased: true,
      releaseRef: receiptVerification.value.settlementRef,
    });
  } catch {
    persistedFinality = null;
  }
  if (!persistedFinality) {
    return hold('E_CONTAINMENT_HOLD_FINALITY_PERSISTENCE', {
      receipt: receiptVerification.value,
      execution,
    });
  }
  if (!persistedFinality.cleanupAuthority
    || typeof persistedFinality.cleanupAuthority !== 'object') {
    return hold('E_CONTAINMENT_HOLD_CLEANUP_AUTHORITY_MISSING', {
      receipt: receiptVerification.value,
      execution,
    });
  }
  try {
    await operations.acceptCleanupAuthority(persistedFinality.cleanupAuthority);
  } catch {
    return hold('E_CONTAINMENT_HOLD_CLEANUP_AUTHORITY_HANDOFF', {
      receipt: receiptVerification.value,
      execution,
    });
  }

  return {
    state: 'GO',
    code: 'CONTAINMENT_GO',
    proofEligible: true,
    receiptAuthenticated: true,
    retain: false,
    candidateBirth: bootstrap.candidateBirth,
    receipt: receiptVerification.value,
    claimRef: authorityClaim.claimRef,
    proof,
    execution,
    finality: {
      status: 'PROVEN',
      authenticated: true,
      terminationVerified: true,
      adapterIdentityVerified: true,
    },
  };
  } finally {
    closeContainmentAuthoritySession(authoritySession);
  }
}
