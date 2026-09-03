import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canonicalTaskAttemptCustodyJson,
  type Sha256Digest,
} from '../../src/core/task-attempt-custody-store.js';
import { createExactAcceptedTaskResultRefV2 } from '../../src/core/task-settlement-authority.js';
import {
  readExactAcceptedTaskTerminalAuthority,
  settleExactAcceptedTaskEvaluation,
  type SettleExactAcceptedTaskEvaluationInput,
} from '../../src/orchestra/evaluation-audit-trail.js';
import {
  exactDockerDispatchCanonicalDigest,
  parseExactDockerDispatchTaskSnapshotAuthority,
} from '../../src/orchestra/exact-docker-dispatch-task-authority.js';
import { readExactAcceptedTaskResultV2 } from '../../src/orchestra/task-result-authority.js';
import { createTaskResultSettlementV2Fixture } from '../helpers/task-result-settlement-v2-fixture.js';

const digest = (character: string): Sha256Digest => `sha256:${character.repeat(64)}`;

afterEach(() => vi.restoreAllMocks());

function installProviderExitAuthority(
  fixture: ReturnType<typeof createTaskResultSettlementV2Fixture>,
): void {
  const snapshot = fixture.store.readTaskSnapshot({
    identity: fixture.identity,
    policy: fixture.policy,
    admissionReceiptDigest: fixture.admission.receiptDigest,
  });
  const taskAuthority = snapshot === null
    ? null
    : parseExactDockerDispatchTaskSnapshotAuthority(snapshot.bytes, fixture.policy);
  if (taskAuthority === null) throw new Error('fixture dispatch authority unavailable');
  const admissionRef = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'task-attempt-custody-dispatch-admission-ref' as const,
    state: 'admitted' as const,
    dispatchRequestId: taskAuthority.dispatchRequestId,
    dispatchRequestMaterialDigest: digest('1'),
    reservationReceiptDigest: digest('2'),
    identity: fixture.identity,
    admissionReceiptDigest: fixture.admission.receiptDigest,
    refDigest: digest('3'),
  });
  const observedAt = '2026-08-30T20:00:06.000Z';
  const waitEvidence = Object.freeze({
    admissionRefDigest: admissionRef.refDigest,
    containerId: 'container-fixture-001',
    exitCode: 0,
    dockerWaitProcessExitCode: 0,
    dockerWaitSignal: null,
    stdoutSha256: digest('4'),
    stderrSha256: digest('5'),
    observedAt,
  });
  const bytes = canonicalTaskAttemptCustodyJson({
    schemaVersion: 2,
    kind: 'exact-docker-provider-exit',
    ...waitEvidence,
    waitEvidenceDigest: exactDockerDispatchCanonicalDigest(waitEvidence, fixture.policy),
  }, fixture.policy.jsonBounds);
  vi.spyOn(fixture.store, 'readDispatchAdmission').mockImplementation(() => ({
    state: 'admitted',
    reservation: {
      receiptDigest: admissionRef.reservationReceiptDigest,
      dispatchRequestMaterialDigest: admissionRef.dispatchRequestMaterialDigest,
    },
    admission: fixture.admission,
    ref: admissionRef,
  }) as never);
  vi.spyOn(fixture.store, 'readDispatchAuthority').mockImplementation(() => ({
    state: 'terminal',
    reconciliation: null,
    authority: {
      state: 'RELEASED',
      admissionRef,
      backendExecutionId: 'container-fixture-001',
      providerExecutionAttempt: {
        providerExecutionAttemptId: 'provider-attempt-fixture-001',
        backendExecutionId: 'container-fixture-001',
        custodyIdentity: fixture.identity,
        admissionReceiptDigest: fixture.admission.receiptDigest,
      },
      releaseEvidence: { releasedAt: '2026-08-30T20:00:04.000Z' },
      recordedAt: '2026-08-30T20:00:04.000Z',
      projectionFence: digest('6'),
      receiptDigest: digest('7'),
    },
  }) as never);
  vi.spyOn(fixture.store, 'readDispatchObservationByClass').mockImplementation(() => ({
    receipt: {
      observedAt,
      receiptDigest: digest('8'),
      evidenceDigest: digest('9'),
    },
    bytes,
  }) as never);
}

function acceptedAuthority(key: string) {
  const fixture = createTaskResultSettlementV2Fixture({
    terminal: 'accepted-only',
    tailArtifactKey: key,
  });
  const acceptedResultRef = createExactAcceptedTaskResultRefV2(
    fixture.acceptedResultArtifact,
  );
  const read = readExactAcceptedTaskResultV2({
    executionMode: 'normal-docker',
    authorityKind: 'accepted-result',
    projectRoot: '/fixture/project',
    taskId: fixture.identity.taskId,
    custodyStore: fixture.store,
    policy: fixture.policy,
    expectedIdentity: fixture.identity,
    admission: fixture.admission,
    acceptedResultRef,
    expectedAcceptedResultChainDigest: fixture.acceptedResultChain.receiptDigest,
  });
  if (read.state !== 'exact-accepted' || read.exactAcceptedAuthority === undefined) {
    throw new Error(`fixture accepted authority unavailable: ${read.holdReason ?? read.state}`);
  }
  return { fixture, authority: read.exactAcceptedAuthority };
}

function input(key: string): SettleExactAcceptedTaskEvaluationInput {
  const { fixture, authority } = acceptedAuthority(key);
  installProviderExitAuthority(fixture);
  return {
    projectRoot: '/fixture/project',
    acceptedAuthority: authority,
    custodyStore: fixture.store,
    policy: fixture.policy,
  };
}

describe('exact accepted-result evaluation settlement', () => {
  it('re-reads the accepted result and admitted Task, then emits one durable terminal chain', () => {
    const request = input('t11-terminal');
    const settled = settleExactAcceptedTaskEvaluation(request);
    expect(settled).toMatchObject({ state: 'settled' });
    if (settled.state !== 'settled') return;
    expect(settled.authority.acceptedAuthority).toEqual(request.acceptedAuthority);
    expect(settled.authority.terminalDecisionAuthority.evaluationReceipt.verdict)
      .toMatch(/^(DONE|GO_WITH_TECH_DEBT|NO_GO)$/u);
    const settlementChain = request.custodyStore.readChain(
      request.acceptedAuthority.identity,
      request.policy,
      'settlement',
    );
    const archiveChain = request.custodyStore.readChain(
      request.acceptedAuthority.identity,
      request.policy,
      'archive',
    );
    expect(archiveChain).toMatchObject({
      predecessorDigest: settlementChain?.receiptDigest,
      stage: 'archive',
    });
    const archiveArtifact = archiveChain === null ? null : request.custodyStore.readVerifiedArtifact({
      identity: request.acceptedAuthority.identity,
      policy: request.policy,
      artifactClass: 'archive-receipt',
      artifactKey: archiveChain.artifactKey,
      receiptDigest: archiveChain.artifactReceiptDigest,
    });
    expect(archiveArtifact).not.toBeNull();
    expect(archiveArtifact === null ? null : JSON.parse(
      Buffer.from(archiveArtifact.bytes).toString('utf8'),
    )).toMatchObject({
      kind: 'task-result-settlement-v2-archive',
      state: 'archived',
      identity: request.acceptedAuthority.identity,
      predecessorDigest: settlementChain?.receiptDigest,
      externalAuthorityRefs: [{
        authorityType: 'task-result-settlement-v2',
        digest: settled.settlementDigest,
      }],
    });

    const reread = readExactAcceptedTaskTerminalAuthority({
      projectRoot: request.projectRoot,
      acceptedAuthority: request.acceptedAuthority,
      custodyStore: request.custodyStore,
      policy: request.policy,
      settlementRef: settled.settlementRef,
      expectedSettlementDigest: settled.settlementDigest,
    });
    expect(reread.state).toBe('current');
    if (reread.state === 'current') {
      const landingChain = request.custodyStore.readChain(
        request.acceptedAuthority.identity,
        request.policy,
        'effect-landing',
      );
      const landing = landingChain === null ? null : request.custodyStore.readVerifiedEffectLanding({
        identity: request.acceptedAuthority.identity,
        policy: request.policy,
        artifactKey: landingChain.artifactKey,
      });
      expect(reread.evaluationReceipt).toMatchObject({
        productionWiringSettlementDigest: null,
        effectLandingReceiptDigest: landing?.landing.receiptDigest,
      });
      expect(reread.evaluationReceipt.effectLandingBindingDigest)
        .toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(reread.evaluationReceipt.evaluationPolicyDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(reread.evaluationReceipt.providerExitAuthorityDigest)
        .toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(reread.evaluationReceipt.criterionEvaluationAuthorityDigest)
        .toMatch(/^sha256:[a-f0-9]{64}$/u);
    }
    const second = settleExactAcceptedTaskEvaluation(request);
    expect(second.state).toBe('settled');
    if (second.state !== 'settled') return;
    expect(second.settlementDigest).toBe(settled.settlementDigest);
    expect(second.settlementRef).toEqual(settled.settlementRef);
    expect(second.authority).toEqual(settled.authority);
    expect(request.custodyStore.readChain(
      request.acceptedAuthority.identity,
      request.policy,
      'archive',
    )?.receiptDigest).toBe(archiveChain?.receiptDigest);
  }, 120_000);

  it('adopts a durable evaluation artifact after a crash before chain publication', () => {
    const stage = 'evaluation' as const;
    const request = input('t11-partial-evaluation');
    const appendChain = request.custodyStore.appendChain.bind(request.custodyStore);
    let interrupted = false;
    const appendSpy = vi.spyOn(request.custodyStore, 'appendChain').mockImplementation(next => {
      if (!interrupted && next.stage === stage) {
        interrupted = true;
        throw new Error(`simulated-${stage}-chain-crash`);
      }
      return appendChain(next);
    });
    expect(settleExactAcceptedTaskEvaluation(request)).toEqual({
      state: 'hold',
      reasonCode: 'custody-hold',
    });
    appendSpy.mockRestore();

    const resumed = settleExactAcceptedTaskEvaluation(request);
    expect(interrupted).toBe(true);
    expect(resumed, JSON.stringify({
      resumed,
      evaluation: request.custodyStore.readChain(
        request.acceptedAuthority.identity,
        request.policy,
        'evaluation',
      )?.receiptDigest ?? null,
      finalizer: request.custodyStore.readChain(
        request.acceptedAuthority.identity,
        request.policy,
        'finalizer',
      )?.receiptDigest ?? null,
      settlement: request.custodyStore.readChain(
        request.acceptedAuthority.identity,
        request.policy,
        'settlement',
      )?.receiptDigest ?? null,
    })).toMatchObject({ state: 'settled' });
  }, 60_000);

  it('adopts a durable archive artifact after a crash before chain publication', () => {
    const request = input('t11-partial-archive');
    const appendChain = request.custodyStore.appendChain.bind(request.custodyStore);
    let interrupted = false;
    const appendSpy = vi.spyOn(request.custodyStore, 'appendChain').mockImplementation(next => {
      if (!interrupted && next.stage === 'archive') {
        interrupted = true;
        throw new Error('simulated-archive-chain-crash');
      }
      return appendChain(next);
    });
    expect(settleExactAcceptedTaskEvaluation(request)).toEqual({
      state: 'hold',
      reasonCode: 'custody-hold',
    });
    appendSpy.mockRestore();

    const resumed = settleExactAcceptedTaskEvaluation(request);
    expect(interrupted).toBe(true);
    expect(resumed).toMatchObject({ state: 'settled' });
    expect(request.custodyStore.readChain(
      request.acceptedAuthority.identity,
      request.policy,
      'archive',
    )).toMatchObject({ stage: 'archive' });
  }, 60_000);

  it('rejects caller fields, accessors, and proxies before writing evaluation state', () => {
    const request = input('t11-forged-input');
    const forged = {
      ...request,
      result: { selfAssessment: 'DONE', totalScore: 100 },
      evaluation: { decision: 'DONE', totalScore: 100 },
    } as unknown as SettleExactAcceptedTaskEvaluationInput;
    expect(settleExactAcceptedTaskEvaluation(forged)).toEqual({
      state: 'hold',
      reasonCode: 'invalid-terminal-input',
    });
    expect(request.custodyStore.readChain(
      request.acceptedAuthority.identity,
      request.policy,
      'evaluation',
    )).toBeNull();
    let invoked = 0;
    const accessor = { ...request } as Record<string, unknown>;
    Object.defineProperty(accessor, 'projectRoot', {
      enumerable: true,
      get: () => {
        invoked += 1;
        return '/fixture/project';
      },
    });
    expect(settleExactAcceptedTaskEvaluation(
      accessor as unknown as SettleExactAcceptedTaskEvaluationInput,
    )).toEqual({ state: 'hold', reasonCode: 'invalid-terminal-input' });
    expect(invoked).toBe(0);

    const proxy = new Proxy(request, { get: (target, key, receiver) => {
      invoked += 1;
      return Reflect.get(target, key, receiver);
    } });
    expect(settleExactAcceptedTaskEvaluation(proxy)).toEqual({
      state: 'hold',
      reasonCode: 'invalid-terminal-input',
    });
    expect(invoked).toBe(0);
  });

  it('holds before evaluation when durable provider-exit authority is absent', () => {
    const { fixture, authority } = acceptedAuthority('t11-provider-exit-missing');
    expect(settleExactAcceptedTaskEvaluation({
      projectRoot: '/fixture/project',
      acceptedAuthority: authority,
      custodyStore: fixture.store,
      policy: fixture.policy,
    })).toEqual({
      state: 'hold',
      reasonCode: 'provider-exit-dispatch-admission-unavailable',
    });
    expect(fixture.store.readChain(fixture.identity, fixture.policy, 'evaluation')).toBeNull();
  });
});
