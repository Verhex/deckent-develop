import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TaskAttemptCustodyHold,
  TaskAttemptCustodyStore,
  canonicalTaskAttemptCustodyJson,
  createTaskAttemptCustodyBackendMountTransferReceipt,
  createTaskAttemptCustodyDirectoryScanReceiptV2,
  type TaskAttemptCustodyAdapter,
} from '../../src/core/task-attempt-custody-store.js';
import {
  taskAttemptCustodyPosixDockerAuthorityLabelDigestV2,
  type TaskAttemptCustodyPosixMountConsumerInput,
} from '../../src/core/task-attempt-custody-posix-adapter.js';
import {
  DockerSpawnBackend,
  type ExactDockerCommittedUnsettledRecoveryInput,
} from '../../src/orchestra/spawn-backend-docker.js';
import {
  InMemoryTaskAttemptCustodyAdapter,
  createTaskResultSettlementV2TestPolicy,
} from '../helpers/task-result-settlement-v2-fixture.js';
import {
  produceExactAcceptanceFixtureEffectsV2,
} from '../helpers/exact-acceptance-evidence-fixture.js';

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const sha = (value: string) => `sha256:${createHash('sha256')
  .update(value, 'utf8').digest('hex')}` as const;
const domainSha = (domain: string, value: unknown,
  bounds: Parameters<typeof canonicalTaskAttemptCustodyJson>[1]) => `sha256:${createHash('sha256')
  .update(domain, 'utf8').update('\0', 'utf8')
  .update(canonicalTaskAttemptCustodyJson(value, bounds)).digest('hex')}` as const;
const temporaryRoots: string[] = [];

class ExactMountMemoryAdapter extends InMemoryTaskAttemptCustodyAdapter {
  mountInput: TaskAttemptCustodyPosixMountConsumerInput | null = null;
  mountFailureStage: 'LABEL_DIGEST' | 'TRANSFER_RECEIPT' | null = null;

  scanPrivateDirectoryBounded(input: Parameters<NonNullable<
    TaskAttemptCustodyAdapter['scanPrivateDirectoryBounded']
  >>[0]) {
    const prefix = `${input.relativeDirectory}/`;
    const children = new Set<string>();
    for (const path of [...this.directories.keys(), ...this.files.keys()]) {
      if (!path.startsWith(prefix)) continue;
      const remainder = path.slice(prefix.length);
      if (remainder.length !== 0 && !remainder.includes('/')) children.add(remainder);
    }
    const names = Object.freeze([...children].sort());
    if (names.length > input.maxEntries
      || names.some(name => Buffer.byteLength(name, 'utf8') > input.maxNameBytes)) {
      throw new TaskAttemptCustodyHold('DISPATCH_DISCOVERY_BOUNDS_EXCEEDED', 'read');
    }
    const identityDigest = sha(
      `committed-unsettled-scan:${input.root.rootId}:${input.relativeDirectory}`,
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

  override async consumeBackendMountCapability(input: Parameters<
    InMemoryTaskAttemptCustodyAdapter['consumeBackendMountCapability']
  >[0]) {
    const mountInput = Object.freeze({
      schemaVersion: 2,
      kind: 'task-attempt-custody-posix-mount-consumer-input',
      taskSnapshot: Object.freeze({ sourcePath: '/private/task.json', readOnly: true }),
      workerOutput: Object.freeze({ sourcePath: '/private/output', readOnly: false }),
      rootId: input.root.rootId,
      scopeDigest: input.scopeDigest,
      effectOpDigest: input.effectOpDigest,
      attemptId: input.attemptId,
      generation: input.generation,
    });
    this.mountInput = mountInput;
    let authorityLabelDigest: ReturnType<
      typeof taskAttemptCustodyPosixDockerAuthorityLabelDigestV2
    >;
    try {
      authorityLabelDigest = taskAttemptCustodyPosixDockerAuthorityLabelDigestV2(
        Object.freeze({
          rootId: mountInput.rootId,
          scopeDigest: mountInput.scopeDigest,
          effectOpDigest: mountInput.effectOpDigest,
          attemptId: mountInput.attemptId,
          generation: mountInput.generation,
        }),
      );
    } catch (error) {
      this.mountFailureStage = 'LABEL_DIGEST';
      throw error;
    }
    try {
      return createTaskAttemptCustodyBackendMountTransferReceipt({
        state: 'CONSUMED',
        rootId: input.root.rootId,
        scopeDigest: input.scopeDigest,
        effectOpDigest: input.effectOpDigest,
        attemptId: input.attemptId,
        generation: input.generation,
        backend: 'docker',
        backendExecutionId: 'c'.repeat(64),
        backendImageDigest: sha('image'),
        backendAuthorityLabelDigest: authorityLabelDigest,
        taskSnapshotMountEvidenceDigest: sha('task-mount'),
        workerOutputMountEvidenceDigest: sha('output-mount'),
        backendBootstrapProbeEvidenceDigest: sha('bootstrap'),
        daemonMountReceiptDigest: sha('daemon-mount'),
        cleanupEvidenceDigest: null,
      });
    } catch (error) {
      this.mountFailureStage = 'TRANSFER_RECEIPT';
      throw error;
    }
  }
}

describe('exact committed-unsettled Docker recovery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a non-exact target before Store, Docker, or fence access', async () => {
    const runner = vi.fn();
    const beforePublish = vi.fn();
    const backend = new DockerSpawnBackend('/test/project', {
      exactWorkspaceCommandRunner: runner,
    });
    const input: ExactDockerCommittedUnsettledRecoveryInput = {
      projectRoot: '/test/project',
      sprintId: 'sprint-721',
      dispatchRequestId: '../721',
      recoveryAuthority: {
        executionId: 'sprint-721',
        taskId: 'sprint-721',
        attemptId: 'recovery-721',
        fenceToken: 'fence-721',
        approvalRef: 'owner-721',
        idempotencyKey: 'once-721',
      },
      beforePublish,
    };

    await expect(backend.retainCommittedUnsettledAttempt(input))
      .rejects.toMatchObject({ safeStage: 'RECOVERY_SCOPE' });
    expect(runner).not.toHaveBeenCalled();
    expect(beforePublish).not.toHaveBeenCalled();
  });

  it('revalidates adapter semantic evidence on every planning read and fails closed on drift', () => {
    const identity = {
      projectId: 'project-721', taskId: '721-001',
      attemptId: 'attempt-721', generation: 1,
    };
    const admissionRef = {
      identity,
      dispatchRequestId: `dreq-${'1'.repeat(64)}`,
      admissionReceiptDigest: digest('2'),
      refDigest: digest('3'),
    };
    const evidence = Object.freeze({
      phase: 'COMMITTED_JOURNAL_RELEASE_PENDING' as const,
      semanticVerifier: 'orchestra-required-v1' as const,
      semanticEvidenceDigest: digest('4'),
    });
    const semanticRead = vi.fn(() => evidence);
    const store = {
      readStartedFailedDispatch: vi.fn(() => null),
      readDispatchAuthority: vi.fn(() => ({
        state: 'terminal' as const,
        authority: { state: 'RELEASED' as const },
      })),
      readEffectCommittedReleasePendingDispatch: vi.fn(() => ({ evidence })),
    };
    const entry = { state: 'admitted', ref: admissionRef, admission: {} };
    const backend = new DockerSpawnBackend('/test/project');
    const internals = backend as unknown as {
      reconstructExactDockerRecoveryScope: ReturnType<typeof vi.fn>;
      exactCommittedUnsettledSemanticAdapter: ReturnType<typeof vi.fn>;
    };
    internals.reconstructExactDockerRecoveryScope = vi.fn(() => ({
      store, policy: {}, identity, admissionRef,
    }));
    internals.exactCommittedUnsettledSemanticAdapter = vi.fn(() => ({
      readCommittedReleasePendingEvidence: semanticRead,
    }));

    expect(backend.inspectAdmissionResolvedForPlanning(
      store as never, {} as never, entry as never,
    )).toBe(true);
    expect(backend.inspectAdmissionResolvedForPlanning(
      store as never, {} as never, entry as never,
    )).toBe(true);
    expect(semanticRead).toHaveBeenCalledTimes(2);

    semanticRead.mockReturnValueOnce(Object.freeze({
      ...evidence,
      semanticEvidenceDigest: digest('5'),
    }));
    expect(() => backend.inspectAdmissionResolvedForPlanning(
      store as never, {} as never, entry as never,
    )).toThrow('EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED');
  });

  it('leaves an unmarked RELEASED admission on the ordinary reconciliation path', () => {
    const identity = {
      projectId: 'project-721', taskId: '721-001',
      attemptId: 'attempt-721', generation: 1,
    };
    const admissionRef = {
      identity,
      dispatchRequestId: `dreq-${'6'.repeat(64)}`,
      admissionReceiptDigest: digest('7'),
      refDigest: digest('8'),
    };
    const store = {
      readStartedFailedDispatch: vi.fn(() => null),
      readDispatchAuthority: vi.fn(() => ({
        state: 'terminal' as const,
        authority: { state: 'RELEASED' as const },
      })),
      readEffectCommittedReleasePendingDispatch: vi.fn(() => null),
      readDispatchObservationByClass: vi.fn(() => null),
    };
    const backend = new DockerSpawnBackend('/test/project');
    const internals = backend as unknown as {
      reconstructExactDockerRecoveryScope: ReturnType<typeof vi.fn>;
      exactCommittedUnsettledSemanticAdapter: ReturnType<typeof vi.fn>;
    };
    internals.reconstructExactDockerRecoveryScope = vi.fn(() => ({
      store, policy: {}, identity, admissionRef,
    }));
    internals.exactCommittedUnsettledSemanticAdapter = vi.fn(() => {
      throw new Error('semantic proof must not run without a retained marker');
    });

    expect(backend.inspectAdmissionResolvedForPlanning(
      store as never, {} as never,
      { state: 'admitted', ref: admissionRef, admission: {} } as never,
    )).toBe(false);
    expect(internals.exactCommittedUnsettledSemanticAdapter).not.toHaveBeenCalled();
  });

  it('publishes and idempotently rereads the real committed-anchor Store disposition', async () => {
    vi.stubEnv('WSL_DISTRO_NAME', '');
    const adapter = new ExactMountMemoryAdapter();
    const projectRoot = '/fixture/project';
    const store = TaskAttemptCustodyStore.open({
      adapter,
      absoluteRoot: '/fixture/committed-unsettled-custody',
      canonicalProjectRoot: projectRoot,
      projectId: 'fixture-project',
      create: true,
    });
    const policy = createTaskResultSettlementV2TestPolicy();
    const dispatchAdmission = store.reserveDispatchAdmission({
      dispatchRequestId: `dreq-${'7'.repeat(64)}`,
      dispatchRequestMaterial: Object.freeze({ taskId: '721-001' }),
      taskId: '721-001',
      taskSnapshot: Object.freeze({
        id: '721-001',
        scope: Object.freeze({ filesRead: [], filesWrite: ['docs/CANARY-NOTE.md'] }),
      }),
      policy,
      reservedAt: '2026-09-05T09:00:00.000Z',
      predecessor: null,
    });
    const committed = await (async () => {
      try {
        return await produceExactAcceptanceFixtureEffectsV2({
          store,
          policy,
          identity: dispatchAdmission.ref.identity,
          admission: dispatchAdmission.admission,
          dispatchAdmission,
          stopAfterCommittedAnchor: true,
        });
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error
          ? String(error.code) : 'NO_CODE';
        throw new Error(
          `committed-anchor-fixture:${adapter.mountFailureStage ?? 'STORE'}:${code}`,
          { cause: error },
        );
      }
    })();
    if (!committed.dispatchAuthority || !committed.providerExit || !adapter.mountInput) {
      throw new Error('committed fixture lifecycle is unavailable');
    }
    const ready = committed.captured.lifecycleAuthority;
    const released = committed.dispatchAuthority;
    const labels = Object.freeze({
      'io.deckent.exact-custody.managed': 'true',
      'io.deckent.exact-custody.root-id': adapter.mountInput.rootId,
      'io.deckent.exact-custody.scope-digest': adapter.mountInput.scopeDigest,
      'io.deckent.exact-custody.effect-op-digest': adapter.mountInput.effectOpDigest,
      'io.deckent.exact-custody.attempt-id': adapter.mountInput.attemptId,
      'io.deckent.exact-custody.generation': String(adapter.mountInput.generation),
      'io.deckent.exact-custody.release-nonce-sha256':
        released.releaseEvidence.releaseNonceDigest,
      'io.deckent.exact-custody.provider-invocation-digest':
        released.releaseEvidence.providerInvocationDigest,
    });
    const mount = (source: string, destination: string, rw: boolean, type: string,
      name?: string) => ({ ...(name ? { Name: name } : {}), Source: source,
      Destination: destination, RW: rw, Propagation: 'rprivate', Type: type });
    const mountRoot = mkdtempSync(join(tmpdir(), 'deckent-committed-unsettled-'));
    temporaryRoots.push(mountRoot);
    const taskSnapshotSource = join(mountRoot, 'task.json');
    const workerOutputSource = join(mountRoot, 'worker-output');
    writeFileSync(taskSnapshotSource, '{}', { mode: 0o400 });
    mkdirSync(workerOutputSource, { mode: 0o700 });
    const containerInspectRecord = {
      Id: released.backendExecutionId,
      Name: `/${ready.providerStopped.containerName}`,
      Image: ready.imageObservation.imageDigest,
      Config: { Labels: labels, Entrypoint: [], Cmd: [] },
      State: { Status: 'exited', Running: false, Paused: false,
        Restarting: false, Pid: 0, ExitCode: 0 },
      Mounts: [
        mount(taskSnapshotSource, '/run/deckent/snapshot', false, 'bind'),
        mount(workerOutputSource, '/workspace/.tasks', true, 'bind'),
        mount('/var/lib/docker/workspace', '/workspace', true, 'volume',
          ready.workspacePlan.volumeName),
        mount('/var/lib/docker/dependency', '/workspace/node_modules', false, 'volume',
          ready.workspacePlan.dependencyPlan.volumeName),
      ],
    };
    const observedLabelDigest = taskAttemptCustodyPosixDockerAuthorityLabelDigestV2(
      Object.freeze({
        rootId: adapter.mountInput.rootId,
        scopeDigest: adapter.mountInput.scopeDigest,
        effectOpDigest: adapter.mountInput.effectOpDigest,
        attemptId: adapter.mountInput.attemptId,
        generation: adapter.mountInput.generation,
      }),
    );
    const observedContainerIdentityDigest = domainSha(
      'execution-effect-docker-provider-container-identity-v1',
      {
        containerId: released.backendExecutionId,
        containerName: ready.providerStopped.containerName,
        imageReference: ready.imageObservation.imageReference,
        imageDigest: ready.imageObservation.imageDigest,
        authorityLabelsDigest: observedLabelDigest,
        providerStartAuthorityDigest: ready.providerStartAuthorityDigest,
      },
      policy.jsonBounds,
    );
    expect({
      containerName: `/${ready.providerStopped.containerName}`,
      containerIdMatches: released.backendExecutionId === 'c'.repeat(64),
      imageMatchesRelease:
        ready.imageObservation.imageDigest === released.releaseEvidence.imageDigest,
      labelMatchesRelease:
        observedLabelDigest === released.releaseEvidence.daemonAuthorityLabelDigest,
      containerIdentityMatchesReady:
        observedContainerIdentityDigest === ready.providerStopped.containerIdentityDigest,
      attemptMatches: adapter.mountInput.attemptId === dispatchAdmission.ref.identity.attemptId,
      generationMatches:
        adapter.mountInput.generation === dispatchAdmission.ref.identity.generation,
      workspaceVolume: ready.workspacePlan.volumeName,
      dependencyVolume: ready.workspacePlan.dependencyPlan.volumeName,
    }).toEqual({
      containerName: `/${ready.providerStopped.containerName}`,
      containerIdMatches: true,
      imageMatchesRelease: true,
      labelMatchesRelease: true,
      containerIdentityMatchesReady: true,
      attemptMatches: true,
      generationMatches: true,
      workspaceVolume: ready.workspacePlan.volumeName,
      dependencyVolume: ready.workspacePlan.dependencyPlan.volumeName,
    });
    const volumeInspect = (name: string) => {
      const workspace = name === ready.workspacePlan.volumeName;
      return JSON.stringify([{
        Name: name,
        Driver: 'local',
        Scope: 'local',
        CreatedAt: workspace
          ? ready.presentObservation.daemonCreatedAt
          : ready.dependencyAuthority.daemonCreatedAt,
        Labels: workspace
          ? ready.workspacePlan.workspaceLabels
          : ready.workspacePlan.dependencyLabels,
        Options: {},
        Mountpoint: `/var/lib/docker/volumes/${name}/_data`,
      }]);
    };
    let containerInspectCount = 0;
    let freshContainerMutation: 'state' | 'mount-source' | 'duplicate-destination' | null = null;
    const runner = vi.fn(async (input: { args: readonly string[] }) => {
      let stdout = '';
      if (input.args[0] === 'inspect') {
        containerInspectCount += 1;
        const fresh = containerInspectCount % 2 === 0;
        let mounts = fresh
          ? [...containerInspectRecord.Mounts].reverse()
          : [...containerInspectRecord.Mounts];
        if (fresh && freshContainerMutation === 'mount-source') {
          mounts = [{ ...mounts[0]!, Source: `${mounts[0]!.Source}-changed` }, ...mounts.slice(1)];
        } else if (fresh && freshContainerMutation === 'duplicate-destination') {
          mounts = [...mounts, { ...mounts[0]! }];
        }
        stdout = JSON.stringify([{
          ...containerInspectRecord,
          State: freshContainerMutation === 'state' && fresh
            ? { ...containerInspectRecord.State, Running: true }
            : containerInspectRecord.State,
          // Docker Engine returns this set-like array in nondeterministic order.
          Mounts: mounts,
        }]);
      }
      else if (input.args[0] === 'volume' && input.args[1] === 'inspect') {
        stdout = volumeInspect(input.args[2]!);
      } else if (input.args[0] === 'ps') stdout = `${released.backendExecutionId}\n`;
      else throw new Error(`unexpected Docker command: ${input.args.join(' ')}`);
      return Object.freeze({ status: 0, signal: null, stdout: Buffer.from(stdout),
        stderr: Buffer.alloc(0), error: false, overflow: false });
    });
    const backend = new DockerSpawnBackend(projectRoot, {
      exactWorkspaceCommandRunner: runner as never,
      nowIso: () => '2026-09-05T12:00:00.000Z',
    });
    const scope = {
      store, policy, identity: dispatchAdmission.ref.identity,
      admission: dispatchAdmission.admission, admissionRef: dispatchAdmission.ref,
      taskSnapshot: { dispatch: {
        releaseCommitNonceSha256: released.releaseEvidence.releaseNonceDigest,
        providerInvocationDigest: released.releaseEvidence.providerInvocationDigest,
      } },
    };
    const internals = backend as unknown as {
      openExactDockerRecoveryStore: ReturnType<typeof vi.fn>;
      reconstructExactDockerRecoveryScope: ReturnType<typeof vi.fn>;
      rereadExactProviderStartObservation: ReturnType<typeof vi.fn>;
      readExactDockerRecoveryProviderExecution: ReturnType<typeof vi.fn>;
      readExactDockerRecoveryProviderExit: ReturnType<typeof vi.fn>;
      inspectExactCommittedHostPostimages: ReturnType<typeof vi.fn>;
      readExactCommittedUnsettledProjectRootIdentityDigest: ReturnType<typeof vi.fn>;
    };
    internals.openExactDockerRecoveryStore = vi.fn(() => ({ store, policy }));
    internals.reconstructExactDockerRecoveryScope = vi.fn(() => scope);
    internals.rereadExactProviderStartObservation = vi.fn(() => ({}));
    internals.readExactDockerRecoveryProviderExecution = vi.fn(() => ({}));
    internals.readExactDockerRecoveryProviderExit = vi.fn(() => ({
      containerId: released.backendExecutionId,
      exitCode: ready.providerStopped.exitCode,
      observedAt: ready.providerStopped.stoppedAt,
      observationReceiptDigest: ready.providerStopped.exitObservationReceiptDigest,
    }));
    internals.inspectExactCommittedHostPostimages = vi.fn()
      .mockResolvedValueOnce(sha('host-postimages-before-container-drift'))
      .mockResolvedValueOnce(sha('host-postimages-before-mount-drift'))
      .mockResolvedValueOnce(sha('host-postimages-before-duplicate-mount'))
      .mockResolvedValueOnce(sha('host-postimages-before-drift'))
      .mockRejectedValueOnce(new Error('RECOVERY_HOST_POSTIMAGE'))
      .mockResolvedValueOnce(sha('host-postimages-initial'))
      .mockResolvedValueOnce(sha('host-postimages-fresh'));
    internals.readExactCommittedUnsettledProjectRootIdentityDigest = vi.fn(
      () => sha('fixture-project-root'),
    );
    const beforePublish = vi.fn();
    const recoveryAuthority = Object.freeze({
      executionId: 'sprint-721', taskId: 'sprint-721',
      attemptId: 'recovery-721', fenceToken: 'fence-721',
      approvalRef: 'owner-721', idempotencyKey: 'once-721',
    });
    const input = Object.freeze({ projectRoot, sprintId: 'sprint-721',
      dispatchRequestId: dispatchAdmission.ref.dispatchRequestId,
      recoveryAuthority, beforePublish });

    for (const mutation of [
      'state', 'mount-source', 'duplicate-destination',
    ] as const) {
      freshContainerMutation = mutation;
      await expect(backend.retainCommittedUnsettledAttempt(input))
        .rejects.toMatchObject({ safeStage: 'RECOVERY_STOP_REREAD' });
      expect(beforePublish).not.toHaveBeenCalled();
      expect(store.readEffectCommittedReleasePendingDispatch({
        admissionRef: dispatchAdmission.ref, policy,
      })).toBeNull();
    }
    freshContainerMutation = null;

    await expect(backend.retainCommittedUnsettledAttempt(input))
      .rejects.toThrow('RECOVERY_HOST_POSTIMAGE');
    expect(beforePublish).not.toHaveBeenCalled();
    expect(store.readEffectCommittedReleasePendingDispatch({
      admissionRef: dispatchAdmission.ref, policy,
    })).toBeNull();

    const retained = await backend.retainCommittedUnsettledAttempt(input);
    expect(retained).toMatchObject({ state: 'retained',
      phase: 'COMMITTED_JOURNAL_RELEASE_PENDING', acceptedResult: 'ABSENT',
      settlement: 'UNRESOLVED' });
    expect(beforePublish).toHaveBeenCalledTimes(1);
    expect(committed.bridge.readCommittedReleasePendingEvidence()).not.toBeNull();
    const durable = store.readEffectCommittedReleasePendingDispatch({
      admissionRef: dispatchAdmission.ref, policy,
    });
    expect(durable?.receiptDigest).toBe(retained.receiptDigest);
    expect(durable?.hostObservationDigest).toBe(sha('host-postimages-fresh'));

    const idempotent = await backend.retainCommittedUnsettledAttempt(input);
    expect(idempotent).toEqual(retained);
    expect(beforePublish).toHaveBeenCalledTimes(1);
    expect(internals.inspectExactCommittedHostPostimages).toHaveBeenCalledTimes(7);
    expect(internals.readExactCommittedUnsettledProjectRootIdentityDigest)
      .toHaveBeenCalledTimes(6);
  });
});
