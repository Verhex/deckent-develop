import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskAttemptCustodyStore } from '../../src/core/task-attempt-custody-store.js';
import { ExactMountMemoryAdapter } from '../helpers/exact-recovery-mount-adapter.js';
import { createTaskResultSettlementV2TestPolicy } from '../helpers/task-result-settlement-v2-fixture.js';
import { produceExactAcceptanceFixtureEffectsV2 } from '../helpers/exact-acceptance-evidence-fixture.js';

const digest = (c: string) => `sha256:${c.repeat(64)}` as const;

async function fixture() {
  vi.stubEnv('WSL_DISTRO_NAME', '');
  const adapter = new ExactMountMemoryAdapter();
  const options = { adapter, absoluteRoot: '/fixture/rejected-custody', canonicalProjectRoot: '/fixture/project', projectId: 'fixture-project' };
  const store = TaskAttemptCustodyStore.open({ ...options, create: true });
  const policy = createTaskResultSettlementV2TestPolicy();
  const admission = store.reserveDispatchAdmission({
    dispatchRequestId: `dreq-${'7'.repeat(64)}`, dispatchRequestMaterial: { taskId: '721-001' },
    taskId: '721-001', taskSnapshot: { id: '721-001', scope: { filesRead: [], filesWrite: ['docs/CANARY-NOTE.md'] } },
    policy, reservedAt: '2026-09-05T09:00:00.000Z', predecessor: null,
  });
  const identity = admission.ref.identity;
  const access = store.openAttemptAccess({ identity, policy, admissionReceiptDigest: admission.admission.receiptDigest })!;
  const source = store.issueAttemptOutputCaptureSource({ access, childRelativePath: 'primary.result.json', artifactClass: 'worker-result', artifactKey: 'primary' });
  adapter.putAttemptOutput(adapter.capabilityPaths.get(source)!, Buffer.from('{"invalidWorkerResult":true}'));
  store.captureAttemptOutputArtifact({ identity, policy, admissionReceiptDigest: admission.admission.receiptDigest,
    artifactClass: 'worker-result', artifactKey: 'primary', capturedAt: '2026-09-05T09:00:01.000Z', source });
  await produceExactAcceptanceFixtureEffectsV2({ store, policy, identity, admission: admission.admission, dispatchAdmission: admission });
  const input = { admissionRef: admission.ref, policy };
  const candidate = store.inspectRejectedResultDispatchCandidate(input);
  const close = { ...input, sourceResultDigest: candidate.sourceResultDigest,
    recordedAt: new Date(Date.now() + 1000).toISOString(), stoppedExecutionEvidenceDigest: digest('8'),
    recoveryAuthority: { executionId: 'sprint-721', taskId: 'sprint-721', attemptId: 'recovery-721',
      fenceToken: 'fence-721', approvalRef: 'owner-721', idempotencyKey: 'once-721' } };
  return { store, adapter, options, input, close, identity };
}

afterEach(() => vi.unstubAllEnvs());
describe('released effect with rejected result: durable negative closure', () => {
  it('survives a new Store and replays without acceptance or duplicate publication', async () => {
    const f = await fixture();
    const before = new Map(f.adapter.files);
    const closed = f.store.closeRejectedResultDispatch(f.close);
    expect(closed.state).toBe('REJECTED_RESULT_CLOSED');
    expect(f.store.readChain(f.identity, f.input.policy, 'accepted-result')).toBeNull();
    const cold = TaskAttemptCustodyStore.open({ ...f.options, create: false });
    expect(cold.readRejectedResultDispatch(f.input)).toEqual(closed);
    const filesAfter = f.adapter.files.size;
    expect(cold.closeRejectedResultDispatch(f.close)).toEqual(closed);
    expect(f.adapter.files.size).toBe(filesAfter);
    for (const [path, value] of before) expect(f.adapter.files.get(path)).toEqual(value);
  });
  it('rejects a wrong source digest or foreign recovery authority', async () => {
    const f = await fixture();
    expect(() => f.store.closeRejectedResultDispatch({ ...f.close, sourceResultDigest: digest('9') })).toThrow();
    expect(() => f.store.closeRejectedResultDispatch({ ...f.close,
      recoveryAuthority: { ...f.close.recoveryAuthority, executionId: 'sprint-722', taskId: 'sprint-722' } })).toThrow();
    expect(f.store.readRejectedResultDispatch(f.input)).toBeNull();
  });
  it('prevents publishing acceptance after the negative terminal marker', async () => {
    const f = await fixture();
    f.store.closeRejectedResultDispatch(f.close);
    expect(() => f.store.publishHostArtifact({ identity: f.identity, policy: f.input.policy,
      admissionReceiptDigest: f.input.admissionRef.admissionReceiptDigest,
      artifactClass: 'canonical-accepted-result', artifactKey: 'late-accepted',
      capturedAt: f.close.recordedAt, bytes: '{}' })).toThrow();
  });
  it('fails closed when the first-writer terminal record is corrupted', async () => {
    const f = await fixture();
    f.store.closeRejectedResultDispatch(f.close);
    const path = [...f.adapter.files.keys()].find(value => value.endsWith('/rejected-result-closed.json'))!;
    const file = f.adapter.files.get(path)!;
    f.adapter.files.set(path, { ...file, bytes: Buffer.from('{}') });
    const cold = TaskAttemptCustodyStore.open({ ...f.options, create: false });
    expect(() => cold.readRejectedResultDispatch(f.input)).toThrow();
    expect(() => cold.closeRejectedResultDispatch(f.close)).toThrow();
  });
  it('rejects a backdated decision and a conflicting first-writer replay', async () => {
    const f = await fixture();
    expect(() => f.store.closeRejectedResultDispatch({ ...f.close, recordedAt: '2020-01-01T00:00:00.000Z' })).toThrow();
    f.store.closeRejectedResultDispatch(f.close);
    expect(() => f.store.closeRejectedResultDispatch({ ...f.close, stoppedExecutionEvidenceDigest: digest('9') })).toThrow();
  });
});
