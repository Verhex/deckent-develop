import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExactNormalDockerExecutionRegistry } from '../../src/orchestra/scheduler-effects.js';
import { settleRecoveredExactTerminalAuthorities } from '../../src/orchestra/sprint-controller.js';
import { assembleCanonicalIngressResult, assembleCanonicalIngressResultV2, WorkerResultSchemaError } from '../../src/orchestra/result-ingress.js';
import { AssemblerError } from '../../src/core/task-result-schema.js';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import type { ExactDockerRejectedResultV2, SpawnBackend } from '../../src/orchestra/spawn-backend.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const digest = `sha256:${'a'.repeat(64)}` as const;
function rejection(taskId = '8-001'): ExactDockerRejectedResultV2 {
  return Object.freeze({
    kind: 'rejected-result', reasonCode: 'WORKER_RESULT_SCHEMA_INVALID', sourceResultDigest: digest,
    reader: Object.freeze({ token: Symbol('fixture-reader') }), projectionFence: digest,
    releaseReceipt: { ref: digest, digest },
    custodyRef: {
      dispatchRequestId: `dreq-${'a'.repeat(64)}`, admissionReceiptDigest: digest, admissionRefDigest: digest,
      identity: { schemaVersion: 2, backend: 'docker', projectRootSha256: 'a'.repeat(64), projectId: 'fixture', taskId, attemptId: 'fixture-attempt', generation: 1 },
      providerStartReceipt: { ref: digest, digest },
    },
  });
}
async function fixture(taskId = '8-001', verified: boolean | Error = true) {
  const root = mkdtempSync(join(tmpdir(), 'rejected-history-')); roots.push(root);
  const rejected = rejection(taskId);
  const verify = vi.fn(async () => { if (verified instanceof Error) throw verified; return verified; });
  const backend = { name: 'docker', awaitExactDockerAcceptedResult: async () => rejected, verifyExactDockerRejectedResult: verify } as unknown as SpawnBackend;
  const registry = createExactNormalDockerExecutionRegistry(root);
  registry.registerReleased(taskId, backend, { custodyRef: rejected.custodyRef, releaseReceipt: rejected.releaseReceipt, providerStartReceipt: rejected.custodyRef.providerStartReceipt, projectionFence: digest });
  await registry.awaitTaskResultAuthority(taskId);
  return { root, rejected, verify, backend, registry };
}

describe('schema-rejected worker result remains negative historical evidence', () => {
  it('uses the actual schema error and keeps host-authority failure distinct', () => {
    expect(() => assembleCanonicalIngressResult({
      selfAssessment: 'NO_GO', testsPassed: false,
      productionWiringEvidence: { version: 1, contractDigest: 'a'.repeat(64), observedBy: 'worker', evidence: { state: 'presence-only', evidenceRefs: ['src/a.ts'] } },
    }, { taskId: '8-001', workerId: 'worker', provider: 'codex', model: 'gpt-5.6-terra' })).toThrow(WorkerResultSchemaError);
    try {
      assembleCanonicalIngressResultV2({}, {} as never, { attemptCustody: { identity: {} } } as never);
      throw new Error('host invalid authority was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(AssemblerError);
      expect(error).not.toBeInstanceOf(WorkerResultSchemaError);
    }
  });
  it('retires only a reverified earlier terminal rejection, including a cold registry replay', async () => {
    for (let replay = 0; replay < 2; replay++) {
      const { root, registry, verify } = await fixture();
      expect(registry.readTaskResultAuthority('8-001').state).toBe('authority-hold');
      await settleRecoveredExactTerminalAuthorities(registry, { projectRoot: root, restoreCandidateSprintId: 'sprint-009', readOwningRunLifecycle: () => 'terminal' });
      expect(verify).toHaveBeenCalledOnce();
      expect(registry.snapshotHistoricalUnsettleableAttempts().get('8-001')?.reasonCode).toBe('WORKER_RESULT_SCHEMA_INVALID');
      expect(registry.isExactTask('8-001')).toBe(false);
      expect(registry.readTaskResultAuthority('8-001').state).not.toBe('exact-accepted');
    }
  });
  it.each(['sprint-008', 'sprint-007', null])('does not retire current/future/unbound current run (%s)', async current => {
    const { root, registry, verify } = await fixture();
    await expect(settleRecoveredExactTerminalAuthorities(registry, { projectRoot: root, restoreCandidateSprintId: current, readOwningRunLifecycle: () => 'terminal' })).rejects.toThrow('EXACT_RECOVERY_ATTEMPT_HOLD');
    expect(verify).not.toHaveBeenCalled();
    expect(registry.isExactTask('8-001')).toBe(true);
  });
  it.each(['nonterminal', 'unknown'] as const)('keeps %s owning runs', async state => {
    const { root, registry, verify } = await fixture();
    await expect(settleRecoveredExactTerminalAuthorities(registry, { projectRoot: root, restoreCandidateSprintId: 'sprint-009', readOwningRunLifecycle: () => state })).rejects.toThrow();
    expect(verify).not.toHaveBeenCalled();
  });
  it.each([false, new Error('store inaccessible')])('keeps failed or throwing revalidation', async verified => {
    const { root, registry } = await fixture('8-001', verified);
    await expect(settleRecoveredExactTerminalAuthorities(registry, { projectRoot: root, restoreCandidateSprintId: 'sprint-009', readOwningRunLifecycle: () => 'terminal' })).rejects.toThrow();
    expect(registry.snapshotHistoricalUnsettleableAttempts().size).toBe(0);
  });
  it('rereads owning lifecycle after asynchronous backend verification', async () => {
    const { root, registry } = await fixture();
    const read = vi.fn().mockReturnValueOnce('terminal').mockReturnValueOnce('nonterminal');
    await expect(settleRecoveredExactTerminalAuthorities(registry, { projectRoot: root, restoreCandidateSprintId: 'sprint-009', readOwningRunLifecycle: read })).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not accept a replaced registry entry across the asynchronous check', async () => {
    const { root, registry, verify } = await fixture();
    verify.mockImplementationOnce(async () => { registry.registerHold('8-001', 'changed'); return true; });
    await expect(settleRecoveredExactTerminalAuthorities(registry, { projectRoot: root, restoreCandidateSprintId: 'sprint-009', readOwningRunLifecycle: () => 'terminal' })).rejects.toThrow();
    expect(registry.snapshotHistoricalUnsettleableAttempts().size).toBe(0);
  });
});

describe('backend rejected-result reader revalidates custody and daemon without mutation', () => {
  function readerFixture() {
    const rejected = rejection();
    const completion = { kind: 'landing-captured', result: { sourceResult: { artifactSha256: digest } }, custodyRef: rejected.custodyRef, projectionFence: digest };
    // Inject filesystem/daemon ports; execute the production verifier itself.
    const backend = Object.create(DockerSpawnBackend.prototype);
    Object.assign(backend, {
      exactRejectedResults: new WeakMap([[rejected.reader, { rejected, scope: {}, query: {}, exit: { containerId: 'fixture-container' } }]]),
      rereadExactProviderExitObservation: vi.fn(),
      readColdExactDockerAcceptedResult: vi.fn(() => null),
      readColdExactDockerCompletion: vi.fn(() => completion),
      observeExactDockerDaemonContainerState: vi.fn(async () => 'absent'),
    });
    return { backend, rejected, completion };
  }
  it('requires the issuing opaque reader and exact object', async () => {
    const { backend, rejected } = readerFixture();
    expect(await backend.verifyExactDockerRejectedResult(rejected)).toBe(true);
    expect(await backend.verifyExactDockerRejectedResult({ ...rejected })).toBe(false);
    expect(await backend.verifyExactDockerRejectedResult(rejection())).toBe(false);
  });
  it.each(['present', 'unknown'])('does not retire a daemon %s execution', async state => {
    const { backend, rejected } = readerFixture();
    backend.observeExactDockerDaemonContainerState.mockResolvedValue(state);
    expect(await backend.verifyExactDockerRejectedResult(rejected)).toBe(false);
  });
  it.each(['digest', 'identity', 'fence', 'absent', 'accepted', 'throw'])('fails closed on changed %s authority', async change => {
    const { backend, rejected, completion } = readerFixture();
    if (change === 'accepted') backend.readColdExactDockerAcceptedResult.mockReturnValue({});
    else if (change === 'throw') backend.rereadExactProviderExitObservation.mockImplementation(() => { throw new Error('unreadable'); });
    else backend.readColdExactDockerCompletion.mockReturnValue(change === 'absent' ? null : {
      ...completion,
      ...(change === 'digest' ? { result: { sourceResult: { artifactSha256: 'foreign' } } } : {}),
      ...(change === 'identity' ? { custodyRef: {} } : {}),
      ...(change === 'fence' ? { projectionFence: 'foreign' } : {}),
    });
    expect(await backend.verifyExactDockerRejectedResult(rejected)).toBe(false);
  });
  it('checks custody and acceptance again after the daemon await', async () => {
    const { backend, rejected, completion } = readerFixture();
    backend.readColdExactDockerCompletion.mockReturnValueOnce(completion).mockReturnValueOnce(null);
    expect(await backend.verifyExactDockerRejectedResult(rejected)).toBe(false);
  });
});
