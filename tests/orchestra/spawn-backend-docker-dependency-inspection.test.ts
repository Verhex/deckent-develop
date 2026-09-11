import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../src/core/audit-writer.js';
import { loadExecAuthorityNative } from '../../src/core/exec-authority-native.js';
import {
  createExecutionEffectManifestFromNativeCaptureV1,
  executionEffectNativeCaptureManifestDigestV1,
  EXECUTION_EFFECT_CAPTURE_HARD_LIMITS,
} from '../../src/core/execution-effect-containment.js';
import type { ExecutionEffectPersistenceDigest as Digest } from '../../src/core/execution-effect-persistence-contract.js';
import {
  allocateExecutionEffectDockerWorkspaceV1,
  authorizeDurableExecutionEffectDockerAllocationV1,
  authorizeExecutionEffectDockerProviderStartV1,
  createExecutionEffectDockerDependencyAuthorityReceiptV1,
  createExecutionEffectDockerExclusiveAttachmentReceiptV1,
  createExecutionEffectDockerImageObservationV1,
  createExecutionEffectDockerLifecycleCaptureReceiptV1,
  createExecutionEffectDockerPopulationReceiptV1,
  createExecutionEffectDockerVolumeCreationReceiptV1,
  createExecutionEffectDockerVolumeObservationV1,
  createExecutionEffectDockerWorkspacePlanV1,
  executionEffectDockerManifestStateDigestV1,
  executionEffectDockerVolumeIdentityDigestV1,
  executionEffectDockerWorkspaceDirectoryIdentityDigestV1,
  prepareAllocatedExecutionEffectDockerWorkspaceV1,
  rehydrateExecutionEffectDockerLifecycleV1,
  type ExecutionEffectDockerLifecycleAdapterV1,
  type ExecutionEffectDockerWorkspacePlanV1,
} from '../../src/orchestra/execution-effect-docker-lifecycle.js';
import {
  DockerSpawnBackend,
  createExactDockerEffectClockV1,
  createExactDockerEffectLifecycleAdapterV1,
  parseExactDockerWorkspaceInventory,
  type ExactDockerWorkspaceCommandInputV1,
  type ExactDockerWorkspaceCommandResultV1,
} from '../../src/orchestra/spawn-backend-docker.js';

// These are hermetic Docker command observations, not runtime custody or a release proof.
const sha = (value: string): Digest => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const domainDigest = (domain: string, value: unknown): Digest =>
  `sha256:${createHash('sha256').update(domain).update('\0').update(canonicalJson(value)).digest('hex')}`;
const at = (seconds: number): string => new Date(Date.UTC(2026, 8, 1) + seconds * 1000).toISOString();
const attempt = Object.freeze({ projectId: 'dependency-project', taskId: 'dependency-task', attemptId: 'dependency-attempt', generation: 1 });
const imageDigest = sha('dependency-image');
const imageReference = `deckent-worker@${imageDigest}`;
const imageId = sha('dependency-image-id');
const imageIdentityDigest = domainDigest('execution-effect-docker-image-identity-v1', {
  id: imageId, repoDigests: [imageReference], architecture: 'amd64', os: 'linux',
});
const imageAuthority = Object.freeze({ imageReference, imageDigest, imageIdentityDigest });
const dependencyCreatedAt = '2026-09-01T00:00:00.700000001Z';
const workspaceCreatedAt = at(1.5);

function workspacePlan(): ExecutionEffectDockerWorkspacePlanV1 {
  return createExecutionEffectDockerWorkspacePlanV1({
    imageReference, imageDigest, volumeName: `deckent-xw-${'a'.repeat(48)}`,
    baseLabels: { 'deckent.attempt': attempt.attemptId, 'deckent.authority': sha('authority') },
    workspaceResourceInstanceNonce: 'c'.repeat(64), dependencyResourceInstanceNonce: 'd'.repeat(64),
    mountPlan: { type: 'volume', providerTarget: '/workspace', providerAccess: 'read-write', helperTarget: '/workspace', helperAccess: 'read-only' },
    dependencyPlan: {
      sourceAuthority: 'image-owned-read-only-volume', imageSource: '/app/node_modules',
      volumeName: `deckent-xd-${'b'.repeat(48)}`, populationTarget: '/dependencies',
      providerTarget: '/workspace/node_modules', providerAccess: 'read-only', networkAccess: 'none', manifestScope: 'excluded-mount-overlay',
    },
    inventoryPaths: ['package.json'],
  });
}

function volumeIdentity(plan: ExecutionEffectDockerWorkspacePlanV1, dependency: boolean): Digest {
  return executionEffectDockerVolumeIdentityDigestV1({
    volumeName: dependency ? plan.dependencyPlan.volumeName : plan.volumeName,
    labelsDigest: dependency ? plan.dependencyLabelsDigest : plan.workspaceLabelsDigest,
    resourceInstanceDigest: dependency ? plan.dependencyResourceInstanceDigest : plan.workspaceResourceInstanceDigest,
    mountPlanDigest: dependency ? plan.dependencyPlanDigest : plan.mountPlanDigest,
    daemonCreatedAt: dependency ? dependencyCreatedAt : workspaceCreatedAt,
  });
}

function dependencyReceipt(plan: ExecutionEffectDockerWorkspacePlanV1, authorityDigest = sha('dependency-preparation'), imageReceiptDigest = sha('image-receipt')) {
  return createExecutionEffectDockerDependencyAuthorityReceiptV1({
    authorityDigest, imageObservationReceiptDigest: imageReceiptDigest, imageIdentityDigest,
    dependencyPlanDigest: plan.dependencyPlanDigest, labelsDigest: plan.dependencyLabelsDigest,
    resourceInstanceDigest: plan.dependencyResourceInstanceDigest, volumeName: plan.dependencyPlan.volumeName,
    volumeIdentityDigest: volumeIdentity(plan, true), absenceObservationDigest: sha('absence'),
    creationReceiptDigest: sha('create'), verifiedInspectDigest: sha('inspect'),
    populationReceiptDigest: sha('population'), dependencyTreeDigest: sha('tree'),
    daemonCreatedAt: dependencyCreatedAt, startedAt: at(0.6), completedAt: at(0.9),
  });
}

function commandResult(value: unknown): ExactDockerWorkspaceCommandResultV1 {
  return { status: 0, signal: null, stdout: Buffer.from(JSON.stringify(value)), stderr: Buffer.alloc(0), error: false, overflow: false };
}

function productionFixture(projectRoot: string) {
  const plan = workspacePlan();
  const volume = (dependency: boolean) => ({
    Name: dependency ? plan.dependencyPlan.volumeName : plan.volumeName,
    Driver: 'local', Scope: 'local', Labels: dependency ? plan.dependencyLabels : plan.workspaceLabels,
    Options: {}, Mountpoint: `/var/lib/docker/volumes/${dependency ? plan.dependencyPlan.volumeName : plan.volumeName}/_data`,
    CreatedAt: dependency ? dependencyCreatedAt : workspaceCreatedAt,
  });
  const dependencyVolume = volume(true);
  let dependencyResult = commandResult([dependencyVolume]);
  const runner = vi.fn(async (input: ExactDockerWorkspaceCommandInputV1): Promise<ExactDockerWorkspaceCommandResultV1> => {
    if (input.command !== 'docker') throw new Error('Unexpected command in read-only fixture');
    if (input.args.join('\0') === ['image', 'inspect', imageReference].join('\0')) {
      return commandResult([{ Id: imageId, RepoDigests: [imageReference], Os: 'linux', Architecture: 'amd64' }]);
    }
    if (input.args.join('\0') === ['volume', 'inspect', plan.dependencyPlan.volumeName].join('\0')) return dependencyResult;
    if (input.args.join('\0') === ['volume', 'inspect', plan.volumeName].join('\0')) return commandResult([volume(false)]);
    throw new Error('Mutation or unexpected resource in read-only fixture');
  });
  const inventory = parseExactDockerWorkspaceInventory(Buffer.from('package.json\0'));
  if (!inventory) throw new Error('Invalid fixture inventory');
  const adapter = createExactDockerEffectLifecycleAdapterV1({
    canonicalProjectRoot: projectRoot, imageAuthority, inventory, workspaceOwnerUid: 1000,
    workspaceOwnerGid: 1000, runner, nowIso: () => at(30),
  });
  return {
    plan, adapter, runner, dependencyVolume,
    authority: { authorityDigest: sha('restart-observation'), workspacePlan: plan, dependencyAuthority: dependencyReceipt(plan) },
    setDependencyResult(value: ExactDockerWorkspaceCommandResultV1) { dependencyResult = value; },
  };
}

// Build a valid retained provider-start authority through the actual lifecycle reducers.
// Preparation I/O is synthetic; restart inspection below uses the unmodified production adapter.
async function retainedProviderAuthority(plan: ExecutionEffectDockerWorkspacePlanV1) {
  const workspaceVolumeIdentity = volumeIdentity(plan, false);
  type CaptureInput = Pick<Parameters<ExecutionEffectDockerLifecycleAdapterV1['captureWorkspace']>[0],
    'platform' | 'attempt' | 'writePolicy' | 'captureLimits' | 'authorityDigest'> & {
      readonly operation: 'POPULATION_BASELINE' | 'BASELINE_REVALIDATION' | 'FINAL_QUIESCENCE_FIRST' | 'FINAL_QUIESCENCE_SECOND';
    };
  const capture = (input: CaptureInput) => {
    const rootEntry = { schemaVersion: 1 as const, path: '.', kind: 'DIRECTORY' as const, mode: '0755', size: null, objectIdentityDigest: sha('root'), contentDigest: null };
    const entry = { schemaVersion: 1 as const, path: 'package.json', kind: 'REGULAR_FILE' as const, mode: '0644', size: '2', objectIdentityDigest: sha('file'), contentDigest: sha('{}') };
    const body = { entries: [entry], entryCount: 1, totalBytes: 2 };
    const nativeCapture = { schemaVersion: 1 as const, kind: 'execution-effect-manifest' as const, state: 'CAPTURED' as const, ...body, manifestDigest: executionEffectNativeCaptureManifestDigestV1(body) };
    const workspaceIdentity = { filesystemId: workspaceVolumeIdentity, directoryId: executionEffectDockerWorkspaceDirectoryIdentityDigestV1({ volumeIdentityDigest: workspaceVolumeIdentity }), rootHandleEvidenceDigest: rootEntry.objectIdentityDigest };
    const offset = input.operation === 'POPULATION_BASELINE' ? 0 : 4;
    const times = { startedAt: at(4 + offset), completedAt: at(5 + offset), deadlineAt: at(6 + offset) };
    const manifest = createExecutionEffectManifestFromNativeCaptureV1({ phase: 'baseline', attempt, filesWrite: input.writePolicy.filesWrite, platform: input.platform, workspaceIdentity, rootEntry, nativeCapture, ...times, limits: input.captureLimits });
    if (!manifest.ok) throw new Error('Invalid fixture capture');
    return {
      workspaceIdentity, rootEntry, nativeCapture, ...times,
      receipt: createExecutionEffectDockerLifecycleCaptureReceiptV1({
        operation: input.operation, authorityDigest: input.authorityDigest, phase: 'baseline',
        volumeName: plan.volumeName, volumeIdentityDigest: workspaceVolumeIdentity, workspaceIdentity,
        nativeManifestDigest: nativeCapture.manifestDigest as Digest,
        manifestStateDigest: executionEffectDockerManifestStateDigestV1(manifest.manifest),
        rootObjectIdentityDigest: rootEntry.objectIdentityDigest, entryCount: 1, totalBytes: 2, ...times,
      }),
    };
  };
  const adapter: ExecutionEffectDockerLifecycleAdapterV1 = {
    async inspectImage(input) { return createExecutionEffectDockerImageObservationV1({ authorityDigest: input.authorityDigest, ...imageAuthority, observedAt: at(0.5) }); },
    async prepareDependencies(input) { return dependencyReceipt(plan, input.authorityDigest, input.imageObservationReceiptDigest); },
    async inspectVolume(input) {
      if (input.phase === 'EXPECT_ABSENT') return createExecutionEffectDockerVolumeObservationV1({ state: 'ABSENT', authorityDigest: input.authorityDigest, volumeName: plan.volumeName, resourceInstanceDigest: plan.workspaceResourceInstanceDigest, observedAt: at(1) });
      return createExecutionEffectDockerVolumeObservationV1({ state: 'PRESENT', authorityDigest: input.authorityDigest, volumeName: plan.volumeName, driver: 'local', scope: 'local', labelsDigest: plan.workspaceLabelsDigest, resourceInstanceDigest: plan.workspaceResourceInstanceDigest, mountPlanDigest: plan.mountPlanDigest, volumeIdentityDigest: workspaceVolumeIdentity, daemonCreatedAt: workspaceCreatedAt, observedAt: at(3) });
    },
    async createVolume(input) {
      return createExecutionEffectDockerVolumeCreationReceiptV1({ authorityDigest: input.authorityDigest, absenceObservationDigest: input.absenceObservationDigest, volumeName: plan.volumeName, labelsDigest: plan.workspaceLabelsDigest, resourceInstanceDigest: plan.workspaceResourceInstanceDigest, mountPlanDigest: plan.mountPlanDigest, volumeIdentityDigest: workspaceVolumeIdentity, createRequestedAt: at(1.5), createCompletedAt: at(2), daemonCreatedAt: workspaceCreatedAt });
    },
    async populateWorkspace(input) {
      const raw = capture({ ...input, operation: 'POPULATION_BASELINE' });
      return { capture: raw, populationReceipt: createExecutionEffectDockerPopulationReceiptV1({
        authorityDigest: input.authorityDigest, volumeName: plan.volumeName, volumeIdentityDigest: workspaceVolumeIdentity,
        inventoryDigest: plan.inventoryDigest, inventoryAdmissionReceiptDigest: plan.inventoryAdmissionReceiptDigest,
        dependencyPlanDigest: plan.dependencyPlanDigest, dependencyAuthorityReceiptDigest: input.dependencyAuthorityReceiptDigest,
        rejectedPathCount: 0, rejectedPathsDigest: plan.inventoryRejectedPathsDigest,
        captureReceiptDigest: raw.receipt.receiptDigest, populatedPathCount: 1,
        sourcePreManifestDigest: sha('content-manifest'), destinationManifestDigest: sha('content-manifest'), sourcePostManifestDigest: sha('content-manifest'),
        manifestEntryCount: 1, manifestTotalBytes: 2, completedAt: raw.completedAt,
      }) };
    },
    async verifyExclusiveAttachments(input) {
      return createExecutionEffectDockerExclusiveAttachmentReceiptV1({ phase: input.phase, authorityDigest: input.authorityDigest, workspaceVolumeName: plan.volumeName, workspaceVolumeIdentityDigest: workspaceVolumeIdentity, dependencyVolumeName: plan.dependencyPlan.volumeName, dependencyVolumeIdentityDigest: volumeIdentity(plan, true), observedAt: at(7.5) });
    },
    async captureWorkspace(input) { return capture(input); },
  };
  const allocation = allocateExecutionEffectDockerWorkspaceV1({ platform: 'linux', attempt, admissionReceiptDigest: sha('admission'), custodyPolicyDigest: sha('policy'), admittedAt: at(0), filesWrite: ['package.json'], nativeCapabilityDigest: sha('native'), workspacePlan: plan, captureLimits: EXECUTION_EFFECT_CAPTURE_HARD_LIMITS });
  if (allocation.state !== 'ALLOCATING') throw new Error(`Fixture allocation ${allocation.code}`);
  const durable = authorizeDurableExecutionEffectDockerAllocationV1(allocation.session, {
    readVerifiedAllocatingLifecycleAuthority: () => ({
      authority: allocation.lifecycleAuthority,
      artifact: { state: 'ALLOCATING', artifactKey: 'allocation', artifactReceiptDigest: sha('artifact'), contentDigest: sha('content'), byteLength: 1024, capturedAt: at(0), semanticAuthorityDigest: allocation.lifecycleAuthority.authorityDigest, durableAuthorityDigest: sha('durable') },
    }),
  });
  if ('state' in durable) throw new Error(`Fixture durable allocation ${durable.code}`);
  const times = [at(7), at(11)];
  const prepared = await prepareAllocatedExecutionEffectDockerWorkspaceV1(durable, adapter, { nowIso: () => times.shift() ?? at(30) });
  if (prepared.state !== 'PREPARED') throw new Error(`Fixture preparation ${prepared.code}`);
  const authorized = await authorizeExecutionEffectDockerProviderStartV1(prepared.session);
  if (authorized.state !== 'PROVIDER_START_AUTHORIZED') throw new Error(`Fixture provider authorization ${authorized.code}`);
  return authorized.lifecycleAuthority;
}

describe('production Docker dependency-volume restart inspection', () => {
  let temporaryRoot: string;
  let projectRoot: string;
  beforeEach(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), 'deckent-dependency-inspect-'));
    projectRoot = realpathSync(temporaryRoot);
  });
  afterEach(() => { rmSync(temporaryRoot, { recursive: true, force: true }); });

  it('samples fresh milliseconds after a 90-second provider turn without an intervening ISO read', () => {
    const initialMs = Date.parse(at(0));
    let currentMs = initialMs;
    const sample = vi.fn(() => new Date(currentMs).toISOString());
    const clock = createExactDockerEffectClockV1(sample);
    const configuredSourceTimeoutMs = 60_000;
    expect(clock.nowUnixMs()).toBe(initialMs);
    sample.mockClear();
    currentMs += 90_000;
    const deadlineMs = clock.nowUnixMs() + configuredSourceTimeoutMs;
    expect(sample).toHaveBeenCalledTimes(1);
    expect(deadlineMs).toBe(currentMs + 60_000);
    expect(initialMs + configuredSourceTimeoutMs).toBeLessThan(currentMs);
    expect(deadlineMs - currentMs).toBe(configuredSourceTimeoutMs);
  });

  it('refreshes on successive source-read boundaries rather than only the first post-provider read', () => {
    let currentMs = Date.parse(at(0));
    const clock = createExactDockerEffectClockV1(() => new Date(currentMs).toISOString());
    const configuredSourceTimeoutMs = 60_000;
    currentMs += 90_000;
    const firstDeadline = clock.nowUnixMs() + configuredSourceTimeoutMs;
    currentMs += 125_000;
    const secondDeadline = clock.nowUnixMs() + configuredSourceTimeoutMs;
    expect(secondDeadline - firstDeadline).toBe(125_000);
    expect(secondDeadline - currentMs).toBe(60_000);
    expect(clock.nowIso()).toBe(new Date(currentMs).toISOString());
  });

  it.each(['dispatchExactDockerCustody', 'rehydrateExactDockerEffectLaunch'])('wires the same fresh clock into production %s', (methodName) => {
    const method: unknown = Reflect.get(DockerSpawnBackend.prototype, methodName);
    expect(method).toBeTypeOf('function');
    const source = String(method);
    expect(source).toContain('createExactDockerEffectClockV1');
    expect(source).not.toContain('return clockMs');
    const sourceTimeoutLiteral = /sourceReadTimeoutMs:\s*([\d_eE.+-]+)/.exec(source)?.[1];
    expect(Number(sourceTimeoutLiteral?.replaceAll('_', ''))).toBe(60_000);
  });

  it('proves native read-only access rejects the old deadline while the fresh 60-second deadline reads the same file', context => {
    const native = loadExecAuthorityNative();
    if (!native.available || 'available' in native.effect) {
      context.skip();
      return;
    }
    const effect = native.effect;
    const filename = 'clock-canary.txt';
    const bytes = Buffer.from('clock-proof');
    writeFileSync(join(temporaryRoot, filename), bytes, { mode: 0o600, flag: 'wx' });
    const cachedMs = Date.now() - 90_000;
    const configuredSourceTimeoutMs = 60_000;
    const request = {
      path: filename, expectedMode: 0o600, expectedSize: bytes.byteLength,
      expectedContentDigest: sha('clock-proof'), maxChunkBytes: 1024,
    };
    const root = effect.openRoot('WORKSPACE', projectRoot);
    let source: ReturnType<typeof effect.beginSourceRead> | undefined;
    try {
      let rejectedCode: unknown;
      try {
        source = effect.beginSourceRead(root.handle, { ...request, deadlineUnixMs: cachedMs + configuredSourceTimeoutMs });
      } catch (error) {
        rejectedCode = error && typeof error === 'object' ? Reflect.get(error, 'code') : null;
      }
      expect(rejectedCode).toBe('E_EXEC_AUTH_EFFECT_DEADLINE');
      expect(source).toBeUndefined();
      const clock = createExactDockerEffectClockV1(() => new Date().toISOString());
      const freshMs = clock.nowUnixMs();
      const deadlineUnixMs = freshMs + configuredSourceTimeoutMs;
      expect(deadlineUnixMs - freshMs).toBe(60_000);
      source = effect.beginSourceRead(root.handle, { ...request, deadlineUnixMs });
      const chunk = effect.nextSourceChunk(source.handle, 'ACTIVE');
      expect(Buffer.from(chunk.bytes)).toEqual(bytes);
      const verified = effect.finishSourceRead(source.handle);
      expect(verified.contentDigest).toBe(request.expectedContentDigest);
      expect(verified.observedBytes).toBe(bytes.byteLength);
    } finally {
      if (source) effect.closeHandle(source.handle);
      effect.closeHandle(root.handle);
    }
  });

  it('provides the restart method and emits only a verified exact-generation observation', async () => {
    const fixture = productionFixture(projectRoot);
    expect(fixture.adapter.inspectDependencyVolume).toBeTypeOf('function');
    const observation = await fixture.adapter.inspectDependencyVolume!(fixture.authority);
    expect(observation).toMatchObject({ state: 'PRESENT', authorityDigest: fixture.authority.authorityDigest, volumeName: fixture.plan.dependencyPlan.volumeName, volumeIdentityDigest: fixture.authority.dependencyAuthority.volumeIdentityDigest, daemonCreatedAt: dependencyCreatedAt, observedAt: at(30) });
    expect(fixture.runner).toHaveBeenCalledTimes(1);
    expect(fixture.runner.mock.calls[0]?.[0]).toMatchObject({ command: 'docker', args: ['volume', 'inspect', fixture.plan.dependencyPlan.volumeName], timeoutMs: 10_000, stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024 });
  });

  it.each(['labels', 'recreated', 'bind-alias', 'malformed', 'daemon-error'] as const)('fails closed for %s without provider or mutation commands', async (fault) => {
    const fixture = productionFixture(projectRoot);
    if (fault === 'labels') fixture.setDependencyResult(commandResult([{ ...fixture.dependencyVolume, Labels: { ...fixture.dependencyVolume.Labels, foreign: 'true' } }]));
    if (fault === 'recreated') fixture.setDependencyResult(commandResult([{ ...fixture.dependencyVolume, CreatedAt: '2026-09-01T00:00:00.700000002Z' }]));
    if (fault === 'bind-alias') fixture.setDependencyResult(commandResult([{ ...fixture.dependencyVolume, Options: { type: 'none', device: projectRoot, o: 'bind' } }]));
    if (fault === 'malformed') fixture.setDependencyResult(commandResult([{}]));
    if (fault === 'daemon-error') fixture.setDependencyResult({ ...commandResult([]), status: 1, stderr: Buffer.from('synthetic daemon unavailable') });
    expect(await fixture.adapter.inspectDependencyVolume!(fixture.authority)).toBeNull();
    expect(fixture.runner).toHaveBeenCalledTimes(1);
  });

  it.each(['volumeName', 'dependencyPlanDigest', 'labelsDigest', 'resourceInstanceDigest'] as const)('rejects retained %s mismatch before invoking Docker', async (field) => {
    const fixture = productionFixture(projectRoot);
    const dependencyAuthority = { ...fixture.authority.dependencyAuthority, [field]: field === 'volumeName' ? `deckent-xd-${'e'.repeat(48)}` : sha('foreign') };
    expect(await fixture.adapter.inspectDependencyVolume!({ ...fixture.authority, dependencyAuthority })).toBeNull();
    expect(fixture.runner).not.toHaveBeenCalled();
  });

  it('rehydrates actual provider-start lifecycle authority through all production read-only inspections', async () => {
    const fixture = productionFixture(projectRoot);
    const authority = await retainedProviderAuthority(fixture.plan);
    const resumed = await rehydrateExecutionEffectDockerLifecycleV1({ authority, adapter: fixture.adapter, clock: { nowIso: () => at(31) } });
    expect(resumed).toMatchObject({ state: 'REHYDRATED', phase: 'PROVIDER_START_AUTHORIZED', lifecycleAuthority: { authorityDigest: authority.authorityDigest, attempt } });
    expect(fixture.runner.mock.calls.map(([input]) => input.args)).toEqual(expect.arrayContaining([
      ['image', 'inspect', imageReference], ['volume', 'inspect', fixture.plan.volumeName], ['volume', 'inspect', fixture.plan.dependencyPlan.volumeName],
    ]));
    expect(fixture.runner).toHaveBeenCalledTimes(3);
  });

  it('reproduces the missing production-method regression before any Docker inspection', async () => {
    const fixture = productionFixture(projectRoot);
    const authority = await retainedProviderAuthority(fixture.plan);
    const { inspectDependencyVolume: omitted, ...withoutDependencyInspection } = fixture.adapter;
    expect(omitted).toBeTypeOf('function');
    const result = await rehydrateExecutionEffectDockerLifecycleV1({ authority, adapter: withoutDependencyInspection, clock: { nowIso: () => at(31) } });
    expect(result).toMatchObject({ state: 'HOLD', code: 'ADAPTER_UNAVAILABLE' });
    expect(fixture.runner).not.toHaveBeenCalled();
  });

  it('retains a lifecycle HOLD for a same-name dependency-volume recreation', async () => {
    const fixture = productionFixture(projectRoot);
    const authority = await retainedProviderAuthority(fixture.plan);
    fixture.setDependencyResult(commandResult([{ ...fixture.dependencyVolume, CreatedAt: '2026-09-01T00:00:00.700000002Z' }]));
    const result = await rehydrateExecutionEffectDockerLifecycleV1({ authority, adapter: fixture.adapter, clock: { nowIso: () => at(31) } });
    expect(result).toMatchObject({ state: 'HOLD', code: 'AUTHORITY_MISMATCH' });
  });
});
