import { createHash } from 'node:crypto';
import { readFileSync, writeSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES,
  TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
  TaskAttemptCustodyStore,
  createTaskAttemptCustodyPolicy,
  type Sha256Digest,
  type TaskAttemptCustodyArtifactClass,
  type TaskAttemptCustodyArtifactLimit,
  type TaskAttemptCustodyIdentityV2,
} from '../../src/core/task-attempt-custody-store.js';
import {
  createExecutionEffectManifestFromNativeCaptureV1,
  executionEffectNativeCaptureManifestDigestV1,
  type ExecutionEffectCaptureLimits,
  type ExecutionEffectNativeCaptureEntryV1,
  type ExecutionEffectNativeCaptureTreeV1,
} from '../../src/core/execution-effect-containment.js';
import { compileExecutionEffectWritePolicy } from '../../src/core/execution-write-scope-policy.js';
import {
  createExecutionEffectDependencyResourceV1,
  createExecutionEffectWorkspaceResourceV1,
  createExecutionEffectWorkspaceSnapshotSealV1,
  executionEffectLandingOperationDigestV1,
} from '../../src/core/execution-effect-persistence-contract.js';
import {
  createExecutionEffectLandingEntryStateV1,
  type ExecutionEffectLandingNativeAdapterV1,
  type ExecutionEffectLandingOperationV1,
  type ExecutionEffectLandingStagedSourceV1,
} from '../../src/orchestra/execution-effect-landing-coordinator.js';
import {
  EXECUTION_EFFECT_DOCKER_WORKSPACE_CAPTURE_HELPER_DIGEST,
  captureExecutionEffectDockerWorkspaceManifestV1,
  createExecutionEffectDockerWorkspaceCaptureReceiptV1,
  createExecutionEffectDockerSourceReceiptV1,
  createExecutionEffectLandingNativeAdapterV1,
  type ExecutionEffectDockerSourceExecutorV1,
  type ExecutionEffectDockerSourceInvocationV1,
  type ExecutionEffectDockerWorkspaceCaptureInputV1,
  type ExecutionEffectDockerWorkspaceCaptureInvocationV1,
  type ExecutionEffectNativeAdapterFactoryInputV1,
  type ExecutionEffectStagedContentStoreV1,
} from '../../src/orchestra/execution-effect-native-adapter.js';
import type {
  ExecAuthorityNativeEffectFacade,
  ExecAuthorityNativeEffectHandle,
  ExecAuthorityNativeState,
} from '../../src/core/exec-authority-native.js';
import { InMemoryTaskAttemptCustodyAdapter } from '../helpers/task-result-settlement-v2-fixture.js';

const temporaryDirectories: string[] = [];
let fixtureSequence = 0;

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    await rm(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function sha256(bytes: Uint8Array | string): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
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

function canonicalBytes(value: unknown): Buffer {
  const canonical = (candidate: unknown): string => {
    if (Array.isArray(candidate)) return `[${candidate.map(canonical).join(',')}]`;
    if (candidate !== null && typeof candidate === 'object') {
      return `{${Object.entries(candidate as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
    }
    return JSON.stringify(candidate);
  };
  return Buffer.from(canonical(value), 'utf8');
}

function artifactLimits(maxBytes: number): Record<
  TaskAttemptCustodyArtifactClass,
  TaskAttemptCustodyArtifactLimit
> {
  return Object.fromEntries(TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES.map(artifactClass => [
    artifactClass,
    {
      minBytes: artifactClass === 'execution-effect-staged-content' ? 0 : 1,
      maxBytes: artifactClass === 'execution-effect-staged-content' ? maxBytes : 512 * 1024,
      requireSingleLink: true as const,
    },
  ])) as Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>;
}

interface FakeNativeOptions {
  readonly closeFailure?: boolean;
  readonly separationFailure?: boolean;
}

interface FakeNativeControl {
  readonly state: ExecAuthorityNativeState;
  readonly stagingIdentities: string[];
  setProjectFile(path: string, bytes: Uint8Array, mode: number): void;
}

function fakeNative(options: FakeNativeOptions = {}): FakeNativeControl {
  type RootHandle = { readonly tag: 'root'; readonly kind: string; readonly path: string };
  type SourceHandle = {
    readonly tag: 'source';
    readonly bytes: Buffer;
    readonly authority: { readonly path: string; readonly maxChunkBytes: number };
    offset: number;
    chunks: number;
  };
  type StageHandle = {
    readonly tag: 'stage';
    readonly expectedDigest: string;
    readonly expectedBytes: number;
    readonly identity: string;
    readonly chunks: Buffer[];
  };
  const projectFiles = new Map<string, { bytes: Buffer; mode: number; identity: string }>();
  const stagingIdentities: string[] = [];
  let stageSequence = 0;
  const handle = (value: RootHandle | SourceHandle | StageHandle): ExecAuthorityNativeEffectHandle =>
    value as unknown as ExecAuthorityNativeEffectHandle;
  const facade: ExecAuthorityNativeEffectFacade = {
    openRoot: (kind, path) => Object.freeze({
      schemaVersion: 1,
      kind: 'execution-effect-root',
      state: 'OPENED',
      rootKind: kind,
      identityDigest: kind === 'PROJECT' ? sha256('project-root') : sha256('staging-root'),
      handle: handle({ tag: 'root', kind, path }),
    }),
    captureTree: () => { throw new Error('not used'); },
    inspectEntry: (_root, path) => {
      const file = projectFiles.get(path);
      if (!file) {
        const error = Object.assign(new Error('absent'), { code: 'ENOENT' });
        throw error;
      }
      return Object.freeze({
        schemaVersion: 1,
        kind: 'execution-effect-inspection',
        state: 'PRESENT',
        entry: Object.freeze({
          schemaVersion: 1,
          path,
          kind: 'REGULAR_FILE',
          mode: file.mode.toString(8).padStart(4, '0'),
          size: String(file.bytes.byteLength),
          objectIdentityDigest: file.identity,
          contentDigest: sha256(file.bytes),
        }),
      });
    },
    beginSourceRead: (rootValue, authority) => {
      const root = rootValue as unknown as RootHandle;
      const bytes = Buffer.from(readFileSync(join(root.path, authority.path)));
      if (bytes.byteLength !== authority.expectedSize || sha256(bytes) !== authority.expectedContentDigest) {
        throw Object.assign(new Error('changed'), { code: 'E_EXEC_AUTH_NATIVE_IDENTITY_CHANGED' });
      }
      const source: SourceHandle = {
        tag: 'source', bytes, authority, offset: 0, chunks: 0,
      };
      return Object.freeze({
        schemaVersion: 1,
        kind: 'execution-effect-source-read',
        state: 'OPEN',
        contentDigest: authority.expectedContentDigest,
        deadlineUnixMs: authority.deadlineUnixMs,
        handle: handle(source),
        maxChunkBytes: authority.maxChunkBytes,
        mode: authority.expectedMode.toString(8).padStart(4, '0'),
        path: authority.path,
        sourceObjectIdentityDigest: sha256(`source:${authority.path}`),
        totalBytes: authority.expectedSize,
      });
    },
    nextSourceChunk: sourceValue => {
      const source = sourceValue as unknown as SourceHandle;
      const offset = source.offset;
      const length = source.bytes.byteLength === 0
        ? 0
        : Math.min(source.authority.maxChunkBytes, source.bytes.byteLength - offset);
      const bytes = Buffer.from(source.bytes.subarray(offset, offset + length));
      source.offset += length;
      return Object.freeze({
        schemaVersion: 1,
        kind: 'execution-effect-source-chunk',
        state: 'CHUNK',
        byteLength: bytes.byteLength,
        byteOffset: offset,
        bytes,
        contentDigest: sha256(bytes),
        index: source.chunks++,
        observedBytes: source.offset,
      });
    },
    finishSourceRead: sourceValue => {
      const source = sourceValue as unknown as SourceHandle;
      return Object.freeze({
        schemaVersion: 1,
        kind: 'execution-effect-source-read',
        state: 'VERIFIED',
        chunkCount: source.chunks,
        contentDigest: sha256(source.bytes),
        observedBytes: source.offset,
        sourceObjectIdentityDigest: sha256(`source:${source.authority.path}`),
      });
    },
    beginStage: (_root, totalBytes, contentDigest) => {
      const identity = sha256(`native-stage:${++stageSequence}`);
      stagingIdentities.push(identity);
      const stage: StageHandle = {
        tag: 'stage', expectedDigest: contentDigest, expectedBytes: totalBytes, identity, chunks: [],
      };
      return Object.freeze({
        schemaVersion: 1,
        kind: 'execution-effect-stage',
        state: 'OPEN',
        handle: handle(stage),
        totalBytes,
        contentDigest,
        nativeStagingObjectIdentityDigest: identity,
      });
    },
    appendStage: (stageValue, bytes) => {
      const stage = stageValue as unknown as StageHandle;
      stage.chunks.push(Buffer.from(bytes));
      return Object.freeze({
        schemaVersion: 1,
        kind: 'execution-effect-stage-append',
        state: 'APPENDED',
        observedBytes: Buffer.concat(stage.chunks).byteLength,
      });
    },
    sealStage: stageValue => {
      const stage = stageValue as unknown as StageHandle;
      const bytes = Buffer.concat(stage.chunks);
      if (bytes.byteLength !== stage.expectedBytes || sha256(bytes) !== stage.expectedDigest) {
        throw new Error('bad stage');
      }
      return Object.freeze({
        schemaVersion: 1,
        kind: 'execution-effect-stage',
        state: 'SEALED',
        contentDigest: stage.expectedDigest,
        nativeStagingObjectIdentityDigest: stage.identity,
      });
    },
    applyOperation: (_root, envelope, staged) => {
      const operationDigest = `sha256:${Buffer.from(envelope).subarray(40, 72).toString('hex')}`;
      const stage = staged as unknown as StageHandle;
      const bytes = Buffer.concat(stage.chunks);
      projectFiles.set('src/result.txt', { bytes, mode: 0o644, identity: sha256(`file:${stage.identity}`) });
      return Object.freeze({
        schemaVersion: 1,
        kind: 'execution-effect-mutation',
        state: 'APPLIED',
        operationDigest,
        durabilityEvidenceDigest: sha256(`durable:${stage.identity}`),
        postimageDigest: sha256(`file:${stage.identity}`),
      });
    },
    reconcileOperation: (_root, envelope, staged) => facade.applyOperation(_root, envelope, staged),
    verifyPostimages: (_root, envelope) => Object.freeze({
      schemaVersion: 1,
      kind: 'execution-effect-final-verification',
      state: 'VERIFIED',
      planDigest: sha256(envelope),
      postimageSetDigest: sha256('postimages'),
      verifiedCount: 1,
    }),
    closeHandle: () => {
      if (options.closeFailure) throw Object.assign(new Error('close'), {
        code: 'E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED',
      });
    },
  };
  const custody = {
    invoke(operation: string) {
      if (operation === 'open-root') return { handle: {} };
      if (options.separationFailure) throw Object.assign(new Error('alias'), {
        code: 'E_EXEC_AUTH_NATIVE_ROOT_OVERLAP',
      });
      return {
        state: 'CONFIRMED',
        custodyIdentity: { root: 'staging' },
        projectIdentity: { root: 'project' },
        featureEvidenceBits: 1,
      };
    },
    consumeSealReconciliation() { throw new Error('not used'); },
    closeHandle() {},
  };
  const effectContract = Object.freeze({
    schemaVersion: 1 as const,
    abiName: 'deckent.execution-effect' as const,
    abiVersion: '2.1.0' as const,
    handleAbi: 'deckent.execution-effect.opaque-generation.v2' as const,
    trustDomain: 'execution-effect-linux-v1' as const,
    available: true,
    operations: Object.freeze([
      'append-stage', 'apply-operation', 'begin-source-read', 'begin-stage', 'capture-tree',
      'finish-source-read', 'inspect-entry', 'next-source-chunk', 'open-root',
      'reconcile-operation', 'seal-stage', 'verify-postimages',
    ]),
  });
  const state = {
    available: true,
    manifest: Object.freeze({
      schemaVersion: 1,
      abiName: 'deckent.exec-authority',
      abiVersion: '1.0.0',
      napiVersion: 8,
      packageName: '@deckent/exec-authority-native',
      packageVersion: '1.0.0',
      platform: 'linux',
      arch: 'x64',
      handleAbi: 'deckent.exec-authority.opaque-generation.v1',
      buildType: 'Release',
      effectContract,
      features: Object.freeze(['custody-posix-v1', 'execution-effect-linux-v1']),
      exportSet: Object.freeze([]),
    }),
    legacy: {}, binding: {}, custody, effect: facade,
  } as unknown as ExecAuthorityNativeState;
  return {
    state,
    stagingIdentities,
    setProjectFile(path, bytes, mode) {
      projectFiles.set(path, { bytes: Buffer.from(bytes), mode, identity: sha256(`file:${path}`) });
    },
  };
}

function dockerExecutor(
  bytes: Uint8Array,
  mutate?: (input: ExecutionEffectDockerSourceInvocationV1) => Record<string, unknown>,
): ExecutionEffectDockerSourceExecutorV1 {
  return Object.freeze({
    async execute(input) {
      writeSync(input.destinationFd, bytes);
      const {
        destinationFd: _destinationFd,
        deadlineUnixMs: _deadlineUnixMs,
        maxChunkBytes: _maxChunkBytes,
        timeoutMs: _timeoutMs,
        receiptMaxBytes: _receiptMaxBytes,
        ...body
      } = input;
      return createExecutionEffectDockerSourceReceiptV1({
        ...body,
        ...(mutate?.(input) ?? {}),
        sourceObjectIdentityDigest: sha256('docker-source-object'),
        chunkCount: 1,
      } as Parameters<typeof createExecutionEffectDockerSourceReceiptV1>[0]);
    },
  });
}

async function adapterFixture(
  bytes: Uint8Array,
  options: Readonly<{
    native?: FakeNativeControl;
    docker?: ExecutionEffectDockerSourceExecutorV1;
    store?: (base: ExecutionEffectStagedContentStoreV1) => ExecutionEffectStagedContentStoreV1;
    platform?: ExecutionEffectNativeAdapterFactoryInputV1['platform'];
  }> = {},
): Promise<Readonly<{
  adapter: ExecutionEffectLandingNativeAdapterV1;
  input: ExecutionEffectNativeAdapterFactoryInputV1;
  native: FakeNativeControl;
  landingIntentDigest: Sha256Digest;
  entry: Readonly<{
    path: string;
    kind: 'regular-file';
    mode: number;
    size: number;
    contentDigest: Sha256Digest;
  }>;
}>> {
  const maxChunkBytes = 4;
  const policy = createTaskAttemptCustodyPolicy({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    metadataMaxBytes: 64 * 1024,
    jsonBounds: {
      maxDepth: 40, maxNodes: 30_000, maxStringBytes: 32 * 1024,
      maxArrayLength: 3_000, maxObjectKeys: 512, maxCanonicalBytes: 512 * 1024,
    },
    artifactLimits: artifactLimits(maxChunkBytes),
  });
  const sequence = ++fixtureSequence;
  const canonicalProjectRoot = '/fixture/project';
  const custodyAdapter = new InMemoryTaskAttemptCustodyAdapter();
  const store = TaskAttemptCustodyStore.open({
    adapter: custodyAdapter,
    absoluteRoot: `/fixture/native-adapter-custody-${sequence}`,
    canonicalProjectRoot,
    projectId: 'fixture-project',
    create: true,
  });
  const identity: TaskAttemptCustodyIdentityV2 = {
    schemaVersion: 2,
    backend: 'docker',
    projectRootSha256: createHash('sha256').update(canonicalProjectRoot).digest('hex'),
    projectId: 'fixture-project',
    taskId: `native-adapter-${sequence}`,
    attemptId: `123e4567-e89b-42d3-a456-${String(sequence).padStart(12, '0')}`,
    generation: 1,
  };
  const admission = store.createAdmission({
    identity,
    policy,
    admittedAt: `2026-09-01T10:00:${String(sequence % 60).padStart(2, '0')}.000Z`,
    predecessorDigest: null,
    predecessorIdentity: null,
    taskSnapshot: { id: identity.taskId, scope: { filesRead: [], filesWrite: ['src/result.txt'] } },
  });
  const attempt = Object.freeze({
    projectId: identity.projectId,
    taskId: identity.taskId,
    attemptId: identity.attemptId,
    generation: identity.generation,
  });
  const imageDigest = sha256('image');
  const resource = createExecutionEffectWorkspaceResourceV1({
    volumeName: `deckent-effect-${sequence}`,
    imageDigest,
    labelsDigest: sha256('labels'),
    mountPlanDigest: sha256('mount-plan'),
    snapshotInventoryDigest: sha256('snapshot'),
    populationReceiptDigest: sha256('population'),
    baselineManifestDigest: sha256('baseline'),
  });
  const workspaceIdentity = Object.freeze({
    filesystemId: `fs-${sequence}`,
    directoryId: `dir-${sequence}`,
    rootHandleEvidenceDigest: sha256(`workspace-root-${sequence}`),
  });
  const workspaceSnapshot = createExecutionEffectWorkspaceSnapshotSealV1({
    attempt,
    admissionReceiptDigest: admission.receiptDigest,
    custodyPolicyDigest: policy.policyDigest,
    writePolicyDigest: sha256('write-policy'),
    workspaceIdentity,
    workspaceResource: resource,
    dependencyResource: createExecutionEffectDependencyResourceV1({
      attempt,
      admissionReceiptDigest: admission.receiptDigest,
      custodyPolicyDigest: policy.policyDigest,
      imageIdentityDigest: imageDigest,
      labelsDigest: sha256(`dependency-labels-${sequence}`),
      mountPlanDigest: sha256(`dependency-mount-plan-${sequence}`),
      populationReceiptDigest: sha256(`dependency-population-${sequence}`),
      volumeName: `deckent-effect-deps-${sequence}`,
      volumeIdentityDigest: sha256(`dependency-volume-identity-${sequence}`),
      readyAt: '2026-09-01T09:59:00.000Z',
    }),
    nativeCapabilityDigest: sha256('capture-native-capability'),
    platform: options.platform === 'linux' ? 'linux' : 'wsl2-linux',
    sealedAt: '2026-09-01T10:00:00.000Z',
  });
  const stagingRoot = await mkdtemp(join(tmpdir(), 'deckent-effect-native-adapter-'));
  temporaryDirectories.push(stagingRoot);
  const native = options.native ?? fakeNative();
  const baseStore = store as unknown as ExecutionEffectStagedContentStoreV1;
  const entry = Object.freeze({
    path: 'src/result.txt', kind: 'regular-file' as const, mode: 0o644,
    size: bytes.byteLength, contentDigest: sha256(bytes),
  });
  const landingIntentDigest = sha256(`landing-intent-${sequence}`);
  const input: ExecutionEffectNativeAdapterFactoryInputV1 = {
    platform: options.platform ?? 'wsl',
    canonicalProjectRoot,
    hostPrivateStagingRoot: stagingRoot,
    attempt,
    identity,
    admission,
    policy,
    workspaceSnapshot,
    workspaceRuntime: {
      version: 1,
      state: 'SEALED',
      imageReference: `deckent/runtime@${imageDigest}`,
      imageDigest,
      volumeName: resource.volumeName,
      volumeNameDigest: resource.volumeNameDigest,
      volumeIdentityDigest: sha256('volume-identity'),
      mountTarget: '/workspace',
      mountIdentityDigest: sha256('mount-identity'),
      workspaceResourceDigest: resource.resourceDigest,
      workspaceSnapshotSealDigest: workspaceSnapshot.sealDigest,
      manifestDigest: sha256('final-manifest'),
    },
    sourceAuthorities: Object.freeze([Object.freeze({
      path: entry.path,
      entry,
      landingIntentDigest,
    })]),
    store: options.store?.(baseStore) ?? baseStore,
    clock: {
      nowIso: () => '2026-09-01T10:01:00.000Z',
      nowUnixMs: () => Date.parse('2026-09-01T10:01:00.000Z'),
    },
    limits: {
      maxStagedChunkBytes: maxChunkBytes,
      maxOperations: 100_000,
      maxPlanEnvelopeBytes: 16 * 1024 * 1024,
      sourceReadTimeoutMs: 60_000,
      dockerTimeoutMs: 60_000,
      dockerReceiptMaxBytes: 64 * 1024,
    },
  };
  const result = await createExecutionEffectLandingNativeAdapterV1(input, {
    loadNative: () => native.state,
    docker: options.docker ?? dockerExecutor(bytes),
  });
  if (result.state !== 'READY') throw new Error(`fixture HOLD: ${result.code}`);
  return {
    adapter: result.adapter,
    input,
    native,
    landingIntentDigest,
    entry,
  };
}

const CAPTURE_LIMITS: ExecutionEffectCaptureLimits = Object.freeze({
  maxEntries: 128,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
  maxDepth: 32,
  maxPathBytes: 4096,
  maxNameBytes: 255,
  maxManifestBytes: 1024 * 1024,
});

function captureExecutor(
  rootEntry: ExecutionEffectNativeCaptureEntryV1,
  nativeCapture: ExecutionEffectNativeCaptureTreeV1,
  mutate?: Readonly<{
    payload?: (bytes: Buffer) => Uint8Array;
    receipt?: (body: Record<string, unknown>) => Record<string, unknown>;
  }>,
): Readonly<{ execute(input: ExecutionEffectDockerWorkspaceCaptureInvocationV1): Promise<{
  payloadBytes: Uint8Array;
  receipt: unknown;
}> }> {
  return Object.freeze({
    async execute(input) {
      const canonicalPayload = canonicalBytes({ rootEntry, nativeCapture });
      const payloadBytes = mutate?.payload?.(canonicalPayload) ?? canonicalPayload;
      const {
        timeoutMs: _timeoutMs,
        outputMaxBytes: _outputMaxBytes,
        receiptMaxBytes: _receiptMaxBytes,
        deadlineUnixMs: _deadlineUnixMs,
        limits: _limits,
        ...authority
      } = input;
      const receiptBody: Record<string, unknown> = {
        ...authority,
        kind: 'execution-effect-docker-workspace-capture-receipt',
        state: 'VERIFIED',
        payloadDigest: sha256(payloadBytes),
        payloadByteLength: payloadBytes.byteLength,
        nativeManifestDigest: nativeCapture.manifestDigest,
        rootObjectIdentityDigest: rootEntry.objectIdentityDigest,
        entryCount: nativeCapture.entryCount,
        totalBytes: nativeCapture.totalBytes,
      };
      const mutated = mutate?.receipt?.(receiptBody) ?? receiptBody;
      return Object.freeze({
        payloadBytes,
        receipt: createExecutionEffectDockerWorkspaceCaptureReceiptV1(
          mutated as Parameters<typeof createExecutionEffectDockerWorkspaceCaptureReceiptV1>[0],
        ),
      });
    },
  });
}

function dockerCaptureFixture(
  phase: 'baseline' | 'final',
  options: Readonly<{
    platform?: ExecutionEffectDockerWorkspaceCaptureInputV1['platform'];
    mutate?: Parameters<typeof captureExecutor>[2];
  }> = {},
): Readonly<{
  input: ExecutionEffectDockerWorkspaceCaptureInputV1;
  expectedDigest: Sha256Digest;
  executor: ReturnType<typeof captureExecutor>;
}> {
  const sequence = ++fixtureSequence;
  const attempt = Object.freeze({
    projectId: 'fixture-project',
    taskId: `capture-${sequence}`,
    attemptId: `123e4567-e89b-42d3-a456-${String(sequence).padStart(12, '0')}`,
    generation: 1,
  });
  const filesWrite = Object.freeze(['src/result.txt']);
  const policy = compileExecutionEffectWritePolicy(filesWrite);
  if (!policy.ok) throw new Error('invalid fixture write policy');
  const workspaceIdentity = Object.freeze({
    filesystemId: `capture-fs-${sequence}`,
    directoryId: `capture-dir-${sequence}`,
    rootHandleEvidenceDigest: sha256(`capture-root-${sequence}`),
  });
  const rootEntry: ExecutionEffectNativeCaptureEntryV1 = Object.freeze({
    schemaVersion: 1,
    path: '.',
    kind: 'DIRECTORY',
    mode: '0755',
    size: null,
    objectIdentityDigest: workspaceIdentity.rootHandleEvidenceDigest,
    contentDigest: null,
  });
  const entries: readonly ExecutionEffectNativeCaptureEntryV1[] = Object.freeze([
    Object.freeze({
      schemaVersion: 1, path: 'src', kind: 'DIRECTORY', mode: '0755', size: null,
      objectIdentityDigest: sha256(`capture-src-${sequence}`), contentDigest: null,
    }),
    Object.freeze({
      schemaVersion: 1, path: 'src/result.txt', kind: 'REGULAR_FILE', mode: '0644',
      size: '6', objectIdentityDigest: sha256(`capture-file-${sequence}`),
      contentDigest: sha256('result'),
    }),
  ]);
  const nativeCapture: ExecutionEffectNativeCaptureTreeV1 = Object.freeze({
    schemaVersion: 1,
    kind: 'execution-effect-manifest',
    state: 'CAPTURED',
    entries,
    entryCount: entries.length,
    totalBytes: 6,
    manifestDigest: executionEffectNativeCaptureManifestDigestV1({
      entries, entryCount: entries.length, totalBytes: 6,
    }),
  });
  const timestamps = {
    startedAt: '2026-09-01T10:01:00.000Z',
    completedAt: '2026-09-01T10:01:00.000Z',
    deadlineAt: '2026-09-01T10:02:00.000Z',
  } as const;
  const baseline = createExecutionEffectManifestFromNativeCaptureV1({
    phase: 'baseline', attempt, filesWrite, platform: 'wsl2-linux', workspaceIdentity,
    rootEntry, nativeCapture, ...timestamps, limits: CAPTURE_LIMITS,
  });
  const final = createExecutionEffectManifestFromNativeCaptureV1({
    phase: 'final', attempt, filesWrite, platform: 'wsl2-linux', workspaceIdentity,
    rootEntry, nativeCapture, ...timestamps, limits: CAPTURE_LIMITS,
  });
  if (!baseline.ok || !final.ok) throw new Error('invalid fixture native capture');
  const imageDigest = sha256('capture-image');
  const resource = createExecutionEffectWorkspaceResourceV1({
    volumeName: `deckent-capture-${sequence}`,
    imageDigest,
    labelsDigest: sha256('capture-labels'),
    mountPlanDigest: sha256('capture-mount-plan'),
    snapshotInventoryDigest: sha256('capture-snapshot'),
    populationReceiptDigest: sha256('capture-population'),
    baselineManifestDigest: baseline.manifest.digest as Sha256Digest,
  });
  const workspaceSnapshot = createExecutionEffectWorkspaceSnapshotSealV1({
    attempt,
    admissionReceiptDigest: sha256('capture-admission'),
    custodyPolicyDigest: sha256('capture-custody-policy'),
    writePolicyDigest: policy.policy.digest,
    workspaceIdentity,
    workspaceResource: resource,
    dependencyResource: createExecutionEffectDependencyResourceV1({
      attempt,
      admissionReceiptDigest: sha256('capture-admission'),
      custodyPolicyDigest: sha256('capture-custody-policy'),
      imageIdentityDigest: imageDigest,
      labelsDigest: sha256(`capture-dependency-labels-${sequence}`),
      mountPlanDigest: sha256(`capture-dependency-mount-plan-${sequence}`),
      populationReceiptDigest: sha256(`capture-dependency-population-${sequence}`),
      volumeName: `deckent-capture-deps-${sequence}`,
      volumeIdentityDigest: sha256(`capture-dependency-volume-identity-${sequence}`),
      readyAt: '2026-09-01T09:59:00.000Z',
    }),
    nativeCapabilityDigest: sha256('capture-native-capability'),
    platform: 'wsl2-linux',
    sealedAt: '2026-09-01T10:00:00.000Z',
  });
  const expectedDigest = (phase === 'baseline'
    ? baseline.manifest.digest : final.manifest.digest) as Sha256Digest;
  const input: ExecutionEffectDockerWorkspaceCaptureInputV1 = {
    platform: options.platform ?? 'wsl',
    phase,
    attempt,
    filesWrite,
    workspaceSnapshot,
    workspaceRuntime: {
      version: 1,
      state: 'SEALED',
      imageReference: `deckent/runtime@${imageDigest}`,
      imageDigest,
      volumeName: resource.volumeName,
      volumeNameDigest: resource.volumeNameDigest,
      volumeIdentityDigest: sha256('capture-volume-identity'),
      mountTarget: '/workspace',
      mountIdentityDigest: sha256('capture-mount-identity'),
      workspaceResourceDigest: resource.resourceDigest,
      workspaceSnapshotSealDigest: workspaceSnapshot.sealDigest,
      manifestDigest: expectedDigest,
    },
    clock: {
      nowIso: () => timestamps.startedAt,
      nowUnixMs: () => Date.parse(timestamps.startedAt),
    },
    limits: CAPTURE_LIMITS,
    timeoutMs: 60_000,
    receiptMaxBytes: 64 * 1024,
  };
  return Object.freeze({
    input,
    expectedDigest,
    executor: captureExecutor(rootEntry, nativeCapture, options.mutate),
  });
}

describe('execution effect native adapter', () => {
  it.each(['baseline', 'final'] as const)(
    'captures a canonical %s manifest from the sealed Docker volume',
    async phase => {
      const fixture = dockerCaptureFixture(phase);
      const result = await captureExecutionEffectDockerWorkspaceManifestV1(
        fixture.input,
        { docker: fixture.executor },
      );
      expect(result.state).toBe('VERIFIED');
      if (result.state !== 'VERIFIED') return;
      expect(result.manifest.digest).toBe(fixture.expectedDigest);
      expect(result.dockerReceipt).toMatchObject({
        state: 'VERIFIED',
        phase,
        helperScriptDigest: EXECUTION_EFFECT_DOCKER_WORKSPACE_CAPTURE_HELPER_DIGEST,
        workspaceSnapshotSealDigest: fixture.input.workspaceSnapshot.sealDigest,
      });
    },
  );

  it.each(['darwin', 'win32'] as const)(
    'returns typed workspace-capture HOLD on %s',
    async platform => {
      const fixture = dockerCaptureFixture('baseline', { platform });
      const result = await captureExecutionEffectDockerWorkspaceManifestV1(
        fixture.input,
        { docker: fixture.executor },
      );
      expect(result).toMatchObject({ state: 'HOLD', code: 'PLATFORM_UNSUPPORTED' });
    },
  );

  it.each(['imageReference', 'volumeName', 'phase', 'workspaceRootIdentityDigest'] as const)(
    'rejects a workspace-capture receipt with foreign %s',
    async field => {
      const fixture = dockerCaptureFixture('final', {
        mutate: {
          receipt: body => ({
            ...body,
            [field]: field === 'imageReference'
              ? `foreign/runtime@${body.imageDigest as string}`
              : field === 'volumeName'
                ? 'foreign-volume'
                : field === 'phase'
                  ? 'baseline'
                  : sha256('foreign-workspace-root'),
          }),
        },
      });
      const result = await captureExecutionEffectDockerWorkspaceManifestV1(
        fixture.input,
        { docker: fixture.executor },
      );
      expect(result).toMatchObject({ state: 'HOLD', code: 'DOCKER_RECEIPT_MISMATCH' });
    },
  );

  it('rejects Docker capture output above the hard 16 MiB ceiling', async () => {
    const fixture = dockerCaptureFixture('baseline');
    const result = await captureExecutionEffectDockerWorkspaceManifestV1(fixture.input, {
      docker: {
        async execute(input) {
          return {
            payloadBytes: Buffer.alloc(input.outputMaxBytes + 1),
            receipt: {},
          };
        },
      },
    });
    expect(result).toMatchObject({ state: 'HOLD', code: 'DOCKER_RECEIPT_MISMATCH' });
  });

  it('rejects full-entry tampering even when the native path set is unchanged', async () => {
    const fixture = dockerCaptureFixture('baseline', {
      mutate: {
        payload: bytes => {
          const payload = JSON.parse(bytes.toString('utf8')) as {
            nativeCapture: { entries: Array<Record<string, unknown>> };
          };
          payload.nativeCapture.entries[1] = {
            ...payload.nativeCapture.entries[1],
            contentDigest: sha256('tampered-content'),
          };
          return canonicalBytes(payload);
        },
      },
    });
    const result = await captureExecutionEffectDockerWorkspaceManifestV1(
      fixture.input,
      { docker: fixture.executor },
    );
    expect(result).toMatchObject({ state: 'HOLD', code: 'NATIVE_CONTRACT_MISMATCH' });
  });

  it('snapshots capture filesWrite before the async Docker boundary', async () => {
    const fixture = dockerCaptureFixture('baseline');
    const mutableFilesWrite = [...fixture.input.filesWrite];
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    const pending = captureExecutionEffectDockerWorkspaceManifestV1({
      ...fixture.input,
      filesWrite: mutableFilesWrite,
    }, {
      docker: {
        async execute(input) {
          await paused;
          return await fixture.executor.execute(input);
        },
      },
    });
    mutableFilesWrite[0] = 'src/foreign.txt';
    release();
    const result = await pending;
    expect(result).toMatchObject({ state: 'VERIFIED' });
  });

  it('rejects a proxy capture input before Docker access', async () => {
    const fixture = dockerCaptureFixture('baseline');
    let dockerCalls = 0;
    const result = await captureExecutionEffectDockerWorkspaceManifestV1(
      new Proxy(fixture.input, {}),
      { docker: { async execute() { dockerCalls += 1; throw new Error('unreachable'); } } },
    );
    expect(result).toMatchObject({ state: 'HOLD', code: 'INVALID_INPUT' });
    expect(dockerCalls).toBe(0);
  });

  it.each(['darwin', 'win32'] as const)('returns typed HOLD on %s', async platform => {
    const result = await createExecutionEffectLandingNativeAdapterV1({
      platform,
      canonicalProjectRoot: '/project',
      hostPrivateStagingRoot: '/staging',
      attempt: {} as never,
      identity: {} as never,
      admission: {} as never,
      policy: {} as never,
      workspaceSnapshot: {} as never,
      workspaceRuntime: {} as never,
      sourceAuthorities: [],
      store: {} as never,
      clock: {} as never,
      limits: {} as never,
    });
    expect(result).toMatchObject({ state: 'HOLD', code: 'PLATFORM_UNSUPPORTED' });
  });

  it('streams Docker bytes through native ingress and durable Store chunks', async () => {
    const bytes = Buffer.from('abcdefghij');
    const fixture = await adapterFixture(bytes);
    const source = await fixture.adapter.stageSource({
      path: fixture.entry.path,
      entry: fixture.entry,
      workspaceIdentityDigest: fixture.adapter.capability.workspaceIdentityDigest,
      landingIntentDigest: fixture.landingIntentDigest,
    });
    expect(source.chunks.map(chunk => chunk.byteLength)).toEqual([4, 4, 2]);
    expect(fixture.adapter.verifyStagedSource(source)).toBe(true);
  });

  it('supports a single durable zero-byte chunk', async () => {
    const fixture = await adapterFixture(Buffer.alloc(0));
    const source = await fixture.adapter.stageSource({
      path: fixture.entry.path,
      entry: fixture.entry,
      workspaceIdentityDigest: fixture.adapter.capability.workspaceIdentityDigest,
      landingIntentDigest: fixture.landingIntentDigest,
    });
    expect(source.byteLength).toBe(0);
    expect(source.chunks).toHaveLength(1);
    expect(source.chunks[0]?.byteLength).toBe(0);
    expect(fixture.adapter.verifyStagedSource(source)).toBe(true);
  });

  it.each(['volumeName', 'imageReference', 'path'] as const)(
    'rejects a validly sealed Docker receipt with foreign %s',
    async field => {
      const bytes = Buffer.from('source');
      const docker = dockerExecutor(bytes, input => field === 'volumeName'
        ? { volumeName: 'foreign-volume' }
        : field === 'imageReference'
          ? { imageReference: `foreign/image@${input.imageDigest}` }
          : { path: 'src/foreign.txt' });
      const fixture = await adapterFixture(bytes, { docker });
      await expect(fixture.adapter.stageSource({
        path: fixture.entry.path,
        entry: fixture.entry,
        workspaceIdentityDigest: fixture.adapter.capability.workspaceIdentityDigest,
        landingIntentDigest: fixture.landingIntentDigest,
      })).rejects.toMatchObject({ code: 'DOCKER_RECEIPT_MISMATCH' });
    },
  );

  it('fails verification after a Store chunk semantic tamper', async () => {
    let tamper = false;
    const fixture = await adapterFixture(Buffer.from('content'), {
      store: base => ({
        root: base.root,
        publishHostArtifact: input => base.publishHostArtifact(input),
        readVerifiedArtifact: input => {
          const value = base.readVerifiedArtifact(input);
          return tamper && value
            ? { ...value, bytes: Buffer.from('evil') }
            : value;
        },
      }),
    });
    const source = await fixture.adapter.stageSource({
      path: fixture.entry.path,
      entry: fixture.entry,
      workspaceIdentityDigest: fixture.adapter.capability.workspaceIdentityDigest,
      landingIntentDigest: fixture.landingIntentDigest,
    });
    tamper = true;
    expect(fixture.adapter.verifyStagedSource(source)).toBe(false);
  });

  it('rejects staged-source replay under a foreign attempt digest', async () => {
    const fixture = await adapterFixture(Buffer.from('replay'));
    const source = await fixture.adapter.stageSource({
      path: fixture.entry.path,
      entry: fixture.entry,
      workspaceIdentityDigest: fixture.adapter.capability.workspaceIdentityDigest,
      landingIntentDigest: fixture.landingIntentDigest,
    });
    expect(fixture.adapter.verifyStagedSource({
      ...source,
      attemptDigest: sha256('foreign-attempt'),
    })).toBe(false);
  });

  it('snapshots source authority before the async Docker boundary', async () => {
    const bytes = Buffer.from('snapshot');
    const baseDocker = dockerExecutor(bytes);
    const fixture = await adapterFixture(bytes, {
      docker: {
        async execute(input) {
          await Promise.resolve();
          return await baseDocker.execute(input);
        },
      },
    });
    const mutableEntry = { ...fixture.entry };
    const pending = fixture.adapter.stageSource({
      path: mutableEntry.path,
      entry: mutableEntry,
      workspaceIdentityDigest: fixture.adapter.capability.workspaceIdentityDigest,
      landingIntentDigest: fixture.landingIntentDigest,
    });
    mutableEntry.contentDigest = sha256('mutated-after-call');
    const source = await pending;
    expect(source.contentDigest).toBe(sha256(bytes));
  });

  it('rejects accessor-backed source authority before Docker access', async () => {
    let dockerCalls = 0;
    const bytes = Buffer.from('accessor');
    const fixture = await adapterFixture(bytes, {
      docker: {
        async execute(input) {
          dockerCalls += 1;
          return await dockerExecutor(bytes).execute(input);
        },
      },
    });
    const entry = { ...fixture.entry } as Record<string, unknown>;
    Object.defineProperty(entry, 'contentDigest', {
      enumerable: true,
      get: () => fixture.entry.contentDigest,
    });
    await expect(fixture.adapter.stageSource({
      path: fixture.entry.path,
      entry: entry as never,
      workspaceIdentityDigest: fixture.adapter.capability.workspaceIdentityDigest,
      landingIntentDigest: fixture.landingIntentDigest,
    })).rejects.toMatchObject({ code: 'AUTHORITY_MISMATCH' });
    expect(dockerCalls).toBe(0);
  });

  it('rejects root-separation uncertainty before Docker or Store access', async () => {
    const native = fakeNative({ separationFailure: true });
    await expect(adapterFixture(Buffer.from('x'), { native })).rejects.toThrow('fixture HOLD: ROOT_IDENTITY_MISMATCH');
  });

  it('treats native handle-close uncertainty as HOLD', async () => {
    const native = fakeNative({ closeFailure: true });
    await expect(adapterFixture(Buffer.from('x'), { native })).rejects.toThrow('fixture HOLD: CLEANUP_UNCONFIRMED');
  });

  it('rematerializes Store chunks into a fresh native staging object per adapter invocation', async () => {
    const bytes = Buffer.from('fresh-stage');
    const fixture = await adapterFixture(bytes);
    const source = await fixture.adapter.stageSource({
      path: fixture.entry.path,
      entry: fixture.entry,
      workspaceIdentityDigest: fixture.adapter.capability.workspaceIdentityDigest,
      landingIntentDigest: fixture.landingIntentDigest,
    });
    const absent = createExecutionEffectLandingEntryStateV1({ entry: null });
    const directory = createExecutionEffectLandingEntryStateV1({
      entry: { path: '.', kind: 'directory', mode: 0o755 },
      objectIdentityDigest: sha256('project-root'),
      linkCount: null,
    });
    const expectedBody = Object.freeze({ state: 'PRESENT' as const, entry: fixture.entry });
    const expected = Object.freeze({
      ...expectedBody,
      stateDigest: domainDigest('execution-effect-landing-expected-entry-state-v1', expectedBody),
    });
    const body = Object.freeze({
      version: 1 as const,
      index: 0,
      kind: 'ADD' as const,
      path: fixture.entry.path,
      effectDigests: Object.freeze([sha256('effect')]),
      derivedParent: null,
      stagedSource: source,
      entryPreimages: Object.freeze([{ path: fixture.entry.path, entry: absent }]),
      entryPostimages: Object.freeze([{ path: fixture.entry.path, entry: expected }]),
      parentAuthorities: Object.freeze([{
        path: '.', source: 'PREPARED_PREIMAGE' as const, entry: directory,
      }]),
    });
    const operation: ExecutionEffectLandingOperationV1 = Object.freeze({
      ...body,
      operationDigest: executionEffectLandingOperationDigestV1({
        ...body,
        stagedSource: { stageAuthorityDigest: source.stageAuthorityDigest },
      }),
    });
    const first = fixture.adapter.applyOperation({ operation, dependencyReceipts: [] });
    const restarted = await createExecutionEffectLandingNativeAdapterV1(fixture.input, {
      loadNative: () => fixture.native.state,
      docker: dockerExecutor(bytes),
    });
    expect(restarted.state).toBe('READY');
    if (restarted.state !== 'READY') return;
    const second = restarted.adapter.applyOperation({ operation, dependencyReceipts: [] });
    expect(first.receiptDigest).not.toBe(second.receiptDigest);
    expect(new Set(fixture.native.stagingIdentities).size).toBe(2);
  });

  it('rejects a proxy factory input before native or Docker access', async () => {
    const fixture = await adapterFixture(Buffer.from('proxy'));
    const result = await createExecutionEffectLandingNativeAdapterV1(new Proxy(fixture.input, {}));
    expect(result).toMatchObject({ state: 'HOLD', code: 'INVALID_INPUT' });
  });
});
