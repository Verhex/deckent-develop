import { describe, it, expect } from 'vitest';
import { adaptAgent } from '../../src/agents/adaptive-agent.js';
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

describe('adaptAgent wire integration', () => {
  it('triggers adaptation when agent has high NO_GO rate (needsImprovement=true)', () => {
    const results: ResultEntry[] = [
      makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
      makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-002' }),
      makeResult({ evaluation: 'DONE', sprintId: 'sprint-003' }),
    ];
    const { effectiveness, diff } = adaptAgent('bug-fixer', BASE_PROMPT, results);
    expect(effectiveness.needsImprovement).toBe(true);
    expect(effectiveness.successRate).toBeLessThan(0.7);
    expect(diff.changedSections.length).toBeGreaterThan(0);
  });

  it('no-op when agent is performing well — no prompt changes suggested', () => {
    const results: ResultEntry[] = [
      makeResult({ evaluation: 'DONE', coverage: 90, sprintId: 'sprint-001' }),
      makeResult({ evaluation: 'DONE', coverage: 92, sprintId: 'sprint-002' }),
      makeResult({ evaluation: 'DONE', coverage: 88, sprintId: 'sprint-003' }),
    ];
    const { effectiveness, diff } = adaptAgent('code-reviewer', BASE_PROMPT, results);
    expect(effectiveness.needsImprovement).toBe(false);
    expect(diff.changedSections).toEqual([]);
    expect(diff.suggested).toBe(BASE_PROMPT);
  });

  it('integrates ResultEntry outcome format from sprint results', () => {
    const outcomeEntries: ResultEntry[] = [
      { evaluation: 'GO_WITH_TECH_DEBT', coverage: 40, sprintId: 'sprint-010' },
      { evaluation: 'GO_WITH_TECH_DEBT', coverage: 35, sprintId: 'sprint-011' },
      { evaluation: 'GO_WITH_TECH_DEBT', coverage: 38, sprintId: 'sprint-012' },
    ];
    const { effectiveness, diff } = adaptAgent('refactorer', BASE_PROMPT, outcomeEntries);
    // Three GO_WITH_TECH_DEBT → tech-debt-heavy + low-coverage weaknesses detected
    expect(effectiveness.weaknesses.length).toBeGreaterThan(0);
    expect(diff.suggested).not.toBe(BASE_PROMPT);
    expect(diff.original).toBe(BASE_PROMPT);
  });

  it('is idempotent — calling twice with same inputs produces the same result', () => {
    const results: ResultEntry[] = [
      makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
      makeResult({ evaluation: 'DONE', sprintId: 'sprint-002' }),
    ];
    const first = adaptAgent('doc-writer', BASE_PROMPT, results);
    const second = adaptAgent('doc-writer', BASE_PROMPT, results);
    expect(first.effectiveness.successRate).toBe(second.effectiveness.successRate);
    expect(first.effectiveness.needsImprovement).toBe(second.effectiveness.needsImprovement);
    expect(first.diff.changedSections).toEqual(second.diff.changedSections);
    expect(first.diff.suggested).toBe(second.diff.suggested);
  });

  it('returns empty results gracefully when no outcome data is available', () => {
    const { effectiveness, diff } = adaptAgent('architect', BASE_PROMPT, []);
    expect(effectiveness.successRate).toBe(0);
    expect(effectiveness.needsImprovement).toBe(false);
    expect(effectiveness.weaknesses).toEqual([]);
    expect(diff.changedSections).toEqual([]);
    expect(diff.suggested).toBe(BASE_PROMPT);
  });

  it('diff preserves original prompt in output regardless of weaknesses', () => {
    const results: ResultEntry[] = [
      makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
      makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
      makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-002' }),
    ];
    const { diff } = adaptAgent('security-auditor', BASE_PROMPT, results);
    expect(diff.original).toBe(BASE_PROMPT);
    expect(diff.suggested.startsWith(BASE_PROMPT)).toBe(true);
  });
});
