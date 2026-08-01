import { describe, expect, it } from 'vitest';

import {
  gateProductionWiringVerdict,
} from '../../src/orchestra/result-evaluator.js';
import {
  createProductionWiringPlanEvidence,
  type EvaluationResult,
  type Task,
} from '../../src/core/types.js';
import type { ProductionWiringContractV1 } from '../../src/core/production-wiring-contract.js';
import type { ProductionWiringResultSettlementDecision } from '../../src/core/task-result-settlement.js';

const completeEvidence = {
  state: 'complete',
  basis: 'host-attested-execution',
  evidenceRefs: ['host:consumer-execution'],
} as const;

function contract(
  overrides: Partial<ProductionWiringContractV1> = {},
): ProductionWiringContractV1 {
  return {
    version: 1,
    changeKind: 'runtime-change',
    producer: { producerId: 'settled wiring evidence', evidence: completeEvidence },
    canonicalConsumer: {
      consumerId: 'Brain result evaluator',
      relationship: 'invokes-producer',
      evidence: completeEvidence,
    },
    affectedIngresses: ['Sprint', 'Run', 'Flow', 'Do', 'Autonomous', 'Process'].map(ingressId => ({
      ingressId,
      kind: 'ingress' as const,
      evidence: completeEvidence,
    })),
    enablementAuthority: {
      authorityId: 'production mutation',
      mechanism: 'policy',
      evidence: completeEvidence,
    },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{
      proofTargetId: 'production-wiring-evaluator-gate',
      kind: 'consumer-execution',
      evidence: completeEvidence,
    }],
    ...overrides,
  };
}

function task(wiringContract: ProductionWiringContractV1 = contract()): Task {
  return {
    id: '487-028',
    title: 'Brain production wiring gate',
    description: 'Require host-settled wiring evidence',
    type: 'code-development',
    status: 'EXECUTING',
    priority: 'HIGH',
    model: 'gpt-5.6-sol',
    effort: 'high',
    dependencies: [],
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/result-evaluator.ts'],
    },
    goNogo: { goCriteria: 'wired', noGoCriteria: 'unwired', techDebtAcceptable: '' },
    sprintId: 'sprint-487',
    assignedAgent: 'implementer',
    assignedSkills: [],
    productionWiring: createProductionWiringPlanEvidence(wiringContract),
  };
}

function doneCandidate(): EvaluationResult {
  return {
    decision: 'DONE',
    totalScore: 97,
    rubricScores: [{ criterion: 'correctness', score: 100, passed: true, reason: 'tests passed' }],
    retryCount: 0,
  };
}

function settled(taskWithAuthority: Task): ProductionWiringResultSettlementDecision {
  const contractDigest = taskWithAuthority.productionWiring?.contractDigest;
  if (!contractDigest) throw new Error('test task must carry production wiring authority');
  return {
    state: 'PRODUCTION_WIRED',
    contractDigest,
    evidenceRefs: ['host:brain-result-evaluator:consumer-execution'],
  };
}

describe('Brain production wiring evaluator gate', () => {
  it('preserves DONE only for exact host-settled production wiring evidence', () => {
    const inputTask = task();

    const evaluation = gateProductionWiringVerdict(doneCandidate(), inputTask, settled(inputTask));

    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBe(97);
    expect(evaluation.rubricScores.at(-1)).toMatchObject({
      criterion: 'production_wiring',
      passed: true,
    });
  });

  it('blocks a green-score DONE when host settlement is absent', () => {
    const evaluation = gateProductionWiringVerdict(doneCandidate(), task(), undefined);

    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.totalScore).toBe(97);
    expect(evaluation.rubricScores.at(-1)?.reason).toBe('HOLD:missing-host-settlement');
  });

  it('blocks worker-only or contradictory settlement decisions', () => {
    const inputTask = task();
    const hold: ProductionWiringResultSettlementDecision = {
      state: 'HOLD',
      reason: 'worker-contradiction',
    };

    const evaluation = gateProductionWiringVerdict(doneCandidate(), inputTask, hold);

    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.rubricScores.at(-1)?.reason).toBe('HOLD:worker-contradiction');
  });

  it('fails closed on unsupported declared ingress evidence', () => {
    const unsupported = contract({
      affectedIngresses: [{
        ingressId: 'Process',
        kind: 'ingress',
        evidence: {
          state: 'unsupported',
          reasonCode: 'adapter-unavailable',
          evidenceRefs: ['host:adapter-unavailable'],
        },
      }],
    });
    const inputTask = task(unsupported);

    const evaluation = gateProductionWiringVerdict(doneCandidate(), inputTask, settled(inputTask));

    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.rubricScores.at(-1)?.reason).toBe('HOLD:contract-unsupported');
  });

  it('keeps staged foundation incomplete until the exact closure barrier settles', () => {
    const closureTaskIds = ['487-025', '487-026', '487-027', '487-028', '487-029'];
    const staged = contract({
      changeKind: 'foundation',
      disposition: {
        kind: 'staged-foundation',
        foundationTaskId: '487-024',
        dagId: 'sprint-487',
        closureTasks: closureTaskIds.map(taskId => ({ taskId, dagId: 'sprint-487' })),
        outerSettlementBarrier: {
          kind: 'block-until-exact-closure-settles',
          dagId: 'sprint-487',
          closureTaskIds,
        },
      },
    });
    const inputTask = task(staged);

    const evaluation = gateProductionWiringVerdict(doneCandidate(), inputTask, settled(inputTask));

    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.rubricScores.at(-1)?.reason).toBe(
      'HOLD:staged-foundation-pending-exact-closure',
    );
  });

  it('never upgrades a lower verdict and leaves legacy tasks unchanged', () => {
    const debt = { ...doneCandidate(), decision: 'GO_WITH_TECH_DEBT' as const };
    const productionTask = task();
    const legacyTask = { ...productionTask, productionWiring: undefined };

    expect(gateProductionWiringVerdict(debt, productionTask, settled(productionTask))).toBe(debt);
    expect(gateProductionWiringVerdict(doneCandidate(), legacyTask, undefined)).toEqual(doneCandidate());
  });
});
