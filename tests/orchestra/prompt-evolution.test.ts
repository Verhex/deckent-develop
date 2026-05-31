import { describe, it, expect } from 'vitest';
import { evolvePrompt } from '../../src/orchestra/prompt-evolution.js';
import type { RoutingOutcome } from '../../src/orchestra/outcome-tracker.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';

function makeOutcome(
  taskId: string,
  evaluation: RoutingOutcome['evaluation'],
  agentId: string | null = 'refactorer',
): RoutingOutcome {
  return {
    taskId,
    sprintId: 'sprint-test',
    taskDNA: createDefaultTaskDNA(),
    agentId,
    skillIds: ['typescript-expert'],
    evaluation,
    coverage: 80,
    routingVersion: 'v2',
  };
}

describe('evolvePrompt', () => {
  it('reinforces success pattern when ≥3 outcomes succeed at ≥75% rate', () => {
    const outcomes = [
      makeOutcome('t1', 'DONE'),
      makeOutcome('t2', 'DONE'),
      makeOutcome('t3', 'DONE'),
      makeOutcome('t4', 'DONE'),
    ];
    const result = evolvePrompt('Base prompt.', outcomes);
    expect(result.changes).toContain('reinforced-success-pattern');
    expect(result.evolvedPrompt).toContain('Başarı Pattern');
    expect(result.evolvedPrompt).toContain('refactorer');
    expect(result.successRate).toBe(1);
    expect(result.outcomeCount).toBe(4);
  });

  it('adds a failure warning when ≥2 NO_GO outcomes occur', () => {
    const outcomes = [
      makeOutcome('t1', 'NO_GO', 'bug-fixer'),
      makeOutcome('t2', 'NO_GO', 'bug-fixer'),
      makeOutcome('t3', 'DONE'),
    ];
    const result = evolvePrompt('Base prompt.', outcomes);
    expect(result.changes).toContain('added-failure-warning');
    expect(result.evolvedPrompt).toContain('Risk Uyarısı');
    expect(result.evolvedPrompt).toContain('bug-fixer (2x)');
  });

  it('is a no-op when outcomes is empty', () => {
    const result = evolvePrompt('Base prompt.', []);
    expect(result.changes).toEqual([]);
    expect(result.evolvedPrompt).toBe('Base prompt.');
    expect(result.outcomeCount).toBe(0);
    expect(result.successRate).toBe(0);
  });

  it('is idempotent — re-evolving the evolved prompt with the same outcomes adds no further changes', () => {
    const outcomes = [
      makeOutcome('t1', 'DONE'),
      makeOutcome('t2', 'DONE'),
      makeOutcome('t3', 'DONE'),
      makeOutcome('t4', 'NO_GO'),
      makeOutcome('t5', 'NO_GO'),
    ];
    const first = evolvePrompt('Base.', outcomes);
    expect(first.changes.length).toBeGreaterThan(0);

    const second = evolvePrompt(first.evolvedPrompt, outcomes);
    expect(second.changes).toEqual([]);
    expect(second.evolvedPrompt).toBe(first.evolvedPrompt);
  });

  it('does not reinforce success when sample size is too small', () => {
    const outcomes = [makeOutcome('t1', 'DONE'), makeOutcome('t2', 'DONE')];
    const result = evolvePrompt('Base.', outcomes);
    expect(result.changes).not.toContain('reinforced-success-pattern');
    expect(result.evolvedPrompt).toBe('Base.');
  });
});
