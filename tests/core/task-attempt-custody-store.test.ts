import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  TASK_ATTEMPT_CUSTODY_ATTEMPT_OUTPUT_ARTIFACT_CLASSES,
  TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES,
  TASK_ATTEMPT_CUSTODY_CHAIN_STAGES,
  TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES,
  TASK_ATTEMPT_CUSTODY_HOST_AUTHORITY_ARTIFACT_CLASSES,
  TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
  TaskAttemptCustodyHold,
  TaskAttemptCustodyStore,
  canonicalTaskAttemptCustodyJson,
  createTaskAttemptCustodyAdapterAbortResult,
  createTaskAttemptCustodyAdapterAppendResult,
  createTaskAttemptCustodyBackendMountTransferReceipt,
  createTaskAttemptCustodyDirectoryScanReceiptV2,
  createTaskAttemptCustodyEffectLandingReceiptV2,
  createTaskAttemptCustodyPolicy,
  parseTaskAttemptCustodyAdmissionV2,
  parseTaskAttemptCustodyArtifactReceiptV2,
  parseTaskAttemptCustodyEffectLandingReceiptV2,
  parseTaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2,
  parseTaskAttemptCustodyHistoricalV1Sentinel,
  taskAttemptCustodyDigest,
  taskAttemptCustodyRelativePath,
  verifyTaskAttemptCustodyHistoricalV1Sentinel,
  type Sha256Digest,
  type TaskAttemptCustodyAdapter,
  type TaskAttemptCustodyAdapterAbortResult,
  type TaskAttemptCustodyAdapterAppendResult,
  type TaskAttemptCustodyAdapterBeginPublicationResult,
  type TaskAttemptCustodyAdapterPublicationToken,
  type TaskAttemptCustodyAdapterSealResult,
  type TaskAttemptCustodyArtifactClass,
  type TaskAttemptCustodyArtifactLimit,
  type TaskAttemptCustodyBackendMountCapability,
  type TaskAttemptCustodyBackendMountTransferReceipt,
  type TaskAttemptCustodyDirectoryProof,
  type TaskAttemptCustodyDirectoryScanReceiptV2,
  type TaskAttemptCustodyDispatchAdmissionRefV2,
  type TaskAttemptCustodyDispatchNoEffectObservationV2,
  type TaskAttemptCustodyDurableEffectMarker,
  type TaskAttemptCustodyDurableEffectPublication,
  type TaskAttemptCustodyFileProof,
  type TaskAttemptCustodyIdentityV2,
  type TaskAttemptCustodyPathCapability,
  type TaskAttemptCustodyPathCapabilityAccess,
  type TaskAttemptCustodyPolicyV2,
  type TaskAttemptCustodyPublication,
  type TaskAttemptCustodyRead,
  type TaskAttemptCustodyRelativePath,
  type TaskAttemptCustodyRootProof,
  type TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2,
  type TaskAttemptCustodyVerifiedHistoricalV1Sentinel,
} from '../../src/core/task-attempt-custody-store.js';
import {
  createExecutionEffectLandingTerminalSealV1,
  createExecutionEffectLandingLeaseTerminalReceiptEvidenceV1,
  createExecutionEffectDependencyResourceV1,
  createExecutionEffectWorkspaceResourceV1,
  createExecutionEffectWorkspaceReleaseV1,
  createExecutionEffectWorkspaceSnapshotSealV1,
  executionEffectLandingDeterministicBoundaryIdV1,
  createTaskAttemptEffectLandingBindingV2,
  verifyExecutionEffectPersistenceBundleV1,
} from '../../src/core/execution-effect-persistence-contract.js';
import {
  evaluateExecutionEffectContainment,
  parseExecutionEffectManifest,
  type ExecutionEffectManifest,
} from '../../src/core/execution-effect-containment.js';
import { compileExecutionEffectWritePolicy } from '../../src/core/execution-write-scope-policy.js';

function sha256(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function repeatedDigest(character: string): Sha256Digest {
  return `sha256:${character.repeat(64)}`;
}

function domainDigest(domain: string, value: unknown): Sha256Digest {
  const canonical = (candidate: unknown): string => {
    if (Array.isArray(candidate)) return `[${candidate.map(canonical).join(',')}]`;
    if (candidate !== null && typeof candidate === 'object') {
      return `{${Object.entries(candidate as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
    }
    return JSON.stringify(candidate);
  };
  return `sha256:${createHash('sha256').update(domain).update('\0').update(canonical(value)).digest('hex')}`;
}

function mountBackendEvidence(
  state: TaskAttemptCustodyBackendMountTransferReceipt['state'],
): Pick<
  TaskAttemptCustodyBackendMountTransferReceipt,
  | 'backend'
  | 'backendExecutionId'
  | 'backendImageDigest'
  | 'backendAuthorityLabelDigest'
  | 'taskSnapshotMountEvidenceDigest'
  | 'workerOutputMountEvidenceDigest'
  | 'backendBootstrapProbeEvidenceDigest'
  | 'daemonMountReceiptDigest'
  | 'cleanupEvidenceDigest'
> {
  return {
    backend: 'docker',
    backendExecutionId: state === 'CONSUMED' ? 'a'.repeat(64) : null,
    backendImageDigest: state === 'CONSUMED' ? repeatedDigest('b') : null,
    backendAuthorityLabelDigest: state === 'CONSUMED' ? repeatedDigest('c') : null,
    taskSnapshotMountEvidenceDigest: state === 'CONSUMED' ? repeatedDigest('d') : null,
    workerOutputMountEvidenceDigest: state === 'CONSUMED' ? repeatedDigest('e') : null,
    backendBootstrapProbeEvidenceDigest: state === 'CONSUMED' ? repeatedDigest('f') : null,
    daemonMountReceiptDigest: state === 'CONSUMED' ? repeatedDigest('0') : null,
    cleanupEvidenceDigest: state === 'CONSUMED' ? null : repeatedDigest('9'),
  };
}

const CANONICAL_PROJECT_ROOT = '/test/project';
const PROJECT_ROOT_SHA256 = createHash('sha256').update(CANONICAL_PROJECT_ROOT).digest('hex');

const ROOT_PROOF: TaskAttemptCustodyRootProof = Object.freeze({
  platform: 'posix',
  projectId: 'project-1',
  canonicalProjectRootSha256: PROJECT_ROOT_SHA256,
  rootId: `sha256:${'1'.repeat(64)}`,
  volumeId: 'test-volume',
  directoryId: 'test-directory',
  capabilityEvidenceDigest: `sha256:${'2'.repeat(64)}`,
});

interface MemoryFile {
  bytes: Uint8Array;
  proof: TaskAttemptCustodyFileProof;
}

interface MemoryCustodyState {
  readonly directories: Map<string, TaskAttemptCustodyDirectoryProof>;
  readonly files: Map<string, MemoryFile>;
  readonly effectMarkers: Map<string, TaskAttemptCustodyDurableEffectMarker>;
}

function memoryCustodyState(): MemoryCustodyState {
  return {
    directories: new Map(),
    files: new Map(),
    effectMarkers: new Map(),
  };
}

interface MemoryPublicationSession {
  readonly root: TaskAttemptCustodyRootProof;
  readonly relativePath: TaskAttemptCustodyRelativePath;
  readonly policy: TaskAttemptCustodyArtifactLimit;
  readonly chunks: Uint8Array[];
  terminal: boolean;
}

/** Test-only adapter: it exercises the production kernel without claiming native FS proof. */
class InMemoryCustodyAdapter implements TaskAttemptCustodyAdapter {
  readonly platform = 'posix' as const;
  readonly directories: Map<string, TaskAttemptCustodyDirectoryProof>;
  readonly files: Map<string, MemoryFile>;
  readonly effectMarkers: Map<string, TaskAttemptCustodyDurableEffectMarker>;
  readonly capabilityPaths = new WeakMap<object, TaskAttemptCustodyRelativePath>();
  readonly backendMountCapabilities = new WeakMap<object, {
    readonly taskSnapshot: TaskAttemptCustodyPathCapability;
    readonly workerOutput: TaskAttemptCustodyPathCapability;
  }>();
  readonly publicationSessions = new WeakMap<object, MemoryPublicationSession>();
  substituteReadbackProof = false;
  malformedNextDirectoryProof = false;
  mutateNextPublishedBytes = false;
  mutateNextAppendedBytes = false;
  substituteNextSealedStreamBytes: Uint8Array | null = null;
  failNextReceiptPublication = false;
  failNextStreamAbort = false;
  failNextStreamAppend = false;
  failNextStreamSealUnconfirmed = false;
  failNextEffectOutcome = false;
  substituteNextEffectMarker = false;
  substituteNextOutcomeEvidence = false;
  failOutcomeForPublishedPathSuffix: string | null = null;
  readFirstWriterError: unknown | null = null;
  readVerifiedError: unknown | null = null;
  readPrivateDirectoryError: unknown | null = null;
  readDurableEffectMarkerError: unknown | null = null;
  readVerifiedErrorForPathSuffix: Readonly<{ suffix: string; error: unknown }> | null = null;
  readPrivateDirectoryErrorForPathSuffix:
    Readonly<{ suffix: string; error: unknown }> | null = null;
  mountConsumeError: unknown | null = null;
  mountConsumeGate: Promise<void> | null = null;
  mountTransferState: TaskAttemptCustodyBackendMountTransferReceipt['state'] = 'CONSUMED';
  mountTransferGenerationDelta = 0;
  nextMountTransferOverride: unknown | null = null;
  nextMountTransferMutation:
    ((receipt: TaskAttemptCustodyBackendMountTransferReceipt) => unknown) | null = null;
  nextBeginPublicationState: TaskAttemptCustodyAdapterBeginPublicationResult['state'] = 'CREATED';
  nextSealPublicationState: TaskAttemptCustodyAdapterSealResult['state'] = 'PUBLISHED';
  appendResultGenerationDelta = 0;
  abortResultGenerationDelta = 0;
  lastAppendResult: TaskAttemptCustodyAdapterAppendResult | null = null;
  lastAbortResult: TaskAttemptCustodyAdapterAbortResult | null = null;
  reenterEffectMarker: (() => void) | null = null;
  reenterPublishBytesForPathSuffix:
    Readonly<{ readonly suffix: string; readonly action: () => void }> | null = null;
  afterPublishBytesForPathSuffix:
    Readonly<{ readonly suffix: string; readonly action: () => void }> | null = null;
  reenterStreamAppend: (() => void) | null = null;
  reenterStreamSeal: (() => void) | null = null;
  reuseCaptureCapability = false;
  reusePublicationToken = false;
  nextIssuedCapabilityOverride: TaskAttemptCustodyPathCapability | null = null;
  activeStreamSessions = 0;
  streamAbortCalls = 0;
  streamAppendCalls = 0;
  streamSealCalls = 0;
  mountConsumeCalls = 0;
  mountIssueCalls = 0;
  publishBytesCalls = 0;
  readonly publishedPaths: TaskAttemptCustodyRelativePath[] = [];
  effectMarkerPublishCalls = 0;
  private sharedCaptureCapability: TaskAttemptCustodyPathCapability | null = null;
  private sharedPublicationToken: TaskAttemptCustodyAdapterPublicationToken | null = null;

  constructor(state: MemoryCustodyState = memoryCustodyState()) {
    this.directories = state.directories;
    this.files = state.files;
    this.effectMarkers = state.effectMarkers;
  }

  openRoot(input: {
    readonly absoluteRoot: string;
    readonly canonicalProjectRoot: string;
    readonly projectId: string;
    readonly create: boolean;
  }): TaskAttemptCustodyRootProof {
    return Object.freeze({
      ...ROOT_PROOF,
      projectId: input.projectId,
      canonicalProjectRootSha256: createHash('sha256')
        .update(input.canonicalProjectRoot)
        .digest('hex'),
    });
  }

  ensurePrivateDirectory(
    _root: TaskAttemptCustodyRootProof,
    relativeDirectory: TaskAttemptCustodyRelativePath,
  ): TaskAttemptCustodyDirectoryProof {
    const existing = this.directories.get(relativeDirectory);
    if (existing) return existing;
    const proof: TaskAttemptCustodyDirectoryProof = Object.freeze({
      relativePath: relativeDirectory,
      volumeId: _root.volumeId,
      directoryId: `memory-dir:${relativeDirectory}`,
      privacyEvidenceDigest: `sha256:${'5'.repeat(64)}`,
      durabilityEvidenceDigest: `sha256:${'6'.repeat(64)}`,
    });
    this.directories.set(relativeDirectory, proof);
    if (this.malformedNextDirectoryProof) {
      this.malformedNextDirectoryProof = false;
      return Object.defineProperties({}, {
        relativePath: { enumerable: true, get: () => proof.relativePath },
        volumeId: { enumerable: true, value: proof.volumeId },
        directoryId: { enumerable: true, value: proof.directoryId },
        privacyEvidenceDigest: { enumerable: true, value: proof.privacyEvidenceDigest },
        durabilityEvidenceDigest: { enumerable: true, value: proof.durabilityEvidenceDigest },
      }) as TaskAttemptCustodyDirectoryProof;
    }
    return proof;
  }

  readPrivateDirectory(
    _root: TaskAttemptCustodyRootProof,
    relativeDirectory: TaskAttemptCustodyRelativePath,
  ): TaskAttemptCustodyDirectoryProof | null {
    if (this.readPrivateDirectoryError !== null) {
      const error = this.readPrivateDirectoryError;
      this.readPrivateDirectoryError = null;
      throw error;
    }
    if (this.readPrivateDirectoryErrorForPathSuffix?.suffix
      && relativeDirectory.endsWith(this.readPrivateDirectoryErrorForPathSuffix.suffix)) {
      const { error } = this.readPrivateDirectoryErrorForPathSuffix;
      this.readPrivateDirectoryErrorForPathSuffix = null;
      throw error;
    }
    return this.directories.get(relativeDirectory) ?? null;
  }

  scanPrivateDirectoryBounded(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativeDirectory: TaskAttemptCustodyRelativePath;
    readonly maxEntries: number;
    readonly maxNameBytes: number;
    readonly deadlineUnixMs: number;
  }): TaskAttemptCustodyDirectoryScanReceiptV2 {
    const prefix = `${input.relativeDirectory}/`;
    const children = new Set<string>();
    for (const path of this.directories.keys()) {
      if (!path.startsWith(prefix)) continue;
      const remainder = path.slice(prefix.length);
      if (remainder.length !== 0 && !remainder.includes('/')) children.add(remainder);
    }
    const names = Object.freeze([...children].sort());
    if (names.length > input.maxEntries) {
      throw new TaskAttemptCustodyHold(
        'DISPATCH_DISCOVERY_BOUNDS_EXCEEDED',
        'list-dispatch',
      );
    }
    const identityDigest = taskAttemptCustodyDigest(
      'test-directory-scan-identity',
      { rootId: input.root.rootId, relativeDirectory: input.relativeDirectory },
      policy().jsonBounds,
    );
    return createTaskAttemptCustodyDirectoryScanReceiptV2({
      rootId: input.root.rootId,
      relativeDirectory: input.relativeDirectory,
      names,
      entryCount: names.length,
      maxEntries: input.maxEntries,
      maxNameBytes: input.maxNameBytes,
      deadlineUnixMs: input.deadlineUnixMs,
      nativeMutationEvidence: 'DIRECTORY_IDENTITY_STABLE',
      nativeDirectoryIdentityBeforeDigest: identityDigest,
      nativeDirectoryIdentityAfterDigest: identityDigest,
    });
  }

  issuePathCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly access: TaskAttemptCustodyPathCapabilityAccess;
    readonly scopeDigest: Sha256Digest;
  }): TaskAttemptCustodyPathCapability {
    const issued = Object.freeze({
      kind: 'task-attempt-custody-path-capability' as const,
      access: input.access,
      rootId: input.root.rootId,
      scopeDigest: input.scopeDigest,
      capabilityEvidenceDigest: `sha256:${'7'.repeat(64)}`,
    }) as TaskAttemptCustodyPathCapability;
    const capability = this.nextIssuedCapabilityOverride
      ?? (this.reuseCaptureCapability && input.access === 'capture-read-file'
        ? (this.sharedCaptureCapability ??= issued)
        : issued);
    this.nextIssuedCapabilityOverride = null;
    this.capabilityPaths.set(capability, input.relativePath);
    return capability;
  }

  issueBackendMountCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly taskSnapshot: TaskAttemptCustodyPathCapability;
    readonly workerOutput: TaskAttemptCustodyPathCapability;
  }): TaskAttemptCustodyBackendMountCapability {
    this.mountIssueCalls += 1;
    const taskSnapshotPath = this.capabilityPaths.get(input.taskSnapshot);
    const workerOutputPath = this.capabilityPaths.get(input.workerOutput);
    if (!taskSnapshotPath || !workerOutputPath) {
      throw new TaskAttemptCustodyHold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    }
    const capability = Object.freeze(Object.create(null)) as TaskAttemptCustodyBackendMountCapability;
    this.backendMountCapabilities.set(capability, {
      taskSnapshot: input.taskSnapshot,
      workerOutput: input.workerOutput,
    });
    return capability;
  }

  async consumeBackendMountCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly capability: TaskAttemptCustodyBackendMountCapability;
    readonly scopeDigest: Sha256Digest;
    readonly effectOpDigest: Sha256Digest;
    readonly attemptId: string;
    readonly generation: number;
  }): Promise<TaskAttemptCustodyBackendMountTransferReceipt> {
    if (!this.backendMountCapabilities.has(input.capability)) {
      throw Object.freeze({ code: 'CAPABILITY_UNVERIFIED' });
    }
    this.mountConsumeCalls += 1;
    const error = this.mountConsumeError;
    this.mountConsumeError = null;
    if (error !== null) throw error;
    if (this.mountConsumeGate !== null) await this.mountConsumeGate;
    if (this.nextMountTransferOverride !== null) {
      const override = this.nextMountTransferOverride;
      this.nextMountTransferOverride = null;
      return override as TaskAttemptCustodyBackendMountTransferReceipt;
    }
    const state = this.mountTransferState;
    const generation = input.generation + this.mountTransferGenerationDelta;
    this.mountTransferGenerationDelta = 0;
    const receipt = createTaskAttemptCustodyBackendMountTransferReceipt({
      state,
      rootId: input.root.rootId,
      scopeDigest: input.scopeDigest,
      effectOpDigest: input.effectOpDigest,
      attemptId: input.attemptId,
      generation,
      ...mountBackendEvidence(state),
    });
    const mutation = this.nextMountTransferMutation;
    this.nextMountTransferMutation = null;
    return (mutation === null ? receipt : mutation(receipt)) as TaskAttemptCustodyBackendMountTransferReceipt;
  }

  readDurableEffectMarker(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly opDigest: Sha256Digest;
    readonly phase: TaskAttemptCustodyDurableEffectMarker['phase'];
  }): TaskAttemptCustodyDurableEffectMarker | null {
    if (this.readDurableEffectMarkerError !== null) {
      const error = this.readDurableEffectMarkerError;
      this.readDurableEffectMarkerError = null;
      throw error;
    }
    return this.effectMarkers.get(`${input.opDigest}:${input.phase}`) ?? null;
  }

  publishDurableEffectMarkerFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly marker: TaskAttemptCustodyDurableEffectMarker;
  }): TaskAttemptCustodyDurableEffectPublication {
    this.effectMarkerPublishCalls += 1;
    const reenter = this.reenterEffectMarker;
    this.reenterEffectMarker = null;
    reenter?.();
    const key = `${input.marker.opDigest}:${input.marker.phase}`;
    if (this.failNextEffectOutcome && input.marker.phase === 'OUTCOME') {
      this.failNextEffectOutcome = false;
      throw Object.freeze({ code: 'RECONCILIATION_REQUIRED' });
    }
    if (this.substituteNextOutcomeEvidence && input.marker.phase === 'OUTCOME') {
      this.substituteNextOutcomeEvidence = false;
      const effectReceiptDigest = `sha256:${'e'.repeat(64)}` as Sha256Digest;
      const effectEvidenceDigest = `sha256:${'f'.repeat(64)}` as Sha256Digest;
      const outcomeDigest = taskAttemptCustodyDigest(
        'durable-effect-confirmed-outcome',
        {
          opDigest: input.marker.opDigest,
          effectReceiptDigest,
          effectEvidenceDigest,
        },
        policy().jsonBounds,
      );
      const body = {
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-effect-marker' as const,
        phase: 'OUTCOME' as const,
        opDigest: input.marker.opDigest,
        outcomeDigest,
        effectReceiptDigest,
        effectEvidenceDigest,
      };
      const substituted = Object.freeze({
        ...body,
        markerDigest: taskAttemptCustodyDigest(
          'durable-effect-marker',
          body,
          policy().jsonBounds,
        ),
      });
      this.effectMarkers.set(key, substituted);
      return { state: 'CREATED', marker: input.marker };
    }
    if (this.substituteNextEffectMarker) {
      this.substituteNextEffectMarker = false;
      const substituted = Object.freeze({
        ...input.marker,
        markerDigest: `sha256:${'f'.repeat(64)}` as Sha256Digest,
      });
      this.effectMarkers.set(key, substituted);
      return {
        state: 'CREATED',
        marker: substituted,
      };
    }
    const existing = this.effectMarkers.get(key);
    if (existing !== undefined) {
      if (JSON.stringify(existing) !== JSON.stringify(input.marker)) {
        throw Object.freeze({ code: 'RECONCILIATION_REQUIRED' });
      }
      return { state: 'EXISTING_IDENTICAL', marker: existing };
    }
    this.effectMarkers.set(key, input.marker);
    return { state: 'CREATED', marker: input.marker };
  }

  publishBytesFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly bytes: Uint8Array;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyPublication {
    this.publishBytesCalls += 1;
    this.publishedPaths.push(input.relativePath);
    const reentry = this.reenterPublishBytesForPathSuffix;
    if (reentry !== null && input.relativePath.endsWith(reentry.suffix)) {
      this.reenterPublishBytesForPathSuffix = null;
      reentry.action();
    }
    if (this.mutateNextPublishedBytes && input.bytes.byteLength > 0) {
      this.mutateNextPublishedBytes = false;
      input.bytes[0] = input.bytes[0]! ^ 0xff;
    }
    this.assertLimit(input.bytes, input.policy);
    if (this.failNextReceiptPublication && input.relativePath.endsWith('.receipt.json')) {
      this.failNextReceiptPublication = false;
      throw new TaskAttemptCustodyHold('ARTIFACT_CHANGED', 'publish');
    }
    const existing = this.files.get(input.relativePath);
    if (existing) {
      if (!Buffer.from(existing.bytes).equals(Buffer.from(input.bytes))) {
        throw new TaskAttemptCustodyHold('FIRST_WRITER_COLLISION', 'publish');
      }
      return { state: 'EXISTING_IDENTICAL', proof: existing.proof };
    }
    const proof: TaskAttemptCustodyFileProof = Object.freeze({
      relativePath: input.relativePath,
      sha256: sha256(input.bytes),
      byteLength: input.bytes.byteLength,
      volumeId: input.root.volumeId,
      fileId: `memory:${input.relativePath}`,
      linkCount: 1,
      privacyEvidenceDigest: `sha256:${'3'.repeat(64)}`,
      durabilityEvidenceDigest: `sha256:${'4'.repeat(64)}`,
    });
    this.files.set(input.relativePath, {
      bytes: Uint8Array.from(input.bytes),
      proof,
    });
    const afterPublish = this.afterPublishBytesForPathSuffix;
    if (afterPublish !== null && input.relativePath.endsWith(afterPublish.suffix)) {
      this.afterPublishBytesForPathSuffix = null;
      afterPublish.action();
    }
    if (
      this.failOutcomeForPublishedPathSuffix !== null
      && input.relativePath.endsWith(this.failOutcomeForPublishedPathSuffix)
    ) {
      this.failOutcomeForPublishedPathSuffix = null;
      this.failNextEffectOutcome = true;
    }
    return { state: 'CREATED', proof };
  }

  readFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyRead | null {
    if (this.readFirstWriterError !== null) {
      const error = this.readFirstWriterError;
      this.readFirstWriterError = null;
      throw error;
    }
    const entry = this.files.get(input.relativePath);
    if (!entry) return null;
    this.assertLimit(entry.bytes, input.policy);
    return { bytes: Uint8Array.from(entry.bytes), proof: entry.proof };
  }

  readVerified(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly proof: TaskAttemptCustodyFileProof;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyRead | null {
    if (this.readVerifiedError !== null) {
      const error = this.readVerifiedError;
      this.readVerifiedError = null;
      throw error;
    }
    if (this.readVerifiedErrorForPathSuffix?.suffix
      && input.proof.relativePath.endsWith(this.readVerifiedErrorForPathSuffix.suffix)) {
      const { error } = this.readVerifiedErrorForPathSuffix;
      this.readVerifiedErrorForPathSuffix = null;
      throw error;
    }
    const entry = this.files.get(input.proof.relativePath);
    if (!entry) return null;
    this.assertLimit(entry.bytes, input.policy);
    if (!sameTestProof(entry.proof, input.proof)) {
      throw new TaskAttemptCustodyHold('ARTIFACT_CHANGED', 'read');
    }
    if (this.substituteReadbackProof) {
      this.substituteReadbackProof = false;
      return {
        bytes: Uint8Array.from(entry.bytes),
        proof: Object.freeze({ ...entry.proof, fileId: `${entry.proof.fileId}:substituted` }),
      };
    }
    return { bytes: Uint8Array.from(entry.bytes), proof: entry.proof };
  }

  captureStableFile(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly source: TaskAttemptCustodyPathCapability;
    readonly frozenRelativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyPublication {
    const sourcePath = this.capabilityPaths.get(input.source);
    if (!sourcePath) throw new TaskAttemptCustodyHold('CAPABILITY_UNVERIFIED', 'capture');
    const source = this.files.get(sourcePath);
    if (!source) throw new TaskAttemptCustodyHold('ARTIFACT_CHANGED', 'capture');
    return this.publishBytesFirstWriter({
      root: input.root,
      relativePath: input.frozenRelativePath,
      bytes: source.bytes,
      policy: input.policy,
    });
  }

  beginFirstWriterPublication(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterBeginPublicationResult {
    const state = this.nextBeginPublicationState;
    this.nextBeginPublicationState = 'CREATED';
    if (state !== 'CREATED') {
      return Object.freeze({
        schemaVersion: 2,
        kind: 'task-attempt-custody-publication-begin',
        state,
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: `sha256:${'a'.repeat(64)}`,
        publication: null,
      });
    }
    const publication = this.reusePublicationToken
      ? (this.sharedPublicationToken ??= Object.freeze(
        Object.create(null),
      ) as TaskAttemptCustodyAdapterPublicationToken)
      : Object.freeze(Object.create(null)) as TaskAttemptCustodyAdapterPublicationToken;
    if (!this.publicationSessions.has(publication)) {
      this.publicationSessions.set(publication, {
        ...input,
        chunks: [],
        terminal: false,
      });
      this.activeStreamSessions += 1;
    }
    return Object.freeze({
      schemaVersion: 2,
      kind: 'task-attempt-custody-publication-begin',
      state: 'CREATED',
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation: input.generation,
      evidenceDigest: `sha256:${'a'.repeat(64)}`,
      publication,
    });
  }

  appendFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly bytes: Uint8Array;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterAppendResult {
    const session = this.publicationSessions.get(input.publication);
    if (session === undefined || session.terminal) {
      throw Object.freeze({ code: 'APPEND_FAILED' });
    }
    const reenter = this.reenterStreamAppend;
    this.reenterStreamAppend = null;
    reenter?.();
    this.streamAppendCalls += 1;
    if (this.mutateNextAppendedBytes && input.bytes.byteLength > 0) {
      this.mutateNextAppendedBytes = false;
      input.bytes[0] = input.bytes[0]! ^ 0xff;
    }
    session.chunks.push(Uint8Array.from(input.bytes));
    if (this.failNextStreamAppend) {
      this.failNextStreamAppend = false;
      throw Object.freeze({ code: 'APPEND_FAILED' });
    }
    const generation = input.generation + this.appendResultGenerationDelta;
    this.appendResultGenerationDelta = 0;
    const result = createTaskAttemptCustodyAdapterAppendResult({
      state: 'APPENDED',
      byteLength: input.bytes.byteLength,
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation,
      evidenceDigest: `sha256:${'c'.repeat(64)}`,
    });
    this.lastAppendResult = result;
    return result;
  }

  sealFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterSealResult {
    const session = this.publicationSessions.get(input.publication);
    if (session === undefined || session.terminal) {
      return Object.freeze({
        schemaVersion: 2,
        kind: 'task-attempt-custody-publication-seal',
        state: 'CLEANUP_UNCONFIRMED',
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: `sha256:${'b'.repeat(64)}`,
        publication: null,
      });
    }
    const reenter = this.reenterStreamSeal;
    this.reenterStreamSeal = null;
    reenter?.();
    const state = this.nextSealPublicationState;
    this.nextSealPublicationState = 'PUBLISHED';
    if (state === 'CLEANUP_UNCONFIRMED') {
      return Object.freeze({
        schemaVersion: 2,
        kind: 'task-attempt-custody-publication-seal',
        state,
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: `sha256:${'b'.repeat(64)}`,
        publication: null,
      });
    }
    session.terminal = true;
    this.streamSealCalls += 1;
    this.activeStreamSessions -= 1;
    if (state === 'NO_EFFECT_ABORTED') {
      return Object.freeze({
        schemaVersion: 2,
        kind: 'task-attempt-custody-publication-seal',
        state,
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: `sha256:${'b'.repeat(64)}`,
        publication: null,
      });
    }
    const capturedBytes = Buffer.concat(session.chunks.map(chunk => Buffer.from(chunk)));
    const bytes = this.substituteNextSealedStreamBytes ?? capturedBytes;
    this.substituteNextSealedStreamBytes = null;
    const publication = this.publishBytesFirstWriter({
      root: session.root,
      relativePath: session.relativePath,
      policy: session.policy,
      bytes,
    });
    if (this.failNextStreamSealUnconfirmed || state === 'PUBLISHED_UNCONFIRMED') {
      this.failNextStreamSealUnconfirmed = false;
      return Object.freeze({
        schemaVersion: 2,
        kind: 'task-attempt-custody-publication-seal',
        state: 'PUBLISHED_UNCONFIRMED',
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: `sha256:${'b'.repeat(64)}`,
        publication: null,
      });
    }
    return Object.freeze({
      schemaVersion: 2,
      kind: 'task-attempt-custody-publication-seal',
      state: 'PUBLISHED',
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation: input.generation,
      evidenceDigest: `sha256:${'b'.repeat(64)}`,
      publication,
    });
  }

  abortFirstWriterPublication(input: {
    readonly publication: TaskAttemptCustodyAdapterPublicationToken;
    readonly effectOpDigest: Sha256Digest;
    readonly scopeDigest: Sha256Digest;
    readonly generation: number;
  }): TaskAttemptCustodyAdapterAbortResult {
    const session = this.publicationSessions.get(input.publication);
    if (session === undefined || session.terminal) {
      const result = createTaskAttemptCustodyAdapterAbortResult({
        state: 'CLEANUP_UNCONFIRMED',
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: `sha256:${'d'.repeat(64)}`,
      });
      this.lastAbortResult = result;
      return result;
    }
    this.streamAbortCalls += 1;
    if (this.failNextStreamAbort) {
      this.failNextStreamAbort = false;
      const result = createTaskAttemptCustodyAdapterAbortResult({
        state: 'CLEANUP_UNCONFIRMED',
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: `sha256:${'d'.repeat(64)}`,
      });
      this.lastAbortResult = result;
      return result;
    }
    session.terminal = true;
    this.activeStreamSessions -= 1;
    const generation = input.generation + this.abortResultGenerationDelta;
    this.abortResultGenerationDelta = 0;
    const result = createTaskAttemptCustodyAdapterAbortResult({
      state: 'ABORTED',
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation,
      evidenceDigest: `sha256:${'d'.repeat(64)}`,
    });
    this.lastAbortResult = result;
    return result;
  }

  tamperFirst(suffix: string, bytes: Uint8Array): void {
    const match = [...this.files.entries()].find(([path]) => path.endsWith(suffix));
    if (!match) throw new Error(`test fixture path not found: ${suffix}`);
    this.files.set(match[0], { bytes: Uint8Array.from(bytes), proof: match[1].proof });
  }

  removeFirst(suffix: string): void {
    const match = [...this.files.keys()].find(path => path.endsWith(suffix));
    if (!match) throw new Error(`test fixture path not found: ${suffix}`);
    this.files.delete(match);
  }

  putWorkerOutput(path: TaskAttemptCustodyRelativePath, bytes: Uint8Array): void {
    const proof: TaskAttemptCustodyFileProof = Object.freeze({
      relativePath: path,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
      volumeId: ROOT_PROOF.volumeId,
      fileId: `memory:${path}`,
      linkCount: 1,
      privacyEvidenceDigest: `sha256:${'3'.repeat(64)}`,
      durabilityEvidenceDigest: `sha256:${'4'.repeat(64)}`,
    });
    this.files.set(path, { bytes: Uint8Array.from(bytes), proof });
  }

  private assertLimit(bytes: Uint8Array, policy: TaskAttemptCustodyArtifactLimit): void {
    if (bytes.byteLength < policy.minBytes || bytes.byteLength > policy.maxBytes) {
      throw new TaskAttemptCustodyHold('ARTIFACT_OVERSIZE', 'publish');
    }
  }
}

function sameTestProof(
  left: TaskAttemptCustodyFileProof,
  right: TaskAttemptCustodyFileProof,
): boolean {
  return left.relativePath === right.relativePath
    && left.sha256 === right.sha256
    && left.byteLength === right.byteLength
    && left.volumeId === right.volumeId
    && left.fileId === right.fileId
    && left.linkCount === right.linkCount
    && left.privacyEvidenceDigest === right.privacyEvidenceDigest
    && left.durabilityEvidenceDigest === right.durabilityEvidenceDigest;
}

function artifactLimits(
  maxBytes = 64 * 1024,
): Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit> {
  return Object.fromEntries(TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES.map(artifactClass => [
    artifactClass,
    { minBytes: 1, maxBytes, requireSingleLink: true as const },
  ])) as Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>;
}

function policy(
  overrides: Partial<{ maxDepth: number; maxCanonicalBytes: number }> = {},
): TaskAttemptCustodyPolicyV2 {
  return createTaskAttemptCustodyPolicy({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    metadataMaxBytes: 64 * 1024,
    jsonBounds: {
      maxDepth: overrides.maxDepth ?? 20,
      maxNodes: 10_000,
      maxStringBytes: 8 * 1024,
      maxArrayLength: 1_000,
      maxObjectKeys: 128,
      maxCanonicalBytes: overrides.maxCanonicalBytes ?? 64 * 1024,
    },
    artifactLimits: artifactLimits(),
  });
}

function identity(
  overrides: Partial<TaskAttemptCustodyIdentityV2> = {},
): TaskAttemptCustodyIdentityV2 {
  return {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    backend: 'docker',
    projectRootSha256: PROJECT_ROOT_SHA256,
    projectId: 'project-1',
    taskId: '001-001',
    attemptId: '123e4567-e89b-42d3-a456-426614174000',
    generation: 1,
    ...overrides,
  };
}

function openedStore(adapter = new InMemoryCustodyAdapter()): {
  adapter: InMemoryCustodyAdapter;
  store: TaskAttemptCustodyStore;
} {
  return {
    adapter,
    store: TaskAttemptCustodyStore.open({
      adapter,
      absoluteRoot: '/test/host-custody',
      canonicalProjectRoot: CANONICAL_PROJECT_ROOT,
      projectId: 'project-1',
      create: true,
    }),
  };
}

function admit(
  store: TaskAttemptCustodyStore,
  taskIdentity: TaskAttemptCustodyIdentityV2,
  taskPolicy: TaskAttemptCustodyPolicyV2,
  predecessorDigest: Sha256Digest | null = null,
  predecessorIdentity: TaskAttemptCustodyIdentityV2 | null = null,
) {
  return store.createAdmission({
    identity: taskIdentity,
    policy: taskPolicy,
    admittedAt: '2026-08-30T20:00:00.000Z',
    predecessorDigest,
    predecessorIdentity,
    taskSnapshot: {
      id: taskIdentity.taskId,
      scope: { filesRead: ['src/core/a.ts'], filesWrite: ['src/core/b.ts'] },
    },
  });
}

function publishEffectLanding(input: {
  readonly store: TaskAttemptCustodyStore;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly keyPrefix?: string;
}) {
  const keyPrefix = input.keyPrefix ?? 'primary';
  const publish = (
    artifactClass:
      | 'execution-workspace-snapshot'
      | 'execution-workspace-release'
      | 'execution-effect-manifest'
      | 'execution-effect-staged-content'
      | 'execution-effect-landing-journal'
      | 'execution-effect-landing-receipt-evidence',
    artifactKey: string,
    capturedAt: string,
    body: string,
  ) => {
    return input.store.publishHostArtifact({
      identity: input.identity,
      policy: input.policy,
      admissionReceiptDigest: input.admissionReceiptDigest,
      artifactClass,
      artifactKey,
      capturedAt,
      bytes: Buffer.from(body),
    });
  };
  const effectAttempt = Object.freeze({
    projectId: input.identity.projectId,
    taskId: input.identity.taskId,
    attemptId: input.identity.attemptId,
    generation: input.identity.generation,
  });
  const writePolicy = compileExecutionEffectWritePolicy(['src/core/b.ts']);
  if (!writePolicy.ok) throw new Error('test write policy invalid');
  const workspaceIdentity = Object.freeze({
    filesystemId: 'dev:2049',
    directoryId: 'ino:1001',
    rootHandleEvidenceDigest: repeatedDigest('6'),
  });
  const effectAttemptDigest = domainDigest('execution-effect-attempt-v1', effectAttempt);
  const nativeCapabilityDigest = repeatedDigest('6');
  const manifest = (phase: 'baseline' | 'final'): ExecutionEffectManifest => {
    const captureAuthority = Object.freeze({
      adapter: 'native-descriptor-relative' as const,
      platform: 'wsl2-linux' as const,
      traversal: 'iterative-openat-no-follow' as const,
      sameFilesystem: true as const,
      mountBoundaryPolicy: 'reject' as const,
      hardlinkPolicy: 'reject-before-content-read' as const,
      cancellationState: 'not-cancelled' as const,
      nativeManifestDigest: domainDigest('test-native-manifest', phase),
      nativeEntryIdentitySetDigest: domainDigest('test-native-entry-identities', phase),
      startedAt: '2026-08-30T20:01:00.000Z',
      completedAt: phase === 'baseline'
        ? '2026-08-30T20:02:00.000Z' : '2026-08-30T20:03:00.000Z',
      deadlineAt: '2026-08-30T20:10:00.000Z',
      limits: Object.freeze({
        maxEntries: 100,
        maxFileBytes: 1_000_000,
        maxTotalBytes: 10_000_000,
        maxDepth: 20,
        maxPathBytes: 1_024,
        maxNameBytes: 255,
        maxManifestBytes: 16 * 1024 * 1024,
      }),
    });
    const landingSemantics = Object.freeze({
      regularFile: 'reconstruct-bytes-and-safe-mode' as const,
      directory: 'exact-directory-add-and-derived-parent-create' as const,
      unsupportedMetadata: 'strip-xattr-acl-capability-sparse-ads-owner-times' as const,
      linksAndSpecialFiles: 'reject' as const,
    });
    const body = Object.freeze({
      version: 1 as const,
      phase,
      attempt: effectAttempt,
      attemptDigest: effectAttemptDigest,
      workspaceIdentity,
      captureAuthority,
      landingSemantics,
      policy: writePolicy.policy,
      entries: Object.freeze([{ path: '.', kind: 'directory' as const, mode: 0o755 }]),
    });
    const parsed = parseExecutionEffectManifest({
      ...body,
      digest: domainDigest('execution-effect-manifest-v1', body),
    });
    if (!parsed) throw new Error('test manifest invalid');
    return parsed;
  };
  const baseline = manifest('baseline');
  const final = manifest('final');
  const workspaceResource = createExecutionEffectWorkspaceResourceV1({
    volumeName: `deckent-effect-${keyPrefix}`,
    imageDigest: repeatedDigest('1'),
    labelsDigest: repeatedDigest('2'),
    mountPlanDigest: repeatedDigest('3'),
    snapshotInventoryDigest: repeatedDigest('4'),
    populationReceiptDigest: repeatedDigest('5'),
    baselineManifestDigest: baseline.digest as Sha256Digest,
  });
  const dependencyResource = createExecutionEffectDependencyResourceV1({
    attempt: effectAttempt,
    admissionReceiptDigest: input.admissionReceiptDigest,
    custodyPolicyDigest: input.policy.policyDigest,
    imageIdentityDigest: repeatedDigest('c'),
    labelsDigest: repeatedDigest('2'),
    mountPlanDigest: repeatedDigest('d'),
    populationReceiptDigest: repeatedDigest('e'),
    volumeName: `deckent-dependency-${keyPrefix}`,
    volumeIdentityDigest: repeatedDigest('f'),
    readyAt: '2026-08-30T20:01:59.000Z',
  });
  const workspaceSeal = createExecutionEffectWorkspaceSnapshotSealV1({
    attempt: effectAttempt,
    admissionReceiptDigest: input.admissionReceiptDigest,
    custodyPolicyDigest: input.policy.policyDigest,
    writePolicyDigest: writePolicy.policy.digest as Sha256Digest,
    workspaceIdentity,
    workspaceResource,
    dependencyResource,
    nativeCapabilityDigest,
    platform: 'wsl2-linux',
    sealedAt: '2026-08-30T20:02:00.000Z',
  });
  const decision = evaluateExecutionEffectContainment({
    baseline: { ok: true, manifest: baseline },
    final: { ok: true, manifest: final },
  });
  if (decision.state !== 'VERIFIED') throw new Error('test decision invalid');
  const workspaceBytes = canonicalTaskAttemptCustodyJson(workspaceSeal, input.policy.jsonBounds);
  const baselineBytes = canonicalTaskAttemptCustodyJson(baseline, input.policy.jsonBounds);
  const finalBytes = canonicalTaskAttemptCustodyJson(final, input.policy.jsonBounds);
  const workspaceSnapshot = publish(
    'execution-workspace-snapshot',
    `${keyPrefix}-workspace`,
    workspaceSeal.sealedAt,
    Buffer.from(workspaceBytes).toString('utf8'),
  );
  const baselineManifest = publish(
    'execution-effect-manifest',
    `${keyPrefix}-baseline`,
    '2026-08-30T20:02:00.000Z',
    Buffer.from(baselineBytes).toString('utf8'),
  );
  const finalManifest = publish(
    'execution-effect-manifest',
    `${keyPrefix}-final`,
    '2026-08-30T20:03:00.000Z',
    Buffer.from(finalBytes).toString('utf8'),
  );
  const planId = `${keyPrefix}-plan`;
  const planDigest = domainDigest('execution-effect-landing-plan-v1', []);
  const transactionBody = Object.freeze({
    version: 1 as const,
    projectId: effectAttempt.projectId,
    taskId: effectAttempt.taskId,
    attemptId: effectAttempt.attemptId,
    generation: effectAttempt.generation,
    attemptDigest: workspaceSeal.attemptDigest,
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
    operations: Object.freeze([]),
    nativeCapabilityDigest,
    journalCapabilityDigest: repeatedDigest('7'),
    leaseCapabilityDigest: repeatedDigest('8'),
    acquiredLease: Object.freeze({
      transactionDigest: transaction.transactionDigest,
      fencingTokenDigest: repeatedDigest('9'),
      leaseReceiptDigest: repeatedDigest('a'),
    }),
    preparedAt: '2026-08-30T20:04:00.000Z',
  });
  const preparedJournalRecord = Object.freeze({
    ...preparedBody,
    recordDigest: domainDigest('execution-effect-landing-prepared-journal-v1', preparedBody),
  });
  const committedAt = '2026-08-30T20:06:00.000Z';
  const committedBody = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-landing-committed' as const,
    phase: 'COMMITTED' as const,
    disposition: 'COMMITTED_NO_CHANGE' as const,
    transaction,
    preparedJournalDigest: preparedJournalRecord.recordDigest,
    applyingJournalDigest: null,
    lastJournalDigest: preparedJournalRecord.recordDigest,
    operationReceiptDigests: Object.freeze([]),
    finalVerificationReceipt: null,
    committedAt,
  });
  const committedJournalRecord = Object.freeze({
    ...committedBody,
    recordDigest: domainDigest('execution-effect-landing-committed-journal-v1', committedBody),
  });
  const preparedJournalBytes = canonicalTaskAttemptCustodyJson(
    preparedJournalRecord,
    input.policy.jsonBounds,
  );
  const committedJournalBytes = canonicalTaskAttemptCustodyJson(
    committedJournalRecord,
    input.policy.jsonBounds,
  );
  const preparedJournalArtifact = publish(
    'execution-effect-landing-journal',
    `${keyPrefix}-journal-prepared`,
    preparedBody.preparedAt,
    Buffer.from(preparedJournalBytes).toString('utf8'),
  );
  const committedJournalArtifact = publish(
    'execution-effect-landing-journal',
    `${keyPrefix}-journal-committed`,
    '2026-08-30T20:04:30.000Z',
    Buffer.from(committedJournalBytes).toString('utf8'),
  );
  const leaseTerminalEvidence = createExecutionEffectLandingLeaseTerminalReceiptEvidenceV1({
    transactionDigest: transaction.transactionDigest,
    terminal: 'RELEASED_NO_CHANGE',
    committedJournalDigest: committedJournalRecord.recordDigest,
    eventId: `${keyPrefix}-terminal-event`,
    quarantineId: executionEffectLandingDeterministicBoundaryIdV1(transaction.transactionDigest),
    fencingToken: { epoch: 'epoch-1', counter: 1, nonce: 'nonce-1' },
    occurredAt: '2026-08-30T20:06:00.000Z',
    evidenceRefs: [
      `committed-journal:${committedJournalRecord.recordDigest}`,
      'effect-terminal:RELEASED_NO_CHANGE',
      `effect-transaction:${transaction.transactionDigest}`,
    ].sort(),
  });
  const leaseTerminalEvidenceBytes = canonicalTaskAttemptCustodyJson(
    leaseTerminalEvidence,
    input.policy.jsonBounds,
  );
  const leaseTerminalEvidenceArtifact = publish(
    'execution-effect-landing-receipt-evidence',
    `${keyPrefix}-lease-terminal-evidence`,
    leaseTerminalEvidence.occurredAt,
    Buffer.from(leaseTerminalEvidenceBytes).toString('utf8'),
  );
  const terminal = createExecutionEffectLandingTerminalSealV1({
    attempt: effectAttempt,
    attemptDigest: workspaceSeal.attemptDigest,
    disposition: 'COMMITTED_NO_CHANGE',
    workspaceSnapshotSealDigest: workspaceSeal.sealDigest,
    baselineManifestDigest: baseline.digest as Sha256Digest,
    finalManifestDigest: final.digest as Sha256Digest,
    effectDecisionDigest: decision.decisionDigest as Sha256Digest,
    planId,
    operations: [],
    preparedJournalDigest: preparedJournalRecord.recordDigest,
    applyingJournalDigest: null,
    stepJournalDigests: [],
    committedJournalDigest: committedJournalRecord.recordDigest,
    finalVerificationReceiptDigest: null,
    journalArtifacts: {
      prepared: {
        artifactKey: preparedJournalArtifact.artifactKey,
        artifactReceiptDigest: preparedJournalArtifact.receiptDigest,
        contentDigest: sha256(preparedJournalBytes),
        byteLength: preparedJournalBytes.byteLength,
      },
      applying: null,
      steps: [],
      committed: {
        artifactKey: committedJournalArtifact.artifactKey,
        artifactReceiptDigest: committedJournalArtifact.receiptDigest,
        contentDigest: sha256(committedJournalBytes),
        byteLength: committedJournalBytes.byteLength,
      },
    },
    receiptArtifacts: {
      nativeReceipts: [],
      finalVerificationReceipt: null,
      leaseTerminalReceipt: {
        artifactKey: leaseTerminalEvidenceArtifact.artifactKey,
        artifactReceiptDigest: leaseTerminalEvidenceArtifact.receiptDigest,
        contentDigest: sha256(leaseTerminalEvidenceBytes),
        byteLength: leaseTerminalEvidenceBytes.byteLength,
      },
    },
    leaseTerminal: 'RELEASED_NO_CHANGE',
    leaseTerminalReceiptDigest: leaseTerminalEvidence.terminalReceiptDigest,
    committedAt,
  });
  const terminalBytes = canonicalTaskAttemptCustodyJson(terminal, input.policy.jsonBounds);
  if (!verifyExecutionEffectPersistenceBundleV1({
    workspaceBytes,
    baselineBytes,
    finalBytes,
    terminalBytes,
    stagedArtifacts: [],
    journalArtifacts: [
      {
        ...terminal.journalArtifacts.prepared,
        bytes: preparedJournalBytes,
      },
      {
        ...terminal.journalArtifacts.committed,
        bytes: committedJournalBytes,
      },
    ],
    receiptArtifacts: [{
      ...terminal.receiptArtifacts.leaseTerminalReceipt,
      bytes: leaseTerminalEvidenceBytes,
    }],
    maxJsonBytes: TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES,
  })) throw new Error('invalid canonical execution-effect test bundle');
  const landingJournal = publish(
    'execution-effect-landing-journal',
    `${keyPrefix}-journal`,
    '2026-08-30T20:05:00.000Z',
    Buffer.from(terminalBytes).toString('utf8'),
  );
  const releasedAt = '2026-08-30T20:07:00.000Z';
  const workspaceRelease = createExecutionEffectWorkspaceReleaseV1({
    attempt: effectAttempt,
    admissionReceiptDigest: input.admissionReceiptDigest,
    custodyPolicyDigest: input.policy.policyDigest,
    workspaceSnapshotSealDigest: workspaceSeal.sealDigest,
    workspaceResource,
    dependencyResource,
    transactionDigest: terminal.transactionDigest,
    committedJournalDigest: terminal.committedJournalDigest,
    providerContainer: {
      containerName: `deckent-provider-${keyPrefix}`,
      deletionReceiptDigest: repeatedDigest('8'),
      absenceEvidenceDigest: repeatedDigest('9'),
    },
    workspaceVolume: {
      volumeName: workspaceResource.volumeName,
      deletionReceiptDigest: repeatedDigest('a'),
      absenceEvidenceDigest: repeatedDigest('b'),
    },
    dependencyVolume: {
      volumeName: dependencyResource.volumeName,
      volumeIdentityDigest: dependencyResource.volumeIdentityDigest,
      deletionReceiptDigest: repeatedDigest('c'),
      absenceEvidenceDigest: repeatedDigest('d'),
    },
    releasedAt,
  });
  const workspaceReleaseArtifact = publish(
    'execution-workspace-release',
    `${keyPrefix}-workspace-release`,
    releasedAt,
    Buffer.from(canonicalTaskAttemptCustodyJson(
      workspaceRelease,
      input.policy.jsonBounds,
    )).toString('utf8'),
  );
  const semanticReceipt = createTaskAttemptCustodyEffectLandingReceiptV2({
    identity: input.identity,
    admissionReceiptDigest: input.admissionReceiptDigest,
    policyDigest: input.policy.policyDigest,
    disposition: 'COMMITTED_NO_CHANGE',
    workspaceSnapshot: {
      artifactKey: workspaceSnapshot.artifactKey,
      artifactReceiptDigest: workspaceSnapshot.receiptDigest,
    },
    baselineManifest: {
      artifactKey: baselineManifest.artifactKey,
      artifactReceiptDigest: baselineManifest.receiptDigest,
    },
    finalManifest: {
      artifactKey: finalManifest.artifactKey,
      artifactReceiptDigest: finalManifest.receiptDigest,
    },
    stagedContents: [],
    landingJournal: {
      artifactKey: landingJournal.artifactKey,
      artifactReceiptDigest: landingJournal.receiptDigest,
    },
    workspaceRelease: {
      artifactKey: workspaceReleaseArtifact.artifactKey,
      artifactReceiptDigest: workspaceReleaseArtifact.receiptDigest,
    },
    effectDecisionDigest: decision.decisionDigest as Sha256Digest,
    transactionDigest: terminal.transactionDigest as Sha256Digest,
    committedAt,
    releasedAt,
  }, input.policy);
  const artifactReceipt = input.store.publishHostArtifact({
    identity: input.identity,
    policy: input.policy,
    admissionReceiptDigest: input.admissionReceiptDigest,
    artifactClass: 'execution-effect-landing-receipt',
    artifactKey: `${keyPrefix}-landing`,
    capturedAt: releasedAt,
    bytes: canonicalTaskAttemptCustodyJson(semanticReceipt, input.policy.jsonBounds),
  });
  return Object.freeze({
    artifactReceipt,
    semanticReceipt,
    workspaceSeal,
    workspaceResource,
    dependencyResource,
    terminal,
    workspaceRelease,
  });
}

function publishAcceptedResult(input: {
  readonly store: TaskAttemptCustodyStore;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly landing: ReturnType<typeof publishEffectLanding>;
  readonly effectChainDigest: Sha256Digest;
  readonly artifactKey?: string;
  readonly capturedAt?: string;
}) {
  const providerExitObservedAt = '2026-08-30T20:06:00.000Z';
  const providerExitObservationReceiptDigest = domainDigest(
    'test-provider-exit-observation-receipt-v2',
    { identity: input.identity, observedAt: providerExitObservedAt },
  );
  const scopeDigest = createHash('sha256').update('[]').digest('hex');
  const baselineSha256 = createHash('sha256')
    .update(`#deckent-scope-attribution-v1\ttest-dispatch-request\t${scopeDigest}\n`)
    .digest('hex');
  const hostWorkBody = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'exact-docker-host-work-attribution' as const,
    state: 'VERIFIED' as const,
    attemptId: input.identity.attemptId,
    dispatchRequestId: 'test-dispatch-request',
    admissionRefDigest: domainDigest('test-dispatch-admission-ref-v2', input.identity),
    providerExitObservationReceiptDigest,
    baselineRef: `task-attempt-custody-provider-exit:${providerExitObservationReceiptDigest}#scope-baseline:sha256:${baselineSha256}`,
    baselineSha256,
    scopeDigest,
    filesChanged: Object.freeze([]),
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    reasonCode: 'NONE' as const,
  });
  const hostWorkBytes = canonicalTaskAttemptCustodyJson({
    ...hostWorkBody,
    evidenceDigest: domainDigest('exact-docker-host-work-attribution-v2', hostWorkBody),
  }, input.policy.jsonBounds);
  const hostWorkArtifact = input.store.publishHostArtifact({
    identity: input.identity,
    policy: input.policy,
    admissionReceiptDigest: input.admissionReceiptDigest,
    artifactClass: 'host-work-attribution',
    artifactKey: `host-work-${input.identity.attemptId}`,
    capturedAt: providerExitObservedAt,
    bytes: hostWorkBytes,
  });
  const binding = createTaskAttemptEffectLandingBindingV2({
    identity: {
      projectId: input.identity.projectId,
      taskId: input.identity.taskId,
      attemptId: input.identity.attemptId,
      generation: input.identity.generation,
    },
    admissionReceiptDigest: input.admissionReceiptDigest,
    custodyPolicyDigest: input.policy.policyDigest,
    landingArtifactKey: input.landing.artifactReceipt.artifactKey,
    landingArtifactReceiptDigest: input.landing.artifactReceipt.receiptDigest,
    landingReceiptDigest: input.landing.semanticReceipt.receiptDigest,
    effectLandingChainDigest: input.effectChainDigest,
    readyLifecycleAuthorityDigest: repeatedDigest('7'),
    disposition: input.landing.semanticReceipt.disposition,
    effectDecisionDigest: input.landing.semanticReceipt.effectDecisionDigest,
    transactionDigest: input.landing.semanticReceipt.transactionDigest,
  });
  return input.store.publishHostArtifact({
    identity: input.identity,
    policy: input.policy,
    admissionReceiptDigest: input.admissionReceiptDigest,
    artifactClass: 'canonical-accepted-result',
    artifactKey: input.artifactKey ?? 'primary',
    capturedAt: input.capturedAt ?? input.landing.semanticReceipt.releasedAt,
    bytes: canonicalTaskAttemptCustodyJson({
      attemptCustody: {
        version: 2,
        identity: input.identity,
        policyDigest: input.policy.policyDigest,
        admissionReceiptDigest: input.admissionReceiptDigest,
        sourceResult: {
          artifactClass: 'worker-result',
          artifactKey: 'primary',
          artifactReceiptDigest: repeatedDigest('1'),
          artifactSha256: repeatedDigest('2'),
          byteLength: 1,
        },
        hostWorkAttribution: {
          artifactClass: 'host-work-attribution',
          artifactKey: hostWorkArtifact.artifactKey,
          artifactReceiptDigest: hostWorkArtifact.receiptDigest,
          artifactSha256: hostWorkArtifact.artifact.sha256,
          byteLength: hostWorkArtifact.artifact.byteLength,
        },
        hostPromotion: {
          version: 2,
          kind: 'task-result-host-promotion',
          authority: 'host-canonical-ingress-assembler',
          assembledV1Digest: repeatedDigest('3'),
        },
        effectLanding: binding,
      },
    }, input.policy.jsonBounds),
  });
}

function expectHold(action: () => unknown, code: TaskAttemptCustodyHold['code']): void {
  try {
    action();
    throw new Error(`expected HOLD ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(TaskAttemptCustodyHold);
    expect((error as TaskAttemptCustodyHold).code).toBe(code);
  }
}

function dispatchId(character = '1'): string {
  return `dreq-${character.repeat(64)}`;
}

function reserveDispatch(input: {
  readonly store: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly requestId?: string;
  readonly material?: unknown;
  readonly taskSnapshot?: unknown;
  readonly reservedAt?: string;
  readonly predecessor?: TaskAttemptCustodyDispatchAdmissionRefV2 | null;
}) {
  return input.store.reserveDispatchAdmission({
    dispatchRequestId: input.requestId ?? dispatchId(),
    dispatchRequestMaterial: input.material ?? {
      approvedTaskMaterialDigest: repeatedDigest('7'),
      dispatchTaskMaterialDigest: repeatedDigest('8'),
      derivationAuthorityDigest: repeatedDigest('9'),
    },
    taskId: '001-001',
    taskSnapshot: input.taskSnapshot ?? {
      id: '001-001',
      scope: { filesRead: ['src/core/a.ts'], filesWrite: ['src/core/b.ts'] },
    },
    policy: input.policy,
    reservedAt: input.reservedAt ?? '2026-08-30T20:00:00.000Z',
    predecessor: input.predecessor === null || input.predecessor === undefined
      ? null
      : {
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-dispatch-predecessor-ref',
        identity: input.predecessor.identity,
        admissionReceiptDigest: input.predecessor.admissionReceiptDigest,
      },
  });
}

function noEffectObservation(
  observedAt = '2026-08-30T20:01:00.000Z',
  observationReceiptDigest = repeatedDigest('e'),
  observationEvidenceDigest = repeatedDigest('f'),
): TaskAttemptCustodyDispatchNoEffectObservationV2 {
  return {
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-no-effect-observation',
    daemonContainerState: 'ABSENT',
    providerReleaseState: 'ABSENT',
    daemonInspectionReceiptDigest: repeatedDigest('a'),
    providerReleaseProbeEvidenceDigest: repeatedDigest('b'),
    backendProbeEvidenceDigest: repeatedDigest('c'),
    containmentEvidenceDigest: repeatedDigest('d'),
    observationReceiptDigest,
    observationEvidenceDigest,
    observedAt,
  };
}

function publishNoEffectObservation(input: {
  readonly store: TaskAttemptCustodyStore;
  readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly observedAt?: string;
}): TaskAttemptCustodyDispatchNoEffectObservationV2 {
  const observedAt = input.observedAt ?? '2026-08-30T20:01:00.000Z';
  const receipt = input.store.publishDispatchObservation({
    admissionRef: input.admissionRef,
    policy: input.policy,
    observationClass: 'NO_EFFECT',
    observedAt,
    bytes: Buffer.from('{"daemon":"ABSENT","provider":"ABSENT"}'),
  });
  return noEffectObservation(observedAt, receipt.receiptDigest, receipt.evidenceDigest);
}

function publishGateAckObservation(input: {
  readonly store: TaskAttemptCustodyStore;
  readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly observedAt?: string;
}) {
  return input.store.publishDispatchObservation({
    admissionRef: input.admissionRef,
    policy: input.policy,
    observationClass: 'GATE_ACK',
    observedAt: input.observedAt ?? '2026-08-30T20:01:30.000Z',
    bytes: Buffer.from('{"gate":"ACKNOWLEDGED"}'),
  });
}

function publishReconciliationObservation(input: {
  readonly store: TaskAttemptCustodyStore;
  readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly observedAt?: string;
}) {
  return input.store.publishDispatchObservation({
    admissionRef: input.admissionRef,
    policy: input.policy,
    observationClass: 'RECONCILIATION',
    observedAt: input.observedAt ?? '2026-08-30T20:01:00.000Z',
    bytes: Buffer.from('{"state":"RECONCILIATION_REQUIRED"}'),
  });
}

function publishWorkerIpcAnswer(input: {
  readonly store: TaskAttemptCustodyStore;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly sequence?: number;
  readonly authorityEnvelopeBytes?: Uint8Array;
  readonly deliveryBytes?: Uint8Array;
  readonly deliveredAt?: string;
}): TaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2 {
  const access = input.store.openAttemptAccess({
    identity: input.identity,
    policy: input.policy,
    admissionReceiptDigest: input.admissionReceiptDigest,
  });
  if (access === null) throw new Error('attempt access missing');
  const sequence = input.sequence ?? 1;
  return input.store.publishWorkerIpcAnswerDelivery({
    identity: input.identity,
    policy: input.policy,
    admissionReceiptDigest: input.admissionReceiptDigest,
    access,
    sequence,
    artifactKey: `ipc-answer-${sequence}`,
    destinationChildRelativePath: `task-${input.identity.taskId}.answer`,
    deliveredAt: input.deliveredAt ?? '2026-08-30T20:01:00.000Z',
    authorityEnvelopeBytes: input.authorityEnvelopeBytes
      ?? Buffer.from(`{"kind":"authority-envelope","sequence":${sequence}}`),
    deliveryBytes: input.deliveryBytes
      ?? Buffer.from(`{"answer":"approved-${sequence}"}`),
  });
}

describe('TaskAttemptCustodyStore V2 kernel', () => {
  it('canonicalizes JSON independently of object key order and rejects non-JSON/bounded overflow', () => {
    const taskPolicy = policy();
    const left = canonicalTaskAttemptCustodyJson({ z: 1, a: { y: 2, x: 3 } }, taskPolicy.jsonBounds);
    const right = canonicalTaskAttemptCustodyJson({ a: { x: 3, y: 2 }, z: 1 }, taskPolicy.jsonBounds);
    expect(Buffer.from(left).equals(Buffer.from(right))).toBe(true);

    expectHold(
      () => canonicalTaskAttemptCustodyJson({ unsafe: undefined }, taskPolicy.jsonBounds),
      'INVALID_CANONICAL_JSON',
    );
    expectHold(
      () => canonicalTaskAttemptCustodyJson({ a: { b: { c: 1 } } }, policy({ maxDepth: 2 }).jsonBounds),
      'JSON_BOUNDS_EXCEEDED',
    );
  });

  it('matches a hard-coded canonical byte and domain-separated digest golden vector', () => {
    const taskPolicy = policy();
    const value = { z: 1, a: { y: 2, x: 3 } };
    expect(Buffer.from(canonicalTaskAttemptCustodyJson(value, taskPolicy.jsonBounds)).toString())
      .toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(Buffer.from(canonicalTaskAttemptCustodyJson({
      2: 'two',
      10: 'ten',
      a: 'letter',
    }, taskPolicy.jsonBounds)).toString()).toBe('{"10":"ten","2":"two","a":"letter"}');
    expect(taskAttemptCustodyDigest('golden-vector', value, taskPolicy.jsonBounds)).toBe(
      'sha256:bd8d8e0c393acb0fd61b78fa801d490c6e666b31e6ac32770b1ddd49104d32c2',
    );
  });

  it('derives Docker mount transfer evidence deterministically from every exact evidence field', () => {
    const base = {
      state: 'CONSUMED' as const,
      rootId: repeatedDigest('1'),
      scopeDigest: repeatedDigest('2'),
      effectOpDigest: repeatedDigest('3'),
      attemptId: '123e4567-e89b-42d3-a456-426614174000',
      generation: 1,
      ...mountBackendEvidence('CONSUMED'),
    };
    const first = createTaskAttemptCustodyBackendMountTransferReceipt(base);
    const replay = createTaskAttemptCustodyBackendMountTransferReceipt({ ...base });
    expect(replay).toEqual(first);

    const changedReceipts = [
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        rootId: repeatedDigest('4'),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        scopeDigest: repeatedDigest('4'),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        effectOpDigest: repeatedDigest('4'),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        attemptId: '223e4567-e89b-42d3-a456-426614174000',
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({ ...base, generation: 2 }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        backendExecutionId: 'b'.repeat(64),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        backendImageDigest: repeatedDigest('4'),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        backendAuthorityLabelDigest: repeatedDigest('4'),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        taskSnapshotMountEvidenceDigest: repeatedDigest('4'),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        workerOutputMountEvidenceDigest: repeatedDigest('4'),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        backendBootstrapProbeEvidenceDigest: repeatedDigest('4'),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        daemonMountReceiptDigest: repeatedDigest('4'),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        state: 'CLEANUP_UNCONFIRMED',
        ...mountBackendEvidence('CLEANUP_UNCONFIRMED'),
      }),
      createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        state: 'CLEANUP_UNCONFIRMED',
        ...mountBackendEvidence('CLEANUP_UNCONFIRMED'),
        cleanupEvidenceDigest: repeatedDigest('8'),
      }),
    ];
    for (const changed of changedReceipts) {
      expect(changed.transferEvidenceDigest).not.toBe(first.transferEvidenceDigest);
      expect(changed.receiptDigest).not.toBe(first.receiptDigest);
    }
    expect(changedReceipts.at(-1)?.transferEvidenceDigest).not.toBe(
      changedReceipts.at(-2)?.transferEvidenceDigest,
    );
    expect(changedReceipts.at(-1)?.receiptDigest).not.toBe(
      changedReceipts.at(-2)?.receiptDigest,
    );
  });

  it('rejects caller-authored mount summaries and incomplete or malformed Docker evidence', () => {
    const base = {
      state: 'CONSUMED' as const,
      rootId: repeatedDigest('1'),
      scopeDigest: repeatedDigest('2'),
      effectOpDigest: repeatedDigest('3'),
      attemptId: '123e4567-e89b-42d3-a456-426614174000',
      generation: 1,
      ...mountBackendEvidence('CONSUMED'),
    };
    expectHold(() => createTaskAttemptCustodyBackendMountTransferReceipt({
      ...base,
      sourcePath: '/host/path',
    } as never), 'CAPABILITY_UNVERIFIED');
    expectHold(() => createTaskAttemptCustodyBackendMountTransferReceipt({
      ...base,
      transferEvidenceDigest: repeatedDigest('8'),
    } as never), 'CAPABILITY_UNVERIFIED');
    expectHold(() => createTaskAttemptCustodyBackendMountTransferReceipt({
      ...base,
      backend: 'process',
    } as never), 'CAPABILITY_UNVERIFIED');

    const malformedFields: ReadonlyArray<Readonly<Record<string, unknown>>> = [
      { backendExecutionId: 'a'.repeat(63) },
      { backendExecutionId: 'A'.repeat(64) },
      { backendImageDigest: `sha256:${'A'.repeat(64)}` },
      { backendAuthorityLabelDigest: 'invalid' },
      { taskSnapshotMountEvidenceDigest: 'invalid' },
      { workerOutputMountEvidenceDigest: 'invalid' },
      { backendBootstrapProbeEvidenceDigest: 'invalid' },
      { daemonMountReceiptDigest: 'invalid' },
      { taskSnapshotMountEvidenceDigest: null },
      { workerOutputMountEvidenceDigest: null },
      { backendBootstrapProbeEvidenceDigest: null },
      { daemonMountReceiptDigest: null },
    ];
    for (const malformed of malformedFields) {
      expectHold(() => createTaskAttemptCustodyBackendMountTransferReceipt({
        ...base,
        ...malformed,
      } as never), 'CAPABILITY_UNVERIFIED');
    }

    const cleanup = {
      ...base,
      state: 'CLEANUP_UNCONFIRMED' as const,
      ...mountBackendEvidence('CLEANUP_UNCONFIRMED'),
    };
    expect(createTaskAttemptCustodyBackendMountTransferReceipt(cleanup)).toMatchObject({
      state: 'CLEANUP_UNCONFIRMED',
      backendExecutionId: null,
      backendImageDigest: null,
      cleanupEvidenceDigest: repeatedDigest('9'),
    });
    expectHold(() => createTaskAttemptCustodyBackendMountTransferReceipt({
      ...cleanup,
      cleanupEvidenceDigest: null,
    }), 'CAPABILITY_UNVERIFIED');
    expectHold(() => createTaskAttemptCustodyBackendMountTransferReceipt({
      ...cleanup,
      cleanupEvidenceDigest: 'invalid',
    } as never), 'CAPABILITY_UNVERIFIED');
  });

  it('rejects sparse, accessor, symbol and extra-property array/object collisions', () => {
    const bounds = policy().jsonBounds;
    const sparse = Array<unknown>(1);
    const extra = [1] as unknown[] & { extra?: number };
    extra.extra = 2;
    const accessor = [1];
    Object.defineProperty(accessor, '0', { enumerable: true, get: () => 1 });
    const symbolRecord = { safe: true } as Record<PropertyKey, unknown>;
    symbolRecord[Symbol('hidden')] = true;
    for (const value of [sparse, extra, accessor, symbolRecord]) {
      expectHold(() => canonicalTaskAttemptCustodyJson(value, bounds), 'INVALID_CANONICAL_JSON');
    }

    const protoRecord = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(protoRecord, '__proto__', {
      enumerable: true,
      value: { polluted: true },
    });
    expect(Buffer.from(canonicalTaskAttemptCustodyJson(protoRecord, bounds)).toString())
      .toBe('{"__proto__":{"polluted":true}}');
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('derives a stable, domain-bound policy digest regardless of map insertion order', () => {
    const first = policy();
    const reversed = Object.fromEntries(
      Object.entries(artifactLimits()).reverse(),
    ) as Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>;
    const second = createTaskAttemptCustodyPolicy({
      schemaVersion: 2,
      metadataMaxBytes: first.metadataMaxBytes,
      jsonBounds: first.jsonBounds,
      artifactLimits: reversed,
    });
    expect(second.policyDigest).toBe(first.policyDigest);
    for (const artifactClass of [
      'worker-landing-proposal',
      'worker-provider-observation',
    ] as const) {
      const changed = createTaskAttemptCustodyPolicy({
        schemaVersion: 2,
        metadataMaxBytes: first.metadataMaxBytes,
        jsonBounds: first.jsonBounds,
        artifactLimits: {
          ...first.artifactLimits,
          [artifactClass]: {
            ...first.artifactLimits[artifactClass],
            maxBytes: first.artifactLimits[artifactClass].maxBytes - 1,
          },
        },
      });
      expect(changed.policyDigest).not.toBe(first.policyDigest);
    }
  });

  it('keeps frozen artifact authority stable under exported and Array prototype mutation', () => {
    for (const projection of [
      TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES,
      TASK_ATTEMPT_CUSTODY_ATTEMPT_OUTPUT_ARTIFACT_CLASSES,
      TASK_ATTEMPT_CUSTODY_HOST_AUTHORITY_ARTIFACT_CLASSES,
    ]) {
      expect(Object.isFrozen(projection)).toBe(true);
      expect(Reflect.set(projection, 0, 'canonical-accepted-result')).toBe(false);
    }

    const { adapter, store } = openedStore();
    const frozenLimits = artifactLimits();
    const includesDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'includes');
    const mapDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'map');
    if (includesDescriptor === undefined || mapDescriptor === undefined) {
      throw new Error('Array prototype descriptors missing');
    }
    let capturedReceiptDigest: Sha256Digest | null = null;
    let verifiedBody: string | null = null;
    try {
      Object.defineProperty(Array.prototype, 'includes', {
        ...includesDescriptor,
        value: () => { throw new Error('ambient includes must not decide artifact authority'); },
      });
      Object.defineProperty(Array.prototype, 'map', {
        ...mapDescriptor,
        value: () => { throw new Error('ambient map must not decide artifact authority'); },
      });
      const taskPolicy = createTaskAttemptCustodyPolicy({
        schemaVersion: 2,
        metadataMaxBytes: 64 * 1024,
        jsonBounds: {
          maxDepth: 20,
          maxNodes: 10_000,
          maxStringBytes: 8 * 1024,
          maxArrayLength: 1_000,
          maxObjectKeys: 128,
          maxCanonicalBytes: 64 * 1024,
        },
        artifactLimits: frozenLimits,
      });
      const taskIdentity = identity();
      const admission = admit(store, taskIdentity, taskPolicy);
      const access = store.openAttemptAccess({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
      });
      if (access === null) throw new Error('attempt access missing');
      const source = store.issueAttemptOutputCaptureSource({
        access,
        childRelativePath: 'prototype-hostile.proposal.json',
        artifactClass: 'worker-landing-proposal',
        artifactKey: 'prototype-hostile',
      });
      const sourcePath = adapter.capabilityPaths.get(source);
      if (!sourcePath) throw new Error('capture source missing');
      adapter.putWorkerOutput(sourcePath, Buffer.from('{"proposal":"bound"}'));
      const receipt = store.captureAttemptOutputArtifact({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
        artifactClass: 'worker-landing-proposal',
        artifactKey: 'prototype-hostile',
        capturedAt: '2026-08-30T20:01:00.000Z',
        source,
      });
      const verified = store.readVerifiedArtifact({
        identity: taskIdentity,
        policy: taskPolicy,
        artifactClass: 'worker-landing-proposal',
        artifactKey: 'prototype-hostile',
        receiptDigest: receipt.receiptDigest,
      });
      capturedReceiptDigest = receipt.receiptDigest;
      verifiedBody = Buffer.from(verified?.bytes ?? []).toString();
    } finally {
      Object.defineProperty(Array.prototype, 'includes', includesDescriptor);
      Object.defineProperty(Array.prototype, 'map', mapDescriptor);
    }
    expect(capturedReceiptDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(verifiedBody).toBe('{"proposal":"bound"}');
  });

  it('fails closed on impossible metadata, artifact and JSON policy bounds', () => {
    const valid = policy();
    expectHold(() => createTaskAttemptCustodyPolicy({
      schemaVersion: 2,
      metadataMaxBytes: 1,
      jsonBounds: valid.jsonBounds,
      artifactLimits: valid.artifactLimits,
    }), 'INVALID_POLICY');
    expectHold(() => createTaskAttemptCustodyPolicy({
      schemaVersion: 2,
      metadataMaxBytes: valid.metadataMaxBytes,
      jsonBounds: { ...valid.jsonBounds, maxDepth: 129 },
      artifactLimits: valid.artifactLimits,
    }), 'INVALID_POLICY');
    expectHold(() => createTaskAttemptCustodyPolicy({
      schemaVersion: 2,
      metadataMaxBytes: valid.metadataMaxBytes,
      jsonBounds: valid.jsonBounds,
      artifactLimits: {
        ...valid.artifactLimits,
        'worker-result': {
          minBytes: 1,
          maxBytes: TASK_ATTEMPT_CUSTODY_HARD_MAX_BYTES + 1,
          requireSingleLink: true,
        },
      },
    }), 'INVALID_POLICY');

    const forged = { ...valid, policyDigest: `sha256:${'0'.repeat(64)}` as Sha256Digest };
    expectHold(() => parseTaskAttemptCustodyAdmissionV2({}, forged), 'INVALID_POLICY');
  });

  it('rejects unknown, symbol and accessor fields in nested policy records', () => {
    const valid = policy();
    for (const artifactClass of [
      'worker-landing-proposal',
      'worker-provider-observation',
    ] as const) {
      const missingLimits = {
        ...valid.artifactLimits,
      } as Partial<Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>>;
      delete missingLimits[artifactClass];
      expectHold(() => createTaskAttemptCustodyPolicy({
        schemaVersion: 2,
        metadataMaxBytes: valid.metadataMaxBytes,
        jsonBounds: valid.jsonBounds,
        artifactLimits: missingLimits as TaskAttemptCustodyPolicyV2['artifactLimits'],
      }), 'INVALID_POLICY');
    }
    const extraLimits = {
      ...valid.artifactLimits,
      extra: { minBytes: 1, maxBytes: 2, requireSingleLink: true },
    } as unknown as TaskAttemptCustodyPolicyV2['artifactLimits'];
    expectHold(() => parseTaskAttemptCustodyAdmissionV2({}, {
      ...valid,
      artifactLimits: extraLimits,
    }), 'INVALID_POLICY');

    const symbolLimits = { ...valid.artifactLimits } as Record<PropertyKey, unknown>;
    symbolLimits[Symbol('hidden-limit')] = { minBytes: 1, maxBytes: 2, requireSingleLink: true };
    expectHold(() => createTaskAttemptCustodyPolicy({
      schemaVersion: 2,
      metadataMaxBytes: valid.metadataMaxBytes,
      jsonBounds: valid.jsonBounds,
      artifactLimits: symbolLimits as TaskAttemptCustodyPolicyV2['artifactLimits'],
    }), 'INVALID_POLICY');

    const accessorLimit = Object.defineProperties({}, {
      minBytes: { enumerable: true, get: () => 1 },
      maxBytes: { enumerable: true, value: 1024 },
      requireSingleLink: { enumerable: true, value: true },
    }) as TaskAttemptCustodyArtifactLimit;
    expectHold(() => createTaskAttemptCustodyPolicy({
      schemaVersion: 2,
      metadataMaxBytes: valid.metadataMaxBytes,
      jsonBounds: valid.jsonBounds,
      artifactLimits: {
        ...valid.artifactLimits,
        'worker-result': accessorLimit,
      },
    }), 'INVALID_POLICY');
  });

  it.each([
    '/absolute',
    '../escape',
    'safe/../escape',
    'C:/windows',
    'safe\\windows',
    'safe/CON',
    'safe/name:stream',
    'safe/trailing.',
  ])('rejects unsafe cross-platform relative path %s', path => {
    expectHold(() => taskAttemptCustodyRelativePath(path), 'UNSAFE_RELATIVE_PATH');
  });

  it('binds one Store to the exact canonical project root and project id', () => {
    const { store } = openedStore();
    expect(store.root.projectId).toBe('project-1');
    expect(store.root.canonicalProjectRootSha256).toBe(PROJECT_ROOT_SHA256);
    expectHold(() => admit(store, identity({ projectId: 'project-2' }), policy()), 'ADMISSION_MISMATCH');
    expectHold(
      () => admit(store, identity({ projectRootSha256: 'b'.repeat(64) }), policy()),
      'ADMISSION_MISMATCH',
    );

    const adapter = new InMemoryCustodyAdapter();
    const originalOpen = adapter.openRoot.bind(adapter);
    adapter.openRoot = input => Object.freeze({
      ...originalOpen(input),
      projectId: 'substituted-project',
    });
    expectHold(() => TaskAttemptCustodyStore.open({
      adapter,
      absoluteRoot: '/test/host-custody',
      canonicalProjectRoot: CANONICAL_PROJECT_ROOT,
      projectId: 'project-1',
      create: true,
    }), 'CREATE_UNCONFIRMED');

    const proxyAdapter = new InMemoryCustodyAdapter();
    const proxyOpen = proxyAdapter.openRoot.bind(proxyAdapter);
    proxyAdapter.openRoot = input => {
      const target = {
        ...proxyOpen(input),
        platform: 'win32' as const,
      };
      let platformReads = 0;
      return new Proxy(target, {
        get: (proxyTarget, property, receiver) => {
          if (property === 'platform') {
            platformReads += 1;
            return platformReads === 1 ? 'posix' : 'win32';
          }
          return Reflect.get(proxyTarget, property, receiver);
        },
      });
    };
    expectHold(() => TaskAttemptCustodyStore.open({
      adapter: proxyAdapter,
      absoluteRoot: '/test/host-custody',
      canonicalProjectRoot: CANONICAL_PROJECT_ROOT,
      projectId: 'project-1',
      create: true,
    }), 'CREATE_UNCONFIRMED');
  });

  it('rejects Proxy/accessor authority before reflection and captures adapter methods once', () => {
    const inputAdapter = new InMemoryCustodyAdapter();
    let inputReads = 0;
    const proxiedInput = new Proxy({
      adapter: inputAdapter,
      absoluteRoot: '/test/host-custody',
      canonicalProjectRoot: CANONICAL_PROJECT_ROOT,
      projectId: 'project-1',
      create: true,
    }, {
      get: (target, property, receiver) => {
        inputReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    expectHold(
      () => TaskAttemptCustodyStore.open(proxiedInput),
      'CAPABILITY_UNVERIFIED',
    );
    expect(inputReads).toBe(0);

    const accessorAdapter = new InMemoryCustodyAdapter();
    let methodReads = 0;
    Object.defineProperty(accessorAdapter, 'openRoot', {
      configurable: true,
      get: () => {
        methodReads += 1;
        return InMemoryCustodyAdapter.prototype.openRoot;
      },
    });
    expectHold(() => openedStore(accessorAdapter), 'CAPABILITY_UNVERIFIED');
    expect(methodReads).toBe(0);

    const adapterTarget = new InMemoryCustodyAdapter();
    let adapterReads = 0;
    const proxiedAdapter = new Proxy(adapterTarget, {
      get: (target, property, receiver) => {
        adapterReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    expectHold(() => TaskAttemptCustodyStore.open({
      adapter: proxiedAdapter,
      absoluteRoot: '/test/host-custody',
      canonicalProjectRoot: CANONICAL_PROJECT_ROOT,
      projectId: 'project-1',
      create: true,
    }), 'CAPABILITY_UNVERIFIED');
    expect(adapterReads).toBe(0);

    const mutableAdapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(mutableAdapter);
    mutableAdapter.publishBytesFirstWriter = () => {
      throw new Error('mutated adapter method must not enter captured facade');
    };
    expect(admit(store, identity(), policy()).state).toBe('admitted');
  });

  it('classifies malformed post-create directory evidence as CREATE_UNCONFIRMED', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    adapter.malformedNextDirectoryProof = true;
    expectHold(() => admit(store, identity(), policy()), 'CREATE_UNCONFIRMED');
  });

  it('rejects uppercase UUID aliases at the identity boundary', () => {
    const { store } = openedStore();
    expectHold(() => admit(store, identity({
      attemptId: '123E4567-E89B-42D3-A456-426614174000',
    }), policy()), 'INVALID_IDENTITY');
  });

  it('requires durable admission before any attempt artifact', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    expectHold(() => store.publishHostArtifact({
      identity: identity(),
      policy: taskPolicy,
      admissionReceiptDigest: `sha256:${'9'.repeat(64)}`,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'primary',
      capturedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('{"taskId":"001-001"}'),
    }), 'ADMISSION_REQUIRED');
  });

  it('creates admission first-writer state idempotently and binds root capability proof', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const first = admit(store, identity(), taskPolicy);
    const second = admit(store, identity(), taskPolicy);
    expect(second).toEqual(first);
    expect(first.custodyRootId).toBe(ROOT_PROOF.rootId);
    expect(first.custodyCapabilityEvidenceDigest).toBe(ROOT_PROOF.capabilityEvidenceDigest);
    expect(first.taskSnapshot.relativePath).toContain('/generations/1/snapshot/task.json');
    expect(first.workerOutputDirectory.relativePath).toContain('/generations/1/worker-output');
  });

  it('rejects publication/readback physical proof substitution', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    adapter.substituteReadbackProof = true;
    expectHold(() => admit(store, identity(), policy()), 'PUBLISHED_UNCONFIRMED');
  });

  it('rejects accessor adapter envelopes and exposes only one opaque mount lease', async () => {
    const accessorAdapter = new InMemoryCustodyAdapter();
    const originalPublish = accessorAdapter.publishBytesFirstWriter.bind(accessorAdapter);
    accessorAdapter.publishBytesFirstWriter = input => {
      const publication = originalPublish(input);
      return Object.defineProperties({}, {
        state: { enumerable: true, get: () => publication.state },
        proof: { enumerable: true, get: () => publication.proof },
      }) as TaskAttemptCustodyPublication;
    };
    expectHold(
      () => admit(openedStore(accessorAdapter).store, identity(), policy()),
      'PUBLISHED_UNCONFIRMED',
    );

    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    expect(Reflect.ownKeys(lease)).toEqual([]);
    expect(JSON.stringify(lease)).toBe('{}');
    expect(JSON.stringify(lease)).not.toMatch(/(?:path|source|fd|handle)/iu);
    expectHold(
      () => store.issueAttemptMountLease({ access, policy: taskPolicy }),
      'RECONCILIATION_REQUIRED',
    );
    const transfer = await store.consumeAttemptMountLease(lease);
    expect(Object.isFrozen(transfer)).toBe(true);
    expect(transfer).toMatchObject({
      state: 'CONSUMED',
      scopeDigest: access.scopeDigest,
      attemptId: taskIdentity.attemptId,
      generation: taskIdentity.generation,
    });
    expect(adapter.mountConsumeCalls).toBe(1);
    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'LEASE_CONSUMED',
    });
    await expect(store.consumeAttemptMountLease({} as typeof lease)).rejects.toMatchObject({
      code: 'CAPABILITY_UNVERIFIED',
    });
  });

  it('returns only finite frozen HOLD truth and never exposes a raw adapter cause', () => {
    const adapter = new InMemoryCustodyAdapter();
    let proxyReads = 0;
    const rawCause = new Proxy({
      code: 'CAPABILITY_UNVERIFIED',
      sourcePath: '/proc/999/fd/42',
    }, {
      get: (target, property, receiver) => {
        proxyReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    adapter.openRoot = () => { throw rawCause; };
    let observed: unknown;
    try {
      openedStore(adapter);
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(TaskAttemptCustodyHold);
    expect(observed).toMatchObject({
      code: 'CAPABILITY_UNVERIFIED',
      operation: 'open-root',
    });
    expect(Object.isFrozen(observed)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(observed, 'cause')).toBe(false);
    expect('cause' in (observed as object)).toBe(false);
    expect(String(observed)).not.toContain('/proc/999/fd/42');
    expect((observed as Error).stack).toBe(
      'TaskAttemptCustodyHold: TASK_ATTEMPT_CUSTODY_HOLD:CAPABILITY_UNVERIFIED',
    );
    expect(proxyReads).toBe(0);
  });

  it('maps every adapter read primitive to cause-less finite HOLD truth', () => {
    const shared = memoryCustodyState();
    const setupAdapter = new InMemoryCustodyAdapter(shared);
    const { store: setupStore } = openedStore(setupAdapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    admit(setupStore, taskIdentity, taskPolicy);

    for (const readPrimitive of [
      'readFirstWriterError',
      'readVerifiedError',
      'readPrivateDirectoryError',
      'readDurableEffectMarkerError',
    ] as const) {
      const adapter = new InMemoryCustodyAdapter(shared);
      const { store } = openedStore(adapter);
      let proxyReads = 0;
      adapter[readPrimitive] = new Proxy({
        code: 'CAPABILITY_UNVERIFIED',
        sourcePath: '/proc/777/fd/91',
      }, {
        get: (target, property, receiver) => {
          proxyReads += 1;
          return Reflect.get(target, property, receiver);
        },
      });
      let observed: unknown;
      try {
        store.readAdmission(taskIdentity, taskPolicy);
      } catch (error) {
        observed = error;
      }
      const expectedCode = readPrimitive === 'readDurableEffectMarkerError'
        ? 'RECONCILIATION_REQUIRED'
        : 'CAPABILITY_UNVERIFIED';
      expect(observed).toBeInstanceOf(TaskAttemptCustodyHold);
      expect(observed).toMatchObject({ code: expectedCode });
      expect(Object.isFrozen(observed)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(observed, 'cause')).toBe(false);
      expect(String(observed)).not.toContain('/proc/777/fd/91');
      expect((observed as Error).stack).toBe(
        `TaskAttemptCustodyHold: TASK_ATTEMPT_CUSTODY_HOLD:${expectedCode}`,
      );
      expect(proxyReads).toBe(0);
    }
  });

  it('uses conservative typed HOLDs for post-effect readback failures', () => {
    const taskPolicy = policy();
    const taskIdentity = identity();
    for (const scenario of ['directory', 'file'] as const) {
      const adapter = new InMemoryCustodyAdapter();
      const { store } = openedStore(adapter);
      const admission = admit(store, taskIdentity, taskPolicy);
      let getterReads = 0;
      const rawCause = Object.defineProperty({
        sourcePath: '/private/host/custody/path',
      }, 'code', {
        get: () => {
          getterReads += 1;
          return 'CAPABILITY_UNVERIFIED';
        },
      });
      if (scenario === 'directory') {
        adapter.readPrivateDirectoryErrorForPathSuffix = {
          suffix: '/artifacts/evaluation-receipt',
          error: rawCause,
        };
      } else {
        adapter.readVerifiedErrorForPathSuffix = {
          suffix: '/post-effect-readback.bin',
          error: rawCause,
        };
      }
      let observed: unknown;
      try {
        store.publishHostArtifact({
          identity: taskIdentity,
          policy: taskPolicy,
          admissionReceiptDigest: admission.receiptDigest,
          artifactClass: 'evaluation-receipt',
          artifactKey: scenario === 'directory' ? 'post-effect-directory' : 'post-effect-readback',
          capturedAt: '2026-08-30T20:01:00.000Z',
          bytes: Buffer.from('{"state":"effect-may-exist"}'),
        });
      } catch (error) {
        observed = error;
      }
      expect(observed).toBeInstanceOf(TaskAttemptCustodyHold);
      expect(observed).toMatchObject({
        code: scenario === 'directory' ? 'CREATE_UNCONFIRMED' : 'PUBLISHED_UNCONFIRMED',
      });
      expect(Object.prototype.hasOwnProperty.call(observed, 'cause')).toBe(false);
      expect(String(observed)).not.toContain('/private/host/custody/path');
      expect(getterReads).toBe(0);
    }
  });

  it('rejects foreign and stale-generation mount authority before adapter consumption', async () => {
    const shared = memoryCustodyState();
    const firstAdapter = new InMemoryCustodyAdapter(shared);
    const { store: firstStore } = openedStore(firstAdapter);
    const taskPolicy = policy();
    const firstIdentity = identity();
    const firstAdmission = admit(firstStore, firstIdentity, taskPolicy);
    const firstAccess = firstStore.openAttemptAccess({
      identity: firstIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: firstAdmission.receiptDigest,
    });
    if (firstAccess === null) throw new Error('attempt access missing');
    const lease = firstStore.issueAttemptMountLease({ access: firstAccess, policy: taskPolicy });

    const secondAdapter = new InMemoryCustodyAdapter(shared);
    const { store: secondStore } = openedStore(secondAdapter);
    await expect(secondStore.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'CAPABILITY_UNVERIFIED',
    });
    expect(secondAdapter.mountConsumeCalls).toBe(0);

    const nextIdentity = identity({ generation: 2 });
    const nextAdmission = admit(
      firstStore,
      nextIdentity,
      taskPolicy,
      firstAdmission.receiptDigest,
      firstIdentity,
    );
    expectHold(() => firstStore.issueAttemptMountLease({
      access: {
        ...firstAccess,
        identity: nextIdentity,
        admissionReceiptDigest: nextAdmission.receiptDigest,
      },
      policy: taskPolicy,
    }), 'CAPABILITY_UNVERIFIED');
  });

  it('moves a mount lease to CONSUMING before await and never reopens on rejection', async () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    let release!: () => void;
    adapter.mountConsumeGate = new Promise<void>(resolve => { release = resolve; });
    const consuming = store.consumeAttemptMountLease(lease);
    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'LEASE_CONSUMED',
    });
    release();
    await consuming;
    expect(adapter.mountConsumeCalls).toBe(1);

    const rejectedAdapter = new InMemoryCustodyAdapter();
    const { store: rejectedStore } = openedStore(rejectedAdapter);
    const rejectedAdmission = admit(rejectedStore, taskIdentity, taskPolicy);
    const rejectedAccess = rejectedStore.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: rejectedAdmission.receiptDigest,
    });
    if (rejectedAccess === null) throw new Error('attempt access missing');
    const rejectedLease = rejectedStore.issueAttemptMountLease({
      access: rejectedAccess,
      policy: taskPolicy,
    });
    let getterReads = 0;
    rejectedAdapter.mountConsumeError = Object.defineProperty({}, 'code', {
      get: () => {
        getterReads += 1;
        return 'CLEANUP_UNCONFIRMED';
      },
    });
    await expect(rejectedStore.consumeAttemptMountLease(rejectedLease)).rejects.toMatchObject({
      code: 'CLEANUP_UNCONFIRMED',
    });
    expect(getterReads).toBe(0);
    await expect(rejectedStore.consumeAttemptMountLease(rejectedLease)).rejects.toMatchObject({
      code: 'CLEANUP_UNCONFIRMED',
    });
  });

  it('keeps cleanup-uncertain mount consumption terminal', async () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    adapter.mountTransferState = 'CLEANUP_UNCONFIRMED';
    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'CLEANUP_UNCONFIRMED',
    });
    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'CLEANUP_UNCONFIRMED',
    });
    expect(adapter.mountConsumeCalls).toBe(1);
  });

  it('persists mount intent before issue and never mints a replacement lease', async () => {
    const shared = memoryCustodyState();
    const firstAdapter = new InMemoryCustodyAdapter(shared);
    const { store: firstStore } = openedStore(firstAdapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(firstStore, taskIdentity, taskPolicy);
    const access = firstStore.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = firstStore.issueAttemptMountLease({ access, policy: taskPolicy });
    expect(firstAdapter.mountIssueCalls).toBe(0);
    firstAdapter.mountConsumeError = Object.freeze({ code: 'CAPABILITY_UNVERIFIED' });
    await expect(firstStore.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'CLEANUP_UNCONFIRMED',
    });
    expect(firstAdapter.mountIssueCalls).toBe(1);

    expectHold(
      () => firstStore.issueAttemptMountLease({ access, policy: taskPolicy }),
      'RECONCILIATION_REQUIRED',
    );
    expect(firstAdapter.mountIssueCalls).toBe(1);

    const restartedAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(restartedAdapter);
    const restartedAccess = restartedStore.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (restartedAccess === null) throw new Error('restarted attempt access missing');
    expectHold(() => restartedStore.issueAttemptMountLease({
      access: restartedAccess,
      policy: taskPolicy,
    }), 'RECONCILIATION_REQUIRED');
    expect(restartedAdapter.mountIssueCalls).toBe(0);
  });

  it('blocks restart reissuance when an issued opaque mount lease is abandoned', () => {
    const shared = memoryCustodyState();
    const firstAdapter = new InMemoryCustodyAdapter(shared);
    const { store: firstStore } = openedStore(firstAdapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(firstStore, taskIdentity, taskPolicy);
    const access = firstStore.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const abandoned = firstStore.issueAttemptMountLease({ access, policy: taskPolicy });
    expect(Reflect.ownKeys(abandoned)).toEqual([]);
    expect(firstAdapter.mountIssueCalls).toBe(0);

    const restartedAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(restartedAdapter);
    const restartedAccess = restartedStore.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (restartedAccess === null) throw new Error('restarted attempt access missing');
    expectHold(() => restartedStore.issueAttemptMountLease({
      access: restartedAccess,
      policy: taskPolicy,
    }), 'RECONCILIATION_REQUIRED');
    expect(restartedAdapter.mountIssueCalls).toBe(0);
  });

  it('binds mount receipt evidence durably and rejects same-store and restart reissuance', async () => {
    const shared = memoryCustodyState();
    const adapter = new InMemoryCustodyAdapter(shared);
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    const transfer = await store.consumeAttemptMountLease(lease);
    const outcome = [...shared.effectMarkers.values()].find(marker => (
      marker.phase === 'OUTCOME'
      && marker.effectReceiptDigest === transfer.receiptDigest
    ));
    expect(outcome).toMatchObject({
      effectReceiptDigest: transfer.receiptDigest,
      effectEvidenceDigest: transfer.transferEvidenceDigest,
    });
    expect(adapter.mountIssueCalls).toBe(1);

    expectHold(
      () => store.issueAttemptMountLease({ access, policy: taskPolicy }),
      'LEASE_CONSUMED',
    );
    expect(adapter.mountIssueCalls).toBe(1);

    const restartedAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(restartedAdapter);
    const restartedAccess = restartedStore.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (restartedAccess === null) throw new Error('restarted attempt access missing');
    expectHold(() => restartedStore.issueAttemptMountLease({
      access: restartedAccess,
      policy: taskPolicy,
    }), 'LEASE_CONSUMED');
    expect(restartedAdapter.mountIssueCalls).toBe(0);
  });

  it('terminalizes malformed mount transfer receipts and never replays them after restart', async () => {
    const shared = memoryCustodyState();
    const adapter = new InMemoryCustodyAdapter(shared);
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    adapter.nextMountTransferOverride = Object.freeze({ state: 'CONSUMED' });

    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'CLEANUP_UNCONFIRMED',
    });
    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'CLEANUP_UNCONFIRMED',
    });
    expect(adapter.mountConsumeCalls).toBe(1);

    const restartedAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(restartedAdapter);
    const restartedAccess = restartedStore.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (restartedAccess === null) throw new Error('restarted attempt access missing');
    expectHold(() => restartedStore.issueAttemptMountLease({
      access: restartedAccess,
      policy: taskPolicy,
    }), 'RECONCILIATION_REQUIRED');
    expect(restartedAdapter.mountIssueCalls).toBe(0);
  });

  it('rejects forged, extra, missing and null-on-success mount receipt snapshots', async () => {
    const mutations: ReadonlyArray<
      (receipt: TaskAttemptCustodyBackendMountTransferReceipt) => unknown
    > = [
      receipt => Object.freeze({
        ...receipt,
        transferEvidenceDigest: repeatedDigest('7'),
      }),
      receipt => Object.freeze({
        ...receipt,
        receiptDigest: repeatedDigest('7'),
      }),
      receipt => Object.freeze({
        ...receipt,
        sourcePath: '/host/path-must-never-cross-store-boundary',
      }),
      receipt => {
        const { daemonMountReceiptDigest: _omitted, ...missing } = receipt;
        return Object.freeze(missing);
      },
      receipt => Object.freeze({
        ...receipt,
        backendExecutionId: null,
      }),
    ];

    for (const mutate of mutations) {
      const adapter = new InMemoryCustodyAdapter();
      const { store } = openedStore(adapter);
      const taskPolicy = policy();
      const taskIdentity = identity();
      const admission = admit(store, taskIdentity, taskPolicy);
      const access = store.openAttemptAccess({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
      });
      if (access === null) throw new Error('attempt access missing');
      const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
      adapter.nextMountTransferMutation = mutate;

      await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
        code: 'CLEANUP_UNCONFIRMED',
      });
      await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
        code: 'CLEANUP_UNCONFIRMED',
      });
      expect(adapter.mountConsumeCalls).toBe(1);
    }
  });

  it('rejects a self-consistent mount receipt bound to another generation', async () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    adapter.mountTransferGenerationDelta = 1;

    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'CLEANUP_UNCONFIRMED',
    });
    expect(adapter.mountConsumeCalls).toBe(1);
    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'CLEANUP_UNCONFIRMED',
    });
  });

  it('keeps exact mount transfer success in reconciliation when OUTCOME durability fails', async () => {
    const shared = memoryCustodyState();
    const adapter = new InMemoryCustodyAdapter(shared);
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    adapter.failNextEffectOutcome = true;

    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'RECONCILIATION_REQUIRED',
    });
    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'RECONCILIATION_REQUIRED',
    });
    expect(adapter.mountConsumeCalls).toBe(1);

    const restartedAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(restartedAdapter);
    const restartedAccess = restartedStore.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (restartedAccess === null) throw new Error('restarted attempt access missing');
    expectHold(() => restartedStore.issueAttemptMountLease({
      access: restartedAccess,
      policy: taskPolicy,
    }), 'RECONCILIATION_REQUIRED');
    expect(restartedAdapter.mountIssueCalls).toBe(0);
  });

  it('rejects a self-consistent OUTCOME carrying substituted transfer evidence', async () => {
    const shared = memoryCustodyState();
    const adapter = new InMemoryCustodyAdapter(shared);
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    adapter.substituteNextOutcomeEvidence = true;

    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'RECONCILIATION_REQUIRED',
    });
    expect(adapter.mountConsumeCalls).toBe(1);
    expect([...shared.effectMarkers.values()]).toContainEqual(expect.objectContaining({
      phase: 'OUTCOME',
      effectReceiptDigest: `sha256:${'e'.repeat(64)}`,
      effectEvidenceDigest: `sha256:${'f'.repeat(64)}`,
    }));

    const restartedAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(restartedAdapter);
    const restartedAccess = restartedStore.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (restartedAccess === null) throw new Error('restarted access missing');
    expectHold(() => restartedStore.issueAttemptMountLease({
      access: restartedAccess,
      policy: taskPolicy,
    }), 'LEASE_CONSUMED');
    expect(restartedAdapter.mountIssueCalls).toBe(0);
  });

  it('accepts an identical artifact replay and rejects conflicting first-writer bytes', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const input = {
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt' as const,
      artifactKey: 'primary',
      capturedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('{"taskId":"001-001"}'),
    };
    const first = store.publishHostArtifact(input);
    expect(store.publishHostArtifact(input)).toEqual(first);
    expectHold(
      () => store.publishHostArtifact({ ...input, bytes: Buffer.from('{"taskId":"spoof"}') }),
      'FIRST_WRITER_COLLISION',
    );
  });

  it('persists a canonical zero-byte staged chunk only when policy explicitly permits it', () => {
    const { store } = openedStore();
    const basePolicy = policy();
    const limits = artifactLimits();
    limits['execution-effect-staged-content'] = {
      minBytes: 0,
      maxBytes: limits['execution-effect-staged-content'].maxBytes,
      requireSingleLink: true,
    };
    const zeroPolicy = createTaskAttemptCustodyPolicy({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      metadataMaxBytes: basePolicy.metadataMaxBytes,
      jsonBounds: basePolicy.jsonBounds,
      artifactLimits: limits,
    });
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, zeroPolicy);
    const receipt = store.publishHostArtifact({
      identity: taskIdentity,
      policy: zeroPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'execution-effect-staged-content',
      artifactKey: 'empty-chunk',
      capturedAt: '2026-08-30T20:01:00.000Z',
      bytes: new Uint8Array(0),
    });
    const verified = store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: zeroPolicy,
      artifactClass: 'execution-effect-staged-content',
      artifactKey: receipt.artifactKey,
      receiptDigest: receipt.receiptDigest,
    });
    expect(verified?.bytes).toHaveLength(0);
    expect(receipt.artifact.byteLength).toBe(0);
    expectHold(() => store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: basePolicy,
      artifactClass: 'execution-effect-staged-content',
      artifactKey: receipt.artifactKey,
      receiptDigest: receipt.receiptDigest,
    }), 'CORRUPT_CUSTODY_RECORD');
  });

  it('keeps execution-effect evidence host-only and rejects arbitrary artifact classes', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const effectClasses = [
      'execution-workspace-snapshot',
      'execution-effect-manifest',
      'execution-effect-staged-content',
      'execution-effect-landing-journal',
      'execution-effect-landing-receipt',
    ] as const;
    expect(TASK_ATTEMPT_CUSTODY_HOST_AUTHORITY_ARTIFACT_CLASSES)
      .toEqual(expect.arrayContaining(effectClasses));
    for (const artifactClass of effectClasses) {
      expect(TASK_ATTEMPT_CUSTODY_ATTEMPT_OUTPUT_ARTIFACT_CLASSES)
        .not.toContain(artifactClass);
      expectHold(() => store.captureAttemptOutputArtifact({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
        artifactClass: artifactClass as never,
        artifactKey: 'laundered',
        capturedAt: '2026-08-30T20:01:00.000Z',
        source: {} as TaskAttemptCustodyPathCapability,
      }), 'ARTIFACT_REPLAY_MISMATCH');
    }
    expectHold(() => store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'arbitrary-host-artifact' as never,
      artifactKey: 'arbitrary',
      capturedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('forbidden'),
    }), 'ARTIFACT_REPLAY_MISMATCH');
  });

  it('publishes and reads only an exact committed effect-landing receipt', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const landing = publishEffectLanding({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    expect(landing.artifactReceipt.captureMode).toBe('host-authority-publication');
    expect(store.readEffectLandingReceipt({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactKey: landing.artifactReceipt.artifactKey,
    })).toEqual(landing.semanticReceipt);
    const verifiedLanding = store.readVerifiedEffectLanding({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactKey: landing.artifactReceipt.artifactKey,
    });
    expect(verifiedLanding?.landing).toEqual(landing.semanticReceipt);
    expect(verifiedLanding?.verifiedBundle.terminal.disposition).toBe('COMMITTED_NO_CHANGE');
    expect(verifiedLanding?.verifiedBundle.terminal.operations).toEqual([]);
    expect(verifiedLanding?.workspaceRelease.receiptDigest).toMatch(/^sha256:/u);
    expect(verifiedLanding?.verifiedBundle.workspace.dependencyResource)
      .toEqual(landing.dependencyResource);
    expect(verifiedLanding?.workspaceRelease.dependencyResourceDigest)
      .toBe(landing.dependencyResource.resourceDigest);
    expect(verifiedLanding?.workspaceRelease.dependencyVolume).toMatchObject({
      volumeName: landing.dependencyResource.volumeName,
      volumeNameDigest: landing.dependencyResource.volumeNameDigest,
      volumeIdentityDigest: landing.dependencyResource.volumeIdentityDigest,
    });
    expect(verifiedLanding?.workspaceRelease.releasedAt)
      .toBe(landing.semanticReceipt.releasedAt);
    expect(Object.isFrozen(verifiedLanding)).toBe(true);
    expect(parseTaskAttemptCustodyEffectLandingReceiptV2(
      landing.semanticReceipt,
      taskPolicy,
    )).toEqual(landing.semanticReceipt);
    expect(parseTaskAttemptCustodyEffectLandingReceiptV2({
      ...landing.semanticReceipt,
      state: 'prepared',
    }, taskPolicy)).toBeNull();
    expect(parseTaskAttemptCustodyEffectLandingReceiptV2({
      ...landing.semanticReceipt,
      receiptDigest: repeatedDigest('0'),
    }, taskPolicy)).toBeNull();
    expect(parseTaskAttemptCustodyEffectLandingReceiptV2({
      ...landing.semanticReceipt,
      extra: true,
    }, taskPolicy)).toBeNull();

    const bytes = canonicalTaskAttemptCustodyJson(
      landing.semanticReceipt,
      taskPolicy.jsonBounds,
    );
    expect(store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'execution-effect-landing-receipt',
      artifactKey: landing.artifactReceipt.artifactKey,
      capturedAt: landing.semanticReceipt.releasedAt,
      bytes,
    })).toEqual(landing.artifactReceipt);
    expectHold(() => store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'execution-effect-landing-receipt',
      artifactKey: 'non-canonical-landing',
      capturedAt: landing.semanticReceipt.committedAt,
      bytes: Buffer.from(JSON.stringify(landing.semanticReceipt, null, 2)),
    }), 'ARTIFACT_REPLAY_MISMATCH');

    const swappedReference = createTaskAttemptCustodyEffectLandingReceiptV2({
      identity: landing.semanticReceipt.identity,
      admissionReceiptDigest: landing.semanticReceipt.admissionReceiptDigest,
      policyDigest: landing.semanticReceipt.policyDigest,
      disposition: landing.semanticReceipt.disposition,
      workspaceSnapshot: {
        ...landing.semanticReceipt.workspaceSnapshot,
        artifactReceiptDigest: repeatedDigest('9'),
      },
      baselineManifest: landing.semanticReceipt.baselineManifest,
      finalManifest: landing.semanticReceipt.finalManifest,
      stagedContents: landing.semanticReceipt.stagedContents,
      landingJournal: landing.semanticReceipt.landingJournal,
      workspaceRelease: landing.semanticReceipt.workspaceRelease,
      effectDecisionDigest: landing.semanticReceipt.effectDecisionDigest,
      transactionDigest: landing.semanticReceipt.transactionDigest,
      committedAt: landing.semanticReceipt.committedAt,
      releasedAt: landing.semanticReceipt.releasedAt,
    }, taskPolicy);
    expectHold(() => store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'execution-effect-landing-receipt',
      artifactKey: 'swapped-landing',
      capturedAt: swappedReference.releasedAt,
      bytes: canonicalTaskAttemptCustodyJson(swappedReference, taskPolicy.jsonBounds),
    }), 'ARTIFACT_REPLAY_MISMATCH');

    const landingWithReferences = (
      workspaceSnapshot: typeof landing.semanticReceipt.workspaceSnapshot,
      workspaceRelease: typeof landing.semanticReceipt.workspaceRelease,
    ) => createTaskAttemptCustodyEffectLandingReceiptV2({
      identity: landing.semanticReceipt.identity,
      admissionReceiptDigest: landing.semanticReceipt.admissionReceiptDigest,
      policyDigest: landing.semanticReceipt.policyDigest,
      disposition: landing.semanticReceipt.disposition,
      workspaceSnapshot,
      baselineManifest: landing.semanticReceipt.baselineManifest,
      finalManifest: landing.semanticReceipt.finalManifest,
      stagedContents: landing.semanticReceipt.stagedContents,
      landingJournal: landing.semanticReceipt.landingJournal,
      workspaceRelease,
      effectDecisionDigest: landing.semanticReceipt.effectDecisionDigest,
      transactionDigest: landing.semanticReceipt.transactionDigest,
      committedAt: landing.semanticReceipt.committedAt,
      releasedAt: landing.semanticReceipt.releasedAt,
    }, taskPolicy);

    const { dependencyResource: _missingDependency, ...missingDependencySeal } =
      landing.workspaceSeal;
    const missingDependencyArtifact = store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'execution-workspace-snapshot',
      artifactKey: 'missing-dependency-workspace',
      capturedAt: landing.workspaceSeal.sealedAt,
      bytes: canonicalTaskAttemptCustodyJson(missingDependencySeal, taskPolicy.jsonBounds),
    });
    const missingDependencyLanding = landingWithReferences(
      {
        artifactKey: missingDependencyArtifact.artifactKey,
        artifactReceiptDigest: missingDependencyArtifact.receiptDigest,
      },
      landing.semanticReceipt.workspaceRelease,
    );
    expectHold(() => store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'execution-effect-landing-receipt',
      artifactKey: 'missing-dependency-landing',
      capturedAt: missingDependencyLanding.releasedAt,
      bytes: canonicalTaskAttemptCustodyJson(missingDependencyLanding, taskPolicy.jsonBounds),
    }), 'ARTIFACT_REPLAY_MISMATCH');

    const foreignDependency = createExecutionEffectDependencyResourceV1({
      attempt: landing.workspaceSeal.attempt,
      admissionReceiptDigest: landing.workspaceSeal.admissionReceiptDigest,
      custodyPolicyDigest: landing.workspaceSeal.custodyPolicyDigest,
      imageIdentityDigest: repeatedDigest('0'),
      labelsDigest: repeatedDigest('1'),
      mountPlanDigest: repeatedDigest('2'),
      populationReceiptDigest: repeatedDigest('3'),
      volumeName: 'deckent-dependency-foreign',
      volumeIdentityDigest: repeatedDigest('4'),
      readyAt: '2026-08-30T20:01:59.000Z',
    });
    const foreignWorkspace = createExecutionEffectWorkspaceSnapshotSealV1({
      attempt: landing.workspaceSeal.attempt,
      admissionReceiptDigest: landing.workspaceSeal.admissionReceiptDigest,
      custodyPolicyDigest: landing.workspaceSeal.custodyPolicyDigest,
      writePolicyDigest: landing.workspaceSeal.writePolicyDigest,
      workspaceIdentity: landing.workspaceSeal.workspaceIdentity,
      workspaceResource: landing.workspaceResource,
      dependencyResource: foreignDependency,
      nativeCapabilityDigest: landing.workspaceSeal.nativeCapabilityDigest,
      platform: landing.workspaceSeal.platform,
      sealedAt: landing.workspaceSeal.sealedAt,
    });
    const foreignWorkspaceArtifact = store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'execution-workspace-snapshot',
      artifactKey: 'foreign-dependency-workspace',
      capturedAt: foreignWorkspace.sealedAt,
      bytes: canonicalTaskAttemptCustodyJson(foreignWorkspace, taskPolicy.jsonBounds),
    });
    const replayedDependencyLanding = landingWithReferences(
      {
        artifactKey: foreignWorkspaceArtifact.artifactKey,
        artifactReceiptDigest: foreignWorkspaceArtifact.receiptDigest,
      },
      landing.semanticReceipt.workspaceRelease,
    );
    expectHold(() => store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'execution-effect-landing-receipt',
      artifactKey: 'replayed-dependency-landing',
      capturedAt: replayedDependencyLanding.releasedAt,
      bytes: canonicalTaskAttemptCustodyJson(replayedDependencyLanding, taskPolicy.jsonBounds),
    }), 'ARTIFACT_REPLAY_MISMATCH');

    const foreignRelease = createExecutionEffectWorkspaceReleaseV1({
      attempt: landing.workspaceRelease.attempt,
      admissionReceiptDigest: landing.workspaceRelease.admissionReceiptDigest,
      custodyPolicyDigest: landing.workspaceRelease.custodyPolicyDigest,
      workspaceSnapshotSealDigest: landing.workspaceRelease.workspaceSnapshotSealDigest,
      workspaceResource: landing.workspaceResource,
      dependencyResource: foreignDependency,
      transactionDigest: landing.workspaceRelease.transactionDigest,
      committedJournalDigest: landing.workspaceRelease.committedJournalDigest,
      providerContainer: {
        containerName: landing.workspaceRelease.providerContainer.containerName,
        deletionReceiptDigest: landing.workspaceRelease.providerContainer.deletionReceiptDigest,
        absenceEvidenceDigest: landing.workspaceRelease.providerContainer.absenceEvidenceDigest,
      },
      workspaceVolume: {
        volumeName: landing.workspaceRelease.workspaceVolume.volumeName,
        deletionReceiptDigest: landing.workspaceRelease.workspaceVolume.deletionReceiptDigest,
        absenceEvidenceDigest: landing.workspaceRelease.workspaceVolume.absenceEvidenceDigest,
      },
      dependencyVolume: {
        volumeName: foreignDependency.volumeName,
        volumeIdentityDigest: foreignDependency.volumeIdentityDigest,
        deletionReceiptDigest: repeatedDigest('5'),
        absenceEvidenceDigest: repeatedDigest('6'),
      },
      releasedAt: landing.workspaceRelease.releasedAt,
    });
    const foreignReleaseArtifact = store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'execution-workspace-release',
      artifactKey: 'foreign-dependency-release',
      capturedAt: foreignRelease.releasedAt,
      bytes: canonicalTaskAttemptCustodyJson(foreignRelease, taskPolicy.jsonBounds),
    });
    const foreignReleaseLanding = landingWithReferences(
      landing.semanticReceipt.workspaceSnapshot,
      {
        artifactKey: foreignReleaseArtifact.artifactKey,
        artifactReceiptDigest: foreignReleaseArtifact.receiptDigest,
      },
    );
    expectHold(() => store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'execution-effect-landing-receipt',
      artifactKey: 'foreign-dependency-release-landing',
      capturedAt: foreignReleaseLanding.releasedAt,
      bytes: canonicalTaskAttemptCustodyJson(foreignReleaseLanding, taskPolicy.jsonBounds),
    }), 'ARTIFACT_REPLAY_MISMATCH');
  });

  it('publishes a host-authoritative IPC answer separately from exact worker delivery bytes', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const authorityEnvelopeBytes = Buffer.from(
      '{"kind":"task-attempt-ipc-answer-envelope","sequence":1}',
    );
    const deliveryBytes = Buffer.from('{"answer":"approved"}');

    const receipt = publishWorkerIpcAnswer({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      authorityEnvelopeBytes,
      deliveryBytes,
    });

    expect(TASK_ATTEMPT_CUSTODY_ATTEMPT_OUTPUT_ARTIFACT_CLASSES)
      .not.toContain('worker-ipc-answer');
    expect(TASK_ATTEMPT_CUSTODY_HOST_AUTHORITY_ARTIFACT_CLASSES)
      .toContain('worker-ipc-answer');
    expect(receipt.sequence).toBe(1);
    expect(receipt.artifactKey).toBe('ipc-answer-1');
    expect(receipt.destinationChildRelativePath).toBe('task-001-001.answer');
    expect(receipt.authorityArtifactSha256).toBe(sha256(authorityEnvelopeBytes));
    expect(receipt.deliverySha256).toBe(sha256(deliveryBytes));
    expect(receipt.destination.sha256).toBe(sha256(deliveryBytes));
    expect(receipt.destinationProofDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(receipt.authorityArtifactReceiptDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(parseTaskAttemptCustodyWorkerIpcAnswerDeliveryReceiptV2(receipt, taskPolicy))
      .toEqual(receipt);

    const authorityArtifact = store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'worker-ipc-answer',
      artifactKey: 'ipc-answer-1',
      receiptDigest: receipt.authorityArtifactReceiptDigest,
    });
    expect(Buffer.from(authorityArtifact?.bytes ?? [])).toEqual(authorityEnvelopeBytes);
    const deliveredPath = [...adapter.files.entries()].find(([path]) => (
      path.endsWith('/worker-output/task-001-001.answer')
    ));
    expect(Buffer.from(deliveredPath?.[1].bytes ?? [])).toEqual(deliveryBytes);
  });

  it('reconstructs IPC answer delivery after restart and keeps same-sequence replay idempotent', () => {
    const shared = memoryCustodyState();
    const firstAdapter = new InMemoryCustodyAdapter(shared);
    const { store: firstStore } = openedStore(firstAdapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(firstStore, taskIdentity, taskPolicy);
    const first = publishWorkerIpcAnswer({
      store: firstStore,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });

    const restartedAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(restartedAdapter);
    const read = restartedStore.readWorkerIpcAnswerDelivery({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      sequence: 1,
      artifactKey: 'ipc-answer-1',
    });
    expect(read).toEqual(first);
    expect(publishWorkerIpcAnswer({
      store: restartedStore,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    })).toEqual(first);
    expect(restartedAdapter.publishBytesCalls).toBe(0);

    expectHold(() => publishWorkerIpcAnswer({
      store: restartedStore,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      deliveryBytes: Buffer.from('{"answer":"conflict"}'),
    }), 'ARTIFACT_REPLAY_MISMATCH');
    expect(restartedAdapter.publishBytesCalls).toBe(0);
  });

  it('does not replay an earlier durable effect when a later sequence carries identical bytes', () => {
    const shared = memoryCustodyState();
    const adapter = new InMemoryCustodyAdapter(shared);
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const identicalDelivery = Buffer.from('{"answer":"same"}');
    const first = publishWorkerIpcAnswer({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      sequence: 1,
      deliveryBytes: identicalDelivery,
    });
    adapter.removeFirst('/worker-output/task-001-001.answer');
    const second = publishWorkerIpcAnswer({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      sequence: 2,
      deliveryBytes: identicalDelivery,
    });

    expect(second.deliverySha256).toBe(first.deliverySha256);
    expect(second.sequence).toBe(2);
    expect(second.receiptDigest).not.toBe(first.receiptDigest);
    expect(second.destinationProofDigest).not.toBe(first.destinationProofDigest);
    expect(store.readWorkerIpcAnswerDelivery({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      sequence: 1,
      artifactKey: 'ipc-answer-1',
    })).toEqual(first);
    expect(store.readWorkerIpcAnswerDelivery({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      sequence: 2,
      artifactKey: 'ipc-answer-2',
    })).toEqual(second);
  });

  it('binds fixed worker destination and immutable artifact key to the exact IPC sequence', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const base = {
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      access,
      sequence: 2,
      artifactKey: 'ipc-answer-2',
      destinationChildRelativePath: 'task-001-001.answer',
      deliveredAt: '2026-08-30T20:02:00.000Z',
      authorityEnvelopeBytes: Buffer.from('{"kind":"authority","sequence":2}'),
      deliveryBytes: Buffer.from('{"answer":"two"}'),
    } as const;
    expectHold(() => store.publishWorkerIpcAnswerDelivery({
      ...base,
      artifactKey: 'ipc-answer-1',
    }), 'ARTIFACT_REPLAY_MISMATCH');
    expectHold(() => store.publishWorkerIpcAnswerDelivery({
      ...base,
      destinationChildRelativePath: 'nested/task-001-001.answer',
    }), 'UNSAFE_RELATIVE_PATH');
    expectHold(() => store.publishWorkerIpcAnswerDelivery({
      ...base,
      authorityEnvelopeBytes: base.deliveryBytes,
    }), 'ARTIFACT_REPLAY_MISMATCH');
    expectHold(() => store.publishWorkerIpcAnswerDelivery(new Proxy(base, {}) as typeof base),
      'ARTIFACT_REPLAY_MISMATCH');

    const accessorInput = Object.defineProperties({}, Object.fromEntries(
      Object.entries(base).map(([key, value]) => [key, key === 'sequence'
        ? { enumerable: true, get: () => value }
        : { enumerable: true, value }]),
    ));
    expectHold(() => store.publishWorkerIpcAnswerDelivery(
      accessorInput as typeof base,
    ), 'ARTIFACT_REPLAY_MISMATCH');

    const foreignAdapter = new InMemoryCustodyAdapter();
    const { store: foreignStore } = openedStore(foreignAdapter);
    const foreignAdmission = admit(foreignStore, taskIdentity, taskPolicy);
    expectHold(() => foreignStore.publishWorkerIpcAnswerDelivery({
      ...base,
      admissionReceiptDigest: foreignAdmission.receiptDigest,
    }), 'CAPABILITY_UNVERIFIED');
  });

  it('does not turn partial IPC answer publication into delivered truth after restart', () => {
    const shared = memoryCustodyState();
    const firstAdapter = new InMemoryCustodyAdapter(shared);
    const { store: firstStore } = openedStore(firstAdapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(firstStore, taskIdentity, taskPolicy);
    firstAdapter.failOutcomeForPublishedPathSuffix = '/worker-output/task-001-001.answer';
    expectHold(() => publishWorkerIpcAnswer({
      store: firstStore,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    }), 'RECONCILIATION_REQUIRED');

    const restartedAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(restartedAdapter);
    expectHold(() => restartedStore.readWorkerIpcAnswerDelivery({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      sequence: 1,
      artifactKey: 'ipc-answer-1',
    }), 'RECONCILIATION_REQUIRED');
    expectHold(() => publishWorkerIpcAnswer({
      store: restartedStore,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    }), 'RECONCILIATION_REQUIRED');
    expect(restartedAdapter.publishBytesCalls).toBe(0);
  });

  it('keeps a delivered destination in reconciliation when its durable receipt is unconfirmed', () => {
    const shared = memoryCustodyState();
    const adapter = new InMemoryCustodyAdapter(shared);
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    adapter.failOutcomeForPublishedPathSuffix = '.delivery.receipt.json';
    expectHold(() => publishWorkerIpcAnswer({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    }), 'RECONCILIATION_REQUIRED');

    const restartedAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(restartedAdapter);
    expectHold(() => restartedStore.readWorkerIpcAnswerDelivery({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      sequence: 1,
      artifactKey: 'ipc-answer-1',
    }), 'RECONCILIATION_REQUIRED');
    expectHold(() => publishWorkerIpcAnswer({
      store: restartedStore,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    }), 'RECONCILIATION_REQUIRED');
    expect(restartedAdapter.publishBytesCalls).toBe(0);
  });

  it('keeps caller bytes authoritative against Proxy, SAB, subclass and adapter mutation', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const base = {
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt' as const,
      capturedAt: '2026-08-30T20:01:00.000Z',
    };

    let publicInputReads = 0;
    const proxiedPublicInput = new Proxy({
      ...base,
      artifactKey: 'proxy-public-input',
      bytes: Buffer.from('never-read'),
    }, {
      get: (target, property, receiver) => {
        publicInputReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    expectHold(
      () => store.publishHostArtifact(proxiedPublicInput),
      'ARTIFACT_REPLAY_MISMATCH',
    );
    expect(publicInputReads).toBe(0);

    let proxyReads = 0;
    const proxiedBytes = new Proxy(new Uint8Array([1, 2, 3]), {
      get: (target, property, receiver) => {
        proxyReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    expectHold(() => store.publishHostArtifact({
      ...base,
      artifactKey: 'proxy-bytes',
      bytes: proxiedBytes,
    }), 'CAPABILITY_UNVERIFIED');
    expect(proxyReads).toBe(0);

    class ExtendedBytes extends Uint8Array {}
    expectHold(() => store.publishHostArtifact({
      ...base,
      artifactKey: 'subclass-bytes',
      bytes: new ExtendedBytes([1, 2, 3]),
    }), 'CAPABILITY_UNVERIFIED');

    const sharedBytes = new Uint8Array(new SharedArrayBuffer(3));
    expectHold(() => store.publishHostArtifact({
      ...base,
      artifactKey: 'shared-bytes',
      bytes: sharedBytes,
    }), 'CAPABILITY_UNVERIFIED');

    const callerBytes = Buffer.from('authoritative-bytes');
    const callerSnapshot = Buffer.from(callerBytes);
    adapter.mutateNextPublishedBytes = true;
    expectHold(() => store.publishHostArtifact({
      ...base,
      artifactKey: 'adapter-mutates-copy',
      bytes: callerBytes,
    }), 'PUBLISHED_UNCONFIRMED');
    expect(callerBytes.equals(callerSnapshot)).toBe(true);
  });

  it('rejects exact-prototype byte authority overrides without executing accessors or effects', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const base = {
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt' as const,
      capturedAt: '2026-08-30T20:01:00.000Z',
    };
    const baselineEffectCalls = adapter.effectMarkerPublishCalls;
    const baselinePublishCalls = adapter.publishBytesCalls;
    let accessorReads = 0;

    const bufferOverride = new Uint8Array([1, 2, 3]);
    Object.defineProperty(bufferOverride, 'buffer', {
      get: () => {
        accessorReads += 1;
        return new ArrayBuffer(3);
      },
    });
    expectHold(() => store.publishHostArtifact({
      ...base,
      artifactKey: 'custom-buffer',
      bytes: bufferOverride,
    }), 'CAPABILITY_UNVERIFIED');

    const byteLengthOverride = new Uint8Array([1, 2, 3]);
    Object.defineProperty(byteLengthOverride, 'byteLength', {
      get: () => {
        accessorReads += 1;
        return 3;
      },
    });
    expectHold(() => store.publishHostArtifact({
      ...base,
      artifactKey: 'custom-byte-length',
      bytes: byteLengthOverride,
    }), 'CAPABILITY_UNVERIFIED');

    const iteratorOverride = new Uint8Array([1, 2, 3]);
    Object.defineProperty(iteratorOverride, Symbol.iterator, {
      get: () => {
        accessorReads += 1;
        return function* substitutedBytes() { yield 9; };
      },
    });
    expectHold(() => store.publishHostArtifact({
      ...base,
      artifactKey: 'custom-iterator',
      bytes: iteratorOverride,
    }), 'CAPABILITY_UNVERIFIED');

    const detachedBuffer = new ArrayBuffer(3);
    const detachedBytes = new Uint8Array(detachedBuffer);
    structuredClone(detachedBuffer, { transfer: [detachedBuffer] });
    expectHold(() => store.publishHostArtifact({
      ...base,
      artifactKey: 'detached-bytes',
      bytes: detachedBytes,
    }), 'CAPABILITY_UNVERIFIED');

    expect(accessorReads).toBe(0);
    expect(adapter.effectMarkerPublishCalls).toBe(baselineEffectCalls);
    expect(adapter.publishBytesCalls).toBe(baselinePublishCalls);
  });

  it('requires separate reconciliation authority for an exact intent-only restart', () => {
    const shared = memoryCustodyState();
    const firstAdapter = new InMemoryCustodyAdapter(shared);
    const { store: firstStore } = openedStore(firstAdapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(firstStore, taskIdentity, taskPolicy);
    const publishInput = {
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt' as const,
      artifactKey: 'restart-intent-only',
      capturedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('{"state":"durable-effect-created"}'),
    };
    firstAdapter.failOutcomeForPublishedPathSuffix = '/restart-intent-only.bin';
    expectHold(() => firstStore.publishHostArtifact(publishInput), 'PUBLISHED_UNCONFIRMED');
    expect(firstAdapter.publishBytesCalls).toBeGreaterThan(0);

    const secondAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(secondAdapter);
    expectHold(
      () => restartedStore.publishHostArtifact(publishInput),
      'RECONCILIATION_REQUIRED',
    );
    expect(secondAdapter.publishedPaths.some(path => path.endsWith('/restart-intent-only.bin')))
      .toBe(false);
    expect(secondAdapter.publishedPaths).toHaveLength(0);
  });

  it('never replays a mismatched durable effect marker', () => {
    const shared = memoryCustodyState();
    const firstAdapter = new InMemoryCustodyAdapter(shared);
    const { store: firstStore } = openedStore(firstAdapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(firstStore, taskIdentity, taskPolicy);
    firstStore.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'marker-primer',
      capturedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('{"state":"primer"}'),
    });
    const input = {
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt' as const,
      artifactKey: 'marker-mismatch',
      capturedAt: '2026-08-30T20:02:00.000Z',
      bytes: Buffer.from('{"state":"must-not-publish"}'),
    };
    firstAdapter.substituteNextEffectMarker = true;
    const before = firstAdapter.publishBytesCalls;
    expectHold(() => firstStore.publishHostArtifact(input), 'RECONCILIATION_REQUIRED');
    expect(firstAdapter.publishBytesCalls).toBe(before);

    const secondAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(secondAdapter);
    expectHold(() => restartedStore.publishHostArtifact(input), 'RECONCILIATION_REQUIRED');
    expect(secondAdapter.publishBytesCalls).toBe(0);
  });

  it('does not revive an opaque publication session from durable markers after restart', () => {
    const shared = memoryCustodyState();
    const firstAdapter = new InMemoryCustodyAdapter(shared);
    const { store: firstStore } = openedStore(firstAdapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(firstStore, taskIdentity, taskPolicy);
    const stream = firstStore.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'restart-session',
    });
    firstAdapter.failNextEffectOutcome = true;
    expectHold(() => stream.append(Buffer.from('intent-only-append')), 'RECONCILIATION_REQUIRED');
    expect(stream.state).toBe('APPEND_FAILED');
    expect(firstAdapter.streamAppendCalls).toBe(1);

    const secondAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(secondAdapter);
    expectHold(() => restartedStore.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'restart-session',
    }), 'RECONCILIATION_REQUIRED');
    expect(secondAdapter.activeStreamSessions).toBe(0);
    expect(secondAdapter.streamAppendCalls).toBe(0);
  });

  it('exposes verified bytes while mount authority stays adapter-owned and opaque', async () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const snapshot = store.readTaskSnapshot({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    expect(snapshot?.admission.receiptDigest).toBe(admission.receiptDigest);
    expect(Buffer.from(snapshot?.bytes ?? []).toString()).toContain('001-001');

    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    expect(access).not.toBeNull();
    expect(Object.keys(access?.workerOutputWrite ?? {})).not.toContain('relativePath');
    expect(JSON.stringify(access?.workerOutputWrite)).not.toContain('/test/');
    const lease = store.issueAttemptMountLease({ access: access!, policy: taskPolicy });
    await store.consumeAttemptMountLease(lease);
    expect(adapter.mountConsumeCalls).toBe(1);
    const source = store.issueAttemptOutputCaptureSource({
      access: access!,
      childRelativePath: 'primary.result.json',
      artifactClass: 'worker-result',
      artifactKey: 'primary',
    });
    const sourcePath = adapter.capabilityPaths.get(source);
    if (!sourcePath) throw new Error('capture source was not issued by adapter');
    adapter.putWorkerOutput(sourcePath, Buffer.from('{"taskId":"001-001","state":"done"}'));
    const captured = store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-result',
      artifactKey: 'primary',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source,
    });
    const verified = store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'worker-result',
      artifactKey: 'primary',
      receiptDigest: captured.receiptDigest,
    });
    expect(Buffer.from(verified?.bytes ?? []).toString()).toContain('"state":"done"');
    expect(captured.captureMode).toBe('attempt-output-capture');
    expectHold(() => store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'worker-result',
      artifactKey: 'primary',
      receiptDigest: `sha256:${'9'.repeat(64)}`,
    }), 'ARTIFACT_REPLAY_MISMATCH');
  });

  it('captures and verifies exact worker landing and provider-observation attempt outputs', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');

    const artifacts = ([
      ['worker-landing-proposal', 'landing.proposal.json', '{"commit":"proposal"}'],
      ['worker-provider-observation', 'provider.observation.json', '{"usage":17}'],
    ] as const).map(([artifactClass, childRelativePath, body]) => {
      const source = store.issueAttemptOutputCaptureSource({
        access,
        childRelativePath,
        artifactClass,
        artifactKey: 't5-output',
      });
      const sourcePath = adapter.capabilityPaths.get(source);
      if (!sourcePath) throw new Error(`capture source missing for ${artifactClass}`);
      adapter.putWorkerOutput(sourcePath, Buffer.from(body));
      const receipt = store.captureAttemptOutputArtifact({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
        artifactClass,
        artifactKey: 't5-output',
        capturedAt: '2026-08-30T20:01:00.000Z',
        source,
      });
      const verified = store.readVerifiedArtifact({
        identity: taskIdentity,
        policy: taskPolicy,
        artifactClass,
        artifactKey: 't5-output',
        receiptDigest: receipt.receiptDigest,
      });
      expect(receipt.captureMode).toBe('attempt-output-capture');
      expect(receipt.artifactClass).toBe(artifactClass);
      expect(Buffer.from(verified?.bytes ?? []).toString()).toBe(body);
      expect(verified?.receipt.receiptDigest).toBe(receipt.receiptDigest);
      return receipt;
    });
    const landingArtifact = artifacts[0];
    const observationArtifact = artifacts[1];
    if (!landingArtifact || !observationArtifact) throw new Error('captured artifact missing');

    expect(TASK_ATTEMPT_CUSTODY_ATTEMPT_OUTPUT_ARTIFACT_CLASSES).toEqual(
      expect.arrayContaining(['worker-landing-proposal', 'worker-provider-observation']),
    );
    expect(TASK_ATTEMPT_CUSTODY_HOST_AUTHORITY_ARTIFACT_CLASSES)
      .not.toContain('worker-landing-proposal');
    expect(TASK_ATTEMPT_CUSTODY_HOST_AUTHORITY_ARTIFACT_CLASSES)
      .not.toContain('worker-provider-observation');
    expectHold(() => store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'worker-provider-observation',
      artifactKey: 't5-output',
      receiptDigest: landingArtifact.receiptDigest,
    }), 'ARTIFACT_REPLAY_MISMATCH');
    expectHold(() => store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'worker-landing-proposal',
      artifactKey: 't5-output',
      receiptDigest: observationArtifact.receiptDigest,
    }), 'ARTIFACT_REPLAY_MISMATCH');
  });

  it('binds each output source to one exact class and key with receipt-equal replay only', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    expectHold(() => store.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: 'unbound.result.json',
    } as unknown as Parameters<
      TaskAttemptCustodyStore['issueAttemptOutputCaptureSource']
    >[0]), 'CAPABILITY_UNVERIFIED');
    const landingSource = store.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: 'bound.landing.json',
      artifactClass: 'worker-landing-proposal',
      artifactKey: 'bound-landing',
    });
    const observationSource = store.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: 'bound.observation.json',
      artifactClass: 'worker-provider-observation',
      artifactKey: 'bound-observation',
    });
    const landingPath = adapter.capabilityPaths.get(landingSource);
    const observationPath = adapter.capabilityPaths.get(observationSource);
    if (!landingPath || !observationPath) throw new Error('capture source missing');
    adapter.putWorkerOutput(landingPath, Buffer.from('{"landing":"exact"}'));
    adapter.putWorkerOutput(observationPath, Buffer.from('{"provider":"exact"}'));

    expectHold(() => store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-landing-proposal',
      artifactKey: 'bound-landing',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source: observationSource,
    }), 'CAPABILITY_UNVERIFIED');
    expectHold(() => store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-landing-proposal',
      artifactKey: 'bound-landing',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source: access.workerOutputWrite as unknown as TaskAttemptCustodyPathCapability,
    }), 'CAPABILITY_UNVERIFIED');

    const landingReceipt = store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-landing-proposal',
      artifactKey: 'bound-landing',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source: landingSource,
    });
    const publicationCallsAfterCapture = adapter.publishBytesCalls;
    expectHold(() => store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-landing-proposal',
      artifactKey: 'different-key',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source: landingSource,
    }), 'CAPABILITY_UNVERIFIED');
    expectHold(() => store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-provider-observation',
      artifactKey: 'bound-landing',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source: landingSource,
    }), 'CAPABILITY_UNVERIFIED');
    expectHold(() => store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-landing-proposal',
      artifactKey: 'bound-landing',
      capturedAt: '2026-08-30T20:02:00.000Z',
      source: landingSource,
    }), 'ARTIFACT_REPLAY_MISMATCH');
    expect(store.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: 'bound.landing.json',
      artifactClass: 'worker-landing-proposal',
      artifactKey: 'bound-landing',
    })).toBe(landingSource);
    const replay = store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-landing-proposal',
      artifactKey: 'bound-landing',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source: landingSource,
    });
    expect(replay).toEqual(landingReceipt);
    expect(adapter.publishBytesCalls).toBe(publicationCallsAfterCapture);
    expectHold(() => store.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: 'bound.landing.json',
      artifactClass: 'worker-landing-proposal',
      artifactKey: 'different-key',
    }), 'CAPABILITY_UNVERIFIED');

    const observationReceipt = store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-provider-observation',
      artifactKey: 'bound-observation',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source: observationSource,
    });
    expect(observationReceipt.captureMode).toBe('attempt-output-capture');
  });

  it('rejects replay of a process-local output source after Store restart', () => {
    const shared = memoryCustodyState();
    const firstAdapter = new InMemoryCustodyAdapter(shared);
    const { store: firstStore } = openedStore(firstAdapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(firstStore, taskIdentity, taskPolicy);
    const access = firstStore.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const source = firstStore.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: 'restart-bound.result.json',
      artifactClass: 'worker-result',
      artifactKey: 'restart-bound',
    });
    const sourcePath = firstAdapter.capabilityPaths.get(source);
    if (!sourcePath) throw new Error('capture source missing');
    firstAdapter.putWorkerOutput(sourcePath, Buffer.from('{"state":"done"}'));
    firstStore.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-result',
      artifactKey: 'restart-bound',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source,
    });

    const secondAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(secondAdapter);
    expectHold(() => restartedStore.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-result',
      artifactKey: 'restart-bound',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source,
    }), 'CAPABILITY_UNVERIFIED');
  });

  it.each([
    ['NO_EFFECT_ABORTED', 'NO_EFFECT_ABORTED'],
    ['CREATE_UNCONFIRMED', 'CREATE_UNCONFIRMED'],
    ['CLEANUP_UNCONFIRMED', 'CLEANUP_UNCONFIRMED'],
  ] as const)(
    'preserves exact %s adapter truth when publication custody cannot begin',
    (adapterState, expectedCode) => {
      const adapter = new InMemoryCustodyAdapter();
      const { store } = openedStore(adapter);
      const taskPolicy = policy();
      const taskIdentity = identity();
      const admission = admit(store, taskIdentity, taskPolicy);
      adapter.nextBeginPublicationState = adapterState;

      expectHold(() => store.beginProviderStreamCapture({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
        artifactKey: `begin-${adapterState.toLowerCase()}`,
      }), expectedCode);
      expect(adapter.activeStreamSessions).toBe(0);
      expect(adapter.streamAbortCalls).toBe(0);
    },
  );

  it('rejects adapter publication-token reuse and terminalizes the original wrapper', () => {
    const adapter = new InMemoryCustodyAdapter();
    adapter.reusePublicationToken = true;
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const first = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'token-owner-first',
    });

    expectHold(() => store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'token-owner-second',
    }), 'CLEANUP_UNCONFIRMED');
    expect(first.state).toBe('CLEANUP_UNCONFIRMED');
    expectHold(() => first.append(Buffer.from('must-not-reuse')), 'CLEANUP_UNCONFIRMED');
    expect(adapter.streamAppendCalls).toBe(0);
  });

  it('seals a bounded Store-owned pristine stream into an exact artifact receipt', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'provider-primary',
    });
    expect(Reflect.ownKeys(stream).sort()).toEqual([
      'abort',
      'append',
      'byteLength',
      'seal',
      'state',
    ]);
    expect(JSON.stringify(stream)).not.toMatch(/(?:path|source|fd|handle|token)/iu);
    stream.append(Buffer.from('{"event":'));
    stream.append(Buffer.from('"done"}'));
    const receipt = stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' });
    expect(stream.state).toBe('SEALED');
    expect(stream.byteLength).toBe(Buffer.byteLength('{"event":"done"}'));
    expect(receipt.captureMode).toBe('provider-stream-capture');
    const verified = store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: 'provider-primary',
      receiptDigest: receipt.receiptDigest,
    });
    expect(Buffer.from(verified?.bytes ?? []).toString()).toBe('{"event":"done"}');
    expectHold(() => stream.append(Buffer.from('late')), 'ARTIFACT_CHANGED');
  });

  it('binds append and abort outcomes to exact adapter receipt evidence', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'effect-receipt-binding',
    });
    stream.append(Buffer.from('bound-append'));
    const appendResult = adapter.lastAppendResult;
    expect(appendResult).not.toBeNull();
    expect([...adapter.effectMarkers.values()]).toContainEqual(expect.objectContaining({
      phase: 'OUTCOME',
      effectReceiptDigest: appendResult?.receiptDigest,
      effectEvidenceDigest: appendResult?.evidenceDigest,
    }));

    stream.abort();
    const abortResult = adapter.lastAbortResult;
    expect(abortResult).not.toBeNull();
    expect([...adapter.effectMarkers.values()]).toContainEqual(expect.objectContaining({
      phase: 'OUTCOME',
      effectReceiptDigest: abortResult?.receiptDigest,
      effectEvidenceDigest: abortResult?.evidenceDigest,
    }));
    expect(stream.state).toBe('ABORTED');
  });

  it('rejects stale append and abort receipts without reopening publication custody', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const appendStream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'stale-append-receipt',
    });
    adapter.appendResultGenerationDelta = 1;
    expectHold(() => appendStream.append(Buffer.from('uncertain')), 'APPEND_FAILED');
    expect(appendStream.state).toBe('APPEND_FAILED');
    expectHold(() => appendStream.append(Buffer.from('retry')), 'APPEND_FAILED');
    appendStream.abort();
    expect(appendStream.state).toBe('ABORTED');

    const abortStream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'stale-abort-receipt',
    });
    adapter.abortResultGenerationDelta = 1;
    expectHold(() => abortStream.abort(), 'CLEANUP_UNCONFIRMED');
    expect(abortStream.state).toBe('CLEANUP_UNCONFIRMED');
    expectHold(() => abortStream.abort(), 'CLEANUP_UNCONFIRMED');
  });

  it('fences reentrant append, seal and abort calls before every adapter effect', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'reentrant-fence',
    });
    let appendFenceObservations = 0;
    const assertAppendFence = (): void => {
      appendFenceObservations += 1;
      expectHold(() => stream.append(Buffer.from('reentered')), 'APPEND_FAILED');
      expectHold(
        () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
        'APPEND_FAILED',
      );
      expectHold(() => stream.abort(), 'APPEND_FAILED');
    };
    adapter.reenterEffectMarker = assertAppendFence;
    adapter.reenterStreamAppend = assertAppendFence;
    stream.append(Buffer.from('first'));
    expect(appendFenceObservations).toBe(2);
    expect(stream.state).toBe('OPEN');
    expect(stream.byteLength).toBe(5);
    expect(adapter.streamAppendCalls).toBe(1);
    expect(adapter.streamAbortCalls).toBe(0);

    stream.append(Buffer.from('-second'));
    adapter.reenterEffectMarker = () => {
      expectHold(() => stream.abort(), 'RECONCILIATION_REQUIRED');
      expect(adapter.streamAbortCalls).toBe(0);
    };
    adapter.reenterStreamSeal = () => {
      expectHold(() => stream.append(Buffer.from('late')), 'PUBLISHED_UNCONFIRMED');
      expectHold(
        () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
        'PUBLISHED_UNCONFIRMED',
      );
      expectHold(() => stream.abort(), 'PUBLISHED_UNCONFIRMED');
      expect(adapter.streamAbortCalls).toBe(0);
    };
    const receipt = stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' });
    expect(stream.state).toBe('SEALED');
    expect(adapter.streamAppendCalls).toBe(2);
    expect(adapter.streamSealCalls).toBe(1);
    expect(adapter.streamAbortCalls).toBe(0);
    const verified = store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: 'reentrant-fence',
      receiptDigest: receipt.receiptDigest,
    });
    expect(Buffer.from(verified?.bytes ?? []).toString()).toBe('first-second');
  });

  it.each([
    ['NO_EFFECT_ABORTED', 'NO_EFFECT_ABORTED', 'ABORTED', 0],
    ['PUBLISHED_UNCONFIRMED', 'PUBLISHED_UNCONFIRMED', 'PUBLISHED_UNCONFIRMED', 0],
    ['CLEANUP_UNCONFIRMED', 'CLEANUP_UNCONFIRMED', 'CLEANUP_UNCONFIRMED', 1],
  ] as const)(
    'preserves exact %s terminal seal disposition without abort guessing',
    (adapterState, expectedCode, expectedSessionState, expectedActiveSessions) => {
      const adapter = new InMemoryCustodyAdapter();
      const { store } = openedStore(adapter);
      const taskPolicy = policy();
      const taskIdentity = identity();
      const admission = admit(store, taskIdentity, taskPolicy);
      const stream = store.beginProviderStreamCapture({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
        artifactKey: `seal-${adapterState.toLowerCase()}`,
      });
      stream.append(Buffer.from('terminal-disposition'));
      adapter.nextSealPublicationState = adapterState;

      expectHold(
        () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
        expectedCode,
      );
      expect(stream.state).toBe(expectedSessionState);
      expect(adapter.activeStreamSessions).toBe(expectedActiveSessions);
      expect(adapter.streamAbortCalls).toBe(0);
    },
  );

  it('rejects a stream adapter that seals different bytes with the same length', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'substituted',
    });
    stream.append(Buffer.from('expected'));
    adapter.substituteNextSealedStreamBytes = Buffer.from('replaced');
    expectHold(
      () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
      'PUBLISHED_UNCONFIRMED',
    );
    expect(stream.state).toBe('PUBLISHED_UNCONFIRMED');
    expect(adapter.streamAbortCalls).toBe(0);
    expectHold(() => stream.abort(), 'PUBLISHED_UNCONFIRMED');
  });

  it('keeps a stream PUBLISHED_UNCONFIRMED when its durable receipt cannot be published', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'receipt-failure',
    });
    stream.append(Buffer.from('{"event":"done"}'));
    adapter.failNextReceiptPublication = true;
    expectHold(
      () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
      'PUBLISHED_UNCONFIRMED',
    );
    expect(stream.state).toBe('PUBLISHED_UNCONFIRMED');
    expect(adapter.streamSealCalls).toBe(1);
    expect(adapter.streamAbortCalls).toBe(0);
    expect(adapter.activeStreamSessions).toBe(0);
    expectHold(() => store.readArtifactReceipt({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: 'receipt-failure',
    }), 'INCOMPLETE_PUBLICATION');
  });

  it('never accepts a receipt file whose durable OUTCOME persistence failed', () => {
    const shared = memoryCustodyState();
    const adapter = new InMemoryCustodyAdapter(shared);
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'receipt-outcome-failure',
    });
    stream.append(Buffer.from('{"event":"receipt-written"}'));
    adapter.failOutcomeForPublishedPathSuffix = '/receipt-outcome-failure.receipt.json';
    expectHold(
      () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
      'PUBLISHED_UNCONFIRMED',
    );
    expect(stream.state).toBe('PUBLISHED_UNCONFIRMED');
    expectHold(() => stream.abort(), 'PUBLISHED_UNCONFIRMED');
    expectHold(
      () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
      'PUBLISHED_UNCONFIRMED',
    );

    const restartedAdapter = new InMemoryCustodyAdapter(shared);
    const { store: restartedStore } = openedStore(restartedAdapter);
    expectHold(() => restartedStore.readArtifactReceipt({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: 'receipt-outcome-failure',
    }), 'RECONCILIATION_REQUIRED');
    expect(restartedAdapter.publishBytesCalls).toBe(0);
  });

  it.each([
    ['invalid timestamp', 'not-a-timestamp', 1, 1],
    ['pre-admission timestamp', '2026-08-30T19:59:59.000Z', 1, 1],
    ['under-minimum stream', '2026-08-30T20:01:00.000Z', 2, 1],
  ] as const)(
    'terminally aborts adapter custody for %s before returning replay HOLD',
    (_label, capturedAt, minBytes, appendedBytes) => {
      const adapter = new InMemoryCustodyAdapter();
      const basePolicy = policy();
      const taskPolicy = createTaskAttemptCustodyPolicy({
        schemaVersion: 2,
        metadataMaxBytes: basePolicy.metadataMaxBytes,
        jsonBounds: basePolicy.jsonBounds,
        artifactLimits: {
          ...basePolicy.artifactLimits,
          'pristine-provider-stream': {
            minBytes,
            maxBytes: 64,
            requireSingleLink: true,
          },
        },
      });
      const { store } = openedStore(adapter);
      const taskIdentity = identity();
      const admission = admit(store, taskIdentity, taskPolicy);
      const stream = store.beginProviderStreamCapture({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
        artifactKey: `preseal-${minBytes}-${capturedAt === 'not-a-timestamp' ? 'invalid' : 'time'}`,
      });
      if (appendedBytes > 0) stream.append(Buffer.alloc(appendedBytes, 0x61));

      expectHold(() => stream.seal({ capturedAt }), 'ARTIFACT_REPLAY_MISMATCH');
      expect(stream.state).toBe('ABORTED');
      expect(adapter.streamAbortCalls).toBe(1);
      expect(adapter.streamSealCalls).toBe(0);
      expect(adapter.activeStreamSessions).toBe(0);
      expectHold(() => stream.append(Buffer.from('late')), 'ARTIFACT_CHANGED');
      expectHold(() => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }), 'ARTIFACT_CHANGED');
    },
  );

  it('snapshots the stream seal descriptor once and aborts accessor substitution', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'seal-accessor-substitution',
    });
    stream.append(Buffer.from('payload'));
    const sealInput = Object.create(null) as { capturedAt: string };
    Object.defineProperty(sealInput, 'capturedAt', {
      enumerable: true,
      get: () => '2026-08-30T20:01:00.000Z',
    });

    expectHold(
      () => stream.seal(sealInput),
      'ARTIFACT_REPLAY_MISMATCH',
    );
    expect(stream.state).toBe('ABORTED');
    expect(adapter.streamAbortCalls).toBe(1);
    expect(adapter.activeStreamSessions).toBe(0);
  });

  it('makes explicit stream abort monotonic and idempotent', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'explicit-abort',
    });
    expect(adapter.activeStreamSessions).toBe(1);
    stream.abort();
    stream.abort();
    expect(stream.state).toBe('ABORTED');
    expect(adapter.streamAbortCalls).toBe(1);
    expect(adapter.activeStreamSessions).toBe(0);
    expectHold(() => stream.append(Buffer.from('late')), 'ARTIFACT_CHANGED');
  });

  it('makes append uncertainty abort-only and never retries the append effect', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'append-uncertain',
    });
    adapter.failNextStreamAppend = true;
    expectHold(() => stream.append(Buffer.from('uncertain')), 'APPEND_FAILED');
    expect(stream.state).toBe('APPEND_FAILED');
    expect(stream.byteLength).toBe(0);
    expectHold(() => stream.append(Buffer.from('retry')), 'APPEND_FAILED');
    expectHold(
      () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
      'APPEND_FAILED',
    );
    expect(adapter.streamAppendCalls).toBe(1);
    stream.abort();
    expect(stream.state).toBe('ABORTED');
    expect(adapter.streamAbortCalls).toBe(1);
  });

  it('passes an isolated stream chunk copy and terminalizes adapter mutation', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'mutated-append-copy',
    });
    const callerChunk = Buffer.from('authoritative-stream');
    const callerSnapshot = Buffer.from(callerChunk);
    adapter.mutateNextAppendedBytes = true;
    expectHold(() => stream.append(callerChunk), 'APPEND_FAILED');
    expect(callerChunk.equals(callerSnapshot)).toBe(true);
    expect(stream.state).toBe('APPEND_FAILED');
    expect(adapter.streamAppendCalls).toBe(1);
    expectHold(() => stream.append(Buffer.from('retry')), 'APPEND_FAILED');
    stream.abort();
    expect(stream.state).toBe('ABORTED');
  });

  it('persists stream publication outcome before any receipt publication', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'outcome-before-receipt',
    });
    stream.append(Buffer.from('{"event":"done"}'));
    adapter.failNextEffectOutcome = true;
    expectHold(
      () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
      'PUBLISHED_UNCONFIRMED',
    );
    expect(adapter.publishedPaths.some(path => (
      path.endsWith('/outcome-before-receipt.receipt.json')
    ))).toBe(false);
    expectHold(() => store.readArtifactReceipt({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: 'outcome-before-receipt',
    }), 'INCOMPLETE_PUBLICATION');
  });

  it('does not abort or reseal after a namespace-effect seal failure', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'seal-unconfirmed',
    });
    stream.append(Buffer.from('published-before-close-failure'));
    adapter.failNextStreamSealUnconfirmed = true;
    expectHold(
      () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
      'PUBLISHED_UNCONFIRMED',
    );
    expect(stream.state).toBe('PUBLISHED_UNCONFIRMED');
    expect(adapter.streamSealCalls).toBe(1);
    expect(adapter.streamAbortCalls).toBe(0);
    expectHold(
      () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
      'PUBLISHED_UNCONFIRMED',
    );
    expectHold(() => stream.abort(), 'PUBLISHED_UNCONFIRMED');
    expect(adapter.streamSealCalls).toBe(1);
    expect(adapter.streamAbortCalls).toBe(0);
  });

  it('keeps the outer stream terminal when adapter abort cleanup cannot be confirmed', () => {
    const adapter = new InMemoryCustodyAdapter();
    adapter.failNextStreamAbort = true;
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'abort-cleanup-failure',
    });

    expectHold(() => stream.abort(), 'CLEANUP_UNCONFIRMED');
    expect(stream.state).toBe('CLEANUP_UNCONFIRMED');
    expect(adapter.streamAbortCalls).toBe(1);
    expect(adapter.activeStreamSessions).toBe(1);
    expectHold(() => stream.append(Buffer.from('retry')), 'CLEANUP_UNCONFIRMED');
    expectHold(() => stream.abort(), 'CLEANUP_UNCONFIRMED');
  });

  it('binds artifact class to its only valid capture mode and rejects laundering', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    expectHold(() => store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-result' as unknown as 'canonical-accepted-result',
      artifactKey: 'laundered-publish',
      capturedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('{"state":"done"}'),
    }), 'ARTIFACT_REPLAY_MISMATCH');
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const source = store.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: 'laundered.result.json',
      artifactClass: 'worker-result',
      artifactKey: 'laundered-capture',
    });
    const sourcePath = adapter.capabilityPaths.get(source);
    if (!sourcePath) throw new Error('capture source missing');
    adapter.putWorkerOutput(sourcePath, Buffer.from('{"state":"done"}'));
    expectHold(() => store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'canonical-accepted-result' as unknown as 'worker-result',
      artifactKey: 'laundered-capture',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source,
    }), 'ARTIFACT_REPLAY_MISMATCH');

    const hostReceipt = store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'host-authority',
      capturedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('{"state":"accepted"}'),
    });
    expect(hostReceipt.captureMode).toBe('host-authority-publication');
    expect(parseTaskAttemptCustodyArtifactReceiptV2({
      ...hostReceipt,
      captureMode: 'attempt-output-capture',
    }, taskPolicy)).toBeNull();

    for (const artifactClass of [
      'worker-landing-proposal',
      'worker-provider-observation',
    ] as const) {
      expectHold(() => store.publishHostArtifact({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
        artifactClass: artifactClass as unknown as 'canonical-accepted-result',
        artifactKey: `${artifactClass}-host-laundering`,
        capturedAt: '2026-08-30T20:01:00.000Z',
        bytes: Buffer.from('{"state":"done"}'),
      }), 'ARTIFACT_REPLAY_MISMATCH');
      expectHold(() => store.beginProviderStreamCapture({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
        artifactKey: `${artifactClass}-provider-laundering`,
        artifactClass,
      } as unknown as Parameters<
        TaskAttemptCustodyStore['beginProviderStreamCapture']
      >[0]), 'ARTIFACT_REPLAY_MISMATCH');
    }
  });

  it('aborts an overflowing stream so a caller cannot seal a truncated prefix', () => {
    const basePolicy = policy();
    const taskPolicy = createTaskAttemptCustodyPolicy({
      schemaVersion: 2,
      metadataMaxBytes: basePolicy.metadataMaxBytes,
      jsonBounds: basePolicy.jsonBounds,
      artifactLimits: {
        ...basePolicy.artifactLimits,
        'pristine-provider-stream': {
          minBytes: 1,
          maxBytes: 4,
          requireSingleLink: true,
        },
      },
    });
    const { store } = openedStore();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const stream = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'bounded',
    });
    expectHold(() => stream.append(Buffer.from('12345')), 'ARTIFACT_OVERSIZE');
    expect(stream.state).toBe('ABORTED');
    expectHold(
      () => stream.seal({ capturedAt: '2026-08-30T20:01:00.000Z' }),
      'ARTIFACT_CHANGED',
    );
    expect(store.readArtifactReceipt({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: 'bounded',
    })).toBeNull();
  });

  it('rejects an unissued capture capability and an artifact timestamp before admission', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const forged = Object.freeze({
      kind: 'task-attempt-custody-path-capability',
      access: 'capture-read-file',
      rootId: store.root.rootId,
      scopeDigest: `sha256:${'1'.repeat(64)}`,
      capabilityEvidenceDigest: `sha256:${'2'.repeat(64)}`,
    }) as TaskAttemptCustodyPathCapability;
    expectHold(() => store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-result',
      artifactKey: 'forged',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source: forged,
    }), 'CAPABILITY_UNVERIFIED');
    expectHold(() => store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'too-early',
      capturedAt: '2026-08-30T19:59:59.000Z',
      bytes: Buffer.from('{"state":"done"}'),
    }), 'ARTIFACT_REPLAY_MISMATCH');
  });

  it('revokes an opaque capability object if an adapter reuses it for another output path', () => {
    const adapter = new InMemoryCustodyAdapter();
    adapter.reuseCaptureCapability = true;
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const first = store.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: 'first.result.json',
      artifactClass: 'worker-result',
      artifactKey: 'revoked',
    });
    expectHold(() => store.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: 'second.result.json',
      artifactClass: 'worker-result',
      artifactKey: 'second',
    }), 'CAPABILITY_UNVERIFIED');
    const retargetedPath = adapter.capabilityPaths.get(first);
    if (!retargetedPath) throw new Error('retargeted source missing');
    adapter.putWorkerOutput(retargetedPath, Buffer.from('{"state":"spoof"}'));
    expectHold(() => store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-result',
      artifactKey: 'revoked',
      capturedAt: '2026-08-30T20:01:00.000Z',
      source: first,
    }), 'CAPABILITY_UNVERIFIED');
  });

  it('revokes the original access when its capability object is reused across access classes', () => {
    const adapter = new InMemoryCustodyAdapter();
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');

    adapter.nextIssuedCapabilityOverride = access.workerOutputWrite;
    expectHold(() => store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    }), 'CAPABILITY_UNVERIFIED');

    expectHold(() => store.issueAttemptMountLease({
      access,
      policy: taskPolicy,
    }), 'CAPABILITY_UNVERIFIED');
  });

  it('rejects sibling generation admission replay', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const firstIdentity = identity();
    const secondIdentity = identity({ generation: 2 });
    const firstAdmission = admit(store, firstIdentity, taskPolicy);
    admit(store, secondIdentity, taskPolicy, firstAdmission.receiptDigest, firstIdentity);
    expectHold(() => store.publishHostArtifact({
      identity: secondIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: firstAdmission.receiptDigest,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'primary',
      capturedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('{"taskId":"001-001"}'),
    }), 'ADMISSION_MISMATCH');
  });

  it('requires the persisted exact N-1 admission instead of an arbitrary digest', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const previous = identity();
    expectHold(() => admit(
      store,
      identity({ generation: 2 }),
      taskPolicy,
      `sha256:${'8'.repeat(64)}`,
      previous,
    ), 'CHAIN_PREDECESSOR_MISMATCH');
  });

  it('rejects cross-task, cross-attempt and skipped-generation predecessor identities', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const firstIdentity = identity();
    const first = admit(store, firstIdentity, taskPolicy);
    const invalidPairs: Array<readonly [TaskAttemptCustodyIdentityV2, TaskAttemptCustodyIdentityV2]> = [
      [identity({ generation: 2, taskId: '001-002' }), firstIdentity],
      [identity({
        generation: 2,
        attemptId: '223e4567-e89b-42d3-a456-426614174000',
      }), firstIdentity],
      [identity({ generation: 3 }), firstIdentity],
    ];
    for (const [current, predecessor] of invalidPairs) {
      expectHold(
        () => admit(store, current, taskPolicy, first.receiptDigest, predecessor),
        'CHAIN_PREDECESSOR_MISMATCH',
      );
    }
  });

  it('requires monotonic admission time across generation lineage', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const firstIdentity = identity();
    const first = admit(store, firstIdentity, taskPolicy);
    expectHold(() => store.createAdmission({
      identity: identity({ generation: 2 }),
      policy: taskPolicy,
      admittedAt: '2026-08-30T19:59:59.000Z',
      predecessorDigest: first.receiptDigest,
      predecessorIdentity: firstIdentity,
      taskSnapshot: { id: firstIdentity.taskId },
    }), 'CHAIN_PREDECESSOR_MISMATCH');
  });

  it('builds an exact accepted-result to archive predecessor chain', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    expect(TASK_ATTEMPT_CUSTODY_CHAIN_STAGES).toEqual([
      'effect-landing',
      'accepted-result',
      'evaluation',
      'finalizer',
      'settlement',
      'archive',
    ]);
    const landing = publishEffectLanding({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    const effectChain = store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'effect-landing',
      occurredAt: '2026-08-30T20:07:00.000Z',
      predecessorDigest: admission.receiptDigest,
      artifactReceipt: landing.artifactReceipt,
    });
    const stages = [
      ['accepted-result', 'canonical-accepted-result'],
      ['evaluation', 'evaluation-receipt'],
      ['finalizer', 'finalizer-receipt'],
      ['settlement', 'settlement-receipt'],
      ['archive', 'archive-receipt'],
    ] as const;
    let predecessor = effectChain.receiptDigest;
    for (const [index, [stage, artifactClass]] of stages.entries()) {
      const capturedAt = new Date(
        Date.parse('2026-08-30T20:08:00.000Z') + index * 2 * 60_000,
      ).toISOString();
      const occurredAt = new Date(Date.parse(capturedAt) + 60_000).toISOString();
      const artifact = stage === 'accepted-result'
        ? publishAcceptedResult({
          store,
          identity: taskIdentity,
          policy: taskPolicy,
          admissionReceiptDigest: admission.receiptDigest,
          landing,
          effectChainDigest: effectChain.receiptDigest,
          capturedAt,
        })
        : store.publishHostArtifact({
          identity: taskIdentity,
          policy: taskPolicy,
          admissionReceiptDigest: admission.receiptDigest,
          artifactClass,
          artifactKey: 'primary',
          capturedAt,
          bytes: Buffer.from(JSON.stringify({ stage, taskId: taskIdentity.taskId })),
        });
      const chain = store.appendChain({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
        stage,
        occurredAt,
        predecessorDigest: predecessor,
        artifactReceipt: artifact,
      });
      predecessor = chain.receiptDigest;
    }
    expect(store.readChain(taskIdentity, taskPolicy, 'archive')?.receiptDigest).toBe(predecessor);
  });

  it('rejects accepted-result bindings with a foreign attempt, landing transaction, or chain', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const landing = publishEffectLanding({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    const effectChain = store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'effect-landing',
      occurredAt: '2026-08-30T20:07:00.000Z',
      predecessorDigest: admission.receiptDigest,
      artifactReceipt: landing.artifactReceipt,
    });
    publishAcceptedResult({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      landing,
      effectChainDigest: effectChain.receiptDigest,
      artifactKey: 'valid-binding-prerequisite',
    });
    const hostWorkReceipt = store.readArtifactReceipt({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'host-work-attribution',
      artifactKey: `host-work-${taskIdentity.attemptId}`,
    });
    if (hostWorkReceipt === null) throw new Error('host-work prerequisite was not published');
    const hostWorkArtifact = store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'host-work-attribution',
      artifactKey: hostWorkReceipt.artifactKey,
      receiptDigest: hostWorkReceipt.receiptDigest,
    });
    if (hostWorkArtifact === null) throw new Error('host-work prerequisite was not published');
    const base = {
      identity: {
        projectId: taskIdentity.projectId,
        taskId: taskIdentity.taskId,
        attemptId: taskIdentity.attemptId,
        generation: taskIdentity.generation,
      },
      admissionReceiptDigest: admission.receiptDigest,
      custodyPolicyDigest: taskPolicy.policyDigest,
      landingArtifactKey: landing.artifactReceipt.artifactKey,
      landingArtifactReceiptDigest: landing.artifactReceipt.receiptDigest,
      landingReceiptDigest: landing.semanticReceipt.receiptDigest,
      effectLandingChainDigest: effectChain.receiptDigest,
      readyLifecycleAuthorityDigest: repeatedDigest('7'),
      disposition: landing.semanticReceipt.disposition,
      effectDecisionDigest: landing.semanticReceipt.effectDecisionDigest,
      transactionDigest: landing.semanticReceipt.transactionDigest,
    } as const;
    const variants = [
      {
        ...base,
        identity: { ...base.identity, generation: base.identity.generation + 1 },
      },
      { ...base, transactionDigest: repeatedDigest('f') },
      { ...base, effectLandingChainDigest: repeatedDigest('e') },
    ];
    for (const [index, variant] of variants.entries()) {
      const binding = createTaskAttemptEffectLandingBindingV2(variant);
      expectHold(() => store.publishHostArtifact({
        identity: taskIdentity,
        policy: taskPolicy,
        admissionReceiptDigest: admission.receiptDigest,
        artifactClass: 'canonical-accepted-result',
        artifactKey: `invalid-binding-${index}`,
        capturedAt: '2026-08-30T20:08:00.000Z',
        bytes: canonicalTaskAttemptCustodyJson({
          attemptCustody: {
            version: 2,
            identity: taskIdentity,
            policyDigest: taskPolicy.policyDigest,
            admissionReceiptDigest: admission.receiptDigest,
            sourceResult: {
              artifactClass: 'worker-result',
              artifactKey: 'primary',
              artifactReceiptDigest: repeatedDigest('1'),
              artifactSha256: repeatedDigest('2'),
              byteLength: 1,
            },
            hostWorkAttribution: {
              artifactClass: 'host-work-attribution',
              artifactKey: hostWorkArtifact.receipt.artifactKey,
              artifactReceiptDigest: hostWorkArtifact.receipt.receiptDigest,
              artifactSha256: hostWorkArtifact.receipt.artifact.sha256,
              byteLength: hostWorkArtifact.receipt.artifact.byteLength,
            },
            hostPromotion: {
              version: 2,
              kind: 'task-result-host-promotion',
              authority: 'host-canonical-ingress-assembler',
              assembledV1Digest: repeatedDigest('3'),
            },
            effectLanding: binding,
          },
        }, taskPolicy.jsonBounds),
      }), 'ARTIFACT_REPLAY_MISMATCH');
    }
  });

  it('rejects a chain stage with the wrong predecessor or artifact class', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const landing = publishEffectLanding({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    const effectChain = store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'effect-landing',
      occurredAt: '2026-08-30T20:07:00.000Z',
      predecessorDigest: admission.receiptDigest,
      artifactReceipt: landing.artifactReceipt,
    });
    const artifact = publishAcceptedResult({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      landing,
      effectChainDigest: effectChain.receiptDigest,
    });
    expectHold(() => store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'accepted-result',
      occurredAt: '2026-08-30T20:09:00.000Z',
      predecessorDigest: `sha256:${'8'.repeat(64)}`,
      artifactReceipt: artifact,
    }), 'CHAIN_PREDECESSOR_MISMATCH');

    const wrongClass = store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'wrong-class',
      capturedAt: '2026-08-30T20:08:00.000Z',
      bytes: Buffer.from('{"state":"evaluated"}'),
    });
    expectHold(() => store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'accepted-result',
      occurredAt: '2026-08-30T20:09:00.000Z',
      predecessorDigest: effectChain.receiptDigest,
      artifactReceipt: wrongClass,
    }), 'ARTIFACT_REPLAY_MISMATCH');

    expectHold(() => store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'accepted-result',
      occurredAt: '2026-08-30T20:06:59.000Z',
      predecessorDigest: effectChain.receiptDigest,
      artifactReceipt: artifact,
    }), 'CHAIN_PREDECESSOR_MISMATCH');
  });

  it('rejects accepted-result before the committed effect-landing chain exists', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    expectHold(() => store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'canonical-accepted-result',
      artifactKey: 'primary',
      capturedAt: '2026-08-30T20:08:00.000Z',
      bytes: canonicalTaskAttemptCustodyJson({
        attemptCustody: {
          effectLanding: createTaskAttemptEffectLandingBindingV2({
            identity: {
              projectId: taskIdentity.projectId,
              taskId: taskIdentity.taskId,
              attemptId: taskIdentity.attemptId,
              generation: taskIdentity.generation,
            },
            admissionReceiptDigest: admission.receiptDigest,
            custodyPolicyDigest: taskPolicy.policyDigest,
            landingArtifactKey: 'missing',
            landingArtifactReceiptDigest: repeatedDigest('1'),
            landingReceiptDigest: repeatedDigest('2'),
            effectLandingChainDigest: repeatedDigest('3'),
            readyLifecycleAuthorityDigest: repeatedDigest('6'),
            disposition: 'COMMITTED_NO_CHANGE',
            effectDecisionDigest: repeatedDigest('4'),
            transactionDigest: repeatedDigest('5'),
          }),
        },
      }, taskPolicy.jsonBounds),
    }), 'ARTIFACT_REPLAY_MISMATCH');
    const accepted = store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'wrong-class',
      capturedAt: '2026-08-30T20:08:00.000Z',
      bytes: Buffer.from('{"state":"accepted"}'),
    });
    expectHold(() => store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'effect-landing',
      occurredAt: '2026-08-30T20:09:00.000Z',
      predecessorDigest: admission.receiptDigest,
      artifactReceipt: accepted,
    }), 'ARTIFACT_REPLAY_MISMATCH');
  });

  it('rejects a stage artifact captured before its predecessor chain event', () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const landing = publishEffectLanding({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    const effectChain = store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'effect-landing',
      occurredAt: '2026-08-30T20:07:00.000Z',
      predecessorDigest: admission.receiptDigest,
      artifactReceipt: landing.artifactReceipt,
    });
    const acceptedArtifact = publishAcceptedResult({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      landing,
      effectChainDigest: effectChain.receiptDigest,
    });
    const accepted = store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'accepted-result',
      occurredAt: '2026-08-30T20:09:00.000Z',
      predecessorDigest: effectChain.receiptDigest,
      artifactReceipt: acceptedArtifact,
    });
    const preMintedEvaluation = store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'pre-minted',
      capturedAt: '2026-08-30T20:08:30.000Z',
      bytes: Buffer.from('{"verdict":"DONE"}'),
    });
    expectHold(() => store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'evaluation',
      occurredAt: '2026-08-30T20:10:00.000Z',
      predecessorDigest: accepted.receiptDigest,
      artifactReceipt: preMintedEvaluation,
    }), 'CHAIN_PREDECESSOR_MISMATCH');
  });

  it('fails closed when durable admission bytes change behind their proof', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    admit(store, taskIdentity, taskPolicy);
    adapter.tamperFirst('/admission.json', Buffer.from('{"forged":true}'));
    expectHold(() => store.readAdmission(taskIdentity, taskPolicy), 'CAPABILITY_UNVERIFIED');
  });

  it('distinguishes true absence from orphaned admission and artifact publication', () => {
    const admissionCase = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    admit(admissionCase.store, taskIdentity, taskPolicy);
    admissionCase.adapter.removeFirst('/admission.json');
    expectHold(
      () => admissionCase.store.readAdmission(taskIdentity, taskPolicy),
      'INCOMPLETE_PUBLICATION',
    );

    const artifactCase = openedStore();
    const admission = admit(artifactCase.store, taskIdentity, taskPolicy);
    artifactCase.store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'primary',
      capturedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('{"state":"done"}'),
    });
    artifactCase.adapter.removeFirst('/primary.receipt.json');
    expectHold(() => artifactCase.store.readArtifactReceipt({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'primary',
    }), 'INCOMPLETE_PUBLICATION');

    const clean = openedStore();
    expect(clean.store.readAdmission(taskIdentity, taskPolicy)).toBeNull();
  });

  it('detects a missing earlier chain stage when a later durable stage exists', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const taskIdentity = identity();
    const admission = admit(store, taskIdentity, taskPolicy);
    const landing = publishEffectLanding({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    const effectChain = store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'effect-landing',
      occurredAt: '2026-08-30T20:07:00.000Z',
      predecessorDigest: admission.receiptDigest,
      artifactReceipt: landing.artifactReceipt,
    });
    const acceptedArtifact = publishAcceptedResult({
      store,
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      landing,
      effectChainDigest: effectChain.receiptDigest,
    });
    const accepted = store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'accepted-result',
      occurredAt: '2026-08-30T20:09:00.000Z',
      predecessorDigest: effectChain.receiptDigest,
      artifactReceipt: acceptedArtifact,
    });
    const evaluationArtifact = store.publishHostArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'primary',
      capturedAt: '2026-08-30T20:10:00.000Z',
      bytes: Buffer.from('{"verdict":"DONE"}'),
    });
    store.appendChain({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      stage: 'evaluation',
      occurredAt: '2026-08-30T20:11:00.000Z',
      predecessorDigest: accepted.receiptDigest,
      artifactReceipt: evaluationArtifact,
    });
    adapter.removeFirst('/02-accepted-result.json');
    expectHold(
      () => store.readChain(taskIdentity, taskPolicy, 'accepted-result'),
      'INCOMPLETE_PUBLICATION',
    );
  });

  it('parses only an explicit frozen historical V1 sentinel', () => {
    const sentinel = {
      schemaVersion: 1,
      kind: 'task-attempt-custody-historical-v1',
      state: 'historical-read-only',
      backend: 'docker',
      projectRootSha256: 'a'.repeat(64),
      taskId: '001-001',
      attemptId: '123e4567-e89b-42d3-a456-426614174000',
      cutoverReceiptDigest: `sha256:${'7'.repeat(64)}`,
    };
    const trustedAnchor = {
      projectRootSha256: 'a'.repeat(64),
      taskId: '001-001',
      attemptId: '123e4567-e89b-42d3-a456-426614174000',
      cutoverReceiptDigest: `sha256:${'7'.repeat(64)}` as Sha256Digest,
    };
    const parsed = parseTaskAttemptCustodyHistoricalV1Sentinel(sentinel);
    expect(parsed).toEqual(sentinel);
    expect(parsed).not.toBe(sentinel);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(sentinel)).toBe(false);
    const verified: TaskAttemptCustodyVerifiedHistoricalV1Sentinel =
      verifyTaskAttemptCustodyHistoricalV1Sentinel(sentinel, trustedAnchor);
    expect(verified).toEqual(sentinel);
    for (const mismatch of [
      { ...trustedAnchor, projectRootSha256: 'b'.repeat(64) },
      { ...trustedAnchor, taskId: '001-002' },
      { ...trustedAnchor, attemptId: '223e4567-e89b-42d3-a456-426614174000' },
      { ...trustedAnchor, cutoverReceiptDigest: `sha256:${'8'.repeat(64)}` as Sha256Digest },
    ]) {
      expectHold(
        () => verifyTaskAttemptCustodyHistoricalV1Sentinel(sentinel, mismatch),
        'CORRUPT_CUSTODY_RECORD',
      );
    }
    expect(parseTaskAttemptCustodyHistoricalV1Sentinel({
      schemaVersion: 1,
      taskId: '001-001',
      backend: 'docker',
      projectRootSha256: 'a'.repeat(64),
      attemptId: '123e4567-e89b-42d3-a456-426614174000',
    })).toBeNull();
    expect(parseTaskAttemptCustodyHistoricalV1Sentinel({ ...sentinel, extra: true })).toBeNull();
  });

  it('atomically reserves canonical dispatch identity and reopens same request after restart', () => {
    const state = memoryCustodyState();
    const firstStore = openedStore(new InMemoryCustodyAdapter(state)).store;
    const taskPolicy = policy();
    const first = reserveDispatch({ store: firstStore, policy: taskPolicy });
    expect(first.ref.identity).toMatchObject({
      generation: 1,
      taskId: '001-001',
    });
    expect(first.ref.identity.attemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(JSON.stringify(first)).not.toMatch(/(?:\/test\/|sourcePath|absolutePath)/u);

    const restarted = openedStore(new InMemoryCustodyAdapter(state)).store;
    const replay = reserveDispatch({
      store: restarted,
      policy: taskPolicy,
      reservedAt: '2026-08-30T20:05:00.000Z',
    });
    expect(replay).toEqual(first);
    expect(replay.reservation.reservedAt).toBe('2026-08-30T20:00:00.000Z');
    expectHold(() => reserveDispatch({
      store: restarted,
      policy: taskPolicy,
      material: {
        approvedTaskMaterialDigest: repeatedDigest('7'),
        dispatchTaskMaterialDigest: repeatedDigest('0'),
        derivationAuthorityDigest: repeatedDigest('9'),
      },
    }), 'DISPATCH_REQUEST_CONFLICT');
  });

  it('discovers the bounded canonical dispatch directory and semantically rereads every admission', () => {
    const state = memoryCustodyState();
    const taskPolicy = policy();
    const firstStore = openedStore(new InMemoryCustodyAdapter(state)).store;
    const first = reserveDispatch({
      store: firstStore,
      policy: taskPolicy,
      requestId: dispatchId('1'),
    });
    const second = reserveDispatch({
      store: firstStore,
      policy: taskPolicy,
      requestId: dispatchId('2'),
    });
    const input = {
      policy: taskPolicy,
      maxEntries: 32,
      maxNameBytes: 128,
      deadlineAt: '2099-09-01T00:00:00.000Z',
    } as const;
    const discovered = firstStore.listDispatchAdmissions(input);
    expect(discovered).toMatchObject({
      state: 'scanned',
      candidateCount: 2,
      admittedCount: 2,
      pendingAdmissionCount: 0,
      maxEntries: 32,
      maxNameBytes: 128,
    });
    expect(discovered.entries.map(entry => entry.reservation.dispatchRequestId)).toEqual(
      [first, second]
        .sort((left, right) => createHash('sha256')
          .update(left.reservation.dispatchRequestId)
          .digest('hex')
          .localeCompare(createHash('sha256')
            .update(right.reservation.dispatchRequestId)
            .digest('hex')))
        .map(entry => entry.reservation.dispatchRequestId),
    );
    expect(Object.isFrozen(discovered)).toBe(true);
    expect(Object.isFrozen(discovered.entries)).toBe(true);

    const restarted = openedStore(new InMemoryCustodyAdapter(state)).store;
    expect(restarted.listDispatchAdmissions(input)).toEqual(discovered);
  });

  it('preserves reserved-pending-admission during bounded restart discovery', () => {
    const adapter = new InMemoryCustodyAdapter();
    const originalRead = adapter.readFirstWriter.bind(adapter);
    let interruptAdmission = true;
    adapter.readFirstWriter = input => {
      if (interruptAdmission && input.relativePath.endsWith('/admission.json')) {
        interruptAdmission = false;
        throw Object.freeze({ code: 'E_EXEC_AUTH_NATIVE_READ_UNCONFIRMED' });
      }
      return originalRead(input);
    };
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    expectHold(() => reserveDispatch({ store, policy: taskPolicy }), 'CAPABILITY_UNVERIFIED');
    const discovered = store.listDispatchAdmissions({
      policy: taskPolicy,
      maxEntries: 32,
      maxNameBytes: 128,
      deadlineAt: '2099-09-01T00:00:00.000Z',
    });
    expect(discovered).toMatchObject({
      candidateCount: 1,
      admittedCount: 0,
      pendingAdmissionCount: 1,
    });
    expect(discovered.entries[0]?.state).toBe('reserved-pending-admission');
  });

  it('distinguishes malformed and hash-tampered dispatch discovery candidates', () => {
    const taskPolicy = policy();
    const malformedAdapter = new InMemoryCustodyAdapter();
    const malformedStore = openedStore(malformedAdapter).store;
    reserveDispatch({ store: malformedStore, policy: taskPolicy });
    const projectDirectory = [...malformedAdapter.directories.keys()]
      .find(path => path.endsWith('/dispatch-requests'))!;
    malformedAdapter.ensurePrivateDirectory(
      ROOT_PROOF,
      taskAttemptCustodyRelativePath(`${projectDirectory}/malformed`),
    );
    expectHold(() => malformedStore.listDispatchAdmissions({
      policy: taskPolicy,
      maxEntries: 32,
      maxNameBytes: 128,
      deadlineAt: '2099-09-01T00:00:00.000Z',
    }), 'DISPATCH_DISCOVERY_MALFORMED_CANDIDATE');

    const tamperedAdapter = new InMemoryCustodyAdapter();
    const tamperedStore = openedStore(tamperedAdapter).store;
    const admitted = reserveDispatch({ store: tamperedStore, policy: taskPolicy });
    const tamperedProjectDirectory = [...tamperedAdapter.directories.keys()]
      .find(path => path.endsWith('/dispatch-requests'))!;
    const originalHash = createHash('sha256')
      .update(admitted.reservation.dispatchRequestId)
      .digest('hex');
    const foreignHash = createHash('sha256').update(dispatchId('2')).digest('hex');
    const originalReservationPath = taskAttemptCustodyRelativePath(
      `${tamperedProjectDirectory}/${originalHash}/reservation.json`,
    );
    const foreignDirectory = taskAttemptCustodyRelativePath(
      `${tamperedProjectDirectory}/${foreignHash}`,
    );
    tamperedAdapter.ensurePrivateDirectory(ROOT_PROOF, foreignDirectory);
    tamperedAdapter.files.set(
      taskAttemptCustodyRelativePath(`${foreignDirectory}/reservation.json`),
      tamperedAdapter.files.get(originalReservationPath)!,
    );
    expectHold(() => tamperedStore.listDispatchAdmissions({
      policy: taskPolicy,
      maxEntries: 32,
      maxNameBytes: 128,
      deadlineAt: '2099-09-01T00:00:00.000Z',
    }), 'DISPATCH_DISCOVERY_TAMPERED_CANDIDATE');
  });

  it('fails dispatch discovery closed on missing native scan and mutated scan receipts', () => {
    const taskPolicy = policy();
    const emptyStore = openedStore().store;
    expectHold(() => emptyStore.listDispatchAdmissions({
      policy: taskPolicy,
      maxEntries: 32,
      maxNameBytes: 128,
      deadlineAt: '2000-01-01T00:00:00.000Z',
    }), 'DISPATCH_DISCOVERY_DEADLINE_EXCEEDED');
    expectHold(() => emptyStore.listDispatchAdmissions({
      policy: taskPolicy,
      maxEntries: 32,
      maxNameBytes: 129,
      deadlineAt: '2099-09-01T00:00:00.000Z',
    }), 'DISPATCH_DISCOVERY_BOUNDS_EXCEEDED');
    const unavailableAdapter = new InMemoryCustodyAdapter();
    Object.defineProperty(unavailableAdapter, 'scanPrivateDirectoryBounded', {
      configurable: true,
      value: undefined,
    });
    const unavailableStore = openedStore(unavailableAdapter).store;
    reserveDispatch({ store: unavailableStore, policy: taskPolicy });
    expectHold(() => unavailableStore.listDispatchAdmissions({
      policy: taskPolicy,
      maxEntries: 32,
      maxNameBytes: 128,
      deadlineAt: '2099-09-01T00:00:00.000Z',
    }), 'NATIVE_CAPABILITY_UNAVAILABLE');

    const mutatedAdapter = new InMemoryCustodyAdapter();
    const originalScan = mutatedAdapter.scanPrivateDirectoryBounded.bind(mutatedAdapter);
    mutatedAdapter.scanPrivateDirectoryBounded = input => ({
      ...originalScan(input),
      receiptDigest: repeatedDigest('f'),
    });
    const mutatedStore = openedStore(mutatedAdapter).store;
    reserveDispatch({ store: mutatedStore, policy: taskPolicy });
    expectHold(() => mutatedStore.listDispatchAdmissions({
      policy: taskPolicy,
      maxEntries: 32,
      maxNameBytes: 128,
      deadlineAt: '2099-09-01T00:00:00.000Z',
    }), 'DISPATCH_DISCOVERY_MUTATED');
  });

  it('rejects extra-key, accessor and proxy authority at every dispatch ingress', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const base = {
      dispatchRequestId: dispatchId(),
      dispatchRequestMaterial: { approvedTaskMaterialDigest: repeatedDigest('7') },
      taskId: '001-001',
      taskSnapshot: { id: '001-001' },
      policy: taskPolicy,
      reservedAt: '2026-08-30T20:00:00.000Z',
      predecessor: null,
    };
    expectHold(
      () => store.reserveDispatchAdmission({ ...base, extra: true } as typeof base),
      'DISPATCH_REQUEST_INVALID',
    );
    expect(adapter.publishBytesCalls).toBe(0);
    const accessorMaterial = Object.defineProperty({}, 'digest', {
      enumerable: true,
      get: () => repeatedDigest('7'),
    });
    expectHold(
      () => store.reserveDispatchAdmission({
        ...base,
        dispatchRequestMaterial: accessorMaterial,
      }),
      'INVALID_CANONICAL_JSON',
    );
    expectHold(
      () => store.reserveDispatchAdmission({
        ...base,
        dispatchRequestMaterial: new Proxy({ digest: repeatedDigest('7') }, {}),
      }),
      'INVALID_CANONICAL_JSON',
    );
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    expectHold(() => store.settleNotDispatched({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'PROVIDER_UNAVAILABLE',
      noEffectObservation: { ...noEffectObservation(), extra: true },
    } as Parameters<typeof store.settleNotDispatched>[0]), 'DISPATCH_AUTHORITY_INVALID');
    expectHold(() => store.readDispatchAuthority({
      admissionRef: { ...admitted.ref, extra: true },
      policy: taskPolicy,
    } as Parameters<typeof store.readDispatchAuthority>[0]), 'DISPATCH_AUTHORITY_INVALID');
  });

  it('publishes and restart-rereads path-free immutable dispatch observations by class', () => {
    const state = memoryCustodyState();
    const { store } = openedStore(new InMemoryCustodyAdapter(state));
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    for (const [index, observationClass] of ([
      'GATE_ACK',
      'NO_EFFECT',
      'RECONCILIATION',
    ] as const).entries()) {
      const bytes = Buffer.from(`{"class":"${observationClass}","sequence":${index + 1}}`);
      const observedAt = `2026-08-30T20:0${index + 1}:00.000Z`;
      const receipt = store.publishDispatchObservation({
        admissionRef: admitted.ref,
        policy: taskPolicy,
        observationClass,
        observedAt,
        bytes,
      });
      expect(receipt).toMatchObject({
        observationClass,
        admissionRefDigest: admitted.ref.refDigest,
        observedAt,
        byteLength: bytes.byteLength,
      });
      expect(JSON.stringify(receipt)).not.toMatch(/(?:path|source|\/test\/)/iu);
      expect(store.publishDispatchObservation({
        admissionRef: admitted.ref,
        policy: taskPolicy,
        observationClass,
        observedAt,
        bytes,
      })).toEqual(receipt);
      const restarted = openedStore(new InMemoryCustodyAdapter(state)).store;
      const reopened = restarted.readDispatchAdmission({
        dispatchRequestId: dispatchId(),
        policy: taskPolicy,
      });
      if (reopened.state !== 'admitted') throw new Error('dispatch admission missing');
      const verified = restarted.readDispatchObservation({
        admissionRef: reopened.ref,
        policy: taskPolicy,
        observationClass,
        receiptDigest: receipt.receiptDigest,
      });
      expect(Buffer.from(verified.bytes).equals(bytes)).toBe(true);
      verified.bytes[0] = verified.bytes[0]! ^ 0xff;
      expect(Buffer.from(restarted.readDispatchObservation({
        admissionRef: reopened.ref,
        policy: taskPolicy,
        observationClass,
        receiptDigest: receipt.receiptDigest,
      }).bytes).equals(bytes)).toBe(true);
      expectHold(() => restarted.publishDispatchObservation({
        admissionRef: reopened.ref,
        policy: taskPolicy,
        observationClass,
        observedAt,
        bytes: Buffer.from('{"changed":true}'),
      }), 'DISPATCH_AUTHORITY_CONFLICT');
      expectHold(() => restarted.publishDispatchObservation({
        admissionRef: reopened.ref,
        policy: taskPolicy,
        observationClass,
        observedAt: '2026-08-30T20:09:00.000Z',
        bytes,
      }), 'DISPATCH_AUTHORITY_CONFLICT');
    }
    expect(store.readDispatchAuthority({
      admissionRef: admitted.ref,
      policy: taskPolicy,
    })).toEqual({ state: 'absent', admissionRef: admitted.ref });
    for (const observationClass of [
      'PROVIDER_START',
      'PROVIDER_EXECUTION',
      'PROVIDER_EXIT',
    ] as const) {
      expectHold(() => store.publishDispatchObservation({
        admissionRef: admitted.ref,
        policy: taskPolicy,
        observationClass,
        observedAt: '2026-08-30T20:04:00.000Z',
        bytes: Buffer.from(`{"class":"${observationClass}"}`),
      }), 'DISPATCH_TRANSITION_INVALID');
    }
  });

  it('keeps observation bytes-without-receipt as HOLD and exact retry completes it', () => {
    const adapter = new InMemoryCustodyAdapter();
    const originalPublish = adapter.publishBytesFirstWriter.bind(adapter);
    let interruptReceipt = true;
    adapter.publishBytesFirstWriter = input => {
      if (interruptReceipt && input.relativePath.endsWith('/receipt.json')) {
        interruptReceipt = false;
        throw Object.freeze({ code: 'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED' });
      }
      return originalPublish(input);
    };
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    const input = {
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'GATE_ACK' as const,
      observedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('{"gate":"acknowledged"}'),
    };
    expectHold(() => store.publishDispatchObservation(input), 'PUBLISHED_UNCONFIRMED');
    expectHold(() => store.readDispatchObservationByClass({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'GATE_ACK',
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    expectHold(() => store.readDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'GATE_ACK',
      receiptDigest: repeatedDigest('1'),
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    expectHold(() => store.publishDispatchObservation({
      ...input,
      observedAt: '2026-08-30T20:02:00.000Z',
    }), 'DISPATCH_AUTHORITY_CONFLICT');
    const receipt = store.publishDispatchObservation(input);
    expect(store.readDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'GATE_ACK',
      receiptDigest: receipt.receiptDigest,
    }).receipt).toEqual(receipt);
  });

  it('keeps observation claim-without-bytes as HOLD and only exact retry may complete', () => {
    const adapter = new InMemoryCustodyAdapter();
    const originalPublish = adapter.publishBytesFirstWriter.bind(adapter);
    let interruptBytes = true;
    adapter.publishBytesFirstWriter = input => {
      if (interruptBytes && input.relativePath.endsWith('/observation.bin')) {
        interruptBytes = false;
        throw Object.freeze({ code: 'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED' });
      }
      return originalPublish(input);
    };
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    const input = {
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'NO_EFFECT' as const,
      observedAt: '2026-08-30T20:01:00.000Z',
      bytes: Buffer.from('{"effects":"absent"}'),
    };
    expectHold(() => store.publishDispatchObservation(input), 'PUBLISHED_UNCONFIRMED');
    expectHold(() => store.readDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'NO_EFFECT',
      receiptDigest: repeatedDigest('1'),
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    expectHold(() => store.publishDispatchObservation({
      ...input,
      bytes: Buffer.from('{"effects":"unknown"}'),
    }), 'DISPATCH_AUTHORITY_CONFLICT');
    expectHold(() => store.publishDispatchObservation({
      ...input,
      observedAt: '2026-08-30T20:02:00.000Z',
    }), 'DISPATCH_AUTHORITY_CONFLICT');
    const receipt = store.publishDispatchObservation(input);
    expect(Buffer.from(store.readDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'NO_EFFECT',
      receiptDigest: receipt.receiptDigest,
    }).bytes).equals(input.bytes)).toBe(true);
  });

  it('resolves dispatch observation first-writer races and rejects forged ingress', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    const winnerBytes = Buffer.from('{"winner":true}');
    let winnerReceipt: ReturnType<typeof store.publishDispatchObservation> | null = null;
    adapter.reenterPublishBytesForPathSuffix = {
      suffix: '/observations/gate-ack/claim.json',
      action: () => {
        winnerReceipt = store.publishDispatchObservation({
          admissionRef: admitted.ref,
          policy: taskPolicy,
          observationClass: 'GATE_ACK',
          observedAt: '2026-08-30T20:01:00.000Z',
          bytes: winnerBytes,
        });
      },
    };
    expectHold(() => store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'GATE_ACK',
      observedAt: '2026-08-30T20:02:00.000Z',
      bytes: Buffer.from('{"loser":true}'),
    }), 'DISPATCH_AUTHORITY_CONFLICT');
    expect(winnerReceipt).not.toBeNull();
    expect(Buffer.from(store.readDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'GATE_ACK',
      receiptDigest: winnerReceipt!.receiptDigest,
    }).bytes).equals(winnerBytes)).toBe(true);
    expectHold(() => store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'NO_EFFECT',
      observedAt: '2026-08-30T20:01:00.000Z',
      bytes: new Proxy(new Uint8Array([1]), {}),
    }), 'DISPATCH_AUTHORITY_INVALID');
    expectHold(() => store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'NO_EFFECT',
      observedAt: '2026-08-30T20:01:00.000Z',
      bytes: new Uint8Array([1]),
      extra: true,
    } as Parameters<typeof store.publishDispatchObservation>[0]), 'DISPATCH_AUTHORITY_INVALID');
    expectHold(() => store.readDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'GATE_ACK',
      receiptDigest: repeatedDigest('f'),
    }), 'DISPATCH_AUTHORITY_INVALID');
  });

  it('leaves a typed pending reservation on admission interruption and completes exact retry', () => {
    const adapter = new InMemoryCustodyAdapter();
    const originalRead = adapter.readFirstWriter.bind(adapter);
    let interruptAdmission = true;
    adapter.readFirstWriter = input => {
      if (interruptAdmission && input.relativePath.endsWith('/admission.json')) {
        interruptAdmission = false;
        throw Object.freeze({ code: 'E_EXEC_AUTH_NATIVE_READ_UNCONFIRMED' });
      }
      return originalRead(input);
    };
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    expectHold(
      () => reserveDispatch({ store, policy: taskPolicy }),
      'CAPABILITY_UNVERIFIED',
    );
    const pending = store.readDispatchAdmission({
      dispatchRequestId: dispatchId(),
      policy: taskPolicy,
    });
    expect(pending.state).toBe('reserved-pending-admission');
    const completed = reserveDispatch({ store, policy: taskPolicy });
    expect(completed.state).toBe('admitted');
  });

  it('recovers exact material-first crash but exposes the orphan as HOLD to ordinary readers', () => {
    const adapter = new InMemoryCustodyAdapter();
    const originalPublish = adapter.publishBytesFirstWriter.bind(adapter);
    let interruptReservation = true;
    adapter.publishBytesFirstWriter = input => {
      if (interruptReservation && input.relativePath.endsWith('/reservation.json')) {
        interruptReservation = false;
        throw Object.freeze({ code: 'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED' });
      }
      return originalPublish(input);
    };
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    expectHold(
      () => reserveDispatch({ store, policy: taskPolicy }),
      'PUBLISHED_UNCONFIRMED',
    );
    expectHold(() => store.readDispatchAdmission({
      dispatchRequestId: dispatchId(),
      policy: taskPolicy,
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    expect(reserveDispatch({ store, policy: taskPolicy }).state).toBe('admitted');
  });

  it('enforces predecessor monotonicity and one first-writer child generation slot', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const parent = reserveDispatch({ store, policy: taskPolicy });
    const pathsBeforeInvalid = adapter.publishedPaths.length;
    expectHold(() => reserveDispatch({
      store,
      policy: taskPolicy,
      requestId: dispatchId('2'),
      reservedAt: '2026-08-30T19:59:59.000Z',
      predecessor: parent.ref,
    }), 'CHAIN_PREDECESSOR_MISMATCH');
    expect(adapter.publishedPaths).toHaveLength(pathsBeforeInvalid);

    const child = reserveDispatch({
      store,
      policy: taskPolicy,
      requestId: dispatchId('2'),
      reservedAt: '2026-08-30T20:01:00.000Z',
      predecessor: parent.ref,
    });
    expect(child.ref.identity).toMatchObject({
      attemptId: parent.ref.identity.attemptId,
      generation: 2,
    });
    expect(reserveDispatch({
      store,
      policy: taskPolicy,
      requestId: dispatchId('2'),
      reservedAt: '2026-08-30T19:00:00.000Z',
      predecessor: parent.ref,
    })).toEqual(child);
    expectHold(() => reserveDispatch({
      store,
      policy: taskPolicy,
      requestId: dispatchId('3'),
      reservedAt: '2026-08-30T20:02:00.000Z',
      predecessor: parent.ref,
    }), 'DISPATCH_REQUEST_CONFLICT');
  });

  it('rejects PROVIDER_START while mount outcome is confirmed but RELEASED is pending', async () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    const access = store.openAttemptAccess({
      identity: admitted.ref.identity,
      policy: taskPolicy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    await store.consumeAttemptMountLease(
      store.issueAttemptMountLease({ access, policy: taskPolicy }),
    );
    expect(store.readDispatchAuthority({
      admissionRef: admitted.ref,
      policy: taskPolicy,
    })).toMatchObject({
      state: 'transition-pending',
      transition: { state: 'MOUNT_CLAIMED' },
      mountEffectState: 'OUTCOME_CONFIRMED',
    });
    expectHold(() => store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      observedAt: '2026-08-30T20:02:00.000Z',
      bytes: Buffer.from('{"startStatus":"PENDING_RELEASE"}'),
    }), 'DISPATCH_TRANSITION_INVALID');
  });

  it('settles RELEASED only from exact mount outcome and durable gated release evidence', async () => {
    const state = memoryCustodyState();
    const { adapter, store } = openedStore(new InMemoryCustodyAdapter(state));
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    const access = store.openAttemptAccess({
      identity: admitted.ref.identity,
      policy: taskPolicy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const transfer = await store.consumeAttemptMountLease(
      store.issueAttemptMountLease({ access, policy: taskPolicy }),
    );
    if (
      transfer.backendExecutionId === null
      || transfer.backendImageDigest === null
      || transfer.backendAuthorityLabelDigest === null
    ) throw new Error('mount transfer incomplete');
    const releaseEvidenceBase = {
      containerId: transfer.backendExecutionId,
      imageDigest: transfer.backendImageDigest,
      mountReceiptDigest: transfer.receiptDigest,
      mountTransferEvidenceDigest: transfer.transferEvidenceDigest,
      daemonAuthorityLabelDigest: transfer.backendAuthorityLabelDigest,
      releaseNonceDigest: repeatedDigest('1'),
      providerInvocationDigest: repeatedDigest('2'),
      gateAckReceiptDigest: repeatedDigest('3'),
      gateAckEvidenceDigest: repeatedDigest('4'),
      releasedAt: '2026-08-30T20:02:00.000Z',
      ackMethod: 'HOST_RELEASE_GATE' as const,
      ackStatus: 'ACKNOWLEDGED' as const,
    };
    expectHold(() => store.settleReleasedDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      mountTransferReceipt: transfer,
      releaseEvidence: releaseEvidenceBase,
      recordedAt: '2026-08-30T20:03:00.000Z',
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    const wrongClassObservation = publishNoEffectObservation({
      store,
      admissionRef: admitted.ref,
      policy: taskPolicy,
    });
    expectHold(() => store.settleReleasedDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      mountTransferReceipt: transfer,
      releaseEvidence: {
        ...releaseEvidenceBase,
        gateAckReceiptDigest: wrongClassObservation.observationReceiptDigest,
        gateAckEvidenceDigest: wrongClassObservation.observationEvidenceDigest,
      },
      recordedAt: '2026-08-30T20:03:00.000Z',
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    const gateAckObservation = publishGateAckObservation({
      store,
      admissionRef: admitted.ref,
      policy: taskPolicy,
    });
    expectHold(() => store.settleReleasedDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      mountTransferReceipt: transfer,
      releaseEvidence: {
        ...releaseEvidenceBase,
        gateAckReceiptDigest: gateAckObservation.receiptDigest,
        gateAckEvidenceDigest: repeatedDigest('0'),
      },
      recordedAt: '2026-08-30T20:03:00.000Z',
    }), 'DISPATCH_AUTHORITY_INVALID');
    const foreignAdmission = reserveDispatch({
      store,
      policy: taskPolicy,
      requestId: dispatchId('2'),
    });
    const foreignGateAckObservation = publishGateAckObservation({
      store,
      admissionRef: foreignAdmission.ref,
      policy: taskPolicy,
    });
    expectHold(() => store.settleReleasedDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      mountTransferReceipt: transfer,
      releaseEvidence: {
        ...releaseEvidenceBase,
        gateAckReceiptDigest: foreignGateAckObservation.receiptDigest,
        gateAckEvidenceDigest: foreignGateAckObservation.evidenceDigest,
      },
      recordedAt: '2026-08-30T20:03:00.000Z',
    }), 'DISPATCH_AUTHORITY_INVALID');
    const releaseEvidence = {
      ...releaseEvidenceBase,
      gateAckReceiptDigest: gateAckObservation.receiptDigest,
      gateAckEvidenceDigest: gateAckObservation.evidenceDigest,
    };
    const released = store.settleReleasedDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      mountTransferReceipt: transfer,
      releaseEvidence,
      recordedAt: '2026-08-30T20:03:00.000Z',
    });
    expect(released).toMatchObject({ state: 'RELEASED', attemptCount: 1 });
    expect(released.providerExecutionAttempt.providerExecutionAttemptId)
      .not.toBe(admitted.ref.identity.attemptId);
    expect(released.releaseEvidence.gateAckReceiptDigest)
      .toBe(gateAckObservation.receiptDigest);

    const { adapter: restartedAdapter, store: restarted } = openedStore(
      new InMemoryCustodyAdapter(state),
    );
    const reopened = restarted.readDispatchAdmission({
      dispatchRequestId: dispatchId(),
      policy: taskPolicy,
    });
    if (reopened.state !== 'admitted') throw new Error('dispatch admission missing');
    expect(restarted.readDispatchAuthority({
      admissionRef: reopened.ref,
      policy: taskPolicy,
    })).toMatchObject({ state: 'terminal', authority: released });
    expect(restarted.settleReleasedDispatch({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      mountTransferReceipt: transfer,
      releaseEvidence,
      recordedAt: '2026-08-30T20:10:00.000Z',
    })).toEqual(released);
    expectHold(() => restarted.settleReleasedDispatch({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      mountTransferReceipt: transfer,
      releaseEvidence: { ...releaseEvidence, releaseNonceDigest: repeatedDigest('9') },
      recordedAt: '2026-08-30T20:11:00.000Z',
    }), 'DISPATCH_AUTHORITY_CONFLICT');

    const forgedTransfer = createTaskAttemptCustodyBackendMountTransferReceipt({
      state: 'CONSUMED',
      rootId: transfer.rootId,
      scopeDigest: transfer.scopeDigest,
      effectOpDigest: transfer.effectOpDigest,
      attemptId: transfer.attemptId,
      generation: transfer.generation,
      ...mountBackendEvidence('CONSUMED'),
      backendExecutionId: 'b'.repeat(64),
    });
    expectHold(() => store.settleReleasedDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      mountTransferReceipt: forgedTransfer,
      releaseEvidence: { ...releaseEvidence, containerId: 'b'.repeat(64) },
      recordedAt: '2026-08-30T20:04:00.000Z',
    }), 'DISPATCH_TRANSITION_INVALID');
    const providerExecutionBytes = Buffer.from(
      '{"runtime":"PID1","invocation":"OBSERVED"}',
    );
    const providerExitBytes = Buffer.from(
      '{"waitStatus":"EXITED","inspectStatus":"STOPPED","exitCode":0}',
    );
    expect(store.readDispatchObservationByClass({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXECUTION',
    })).toBeNull();
    expectHold(() => store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXECUTION',
      observedAt: '2026-08-30T20:03:30.000Z',
      bytes: providerExecutionBytes,
    }), 'DISPATCH_TRANSITION_INVALID');
    expectHold(() => store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      observedAt: '2026-08-30T20:04:00.000Z',
      bytes: providerExitBytes,
    }), 'DISPATCH_TRANSITION_INVALID');

    const providerStartBytes = Buffer.from(
      '{"startStatus":"STARTED","pid1Gate":"ACKNOWLEDGED"}',
    );
    expectHold(() => store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      observedAt: '2026-08-30T20:02:30.000Z',
      bytes: providerStartBytes,
    }), 'DISPATCH_AUTHORITY_INVALID');
    const providerStart = store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      observedAt: '2026-08-30T20:03:30.000Z',
      bytes: providerStartBytes,
    });
    expect(store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      observedAt: '2026-08-30T20:03:30.000Z',
      bytes: providerStartBytes,
    })).toEqual(providerStart);
    expect(Buffer.from(restarted.readDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      receiptDigest: providerStart.receiptDigest,
    }).bytes).equals(providerStartBytes)).toBe(true);
    expectHold(() => restarted.publishDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      observedAt: '2026-08-30T20:03:30.000Z',
      bytes: Buffer.from('{"startStatus":"FAILED"}'),
    }), 'DISPATCH_AUTHORITY_CONFLICT');
    expectHold(() => restarted.publishDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      observedAt: '2026-08-30T20:04:00.000Z',
      bytes: providerStartBytes,
    }), 'DISPATCH_AUTHORITY_CONFLICT');
    expectHold(() => restarted.readDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      receiptDigest: gateAckObservation.receiptDigest,
    }), 'DISPATCH_AUTHORITY_INVALID');
    expectHold(() => store.publishDispatchObservation({
      admissionRef: foreignAdmission.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      observedAt: '2026-08-30T20:03:30.000Z',
      bytes: providerStartBytes,
    }), 'DISPATCH_TRANSITION_INVALID');
    expectHold(() => restarted.readDispatchObservation({
      admissionRef: foreignAdmission.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      receiptDigest: providerStart.receiptDigest,
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    expectHold(() => store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      observedAt: '2026-08-30T20:04:00.000Z',
      bytes: providerExitBytes,
    }), 'DISPATCH_TRANSITION_INVALID');
    expectHold(() => store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXECUTION',
      observedAt: '2026-08-30T20:03:00.000Z',
      bytes: providerExecutionBytes,
    }), 'DISPATCH_AUTHORITY_INVALID');
    const providerExecution = store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXECUTION',
      observedAt: '2026-08-30T20:03:45.000Z',
      bytes: providerExecutionBytes,
    });
    expectHold(() => restarted.publishProviderStreamCapture({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      artifactKey: 'provider-restart-safe',
      capturedAt: '2026-08-30T20:04:00.000Z',
      bytes: Buffer.from('provider output before durable exit'),
    }), 'ARTIFACT_REPLAY_MISMATCH');
    expect(store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXECUTION',
      observedAt: '2026-08-30T20:03:45.000Z',
      bytes: providerExecutionBytes,
    })).toEqual(providerExecution);
    expect(restarted.readDispatchObservationByClass({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXECUTION',
    })?.receipt).toEqual(providerExecution);
    expectHold(() => restarted.publishDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXECUTION',
      observedAt: '2026-08-30T20:03:45.000Z',
      bytes: Buffer.from('{"runtime":"SIBLING"}'),
    }), 'DISPATCH_AUTHORITY_CONFLICT');
    expectHold(() => restarted.readDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXECUTION',
      receiptDigest: providerStart.receiptDigest,
    }), 'DISPATCH_AUTHORITY_INVALID');
    adapter.tamperFirst(
      '/observations/provider-execution/observation.bin',
      Buffer.from('{"runtime":"TAMPERED"}'),
    );
    expectHold(() => restarted.readDispatchObservationByClass({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXECUTION',
    }), 'CAPABILITY_UNVERIFIED');
    adapter.tamperFirst(
      '/observations/provider-execution/observation.bin',
      providerExecutionBytes,
    );
    expect(restarted.readDispatchObservationByClass({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXECUTION',
    })?.receipt).toEqual(providerExecution);
    adapter.tamperFirst(
      '/observations/provider-start/observation.bin',
      Buffer.from('{"startStatus":"CORRUPTED"}'),
    );
    expectHold(() => restarted.readDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      receiptDigest: providerStart.receiptDigest,
    }), 'CAPABILITY_UNVERIFIED');
    adapter.tamperFirst('/observations/provider-start/observation.bin', providerStartBytes);
    expect(restarted.readDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
      receiptDigest: providerStart.receiptDigest,
    }).receipt).toEqual(providerStart);
    expect(restarted.readDispatchAuthority({
      admissionRef: reopened.ref,
      policy: taskPolicy,
    })).toMatchObject({ state: 'terminal', authority: released });

    expectHold(() => store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      observedAt: '2026-08-30T20:02:30.000Z',
      bytes: providerExitBytes,
    }), 'DISPATCH_AUTHORITY_INVALID');
    const providerExit = store.publishDispatchObservation({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      observedAt: '2026-08-30T20:04:00.000Z',
      bytes: providerExitBytes,
    });
    const providerStreamBytes = Buffer.from('provider output after durable exit');
    const providerStream = restarted.publishProviderStreamCapture({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      artifactKey: 'provider-restart-safe',
      capturedAt: providerExit.observedAt,
      bytes: providerStreamBytes,
    });
    expect(providerStream.captureMode).toBe('provider-stream-capture');
    expect(providerStream.capturedAt).toBe(providerExit.observedAt);
    expect(restarted.publishProviderStreamCapture({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      artifactKey: 'provider-restart-safe',
      capturedAt: providerExit.observedAt,
      bytes: providerStreamBytes,
    })).toEqual(providerStream);
    expectHold(() => restarted.publishProviderStreamCapture({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      artifactKey: 'provider-restart-safe',
      capturedAt: providerExit.observedAt,
      bytes: Buffer.from('sibling provider output'),
    }), 'FIRST_WRITER_COLLISION');
    expect(restartedAdapter.activeStreamSessions).toBe(0);
    expect(restartedAdapter.streamAppendCalls).toBe(0);
    expect(restartedAdapter.streamSealCalls).toBe(0);
    expect(Buffer.from(restarted.readDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      receiptDigest: providerExit.receiptDigest,
    }).bytes).equals(providerExitBytes)).toBe(true);
    expectHold(() => restarted.publishDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      observedAt: '2026-08-30T20:04:00.000Z',
      bytes: Buffer.from('{"waitStatus":"EXITED","exitCode":1}'),
    }), 'DISPATCH_AUTHORITY_CONFLICT');
    expectHold(() => restarted.publishDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      observedAt: '2026-08-30T20:05:00.000Z',
      bytes: providerExitBytes,
    }), 'DISPATCH_AUTHORITY_CONFLICT');
    expectHold(() => restarted.readDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      receiptDigest: gateAckObservation.receiptDigest,
    }), 'DISPATCH_AUTHORITY_INVALID');
    expectHold(() => store.publishDispatchObservation({
      admissionRef: foreignAdmission.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      observedAt: '2026-08-30T20:04:00.000Z',
      bytes: providerExitBytes,
    }), 'DISPATCH_TRANSITION_INVALID');
    expectHold(() => restarted.readDispatchObservation({
      admissionRef: foreignAdmission.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      receiptDigest: providerExit.receiptDigest,
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    adapter.removeFirst('/observations/provider-start/receipt.json');
    expectHold(() => restarted.readDispatchObservationByClass({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_START',
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    expect(restarted.readDispatchAuthority({
      admissionRef: reopened.ref,
      policy: taskPolicy,
    })).toMatchObject({ state: 'terminal', authority: released });
    adapter.removeFirst('/observations/provider-exit/receipt.json');
    expectHold(() => restarted.readDispatchObservation({
      admissionRef: reopened.ref,
      policy: taskPolicy,
      observationClass: 'PROVIDER_EXIT',
      receiptDigest: providerExit.receiptDigest,
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    expect(restarted.readDispatchAuthority({
      admissionRef: reopened.ref,
      policy: taskPolicy,
    })).toMatchObject({ state: 'terminal', authority: released });
    adapter.removeFirst('/observations/gate-ack/receipt.json');
    expectHold(() => restarted.readDispatchAuthority({
      admissionRef: reopened.ref,
      policy: taskPolicy,
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
  });

  it('settles proven NOT_DISPATCHED at zero public attempts and blocks later mount', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    expectHold(() => store.settleNotDispatched({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'PROVIDER_UNAVAILABLE',
      noEffectObservation: noEffectObservation(),
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    const wrongClassObservation = publishGateAckObservation({
      store,
      admissionRef: admitted.ref,
      policy: taskPolicy,
    });
    expectHold(() => store.settleNotDispatched({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'PROVIDER_UNAVAILABLE',
      noEffectObservation: noEffectObservation(
        '2026-08-30T20:01:00.000Z',
        wrongClassObservation.receiptDigest,
        wrongClassObservation.evidenceDigest,
      ),
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    const durableNoEffect = publishNoEffectObservation({
      store,
      admissionRef: admitted.ref,
      policy: taskPolicy,
    });
    expectHold(() => store.settleNotDispatched({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'PROVIDER_UNAVAILABLE',
      noEffectObservation: {
        ...durableNoEffect,
        observationEvidenceDigest: repeatedDigest('0'),
      },
    }), 'DISPATCH_AUTHORITY_INVALID');
    const first = store.settleNotDispatched({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'PROVIDER_UNAVAILABLE',
      noEffectObservation: durableNoEffect,
    });
    expect(first).toMatchObject({
      state: 'NOT_DISPATCHED',
      attemptCount: 0,
      providerExecutionAttempt: null,
    });
    const replay = store.settleNotDispatched({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'PROVIDER_UNAVAILABLE',
      noEffectObservation: { ...durableNoEffect, observedAt: '2026-08-30T20:05:00.000Z' },
    });
    expect(replay).toEqual(first);
    for (const observationClass of ['PROVIDER_START', 'PROVIDER_EXIT'] as const) {
      expectHold(() => store.publishDispatchObservation({
        admissionRef: admitted.ref,
        policy: taskPolicy,
        observationClass,
        observedAt: '2026-08-30T20:06:00.000Z',
        bytes: Buffer.from(`{"class":"${observationClass}","state":"NOT_STARTED"}`),
      }), 'DISPATCH_TRANSITION_INVALID');
    }
    expectHold(() => store.settleNotDispatched({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'DAEMON_ABSENT',
      noEffectObservation: durableNoEffect,
    }), 'DISPATCH_AUTHORITY_CONFLICT');
    const access = store.openAttemptAccess({
      identity: admitted.ref.identity,
      policy: taskPolicy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    expectHold(
      () => store.issueAttemptMountLease({ access, policy: taskPolicy }),
      'DISPATCH_TRANSITION_INVALID',
    );
    adapter.removeFirst('/observations/no-effect/receipt.json');
    expectHold(() => store.readDispatchAuthority({
      admissionRef: admitted.ref,
      policy: taskPolicy,
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
  });

  it('arbitrates NOT observation versus MOUNT claim with one immutable winner', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    const access = store.openAttemptAccess({
      identity: admitted.ref.identity,
      policy: taskPolicy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const durableNoEffect = publishNoEffectObservation({
      store,
      admissionRef: admitted.ref,
      policy: taskPolicy,
    });
    let winningLease: ReturnType<typeof store.issueAttemptMountLease> | null = null;
    adapter.reenterPublishBytesForPathSuffix = {
      suffix: '/physical-transition.json',
      action: () => {
        winningLease = store.issueAttemptMountLease({ access, policy: taskPolicy });
      },
    };
    expectHold(() => store.settleNotDispatched({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'PROVIDER_UNAVAILABLE',
      noEffectObservation: durableNoEffect,
    }), 'DISPATCH_TRANSITION_INVALID');
    expect(winningLease).not.toBeNull();
    expect(store.readDispatchAuthority({
      admissionRef: admitted.ref,
      policy: taskPolicy,
    })).toMatchObject({
      state: 'transition-pending',
      transition: { state: 'MOUNT_CLAIMED' },
      mountEffectState: 'INTENT_ONLY',
    });
    for (const observationClass of ['PROVIDER_START', 'PROVIDER_EXIT'] as const) {
      expectHold(() => store.publishDispatchObservation({
        admissionRef: admitted.ref,
        policy: taskPolicy,
        observationClass,
        observedAt: '2026-08-30T20:02:00.000Z',
        bytes: Buffer.from(`{"class":"${observationClass}","state":"UNKNOWN"}`),
      }), 'DISPATCH_TRANSITION_INVALID');
    }
  });

  it('arbitrates MOUNT terminal check versus NOT claim without publishing mount intent', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    const access = store.openAttemptAccess({
      identity: admitted.ref.identity,
      policy: taskPolicy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const durableNoEffect = publishNoEffectObservation({
      store,
      admissionRef: admitted.ref,
      policy: taskPolicy,
    });
    let notDispatchedReceipt: ReturnType<typeof store.settleNotDispatched> | null = null;
    adapter.reenterPublishBytesForPathSuffix = {
      suffix: '/physical-transition.json',
      action: () => {
        notDispatchedReceipt = store.settleNotDispatched({
          admissionRef: admitted.ref,
          policy: taskPolicy,
          reasonCode: 'DAEMON_ABSENT',
          noEffectObservation: durableNoEffect,
        });
      },
    };
    expectHold(
      () => store.issueAttemptMountLease({ access, policy: taskPolicy }),
      'DISPATCH_TRANSITION_INVALID',
    );
    expect(notDispatchedReceipt).toMatchObject({
      state: 'NOT_DISPATCHED',
      attemptCount: 0,
    });
    expect(store.readDispatchAuthority({
      admissionRef: admitted.ref,
      policy: taskPolicy,
    })).toMatchObject({
      state: 'terminal',
      authority: { state: 'NOT_DISPATCHED' },
    });
  });

  it('reports MOUNT claim crash as transition-pending and exact retry writes intent', () => {
    const { adapter, store } = openedStore();
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    const access = store.openAttemptAccess({
      identity: admitted.ref.identity,
      policy: taskPolicy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    adapter.afterPublishBytesForPathSuffix = {
      suffix: '/physical-transition.json',
      action: () => {
        adapter.readDurableEffectMarkerError = Object.freeze({
          code: 'RECONCILIATION_REQUIRED',
        });
      },
    };
    expectHold(
      () => store.issueAttemptMountLease({ access, policy: taskPolicy }),
      'RECONCILIATION_REQUIRED',
    );
    expect(store.readDispatchAuthority({
      admissionRef: admitted.ref,
      policy: taskPolicy,
    })).toMatchObject({
      state: 'transition-pending',
      transition: { state: 'MOUNT_CLAIMED' },
      mountEffectState: 'ABSENT',
    });
    expect(store.issueAttemptMountLease({ access, policy: taskPolicy })).toBeTruthy();
    expect(store.readDispatchAuthority({
      admissionRef: admitted.ref,
      policy: taskPolicy,
    })).toMatchObject({ state: 'transition-pending', mountEffectState: 'INTENT_ONLY' });
  });

  it('reports NOT claim crash as transition-pending and exact retry terminalizes it', () => {
    const adapter = new InMemoryCustodyAdapter();
    const originalPublish = adapter.publishBytesFirstWriter.bind(adapter);
    let interruptTerminal = true;
    adapter.publishBytesFirstWriter = input => {
      if (interruptTerminal && input.relativePath.endsWith('/terminal.json')) {
        interruptTerminal = false;
        throw Object.freeze({ code: 'E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED' });
      }
      return originalPublish(input);
    };
    const { store } = openedStore(adapter);
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    const durableNoEffect = publishNoEffectObservation({
      store,
      admissionRef: admitted.ref,
      policy: taskPolicy,
    });
    const settlement = {
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'PROVIDER_UNAVAILABLE' as const,
      noEffectObservation: durableNoEffect,
    };
    expectHold(() => store.settleNotDispatched(settlement), 'PUBLISHED_UNCONFIRMED');
    expect(store.readDispatchAuthority({
      admissionRef: admitted.ref,
      policy: taskPolicy,
    })).toMatchObject({
      state: 'transition-pending',
      transition: { state: 'NOT_DISPATCHED_CLAIMED' },
      mountEffectState: 'ABSENT',
    });
    expect(store.settleNotDispatched(settlement)).toMatchObject({
      state: 'NOT_DISPATCHED',
      attemptCount: 0,
    });
  });

  it('keeps AMBIGUOUS nonterminal and permits one exact later RELEASED transition', async () => {
    const { store } = openedStore();
    const taskPolicy = policy();
    const admitted = reserveDispatch({ store, policy: taskPolicy });
    const access = store.openAttemptAccess({
      identity: admitted.ref.identity,
      policy: taskPolicy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    const reconciliationEvidenceBase = {
      containerState: 'UNKNOWN' as const,
      containerId: null,
      imageDigest: null,
      mountReceiptDigest: null,
      releaseState: 'UNKNOWN' as const,
      releaseNonceDigest: null,
      providerInvocationDigest: null,
      containmentEvidenceDigest: repeatedDigest('5'),
      backendProbeEvidenceDigest: repeatedDigest('6'),
      observationReceiptDigest: repeatedDigest('7'),
      observationEvidenceDigest: repeatedDigest('8'),
      observedAt: '2026-08-30T20:01:00.000Z',
    };
    expectHold(() => store.recordAmbiguousDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'MOUNT_RECONCILIATION_REQUIRED',
      reconciliationEvidence: reconciliationEvidenceBase,
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    const gateAckObservation = publishGateAckObservation({
      store,
      admissionRef: admitted.ref,
      policy: taskPolicy,
    });
    expectHold(() => store.recordAmbiguousDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'MOUNT_RECONCILIATION_REQUIRED',
      reconciliationEvidence: {
        ...reconciliationEvidenceBase,
        observationReceiptDigest: gateAckObservation.receiptDigest,
        observationEvidenceDigest: gateAckObservation.evidenceDigest,
      },
    }), 'DISPATCH_RESERVATION_RECONCILIATION_REQUIRED');
    const reconciliationObservation = publishReconciliationObservation({
      store,
      admissionRef: admitted.ref,
      policy: taskPolicy,
    });
    expectHold(() => store.recordAmbiguousDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'MOUNT_RECONCILIATION_REQUIRED',
      reconciliationEvidence: {
        ...reconciliationEvidenceBase,
        observationReceiptDigest: reconciliationObservation.receiptDigest,
        observationEvidenceDigest: repeatedDigest('0'),
      },
    }), 'DISPATCH_AUTHORITY_INVALID');
    const reconciliation = store.recordAmbiguousDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'MOUNT_RECONCILIATION_REQUIRED',
      reconciliationEvidence: {
        containerState: 'UNKNOWN',
        containerId: null,
        imageDigest: null,
        mountReceiptDigest: null,
        releaseState: 'UNKNOWN',
        releaseNonceDigest: null,
        providerInvocationDigest: null,
        containmentEvidenceDigest: repeatedDigest('5'),
        backendProbeEvidenceDigest: repeatedDigest('6'),
        observationReceiptDigest: reconciliationObservation.receiptDigest,
        observationEvidenceDigest: reconciliationObservation.evidenceDigest,
        observedAt: '2026-08-30T20:01:00.000Z',
      },
    });
    expect(store.readDispatchAuthority({
      admissionRef: admitted.ref,
      policy: taskPolicy,
    })).toEqual({ state: 'ambiguous', reconciliation });
    for (const observationClass of ['PROVIDER_START', 'PROVIDER_EXIT'] as const) {
      expectHold(() => store.publishDispatchObservation({
        admissionRef: admitted.ref,
        policy: taskPolicy,
        observationClass,
        observedAt: '2026-08-30T20:02:00.000Z',
        bytes: Buffer.from(`{"class":"${observationClass}","state":"UNKNOWN"}`),
      }), 'DISPATCH_TRANSITION_INVALID');
    }
    const transfer = await store.consumeAttemptMountLease(lease);
    if (
      transfer.backendExecutionId === null
      || transfer.backendImageDigest === null
      || transfer.backendAuthorityLabelDigest === null
    ) throw new Error('mount transfer incomplete');
    const released = store.settleReleasedDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      mountTransferReceipt: transfer,
      releaseEvidence: {
        containerId: transfer.backendExecutionId,
        imageDigest: transfer.backendImageDigest,
        mountReceiptDigest: transfer.receiptDigest,
        mountTransferEvidenceDigest: transfer.transferEvidenceDigest,
        daemonAuthorityLabelDigest: transfer.backendAuthorityLabelDigest,
        releaseNonceDigest: repeatedDigest('1'),
        providerInvocationDigest: repeatedDigest('2'),
        gateAckReceiptDigest: gateAckObservation.receiptDigest,
        gateAckEvidenceDigest: gateAckObservation.evidenceDigest,
        releasedAt: '2026-08-30T20:02:00.000Z',
        ackMethod: 'HOST_RELEASE_GATE',
        ackStatus: 'ACKNOWLEDGED',
      },
      recordedAt: '2026-08-30T20:03:00.000Z',
    });
    expect(store.readDispatchAuthority({
      admissionRef: admitted.ref,
      policy: taskPolicy,
    })).toEqual({ state: 'terminal', authority: released, reconciliation });
    expectHold(() => store.recordAmbiguousDispatch({
      admissionRef: admitted.ref,
      policy: taskPolicy,
      reasonCode: 'CONTAINMENT_UNCONFIRMED',
      reconciliationEvidence: {
        containerState: 'PRESENT',
        containerId: transfer.backendExecutionId,
        imageDigest: transfer.backendImageDigest,
        mountReceiptDigest: transfer.receiptDigest,
        releaseState: 'ACKNOWLEDGED',
        releaseNonceDigest: repeatedDigest('1'),
        providerInvocationDigest: repeatedDigest('2'),
        containmentEvidenceDigest: repeatedDigest('5'),
        backendProbeEvidenceDigest: repeatedDigest('6'),
        observationReceiptDigest: reconciliationObservation.receiptDigest,
        observationEvidenceDigest: reconciliationObservation.evidenceDigest,
        observedAt: '2026-08-30T20:04:00.000Z',
      },
    }), 'DISPATCH_AUTHORITY_CONFLICT');
  });

  it('propagates a typed platform capability HOLD instead of fabricating support', () => {
    const adapter = new InMemoryCustodyAdapter();
    adapter.openRoot = () => {
      throw new TaskAttemptCustodyHold('NATIVE_CAPABILITY_UNAVAILABLE', 'open-root');
    };
    expectHold(() => TaskAttemptCustodyStore.open({
      adapter,
      absoluteRoot: 'C:/custody',
      canonicalProjectRoot: 'C:/project',
      projectId: 'project-1',
      create: true,
    }), 'NATIVE_CAPABILITY_UNAVAILABLE');
  });
});
