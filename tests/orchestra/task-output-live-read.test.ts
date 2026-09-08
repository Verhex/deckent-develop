import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { attendedExecutionProjectId } from '../../src/core/attended-execution-approval.js';
import type { TaskOutputReadCapability } from '../../src/core/task-output-read-service.js';
import { taskAttemptCustodyPosixDockerAuthorityLabelDigestV2 } from '../../src/core/task-attempt-custody-posix-adapter.js';
import {
  DockerSpawnBackend,
  type ExactDockerWorkspaceCommandInputV1,
  type ExactDockerWorkspaceCommandResultV1,
} from '../../src/orchestra/spawn-backend-docker.js';
import type {
  TaskOutputLiveTransportInput,
  TaskOutputLiveTransportResult,
} from '../../src/orchestra/task-output-live-transport.js';

const projectRoot = '/test/exact-output-project';
const projectId = attendedExecutionProjectId(projectRoot);
const sha = (value: string): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;
const containerId = 'a'.repeat(64);
const imageDigest = sha('image');
const rootId = sha('root');
const scopeDigest = sha('scope');
const effectOpDigest = sha('effect');
const releaseNonceDigest = sha('release-nonce');
const providerInvocationDigest = sha('provider-invocation');
const attemptId = '11111111-1111-4111-8111-111111111111';
const labelDigest = taskAttemptCustodyPosixDockerAuthorityLabelDigestV2(Object.freeze({
  rootId, scopeDigest, effectOpDigest, attemptId, generation: 1,
}));
const labelValues = () => [
  'true', rootId, scopeDigest, effectOpDigest, attemptId, '1',
  releaseNonceDigest, providerInvocationDigest,
];

function commandResult(
  values = [containerId, imageDigest, ...labelValues()],
  overrides: Partial<ExactDockerWorkspaceCommandResultV1> = {},
): ExactDockerWorkspaceCommandResultV1 {
  return {
    status: 0, signal: null,
    stdout: Buffer.from(`${values.map(value => JSON.stringify(value)).join('\n')}\n`),
    stderr: Buffer.alloc(0), error: false, overflow: false, ...overrides,
  };
}

function harness() {
  const identity = {
    schemaVersion: 2 as const, backend: 'docker' as const,
    projectRootSha256: sha(projectRoot), projectId, taskId: '719-001',
    attemptId, generation: 1,
  };
  const ref = {
    schemaVersion: 2 as const, kind: 'task-attempt-custody-dispatch-admission-ref' as const,
    state: 'admitted' as const, dispatchRequestId: `dreq-${'b'.repeat(64)}`,
    dispatchRequestMaterialDigest: sha('request'), reservationReceiptDigest: sha('reservation'),
    identity, admissionReceiptDigest: sha('admission'), refDigest: sha('ref'),
  };
  const admission = {
    identity, receiptDigest: ref.admissionReceiptDigest, taskSnapshot: { sha256: sha('snapshot') },
  };
  const admitted = { state: 'admitted' as const, admission, ref, reservation: { identity } };
  const providerExecutionAttempt = {
    schemaVersion: 2 as const, kind: 'task-attempt-custody-provider-execution-attempt' as const,
    providerExecutionAttemptId: 'provider-attempt-1', custodyIdentity: identity,
    admissionReceiptDigest: ref.admissionReceiptDigest, backendExecutionId: containerId,
    identityDigest: sha('provider-attempt'),
  };
  const released = {
    state: 'RELEASED' as const, admissionRef: ref, receiptDigest: sha('dispatch'),
    releaseReceiptDigest: sha('release-receipt'), projectionFence: sha('fence'),
    providerExecutionAttempt, backendExecutionId: containerId,
    releaseEvidence: {
      containerId, imageDigest, receiptDigest: sha('release-receipt'),
      releaseNonceDigest, providerInvocationDigest, daemonAuthorityLabelDigest: labelDigest,
    },
  };
  const store = {
    root: { rootId },
    readDispatchAdmission: vi.fn(() => admitted),
    listDispatchAdmissions: vi.fn(() => ({ entries: [admitted] })),
    readDispatchAuthority: vi.fn(() => ({ state: 'terminal' as const, authority: released })),
  };
  const scope = {
    store, policy: { policyDigest: sha('policy') }, identity, admissionRef: ref,
    provider: 'codex', model: 'gpt-5.6-terra',
    taskSnapshot: {
      dispatchRequestId: ref.dispatchRequestId, projectId, taskId: identity.taskId,
      material: { approved: { sprintId: 'sprint-719' }, dispatch: {
        id: identity.taskId, actor: { id: 'worker', tenantId: 'tenant-a' },
      } },
      dispatch: { releaseCommitNonceSha256: releaseNonceDigest, providerInvocationDigest },
    },
  };
  const runner = vi.fn<(input: ExactDockerWorkspaceCommandInputV1) =>
    Promise<ExactDockerWorkspaceCommandResultV1>>(async () => commandResult());
  const transport = vi.fn<(input: TaskOutputLiveTransportInput) =>
    Promise<TaskOutputLiveTransportResult>>(async input => {
      await input.onChunk(Buffer.from('live bytes'), 'stdout');
      return {
        kind: 'closed', observer: { code: 0, signal: null },
        cleanup: { attempted: true, termSent: false, killSent: false,
          anchorExited: true, groupEmpty: true },
        resources: { readerCount: 2, readersSettled: true,
          abortListenerRemoved: true, escalationTimerActive: false },
      };
    });
  const backend = new DockerSpawnBackend(projectRoot, {
    exactWorkspaceCommandRunner: runner, taskOutputLiveTransport: transport,
  });
  const internal = backend as unknown as {
    openExactDockerRecoveryStore: () => unknown;
    readExactDockerTaskOutputScope: () => unknown;
    readExactDockerRecoveryProviderExit: () => null;
  };
  internal.openExactDockerRecoveryStore = () => ({ store, policy: scope.policy });
  internal.readExactDockerTaskOutputScope = () => scope;
  internal.readExactDockerRecoveryProviderExit = () => null;
  const read = backend.readExactDockerTaskOutput({
    projectId, taskId: identity.taskId, caller: { id: 'operator', tenantId: 'tenant-a' },
    strictTenantIsolation: true,
  });
  if (read.state !== 'pending' || !read.capability) {
    throw new Error(`fixture failed to mint:${JSON.stringify(read)}`);
  }
  const observe = (capability: TaskOutputReadCapability = read.capability) =>
    backend.observeExactDockerTaskOutput(capability, {
      tail: 100, follow: true, signal: new AbortController().signal,
      limits: { termGraceMs: 10, reapObservationMs: 10, streamCloseMs: 10 },
      onChunk: vi.fn(),
    });
  return { backend, store, scope, released, runner, transport, capability: read.capability, observe };
}

describe('exact Docker live output authority binding', () => {
  it('accepts only its minted capability and uses a credential-free filtered inspect', async () => {
    const h = harness();
    await expect(h.observe()).resolves.toEqual({ state: 'closed', terminalMeaning: 'observer-only' });
    expect(h.runner).toHaveBeenCalledTimes(2);
    const args = h.runner.mock.calls[0]![0].args;
    expect(args.slice(0, 2)).toEqual(['inspect', '--format']);
    expect(args.at(-1)).toBe(containerId);
    expect(args.join(' ')).not.toMatch(/Config\.Env|credential|secret|token/iu);
    expect(h.transport).toHaveBeenCalledWith(expect.objectContaining({
      containerId, tail: 100, follow: true, cwd: projectRoot,
    }));
  });

  it('rejects forged and foreign-backend capabilities before Docker', async () => {
    const h = harness();
    await expect(h.observe(Object.freeze({}) as TaskOutputReadCapability))
      .resolves.toEqual({ state: 'unavailable', reasonCode: 'capability-denied' });
    const foreign = harness();
    await expect(foreign.observe(h.capability))
      .resolves.toEqual({ state: 'unavailable', reasonCode: 'capability-denied' });
    expect(foreign.runner).not.toHaveBeenCalled();
    expect(foreign.transport).not.toHaveBeenCalled();
  });

  it.each(['receiptDigest', 'projectionFence', 'providerExecutionAttempt'] as const)(
    'refuses changed RELEASED %s before inspect/logs', async field => {
      const h = harness();
      if (field === 'providerExecutionAttempt') {
        h.released.providerExecutionAttempt = { ...h.released.providerExecutionAttempt,
          identityDigest: sha('changed-attempt') };
      } else h.released[field] = sha(`changed-${field}`);
      await expect(h.observe()).resolves.toEqual({ state: 'unavailable', reasonCode: 'custody-changed' });
      expect(h.runner).not.toHaveBeenCalled();
      expect(h.transport).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['image', [containerId, sha('foreign-image'), ...labelValues()]],
    ['labels', [containerId, imageDigest, ...labelValues().map((value, index) => index === 2 ? sha('foreign-scope') : value)]],
  ])('refuses mismatched daemon %s before logs', async (_case, projection) => {
    const h = harness();
    h.runner.mockResolvedValue(commandResult(projection));
    await expect(h.observe()).resolves.toEqual({
      state: 'unavailable', reasonCode: 'daemon-identity-mismatch',
    });
    expect(h.transport).not.toHaveBeenCalled();
  });

  it.each([
    ['absent', commandResult([], { status: 1, stderr: Buffer.from('absent') })],
    ['overflow', commandResult([], { overflow: true })],
  ])('keeps daemon %s typed unavailable', async (_case, result) => {
    const h = harness();
    h.runner.mockResolvedValue(result);
    await expect(h.observe()).resolves.toEqual({
      state: 'unavailable', reasonCode: 'daemon-unavailable',
    });
    expect(h.transport).not.toHaveBeenCalled();
  });

  it('returns custody-changed when authority changes after live bytes were emitted', async () => {
    const h = harness();
    h.transport.mockImplementationOnce(async input => {
      await input.onChunk(Buffer.from('already emitted'), 'stdout');
      h.released.projectionFence = sha('post-read-change');
      return { kind: 'closed' } as TaskOutputLiveTransportResult;
    });
    await expect(h.observe()).resolves.toEqual({
      state: 'unavailable', reasonCode: 'custody-changed',
    });
    expect(h.runner).toHaveBeenCalledTimes(1);
  });
});
