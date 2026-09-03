import { createHash } from 'node:crypto';

import {
  TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES,
  TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
  TaskAttemptCustodyHold,
  TaskAttemptCustodyStore,
  canonicalTaskAttemptCustodyJson,
  createTaskAttemptCustodyAdapterAbortResult,
  createTaskAttemptCustodyAdapterAppendResult,
  createTaskAttemptCustodyBackendMountTransferReceipt,
  createTaskAttemptCustodyEffectLandingReceiptV2,
  createTaskAttemptCustodyPolicy,
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
  type TaskAttemptCustodyResolvedMountBindings,
  type TaskAttemptCustodyRootProof,
  type TaskAttemptCustodyWriteSession,
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
} from '../../src/core/execution-effect-persistence-contract.js';
import {
  evaluateExecutionEffectContainment,
  parseExecutionEffectManifest,
  type ExecutionEffectManifest,
} from '../../src/core/execution-effect-containment.js';
import { compileExecutionEffectWritePolicy } from '../../src/core/execution-write-scope-policy.js';
import {
  createProductionTaskResultV2,
  validateTaskResult,
  type TaskResultV2,
} from '../../src/core/task-result-schema.js';
import {
  deriveProductionWiringApplicability,
  type ProductionWiringPlanEvidence,
  type ProductionWiringResultEvidence,
} from '../../src/core/task-types.js';
import {
  createTaskResultSettlementV2,
  taskResultSettlementV2Digest,
  type CreateTaskResultSettlementV2Input,
  type TaskResultSettlementV2,
  type TaskResultSettlementV2ArchivePayload,
} from '../../src/core/task-result-settlement.js';
import { createExactNormalTaskApprovedMaterialV3 } from '../../src/orchestra/exact-evaluation-policy-authority.js';

function rawSha256(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fixtureCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fixtureCanonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${fixtureCanonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fixtureDomainDigest(domain: string, value: unknown): Sha256Digest {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(fixtureCanonicalJson(value), 'utf8')
    .digest('hex')}`;
}

const TEST_ROOT_PROOF: TaskAttemptCustodyRootProof = Object.freeze({
  platform: 'posix',
  projectId: 'fixture-project',
  canonicalProjectRootSha256: createHash('sha256').update('/fixture/project').digest('hex'),
  rootId: `sha256:${'1'.repeat(64)}`,
  volumeId: 'fixture-volume',
  directoryId: 'fixture-directory',
  capabilityEvidenceDigest: `sha256:${'2'.repeat(64)}`,
});

interface FixtureMemoryFile {
  readonly bytes: Uint8Array;
  readonly proof: TaskAttemptCustodyFileProof;
}

interface FixturePublicationSession {
  readonly root: TaskAttemptCustodyRootProof;
  readonly relativePath: TaskAttemptCustodyRelativePath;
  readonly policy: TaskAttemptCustodyArtifactLimit;
  readonly chunks: Uint8Array[];
  terminal: boolean;
}

/** Simulation-only adapter. It cannot be cited as POSIX or Windows native proof. */
export class InMemoryTaskAttemptCustodyAdapter implements TaskAttemptCustodyAdapter {
  readonly platform = 'posix' as const;
  readonly files = new Map<string, FixtureMemoryFile>();
  readonly directories = new Map<string, TaskAttemptCustodyDirectoryProof>();
  readonly capabilityPaths = new WeakMap<object, TaskAttemptCustodyRelativePath>();
  readonly backendMountCapabilities = new WeakSet<object>();
  readonly effectMarkers = new Map<string, TaskAttemptCustodyDurableEffectMarker>();
  readonly publicationSessions = new WeakMap<object, FixturePublicationSession>();

  openRoot(input: {
    readonly absoluteRoot: string;
    readonly canonicalProjectRoot: string;
    readonly projectId: string;
    readonly create: boolean;
  }): TaskAttemptCustodyRootProof {
    return Object.freeze({
      ...TEST_ROOT_PROOF,
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
      directoryId: `fixture-dir:${relativeDirectory}`,
      privacyEvidenceDigest: `sha256:${'5'.repeat(64)}`,
      durabilityEvidenceDigest: `sha256:${'6'.repeat(64)}`,
    });
    this.directories.set(relativeDirectory, proof);
    return proof;
  }

  readPrivateDirectory(
    _root: TaskAttemptCustodyRootProof,
    relativeDirectory: TaskAttemptCustodyRelativePath,
  ): TaskAttemptCustodyDirectoryProof | null {
    return this.directories.get(relativeDirectory) ?? null;
  }

  issuePathCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly access: TaskAttemptCustodyPathCapabilityAccess;
    readonly scopeDigest: Sha256Digest;
  }): TaskAttemptCustodyPathCapability {
    const capability = Object.freeze({
      kind: 'task-attempt-custody-path-capability' as const,
      access: input.access,
      rootId: input.root.rootId,
      scopeDigest: input.scopeDigest,
      capabilityEvidenceDigest: `sha256:${'7'.repeat(64)}`,
    }) as TaskAttemptCustodyPathCapability;
    this.capabilityPaths.set(capability, input.relativePath);
    return capability;
  }

  issueBackendMountCapability(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly taskSnapshot: TaskAttemptCustodyPathCapability;
    readonly workerOutput: TaskAttemptCustodyPathCapability;
  }): TaskAttemptCustodyBackendMountCapability {
    if (
      !this.capabilityPaths.has(input.taskSnapshot)
      || !this.capabilityPaths.has(input.workerOutput)
    ) throw new TaskAttemptCustodyHold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    const capability = Object.freeze(Object.create(null)) as TaskAttemptCustodyBackendMountCapability;
    this.backendMountCapabilities.add(capability);
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
      throw new TaskAttemptCustodyHold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    }
    return createTaskAttemptCustodyBackendMountTransferReceipt({
      state: 'CLEANUP_UNCONFIRMED',
      rootId: input.root.rootId,
      scopeDigest: input.scopeDigest,
      effectOpDigest: input.effectOpDigest,
      attemptId: input.attemptId,
      generation: input.generation,
      backend: 'docker',
      backendExecutionId: null,
      backendImageDigest: null,
      backendAuthorityLabelDigest: null,
      taskSnapshotMountEvidenceDigest: null,
      workerOutputMountEvidenceDigest: null,
      backendBootstrapProbeEvidenceDigest: null,
      daemonMountReceiptDigest: null,
      cleanupEvidenceDigest: `sha256:${'8'.repeat(64)}`,
    });
  }

  readDurableEffectMarker(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly opDigest: Sha256Digest;
    readonly phase: TaskAttemptCustodyDurableEffectMarker['phase'];
  }): TaskAttemptCustodyDurableEffectMarker | null {
    return this.effectMarkers.get(`${input.opDigest}:${input.phase}`) ?? null;
  }

  publishDurableEffectMarkerFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly marker: TaskAttemptCustodyDurableEffectMarker;
  }): TaskAttemptCustodyDurableEffectPublication {
    const key = `${input.marker.opDigest}:${input.marker.phase}`;
    const existing = this.effectMarkers.get(key);
    if (existing !== undefined) {
      if (JSON.stringify(existing) !== JSON.stringify(input.marker)) {
        throw new TaskAttemptCustodyHold('RECONCILIATION_REQUIRED', 'publish');
      }
      return Object.freeze({ state: 'EXISTING_IDENTICAL', marker: existing });
    }
    this.effectMarkers.set(key, input.marker);
    return Object.freeze({ state: 'CREATED', marker: input.marker });
  }

  async withResolvedAttemptMounts<T>(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly taskSnapshot: TaskAttemptCustodyPathCapability;
    readonly workerOutput: TaskAttemptCustodyPathCapability;
  }, consume: (bindings: TaskAttemptCustodyResolvedMountBindings) => Promise<T>): Promise<T> {
    const taskSnapshotPath = this.capabilityPaths.get(input.taskSnapshot);
    const workerOutputPath = this.capabilityPaths.get(input.workerOutput);
    if (!taskSnapshotPath || !workerOutputPath) {
      throw new TaskAttemptCustodyHold('CAPABILITY_UNVERIFIED', 'resolve-mount');
    }
    return consume(Object.freeze({
      taskSnapshot: Object.freeze({
        kind: 'task-attempt-custody-resolved-mount',
        role: 'task-snapshot',
        sourcePath: `/fixture/host-custody/${taskSnapshotPath}`,
        readOnly: true,
        rootId: input.root.rootId,
        scopeDigest: input.taskSnapshot.scopeDigest,
        capabilityEvidenceDigest: input.taskSnapshot.capabilityEvidenceDigest,
      }),
      workerOutput: Object.freeze({
        kind: 'task-attempt-custody-resolved-mount',
        role: 'worker-output',
        sourcePath: `/fixture/host-custody/${workerOutputPath}`,
        readOnly: false,
        rootId: input.root.rootId,
        scopeDigest: input.workerOutput.scopeDigest,
        capabilityEvidenceDigest: input.workerOutput.capabilityEvidenceDigest,
      }),
    }));
  }

  publishBytesFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly bytes: Uint8Array;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyPublication {
    this.assertBounds(input.bytes, input.policy);
    const existing = this.files.get(input.relativePath);
    if (existing) {
      if (!Buffer.from(existing.bytes).equals(Buffer.from(input.bytes))) {
        throw new TaskAttemptCustodyHold('FIRST_WRITER_COLLISION', 'publish');
      }
      return { state: 'EXISTING_IDENTICAL', proof: existing.proof };
    }
    const proof: TaskAttemptCustodyFileProof = Object.freeze({
      relativePath: input.relativePath,
      sha256: rawSha256(input.bytes),
      byteLength: input.bytes.byteLength,
      volumeId: input.root.volumeId,
      fileId: `fixture:${input.relativePath}`,
      linkCount: 1,
      privacyEvidenceDigest: `sha256:${'3'.repeat(64)}`,
      durabilityEvidenceDigest: `sha256:${'4'.repeat(64)}`,
    });
    this.files.set(input.relativePath, {
      bytes: Uint8Array.from(input.bytes),
      proof,
    });
    return { state: 'CREATED', proof };
  }

  readFirstWriter(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyRead | null {
    const file = this.files.get(input.relativePath);
    if (!file) return null;
    this.assertBounds(file.bytes, input.policy);
    return { bytes: Uint8Array.from(file.bytes), proof: file.proof };
  }

  readVerified(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly proof: TaskAttemptCustodyFileProof;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyRead | null {
    const file = this.files.get(input.proof.relativePath);
    if (!file) return null;
    this.assertBounds(file.bytes, input.policy);
    if (!sameFixtureProof(file.proof, input.proof)) {
      throw new TaskAttemptCustodyHold('ARTIFACT_CHANGED', 'read');
    }
    return { bytes: Uint8Array.from(file.bytes), proof: file.proof };
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
    const publication = Object.freeze(
      Object.create(null),
    ) as TaskAttemptCustodyAdapterPublicationToken;
    this.publicationSessions.set(publication, {
      root: input.root,
      relativePath: input.relativePath,
      policy: input.policy,
      chunks: [],
      terminal: false,
    });
    return Object.freeze({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-publication-begin',
      state: 'CREATED',
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation: input.generation,
      evidenceDigest: `sha256:${'9'.repeat(64)}`,
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
      throw new TaskAttemptCustodyHold('APPEND_FAILED', 'seal-stream');
    }
    session.chunks.push(Uint8Array.from(input.bytes));
    return createTaskAttemptCustodyAdapterAppendResult({
      state: 'APPENDED',
      byteLength: input.bytes.byteLength,
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation: input.generation,
      evidenceDigest: `sha256:${'a'.repeat(64)}`,
    });
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
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-publication-seal',
        state: 'CLEANUP_UNCONFIRMED',
        effectOpDigest: input.effectOpDigest,
        scopeDigest: input.scopeDigest,
        generation: input.generation,
        evidenceDigest: `sha256:${'b'.repeat(64)}`,
        publication: null,
      });
    }
    session.terminal = true;
    const publication = this.publishBytesFirstWriter({
      root: session.root,
      relativePath: session.relativePath,
      bytes: Buffer.concat(session.chunks.map(chunk => Buffer.from(chunk))),
      policy: session.policy,
    });
    return Object.freeze({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
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
    const state = session === undefined || session.terminal
      ? 'CLEANUP_UNCONFIRMED'
      : 'ABORTED';
    if (session !== undefined) session.terminal = true;
    return createTaskAttemptCustodyAdapterAbortResult({
      state,
      effectOpDigest: input.effectOpDigest,
      scopeDigest: input.scopeDigest,
      generation: input.generation,
      evidenceDigest: `sha256:${'c'.repeat(64)}`,
    });
  }

  beginFirstWriterStream(input: {
    readonly root: TaskAttemptCustodyRootProof;
    readonly relativePath: TaskAttemptCustodyRelativePath;
    readonly policy: TaskAttemptCustodyArtifactLimit;
  }): TaskAttemptCustodyWriteSession {
    const chunks: Uint8Array[] = [];
    let terminal = false;
    return {
      append: chunk => {
        if (terminal) throw new TaskAttemptCustodyHold('ARTIFACT_CHANGED', 'seal-stream');
        chunks.push(Uint8Array.from(chunk));
      },
      seal: () => {
        if (terminal) throw new TaskAttemptCustodyHold('ARTIFACT_CHANGED', 'seal-stream');
        terminal = true;
        return this.publishBytesFirstWriter({
          ...input,
          bytes: Buffer.concat(chunks.map(chunk => Buffer.from(chunk))),
        });
      },
      abort: () => { terminal = true; },
    };
  }

  putAttemptOutput(
    relativePath: TaskAttemptCustodyRelativePath,
    bytes: Uint8Array,
  ): void {
    const proof: TaskAttemptCustodyFileProof = Object.freeze({
      relativePath,
      sha256: rawSha256(bytes),
      byteLength: bytes.byteLength,
      volumeId: TEST_ROOT_PROOF.volumeId,
      fileId: `fixture:${relativePath}`,
      linkCount: 1,
      privacyEvidenceDigest: `sha256:${'3'.repeat(64)}`,
      durabilityEvidenceDigest: `sha256:${'4'.repeat(64)}`,
    });
    this.files.set(relativePath, { bytes: Uint8Array.from(bytes), proof });
  }

  private assertBounds(bytes: Uint8Array, policy: TaskAttemptCustodyArtifactLimit): void {
    if (bytes.byteLength < policy.minBytes || bytes.byteLength > policy.maxBytes) {
      throw new TaskAttemptCustodyHold('ARTIFACT_OVERSIZE', 'publish');
    }
  }
}

function sameFixtureProof(
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

function artifactLimits(): Record<
  TaskAttemptCustodyArtifactClass,
  TaskAttemptCustodyArtifactLimit
> {
  return Object.fromEntries(TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES.map(artifactClass => [
    artifactClass,
    { minBytes: 1, maxBytes: 512 * 1024, requireSingleLink: true as const },
  ])) as Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>;
}

export function createTaskResultSettlementV2TestPolicy(): TaskAttemptCustodyPolicyV2 {
  return createTaskAttemptCustodyPolicy({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    metadataMaxBytes: 512 * 1024,
    jsonBounds: {
      maxDepth: 40,
      maxNodes: 30_000,
      maxStringBytes: 32 * 1024,
      maxArrayLength: 3_000,
      maxObjectKeys: 512,
      maxCanonicalBytes: 512 * 1024,
    },
    artifactLimits: artifactLimits(),
  });
}

export interface TaskResultAcceptedV2Fixture {
  readonly adapter: InMemoryTaskAttemptCustodyAdapter;
  readonly store: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admission: ReturnType<TaskAttemptCustodyStore['createAdmission']>;
  readonly rawWorkerResultBytes: Uint8Array;
  readonly sourceResultArtifact: ReturnType<TaskAttemptCustodyStore['publishHostArtifact']>;
  readonly hostWorkAttributionArtifact: ReturnType<TaskAttemptCustodyStore['publishHostArtifact']>;
  readonly result: TaskResultV2;
  readonly acceptedResultArtifact: ReturnType<TaskAttemptCustodyStore['publishHostArtifact']>;
  readonly acceptedResultChain: ReturnType<TaskAttemptCustodyStore['appendChain']>;
}

export interface TaskResultSettlementV2Fixture extends TaskResultAcceptedV2Fixture {
  readonly creation: CreateTaskResultSettlementV2Input;
  readonly settlement: TaskResultSettlementV2;
  readonly settlementArtifact: ReturnType<TaskAttemptCustodyStore['publishHostArtifact']>;
  readonly settlementChain: ReturnType<TaskAttemptCustodyStore['appendChain']>;
  readonly archivePayload: TaskResultSettlementV2ArchivePayload;
  readonly archiveArtifact: ReturnType<TaskAttemptCustodyStore['publishHostArtifact']>;
  readonly archiveChain: ReturnType<TaskAttemptCustodyStore['appendChain']>;
}

export interface TaskResultSettlementV2FixtureOptions {
  readonly tailArtifactKey?: string;
  readonly archiveCapturedAt?: string;
  readonly terminal?: 'full' | 'accepted-only';
  /** Optional sibling-attempt identity for replay-boundary fixtures. */
  readonly attemptId?: string;
  /** Optional exact plan material persisted inside every admitted generation. */
  readonly productionWiring?: ProductionWiringPlanEvidence;
  /** Optional immutable worker observation persisted inside the accepted result. */
  readonly productionWiringEvidence?: ProductionWiringResultEvidence;
}

const taskResultSettlementV2FixtureCache = new Map<
  string,
  TaskResultSettlementV2Fixture | TaskResultAcceptedV2Fixture
>();

export function createTaskResultSettlementV2Fixture(
  options: TaskResultSettlementV2FixtureOptions & { readonly terminal: 'accepted-only' },
): TaskResultAcceptedV2Fixture;
export function createTaskResultSettlementV2Fixture(
  options?: TaskResultSettlementV2FixtureOptions & { readonly terminal?: 'full' },
): TaskResultSettlementV2Fixture;

export function createTaskResultSettlementV2Fixture(
  options: TaskResultSettlementV2FixtureOptions = {},
): TaskResultSettlementV2Fixture | TaskResultAcceptedV2Fixture {
  const cacheKey = fixtureCanonicalJson({
    tailArtifactKey: options.tailArtifactKey ?? null,
    archiveCapturedAt: options.archiveCapturedAt ?? null,
    terminal: options.terminal ?? 'full',
    attemptId: options.attemptId ?? null,
    productionWiring: options.productionWiring ?? null,
    productionWiringEvidence: options.productionWiringEvidence ?? null,
  });
  const cached = taskResultSettlementV2FixtureCache.get(cacheKey);
  if (cached) return cached;
  const tailArtifactKey = options.tailArtifactKey ?? 'primary';
  const archiveCapturedAt = options.archiveCapturedAt ?? '2026-08-30T20:11:00.000Z';
  const canonicalProjectRoot = '/fixture/project';
  const projectRootSha256 = createHash('sha256').update(canonicalProjectRoot).digest('hex');
  const adapter = new InMemoryTaskAttemptCustodyAdapter();
  const store = TaskAttemptCustodyStore.open({
    adapter,
    absoluteRoot: '/fixture/host-custody',
    canonicalProjectRoot,
    projectId: 'fixture-project',
    create: true,
  });
  const policy = createTaskResultSettlementV2TestPolicy();
  const identity: TaskAttemptCustodyIdentityV2 = {
    schemaVersion: 2,
    backend: 'docker',
    projectRootSha256,
    projectId: 'fixture-project',
    taskId: 'fixture-001',
    attemptId: options.attemptId ?? '123e4567-e89b-42d3-a456-426614174000',
    generation: 4,
  };
  let predecessorIdentity: TaskAttemptCustodyIdentityV2 | null = null;
  let predecessorDigest: Sha256Digest | null = null;
  let admission: ReturnType<TaskAttemptCustodyStore['createAdmission']> | null = null;
  const taskScope = options.productionWiring === undefined
    ? Object.freeze({
        directories: Object.freeze(['tests/helpers']),
        filesRead: Object.freeze(['tests/helpers/input.ts']),
        filesWrite: Object.freeze(['tests/helpers/output.ts']),
      })
    : Object.freeze({
        directories: Object.freeze(['src/orchestra']),
        filesRead: Object.freeze(['src/orchestra/input.ts']),
        filesWrite: Object.freeze(['src/orchestra/output.ts']),
      });
  for (let generation = 1; generation <= identity.generation; generation += 1) {
    const generationIdentity = { ...identity, generation };
    const dispatchTask = Object.freeze({
      id: identity.taskId,
      title: 'Fixture exact Docker task',
      description: 'Exercise accepted-result evaluation from immutable custody.',
      model: 'fixture-model',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'fixture exact custody',
      scope: taskScope,
      dependencies: Object.freeze([]),
      goNogo: Object.freeze({
        goCriteria: 'accepted authority evaluates and settles',
        noGoCriteria: 'worker self-report decides terminal truth',
        techDebtAcceptable: 'none',
      }),
      status: 'EXECUTING',
      assignedWorker: 'worker-fixture-001',
      sprintId: 'fixture-sprint',
      type: 'code-development',
      provider: 'fixture-provider',
      budget: Object.freeze({ maxTurns: 2 }),
      budgetPolicy: Object.freeze({
        state: 'allow',
        role: 'worker',
        taskKind: 'code-development',
        resolvedProvider: 'fixture-provider',
        executionCostClass: 'local',
        profileRef: 'fixture-local-exempt',
        policyDigest: 'a'.repeat(64),
        admissionMode: 'unattended',
      }),
      // Exact-dispatch authority: derive this from the same immutable scope.
      productionWiringApplicability: deriveProductionWiringApplicability(taskScope),
      ...(options.productionWiring === undefined
        ? {}
        : { productionWiring: options.productionWiring }),
    });
    const lineage = Object.freeze({ generation, predecessorDigest });
    const dispatchSha256 = rawSha256(canonicalTaskAttemptCustodyJson(dispatchTask, policy.jsonBounds));
    const approved = createExactNormalTaskApprovedMaterialV3({
      sprintId: 'fixture-sprint',
      task: dispatchTask,
      dispatchTaskMaterialDigest: dispatchSha256,
      policy,
    });
    const approvedSha256 = rawSha256(canonicalTaskAttemptCustodyJson(approved, policy.jsonBounds));
    const lineageSha256 = rawSha256(canonicalTaskAttemptCustodyJson(lineage, policy.jsonBounds));
    admission = store.createAdmission({
      identity: generationIdentity,
      policy,
      admittedAt: `2026-08-30T20:00:0${generation - 1}.000Z`,
      predecessorDigest,
      predecessorIdentity,
      taskSnapshot: Object.freeze({
        schemaVersion: 2,
        kind: 'exact-docker-dispatch-snapshot',
        dispatchRequestId: `fixture-dispatch-request-${generation}`,
        projectId: identity.projectId,
        taskId: identity.taskId,
        material: Object.freeze({
          approved,
          approvedSha256,
          dispatch: dispatchTask,
          dispatchSha256,
          lineage,
          lineageSha256,
        }),
        dispatch: Object.freeze({ backend: 'docker', fixture: true }),
      }),
    });
    predecessorIdentity = generationIdentity;
    predecessorDigest = admission.receiptDigest;
  }
  if (admission === null) throw new Error('fixture admission was not created');
  const canonicalV1 = validateTaskResult({
    taskId: identity.taskId,
    workerId: 'worker-fixture-001',
    provider: 'fixture-provider',
    model: 'fixture-model',
    attempt: 2,
    filesChanged: [],
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    diskVerified: true,
    tokenUsage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      source: 'provider-adapter',
    },
    cost: { usd: 0, pricingSource: 'fixture', isLocal: true },
    tests: { passed: 0, failed: 0, total: 0, outcome: 'NOT_EXECUTED' },
    tsc: { clean: true, errors: 0 },
    selfAssessment: 'DONE',
    ...(options.productionWiringEvidence === undefined
      ? {}
      : { productionWiringEvidence: options.productionWiringEvidence }),
  });
  if (!canonicalV1.ok) throw new Error(canonicalV1.errors.join('; '));
  const sourceBytes = Buffer.from(JSON.stringify({
    taskId: identity.taskId,
    selfAssessment: 'DONE',
    provider: 'worker-claimed-provider',
    tokenUsage: { totalTokens: 9_999_999 },
    filesChanged: ['worker-claimed-path.ts'],
  }, null, 2), 'utf8');
  const access = store.openAttemptAccess({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
  });
  if (access === null) throw new Error('fixture attempt access was not created');
  const source = store.issueAttemptOutputCaptureSource({
    access,
    childRelativePath: 'primary.result.json',
    artifactClass: 'worker-result',
    artifactKey: 'primary',
  });
  const sourcePath = adapter.capabilityPaths.get(source);
  if (!sourcePath) throw new Error('fixture output capture source was not resolved');
  adapter.putAttemptOutput(sourcePath, sourceBytes);
  const sourceResultArtifact = store.captureAttemptOutputArtifact({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    artifactClass: 'worker-result',
    artifactKey: 'primary',
    capturedAt: '2026-08-30T20:01:00.000Z',
    source,
  });
  const providerExitObservedAt = '2026-08-30T20:01:10.000Z';
  const providerExitObservationReceiptDigest = fixtureDomainDigest(
    'fixture-provider-exit-observation-receipt-v2',
    { identity, observedAt: providerExitObservedAt },
  );
  const scopeFilesWrite = [...taskScope.filesWrite];
  const scopeDigest = createHash('sha256')
    .update(fixtureCanonicalJson(scopeFilesWrite), 'utf8')
    .digest('hex');
  const scopeBaseline = [
    '#deckent-scope-attribution-v1',
    'fixture-dispatch-request',
    scopeDigest,
  ].join('\t') + '\n';
  const baselineSha256 = createHash('sha256').update(scopeBaseline, 'utf8').digest('hex');
  const hostWorkAttributionBody = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'exact-docker-host-work-attribution' as const,
    state: 'VERIFIED' as const,
    attemptId: identity.attemptId,
    dispatchRequestId: 'fixture-dispatch-request',
    admissionRefDigest: fixtureDomainDigest('fixture-dispatch-admission-ref-v2', identity),
    providerExitObservationReceiptDigest,
    baselineRef: `task-attempt-custody-provider-exit:${providerExitObservationReceiptDigest}#scope-baseline:sha256:${baselineSha256}`,
    baselineSha256,
    scopeDigest,
    filesChanged: Object.freeze([]),
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    reasonCode: 'NONE' as const,
  });
  const hostWorkAttribution = Object.freeze({
    ...hostWorkAttributionBody,
    evidenceDigest: fixtureDomainDigest(
      'exact-docker-host-work-attribution-v2',
      hostWorkAttributionBody,
    ),
  });
  const hostWorkAttributionArtifact = store.publishHostArtifact({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    artifactClass: 'host-work-attribution',
    artifactKey: `host-work-${identity.attemptId}`,
    capturedAt: providerExitObservedAt,
    bytes: canonicalTaskAttemptCustodyJson(hostWorkAttribution, policy.jsonBounds),
  });
  const effectAttempt = Object.freeze({
    projectId: identity.projectId,
    taskId: identity.taskId,
    attemptId: identity.attemptId,
    generation: identity.generation,
  });
  const effectPolicy = compileExecutionEffectWritePolicy(scopeFilesWrite);
  if (!effectPolicy.ok) throw new Error('fixture execution-effect policy is invalid');
  const workspaceIdentity = Object.freeze({
    filesystemId: 'fixture-device:2049',
    directoryId: 'fixture-inode:1001',
    rootHandleEvidenceDigest: fixtureDomainDigest('fixture-root-handle', identity),
  });
  const effectAttemptDigest = fixtureDomainDigest('execution-effect-attempt-v1', effectAttempt);
  const nativeCapabilityDigest = fixtureDomainDigest('fixture-native-journal', identity);
  const effectManifest = (phase: 'baseline' | 'final'): ExecutionEffectManifest => {
    const captureAuthority = Object.freeze({
      adapter: 'native-descriptor-relative' as const,
      platform: 'wsl2-linux' as const,
      traversal: 'iterative-openat-no-follow' as const,
      sameFilesystem: true as const,
      mountBoundaryPolicy: 'reject' as const,
      hardlinkPolicy: 'reject-before-content-read' as const,
      cancellationState: 'not-cancelled' as const,
      nativeManifestDigest: fixtureDomainDigest('test-native-manifest', phase),
      nativeEntryIdentitySetDigest: fixtureDomainDigest('test-native-entry-identities', phase),
      startedAt: '2026-08-30T20:00:04.000Z',
      completedAt: phase === 'baseline'
        ? '2026-08-30T20:00:05.000Z'
        : '2026-08-30T20:01:10.000Z',
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
    const body = Object.freeze({
      version: 1 as const,
      phase,
      attempt: effectAttempt,
      attemptDigest: effectAttemptDigest,
      workspaceIdentity,
      captureAuthority,
      landingSemantics: Object.freeze({
        regularFile: 'reconstruct-bytes-and-safe-mode' as const,
        directory: 'exact-directory-add-and-derived-parent-create' as const,
        unsupportedMetadata: 'strip-xattr-acl-capability-sparse-ads-owner-times' as const,
        linksAndSpecialFiles: 'reject' as const,
      }),
      policy: effectPolicy.policy,
      entries: Object.freeze([{ path: '.', kind: 'directory' as const, mode: 0o755 }]),
    });
    const parsed = parseExecutionEffectManifest({
      ...body,
      digest: fixtureDomainDigest('execution-effect-manifest-v1', body),
    });
    if (!parsed) throw new Error('fixture execution-effect manifest is invalid');
    return parsed;
  };
  const baselineManifestValue = effectManifest('baseline');
  const finalManifestValue = effectManifest('final');
  const workspaceResource = createExecutionEffectWorkspaceResourceV1({
    volumeName: 'deckent-effect-fixture',
    imageDigest: fixtureDomainDigest('fixture-image', identity),
    labelsDigest: fixtureDomainDigest('fixture-labels', identity),
    mountPlanDigest: fixtureDomainDigest('fixture-mount-plan', identity),
    snapshotInventoryDigest: fixtureDomainDigest('fixture-snapshot-inventory', identity),
    populationReceiptDigest: fixtureDomainDigest('fixture-population', identity),
    baselineManifestDigest: baselineManifestValue.digest as Sha256Digest,
  });
  const dependencyResource = createExecutionEffectDependencyResourceV1({
    attempt: effectAttempt,
    admissionReceiptDigest: admission.receiptDigest,
    custodyPolicyDigest: policy.policyDigest,
    imageIdentityDigest: fixtureDomainDigest('fixture-dependency-image', identity),
    labelsDigest: fixtureDomainDigest('fixture-dependency-labels', identity),
    mountPlanDigest: fixtureDomainDigest('fixture-dependency-mount-plan', identity),
    populationReceiptDigest: fixtureDomainDigest('fixture-dependency-population', identity),
    volumeName: 'deckent-dependency-fixture',
    volumeIdentityDigest: fixtureDomainDigest('fixture-dependency-volume', identity),
    readyAt: '2026-08-30T20:00:04.500Z',
  });
  const workspaceSeal = createExecutionEffectWorkspaceSnapshotSealV1({
    attempt: effectAttempt,
    admissionReceiptDigest: admission.receiptDigest,
    custodyPolicyDigest: policy.policyDigest,
    writePolicyDigest: effectPolicy.policy.digest as Sha256Digest,
    workspaceIdentity,
    workspaceResource,
    dependencyResource,
    nativeCapabilityDigest,
    platform: 'wsl2-linux',
    sealedAt: '2026-08-30T20:00:05.000Z',
  });
  const effectDecision = evaluateExecutionEffectContainment({
    baseline: { ok: true, manifest: baselineManifestValue },
    final: { ok: true, manifest: finalManifestValue },
  });
  if (effectDecision.state !== 'VERIFIED') {
    throw new Error('fixture execution-effect decision is not VERIFIED');
  }
  const publishEffectArtifact = (
    artifactClass:
      | 'execution-workspace-snapshot'
      | 'execution-workspace-release'
      | 'execution-effect-manifest'
      | 'execution-effect-landing-journal'
      | 'execution-effect-landing-receipt-evidence',
    artifactKey: string,
    capturedAt: string,
    value: unknown,
  ) => store.publishHostArtifact({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    artifactClass,
    artifactKey,
    capturedAt,
    bytes: canonicalTaskAttemptCustodyJson(value, policy.jsonBounds),
  });
  const workspaceArtifact = publishEffectArtifact(
    'execution-workspace-snapshot',
    'fixture-workspace',
    workspaceSeal.sealedAt,
    workspaceSeal,
  );
  const baselineArtifact = publishEffectArtifact(
    'execution-effect-manifest',
    'fixture-baseline',
    '2026-08-30T20:00:05.000Z',
    baselineManifestValue,
  );
  const finalArtifact = publishEffectArtifact(
    'execution-effect-manifest',
    'fixture-final',
    '2026-08-30T20:01:10.000Z',
    finalManifestValue,
  );
  const planId = 'fixture-effect-plan';
  const planDigest = fixtureDomainDigest('execution-effect-landing-plan-v1', []);
  const transactionBody = Object.freeze({
    version: 1 as const,
    projectId: effectAttempt.projectId,
    taskId: effectAttempt.taskId,
    attemptId: effectAttempt.attemptId,
    generation: effectAttempt.generation,
    attemptDigest: workspaceSeal.attemptDigest,
    baselineManifestDigest: baselineManifestValue.digest,
    finalManifestDigest: finalManifestValue.digest,
    containmentDecisionDigest: effectDecision.decisionDigest,
    planId,
    planDigest,
  });
  const transaction = Object.freeze({
    ...transactionBody,
    transactionDigest: fixtureDomainDigest(
      'execution-effect-landing-transaction-v1',
      transactionBody,
    ),
  });
  const preparedBody = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-landing-prepared' as const,
    phase: 'PREPARED' as const,
    transaction,
    operations: Object.freeze([]),
    nativeCapabilityDigest,
    journalCapabilityDigest: fixtureDomainDigest('fixture-journal-capability', identity),
    leaseCapabilityDigest: fixtureDomainDigest('fixture-lease-capability', identity),
    acquiredLease: Object.freeze({
      transactionDigest: transaction.transactionDigest,
      fencingTokenDigest: fixtureDomainDigest('fixture-lease-fence', identity),
      leaseReceiptDigest: fixtureDomainDigest('fixture-lease-acquisition', identity),
    }),
    preparedAt: '2026-08-30T20:01:12.000Z',
  });
  const preparedJournal = Object.freeze({
    ...preparedBody,
    recordDigest: fixtureDomainDigest(
      'execution-effect-landing-prepared-journal-v1',
      preparedBody,
    ),
  });
  const committedAt = '2026-08-30T20:01:30.000Z';
  const committedBody = Object.freeze({
    version: 1 as const,
    kind: 'execution-effect-landing-committed' as const,
    phase: 'COMMITTED' as const,
    disposition: 'COMMITTED_NO_CHANGE' as const,
    transaction,
    preparedJournalDigest: preparedJournal.recordDigest,
    applyingJournalDigest: null,
    lastJournalDigest: preparedJournal.recordDigest,
    operationReceiptDigests: Object.freeze([]),
    finalVerificationReceipt: null,
    committedAt,
  });
  const committedJournal = Object.freeze({
    ...committedBody,
    recordDigest: fixtureDomainDigest(
      'execution-effect-landing-committed-journal-v1',
      committedBody,
    ),
  });
  const preparedJournalBytes = canonicalTaskAttemptCustodyJson(
    preparedJournal,
    policy.jsonBounds,
  );
  const committedJournalBytes = canonicalTaskAttemptCustodyJson(
    committedJournal,
    policy.jsonBounds,
  );
  const preparedJournalArtifact = publishEffectArtifact(
    'execution-effect-landing-journal',
    'fixture-journal-prepared',
    preparedBody.preparedAt,
    preparedJournal,
  );
  const committedJournalArtifact = publishEffectArtifact(
    'execution-effect-landing-journal',
    'fixture-journal-committed',
    '2026-08-30T20:01:18.000Z',
    committedJournal,
  );
  const leaseTerminalEvidence = createExecutionEffectLandingLeaseTerminalReceiptEvidenceV1({
    transactionDigest: transaction.transactionDigest,
    terminal: 'RELEASED_NO_CHANGE',
    committedJournalDigest: committedJournal.recordDigest,
    eventId: 'fixture-terminal-event',
    quarantineId: executionEffectLandingDeterministicBoundaryIdV1(transaction.transactionDigest),
    fencingToken: { epoch: 'fixture-epoch', counter: 1, nonce: 'fixture-nonce' },
    occurredAt: '2026-08-30T20:01:30.000Z',
    evidenceRefs: [
      `committed-journal:${committedJournal.recordDigest}`,
      'effect-terminal:RELEASED_NO_CHANGE',
      `effect-transaction:${transaction.transactionDigest}`,
    ].sort(),
  });
  const leaseTerminalEvidenceBytes = canonicalTaskAttemptCustodyJson(
    leaseTerminalEvidence,
    policy.jsonBounds,
  );
  const leaseTerminalEvidenceArtifact = publishEffectArtifact(
    'execution-effect-landing-receipt-evidence',
    'fixture-lease-terminal-evidence',
    leaseTerminalEvidence.occurredAt,
    leaseTerminalEvidence,
  );
  const terminalSeal = createExecutionEffectLandingTerminalSealV1({
    attempt: effectAttempt,
    attemptDigest: workspaceSeal.attemptDigest,
    disposition: 'COMMITTED_NO_CHANGE',
    workspaceSnapshotSealDigest: workspaceSeal.sealDigest,
    baselineManifestDigest: baselineManifestValue.digest as Sha256Digest,
    finalManifestDigest: finalManifestValue.digest as Sha256Digest,
    effectDecisionDigest: effectDecision.decisionDigest as Sha256Digest,
    planId,
    operations: [],
    preparedJournalDigest: preparedJournal.recordDigest,
    applyingJournalDigest: null,
    stepJournalDigests: [],
    committedJournalDigest: committedJournal.recordDigest,
    finalVerificationReceiptDigest: null,
    journalArtifacts: {
      prepared: {
        artifactKey: preparedJournalArtifact.artifactKey,
        artifactReceiptDigest: preparedJournalArtifact.receiptDigest,
        contentDigest: rawSha256(preparedJournalBytes),
        byteLength: preparedJournalBytes.byteLength,
      },
      applying: null,
      steps: [],
      committed: {
        artifactKey: committedJournalArtifact.artifactKey,
        artifactReceiptDigest: committedJournalArtifact.receiptDigest,
        contentDigest: rawSha256(committedJournalBytes),
        byteLength: committedJournalBytes.byteLength,
      },
    },
    receiptArtifacts: {
      nativeReceipts: [],
      finalVerificationReceipt: null,
      leaseTerminalReceipt: {
        artifactKey: leaseTerminalEvidenceArtifact.artifactKey,
        artifactReceiptDigest: leaseTerminalEvidenceArtifact.receiptDigest,
        contentDigest: rawSha256(leaseTerminalEvidenceBytes),
        byteLength: leaseTerminalEvidenceBytes.byteLength,
      },
    },
    leaseTerminal: 'RELEASED_NO_CHANGE',
    leaseTerminalReceiptDigest: leaseTerminalEvidence.terminalReceiptDigest,
    committedAt,
  });
  const terminalArtifact = publishEffectArtifact(
    'execution-effect-landing-journal',
    'fixture-terminal',
    '2026-08-30T20:01:20.000Z',
    terminalSeal,
  );
  const releasedAt = '2026-08-30T20:01:40.000Z';
  const workspaceRelease = createExecutionEffectWorkspaceReleaseV1({
    attempt: effectAttempt,
    admissionReceiptDigest: admission.receiptDigest,
    custodyPolicyDigest: policy.policyDigest,
    workspaceSnapshotSealDigest: workspaceSeal.sealDigest,
    workspaceResource,
    dependencyResource,
    transactionDigest: terminalSeal.transactionDigest,
    committedJournalDigest: terminalSeal.committedJournalDigest,
    providerContainer: {
      containerName: 'deckent-provider-fixture',
      deletionReceiptDigest: fixtureDomainDigest('fixture-container-delete', identity),
      absenceEvidenceDigest: fixtureDomainDigest('fixture-container-absent', identity),
    },
    workspaceVolume: {
      volumeName: workspaceResource.volumeName,
      deletionReceiptDigest: fixtureDomainDigest('fixture-volume-delete', identity),
      absenceEvidenceDigest: fixtureDomainDigest('fixture-volume-absent', identity),
    },
    dependencyVolume: {
      volumeName: dependencyResource.volumeName,
      volumeIdentityDigest: dependencyResource.volumeIdentityDigest,
      deletionReceiptDigest: fixtureDomainDigest('fixture-dependency-delete', identity),
      absenceEvidenceDigest: fixtureDomainDigest('fixture-dependency-absent', identity),
    },
    releasedAt,
  });
  const workspaceReleaseArtifact = publishEffectArtifact(
    'execution-workspace-release',
    'fixture-workspace-release',
    releasedAt,
    workspaceRelease,
  );
  const effectLandingReceipt = createTaskAttemptCustodyEffectLandingReceiptV2({
    identity,
    admissionReceiptDigest: admission.receiptDigest,
    policyDigest: policy.policyDigest,
    disposition: terminalSeal.disposition,
    workspaceSnapshot: {
      artifactKey: workspaceArtifact.artifactKey,
      artifactReceiptDigest: workspaceArtifact.receiptDigest,
    },
    baselineManifest: {
      artifactKey: baselineArtifact.artifactKey,
      artifactReceiptDigest: baselineArtifact.receiptDigest,
    },
    finalManifest: {
      artifactKey: finalArtifact.artifactKey,
      artifactReceiptDigest: finalArtifact.receiptDigest,
    },
    stagedContents: [],
    landingJournal: {
      artifactKey: terminalArtifact.artifactKey,
      artifactReceiptDigest: terminalArtifact.receiptDigest,
    },
    workspaceRelease: {
      artifactKey: workspaceReleaseArtifact.artifactKey,
      artifactReceiptDigest: workspaceReleaseArtifact.receiptDigest,
    },
    effectDecisionDigest: effectDecision.decisionDigest as Sha256Digest,
    transactionDigest: terminalSeal.transactionDigest as Sha256Digest,
    committedAt: terminalSeal.committedAt,
    releasedAt,
  }, policy);
  const effectLandingArtifact = store.publishHostArtifact({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    artifactClass: 'execution-effect-landing-receipt',
    artifactKey: 'primary',
    capturedAt: effectLandingReceipt.releasedAt,
    bytes: canonicalTaskAttemptCustodyJson(effectLandingReceipt, policy.jsonBounds),
  });
  const effectLandingChain = store.appendChain({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    stage: 'effect-landing',
    occurredAt: '2026-08-30T20:01:40.000Z',
    predecessorDigest: admission.receiptDigest,
    artifactReceipt: effectLandingArtifact,
  });
  const effectLandingBinding = createTaskAttemptEffectLandingBindingV2({
    identity: effectAttempt,
    admissionReceiptDigest: admission.receiptDigest,
    custodyPolicyDigest: policy.policyDigest,
    landingArtifactKey: effectLandingArtifact.artifactKey,
    landingArtifactReceiptDigest: effectLandingArtifact.receiptDigest,
    landingReceiptDigest: effectLandingReceipt.receiptDigest,
    effectLandingChainDigest: effectLandingChain.receiptDigest,
    readyLifecycleAuthorityDigest: fixtureDomainDigest(
      'fixture-ready-lifecycle-authority-v1',
      { attempt: effectAttempt },
    ),
    disposition: effectLandingReceipt.disposition,
    effectDecisionDigest: effectLandingReceipt.effectDecisionDigest,
    transactionDigest: effectLandingReceipt.transactionDigest,
  });
  const result = createProductionTaskResultV2({
    result: canonicalV1.value as unknown as Record<string, unknown>,
    attemptCustody: {
      version: 2,
      identity,
      policyDigest: policy.policyDigest,
      admissionReceiptDigest: admission.receiptDigest,
      sourceResult: {
        artifactClass: 'worker-result',
        artifactKey: sourceResultArtifact.artifactKey,
        artifactReceiptDigest: sourceResultArtifact.receiptDigest,
        artifactSha256: sourceResultArtifact.artifact.sha256,
        byteLength: sourceResultArtifact.artifact.byteLength,
      },
      hostWorkAttribution: {
        artifactClass: 'host-work-attribution',
        artifactKey: hostWorkAttributionArtifact.artifactKey,
        artifactReceiptDigest: hostWorkAttributionArtifact.receiptDigest,
        artifactSha256: hostWorkAttributionArtifact.artifact.sha256,
        byteLength: hostWorkAttributionArtifact.artifact.byteLength,
      },
      effectLanding: effectLandingBinding,
    },
    jsonBounds: policy.jsonBounds,
  });
  const acceptedResultArtifact = store.publishHostArtifact({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    artifactClass: 'canonical-accepted-result',
    artifactKey: 'primary',
    capturedAt: releasedAt,
    bytes: canonicalTaskAttemptCustodyJson(result, policy.jsonBounds),
  });
  const acceptedResultChain = store.appendChain({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    stage: 'accepted-result',
    occurredAt: releasedAt,
    predecessorDigest: effectLandingChain.receiptDigest,
    artifactReceipt: acceptedResultArtifact,
  });
  const acceptedFixture = Object.freeze({
    adapter,
    store,
    policy,
    identity,
    admission,
    rawWorkerResultBytes: Uint8Array.from(sourceBytes),
    sourceResultArtifact,
    hostWorkAttributionArtifact,
    result,
    acceptedResultArtifact,
    acceptedResultChain,
  });
  if (options.terminal === 'accepted-only') {
    taskResultSettlementV2FixtureCache.set(cacheKey, acceptedFixture);
    return acceptedFixture;
  }
  const evaluationArtifact = store.publishHostArtifact({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    artifactClass: 'evaluation-receipt',
    artifactKey: 'primary',
    capturedAt: '2026-08-30T20:04:00.000Z',
    bytes: canonicalTaskAttemptCustodyJson({ verdict: 'DONE', score: 100 }, policy.jsonBounds),
  });
  const evaluationChain = store.appendChain({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    stage: 'evaluation',
    occurredAt: '2026-08-30T20:05:00.000Z',
    predecessorDigest: acceptedResultChain.receiptDigest,
    artifactReceipt: evaluationArtifact,
  });
  const finalizerArtifact = store.publishHostArtifact({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    artifactClass: 'finalizer-receipt',
    artifactKey: 'primary',
    capturedAt: '2026-08-30T20:06:00.000Z',
    bytes: canonicalTaskAttemptCustodyJson({ state: 'terminal-ready' }, policy.jsonBounds),
  });
  const finalizerChain = store.appendChain({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    stage: 'finalizer',
    occurredAt: '2026-08-30T20:07:00.000Z',
    predecessorDigest: evaluationChain.receiptDigest,
    artifactReceipt: finalizerArtifact,
  });
  const creation: CreateTaskResultSettlementV2Input = {
    custodyStore: store,
    policy,
    admission,
    sourceResultArtifact,
    acceptedResultArtifact,
    acceptedResultChain,
    evaluationArtifact,
    evaluationChain,
    finalizerArtifact,
    finalizerChain,
    settledAt: '2026-08-30T20:08:00.000Z',
    exitCode: 0,
    result,
  };
  const settlement = createTaskResultSettlementV2(creation);
  const settlementArtifact = store.publishHostArtifact({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    artifactClass: 'settlement-receipt',
    artifactKey: tailArtifactKey,
    capturedAt: '2026-08-30T20:09:00.000Z',
    bytes: canonicalTaskAttemptCustodyJson(settlement, policy.jsonBounds),
  });
  const settlementChain = store.appendChain({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    stage: 'settlement',
    occurredAt: '2026-08-30T20:10:00.000Z',
    predecessorDigest: finalizerChain.receiptDigest,
    artifactReceipt: settlementArtifact,
  });
  const archivePayload: TaskResultSettlementV2ArchivePayload = {
    schemaVersion: 2,
    kind: 'task-result-settlement-v2-archive',
    state: 'archived',
    identity,
    predecessorDigest: settlementChain.receiptDigest,
    externalAuthorityRefs: [{
      authorityType: 'task-result-settlement-v2',
      digest: taskResultSettlementV2Digest(settlement, policy.jsonBounds),
    }],
  };
  const archiveArtifact = store.publishHostArtifact({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    artifactClass: 'archive-receipt',
    artifactKey: tailArtifactKey,
    capturedAt: archiveCapturedAt,
    bytes: canonicalTaskAttemptCustodyJson(archivePayload, policy.jsonBounds),
  });
  const archiveChain = store.appendChain({
    identity,
    policy,
    admissionReceiptDigest: admission.receiptDigest,
    stage: 'archive',
    occurredAt: '2026-08-30T20:12:00.000Z',
    predecessorDigest: settlementChain.receiptDigest,
    artifactReceipt: archiveArtifact,
  });
  const fixture = Object.freeze({
    ...acceptedFixture,
    creation,
    settlement,
    settlementArtifact,
    settlementChain,
    archivePayload,
    archiveArtifact,
    archiveChain,
  });
  taskResultSettlementV2FixtureCache.set(cacheKey, fixture);
  return fixture;
}
