import { describe, expect, it, vi } from 'vitest';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
const digest = `sha256:${'a'.repeat(64)}`;
function fixture(present?: 'container' | 'volume' | 'daemon') {
  const runner = vi.fn(async (request: { args: readonly string[] }) => ({
    status: present === 'daemon' ? 1 : 0, signal: null, error: undefined, overflow: false,
    stdout: Buffer.from(request.args[0] === 'ps' ? (present === 'container' ? 'container-id exact-provider\n' : '')
      : present === 'volume' ? 'exact-workspace\n' : ''), stderr: Buffer.alloc(0),
  }));
  const backend = new DockerSpawnBackend('/fixture/project', { exactWorkspaceCommandRunner: runner });
  const identity = { taskId: '751-001', attemptId: 'attempt', generation: 1 };
  const ref = { identity, refDigest: digest };
  const evidence = { phase: 'RELEASED_EFFECT_UNACCEPTED', semanticEvidenceDigest: digest };
  const retained = vi.fn(() => ({ receiptDigest: digest }));
  const store = {
    readDispatchAdmission: () => ({ state: 'admitted', ref }),
    inspectEffectReleasedUnacceptedCandidate: () => ({ evidenceDigest: digest }),
    readEffectReleasedUnacceptedDispatch: () => null,
    retainEffectReleasedUnacceptedDispatch: retained,
  };
  const ready = { providerStopped: { containerName: 'exact-provider', exitObservationReceiptDigest: digest,
    stoppedAt: '2026-09-12T18:00:00.000Z', exitCode: 1 }, workspacePlan: { volumeName: 'exact-workspace',
    dependencyPlan: { volumeName: 'exact-dependencies' } } };
  const adapter = {
    readReleasedUnacceptedEvidence: vi.fn(() => evidence), readLifecycleAuthority: () => ready,
    readLatestReleaseProgress: () => ({ state: 'RELEASED', progressDigest: digest,
      progressedAt: '2026-09-12T18:01:00.000Z', resources: [
        { resourceKind: 'provider-container', resourceName: 'exact-provider' },
        { resourceKind: 'workspace-volume', resourceName: 'exact-workspace' },
        { resourceKind: 'dependency-volume', resourceName: 'exact-dependencies' },
      ] }),
  };
  const hostRead = vi.fn(async () => digest);
  Object.assign(backend, {
    openExactDockerRecoveryStore: () => ({ store, policy: {} }),
    reconstructExactDockerRecoveryScope: () => ({ identity, admissionRef: ref }),
    exactCommittedUnsettledSemanticAdapter: () => adapter,
    readExactDockerRecoveryProviderExit: () => ({ containerId: 'container-id', observationReceiptDigest: digest,
      observedAt: ready.providerStopped.stoppedAt, exitCode: 1 }),
    inspectExactCommittedHostPostimages: hostRead,
  });
  const beforePublish = vi.fn();
  const input = { projectRoot: '/fixture/project', sprintId: 'sprint-751', dispatchRequestId: `dreq-${'a'.repeat(64)}`,
    recoveryAuthority: { executionId: 'sprint-751', taskId: 'sprint-751', attemptId: 'recovery',
      fenceToken: 'fence', approvalRef: 'owner', idempotencyKey: 'once' }, beforePublish };
  return { backend, input, retained, beforePublish, runner, hostRead, adapter };
}
describe('released unaccepted host boundary', () => {
  it.each(['container', 'volume', 'daemon'] as const)('does not publish when %s fails absence', async problem => {
    const f = fixture(problem);
    await expect(f.backend.retainReleasedUnacceptedAttempt(f.input)).rejects.toThrow();
    expect(f.retained).not.toHaveBeenCalled();
    expect(f.beforePublish).not.toHaveBeenCalled();
  });
  it('dry-run inspects without publishing; apply rereads absence and host postimages', async () => {
    const f = fixture();
    await expect(f.backend.retainReleasedUnacceptedAttempt({ ...f.input, dryRun: true })).resolves.toMatchObject({ state: 'eligible' });
    expect(f.retained).not.toHaveBeenCalled();
    expect(f.beforePublish).not.toHaveBeenCalled();
    f.runner.mockClear(); f.hostRead.mockClear();
    await expect(f.backend.retainReleasedUnacceptedAttempt(f.input)).resolves.toMatchObject({ state: 'retained', phase: 'RELEASED_EFFECT_UNACCEPTED' });
    expect(f.runner).toHaveBeenCalledTimes(4);
    expect(f.hostRead).toHaveBeenCalledTimes(2);
    expect(f.beforePublish).toHaveBeenCalledTimes(2);
    expect(f.retained).toHaveBeenCalledOnce();
  });
  it('refuses semantic drift before publication', async () => {
    const f = fixture();
    f.adapter.readReleasedUnacceptedEvidence.mockReturnValueOnce({ phase: 'RELEASED_EFFECT_UNACCEPTED', semanticEvidenceDigest: digest });
    f.adapter.readReleasedUnacceptedEvidence.mockReturnValue({ phase: 'RELEASED_EFFECT_UNACCEPTED', semanticEvidenceDigest: `sha256:${'b'.repeat(64)}` });
    await expect(f.backend.retainReleasedUnacceptedAttempt(f.input)).rejects.toMatchObject({ safeStage: 'RECOVERY_SEMANTIC_REREAD' });
    expect(f.retained).not.toHaveBeenCalled();
  });
});
