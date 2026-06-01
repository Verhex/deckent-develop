import { describe, it, expect } from 'vitest';
import { adaptAgentRuntime } from '../../src/agents/adaptive-agent.js';
import type { ResultEntry } from '../../src/agents/adaptive-agent.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<ResultEntry> = {}): ResultEntry {
  return {
    evaluation: 'DONE',
    coverage: 85,
    sprintId: 'sprint-001',
    ...overrides,
  };
}

const BASE_PROMPT = '# Agent Prompt\nDo your job well.';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('adaptAgentRuntime — runtime adaptation wire', () => {
  it('triggers adaptation and suggests skills when agent has high NO_GO rate', () => {
    const results: ResultEntry[] = [
      makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
      makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-002' }),
      makeResult({ evaluation: 'DONE', sprintId: 'sprint-003' }),
    ];
    const result = adaptAgentRuntime('bug-fixer', BASE_PROMPT, [], results);
    expect(result.effectiveness.needsImprovement).toBe(true);
    expect(result.skillAdaptation.suggestAdd).toContain('code-simplifier');
    expect(result.skillAdaptation.suggestRemove).toEqual([]);
    expect(result.promptDiff.changedSections.length).toBeGreaterThan(0);
  });

  it('no-op when agent is performing well — no skill or prompt changes', () => {
    const results: ResultEntry[] = [
      makeResult({ evaluation: 'DONE', coverage: 90, sprintId: 'sprint-001' }),
      makeResult({ evaluation: 'DONE', coverage: 92, sprintId: 'sprint-002' }),
      makeResult({ evaluation: 'DONE', coverage: 88, sprintId: 'sprint-003' }),
    ];
    const result = adaptAgentRuntime('code-reviewer', BASE_PROMPT, [], results);
    expect(result.effectiveness.needsImprovement).toBe(false);
    expect(result.skillAdaptation.suggestAdd).toEqual([]);
    expect(result.promptDiff.changedSections).toEqual([]);
    expect(result.promptDiff.suggested).toBe(BASE_PROMPT);
  });

  it('integrates outcome data — maps coverage weakness to testing-expert suggestion', () => {
    const results: ResultEntry[] = [
      makeResult({ evaluation: 'DONE', coverage: 30, sprintId: 'sprint-010' }),
      makeResult({ evaluation: 'DONE', coverage: 25, sprintId: 'sprint-011' }),
      makeResult({ evaluation: 'DONE', coverage: 40, sprintId: 'sprint-012' }),
    ];
    const result = adaptAgentRuntime('refactorer', BASE_PROMPT, [], results);
    expect(result.skillAdaptation.suggestAdd).toContain('testing-expert');
    expect(result.skillAdaptation.agentId).toBe('refactorer');
    expect(result.effectiveness.weaknesses.length).toBeGreaterThan(0);
  });

  it('does not suggest a skill that is already in currentSkills', () => {
    const results: ResultEntry[] = [
      makeResult({ evaluation: 'DONE', coverage: 30, sprintId: 'sprint-010' }),
      makeResult({ evaluation: 'DONE', coverage: 25, sprintId: 'sprint-011' }),
      makeResult({ evaluation: 'DONE', coverage: 40, sprintId: 'sprint-012' }),
    ];
    const result = adaptAgentRuntime('refactorer', BASE_PROMPT, ['testing-expert'], results);
    // testing-expert already present — should not be suggested again
    expect(result.skillAdaptation.suggestAdd).not.toContain('testing-expert');
  });

  it('is idempotent — calling twice with same inputs produces identical output', () => {
    const results: ResultEntry[] = [
      makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
      makeResult({ evaluation: 'DONE', coverage: 40, sprintId: 'sprint-002' }),
    ];
    const first = adaptAgentRuntime('doc-writer', BASE_PROMPT, [], results);
    const second = adaptAgentRuntime('doc-writer', BASE_PROMPT, [], results);
    expect(first.effectiveness.successRate).toBe(second.effectiveness.successRate);
    expect(first.skillAdaptation.suggestAdd).toEqual(second.skillAdaptation.suggestAdd);
    expect(first.promptDiff.changedSections).toEqual(second.promptDiff.changedSections);
  });

  it('returns no skill suggestions when results are empty', () => {
    const result = adaptAgentRuntime('architect', BASE_PROMPT, [], []);
    expect(result.effectiveness.successRate).toBe(0);
    expect(result.effectiveness.needsImprovement).toBe(false);
    expect(result.skillAdaptation.suggestAdd).toEqual([]);
    expect(result.skillAdaptation.suggestRemove).toEqual([]);
  });

  it('skill suggestions are deduplicated when multiple weaknesses map to same skill', () => {
    // Both low-coverage and tech-debt-heavy map to testing-expert
    const results: ResultEntry[] = [
      makeResult({ evaluation: 'GO_WITH_TECH_DEBT', coverage: 30, sprintId: 'sprint-001' }),
      makeResult({ evaluation: 'GO_WITH_TECH_DEBT', coverage: 25, sprintId: 'sprint-002' }),
      makeResult({ evaluation: 'GO_WITH_TECH_DEBT', coverage: 40, sprintId: 'sprint-003' }),
    ];
    const result = adaptAgentRuntime('refactorer', BASE_PROMPT, [], results);
    const testingCount = result.skillAdaptation.suggestAdd.filter(s => s === 'testing-expert').length;
    expect(testingCount).toBe(1); // deduplicated
  });
});
