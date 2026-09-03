import { describe, expect, it } from 'vitest';

import {
  settleProductionWiringResultEvidence,
  type ProductionWiringHostConsumerExecutionEvidenceV2,
  type ProductionWiringHostConsumerExecutionEvidenceV1,
} from '../../src/core/task-result-settlement.js';
import {
  createProductionWiringPlanEvidence,
  createProductionWiringPlanEvidenceV2,
  type ProductionWiringResultEvidence,
} from '../../src/core/task-types.js';
import type { ProductionWiringContractV1 } from '../../src/core/production-wiring-contract.js';

function contract(): ProductionWiringContractV1 {
  const incomplete = {
    state: 'incomplete' as const,
    reasonCode: 'not-executed' as const,
    evidenceRefs: [] as readonly string[],
  };
  return {
    version: 1,
    changeKind: 'runtime-change',
    producer: { producerId: 'worker wiring evidence', evidence: incomplete },
    canonicalConsumer: {
      consumerId: 'task result settlement',
      relationship: 'invokes-producer',
      evidence: incomplete,
    },
    affectedIngresses: [{ ingressId: 'all workers', kind: 'ingress', evidence: incomplete }],
    enablementAuthority: {
      authorityId: 'host digest verification',
      mechanism: 'unconditional',
      evidence: incomplete,
    },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{
      proofTargetId: 'production-wiring-result-settlement',
      kind: 'consumer-execution',
      evidence: incomplete,
    }],
  };
}

function workerEvidence(contractDigest: string): ProductionWiringResultEvidence {
  return {
    version: 1,
    contractDigest,
    observedBy: 'worker',
    evidence: {
      state: 'presence-only',
      basis: 'static-reachability',
      evidenceRefs: ['worker-observation:sha256:abc'],
    },
  };
}

function hostEvidence(contractDigest: string): ProductionWiringHostConsumerExecutionEvidenceV1 {
  return {
    version: 1,
    contractDigest,
    observedBy: 'host',
    consumerId: 'task result settlement',
    evidenceRefs: ['host-consumer-execution:sha256:def'],
  };
}

function v2Plan() {
  const common = {
    observationGroupId: 'runtime-observation',
    harnessPath: 'scripts/trusted-host-proof.mjs',
    verifierAssetPaths: ['scripts/trusted-host-proof.mjs'],
    args: ['observe'],
    cwd: '.',
    timeoutMs: 30_000,
    outputLimitBytes: 64 * 1024,
    expectation: {
      kind: 'adapter-structured-outcome' as const,
      schemaId: 'deckent.test.production-wiring.v1',
      outcome: 'observed' as const,
    },
  };
  return createProductionWiringPlanEvidenceV2({
    version: 2,
    changeKind: 'runtime-change',
    producer: { producerId: 'runtime producer' },
    canonicalConsumer: {
      consumerId: 'task result settlement',
      relationship: 'invokes-producer',
    },
    affectedIngresses: [{ ingressId: 'cli start', kind: 'entrypoint' }],
    enablementAuthority: { authorityId: 'effective config', mechanism: 'policy' },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{
      proofTargetId: 'settlement execution',
      kind: 'consumer-execution',
    }],
    hostProofProgram: {
      network: 'forbidden',
      verifierAssets: [{
        path: common.harnessPath,
        sha256: `sha256:${'a'.repeat(64)}`,
        role: 'trusted-harness',
      }],
      platforms: [{
        platform: 'linux',
        state: 'supported',
        runnerAdapterId: 'docker-readonly-host-proof-v1',
        probes: [
          { target: { kind: 'producer', targetId: 'runtime producer' }, ...common },
          { target: { kind: 'canonical-consumer', targetId: 'task result settlement' }, ...common },
          { target: { kind: 'affected-ingress', targetId: 'cli start' }, ...common },
          { target: { kind: 'enablement-authority', targetId: 'effective config' }, ...common },
          { target: { kind: 'proof-target', targetId: 'settlement execution' }, ...common },
        ],
      },
      { platform: 'wsl2-linux', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' }],
    },
  });
}

function v2HostEvidence(
  plan: ReturnType<typeof v2Plan>,
): ProductionWiringHostConsumerExecutionEvidenceV2 {
  return {
    version: 2,
    contractDigest: plan.contractDigest,
    hostProofProgramDigest: plan.hostProofProgramDigest,
    observedBy: 'host',
    consumerId: plan.contract.canonicalConsumer.consumerId,
    effectLandingReceiptDigest: `sha256:${'b'.repeat(64)}`,
    effectLandingChainDigest: `sha256:${'c'.repeat(64)}`,
    proofRunDigest: `sha256:${'d'.repeat(64)}`,
    evidenceRefs: ['host-proof:sha256:bound'],
  };
}

describe('production wiring result settlement', () => {
  it('settles only when the exact plan digest and canonical host consumer execution agree', () => {
    const plan = createProductionWiringPlanEvidence(contract());

    expect(settleProductionWiringResultEvidence({
      plan,
      workerEvidence: workerEvidence(plan.contractDigest),
      hostConsumerExecution: hostEvidence(plan.contractDigest),
    })).toEqual({
      state: 'PRODUCTION_WIRED',
      contractDigest: plan.contractDigest,
      evidenceRefs: ['host-consumer-execution:sha256:def'],
    });
  });

  it('keeps a worker presence claim on HOLD until host consumer execution evidence is attached', () => {
    const plan = createProductionWiringPlanEvidence(contract());

    expect(settleProductionWiringResultEvidence({
      plan,
      workerEvidence: workerEvidence(plan.contractDigest),
    })).toEqual({ state: 'HOLD', reason: 'missing-host-consumer-execution' });
  });

  it.each([
    {
      name: 'worker digest mismatch',
      input: (digest: string) => ({ workerEvidence: workerEvidence('a'.repeat(64)), hostConsumerExecution: hostEvidence(digest) }),
      expected: 'worker-contract-mismatch',
    },
    {
      name: 'host canonical consumer mismatch',
      input: (digest: string) => ({
        workerEvidence: workerEvidence(digest),
        hostConsumerExecution: { ...hostEvidence(digest), consumerId: 'another consumer' },
      }),
      expected: 'host-consumer-identity-mismatch',
    },
    {
      name: 'empty host execution reference',
      input: (digest: string) => ({
        workerEvidence: workerEvidence(digest),
        hostConsumerExecution: { ...hostEvidence(digest), evidenceRefs: [] },
      }),
      expected: 'invalid-host-consumer-execution',
    },
  ])('holds on $name', ({ input, expected }) => {
    const plan = createProductionWiringPlanEvidence(contract());

    expect(settleProductionWiringResultEvidence({ plan, ...input(plan.contractDigest) }))
      .toEqual({ state: 'HOLD', reason: expected });
  });

  it('holds contradictory worker observations even when a host execution reference exists', () => {
    const plan = createProductionWiringPlanEvidence(contract());
    const contradictory: ProductionWiringResultEvidence = {
      ...workerEvidence(plan.contractDigest),
      evidence: {
        state: 'contradictory',
        reasonCode: 'observation-conflict',
        evidenceRefs: ['host-worker-conflict:sha256:ghi'],
      },
    };

    expect(settleProductionWiringResultEvidence({
      plan,
      workerEvidence: contradictory,
      hostConsumerExecution: hostEvidence(plan.contractDigest),
    })).toEqual({ state: 'HOLD', reason: 'worker-contradiction' });
  });

  it('settles V2 only with the exact host proof program and COMMITTED effect bindings', () => {
    const plan = v2Plan();
    const host = v2HostEvidence(plan);

    expect(settleProductionWiringResultEvidence({
      plan,
      workerEvidence: workerEvidence(plan.contractDigest),
      hostConsumerExecution: host,
    })).toEqual({
      state: 'PRODUCTION_WIRED',
      contractDigest: plan.contractDigest,
      hostProofProgramDigest: plan.hostProofProgramDigest,
      effectLandingReceiptDigest: host.effectLandingReceiptDigest,
      effectLandingChainDigest: host.effectLandingChainDigest,
      proofRunDigest: host.proofRunDigest,
      evidenceRefs: host.evidenceRefs,
    });
  });

  it('rejects V1, wrong-program and malformed effect authority at a V2 settlement boundary', () => {
    const plan = v2Plan();
    const host = v2HostEvidence(plan);

    expect(settleProductionWiringResultEvidence({
      plan,
      workerEvidence: workerEvidence(plan.contractDigest),
      hostConsumerExecution: hostEvidence(plan.contractDigest),
    })).toEqual({ state: 'HOLD', reason: 'host-proof-program-mismatch' });
    expect(settleProductionWiringResultEvidence({
      plan,
      workerEvidence: workerEvidence(plan.contractDigest),
      hostConsumerExecution: { ...host, hostProofProgramDigest: 'e'.repeat(64) },
    })).toEqual({ state: 'HOLD', reason: 'host-proof-program-mismatch' });
    expect(settleProductionWiringResultEvidence({
      plan,
      workerEvidence: workerEvidence(plan.contractDigest),
      hostConsumerExecution: { ...host, effectLandingReceiptDigest: 'worker-claim' as never },
    })).toEqual({ state: 'HOLD', reason: 'invalid-host-consumer-execution' });
  });
});
