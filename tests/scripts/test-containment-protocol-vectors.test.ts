import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  CONTAINMENT_COSE_ALGORITHMS,
  CONTAINMENT_COSE_CONTENT_TYPE,
  CONTAINMENT_COSE_PROFILE,
  createContainmentCoseProtectedHeaders,
  createContainmentCoseSign1,
  createContainmentExternalAad,
  validateContainmentCoseSign1,
} from '../../scripts/hermeticity/evidence/cose-sign1-contract.mjs';
import * as measurementContract
  from '../../scripts/hermeticity/evidence/measurement-contract.mjs';
import {
  CONTAINMENT_E2_HOLD_REASONS,
  CONTAINMENT_MEASUREMENT_REQUIREMENTS,
  CONTAINMENT_RECEIPT_KINDS,
  containmentCanonicalDigest,
  containmentCredentialSubjectDigest,
  containmentEvidenceDigest,
  createContainmentAuthorizationPayload,
  createContainmentComponentPayload,
  createContainmentEvidenceEnvelope,
  createContainmentMeasurementReceipt,
  validateContainmentMeasurementEnvelopeChain,
} from '../../scripts/hermeticity/evidence/measurement-contract.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const CDDL_PATH = resolve(
  REPO_ROOT,
  'native',
  'containment',
  'protocol',
  'containment-v2.cddl',
);
const GENERIC_EVIDENCE_CONTENT_TYPE =
  'application/vnd.deckent.containment-evidence+cbor';
const GOLDEN_FIRST_EVIDENCE_DIGEST =
  'sha256:ca39abdadbaf76c14caa8b512a97ca8ac5e18e0ddcfd402e02eaac9fd2908466';
const GOLDEN_FINAL_EVIDENCE_DIGEST =
  'sha256:01b557d5c8c33d3961d0e64033ddb1340a73562e3fb26615d8c671f05f8efb66';

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

type Subject = {
  authorityId: string;
  authorityRole: string;
  parentAuthorityId: string | null;
  enrollmentId: string;
  keyId: Uint8Array;
  keyEpoch: number;
  algorithm: string;
  curve: string;
};

type VectorOverrides = {
  badPreviousAt?: number;
  badAdmissionTarget?: boolean;
  badCleanupAuthorizedEnvelope?: boolean;
  missingCredential?: boolean;
  receiptRoleDriftAt?: number;
};

function digest(seed: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
}

function compareAscii(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function inspectCddlLexicalStructure(source: string) {
  const definitions = [...source.matchAll(
    /^([a-z][a-z0-9-]*)\s*=/gm,
  )].map(match => match[1]);
  const duplicateDefinitions = definitions.filter(
    (name, index) => definitions.indexOf(name) !== index,
  );
  const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const closing = new Set(Object.values(pairs));
  const stack: string[] = [];
  let inComment = false;
  let inString = false;
  let escaped = false;
  for (const character of source) {
    if (inComment) {
      if (character === '\n') inComment = false;
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === ';') {
      inComment = true;
    } else if (character === '"') {
      inString = true;
    } else if (pairs[character]) {
      stack.push(pairs[character]);
    } else if (closing.has(character) && stack.pop() !== character) {
      return { definitions, duplicateDefinitions, balanced: false };
    }
  }
  return {
    definitions,
    duplicateDefinitions,
    balanced: !inString && stack.length === 0,
  };
}

function signature(seed: number): Uint8Array {
  const value = new Uint8Array(64);
  value[31] = (seed % 250) + 1;
  value[63] = ((seed + 1) % 250) + 1;
  return value;
}

function mustCanonicalDigest(value: unknown): Uint8Array {
  const result = containmentCanonicalDigest(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value.bytes;
}

function mustEvidenceDigest(value: Uint8Array) {
  const result = containmentEvidenceDigest(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value;
}

function subject(
  authorityId: string,
  authorityRole: string,
  parentAuthorityId: string | null,
  seed: number,
): Subject {
  return {
    authorityId,
    authorityRole,
    parentAuthorityId,
    enrollmentId: `enrollment-${authorityId}`,
    keyId: digest(seed),
    keyEpoch: authorityId === 'attestor-vector' ? 4 : 7,
    algorithm: 'ESP256',
    curve: 'P-256',
  };
}

function lineage(value: Subject, enrollmentDigest: Uint8Array): Lineage {
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

function node(value: Lineage) {
  return {
    authorityId: value.issuerId,
    authorityRole: value.authorityRole,
    parentAuthorityId: value.parentIssuerId,
    platformClass: 'linux-native',
    enrollmentId: value.enrollmentId,
    enrollmentDigest: value.enrollmentDigest,
    keyId: value.keyId,
    keyEpoch: value.keyEpoch,
    algorithm: value.algorithm,
    curve: value.curve,
  };
}

function bindings(sequence: number) {
  return {
    tenantId: 'tenant-vector',
    projectId: 'project-vector',
    workspaceId: 'workspace-vector',
    goalId: 'goal-vector',
    missionId: 'mission-vector',
    flowId: 'flow-vector',
    runId: 'run-vector',
    workItemId: 'work-item-vector',
    attemptId: 'attempt-vector',
    operationId: 'operation-vector',
    executionInstanceId: 'execution-vector',
    platformClass: 'linux-native',
    platformInstanceId: 'host-vector',
    policyId: 'policy-vector',
    policyVersion: 'v2.0.0',
    policyDigest: digest(1),
    controlPlaneDigest: digest(2),
    fencingTokenDigest: sequence >= 3 ? digest(6) : null,
    projectionDigest: sequence >= 2 ? digest(3) : null,
    executionDigest: digest(4),
    resourceDigest: sequence >= 3 ? digest(5) : null,
  };
}

function measurements(
  kind: keyof typeof CONTAINMENT_MEASUREMENT_REQUIREMENTS,
) {
  return CONTAINMENT_MEASUREMENT_REQUIREMENTS[kind].map((type, index) => ({
    type,
    source: index % 2 === 0 ? 'native-attestor' : 'kernel',
    digestAlgorithm: 'sha-256',
    digest: digest(20 + index),
    status: 'MEASURED',
  }));
}

function measurementDigest(
  kind: keyof typeof CONTAINMENT_MEASUREMENT_REQUIREMENTS,
  type: string,
) {
  const value = measurements(kind).find(entry => entry.type === type);
  if (!value) throw new Error(`missing ${type}`);
  return value.digest;
}

function mustProtected(value: Lineage, algorithm: string | number = 'ESP256') {
  const result = createContainmentCoseProtectedHeaders({
    algorithm,
    keyId: value.keyId,
    profile: algorithm === 'Ed25519' ? 'portable' : 'fips',
    allowEd25519: algorithm === 'Ed25519',
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
  issuer: Lineage;
  componentRole: string;
}) {
  const result = createContainmentExternalAad({
    protocol: 'deckent.containment.v2',
    schemaVersion: 2,
    kind: input.kind,
    sequence: input.sequence,
    challenge: input.challenge,
    bindingsDigest: input.bindingsDigest,
    controlPlaneEpoch: 6,
    issuerRole: input.issuer.authorityRole.replaceAll('-', '_').toUpperCase(),
    componentRole: input.componentRole,
    issuerLineageDigest: mustCanonicalDigest(input.issuer),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value.bytes;
}

function mustSign(
  payload: Uint8Array,
  externalAad: Uint8Array,
  issuer: Lineage,
  seed: number,
) {
  const result = createContainmentCoseSign1({
    protectedHeaders: mustProtected(issuer),
    externalAad,
    payload,
    signature: signature(seed),
    profile: 'fips',
    expectedKeyId: issuer.keyId,
    expectedAlgorithm: -9,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value.bytes;
}

function credential(
  credentialSubject: Subject,
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
    issuer,
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
    enrollmentDigest: mustEvidenceDigest(envelope).bytes,
  };
}

function vectorAuthority(challenge: Uint8Array, bindingsDigest: Uint8Array) {
  const rootSubject = subject('root-vector', 'root-trust', null, 40);
  const controlSubject = subject(
    'control-vector',
    'control-plane',
    'root-vector',
    45,
  );
  const attestorSubject = subject(
    'attestor-vector',
    'platform-attestor',
    'control-vector',
    50,
  );
  const cleanupSubject = subject(
    'cleanup-vector',
    'cleanup-authority',
    'control-vector',
    60,
  );
  const root = lineage(rootSubject, digest(41));
  const controlCredential = credential(
    controlSubject,
    root,
    challenge,
    bindingsDigest,
    69,
  );
  const control = lineage(
    controlSubject,
    controlCredential.enrollmentDigest,
  );
  const attestorCredential = credential(
    attestorSubject,
    control,
    challenge,
    bindingsDigest,
    70,
  );
  const cleanupCredential = credential(
    cleanupSubject,
    control,
    challenge,
    bindingsDigest,
    71,
  );
  const attestor = lineage(
    attestorSubject,
    attestorCredential.enrollmentDigest,
  );
  const cleanup = lineage(
    cleanupSubject,
    cleanupCredential.enrollmentDigest,
  );
  return {
    root,
    control,
    attestor,
    cleanup,
    credentials: [
      attestorCredential.artifact,
      cleanupCredential.artifact,
      controlCredential.artifact,
    ],
    graph: {
      nodes: [node(attestor), node(cleanup), node(control), node(root)],
      edges: [
        {
          parentAuthorityId: 'control-vector',
          childAuthorityId: 'attestor-vector',
          relationship: 'DELEGATES',
        },
        {
          parentAuthorityId: 'control-vector',
          childAuthorityId: 'cleanup-vector',
          relationship: 'DELEGATES',
        },
        {
          parentAuthorityId: 'root-vector',
          childAuthorityId: 'control-vector',
          relationship: 'DELEGATES',
        },
      ],
    },
  };
}

function component(
  sequence: number,
  id: string,
  role: string,
  issuer: Lineage,
  challenge: Uint8Array,
  bindingsDigest: Uint8Array,
  receiptMeasurementSetDigest: Uint8Array,
  seed: number,
) {
  const payload = createContainmentComponentPayload({
    sequence,
    componentId: id,
    componentRole: role,
    platformClass: 'linux-native',
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
    issuer,
    componentRole: role,
  });
  return {
    componentId: id,
    componentRole: role,
    platformClass: 'linux-native',
    authorityId: issuer.issuerId,
    signed: {
      envelope: mustSign(payload.value.bytes, externalAad, issuer, seed),
      externalAad,
    },
  };
}

function grant(input: {
  kind: 'ADMISSION_GRANT' | 'CLEANUP_GRANT';
  issuer: Lineage;
  challenge: Uint8Array;
  bindingsDigest: Uint8Array;
  authorizedEnvelopeDigest: Uint8Array;
  targetSetDigest: Uint8Array;
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
    subjectExecutionInstanceId: 'execution-vector',
    issuerLineageDigest: mustCanonicalDigest(input.issuer),
    authorizedAfterSequence: admission ? 3 : 7,
    authorizedEnvelopeDigest: input.authorizedEnvelopeDigest,
    resourceDigest: digest(5),
    targetSetDigest: input.targetSetDigest,
    fencingTokenDigest: digest(6),
  });
  expect(payload.ok).toBe(true);
  if (!payload.ok) throw new Error(payload.hold.reasonCode);
  const externalAad = mustAad({
    kind: input.kind,
    sequence,
    challenge: input.challenge,
    bindingsDigest: input.bindingsDigest,
    issuer: input.issuer,
    componentRole: 'AUTHORIZATION_ARTIFACT',
  });
  return {
    artifactId,
    kind: input.kind,
    issuerId: input.issuer.issuerId,
    authorityRole: input.issuer.authorityRole,
    subjectAuthorityId: null,
    subjectExecutionInstanceId: 'execution-vector',
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

function buildVectors(overrides: VectorOverrides = {}) {
  const challenge = digest(10);
  const authority = vectorAuthority(
    challenge,
    mustCanonicalDigest(bindings(0)),
  );
  const envelopes: Uint8Array[] = [];
  const authorizationKinds: string[][] = [];
  let previousEnvelopeDigest: Uint8Array | null = null;
  let admission: ReturnType<typeof grant> | null = null;
  let cleanup: ReturnType<typeof grant> | null = null;
  let firstReceiptEnvelope: Uint8Array | null = null;
  let firstReceiptAad: Uint8Array | null = null;
  for (let sequence = 0; sequence < CONTAINMENT_RECEIPT_KINDS.length; sequence += 1) {
    const phaseBindings = bindings(sequence);
    const bindingsDigest = mustCanonicalDigest(phaseBindings);
    const kind = CONTAINMENT_RECEIPT_KINDS[sequence] as
      keyof typeof CONTAINMENT_MEASUREMENT_REQUIREMENTS;
    const phaseMeasurements = [...measurements(kind)].sort(
      (left, right) => compareAscii(left.type, right.type),
    );
    const components = [
      component(
        sequence,
        'linux-native-component',
        'LINUX_NATIVE',
        authority.attestor,
        challenge,
        bindingsDigest,
        mustCanonicalDigest(phaseMeasurements),
        100 + sequence,
      ),
    ];
    if (sequence === 4) {
      admission = grant({
        kind: 'ADMISSION_GRANT',
        issuer: authority.control,
        challenge,
        bindingsDigest,
        authorizedEnvelopeDigest: previousEnvelopeDigest!,
        targetSetDigest: overrides.badAdmissionTarget
          ? digest(200)
          : measurementDigest('ADMISSION', 'descriptor-set'),
        seed: 120,
      });
    }
    if (sequence === 8) {
      cleanup = grant({
        kind: 'CLEANUP_GRANT',
        issuer: authority.cleanup,
        challenge,
        bindingsDigest,
        authorizedEnvelopeDigest: overrides.badCleanupAuthorizedEnvelope
          ? digest(201)
          : previousEnvelopeDigest!,
        targetSetDigest: measurementDigest(
          'CLEANUP_COMMIT',
          'cleanup-target-set',
        ),
        seed: 121,
      });
    }
    const credentials = sequence === 0
      ? authority.credentials.filter((_value, index) => (
        !(overrides.missingCredential && index === 1)
      ))
      : [];
    const authorizationArtifacts = [
      ...credentials,
      ...(admission ? [admission] : []),
      ...(cleanup ? [cleanup] : []),
    ];
    authorizationKinds.push(
      authorizationArtifacts.map(artifact => artifact.kind),
    );
    const receipt = createContainmentMeasurementReceipt({
      kind,
      sequence,
      challenge,
      previousEnvelopeDigest: overrides.badPreviousAt === sequence
        ? digest(202)
        : previousEnvelopeDigest,
      epochs: { trust: 3, key: 4, session: 5, controlPlane: 6 },
      bindings: phaseBindings,
      issuerLineage: authority.attestor,
      artifactRefs: {
        authorityGraphDigest: mustCanonicalDigest(authority.graph),
        componentAttestationSetDigest: mustCanonicalDigest(components),
        authorizationArtifactSetDigest: mustCanonicalDigest(
          authorizationArtifacts,
        ),
        admissionGrantDigest: admission
          ? mustEvidenceDigest(admission.signed.envelope).bytes
          : null,
        cleanupGrantDigest: cleanup
          ? mustEvidenceDigest(cleanup.signed.envelope).bytes
          : null,
      },
      measurements: phaseMeasurements,
      verdict: { state: 'OBSERVED', reasonCode: 'NONE' },
    });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) throw new Error(receipt.hold.reasonCode);
    const receiptAad = mustAad({
      kind,
      sequence,
      challenge,
      bindingsDigest,
      issuer: authority.attestor,
      componentRole: overrides.receiptRoleDriftAt === sequence
        ? 'COMPONENT_ATTESTATION'
        : 'RECEIPT',
    });
    const receiptEnvelope = mustSign(
      receipt.value.bytes,
      receiptAad,
      authority.attestor,
      140 + sequence,
    );
    firstReceiptEnvelope ??= receiptEnvelope;
    firstReceiptAad ??= receiptAad;
    const evidence = createContainmentEvidenceEnvelope({
      receipt: { envelope: receiptEnvelope, externalAad: receiptAad },
      componentAttestations: components,
      authorizationArtifacts,
      authorityGraph: authority.graph,
    });
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) throw new Error(evidence.hold.reasonCode);
    envelopes.push(evidence.value.bytes);
    previousEnvelopeDigest = mustEvidenceDigest(evidence.value.bytes).bytes;
  }
  return {
    challenge,
    expectedIssuerLineage: authority.attestor,
    envelopes,
    authorizationKinds,
    firstReceiptEnvelope: firstReceiptEnvelope!,
    firstReceiptAad: firstReceiptAad!,
  };
}

function trustedOptions(vectors: ReturnType<typeof buildVectors>) {
  return {
    expectedChallenge: vectors.challenge,
    expectedIssuerLineage: vectors.expectedIssuerLineage,
    profile: 'fips',
  };
}

describe('containment v2 canonical protocol vectors', () => {
  it('keeps the honest CDDL authority freeze synchronized without claiming parser proof', () => {
    const cddl = readFileSync(CDDL_PATH, 'utf8');
    const lexicalStructure = inspectCddlLexicalStructure(cddl);
    expect(lexicalStructure).toMatchObject({
      duplicateDefinitions: [],
      balanced: true,
    });
    expect(lexicalStructure.definitions).toEqual(expect.arrayContaining([
      'containment-evidence-envelope',
      'measurement-receipt',
      'component-platform-role',
      'enrollment-credential-payload',
      'admission-grant-payload',
      'cleanup-grant-payload',
      'root-authority-node',
      'non-root-authority-node',
      'journal-tuple',
    ]));
    expect(CONTAINMENT_COSE_CONTENT_TYPE).toBe(GENERIC_EVIDENCE_CONTENT_TYPE);
    expect(cddl).toContain(GENERIC_EVIDENCE_CONTENT_TYPE);
    expect(cddl).toContain('CONFORMANCE STATUS: NOT_BORN');
    expect(cddl).toContain('No CDDL parser-backed conformance gate is wired');
    expect(cddl).toContain('supported-cose-algorithm = -9 / -19');
    expect(cddl).toContain('deprecated-polymorphic-cose-algorithm = -7 / -8');
    expect(cddl).toContain('known-unsupported-cose-algorithm = -53');
    expect(cddl).toContain('2 => ["deckent-profile"]');
    expect(cddl).toContain(`"deckent-profile" => "${CONTAINMENT_COSE_PROFILE}"`);
    for (const kind of CONTAINMENT_RECEIPT_KINDS) {
      expect(cddl).toContain(`"kind": "${kind}"`);
    }
    for (const types of Object.values(CONTAINMENT_MEASUREMENT_REQUIREMENTS)) {
      for (const type of types) expect(cddl).toContain(`"type": "${type}"`);
    }
    for (const reasonCode of CONTAINMENT_E2_HOLD_REASONS) {
      expect(cddl).toContain(`"${reasonCode}"`);
    }
    for (const field of [
      'goalId',
      'missionId',
      'flowId',
      'runId',
      'workItemId',
      'attemptId',
      'operationId',
      'executionInstanceId',
      'policyVersion',
      'fencingTokenDigest',
      'previousEnvelopeDigest',
      'authorizedEnvelopeDigest',
      'credentialSubjectDigest',
      'authorityGraph',
      'measurementDigest',
    ]) expect(cddl).toContain(`"${field}"`);
    for (const role of [
      'LINUX_NATIVE',
      'UNSUPPORTED',
      'MACOS_SIGNED_APP',
      'MACOS_HOST',
      'GUEST_KERNEL',
      'WINDOWS_NATIVE',
      'WINDOWS_OUTER',
      'LINUX_INNER',
      'LINUX_HOST',
      'OCI_RUNTIME',
    ]) expect(cddl).toContain(`"${role}"`);
    expect(cddl).not.toContain('previousReceiptDigest');
    expect(cddl).not.toContain('receiptDigest');
    expect(cddl).not.toContain('CLEANUP_GRANT_COMMIT');
    expect(
      'validateContainmentMeasurementReceiptChain' in measurementContract,
    ).toBe(false);
  });

  it('uses RFC 9864 fully-specified algorithms and rejects ambiguous/unsupported ids', () => {
    const testLineage = lineage(
      subject('test-vector', 'root-trust', null, 90),
      digest(91),
    );
    const esp = createContainmentCoseProtectedHeaders({
      algorithm: 'ESP256',
      keyId: testLineage.keyId,
      profile: 'fips',
    });
    expect(esp).toMatchObject({
      ok: true,
      value: {
        algorithm: CONTAINMENT_COSE_ALGORITHMS.ESP256,
        algorithmName: 'ESP256',
        curve: 'P-256',
        deckentProfile: CONTAINMENT_COSE_PROFILE,
      },
    });
    const ed25519 = createContainmentCoseProtectedHeaders({
      algorithm: 'Ed25519',
      keyId: testLineage.keyId,
      profile: 'portable',
      allowEd25519: true,
    });
    expect(ed25519).toMatchObject({
      ok: true,
      value: {
        algorithm: CONTAINMENT_COSE_ALGORITHMS.Ed25519,
        curve: 'Ed25519',
      },
    });
    for (const algorithm of [-7, -8]) {
      expect(createContainmentCoseProtectedHeaders({
        algorithm,
        keyId: testLineage.keyId,
      })).toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_COSE_ALGORITHM_DEPRECATED' },
      });
    }
    expect(createContainmentCoseProtectedHeaders({
      algorithm: -53,
      keyId: testLineage.keyId,
      profile: 'portable',
      allowEd448: true,
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_COSE_ALGORITHM_UNSUPPORTED' },
    });
  });

  it('reproduces the deterministic nine-envelope causal golden chain', () => {
    const first = buildVectors();
    const second = buildVectors();
    expect(first.envelopes).toEqual(second.envelopes);
    expect(first.authorizationKinds[0]).toEqual([
      'ENROLLMENT_CREDENTIAL',
      'ENROLLMENT_CREDENTIAL',
      'ENROLLMENT_CREDENTIAL',
    ]);
    expect(first.authorizationKinds[3]).toEqual([]);
    expect(first.authorizationKinds[4]).toEqual(['ADMISSION_GRANT']);
    expect(first.authorizationKinds[7]).toEqual(['ADMISSION_GRANT']);
    expect(first.authorizationKinds[8]).toEqual([
      'ADMISSION_GRANT',
      'CLEANUP_GRANT',
    ]);
    expect(mustEvidenceDigest(first.envelopes[0]).digestRef).toBe(
      GOLDEN_FIRST_EVIDENCE_DIGEST,
    );
    expect(mustEvidenceDigest(first.envelopes.at(-1)!).digestRef).toBe(
      GOLDEN_FINAL_EVIDENCE_DIGEST,
    );
    expect(validateContainmentMeasurementEnvelopeChain(
      first.envelopes,
      trustedOptions(first),
    )).toMatchObject({
      ok: true,
      value: {
        structuralState: 'COMPLETE',
        verdictState: 'COMPLETE_OBSERVED',
        envelopeLinksVerified: true,
        evidenceEnvelopeState: 'STRUCTURALLY_VALID',
        componentAuthorityCount: 1,
        activation: 'NOT_BORN',
        proofEligible: false,
        signatureVerified: false,
        receiptCount: 9,
      },
    });
  });

  it('rejects causal forks, missing credentials and grant substitutions', () => {
    for (const [vectors, reasonCode] of [
      [buildVectors({ badPreviousAt: 5 }), 'E_CONTAINMENT_E2_REPLAY_OR_FORK'],
      [
        buildVectors({ missingCredential: true }),
        'E_CONTAINMENT_E2_KEY_LINEAGE_INVALID',
      ],
      [
        buildVectors({ badAdmissionTarget: true }),
        'E_CONTAINMENT_E2_BINDING_MISMATCH',
      ],
      [
        buildVectors({ badCleanupAuthorizedEnvelope: true }),
        'E_CONTAINMENT_E2_BINDING_MISMATCH',
      ],
    ] as const) {
      expect(validateContainmentMeasurementEnvelopeChain(
        vectors.envelopes,
        trustedOptions(vectors),
      )).toMatchObject({ ok: false, hold: { reasonCode } });
    }
  });

  it('binds trusted challenge and composite AAD roles while signatures remain structural', () => {
    const vectors = buildVectors();
    expect(validateContainmentMeasurementEnvelopeChain(
      vectors.envelopes,
      { ...trustedOptions(vectors), expectedChallenge: digest(250) },
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_CHALLENGE_MISMATCH' },
    });
    const aadDrift = buildVectors({ receiptRoleDriftAt: 4 });
    expect(validateContainmentMeasurementEnvelopeChain(
      aadDrift.envelopes,
      trustedOptions(aadDrift),
    )).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_EXTERNAL_AAD_MISMATCH' },
    });

    const tampered = vectors.firstReceiptEnvelope.slice();
    tampered[tampered.length - 1] ^= 0x01;
    expect(validateContainmentCoseSign1(tampered, {
      externalAad: vectors.firstReceiptAad,
      profile: 'fips',
      expectedKeyId: vectors.expectedIssuerLineage.keyId,
      expectedAlgorithm: -9,
    })).toMatchObject({
      ok: true,
      value: {
        state: 'STRUCTURALLY_VALID',
        signatureVerified: false,
        proofEligible: false,
        activation: 'NOT_BORN',
      },
    });
  });
});
