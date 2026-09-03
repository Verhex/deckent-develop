import { describe, expect, it } from 'vitest';

import type { Task } from '../../src/core/task-types.js';
import {
  createExactNormalTaskApprovedMaterialV3,
  createExactTaskEvaluationPolicyAuthority,
  ExactEvaluationPolicyFailure,
  parseExactNormalTaskApprovedMaterialV3,
  parseExactTaskEvaluationPolicyAuthority,
} from '../../src/orchestra/exact-evaluation-policy-authority.js';
import { createTaskResultSettlementV2TestPolicy } from '../helpers/task-result-settlement-v2-fixture.js';

const policy = createTaskResultSettlementV2TestPolicy();
const dispatchDigest = `sha256:${'a'.repeat(64)}` as const;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'policy-001',
    title: 'Freeze exact evaluation policy',
    description: 'Bind rubric and acceptance before provider birth.',
    model: 'registry-model',
    effort: 'normal',
    priority: 'HIGH',
    reason: 'durable exact evaluation',
    scope: {
      directories: ['src/orchestra'],
      filesRead: [],
      filesWrite: ['src/orchestra/evaluation-audit-trail.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'policy is immutable',
      noGoCriteria: 'live config changes terminal result',
      techDebtAcceptable: 'none',
    },
    status: 'EXECUTING' as Task['status'],
    assignedWorker: 'worker-policy-001',
    sprintId: 'sprint-policy',
    type: 'code-development',
    ...overrides,
  };
}

describe('exact evaluation policy authority', () => {
  it('freezes one complete rubric and acceptance row before provider birth', () => {
    const authority = createExactTaskEvaluationPolicyAuthority({
      sprintId: 'sprint-policy',
      task: task(),
      dispatchTaskMaterialDigest: dispatchDigest,
      config: {
        acceptance_enforcement: 'enforce',
        acceptance_matrix: {
          'code-development': {
            QUALIFIED: { action: 'ROUTE', adapter: 'human' },
          },
        },
      },
      policy,
    });

    expect(authority.acceptance.enforcement).toBe('enforce');
    expect(authority.acceptance.row.QUALIFIED).toEqual({
      action: 'ROUTE', adapter: 'human', source: 'override',
    });
    expect(authority.acceptance.row.CONFIRMED.source).toBe('default');
    expect(authority.rubric.criteria.map(entry => entry.name)).toContain('correctness');
    expect(Object.isFrozen(authority)).toBe(true);
    expect(Object.isFrozen(authority.rubric.criteria)).toBe(true);
    expect(parseExactTaskEvaluationPolicyAuthority(authority, policy)).toEqual(authority);
  });

  it('rejects dormant custom rubric and malformed acceptance instead of dropping rules', () => {
    expect(() => createExactTaskEvaluationPolicyAuthority({
      sprintId: 'sprint-policy',
      task: task(),
      dispatchTaskMaterialDigest: dispatchDigest,
      config: { evaluation_rubric: { passingScore: 0 } },
      policy,
    })).toThrowError(expect.objectContaining<Partial<ExactEvaluationPolicyFailure>>({
      code: 'UNSUPPORTED_EXACT_EVALUATION_RUBRIC_OVERRIDE',
    }));

    expect(() => createExactTaskEvaluationPolicyAuthority({
      sprintId: 'sprint-policy',
      task: task(),
      dispatchTaskMaterialDigest: dispatchDigest,
      config: {
        acceptance_matrix: {
          'code-development': {
            FAILED: { action: 'ROUTE' },
          },
        },
      },
      policy,
    })).toThrowError(expect.objectContaining<Partial<ExactEvaluationPolicyFailure>>({
      code: 'INVALID_EXACT_ACCEPTANCE_POLICY',
    }));
  });

  it('rejects proxy/accessor config and forged nested digests', () => {
    expect(() => createExactTaskEvaluationPolicyAuthority({
      sprintId: 'sprint-policy',
      task: task(),
      dispatchTaskMaterialDigest: dispatchDigest,
      config: new Proxy({}, {}) as never,
      policy,
    })).toThrowError(expect.objectContaining<Partial<ExactEvaluationPolicyFailure>>({
      code: 'INVALID_EXACT_EVALUATION_CONFIG',
    }));

    const config = {} as Record<string, unknown>;
    Object.defineProperty(config, 'acceptance_matrix', {
      enumerable: true,
      get: () => ({}),
    });
    expect(() => createExactTaskEvaluationPolicyAuthority({
      sprintId: 'sprint-policy',
      task: task(),
      dispatchTaskMaterialDigest: dispatchDigest,
      config,
      policy,
    })).toThrowError(expect.objectContaining<Partial<ExactEvaluationPolicyFailure>>({
      code: 'INVALID_EXACT_EVALUATION_CONFIG',
    }));

    const authority = createExactTaskEvaluationPolicyAuthority({
      sprintId: 'sprint-policy',
      task: task(),
      dispatchTaskMaterialDigest: dispatchDigest,
      policy,
    });
    expect(parseExactTaskEvaluationPolicyAuthority({
      ...authority,
      rubric: { ...authority.rubric, rubricDigest: `sha256:${'f'.repeat(64)}` },
    }, policy)).toBeNull();
  });

  it('binds approved material to task, sprint, task kind, and dispatch digest', () => {
    const sourceTask = task();
    const approved = createExactNormalTaskApprovedMaterialV3({
      sprintId: 'sprint-policy',
      task: sourceTask,
      dispatchTaskMaterialDigest: dispatchDigest,
      policy,
    });
    expect(parseExactNormalTaskApprovedMaterialV3({
      value: approved,
      expectedTask: sourceTask,
      expectedDispatchTaskMaterialDigest: dispatchDigest,
      policy,
    })).toEqual(approved);
    expect(parseExactNormalTaskApprovedMaterialV3({
      value: approved,
      expectedTask: task({ id: 'policy-sibling' }),
      expectedDispatchTaskMaterialDigest: dispatchDigest,
      policy,
    })).toBeNull();
    expect(parseExactNormalTaskApprovedMaterialV3({
      value: approved,
      expectedTask: sourceTask,
      expectedDispatchTaskMaterialDigest: `sha256:${'b'.repeat(64)}`,
      policy,
    })).toBeNull();
  });
});
