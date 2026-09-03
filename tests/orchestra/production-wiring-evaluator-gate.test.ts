import { describe, expect, it } from 'vitest';

import {
  gateProductionWiringVerdict,
} from '../../src/orchestra/result-evaluator.js';
import {
  createProductionWiringPlanEvidence,
  type EvaluationResult,
  type Task,
} from '../../src/core/types.js';
import { createProductionWiringPlanEvidenceV2 } from '../../src/core/task-types.js';
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

function v2Task(): Task {
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
  const targets = [
    { kind: 'producer' as const, targetId: 'settled wiring evidence' },
    { kind: 'canonical-consumer' as const, targetId: 'Brain result evaluator' },
    { kind: 'affected-ingress' as const, targetId: 'Run' },
    { kind: 'enablement-authority' as const, targetId: 'production mutation' },
    { kind: 'proof-target' as const, targetId: 'production-wiring-evaluator-gate' },
  ];
  const authority = createProductionWiringPlanEvidenceV2({
    version: 2,
    changeKind: 'runtime-change',
    producer: { producerId: 'settled wiring evidence' },
    canonicalConsumer: {
      consumerId: 'Brain result evaluator',
      relationship: 'invokes-producer',
    },
    affectedIngresses: [{ ingressId: 'Run', kind: 'ingress' }],
    enablementAuthority: { authorityId: 'production mutation', mechanism: 'policy' },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{
      proofTargetId: 'production-wiring-evaluator-gate',
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
        probes: targets.map(target => ({ target, ...common })),
      },
      { platform: 'wsl2-linux', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'darwin', state: 'unsupported', reasonCode: 'owner-deferred' },
      { platform: 'win32', state: 'unsupported', reasonCode: 'owner-deferred' }],
    },
  });
  return { ...task(), productionWiring: authority };
}

function v2Settled(taskWithAuthority: Task): ProductionWiringResultSettlementDecision {
  const authority = taskWithAuthority.productionWiring;
  if (!authority || authority.version !== 2) throw new Error('V2 authority required');
  return {
    state: 'PRODUCTION_WIRED',
    contractDigest: authority.contractDigest,
    hostProofProgramDigest: authority.hostProofProgramDigest,
    effectLandingReceiptDigest: `sha256:${'b'.repeat(64)}`,
    effectLandingChainDigest: `sha256:${'c'.repeat(64)}`,
    proofRunDigest: `sha256:${'d'.repeat(64)}`,
    evidenceRefs: ['host-proof:bound'],
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

  it('preserves V2 DONE only when host proof and COMMITTED effect bindings are present', () => {
    const inputTask = v2Task();
    expect(gateProductionWiringVerdict(doneCandidate(), inputTask, v2Settled(inputTask)))
      .toMatchObject({ decision: 'DONE' });
  });

  it('fails closed when a V2 settlement omits or replays its proof authority', () => {
    const inputTask = v2Task();
    const complete = v2Settled(inputTask);
    const { proofRunDigest: _proofRunDigest, ...missingProof } = complete.state === 'PRODUCTION_WIRED'
      ? complete
      : neverReached();
    const wrongProgram = complete.state === 'PRODUCTION_WIRED'
      ? { ...complete, hostProofProgramDigest: 'e'.repeat(64) }
      : neverReached();
    const malformedEffect = complete.state === 'PRODUCTION_WIRED'
      ? { ...complete, effectLandingChainDigest: 'host-claimed-current' as never }
      : neverReached();

    expect(gateProductionWiringVerdict(
      doneCandidate(), inputTask, missingProof as ProductionWiringResultSettlementDecision,
    ).rubricScores.at(-1)?.reason).toBe('HOLD:host-settlement-proof-authority-mismatch');
    expect(gateProductionWiringVerdict(
      doneCandidate(), inputTask, wrongProgram,
    ).rubricScores.at(-1)?.reason).toBe('HOLD:host-settlement-proof-authority-mismatch');
    expect(gateProductionWiringVerdict(
      doneCandidate(), inputTask, malformedEffect,
    ).rubricScores.at(-1)?.reason).toBe('HOLD:host-settlement-proof-authority-mismatch');
  });
});

function neverReached(): never {
  throw new Error('fixture settlement must be PRODUCTION_WIRED');
}
