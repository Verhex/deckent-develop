import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createExecutionEffectLandingTerminalSealV1,
  createExecutionEffectWorkspaceSnapshotSealV1,
  executionEffectPersistenceRawDigest,
  parseExecutionEffectLandingLeaseTerminalReceiptEvidenceV1,
  type ExecutionEffectLandingJournalArtifactRefV1,
  type ExecutionEffectLandingTerminalSealV1,
  type ExecutionEffectPersistenceDigest,
  type VerifiedExecutionEffectPersistenceBundleV1,
} from '../../src/core/execution-effect-persistence-contract.js';
import type {
  Sha256Digest,
  TaskAttemptCustodyArtifactReceiptV2,
} from '../../src/core/task-attempt-custody-store.js';
import { TaskAttemptCustodyStore } from '../../src/core/task-attempt-custody-store.js';
import { EXECUTION_EFFECT_CAPTURE_HARD_LIMITS } from '../../src/core/execution-effect-containment.js';
import {
  createExecutionEffectLifecycleStoreAdmissionAdapterV1,
  createExecutionEffectStoreAdapterV1,
  executionEffectStoreCleanupArtifactKeyV1,
  executionEffectStoreJournalArtifactKeyV1,
} from '../../src/orchestra/execution-effect-store-adapter.js';
import {
  allocateExecutionEffectDockerWorkspaceV1,
  createExecutionEffectDockerReconciledAbsenceReceiptV1,
  createExecutionEffectDockerVolumeObservationV1,
  createExecutionEffectDockerWorkspacePlanV1,
} from '../../src/orchestra/execution-effect-docker-lifecycle.js';
import {
  InMemoryTaskAttemptCustodyAdapter,
  createTaskResultSettlementV2Fixture,
  type TaskResultSettlementV2Fixture,
} from '../helpers/task-result-settlement-v2-fixture.js';

function digest(value: string): Sha256Digest {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function cleanupEvidenceKey(
  admissionReceiptDigest: Sha256Digest,
  mode: 'RELEASE' | 'COMPENSATION',
  role: string,
): string {
  const roleDigest = executionEffectPersistenceRawDigest(
    Buffer.from(`${mode}\0${role}`, 'utf8'),
  ).slice(7, 39);
  return `effect-ce-${admissionReceiptDigest.slice(7, 55)}-${mode === 'RELEASE' ? 'r' : 'c'}-${roleDigest}`;
}

function clock(values: readonly string[]): () => string {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

function admission(fixture: TaskResultSettlementV2Fixture) {
  const value = fixture.store.readAdmission(fixture.identity, fixture.policy);
  if (value === null) throw new Error('fixture admission is unavailable');
  return value;
}

function admissionOnlyClone(fixture: TaskResultSettlementV2Fixture): Readonly<{
  store: TaskAttemptCustodyStore;
  admissionReceiptDigest: Sha256Digest;
}> {
  const store = TaskAttemptCustodyStore.open({
    adapter: new InMemoryTaskAttemptCustodyAdapter(),
    absoluteRoot: '/fixture/store-adapter-custody',
    canonicalProjectRoot: '/fixture/project',
    projectId: fixture.identity.projectId,
    create: true,
  });
  let predecessorDigest: Sha256Digest | null = null;
  let predecessorIdentity: typeof fixture.identity | null = null;
  for (let generation = 1; generation <= fixture.identity.generation; generation += 1) {
    const identity = { ...fixture.identity, generation };
    const sourceAdmission = fixture.store.readAdmission(identity, fixture.policy);
    if (sourceAdmission === null) throw new Error('source fixture admission is unavailable');
    const snapshot = fixture.store.readTaskSnapshot({
      identity,
      policy: fixture.policy,
      admissionReceiptDigest: sourceAdmission.receiptDigest,
    });
    if (snapshot === null) throw new Error('source fixture task snapshot is unavailable');
    const cloned = store.createAdmission({
      identity,
      policy: fixture.policy,
      admittedAt: sourceAdmission.admittedAt,
      predecessorDigest,
      predecessorIdentity,
      taskSnapshot: JSON.parse(Buffer.from(snapshot.bytes).toString('utf8')),
    });
    if (cloned.receiptDigest !== sourceAdmission.receiptDigest) {
      throw new Error('cloned admission receipt drifted');
    }
    predecessorDigest = cloned.receiptDigest;
    predecessorIdentity = identity;
  }
  if (predecessorDigest === null) throw new Error('cloned admission is unavailable');
  return { store, admissionReceiptDigest: predecessorDigest };
}

function verifiedBundle(fixture: TaskResultSettlementV2Fixture): Readonly<{
  bundle: VerifiedExecutionEffectPersistenceBundleV1;
  release: NonNullable<ReturnType<typeof fixture.store.readVerifiedEffectLanding>>['workspaceRelease'];
}> {
  const verified = fixture.store.readVerifiedEffectLanding({
    identity: fixture.identity,
    policy: fixture.policy,
    artifactKey: 'primary',
  });
  if (verified === null) throw new Error('fixture effect landing is unavailable');
  return { bundle: verified.verifiedBundle, release: verified.workspaceRelease };
}

function journalBytes(
  fixture: Pick<TaskResultSettlementV2Fixture, 'store' | 'identity' | 'policy'>,
  ref: ExecutionEffectLandingJournalArtifactRefV1,
): Uint8Array {
  const artifact = fixture.store.readVerifiedArtifact({
    identity: fixture.identity,
    policy: fixture.policy,
    artifactClass: 'execution-effect-landing-journal',
    artifactKey: ref.artifactKey,
    receiptDigest: ref.artifactReceiptDigest,
  });
  if (artifact === null) throw new Error('fixture journal artifact is unavailable');
  return artifact.bytes;
}

function recreatedTerminal(
  terminal: ExecutionEffectLandingTerminalSealV1,
  bundle: VerifiedExecutionEffectPersistenceBundleV1,
  prepared: ExecutionEffectLandingJournalArtifactRefV1,
  committed: ExecutionEffectLandingJournalArtifactRefV1,
): ExecutionEffectLandingTerminalSealV1 {
  return createExecutionEffectLandingTerminalSealV1({
    attempt: bundle.workspace.attempt,
    attemptDigest: bundle.workspace.attemptDigest,
    disposition: terminal.disposition,
    workspaceSnapshotSealDigest: terminal.workspaceSnapshotSealDigest,
    baselineManifestDigest: terminal.baselineManifestDigest,
    finalManifestDigest: terminal.finalManifestDigest,
    effectDecisionDigest: terminal.effectDecisionDigest,
    planId: terminal.planId,
    operations: terminal.operations,
    preparedJournalDigest: terminal.preparedJournalDigest,
    applyingJournalDigest: terminal.applyingJournalDigest,
    stepJournalDigests: terminal.stepJournalDigests,
    committedJournalDigest: terminal.committedJournalDigest,
    finalVerificationReceiptDigest: terminal.finalVerificationReceiptDigest,
    journalArtifacts: {
      prepared,
      applying: terminal.journalArtifacts.applying,
      steps: terminal.journalArtifacts.steps,
      committed,
    },
    receiptArtifacts: terminal.receiptArtifacts,
    leaseTerminal: terminal.leaseTerminal,
    leaseTerminalReceiptDigest: terminal.leaseTerminalReceiptDigest,
    committedAt: terminal.committedAt,
  });
}

function publishedRef(
  fixture: Pick<TaskResultSettlementV2Fixture, 'store' | 'identity' | 'policy'>,
  logicalKey: string,
  recordDigest: ExecutionEffectPersistenceDigest,
  bytes: Uint8Array,
  bridge: ReturnType<typeof createExecutionEffectStoreAdapterV1>,
): ExecutionEffectLandingJournalArtifactRefV1 {
  let artifact;
  try {
    artifact = bridge.journal.publishImmutable({
      key: logicalKey,
      bytes,
      contentDigest: executionEffectPersistenceRawDigest(bytes),
    });
  } catch (error) {
    throw new Error(`journal publication failed: ${logicalKey}`, { cause: error });
  }
  const ref = bridge.readJournalReference(logicalKey, recordDigest);
  expect(ref).not.toBeNull();
  expect(artifact.publicationReceiptDigest).toBe(ref?.artifactReceiptDigest);
  const receipt = fixture.store.readArtifactReceipt({
    identity: fixture.identity,
    policy: fixture.policy,
    artifactClass: 'execution-effect-landing-journal',
    artifactKey: ref!.artifactKey,
  });
  expect(receipt?.receiptDigest).toBe(ref?.artifactReceiptDigest);
  return ref!;
}

describe('execution effect Store adapter', () => {
  it('fails closed when a later cleanup artifact exists behind a missing predecessor', () => {
    const fixture = createTaskResultSettlementV2Fixture({ tailArtifactKey: 'store-cleanup-gap' });
    const cloned = admissionOnlyClone(fixture);
    const bridge = createExecutionEffectLifecycleStoreAdmissionAdapterV1({
      store: cloned.store,
      identity: fixture.identity,
      policy: fixture.policy,
      admissionReceiptDigest: cloned.admissionReceiptDigest,
      platform: 'wsl2-linux',
      now: () => '2026-09-01T00:00:01.000Z',
    });
    cloned.store.publishHostArtifact({
      identity: fixture.identity,
      policy: fixture.policy,
      admissionReceiptDigest: cloned.admissionReceiptDigest,
      artifactClass: 'execution-effect-lifecycle-authority',
      artifactKey: executionEffectStoreCleanupArtifactKeyV1(
        cloned.admissionReceiptDigest, 'RELEASE', 'CONTAINER_ABSENT',
      ),
      capturedAt: '2026-09-01T00:00:00.500Z',
      bytes: Buffer.from('{"forged":true}', 'utf8'),
    });
    expect(() => bridge.readLatestReleaseProgress()).toThrow(
      /cleanup progress (?:schema|artifact)|durable gap/u,
    );
  }, 30_000);

  it('publishes and rereads ALLOCATING before project-root landing authority exists', () => {
    const fixture = createTaskResultSettlementV2Fixture({ tailArtifactKey: 'store-allocation' });
    const cloned = admissionOnlyClone(fixture);
    const bridge = createExecutionEffectLifecycleStoreAdmissionAdapterV1({
      store: cloned.store,
      identity: fixture.identity,
      policy: fixture.policy,
      admissionReceiptDigest: cloned.admissionReceiptDigest,
      platform: 'wsl2-linux',
      now: () => '2026-09-01T00:00:00.000Z',
    });
    expect(() => bridge.journal).toThrow(/project root identity/u);
    const imageDigest = digest('allocation-image');
    const allocation = allocateExecutionEffectDockerWorkspaceV1({
      platform: 'wsl',
      attempt: Object.freeze({
        projectId: fixture.identity.projectId,
        taskId: fixture.identity.taskId,
        attemptId: fixture.identity.attemptId,
        generation: fixture.identity.generation,
      }),
      admissionReceiptDigest: cloned.admissionReceiptDigest,
      custodyPolicyDigest: fixture.policy.policyDigest,
      admittedAt: '2026-09-01T00:00:00.000Z',
      filesWrite: Object.freeze([]),
      nativeCapabilityDigest: digest('allocation-native'),
      workspacePlan: createExecutionEffectDockerWorkspacePlanV1({
        imageReference: `deckent-worker@${imageDigest}`,
        imageDigest,
        volumeName: `deckent-xw-${'1'.repeat(48)}`,
        baseLabels: Object.freeze({ 'deckent.attempt': fixture.identity.attemptId }),
        workspaceResourceInstanceNonce: '2'.repeat(64),
        dependencyResourceInstanceNonce: '3'.repeat(64),
        mountPlan: Object.freeze({
          type: 'volume', providerTarget: '/workspace', providerAccess: 'read-write',
          helperTarget: '/workspace', helperAccess: 'read-only',
        }),
        dependencyPlan: Object.freeze({
          sourceAuthority: 'image-owned-read-only-volume', imageSource: '/app/node_modules',
          volumeName: `deckent-xd-${'4'.repeat(48)}`, populationTarget: '/dependencies',
          providerTarget: '/workspace/node_modules', providerAccess: 'read-only',
          networkAccess: 'none', manifestScope: 'excluded-mount-overlay',
        }),
        inventoryPaths: Object.freeze(['package.json']),
      }),
      captureLimits: EXECUTION_EFFECT_CAPTURE_HARD_LIMITS,
    });
    expect(allocation.state).toBe('ALLOCATING');
    if (allocation.state !== 'ALLOCATING') throw new Error('allocation failed');
    const first = bridge.publishLifecycleAuthority(allocation.lifecycleAuthority);
    const replay = bridge.publishLifecycleAuthority(allocation.lifecycleAuthority);
    expect(replay.artifact.artifactReceiptDigest).toBe(first.artifact.artifactReceiptDigest);
    expect(bridge.readVerifiedAllocatingLifecycleAuthority({
      semanticAuthorityDigest: allocation.lifecycleAuthority.authorityDigest,
    }))?.toEqual(Object.freeze({
      authority: allocation.lifecycleAuthority,
      artifact: first.artifact,
    }));
    expect(bridge.readLatestLifecycleAuthority()?.state).toBe('ALLOCATING');
    expect(() => bridge.publishLifecycleAuthority(Object.freeze({
      ...allocation.lifecycleAuthority,
      admissionReceiptDigest: digest('foreign-admission'),
    }) as never)).toThrow(/lifecycle Store authority/u);

    const observationAuthorityDigest = digest('allocation-cleanup-observation');
    const workspaceAbsence = createExecutionEffectDockerVolumeObservationV1({
      state: 'ABSENT',
      authorityDigest: observationAuthorityDigest,
      volumeName: allocation.lifecycleAuthority.workspacePlan.volumeName,
      resourceInstanceDigest:
        allocation.lifecycleAuthority.workspacePlan.workspaceResourceInstanceDigest,
      observedAt: '2026-09-01T00:00:00.100Z',
    });
    const dependencyAbsence = createExecutionEffectDockerVolumeObservationV1({
      state: 'ABSENT',
      authorityDigest: observationAuthorityDigest,
      volumeName: allocation.lifecycleAuthority.workspacePlan.dependencyPlan.volumeName,
      resourceInstanceDigest:
        allocation.lifecycleAuthority.workspacePlan.dependencyResourceInstanceDigest,
      observedAt: '2026-09-01T00:00:00.100Z',
    });
    // Crash injection: the observation first writer reached durable Store, but the
    // COMPENSATION_PREPARED progress publication did not run.
    cloned.store.publishHostArtifact({
      identity: fixture.identity,
      policy: fixture.policy,
      admissionReceiptDigest: cloned.admissionReceiptDigest,
      artifactClass: 'execution-effect-lifecycle-authority',
      artifactKey: cleanupEvidenceKey(
        cloned.admissionReceiptDigest, 'COMPENSATION', 'workspace-observation',
      ),
      capturedAt: workspaceAbsence.observedAt,
      bytes: Buffer.from(JSON.stringify(workspaceAbsence), 'utf8'),
    });
    const retriedWorkspaceAbsence = createExecutionEffectDockerVolumeObservationV1({
      state: 'ABSENT',
      authorityDigest: observationAuthorityDigest,
      volumeName: allocation.lifecycleAuthority.workspacePlan.volumeName,
      resourceInstanceDigest:
        allocation.lifecycleAuthority.workspacePlan.workspaceResourceInstanceDigest,
      observedAt: '2026-09-01T00:00:00.150Z',
    });
    expect(() => bridge.publishCleanupDeleteIntent({
      mode: 'COMPENSATION', resourceKind: 'workspace-volume',
      progressedAt: '2026-09-01T00:00:00.200Z',
    })).toThrow(/predecessor mismatch/u);
    const compensation = bridge.publishCompensationPrepared({
      lifecycleAuthorityDigest: allocation.lifecycleAuthority.authorityDigest,
      workspaceObservation: retriedWorkspaceAbsence,
      dependencyObservation: dependencyAbsence,
      progressedAt: '2026-09-01T00:00:00.200Z',
    });
    expect(compensation.progress.preparationEvidenceArtifacts[0]?.capturedAt)
      .toBe(workspaceAbsence.observedAt);
    expect(bridge.publishCompensationPrepared({
      lifecycleAuthorityDigest: allocation.lifecycleAuthority.authorityDigest,
      workspaceObservation: workspaceAbsence,
      dependencyObservation: dependencyAbsence,
      progressedAt: '2026-09-01T00:00:00.200Z',
    }).artifact.artifactReceiptDigest).toBe(compensation.artifact.artifactReceiptDigest);
    const workspaceIntent = bridge.publishCleanupDeleteIntent({
      mode: 'COMPENSATION', resourceKind: 'workspace-volume',
      progressedAt: '2026-09-01T00:00:00.300Z',
    });
    const workspaceReconciled = createExecutionEffectDockerReconciledAbsenceReceiptV1({
      resourceKind: 'workspace-volume',
      resourceName: allocation.lifecycleAuthority.workspacePlan.volumeName,
      resourceIdentityDigest: null,
      cleanupAuthorityDigest: allocation.lifecycleAuthority.authorityDigest,
      deleteIntentDigest: workspaceIntent.progress.deleteIntentDigest!,
      observedAt: '2026-09-01T00:00:00.400Z',
    });
    // Crash injection: absence evidence is durable while the state transition is not.
    cloned.store.publishHostArtifact({
      identity: fixture.identity,
      policy: fixture.policy,
      admissionReceiptDigest: cloned.admissionReceiptDigest,
      artifactClass: 'execution-effect-lifecycle-authority',
      artifactKey: cleanupEvidenceKey(
        cloned.admissionReceiptDigest,
        'COMPENSATION',
        'compensation_workspace_volume_absent-absence',
      ),
      capturedAt: workspaceReconciled.observedAt,
      bytes: Buffer.from(JSON.stringify(workspaceReconciled), 'utf8'),
    });
    const retriedWorkspaceReconciled = createExecutionEffectDockerReconciledAbsenceReceiptV1({
      resourceKind: 'workspace-volume',
      resourceName: allocation.lifecycleAuthority.workspacePlan.volumeName,
      resourceIdentityDigest: null,
      cleanupAuthorityDigest: allocation.lifecycleAuthority.authorityDigest,
      deleteIntentDigest: workspaceIntent.progress.deleteIntentDigest!,
      observedAt: '2026-09-01T00:00:00.450Z',
    });
    const workspaceAbsent = bridge.publishCleanupAbsence({
      mode: 'COMPENSATION',
      evidence: { disposition: 'RECONCILED_ABSENCE', absence: retriedWorkspaceReconciled },
      progressedAt: '2026-09-01T00:00:00.500Z',
    });
    expect(workspaceAbsent.progress.absenceEvidenceArtifact?.capturedAt)
      .toBe(workspaceReconciled.observedAt);
    const dependencyIntent = bridge.publishCleanupDeleteIntent({
      mode: 'COMPENSATION', resourceKind: 'dependency-volume',
      progressedAt: '2026-09-01T00:00:00.600Z',
    });
    const dependencyReconciled = createExecutionEffectDockerReconciledAbsenceReceiptV1({
      resourceKind: 'dependency-volume',
      resourceName: allocation.lifecycleAuthority.workspacePlan.dependencyPlan.volumeName,
      resourceIdentityDigest: null,
      cleanupAuthorityDigest: allocation.lifecycleAuthority.authorityDigest,
      deleteIntentDigest: dependencyIntent.progress.deleteIntentDigest!,
      observedAt: '2026-09-01T00:00:00.700Z',
    });
    bridge.publishCleanupAbsence({
      mode: 'COMPENSATION',
      evidence: { disposition: 'RECONCILED_ABSENCE', absence: dependencyReconciled },
      progressedAt: '2026-09-01T00:00:00.800Z',
    });
    const compensated = bridge.publishCleanupTerminal({
      mode: 'COMPENSATION', progressedAt: '2026-09-01T00:00:00.900Z',
    });
    expect(compensated.progress.state).toBe('COMPENSATED');
    const restarted = createExecutionEffectLifecycleStoreAdmissionAdapterV1({
      store: cloned.store,
      identity: fixture.identity,
      policy: fixture.policy,
      admissionReceiptDigest: cloned.admissionReceiptDigest,
      platform: 'wsl2-linux',
      now: () => '2026-09-01T00:00:01.000Z',
    });
    expect(restarted.readLatestCompensationProgress()).toEqual(compensated.progress);
  }, 30_000);

  it('publishes coordinator journals and exposes accepted authority only after full Store fan-in', () => {
    const fixture = createTaskResultSettlementV2Fixture({ tailArtifactKey: 'store-adapter-fan-in' });
    const { bundle, release } = verifiedBundle(fixture);
    const cloned = admissionOnlyClone(fixture);
    const bridge = createExecutionEffectStoreAdapterV1({
      store: cloned.store,
      identity: fixture.identity,
      policy: fixture.policy,
      admissionReceiptDigest: cloned.admissionReceiptDigest,
      projectRootIdentityDigest: digest('store-adapter-project-root'),
      platform: 'wsl2-linux',
      now: clock([
        '2026-08-30T20:01:12.000Z',
        '2026-08-30T20:01:18.000Z',
      ]),
    });
    const transactionHex = bundle.terminal.transactionDigest.slice('sha256:'.length);
    const preparedKey = `effect-landing/${transactionHex}/prepared.json`;
    const committedKey = `effect-landing/${transactionHex}/committed.json`;
    const prepared = publishedRef(
      { ...fixture, store: cloned.store },
      preparedKey,
      bundle.terminal.preparedJournalDigest,
      journalBytes(fixture, bundle.terminal.journalArtifacts.prepared),
      bridge,
    );
    const committed = publishedRef(
      { ...fixture, store: cloned.store },
      committedKey,
      bundle.terminal.committedJournalDigest,
      journalBytes(fixture, bundle.terminal.journalArtifacts.committed),
      bridge,
    );
    const leaseSource = fixture.store.readVerifiedArtifact({
      identity: fixture.identity,
      policy: fixture.policy,
      artifactClass: 'execution-effect-landing-receipt-evidence',
      artifactKey: bundle.terminal.receiptArtifacts.leaseTerminalReceipt.artifactKey,
      receiptDigest: bundle.terminal.receiptArtifacts.leaseTerminalReceipt.artifactReceiptDigest,
    });
    if (leaseSource === null) throw new Error('fixture lease terminal evidence is unavailable');
    const leaseEvidence = parseExecutionEffectLandingLeaseTerminalReceiptEvidenceV1(
      JSON.parse(Buffer.from(leaseSource.bytes).toString('utf8')),
    );
    if (leaseEvidence === null) throw new Error('fixture lease terminal evidence is invalid');
    const leaseTerminalReceipt = bridge.publishLeaseTerminalReceiptEvidence({
      artifactKey: `effect-lease-${bundle.terminal.transactionDigest.slice(7)}`,
      capturedAt: leaseEvidence.occurredAt,
      evidence: leaseEvidence,
    });
    const baseTerminal = recreatedTerminal(bundle.terminal, bundle, prepared, committed);
    const terminal = createExecutionEffectLandingTerminalSealV1({
      attempt: bundle.workspace.attempt,
      attemptDigest: bundle.workspace.attemptDigest,
      disposition: baseTerminal.disposition,
      workspaceSnapshotSealDigest: baseTerminal.workspaceSnapshotSealDigest,
      baselineManifestDigest: baseTerminal.baselineManifestDigest,
      finalManifestDigest: baseTerminal.finalManifestDigest,
      effectDecisionDigest: baseTerminal.effectDecisionDigest,
      planId: baseTerminal.planId,
      operations: baseTerminal.operations,
      preparedJournalDigest: baseTerminal.preparedJournalDigest,
      applyingJournalDigest: baseTerminal.applyingJournalDigest,
      stepJournalDigests: baseTerminal.stepJournalDigests,
      committedJournalDigest: baseTerminal.committedJournalDigest,
      finalVerificationReceiptDigest: baseTerminal.finalVerificationReceiptDigest,
      journalArtifacts: baseTerminal.journalArtifacts,
      receiptArtifacts: {
        nativeReceipts: [],
        finalVerificationReceipt: null,
        leaseTerminalReceipt,
      },
      leaseTerminal: baseTerminal.leaseTerminal,
      leaseTerminalReceiptDigest: baseTerminal.leaseTerminalReceiptDigest,
      committedAt: baseTerminal.committedAt,
    });

    const landingInput = {
      final: bundle.final,
      finalCapturedAt: bundle.final.captureAuthority.completedAt,
      terminalSeal: terminal,
      workspaceRelease: release,
      landingArtifactKey: 'store-adapter-primary',
    };
    expect(() => bridge.publishLanding({
      ...landingInput,
      preparedWorkspace: null as never,
    })).toThrow(/Store landing publication/u);
    expect(() => bridge.publishPreparedWorkspace({
      workspaceSnapshot: bundle.workspace,
      baseline: bundle.baseline,
      baselineCapturedAt: bundle.baseline.captureAuthority.completedAt,
      lifecycleAuthority: null as never,
    })).toThrow(/prepared lifecycle|prepared workspace publication/u);
    expect(bridge.journal.readImmutable(preparedKey)).toMatchObject({
      key: preparedKey,
      publicationReceiptDigest: prepared.artifactReceiptDigest,
    });
    expect(bridge.readPreparedWorkspace()).toBeNull();
    expect(() => bridge.readAcceptedAuthority('store-adapter-primary')).toThrow(
      /Verified execution effect landing authority is unavailable/u,
    );
  }, 60_000);

  it('rejects journal replacement, forged references, missing landings and policy-null authority', () => {
    const fixture = createTaskResultSettlementV2Fixture({ tailArtifactKey: 'store-adapter-negative' });
    const admitted = admission(fixture);
    const { bundle } = verifiedBundle(fixture);
    const bridgeInput = {
      store: fixture.store,
      identity: fixture.identity,
      policy: fixture.policy,
      admissionReceiptDigest: admitted.receiptDigest,
      projectRootIdentityDigest: digest('store-adapter-negative-root'),
      platform: 'wsl2-linux' as const,
      now: clock([
        '2026-08-30T20:01:12.000Z',
        '2026-08-30T20:01:13.000Z',
        '2026-08-30T20:01:14.000Z',
      ]),
    };
    const bridge = createExecutionEffectStoreAdapterV1(bridgeInput);
    const transactionHex = bundle.terminal.transactionDigest.slice('sha256:'.length);
    const logicalKey = `effect-landing/${transactionHex}/prepared.json`;
    const bytes = journalBytes(fixture, bundle.terminal.journalArtifacts.prepared);
    const first = bridge.journal.publishImmutable({
      key: logicalKey,
      bytes,
      contentDigest: executionEffectPersistenceRawDigest(bytes),
    });
    expect(bridge.journal.publishImmutable({
      key: logicalKey,
      bytes,
      contentDigest: executionEffectPersistenceRawDigest(bytes),
    })).toEqual(first);
    const replacement = Buffer.from('{"recordDigest":"forged"}', 'utf8');
    expect(() => bridge.journal.publishImmutable({
      key: logicalKey,
      bytes: replacement,
      contentDigest: executionEffectPersistenceRawDigest(replacement),
    })).toThrow(/first-writer collision/u);
    expect(bridge.readJournalReference(logicalKey, digest('wrong-record'))).toBeNull();
    expect(bridge.journal.readImmutable('../prepared.json')).toBeNull();
    expect(() => bridge.journal.publishImmutable({
      key: '../prepared.json',
      bytes,
      contentDigest: executionEffectPersistenceRawDigest(bytes),
    })).toThrow(/Invalid execution effect journal artifact/u);
    expect(() => bridge.readAcceptedAuthority('not-published')).toThrow(
      /Verified execution effect landing authority is unavailable/u,
    );
    expect(executionEffectStoreJournalArtifactKeyV1(logicalKey)).toMatch(
      /^el-[a-f0-9]{64}-prepared$/u,
    );

    expect(() => createExecutionEffectStoreAdapterV1({
      ...bridgeInput,
      policy: null as never,
    })).toThrow();
    expect(() => createExecutionEffectStoreAdapterV1(new Proxy(bridgeInput, {}) as never)).toThrow(
      /Invalid execution effect Store adapter authority/u,
    );

    expect(bridge.readPreparedWorkspace()).toBeNull();
    expect(() => bridge.publishPreparedWorkspace({
      workspaceSnapshot: bundle.workspace,
      baseline: bundle.baseline,
      baselineCapturedAt: '2026-08-30T19:59:59.000Z',
    })).toThrow(/prepared workspace publication/u);
    expect(() => bridge.publishPreparedWorkspace({
      workspaceSnapshot: {
        ...bundle.workspace,
        attempt: { ...bundle.workspace.attempt, attemptId: 'foreign-attempt' },
      },
      baseline: bundle.baseline,
      baselineCapturedAt: bundle.baseline.captureAuthority.completedAt,
    })).toThrow(/prepared workspace publication/u);
    expect(() => bridge.publishPreparedWorkspace({
      workspaceSnapshot: {
        ...bundle.workspace,
        custodyPolicyDigest: digest('foreign-policy'),
      },
      baseline: bundle.baseline,
      baselineCapturedAt: bundle.baseline.captureAuthority.completedAt,
    })).toThrow(/prepared workspace publication/u);
    expect(() => bridge.publishPreparedWorkspace({
      workspaceSnapshot: bundle.workspace,
      baseline: { ...bundle.baseline, digest: digest('forged-baseline') },
      baselineCapturedAt: bundle.baseline.captureAuthority.completedAt,
    })).toThrow(/prepared workspace publication/u);

    const delayedSeal = createExecutionEffectWorkspaceSnapshotSealV1({
      attempt: bundle.workspace.attempt,
      admissionReceiptDigest: bundle.workspace.admissionReceiptDigest,
      custodyPolicyDigest: bundle.workspace.custodyPolicyDigest,
      writePolicyDigest: bundle.workspace.writePolicyDigest,
      workspaceIdentity: bundle.workspace.workspaceIdentity,
      workspaceResource: bundle.workspace.workspaceResource,
      dependencyResource: bundle.workspace.dependencyResource,
      nativeCapabilityDigest: bundle.workspace.nativeCapabilityDigest,
      platform: bundle.workspace.platform,
      sealedAt: '2026-08-30T20:00:05.500Z',
    });
    const delayedClone = admissionOnlyClone(fixture);
    const delayedBridge = createExecutionEffectStoreAdapterV1({
      ...bridgeInput,
      store: delayedClone.store,
      admissionReceiptDigest: delayedClone.admissionReceiptDigest,
    });
    expect(() => delayedBridge.publishPreparedWorkspace({
      workspaceSnapshot: delayedSeal,
      baseline: bundle.baseline,
      baselineCapturedAt: bundle.baseline.captureAuthority.completedAt,
      lifecycleAuthority: null as never,
    })).toThrow(/prepared lifecycle|prepared workspace publication/u);

    const collisionClone = admissionOnlyClone(fixture);
    collisionClone.store.publishHostArtifact({
      identity: fixture.identity,
      policy: fixture.policy,
      admissionReceiptDigest: collisionClone.admissionReceiptDigest,
      artifactClass: 'execution-workspace-snapshot',
      artifactKey: `effect-workspace-${collisionClone.admissionReceiptDigest.slice(7)}`,
      capturedAt: bundle.workspace.sealedAt,
      bytes: Buffer.from('{"collision":true}', 'utf8'),
    });
    const collisionBridge = createExecutionEffectStoreAdapterV1({
      ...bridgeInput,
      store: collisionClone.store,
      admissionReceiptDigest: collisionClone.admissionReceiptDigest,
    });
    expect(() => collisionBridge.publishPreparedWorkspace({
      workspaceSnapshot: bundle.workspace,
      baseline: bundle.baseline,
      baselineCapturedAt: bundle.baseline.captureAuthority.completedAt,
      lifecycleAuthority: null as never,
    })).toThrow(/prepared lifecycle|prepared workspace publication/u);

    const terminalReceipt: TaskAttemptCustodyArtifactReceiptV2 | null =
      fixture.store.readArtifactReceipt({
        identity: fixture.identity,
        policy: fixture.policy,
        artifactClass: 'execution-effect-landing-journal',
        artifactKey: bundle.terminal.journalArtifacts.committed.artifactKey,
      });
    expect(terminalReceipt?.receiptDigest).toBe(
      bundle.terminal.journalArtifacts.committed.artifactReceiptDigest,
    );
  }, 60_000);
});
