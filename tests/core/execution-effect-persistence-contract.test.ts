import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createExecutionEffectLandingTerminalSealV1,
  createExecutionEffectLandingFinalReceiptEvidenceV1,
  createExecutionEffectLandingLeaseTerminalReceiptEvidenceV1,
  createExecutionEffectLandingNativeReceiptEvidenceV1,
  createExecutionEffectLandingLeaseResumeContextV1,
  createExecutionEffectLandingLeaseResumeResultV1,
  createExecutionEffectLandingReceiptV1,
  createExecutionEffectPersistenceOperationV1,
  createExecutionEffectResultProjectionV1,
  createExecutionEffectStagedSourceSealV1,
  createExecutionEffectDependencyResourceV1,
  createExecutionEffectWorkspaceReleaseV1,
  createExecutionEffectWorkspaceSnapshotSealV1,
  createExecutionEffectWorkspaceResourceV1,
  createTaskAttemptEffectLandingBindingV2,
  executionEffectLandingIntentDigestV1,
  executionEffectPersistenceRawDigest,
  executionEffectWorkspaceAuthorityDigestV1,
  executionEffectLandingDeterministicBoundaryIdV1,
  extractTaskAttemptEffectLandingBindingV2,
  parseExecutionEffectLandingTerminalSealV1,
  parseExecutionEffectLandingLeaseResumeContextV1,
  parseExecutionEffectLandingLeaseResumeResultV1,
  parseExecutionEffectLandingReceiptV1,
  parseExecutionEffectResultProjectionV1,
  parseExecutionEffectDependencyResourceV1,
  parseExecutionEffectWorkspaceReleaseV1,
  parseExecutionEffectWorkspaceSnapshotSealV1,
  parseTaskAttemptEffectLandingBindingV2,
  projectVerifiedExecutionEffectResultV1,
  verifyExecutionEffectPersistenceBundleV1,
  type ExecutionEffectPersistenceArtifactV1,
  type ExecutionEffectPersistenceDigest,
} from '../../src/core/execution-effect-persistence-contract.js';
import {
  evaluateExecutionEffectContainment,
  parseExecutionEffectManifest,
  type ExecutionEffectManifest,
  type ExecutionEffectManifestEntry,
} from '../../src/core/execution-effect-containment.js';
import { compileExecutionEffectWritePolicy } from '../../src/core/execution-write-scope-policy.js';

const digestValue = (character: string): ExecutionEffectPersistenceDigest => (
  `sha256:${character.repeat(64)}`
);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function domainDigest(domain: string, value: unknown): ExecutionEffectPersistenceDigest {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function bytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalJson(value), 'utf8');
}

const attempt = Object.freeze({
  projectId: 'project-1',
  taskId: 'task-1',
  attemptId: '018f0000-0000-7000-8000-000000000001',
  generation: 1,
});

const workspaceIdentity = Object.freeze({
  filesystemId: 'dev:2049',
  directoryId: 'ino:1001',
  rootHandleEvidenceDigest: digestValue('1'),
});

function manifest(
  phase: 'baseline' | 'final',
  entries: readonly ExecutionEffectManifestEntry[],
  writePolicyDigest: string,
  writePolicy: ReturnType<typeof compileExecutionEffectWritePolicy> & { ok: true },
  attemptDigest: string,
): ExecutionEffectManifest {
  const body = Object.freeze({
    version: 1 as const,
    phase,
    attempt,
    attemptDigest,
    workspaceIdentity,
    captureAuthority: Object.freeze({
      adapter: 'native-descriptor-relative' as const,
      platform: 'wsl2-linux' as const,
      traversal: 'iterative-openat-no-follow' as const,
      sameFilesystem: true as const,
      mountBoundaryPolicy: 'reject' as const,
      hardlinkPolicy: 'reject-before-content-read' as const,
      cancellationState: 'not-cancelled' as const,
      nativeManifestDigest: domainDigest('test-native-manifest', phase),
      nativeEntryIdentitySetDigest: domainDigest('test-native-entry-identities', phase),
      startedAt: '2026-09-01T08:00:00.000Z',
      completedAt: phase === 'baseline'
        ? '2026-09-01T08:01:00.000Z'
        : '2026-09-01T08:02:00.000Z',
      deadlineAt: '2026-09-01T08:05:00.000Z',
      limits: Object.freeze({
        maxEntries: 100,
        maxFileBytes: 1_000_000,
        maxTotalBytes: 10_000_000,
        maxDepth: 20,
        maxPathBytes: 1_024,
        maxNameBytes: 255,
        maxManifestBytes: 16 * 1024 * 1024,
      }),
    }),
    landingSemantics: Object.freeze({
      regularFile: 'reconstruct-bytes-and-safe-mode' as const,
      directory: 'exact-directory-add-and-derived-parent-create' as const,
      unsupportedMetadata: 'strip-xattr-acl-capability-sparse-ads-owner-times' as const,
      linksAndSpecialFiles: 'reject' as const,
    }),
    policy: writePolicy.policy,
    entries: Object.freeze([...entries]),
  });
  if (body.policy.digest !== writePolicyDigest) throw new Error('test policy digest drift');
  const parsed = parseExecutionEffectManifest({
    ...body,
    digest: domainDigest('execution-effect-manifest-v1', body),
  });
  if (!parsed) throw new Error('invalid execution-effect persistence test manifest');
  return parsed;
}

function changedBundle() {
  const writePolicy = compileExecutionEffectWritePolicy(['out.bin']);
  if (!writePolicy.ok) throw new Error('invalid execution-effect persistence test policy');
  const attemptDigest = domainDigest('execution-effect-attempt-v1', attempt);
  const workspaceCaptureCapabilityDigest = digestValue('1');
  const landingNativeCapabilityDigest = digestValue('0');
  const baseline = manifest(
    'baseline',
    [{ path: '.', kind: 'directory', mode: 0o755 }],
    writePolicy.policy.digest as ExecutionEffectPersistenceDigest,
    writePolicy,
    attemptDigest,
  );
  const workspaceResource = createExecutionEffectWorkspaceResourceV1({
    volumeName: 'deckent-effect-volume-1',
    imageDigest: digestValue('a'),
    labelsDigest: digestValue('b'),
    mountPlanDigest: digestValue('c'),
    snapshotInventoryDigest: digestValue('d'),
    populationReceiptDigest: digestValue('e'),
    baselineManifestDigest: baseline.digest as ExecutionEffectPersistenceDigest,
  });
  const dependencyResource = createExecutionEffectDependencyResourceV1({
    attempt,
    admissionReceiptDigest: digestValue('2'),
    custodyPolicyDigest: digestValue('3'),
    imageIdentityDigest: digestValue('f'),
    labelsDigest: digestValue('b'),
    mountPlanDigest: digestValue('6'),
    populationReceiptDigest: digestValue('7'),
    volumeName: 'deckent-effect-dependency-1',
    volumeIdentityDigest: digestValue('8'),
    readyAt: '2026-09-01T07:59:59.000Z',
  });
  const workspace = createExecutionEffectWorkspaceSnapshotSealV1({
    attempt,
    admissionReceiptDigest: digestValue('2'),
    custodyPolicyDigest: digestValue('3'),
    writePolicyDigest: writePolicy.policy.digest as ExecutionEffectPersistenceDigest,
    workspaceIdentity,
    workspaceResource,
    dependencyResource,
    nativeCapabilityDigest: workspaceCaptureCapabilityDigest,
    platform: 'wsl2-linux',
    sealedAt: '2026-09-01T08:00:00.000Z',
  });
  const sourceBytes = Buffer.from('deckent-effect-bytes', 'utf8');
  const chunks = [sourceBytes.subarray(0, 7), sourceBytes.subarray(7)];
  const final = manifest(
    'final',
    [
      { path: '.', kind: 'directory', mode: 0o755 },
      {
        path: 'out.bin',
        kind: 'regular-file',
        mode: 0o640,
        size: sourceBytes.byteLength,
        contentDigest: executionEffectPersistenceRawDigest(sourceBytes),
      },
    ],
    workspace.writePolicyDigest,
    writePolicy,
    workspace.attemptDigest,
  );
  const decision = evaluateExecutionEffectContainment({
    baseline: { ok: true, manifest: baseline },
    final: { ok: true, manifest: final },
  });
  if (decision.state !== 'VERIFIED' || decision.effects.length !== 1) {
    throw new Error('invalid execution-effect persistence test decision');
  }
  const planId = 'plan-1';
  const landingIntentDigest = domainDigest('execution-effect-landing-intent-v1', {
    attemptDigest: workspace.attemptDigest,
    baselineManifestDigest: baseline.digest,
    finalManifestDigest: final.digest,
    containmentDecisionDigest: decision.decisionDigest,
    planId,
    nativeCapabilityDigest: landingNativeCapabilityDigest,
  });
  const artifacts: ExecutionEffectPersistenceArtifactV1[] = chunks.map((chunk, index) => ({
    artifactKey: `chunk-${index}`,
    artifactReceiptDigest: digestValue(String(index + 5)),
    bytes: chunk,
  }));
  const stagedSource = createExecutionEffectStagedSourceSealV1({
    path: 'out.bin',
    byteLength: sourceBytes.byteLength,
    contentDigest: executionEffectPersistenceRawDigest(sourceBytes),
    workspaceIdentityDigest: executionEffectWorkspaceAuthorityDigestV1(
      workspace.workspaceIdentity,
    ),
    attemptDigest: workspace.attemptDigest,
    admissionReceiptDigest: workspace.admissionReceiptDigest,
    custodyPolicyDigest: workspace.custodyPolicyDigest,
    landingIntentDigest,
    chunks: artifacts.map(artifact => ({
      byteLength: artifact.bytes.byteLength,
      artifactKey: artifact.artifactKey,
      artifactReceiptDigest: artifact.artifactReceiptDigest,
      contentDigest: executionEffectPersistenceRawDigest(artifact.bytes),
    })),
  });
  const absentStateBody = Object.freeze({ state: 'ABSENT' as const });
  const absentState = Object.freeze({
    ...absentStateBody,
    stateDigest: domainDigest('execution-effect-landing-entry-state-v1', absentStateBody),
  });
  const rootEntry = baseline.entries[0]!;
  const rootStateBody = Object.freeze({
    state: 'PRESENT' as const,
    entry: rootEntry,
    objectIdentityDigest: digestValue('4'),
    linkCount: null,
  });
  const rootState = Object.freeze({
    ...rootStateBody,
    stateDigest: domainDigest('execution-effect-landing-entry-state-v1', rootStateBody),
  });
  const finalEntry = final.entries.find(entry => entry.path === 'out.bin')!;
  const expectedPostBody = Object.freeze({ state: 'PRESENT' as const, entry: finalEntry });
  const expectedPost = Object.freeze({
    ...expectedPostBody,
    stateDigest: domainDigest('execution-effect-landing-expected-entry-state-v1', expectedPostBody),
  });
  const operationAuthority = createExecutionEffectPersistenceOperationV1({
    index: 0,
    kind: 'ADD',
    path: 'out.bin',
    effectDigests: [decision.effects[0]!.digest as ExecutionEffectPersistenceDigest],
    derivedParent: null,
    stagedSource,
    entryPreimages: [Object.freeze({ path: 'out.bin', entry: absentState })],
    entryPostimages: [Object.freeze({ path: 'out.bin', entry: expectedPost })],
    parentAuthorities: [Object.freeze({
      path: '.',
      source: 'PREPARED_PREIMAGE' as const,
      entry: rootState,
    })],
    nativeReceiptDigest: digestValue('7'),
    durabilityEvidenceDigest: digestValue('8'),
  });
  const planDigest = domainDigest(
    'execution-effect-landing-plan-v1',
    [operationAuthority.operationDigest],
  );
  const transactionBody = Object.freeze({
    version: 1 as const,
    projectId: attempt.projectId,
    taskId: attempt.taskId,
    attemptId: attempt.attemptId,
    generation: attempt.generation,
    attemptDigest: workspace.attemptDigest,
    baselineManifestDigest: baseline.digest,
    finalManifestDigest: final.digest,
    containmentDecisionDigest: decision.decisionDigest,
    planId,
    planDigest,
  });
  const transaction = Object.freeze({
    ...transactionBody,
    transactionDigest: domainDigest('execution-effect-landing-transaction-v1', transactionBody),
  });
  const preparedBody = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-landing-prepared' as const,
    phase: 'PREPARED' as const,
    transaction,
    operations: Object.freeze([operationAuthority]),
    nativeCapabilityDigest: landingNativeCapabilityDigest,
    journalCapabilityDigest: digestValue('2'),
    leaseCapabilityDigest: digestValue('3'),
    acquiredLease: Object.freeze({
      transactionDigest: transaction.transactionDigest,
      fencingTokenDigest: digestValue('4'),
      leaseReceiptDigest: digestValue('9'),
    }),
    preparedAt: '2026-09-01T08:02:10.000Z',
  });
  const prepared = Object.freeze({
    ...preparedBody,
    recordDigest: domainDigest('execution-effect-landing-prepared-journal-v1', preparedBody),
  });
  const boundary = Object.freeze({
    transactionDigest: transaction.transactionDigest,
    fencingTokenDigest: digestValue('4'),
    boundaryId: 'boundary-1',
    boundaryReceiptDigest: digestValue('5'),
  });
  const applyingBody = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-landing-applying' as const,
    phase: 'APPLYING' as const,
    transactionDigest: transaction.transactionDigest,
    preparedJournalDigest: prepared.recordDigest,
    boundary,
    applyingAt: '2026-09-01T08:02:20.000Z',
  });
  const applying = Object.freeze({
    ...applyingBody,
    recordDigest: domainDigest('execution-effect-landing-applying-journal-v1', applyingBody),
  });
  const nativePostimages = Object.freeze([Object.freeze({
      path: 'out.bin',
      entry: Object.freeze({
        state: 'PRESENT' as const,
        entry: finalEntry,
        objectIdentityDigest: digestValue('5'),
        linkCount: 1,
        stateDigest: domainDigest('execution-effect-landing-entry-state-v1', {
          state: 'PRESENT', entry: finalEntry, objectIdentityDigest: digestValue('5'), linkCount: 1,
        }),
      }),
    })]);
  const canonicalNativeReceipt = createExecutionEffectLandingNativeReceiptEvidenceV1({
    operation: operationAuthority,
    entryPostimages: nativePostimages,
    durabilityEvidenceDigest: digestValue('8'),
  });
  const operation = createExecutionEffectPersistenceOperationV1({
    index: operationAuthority.index,
    kind: operationAuthority.kind,
    path: operationAuthority.path,
    effectDigests: operationAuthority.effectDigests,
    derivedParent: operationAuthority.derivedParent,
    stagedSource: operationAuthority.stagedSource,
    entryPreimages: operationAuthority.entryPreimages,
    entryPostimages: operationAuthority.entryPostimages,
    parentAuthorities: operationAuthority.parentAuthorities,
    nativeReceiptDigest: canonicalNativeReceipt.receiptDigest,
    durabilityEvidenceDigest: canonicalNativeReceipt.durabilityEvidenceDigest,
  });
  const nativeReceipt = createExecutionEffectLandingNativeReceiptEvidenceV1({
    operation,
    entryPostimages: nativePostimages,
    durabilityEvidenceDigest: canonicalNativeReceipt.durabilityEvidenceDigest,
  });
  const stepBody = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-landing-step' as const,
    phase: 'STEP' as const,
    transactionDigest: transaction.transactionDigest,
    preparedJournalDigest: prepared.recordDigest,
    applyingJournalDigest: applying.recordDigest,
    previousJournalDigest: applying.recordDigest,
    index: 0,
    operationDigest: operation.operationDigest,
    nativeReceipt,
    reconciledAfterCrash: false,
    appliedAt: '2026-09-01T08:02:30.000Z',
  });
  const step = Object.freeze({
    ...stepBody,
    recordDigest: domainDigest('execution-effect-landing-step-journal-v1', stepBody),
  });
  const finalVerificationReceipt = createExecutionEffectLandingFinalReceiptEvidenceV1({
    transactionDigest: transaction.transactionDigest,
    planDigest,
    operations: [operation],
    nativeReceipts: [nativeReceipt],
    durabilityEvidenceDigest: digestValue('7'),
  });
  const committedAt = '2026-09-01T08:03:00.000Z';
  const committedBody = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-landing-committed' as const,
    phase: 'COMMITTED' as const,
    disposition: 'COMMITTED' as const,
    transaction,
    preparedJournalDigest: prepared.recordDigest,
    applyingJournalDigest: applying.recordDigest,
    lastJournalDigest: step.recordDigest,
    operationReceiptDigests: Object.freeze([nativeReceipt.receiptDigest]),
    finalVerificationReceipt,
    committedAt,
  });
  const committed = Object.freeze({
    ...committedBody,
    recordDigest: domainDigest('execution-effect-landing-committed-journal-v1', committedBody),
  });
  const journalRecords = [prepared, applying, step, committed];
  const journalArtifacts = journalRecords.map((record, index) => {
    const recordBytes = bytes(record);
    return Object.freeze({
      artifactKey: `journal-${index}`,
      artifactReceiptDigest: digestValue(['8', '9', 'a', 'b'][index]!),
      contentDigest: executionEffectPersistenceRawDigest(recordBytes),
      byteLength: recordBytes.byteLength,
      bytes: recordBytes,
    });
  });
  const journalRefs = journalArtifacts.map(artifact => Object.freeze({
    artifactKey: artifact.artifactKey,
    artifactReceiptDigest: artifact.artifactReceiptDigest,
    contentDigest: artifact.contentDigest,
    byteLength: artifact.byteLength,
  }));
  const leaseTerminalEvidence = createExecutionEffectLandingLeaseTerminalReceiptEvidenceV1({
    transactionDigest: transaction.transactionDigest,
    terminal: 'COMPLETED',
    committedJournalDigest: committed.recordDigest,
    eventId: 'event-1',
    quarantineId: executionEffectLandingDeterministicBoundaryIdV1(transaction.transactionDigest),
    fencingToken: { epoch: 'epoch-1', counter: 1, nonce: 'nonce-1' },
    occurredAt: committedAt,
    evidenceRefs: [
      `committed-journal:${committed.recordDigest}`,
      `effect-boundary:${digestValue('4')}`,
      'effect-terminal:COMPLETED',
      `effect-transaction:${transaction.transactionDigest}`,
    ].sort(),
  });
  const receiptValues = [nativeReceipt, finalVerificationReceipt, leaseTerminalEvidence];
  const receiptArtifacts = receiptValues.map((value, index) => {
    const valueBytes = bytes(value);
    return Object.freeze({
      artifactKey: `receipt-evidence-${index}`,
      artifactReceiptDigest: digestValue(['c', 'd', 'e'][index]!),
      contentDigest: executionEffectPersistenceRawDigest(valueBytes),
      byteLength: valueBytes.byteLength,
      bytes: valueBytes,
    });
  });
  const receiptRefs = receiptArtifacts.map(artifact => Object.freeze({
    artifactKey: artifact.artifactKey,
    artifactReceiptDigest: artifact.artifactReceiptDigest,
    contentDigest: artifact.contentDigest,
    byteLength: artifact.byteLength,
  }));
  const terminal = createExecutionEffectLandingTerminalSealV1({
    attempt,
    attemptDigest: workspace.attemptDigest,
    disposition: 'COMMITTED',
    workspaceSnapshotSealDigest: workspace.sealDigest,
    baselineManifestDigest: baseline.digest as ExecutionEffectPersistenceDigest,
    finalManifestDigest: final.digest as ExecutionEffectPersistenceDigest,
    effectDecisionDigest: decision.decisionDigest as ExecutionEffectPersistenceDigest,
    planId,
    operations: [operation],
    preparedJournalDigest: prepared.recordDigest,
    applyingJournalDigest: applying.recordDigest,
    stepJournalDigests: [step.recordDigest],
    committedJournalDigest: committed.recordDigest,
    finalVerificationReceiptDigest: finalVerificationReceipt.receiptDigest,
    journalArtifacts: {
      prepared: journalRefs[0]!,
      applying: journalRefs[1]!,
      steps: [journalRefs[2]!],
      committed: journalRefs[3]!,
    },
    receiptArtifacts: {
      nativeReceipts: [receiptRefs[0]!],
      finalVerificationReceipt: receiptRefs[1]!,
      leaseTerminalReceipt: receiptRefs[2]!,
    },
    leaseTerminal: 'COMPLETED',
    leaseTerminalReceiptDigest: leaseTerminalEvidence.terminalReceiptDigest,
    committedAt,
  });
  return Object.freeze({
    workspace,
    workspaceCaptureCapabilityDigest,
    landingNativeCapabilityDigest,
    baseline,
    final,
    decision,
    terminal,
    artifacts: Object.freeze(artifacts),
    input: Object.freeze({
      workspaceBytes: bytes(workspace),
      baselineBytes: bytes(baseline),
      finalBytes: bytes(final),
      terminalBytes: bytes(terminal),
      stagedArtifacts: Object.freeze(artifacts),
      journalArtifacts: Object.freeze(journalArtifacts),
      receiptArtifacts: Object.freeze(receiptArtifacts),
      maxJsonBytes: 1_000_000,
    }),
  });
}

describe('execution-effect persistence contract', () => {
  it('strictly binds result projection to terminal transaction and typed line applicability', () => {
    const fixture = changedBundle();
    const projection = projectVerifiedExecutionEffectResultV1({
      workspace: fixture.workspace,
      baseline: fixture.baseline,
      final: fixture.final,
      terminal: fixture.terminal,
      decision: fixture.decision,
      decisionDigest: fixture.decision.decisionDigest as ExecutionEffectPersistenceDigest,
      stagedArtifactRefs: fixture.artifacts.map(artifact => ({
        artifactKey: artifact.artifactKey,
        artifactReceiptDigest: artifact.artifactReceiptDigest,
      })),
    });
    expect(projection).not.toBeNull();
    expect(projection).toMatchObject({
      disposition: 'COMMITTED',
      effectDecisionDigest: fixture.terminal.effectDecisionDigest,
      transactionDigest: fixture.terminal.transactionDigest,
      effects: [{ entryKind: 'regular-file', lineMetrics: 'REQUIRED' }],
    });
    expect(parseExecutionEffectResultProjectionV1(projection)).toEqual(projection);
    expect(parseExecutionEffectResultProjectionV1({
      ...projection!,
      transactionDigest: digestValue('0'),
    })).toBeNull();
    expect(parseExecutionEffectResultProjectionV1({
      ...projection!,
      effects: [{ ...projection!.effects[0]!, lineMetrics: 'NOT_APPLICABLE_DIRECTORY' }],
    })).toBeNull();
    const directoryProjection = createExecutionEffectResultProjectionV1({
      disposition: 'COMMITTED',
      effectDecisionDigest: digestValue('1'),
      transactionDigest: digestValue('2'),
      decisionEffectCount: 1,
      effects: [{
        operationIndex: 0,
        path: 'generated',
        status: 'deleted',
        operationKind: 'DELETE',
        entryKind: 'directory',
        lineMetrics: 'NOT_APPLICABLE_DIRECTORY',
        operationDigest: digestValue('3'),
        effectDigests: [digestValue('4')],
        derivedParentProvenanceDigest: null,
      }],
    });
    expect(parseExecutionEffectResultProjectionV1(directoryProjection)).toEqual(directoryProjection);
    const derivedDirectoryProjectionInput = Object.freeze({
      disposition: 'COMMITTED',
      effectDecisionDigest: digestValue('5'),
      transactionDigest: digestValue('6'),
      decisionEffectCount: 1,
      effects: [{
        operationIndex: 0,
        path: 'generated/parent',
        status: 'added',
        operationKind: 'ADD_DIRECTORY',
        entryKind: 'directory',
        lineMetrics: 'NOT_APPLICABLE_DIRECTORY',
        operationDigest: digestValue('7'),
        effectDigests: [],
        derivedParentProvenanceDigest: digestValue('8'),
      }],
    });
    const derivedDirectoryProjection = createExecutionEffectResultProjectionV1(
      derivedDirectoryProjectionInput,
    );
    expect(parseExecutionEffectResultProjectionV1(derivedDirectoryProjection))
      .toEqual(derivedDirectoryProjection);
    expect(() => createExecutionEffectResultProjectionV1({
      ...derivedDirectoryProjectionInput,
      effects: [{
        ...derivedDirectoryProjection.effects[0]!,
        derivedParentProvenanceDigest: null,
      }],
    })).toThrow(/result projection/u);
    expect(() => createExecutionEffectResultProjectionV1({
      ...derivedDirectoryProjectionInput,
      effects: [{
        ...derivedDirectoryProjection.effects[0]!,
        effectDigests: [digestValue('9')],
      }],
    })).toThrow(/result projection/u);
  });

  it('owns the one strict canonical landing-intent digest authority', () => {
    const input = Object.freeze({
      attemptDigest: digestValue('1'),
      baselineManifestDigest: digestValue('2'),
      finalManifestDigest: digestValue('3'),
      containmentDecisionDigest: digestValue('4'),
      planId: 'plan-1',
      nativeCapabilityDigest: digestValue('5'),
    });
    expect(executionEffectLandingIntentDigestV1(input)).toBe(
      domainDigest('execution-effect-landing-intent-v1', input),
    );
    expect(() => executionEffectLandingIntentDigestV1({
      ...input,
      planId: '../unsafe',
    })).toThrow(/landing intent authority/u);
    expect(() => executionEffectLandingIntentDigestV1({
      ...input,
      extra: true,
    } as never)).toThrow(/landing intent authority/u);
    expect(() => executionEffectLandingIntentDigestV1(new Proxy(input, {})))
      .toThrow(/landing intent authority/u);
  });

  it('separates restart-stable workspace authority from capture-local root evidence', () => {
    const fixture = changedBundle();
    const recapturedIdentity = Object.freeze({
      ...fixture.workspace.workspaceIdentity,
      rootHandleEvidenceDigest: digestValue('2'),
    });
    expect(executionEffectWorkspaceAuthorityDigestV1(recapturedIdentity)).toBe(
      executionEffectWorkspaceAuthorityDigestV1(fixture.workspace.workspaceIdentity),
    );

    const recapturedWorkspace = createExecutionEffectWorkspaceSnapshotSealV1({
      attempt: fixture.workspace.attempt,
      admissionReceiptDigest: fixture.workspace.admissionReceiptDigest,
      custodyPolicyDigest: fixture.workspace.custodyPolicyDigest,
      writePolicyDigest: fixture.workspace.writePolicyDigest,
      workspaceIdentity: recapturedIdentity,
      workspaceResource: fixture.workspace.workspaceResource,
      dependencyResource: fixture.workspace.dependencyResource,
      nativeCapabilityDigest: fixture.workspace.nativeCapabilityDigest,
      platform: fixture.workspace.platform,
      sealedAt: fixture.workspace.sealedAt,
    });
    expect(recapturedWorkspace.workspaceIdentityDigest)
      .not.toBe(fixture.workspace.workspaceIdentityDigest);
    expect(recapturedWorkspace.sealDigest).not.toBe(fixture.workspace.sealDigest);

    expect(executionEffectWorkspaceAuthorityDigestV1({
      ...fixture.workspace.workspaceIdentity,
      directoryId: 'ino:foreign',
    })).not.toBe(executionEffectWorkspaceAuthorityDigestV1(
      fixture.workspace.workspaceIdentity,
    ));
    expect(() => executionEffectWorkspaceAuthorityDigestV1({
      ...fixture.workspace.workspaceIdentity,
      rootHandleEvidenceDigest: 'invalid',
    })).toThrow(/workspace authority/u);
  });

  it('binds one strict dependency resource into workspace seal and post-commit release', () => {
    const fixture = changedBundle();
    const dependency = fixture.workspace.dependencyResource;
    expect(parseExecutionEffectDependencyResourceV1(dependency)).toEqual(dependency);
    expect(parseExecutionEffectDependencyResourceV1({
      ...dependency,
      volumeName: 'foreign-dependency-volume',
    })).toBeNull();
    expect(parseExecutionEffectDependencyResourceV1({
      ...dependency,
      populationReceiptDigest: digestValue('0'),
    })).toBeNull();
    expect(parseExecutionEffectDependencyResourceV1(new Proxy(dependency, {}))).toBeNull();
    const replayedDependency = createExecutionEffectDependencyResourceV1({
      attempt: { ...dependency.attempt, generation: dependency.attempt.generation + 1 },
      admissionReceiptDigest: dependency.admissionReceiptDigest,
      custodyPolicyDigest: dependency.custodyPolicyDigest,
      imageIdentityDigest: dependency.imageIdentityDigest,
      labelsDigest: dependency.labelsDigest,
      mountPlanDigest: dependency.mountPlanDigest,
      populationReceiptDigest: dependency.populationReceiptDigest,
      volumeName: 'deckent-effect-dependency-replayed',
      volumeIdentityDigest: dependency.volumeIdentityDigest,
      readyAt: dependency.readyAt,
    });
    expect(() => createExecutionEffectWorkspaceSnapshotSealV1({
      attempt: fixture.workspace.attempt,
      admissionReceiptDigest: fixture.workspace.admissionReceiptDigest,
      custodyPolicyDigest: fixture.workspace.custodyPolicyDigest,
      writePolicyDigest: fixture.workspace.writePolicyDigest,
      workspaceIdentity: fixture.workspace.workspaceIdentity,
      workspaceResource: fixture.workspace.workspaceResource,
      dependencyResource: replayedDependency,
      nativeCapabilityDigest: fixture.workspace.nativeCapabilityDigest,
      platform: fixture.workspace.platform,
      sealedAt: fixture.workspace.sealedAt,
    })).toThrow(/workspace snapshot seal/u);
    expect(() => createExecutionEffectDependencyResourceV1({
      attempt: dependency.attempt,
      admissionReceiptDigest: dependency.admissionReceiptDigest,
      custodyPolicyDigest: dependency.custodyPolicyDigest,
      imageIdentityDigest: dependency.imageIdentityDigest,
      labelsDigest: dependency.labelsDigest,
      mountPlanDigest: dependency.mountPlanDigest,
      populationReceiptDigest: dependency.populationReceiptDigest,
      volumeName: 'deckent-effect-dependency-late',
      volumeIdentityDigest: dependency.volumeIdentityDigest,
      readyAt: 'not-a-timestamp',
    })).toThrow(/dependency resource/u);
    const lateDependency = createExecutionEffectDependencyResourceV1({
      attempt: dependency.attempt,
      admissionReceiptDigest: dependency.admissionReceiptDigest,
      custodyPolicyDigest: dependency.custodyPolicyDigest,
      imageIdentityDigest: dependency.imageIdentityDigest,
      labelsDigest: dependency.labelsDigest,
      mountPlanDigest: dependency.mountPlanDigest,
      populationReceiptDigest: dependency.populationReceiptDigest,
      volumeName: 'deckent-effect-dependency-late',
      volumeIdentityDigest: dependency.volumeIdentityDigest,
      readyAt: '2026-09-01T08:00:01.000Z',
    });
    expect(() => createExecutionEffectWorkspaceSnapshotSealV1({
      attempt: fixture.workspace.attempt,
      admissionReceiptDigest: fixture.workspace.admissionReceiptDigest,
      custodyPolicyDigest: fixture.workspace.custodyPolicyDigest,
      writePolicyDigest: fixture.workspace.writePolicyDigest,
      workspaceIdentity: fixture.workspace.workspaceIdentity,
      workspaceResource: fixture.workspace.workspaceResource,
      dependencyResource: lateDependency,
      nativeCapabilityDigest: fixture.workspace.nativeCapabilityDigest,
      platform: fixture.workspace.platform,
      sealedAt: fixture.workspace.sealedAt,
    })).toThrow(/workspace snapshot seal/u);
    const release = createExecutionEffectWorkspaceReleaseV1({
      attempt: fixture.workspace.attempt,
      admissionReceiptDigest: fixture.workspace.admissionReceiptDigest,
      custodyPolicyDigest: fixture.workspace.custodyPolicyDigest,
      workspaceSnapshotSealDigest: fixture.workspace.sealDigest,
      workspaceResource: fixture.workspace.workspaceResource,
      dependencyResource: dependency,
      transactionDigest: fixture.terminal.transactionDigest,
      committedJournalDigest: fixture.terminal.committedJournalDigest,
      providerContainer: {
        containerName: 'deckent-provider-1',
        deletionReceiptDigest: digestValue('1'),
        absenceEvidenceDigest: digestValue('2'),
      },
      workspaceVolume: {
        volumeName: fixture.workspace.workspaceResource.volumeName,
        deletionReceiptDigest: digestValue('3'),
        absenceEvidenceDigest: digestValue('4'),
      },
      dependencyVolume: {
        volumeName: dependency.volumeName,
        volumeIdentityDigest: dependency.volumeIdentityDigest,
        deletionReceiptDigest: digestValue('5'),
        absenceEvidenceDigest: digestValue('6'),
      },
      releasedAt: '2026-09-01T08:04:00.000Z',
    });
    expect(parseExecutionEffectWorkspaceReleaseV1(release)).toEqual(release);
    expect(parseExecutionEffectWorkspaceReleaseV1({
      ...release,
      dependencyVolume: {
        ...release.dependencyVolume,
        volumeNameDigest: digestValue('f'),
      },
    })).toBeNull();
    expect(parseExecutionEffectWorkspaceReleaseV1({
      ...release,
      dependencyResourceDigest: digestValue('f'),
    })).toBeNull();
    expect(() => createExecutionEffectWorkspaceReleaseV1({
      attempt: fixture.workspace.attempt,
      admissionReceiptDigest: fixture.workspace.admissionReceiptDigest,
      custodyPolicyDigest: fixture.workspace.custodyPolicyDigest,
      workspaceSnapshotSealDigest: fixture.workspace.sealDigest,
      workspaceResource: fixture.workspace.workspaceResource,
      dependencyResource: dependency,
      transactionDigest: fixture.terminal.transactionDigest,
      committedJournalDigest: fixture.terminal.committedJournalDigest,
      providerContainer: {
        containerName: 'deckent-provider-1',
        deletionReceiptDigest: digestValue('1'),
        absenceEvidenceDigest: digestValue('2'),
      },
      workspaceVolume: {
        volumeName: fixture.workspace.workspaceResource.volumeName,
        deletionReceiptDigest: digestValue('3'),
        absenceEvidenceDigest: digestValue('4'),
      },
      dependencyVolume: {
        volumeName: 'foreign-dependency-volume',
        volumeIdentityDigest: dependency.volumeIdentityDigest,
        deletionReceiptDigest: digestValue('5'),
        absenceEvidenceDigest: digestValue('6'),
      },
      releasedAt: '2026-09-01T08:04:00.000Z',
    })).toThrow(/workspace release/u);
    const { dependencyResource: _missing, ...missingDependency } = fixture.workspace;
    expect(parseExecutionEffectWorkspaceSnapshotSealV1(missingDependency)).toBeNull();
  });

  it('represents an empty staged file as one canonical zero-length Store chunk', () => {
    const empty = new Uint8Array(0);
    const source = createExecutionEffectStagedSourceSealV1({
      path: 'empty.bin',
      byteLength: 0,
      contentDigest: executionEffectPersistenceRawDigest(empty),
      workspaceIdentityDigest: digestValue('1'),
      attemptDigest: digestValue('2'),
      admissionReceiptDigest: digestValue('3'),
      custodyPolicyDigest: digestValue('4'),
      landingIntentDigest: digestValue('5'),
      chunks: [{
        byteLength: 0,
        artifactKey: 'empty-chunk',
        artifactReceiptDigest: digestValue('6'),
        contentDigest: executionEffectPersistenceRawDigest(empty),
      }],
    });
    expect(source.byteLength).toBe(0);
    expect(source.chunks).toHaveLength(1);
    expect(source.chunks[0]).toMatchObject({ index: 0, byteOffset: 0, byteLength: 0 });
    expect(() => createExecutionEffectStagedSourceSealV1({
      ...source,
      chunks: [],
    })).toThrow(/execution effect stag/u);
  });

  it('recomputes manifests, decision, transaction and every staged raw chunk', () => {
    const fixture = changedBundle();
    expect(fixture.workspaceCaptureCapabilityDigest)
      .not.toBe(fixture.landingNativeCapabilityDigest);
    expect(fixture.workspace.nativeCapabilityDigest)
      .toBe(fixture.workspaceCaptureCapabilityDigest);
    const verified = verifyExecutionEffectPersistenceBundleV1(fixture.input);
    expect(verified?.decisionDigest).toBe(fixture.decision.decisionDigest);
    expect(verified?.terminal.transactionDigest).toBe(fixture.terminal.transactionDigest);
    expect(verified?.stagedArtifactRefs).toEqual([
      {
        artifactKey: 'chunk-0',
        artifactReceiptDigest: fixture.artifacts[0]!.artifactReceiptDigest,
      },
      {
        artifactKey: 'chunk-1',
        artifactReceiptDigest: fixture.artifacts[1]!.artifactReceiptDigest,
      },
    ]);
  });

  it('rejects phase swaps, missing/orphan chunks and raw or aggregate digest drift', () => {
    const fixture = changedBundle();
    expect(verifyExecutionEffectPersistenceBundleV1({
      ...fixture.input,
      baselineBytes: fixture.input.finalBytes,
      finalBytes: fixture.input.baselineBytes,
    })).toBeNull();
    expect(verifyExecutionEffectPersistenceBundleV1({
      ...fixture.input,
      stagedArtifacts: [fixture.artifacts[0]!],
    })).toBeNull();
    expect(verifyExecutionEffectPersistenceBundleV1({
      ...fixture.input,
      stagedArtifacts: [
        ...fixture.artifacts,
        {
          artifactKey: 'orphan',
          artifactReceiptDigest: digestValue('f'),
          bytes: Buffer.from('orphan'),
        },
      ],
    })).toBeNull();
    expect(verifyExecutionEffectPersistenceBundleV1({
      ...fixture.input,
      stagedArtifacts: fixture.artifacts.map((artifact, index) => index === 1
        ? { ...artifact, bytes: Buffer.from('same-length!') }
        : artifact),
    })).toBeNull();
    expect(verifyExecutionEffectPersistenceBundleV1({
      ...fixture.input,
      stagedArtifacts: [fixture.artifacts[1]!, fixture.artifacts[0]!],
    })).not.toBeNull();
  });

  it('rejects fake no-change terminals and non-canonical persisted JSON', () => {
    const fixture = changedBundle();
    const fakeNoChange = createExecutionEffectLandingTerminalSealV1({
      attempt,
      attemptDigest: fixture.workspace.attemptDigest,
      disposition: 'COMMITTED_NO_CHANGE',
      workspaceSnapshotSealDigest: fixture.workspace.sealDigest,
      baselineManifestDigest: fixture.baseline.digest as ExecutionEffectPersistenceDigest,
      finalManifestDigest: fixture.final.digest as ExecutionEffectPersistenceDigest,
      effectDecisionDigest: fixture.decision.decisionDigest as ExecutionEffectPersistenceDigest,
      planId: 'fake-no-change',
      operations: [],
      preparedJournalDigest: digestValue('1'),
      applyingJournalDigest: null,
      stepJournalDigests: [],
      committedJournalDigest: digestValue('2'),
      finalVerificationReceiptDigest: null,
      journalArtifacts: {
        prepared: fixture.terminal.journalArtifacts.prepared,
        applying: null,
        steps: [],
        committed: fixture.terminal.journalArtifacts.committed,
      },
      receiptArtifacts: {
        nativeReceipts: [],
        finalVerificationReceipt: null,
        leaseTerminalReceipt: fixture.terminal.receiptArtifacts.leaseTerminalReceipt,
      },
      leaseTerminal: 'RELEASED_NO_CHANGE',
      leaseTerminalReceiptDigest: digestValue('3'),
      committedAt: '2026-09-01T08:03:00.000Z',
    });
    expect(verifyExecutionEffectPersistenceBundleV1({
      ...fixture.input,
      terminalBytes: bytes(fakeNoChange),
      stagedArtifacts: [],
    })).toBeNull();
    expect(verifyExecutionEffectPersistenceBundleV1({
      ...fixture.input,
      workspaceBytes: Buffer.from(JSON.stringify(fixture.workspace, null, 2)),
    })).toBeNull();

    const {
      version: _version,
      kind: _kind,
      phase: _phase,
      planDigest: _planDigest,
      transactionDigest: _transactionDigest,
      sealDigest: _sealDigest,
      ...terminalInput
    } = fixture.terminal;
    expect(() => createExecutionEffectLandingTerminalSealV1({
      ...terminalInput,
      attempt,
      attemptDigest: fixture.workspace.attemptDigest,
      stepJournalDigests: [],
    })).toThrow(/terminal seal/u);
    const secondOperation = createExecutionEffectPersistenceOperationV1({
      index: 1,
      kind: 'MODE',
      path: 'mode-only.bin',
      effectDigests: [digestValue('f')],
      derivedParent: null,
      stagedSource: null,
      entryPreimages: fixture.terminal.operations[0]!.entryPreimages,
      entryPostimages: fixture.terminal.operations[0]!.entryPostimages,
      parentAuthorities: fixture.terminal.operations[0]!.parentAuthorities,
      nativeReceiptDigest: digestValue('0'),
      durabilityEvidenceDigest: digestValue('1'),
    });
    expect(() => createExecutionEffectLandingTerminalSealV1({
      ...terminalInput,
      attempt,
      attemptDigest: fixture.workspace.attemptDigest,
      operations: [fixture.terminal.operations[0]!, secondOperation],
      stepJournalDigests: [digestValue('b'), digestValue('b')],
    })).toThrow(/terminal seal/u);
  });

  it('strictly round-trips terminal/workspace seals and accepted-result landing binding', () => {
    const fixture = changedBundle();
    expect(parseExecutionEffectWorkspaceSnapshotSealV1(fixture.workspace))
      .toEqual(fixture.workspace);
    expect(parseExecutionEffectLandingTerminalSealV1(fixture.terminal, {
      attempt,
      attemptDigest: fixture.workspace.attemptDigest,
    })).toEqual(fixture.terminal);
    const transaction = Object.freeze({
      version: 1 as const,
      projectId: attempt.projectId,
      taskId: attempt.taskId,
      attemptId: attempt.attemptId,
      generation: attempt.generation,
      attemptDigest: fixture.workspace.attemptDigest,
      baselineManifestDigest: fixture.terminal.baselineManifestDigest,
      finalManifestDigest: fixture.terminal.finalManifestDigest,
      containmentDecisionDigest: fixture.terminal.effectDecisionDigest,
      planId: fixture.terminal.planId,
      planDigest: fixture.terminal.planDigest,
      transactionDigest: fixture.terminal.transactionDigest,
    });
    const receipt = createExecutionEffectLandingReceiptV1({
      state: 'COMMITTED',
      transaction,
      committedJournalDigest: fixture.terminal.committedJournalDigest,
      leaseTerminalReceiptDigest: fixture.terminal.leaseTerminalReceiptDigest,
      operationReceiptDigests: [fixture.terminal.operations[0]!.nativeReceiptDigest],
      finalVerificationReceiptDigest: fixture.terminal.finalVerificationReceiptDigest,
    });
    expect(parseExecutionEffectLandingReceiptV1(receipt)).toEqual(receipt);
    expect(parseExecutionEffectLandingReceiptV1({
      ...receipt,
      leaseTerminalReceiptDigest: digestValue('0'),
    })).toBeNull();
    const binding = createTaskAttemptEffectLandingBindingV2({
      identity: attempt,
      admissionReceiptDigest: fixture.workspace.admissionReceiptDigest,
      custodyPolicyDigest: fixture.workspace.custodyPolicyDigest,
      landingArtifactKey: 'primary',
      landingArtifactReceiptDigest: digestValue('4'),
      landingReceiptDigest: digestValue('5'),
      effectLandingChainDigest: digestValue('6'),
      readyLifecycleAuthorityDigest: digestValue('7'),
      disposition: 'COMMITTED',
      effectDecisionDigest: fixture.terminal.effectDecisionDigest,
      transactionDigest: fixture.terminal.transactionDigest,
    });
    expect(parseTaskAttemptEffectLandingBindingV2(binding)).toEqual(binding);
    expect(extractTaskAttemptEffectLandingBindingV2({
      attemptCustody: { effectLanding: binding },
    })).toEqual(binding);
    expect(parseTaskAttemptEffectLandingBindingV2({
      ...binding,
      transactionDigest: digestValue('f'),
    })).toBeNull();
  });

  it('binds restart adoption to immutable journal refs, the prior lease and a fresh boundary', () => {
    const fixture = changedBundle();
    const transaction = Object.freeze({
      version: 1 as const,
      projectId: attempt.projectId,
      taskId: attempt.taskId,
      attemptId: attempt.attemptId,
      generation: attempt.generation,
      attemptDigest: fixture.workspace.attemptDigest,
      baselineManifestDigest: fixture.terminal.baselineManifestDigest,
      finalManifestDigest: fixture.terminal.finalManifestDigest,
      containmentDecisionDigest: fixture.terminal.effectDecisionDigest,
      planId: fixture.terminal.planId,
      planDigest: fixture.terminal.planDigest,
      transactionDigest: fixture.terminal.transactionDigest,
    });
    const txHex = transaction.transactionDigest.slice(7);
    const ref = (
      phase: 'PREPARED' | 'APPLYING' | 'COMMITTED',
      source: typeof fixture.terminal.journalArtifacts.prepared,
      recordDigest: ExecutionEffectPersistenceDigest,
    ) => Object.freeze({
      phase,
      artifactKey: `effect-landing/${txHex}/${phase.toLowerCase()}.json`,
      artifactReceiptDigest: source.artifactReceiptDigest,
      contentDigest: source.contentDigest,
      byteLength: source.byteLength,
      recordDigest,
    });
    const priorLease = Object.freeze({
      transactionDigest: transaction.transactionDigest,
      fencingTokenDigest: digestValue('4'),
      leaseReceiptDigest: digestValue('9'),
    });
    const context = createExecutionEffectLandingLeaseResumeContextV1({
      transaction,
      priorLease,
      prepared: ref(
        'PREPARED',
        fixture.terminal.journalArtifacts.prepared,
        fixture.terminal.preparedJournalDigest,
      ),
      applying: Object.freeze({
        journal: ref(
          'APPLYING',
          fixture.terminal.journalArtifacts.applying!,
          fixture.terminal.applyingJournalDigest!,
        ),
        previousBoundary: Object.freeze({
          transactionDigest: transaction.transactionDigest,
          fencingTokenDigest: priorLease.fencingTokenDigest,
          boundaryId: 'boundary-1',
          boundaryReceiptDigest: digestValue('5'),
        }),
      }),
      committed: Object.freeze({
        journal: ref(
          'COMMITTED',
          fixture.terminal.journalArtifacts.committed,
          fixture.terminal.committedJournalDigest,
        ),
        disposition: 'COMMITTED' as const,
      }),
    });
    expect(parseExecutionEffectLandingLeaseResumeContextV1(context)).toEqual(context);
    const adoptedLease = Object.freeze({
      transactionDigest: transaction.transactionDigest,
      fencingTokenDigest: digestValue('a'),
      leaseReceiptDigest: digestValue('b'),
    });
    const result = createExecutionEffectLandingLeaseResumeResultV1({
      context,
      lease: adoptedLease,
      currentBoundary: Object.freeze({
        transactionDigest: transaction.transactionDigest,
        fencingTokenDigest: adoptedLease.fencingTokenDigest,
        boundaryId: 'boundary-adopted',
        boundaryReceiptDigest: digestValue('c'),
      }),
      durableEvidenceDigests: [digestValue('d')],
      resumedAt: '2026-09-01T08:03:20.000Z',
    });
    expect(parseExecutionEffectLandingLeaseResumeResultV1(result, context)).toEqual(result);
    expect(parseExecutionEffectLandingLeaseResumeResultV1({
      ...result,
      currentBoundary: { ...result.currentBoundary, fencingTokenDigest: digestValue('f') },
    }, context)).toBeNull();
    expect(() => createExecutionEffectLandingLeaseResumeContextV1({
      transaction,
      priorLease,
      prepared: context.prepared,
      applying: Object.freeze({
        ...context.applying!,
        previousBoundary: Object.freeze({
          ...context.applying!.previousBoundary,
          fencingTokenDigest: digestValue('f'),
        }),
      }),
      committed: context.committed,
    })).toThrow(/resume context/u);
    expect(() => createExecutionEffectLandingLeaseResumeContextV1({
      transaction,
      priorLease,
      prepared: context.prepared,
      applying: context.applying,
      committed: { ...context.committed!, disposition: 'COMMITTED_NO_CHANGE' },
    })).toThrow(/resume context/u);
  });
});
