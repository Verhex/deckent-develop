import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskAttemptCustodyStore } from '../../src/core/task-attempt-custody-store.js';
import { createExecutionEffectDockerReconciledAbsenceReceiptV1 } from '../../src/orchestra/execution-effect-docker-lifecycle.js';
import { ExactMountMemoryAdapter } from '../helpers/exact-recovery-mount-adapter.js';
import { createTaskResultSettlementV2TestPolicy } from '../helpers/task-result-settlement-v2-fixture.js';
import { produceExactAcceptanceFixtureEffectsV2 } from '../helpers/exact-acceptance-evidence-fixture.js';

const digest = (c: string) => `sha256:${c.repeat(64)}` as const;
async function fixture() {
  vi.stubEnv('WSL_DISTRO_NAME', '');
  const adapter = new ExactMountMemoryAdapter();
  const options = { adapter, absoluteRoot: '/fixture/released-custody', canonicalProjectRoot: '/fixture/project', projectId: 'fixture-project' };
  const store = TaskAttemptCustodyStore.open({ ...options, create: true });
  const policy = createTaskResultSettlementV2TestPolicy();
  const admission = store.reserveDispatchAdmission({ dispatchRequestId: `dreq-${'7'.repeat(64)}`,
    dispatchRequestMaterial: { taskId: '721-001' }, taskId: '721-001',
    taskSnapshot: { id: '721-001', scope: { filesRead: [], filesWrite: ['docs/CANARY-NOTE.md'] } },
    policy, reservedAt: '2026-09-05T09:00:00.000Z', predecessor: null });
  const f = await produceExactAcceptanceFixtureEffectsV2({ store, policy, identity: admission.ref.identity,
    admission: admission.admission, dispatchAdmission: admission, stopAfterCommittedAnchor: true });
  expect(f.bridge.readReleasedUnacceptedEvidence()).toBeNull();
  let tick = Date.now() + 1000;
  const now = () => new Date(++tick).toISOString();
  const bridge = f.bridge;
  bridge.publishReleasePrepared({ lifecycleAuthorityDigest: f.captured.lifecycleAuthority.authorityDigest,
    landingReceipt: f.receipt, terminalSeal: f.terminalSeal, progressedAt: f.terminalSeal.committedAt });
  for (const resourceKind of ['provider-container', 'workspace-volume', 'dependency-volume'] as const) {
    const intent = bridge.publishCleanupDeleteIntent({ mode: 'RELEASE', resourceKind, progressedAt: now() }).progress;
    const resource = intent.resources.find(r => r.resourceKind === resourceKind)!;
    const observedAt = now();
    bridge.publishCleanupAbsence({ mode: 'RELEASE', progressedAt: now(), evidence: { disposition: 'RECONCILED_ABSENCE',
      absence: createExecutionEffectDockerReconciledAbsenceReceiptV1({ resourceKind, resourceName: resource.resourceName,
        resourceIdentityDigest: resource.resourceIdentityDigest, cleanupAuthorityDigest: f.receipt.receiptDigest,
        deleteIntentDigest: intent.deleteIntentDigest!, observedAt }) } });
  }
  bridge.publishCleanupTerminal({ mode: 'RELEASE', progressedAt: now() });
  const evidence = bridge.readReleasedUnacceptedEvidence();
  expect(evidence).not.toBeNull();
  expect(bridge.readCommittedReleasePendingEvidence()).toBeNull();
  const input = { admissionRef: admission.ref, policy, evidence: evidence!, recordedAt: now(),
    stoppedResourceEvidenceDigest: digest('8'), hostObservationDigest: digest('9'),
    recoveryAuthority: { executionId: 'sprint-721', taskId: 'sprint-721', attemptId: 'recovery-721',
      fenceToken: 'fence-721', approvalRef: 'owner-721', idempotencyKey: 'once-721' } };
  return { store, adapter, options, input, identity: admission.ref.identity, bridge };
}

afterEach(() => vi.unstubAllEnvs());
describe('released unaccepted effect preservation', () => {
  it('preserves all bytes, survives restart and replays without acceptance', async () => {
    const f = await fixture();
    const before = new Map(f.adapter.files);
    const retained = f.store.retainEffectReleasedUnacceptedDispatch(f.input);
    expect(retained.state).toBe('RELEASED_EFFECT_UNACCEPTED');
    expect(() => f.store.publishHostArtifact({ identity: f.identity, policy: f.input.policy,
      admissionReceiptDigest: f.input.admissionRef.admissionReceiptDigest,
      artifactClass: 'canonical-accepted-result', artifactKey: 'late-accepted',
      capturedAt: f.input.recordedAt, bytes: '{}' })).toThrow();
    expect(f.store.readChain(f.identity, f.input.policy, 'accepted-result')).toBeNull();
    const cold = TaskAttemptCustodyStore.open({ ...f.options, create: false });
    expect(cold.readEffectReleasedUnacceptedDispatch({ admissionRef: f.input.admissionRef, policy: f.input.policy })).toEqual(retained);
    const count = f.adapter.files.size;
    expect(cold.retainEffectReleasedUnacceptedDispatch(f.input)).toEqual(retained);
    expect(f.adapter.files.size).toBe(count);
    for (const [path, value] of before) expect(f.adapter.files.get(path)).toEqual(value);
    expect(() => cold.retainEffectReleasedUnacceptedDispatch({ ...f.input, recoveryAuthority: {
      ...f.input.recoveryAuthority, idempotencyKey: 'conflict',
    } })).toThrow();
  });

  it('refuses wrong sprint authority and a timestamp older than release', async () => {
    const f = await fixture();
    expect(() => f.store.retainEffectReleasedUnacceptedDispatch({ ...f.input,
      recoveryAuthority: { ...f.input.recoveryAuthority, executionId: 'sprint-722', taskId: 'sprint-722' } })).toThrow();
    expect(() => f.store.retainEffectReleasedUnacceptedDispatch({ ...f.input,
      recordedAt: '2026-09-05T09:00:00.000Z' })).toThrow();
    expect(f.store.readEffectReleasedUnacceptedDispatch({ admissionRef: f.input.admissionRef, policy: f.input.policy })).toBeNull();
  });

  it('refuses replaced release evidence instead of accepting a digest assertion', async () => {
    const f = await fixture();
    expect(() => f.store.retainEffectReleasedUnacceptedDispatch({ ...f.input, evidence: {
      ...f.input.evidence, releaseProgress: { ...f.input.evidence.releaseProgress, contentDigest: digest('0') },
    } })).toThrow();
    expect(f.store.readEffectReleasedUnacceptedDispatch({ admissionRef: f.input.admissionRef, policy: f.input.policy })).toBeNull();
  });
});
