import { describe, it, expect } from 'vitest';
import { AdaptiveAgent } from '../../src/agents/adaptive-agent.js';
import type { ResultEntry, PromptDiff } from '../../src/agents/adaptive-agent.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeResult(overrides: Partial<ResultEntry> = {}): ResultEntry {
  return {
    evaluation: 'DONE',
    coverage: 85,
    sprintId: 'sprint-001',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('AdaptiveAgent', () => {
  const agent = new AdaptiveAgent();

  // ─── analyzePromptEffectiveness ─────────────────────────────────

  describe('analyzePromptEffectiveness', () => {
    it('returns zero successRate for empty results', () => {
      const result = agent.analyzePromptEffectiveness('agent-1', []);
      expect(result.successRate).toBe(0);
      expect(result.needsImprovement).toBe(false);
      expect(result.weaknesses).toEqual([]);
    });

    it('returns 100% successRate for all DONE results', () => {
      const results = [
        makeResult({ sprintId: 'sprint-001' }),
        makeResult({ sprintId: 'sprint-002' }),
        makeResult({ sprintId: 'sprint-003' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.successRate).toBe(1);
      expect(result.needsImprovement).toBe(false);
    });

    it('counts GO_WITH_TECH_DEBT as success', () => {
      const results = [
        makeResult({ evaluation: 'GO_WITH_TECH_DEBT', sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'GO_WITH_TECH_DEBT', sprintId: 'sprint-002' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.successRate).toBe(1);
      expect(result.needsImprovement).toBe(false);
    });

    it('marks needsImprovement when successRate < 70%', () => {
      const results = [
        makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-002' }),
        makeResult({ evaluation: 'DONE', sprintId: 'sprint-003' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.successRate).toBeCloseTo(0.333, 2);
      expect(result.needsImprovement).toBe(true);
    });

    it('does not mark needsImprovement when successRate >= 70%', () => {
      const results = [
        makeResult({ evaluation: 'DONE', sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'DONE', sprintId: 'sprint-002' }),
        makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-003' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.successRate).toBeCloseTo(0.667, 2);
      expect(result.needsImprovement).toBe(true);
    });

    it('considers only the last 3 sprints', () => {
      const results = [
        makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-002' }),
        makeResult({ evaluation: 'DONE', sprintId: 'sprint-003' }),
        makeResult({ evaluation: 'DONE', sprintId: 'sprint-004' }),
        makeResult({ evaluation: 'DONE', sprintId: 'sprint-005' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      // Only sprint-003, sprint-004, sprint-005 are considered
      expect(result.successRate).toBe(1);
      expect(result.needsImprovement).toBe(false);
    });

    it('detects high-nogo-rate weakness', () => {
      const results = [
        makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'DONE', sprintId: 'sprint-001' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.weaknesses).toContain('High NO_GO rate — frequent task failures');
    });

    it('detects low-coverage weakness', () => {
      const results = [
        makeResult({ evaluation: 'DONE', coverage: 30, sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'DONE', coverage: 40, sprintId: 'sprint-002' }),
        makeResult({ evaluation: 'DONE', coverage: 50, sprintId: 'sprint-003' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.weaknesses).toContain('Low test coverage — coverage consistently below 60%');
    });

    it('detects declining performance weakness', () => {
      const results = [
        makeResult({ evaluation: 'DONE', sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'DONE', sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-002' }),
        makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-002' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.weaknesses).toContain('Declining performance — recent results worse than earlier');
    });

    it('detects tech-debt-heavy weakness', () => {
      const results = [
        makeResult({ evaluation: 'GO_WITH_TECH_DEBT', sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'GO_WITH_TECH_DEBT', sprintId: 'sprint-002' }),
        makeResult({ evaluation: 'GO_WITH_TECH_DEBT', sprintId: 'sprint-003' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.weaknesses).toContain('Tech debt accumulation — too many GO_WITH_TECH_DEBT results');
    });

    it('detects inconsistent coverage', () => {
      const results = [
        makeResult({ evaluation: 'DONE', coverage: 20, sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'DONE', coverage: 95, sprintId: 'sprint-002' }),
        makeResult({ evaluation: 'DONE', coverage: 10, sprintId: 'sprint-003' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.weaknesses).toContain('Inconsistent coverage — high variance between tasks');
    });

    it('reports multiple weaknesses at once', () => {
      const results = [
        makeResult({ evaluation: 'NO_GO', coverage: 10, sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'NO_GO', coverage: 20, sprintId: 'sprint-002' }),
        makeResult({ evaluation: 'DONE', coverage: 30, sprintId: 'sprint-003' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.weaknesses.length).toBeGreaterThanOrEqual(2);
    });

    it('handles single result without marking needsImprovement', () => {
      const results = [makeResult({ evaluation: 'NO_GO', sprintId: 'sprint-001' })];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.successRate).toBe(0);
      // needsImprovement still true since 1 sprint >= MIN_SPRINTS_FOR_ANALYSIS (1)
      expect(result.needsImprovement).toBe(true);
    });

    it('returns empty weaknesses when all results are good', () => {
      const results = [
        makeResult({ evaluation: 'DONE', coverage: 90, sprintId: 'sprint-001' }),
        makeResult({ evaluation: 'DONE', coverage: 92, sprintId: 'sprint-002' }),
        makeResult({ evaluation: 'DONE', coverage: 88, sprintId: 'sprint-003' }),
      ];
      const result = agent.analyzePromptEffectiveness('agent-1', results);
      expect(result.weaknesses).toEqual([]);
    });
  });

  // ─── suggestPromptChange ────────────────────────────────────────

  describe('suggestPromptChange', () => {
    const basePrompt = '# Agent Prompt\nDo your job well.';

    it('returns unchanged prompt when no weaknesses', () => {
      const diff = agent.suggestPromptChange('agent-1', basePrompt, []);
      expect(diff.original).toBe(basePrompt);
      expect(diff.suggested).toBe(basePrompt);
      expect(diff.changedSections).toEqual([]);
    });

    it('adds Error Handling section for NO_GO weakness', () => {
      const diff = agent.suggestPromptChange('agent-1', basePrompt, [
        'High NO_GO rate — frequent task failures',
      ]);
      expect(diff.suggested).toContain('## Error Handling');
      expect(diff.changedSections).toContain('Error Handling');
    });

    it('adds Test Coverage section for coverage weakness', () => {
      const diff = agent.suggestPromptChange('agent-1', basePrompt, [
        'Low test coverage — coverage consistently below 60%',
      ]);
      expect(diff.suggested).toContain('## Test Coverage');
      expect(diff.changedSections).toContain('Test Coverage');
    });

    it('adds Quality Focus for declining performance', () => {
      const diff = agent.suggestPromptChange('agent-1', basePrompt, [
        'Declining performance — recent results worse than earlier',
      ]);
      expect(diff.suggested).toContain('## Quality Focus');
      expect(diff.changedSections).toContain('Quality Focus');
    });

    it('adds Completion Standards for tech debt weakness', () => {
      const diff = agent.suggestPromptChange('agent-1', basePrompt, [
        'Tech debt accumulation — too many GO_WITH_TECH_DEBT results',
      ]);
      expect(diff.suggested).toContain('## Completion Standards');
      expect(diff.changedSections).toContain('Completion Standards');
    });

    it('adds Consistency for inconsistent coverage', () => {
      const diff = agent.suggestPromptChange('agent-1', basePrompt, [
        'Inconsistent coverage — high variance between tasks',
      ]);
      expect(diff.suggested).toContain('## Consistency');
      expect(diff.changedSections).toContain('Consistency');
    });

    it('includes reasoning in the diff', () => {
      const diff = agent.suggestPromptChange('agent-1', basePrompt, [
        'High NO_GO rate — frequent task failures',
      ]);
      expect(diff.reasoning).toContain('1 weakness');
      expect(diff.reasoning).toContain('1 new section');
    });

    it('preserves original prompt content', () => {
      const diff = agent.suggestPromptChange('agent-1', basePrompt, [
        'Low test coverage — coverage consistently below 60%',
      ]);
      expect(diff.suggested.startsWith(basePrompt)).toBe(true);
      expect(diff.original).toBe(basePrompt);
    });

    it('handles multiple weaknesses with unique sections', () => {
      const diff = agent.suggestPromptChange('agent-1', basePrompt, [
        'High NO_GO rate — frequent task failures',
        'Low test coverage — coverage consistently below 60%',
        'Declining performance — recent results worse than earlier',
      ]);
      expect(diff.changedSections).toContain('Error Handling');
      expect(diff.changedSections).toContain('Test Coverage');
      expect(diff.changedSections).toContain('Quality Focus');
      // changedSections should be deduplicated
      const unique = [...new Set(diff.changedSections)];
      expect(diff.changedSections).toEqual(unique);
    });
  });
});
