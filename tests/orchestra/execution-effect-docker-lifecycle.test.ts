import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createExecutionEffectManifestFromNativeCaptureV1,
  EXECUTION_EFFECT_CAPTURE_HARD_LIMITS,
  executionEffectNativeCaptureManifestDigestV1,
  type ExecutionEffectAttemptIdentity,
  type ExecutionEffectCaptureLimits,
  type ExecutionEffectNativeCaptureEntryV1,
  type ExecutionEffectNativeCaptureTreeV1,
} from '../../src/core/execution-effect-containment.js';
import type { ExecutionEffectWritePolicy } from '../../src/core/execution-write-scope-policy.js';
import {
  createExecutionEffectLandingTerminalSealV1,
  createExecutionEffectLandingLeaseResumeContextV1,
  createExecutionEffectLandingReceiptV1,
  type ExecutionEffectLandingReceiptV1,
  type ExecutionEffectLandingTransactionRefV1,
  type ExecutionEffectPersistenceDigest,
} from '../../src/core/execution-effect-persistence-contract.js';
import {
  authorizeExecutionEffectDockerProviderStartV1,
  authorizeDurableExecutionEffectDockerAllocationV1,
  allocateExecutionEffectDockerWorkspaceV1,
  captureExecutionEffectDockerFinalV1,
  createExecutionEffectDockerDependencyAuthorityReceiptV1,
  createExecutionEffectDockerExclusiveAttachmentReceiptV1,
  createExecutionEffectDockerImageObservationV1,
  createExecutionEffectDockerLifecycleCaptureReceiptV1,
  createExecutionEffectDockerLifecycleAuthorityV1,
  createExecutionEffectDockerPopulationReceiptV1,
  createExecutionEffectDockerProviderStoppedReceiptV1,
  createExecutionEffectDockerReconciledAbsenceReceiptV1,
  createExecutionEffectDockerResourceAbsenceReceiptV1,
  createExecutionEffectDockerResourceDeletionReceiptV1,
  createExecutionEffectDockerVolumeCreationReceiptV1,
  createExecutionEffectDockerVolumeObservationV1,
  createExecutionEffectDockerWorkspacePlanV1,
  executionEffectDockerVolumeIdentityDigestV1,
  executionEffectDockerManifestStateDigestV1,
  executionEffectDockerWorkspaceDirectoryIdentityDigestV1,
  prepareAllocatedExecutionEffectDockerWorkspaceV1,
  projectExecutionEffectDockerWorkspaceReleaseV1,
  releaseExecutionEffectDockerWorkspaceV1,
  rehydrateExecutionEffectDockerLifecycleV1,
  screenExecutionEffectDockerWorkspaceInventoryV1,
  type AuthorizedExecutionEffectDockerProviderV1,
  type CaptureExecutionEffectDockerFinalV1Result,
  type ExecutionEffectDockerLifecycleAdapterV1,
  type ExecutionEffectDockerLifecycleCaptureOperationV1,
  type ExecutionEffectDockerLifecycleClockV1,
  type ExecutionEffectDockerProviderStoppedReceiptV1,
  type ExecutionEffectDockerRawCaptureV1,
  type ExecutionEffectDockerWorkspacePlanV1,
  type PrepareExecutionEffectDockerWorkspaceV1Input,
} from '../../src/orchestra/execution-effect-docker-lifecycle.js';
import {
  createExecutionEffectStoreAdapterV1,
} from '../../src/orchestra/execution-effect-store-adapter.js';
import {
  createTaskResultSettlementV2Fixture,
} from '../helpers/task-result-settlement-v2-fixture.js';

type Digest = ExecutionEffectPersistenceDigest;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function domainDigest(domain: string, value: unknown): Digest {
  return `sha256:${createHash('sha256')
    .update(domain).update('\0').update(canonicalJson(value)).digest('hex')}`;
}

function sha(value: string): Digest {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

const attempt = Object.freeze({
  projectId: 'project-1',
  taskId: 'task-21',
  attemptId: 'attempt-21-1',
  generation: 1,
});
const admittedAt = '2026-09-01T00:00:00.000Z';
const rootObjectIdentityDigest = sha('workspace-root');
const workspaceIdentity = Object.freeze({
  filesystemId: 'fs-1',
  directoryId: 'dir-1',
  rootHandleEvidenceDigest: rootObjectIdentityDigest,
});

function plan(inventoryPaths: readonly string[] = ['package.json']): ExecutionEffectDockerWorkspacePlanV1 {
  const imageDigest = sha('image');
  return createExecutionEffectDockerWorkspacePlanV1({
    imageReference: `deckent-worker@${imageDigest}`,
    imageDigest,
    volumeName: `deckent-xw-${'a'.repeat(48)}`,
    baseLabels: Object.freeze({
      'deckent.attempt': 'attempt-21-1',
      'deckent.authority': sha('labels-authority'),
    }),
    workspaceResourceInstanceNonce: 'c'.repeat(64),
    dependencyResourceInstanceNonce: 'd'.repeat(64),
    mountPlan: Object.freeze({
      type: 'volume',
      providerTarget: '/workspace',
      providerAccess: 'read-write',
      helperTarget: '/workspace',
      helperAccess: 'read-only',
    }),
    dependencyPlan: Object.freeze({
      sourceAuthority: 'image-owned-read-only-volume',
      imageSource: '/app/node_modules',
      volumeName: `deckent-xd-${'b'.repeat(48)}`,
      populationTarget: '/dependencies',
      providerTarget: '/workspace/node_modules',
      providerAccess: 'read-only',
      networkAccess: 'none',
      manifestScope: 'excluded-mount-overlay',
    }),
    inventoryPaths,
  });
}

function captureTree(
  content = 'baseline',
  path = 'package.json',
  identitySalt = '',
): Readonly<{
  rootEntry: ExecutionEffectNativeCaptureEntryV1;
  nativeCapture: ExecutionEffectNativeCaptureTreeV1;
}> {
  const bytes = Buffer.from(content, 'utf8');
  const rootEntry = Object.freeze({
    schemaVersion: 1 as const,
    path: '.',
    kind: 'DIRECTORY' as const,
    mode: '0755',
    size: null,
    objectIdentityDigest: identitySalt === ''
      ? rootObjectIdentityDigest : sha(`workspace-root:${identitySalt}`),
    contentDigest: null,
  });
  const entry = Object.freeze({
    schemaVersion: 1 as const,
    path,
    kind: 'REGULAR_FILE' as const,
    mode: '0644',
    size: String(bytes.byteLength),
    objectIdentityDigest: sha(`object:${path}:${content}:${identitySalt}`),
    contentDigest: sha(content),
  });
  const digestBody = Object.freeze({
    entries: Object.freeze([entry]),
    entryCount: 1,
    totalBytes: bytes.byteLength,
  });
  return Object.freeze({
    rootEntry,
    nativeCapture: Object.freeze({
      schemaVersion: 1 as const,
      kind: 'execution-effect-manifest' as const,
      state: 'CAPTURED' as const,
      ...digestBody,
      manifestDigest: executionEffectNativeCaptureManifestDigestV1(digestBody),
    }),
  });
}

const operationTimes = Object.freeze({
  POPULATION_BASELINE: Object.freeze({
    startedAt: '2026-09-01T00:00:04.000Z',
    completedAt: '2026-09-01T00:00:05.000Z',
    deadlineAt: '2026-09-01T00:00:06.000Z',
  }),
  BASELINE_REVALIDATION: Object.freeze({
    startedAt: '2026-09-01T00:00:08.000Z',
    completedAt: '2026-09-01T00:00:09.000Z',
    deadlineAt: '2026-09-01T00:00:10.000Z',
  }),
  FINAL_QUIESCENCE_FIRST: Object.freeze({
    startedAt: '2026-09-01T00:00:14.000Z',
    completedAt: '2026-09-01T00:00:15.000Z',
    deadlineAt: '2026-09-01T00:00:16.000Z',
  }),
  FINAL_QUIESCENCE_SECOND: Object.freeze({
    startedAt: '2026-09-01T00:00:15.000Z',
    completedAt: '2026-09-01T00:00:16.000Z',
    deadlineAt: '2026-09-01T00:00:17.000Z',
  }),
});

interface AdapterOptions {
  readonly wrongImageDigest?: boolean;
  readonly dependencyUnavailable?: boolean;
  readonly initialPresent?: boolean;
  readonly wrongPostCreateIdentity?: boolean;
  readonly revalidationContent?: string;
  readonly finalContent?: string;
  readonly finalSecondContent?: string;
  readonly finalPath?: string;
  readonly attachmentUnavailable?: boolean;
  readonly postAttachmentUnavailable?: boolean;
  readonly captureProxy?: boolean;
  readonly revalidationIdentitySalt?: string;
  readonly finalFirstIdentitySalt?: string;
  readonly finalSecondIdentitySalt?: string;
}

function fakeAdapter(
  workspacePlan: ExecutionEffectDockerWorkspacePlanV1,
  options: AdapterOptions = {},
): Readonly<{
  adapter: ExecutionEffectDockerLifecycleAdapterV1;
  calls: string[];
}> {
  const calls: string[] = [];
  const daemonCreatedAt = '2026-09-01T00:00:01.500Z';
  const volumeIdentityDigest = executionEffectDockerVolumeIdentityDigestV1({
    volumeName: workspacePlan.volumeName,
    labelsDigest: workspacePlan.workspaceLabelsDigest,
    resourceInstanceDigest: workspacePlan.workspaceResourceInstanceDigest,
    mountPlanDigest: workspacePlan.mountPlanDigest,
    daemonCreatedAt,
  });
  const dependencyDaemonCreatedAt = '2026-09-01T00:00:00.700Z';
  const dependencyVolumeIdentityDigest = executionEffectDockerVolumeIdentityDigestV1({
    volumeName: workspacePlan.dependencyPlan.volumeName,
    labelsDigest: workspacePlan.dependencyLabelsDigest,
    resourceInstanceDigest: workspacePlan.dependencyResourceInstanceDigest,
    mountPlanDigest: workspacePlan.dependencyPlanDigest,
    daemonCreatedAt: dependencyDaemonCreatedAt,
  });
  const capture = (
    operation: ExecutionEffectDockerLifecycleCaptureOperationV1,
    authorityDigest: Digest,
    authority: Readonly<{
      platform: 'linux' | 'wsl2-linux';
      attempt: ExecutionEffectAttemptIdentity;
      writePolicy: ExecutionEffectWritePolicy;
      captureLimits: ExecutionEffectCaptureLimits;
    }>,
    content: string,
    path = 'package.json',
  ): ExecutionEffectDockerRawCaptureV1 => {
    const identitySalt = operation === 'BASELINE_REVALIDATION'
      ? options.revalidationIdentitySalt ?? ''
      : operation === 'FINAL_QUIESCENCE_FIRST'
        ? options.finalFirstIdentitySalt ?? ''
        : operation === 'FINAL_QUIESCENCE_SECOND'
          ? options.finalSecondIdentitySalt ?? '' : '';
    const tree = captureTree(content, path, identitySalt);
    const times = operationTimes[operation];
    const captureWorkspaceIdentity = Object.freeze({
      filesystemId: volumeIdentityDigest,
      directoryId: executionEffectDockerWorkspaceDirectoryIdentityDigestV1({
        volumeIdentityDigest,
      }),
      rootHandleEvidenceDigest: tree.rootEntry.objectIdentityDigest,
    });
    const manifest = createExecutionEffectManifestFromNativeCaptureV1({
      phase: operation.startsWith('FINAL_QUIESCENCE_') ? 'final' : 'baseline',
      attempt: authority.attempt,
      filesWrite: authority.writePolicy.filesWrite,
      platform: authority.platform,
      workspaceIdentity: captureWorkspaceIdentity,
      rootEntry: tree.rootEntry,
      nativeCapture: tree.nativeCapture,
      ...times,
      limits: authority.captureLimits,
    });
    if (!manifest.ok) throw new Error('capture manifest fixture is invalid');
    const receipt = createExecutionEffectDockerLifecycleCaptureReceiptV1({
      operation,
      authorityDigest,
      phase: operation.startsWith('FINAL_QUIESCENCE_') ? 'final' : 'baseline',
      volumeName: workspacePlan.volumeName,
      volumeIdentityDigest,
      workspaceIdentity: captureWorkspaceIdentity,
      nativeManifestDigest: tree.nativeCapture.manifestDigest as Digest,
      manifestStateDigest: executionEffectDockerManifestStateDigestV1(manifest.manifest),
      rootObjectIdentityDigest: tree.rootEntry.objectIdentityDigest as Digest,
      entryCount: tree.nativeCapture.entryCount,
      totalBytes: tree.nativeCapture.totalBytes,
      ...times,
    });
    return Object.freeze({
      workspaceIdentity: captureWorkspaceIdentity,
      ...tree,
      ...times,
      receipt,
    });
  };
  const adapter: ExecutionEffectDockerLifecycleAdapterV1 = Object.freeze({
    async inspectAllocationResources(input) {
      calls.push('inspect:allocation');
      return Object.freeze({
        workspace: createExecutionEffectDockerVolumeObservationV1({
          state: 'ABSENT',
          authorityDigest: input.authorityDigest,
          volumeName: input.workspacePlan.volumeName,
          resourceInstanceDigest: input.workspacePlan.workspaceResourceInstanceDigest,
          observedAt: '2026-09-01T00:00:00.250Z',
        }),
        dependency: createExecutionEffectDockerVolumeObservationV1({
          state: 'ABSENT',
          authorityDigest: input.authorityDigest,
          volumeName: input.workspacePlan.dependencyPlan.volumeName,
          resourceInstanceDigest: input.workspacePlan.dependencyResourceInstanceDigest,
          observedAt: '2026-09-01T00:00:00.250Z',
        }),
      });
    },
    async inspectImage(input) {
      calls.push('inspect:image');
      const observedImageDigest = options.wrongImageDigest
        ? sha('foreign-image') : input.expectedImageDigest;
      return createExecutionEffectDockerImageObservationV1({
        authorityDigest: input.authorityDigest,
        imageReference: options.wrongImageDigest
          ? `foreign-worker@${observedImageDigest}` : input.imageReference,
        imageDigest: observedImageDigest,
        imageIdentityDigest: sha('daemon-image-identity'),
        observedAt: '2026-09-01T00:00:00.500Z',
      });
    },
    async prepareDependencies(input) {
      calls.push('prepare:dependencies');
      if (options.dependencyUnavailable) return null;
      return createExecutionEffectDockerDependencyAuthorityReceiptV1({
        authorityDigest: input.authorityDigest,
        imageObservationReceiptDigest: input.imageObservationReceiptDigest,
        imageIdentityDigest: input.imageIdentityDigest,
        dependencyPlanDigest: input.dependencyPlanDigest,
        labelsDigest: input.labelsDigest,
        resourceInstanceDigest: input.resourceInstanceDigest,
        volumeName: input.dependencyPlan.volumeName,
        volumeIdentityDigest: dependencyVolumeIdentityDigest,
        absenceObservationDigest: sha('dependency-absence'),
        creationReceiptDigest: sha('dependency-create'),
        verifiedInspectDigest: sha('dependency-inspect'),
        populationReceiptDigest: sha('dependency-population'),
        dependencyTreeDigest: sha('dependency-tree'),
        daemonCreatedAt: dependencyDaemonCreatedAt,
        startedAt: '2026-09-01T00:00:00.600Z',
        completedAt: '2026-09-01T00:00:00.900Z',
      });
    },
    async verifyExclusiveAttachments(input) {
      calls.push(`attachments:${input.phase}`);
      if (input.workspacePlan.planDigest !== workspacePlan.planDigest
        || input.workspacePlan.volumeName !== workspacePlan.volumeName
        || input.workspacePlan.workspaceResourceInstanceDigest
          !== workspacePlan.workspaceResourceInstanceDigest
        || input.dependencyAuthority.volumeName !== workspacePlan.dependencyPlan.volumeName
        || input.dependencyAuthority.resourceInstanceDigest
          !== workspacePlan.dependencyResourceInstanceDigest) return null;
      if (options.attachmentUnavailable
        || (options.postAttachmentUnavailable && input.phase === 'POST_PROVIDER_STOP')) return null;
      return createExecutionEffectDockerExclusiveAttachmentReceiptV1({
        phase: input.phase,
        authorityDigest: input.authorityDigest,
        workspaceVolumeName: input.workspaceVolumeName,
        workspaceVolumeIdentityDigest: input.workspaceVolumeIdentityDigest,
        dependencyVolumeName: input.dependencyVolumeName,
        dependencyVolumeIdentityDigest: input.dependencyVolumeIdentityDigest,
        observedAt: input.phase === 'PRE_PROVIDER_START'
          ? '2026-09-01T00:00:07.500Z' : '2026-09-01T00:00:13.000Z',
      });
    },
    async inspectVolume(input) {
      calls.push(`inspect:${input.phase}`);
      if (input.phase === 'EXPECT_ABSENT' && !options.initialPresent) {
        return createExecutionEffectDockerVolumeObservationV1({
          state: 'ABSENT',
          authorityDigest: input.authorityDigest,
          volumeName: input.plan.volumeName,
          resourceInstanceDigest: input.plan.workspaceResourceInstanceDigest,
          observedAt: '2026-09-01T00:00:01.000Z',
        });
      }
      return createExecutionEffectDockerVolumeObservationV1({
        state: 'PRESENT',
        authorityDigest: input.authorityDigest,
        volumeName: input.plan.volumeName,
        driver: 'local',
        scope: 'local',
        labelsDigest: input.plan.workspaceLabelsDigest,
        resourceInstanceDigest: input.plan.workspaceResourceInstanceDigest,
        mountPlanDigest: input.plan.mountPlanDigest,
        volumeIdentityDigest: options.wrongPostCreateIdentity && input.phase === 'VERIFY_CREATED'
          ? executionEffectDockerVolumeIdentityDigestV1({
            volumeName: input.plan.volumeName,
            labelsDigest: input.plan.workspaceLabelsDigest,
            resourceInstanceDigest: input.plan.workspaceResourceInstanceDigest,
            mountPlanDigest: input.plan.mountPlanDigest,
            daemonCreatedAt: '2026-09-01T00:00:01.600Z',
          }) : volumeIdentityDigest,
        daemonCreatedAt: options.wrongPostCreateIdentity && input.phase === 'VERIFY_CREATED'
          ? '2026-09-01T00:00:01.600Z' : daemonCreatedAt,
        observedAt: input.phase === 'EXPECT_ABSENT'
          ? '2026-09-01T00:00:01.000Z' : '2026-09-01T00:00:03.000Z',
      });
    },
    async createVolume(input) {
      calls.push('create');
      return createExecutionEffectDockerVolumeCreationReceiptV1({
        authorityDigest: input.authorityDigest,
        absenceObservationDigest: input.absenceObservationDigest,
        volumeName: input.plan.volumeName,
        labelsDigest: input.plan.workspaceLabelsDigest,
        resourceInstanceDigest: input.plan.workspaceResourceInstanceDigest,
        mountPlanDigest: input.plan.mountPlanDigest,
        volumeIdentityDigest,
        createRequestedAt: '2026-09-01T00:00:01.500Z',
        createCompletedAt: '2026-09-01T00:00:02.000Z',
        daemonCreatedAt,
      });
    },
    async populateWorkspace(input) {
      calls.push('populate');
      const raw = capture('POPULATION_BASELINE', input.authorityDigest, input, 'baseline');
      return Object.freeze({
        populationReceipt: createExecutionEffectDockerPopulationReceiptV1({
          authorityDigest: input.authorityDigest,
          volumeName: input.plan.volumeName,
          volumeIdentityDigest: input.volumeIdentityDigest,
          inventoryDigest: input.plan.inventoryDigest,
          inventoryAdmissionReceiptDigest: input.plan.inventoryAdmissionReceiptDigest,
          dependencyPlanDigest: input.plan.dependencyPlanDigest,
          dependencyAuthorityReceiptDigest: input.dependencyAuthorityReceiptDigest,
          rejectedPathCount: 0,
          rejectedPathsDigest: input.plan.inventoryRejectedPathsDigest,
          captureReceiptDigest: raw.receipt.receiptDigest,
          populatedPathCount: input.plan.inventoryPathCount,
          sourcePreManifestDigest: sha('population-content-manifest'),
          destinationManifestDigest: sha('population-content-manifest'),
          sourcePostManifestDigest: sha('population-content-manifest'),
          manifestEntryCount: input.plan.inventoryPathCount,
          manifestTotalBytes: raw.nativeCapture.totalBytes,
          completedAt: raw.completedAt,
        }),
        capture: raw,
      });
    },
    async captureWorkspace(input) {
      calls.push(`capture:${input.operation}`);
      const raw = capture(
        input.operation,
        input.authorityDigest,
        input,
        input.operation === 'BASELINE_REVALIDATION'
          ? options.revalidationContent ?? 'baseline'
          : input.operation === 'FINAL_QUIESCENCE_SECOND'
            ? options.finalSecondContent ?? options.finalContent ?? 'baseline'
            : options.finalContent ?? 'baseline',
        input.operation.startsWith('FINAL_QUIESCENCE_')
          ? options.finalPath ?? 'package.json' : 'package.json',
      );
      return options.captureProxy ? new Proxy(raw, {}) : raw;
    },
  });
  return Object.freeze({ adapter, calls });
}

function clock(): ExecutionEffectDockerLifecycleClockV1 {
  const values = [
    '2026-09-01T00:00:07.000Z',
    '2026-09-01T00:00:11.000Z',
    '2026-09-01T00:00:16.500Z',
  ];
  return Object.freeze({ nowIso: () => values.shift() ?? '2026-09-01T00:00:30.000Z' });
}

function prepareInput(
  workspacePlan: ExecutionEffectDockerWorkspacePlanV1,
  filesWrite: readonly string[] = [],
  authority: Readonly<{
    attempt: typeof attempt;
    admissionReceiptDigest: Digest;
    custodyPolicyDigest: Digest;
  }> = Object.freeze({
    attempt,
    admissionReceiptDigest: sha('admission'),
    custodyPolicyDigest: sha('policy'),
  }),
): PrepareExecutionEffectDockerWorkspaceV1Input {
  return Object.freeze({
    platform: 'linux',
    attempt: authority.attempt,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    custodyPolicyDigest: authority.custodyPolicyDigest,
    admittedAt,
    filesWrite: Object.freeze([...filesWrite]),
    nativeCapabilityDigest: sha('native-capability'),
    workspacePlan,
    captureLimits: Object.freeze({
      ...EXECUTION_EFFECT_CAPTURE_HARD_LIMITS,
      maxEntries: 100,
      maxFileBytes: 1_024,
      maxTotalBytes: 16_384,
      maxDepth: 16,
      maxPathBytes: 1_024,
      maxNameBytes: 255,
      maxManifestBytes: 1_048_576,
    }),
  });
}

async function prepareExecutionEffectDockerWorkspaceV1(
  input: PrepareExecutionEffectDockerWorkspaceV1Input,
  adapter: ExecutionEffectDockerLifecycleAdapterV1,
  lifecycleClock: ExecutionEffectDockerLifecycleClockV1,
) {
  const allocation = allocateExecutionEffectDockerWorkspaceV1(input);
  if (allocation.state === 'HOLD') return allocation;
  const durable = authorizeDurableExecutionEffectDockerAllocationV1(
    allocation.session,
    Object.freeze({
      readVerifiedAllocatingLifecycleAuthority: () => Object.freeze({
        authority: allocation.lifecycleAuthority,
        artifact: Object.freeze({
          state: 'ALLOCATING' as const,
          artifactKey: 'allocation-authority',
          artifactReceiptDigest: sha('allocation-receipt'),
          contentDigest: sha('allocation-content'),
          byteLength: 1024,
          capturedAt: admittedAt,
          semanticAuthorityDigest: allocation.lifecycleAuthority.authorityDigest,
          durableAuthorityDigest: sha('allocation-durable'),
        }),
      }),
    }),
  );
  if ('state' in durable) return durable;
  return prepareAllocatedExecutionEffectDockerWorkspaceV1(durable, adapter, lifecycleClock);
}

async function readyForLanding(
  options: AdapterOptions = {},
  filesWrite: readonly string[] = [],
  authority?: Parameters<typeof prepareInput>[2],
): Promise<Readonly<{
  result: Extract<CaptureExecutionEffectDockerFinalV1Result, { state: 'READY_FOR_LANDING' }>;
  stopped: ExecutionEffectDockerProviderStoppedReceiptV1;
  calls: string[];
}>> {
  const workspacePlan = plan();
  const fake = fakeAdapter(workspacePlan, options);
  const allocation = allocateExecutionEffectDockerWorkspaceV1(
    prepareInput(workspacePlan, filesWrite, authority),
  );
  expect(allocation.state).toBe('ALLOCATING');
  if (allocation.state !== 'ALLOCATING') throw new Error('allocation failed');
  const durable = authorizeDurableExecutionEffectDockerAllocationV1(
    allocation.session,
    Object.freeze({
      readVerifiedAllocatingLifecycleAuthority: () => Object.freeze({
        authority: allocation.lifecycleAuthority,
        artifact: Object.freeze({
          state: 'ALLOCATING' as const,
          artifactKey: 'allocation-authority',
          artifactReceiptDigest: sha('allocation-receipt'),
          contentDigest: sha('allocation-content'),
          byteLength: 1024,
          capturedAt: admittedAt,
          semanticAuthorityDigest: allocation.lifecycleAuthority.authorityDigest,
          durableAuthorityDigest: sha('allocation-durable'),
        }),
      }),
    }),
  );
  expect(typeof durable).toBe('object');
  if ('state' in durable) throw new Error('durable allocation failed');
  const prepared = await prepareAllocatedExecutionEffectDockerWorkspaceV1(
    durable, fake.adapter, clock(),
  );
  expect(prepared.state, JSON.stringify(prepared)).toBe('PREPARED');
  if (prepared.state !== 'PREPARED') throw new Error('prepare failed');
  const authorized = await authorizeExecutionEffectDockerProviderStartV1(prepared.session);
  expect(authorized.state, JSON.stringify(authorized)).toBe('PROVIDER_START_AUTHORIZED');
  if (authorized.state !== 'PROVIDER_START_AUTHORIZED') throw new Error('authorization failed');
  const stopped = createExecutionEffectDockerProviderStoppedReceiptV1({
    providerStartAuthorityDigest: authorized.providerStartAuthorityDigest,
    containerName: 'deckent-x-attempt-21-1',
    containerIdentityDigest: sha('container'),
    exitCode: 0,
    exitObservationReceiptDigest: sha('exit'),
    stoppedAt: '2026-09-01T00:00:12.000Z',
  });
  const result = await captureExecutionEffectDockerFinalV1(authorized.session, stopped);
  expect(result.state, JSON.stringify(result)).toBe('READY_FOR_LANDING');
  if (result.state !== 'READY_FOR_LANDING') throw new Error('final failed');
  return Object.freeze({ result, stopped, calls: fake.calls });
}

function landingReceipt(
  result: Extract<CaptureExecutionEffectDockerFinalV1Result, { state: 'READY_FOR_LANDING' }>,
): ExecutionEffectLandingReceiptV1 {
  const noChange = result.decision.effects.length === 0;
  const planDigest = noChange
    ? domainDigest('execution-effect-landing-plan-v1', Object.freeze([]))
    : sha('landing-plan');
  const body = Object.freeze({
    version: 1 as const,
    projectId: result.workspaceSnapshot.attempt.projectId,
    taskId: result.workspaceSnapshot.attempt.taskId,
    attemptId: result.workspaceSnapshot.attempt.attemptId,
    generation: result.workspaceSnapshot.attempt.generation,
    attemptDigest: result.workspaceSnapshot.attemptDigest,
    baselineManifestDigest: result.baselineManifest.digest as Digest,
    finalManifestDigest: result.finalManifest.digest as Digest,
    containmentDecisionDigest: result.decision.decisionDigest as Digest,
    planId: 'plan-21',
    planDigest,
  });
  const transaction: ExecutionEffectLandingTransactionRefV1 = Object.freeze({
    ...body,
    transactionDigest: domainDigest('execution-effect-landing-transaction-v1', body),
  });
  return createExecutionEffectLandingReceiptV1({
    state: noChange ? 'COMMITTED_NO_CHANGE' : 'COMMITTED',
    transaction,
    committedJournalDigest: sha('committed-journal'),
    leaseTerminalReceiptDigest: sha('lease-terminal'),
    operationReceiptDigests: noChange ? Object.freeze([]) : Object.freeze([sha('operation')]),
    finalVerificationReceiptDigest: noChange ? null : sha('final-verification'),
  });
}

function releaseEvidence(
  result: Extract<CaptureExecutionEffectDockerFinalV1Result, { state: 'READY_FOR_LANDING' }>,
  stopped: ExecutionEffectDockerProviderStoppedReceiptV1,
  receipt: ExecutionEffectLandingReceiptV1,
) {
  const containerDeleteIntentDigest = sha('container-delete-intent');
  const workspaceDeleteIntentDigest = sha('workspace-delete-intent');
  const dependencyDeleteIntentDigest = sha('dependency-delete-intent');
  const containerDeletion = createExecutionEffectDockerResourceDeletionReceiptV1({
    resourceKind: 'provider-container',
    resourceName: stopped.containerName,
    resourceIdentityDigest: stopped.containerIdentityDigest,
    cleanupAuthorityDigest: receipt.receiptDigest,
    deleteIntentDigest: containerDeleteIntentDigest,
    deletedAt: '2026-09-01T00:00:18.000Z',
  });
  const containerAbsence = createExecutionEffectDockerResourceAbsenceReceiptV1({
    resourceKind: 'provider-container',
    resourceName: stopped.containerName,
    resourceIdentityDigest: stopped.containerIdentityDigest,
    deleteIntentDigest: containerDeleteIntentDigest,
    deletionReceiptDigest: containerDeletion.receiptDigest,
    observedAt: '2026-09-01T00:00:19.000Z',
  });
  const volumeDeletion = createExecutionEffectDockerResourceDeletionReceiptV1({
    resourceKind: 'workspace-volume',
    resourceName: result.workspaceSnapshot.workspaceResource.volumeName,
    resourceIdentityDigest: result.workspaceSnapshot.workspaceResource.volumeIdentityDigest,
    cleanupAuthorityDigest: receipt.receiptDigest,
    deleteIntentDigest: workspaceDeleteIntentDigest,
    deletedAt: '2026-09-01T00:00:20.000Z',
  });
  const volumeAbsence = createExecutionEffectDockerResourceAbsenceReceiptV1({
    resourceKind: 'workspace-volume',
    resourceName: result.workspaceSnapshot.workspaceResource.volumeName,
    resourceIdentityDigest: result.workspaceSnapshot.workspaceResource.volumeIdentityDigest,
    deleteIntentDigest: workspaceDeleteIntentDigest,
    deletionReceiptDigest: volumeDeletion.receiptDigest,
    observedAt: '2026-09-01T00:00:21.000Z',
  });
  const dependencyDeletion = createExecutionEffectDockerResourceDeletionReceiptV1({
    resourceKind: 'dependency-volume',
    resourceName: result.workspacePlan.dependencyPlan.volumeName,
    resourceIdentityDigest: result.workspaceSnapshot.dependencyResource.volumeIdentityDigest,
    cleanupAuthorityDigest: receipt.receiptDigest,
    deleteIntentDigest: dependencyDeleteIntentDigest,
    deletedAt: '2026-09-01T00:00:22.000Z',
  });
  const dependencyAbsence = createExecutionEffectDockerResourceAbsenceReceiptV1({
    resourceKind: 'dependency-volume',
    resourceName: result.workspacePlan.dependencyPlan.volumeName,
    resourceIdentityDigest: result.workspaceSnapshot.dependencyResource.volumeIdentityDigest,
    deleteIntentDigest: dependencyDeleteIntentDigest,
    deletionReceiptDigest: dependencyDeletion.receiptDigest,
    observedAt: '2026-09-01T00:00:23.000Z',
  });
  return Object.freeze({
    landingReceipt: receipt,
    committedAt: '2026-09-01T00:00:17.000Z',
    providerContainerOutcome: Object.freeze({
      disposition: 'EXECUTED_DELETION' as const,
      deletion: containerDeletion,
      absence: containerAbsence,
    }),
    workspaceVolumeOutcome: Object.freeze({
      disposition: 'EXECUTED_DELETION' as const,
      deletion: volumeDeletion,
      absence: volumeAbsence,
    }),
    dependencyVolumeOutcome: Object.freeze({
      disposition: 'EXECUTED_DELETION' as const,
      deletion: dependencyDeletion,
      absence: dependencyAbsence,
    }),
    releasedAt: '2026-09-01T00:00:24.000Z',
  });
}

describe('execution effect Docker lifecycle authority', () => {
  it('preserves raw Docker daemon CreatedAt nanos and offsets as volume identity', () => {
    const workspacePlan = plan();
    const identity = (daemonCreatedAt: string) => executionEffectDockerVolumeIdentityDigestV1({
      volumeName: workspacePlan.volumeName,
      labelsDigest: workspacePlan.workspaceLabelsDigest,
      resourceInstanceDigest: workspacePlan.workspaceResourceInstanceDigest,
      mountPlanDigest: workspacePlan.mountPlanDigest,
      daemonCreatedAt,
    });
    const first = identity('2026-09-01T00:00:01.123456789Z');
    expect(identity('2026-09-01T00:00:01.123456788Z')).not.toBe(first);
    expect(identity('2026-09-01T03:00:01.123456789+03:00')).not.toBe(first);
    expect(identity('2026-09-01T00:00:01Z')).not.toBe(first);
    for (const invalid of [
      '2026-02-30T00:00:00Z',
      '2026-09-01T00:00:01.1234567890Z',
      '2026-09-01T00:00:01+14:01',
      '2026-09-01T00:00:01z',
      '2026-09-01T00:00:01Z\u0000',
      '２０２６-09-01T00:00:01Z',
    ]) expect(() => identity(invalid)).toThrow(/volume identity/u);
  });

  it('requires durable ALLOCATING reread before any adapter effect and rehydrates a fresh token', async () => {
    const workspacePlan = plan();
    const input = prepareInput(workspacePlan);
    const fake = fakeAdapter(workspacePlan);
    const allocation = allocateExecutionEffectDockerWorkspaceV1(input);
    expect(allocation.state).toBe('ALLOCATING');
    expect(fake.calls).toEqual([]);
    if (allocation.state !== 'ALLOCATING') throw new Error('allocation failed');

    const rejected = await prepareAllocatedExecutionEffectDockerWorkspaceV1(
      Object.freeze({}) as never, fake.adapter, clock(),
    );
    expect(rejected).toMatchObject({ state: 'HOLD', code: 'SESSION_INVALID' });
    expect(fake.calls).toEqual([]);

    const artifact = Object.freeze({
      state: 'ALLOCATING' as const,
      artifactKey: 'allocation-authority',
      artifactReceiptDigest: sha('allocation-receipt'),
      contentDigest: sha('allocation-content'),
      byteLength: 1024,
      capturedAt: admittedAt,
      semanticAuthorityDigest: allocation.lifecycleAuthority.authorityDigest,
      durableAuthorityDigest: sha('allocation-durable'),
    });
    const mismatch = await rehydrateExecutionEffectDockerLifecycleV1({
      authority: allocation.lifecycleAuthority,
      adapter: fake.adapter,
      clock: clock(),
      durabilityPort: Object.freeze({
        readVerifiedAllocatingLifecycleAuthority: () => null,
      }),
    });
    expect(mismatch).toMatchObject({ state: 'HOLD', code: 'AUTHORITY_MISMATCH' });
    expect(fake.calls).toEqual(['inspect:allocation']);

    const resumedFake = fakeAdapter(workspacePlan);
    const resumed = await rehydrateExecutionEffectDockerLifecycleV1({
      authority: allocation.lifecycleAuthority,
      adapter: resumedFake.adapter,
      clock: clock(),
      durabilityPort: Object.freeze({
        readVerifiedAllocatingLifecycleAuthority: () => Object.freeze({
          authority: allocation.lifecycleAuthority,
          artifact,
        }),
      }),
    });
    expect(resumed).toMatchObject({
      state: 'REHYDRATED', phase: 'ALLOCATING', disposition: 'RESUME_SAFE',
    });
    if (resumed.state !== 'REHYDRATED' || resumed.phase !== 'ALLOCATING'
      || resumed.disposition !== 'RESUME_SAFE') throw new Error('allocation resume failed');
    const prepared = await prepareAllocatedExecutionEffectDockerWorkspaceV1(
      resumed.session, resumedFake.adapter, clock(),
    );
    expect(prepared.state).toBe('PREPARED');
    expect(resumedFake.calls).toContain('create');
  });

  it('screens sensitive paths without reading or returning their names', () => {
    const result = screenExecutionEffectDockerWorkspaceInventoryV1(Object.freeze([
      'src/index.ts', '.env.production', 'certs/service.pem', '.docker/config.json',
    ]));
    expect(result).toMatchObject({
      state: 'HOLD',
      code: 'SENSITIVE_PATH_DENIED',
      pathCount: 4,
      rejectedPathCount: 3,
    });
    expect(JSON.stringify(result)).not.toContain('.env.production');
    expect(JSON.stringify(result)).not.toContain('service.pem');
    expect(JSON.stringify(result)).not.toContain('.docker/config.json');
    expect(screenExecutionEffectDockerWorkspaceInventoryV1(Object.freeze([
      '.env.example', 'src/credential-parser.ts',
    ])).state).toBe('ADMITTED');
    expect(() => plan(['src/index.ts', '.env.production'])).toThrow(TypeError);
  });

  it('binds image-owned read-only dependencies outside the workspace effect manifest', () => {
    const workspacePlan = plan();
    expect(workspacePlan.dependencyPlan).toEqual({
      sourceAuthority: 'image-owned-read-only-volume',
      imageSource: '/app/node_modules',
      volumeName: `deckent-xd-${'b'.repeat(48)}`,
      populationTarget: '/dependencies',
      providerTarget: '/workspace/node_modules',
      providerAccess: 'read-only',
      networkAccess: 'none',
      manifestScope: 'excluded-mount-overlay',
    });
    expect(workspacePlan.dependencyPlanDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(() => createExecutionEffectDockerWorkspacePlanV1({
      imageReference: 'image:latest', imageDigest: sha('image'),
      volumeName: `deckent-xw-${'b'.repeat(48)}`, labels: { owner: 'deckent' },
      mountPlan: workspacePlan.mountPlan,
      dependencyPlan: { ...workspacePlan.dependencyPlan, providerAccess: 'read-write' } as never,
      inventoryPaths: [],
    })).toThrow(TypeError);
  });

  it('performs exact absence, labeled create, inspect, population, seal and no-change release', async () => {
    const { result, stopped, calls } = await readyForLanding();
    expect(calls).toEqual([
      'inspect:image', 'prepare:dependencies', 'inspect:EXPECT_ABSENT', 'create',
      'inspect:VERIFY_CREATED', 'populate',
      'attachments:PRE_PROVIDER_START', 'capture:BASELINE_REVALIDATION',
      'attachments:POST_PROVIDER_STOP',
      'capture:FINAL_QUIESCENCE_FIRST', 'capture:FINAL_QUIESCENCE_SECOND',
    ]);
    expect(result.decision.effects).toEqual([]);
    expect(result.exclusiveAttachmentReceipt).toMatchObject({
      state: 'QUIESCENT', phase: 'POST_PROVIDER_STOP', attachedContainerCount: 0,
    });
    expect(result.quiescenceSeal).toMatchObject({
      state: 'SEALED',
      secondCaptureReceiptDigest: result.finalCaptureReceipt.receiptDigest,
    });
    const receipt = landingReceipt(result);
    expect(receipt.state).toBe('COMMITTED_NO_CHANGE');
    const released = releaseExecutionEffectDockerWorkspaceV1(
      result.session,
      releaseEvidence(result, stopped, receipt),
    );
    expect(released.state).toBe('RELEASED');
    if (released.state === 'RELEASED') {
      expect(released.workspaceRelease).toMatchObject({
        state: 'RELEASED_AFTER_COMMIT',
        transactionDigest: receipt.transaction.transactionDigest,
        committedJournalDigest: receipt.committedJournalDigest,
      });
      expect(released.dependencyVolumeRelease).toMatchObject({
        state: 'PROJECTED_FROM_WORKSPACE_RELEASE',
        volumeName: result.workspacePlan.dependencyPlan.volumeName,
        dependencyAuthorityReceiptDigest: result.dependencyAuthority.receiptDigest,
        workspaceReleaseReceiptDigest: released.workspaceRelease.receiptDigest,
      });
      const durableReplay = projectExecutionEffectDockerWorkspaceReleaseV1(
        result.lifecycleAuthority,
        releaseEvidence(result, stopped, receipt),
      );
      expect(durableReplay).toEqual(released);
      expect(projectExecutionEffectDockerWorkspaceReleaseV1(
        result.lifecycleAuthority,
        releaseEvidence(result, stopped, receipt),
      )).toEqual(durableReplay);
    }
  });

  it('keeps empty filesWrite as a mandatory read-only policy and rejects null policy input', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan);
    const invalid = { ...prepareInput(workspacePlan), filesWrite: null } as never;
    const result = await prepareExecutionEffectDockerWorkspaceV1(invalid, fake.adapter, clock());
    expect(result).toMatchObject({ state: 'HOLD', code: 'INVALID_INPUT' });
    expect(fake.calls).toEqual([]);
    const accepted = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan, []), fake.adapter, clock(),
    );
    expect(accepted.state).toBe('PREPARED');
    if (accepted.state === 'PREPARED') expect(accepted.baselineManifest.policy.readOnly).toBe(true);
  });

  it('returns typed unsupported before any adapter call on Darwin and Windows', async () => {
    for (const platform of ['darwin', 'win32'] as const) {
      const workspacePlan = plan();
      const fake = fakeAdapter(workspacePlan);
      const result = await prepareExecutionEffectDockerWorkspaceV1(
        { ...prepareInput(workspacePlan), platform }, fake.adapter, clock(),
      );
      expect(result).toMatchObject({ state: 'HOLD', code: 'UNSUPPORTED_PLATFORM' });
      expect(fake.calls).toEqual([]);
    }
  });

  it('maps admitted WSL execution to the explicit wsl2-linux snapshot authority', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan);
    const result = await prepareExecutionEffectDockerWorkspaceV1(
      { ...prepareInput(workspacePlan), platform: 'wsl' }, fake.adapter, clock(),
    );
    expect(result.state).toBe('PREPARED');
    if (result.state === 'PREPARED') expect(result.workspaceSnapshot.platform).toBe('wsl2-linux');
  });

  it('does not create over a pre-existing exact volume', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan, { initialPresent: true });
    const result = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), fake.adapter, clock(),
    );
    expect(result).toMatchObject({ state: 'HOLD', code: 'VOLUME_NOT_ABSENT' });
    expect(fake.calls).toEqual([
      'inspect:image', 'prepare:dependencies', 'inspect:EXPECT_ABSENT',
    ]);
  });

  it('rejects mutable or foreign daemon image identity before volume inspection', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan, { wrongImageDigest: true });
    const result = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), fake.adapter, clock(),
    );
    expect(result).toMatchObject({ state: 'HOLD', code: 'AUTHORITY_MISMATCH' });
    expect(fake.calls).toEqual(['inspect:image']);
  });

  it('fails closed before workspace creation when dependency-volume authority is unavailable', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan, { dependencyUnavailable: true });
    const result = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), fake.adapter, clock(),
    );
    expect(result).toMatchObject({
      state: 'HOLD', code: 'DEPENDENCY_AUTHORITY_UNAVAILABLE',
    });
    expect(fake.calls).toEqual(['inspect:image', 'prepare:dependencies']);
  });

  it('rejects post-create identity drift before trusted population', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan, { wrongPostCreateIdentity: true });
    const result = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), fake.adapter, clock(),
    );
    expect(result).toMatchObject({ state: 'HOLD', code: 'VOLUME_INSPECT_MISMATCH' });
    expect(fake.calls).not.toContain('populate');
  });

  it('requires an exact baseline revalidation before provider start', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan, { revalidationContent: 'mutated' });
    const prepared = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), fake.adapter, clock(),
    );
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const result = await authorizeExecutionEffectDockerProviderStartV1(prepared.session);
    expect(result).toMatchObject({ state: 'HOLD', code: 'CAPTURE_HOLD' });
    expect(await authorizeExecutionEffectDockerProviderStartV1(prepared.session))
      .toMatchObject({ state: 'HOLD', code: 'SESSION_INVALID' });
  });

  it('accepts the same logical baseline reopened in a fresh Linux mount namespace', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan, { revalidationIdentitySalt: 'helper-container-2' });
    const prepared = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), fake.adapter, clock(),
    );
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const result = await authorizeExecutionEffectDockerProviderStartV1(prepared.session);
    expect(result.state).toBe('PROVIDER_START_AUTHORIZED');
  });

  it('accepts final captures of the same volume from fresh Linux mount namespaces', async () => {
    const { result } = await readyForLanding({
      finalContent: 'changed',
      finalFirstIdentitySalt: 'final-helper-container-1',
      finalSecondIdentitySalt: 'final-helper-container-2',
    }, ['package.json']);
    expect(result.decision.effects).toHaveLength(1);
    expect(result.finalManifest.workspaceIdentity.rootHandleEvidenceDigest)
      .toBe(sha('workspace-root:final-helper-container-2'));
  });

  it('requires zero foreign volume attachments before provider authorization', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan, { attachmentUnavailable: true });
    const prepared = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), fake.adapter, clock(),
    );
    if (prepared.state !== 'PREPARED') throw new Error('prepare failed');
    const result = await authorizeExecutionEffectDockerProviderStartV1(prepared.session);
    expect(result).toMatchObject({ state: 'HOLD', code: 'ATTACHMENT_HOLD' });
    expect(fake.calls).not.toContain('capture:BASELINE_REVALIDATION');
  });

  it('requires stopped-provider detachment and two identical final captures', async () => {
    for (const options of [
      { postAttachmentUnavailable: true },
      { finalContent: 'first', finalSecondContent: 'second' },
    ] as const) {
      const workspacePlan = plan();
      const fake = fakeAdapter(workspacePlan, options);
      const prepared = await prepareExecutionEffectDockerWorkspaceV1(
        prepareInput(workspacePlan, ['package.json']), fake.adapter, clock(),
      );
      if (prepared.state !== 'PREPARED') throw new Error('prepare failed');
      const authorized = await authorizeExecutionEffectDockerProviderStartV1(prepared.session);
      if (authorized.state !== 'PROVIDER_START_AUTHORIZED') throw new Error('authorize failed');
      const stopped = createExecutionEffectDockerProviderStoppedReceiptV1({
        providerStartAuthorityDigest: authorized.providerStartAuthorityDigest,
        containerName: 'deckent-x-attempt-21-1',
        containerIdentityDigest: sha('container'), exitCode: 0,
        exitObservationReceiptDigest: sha('exit'), stoppedAt: '2026-09-01T00:00:12.000Z',
      });
      const result = await captureExecutionEffectDockerFinalV1(authorized.session, stopped);
      expect(result).toMatchObject({
        state: 'HOLD',
        code: options.postAttachmentUnavailable ? 'ATTACHMENT_HOLD' : 'QUIESCENCE_HOLD',
      });
    }
  });

  it('rejects proxy capture results and post-call adapter uncertainty', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan, { captureProxy: true });
    const prepared = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), fake.adapter, clock(),
    );
    expect(prepared.state).toBe('PREPARED');
    if (prepared.state !== 'PREPARED') return;
    const result = await authorizeExecutionEffectDockerProviderStartV1(prepared.session);
    expect(result).toMatchObject({ state: 'HOLD', code: 'CAPTURE_HOLD' });
  });

  it('captures stopped-provider hidden effects and quarantines the whole attempt', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan, { finalContent: 'hidden-change' });
    const prepared = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), fake.adapter, clock(),
    );
    if (prepared.state !== 'PREPARED') throw new Error('prepare failed');
    const authorized = await authorizeExecutionEffectDockerProviderStartV1(prepared.session);
    if (authorized.state !== 'PROVIDER_START_AUTHORIZED') throw new Error('authorize failed');
    const stopped = createExecutionEffectDockerProviderStoppedReceiptV1({
      providerStartAuthorityDigest: authorized.providerStartAuthorityDigest,
      containerName: 'deckent-x-attempt-21-1',
      containerIdentityDigest: sha('container'), exitCode: 0,
      exitObservationReceiptDigest: sha('exit'), stoppedAt: '2026-09-01T00:00:12.000Z',
    });
    const result = await captureExecutionEffectDockerFinalV1(authorized.session, stopped);
    expect(result).toMatchObject({ state: 'HOLD', code: 'CONTAINMENT_HOLD' });
    if (result.state === 'HOLD') {
      expect(result.containmentDecision?.state).toBe('HOLD');
    }
  });

  it('allows a declared changed effect and requires COMMITTED rather than no-change', async () => {
    const { result } = await readyForLanding(
      { finalContent: 'changed' },
      ['package.json'],
    );
    expect(result.decision.effects).toHaveLength(1);
    expect(landingReceipt(result).state).toBe('COMMITTED');
  });

  it('rejects foreign stop authority before final capture', async () => {
    const workspacePlan = plan();
    const fake = fakeAdapter(workspacePlan);
    const prepared = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), fake.adapter, clock(),
    );
    if (prepared.state !== 'PREPARED') throw new Error('prepare failed');
    const authorized = await authorizeExecutionEffectDockerProviderStartV1(prepared.session);
    if (authorized.state !== 'PROVIDER_START_AUTHORIZED') throw new Error('authorize failed');
    const foreign = createExecutionEffectDockerProviderStoppedReceiptV1({
      providerStartAuthorityDigest: sha('foreign'), containerName: 'deckent-x-attempt-21-1',
      containerIdentityDigest: sha('container'), exitCode: 0,
      exitObservationReceiptDigest: sha('exit'), stoppedAt: '2026-09-01T00:00:12.000Z',
    });
    const result = await captureExecutionEffectDockerFinalV1(authorized.session, foreign);
    expect(result).toMatchObject({ state: 'HOLD', code: 'AUTHORITY_MISMATCH' });
    expect(fake.calls).not.toContain('capture:FINAL_QUIESCENCE_FIRST');
  });

  it('refuses deletion/absence evidence before a canonical committed landing receipt', async () => {
    const { result, stopped } = await readyForLanding();
    const receipt = landingReceipt(result);
    const evidence = releaseEvidence(result, stopped, receipt);
    const wrongDeletion = createExecutionEffectDockerResourceDeletionReceiptV1({
      resourceKind: evidence.workspaceVolumeOutcome.deletion.resourceKind,
      resourceName: evidence.workspaceVolumeOutcome.deletion.resourceName,
      resourceIdentityDigest: evidence.workspaceVolumeOutcome.deletion.resourceIdentityDigest,
      cleanupAuthorityDigest: sha('foreign-landing'),
      deleteIntentDigest: evidence.workspaceVolumeOutcome.deletion.deleteIntentDigest,
      deletedAt: evidence.workspaceVolumeOutcome.deletion.deletedAt,
    });
    const released = releaseExecutionEffectDockerWorkspaceV1(result.session, {
      ...evidence,
      workspaceVolumeOutcome: {
        ...evidence.workspaceVolumeOutcome,
        deletion: wrongDeletion,
      },
    });
    expect(released).toMatchObject({ state: 'HOLD', code: 'RELEASE_EVIDENCE_INVALID' });
    expect(releaseExecutionEffectDockerWorkspaceV1(result.session, evidence))
      .toMatchObject({ state: 'RELEASED' });
    expect(releaseExecutionEffectDockerWorkspaceV1(result.session, evidence))
      .toMatchObject({ state: 'HOLD', code: 'SESSION_INVALID' });
  });

  it('closes release from intent-bound reconciled absence after a delete receipt crash gap', async () => {
    const { result, stopped } = await readyForLanding();
    const receipt = landingReceipt(result);
    const executed = releaseEvidence(result, stopped, receipt);
    const reconciled = (
      outcome: typeof executed.workspaceVolumeOutcome,
      observedAt: string,
    ) => Object.freeze({
      disposition: 'RECONCILED_ABSENCE' as const,
      absence: createExecutionEffectDockerReconciledAbsenceReceiptV1({
        resourceKind: outcome.deletion.resourceKind,
        resourceName: outcome.deletion.resourceName,
        resourceIdentityDigest: outcome.deletion.resourceIdentityDigest,
        cleanupAuthorityDigest: receipt.receiptDigest,
        deleteIntentDigest: outcome.deletion.deleteIntentDigest,
        observedAt,
      }),
    });
    const released = releaseExecutionEffectDockerWorkspaceV1(result.session, {
      landingReceipt: receipt,
      committedAt: executed.committedAt,
      providerContainerOutcome: reconciled(
        executed.providerContainerOutcome as typeof executed.workspaceVolumeOutcome,
        '2026-09-01T00:00:19.000Z',
      ),
      workspaceVolumeOutcome: reconciled(
        executed.workspaceVolumeOutcome, '2026-09-01T00:00:21.000Z',
      ),
      dependencyVolumeOutcome: reconciled(
        executed.dependencyVolumeOutcome as typeof executed.workspaceVolumeOutcome,
        '2026-09-01T00:00:23.000Z',
      ),
      releasedAt: executed.releasedAt,
    });
    expect(released.state).toBe('RELEASED');
    if (released.state !== 'RELEASED') throw new Error('reconciled release failed');
    expect(released.workspaceRelease.providerContainer).toMatchObject({
      disposition: 'RECONCILED_ABSENCE', deletionReceiptDigest: null,
    });
    expect(released.workspaceRelease.workspaceVolume).toMatchObject({
      disposition: 'RECONCILED_ABSENCE', deletionReceiptDigest: null,
    });
    expect(released.dependencyVolumeRelease).toMatchObject({
      releaseDisposition: 'RECONCILED_ABSENCE', deletionReceiptDigest: null,
    });
  });

  const setupDurableStoreReady = async (artifactKey: string) => {
      const fixture = createTaskResultSettlementV2Fixture({ tailArtifactKey: artifactKey });
      const admission = fixture.store.readAdmission(fixture.identity, fixture.policy);
      if (!admission) throw new Error('fixture admission unavailable');
      const authority = Object.freeze({
        attempt: Object.freeze({
          projectId: fixture.identity.projectId,
          taskId: fixture.identity.taskId,
          attemptId: fixture.identity.attemptId,
          generation: fixture.identity.generation,
        }),
        admissionReceiptDigest: admission.receiptDigest,
        custodyPolicyDigest: fixture.policy.policyDigest,
      });
      const { result } = await readyForLanding({}, [], authority);
      const ready = result.lifecycleAuthority;
      const common = Object.freeze({
        platform: ready.platform,
        attempt: ready.attempt,
        admissionReceiptDigest: ready.admissionReceiptDigest,
        custodyPolicyDigest: ready.custodyPolicyDigest,
        admittedAt: ready.admittedAt,
        writePolicy: ready.writePolicy,
        nativeCapabilityDigest: ready.nativeCapabilityDigest,
        workspacePlan: ready.workspacePlan,
        captureLimits: ready.captureLimits,
        preparationAuthorityDigest: ready.preparationAuthorityDigest,
        imageObservation: ready.imageObservation,
        dependencyAuthority: ready.dependencyAuthority,
        absenceObservation: ready.absenceObservation,
        creationReceipt: ready.creationReceipt,
        presentObservation: ready.presentObservation,
        populationReceipt: ready.populationReceipt,
        baselineManifest: ready.baselineManifest,
        workspaceResource: ready.workspaceResource,
        workspaceSnapshot: ready.workspaceSnapshot,
      });
      const allocating = createExecutionEffectDockerLifecycleAuthorityV1({
        platform: ready.platform,
        attempt: ready.attempt,
        admissionReceiptDigest: ready.admissionReceiptDigest,
        custodyPolicyDigest: ready.custodyPolicyDigest,
        admittedAt: ready.admittedAt,
        writePolicy: ready.writePolicy,
        nativeCapabilityDigest: ready.nativeCapabilityDigest,
        workspacePlan: ready.workspacePlan,
        captureLimits: ready.captureLimits,
        preparationAuthorityDigest: ready.preparationAuthorityDigest,
        state: 'ALLOCATING',
        predecessorAuthorityDigest: null,
      });
      const prepared = createExecutionEffectDockerLifecycleAuthorityV1({
        ...common,
        state: 'PREPARED',
        predecessorAuthorityDigest: allocating.authorityDigest,
      });
      if (prepared.state !== 'PREPARED') throw new Error('prepared lifecycle drift');
      const provider = createExecutionEffectDockerLifecycleAuthorityV1({
        ...common,
        state: 'PROVIDER_START_AUTHORIZED',
        predecessorAuthorityDigest: prepared.authorityDigest,
        preProviderAttachmentReceipt: ready.preProviderAttachmentReceipt,
        baselineRevalidationReceipt: ready.baselineRevalidationReceipt,
        providerStartAuthorityDigest: ready.providerStartAuthorityDigest,
        authorizedAt: ready.authorizedAt,
      });
      const bridgeInput = Object.freeze({
        store: fixture.store,
        identity: fixture.identity,
        policy: fixture.policy,
        admissionReceiptDigest: admission.receiptDigest,
        projectRootIdentityDigest: sha(`${artifactKey}:project-root`),
        platform: ready.platform,
        now: () => '2026-09-01T00:00:30.000Z',
      });
      const bridge = createExecutionEffectStoreAdapterV1(bridgeInput);
      for (const lifecycle of [allocating, prepared, provider, ready]) {
        bridge.publishLifecycleAuthority(lifecycle);
      }
    return Object.freeze({ fixture, bridge, bridgeInput, result, ready });
  };

  it('recovers provider-container compensation from durable Store authority', async () => {
    const compensationSetup = await setupDurableStoreReady('provider-compensation-restart');
    const compensationAuthority = sha('provider-compensation-observation');
    const workspaceObservation = createExecutionEffectDockerVolumeObservationV1({
      state: 'PRESENT', authorityDigest: compensationAuthority,
      volumeName: compensationSetup.ready.workspacePlan.volumeName,
      driver: 'local', scope: 'local',
      labelsDigest: compensationSetup.ready.workspacePlan.workspaceLabelsDigest,
      resourceInstanceDigest:
        compensationSetup.ready.workspacePlan.workspaceResourceInstanceDigest,
      mountPlanDigest: compensationSetup.ready.workspacePlan.mountPlanDigest,
      volumeIdentityDigest: compensationSetup.ready.presentObservation.volumeIdentityDigest,
      daemonCreatedAt: compensationSetup.ready.presentObservation.daemonCreatedAt,
      observedAt: '2026-09-01T00:00:17.000Z',
    });
    const dependencyObservation = createExecutionEffectDockerVolumeObservationV1({
      state: 'PRESENT', authorityDigest: compensationAuthority,
      volumeName: compensationSetup.ready.dependencyAuthority.volumeName,
      driver: 'local', scope: 'local',
      labelsDigest: compensationSetup.ready.workspacePlan.dependencyLabelsDigest,
      resourceInstanceDigest:
        compensationSetup.ready.workspacePlan.dependencyResourceInstanceDigest,
      mountPlanDigest: compensationSetup.ready.workspacePlan.dependencyPlanDigest,
      volumeIdentityDigest: compensationSetup.ready.dependencyAuthority.volumeIdentityDigest,
      daemonCreatedAt: compensationSetup.ready.dependencyAuthority.daemonCreatedAt,
      observedAt: '2026-09-01T00:00:17.000Z',
    });
    let compensation = compensationSetup.bridge.publishCompensationPrepared({
      lifecycleAuthorityDigest: compensationSetup.ready.authorityDigest as Digest,
      workspaceObservation,
      dependencyObservation,
      progressedAt: '2026-09-01T00:00:17.000Z',
    }).progress;
    expect(compensation.resources.map(resource => resource.resourceKind)).toEqual([
      'provider-container', 'workspace-volume', 'dependency-volume',
    ]);
    compensation = compensationSetup.bridge.publishCleanupDeleteIntent({
      mode: 'COMPENSATION',
      resourceKind: 'provider-container',
      progressedAt: '2026-09-01T00:00:18.000Z',
    }).progress;
    const resource = compensation.resources.find(
      entry => entry.resourceKind === 'provider-container',
    )!;
    compensation = compensationSetup.bridge.publishCleanupAbsence({
      mode: 'COMPENSATION',
      evidence: Object.freeze({
        disposition: 'RECONCILED_ABSENCE' as const,
        absence: createExecutionEffectDockerReconciledAbsenceReceiptV1({
          resourceKind: 'provider-container',
          resourceName: resource.resourceName,
          resourceIdentityDigest: resource.resourceIdentityDigest,
          cleanupAuthorityDigest: compensationSetup.ready.authorityDigest,
          deleteIntentDigest: compensation.deleteIntentDigest!,
          observedAt: '2026-09-01T00:00:19.000Z',
        }),
      }),
      progressedAt: '2026-09-01T00:00:19.000Z',
    }).progress;
    expect(compensation.state).toBe('COMPENSATION_CONTAINER_ABSENT');
    const restarted = createExecutionEffectStoreAdapterV1(compensationSetup.bridgeInput);
    expect(restarted.readLatestCompensationProgress()).toEqual(compensation);
    expect(() => restarted.readAcceptedAuthority('compensated-not-accepted'))
      .toThrow(/Verified execution effect landing authority is unavailable/u);
  }, 60_000);

  describe.sequential('durable release projection crash recovery', () => {
    let releaseSetup: Awaited<ReturnType<typeof setupDurableStoreReady>>;

    beforeAll(async () => {
      releaseSetup = await setupDurableStoreReady('release-projection-crash');
    }, 60_000);

    it('replays the same projection after a crash before landing publication', () => {
    const receipt = landingReceipt(releaseSetup.result);
    const transactionHex = receipt.transaction.transactionDigest.slice(7);
    const preparedJournalDigest = sha('release-projection-prepared-journal');
    const journalRef = (
      phase: 'PREPARED' | 'COMMITTED', recordDigest: Digest,
    ) => Object.freeze({
      phase,
      artifactKey: `effect-landing/${transactionHex}/${phase.toLowerCase()}.json`,
      artifactReceiptDigest: sha(`release-projection-${phase}-artifact`),
      contentDigest: sha(`release-projection-${phase}-content`),
      byteLength: 128,
      recordDigest,
    });
    const resumeContext = createExecutionEffectLandingLeaseResumeContextV1({
      transaction: receipt.transaction,
      priorLease: Object.freeze({
        transactionDigest: receipt.transaction.transactionDigest,
        fencingTokenDigest: sha('release-projection-fence'),
        leaseReceiptDigest: sha('release-projection-lease'),
      }),
      prepared: journalRef('PREPARED', preparedJournalDigest),
      applying: null,
      committed: Object.freeze({
        journal: journalRef('COMMITTED', receipt.committedJournalDigest as Digest),
        disposition: receipt.state,
      }),
    });
    releaseSetup.bridge.publishLandingRecoveryAnchor({
      readyLifecycleAuthorityDigest: releaseSetup.ready.authorityDigest as Digest,
      transactionDigest: receipt.transaction.transactionDigest as Digest,
      resumeContext,
      publishedAt: '2026-09-01T00:00:17.000Z',
    });
    const immutableRef = (label: string) => Object.freeze({
      artifactKey: `release-projection-${label}`,
      artifactReceiptDigest: sha(`release-projection-${label}-receipt`),
      contentDigest: sha(`release-projection-${label}-content`),
      byteLength: 128,
    });
    const terminalSeal = createExecutionEffectLandingTerminalSealV1({
      attempt: releaseSetup.ready.workspaceSnapshot.attempt,
      attemptDigest: releaseSetup.ready.workspaceSnapshot.attemptDigest as Digest,
      disposition: receipt.state,
      workspaceSnapshotSealDigest: releaseSetup.ready.workspaceSnapshot.sealDigest as Digest,
      baselineManifestDigest: releaseSetup.ready.baselineManifest.digest as Digest,
      finalManifestDigest: releaseSetup.ready.finalManifest.digest as Digest,
      effectDecisionDigest: releaseSetup.ready.decision.decisionDigest as Digest,
      planId: receipt.transaction.planId,
      operations: Object.freeze([]),
      preparedJournalDigest,
      applyingJournalDigest: null,
      stepJournalDigests: Object.freeze([]),
      committedJournalDigest: receipt.committedJournalDigest,
      finalVerificationReceiptDigest: null,
      journalArtifacts: Object.freeze({
        prepared: immutableRef('prepared-journal'),
        applying: null,
        steps: Object.freeze([]),
        committed: immutableRef('committed-journal'),
      }),
      receiptArtifacts: Object.freeze({
        nativeReceipts: Object.freeze([]),
        finalVerificationReceipt: null,
        leaseTerminalReceipt: immutableRef('lease-terminal'),
      }),
      leaseTerminal: 'RELEASED_NO_CHANGE',
      leaseTerminalReceiptDigest: receipt.leaseTerminalReceiptDigest,
      committedAt: '2026-09-01T00:00:17.000Z',
    });
    let release = releaseSetup.bridge.publishReleasePrepared({
      lifecycleAuthorityDigest: releaseSetup.ready.authorityDigest as Digest,
      landingReceipt: receipt,
      terminalSeal,
      progressedAt: '2026-09-01T00:00:17.000Z',
    }).progress;
    const releaseResources = [
      ['provider-container', '2026-09-01T00:00:18.000Z', '2026-09-01T00:00:19.000Z'],
      ['workspace-volume', '2026-09-01T00:00:20.000Z', '2026-09-01T00:00:21.000Z'],
      ['dependency-volume', '2026-09-01T00:00:22.000Z', '2026-09-01T00:00:23.000Z'],
    ] as const;
    const releaseOutcomes: Array<Readonly<{
      disposition: 'RECONCILED_ABSENCE';
      absence: ReturnType<typeof createExecutionEffectDockerReconciledAbsenceReceiptV1>;
    }>> = [];
    for (const [resourceKind, intentAt, absentAt] of releaseResources) {
      release = releaseSetup.bridge.publishCleanupDeleteIntent({
        mode: 'RELEASE', resourceKind, progressedAt: intentAt,
      }).progress;
      const resource = release.resources.find(entry => entry.resourceKind === resourceKind)!;
      const outcome = Object.freeze({
        disposition: 'RECONCILED_ABSENCE' as const,
        absence: createExecutionEffectDockerReconciledAbsenceReceiptV1({
          resourceKind,
          resourceName: resource.resourceName,
          resourceIdentityDigest: resource.resourceIdentityDigest,
          cleanupAuthorityDigest: receipt.receiptDigest,
          deleteIntentDigest: release.deleteIntentDigest!,
          observedAt: absentAt,
        }),
      });
      releaseOutcomes.push(outcome);
      release = releaseSetup.bridge.publishCleanupAbsence({
        mode: 'RELEASE',
        evidence: outcome,
        progressedAt: absentAt,
      }).progress;
    }
    release = releaseSetup.bridge.publishCleanupTerminal({
      mode: 'RELEASE', progressedAt: '2026-09-01T00:00:24.000Z',
    }).progress;
    expect(release.state).toBe('RELEASED');
    const projectedBeforeCrash = projectExecutionEffectDockerWorkspaceReleaseV1(
      releaseSetup.ready,
      Object.freeze({
        landingReceipt: receipt,
        committedAt: '2026-09-01T00:00:17.000Z',
        providerContainerOutcome: releaseOutcomes[0]!,
        workspaceVolumeOutcome: releaseOutcomes[1]!,
        dependencyVolumeOutcome: releaseOutcomes[2]!,
        releasedAt: '2026-09-01T00:00:24.000Z',
      }),
    );
    expect(projectedBeforeCrash.state).toBe('RELEASED');
    const restarted = createExecutionEffectStoreAdapterV1(releaseSetup.bridgeInput);
      expect(restarted.projectWorkspaceReleaseFromDurableCleanup()).toEqual(projectedBeforeCrash);
    }, 60_000);
  });

  it('cannot release when dependency-volume deletion or absence evidence is missing', async () => {
    const { result, stopped } = await readyForLanding();
    const receipt = landingReceipt(result);
    const evidence = releaseEvidence(result, stopped, receipt);
    const incomplete = {
      ...evidence,
      dependencyVolumeOutcome: {
        disposition: 'EXECUTED_DELETION',
        deletion: evidence.dependencyVolumeOutcome.deletion,
      },
    };
    expect(releaseExecutionEffectDockerWorkspaceV1(result.session, incomplete as never))
      .toMatchObject({ state: 'HOLD', code: 'RELEASE_EVIDENCE_INVALID' });
  });

  it('rejects accessor adapter methods before any lifecycle effect', async () => {
    const workspacePlan = plan();
    const valid = fakeAdapter(workspacePlan);
    const adapter = Object.create(null) as ExecutionEffectDockerLifecycleAdapterV1;
    Object.defineProperty(adapter, 'inspectImage', { enumerable: true, value: valid.adapter.inspectImage });
    Object.defineProperty(adapter, 'prepareDependencies', { enumerable: true, value: valid.adapter.prepareDependencies });
    Object.defineProperty(adapter, 'verifyExclusiveAttachments', {
      enumerable: true, value: valid.adapter.verifyExclusiveAttachments,
    });
    Object.defineProperty(adapter, 'inspectVolume', { enumerable: true, get: () => valid.adapter.inspectVolume });
    Object.defineProperty(adapter, 'createVolume', { enumerable: true, value: valid.adapter.createVolume });
    Object.defineProperty(adapter, 'populateWorkspace', { enumerable: true, value: valid.adapter.populateWorkspace });
    Object.defineProperty(adapter, 'captureWorkspace', { enumerable: true, value: valid.adapter.captureWorkspace });
    const result = await prepareExecutionEffectDockerWorkspaceV1(
      prepareInput(workspacePlan), adapter, clock(),
    );
    expect(result).toMatchObject({ state: 'HOLD', code: 'ADAPTER_UNAVAILABLE' });
    expect(valid.calls).toEqual([]);
  });

  it('does not accept forged or reused opaque lifecycle sessions', async () => {
    expect(await authorizeExecutionEffectDockerProviderStartV1(
      Object.freeze({}) as never,
    )).toMatchObject({ state: 'HOLD', code: 'SESSION_INVALID' });
    expect(await captureExecutionEffectDockerFinalV1(
      Object.freeze({}) as AuthorizedExecutionEffectDockerProviderV1,
      Object.freeze({}) as never,
    )).toMatchObject({ state: 'HOLD', code: 'SESSION_INVALID' });
  });
});
