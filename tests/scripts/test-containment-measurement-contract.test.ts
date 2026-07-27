import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import {
  createContainmentCoseProtectedHeaders,
  createContainmentCoseSign1,
  createContainmentExternalAad,
} from '../../scripts/hermeticity/evidence/cose-sign1-contract.mjs';
import * as measurementContract
  from '../../scripts/hermeticity/evidence/measurement-contract.mjs';
import {
  CONTAINMENT_MEASUREMENT_REQUIREMENTS,
  CONTAINMENT_MEASUREMENT_MAX_BYTES,
  CONTAINMENT_RECEIPT_KINDS,
  containmentCanonicalDigest,
  containmentCredentialSubjectDigest,
  containmentEvidenceDigest,
  createContainmentAuthorizationPayload,
  createContainmentComponentPayload,
  createContainmentEvidenceEnvelope,
  createContainmentMeasurementReceipt,
  validateContainmentMeasurementDiagnosticSequence,
  validateContainmentMeasurementEnvelopeChain,
} from '../../scripts/hermeticity/evidence/measurement-contract.mjs';
import {
  CONTAINMENT_PLATFORM_COMPONENT_ROLE_AUTHORITY,
} from '../../scripts/hermeticity/evidence/platform-evidence-policy.mjs';

type Lineage = {
  issuerId: string;
  authorityRole: string;
  parentIssuerId: string | null;
  enrollmentId: string;
  enrollmentDigest: Uint8Array;
  keyId: Uint8Array;
  keyEpoch: number;
  algorithm: string;
  curve: string;
};

type CredentialSubject = {
  authorityId: string;
  authorityRole: string;
  parentAuthorityId: string | null;
  enrollmentId: string;
  keyId: Uint8Array;
  keyEpoch: number;
  algorithm: string;
  curve: string;
};

type BuildOverrides = {
  badPreviousAt?: number;
  challengeAt?: number;
  lineageAt?: number;
  contradictedAt?: number;
  missingCredentialFor?: string;
  badAdmissionRefAt?: number;
  badCleanupRefAt?: number;
  wrongAdmissionAuthorizedEnvelope?: boolean;
  wrongAdmissionTarget?: boolean;
  wrongAdmissionFence?: boolean;
  wrongCleanupAuthorizedEnvelope?: boolean;
  wrongCleanupTarget?: boolean;
  wrongCleanupFence?: boolean;
  wrongAdmissionIssuer?: boolean;
  platformClass?:
    | 'linux-native'
    | 'darwin-terminal'
    | 'darwin-signed-app'
    | 'darwin-virtualized-kernel'
    | 'win32-native'
    | 'wsl2'
    | 'oci-rootless';
  wrongComponentRoleAt?: number;
  wrongComponentMeasurementAt?: number;
  duplicateComponentAt?: number;
  reversedComponentRolesAt?: number;
  wrongComponentPlatformAt?: number;
  sharedComponentAuthorityAt?: number;
};

function digest(seed: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
}

function compareAscii(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function validEsp256Signature(seed: number): Uint8Array {
  const signature = new Uint8Array(64);
  signature[31] = (seed % 250) + 1;
  signature[63] = ((seed + 1) % 250) + 1;
  return signature;
}

function mustCanonicalDigest(value: unknown): Uint8Array {
  const result = containmentCanonicalDigest(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value.bytes;
}

function mustEvidenceDigest(value: Uint8Array): Uint8Array {
  const result = containmentEvidenceDigest(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value.bytes;
}

function subject(
  authorityId: string,
  authorityRole: string,
  parentAuthorityId: string | null,
  seed: number,
): CredentialSubject {
  return {
    authorityId,
    authorityRole,
    parentAuthorityId,
    enrollmentId: `enrollment-${authorityId}`,
    keyId: digest(seed),
    keyEpoch: authorityId === 'attestor-001' ? 4 : 7,
    algorithm: 'ESP256',
    curve: 'P-256',
  };
}

function lineageFromSubject(
  value: CredentialSubject,
  enrollmentDigest: Uint8Array,
): Lineage {
  return {
    issuerId: value.authorityId,
    authorityRole: value.authorityRole,
    parentIssuerId: value.parentAuthorityId,
    enrollmentId: value.enrollmentId,
    enrollmentDigest,
    keyId: value.keyId,
    keyEpoch: value.keyEpoch,
    algorithm: value.algorithm,
    curve: value.curve,
  };
}

function nodeFromLineage(value: Lineage, platformClass: string) {
  return {
    authorityId: value.issuerId,
    authorityRole: value.authorityRole,
    parentAuthorityId: value.parentIssuerId,
    platformClass,
    enrollmentId: value.enrollmentId,
    enrollmentDigest: value.enrollmentDigest,
    keyId: value.keyId,
    keyEpoch: value.keyEpoch,
    algorithm: value.algorithm,
    curve: value.curve,
  };
}

function phaseBindings(sequence: number, platformClass = 'linux-native') {
  return {
    tenantId: 'tenant-001',
    projectId: 'project-001',
    workspaceId: 'workspace-001',
    goalId: 'goal-001',
    missionId: 'mission-001',
    flowId: 'flow-001',
    runId: 'run-001',
    workItemId: 'work-item-001',
    attemptId: 'attempt-001',
    operationId: 'operation-001',
    executionInstanceId: 'execution-instance-001',
    platformClass,
    platformInstanceId: 'linux-host-001',
    policyId: 'containment-policy',
    policyVersion: 'v2.0.0',
    policyDigest: digest(1),
    controlPlaneDigest: digest(2),
    fencingTokenDigest: sequence >= 3 ? digest(6) : null,
    projectionDigest: sequence >= 2 ? digest(3) : null,
    executionDigest: digest(4),
    resourceDigest: sequence >= 3 ? digest(5) : null,
  };
}

function phaseMeasurements(
  kind: keyof typeof CONTAINMENT_MEASUREMENT_REQUIREMENTS,
  contradictedType?: string,
) {
  return CONTAINMENT_MEASUREMENT_REQUIREMENTS[kind].map((type, index) => ({
    type,
    source: index % 2 === 0 ? 'native-attestor' : 'kernel',
    digestAlgorithm: 'sha-256',
    digest: digest(index + 20),
    status: type === contradictedType ? 'CONTRADICTED' : 'MEASURED',
  }));
}

function measurementDigest(
  kind: keyof typeof CONTAINMENT_MEASUREMENT_REQUIREMENTS,
  type: string,
) {
  const entry = phaseMeasurements(kind).find(item => item.type === type);
  if (!entry) throw new Error(`missing measurement ${type}`);
  return entry.digest;
}

function mustProtected(value: Lineage): Uint8Array {
  const result = createContainmentCoseProtectedHeaders({
    algorithm: value.algorithm,
    keyId: value.keyId,
    profile: 'fips',
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value.protectedHeaders;
}

function mustAad(input: {
  kind: string;
  sequence: number;
  challenge: Uint8Array;
  bindingsDigest: Uint8Array;
  lineage: Lineage;
  componentRole: string;
}): Uint8Array {
  const result = createContainmentExternalAad({
    protocol: 'deckent.containment.v2',
    schemaVersion: 2,
    kind: input.kind,
    sequence: input.sequence,
    challenge: input.challenge,
    bindingsDigest: input.bindingsDigest,
    controlPlaneEpoch: 6,
    issuerRole: input.lineage.authorityRole.replaceAll('-', '_').toUpperCase(),
    componentRole: input.componentRole,
    issuerLineageDigest: mustCanonicalDigest(input.lineage),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value.bytes;
}

function mustSign(
  payload: Uint8Array,
  externalAad: Uint8Array,
  value: Lineage,
  seed: number,
): Uint8Array {
  const result = createContainmentCoseSign1({
    protectedHeaders: mustProtected(value),
    externalAad,
    payload,
    signature: validEsp256Signature(seed),
    profile: 'fips',
    expectedKeyId: value.keyId,
    expectedAlgorithm: -9,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value.bytes;
}

function makeCredential(
  credentialSubject: CredentialSubject,
  issuer: Lineage,
  challenge: Uint8Array,
  bindingsDigest: Uint8Array,
  seed: number,
) {
  const subjectDigest = containmentCredentialSubjectDigest(credentialSubject);
  expect(subjectDigest.ok).toBe(true);
  if (!subjectDigest.ok) throw new Error(subjectDigest.hold.reasonCode);
  const artifactId = `credential-${credentialSubject.authorityId}`;
  const payload = createContainmentAuthorizationPayload({
    kind: 'ENROLLMENT_CREDENTIAL',
    sequence: 0,
    artifactId,
    challenge,
    bindingsDigest,
    subjectAuthorityId: credentialSubject.authorityId,
    credentialSubjectDigest: subjectDigest.value.bytes,
    issuerLineageDigest: mustCanonicalDigest(issuer),
  });
  expect(payload.ok).toBe(true);
  if (!payload.ok) throw new Error(payload.hold.reasonCode);
  const externalAad = mustAad({
    kind: 'ENROLLMENT_CREDENTIAL',
    sequence: 0,
    challenge,
    bindingsDigest,
    lineage: issuer,
    componentRole: 'AUTHORIZATION_ARTIFACT',
  });
  const envelope = mustSign(payload.value.bytes, externalAad, issuer, seed);
  return {
    artifact: {
      artifactId,
      kind: 'ENROLLMENT_CREDENTIAL',
      issuerId: issuer.issuerId,
      authorityRole: issuer.authorityRole,
      subjectAuthorityId: credentialSubject.authorityId,
      subjectExecutionInstanceId: null,
      signed: { envelope, externalAad },
    },
    enrollmentDigest: mustEvidenceDigest(envelope),
  };
}

function buildAuthority(
  challenge: Uint8Array,
  bindingsDigest: Uint8Array,
  platformClass: string,
) {
  const rootSubject = subject('root-001', 'root-trust', null, 40);
  const controlSubject = subject(
    'control-001',
    'control-plane',
    'root-001',
    50,
  );
  const attestorSubject = subject(
    'attestor-001',
    'platform-attestor',
    'control-001',
    60,
  );
  const cleanupSubject = subject(
    'cleanup-001',
    'cleanup-authority',
    'control-001',
    70,
  );
  const runtimeSubject = subject(
    'runtime-001',
    'runtime-attestor',
    'attestor-001',
    80,
  );
  const root = lineageFromSubject(rootSubject, digest(41));
  const controlCredential = makeCredential(
    controlSubject,
    root,
    challenge,
    bindingsDigest,
    89,
  );
  const control = lineageFromSubject(
    controlSubject,
    controlCredential.enrollmentDigest,
  );
  const attestorCredential = makeCredential(
    attestorSubject,
    control,
    challenge,
    bindingsDigest,
    90,
  );
  const attestor = lineageFromSubject(
    attestorSubject,
    attestorCredential.enrollmentDigest,
  );
  const cleanupCredential = makeCredential(
    cleanupSubject,
    control,
    challenge,
    bindingsDigest,
    91,
  );
  const cleanup = lineageFromSubject(
    cleanupSubject,
    cleanupCredential.enrollmentDigest,
  );
  const runtimeCredential = makeCredential(
    runtimeSubject,
    attestor,
    challenge,
    bindingsDigest,
    92,
  );
  const runtime = lineageFromSubject(
    runtimeSubject,
    runtimeCredential.enrollmentDigest,
  );
  return {
    lineages: { root, control, attestor, cleanup, runtime },
    credentials: [
      attestorCredential.artifact,
      cleanupCredential.artifact,
      controlCredential.artifact,
      runtimeCredential.artifact,
    ],
    graph: {
      nodes: [
        nodeFromLineage(attestor, platformClass),
        nodeFromLineage(cleanup, platformClass),
        nodeFromLineage(control, platformClass),
        nodeFromLineage(root, platformClass),
        nodeFromLineage(runtime, platformClass),
      ],
      edges: [
        {
          parentAuthorityId: 'attestor-001',
          childAuthorityId: 'runtime-001',
          relationship: 'DELEGATES',
        },
        {
          parentAuthorityId: 'control-001',
          childAuthorityId: 'attestor-001',
          relationship: 'DELEGATES',
        },
        {
          parentAuthorityId: 'control-001',
          childAuthorityId: 'cleanup-001',
          relationship: 'DELEGATES',
        },
        {
          parentAuthorityId: 'root-001',
          childAuthorityId: 'control-001',
          relationship: 'DELEGATES',
        },
      ],
    },
  };
}

function makeComponent(
  sequence: number,
  componentId: string,
  componentRole: string,
  issuer: Lineage,
  challenge: Uint8Array,
  bindingsDigest: Uint8Array,
  platformClass: string,
  receiptMeasurementSetDigest: Uint8Array,
  seed: number,
) {
  const payload = createContainmentComponentPayload({
    sequence,
    componentId,
    componentRole,
    platformClass,
    challenge,
    bindingsDigest,
    issuerLineageDigest: mustCanonicalDigest(issuer),
    measurementDigest: receiptMeasurementSetDigest,
  });
  expect(payload.ok).toBe(true);
  if (!payload.ok) throw new Error(payload.hold.reasonCode);
  const externalAad = mustAad({
    kind: 'COMPONENT_ATTESTATION',
    sequence,
    challenge,
    bindingsDigest,
    lineage: issuer,
    componentRole,
  });
  return {
    componentId,
    componentRole,
    platformClass,
    authorityId: issuer.issuerId,
    signed: {
      envelope: mustSign(payload.value.bytes, externalAad, issuer, seed),
      externalAad,
    },
  };
}

function makeGrant(input: {
  kind: 'ADMISSION_GRANT' | 'CLEANUP_GRANT';
  issuer: Lineage;
  challenge: Uint8Array;
  bindingsDigest: Uint8Array;
  authorizedEnvelopeDigest: Uint8Array;
  resourceDigest: Uint8Array;
  targetSetDigest: Uint8Array;
  fencingTokenDigest: Uint8Array;
  seed: number;
}) {
  const admission = input.kind === 'ADMISSION_GRANT';
  const sequence = admission ? 4 : 8;
  const artifactId = admission ? 'grant-admission' : 'grant-cleanup';
  const payload = createContainmentAuthorizationPayload({
    kind: input.kind,
    sequence,
    artifactId,
    challenge: input.challenge,
    bindingsDigest: input.bindingsDigest,
    subjectAuthorityId: null,
    subjectExecutionInstanceId: 'execution-instance-001',
    issuerLineageDigest: mustCanonicalDigest(input.issuer),
    authorizedAfterSequence: admission ? 3 : 7,
    authorizedEnvelopeDigest: input.authorizedEnvelopeDigest,
    resourceDigest: input.resourceDigest,
    targetSetDigest: input.targetSetDigest,
    fencingTokenDigest: input.fencingTokenDigest,
  });
  expect(payload.ok).toBe(true);
  if (!payload.ok) throw new Error(payload.hold.reasonCode);
  const externalAad = mustAad({
    kind: input.kind,
    sequence,
    challenge: input.challenge,
    bindingsDigest: input.bindingsDigest,
    lineage: input.issuer,
    componentRole: 'AUTHORIZATION_ARTIFACT',
  });
  return {
    artifactId,
    kind: input.kind,
    issuerId: input.issuer.issuerId,
    authorityRole: input.issuer.authorityRole,
    subjectAuthorityId: null,
    subjectExecutionInstanceId: 'execution-instance-001',
    signed: {
      envelope: mustSign(
        payload.value.bytes,
        externalAad,
        input.issuer,
        input.seed,
      ),
      externalAad,
    },
  };
}

function buildChain(overrides: BuildOverrides = {}) {
  const platformClass = overrides.platformClass ?? 'linux-native';
  const trustedChallenge = digest(10);
  const initialBindingsDigest = mustCanonicalDigest(
    phaseBindings(0, platformClass),
  );
  const authority = buildAuthority(
    trustedChallenge,
    initialBindingsDigest,
    platformClass,
  );
  const { control, attestor, cleanup, runtime } = authority.lineages;
  const evidenceEnvelopes: Uint8Array[] = [];
  const evidenceValues: Array<{ bytes: Uint8Array; payload: any }> = [];
  const evidenceInputs: any[] = [];
  const receiptBytes: Uint8Array[] = [];
  const receiptValues: any[] = [];
  const authorizationKinds: string[][] = [];
  let previousEnvelopeDigest: Uint8Array | null = null;
  let admissionGrant: ReturnType<typeof makeGrant> | null = null;
  let cleanupGrant: ReturnType<typeof makeGrant> | null = null;
  for (let sequence = 0; sequence < CONTAINMENT_RECEIPT_KINDS.length; sequence += 1) {
    const challenge = overrides.challengeAt === sequence
      ? digest(11)
      : trustedChallenge;
    const bindings = phaseBindings(sequence, platformClass);
    const bindingsDigest = mustCanonicalDigest(bindings);
    const kind = CONTAINMENT_RECEIPT_KINDS[sequence] as
      keyof typeof CONTAINMENT_MEASUREMENT_REQUIREMENTS;
    const contradictedType = overrides.contradictedAt === sequence
      ? CONTAINMENT_MEASUREMENT_REQUIREMENTS[kind][0]
      : undefined;
    const measurements = [
      ...phaseMeasurements(kind, contradictedType),
    ].sort((left, right) => compareAscii(left.type, right.type));
    const receiptMeasurementSetDigest =
      overrides.wrongComponentMeasurementAt === sequence
        ? digest(235)
        : mustCanonicalDigest(measurements);
    const requiredRoles =
      CONTAINMENT_PLATFORM_COMPONENT_ROLE_AUTHORITY[platformClass];
    const componentRoles = overrides.reversedComponentRolesAt === sequence
      ? [...requiredRoles].reverse()
      : [...requiredRoles];
    if (overrides.wrongComponentRoleAt === sequence) {
      componentRoles[0] = 'EXTRANEOUS';
    }
    const components = componentRoles.map((componentRole, index) => (
      makeComponent(
        sequence,
        `platform-component-${index}`,
        componentRole,
        index === 0 || overrides.sharedComponentAuthorityAt === sequence
          ? attestor
          : runtime,
        challenge,
        bindingsDigest,
        overrides.wrongComponentPlatformAt === sequence
          ? 'linux-native'
          : platformClass,
        receiptMeasurementSetDigest,
        100 + (sequence * 4) + index,
      )
    ));
    if (overrides.duplicateComponentAt === sequence) {
      components.push(makeComponent(
        sequence,
        `platform-component-${components.length}`,
        requiredRoles[0],
        runtime,
        challenge,
        bindingsDigest,
        platformClass,
        receiptMeasurementSetDigest,
        130 + sequence,
      ));
    }
    if (sequence === 4) {
      const grantIssuer = overrides.wrongAdmissionIssuer ? attestor : control;
      admissionGrant = makeGrant({
        kind: 'ADMISSION_GRANT',
        issuer: grantIssuer,
        challenge: trustedChallenge,
        bindingsDigest,
        authorizedEnvelopeDigest: overrides.wrongAdmissionAuthorizedEnvelope
          ? digest(210)
          : previousEnvelopeDigest!,
        resourceDigest: bindings.resourceDigest!,
        targetSetDigest: overrides.wrongAdmissionTarget
          ? digest(211)
          : measurementDigest('ADMISSION', 'descriptor-set'),
        fencingTokenDigest: overrides.wrongAdmissionFence
          ? digest(212)
          : bindings.fencingTokenDigest!,
        seed: 140,
      });
    }
    if (sequence === 8) {
      cleanupGrant = makeGrant({
        kind: 'CLEANUP_GRANT',
        issuer: cleanup,
        challenge: trustedChallenge,
        bindingsDigest,
        authorizedEnvelopeDigest: overrides.wrongCleanupAuthorizedEnvelope
          ? digest(220)
          : previousEnvelopeDigest!,
        resourceDigest: bindings.resourceDigest!,
        targetSetDigest: overrides.wrongCleanupTarget
          ? digest(221)
          : measurementDigest('CLEANUP_COMMIT', 'cleanup-target-set'),
        fencingTokenDigest: overrides.wrongCleanupFence
          ? digest(222)
          : bindings.fencingTokenDigest!,
        seed: 150,
      });
    }
    const credentials = sequence === 0
      ? authority.credentials.filter(artifact => (
        artifact.subjectAuthorityId !== overrides.missingCredentialFor
      ))
      : [];
    const authorizationArtifacts = [
      ...credentials,
      ...(admissionGrant ? [admissionGrant] : []),
      ...(cleanupGrant ? [cleanupGrant] : []),
    ];
    authorizationKinds.push(
      authorizationArtifacts.map(artifact => artifact.kind),
    );
    const lineage = overrides.lineageAt === sequence
      ? { ...attestor, keyId: digest(230) }
      : attestor;
    const admissionDigest = admissionGrant
      ? mustEvidenceDigest(admissionGrant.signed.envelope)
      : null;
    const cleanupDigest = cleanupGrant
      ? mustEvidenceDigest(cleanupGrant.signed.envelope)
      : null;
    const receipt = createContainmentMeasurementReceipt({
      kind,
      sequence,
      challenge,
      previousEnvelopeDigest: overrides.badPreviousAt === sequence
        ? digest(240)
        : previousEnvelopeDigest,
      epochs: { trust: 3, key: 4, session: 5, controlPlane: 6 },
      bindings,
      issuerLineage: lineage,
      artifactRefs: {
        authorityGraphDigest: mustCanonicalDigest(authority.graph),
        componentAttestationSetDigest: mustCanonicalDigest(components),
        authorizationArtifactSetDigest: mustCanonicalDigest(
          authorizationArtifacts,
        ),
        admissionGrantDigest: overrides.badAdmissionRefAt === sequence
          ? digest(250)
          : admissionDigest,
        cleanupGrantDigest: overrides.badCleanupRefAt === sequence
          ? digest(251)
          : cleanupDigest,
      },
      measurements,
      verdict: contradictedType
        ? {
          state: 'HOLD',
          reasonCode: 'E_CONTAINMENT_E2_TRUST_POLICY_HOLD',
        }
        : { state: 'OBSERVED', reasonCode: 'NONE' },
    });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) throw new Error(receipt.hold.reasonCode);
    receiptBytes.push(receipt.value.bytes);
    receiptValues.push(receipt.value);
    const receiptAad = mustAad({
      kind,
      sequence,
      challenge,
      bindingsDigest,
      lineage,
      componentRole: 'RECEIPT',
    });
    const receiptEnvelope = mustSign(
      receipt.value.bytes,
      receiptAad,
      lineage,
      170 + sequence,
    );
    const evidenceInput = {
      receipt: { envelope: receiptEnvelope, externalAad: receiptAad },
      componentAttestations: components,
      authorizationArtifacts,
      authorityGraph: authority.graph,
    };
    const evidence = createContainmentEvidenceEnvelope(evidenceInput);
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) throw new Error(evidence.hold.reasonCode);
    evidenceEnvelopes.push(evidence.value.bytes);
    evidenceValues.push(evidence.value);
    evidenceInputs.push(evidenceInput);
    previousEnvelopeDigest = mustEvidenceDigest(evidence.value.bytes);
  }
  return {
    trustedChallenge,
    expectedIssuerLineage: attestor,
    evidenceEnvelopes,
    evidenceValues,
    evidenceInputs,
    receiptBytes,
    receiptValues,
    authorizationKinds,
  };
}

function trustedOptions(chain: ReturnType<typeof buildChain>) {
  return {
    expectedChallenge: chain.trustedChallenge,
    expectedIssuerLineage: chain.expectedIssuerLineage,
    profile: 'fips',
  };
}

describe('containment E2 causal measurement authority', () => {
  it('keeps nine phases and consumes grants only after prepared/settled envelopes', () => {
    const chain = buildChain();
    expect(CONTAINMENT_RECEIPT_KINDS.at(-1)).toBe('CLEANUP_COMMIT');
    expect(chain.authorizationKinds[3]).toEqual([]);
    expect(chain.authorizationKinds[4]).toEqual(['ADMISSION_GRANT']);
    expect(chain.authorizationKinds[7]).toEqual(['ADMISSION_GRANT']);
    expect(chain.authorizationKinds[8]).toEqual([
      'ADMISSION_GRANT',
      'CLEANUP_GRANT',
    ]);
    expect(validateContainmentMeasurementEnvelopeChain(
      chain.evidenceEnvelopes,
      trustedOptions(chain),
    )).toMatchObject({
      ok: true,
      value: {
        verdictState: 'COMPLETE_OBSERVED',
        allObserved: true,
        envelopeLinksVerified: true,
        evidenceEnvelopeState: 'STRUCTURALLY_VALID',
        componentAuthorityCount: 1,
        activation: 'NOT_BORN',
        proofEligible: false,
        signatureVerified: false,
      },
    });
  });

  it('rejects arbitrary digest authority and recomputes full envelope links', () => {
    expect(
      'validateContainmentMeasurementReceiptChain' in measurementContract,
    ).toBe(false);
    const chain = buildChain();
    expect(validateContainmentMeasurementDiagnosticSequence(
      chain.receiptBytes.map((payload, index) => ({
        payload,
        receiptDigest: digest(180 + index),
      })),
      trustedOptions(chain),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID' },
    });
    const forked = buildChain({ badPreviousAt: 5 });
    expect(validateContainmentMeasurementEnvelopeChain(
      forked.evidenceEnvelopes,
      trustedOptions(forked),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_REPLAY_OR_FORK' },
    });
  });

  it('retains contradictory phase evidence in COMPLETE_HELD aggregation', () => {
    const chain = buildChain({ contradictedAt: 1 });
    const result = validateContainmentMeasurementEnvelopeChain(
      chain.evidenceEnvelopes,
      trustedOptions(chain),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        verdictState: 'COMPLETE_HELD',
        allObserved: false,
        primaryHoldReason: 'E_CONTAINMENT_E2_TRUST_POLICY_HOLD',
      },
    });
    if (!result.ok) throw new Error(result.hold.reasonCode);
    expect(result.value.phaseResults[1]).toMatchObject({
      kind: 'DISCOVERY',
      verdictState: 'HOLD',
      contradictedMeasurementTypes: ['platform-capabilities'],
    });
  });

  it.each([
    ['admission authorized envelope', { wrongAdmissionAuthorizedEnvelope: true }],
    ['admission target', { wrongAdmissionTarget: true }],
    ['admission fence', { wrongAdmissionFence: true }],
    ['cleanup authorized envelope', { wrongCleanupAuthorizedEnvelope: true }],
    ['cleanup target', { wrongCleanupTarget: true }],
    ['cleanup fence', { wrongCleanupFence: true }],
    ['admission issuer role', { wrongAdmissionIssuer: true }],
  ] as const)('rejects wrong causal %s binding', (_label, overrides) => {
    const chain = buildChain(overrides);
    expect(validateContainmentMeasurementEnvelopeChain(
      chain.evidenceEnvelopes,
      trustedOptions(chain),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_BINDING_MISMATCH' },
    });
  });

  it('requires exactly one parent-issued credential for every non-root authority', () => {
    const missing = buildChain({ missingCredentialFor: 'runtime-001' });
    expect(validateContainmentMeasurementEnvelopeChain(
      missing.evidenceEnvelopes,
      trustedOptions(missing),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_KEY_LINEAGE_INVALID' },
    });

    const valid = buildChain();
    const credentialKinds = valid.authorizationKinds[0];
    expect(credentialKinds).toEqual([
      'ENROLLMENT_CREDENTIAL',
      'ENROLLMENT_CREDENTIAL',
      'ENROLLMENT_CREDENTIAL',
      'ENROLLMENT_CREDENTIAL',
    ]);
    expect(valid.authorizationKinds.slice(1).every(
      kinds => !kinds.includes('ENROLLMENT_CREDENTIAL'),
    )).toBe(true);

    const first = valid.evidenceInputs[0];
    expect(createContainmentEvidenceEnvelope({
      receipt: first.receipt,
      componentAttestations: first.componentAttestations,
      authorizationArtifacts: [
        ...first.authorizationArtifacts,
        first.authorizationArtifacts[0],
      ],
      authorityGraph: first.authorityGraph,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_SCHEMA_INVALID' },
    });

    const secondRoot = lineageFromSubject(
      subject('root-002', 'root-trust', null, 93),
      digest(94),
    );
    expect(createContainmentEvidenceEnvelope({
      receipt: first.receipt,
      componentAttestations: first.componentAttestations,
      authorizationArtifacts: first.authorizationArtifacts,
      authorityGraph: {
        nodes: [
          ...first.authorityGraph.nodes,
          nodeFromLineage(secondRoot, 'linux-native'),
        ],
        edges: first.authorityGraph.edges,
      },
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_SCHEMA_INVALID' },
    });
  });

  it.each([
    'linux-native',
    'darwin-signed-app',
    'darwin-virtualized-kernel',
    'win32-native',
    'wsl2',
    'oci-rootless',
  ] as const)('enforces the exact %s component-role authority set', platformClass => {
    const chain = buildChain({ platformClass });
    expect(validateContainmentMeasurementEnvelopeChain(
      chain.evidenceEnvelopes,
      trustedOptions(chain),
    )).toMatchObject({
      ok: true,
      value: { verdictState: 'COMPLETE_OBSERVED' },
    });
  });

  it.each([
    ['missing/extra role', { wrongComponentRoleAt: 0 }],
    ['duplicate role', { duplicateComponentAt: 0 }],
    [
      'reversed canonical multi-role order',
      { platformClass: 'wsl2', reversedComponentRolesAt: 0 },
    ],
    [
      'cross-platform attestation',
      { platformClass: 'wsl2', wrongComponentPlatformAt: 0 },
    ],
    [
      'shared multi-role authority',
      { platformClass: 'wsl2', sharedComponentAuthorityAt: 0 },
    ],
  ] as const)('holds cross-module platform policy for %s', (_label, overrides) => {
    const chain = buildChain(overrides);
    expect(validateContainmentMeasurementEnvelopeChain(
      chain.evidenceEnvelopes,
      trustedOptions(chain),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_TRUST_POLICY_HOLD' },
    });
  });

  it('rejects unrelated component measurements and unsupported terminal mode', () => {
    const unrelated = buildChain({ wrongComponentMeasurementAt: 0 });
    expect(validateContainmentMeasurementEnvelopeChain(
      unrelated.evidenceEnvelopes,
      trustedOptions(unrelated),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_BINDING_MISMATCH' },
    });

    const terminal = buildChain({ platformClass: 'darwin-terminal' });
    expect(validateContainmentMeasurementEnvelopeChain(
      terminal.evidenceEnvelopes,
      trustedOptions(terminal),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_PLATFORM_UNSUPPORTED' },
    });
  });

  it('never delegates deterministic ordering to localeCompare', () => {
    const localeCompare = vi.spyOn(String.prototype, 'localeCompare')
      .mockImplementation(() => {
        throw new Error('locale-sensitive ordering is forbidden');
      });
    try {
      const chain = buildChain({ platformClass: 'wsl2' });
      expect(validateContainmentMeasurementEnvelopeChain(
        chain.evidenceEnvelopes,
        trustedOptions(chain),
      )).toMatchObject({
        ok: true,
        value: { verdictState: 'COMPLETE_OBSERVED' },
      });
    } finally {
      localeCompare.mockRestore();
    }
  });

  it('rejects trusted challenge and issuer lineage drift', () => {
    const challenge = buildChain({ challengeAt: 4 });
    expect(validateContainmentMeasurementEnvelopeChain(
      challenge.evidenceEnvelopes,
      trustedOptions(challenge),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_CHALLENGE_MISMATCH' },
    });
    const lineage = buildChain({ lineageAt: 4 });
    expect(validateContainmentMeasurementEnvelopeChain(
      lineage.evidenceEnvelopes,
      trustedOptions(lineage),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_KEY_LINEAGE_INVALID' },
    });
  });

  it('snapshots public bytes and accepts safe cross-realm Uint8Array values', () => {
    const crossRealm = runInNewContext('new Uint8Array([1, 2, 3, 4])');
    const result = containmentEvidenceDigest(crossRealm);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.hold.reasonCode);
    const first = result.value.bytes;
    const expected = result.value.bytes;
    first.fill(0);
    expect(result.value.bytes).toEqual(expected);

    const chain = buildChain();
    const receipt = chain.receiptValues[0].bytes;
    const original = receipt[0];
    receipt[0] ^= 0xff;
    expect(chain.receiptValues[0].bytes[0]).toBe(original);
    const policyDigest = chain.receiptValues[0].payload.bindings.policyDigest;
    const expectedPolicyDigest =
      chain.receiptValues[0].payload.bindings.policyDigest;
    policyDigest.fill(0);
    expect(
      chain.receiptValues[0].payload.bindings.policyDigest,
    ).toEqual(expectedPolicyDigest);

    class SpeciesTrapBytes extends Uint8Array {
      static get [Symbol.species]() {
        throw new Error('species must not execute');
      }
    }
    expect(() => containmentEvidenceDigest(
      new SpeciesTrapBytes([1, 2, 3]),
    )).not.toThrow();
  });

  it('rejects Proxy/SAB authority without invoking traps', () => {
    let trapCount = 0;
    const proxy = new Proxy({}, {
      ownKeys() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });
    expect(createContainmentMeasurementReceipt(proxy)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID' },
    });
    expect(trapCount).toBe(0);

    const arrayProxy = new Proxy([], {
      getOwnPropertyDescriptor() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });
    expect(validateContainmentMeasurementDiagnosticSequence(
      arrayProxy,
      {
        expectedChallenge: digest(10),
        expectedIssuerLineage: lineageFromSubject(
          subject('attestor-001', 'platform-attestor', 'control-001', 60),
          digest(61),
        ),
      },
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_CHAIN_INCOMPLETE' },
    });
    expect(trapCount).toBe(0);

    let accessorCount = 0;
    const accessorOptions = Object.defineProperty({
      expectedIssuerLineage: lineageFromSubject(
        subject('attestor-001', 'platform-attestor', 'control-001', 60),
        digest(61),
      ),
    }, 'expectedChallenge', {
      enumerable: true,
      get() {
        accessorCount += 1;
        throw new Error('must not execute');
      },
    });
    expect(validateContainmentMeasurementDiagnosticSequence(
      [],
      accessorOptions,
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID' },
    });
    expect(accessorCount).toBe(0);

    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(() => createContainmentMeasurementReceipt(revoked.proxy)).not.toThrow();
    expect(createContainmentMeasurementReceipt(revoked.proxy)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID' },
    });

    if (typeof SharedArrayBuffer === 'function') {
      expect(containmentEvidenceDigest(
        new Uint8Array(new SharedArrayBuffer(32)),
      )).toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID' },
      });
    }
    expect(containmentEvidenceDigest(
      new Uint8Array(CONTAINMENT_MEASUREMENT_MAX_BYTES + 1),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID' },
    });
  });
});
