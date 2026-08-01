import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_WIRING_CONTRACT_VERSION,
  resolveProductionWiringContract,
  type ProductionWiringContractV1,
  type ProductionWiringEvidence,
} from '../../src/core/production-wiring-contract.js';

const completeAuthorityEvidence: ProductionWiringEvidence = {
  state: 'complete',
  basis: 'authority-record',
  evidenceRefs: ['authority:task-contract:sha256'],
};

const executedEvidence: ProductionWiringEvidence = {
  state: 'complete',
  basis: 'host-attested-execution',
  evidenceRefs: ['receipt:host-execution:001'],
};

function contract(
  overrides: Partial<ProductionWiringContractV1> = {},
): ProductionWiringContractV1 {
  return {
    version: PRODUCTION_WIRING_CONTRACT_VERSION,
    changeKind: 'runtime-change',
    producer: {
      producerId: 'runtime.producer',
      evidence: completeAuthorityEvidence,
    },
    canonicalConsumer: {
      consumerId: 'runtime.canonical-consumer',
      relationship: 'invokes-producer',
      evidence: executedEvidence,
    },
    affectedIngresses: [{
      ingressId: 'terminal.entrypoint',
      kind: 'entrypoint',
      evidence: executedEvidence,
    }],
    enablementAuthority: {
      authorityId: 'effective-config.policy',
      mechanism: 'policy',
      evidence: completeAuthorityEvidence,
    },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{
      proofTargetId: 'terminal-to-consumer',
      kind: 'ingress-execution',
      evidence: executedEvidence,
    }],
    ...overrides,
  };
}

describe('production wiring contract', () => {
  it('resolves a fully evidenced production path without a generic wired boolean', () => {
    const decision = resolveProductionWiringContract(contract());

    expect(decision).toEqual({
      version: PRODUCTION_WIRING_CONTRACT_VERSION,
      decision: 'complete',
      disposition: 'production-wired',
      evidenceRefs: [
        'authority:task-contract:sha256',
        'receipt:host-execution:001',
      ],
    });
    expect(decision).not.toHaveProperty('wired');
  });

  it('holds incomplete topology and evidence with stable typed reasons', () => {
    const decision = resolveProductionWiringContract(contract({
      affectedIngresses: [],
      proofTargets: [{
        proofTargetId: 'consumer-proof',
        kind: 'consumer-execution',
        evidence: {
          state: 'incomplete',
          reasonCode: 'not-executed',
          evidenceRefs: [],
        },
      }],
    }));

    expect(decision.decision).toBe('incomplete');
    expect(decision.disposition).toBe('hold');
    if (decision.disposition !== 'hold') throw new Error('expected hold');
    expect(decision.issues.map(candidate => candidate.reasonCode)).toEqual([
      'missing-affected-ingress',
      'evidence-incomplete',
    ]);
  });

  it('resolves unsupported capability separately from incomplete evidence', () => {
    const decision = resolveProductionWiringContract(contract({
      enablementAuthority: {
        authorityId: 'native-platform-policy',
        mechanism: 'policy',
        evidence: {
          state: 'unsupported',
          reasonCode: 'environment-unavailable',
          evidenceRefs: ['capability:native-platform:unsupported'],
        },
      },
    }));

    expect(decision.decision).toBe('unsupported');
    if (decision.disposition !== 'hold') throw new Error('expected hold');
    expect(decision.issues).toContainEqual(expect.objectContaining({
      target: 'enablement-authority',
      reasonCode: 'evidence-unsupported',
    }));
  });

  it('fails closed on contradictory evidence with precedence over unsupported evidence', () => {
    const decision = resolveProductionWiringContract(contract({
      canonicalConsumer: {
        consumerId: 'runtime.canonical-consumer',
        relationship: 'invokes-producer',
        evidence: {
          state: 'contradictory',
          reasonCode: 'observation-conflict',
          evidenceRefs: ['observation:a', 'observation:b'],
        },
      },
      enablementAuthority: {
        authorityId: 'platform-policy',
        mechanism: 'policy',
        evidence: {
          state: 'unsupported',
          reasonCode: 'adapter-unavailable',
          evidenceRefs: ['adapter:none'],
        },
      },
    }));

    expect(decision.decision).toBe('contradictory');
    if (decision.disposition !== 'hold') throw new Error('expected hold');
    expect(decision.issues.map(candidate => candidate.reasonCode)).toEqual([
      'evidence-contradictory',
      'evidence-unsupported',
    ]);
  });

  it.each([
    ['code-presence', 'source:file'],
    ['test-presence', 'test:file'],
    ['static-reachability', 'graph:edge'],
    ['import-count', 'imports:4'],
  ] as const)('never promotes %s evidence to completion', (basis, evidenceRef) => {
    const decision = resolveProductionWiringContract(contract({
      canonicalConsumer: {
        consumerId: 'runtime.canonical-consumer',
        relationship: 'invokes-producer',
        evidence: {
          state: 'presence-only',
          basis,
          evidenceRefs: [evidenceRef],
        },
      },
    }));

    expect(decision.decision).toBe('incomplete');
    if (decision.disposition !== 'hold') throw new Error('expected hold');
    expect(decision.issues).toContainEqual(expect.objectContaining({
      target: 'canonical-consumer',
      reasonCode: 'presence-only-evidence',
    }));
  });

  it('requires an executed proof target even when an authority record declares it complete', () => {
    const decision = resolveProductionWiringContract(contract({
      proofTargets: [{
        proofTargetId: 'declared-only-proof',
        kind: 'consumer-execution',
        evidence: completeAuthorityEvidence,
      }],
    }));

    expect(decision.decision).toBe('incomplete');
    if (decision.disposition !== 'hold') throw new Error('expected hold');
    expect(decision.issues[0]?.reasonCode).toBe('proof-target-not-executed');
  });

  it('does not grant public-library changes an implicit wiring exemption', () => {
    const decision = resolveProductionWiringContract(contract({
      changeKind: 'public-library',
      affectedIngresses: [],
      proofTargets: [],
    }));

    expect(decision.decision).toBe('incomplete');
    if (decision.disposition !== 'hold') throw new Error('expected hold');
    expect(decision.issues.map(candidate => candidate.reasonCode)).toEqual([
      'missing-affected-ingress',
      'missing-proof-target',
    ]);
  });

  it('accepts Task 25 only as a same-DAG staged foundation with an outer barrier', () => {
    const closureTaskIds = ['486-026', '486-029', '486-030', '486-031'];
    const decision = resolveProductionWiringContract(contract({
      changeKind: 'foundation',
      disposition: {
        kind: 'staged-foundation',
        foundationTaskId: '486-025',
        dagId: 'sprint-486',
        closureTasks: closureTaskIds.map(taskId => ({ taskId, dagId: 'sprint-486' })),
        outerSettlementBarrier: {
          kind: 'block-until-exact-closure-settles',
          dagId: 'sprint-486',
          closureTaskIds,
        },
      },
    }));

    expect(decision).toMatchObject({
      decision: 'staged-foundation',
      disposition: 'staged-foundation',
      dagId: 'sprint-486',
      foundationTaskId: '486-025',
      closureTaskIds,
      outerSettlement: 'blocked-pending-exact-closure',
    });
  });

  it.each([
    {
      name: 'foreign DAG task',
      closureTasks: [
        { taskId: '486-026', dagId: 'sprint-486' },
        { taskId: '486-031', dagId: 'sprint-foreign' },
      ],
      barrierDagId: 'sprint-486',
      barrierTaskIds: ['486-026', '486-031'],
      reasonCode: 'closure-task-dag-conflict',
    },
    {
      name: 'non-exact barrier task set',
      closureTasks: [
        { taskId: '486-026', dagId: 'sprint-486' },
        { taskId: '486-031', dagId: 'sprint-486' },
      ],
      barrierDagId: 'sprint-486',
      barrierTaskIds: ['486-026'],
      reasonCode: 'closure-barrier-task-conflict',
    },
    {
      name: 'foreign barrier DAG',
      closureTasks: [{ taskId: '486-031', dagId: 'sprint-486' }],
      barrierDagId: 'sprint-foreign',
      barrierTaskIds: ['486-031'],
      reasonCode: 'closure-barrier-dag-conflict',
    },
  ])('rejects a staged foundation with $name', ({
    closureTasks,
    barrierDagId,
    barrierTaskIds,
    reasonCode,
  }) => {
    const decision = resolveProductionWiringContract(contract({
      changeKind: 'foundation',
      disposition: {
        kind: 'staged-foundation',
        foundationTaskId: '486-025',
        dagId: 'sprint-486',
        closureTasks,
        outerSettlementBarrier: {
          kind: 'block-until-exact-closure-settles',
          dagId: barrierDagId,
          closureTaskIds: barrierTaskIds,
        },
      },
    }));

    expect(decision.decision).toBe('contradictory');
    if (decision.disposition !== 'hold') throw new Error('expected hold');
    expect(decision.issues.map(candidate => candidate.reasonCode)).toContain(reasonCode);
  });

  it('rejects a foundation that claims ordinary production completion', () => {
    const decision = resolveProductionWiringContract(contract({
      changeKind: 'foundation',
      disposition: { kind: 'production-wiring' },
    }));

    expect(decision.decision).toBe('contradictory');
    if (decision.disposition !== 'hold') throw new Error('expected hold');
    expect(decision.issues[0]?.reasonCode).toBe('foundation-disposition-required');
  });
});
