import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canonicalTaskAttemptCustodyJson,
  type Sha256Digest,
} from '../../src/core/task-attempt-custody-store.js';
import { taskResultV2Digest } from '../../src/core/task-result-schema.js';
import { createProductionWiringPlanEvidenceV2, type Task } from '../../src/core/task-types.js';
import { createExactAcceptedTaskResultRefV2 } from '../../src/core/task-settlement-authority.js';
import {
  readExactAcceptedTaskTerminalAuthority,
  settleExactAcceptedTaskEvaluation,
} from '../../src/orchestra/evaluation-audit-trail.js';
import {
  exactDockerDispatchCanonicalDigest,
  parseExactDockerDispatchTaskSnapshotAuthority,
} from '../../src/orchestra/exact-docker-dispatch-task-authority.js';
import {
  ensureExactProductionWiringHostSettlement,
  readExactProductionWiringHostSettlement,
  type ExactProductionWiringHostObserver,
  type ExactProductionWiringHostObservationRequestV2,
} from '../../src/orchestra/production-wiring-host-observation.js';
import {
  PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
  productionWiringHostProofTaskWriteScopeDigest,
} from '../../src/orchestra/production-wiring-host-proof-runner.js';
import {
  createTaskResultSettlementV2Fixture,
  type TaskResultAcceptedV2Fixture,
} from '../helpers/task-result-settlement-v2-fixture.js';

const digest = (character: string): Sha256Digest => `sha256:${character.repeat(64)}`;

function wiringPlan() {
  const verifierAssets = [
    { path: 'scripts/production-wiring-host-proof-harness.mjs', sha256: digest('a'), role: 'trusted-harness' as const },
    { path: 'scripts/lint-closure-dispositions.mjs', sha256: digest('b'), role: 'config-authority' as const },
    { path: 'scripts/closure-ledger/canonical.mjs', sha256: digest('c'), role: 'config-authority' as const },
    { path: 'scripts/master-plan-integrity.mjs', sha256: digest('d'), role: 'config-authority' as const },
    { path: 'scripts/approval-identity.mjs', sha256: digest('e'), role: 'config-authority' as const },
    { path: 'src/core/closure-classification-schema.json', sha256: digest('f'), role: 'config-authority' as const },
  ];
  const targets = [
    { kind: 'producer' as const, targetId: 'closure-os.append-only-ledger' },
    { kind: 'canonical-consumer' as const, targetId: 'closure-os.authority-gate' },
    { kind: 'affected-ingress' as const, targetId: 'closure-os.ledger-file-ingress' },
    { kind: 'enablement-authority' as const, targetId: 'closure-os.reviewed-trust-anchor' },
    { kind: 'proof-target' as const, targetId: 'closure-os.chain-identity-lifecycle-authority' },
  ];
  const timeoutMs = 30_000;
  const outputLimitBytes = 1024 * 1024;
  const args = [canonicalJson({
    adapterId: 'deckent-closure-os-authority-gate-v1',
    assets: verifierAssets,
    kind: 'deckent-production-wiring-host-proof-request-v1',
    outputLimitBytes,
    timeoutMs,
    version: 1,
  })];
  const common = {
    observationGroupId: 'deckent:closure-os-authority-gate',
    harnessPath: 'scripts/production-wiring-host-proof-harness.mjs',
    verifierAssetPaths: verifierAssets.map(asset => asset.path),
    args,
    cwd: '.',
    timeoutMs,
    outputLimitBytes,
    expectation: {
      kind: 'adapter-structured-outcome' as const,
      schemaId: 'deckent.host-proof.closure-os-authority-gate.v1',
      outcome: 'observed' as const,
    },
  };
  return createProductionWiringPlanEvidenceV2({
    version: 2,
    changeKind: 'runtime-change',
    producer: { producerId: 'closure-os.append-only-ledger' },
    canonicalConsumer: {
      consumerId: 'closure-os.authority-gate',
      relationship: 'invokes-producer',
    },
    affectedIngresses: [{
      ingressId: 'closure-os.ledger-file-ingress',
      kind: 'entrypoint',
    }],
    enablementAuthority: {
      authorityId: 'closure-os.reviewed-trust-anchor',
      mechanism: 'configuration',
    },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{
      proofTargetId: 'closure-os.chain-identity-lifecycle-authority',
      kind: 'consumer-execution',
    }],
    hostProofProgram: {
      network: 'forbidden',
      verifierAssets,
      platforms: [
        {
          platform: 'linux', state: 'supported',
          runnerAdapterId: PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
          probes: targets.map(target => ({ target, ...common })),
        },
        { platform: 'wsl2-linux', state: 'unsupported', reasonCode: 'owner-deferred' },
        { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
        { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' },
      ],
    },
  });
}

function workerEvidence(plan: ReturnType<typeof wiringPlan>) {
  return {
    version: 1 as const,
    contractDigest: plan.contractDigest,
    observedBy: 'worker' as const,
    evidence: {
      state: 'presence-only' as const,
      basis: 'static-reachability' as const,
      evidenceRefs: ['worker:production-wiring-static-observation'],
    },
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}

function canonicalDigest(value: unknown): Sha256Digest {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function proofRunForRequest(
  request: ExactProductionWiringHostObservationRequestV2,
  observedAt: string,
) {
  const plan = request.plan;
  const row = plan.contract.hostProofProgram.platforms.find(entry => entry.platform === 'linux');
  if (!row || row.state !== 'supported') throw new Error('fixture linux row missing');
  const representative = row.probes[0]!;
  const groupBody = {
    observationGroupId: representative.observationGroupId,
    schemaId: representative.expectation.schemaId,
    containerName: 'deckent-pw-fixture',
    imageId: digest('1'),
    harnessPath: representative.harnessPath,
    verifierAssets: plan.contract.hostProofProgram.verifierAssets.map(asset => ({
      ...asset, byteLength: 100,
    })),
    dockerArgvDigest: digest('2'),
    exitCode: 0 as const,
    stdoutSha256: digest('3'),
    stdoutByteLength: 100,
    stderrSha256: digest('4'),
    stderrByteLength: 0,
    structuredOutcomeDigest: digest('5'),
    cleanupAbsenceDigest: digest('6'),
  };
  const groupReceipt = {
    ...groupBody,
    groupReceiptDigest: canonicalDigest(groupBody),
  };
  const targetObservations = row.probes.map(probe => ({
    probeId: probe.probeId,
    observationGroupId: probe.observationGroupId,
    target: probe.target,
    evidenceRef: `host-proof:${groupReceipt.groupReceiptDigest}:${probe.probeId}`,
  }));
  const body = {
    version: 1 as const,
    kind: 'production-wiring-host-proof-run-v1' as const,
    state: 'observed' as const,
    runnerAdapterId: PRODUCTION_WIRING_DOCKER_RUNNER_ADAPTER_ID,
    platform: 'linux' as const,
    programDigest: plan.hostProofProgramDigest,
    attemptBinding: {
      projectRootSha256: request.identity.projectRootSha256,
      projectId: request.identity.projectId,
      taskId: request.identity.taskId,
      attemptId: request.identity.attemptId,
      generation: request.identity.generation,
      acceptedResultChainDigest: request.acceptedResultChainDigest,
      effectLandingReceiptDigest: request.effectAuthority.landingReceiptDigest,
      effectLandingChainDigest: request.effectAuthority.effectLandingChainDigest,
    },
    taskWriteScopeDigest: productionWiringHostProofTaskWriteScopeDigest(request.taskWriteScope),
    groupReceipts: [groupReceipt],
    targetObservations,
  };
  return { ...body, proofRunDigest: canonicalDigest(body), observedAt };
}

function completeObserver(observedAt = '2026-08-30T20:02:00.000Z'):
ExactProductionWiringHostObserver {
  return vi.fn(async request => {
    if (request.schemaVersion !== 2) return { state: 'hold', reasonCode: 'v2-required' };
    return {
      state: 'observed' as const,
      observedAt,
      observerId: 'deckent:docker-readonly-host-proof-v1',
      consumerId: 'closure-os.authority-gate',
      proofRun: proofRunForRequest(request, observedAt),
    };
  });
}

function fixtureInput(options: {
  readonly key?: string;
  readonly withWorkerEvidence?: boolean;
  readonly attemptId?: string;
} = {}) {
  const plan = wiringPlan();
  const fixture = createTaskResultSettlementV2Fixture({
    terminal: 'accepted-only',
    tailArtifactKey: options.key ?? 't12-production-wiring-host',
    attemptId: options.attemptId,
    productionWiring: plan,
    ...(options.withWorkerEvidence === false
      ? {}
      : { productionWiringEvidence: workerEvidence(plan) }),
  });
  const task = {
    id: fixture.identity.taskId,
    scope: {
      directories: ['src/orchestra'],
      filesRead: ['src/orchestra/input.ts'],
      filesWrite: ['src/orchestra/output.ts'],
    },
    productionWiring: plan,
  } as Task;
  const acceptedAuthority = Object.freeze({
    executionMode: 'normal-docker' as const,
    identity: fixture.identity,
    admissionReceiptDigest: fixture.admission.receiptDigest,
    acceptedResultRef: createExactAcceptedTaskResultRefV2(fixture.acceptedResultArtifact),
    acceptedResultChainDigest: fixture.acceptedResultChain.receiptDigest,
    resultDigest: taskResultV2Digest(fixture.result, fixture.policy.jsonBounds),
  });
  return {
    fixture,
    input: {
      acceptedAuthority,
      task,
      result: fixture.result,
      custodyStore: fixture.store,
      policy: fixture.policy,
    },
  };
}

function installProviderExitAuthority(fixture: TaskResultAcceptedV2Fixture): void {
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

describe('exact production-wiring host settlement', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps production wiring on typed HOLD when no trusted host observer is composed', async () => {
    const { input } = fixtureInput({ key: 't12-no-observer' });
    await expect(ensureExactProductionWiringHostSettlement(input)).resolves.toEqual({
      state: 'hold',
      reasonCode: 'host-observer-unavailable',
    });
    expect(readExactProductionWiringHostSettlement(input)).toEqual({
      state: 'hold',
      reasonCode: 'host-observation-unavailable',
    });
  });

  it('persists, re-reads, and fans the same host settlement into T11 terminal authority', async () => {
    const { fixture, input } = fixtureInput({ key: 't12-positive-roundtrip' });
    const observer = completeObserver();
    const ensured = await ensureExactProductionWiringHostSettlement({ ...input, observer });
    expect(ensured).toMatchObject({ state: 'current' });
    if (ensured.state !== 'current') return;
    expect(ensured.receipt).toMatchObject({
      schemaVersion: 2,
      kind: 'exact-production-wiring-host-settlement-v2',
      hostProofProgramDigest: input.task.productionWiring?.version === 2
        ? input.task.productionWiring.hostProofProgramDigest : undefined,
    });
    expect('proofRun' in ensured.receipt && ensured.receipt.proofRun.attemptBinding)
      .toMatchObject({
        acceptedResultChainDigest: input.acceptedAuthority.acceptedResultChainDigest,
        effectLandingReceiptDigest: fixture.result.attemptCustody.effectLanding.landingReceiptDigest,
        effectLandingChainDigest: fixture.result.attemptCustody.effectLanding.effectLandingChainDigest,
      });
    expect(readExactProductionWiringHostSettlement(input)).toEqual(ensured);

    const shouldNotRun = vi.fn(async () => {
      throw new Error('existing durable observation must be reused');
    });
    await expect(ensureExactProductionWiringHostSettlement({
      ...input,
      observer: shouldNotRun,
    })).resolves.toEqual(ensured);
    expect(observer).toHaveBeenCalledOnce();
    expect(shouldNotRun).not.toHaveBeenCalled();

    installProviderExitAuthority(fixture);
    const settled = settleExactAcceptedTaskEvaluation({
      projectRoot: '/fixture/project',
      acceptedAuthority: input.acceptedAuthority,
      custodyStore: fixture.store,
      policy: fixture.policy,
    });
    expect(settled).toMatchObject({ state: 'settled' });
    if (settled.state !== 'settled') return;
    const terminal = readExactAcceptedTaskTerminalAuthority({
      projectRoot: '/fixture/project',
      acceptedAuthority: input.acceptedAuthority,
      custodyStore: fixture.store,
      policy: fixture.policy,
      settlementRef: settled.settlementRef,
      expectedSettlementDigest: settled.settlementDigest,
    });
    expect(terminal).toMatchObject({ state: 'current' });
    if (terminal.state !== 'current') return;
    expect(terminal.evaluationReceipt.productionWiringSettlementDigest)
      .toBe(ensured.receipt.settlementDigest);
    expect(terminal.evaluationReceipt.productionWiringSettlementArtifactReceiptDigest)
      .toBe(ensured.artifactReceipt.receiptDigest);
  }, 60_000);

  it('leaves no T11 terminal artifacts when the trusted host observer is unavailable', () => {
    const { fixture, input } = fixtureInput({ key: 't12-no-observer-no-terminal' });
    installProviderExitAuthority(fixture);
    const filesBefore = [...fixture.adapter.files.keys()].sort();
    expect(settleExactAcceptedTaskEvaluation({
      projectRoot: '/fixture/project',
      acceptedAuthority: input.acceptedAuthority,
      custodyStore: fixture.store,
      policy: fixture.policy,
    })).toEqual({
      state: 'hold',
      reasonCode: 'production-wiring-host-observation-unavailable',
    });
    expect(fixture.adapter.files.keys()).toEqual(expect.anything());
    expect([...fixture.adapter.files.keys()].sort()).toEqual(filesBefore);
    for (const stage of ['evaluation', 'finalizer', 'settlement'] as const) {
      expect(fixture.store.readChain(fixture.identity, fixture.policy, stage)).toBeNull();
    }
  });

  it('rejects an observer that does not machine-bind ingress, enablement and proof targets', async () => {
    const { input } = fixtureInput({ key: 't12-invalid-observation-set' });
    const observer: ExactProductionWiringHostObserver = vi.fn(async request => {
      if (request.schemaVersion !== 2) return { state: 'hold', reasonCode: 'v2-required' };
      const proofRun = proofRunForRequest(request, '2026-08-30T20:02:00.000Z');
      return {
        state: 'observed' as const,
        observedAt: proofRun.observedAt,
        observerId: 'deckent:docker-readonly-host-proof-v1',
        consumerId: 'closure-os.authority-gate',
        proofRun: { ...proofRun, targetObservations: [] },
      };
    });
    await expect(ensureExactProductionWiringHostSettlement({
      ...input,
      observer,
    })).resolves.toEqual({ state: 'hold', reasonCode: 'host-proof-run-invalid' });
    expect(observer).toHaveBeenCalledOnce();
  });

  it('rejects a proof receipt whose group harness is not the digest-bound plan harness', async () => {
    const { input } = fixtureInput({ key: 't12-invalid-group-binding' });
    const observer: ExactProductionWiringHostObserver = vi.fn(async request => {
      if (request.schemaVersion !== 2) return { state: 'hold', reasonCode: 'v2-required' };
      const proofRun = proofRunForRequest(request, '2026-08-30T20:02:00.000Z');
      const originalGroup = proofRun.groupReceipts[0]!;
      const { groupReceiptDigest: _groupReceiptDigest, ...originalGroupBody } = originalGroup;
      const mutatedGroupBody = { ...originalGroupBody, harnessPath: 'worker-authored-proof' };
      const mutatedGroup = {
        ...mutatedGroupBody,
        groupReceiptDigest: canonicalDigest(mutatedGroupBody),
      };
      const mutatedTargets = proofRun.targetObservations.map(entry => ({
        ...entry,
        evidenceRef: `host-proof:${mutatedGroup.groupReceiptDigest}:${entry.probeId}`,
      }));
      const {
        proofRunDigest: _proofRunDigest,
        observedAt,
        ...proofBody
      } = proofRun;
      const mutatedProofBody = {
        ...proofBody,
        groupReceipts: [mutatedGroup],
        targetObservations: mutatedTargets,
      };
      return {
        state: 'observed' as const,
        observedAt,
        observerId: 'deckent:docker-readonly-host-proof-v1',
        consumerId: 'closure-os.authority-gate',
        proofRun: {
          ...mutatedProofBody,
          proofRunDigest: canonicalDigest(mutatedProofBody),
          observedAt,
        },
      };
    });

    await expect(ensureExactProductionWiringHostSettlement({ ...input, observer }))
      .resolves.toEqual({ state: 'hold', reasonCode: 'host-proof-run-invalid' });
  });

  it('rejects a host observation timestamp older than the exact accepted-result chain', async () => {
    const { input } = fixtureInput({ key: 't12-old-observation' });
    const observer: ExactProductionWiringHostObserver = vi.fn(async request => {
      if (request.schemaVersion !== 2) return { state: 'hold', reasonCode: 'v2-required' };
      const observedAt = '2026-08-30T19:59:00.000Z';
      return {
        state: 'observed' as const,
        observedAt,
        observerId: 'deckent:docker-readonly-host-proof-v1',
        consumerId: 'closure-os.authority-gate',
        proofRun: proofRunForRequest(request, observedAt),
      };
    });
    await expect(ensureExactProductionWiringHostSettlement({
      ...input,
      observer,
    })).resolves.toEqual({ state: 'hold', reasonCode: 'host-observation-invalid' });
  });

  it('does not promote host observation when immutable worker evidence is absent', async () => {
    const { input } = fixtureInput({
      key: 't12-missing-worker-evidence',
      withWorkerEvidence: false,
    });
    const observer = completeObserver();
    await expect(ensureExactProductionWiringHostSettlement({
      ...input,
      observer,
    })).resolves.toEqual({ state: 'hold', reasonCode: 'missing-worker-evidence' });
    expect(readExactProductionWiringHostSettlement(input)).toEqual({
      state: 'hold',
      reasonCode: 'host-observation-unavailable',
    });
  });

  it('rejects tampered durable bytes, sibling attempts, and accepted-chain replay', async () => {
    const first = fixtureInput({
      key: 't12-replay-first',
      attemptId: '123e4567-e89b-42d3-a456-426614174101',
    });
    const sibling = fixtureInput({
      key: 't12-replay-sibling',
      attemptId: '123e4567-e89b-42d3-a456-426614174102',
    });
    const ensured = await ensureExactProductionWiringHostSettlement({
      ...first.input,
      observer: completeObserver(),
    });
    expect(ensured).toMatchObject({ state: 'current' });
    if (ensured.state !== 'current') return;

    expect(readExactProductionWiringHostSettlement({
      ...sibling.input,
      acceptedAuthority: first.input.acceptedAuthority,
    })).toEqual({ state: 'hold', reasonCode: 'accepted-chain-unavailable' });
    expect(readExactProductionWiringHostSettlement({
      ...first.input,
      acceptedAuthority: Object.freeze({
        ...first.input.acceptedAuthority,
        acceptedResultChainDigest: sibling.input.acceptedAuthority.acceptedResultChainDigest,
      }),
    })).toEqual({ state: 'hold', reasonCode: 'accepted-chain-unavailable' });

    const target = [...first.fixture.adapter.files.entries()].find(([, file]) => (
      `sha256:${createHash('sha256').update(file.bytes).digest('hex')}`
        === ensured.artifactReceipt.artifact.sha256
    ));
    if (!target) throw new Error('host settlement bytes unavailable in fixture adapter');
    const [path, file] = target;
    first.fixture.adapter.files.set(path, {
      ...file,
      bytes: Buffer.from('{"tampered":true}', 'utf8'),
    });
    expect(readExactProductionWiringHostSettlement(first.input)).toEqual({
      state: 'hold',
      reasonCode: 'host-observation-replay-mismatch',
    });
  });
});
