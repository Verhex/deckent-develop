import { describe, expect, it } from 'vitest';

import {
  settleProductionWiringResultEvidence,
  type ProductionWiringHostConsumerExecutionEvidenceV1,
} from '../../src/core/task-result-settlement.js';
import {
  createProductionWiringPlanEvidence,
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
});
