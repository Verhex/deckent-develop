/** Component integration fixture: simulated environment boundaries, genuine lifecycle/landing/Store producers. */
import { createHash } from 'node:crypto';
import * as L from '../../src/orchestra/execution-effect-docker-lifecycle.js';
import * as C from '../../src/orchestra/execution-effect-landing-coordinator.js';
import * as P from '../../src/core/execution-effect-persistence-contract.js';
import {
  createExecutionEffectManifestFromNativeCaptureV1, executionEffectNativeCaptureManifestDigestV1,
  EXECUTION_EFFECT_CAPTURE_HARD_LIMITS,
} from '../../src/core/execution-effect-containment.js';
import { createExecutionEffectStoreAdapterV1 } from '../../src/orchestra/execution-effect-store-adapter.js';
import { canonicalTaskAttemptCustodyJson, type Sha256Digest, type TaskAttemptCustodyStore,
  type TaskAttemptCustodyIdentityV2, type TaskAttemptCustodyPolicyV2 } from '../../src/core/task-attempt-custody-store.js';

export const EXACT_ACCEPTANCE_FIXTURE_PATH = 'docs/CANARY-NOTE.md';
export const EXACT_ACCEPTANCE_FIXTURE_BASELINE = 'Original note.\n';
export const EXACT_ACCEPTANCE_FIXTURE_FINAL = 'Original note.\nExact immutable append.\n';
const sha = (value: string | Uint8Array): Sha256Digest => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const domainSha = (
  domain: string,
  value: unknown,
  bounds: TaskAttemptCustodyPolicyV2['jsonBounds'],
): Sha256Digest => sha(Buffer.concat([
  Buffer.from(domain, 'utf8'), Buffer.from([0]),
  Buffer.from(canonicalTaskAttemptCustodyJson(value, bounds)),
]));
export type ExactAcceptanceFixtureInputV2 = { readonly store: TaskAttemptCustodyStore; readonly policy: TaskAttemptCustodyPolicyV2;
  readonly identity: TaskAttemptCustodyIdentityV2; readonly admission: ReturnType<TaskAttemptCustodyStore['createAdmission']>;
  readonly dispatchAdmission?: ReturnType<TaskAttemptCustodyStore['reserveDispatchAdmission']> };

type ExactAcceptanceStoreAdapterV1 = ReturnType<typeof createExecutionEffectStoreAdapterV1>;
type ExactAcceptanceAcceptedAuthorityV1 = ReturnType<
  ExactAcceptanceStoreAdapterV1['readAcceptedAuthority']
>;

export interface ExactAcceptanceFixtureEffectV2 {
  readonly effectLandingBinding: ExactAcceptanceAcceptedAuthorityV1['binding'];
  readonly effectLandingChain: ExactAcceptanceAcceptedAuthorityV1['effectLandingChain'];
  readonly releasedAt: string;
}

export interface ExactAcceptanceCommittedAnchorFixtureV2 {
  readonly state: 'COMMITTED_JOURNAL_RELEASE_PENDING';
  readonly bridge: ExactAcceptanceStoreAdapterV1;
  readonly captured: Extract<
    L.CaptureExecutionEffectDockerFinalV1Result,
    { readonly state: 'READY_FOR_LANDING' }
  >;
  readonly receipt: P.ExecutionEffectLandingReceiptV1;
  readonly terminalSeal: P.ExecutionEffectLandingTerminalSealV1;
  readonly resumeContext: P.ExecutionEffectLandingLeaseResumeContextV1;
  readonly recoveryAnchor: ReturnType<ExactAcceptanceStoreAdapterV1['publishLandingRecoveryAnchor']>;
  readonly preparedWorkspace: ReturnType<ExactAcceptanceStoreAdapterV1['publishPreparedWorkspace']>;
  readonly dispatchAuthority: ReturnType<TaskAttemptCustodyStore['settleReleasedDispatch']> | null;
  readonly providerExit: ReturnType<TaskAttemptCustodyStore['publishDispatchObservation']> | null;
}

export function produceExactAcceptanceFixtureEffectsV2(
  input: ExactAcceptanceFixtureInputV2 & { readonly stopAfterCommittedAnchor: true },
): Promise<ExactAcceptanceCommittedAnchorFixtureV2>;
export function produceExactAcceptanceFixtureEffectsV2(
  input: ExactAcceptanceFixtureInputV2 & { readonly stopAfterCommittedAnchor?: false },
): Promise<ExactAcceptanceFixtureEffectV2>;
export async function produceExactAcceptanceFixtureEffectsV2(
  input: ExactAcceptanceFixtureInputV2 & { readonly stopAfterCommittedAnchor?: boolean },
): Promise<ExactAcceptanceFixtureEffectV2 | ExactAcceptanceCommittedAnchorFixtureV2> {
  const { store, policy, identity, admission } = input;
  const attempt = { projectId: identity.projectId, taskId: identity.taskId,
    attemptId: identity.attemptId, generation: identity.generation };
  let milliseconds = Date.parse(admission.admittedAt);
  const now = () => {
    milliseconds = Math.max(milliseconds, Date.now());
    return new Date(milliseconds).toISOString();
  };
  const clock = { nowIso: now };
  const rootDigest = sha('fixture-project-root');
  const plan = L.createExecutionEffectDockerWorkspacePlanV1({ imageReference: `fixture@${sha('image')}`,
    imageDigest: sha('image'), volumeName: `deckent-xw-${'a'.repeat(48)}`,
    baseLabels: { 'deckent.attempt': identity.attemptId, 'deckent.authority': admission.receiptDigest },
    workspaceResourceInstanceNonce: 'c'.repeat(64), dependencyResourceInstanceNonce: 'd'.repeat(64),
    mountPlan: { type: 'volume', providerTarget: '/workspace', providerAccess: 'read-write', helperTarget: '/workspace', helperAccess: 'read-only' },
    dependencyPlan: { sourceAuthority: 'image-owned-read-only-volume', imageSource: '/app/node_modules',
      volumeName: `deckent-xd-${'b'.repeat(48)}`, populationTarget: '/dependencies', providerTarget: '/workspace/node_modules',
      providerAccess: 'read-only', networkAccess: 'none', manifestScope: 'excluded-mount-overlay' },
    inventoryPaths: ['docs', EXACT_ACCEPTANCE_FIXTURE_PATH],
  });
  let createdAt = now();
  let volumeIdentityDigest = L.executionEffectDockerVolumeIdentityDigestV1({ volumeName: plan.volumeName,
    labelsDigest: plan.workspaceLabelsDigest, resourceInstanceDigest: plan.workspaceResourceInstanceDigest,
    mountPlanDigest: plan.mountPlanDigest, daemonCreatedAt: createdAt });
  let dependencyCreatedAt = now();
  let dependencyIdentity = L.executionEffectDockerVolumeIdentityDigestV1({ volumeName: plan.dependencyPlan.volumeName,
    labelsDigest: plan.dependencyLabelsDigest, resourceInstanceDigest: plan.dependencyResourceInstanceDigest,
    mountPlanDigest: plan.dependencyPlanDigest, daemonCreatedAt: dependencyCreatedAt });
  const limits = { ...EXECUTION_EFFECT_CAPTURE_HARD_LIMITS, maxEntries: 100, maxFileBytes: 1024,
    maxTotalBytes: 16384, maxDepth: 16, maxPathBytes: 1024, maxManifestBytes: 1024 * 1024 };
  const bridge = createExecutionEffectStoreAdapterV1({ store, identity, policy,
    admissionReceiptDigest: admission.receiptDigest, projectRootIdentityDigest: rootDigest, platform: 'linux', now });

  const capture = (operation: L.ExecutionEffectDockerLifecycleCaptureOperationV1, authorityDigest: P.ExecutionEffectPersistenceDigest,
    authority: { platform: 'linux' | 'wsl2-linux'; attempt: typeof attempt;
      writePolicy: { filesWrite: readonly string[] };
      captureLimits: typeof limits }): L.ExecutionEffectDockerRawCaptureV1 => {
    const phase = operation.startsWith('FINAL_') ? 'final' : 'baseline';
    const content = phase === 'final' ? EXACT_ACCEPTANCE_FIXTURE_FINAL : EXACT_ACCEPTANCE_FIXTURE_BASELINE;
    const startedAt = now(); const completedAt = now(); const deadlineAt = new Date(milliseconds + 60_000).toISOString();
    const rootEntry = { schemaVersion: 1 as const, path: '.', kind: 'DIRECTORY' as const, mode: '0755', size: null,
      objectIdentityDigest: sha('workspace-root'), contentDigest: null };
    const entries = [{ schemaVersion: 1 as const, path: 'docs', kind: 'DIRECTORY' as const,
      mode: '0755', size: null, objectIdentityDigest: sha('workspace-docs'), contentDigest: null },
    { schemaVersion: 1 as const, path: EXACT_ACCEPTANCE_FIXTURE_PATH, kind: 'REGULAR_FILE' as const,
      mode: '0644', size: String(Buffer.byteLength(content)), objectIdentityDigest: sha(`file:${content}`), contentDigest: sha(content) }];
    const body = { entries, entryCount: entries.length, totalBytes: Buffer.byteLength(content) };
    const nativeCapture = { schemaVersion: 1 as const, kind: 'execution-effect-manifest' as const, state: 'CAPTURED' as const,
      ...body, manifestDigest: executionEffectNativeCaptureManifestDigestV1(body) };
    const workspaceIdentity = { filesystemId: volumeIdentityDigest,
      directoryId: L.executionEffectDockerWorkspaceDirectoryIdentityDigestV1({ volumeIdentityDigest }),
      rootHandleEvidenceDigest: rootEntry.objectIdentityDigest };
    const manifest = createExecutionEffectManifestFromNativeCaptureV1({ phase, attempt, filesWrite: authority.writePolicy.filesWrite,
      platform: authority.platform, workspaceIdentity, rootEntry, nativeCapture, startedAt, completedAt, deadlineAt, limits });
    if (!manifest.ok) throw new Error('Fixture capture rejected');
    const receipt = L.createExecutionEffectDockerLifecycleCaptureReceiptV1({ operation, authorityDigest, phase,
      volumeName: plan.volumeName, volumeIdentityDigest, workspaceIdentity, nativeManifestDigest: nativeCapture.manifestDigest as Sha256Digest,
      manifestStateDigest: L.executionEffectDockerManifestStateDigestV1(manifest.manifest), rootObjectIdentityDigest: rootEntry.objectIdentityDigest,
      entryCount: entries.length, totalBytes: body.totalBytes, startedAt, completedAt, deadlineAt });
    return { workspaceIdentity, rootEntry, nativeCapture, startedAt, completedAt, deadlineAt, receipt };
  };
  const environment: L.ExecutionEffectDockerLifecycleAdapterV1 = {
    async inspectImage(value) { return L.createExecutionEffectDockerImageObservationV1({ authorityDigest: value.authorityDigest,
      imageReference: value.imageReference, imageDigest: value.expectedImageDigest, imageIdentityDigest: sha('daemon-image'), observedAt: now() }); },
    async prepareDependencies(value) {
      const startedAt = now(); dependencyCreatedAt = now();
      dependencyIdentity = L.executionEffectDockerVolumeIdentityDigestV1({ volumeName: plan.dependencyPlan.volumeName,
        labelsDigest: plan.dependencyLabelsDigest, resourceInstanceDigest: plan.dependencyResourceInstanceDigest,
        mountPlanDigest: plan.dependencyPlanDigest, daemonCreatedAt: dependencyCreatedAt });
      return L.createExecutionEffectDockerDependencyAuthorityReceiptV1({
      authorityDigest: value.authorityDigest, imageObservationReceiptDigest: value.imageObservationReceiptDigest,
      imageIdentityDigest: value.imageIdentityDigest, dependencyPlanDigest: value.dependencyPlanDigest,
      labelsDigest: value.labelsDigest, resourceInstanceDigest: value.resourceInstanceDigest, volumeName: value.dependencyPlan.volumeName,
      volumeIdentityDigest: dependencyIdentity, absenceObservationDigest: sha('dependency-absence'), creationReceiptDigest: sha('dependency-create'),
      verifiedInspectDigest: sha('dependency-inspect'), populationReceiptDigest: sha('dependency-population'), dependencyTreeDigest: sha('dependency-tree'),
      daemonCreatedAt: dependencyCreatedAt, startedAt, completedAt: now() }); },
    async inspectVolume(value) {
      if (value.phase === 'EXPECT_ABSENT') return L.createExecutionEffectDockerVolumeObservationV1({ state: 'ABSENT',
        authorityDigest: value.authorityDigest, volumeName: plan.volumeName, resourceInstanceDigest: plan.workspaceResourceInstanceDigest, observedAt: now() });
      return L.createExecutionEffectDockerVolumeObservationV1({ state: 'PRESENT', authorityDigest: value.authorityDigest,
        volumeName: plan.volumeName, driver: 'local', scope: 'local', labelsDigest: plan.workspaceLabelsDigest,
        resourceInstanceDigest: plan.workspaceResourceInstanceDigest, mountPlanDigest: plan.mountPlanDigest,
        volumeIdentityDigest, daemonCreatedAt: createdAt, observedAt: now() });
    },
    async createVolume(value) {
      const createRequestedAt = now(); createdAt = now();
      volumeIdentityDigest = L.executionEffectDockerVolumeIdentityDigestV1({ volumeName: plan.volumeName,
        labelsDigest: plan.workspaceLabelsDigest, resourceInstanceDigest: plan.workspaceResourceInstanceDigest,
        mountPlanDigest: plan.mountPlanDigest, daemonCreatedAt: createdAt });
      return L.createExecutionEffectDockerVolumeCreationReceiptV1({ authorityDigest: value.authorityDigest,
      absenceObservationDigest: value.absenceObservationDigest, volumeName: plan.volumeName, labelsDigest: plan.workspaceLabelsDigest,
      resourceInstanceDigest: plan.workspaceResourceInstanceDigest, mountPlanDigest: plan.mountPlanDigest, volumeIdentityDigest,
      createRequestedAt, createCompletedAt: now(), daemonCreatedAt: createdAt }); },
    async populateWorkspace(value) {
      const raw = capture('POPULATION_BASELINE', value.authorityDigest, value);
      return { capture: raw, populationReceipt: L.createExecutionEffectDockerPopulationReceiptV1({ authorityDigest: value.authorityDigest,
        volumeName: plan.volumeName, volumeIdentityDigest, inventoryDigest: plan.inventoryDigest,
        inventoryAdmissionReceiptDigest: plan.inventoryAdmissionReceiptDigest, dependencyPlanDigest: plan.dependencyPlanDigest,
        dependencyAuthorityReceiptDigest: value.dependencyAuthorityReceiptDigest, rejectedPathCount: 0, rejectedPathsDigest: plan.inventoryRejectedPathsDigest,
        captureReceiptDigest: raw.receipt.receiptDigest, populatedPathCount: plan.inventoryPathCount,
        sourcePreManifestDigest: sha('population'), destinationManifestDigest: sha('population'), sourcePostManifestDigest: sha('population'),
        manifestEntryCount: plan.inventoryPathCount, manifestTotalBytes: raw.nativeCapture.totalBytes, completedAt: raw.completedAt }) };
    },
    async captureWorkspace(value) { return capture(value.operation, value.authorityDigest, value); },
    async verifyExclusiveAttachments(value) { return L.createExecutionEffectDockerExclusiveAttachmentReceiptV1({ phase: value.phase,
      authorityDigest: value.authorityDigest, workspaceVolumeName: value.workspaceVolumeName,
      workspaceVolumeIdentityDigest: value.workspaceVolumeIdentityDigest, dependencyVolumeName: value.dependencyVolumeName,
      dependencyVolumeIdentityDigest: value.dependencyVolumeIdentityDigest, observedAt: now() }); },
  };
  const allocation = L.allocateExecutionEffectDockerWorkspaceV1({ platform: 'linux', attempt,
    admissionReceiptDigest: admission.receiptDigest, custodyPolicyDigest: policy.policyDigest, admittedAt: admission.admittedAt,
    filesWrite: [EXACT_ACCEPTANCE_FIXTURE_PATH], nativeCapabilityDigest: sha('fixture-native'), workspacePlan: plan, captureLimits: limits });
  if (allocation.state !== 'ALLOCATING') throw new Error(`Fixture allocation ${allocation.code}`);
  bridge.publishLifecycleAuthority(allocation.lifecycleAuthority);
  const durable = L.authorizeDurableExecutionEffectDockerAllocationV1(allocation.session, bridge);
  if ('state' in durable) throw new Error('Fixture durable allocation rejected');
  const prepared = await L.prepareAllocatedExecutionEffectDockerWorkspaceV1(durable, environment, clock);
  if (prepared.state !== 'PREPARED') throw new Error(`Fixture prepare ${prepared.code}`);
  bridge.publishLifecycleAuthority(prepared.lifecycleAuthority);
  const preparedWorkspace = bridge.publishPreparedWorkspace({ workspaceSnapshot: prepared.workspaceSnapshot,
    baseline: prepared.baselineManifest, baselineCapturedAt: prepared.baselineManifest.captureAuthority.completedAt,
    lifecycleAuthority: prepared.lifecycleAuthority });
  const authorized = await L.authorizeExecutionEffectDockerProviderStartV1(prepared.session);
  if (authorized.state !== 'PROVIDER_START_AUTHORIZED') throw new Error('Fixture provider authorization rejected');
  bridge.publishLifecycleAuthority(authorized.lifecycleAuthority);
  const providerLifecycle = input.dispatchAdmission
    ? await publishFixtureProviderLifecycle(input, now) : null;
  const containerName = `deckent-x-${identity.attemptId}`;
  const containerIdentityDigest = input.stopAfterCommittedAnchor === true && providerLifecycle
    ? domainSha('execution-effect-docker-provider-container-identity-v1', {
        containerId: providerLifecycle.dispatchAuthority.backendExecutionId,
        containerName,
        imageReference: plan.imageReference,
        imageDigest: providerLifecycle.dispatchAuthority.releaseEvidence.imageDigest,
        authorityLabelsDigest:
          providerLifecycle.dispatchAuthority.releaseEvidence.daemonAuthorityLabelDigest,
        providerStartAuthorityDigest: authorized.providerStartAuthorityDigest,
      }, policy.jsonBounds)
    : sha('fixture-container');
  const stopped = L.createExecutionEffectDockerProviderStoppedReceiptV1({ providerStartAuthorityDigest: authorized.providerStartAuthorityDigest,
    containerName, containerIdentityDigest, exitCode: 0,
    exitObservationReceiptDigest: providerLifecycle?.providerExit.receiptDigest ?? sha('fixture-provider-exit'),
    stoppedAt: input.stopAfterCommittedAnchor === true && providerLifecycle
      ? providerLifecycle.providerExit.observedAt : now() });
  const captured = await L.captureExecutionEffectDockerFinalV1(authorized.session, stopped);
  if (captured.state !== 'READY_FOR_LANDING') throw new Error(`Fixture final ${captured.code}`);
  bridge.publishLifecycleAuthority(captured.lifecycleAuthority);

  const projectEntries = new Map(captured.baselineManifest.entries.map(entry => [entry.path,
    C.createExecutionEffectLandingEntryStateV1({ entry, objectIdentityDigest: sha(`project:${entry.path}`),
      linkCount: entry.kind === 'regular-file' ? 1 : null })]));
  const nativeCapability = C.createExecutionEffectLandingNativeCapabilityV1({ adapterId: 'fixture-native', platform: 'linux',
    projectRootIdentityDigest: rootDigest, workspaceIdentityDigest: C.executionEffectLandingWorkspaceIdentityDigestV1(captured.baselineManifest.workspaceIdentity),
    attemptDigest: captured.baselineManifest.attemptDigest, admissionReceiptDigest: admission.receiptDigest,
    custodyPolicyDigest: policy.policyDigest, nativeContractDigest: sha('native-contract'), stagingRootIdentityDigest: sha('staging-root'),
    maxStagedChunkBytes: 16, maxOperations: 100, maxPlanEnvelopeBytes: 1024 * 1024 });
  const native: C.ExecutionEffectLandingNativeAdapterV1 = {
    capability: nativeCapability,
    inspectProjectEntry(path) { return projectEntries.get(path) ?? C.createExecutionEffectLandingEntryStateV1({ entry: null }); },
    async stageSource(value) {
      const bytes = Buffer.from(EXACT_ACCEPTANCE_FIXTURE_FINAL);
      const chunks = [];
      for (let offset = 0, index = 0; offset < bytes.length; index++) {
        const part = bytes.subarray(offset, Math.min(bytes.length, offset + nativeCapability.maxStagedChunkBytes));
        const receipt = store.publishHostArtifact({ identity, policy, admissionReceiptDigest: admission.receiptDigest,
          artifactClass: 'execution-effect-staged-content', artifactKey: `fixture-stage-${index}`, capturedAt: now(), bytes: part });
        chunks.push(C.createExecutionEffectLandingStagedChunkV1({ index, byteOffset: offset, byteLength: part.length,
          artifactKey: receipt.artifactKey, artifactReceiptDigest: receipt.receiptDigest, contentDigest: sha(part) }));
        offset += part.length;
      }
      return C.createExecutionEffectLandingStagedSourceV1({ path: value.path, byteLength: bytes.length, contentDigest: sha(bytes),
        workspaceIdentityDigest: value.workspaceIdentityDigest, attemptDigest: nativeCapability.attemptDigest,
        admissionReceiptDigest: admission.receiptDigest, custodyPolicyDigest: policy.policyDigest,
        landingIntentDigest: value.landingIntentDigest, chunks });
    },
    verifyStagedSource(value) { return value.chunks.every(chunk => {
      const read = store.readVerifiedArtifact({ identity, policy, artifactClass: 'execution-effect-staged-content',
        artifactKey: chunk.artifactKey, receiptDigest: chunk.artifactReceiptDigest as Sha256Digest });
      return !!read && sha(read.bytes) === chunk.contentDigest;
    }); },
    applyOperation(value) {
      const postimages = value.operation.entryPostimages.map(post => ({ path: post.path,
        entry: C.createExecutionEffectLandingEntryStateV1({ entry: post.entry.state === 'PRESENT' ? post.entry.entry : null,
          ...(post.entry.state === 'PRESENT' ? { objectIdentityDigest: sha(`landed:${post.path}`),
            linkCount: post.entry.entry.kind === 'regular-file' ? 1 : null } : {}) }) }));
      for (const post of postimages) projectEntries.set(post.path, post.entry);
      return C.createExecutionEffectLandingNativeMutationReceiptV1({ operation: value.operation, entryPostimages: postimages,
        durabilityEvidenceDigest: sha(`durability:${value.operation.operationDigest}`) });
    },
    reconcileOperation() { return { state: 'AMBIGUOUS', evidenceDigest: sha('no-fixture-retry') }; },
    verifyTransactionPostimages(value) { return C.createExecutionEffectLandingFinalVerificationReceiptV1({ transaction: value.transaction,
      operations: value.operations, operationReceipts: value.operationReceipts, durabilityEvidenceDigest: sha('final-durability') }); },
  };
  let leaseEvidence: P.ExecutionEffectLandingLeaseTerminalReceiptEvidenceV1 | null = null;
  const lease: C.ExecutionEffectLandingLeaseAdapterV1 = {
    capability: C.createExecutionEffectLandingLeaseCapabilityV1({
      adapterId: input.stopAfterCommittedAnchor === true
        ? 'deckent.execution-effect-lock.v1' : 'fixture-lease',
      projectRootIdentityDigest: rootDigest,
    }),
    acquire(transactionDigest) { return { transactionDigest, fencingTokenDigest: sha('fixture-fence'), leaseReceiptDigest: sha('fixture-lease') }; },
    assert() {}, renew(value) { return value; },
    resume() { throw new Error('Fixture does not retry'); },
    beginBoundary(value) { return { transactionDigest: value.transactionDigest, fencingTokenDigest: value.fencingTokenDigest,
      boundaryId: P.executionEffectLandingDeterministicBoundaryIdV1(value.transactionDigest as Sha256Digest), boundaryReceiptDigest: sha('boundary') }; },
    quarantine() { throw new Error('Fixture quarantined'); },
    completeBoundary(value, boundary, committedJournalDigest) {
      milliseconds = Math.max(milliseconds, Date.now());
      leaseEvidence = P.createExecutionEffectLandingLeaseTerminalReceiptEvidenceV1({ transactionDigest: value.transactionDigest as Sha256Digest,
        terminal: 'COMPLETED', committedJournalDigest: committedJournalDigest as Sha256Digest,
        eventId: '018f0000-0000-7000-8000-000000000001', quarantineId: boundary.boundaryId,
        fencingToken: { epoch: '018f0000-0000-7000-8000-000000000002', counter: 1, nonce: '018f0000-0000-7000-8000-000000000003' },
        occurredAt: now(), evidenceRefs: [`committed-journal:${committedJournalDigest}`, 'effect-terminal:COMPLETED',
          `effect-transaction:${value.transactionDigest}`, `effect-boundary:${boundary.boundaryReceiptDigest}`].sort() });
      return { transactionDigest: value.transactionDigest, terminal: 'COMPLETED', committedJournalDigest,
        terminalReceiptDigest: leaseEvidence.terminalReceiptDigest };
    },
    releaseNoChange() { throw new Error('Expected changed fixture'); },
    readTerminal(transactionDigest, committedJournalDigest) { return leaseEvidence
      ? { transactionDigest, committedJournalDigest, terminal: leaseEvidence.terminal, terminalReceiptDigest: leaseEvidence.terminalReceiptDigest } : null; },
  };
  const adapters = { native, lease, journal: bridge.journal };
  const landing = await C.prepareExecutionEffectLandingV1({ planId: 'fixture-exact-append', baseline: captured.baselineManifest,
    final: captured.finalManifest, decision: captured.decision, adapters });
  if (landing.state !== 'PREPARED') throw new Error(`Fixture landing prepare ${landing.code}`);
  const receipt = await C.applyExecutionEffectLandingV1(landing.session);
  if (receipt.state !== 'COMMITTED') throw new Error('Fixture landing did not commit');
  if (!leaseEvidence) throw new Error('Fixture lease terminal evidence missing');
  const terminal = sealFixtureTerminal({ input, captured, bridge, receipt, leaseEvidence });
  milliseconds = Math.max(milliseconds, Date.parse(terminal.seal.committedAt), Date.parse(leaseEvidence.occurredAt));
  const recoveryAnchor = bridge.publishLandingRecoveryAnchor({ readyLifecycleAuthorityDigest: captured.lifecycleAuthority.authorityDigest as Sha256Digest,
    transactionDigest: receipt.transaction.transactionDigest as Sha256Digest, resumeContext: terminal.resumeContext, publishedAt: terminal.seal.committedAt });
  if (input.stopAfterCommittedAnchor === true) {
    return Object.freeze({ state: 'COMMITTED_JOURNAL_RELEASE_PENDING' as const,
      bridge, captured, receipt, terminalSeal: terminal.seal,
      resumeContext: terminal.resumeContext, recoveryAnchor, preparedWorkspace,
      dispatchAuthority: providerLifecycle?.dispatchAuthority ?? null,
      providerExit: providerLifecycle?.providerExit ?? null });
  }
  let release = bridge.publishReleasePrepared({ lifecycleAuthorityDigest: captured.lifecycleAuthority.authorityDigest as Sha256Digest,
    landingReceipt: receipt, terminalSeal: terminal.seal, progressedAt: terminal.seal.committedAt }).progress;
  for (const resourceKind of ['provider-container', 'workspace-volume', 'dependency-volume'] as const) {
    release = bridge.publishCleanupDeleteIntent({ mode: 'RELEASE', resourceKind, progressedAt: now() }).progress;
    const resource = release.resources.find(entry => entry.resourceKind === resourceKind)!;
    release = bridge.publishCleanupAbsence({ mode: 'RELEASE', progressedAt: now(), evidence: { disposition: 'RECONCILED_ABSENCE',
      absence: L.createExecutionEffectDockerReconciledAbsenceReceiptV1({ resourceKind, resourceName: resource.resourceName,
        resourceIdentityDigest: resource.resourceIdentityDigest, cleanupAuthorityDigest: receipt.receiptDigest,
        deleteIntentDigest: release.deleteIntentDigest!, observedAt: new Date(milliseconds).toISOString() }) } }).progress;
  }
  bridge.publishCleanupTerminal({ mode: 'RELEASE', progressedAt: now() });
  const released = bridge.projectWorkspaceReleaseFromDurableCleanup();
  if (released.state !== 'RELEASED') {
    throw new Error(`Fixture cleanup incomplete: ${released.state}:${released.code}`);
  }
  bridge.publishLanding({ preparedWorkspace, final: captured.finalManifest, finalCapturedAt: captured.finalManifest.captureAuthority.completedAt,
    terminalSeal: terminal.seal, workspaceRelease: released.workspaceRelease, landingArtifactKey: 'primary' });
  const accepted = bridge.readAcceptedAuthority('primary');
  return { effectLandingBinding: accepted.binding, effectLandingChain: accepted.effectLandingChain,
    releasedAt: accepted.verifiedLanding.landing.releasedAt };
}

async function publishFixtureProviderLifecycle(
  input: ExactAcceptanceFixtureInputV2,
  now: () => string,
) {
  const { store, policy, identity, admission, dispatchAdmission: admitted } = input;
  if (!admitted) throw new Error('Fixture dispatch admission missing');
  const access = store.openAttemptAccess({ identity, policy, admissionReceiptDigest: admission.receiptDigest });
  if (!access) throw new Error('Fixture mount access missing');
  const transfer = await store.consumeAttemptMountLease(store.issueAttemptMountLease({ access, policy }));
  if (!transfer.backendExecutionId || !transfer.backendImageDigest || !transfer.backendAuthorityLabelDigest) throw new Error('Fixture mount transfer incomplete');
  const gate = store.publishDispatchObservation({ admissionRef: admitted.ref, policy, observationClass: 'GATE_ACK',
    observedAt: now(), bytes: Buffer.from('{"gate":"ACKNOWLEDGED"}') });
  const releasedAt = now();
  const released = store.settleReleasedDispatch({ admissionRef: admitted.ref, policy, mountTransferReceipt: transfer, recordedAt: now(),
    releaseEvidence: { containerId: transfer.backendExecutionId, imageDigest: transfer.backendImageDigest,
      mountReceiptDigest: transfer.receiptDigest, mountTransferEvidenceDigest: transfer.transferEvidenceDigest,
      daemonAuthorityLabelDigest: transfer.backendAuthorityLabelDigest, releaseNonceDigest: sha('release-nonce'), providerInvocationDigest: sha('invocation'),
      gateAckReceiptDigest: gate.receiptDigest, gateAckEvidenceDigest: gate.evidenceDigest, releasedAt,
      ackMethod: 'HOST_RELEASE_GATE', ackStatus: 'ACKNOWLEDGED' } });
  const common = { schemaVersion: 2, admissionRefDigest: admitted.ref.refDigest, containerId: released.backendExecutionId,
    taskSnapshotSha256: admission.taskSnapshot.sha256, providerInvocationDigest: released.releaseEvidence.providerInvocationDigest,
    authorityLabelsDigest: released.releaseEvidence.daemonAuthorityLabelDigest, executionCommitNonceSha256: sha('execution-commit'),
    providerExecutionAttemptId: released.providerExecutionAttempt.providerExecutionAttemptId,
    providerExecutionAttemptIdentityDigest: released.providerExecutionAttempt.identityDigest, dispatchReceiptDigest: released.receiptDigest,
    releaseReceiptRef: released.releaseReceiptDigest, releaseReceiptDigest: released.releaseEvidenceDigest,
    projectionFence: released.projectionFence, startAuthorizationDigest: sha('provider-start-authorization') };
  const start = { ...common, kind: 'exact-docker-provider-start', providerStartNonceSha256: sha('provider-start-nonce'),
    pid1StartAckDigest: sha('pid1-start-ack'), state: 'START_AUTHORIZATION_ACCEPTED', providerState: 'NOT_STARTED', observedAt: now() };
  const execution = { ...common, kind: 'exact-docker-pid1-provider-execution-ack', providerStartAckBytesSha256: sha('provider-start-ack'),
    childPid: 123, providerExecutionAckBytesSha256: sha('provider-execution-ack'), state: 'PROVIDER_PROCESS_SPAWNED',
    providerState: 'STARTED', observedAt: now() };
  for (const [observationClass, body] of [['PROVIDER_START', start], ['PROVIDER_EXECUTION', execution]] as const) {
    store.publishDispatchObservation({ admissionRef: admitted.ref, policy, observationClass,
      observedAt: body.observedAt, bytes: canonicalTaskAttemptCustodyJson(body, policy.jsonBounds) });
  }
  const wait = { admissionRefDigest: admitted.ref.refDigest, containerId: released.backendExecutionId,
    exitCode: 0, dockerWaitProcessExitCode: 0, dockerWaitSignal: null, stdoutSha256: sha('fixture-stdout'), stderrSha256: sha(''), observedAt: now() };
  const providerExit = store.publishDispatchObservation({ admissionRef: admitted.ref, policy, observationClass: 'PROVIDER_EXIT', observedAt: wait.observedAt,
    bytes: canonicalTaskAttemptCustodyJson({ schemaVersion: 2, kind: 'exact-docker-provider-exit', ...wait,
      waitEvidenceDigest: sha(canonicalTaskAttemptCustodyJson(wait, policy.jsonBounds)) }, policy.jsonBounds) });
  return Object.freeze({ dispatchAuthority: released, providerExit });
}

function sealFixtureTerminal({ input, captured, bridge, receipt, leaseEvidence }: {
  input: ExactAcceptanceFixtureInputV2;
  captured: Extract<L.CaptureExecutionEffectDockerFinalV1Result, {state:'READY_FOR_LANDING'}>;
  bridge: ReturnType<typeof createExecutionEffectStoreAdapterV1>; receipt: P.ExecutionEffectLandingReceiptV1;
  leaseEvidence: P.ExecutionEffectLandingLeaseTerminalReceiptEvidenceV1;
}) {
  const key = (phase: string) => `effect-landing/${receipt.transaction.transactionDigest.slice(7)}/${phase}.json`;
  const read = (phase: string) => {
    const artifact = bridge.journal.readImmutable(key(phase));
    if (!artifact) throw new Error('Fixture journal absent');
    return JSON.parse(Buffer.from(artifact.bytes).toString('utf8'));
  };
  const prepared = read('prepared'); const applying = read('applying'); const committed = read('committed');
  const sourceOperations = prepared.operations as C.ExecutionEffectLandingOperationV1[];
  const steps = sourceOperations.map((_operation, index) => read(`step-${String(index).padStart(7, '0')}`));
  const operations = sourceOperations.map((operation, index) => P.createExecutionEffectPersistenceOperationV1({ index, kind: operation.kind,
    path: operation.path, effectDigests: operation.effectDigests as Sha256Digest[], derivedParent: operation.derivedParent,
    stagedSource: operation.stagedSource ? P.createExecutionEffectStagedSourceSealV1({ path: operation.stagedSource.path,
      byteLength: operation.stagedSource.byteLength,
      contentDigest: operation.stagedSource.contentDigest as Sha256Digest, workspaceIdentityDigest: operation.stagedSource.workspaceIdentityDigest as Sha256Digest,
      attemptDigest: operation.stagedSource.attemptDigest as Sha256Digest, admissionReceiptDigest: input.admission.receiptDigest,
      custodyPolicyDigest: input.policy.policyDigest, landingIntentDigest: operation.stagedSource.landingIntentDigest as Sha256Digest,
      chunks: operation.stagedSource.chunks.map(chunk => ({ byteLength: chunk.byteLength, artifactKey: chunk.artifactKey,
        artifactReceiptDigest: chunk.artifactReceiptDigest as Sha256Digest, contentDigest: chunk.contentDigest as Sha256Digest })) }) : null,
    entryPreimages: operation.entryPreimages as P.ExecutionEffectPersistenceOperationV1['entryPreimages'],
    entryPostimages: operation.entryPostimages as P.ExecutionEffectPersistenceOperationV1['entryPostimages'],
    parentAuthorities: operation.parentAuthorities as P.ExecutionEffectPersistenceOperationV1['parentAuthorities'],
    nativeReceiptDigest: steps[index].nativeReceipt.receiptDigest, durabilityEvidenceDigest: steps[index].nativeReceipt.durabilityEvidenceDigest }));
  const nativeEvidence = operations.map((operation, index) => P.createExecutionEffectLandingNativeReceiptEvidenceV1({ operation,
    entryPostimages: steps[index].nativeReceipt.entryPostimages, durabilityEvidenceDigest: steps[index].nativeReceipt.durabilityEvidenceDigest }));
  const nativeRefs = nativeEvidence.map((evidence, index) => bridge.publishNativeReceiptEvidence({ artifactKey: input.stopAfterCommittedAnchor === true
      ? `effect-native-${receipt.transaction.transactionDigest.slice(7, 31)}-${index.toString(36)}` : `fixture-native-${index}`,
    capturedAt: committed.committedAt, operation: operations[index]!, evidence }));
  const finalEvidence = P.createExecutionEffectLandingFinalReceiptEvidenceV1({ transactionDigest: receipt.transaction.transactionDigest as Sha256Digest,
    planDigest: receipt.transaction.planDigest as Sha256Digest, operations, nativeReceipts: nativeEvidence,
    durabilityEvidenceDigest: committed.finalVerificationReceipt.durabilityEvidenceDigest });
  const finalRef = bridge.publishFinalReceiptEvidence({ artifactKey: input.stopAfterCommittedAnchor === true
      ? `effect-final-${receipt.transaction.transactionDigest.slice(7, 39)}` : 'fixture-final', capturedAt: committed.committedAt,
    transactionDigest: receipt.transaction.transactionDigest as Sha256Digest, planDigest: receipt.transaction.planDigest as Sha256Digest,
    operations, nativeReceipts: nativeEvidence, evidence: finalEvidence });
  const leaseRef = bridge.publishLeaseTerminalReceiptEvidence({ artifactKey: input.stopAfterCommittedAnchor === true
      ? `effect-lease-${receipt.transaction.transactionDigest.slice(7, 39)}` : 'fixture-lease', capturedAt: leaseEvidence.occurredAt, evidence: leaseEvidence });
  const reference = (phase: string, recordDigest: Sha256Digest) => {
    const result = bridge.readJournalReference(key(phase), recordDigest);
    if (!result) throw new Error('Fixture journal reference absent');
    return result;
  };
  const seal = P.createExecutionEffectLandingTerminalSealV1({ attempt: captured.workspaceSnapshot.attempt,
    attemptDigest: captured.workspaceSnapshot.attemptDigest, disposition: receipt.state,
    workspaceSnapshotSealDigest: captured.workspaceSnapshot.sealDigest, baselineManifestDigest: captured.baselineManifest.digest as Sha256Digest,
    finalManifestDigest: captured.finalManifest.digest as Sha256Digest, effectDecisionDigest: captured.decision.decisionDigest as Sha256Digest,
    planId: receipt.transaction.planId, operations, preparedJournalDigest: prepared.recordDigest, applyingJournalDigest: applying.recordDigest,
    stepJournalDigests: steps.map(step => step.recordDigest), committedJournalDigest: committed.recordDigest,
    finalVerificationReceiptDigest: receipt.finalVerificationReceiptDigest, journalArtifacts: {
      prepared: reference('prepared', prepared.recordDigest), applying: reference('applying', applying.recordDigest),
      steps: steps.map((step, index) => reference(`step-${String(index).padStart(7, '0')}`, step.recordDigest)),
      committed: reference('committed', committed.recordDigest) }, receiptArtifacts: { nativeReceipts: nativeRefs,
      finalVerificationReceipt: finalRef, leaseTerminalReceipt: leaseRef }, leaseTerminal: 'COMPLETED',
    leaseTerminalReceiptDigest: receipt.leaseTerminalReceiptDigest, committedAt: committed.committedAt });
  const resumeRef = (phase: 'PREPARED' | 'APPLYING' | 'COMMITTED', record: {recordDigest:Sha256Digest}) => ({
    phase, ...reference(phase.toLowerCase(), record.recordDigest), artifactKey: key(phase.toLowerCase()), recordDigest: record.recordDigest });
  const resumeContext = P.createExecutionEffectLandingLeaseResumeContextV1({ transaction: receipt.transaction,
    priorLease: prepared.acquiredLease, prepared: resumeRef('PREPARED', prepared),
    applying: { journal: resumeRef('APPLYING', applying), previousBoundary: applying.boundary },
    committed: { journal: resumeRef('COMMITTED', committed), disposition: receipt.state } });
  return { seal, resumeContext };
}
