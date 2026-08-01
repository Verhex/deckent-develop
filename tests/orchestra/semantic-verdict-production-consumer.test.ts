import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  evaluateAcceptanceBoundSemanticVerdict,
  type SemanticVerdictAcceptanceEvidence,
} from '../../src/orchestra/result-evaluator.js';

const task: Task = {
  id: '486-016-proof',
  title: 'Acceptance-bound semantic verdict',
  description: 'Exercise the canonical production evaluator consumer.',
  model: 'test-model',
  effort: 'high',
  priority: 'HIGH',
  reason: 'production-consumer proof',
  scope: {
    directories: ['src/orchestra/', 'tests/orchestra/'],
    filesRead: [],
    filesWrite: [
      'src/orchestra/result-evaluator.ts',
      'tests/orchestra/semantic-verdict-production-consumer.test.ts',
    ],
  },
  dependencies: [],
  goNogo: {
    goCriteria: 'Canonical production consumer executes the semantic gate.',
    noGoCriteria: 'Score-only or zero-assertion success.',
    techDebtAcceptable: '',
  },
  status: TaskStatus.DONE,
};

const result: TaskResult = {
  taskId: task.id,
  workerId: 'w-486-016-proof',
  filesChanged: [
    'src/orchestra/result-evaluator.ts',
    'tests/orchestra/semantic-verdict-production-consumer.test.ts',
  ],
  linesAdded: 1,
  linesRemoved: 0,
  testsPassed: true,
  coverage: 100,
  selfAssessment: 'DONE',
  notes: 'Worker prose deliberately has no authority over this verdict.',
};

function acceptedEvidence(): SemanticVerdictAcceptanceEvidence {
  const producer = {
    moduleId: 'src/orchestra/result-evaluator.ts',
    exportName: 'gateSemanticVerdictByAcceptance',
    identity: 'production-export' as const,
  };
  const consumer = {
    moduleId: 'src/orchestra/result-evaluator.ts',
    exportName: 'evaluateAcceptanceBoundSemanticVerdict',
    identity: 'production-export' as const,
  };
  return {
    version: 1,
    taskId: task.id,
    authority: {
      kind: 'host-observed',
      receiptRef: 'host-evaluation:486-016-proof',
    },
    contract: {
      producer,
      consumer,
      proofTarget: 'semantic-verdict-production-consumer',
    },
    observation: {
      producer,
      consumer,
      proofTarget: 'semantic-verdict-production-consumer',
      assertions: {
        receiptRef: 'vitest:semantic-verdict-production-consumer:passed',
        outcome: 'passed',
        executedAssertions: 4,
        failedAssertions: 0,
        skippedAssertions: 0,
      },
    },
    acceptance: {
      outcome: 'accepted',
      receiptRef: 'acceptance:486-016-proof',
    },
  };
}

describe('acceptance-bound semantic verdict production consumer', () => {
  it('preserves DONE only when the production symbols and executed proof exactly match', () => {
    expect.assertions(4);

    const evaluation = evaluateAcceptanceBoundSemanticVerdict(result, task, acceptedEvidence());
    const gate = evaluation.rubricScores.at(-1);

    expect(evaluation.decision).toBe('DONE');
    expect(gate?.criterion).toBe('semantic_acceptance');
    expect(gate?.passed).toBe(true);
    expect(gate?.reason).toBe('semantic_acceptance_verified');
  });

  it('rejects score-only and worker-note success when structured evidence is absent', () => {
    expect.assertions(3);

    const evaluation = evaluateAcceptanceBoundSemanticVerdict(result, task, undefined);
    const gate = evaluation.rubricScores.at(-1);

    expect(evaluation.totalScore).toBeGreaterThanOrEqual(90);
    expect(evaluation.decision).toBe('NO_GO');
    expect(gate?.reason).toContain('semantic_evidence_missing');
  });

  it('rejects an unrelated fixture-local projection even when its suite is green', () => {
    expect.assertions(2);
    const evidence = acceptedEvidence();
    const fixtureEvidence: SemanticVerdictAcceptanceEvidence = {
      ...evidence,
      observation: {
        ...evidence.observation,
        consumer: {
          ...evidence.observation.consumer,
          identity: 'fixture-local',
        },
      },
    };

    const evaluation = evaluateAcceptanceBoundSemanticVerdict(result, task, fixtureEvidence);

    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.rubricScores.at(-1)?.reason).toContain('semantic_fixture_symbol');
  });

  it('rejects exit-zero proof with no executed assertions or skipped assertions', () => {
    expect.assertions(3);
    const evidence = acceptedEvidence();
    const zeroAssertionEvidence: SemanticVerdictAcceptanceEvidence = {
      ...evidence,
      observation: {
        ...evidence.observation,
        assertions: {
          ...evidence.observation.assertions,
          executedAssertions: 0,
          skippedAssertions: 1,
        },
      },
    };

    const evaluation = evaluateAcceptanceBoundSemanticVerdict(result, task, zeroAssertionEvidence);
    const reason = evaluation.rubricScores.at(-1)?.reason;

    expect(evaluation.decision).toBe('NO_GO');
    expect(reason).toContain('semantic_assertions_not_executed');
    expect(reason).toContain('semantic_assertions_skipped');
  });

  it('rejects empty production symbol and proof-target identities', () => {
    expect.assertions(3);
    const evidence = acceptedEvidence();
    const incompleteEvidence: SemanticVerdictAcceptanceEvidence = {
      ...evidence,
      contract: {
        ...evidence.contract,
        consumer: {
          ...evidence.contract.consumer,
          exportName: '',
        },
        proofTarget: '',
      },
      observation: {
        ...evidence.observation,
        consumer: {
          ...evidence.observation.consumer,
          exportName: '',
        },
        proofTarget: '',
      },
    };

    const evaluation = evaluateAcceptanceBoundSemanticVerdict(result, task, incompleteEvidence);
    const reason = evaluation.rubricScores.at(-1)?.reason;

    expect(evaluation.decision).toBe('NO_GO');
    expect(reason).toContain('semantic_symbol_missing');
    expect(reason).toContain('semantic_proof_target_missing');
  });
});
