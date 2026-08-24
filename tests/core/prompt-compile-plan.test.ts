import { describe, expect, it } from 'vitest';
import { CRITERION_APPLICABILITY, createGoNoGoCriterionItem } from '../../src/core/task-types.js';
import { createPromptCompilePlan, hasExactTechDebtCriterionIds, projectTestsPassed } from '../../src/core/prompt-compile-plan.js';

describe('PromptCompilePlan', () => {
  const first = createGoNoGoCriterionItem({ polarity: 'go', statement: 'First', evidenceRequirements: ['b', 'a'] });
  const second = createGoNoGoCriterionItem({ polarity: 'go', statement: 'Second' });
  const base = {
    testApplicability: CRITERION_APPLICABILITY.REQUIRED,
    scope: { directories: ['src'], filesRead: ['b.ts'], filesWrite: ['a.ts'] },
    rolePolicyIdentity: 'execution_budget.roles.worker.default',
  } as const;

  it('canonicalizes deterministically, freezes deeply, and emits evidence for every ID', () => {
    const a = createPromptCompilePlan({ ...base, criteria: [second, first], verificationCommands: [{ command: 'npx vitest run a.test.ts', scope: ['a.test.ts'] }] });
    const b = createPromptCompilePlan({ ...base, criteria: [first, second], verificationCommands: [{ command: 'npx vitest run a.test.ts', scope: ['a.test.ts'] }] });
    expect(a).toEqual(b);
    expect(a.criteriaEvidence.map(item => item.criterionId)).toEqual(a.criteria.map(item => item.id));
    expect(a.criteriaEvidence.every(item => item.outcome === 'UNVERIFIED')).toBe(true);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.criteria)).toBe(true);
    expect(Object.isFrozen(a.criteria[0]?.evidenceRequirements)).toBe(true);
    expect(Object.isFrozen(a.verification.commands[0]?.scope)).toBe(true);
  });

  it('rejects evidence for an unknown criterion identity', () => {
    expect(() => createPromptCompilePlan({ ...base, criteria: [first], criteriaEvidence: [{ criterionId: 'unknown', outcome: 'MET', evidence: ['x'] }] })).toThrow(/unknown criterion ID/);
  });

  it('projects actual outcome without treating applicability as success authority', () => {
    expect(projectTestsPassed({ outcome: 'PASSED' })).toBe(true);
    expect(projectTestsPassed({ outcome: 'NOT_EXECUTED' })).toBe(false);
  });

  it('allows tech debt only with exact structured criterion IDs', () => {
    const plan = createPromptCompilePlan({ ...base, criteria: [first] });
    expect(hasExactTechDebtCriterionIds(plan, 'GO_WITH_TECH_DEBT', [first.id])).toBe(true);
    expect(hasExactTechDebtCriterionIds(plan, 'GO_WITH_TECH_DEBT', ['First'])).toBe(false);
    expect(hasExactTechDebtCriterionIds(plan, 'GO_WITH_TECH_DEBT', undefined)).toBe(false);
  });
});
