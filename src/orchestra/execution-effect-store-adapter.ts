import { types as nodeTypes } from 'node:util';

import {
  evaluateExecutionEffectContainment,
  parseExecutionEffectManifest,
  type ExecutionEffectManifest,
} from '../core/execution-effect-containment.js';
import {
  createTaskAttemptEffectLandingBindingV2,
  executionEffectPersistenceRawDigest,
  parseExecutionEffectLandingFinalReceiptEvidenceV1,
  parseExecutionEffectLandingReceiptV1,
  parseExecutionEffectLandingLeaseResumeContextV1,
  parseExecutionEffectLandingLeaseTerminalReceiptEvidenceV1,
  parseExecutionEffectLandingNativeReceiptEvidenceV1,
  parseExecutionEffectLandingTerminalSealV1,
  parseExecutionEffectWorkspaceReleaseV1,
  parseExecutionEffectWorkspaceSnapshotSealV1,
  projectVerifiedExecutionEffectResultV1,
  type ExecutionEffectLandingFinalReceiptEvidenceV1,
  type ExecutionEffectLandingJournalArtifactRefV1,
  type ExecutionEffectLandingReceiptV1,
  type ExecutionEffectLandingLeaseResumeContextV1,
  type ExecutionEffectLandingLeaseTerminalReceiptEvidenceV1,
  type ExecutionEffectLandingNativeReceiptEvidenceV1,
  type ExecutionEffectLandingTerminalSealV1,
  type ExecutionEffectPersistenceOperationV1,
  type ExecutionEffectResultProjectionV1,
  type ExecutionEffectWorkspaceReleaseV1,
  type ExecutionEffectWorkspaceSnapshotSealV1,
  type TaskAttemptEffectLandingBindingV2,
} from '../core/execution-effect-persistence-contract.js';
import {
  canonicalTaskAttemptCustodyJson,
  createTaskAttemptCustodyEffectLandingReceiptV2,
  type Sha256Digest,
  type TaskAttemptCustodyArtifactReceiptV2,
  type TaskAttemptCustodyChainReceiptV2,
  type TaskAttemptCustodyEffectArtifactRefV2,
  type TaskAttemptCustodyIdentityV2,
  type TaskAttemptCustodyPolicyV2,
  type TaskAttemptCustodyStore,
  type TaskAttemptCustodyVerifiedEffectLandingV2,
} from '../core/task-attempt-custody-store.js';
import {
  createExecutionEffectLandingJournalCapabilityV1,
  type ExecutionEffectLandingJournalAdapterV1,
  type ExecutionEffectLandingJournalArtifactV1,
} from './execution-effect-landing-coordinator.js';
import {
  createExecutionEffectDockerResourceAbsenceReceiptV1,
  parseExecutionEffectDockerLifecycleAuthorityV1,
  parseExecutionEffectDockerReconciledAbsenceReceiptV1,
  parseExecutionEffectDockerResourceAbsenceReceiptV1,
  parseExecutionEffectDockerResourceDeletionReceiptV1,
  parseExecutionEffectDockerVolumeObservationV1,
  projectExecutionEffectDockerWorkspaceReleaseV1,
  type ExecutionEffectDockerAllocationDurabilityPortV1,
  type ExecutionEffectDockerAllocatingLifecycleAuthorityV1,
  type ExecutionEffectDockerLifecycleAuthorityV1,
  type ExecutionEffectDockerPreparedLifecycleAuthorityV1,
  type ExecutionEffectDockerReadyLifecycleAuthorityV1,
  type ExecutionEffectDockerReconciledAbsenceReceiptV1,
  type ExecutionEffectDockerReleasedResourceKindV1,
  type ExecutionEffectDockerResourceReleaseOutcomeV1,
  type ExecutionEffectDockerResourceAbsenceReceiptV1,
  type ExecutionEffectDockerResourceDeletionReceiptV1,
  type ExecutionEffectDockerVolumeObservationV1,
  type ReleaseExecutionEffectDockerWorkspaceV1Result,
} from './execution-effect-docker-lifecycle.js';

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const SAFE_KEY = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const JOURNAL_KEY = /^effect-landing\/([a-f0-9]{64})\/(prepared|applying|committed|step-[0-9]{7})\.json$/u;
const CLEANUP_RESOURCE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;

const RELEASE_SEQUENCE = Object.freeze([
  'RELEASE_PREPARED', 'CONTAINER_DELETE_INTENT', 'CONTAINER_ABSENT',
  'WORKSPACE_VOLUME_DELETE_INTENT', 'WORKSPACE_VOLUME_ABSENT',
  'DEPENDENCY_VOLUME_DELETE_INTENT', 'DEPENDENCY_VOLUME_ABSENT', 'RELEASED',
] as const);
const COMPENSATION_SEQUENCE = Object.freeze([
  'COMPENSATION_PREPARED', 'COMPENSATION_CONTAINER_DELETE_INTENT',
  'COMPENSATION_CONTAINER_ABSENT', 'COMPENSATION_WORKSPACE_VOLUME_DELETE_INTENT',
  'COMPENSATION_WORKSPACE_VOLUME_ABSENT', 'COMPENSATION_DEPENDENCY_VOLUME_DELETE_INTENT',
  'COMPENSATION_DEPENDENCY_VOLUME_ABSENT', 'COMPENSATED',
] as const);
const COMPENSATION_VOLUME_ONLY_SEQUENCE = Object.freeze([
  'COMPENSATION_PREPARED', 'COMPENSATION_WORKSPACE_VOLUME_DELETE_INTENT',
  'COMPENSATION_WORKSPACE_VOLUME_ABSENT', 'COMPENSATION_DEPENDENCY_VOLUME_DELETE_INTENT',
  'COMPENSATION_DEPENDENCY_VOLUME_ABSENT', 'COMPENSATED',
] as const);

function cleanupSequence(
  mode: ExecutionEffectStoreCleanupModeV1,
  compensationHasProviderContainer = true,
) {
  return mode === 'RELEASE' ? RELEASE_SEQUENCE
    : compensationHasProviderContainer ? COMPENSATION_SEQUENCE : COMPENSATION_VOLUME_ONLY_SEQUENCE;
}

function cleanupTargetForState(
  state: ExecutionEffectStoreCleanupStateV1,
): ExecutionEffectDockerReleasedResourceKindV1 | null {
  if (state === 'CONTAINER_DELETE_INTENT' || state === 'CONTAINER_ABSENT'
    || state === 'COMPENSATION_CONTAINER_DELETE_INTENT'
    || state === 'COMPENSATION_CONTAINER_ABSENT') {
    return 'provider-container';
  }
  if (state === 'WORKSPACE_VOLUME_DELETE_INTENT' || state === 'WORKSPACE_VOLUME_ABSENT'
    || state === 'COMPENSATION_WORKSPACE_VOLUME_DELETE_INTENT'
    || state === 'COMPENSATION_WORKSPACE_VOLUME_ABSENT') return 'workspace-volume';
  if (state === 'DEPENDENCY_VOLUME_DELETE_INTENT' || state === 'DEPENDENCY_VOLUME_ABSENT'
    || state === 'COMPENSATION_DEPENDENCY_VOLUME_DELETE_INTENT'
    || state === 'COMPENSATION_DEPENDENCY_VOLUME_ABSENT') return 'dependency-volume';
  return null;
}

function cleanupStateKind(
  state: ExecutionEffectStoreCleanupStateV1,
): 'PREPARED' | 'INTENT' | 'ABSENCE' | 'TERMINAL' {
  if (state === 'RELEASE_PREPARED' || state === 'COMPENSATION_PREPARED') return 'PREPARED';
  if (state === 'RELEASED' || state === 'COMPENSATED') return 'TERMINAL';
  return state.endsWith('_DELETE_INTENT') ? 'INTENT' : 'ABSENCE';
}

export function executionEffectStoreCleanupArtifactKeyV1(
  admissionReceiptDigest: Sha256Digest,
  mode: ExecutionEffectStoreCleanupModeV1,
  state: ExecutionEffectStoreCleanupStateV1,
): string {
  if (!isDigest(admissionReceiptDigest) || (mode !== 'RELEASE' && mode !== 'COMPENSATION')
    || !(cleanupSequence(mode) as readonly string[]).includes(state)) {
    throw new TypeError('Invalid execution effect cleanup artifact key authority');
  }
  const suffix = admissionReceiptDigest.slice(7, 55);
  const stateDigest = executionEffectPersistenceRawDigest(
    Buffer.from(`${mode}\0${state}`, 'utf8'),
  ).slice(7, 39);
  return `effect-cp-${suffix}-${mode === 'RELEASE' ? 'r' : 'c'}-${stateDigest}`;
}

type HostArtifactClass = Parameters<TaskAttemptCustodyStore['publishHostArtifact']>[0]['artifactClass'];

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || nodeTypes.isProxy(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    return null;
  }
  return actual.every(key => {
    const descriptor = descriptors[key];
    return descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true;
  }) ? value as Record<string, unknown> : null;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && DIGEST.test(value);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && Buffer.from(left).equals(Buffer.from(right));
}

function sameAttempt(
  identity: TaskAttemptCustodyIdentityV2,
  attempt: ExecutionEffectWorkspaceSnapshotSealV1['attempt'],
): boolean {
  return identity.projectId === attempt.projectId
    && identity.taskId === attempt.taskId
    && identity.attemptId === attempt.attemptId
    && identity.generation === attempt.generation;
}

export function executionEffectStoreJournalArtifactKeyV1(logicalKey: string): string | null {
  const match = JOURNAL_KEY.exec(logicalKey);
  if (!match) return null;
  return `el-${match[1]}-${match[2]}`;
}

export interface ExecutionEffectStoreStagedArtifactV1 {
  readonly artifactKey: string;
  readonly artifactReceiptDigest: Sha256Digest;
  readonly contentDigest: Sha256Digest;
  readonly byteLength: number;
}

export interface ExecutionEffectStoreStagedContentV1 extends ExecutionEffectStoreStagedArtifactV1 {
  readonly bytes: Uint8Array;
}

export interface ExecutionEffectStoreImmutableArtifactRefV1 {
  readonly artifactKey: string;
  readonly artifactReceiptDigest: Sha256Digest;
  readonly contentDigest: Sha256Digest;
  readonly byteLength: number;
  readonly capturedAt: string;
}

export interface ExecutionEffectStoreLifecycleArtifactRefV1 {
  readonly state: ExecutionEffectDockerLifecycleAuthorityV1['state'];
  readonly artifactKey: string;
  readonly artifactReceiptDigest: Sha256Digest;
  readonly contentDigest: Sha256Digest;
  readonly byteLength: number;
  readonly capturedAt: string;
  readonly semanticAuthorityDigest: Sha256Digest;
  readonly durableAuthorityDigest: Sha256Digest;
}

export interface ExecutionEffectStoreDurableLifecycleAuthorityV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-store-durable-lifecycle-authority';
  readonly state: ExecutionEffectDockerLifecycleAuthorityV1['state'];
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly platform: 'linux' | 'wsl2-linux';
  readonly semanticAuthorityDigest: Sha256Digest;
  readonly predecessorDurableAuthorityDigest: Sha256Digest | null;
  readonly semanticProjection: Readonly<Record<string, unknown>>;
  readonly workspaceSnapshotArtifact: ExecutionEffectStoreImmutableArtifactRefV1 | null;
  readonly baselineManifestArtifact: ExecutionEffectStoreImmutableArtifactRefV1 | null;
  readonly finalManifestArtifact: ExecutionEffectStoreImmutableArtifactRefV1 | null;
  readonly durableAuthorityDigest: Sha256Digest;
}

export interface ExecutionEffectStoreLifecyclePublicationV1 {
  readonly authority: ExecutionEffectDockerLifecycleAuthorityV1;
  readonly durableAuthority: ExecutionEffectStoreDurableLifecycleAuthorityV1;
  readonly artifact: ExecutionEffectStoreLifecycleArtifactRefV1;
}

export interface ExecutionEffectStoreLandingRecoveryAnchorV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-store-landing-recovery-anchor';
  readonly state: 'DURABLE';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly readyLifecycleAuthorityDigest: Sha256Digest;
  readonly transactionDigest: Sha256Digest;
  readonly resumeContext: ExecutionEffectLandingLeaseResumeContextV1;
  readonly publishedAt: string;
  readonly anchorDigest: Sha256Digest;
}

export type ExecutionEffectStoreCleanupModeV1 = 'RELEASE' | 'COMPENSATION';
export type ExecutionEffectStoreCleanupStateV1 =
  | 'RELEASE_PREPARED'
  | 'CONTAINER_DELETE_INTENT'
  | 'CONTAINER_ABSENT'
  | 'WORKSPACE_VOLUME_DELETE_INTENT'
  | 'WORKSPACE_VOLUME_ABSENT'
  | 'DEPENDENCY_VOLUME_DELETE_INTENT'
  | 'DEPENDENCY_VOLUME_ABSENT'
  | 'RELEASED'
  | 'COMPENSATION_PREPARED'
  | 'COMPENSATION_CONTAINER_DELETE_INTENT'
  | 'COMPENSATION_CONTAINER_ABSENT'
  | 'COMPENSATION_WORKSPACE_VOLUME_DELETE_INTENT'
  | 'COMPENSATION_WORKSPACE_VOLUME_ABSENT'
  | 'COMPENSATION_DEPENDENCY_VOLUME_DELETE_INTENT'
  | 'COMPENSATION_DEPENDENCY_VOLUME_ABSENT'
  | 'COMPENSATED';

export interface ExecutionEffectStoreCleanupResourceIdentityV1 {
  readonly resourceKind: ExecutionEffectDockerReleasedResourceKindV1;
  readonly resourceName: string;
  readonly resourceIdentityDigest: Sha256Digest | null;
  readonly resourceInstanceDigest: Sha256Digest;
  readonly observationDigest: Sha256Digest;
}

export interface ExecutionEffectStoreCleanupProgressV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-store-cleanup-progress';
  readonly mode: ExecutionEffectStoreCleanupModeV1;
  readonly state: ExecutionEffectStoreCleanupStateV1;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly lifecycleAuthorityDigest: Sha256Digest;
  readonly landingRecoveryAnchorDigest: Sha256Digest | null;
  readonly landingReceiptDigest: Sha256Digest | null;
  readonly landingReceiptArtifact: ExecutionEffectStoreImmutableArtifactRefV1 | null;
  readonly preparationEvidenceArtifacts: readonly ExecutionEffectStoreImmutableArtifactRefV1[];
  readonly resources: readonly ExecutionEffectStoreCleanupResourceIdentityV1[];
  readonly predecessorProgressDigest: Sha256Digest | null;
  readonly targetResourceKind: ExecutionEffectDockerReleasedResourceKindV1 | null;
  readonly deleteIntentDigest: Sha256Digest | null;
  readonly absenceDisposition: 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE' | null;
  readonly deletionEvidenceArtifact: ExecutionEffectStoreImmutableArtifactRefV1 | null;
  readonly absenceEvidenceArtifact: ExecutionEffectStoreImmutableArtifactRefV1 | null;
  readonly progressedAt: string;
  readonly progressDigest: Sha256Digest;
}

export interface PublishExecutionEffectStoreLandingRecoveryAnchorV1Input {
  readonly readyLifecycleAuthorityDigest: Sha256Digest;
  readonly transactionDigest: Sha256Digest;
  readonly resumeContext: ExecutionEffectLandingLeaseResumeContextV1;
  readonly publishedAt: string;
}

export interface ExecutionEffectStoreCleanupPublicationV1 {
  readonly progress: ExecutionEffectStoreCleanupProgressV1;
  readonly artifact: ExecutionEffectStoreImmutableArtifactRefV1;
}

export interface ExecutionEffectStoreReleaseOutcomesV1 {
  readonly providerContainerOutcome: ExecutionEffectDockerResourceReleaseOutcomeV1;
  readonly workspaceVolumeOutcome: ExecutionEffectDockerResourceReleaseOutcomeV1;
  readonly dependencyVolumeOutcome: ExecutionEffectDockerResourceReleaseOutcomeV1;
  readonly releasedProgressDigest: Sha256Digest;
}

export interface ExecutionEffectStoreReleaseRecoveryAuthorityV1 {
  readonly readyLifecycleAuthority: ExecutionEffectDockerReadyLifecycleAuthorityV1;
  readonly preparedWorkspace: ExecutionEffectStorePreparedWorkspaceAuthorityV1;
  readonly landingRecoveryAnchor: ExecutionEffectStoreLandingRecoveryAnchorV1;
  readonly landingReceipt: ExecutionEffectLandingReceiptV1;
  readonly terminalSeal: ExecutionEffectLandingTerminalSealV1;
  readonly progress: ExecutionEffectStoreCleanupProgressV1;
}

export interface PublishExecutionEffectStoreReleasePreparedV1Input {
  readonly lifecycleAuthorityDigest: Sha256Digest;
  readonly landingReceipt: ExecutionEffectLandingReceiptV1;
  readonly terminalSeal: ExecutionEffectLandingTerminalSealV1;
  readonly progressedAt: string;
}

export interface PublishExecutionEffectStoreCompensationPreparedV1Input {
  readonly lifecycleAuthorityDigest: Sha256Digest;
  readonly workspaceObservation: ExecutionEffectDockerVolumeObservationV1;
  readonly dependencyObservation: ExecutionEffectDockerVolumeObservationV1;
  readonly progressedAt: string;
}

export interface PublishExecutionEffectStoreCleanupDeleteIntentV1Input {
  readonly mode: ExecutionEffectStoreCleanupModeV1;
  readonly resourceKind: ExecutionEffectDockerReleasedResourceKindV1;
  readonly progressedAt: string;
}

export type ExecutionEffectStoreCleanupAbsenceEvidenceV1 =
  | Readonly<{
    readonly disposition: 'EXECUTED_DELETION';
    readonly deletion: ExecutionEffectDockerResourceDeletionReceiptV1;
    readonly absence: ExecutionEffectDockerResourceAbsenceReceiptV1;
  }>
  | Readonly<{
    readonly disposition: 'RECONCILED_ABSENCE';
    readonly absence: ExecutionEffectDockerReconciledAbsenceReceiptV1;
  }>;

export interface PublishExecutionEffectStoreCleanupAbsenceV1Input {
  readonly mode: ExecutionEffectStoreCleanupModeV1;
  readonly evidence: ExecutionEffectStoreCleanupAbsenceEvidenceV1;
  readonly progressedAt: string;
}

export interface PublishExecutionEffectStoreCleanupTerminalV1Input {
  readonly mode: ExecutionEffectStoreCleanupModeV1;
  readonly progressedAt: string;
}

export interface ExecutionEffectStoreAcceptedAuthorityV1 {
  readonly verifiedLanding: TaskAttemptCustodyVerifiedEffectLandingV2;
  readonly effectLandingChain: TaskAttemptCustodyChainReceiptV2;
  readonly projection: ExecutionEffectResultProjectionV1;
  readonly binding: TaskAttemptEffectLandingBindingV2;
  /** Manifest V1 binds paths, modes, sizes and content digests, but not textual line counts. */
  readonly lineCountAuthority: Readonly<{
    readonly state: 'UNAVAILABLE';
    readonly code: 'LINE_COUNTS_NOT_CAPTURED_BY_EFFECT_MANIFEST_V1';
  }>;
}

export interface CreateExecutionEffectStoreAdapterV1Input {
  readonly store: TaskAttemptCustodyStore;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly projectRootIdentityDigest: Sha256Digest;
  readonly platform: 'linux' | 'wsl2-linux';
  readonly now: () => string;
}

export interface CreateExecutionEffectLifecycleStoreAdmissionAdapterV1Input {
  readonly store: TaskAttemptCustodyStore;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly platform: 'linux' | 'wsl2-linux';
  readonly now: () => string;
}

export interface PublishExecutionEffectStoreLandingV1Input {
  readonly preparedWorkspace: ExecutionEffectStorePreparedWorkspaceAuthorityV1;
  readonly final: ExecutionEffectManifest;
  readonly finalCapturedAt: string;
  readonly terminalSeal: ExecutionEffectLandingTerminalSealV1;
  readonly workspaceRelease: ExecutionEffectWorkspaceReleaseV1;
  readonly landingArtifactKey: string;
}

export interface PublishExecutionEffectStorePreparedWorkspaceV1Input {
  readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
  readonly baseline: ExecutionEffectManifest;
  readonly baselineCapturedAt: string;
  readonly lifecycleAuthority: ExecutionEffectDockerPreparedLifecycleAuthorityV1;
}

export interface ExecutionEffectStorePreparedWorkspaceAuthorityV1 {
  readonly version: 1;
  readonly kind: 'execution-effect-store-prepared-workspace';
  readonly state: 'DURABLE';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly platform: 'linux' | 'wsl2-linux';
  readonly attemptDigest: Sha256Digest;
  readonly workspaceSnapshotSealDigest: Sha256Digest;
  readonly baselineManifestDigest: Sha256Digest;
  readonly workspaceSealedAt: string;
  readonly baselineCapturedAt: string;
  readonly workspaceSnapshotArtifact: TaskAttemptCustodyEffectArtifactRefV2;
  readonly baselineManifestArtifact: TaskAttemptCustodyEffectArtifactRefV2;
  readonly lifecyclePreparedAuthorityDigest: Sha256Digest;
  readonly lifecyclePreparedArtifact: ExecutionEffectStoreLifecycleArtifactRefV1;
  readonly authorityDigest: Sha256Digest;
}

interface ExecutionEffectStorePreparedWorkspaceBundleV1 {
  readonly authority: ExecutionEffectStorePreparedWorkspaceAuthorityV1;
  readonly workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
  readonly baseline: ExecutionEffectManifest;
}

export interface ExecutionEffectStoreLandingPublicationV1
  extends ExecutionEffectStoreAcceptedAuthorityV1 {
  readonly landingArtifactReceipt: TaskAttemptCustodyArtifactReceiptV2;
}

export class ExecutionEffectStoreAdapterV1 {
  readonly journal!: ExecutionEffectLandingJournalAdapterV1;

  readonly #store: TaskAttemptCustodyStore;
  readonly #identity: TaskAttemptCustodyIdentityV2;
  readonly #policy: TaskAttemptCustodyPolicyV2;
  readonly #admissionReceiptDigest: Sha256Digest;
  readonly #platform: 'linux' | 'wsl2-linux';
  readonly #now: () => string;

  constructor(input: CreateExecutionEffectStoreAdapterV1Input
    | CreateExecutionEffectLifecycleStoreAdmissionAdapterV1Input) {
    const fullRecord = exactRecord(input, [
      'store', 'identity', 'policy', 'admissionReceiptDigest',
      'projectRootIdentityDigest', 'platform', 'now',
    ]);
    const lifecycleRecord = exactRecord(input, [
      'store', 'identity', 'policy', 'admissionReceiptDigest', 'platform', 'now',
    ]);
    const record = fullRecord ?? lifecycleRecord;
    if (record === null || record.store === null || typeof record.store !== 'object'
      || !isDigest(record.admissionReceiptDigest)
      || (fullRecord !== null && !isDigest(record.projectRootIdentityDigest))
      || (record.platform !== 'linux' && record.platform !== 'wsl2-linux')
      || typeof record.now !== 'function') {
      throw new TypeError('Invalid execution effect Store adapter authority');
    }
    this.#store = record.store as TaskAttemptCustodyStore;
    this.#identity = Object.freeze({ ...(record.identity as TaskAttemptCustodyIdentityV2) });
    this.#policy = record.policy as TaskAttemptCustodyPolicyV2;
    this.#admissionReceiptDigest = record.admissionReceiptDigest;
    this.#platform = record.platform;
    this.#now = record.now as () => string;
    const admission = this.#store.readAdmission(this.#identity, this.#policy);
    if (admission === null || admission.receiptDigest !== this.#admissionReceiptDigest) {
      throw new TypeError('Execution effect Store adapter admission is unavailable');
    }
    if (fullRecord !== null) {
      const capability = createExecutionEffectLandingJournalCapabilityV1({
        adapterId: 'task-attempt-custody-store-v1',
        projectRootIdentityDigest: fullRecord.projectRootIdentityDigest as Sha256Digest,
      });
      this.journal = Object.freeze({
        capability,
        publishImmutable: (inputValue: Readonly<{
          readonly key: string;
          readonly bytes: Uint8Array;
          readonly contentDigest: string;
        }>) => this.#publishJournal(inputValue),
        readImmutable: (key: string) => this.#readJournal(key),
      });
    } else {
      Object.defineProperty(this, 'journal', {
        enumerable: true,
        configurable: false,
        get(): never {
          throw new TypeError('Landing journal requires verified project root identity');
        },
      });
    }
    Object.freeze(this);
  }

  #timestamp(): string {
    const value = this.#now();
    if (!isTimestamp(value)) throw new TypeError('Invalid execution effect Store timestamp');
    return value;
  }

  #lifecycleArtifactKey(state: ExecutionEffectDockerLifecycleAuthorityV1['state']): string {
    const suffix = this.#admissionReceiptDigest.slice('sha256:'.length, 'sha256:'.length + 48);
    const phase = state === 'ALLOCATING' ? 'allocating'
      : state === 'PREPARED' ? 'prepared'
      : state === 'PROVIDER_START_AUTHORIZED' ? 'provider' : 'ready';
    return `effect-lifecycle-${suffix}-${phase}`;
  }

  #cleanupArtifactKey(mode: ExecutionEffectStoreCleanupModeV1, state: string): string {
    return executionEffectStoreCleanupArtifactKeyV1(
      this.#admissionReceiptDigest, mode, state as ExecutionEffectStoreCleanupStateV1,
    );
  }

  #cleanupEvidenceKey(mode: ExecutionEffectStoreCleanupModeV1, role: string): string {
    const suffix = this.#admissionReceiptDigest.slice(7, 55);
    const roleDigest = executionEffectPersistenceRawDigest(
      Buffer.from(`${mode}\0${role}`, 'utf8'),
    ).slice(7, 39);
    return `effect-ce-${suffix}-${mode === 'RELEASE' ? 'r' : 'c'}-${roleDigest}`;
  }

  #snapshotCleanupResources(
    value: unknown,
    mode: ExecutionEffectStoreCleanupModeV1,
  ): readonly ExecutionEffectStoreCleanupResourceIdentityV1[] | null {
    if (!Array.isArray(value) || nodeTypes.isProxy(value)) return null;
    const expectedKinds = mode === 'RELEASE' || value.length === 3
      ? ['provider-container', 'workspace-volume', 'dependency-volume'] as const
      : ['workspace-volume', 'dependency-volume'] as const;
    if (value.length !== expectedKinds.length) return null;
    const resources: ExecutionEffectStoreCleanupResourceIdentityV1[] = [];
    for (let index = 0; index < expectedKinds.length; index += 1) {
      const record = exactRecord(value[index], [
        'resourceKind', 'resourceName', 'resourceIdentityDigest',
        'resourceInstanceDigest', 'observationDigest',
      ]);
      if (!record || record.resourceKind !== expectedKinds[index]
        || typeof record.resourceName !== 'string'
        || !CLEANUP_RESOURCE_NAME.test(record.resourceName)
        || (record.resourceIdentityDigest !== null && !isDigest(record.resourceIdentityDigest))
        || ((mode === 'RELEASE' || record.resourceKind === 'provider-container')
          && !isDigest(record.resourceIdentityDigest))
        || !isDigest(record.resourceInstanceDigest) || !isDigest(record.observationDigest)) {
        return null;
      }
      resources.push(Object.freeze({
        resourceKind: record.resourceKind as ExecutionEffectDockerReleasedResourceKindV1,
        resourceName: record.resourceName,
        resourceIdentityDigest: record.resourceIdentityDigest as Sha256Digest | null,
        resourceInstanceDigest: record.resourceInstanceDigest,
        observationDigest: record.observationDigest,
      }));
    }
    return Object.freeze(resources);
  }

  #cleanupProgressDigest(
    body: Omit<ExecutionEffectStoreCleanupProgressV1, 'progressDigest'>,
  ): Sha256Digest {
    return executionEffectPersistenceRawDigest(canonicalTaskAttemptCustodyJson(Object.freeze({
      domain: 'execution-effect-store-cleanup-progress-v1', progress: body,
    }), this.#policy.jsonBounds));
  }

  #cleanupProgressBody(
    progress: ExecutionEffectStoreCleanupProgressV1,
  ): Omit<ExecutionEffectStoreCleanupProgressV1, 'progressDigest'> {
    const body = { ...progress } as Record<string, unknown>;
    delete body.progressDigest;
    return Object.freeze(body) as Omit<ExecutionEffectStoreCleanupProgressV1, 'progressDigest'>;
  }

  #landingRecoveryAnchorKey(): string {
    return this.#cleanupEvidenceKey('RELEASE', 'landing-recovery-anchor');
  }

  #readLandingRecoveryAnchor(): ExecutionEffectStoreLandingRecoveryAnchorV1 | null {
    const verified = this.#readArtifact(
      'execution-effect-lifecycle-authority', this.#landingRecoveryAnchorKey(),
    );
    if (!verified) return null;
    let value: unknown;
    try { value = JSON.parse(Buffer.from(verified.bytes).toString('utf8')); } catch {
      throw new TypeError('Execution effect landing recovery anchor is invalid');
    }
    const record = exactRecord(value, [
      'version', 'kind', 'state', 'identity', 'admissionReceiptDigest', 'policyDigest',
      'readyLifecycleAuthorityDigest', 'transactionDigest', 'resumeContext',
      'publishedAt', 'anchorDigest',
    ]);
    const identity = exactRecord(record?.identity, [
      'schemaVersion', 'backend', 'projectRootSha256', 'projectId', 'taskId',
      'attemptId', 'generation',
    ]);
    const resumeContext = parseExecutionEffectLandingLeaseResumeContextV1(record?.resumeContext);
    if (!record || record.version !== 1
      || record.kind !== 'execution-effect-store-landing-recovery-anchor'
      || record.state !== 'DURABLE' || !identity || !resumeContext
      || !sameBytes(canonicalTaskAttemptCustodyJson(identity, this.#policy.jsonBounds),
        canonicalTaskAttemptCustodyJson(this.#identity, this.#policy.jsonBounds))
      || record.admissionReceiptDigest !== this.#admissionReceiptDigest
      || record.policyDigest !== this.#policy.policyDigest
      || !isDigest(record.readyLifecycleAuthorityDigest) || !isDigest(record.transactionDigest)
      || resumeContext.transaction.transactionDigest !== record.transactionDigest
      || !isTimestamp(record.publishedAt) || !isDigest(record.anchorDigest)) {
      throw new TypeError('Execution effect landing recovery anchor schema mismatch');
    }
    const ready = this.#readLifecyclePublication('READY_FOR_LANDING');
    if (!ready || ready.authority.authorityDigest !== record.readyLifecycleAuthorityDigest
      || resumeContext.transaction.attemptDigest
        !== ready.authority.workspaceSnapshot.attemptDigest
      || resumeContext.transaction.baselineManifestDigest
        !== ready.authority.baselineManifest.digest
      || resumeContext.transaction.finalManifestDigest !== ready.authority.finalManifest.digest
      || resumeContext.transaction.containmentDecisionDigest
        !== ready.authority.decision.decisionDigest) {
      throw new TypeError('Execution effect landing recovery anchor authority mismatch');
    }
    const body = Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-store-landing-recovery-anchor' as const,
      state: 'DURABLE' as const,
      identity: Object.freeze({ ...this.#identity }),
      admissionReceiptDigest: this.#admissionReceiptDigest,
      policyDigest: this.#policy.policyDigest,
      readyLifecycleAuthorityDigest: record.readyLifecycleAuthorityDigest,
      transactionDigest: record.transactionDigest,
      resumeContext,
      publishedAt: record.publishedAt,
    });
    const anchor: ExecutionEffectStoreLandingRecoveryAnchorV1 = Object.freeze({
      ...body,
      anchorDigest: executionEffectPersistenceRawDigest(canonicalTaskAttemptCustodyJson(
        Object.freeze({
          domain: 'execution-effect-store-landing-recovery-anchor-v1', anchor: body,
        }), this.#policy.jsonBounds,
      )),
    });
    if (anchor.anchorDigest !== record.anchorDigest
      || !sameBytes(verified.bytes,
        canonicalTaskAttemptCustodyJson(anchor, this.#policy.jsonBounds))) {
      throw new TypeError('Execution effect landing recovery anchor digest mismatch');
    }
    return anchor;
  }

  publishLandingRecoveryAnchor(
    input: PublishExecutionEffectStoreLandingRecoveryAnchorV1Input,
  ): ExecutionEffectStoreLandingRecoveryAnchorV1 {
    const record = exactRecord(input, [
      'readyLifecycleAuthorityDigest', 'transactionDigest', 'resumeContext', 'publishedAt',
    ]);
    const resumeContext = parseExecutionEffectLandingLeaseResumeContextV1(record?.resumeContext);
    const ready = this.#readLifecyclePublication('READY_FOR_LANDING');
    if (!record || !resumeContext || !ready || !isTimestamp(record.publishedAt)
      || record.readyLifecycleAuthorityDigest !== ready.authority.authorityDigest
      || record.transactionDigest !== resumeContext.transaction.transactionDigest
      || resumeContext.transaction.attemptDigest
        !== ready.authority.workspaceSnapshot.attemptDigest
      || resumeContext.transaction.baselineManifestDigest
        !== ready.authority.baselineManifest.digest
      || resumeContext.transaction.finalManifestDigest !== ready.authority.finalManifest.digest
      || resumeContext.transaction.containmentDecisionDigest
        !== ready.authority.decision.decisionDigest) {
      throw new TypeError('Invalid execution effect landing recovery anchor');
    }
    const body = Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-store-landing-recovery-anchor' as const,
      state: 'DURABLE' as const,
      identity: Object.freeze({ ...this.#identity }),
      admissionReceiptDigest: this.#admissionReceiptDigest,
      policyDigest: this.#policy.policyDigest,
      readyLifecycleAuthorityDigest: ready.authority.authorityDigest as Sha256Digest,
      transactionDigest: resumeContext.transaction.transactionDigest as Sha256Digest,
      resumeContext,
      publishedAt: record.publishedAt,
    });
    const anchor: ExecutionEffectStoreLandingRecoveryAnchorV1 = Object.freeze({
      ...body,
      anchorDigest: executionEffectPersistenceRawDigest(canonicalTaskAttemptCustodyJson(
        Object.freeze({
          domain: 'execution-effect-store-landing-recovery-anchor-v1', anchor: body,
        }), this.#policy.jsonBounds,
      )),
    });
    this.#publishCanonical(
      'execution-effect-lifecycle-authority', this.#landingRecoveryAnchorKey(),
      anchor.publishedAt, anchor,
    );
    const durable = this.#readLandingRecoveryAnchor();
    if (!durable || durable.anchorDigest !== anchor.anchorDigest) {
      throw new TypeError('Landing recovery anchor was not durable');
    }
    return durable;
  }

  readLandingRecoveryAnchor(): ExecutionEffectStoreLandingRecoveryAnchorV1 | null {
    return this.#readLandingRecoveryAnchor();
  }

  #cleanupDeleteIntentDigest(
    mode: ExecutionEffectStoreCleanupModeV1,
    predecessorProgressDigest: Sha256Digest,
    resource: ExecutionEffectStoreCleanupResourceIdentityV1,
  ): Sha256Digest {
    return executionEffectPersistenceRawDigest(canonicalTaskAttemptCustodyJson(Object.freeze({
      domain: 'execution-effect-store-cleanup-delete-intent-v1',
      mode,
      predecessorProgressDigest,
      resource,
    }), this.#policy.jsonBounds));
  }

  #sameCleanupResources(
    left: readonly ExecutionEffectStoreCleanupResourceIdentityV1[],
    right: readonly ExecutionEffectStoreCleanupResourceIdentityV1[],
  ): boolean {
    return sameBytes(
      canonicalTaskAttemptCustodyJson(left, this.#policy.jsonBounds),
      canonicalTaskAttemptCustodyJson(right, this.#policy.jsonBounds),
    );
  }

  #sameImmutableArtifactRefs(
    left: readonly ExecutionEffectStoreImmutableArtifactRefV1[],
    right: readonly ExecutionEffectStoreImmutableArtifactRefV1[],
  ): boolean {
    return sameBytes(
      canonicalTaskAttemptCustodyJson(left, this.#policy.jsonBounds),
      canonicalTaskAttemptCustodyJson(right, this.#policy.jsonBounds),
    );
  }

  #parseImmutableArtifactRefs(
    value: unknown,
  ): readonly ExecutionEffectStoreImmutableArtifactRefV1[] | null {
    if (!Array.isArray(value) || nodeTypes.isProxy(value)) return null;
    const refs: ExecutionEffectStoreImmutableArtifactRefV1[] = [];
    for (const entry of value) {
      const ref = this.#parseImmutableArtifactRef(entry);
      if (!ref || refs.some(current => current.artifactKey === ref.artifactKey)) return null;
      refs.push(ref);
    }
    return Object.freeze(refs);
  }

  #releaseCleanupResources(
    authority: Extract<ExecutionEffectDockerLifecycleAuthorityV1, { state: 'READY_FOR_LANDING' }>,
  ): readonly ExecutionEffectStoreCleanupResourceIdentityV1[] {
    return Object.freeze([
      Object.freeze({
        resourceKind: 'provider-container' as const,
        resourceName: authority.providerStopped.containerName,
        resourceIdentityDigest: authority.providerStopped.containerIdentityDigest as Sha256Digest,
        resourceInstanceDigest: authority.providerStopped.containerIdentityDigest as Sha256Digest,
        observationDigest: authority.providerStopped.receiptDigest as Sha256Digest,
      }),
      Object.freeze({
        resourceKind: 'workspace-volume' as const,
        resourceName: authority.workspacePlan.volumeName,
        resourceIdentityDigest: authority.presentObservation.volumeIdentityDigest as Sha256Digest,
        resourceInstanceDigest:
          authority.workspacePlan.workspaceResourceInstanceDigest as Sha256Digest,
        observationDigest: authority.postProviderAttachmentReceipt.receiptDigest as Sha256Digest,
      }),
      Object.freeze({
        resourceKind: 'dependency-volume' as const,
        resourceName: authority.workspacePlan.dependencyPlan.volumeName,
        resourceIdentityDigest: authority.dependencyAuthority.volumeIdentityDigest as Sha256Digest,
        resourceInstanceDigest:
          authority.workspacePlan.dependencyResourceInstanceDigest as Sha256Digest,
        observationDigest: authority.postProviderAttachmentReceipt.receiptDigest as Sha256Digest,
      }),
    ]);
  }

  #compensationCleanupResources(
    authority: Extract<ExecutionEffectDockerLifecycleAuthorityV1, {
      state: 'ALLOCATING' | 'PREPARED' | 'PROVIDER_START_AUTHORIZED' | 'READY_FOR_LANDING';
    }>,
    workspaceValue: unknown,
    dependencyValue: unknown,
  ): readonly ExecutionEffectStoreCleanupResourceIdentityV1[] | null {
    const workspace = parseExecutionEffectDockerVolumeObservationV1(workspaceValue);
    const dependency = parseExecutionEffectDockerVolumeObservationV1(dependencyValue);
    if (!workspace || !dependency || workspace.authorityDigest !== dependency.authorityDigest
      || Date.parse(workspace.observedAt) < Date.parse(authority.admittedAt)
      || Date.parse(dependency.observedAt) < Date.parse(authority.admittedAt)
      || workspace.volumeName !== authority.workspacePlan.volumeName
      || workspace.resourceInstanceDigest
        !== authority.workspacePlan.workspaceResourceInstanceDigest
      || dependency.volumeName !== authority.workspacePlan.dependencyPlan.volumeName
      || dependency.resourceInstanceDigest
        !== authority.workspacePlan.dependencyResourceInstanceDigest
      || (workspace.state === 'PRESENT'
        && (workspace.labelsDigest !== authority.workspacePlan.workspaceLabelsDigest
          || workspace.mountPlanDigest !== authority.workspacePlan.mountPlanDigest))
      || (dependency.state === 'PRESENT'
        && (dependency.labelsDigest !== authority.workspacePlan.dependencyLabelsDigest
          || dependency.mountPlanDigest !== authority.workspacePlan.dependencyPlanDigest))
      || ((authority.state === 'PREPARED' || authority.state === 'PROVIDER_START_AUTHORIZED')
        && (workspace.state !== 'PRESENT' || dependency.state !== 'PRESENT'
          || workspace.volumeIdentityDigest !== authority.presentObservation.volumeIdentityDigest
          || dependency.volumeIdentityDigest
            !== authority.dependencyAuthority.volumeIdentityDigest))) return null;
    const volumes = [
      Object.freeze({
        resourceKind: 'workspace-volume' as const,
        resourceName: workspace.volumeName,
        resourceIdentityDigest: workspace.state === 'PRESENT'
          ? workspace.volumeIdentityDigest as Sha256Digest : null,
        resourceInstanceDigest: workspace.resourceInstanceDigest as Sha256Digest,
        observationDigest: workspace.observationDigest as Sha256Digest,
      }),
      Object.freeze({
        resourceKind: 'dependency-volume' as const,
        resourceName: dependency.volumeName,
        resourceIdentityDigest: dependency.state === 'PRESENT'
          ? dependency.volumeIdentityDigest as Sha256Digest : null,
        resourceInstanceDigest: dependency.resourceInstanceDigest as Sha256Digest,
        observationDigest: dependency.observationDigest as Sha256Digest,
      }),
    ];
    return Object.freeze(authority.state === 'READY_FOR_LANDING'
      ? [Object.freeze({
        resourceKind: 'provider-container' as const,
        resourceName: authority.providerStopped.containerName,
        resourceIdentityDigest: authority.providerStopped.containerIdentityDigest as Sha256Digest,
        resourceInstanceDigest: authority.providerStopped.containerIdentityDigest as Sha256Digest,
        observationDigest: authority.providerStopped.receiptDigest as Sha256Digest,
      }), ...volumes]
      : volumes);
  }

  #publishCleanupEvidence(
    mode: ExecutionEffectStoreCleanupModeV1,
    role: string,
    capturedAt: string,
    value: unknown,
    artifactClass: 'execution-effect-lifecycle-authority'
      | 'execution-effect-landing-receipt-evidence' = 'execution-effect-lifecycle-authority',
  ): ExecutionEffectStoreImmutableArtifactRefV1 {
    const receipt = this.#publishCanonical(
      artifactClass,
      this.#cleanupEvidenceKey(mode, role),
      capturedAt,
      value,
    );
    return this.#immutableArtifactRef(receipt);
  }

  #readCleanupEvidence(
    mode: ExecutionEffectStoreCleanupModeV1,
    role: string,
    artifactClass: 'execution-effect-lifecycle-authority'
      | 'execution-effect-landing-receipt-evidence' = 'execution-effect-lifecycle-authority',
  ): Readonly<{ ref: ExecutionEffectStoreImmutableArtifactRefV1; value: unknown }> | null {
    const verified = this.#readArtifact(
      artifactClass, this.#cleanupEvidenceKey(mode, role),
    );
    if (!verified) return null;
    let value: unknown;
    try { value = JSON.parse(Buffer.from(verified.bytes).toString('utf8')); } catch {
      throw new TypeError('Cleanup evidence artifact is invalid');
    }
    return Object.freeze({ ref: this.#immutableArtifactRef(verified.receipt), value });
  }

  #adoptOrPublishCleanupEvidence(
    mode: ExecutionEffectStoreCleanupModeV1,
    role: string,
    capturedAt: string,
    value: unknown,
    artifactClass: 'execution-effect-lifecycle-authority'
      | 'execution-effect-landing-receipt-evidence' = 'execution-effect-lifecycle-authority',
  ): Readonly<{ ref: ExecutionEffectStoreImmutableArtifactRefV1; value: unknown }> {
    const existing = this.#readCleanupEvidence(mode, role, artifactClass);
    if (existing) return existing;
    const ref = this.#publishCleanupEvidence(mode, role, capturedAt, value, artifactClass);
    const durable = this.#readCleanupEvidence(mode, role, artifactClass);
    if (!durable || durable.ref.artifactReceiptDigest !== ref.artifactReceiptDigest) {
      throw new TypeError('Cleanup evidence publication was not durable');
    }
    return durable;
  }

  #cleanupPublication(
    progress: ExecutionEffectStoreCleanupProgressV1,
  ): ExecutionEffectStoreCleanupPublicationV1 {
    const verified = this.#readArtifact(
      'execution-effect-lifecycle-authority',
      this.#cleanupArtifactKey(progress.mode, progress.state),
    );
    if (!verified) throw new TypeError('Cleanup progress durable reread failed');
    return Object.freeze({
      progress,
      artifact: this.#immutableArtifactRef(verified.receipt),
    });
  }

  #publishCleanupProgress(
    body: Omit<ExecutionEffectStoreCleanupProgressV1, 'progressDigest'>,
  ): ExecutionEffectStoreCleanupPublicationV1 {
    const progress: ExecutionEffectStoreCleanupProgressV1 = Object.freeze({
      ...body,
      progressDigest: this.#cleanupProgressDigest(body),
    });
    const receipt = this.#publishCanonical(
      'execution-effect-lifecycle-authority',
      this.#cleanupArtifactKey(progress.mode, progress.state),
      progress.progressedAt,
      progress,
    );
    const durable = this.#readCleanupProgress(progress.mode, progress.state);
    if (!durable || durable.progressDigest !== progress.progressDigest) {
      throw new TypeError('Execution effect cleanup progress was not durable');
    }
    const publication = this.#cleanupPublication(durable);
    if (publication.artifact.artifactReceiptDigest !== receipt.receiptDigest) {
      throw new TypeError('Execution effect cleanup progress receipt mismatch');
    }
    return publication;
  }

  #readCleanupProgress(
    mode: ExecutionEffectStoreCleanupModeV1,
    state: ExecutionEffectStoreCleanupStateV1,
  ): ExecutionEffectStoreCleanupProgressV1 | null {
    const compensationPrepared = mode === 'COMPENSATION' && state !== 'COMPENSATION_PREPARED'
      ? this.#readCleanupProgress('COMPENSATION', 'COMPENSATION_PREPARED') : null;
    const compensationHasProviderContainer = compensationPrepared
      ? compensationPrepared.resources.some(entry => entry.resourceKind === 'provider-container')
      : true;
    const sequence = cleanupSequence(
      mode, compensationHasProviderContainer,
    ) as readonly ExecutionEffectStoreCleanupStateV1[];
    const stateIndex = sequence.indexOf(state);
    if (stateIndex < 0) return null;
    const verified = this.#readArtifact(
      'execution-effect-lifecycle-authority', this.#cleanupArtifactKey(mode, state),
    );
    if (!verified) return null;
    let value: unknown;
    try { value = JSON.parse(Buffer.from(verified.bytes).toString('utf8')); } catch {
      throw new TypeError('Execution effect cleanup progress artifact is invalid');
    }
    const record = exactRecord(value, [
      'version', 'kind', 'mode', 'state', 'identity', 'admissionReceiptDigest',
      'policyDigest', 'lifecycleAuthorityDigest', 'landingRecoveryAnchorDigest',
      'landingReceiptDigest',
      'landingReceiptArtifact', 'preparationEvidenceArtifacts', 'resources',
      'predecessorProgressDigest', 'targetResourceKind', 'deleteIntentDigest',
      'absenceDisposition', 'deletionEvidenceArtifact', 'absenceEvidenceArtifact',
      'progressedAt', 'progressDigest',
    ]);
    const identity = exactRecord(record?.identity, [
      'schemaVersion', 'backend', 'projectRootSha256', 'projectId', 'taskId',
      'attemptId', 'generation',
    ]);
    const landingRef = record?.landingReceiptArtifact === null ? null
      : this.#parseImmutableArtifactRef(record?.landingReceiptArtifact);
    const preparationRefs = this.#parseImmutableArtifactRefs(record?.preparationEvidenceArtifacts);
    const resources = this.#snapshotCleanupResources(record?.resources, mode);
    const deletionRef = record?.deletionEvidenceArtifact === null ? null
      : this.#parseImmutableArtifactRef(record?.deletionEvidenceArtifact);
    const absenceRef = record?.absenceEvidenceArtifact === null ? null
      : this.#parseImmutableArtifactRef(record?.absenceEvidenceArtifact);
    if (!record || record.version !== 1
      || record.kind !== 'execution-effect-store-cleanup-progress'
      || record.mode !== mode || record.state !== state || !identity || !resources
      || !preparationRefs || !isDigest(record.lifecycleAuthorityDigest)
      || !sameBytes(canonicalTaskAttemptCustodyJson(identity, this.#policy.jsonBounds),
        canonicalTaskAttemptCustodyJson(this.#identity, this.#policy.jsonBounds))
      || record.admissionReceiptDigest !== this.#admissionReceiptDigest
      || record.policyDigest !== this.#policy.policyDigest
      || (record.landingRecoveryAnchorDigest !== null
        && !isDigest(record.landingRecoveryAnchorDigest))
      || (record.landingReceiptDigest !== null && !isDigest(record.landingReceiptDigest))
      || (record.landingReceiptArtifact !== null && landingRef === null)
      || (record.predecessorProgressDigest !== null
        && !isDigest(record.predecessorProgressDigest))
      || (record.targetResourceKind !== null
        && record.targetResourceKind !== 'provider-container'
        && record.targetResourceKind !== 'workspace-volume'
        && record.targetResourceKind !== 'dependency-volume')
      || (record.deleteIntentDigest !== null && !isDigest(record.deleteIntentDigest))
      || (record.absenceDisposition !== null
        && record.absenceDisposition !== 'EXECUTED_DELETION'
        && record.absenceDisposition !== 'RECONCILED_ABSENCE')
      || (record.deletionEvidenceArtifact !== null && deletionRef === null)
      || (record.absenceEvidenceArtifact !== null && absenceRef === null)
      || !isTimestamp(record.progressedAt) || !isDigest(record.progressDigest)) {
      throw new TypeError('Execution effect cleanup progress schema is invalid');
    }
    const body = Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-store-cleanup-progress' as const,
      mode,
      state,
      identity: Object.freeze({ ...this.#identity }),
      admissionReceiptDigest: this.#admissionReceiptDigest,
      policyDigest: this.#policy.policyDigest,
      lifecycleAuthorityDigest: record.lifecycleAuthorityDigest,
      landingRecoveryAnchorDigest:
        record.landingRecoveryAnchorDigest as Sha256Digest | null,
      landingReceiptDigest: record.landingReceiptDigest as Sha256Digest | null,
      landingReceiptArtifact: landingRef,
      preparationEvidenceArtifacts: preparationRefs,
      resources,
      predecessorProgressDigest: record.predecessorProgressDigest as Sha256Digest | null,
      targetResourceKind:
        record.targetResourceKind as ExecutionEffectDockerReleasedResourceKindV1 | null,
      deleteIntentDigest: record.deleteIntentDigest as Sha256Digest | null,
      absenceDisposition:
        record.absenceDisposition as ExecutionEffectStoreCleanupProgressV1['absenceDisposition'],
      deletionEvidenceArtifact: deletionRef,
      absenceEvidenceArtifact: absenceRef,
      progressedAt: record.progressedAt,
    }) satisfies Omit<ExecutionEffectStoreCleanupProgressV1, 'progressDigest'>;
    const progress: ExecutionEffectStoreCleanupProgressV1 = Object.freeze({
      ...body,
      progressDigest: this.#cleanupProgressDigest(body),
    });
    if (progress.progressDigest !== record.progressDigest
      || !sameBytes(verified.bytes,
        canonicalTaskAttemptCustodyJson(progress, this.#policy.jsonBounds))) {
      throw new TypeError('Execution effect cleanup progress digest mismatch');
    }
    const predecessorState = stateIndex === 0 ? null : sequence[stateIndex - 1]!;
    const predecessor = predecessorState === null ? null
      : this.#readCleanupProgress(mode, predecessorState);
    if ((predecessor === null) !== (stateIndex === 0)
      || progress.predecessorProgressDigest !== (predecessor?.progressDigest ?? null)
      || (predecessor && (predecessor.lifecycleAuthorityDigest
        !== progress.lifecycleAuthorityDigest
        || predecessor.landingRecoveryAnchorDigest
          !== progress.landingRecoveryAnchorDigest
        || predecessor.landingReceiptDigest !== progress.landingReceiptDigest
        || !sameBytes(
          canonicalTaskAttemptCustodyJson(
            predecessor.landingReceiptArtifact, this.#policy.jsonBounds,
          ),
          canonicalTaskAttemptCustodyJson(
            progress.landingReceiptArtifact, this.#policy.jsonBounds,
          ),
        )
        || !this.#sameImmutableArtifactRefs(
          predecessor.preparationEvidenceArtifacts,
          progress.preparationEvidenceArtifacts,
        )
        || !this.#sameCleanupResources(predecessor.resources, progress.resources)
        || Date.parse(progress.progressedAt) < Date.parse(predecessor.progressedAt)))) {
      throw new TypeError('Execution effect cleanup predecessor mismatch');
    }
    const stateKind = cleanupStateKind(state);
    const target = cleanupTargetForState(state);
    if (stateKind === 'PREPARED') {
      if (progress.predecessorProgressDigest !== null || progress.targetResourceKind !== null
        || progress.deleteIntentDigest !== null || progress.absenceDisposition !== null
        || progress.deletionEvidenceArtifact !== null
        || progress.absenceEvidenceArtifact !== null) {
        throw new TypeError('Execution effect cleanup prepared authority is invalid');
      }
    } else if (stateKind === 'TERMINAL') {
      if (progress.targetResourceKind !== null || progress.deleteIntentDigest !== null
        || progress.absenceDisposition !== null || progress.deletionEvidenceArtifact !== null
        || progress.absenceEvidenceArtifact !== null) {
        throw new TypeError('Execution effect cleanup terminal authority is invalid');
      }
    } else {
      const resource = resources.find(entry => entry.resourceKind === target);
      if (!resource || progress.targetResourceKind !== target || !predecessor
        || progress.deleteIntentDigest !== this.#cleanupDeleteIntentDigest(
          mode, stateKind === 'INTENT' ? predecessor.progressDigest
            : predecessor.predecessorProgressDigest!, resource,
        )) {
        throw new TypeError('Execution effect cleanup intent authority is invalid');
      }
      if (stateKind === 'INTENT') {
        if (progress.absenceDisposition !== null || progress.deletionEvidenceArtifact !== null
          || progress.absenceEvidenceArtifact !== null) {
          throw new TypeError('Execution effect cleanup intent carries outcome evidence');
        }
      } else {
        if (!progress.absenceDisposition || !absenceRef) {
          throw new TypeError('Execution effect cleanup absence evidence is unavailable');
        }
        const expectedCleanupAuthority = mode === 'RELEASE'
          ? progress.landingReceiptDigest : progress.lifecycleAuthorityDigest;
        const absenceArtifact = this.#readImmutableArtifact(
          'execution-effect-lifecycle-authority', absenceRef,
        );
        if (!absenceArtifact) throw new TypeError('Cleanup absence evidence reread failed');
        let absenceValue: unknown;
        try { absenceValue = JSON.parse(Buffer.from(absenceArtifact.bytes).toString('utf8')); } catch {
          throw new TypeError('Cleanup absence evidence is invalid');
        }
        if (progress.absenceDisposition === 'EXECUTED_DELETION') {
          if (!deletionRef || !resource.resourceIdentityDigest) {
            throw new TypeError('Cleanup deletion evidence is unavailable');
          }
          const deletionArtifact = this.#readImmutableArtifact(
            'execution-effect-lifecycle-authority', deletionRef,
          );
          let deletionValue: unknown;
          try {
            deletionValue = deletionArtifact
              ? JSON.parse(Buffer.from(deletionArtifact.bytes).toString('utf8')) : null;
          } catch { deletionValue = null; }
          const deletion = parseExecutionEffectDockerResourceDeletionReceiptV1(deletionValue);
          const absence = parseExecutionEffectDockerResourceAbsenceReceiptV1(absenceValue);
          if (!deletion || !absence || deletion.resourceKind !== target
            || deletion.resourceName !== resource.resourceName
            || deletion.resourceIdentityDigest !== resource.resourceIdentityDigest
            || deletion.cleanupAuthorityDigest !== expectedCleanupAuthority
            || deletion.deleteIntentDigest !== progress.deleteIntentDigest
            || absence.resourceKind !== target || absence.resourceName !== resource.resourceName
            || absence.resourceIdentityDigest !== resource.resourceIdentityDigest
            || absence.deleteIntentDigest !== progress.deleteIntentDigest
            || absence.deletionReceiptDigest !== deletion.receiptDigest
            || Date.parse(deletion.deletedAt) < Date.parse(predecessor.progressedAt)
            || Date.parse(absence.observedAt) < Date.parse(deletion.deletedAt)
            || Date.parse(progress.progressedAt) < Date.parse(absence.observedAt)) {
            throw new TypeError('Cleanup executed deletion evidence mismatch');
          }
        } else {
          if (deletionRef) throw new TypeError('Reconciled absence cannot carry deletion evidence');
          const absence = parseExecutionEffectDockerReconciledAbsenceReceiptV1(absenceValue);
          if (!absence || absence.resourceKind !== target
            || absence.resourceName !== resource.resourceName
            || absence.resourceIdentityDigest !== resource.resourceIdentityDigest
            || absence.cleanupAuthorityDigest !== expectedCleanupAuthority
            || absence.deleteIntentDigest !== progress.deleteIntentDigest
            || Date.parse(absence.observedAt) < Date.parse(predecessor.progressedAt)
            || Date.parse(progress.progressedAt) < Date.parse(absence.observedAt)) {
            throw new TypeError('Cleanup reconciled absence evidence mismatch');
          }
        }
      }
    }
    if (mode === 'RELEASE') {
      if (!landingRef || !progress.landingReceiptDigest || preparationRefs.length !== 1) {
        throw new TypeError('Release cleanup landing authority is unavailable');
      }
      const ready = this.#readLifecyclePublication('READY_FOR_LANDING');
      const anchor = this.#readLandingRecoveryAnchor();
      const landingArtifact = this.#readImmutableArtifact(
        'execution-effect-landing-receipt-evidence', landingRef,
      );
      let landingValue: unknown;
      try {
        landingValue = landingArtifact
          ? JSON.parse(Buffer.from(landingArtifact.bytes).toString('utf8')) : null;
      } catch { landingValue = null; }
      const landing = parseExecutionEffectLandingReceiptV1(landingValue);
      const terminalArtifact = this.#readImmutableArtifact(
        'execution-effect-landing-receipt-evidence', preparationRefs[0]!,
      );
      let terminalValue: unknown;
      try {
        terminalValue = terminalArtifact
          ? JSON.parse(Buffer.from(terminalArtifact.bytes).toString('utf8')) : null;
      } catch { terminalValue = null; }
      const terminal = ready ? parseExecutionEffectLandingTerminalSealV1(terminalValue, {
        attempt: ready.authority.workspaceSnapshot.attempt,
        attemptDigest: ready.authority.workspaceSnapshot.attemptDigest,
      }) : null;
      if (!ready || !anchor || !landing || !terminal || ready.authority.authorityDigest
        !== progress.lifecycleAuthorityDigest
        || anchor.anchorDigest !== progress.landingRecoveryAnchorDigest
        || anchor.transactionDigest !== landing.transaction.transactionDigest
        || landing.receiptDigest !== progress.landingReceiptDigest
        || landing.transaction.projectId !== this.#identity.projectId
        || landing.transaction.taskId !== this.#identity.taskId
        || landing.transaction.attemptId !== this.#identity.attemptId
        || landing.transaction.generation !== this.#identity.generation
        || landing.transaction.attemptDigest !== ready.authority.workspaceSnapshot.attemptDigest
        || landing.transaction.baselineManifestDigest !== ready.authority.baselineManifest.digest
        || landing.transaction.finalManifestDigest !== ready.authority.finalManifest.digest
        || landing.transaction.containmentDecisionDigest !== ready.authority.decision.decisionDigest
        || terminal.transactionDigest !== landing.transaction.transactionDigest
        || terminal.disposition !== landing.state
        || terminal.workspaceSnapshotSealDigest !== ready.authority.workspaceSnapshot.sealDigest
        || terminal.baselineManifestDigest !== ready.authority.baselineManifest.digest
        || terminal.finalManifestDigest !== ready.authority.finalManifest.digest
        || terminal.effectDecisionDigest !== ready.authority.decision.decisionDigest
        || terminal.committedJournalDigest !== landing.committedJournalDigest
        || terminal.leaseTerminalReceiptDigest !== landing.leaseTerminalReceiptDigest
        || terminal.finalVerificationReceiptDigest !== landing.finalVerificationReceiptDigest
        || !sameBytes(
          canonicalTaskAttemptCustodyJson(
            terminal.operations.map(operation => operation.nativeReceiptDigest),
            this.#policy.jsonBounds,
          ),
          canonicalTaskAttemptCustodyJson(
            landing.operationReceiptDigests, this.#policy.jsonBounds,
          ),
        )
        || terminal.committedAt !== preparationRefs[0]!.capturedAt
        || anchor.resumeContext.prepared.recordDigest !== terminal.preparedJournalDigest
        || anchor.resumeContext.committed?.journal.recordDigest
          !== terminal.committedJournalDigest
        || anchor.resumeContext.committed?.disposition !== terminal.disposition
        || (anchor.resumeContext.applying?.journal.recordDigest ?? null)
          !== terminal.applyingJournalDigest
        || !this.#sameCleanupResources(
          resources, this.#releaseCleanupResources(ready.authority),
        )) throw new TypeError('Release cleanup authority binding mismatch');
    } else {
      if (landingRef || progress.landingReceiptDigest !== null
        || progress.landingRecoveryAnchorDigest !== null
        || preparationRefs.length !== 2) {
        throw new TypeError('Compensation cleanup evidence is unavailable');
      }
      const allocating = this.#readLifecyclePublication('ALLOCATING');
      const prepared = this.#readLifecyclePublication('PREPARED');
      const provider = this.#readLifecyclePublication('PROVIDER_START_AUTHORIZED');
      const ready = this.#readLifecyclePublication('READY_FOR_LANDING');
      const lifecycle = ready?.authority.authorityDigest === progress.lifecycleAuthorityDigest
        ? ready.authority
        : provider?.authority.authorityDigest === progress.lifecycleAuthorityDigest
          ? provider.authority
        : prepared?.authority.authorityDigest === progress.lifecycleAuthorityDigest
          ? prepared.authority
        : allocating?.authority.authorityDigest === progress.lifecycleAuthorityDigest
          ? allocating.authority : null;
      const observations = preparationRefs.map(ref => {
        const artifact = this.#readImmutableArtifact('execution-effect-lifecycle-authority', ref);
        if (!artifact) return null;
        try { return JSON.parse(Buffer.from(artifact.bytes).toString('utf8')); } catch { return null; }
      });
      const expected = lifecycle ? this.#compensationCleanupResources(
        lifecycle, observations[0], observations[1],
      ) : null;
      if (!expected || !this.#sameCleanupResources(resources, expected)) {
        throw new TypeError('Compensation cleanup authority binding mismatch');
      }
    }
    return progress;
  }

  readLatestCleanupProgress(
    mode: ExecutionEffectStoreCleanupModeV1,
  ): ExecutionEffectStoreCleanupProgressV1 | null {
    const prepared = mode === 'COMPENSATION'
      ? this.#readCleanupProgress('COMPENSATION', 'COMPENSATION_PREPARED') : null;
    if (mode === 'COMPENSATION' && prepared
      && !prepared.resources.some(entry => entry.resourceKind === 'provider-container')) {
      for (const forbidden of [
        'COMPENSATION_CONTAINER_DELETE_INTENT', 'COMPENSATION_CONTAINER_ABSENT',
      ] as const) {
        if (this.#readArtifact(
          'execution-effect-lifecycle-authority', this.#cleanupArtifactKey(mode, forbidden),
        )) throw new TypeError('Volume-only compensation carries provider cleanup state');
      }
    }
    const sequence = cleanupSequence(
      mode,
      prepared?.resources.some(entry => entry.resourceKind === 'provider-container') ?? true,
    ) as readonly ExecutionEffectStoreCleanupStateV1[];
    let latest: ExecutionEffectStoreCleanupProgressV1 | null = null;
    let gap = false;
    for (const state of sequence) {
      const current = this.#readCleanupProgress(mode, state);
      if (!current) {
        gap = true;
        continue;
      }
      if (gap) throw new TypeError('Execution effect cleanup progress has a durable gap');
      latest = current;
    }
    return latest;
  }

  readLatestReleaseProgress(): ExecutionEffectStoreCleanupProgressV1 | null {
    return this.readLatestCleanupProgress('RELEASE');
  }

  #readCleanupEvidenceValue(ref: ExecutionEffectStoreImmutableArtifactRefV1): unknown {
    const artifact = this.#readImmutableArtifact('execution-effect-lifecycle-authority', ref);
    if (!artifact) throw new TypeError('Cleanup evidence durable reread failed');
    try { return JSON.parse(Buffer.from(artifact.bytes).toString('utf8')); } catch {
      throw new TypeError('Cleanup evidence artifact is invalid');
    }
  }

  #readReleaseOutcome(
    state: 'CONTAINER_ABSENT' | 'WORKSPACE_VOLUME_ABSENT' | 'DEPENDENCY_VOLUME_ABSENT',
  ): ExecutionEffectDockerResourceReleaseOutcomeV1 {
    const progress = this.#readCleanupProgress('RELEASE', state);
    if (!progress?.absenceEvidenceArtifact || !progress.absenceDisposition) {
      throw new TypeError('Release cleanup outcome is unavailable');
    }
    const absenceValue = this.#readCleanupEvidenceValue(progress.absenceEvidenceArtifact);
    if (progress.absenceDisposition === 'RECONCILED_ABSENCE') {
      const absence = parseExecutionEffectDockerReconciledAbsenceReceiptV1(absenceValue);
      if (!absence || progress.deletionEvidenceArtifact !== null) {
        throw new TypeError('Release reconciled absence outcome is invalid');
      }
      return Object.freeze({ disposition: 'RECONCILED_ABSENCE' as const, absence });
    }
    if (!progress.deletionEvidenceArtifact) {
      throw new TypeError('Release deletion outcome is unavailable');
    }
    const deletion = parseExecutionEffectDockerResourceDeletionReceiptV1(
      this.#readCleanupEvidenceValue(progress.deletionEvidenceArtifact),
    );
    const absence = parseExecutionEffectDockerResourceAbsenceReceiptV1(absenceValue);
    if (!deletion || !absence) throw new TypeError('Release deletion outcome is invalid');
    return Object.freeze({ disposition: 'EXECUTED_DELETION' as const, deletion, absence });
  }

  readReleaseOutcomes(): ExecutionEffectStoreReleaseOutcomesV1 {
    const terminal = this.readLatestReleaseProgress();
    if (terminal?.state !== 'RELEASED') {
      throw new TypeError('Release cleanup terminal authority is unavailable');
    }
    return Object.freeze({
      providerContainerOutcome: this.#readReleaseOutcome('CONTAINER_ABSENT'),
      workspaceVolumeOutcome: this.#readReleaseOutcome('WORKSPACE_VOLUME_ABSENT'),
      dependencyVolumeOutcome: this.#readReleaseOutcome('DEPENDENCY_VOLUME_ABSENT'),
      releasedProgressDigest: terminal.progressDigest,
    });
  }

  /**
   * Reconstructs the workspace release projection using only durable Store authority.
   * This remains callable after process restart and after the live lifecycle session was
   * consumed; it performs no Docker or filesystem effect.
   */
  projectWorkspaceReleaseFromDurableCleanup(): ReleaseExecutionEffectDockerWorkspaceV1Result {
    const ready = this.#readLifecyclePublication('READY_FOR_LANDING');
    const prepared = this.#readCleanupProgress('RELEASE', 'RELEASE_PREPARED');
    const terminal = this.readLatestReleaseProgress();
    if (!ready || !prepared?.landingReceiptArtifact || terminal?.state !== 'RELEASED') {
      throw new TypeError('Durable workspace release authority is unavailable');
    }
    const landingArtifact = this.#readImmutableArtifact(
      'execution-effect-landing-receipt-evidence', prepared.landingReceiptArtifact,
    );
    let landingValue: unknown;
    try {
      landingValue = landingArtifact
        ? JSON.parse(Buffer.from(landingArtifact.bytes).toString('utf8')) : null;
    } catch { landingValue = null; }
    const landingReceipt = parseExecutionEffectLandingReceiptV1(landingValue);
    if (!landingReceipt || prepared.lifecycleAuthorityDigest !== ready.authority.authorityDigest
      || terminal.lifecycleAuthorityDigest !== ready.authority.authorityDigest) {
      throw new TypeError('Durable workspace release authority mismatch');
    }
    const outcomes = this.readReleaseOutcomes();
    return projectExecutionEffectDockerWorkspaceReleaseV1(
      ready.authority as ExecutionEffectDockerReadyLifecycleAuthorityV1,
      Object.freeze({
        landingReceipt,
        committedAt: prepared.progressedAt,
        providerContainerOutcome: outcomes.providerContainerOutcome,
        workspaceVolumeOutcome: outcomes.workspaceVolumeOutcome,
        dependencyVolumeOutcome: outcomes.dependencyVolumeOutcome,
        releasedAt: terminal.progressedAt,
      }),
    );
  }

  #workspaceReleaseMatchesCleanupOutcomes(
    release: ExecutionEffectWorkspaceReleaseV1,
    outcomes: ExecutionEffectStoreReleaseOutcomesV1,
  ): boolean {
    const matches = (
      projected: Readonly<{
        disposition: 'EXECUTED_DELETION' | 'RECONCILED_ABSENCE';
        deletionReceiptDigest: Sha256Digest | null;
        absenceEvidenceDigest: Sha256Digest;
      }>,
      outcome: ExecutionEffectDockerResourceReleaseOutcomeV1,
    ) => projected.disposition === outcome.disposition
      && projected.deletionReceiptDigest === (outcome.disposition === 'EXECUTED_DELETION'
        ? outcome.deletion.receiptDigest : null)
      && projected.absenceEvidenceDigest === outcome.absence.receiptDigest;
    return matches(release.providerContainer, outcomes.providerContainerOutcome)
      && matches(release.workspaceVolume, outcomes.workspaceVolumeOutcome)
      && matches(release.dependencyVolume, outcomes.dependencyVolumeOutcome);
  }

  readLatestCompensationProgress(): ExecutionEffectStoreCleanupProgressV1 | null {
    return this.readLatestCleanupProgress('COMPENSATION');
  }

  readReleaseRecoveryAuthority(): ExecutionEffectStoreReleaseRecoveryAuthorityV1 | null {
    const progress = this.readLatestReleaseProgress();
    if (!progress) return null;
    const ready = this.#readLifecyclePublication('READY_FOR_LANDING');
    const preparedWorkspace = this.readPreparedWorkspace();
    const anchor = this.#readLandingRecoveryAnchor();
    const landingRef = progress.landingReceiptArtifact;
    const terminalRef = progress.preparationEvidenceArtifacts[0] ?? null;
    const landingArtifact = landingRef ? this.#readImmutableArtifact(
      'execution-effect-landing-receipt-evidence', landingRef,
    ) : null;
    const terminalArtifact = terminalRef ? this.#readImmutableArtifact(
      'execution-effect-landing-receipt-evidence', terminalRef,
    ) : null;
    let landingValue: unknown = null;
    let terminalValue: unknown = null;
    try {
      landingValue = landingArtifact
        ? JSON.parse(Buffer.from(landingArtifact.bytes).toString('utf8')) : null;
      terminalValue = terminalArtifact
        ? JSON.parse(Buffer.from(terminalArtifact.bytes).toString('utf8')) : null;
    } catch {
      throw new TypeError('Release recovery evidence is invalid');
    }
    const landingReceipt = parseExecutionEffectLandingReceiptV1(landingValue);
    const terminalSeal = ready ? parseExecutionEffectLandingTerminalSealV1(terminalValue, {
      attempt: ready.authority.workspaceSnapshot.attempt,
      attemptDigest: ready.authority.workspaceSnapshot.attemptDigest,
    }) : null;
    if (!ready || !preparedWorkspace || !anchor || !landingReceipt || !terminalSeal
      || progress.lifecycleAuthorityDigest !== ready.authority.authorityDigest
      || progress.landingRecoveryAnchorDigest !== anchor.anchorDigest
      || progress.landingReceiptDigest !== landingReceipt.receiptDigest
      || terminalSeal.transactionDigest !== landingReceipt.transaction.transactionDigest
      || terminalSeal.committedAt !== terminalRef?.capturedAt) {
      throw new TypeError('Release recovery authority is unavailable');
    }
    return Object.freeze({
      readyLifecycleAuthority: ready.authority,
      preparedWorkspace,
      landingRecoveryAnchor: anchor,
      landingReceipt,
      terminalSeal,
      progress,
    });
  }

  publishReleasePrepared(
    input: PublishExecutionEffectStoreReleasePreparedV1Input,
  ): ExecutionEffectStoreCleanupPublicationV1 {
    const record = exactRecord(input, [
      'lifecycleAuthorityDigest', 'landingReceipt', 'terminalSeal', 'progressedAt',
    ]);
    const landing = record ? parseExecutionEffectLandingReceiptV1(record.landingReceipt) : null;
    const ready = this.#readLifecyclePublication('READY_FOR_LANDING');
    const terminal = ready && record ? parseExecutionEffectLandingTerminalSealV1(
      record.terminalSeal,
      {
        attempt: ready.authority.workspaceSnapshot.attempt,
        attemptDigest: ready.authority.workspaceSnapshot.attemptDigest,
      },
    ) : null;
    const anchor = this.#readLandingRecoveryAnchor();
    if (!record || !landing || !terminal || !ready || !anchor || !isTimestamp(record.progressedAt)
      || record.lifecycleAuthorityDigest !== ready.authority.authorityDigest
      || anchor.readyLifecycleAuthorityDigest !== ready.authority.authorityDigest
      || anchor.transactionDigest !== landing.transaction.transactionDigest
      || anchor.resumeContext.committed === null
      || anchor.resumeContext.committed.disposition !== landing.state
      || anchor.resumeContext.committed.journal.recordDigest !== landing.committedJournalDigest
      || landing.transaction.projectId !== this.#identity.projectId
      || landing.transaction.taskId !== this.#identity.taskId
      || landing.transaction.attemptId !== this.#identity.attemptId
      || landing.transaction.generation !== this.#identity.generation
      || landing.transaction.attemptDigest !== ready.authority.workspaceSnapshot.attemptDigest
      || landing.transaction.baselineManifestDigest !== ready.authority.baselineManifest.digest
      || landing.transaction.finalManifestDigest !== ready.authority.finalManifest.digest
      || landing.transaction.containmentDecisionDigest !== ready.authority.decision.decisionDigest
      || terminal.transactionDigest !== landing.transaction.transactionDigest
      || terminal.disposition !== landing.state
      || terminal.workspaceSnapshotSealDigest !== ready.authority.workspaceSnapshot.sealDigest
      || terminal.baselineManifestDigest !== ready.authority.baselineManifest.digest
      || terminal.finalManifestDigest !== ready.authority.finalManifest.digest
      || terminal.effectDecisionDigest !== ready.authority.decision.decisionDigest
      || terminal.committedJournalDigest !== landing.committedJournalDigest
      || terminal.leaseTerminalReceiptDigest !== landing.leaseTerminalReceiptDigest
      || terminal.finalVerificationReceiptDigest !== landing.finalVerificationReceiptDigest
      || terminal.committedAt !== record.progressedAt
      || anchor.resumeContext.prepared.recordDigest !== terminal.preparedJournalDigest
      || anchor.resumeContext.committed?.journal.recordDigest
        !== terminal.committedJournalDigest
      || anchor.resumeContext.committed?.disposition !== terminal.disposition
      || (anchor.resumeContext.applying?.journal.recordDigest ?? null)
        !== terminal.applyingJournalDigest) {
      throw new TypeError('Invalid release cleanup preparation');
    }
    const existing = this.#readCleanupProgress('RELEASE', 'RELEASE_PREPARED');
    if (existing) {
      const recovery = this.readReleaseRecoveryAuthority();
      if (existing.lifecycleAuthorityDigest !== ready.authority.authorityDigest
        || existing.landingReceiptDigest !== landing.receiptDigest
        || recovery?.terminalSeal.sealDigest !== terminal.sealDigest) {
        throw new TypeError('Release cleanup prepared replay mismatch');
      }
      return this.#cleanupPublication(existing);
    }
    const durableLanding = this.#adoptOrPublishCleanupEvidence(
      'RELEASE', 'committed-landing', record.progressedAt, landing,
      'execution-effect-landing-receipt-evidence',
    );
    const adoptedLanding = parseExecutionEffectLandingReceiptV1(durableLanding.value);
    if (!adoptedLanding || adoptedLanding.receiptDigest !== landing.receiptDigest) {
      throw new TypeError('Release cleanup landing evidence collision');
    }
    const durableTerminal = this.#adoptOrPublishCleanupEvidence(
      'RELEASE', 'terminal-seal', terminal.committedAt, terminal,
      'execution-effect-landing-receipt-evidence',
    );
    const adoptedTerminal = parseExecutionEffectLandingTerminalSealV1(
      durableTerminal.value,
      {
        attempt: ready.authority.workspaceSnapshot.attempt,
        attemptDigest: ready.authority.workspaceSnapshot.attemptDigest,
      },
    );
    if (!adoptedTerminal || adoptedTerminal.sealDigest !== terminal.sealDigest) {
      throw new TypeError('Release cleanup terminal seal collision');
    }
    return this.#publishCleanupProgress(Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-store-cleanup-progress' as const,
      mode: 'RELEASE' as const,
      state: 'RELEASE_PREPARED' as const,
      identity: Object.freeze({ ...this.#identity }),
      admissionReceiptDigest: this.#admissionReceiptDigest,
      policyDigest: this.#policy.policyDigest,
      lifecycleAuthorityDigest: ready.authority.authorityDigest as Sha256Digest,
      landingRecoveryAnchorDigest: anchor.anchorDigest,
      landingReceiptDigest: landing.receiptDigest as Sha256Digest,
      landingReceiptArtifact: durableLanding.ref,
      preparationEvidenceArtifacts: Object.freeze([durableTerminal.ref]),
      resources: this.#releaseCleanupResources(ready.authority),
      predecessorProgressDigest: null,
      targetResourceKind: null,
      deleteIntentDigest: null,
      absenceDisposition: null,
      deletionEvidenceArtifact: null,
      absenceEvidenceArtifact: null,
      progressedAt: record.progressedAt,
    }));
  }

  publishCompensationPrepared(
    input: PublishExecutionEffectStoreCompensationPreparedV1Input,
  ): ExecutionEffectStoreCleanupPublicationV1 {
    const record = exactRecord(input, [
      'lifecycleAuthorityDigest', 'workspaceObservation', 'dependencyObservation', 'progressedAt',
    ]);
    const allocating = this.#readLifecyclePublication('ALLOCATING');
    const prepared = this.#readLifecyclePublication('PREPARED');
    const provider = this.#readLifecyclePublication('PROVIDER_START_AUTHORIZED');
    const ready = this.#readLifecyclePublication('READY_FOR_LANDING');
    const lifecycle = record && ready !== null
      && ready.authority.authorityDigest === record.lifecycleAuthorityDigest
      ? ready.authority
      : record && provider !== null
      && provider.authority.authorityDigest === record.lifecycleAuthorityDigest
        ? provider.authority
      : record && prepared !== null
      && prepared.authority.authorityDigest === record.lifecycleAuthorityDigest
      ? prepared.authority
      : record && allocating !== null
        && allocating.authority.authorityDigest === record.lifecycleAuthorityDigest
        ? allocating.authority : null;
    const workspace = parseExecutionEffectDockerVolumeObservationV1(record?.workspaceObservation);
    const dependency = parseExecutionEffectDockerVolumeObservationV1(record?.dependencyObservation);
    const proposedResources = lifecycle && record ? this.#compensationCleanupResources(
      lifecycle, record.workspaceObservation, record.dependencyObservation,
    ) : null;
    if (!record || !lifecycle || !proposedResources || !workspace || !dependency
      || !isTimestamp(record.progressedAt)
      || Date.parse(record.progressedAt) < Date.parse(workspace.observedAt)
      || Date.parse(record.progressedAt) < Date.parse(dependency.observedAt)) {
      throw new TypeError('Invalid compensation cleanup preparation');
    }
    const existing = this.#readCleanupProgress('COMPENSATION', 'COMPENSATION_PREPARED');
    if (existing) {
      if (existing.lifecycleAuthorityDigest !== lifecycle.authorityDigest) {
        throw new TypeError('Compensation cleanup prepared replay mismatch');
      }
      return this.#cleanupPublication(existing);
    }
    const durableWorkspace = this.#adoptOrPublishCleanupEvidence(
      'COMPENSATION', 'workspace-observation', workspace.observedAt, workspace,
    );
    const durableDependency = this.#adoptOrPublishCleanupEvidence(
      'COMPENSATION', 'dependency-observation', dependency.observedAt, dependency,
    );
    const adoptedWorkspace = parseExecutionEffectDockerVolumeObservationV1(
      durableWorkspace.value,
    );
    const adoptedDependency = parseExecutionEffectDockerVolumeObservationV1(
      durableDependency.value,
    );
    const resources = adoptedWorkspace && adoptedDependency
      ? this.#compensationCleanupResources(lifecycle, adoptedWorkspace, adoptedDependency) : null;
    if (!adoptedWorkspace || !adoptedDependency || !resources
      || Date.parse(record.progressedAt) < Date.parse(adoptedWorkspace.observedAt)
      || Date.parse(record.progressedAt) < Date.parse(adoptedDependency.observedAt)) {
      throw new TypeError('Compensation cleanup observation evidence collision');
    }
    return this.#publishCleanupProgress(Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-store-cleanup-progress' as const,
      mode: 'COMPENSATION' as const,
      state: 'COMPENSATION_PREPARED' as const,
      identity: Object.freeze({ ...this.#identity }),
      admissionReceiptDigest: this.#admissionReceiptDigest,
      policyDigest: this.#policy.policyDigest,
      lifecycleAuthorityDigest: lifecycle.authorityDigest as Sha256Digest,
      landingRecoveryAnchorDigest: null,
      landingReceiptDigest: null,
      landingReceiptArtifact: null,
      preparationEvidenceArtifacts: Object.freeze([
        durableWorkspace.ref, durableDependency.ref,
      ]),
      resources,
      predecessorProgressDigest: null,
      targetResourceKind: null,
      deleteIntentDigest: null,
      absenceDisposition: null,
      deletionEvidenceArtifact: null,
      absenceEvidenceArtifact: null,
      progressedAt: record.progressedAt,
    }));
  }

  publishCleanupDeleteIntent(
    input: PublishExecutionEffectStoreCleanupDeleteIntentV1Input,
  ): ExecutionEffectStoreCleanupPublicationV1 {
    const record = exactRecord(input, ['mode', 'resourceKind', 'progressedAt']);
    if (!record || (record.mode !== 'RELEASE' && record.mode !== 'COMPENSATION')
      || (record.resourceKind !== 'provider-container'
        && record.resourceKind !== 'workspace-volume'
        && record.resourceKind !== 'dependency-volume')
      || !isTimestamp(record.progressedAt)) throw new TypeError('Invalid cleanup delete intent');
    const mode = record.mode;
    const latest = this.readLatestCleanupProgress(mode);
    if (latest && cleanupStateKind(latest.state) === 'INTENT'
      && cleanupTargetForState(latest.state) === record.resourceKind) {
      return this.#cleanupPublication(latest);
    }
    const sequence = cleanupSequence(
      mode, latest?.resources.some(entry => entry.resourceKind === 'provider-container') ?? true,
    ) as readonly ExecutionEffectStoreCleanupStateV1[];
    const nextState = latest ? sequence[sequence.indexOf(latest.state) + 1] : undefined;
    if (!latest || !nextState || cleanupStateKind(nextState) !== 'INTENT'
      || cleanupTargetForState(nextState) !== record.resourceKind
      || Date.parse(record.progressedAt) < Date.parse(latest.progressedAt)) {
      throw new TypeError('Cleanup delete intent predecessor mismatch');
    }
    const resource = latest.resources.find(entry => entry.resourceKind === record.resourceKind);
    if (!resource) throw new TypeError('Cleanup delete intent resource is unavailable');
    const deleteIntentDigest = this.#cleanupDeleteIntentDigest(
      mode, latest.progressDigest, resource,
    );
    return this.#publishCleanupProgress(Object.freeze({
      ...this.#cleanupProgressBody(latest),
      state: nextState,
      predecessorProgressDigest: latest.progressDigest,
      targetResourceKind: record.resourceKind,
      deleteIntentDigest,
      absenceDisposition: null,
      deletionEvidenceArtifact: null,
      absenceEvidenceArtifact: null,
      progressedAt: record.progressedAt,
    }));
  }

  publishCleanupAbsence(
    input: PublishExecutionEffectStoreCleanupAbsenceV1Input,
  ): ExecutionEffectStoreCleanupPublicationV1 {
    const record = exactRecord(input, ['mode', 'evidence', 'progressedAt']);
    if (!record || (record.mode !== 'RELEASE' && record.mode !== 'COMPENSATION')
      || !isTimestamp(record.progressedAt)) throw new TypeError('Invalid cleanup absence');
    const mode = record.mode;
    const latest = this.readLatestCleanupProgress(mode);
    const evidenceRecord = exactRecord(record.evidence, ['disposition', 'deletion', 'absence'])
      ?? exactRecord(record.evidence, ['disposition', 'absence']);
    if (latest && cleanupStateKind(latest.state) === 'ABSENCE') {
      const target = cleanupTargetForState(latest.state);
      const resource = latest.resources.find(entry => entry.resourceKind === target);
      const executed = evidenceRecord?.disposition === 'EXECUTED_DELETION'
        ? parseExecutionEffectDockerResourceDeletionReceiptV1(evidenceRecord.deletion) : null;
      const executedAbsence = evidenceRecord?.disposition === 'EXECUTED_DELETION'
        ? parseExecutionEffectDockerResourceAbsenceReceiptV1(evidenceRecord.absence) : null;
      const reconciled = evidenceRecord?.disposition === 'RECONCILED_ABSENCE'
        ? parseExecutionEffectDockerReconciledAbsenceReceiptV1(evidenceRecord.absence) : null;
      const proposedTarget = executed?.resourceKind ?? reconciled?.resourceKind;
      const proposedName = executed?.resourceName ?? reconciled?.resourceName;
      const proposedIdentity = executed?.resourceIdentityDigest
        ?? reconciled?.resourceIdentityDigest;
      const proposedIntent = executed?.deleteIntentDigest ?? reconciled?.deleteIntentDigest;
      const proposedCleanupAuthority = executed?.cleanupAuthorityDigest
        ?? reconciled?.cleanupAuthorityDigest;
      const expectedCleanupAuthority = mode === 'RELEASE'
        ? latest.landingReceiptDigest : latest.lifecycleAuthorityDigest;
      if (!resource || !evidenceRecord || proposedTarget !== target
        || proposedName !== resource.resourceName
        || proposedIdentity !== resource.resourceIdentityDigest
        || proposedIntent !== latest.deleteIntentDigest
        || proposedCleanupAuthority !== expectedCleanupAuthority
        || (executed && (!executedAbsence
          || executedAbsence.resourceKind !== target
          || executedAbsence.resourceName !== resource.resourceName
          || executedAbsence.resourceIdentityDigest !== resource.resourceIdentityDigest
          || executedAbsence.deleteIntentDigest !== latest.deleteIntentDigest
          || executedAbsence.deletionReceiptDigest !== executed.receiptDigest))) {
        throw new TypeError('Cleanup absence replay authority mismatch');
      }
      return this.#cleanupPublication(latest);
    }
    const sequence = cleanupSequence(
      mode, latest?.resources.some(entry => entry.resourceKind === 'provider-container') ?? true,
    ) as readonly ExecutionEffectStoreCleanupStateV1[];
    const nextState = latest ? sequence[sequence.indexOf(latest.state) + 1] : undefined;
    const target = nextState ? cleanupTargetForState(nextState) : null;
    const resource = latest?.resources.find(entry => entry.resourceKind === target);
    if (!latest || !nextState || cleanupStateKind(nextState) !== 'ABSENCE' || !target
      || !resource || !evidenceRecord || Date.parse(record.progressedAt)
        < Date.parse(latest.progressedAt)) {
      throw new TypeError('Cleanup absence predecessor mismatch');
    }
    let disposition: ExecutionEffectStoreCleanupProgressV1['absenceDisposition'];
    let deletionRef: ExecutionEffectStoreImmutableArtifactRefV1 | null = null;
    let absenceRef: ExecutionEffectStoreImmutableArtifactRefV1;
    const expectedCleanupAuthority = mode === 'RELEASE'
      ? latest.landingReceiptDigest : latest.lifecycleAuthorityDigest;
    const deletionRole = `${nextState.toLowerCase()}-deletion`;
    const absenceRole = `${nextState.toLowerCase()}-absence`;
    let proposedDeletion: ExecutionEffectDockerResourceDeletionReceiptV1 | null = null;
    let proposedObservedAt: string;
    if (evidenceRecord.disposition === 'EXECUTED_DELETION') {
      const deletion = parseExecutionEffectDockerResourceDeletionReceiptV1(
        evidenceRecord.deletion,
      );
      const absence = parseExecutionEffectDockerResourceAbsenceReceiptV1(
        evidenceRecord.absence,
      );
      if (!deletion || !absence || !resource.resourceIdentityDigest
        || deletion.resourceKind !== target || deletion.resourceName !== resource.resourceName
        || deletion.resourceIdentityDigest !== resource.resourceIdentityDigest
        || deletion.cleanupAuthorityDigest !== expectedCleanupAuthority
        || deletion.deleteIntentDigest !== latest.deleteIntentDigest
        || absence.resourceKind !== target || absence.resourceName !== resource.resourceName
        || absence.resourceIdentityDigest !== resource.resourceIdentityDigest
        || absence.deleteIntentDigest !== latest.deleteIntentDigest
        || absence.deletionReceiptDigest !== deletion.receiptDigest
        || Date.parse(deletion.deletedAt) < Date.parse(latest.progressedAt)
        || Date.parse(absence.observedAt) < Date.parse(deletion.deletedAt)
        || Date.parse(record.progressedAt) < Date.parse(absence.observedAt)) {
        throw new TypeError('Invalid executed cleanup evidence');
      }
      proposedDeletion = deletion;
      proposedObservedAt = absence.observedAt;
    } else if (evidenceRecord.disposition === 'RECONCILED_ABSENCE') {
      const absence = parseExecutionEffectDockerReconciledAbsenceReceiptV1(
        evidenceRecord.absence,
      );
      if (!absence || absence.resourceKind !== target
        || absence.resourceName !== resource.resourceName
        || absence.resourceIdentityDigest !== resource.resourceIdentityDigest
        || absence.cleanupAuthorityDigest !== (mode === 'RELEASE'
          ? latest.landingReceiptDigest : latest.lifecycleAuthorityDigest)
        || absence.deleteIntentDigest !== latest.deleteIntentDigest
        || Date.parse(absence.observedAt) < Date.parse(latest.progressedAt)
        || Date.parse(record.progressedAt) < Date.parse(absence.observedAt)) {
        throw new TypeError('Invalid reconciled cleanup evidence');
      }
      proposedObservedAt = absence.observedAt;
    } else {
      throw new TypeError('Invalid cleanup absence disposition');
    }

    // Evidence has its own first-writer keys. A crash may happen after either evidence
    // publication but before the progress record. On retry, adopt the semantically bound
    // first writer instead of manufacturing a new timestamped receipt for the same key.
    let durableDeletion = this.#readCleanupEvidence(mode, deletionRole);
    if (!durableDeletion && proposedDeletion) {
      durableDeletion = this.#adoptOrPublishCleanupEvidence(
        mode, deletionRole, proposedDeletion.deletedAt, proposedDeletion,
      );
    }
    const deletion = durableDeletion
      ? parseExecutionEffectDockerResourceDeletionReceiptV1(durableDeletion.value) : null;
    if (durableDeletion && (!deletion || !resource.resourceIdentityDigest
      || deletion.resourceKind !== target || deletion.resourceName !== resource.resourceName
      || deletion.resourceIdentityDigest !== resource.resourceIdentityDigest
      || deletion.cleanupAuthorityDigest !== expectedCleanupAuthority
      || deletion.deleteIntentDigest !== latest.deleteIntentDigest
      || Date.parse(deletion.deletedAt) < Date.parse(latest.progressedAt))) {
      throw new TypeError('Cleanup deletion evidence collision');
    }
    let durableAbsence = this.#readCleanupEvidence(mode, absenceRole);
    if (!durableAbsence) {
      const absence = deletion
        ? createExecutionEffectDockerResourceAbsenceReceiptV1({
          resourceKind: target,
          resourceName: resource.resourceName,
          resourceIdentityDigest: deletion.resourceIdentityDigest,
          deleteIntentDigest: deletion.deleteIntentDigest,
          deletionReceiptDigest: deletion.receiptDigest,
          observedAt: proposedObservedAt,
        })
        : parseExecutionEffectDockerReconciledAbsenceReceiptV1(evidenceRecord.absence);
      if (!absence) throw new TypeError('Cleanup absence evidence is unavailable');
      durableAbsence = this.#adoptOrPublishCleanupEvidence(
        mode, absenceRole, absence.observedAt, absence,
      );
    }
    if (deletion) {
      const absence = parseExecutionEffectDockerResourceAbsenceReceiptV1(durableAbsence.value);
      if (!absence || absence.resourceKind !== target
        || absence.resourceName !== resource.resourceName
        || absence.resourceIdentityDigest !== deletion.resourceIdentityDigest
        || absence.deleteIntentDigest !== latest.deleteIntentDigest
        || absence.deletionReceiptDigest !== deletion.receiptDigest
        || Date.parse(absence.observedAt) < Date.parse(deletion.deletedAt)
        || Date.parse(record.progressedAt) < Date.parse(absence.observedAt)) {
        throw new TypeError('Cleanup executed absence evidence collision');
      }
      deletionRef = durableDeletion!.ref;
      absenceRef = durableAbsence.ref;
      disposition = 'EXECUTED_DELETION';
    } else {
      const absence = parseExecutionEffectDockerReconciledAbsenceReceiptV1(
        durableAbsence.value,
      );
      if (!absence || absence.resourceKind !== target
        || absence.resourceName !== resource.resourceName
        || absence.resourceIdentityDigest !== resource.resourceIdentityDigest
        || absence.cleanupAuthorityDigest !== expectedCleanupAuthority
        || absence.deleteIntentDigest !== latest.deleteIntentDigest
        || Date.parse(absence.observedAt) < Date.parse(latest.progressedAt)
        || Date.parse(record.progressedAt) < Date.parse(absence.observedAt)) {
        throw new TypeError('Cleanup reconciled absence evidence collision');
      }
      absenceRef = durableAbsence.ref;
      disposition = 'RECONCILED_ABSENCE';
    }
    return this.#publishCleanupProgress(Object.freeze({
      ...this.#cleanupProgressBody(latest),
      state: nextState,
      predecessorProgressDigest: latest.progressDigest,
      targetResourceKind: target,
      absenceDisposition: disposition,
      deletionEvidenceArtifact: deletionRef,
      absenceEvidenceArtifact: absenceRef,
      progressedAt: record.progressedAt,
    }));
  }

  publishCleanupTerminal(
    input: PublishExecutionEffectStoreCleanupTerminalV1Input,
  ): ExecutionEffectStoreCleanupPublicationV1 {
    const record = exactRecord(input, ['mode', 'progressedAt']);
    if (!record || (record.mode !== 'RELEASE' && record.mode !== 'COMPENSATION')
      || !isTimestamp(record.progressedAt)) throw new TypeError('Invalid cleanup terminal state');
    const mode = record.mode;
    const latest = this.readLatestCleanupProgress(mode);
    if (latest && cleanupStateKind(latest.state) === 'TERMINAL') {
      return this.#cleanupPublication(latest);
    }
    const sequence = cleanupSequence(
      mode, latest?.resources.some(entry => entry.resourceKind === 'provider-container') ?? true,
    ) as readonly ExecutionEffectStoreCleanupStateV1[];
    const nextState = latest ? sequence[sequence.indexOf(latest.state) + 1] : undefined;
    if (!latest || !nextState || cleanupStateKind(nextState) !== 'TERMINAL'
      || Date.parse(record.progressedAt) < Date.parse(latest.progressedAt)) {
      throw new TypeError('Cleanup terminal predecessor mismatch');
    }
    return this.#publishCleanupProgress(Object.freeze({
      ...this.#cleanupProgressBody(latest),
      state: nextState,
      predecessorProgressDigest: latest.progressDigest,
      targetResourceKind: null,
      deleteIntentDigest: null,
      absenceDisposition: null,
      deletionEvidenceArtifact: null,
      absenceEvidenceArtifact: null,
      progressedAt: record.progressedAt,
    }));
  }

  #lifecycleCapturedAt(authority: ExecutionEffectDockerLifecycleAuthorityV1): string {
    return authority.state === 'ALLOCATING' ? authority.admittedAt
      : authority.state === 'PREPARED' ? authority.workspaceSnapshot.sealedAt
      : authority.state === 'PROVIDER_START_AUTHORIZED'
        ? authority.authorizedAt : authority.quiescenceSeal.sealedAt;
  }

  #lifecycleMatchesAdapter(authority: ExecutionEffectDockerLifecycleAuthorityV1): boolean {
    return sameAttempt(this.#identity, authority.attempt)
      && authority.admissionReceiptDigest === this.#admissionReceiptDigest
      && authority.custodyPolicyDigest === this.#policy.policyDigest
      && authority.platform === this.#platform;
  }

  #immutableArtifactRef(
    receipt: TaskAttemptCustodyArtifactReceiptV2,
  ): ExecutionEffectStoreImmutableArtifactRefV1 {
    return Object.freeze({
      artifactKey: receipt.artifactKey,
      artifactReceiptDigest: receipt.receiptDigest,
      contentDigest: receipt.artifact.sha256,
      byteLength: receipt.artifact.byteLength,
      capturedAt: receipt.capturedAt,
    });
  }

  #parseImmutableArtifactRef(value: unknown): ExecutionEffectStoreImmutableArtifactRefV1 | null {
    const record = exactRecord(value, [
      'artifactKey', 'artifactReceiptDigest', 'contentDigest', 'byteLength', 'capturedAt',
    ]);
    if (!record || !SAFE_KEY.test(record.artifactKey as string)
      || !isDigest(record.artifactReceiptDigest) || !isDigest(record.contentDigest)
      || !Number.isSafeInteger(record.byteLength) || (record.byteLength as number) < 0
      || !isTimestamp(record.capturedAt)) return null;
    return Object.freeze({
      artifactKey: record.artifactKey as string,
      artifactReceiptDigest: record.artifactReceiptDigest,
      contentDigest: record.contentDigest,
      byteLength: record.byteLength as number,
      capturedAt: record.capturedAt,
    });
  }

  #readImmutableArtifact(
    artifactClass: Exclude<HostArtifactClass, 'task-admission-snapshot'>,
    ref: ExecutionEffectStoreImmutableArtifactRefV1,
  ) {
    const verified = this.#store.readVerifiedArtifact({
      identity: this.#identity,
      policy: this.#policy,
      artifactClass,
      artifactKey: ref.artifactKey,
      receiptDigest: ref.artifactReceiptDigest,
    });
    return verified && verified.proof.sha256 === ref.contentDigest
      && verified.proof.byteLength === ref.byteLength
      && verified.receipt.capturedAt === ref.capturedAt ? verified : null;
  }

  #lifecycleSemanticProjection(
    authority: ExecutionEffectDockerLifecycleAuthorityV1,
  ): Readonly<Record<string, unknown>> {
    const source = { ...authority } as Record<string, unknown>;
    delete source.version;
    delete source.kind;
    delete source.authorityDigest;
    if (authority.state === 'ALLOCATING') return Object.freeze(source);
    delete source.baselineManifest;
    source.baselineManifestDigest = authority.baselineManifest.digest;
    if (authority.state === 'READY_FOR_LANDING') {
      delete source.finalManifest;
      delete source.decision;
      source.finalManifestDigest = authority.finalManifest.digest;
      source.containmentDecisionDigest = authority.decision.decisionDigest;
    }
    return Object.freeze(source);
  }

  #readArtifact(
    artifactClass: Exclude<HostArtifactClass, 'task-admission-snapshot'>,
    artifactKey: string,
  ) {
    const receipt = this.#store.readArtifactReceipt({
      identity: this.#identity,
      policy: this.#policy,
      artifactClass,
      artifactKey,
    });
    if (receipt === null) return null;
    const verified = this.#store.readVerifiedArtifact({
      identity: this.#identity,
      policy: this.#policy,
      artifactClass,
      artifactKey,
      receiptDigest: receipt.receiptDigest,
    });
    if (verified === null || verified.receipt.receiptDigest !== receipt.receiptDigest) {
      throw new TypeError('Execution effect Store artifact reread failed');
    }
    return verified;
  }

  #publishBytes(input: Readonly<{
    artifactClass: Exclude<HostArtifactClass, 'task-admission-snapshot'>;
    artifactKey: string;
    capturedAt: string;
    bytes: Uint8Array;
    replayTimestamp: 'exact' | 'retain-first';
  }>): TaskAttemptCustodyArtifactReceiptV2 {
    if (!SAFE_KEY.test(input.artifactKey) || !isTimestamp(input.capturedAt)
      || !(input.bytes instanceof Uint8Array) || nodeTypes.isProxy(input.bytes)) {
      throw new TypeError('Invalid execution effect Store artifact publication');
    }
    const bytes = Uint8Array.from(input.bytes);
    const existing = this.#readArtifact(input.artifactClass, input.artifactKey);
    if (existing !== null) {
      if (!sameBytes(existing.bytes, bytes)
        || (input.replayTimestamp === 'exact' && existing.receipt.capturedAt !== input.capturedAt)) {
        throw new TypeError('Execution effect Store first-writer collision');
      }
      return existing.receipt;
    }
    const receipt = this.#store.publishHostArtifact({
      identity: this.#identity,
      policy: this.#policy,
      admissionReceiptDigest: this.#admissionReceiptDigest,
      artifactClass: input.artifactClass,
      artifactKey: input.artifactKey,
      capturedAt: input.capturedAt,
      bytes,
    });
    const reread = this.#readArtifact(input.artifactClass, input.artifactKey);
    if (reread === null || reread.receipt.receiptDigest !== receipt.receiptDigest
      || !sameBytes(reread.bytes, bytes)) {
      throw new TypeError('Execution effect Store publication was not durable');
    }
    return receipt;
  }

  #publishJournal(input: Readonly<{
    key: string;
    bytes: Uint8Array;
    contentDigest: string;
  }>): ExecutionEffectLandingJournalArtifactV1 {
    const record = exactRecord(input, ['key', 'bytes', 'contentDigest']);
    const artifactKey = executionEffectStoreJournalArtifactKeyV1(record?.key as string);
    if (record === null || artifactKey === null || !isDigest(record.contentDigest)
      || !(record.bytes instanceof Uint8Array) || nodeTypes.isProxy(record.bytes)) {
      throw new TypeError('Invalid execution effect journal artifact');
    }
    const bytes = Uint8Array.from(record.bytes as Uint8Array);
    if (executionEffectPersistenceRawDigest(bytes) !== record.contentDigest) {
      throw new TypeError('Execution effect journal digest mismatch');
    }
    this.#publishBytes({
      artifactClass: 'execution-effect-landing-journal',
      artifactKey,
      capturedAt: this.#timestamp(),
      bytes,
      replayTimestamp: 'retain-first',
    });
    const durable = this.#readJournal(record.key as string);
    if (durable === null || durable.contentDigest !== record.contentDigest
      || !sameBytes(durable.bytes, bytes)) {
      throw new TypeError('Execution effect journal durable reread mismatch');
    }
    return durable;
  }

  #readJournal(logicalKey: string): ExecutionEffectLandingJournalArtifactV1 | null {
    const artifactKey = executionEffectStoreJournalArtifactKeyV1(logicalKey);
    if (artifactKey === null) return null;
    const verified = this.#readArtifact('execution-effect-landing-journal', artifactKey);
    if (verified === null) return null;
    return Object.freeze({
      key: logicalKey,
      bytes: Uint8Array.from(verified.bytes),
      contentDigest: verified.proof.sha256,
      byteLength: verified.proof.byteLength,
      publicationReceiptDigest: verified.receipt.receiptDigest,
    });
  }

  readJournalReference(
    logicalKey: string,
    recordDigest: Sha256Digest,
  ): ExecutionEffectLandingJournalArtifactRefV1 | null {
    if (!isDigest(recordDigest)) return null;
    const artifactKey = executionEffectStoreJournalArtifactKeyV1(logicalKey);
    const artifact = this.#readJournal(logicalKey);
    if (artifactKey === null || artifact === null) return null;
    let value: unknown;
    try { value = JSON.parse(Buffer.from(artifact.bytes).toString('utf8')); } catch { return null; }
    if (value === null || typeof value !== 'object'
      || Reflect.get(value, 'recordDigest') !== recordDigest) return null;
    return Object.freeze({
      artifactKey,
      artifactReceiptDigest: artifact.publicationReceiptDigest as Sha256Digest,
      contentDigest: artifact.contentDigest as Sha256Digest,
      byteLength: artifact.byteLength,
    });
  }

  publishLifecycleAuthority(
    value: ExecutionEffectDockerLifecycleAuthorityV1,
  ): ExecutionEffectStoreLifecyclePublicationV1 {
    const authority = parseExecutionEffectDockerLifecycleAuthorityV1(value);
    if (!authority || !this.#lifecycleMatchesAdapter(authority)) {
      throw new TypeError('Invalid execution effect lifecycle Store authority');
    }
    const predecessor = authority.state === 'ALLOCATING' ? null
      : this.#readLifecyclePublication(authority.state === 'PREPARED' ? 'ALLOCATING'
        : authority.state === 'PROVIDER_START_AUTHORIZED' ? 'PREPARED'
          : 'PROVIDER_START_AUTHORIZED');
    if (authority.state !== 'ALLOCATING'
      && (!predecessor
        || predecessor.authority.authorityDigest !== authority.predecessorAuthorityDigest)) {
      throw new TypeError('Execution effect lifecycle predecessor is unavailable');
    }
    const workspaceKeys = this.#preparedWorkspaceArtifactKeys();
    const workspaceReceipt = authority.state === 'ALLOCATING' ? null : this.#publishCanonical(
      'execution-workspace-snapshot',
      workspaceKeys.workspaceSnapshot,
      authority.workspaceSnapshot.sealedAt,
      authority.workspaceSnapshot,
    );
    const baselineReceipt = authority.state === 'ALLOCATING' ? null : this.#publishCanonical(
      'execution-effect-manifest',
      workspaceKeys.baselineManifest,
      authority.baselineManifest.captureAuthority.completedAt,
      authority.baselineManifest,
    );
    const finalReceipt = authority.state === 'READY_FOR_LANDING'
      ? this.#publishCanonical(
        'execution-effect-manifest',
        `effect-final-ready-${this.#admissionReceiptDigest.slice(7, 55)}`,
        authority.finalManifest.captureAuthority.completedAt,
        authority.finalManifest,
      ) : null;
    const semanticProjection = this.#lifecycleSemanticProjection(authority);
    const durableBody = Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-store-durable-lifecycle-authority' as const,
      state: authority.state,
      identity: Object.freeze({ ...this.#identity }),
      admissionReceiptDigest: this.#admissionReceiptDigest,
      policyDigest: this.#policy.policyDigest,
      platform: this.#platform,
      semanticAuthorityDigest: authority.authorityDigest as Sha256Digest,
      predecessorDurableAuthorityDigest:
        predecessor?.durableAuthority.durableAuthorityDigest ?? null,
      semanticProjection,
      workspaceSnapshotArtifact: workspaceReceipt ? this.#immutableArtifactRef(workspaceReceipt) : null,
      baselineManifestArtifact: baselineReceipt ? this.#immutableArtifactRef(baselineReceipt) : null,
      finalManifestArtifact: finalReceipt ? this.#immutableArtifactRef(finalReceipt) : null,
    });
    const durableAuthority: ExecutionEffectStoreDurableLifecycleAuthorityV1 = Object.freeze({
      ...durableBody,
      durableAuthorityDigest: executionEffectPersistenceRawDigest(
        canonicalTaskAttemptCustodyJson(Object.freeze({
          domain: 'execution-effect-store-durable-lifecycle-authority-v1',
          authority: durableBody,
        }), this.#policy.jsonBounds),
      ),
    });
    const artifactKey = this.#lifecycleArtifactKey(authority.state);
    const receipt = this.#publishCanonical(
      'execution-effect-lifecycle-authority',
      artifactKey,
      this.#lifecycleCapturedAt(authority),
      durableAuthority,
    );
    const durable = this.#readLifecyclePublication(authority.state);
    if (!durable || durable.authority.authorityDigest !== authority.authorityDigest
      || durable.durableAuthority.durableAuthorityDigest
        !== durableAuthority.durableAuthorityDigest) {
      throw new TypeError('Execution effect lifecycle Store durable reread mismatch');
    }
    return Object.freeze({
      authority: durable.authority,
      durableAuthority: durable.durableAuthority,
      artifact: Object.freeze({
        state: durable.authority.state,
        artifactKey,
        artifactReceiptDigest: receipt.receiptDigest,
        contentDigest: receipt.artifact.sha256,
        byteLength: receipt.artifact.byteLength,
        capturedAt: receipt.capturedAt,
        semanticAuthorityDigest: durable.authority.authorityDigest as Sha256Digest,
        durableAuthorityDigest: durable.durableAuthority.durableAuthorityDigest,
      }),
    });
  }

  #readLifecyclePublication<S extends ExecutionEffectDockerLifecycleAuthorityV1['state']>(
    state: S,
  ): (ExecutionEffectStoreLifecyclePublicationV1 & Readonly<{
    authority: Extract<ExecutionEffectDockerLifecycleAuthorityV1, { state: S }>;
  }>) | null {
    const artifactKey = this.#lifecycleArtifactKey(state);
    const verified = this.#readArtifact('execution-effect-lifecycle-authority', artifactKey);
    if (verified === null) return null;
    let value: unknown;
    try { value = JSON.parse(Buffer.from(verified.bytes).toString('utf8')); } catch {
      throw new TypeError('Execution effect lifecycle Store artifact is invalid');
    }
    const record = exactRecord(value, [
      'version', 'kind', 'state', 'identity', 'admissionReceiptDigest', 'policyDigest',
      'platform', 'semanticAuthorityDigest', 'predecessorDurableAuthorityDigest',
      'semanticProjection', 'workspaceSnapshotArtifact', 'baselineManifestArtifact',
      'finalManifestArtifact', 'durableAuthorityDigest',
    ]);
    const workspaceRef = record?.workspaceSnapshotArtifact === null ? null
      : this.#parseImmutableArtifactRef(record?.workspaceSnapshotArtifact);
    const baselineRef = record?.baselineManifestArtifact === null ? null
      : this.#parseImmutableArtifactRef(record?.baselineManifestArtifact);
    const finalRef = record?.finalManifestArtifact === null ? null
      : this.#parseImmutableArtifactRef(record?.finalManifestArtifact);
    const identity = exactRecord(record?.identity, [
      'schemaVersion', 'backend', 'projectRootSha256', 'projectId', 'taskId',
      'attemptId', 'generation',
    ]);
    if (!record || record.version !== 1
      || record.kind !== 'execution-effect-store-durable-lifecycle-authority'
      || record.state !== state || !identity
      || (state === 'ALLOCATING') !== (workspaceRef === null && baselineRef === null)
      || (state !== 'ALLOCATING' && (workspaceRef === null || baselineRef === null))
      || (state === 'READY_FOR_LANDING') !== (finalRef !== null)
      || !sameBytes(canonicalTaskAttemptCustodyJson(identity, this.#policy.jsonBounds),
        canonicalTaskAttemptCustodyJson(this.#identity, this.#policy.jsonBounds))
      || record.admissionReceiptDigest !== this.#admissionReceiptDigest
      || record.policyDigest !== this.#policy.policyDigest || record.platform !== this.#platform
      || !isDigest(record.semanticAuthorityDigest)
      || (record.predecessorDurableAuthorityDigest !== null
        && !isDigest(record.predecessorDurableAuthorityDigest))
      || !isDigest(record.durableAuthorityDigest)
      || !record.semanticProjection || typeof record.semanticProjection !== 'object'
      || Array.isArray(record.semanticProjection) || nodeTypes.isProxy(record.semanticProjection)) {
      throw new TypeError('Execution effect lifecycle Store authority is invalid');
    }
    const durableBody = Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-store-durable-lifecycle-authority' as const,
      state,
      identity: Object.freeze({ ...this.#identity }),
      admissionReceiptDigest: this.#admissionReceiptDigest,
      policyDigest: this.#policy.policyDigest,
      platform: this.#platform,
      semanticAuthorityDigest: record.semanticAuthorityDigest,
      predecessorDurableAuthorityDigest: record.predecessorDurableAuthorityDigest,
      semanticProjection: Object.freeze({ ...(record.semanticProjection as Record<string, unknown>) }),
      workspaceSnapshotArtifact: workspaceRef,
      baselineManifestArtifact: baselineRef,
      finalManifestArtifact: finalRef,
    });
    const durableAuthority = Object.freeze({
      ...durableBody,
      durableAuthorityDigest: executionEffectPersistenceRawDigest(
        canonicalTaskAttemptCustodyJson(Object.freeze({
          domain: 'execution-effect-store-durable-lifecycle-authority-v1',
          authority: durableBody,
        }), this.#policy.jsonBounds),
      ),
    });
    if (durableAuthority.durableAuthorityDigest !== record.durableAuthorityDigest
      || !sameBytes(verified.bytes,
        canonicalTaskAttemptCustodyJson(durableAuthority, this.#policy.jsonBounds))) {
      throw new TypeError('Execution effect lifecycle Store durable digest mismatch');
    }
    const workspaceArtifact = workspaceRef ? this.#readImmutableArtifact(
      'execution-workspace-snapshot', workspaceRef,
    ) : null;
    const baselineArtifact = baselineRef
      ? this.#readImmutableArtifact('execution-effect-manifest', baselineRef) : null;
    const finalArtifact = finalRef
      ? this.#readImmutableArtifact('execution-effect-manifest', finalRef) : null;
    let workspaceValue: unknown;
    let baselineValue: unknown;
    let finalValue: unknown = null;
    try {
      workspaceValue = workspaceArtifact
        ? JSON.parse(Buffer.from(workspaceArtifact.bytes).toString('utf8')) : null;
      baselineValue = baselineArtifact
        ? JSON.parse(Buffer.from(baselineArtifact.bytes).toString('utf8')) : null;
      finalValue = finalArtifact
        ? JSON.parse(Buffer.from(finalArtifact.bytes).toString('utf8')) : null;
    } catch {
      throw new TypeError('Execution effect lifecycle referenced artifact is invalid');
    }
    const workspace = state === 'ALLOCATING' ? null
      : parseExecutionEffectWorkspaceSnapshotSealV1(workspaceValue);
    const baseline = state === 'ALLOCATING' ? null : parseExecutionEffectManifest(baselineValue);
    const final = finalRef ? parseExecutionEffectManifest(finalValue) : null;
    const projection = { ...(durableBody.semanticProjection as Record<string, unknown>) };
    const baselineDigest = projection.baselineManifestDigest;
    if (state !== 'ALLOCATING') {
      delete projection.baselineManifestDigest;
      projection.baselineManifest = baseline;
    }
    if (state === 'READY_FOR_LANDING') {
      const finalDigest = projection.finalManifestDigest;
      const decisionDigest = projection.containmentDecisionDigest;
      delete projection.finalManifestDigest;
      delete projection.containmentDecisionDigest;
      const decision = baseline && final ? evaluateExecutionEffectContainment({
        baseline: Object.freeze({ ok: true as const, manifest: baseline }),
        final: Object.freeze({ ok: true as const, manifest: final }),
      }) : null;
      if (!final || !decision || decision.state !== 'VERIFIED'
        || final.digest !== finalDigest || decision.decisionDigest !== decisionDigest) {
        throw new TypeError('Execution effect lifecycle final reference mismatch');
      }
      projection.finalManifest = final;
      projection.decision = decision;
    }
    const authority = state === 'ALLOCATING'
      ? parseExecutionEffectDockerLifecycleAuthorityV1(Object.freeze({
        version: 1,
        kind: 'execution-effect-docker-lifecycle-authority',
        ...projection,
        authorityDigest: record.semanticAuthorityDigest,
      }))
      : workspace && baseline && baseline.digest === baselineDigest
      && sameBytes(canonicalTaskAttemptCustodyJson(workspace, this.#policy.jsonBounds),
        canonicalTaskAttemptCustodyJson(
          Reflect.get(projection, 'workspaceSnapshot'), this.#policy.jsonBounds,
        ))
      ? parseExecutionEffectDockerLifecycleAuthorityV1(Object.freeze({
        version: 1,
        kind: 'execution-effect-docker-lifecycle-authority',
        ...projection,
        authorityDigest: record.semanticAuthorityDigest,
      })) : null;
    if (!authority || authority.state !== state || !this.#lifecycleMatchesAdapter(authority)
      || verified.receipt.capturedAt !== this.#lifecycleCapturedAt(authority)) {
      throw new TypeError('Execution effect lifecycle semantic projection is invalid');
    }
    const predecessor = state === 'ALLOCATING' ? null
      : this.#readLifecyclePublication(state === 'PREPARED' ? 'ALLOCATING'
        : state === 'PROVIDER_START_AUTHORIZED' ? 'PREPARED' : 'PROVIDER_START_AUTHORIZED');
    if ((state === 'ALLOCATING' && durableAuthority.predecessorDurableAuthorityDigest !== null)
      || (state !== 'ALLOCATING' && (!predecessor
        || durableAuthority.predecessorDurableAuthorityDigest
          !== predecessor.durableAuthority.durableAuthorityDigest
        || authority.predecessorAuthorityDigest !== predecessor.authority.authorityDigest))) {
      throw new TypeError('Execution effect lifecycle Store predecessor mismatch');
    }
    return Object.freeze({
      authority: authority as Extract<ExecutionEffectDockerLifecycleAuthorityV1, { state: S }>,
      durableAuthority,
      artifact: Object.freeze({
        state,
        artifactKey,
        artifactReceiptDigest: verified.receipt.receiptDigest,
        contentDigest: verified.proof.sha256,
        byteLength: verified.proof.byteLength,
        capturedAt: verified.receipt.capturedAt,
        semanticAuthorityDigest: authority.authorityDigest as Sha256Digest,
        durableAuthorityDigest: durableAuthority.durableAuthorityDigest,
      }),
    });
  }

  readLifecycleAuthority<S extends ExecutionEffectDockerLifecycleAuthorityV1['state']>(
    state: S,
  ): Extract<ExecutionEffectDockerLifecycleAuthorityV1, { state: S }> | null {
    return this.#readLifecyclePublication(state)?.authority ?? null;
  }

  readLatestLifecycleAuthority(): ExecutionEffectDockerLifecycleAuthorityV1 | null {
    const allocating = this.readLifecycleAuthority('ALLOCATING');
    const prepared = this.readLifecycleAuthority('PREPARED');
    const provider = this.readLifecycleAuthority('PROVIDER_START_AUTHORIZED');
    const ready = this.readLifecycleAuthority('READY_FOR_LANDING');
    if (ready) return ready;
    if (provider) return provider;
    return prepared ?? allocating;
  }

  readVerifiedAllocatingLifecycleAuthority(
    input: Readonly<{ readonly semanticAuthorityDigest: Sha256Digest }>,
  ): ReturnType<ExecutionEffectDockerAllocationDurabilityPortV1[
    'readVerifiedAllocatingLifecycleAuthority'
  ]> {
    const record = exactRecord(input, ['semanticAuthorityDigest']);
    if (!record || !isDigest(record.semanticAuthorityDigest)) return null;
    const publication = this.#readLifecyclePublication('ALLOCATING');
    if (!publication || publication.authority.authorityDigest !== record.semanticAuthorityDigest) {
      return null;
    }
    return Object.freeze({
      authority: publication.authority as ExecutionEffectDockerAllocatingLifecycleAuthorityV1,
      artifact: Object.freeze({
        state: 'ALLOCATING' as const,
        artifactKey: publication.artifact.artifactKey,
        artifactReceiptDigest: publication.artifact.artifactReceiptDigest,
        contentDigest: publication.artifact.contentDigest,
        byteLength: publication.artifact.byteLength,
        capturedAt: publication.artifact.capturedAt,
        semanticAuthorityDigest: publication.artifact.semanticAuthorityDigest,
        durableAuthorityDigest: publication.artifact.durableAuthorityDigest,
      }),
    });
  }

  publishStagedContent(input: Readonly<{
    artifactKey: string;
    capturedAt: string;
    bytes: Uint8Array;
  }>): ExecutionEffectStoreStagedArtifactV1 {
    const record = exactRecord(input, ['artifactKey', 'capturedAt', 'bytes']);
    if (record === null || typeof record.artifactKey !== 'string'
      || typeof record.capturedAt !== 'string' || !(record.bytes instanceof Uint8Array)) {
      throw new TypeError('Invalid staged Store artifact');
    }
    const bytes = Uint8Array.from(record.bytes as Uint8Array);
    const receipt = this.#publishBytes({
      artifactClass: 'execution-effect-staged-content',
      artifactKey: record.artifactKey,
      capturedAt: record.capturedAt,
      bytes,
      replayTimestamp: 'exact',
    });
    return Object.freeze({
      artifactKey: receipt.artifactKey,
      artifactReceiptDigest: receipt.receiptDigest,
      contentDigest: receipt.artifact.sha256,
      byteLength: receipt.artifact.byteLength,
    });
  }

  readStagedContent(
    value: ExecutionEffectStoreStagedArtifactV1,
  ): ExecutionEffectStoreStagedContentV1 | null {
    const record = exactRecord(value, [
      'artifactKey', 'artifactReceiptDigest', 'contentDigest', 'byteLength',
    ]);
    if (!record || !SAFE_KEY.test(record.artifactKey as string)
      || !isDigest(record.artifactReceiptDigest) || !isDigest(record.contentDigest)
      || !Number.isSafeInteger(record.byteLength) || (record.byteLength as number) < 0) return null;
    const verified = this.#store.readVerifiedArtifact({
      identity: this.#identity,
      policy: this.#policy,
      artifactClass: 'execution-effect-staged-content',
      artifactKey: record.artifactKey as string,
      receiptDigest: record.artifactReceiptDigest,
    });
    if (!verified || verified.receipt.receiptDigest !== record.artifactReceiptDigest
      || verified.proof.sha256 !== record.contentDigest
      || verified.proof.byteLength !== record.byteLength) return null;
    return Object.freeze({
      artifactKey: record.artifactKey as string,
      artifactReceiptDigest: record.artifactReceiptDigest,
      contentDigest: record.contentDigest,
      byteLength: record.byteLength as number,
      bytes: Uint8Array.from(verified.bytes),
    });
  }

  publishNativeReceiptEvidence(input: Readonly<{
    artifactKey: string;
    capturedAt: string;
    operation: ExecutionEffectPersistenceOperationV1;
    evidence: ExecutionEffectLandingNativeReceiptEvidenceV1;
  }>): ExecutionEffectLandingJournalArtifactRefV1 {
    const record = exactRecord(input, ['artifactKey', 'capturedAt', 'operation', 'evidence']);
    const evidence = record && parseExecutionEffectLandingNativeReceiptEvidenceV1(
      record.evidence,
      record.operation as ExecutionEffectPersistenceOperationV1,
    );
    if (!record || !evidence) throw new TypeError('Invalid native receipt evidence');
    return this.#publishCanonicalEvidence(record.artifactKey as string, record.capturedAt as string, evidence);
  }

  publishFinalReceiptEvidence(input: Readonly<{
    artifactKey: string;
    capturedAt: string;
    transactionDigest: Sha256Digest;
    planDigest: Sha256Digest;
    operations: readonly ExecutionEffectPersistenceOperationV1[];
    nativeReceipts: readonly ExecutionEffectLandingNativeReceiptEvidenceV1[];
    evidence: ExecutionEffectLandingFinalReceiptEvidenceV1;
  }>): ExecutionEffectLandingJournalArtifactRefV1 {
    const record = exactRecord(input, [
      'artifactKey', 'capturedAt', 'transactionDigest', 'planDigest',
      'operations', 'nativeReceipts', 'evidence',
    ]);
    const evidence = record && parseExecutionEffectLandingFinalReceiptEvidenceV1(
      record.evidence,
      record.transactionDigest as Sha256Digest,
      record.planDigest as Sha256Digest,
      record.operations as readonly ExecutionEffectPersistenceOperationV1[],
      record.nativeReceipts as readonly ExecutionEffectLandingNativeReceiptEvidenceV1[],
    );
    if (!record || !evidence) throw new TypeError('Invalid final receipt evidence');
    return this.#publishCanonicalEvidence(record.artifactKey as string, record.capturedAt as string, evidence);
  }

  publishLeaseTerminalReceiptEvidence(input: Readonly<{
    artifactKey: string;
    capturedAt: string;
    evidence: ExecutionEffectLandingLeaseTerminalReceiptEvidenceV1;
  }>): ExecutionEffectLandingJournalArtifactRefV1 {
    const record = exactRecord(input, ['artifactKey', 'capturedAt', 'evidence']);
    const evidence = record
      ? parseExecutionEffectLandingLeaseTerminalReceiptEvidenceV1(record.evidence) : null;
    if (!record || !evidence) throw new TypeError('Invalid lease terminal receipt evidence');
    return this.#publishCanonicalEvidence(record.artifactKey as string, record.capturedAt as string, evidence);
  }

  #publishCanonicalEvidence(
    artifactKey: string,
    capturedAt: string,
    value: unknown,
  ): ExecutionEffectLandingJournalArtifactRefV1 {
    const bytes = canonicalTaskAttemptCustodyJson(value, this.#policy.jsonBounds);
    const receipt = this.#publishBytes({
      artifactClass: 'execution-effect-landing-receipt-evidence',
      artifactKey,
      capturedAt,
      bytes,
      replayTimestamp: 'exact',
    });
    return Object.freeze({
      artifactKey: receipt.artifactKey,
      artifactReceiptDigest: receipt.receiptDigest,
      contentDigest: receipt.artifact.sha256,
      byteLength: receipt.artifact.byteLength,
    });
  }

  #preparedWorkspaceArtifactKeys(): Readonly<{
    workspaceSnapshot: string;
    baselineManifest: string;
  }> {
    const suffix = this.#admissionReceiptDigest.slice('sha256:'.length);
    return Object.freeze({
      workspaceSnapshot: `effect-workspace-${suffix}`,
      baselineManifest: `effect-baseline-${suffix}`,
    });
  }

  #validatePreparedWorkspaceSemantics(
    workspaceValue: unknown,
    baselineValue: unknown,
    baselineCapturedAt: unknown,
  ): Readonly<{
    workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
    baseline: ExecutionEffectManifest;
    baselineCapturedAt: string;
  }> | null {
    const workspaceSnapshot = parseExecutionEffectWorkspaceSnapshotSealV1(workspaceValue);
    const baseline = parseExecutionEffectManifest(baselineValue);
    if (!workspaceSnapshot || !baseline || !isTimestamp(baselineCapturedAt)
      || !sameAttempt(this.#identity, workspaceSnapshot.attempt)
      || workspaceSnapshot.admissionReceiptDigest !== this.#admissionReceiptDigest
      || workspaceSnapshot.custodyPolicyDigest !== this.#policy.policyDigest
      || workspaceSnapshot.platform !== this.#platform
      || !sameAttempt(this.#identity, workspaceSnapshot.dependencyResource.attempt)
      || workspaceSnapshot.dependencyResource.admissionReceiptDigest
        !== this.#admissionReceiptDigest
      || workspaceSnapshot.dependencyResource.custodyPolicyDigest !== this.#policy.policyDigest
      || baseline.phase !== 'baseline'
      || !sameAttempt(this.#identity, baseline.attempt)
      || baseline.attemptDigest !== workspaceSnapshot.attemptDigest
      || baseline.captureAuthority.platform !== this.#platform
      || baseline.policy.digest !== workspaceSnapshot.writePolicyDigest
      || baseline.workspaceIdentity.filesystemId
        !== workspaceSnapshot.workspaceIdentity.filesystemId
      || baseline.workspaceIdentity.directoryId
        !== workspaceSnapshot.workspaceIdentity.directoryId
      || baseline.workspaceIdentity.rootHandleEvidenceDigest
        !== workspaceSnapshot.workspaceIdentity.rootHandleEvidenceDigest
      || workspaceSnapshot.workspaceResource.baselineManifestDigest !== baseline.digest
      || baselineCapturedAt !== baseline.captureAuthority.completedAt
      || Date.parse(workspaceSnapshot.dependencyResource.readyAt)
        > Date.parse(workspaceSnapshot.sealedAt)
      || Date.parse(baselineCapturedAt) > Date.parse(workspaceSnapshot.sealedAt)) return null;
    return Object.freeze({ workspaceSnapshot, baseline, baselineCapturedAt });
  }

  #createPreparedWorkspaceAuthority(input: Readonly<{
    workspaceSnapshot: ExecutionEffectWorkspaceSnapshotSealV1;
    baseline: ExecutionEffectManifest;
    baselineCapturedAt: string;
    workspaceSnapshotReceipt: TaskAttemptCustodyArtifactReceiptV2;
    baselineManifestReceipt: TaskAttemptCustodyArtifactReceiptV2;
  }>): ExecutionEffectStorePreparedWorkspaceAuthorityV1 {
    const lifecycle = this.#readLifecyclePublication('PREPARED');
    if (!lifecycle || lifecycle.authority.workspaceSnapshot.sealDigest
      !== input.workspaceSnapshot.sealDigest
      || lifecycle.authority.baselineManifest.digest !== input.baseline.digest) {
      throw new TypeError('Execution effect prepared lifecycle binding mismatch');
    }
    const body = Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-store-prepared-workspace' as const,
      state: 'DURABLE' as const,
      identity: Object.freeze({ ...this.#identity }),
      admissionReceiptDigest: this.#admissionReceiptDigest,
      policyDigest: this.#policy.policyDigest,
      platform: this.#platform,
      attemptDigest: input.workspaceSnapshot.attemptDigest as Sha256Digest,
      workspaceSnapshotSealDigest: input.workspaceSnapshot.sealDigest as Sha256Digest,
      baselineManifestDigest: input.baseline.digest as Sha256Digest,
      workspaceSealedAt: input.workspaceSnapshot.sealedAt,
      baselineCapturedAt: input.baselineCapturedAt,
      workspaceSnapshotArtifact: this.#artifactRef(input.workspaceSnapshotReceipt),
      baselineManifestArtifact: this.#artifactRef(input.baselineManifestReceipt),
      lifecyclePreparedAuthorityDigest: lifecycle.authority.authorityDigest as Sha256Digest,
      lifecyclePreparedArtifact: lifecycle.artifact,
    });
    return Object.freeze({
      ...body,
      authorityDigest: executionEffectPersistenceRawDigest(
        canonicalTaskAttemptCustodyJson(Object.freeze({
          domain: 'execution-effect-store-prepared-workspace-authority-v1',
          authority: body,
        }), this.#policy.jsonBounds),
      ),
    });
  }

  #parsePreparedWorkspaceAuthority(
    value: unknown,
  ): ExecutionEffectStorePreparedWorkspaceAuthorityV1 | null {
    const record = exactRecord(value, [
      'version', 'kind', 'state', 'identity', 'admissionReceiptDigest', 'policyDigest',
      'platform', 'attemptDigest', 'workspaceSnapshotSealDigest', 'baselineManifestDigest',
      'workspaceSealedAt', 'baselineCapturedAt', 'workspaceSnapshotArtifact',
      'baselineManifestArtifact', 'lifecyclePreparedAuthorityDigest',
      'lifecyclePreparedArtifact', 'authorityDigest',
    ]);
    const identity = exactRecord(record?.identity, [
      'schemaVersion', 'backend', 'projectRootSha256', 'projectId', 'taskId',
      'attemptId', 'generation',
    ]);
    const workspaceRef = exactRecord(record?.workspaceSnapshotArtifact, [
      'artifactKey', 'artifactReceiptDigest',
    ]);
    const baselineRef = exactRecord(record?.baselineManifestArtifact, [
      'artifactKey', 'artifactReceiptDigest',
    ]);
    const lifecycleRef = exactRecord(record?.lifecyclePreparedArtifact, [
        'state', 'artifactKey', 'artifactReceiptDigest', 'contentDigest', 'byteLength',
        'capturedAt', 'semanticAuthorityDigest', 'durableAuthorityDigest',
      ]);
    if (record === null || identity === null || workspaceRef === null || baselineRef === null
      || record.version !== 1 || record.kind !== 'execution-effect-store-prepared-workspace'
      || record.state !== 'DURABLE' || record.platform !== this.#platform
      || !sameBytes(
        canonicalTaskAttemptCustodyJson(identity, this.#policy.jsonBounds),
        canonicalTaskAttemptCustodyJson(this.#identity, this.#policy.jsonBounds),
      )
      || record.admissionReceiptDigest !== this.#admissionReceiptDigest
      || record.policyDigest !== this.#policy.policyDigest
      || !isDigest(record.attemptDigest) || !isDigest(record.workspaceSnapshotSealDigest)
      || !isDigest(record.baselineManifestDigest) || !isTimestamp(record.workspaceSealedAt)
      || !isTimestamp(record.baselineCapturedAt) || !SAFE_KEY.test(workspaceRef.artifactKey as string)
      || !SAFE_KEY.test(baselineRef.artifactKey as string)
      || !isDigest(workspaceRef.artifactReceiptDigest)
      || !isDigest(baselineRef.artifactReceiptDigest)
      || !lifecycleRef || !isDigest(record.lifecyclePreparedAuthorityDigest)
      || lifecycleRef.state !== 'PREPARED'
      || lifecycleRef.semanticAuthorityDigest !== record.lifecyclePreparedAuthorityDigest
      || !isDigest(record.authorityDigest)) {
      return null;
    }
    const body = Object.freeze({
      version: 1 as const,
      kind: 'execution-effect-store-prepared-workspace' as const,
      state: 'DURABLE' as const,
      identity: Object.freeze({ ...this.#identity }),
      admissionReceiptDigest: this.#admissionReceiptDigest,
      policyDigest: this.#policy.policyDigest,
      platform: this.#platform,
      attemptDigest: record.attemptDigest,
      workspaceSnapshotSealDigest: record.workspaceSnapshotSealDigest,
      baselineManifestDigest: record.baselineManifestDigest,
      workspaceSealedAt: record.workspaceSealedAt,
      baselineCapturedAt: record.baselineCapturedAt,
      workspaceSnapshotArtifact: Object.freeze({
        artifactKey: workspaceRef.artifactKey,
        artifactReceiptDigest: workspaceRef.artifactReceiptDigest,
      }),
      baselineManifestArtifact: Object.freeze({
        artifactKey: baselineRef.artifactKey,
        artifactReceiptDigest: baselineRef.artifactReceiptDigest,
      }),
      lifecyclePreparedAuthorityDigest: record.lifecyclePreparedAuthorityDigest,
      lifecyclePreparedArtifact: Object.freeze({
        state: 'PREPARED' as const,
        artifactKey: lifecycleRef.artifactKey as string,
        artifactReceiptDigest: lifecycleRef.artifactReceiptDigest as Sha256Digest,
        contentDigest: lifecycleRef.contentDigest as Sha256Digest,
        byteLength: lifecycleRef.byteLength as number,
        capturedAt: lifecycleRef.capturedAt as string,
        semanticAuthorityDigest: lifecycleRef.semanticAuthorityDigest as Sha256Digest,
        durableAuthorityDigest: lifecycleRef.durableAuthorityDigest as Sha256Digest,
      }),
    }) as Omit<ExecutionEffectStorePreparedWorkspaceAuthorityV1, 'authorityDigest'>;
    const authorityDigest = executionEffectPersistenceRawDigest(
      canonicalTaskAttemptCustodyJson(Object.freeze({
        domain: 'execution-effect-store-prepared-workspace-authority-v1',
        authority: body,
      }), this.#policy.jsonBounds),
    );
    return authorityDigest === record.authorityDigest
      ? Object.freeze({ ...body, authorityDigest }) : null;
  }

  #readPreparedWorkspaceBundle(): ExecutionEffectStorePreparedWorkspaceBundleV1 | null {
    const keys = this.#preparedWorkspaceArtifactKeys();
    const workspaceArtifact = this.#readArtifact(
      'execution-workspace-snapshot', keys.workspaceSnapshot,
    );
    const baselineArtifact = this.#readArtifact(
      'execution-effect-manifest', keys.baselineManifest,
    );
    if (workspaceArtifact === null && baselineArtifact === null) return null;
    if (workspaceArtifact === null || baselineArtifact === null) {
      throw new TypeError('Execution effect prepared workspace publication is incomplete');
    }
    let workspaceValue: unknown;
    let baselineValue: unknown;
    try {
      workspaceValue = JSON.parse(Buffer.from(workspaceArtifact.bytes).toString('utf8'));
      baselineValue = JSON.parse(Buffer.from(baselineArtifact.bytes).toString('utf8'));
    } catch {
      throw new TypeError('Execution effect prepared workspace artifact is invalid');
    }
    const semantic = this.#validatePreparedWorkspaceSemantics(
      workspaceValue,
      baselineValue,
      baselineArtifact.receipt.capturedAt,
    );
    if (semantic === null
      || workspaceArtifact.receipt.capturedAt !== semantic.workspaceSnapshot.sealedAt
      || !sameBytes(workspaceArtifact.bytes, canonicalTaskAttemptCustodyJson(
        semantic.workspaceSnapshot, this.#policy.jsonBounds,
      ))
      || !sameBytes(baselineArtifact.bytes, canonicalTaskAttemptCustodyJson(
        semantic.baseline, this.#policy.jsonBounds,
      ))) {
      throw new TypeError('Execution effect prepared workspace authority is invalid');
    }
    const authority = this.#createPreparedWorkspaceAuthority({
      ...semantic,
      workspaceSnapshotReceipt: workspaceArtifact.receipt,
      baselineManifestReceipt: baselineArtifact.receipt,
    });
    return Object.freeze({
      authority,
      workspaceSnapshot: semantic.workspaceSnapshot,
      baseline: semantic.baseline,
    });
  }

  publishPreparedWorkspace(
    input: PublishExecutionEffectStorePreparedWorkspaceV1Input,
  ): ExecutionEffectStorePreparedWorkspaceAuthorityV1 {
    const record = exactRecord(input, [
      'workspaceSnapshot', 'baseline', 'baselineCapturedAt', 'lifecycleAuthority',
    ]);
    const semantic = record && this.#validatePreparedWorkspaceSemantics(
      record.workspaceSnapshot,
      record.baseline,
      record.baselineCapturedAt,
    );
    if (!record || !semantic) {
      throw new TypeError('Invalid execution effect prepared workspace publication');
    }
    const lifecycle = parseExecutionEffectDockerLifecycleAuthorityV1(record.lifecycleAuthority);
    if (lifecycle?.state !== 'PREPARED'
      || lifecycle.workspaceSnapshot.sealDigest !== semantic.workspaceSnapshot.sealDigest
      || lifecycle.baselineManifest.digest !== semantic.baseline.digest) {
      throw new TypeError('Invalid execution effect prepared lifecycle publication');
    }
    this.publishLifecycleAuthority(lifecycle);
    const keys = this.#preparedWorkspaceArtifactKeys();
    const workspaceSnapshotReceipt = this.#publishCanonical(
      'execution-workspace-snapshot', keys.workspaceSnapshot,
      semantic.workspaceSnapshot.sealedAt, semantic.workspaceSnapshot,
    );
    const baselineManifestReceipt = this.#publishCanonical(
      'execution-effect-manifest', keys.baselineManifest,
      semantic.baselineCapturedAt, semantic.baseline,
    );
    const expected = this.#createPreparedWorkspaceAuthority({
      ...semantic,
      workspaceSnapshotReceipt,
      baselineManifestReceipt,
    });
    const durable = this.#readPreparedWorkspaceBundle();
    if (durable === null || !sameBytes(
      canonicalTaskAttemptCustodyJson(durable.authority, this.#policy.jsonBounds),
      canonicalTaskAttemptCustodyJson(expected, this.#policy.jsonBounds),
    )) {
      throw new TypeError('Execution effect prepared workspace durable reread mismatch');
    }
    return durable.authority;
  }

  readPreparedWorkspace(): ExecutionEffectStorePreparedWorkspaceAuthorityV1 | null {
    return this.#readPreparedWorkspaceBundle()?.authority ?? null;
  }

  publishLanding(input: PublishExecutionEffectStoreLandingV1Input): ExecutionEffectStoreLandingPublicationV1 {
    const record = exactRecord(input, [
      'preparedWorkspace', 'final', 'finalCapturedAt',
      'terminalSeal', 'workspaceRelease', 'landingArtifactKey',
    ]);
    const preparedAuthority = record
      ? this.#parsePreparedWorkspaceAuthority(record.preparedWorkspace) : null;
    const preparedBundle = preparedAuthority ? this.#readPreparedWorkspaceBundle() : null;
    const workspace = preparedBundle?.workspaceSnapshot ?? null;
    const baseline = preparedBundle?.baseline ?? null;
    const final = record && parseExecutionEffectManifest(record.final);
    const terminal = workspace && record && parseExecutionEffectLandingTerminalSealV1(
      record.terminalSeal,
      { attempt: workspace.attempt, attemptDigest: workspace.attemptDigest },
    );
    const release = record && parseExecutionEffectWorkspaceReleaseV1(record.workspaceRelease);
    const preparedLifecycle = this.#readLifecyclePublication('PREPARED');
    const ready = this.#readLifecyclePublication('READY_FOR_LANDING');
    const releaseProgress = this.readLatestReleaseProgress();
    const recoveryAnchor = this.#readLandingRecoveryAnchor();
    const releaseOutcomes = releaseProgress?.state === 'RELEASED'
      ? this.readReleaseOutcomes() : null;
    if (!record || !preparedAuthority || !preparedBundle || !workspace || !baseline
      || !final || !terminal || !release || !preparedLifecycle || !ready || !recoveryAnchor
      || releaseProgress?.state !== 'RELEASED' || !releaseOutcomes
      || !this.#workspaceReleaseMatchesCleanupOutcomes(release, releaseOutcomes)
      || releaseProgress.lifecycleAuthorityDigest !== ready.authority.authorityDigest
      || releaseProgress.landingRecoveryAnchorDigest !== recoveryAnchor.anchorDigest
      || recoveryAnchor.transactionDigest !== terminal.transactionDigest
      || preparedAuthority.lifecyclePreparedAuthorityDigest
        !== preparedLifecycle.authority.authorityDigest
      || ready.authority.workspaceSnapshot.sealDigest !== workspace.sealDigest
      || ready.authority.baselineManifest.digest !== baseline.digest
      || ready.authority.finalManifest.digest !== final.digest
      || ready.authority.decision.decisionDigest !== terminal.effectDecisionDigest
      || ready.authority.providerStopped.containerName !== release.providerContainer.containerName
      || ready.authority.workspacePlan.volumeName !== release.workspaceVolume.volumeName
      || ready.authority.dependencyAuthority.volumeName !== release.dependencyVolume.volumeName
      || ready.authority.dependencyAuthority.volumeIdentityDigest
        !== release.dependencyVolume.volumeIdentityDigest
      || !sameBytes(
        canonicalTaskAttemptCustodyJson(preparedAuthority, this.#policy.jsonBounds),
        canonicalTaskAttemptCustodyJson(preparedBundle.authority, this.#policy.jsonBounds),
      )
      || !sameAttempt(this.#identity, workspace.attempt)
      || workspace.admissionReceiptDigest !== this.#admissionReceiptDigest
      || workspace.custodyPolicyDigest !== this.#policy.policyDigest
      || workspace.platform !== this.#platform
      || baseline.phase !== 'baseline' || final.phase !== 'final'
      || baseline.attemptDigest !== workspace.attemptDigest
      || final.attemptDigest !== workspace.attemptDigest
      || baseline.captureAuthority.platform !== this.#platform
      || final.captureAuthority.platform !== this.#platform
      || baseline.policy.digest !== workspace.writePolicyDigest
      || final.policy.digest !== workspace.writePolicyDigest
      || baseline.workspaceIdentity.filesystemId !== workspace.workspaceIdentity.filesystemId
      || baseline.workspaceIdentity.directoryId !== workspace.workspaceIdentity.directoryId
      || baseline.workspaceIdentity.rootHandleEvidenceDigest
        !== workspace.workspaceIdentity.rootHandleEvidenceDigest
      || final.workspaceIdentity.filesystemId !== workspace.workspaceIdentity.filesystemId
      || final.workspaceIdentity.directoryId !== workspace.workspaceIdentity.directoryId
      || final.workspaceIdentity.rootHandleEvidenceDigest
        !== workspace.workspaceIdentity.rootHandleEvidenceDigest
      || workspace.workspaceResource.baselineManifestDigest !== baseline.digest
      || terminal.workspaceSnapshotSealDigest !== workspace.sealDigest
      || terminal.baselineManifestDigest !== baseline.digest
      || terminal.finalManifestDigest !== final.digest
      || release.workspaceSnapshotSealDigest !== workspace.sealDigest
      || !sameAttempt(this.#identity, release.attempt)
      || release.attemptDigest !== workspace.attemptDigest
      || release.admissionReceiptDigest !== this.#admissionReceiptDigest
      || release.custodyPolicyDigest !== this.#policy.policyDigest
      || release.workspaceResourceDigest !== workspace.workspaceResource.resourceDigest
      || release.workspaceVolume.volumeName !== workspace.workspaceResource.volumeName
      || release.workspaceVolume.volumeNameDigest
        !== workspace.workspaceResource.volumeNameDigest
      || release.dependencyResourceDigest !== workspace.dependencyResource.resourceDigest
      || release.dependencyVolume.volumeName !== workspace.dependencyResource.volumeName
      || release.dependencyVolume.volumeNameDigest
        !== workspace.dependencyResource.volumeNameDigest
      || release.dependencyVolume.volumeIdentityDigest
        !== workspace.dependencyResource.volumeIdentityDigest
      || release.transactionDigest !== terminal.transactionDigest
      || release.committedJournalDigest !== terminal.committedJournalDigest
      || !isTimestamp(record.finalCapturedAt)
      || typeof record.landingArtifactKey !== 'string' || !SAFE_KEY.test(record.landingArtifactKey)
      || Date.parse(preparedAuthority.baselineCapturedAt) > Date.parse(record.finalCapturedAt)
      || Date.parse(record.finalCapturedAt) > Date.parse(terminal.committedAt)
      || Date.parse(terminal.committedAt) > Date.parse(release.releasedAt)) {
      throw new TypeError('Invalid execution effect Store landing publication');
    }
    const finalReceipt = this.#publishCanonical(
      'execution-effect-manifest', `effect-final-${workspace.attemptDigest.slice(7)}`,
      record.finalCapturedAt, final,
    );
    const terminalReceipt = this.#publishCanonical(
      'execution-effect-landing-journal', `effect-terminal-${terminal.transactionDigest.slice(7)}`,
      terminal.committedAt, terminal,
    );
    const releaseReceipt = this.#publishCanonical(
      'execution-workspace-release', `effect-release-${terminal.transactionDigest.slice(7)}`,
      release.releasedAt, release,
    );
    const stagedContents = this.#verifiedStagedReferences(terminal);
    const semanticReceipt = createTaskAttemptCustodyEffectLandingReceiptV2({
      identity: this.#identity,
      admissionReceiptDigest: this.#admissionReceiptDigest,
      policyDigest: this.#policy.policyDigest,
      disposition: terminal.disposition,
      workspaceSnapshot: preparedAuthority.workspaceSnapshotArtifact,
      baselineManifest: preparedAuthority.baselineManifestArtifact,
      finalManifest: this.#artifactRef(finalReceipt),
      stagedContents,
      landingJournal: this.#artifactRef(terminalReceipt),
      workspaceRelease: this.#artifactRef(releaseReceipt),
      effectDecisionDigest: terminal.effectDecisionDigest,
      transactionDigest: terminal.transactionDigest,
      committedAt: terminal.committedAt,
      releasedAt: release.releasedAt,
    }, this.#policy);
    const landingArtifactReceipt = this.#publishBytes({
      artifactClass: 'execution-effect-landing-receipt',
      artifactKey: record.landingArtifactKey,
      capturedAt: release.releasedAt,
      bytes: canonicalTaskAttemptCustodyJson(semanticReceipt, this.#policy.jsonBounds),
      replayTimestamp: 'exact',
    });
    this.#store.appendChain({
      identity: this.#identity,
      policy: this.#policy,
      admissionReceiptDigest: this.#admissionReceiptDigest,
      stage: 'effect-landing',
      occurredAt: release.releasedAt,
      predecessorDigest: this.#admissionReceiptDigest,
      artifactReceipt: landingArtifactReceipt,
    });
    return Object.freeze({
      landingArtifactReceipt,
      ...this.readAcceptedAuthority(record.landingArtifactKey),
    });
  }

  #publishCanonical(
    artifactClass: Exclude<HostArtifactClass, 'task-admission-snapshot'>,
    artifactKey: string,
    capturedAt: string,
    value: unknown,
  ): TaskAttemptCustodyArtifactReceiptV2 {
    return this.#publishBytes({
      artifactClass,
      artifactKey,
      capturedAt,
      bytes: canonicalTaskAttemptCustodyJson(value, this.#policy.jsonBounds),
      replayTimestamp: 'exact',
    });
  }

  #artifactRef(receipt: TaskAttemptCustodyArtifactReceiptV2): TaskAttemptCustodyEffectArtifactRefV2 {
    return Object.freeze({
      artifactKey: receipt.artifactKey,
      artifactReceiptDigest: receipt.receiptDigest,
    });
  }

  #verifiedStagedReferences(
    terminal: ExecutionEffectLandingTerminalSealV1,
  ): readonly TaskAttemptCustodyEffectArtifactRefV2[] {
    const refs = new Map<string, TaskAttemptCustodyEffectArtifactRefV2>();
    for (const operation of terminal.operations) {
      for (const chunk of operation.stagedSource?.chunks ?? []) {
        const verified = this.#readArtifact('execution-effect-staged-content', chunk.artifactKey);
        if (verified === null || verified.receipt.receiptDigest !== chunk.artifactReceiptDigest
          || verified.proof.sha256 !== chunk.contentDigest
          || verified.proof.byteLength !== chunk.byteLength || refs.has(chunk.artifactKey)) {
          throw new TypeError('Execution effect staged Store reference mismatch');
        }
        refs.set(chunk.artifactKey, Object.freeze({
          artifactKey: chunk.artifactKey,
          artifactReceiptDigest: verified.receipt.receiptDigest,
        }));
      }
    }
    return Object.freeze([...refs.values()].sort((left, right) => (
      left.artifactKey < right.artifactKey ? -1 : left.artifactKey > right.artifactKey ? 1 : 0
    )));
  }

  readAcceptedAuthority(landingArtifactKey: string): ExecutionEffectStoreAcceptedAuthorityV1 {
    if (!SAFE_KEY.test(landingArtifactKey)) {
      throw new TypeError('Invalid execution effect landing artifact key');
    }
    const verifiedLanding = this.#store.readVerifiedEffectLanding({
      identity: this.#identity,
      policy: this.#policy,
      artifactKey: landingArtifactKey,
    });
    const landingArtifact = this.#store.readArtifactReceipt({
      identity: this.#identity,
      policy: this.#policy,
      artifactClass: 'execution-effect-landing-receipt',
      artifactKey: landingArtifactKey,
    });
    const effectLandingChain = this.#store.readChain(
      this.#identity,
      this.#policy,
      'effect-landing',
    );
    const ready = this.#readLifecyclePublication('READY_FOR_LANDING');
    const releaseProgress = this.readLatestReleaseProgress();
    const recoveryAnchor = this.#readLandingRecoveryAnchor();
    const releaseOutcomes = releaseProgress?.state === 'RELEASED'
      ? this.readReleaseOutcomes() : null;
    if (verifiedLanding === null || landingArtifact === null || effectLandingChain === null
      || !ready || !recoveryAnchor || releaseProgress?.state !== 'RELEASED' || !releaseOutcomes
      || !this.#workspaceReleaseMatchesCleanupOutcomes(
        verifiedLanding.workspaceRelease, releaseOutcomes,
      )
      || releaseProgress.lifecycleAuthorityDigest !== ready.authority.authorityDigest
      || releaseProgress.landingRecoveryAnchorDigest !== recoveryAnchor.anchorDigest
      || recoveryAnchor.transactionDigest !== verifiedLanding.landing.transactionDigest
      || verifiedLanding.verifiedBundle.workspace.sealDigest
        !== ready.authority.workspaceSnapshot.sealDigest
      || verifiedLanding.verifiedBundle.baseline.digest !== ready.authority.baselineManifest.digest
      || verifiedLanding.verifiedBundle.final.digest !== ready.authority.finalManifest.digest
      || verifiedLanding.verifiedBundle.decision.decisionDigest
        !== ready.authority.decision.decisionDigest
      || verifiedLanding.workspaceRelease.providerContainer.containerName
        !== ready.authority.providerStopped.containerName
      || verifiedLanding.workspaceRelease.workspaceVolume.volumeName
        !== ready.authority.workspacePlan.volumeName
      || verifiedLanding.workspaceRelease.dependencyVolume.volumeIdentityDigest
        !== ready.authority.dependencyAuthority.volumeIdentityDigest
      || effectLandingChain.artifactKey !== landingArtifactKey
      || effectLandingChain.artifactReceiptDigest !== landingArtifact.receiptDigest
      || effectLandingChain.predecessorDigest !== this.#admissionReceiptDigest
      || effectLandingChain.occurredAt !== verifiedLanding.landing.releasedAt
      || (verifiedLanding.landing.disposition !== 'COMMITTED'
        && verifiedLanding.landing.disposition !== 'COMMITTED_NO_CHANGE')) {
      throw new TypeError('Verified execution effect landing authority is unavailable');
    }
    const projection = projectVerifiedExecutionEffectResultV1(verifiedLanding.verifiedBundle);
    if (projection === null || projection.disposition !== verifiedLanding.landing.disposition) {
      throw new TypeError('Execution effect result projection is unavailable');
    }
    const binding = createTaskAttemptEffectLandingBindingV2({
      identity: {
        projectId: this.#identity.projectId,
        taskId: this.#identity.taskId,
        attemptId: this.#identity.attemptId,
        generation: this.#identity.generation,
      },
      admissionReceiptDigest: this.#admissionReceiptDigest,
      custodyPolicyDigest: this.#policy.policyDigest,
      landingArtifactKey,
      landingArtifactReceiptDigest: landingArtifact.receiptDigest,
      landingReceiptDigest: verifiedLanding.landing.receiptDigest,
      effectLandingChainDigest: effectLandingChain.receiptDigest,
      readyLifecycleAuthorityDigest: ready.authority.authorityDigest as Sha256Digest,
      disposition: verifiedLanding.landing.disposition,
      effectDecisionDigest: verifiedLanding.landing.effectDecisionDigest,
      transactionDigest: verifiedLanding.landing.transactionDigest,
    });
    return Object.freeze({
      verifiedLanding,
      effectLandingChain,
      projection,
      binding,
      lineCountAuthority: Object.freeze({
        state: 'UNAVAILABLE' as const,
        code: 'LINE_COUNTS_NOT_CAPTURED_BY_EFFECT_MANIFEST_V1' as const,
      }),
    });
  }
}

export function createExecutionEffectStoreAdapterV1(
  input: CreateExecutionEffectStoreAdapterV1Input,
): ExecutionEffectStoreAdapterV1 {
  return new ExecutionEffectStoreAdapterV1(input);
}

export function createExecutionEffectLifecycleStoreAdmissionAdapterV1(
  input: CreateExecutionEffectLifecycleStoreAdmissionAdapterV1Input,
): ExecutionEffectStoreAdapterV1 {
  return new ExecutionEffectStoreAdapterV1(input);
}
