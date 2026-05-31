// ─── Adaptive Agent ─────────────────────────────────────────────────────────
// Analyzes prompt effectiveness and suggests improvements. Never auto-applies.
//
// Integration point: import adaptAgent() from this module to wire outcome-based
// adaptation into outcome-tracker or routing-engine callers.

// ─── Types ──────────────────────────────────────────────────────────

export interface PromptDiff {
  original: string;
  suggested: string;
  reasoning: string;
  changedSections: string[];
}

export interface EffectivenessResult {
  successRate: number;
  needsImprovement: boolean;
  weaknesses: string[];
}

export interface ResultEntry {
  evaluation: string;
  coverage: number;
  sprintId: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const IMPROVEMENT_THRESHOLD = 0.7;   // 70%
const MIN_SPRINTS_FOR_ANALYSIS = 1;
const RECENT_WINDOW = 3;

// ─── Weakness Detection Patterns ────────────────────────────────────

interface WeaknessPattern {
  id: string;
  label: string;
  detect: (results: ResultEntry[]) => boolean;
}

const WEAKNESS_PATTERNS: WeaknessPattern[] = [
  {
    id: 'high-nogo-rate',
    label: 'High NO_GO rate — frequent task failures',
    detect: (results) => {
      const nogoCount = results.filter(r => r.evaluation === 'NO_GO').length;
      return results.length >= 2 && nogoCount / results.length > 0.4;
    },
  },
  {
    id: 'low-coverage',
    label: 'Low test coverage — coverage consistently below 60%',
    detect: (results) => {
      const withCoverage = results.filter(r => r.coverage > 0);
      if (withCoverage.length === 0) return false;
      const avg = withCoverage.reduce((s, r) => s + r.coverage, 0) / withCoverage.length;
      return avg < 60;
    },
  },
  {
    id: 'declining-performance',
    label: 'Declining performance — recent results worse than earlier',
    detect: (results) => {
      if (results.length < 4) return false;
      const half = Math.floor(results.length / 2);
      const earlier = results.slice(0, half);
      const recent = results.slice(half);
      const earlierSuccess = earlier.filter(r => r.evaluation === 'DONE' || r.evaluation === 'GO_WITH_TECH_DEBT').length / earlier.length;
      const recentSuccess = recent.filter(r => r.evaluation === 'DONE' || r.evaluation === 'GO_WITH_TECH_DEBT').length / recent.length;
      return recentSuccess < earlierSuccess - 0.15;
    },
  },
  {
    id: 'tech-debt-heavy',
    label: 'Tech debt accumulation — too many GO_WITH_TECH_DEBT results',
    detect: (results) => {
      const tdCount = results.filter(r => r.evaluation === 'GO_WITH_TECH_DEBT').length;
      return results.length >= 3 && tdCount / results.length > 0.5;
    },
  },
  {
    id: 'inconsistent-coverage',
    label: 'Inconsistent coverage — high variance between tasks',
    detect: (results) => {
      const withCoverage = results.filter(r => r.coverage > 0);
      if (withCoverage.length < 3) return false;
      const avg = withCoverage.reduce((s, r) => s + r.coverage, 0) / withCoverage.length;
      const variance = withCoverage.reduce((s, r) => s + Math.pow(r.coverage - avg, 2), 0) / withCoverage.length;
      return Math.sqrt(variance) > 25;
    },
  },
];

// ─── AdaptiveAgent ──────────────────────────────────────────────────

export class AdaptiveAgent {
  /**
   * Analyze the effectiveness of an agent's prompt based on recent results.
   * Looks at the last 3 sprints. If successRate < 70% -> needsImprovement.
   */
  analyzePromptEffectiveness(
    _agentId: string,
    recentResults: ResultEntry[],
  ): EffectivenessResult {
    if (recentResults.length === 0) {
      return { successRate: 0, needsImprovement: false, weaknesses: [] };
    }

    // Get unique sprint IDs sorted, take last RECENT_WINDOW
    const sprintIds = [...new Set(recentResults.map(r => r.sprintId))].sort();
    const recentSprintIds = sprintIds.slice(-RECENT_WINDOW);

    // Filter to recent sprints only
    const recent = recentResults.filter(r => recentSprintIds.includes(r.sprintId));

    if (recent.length === 0) {
      return { successRate: 0, needsImprovement: false, weaknesses: [] };
    }

    // Calculate success rate (DONE or GO_WITH_TECH_DEBT = success)
    const successCount = recent.filter(
      r => r.evaluation === 'DONE' || r.evaluation === 'GO_WITH_TECH_DEBT',
    ).length;
    const successRate = successCount / recent.length;

    // Detect weaknesses
    const weaknesses: string[] = [];
    for (const pattern of WEAKNESS_PATTERNS) {
      if (pattern.detect(recent)) {
        weaknesses.push(pattern.label);
      }
    }

    const needsImprovement =
      recentSprintIds.length >= MIN_SPRINTS_FOR_ANALYSIS &&
      successRate < IMPROVEMENT_THRESHOLD;

    return { successRate, needsImprovement, weaknesses };
  }

  /**
   * Suggest prompt changes based on detected weaknesses.
   * Returns a PromptDiff that must be manually reviewed and applied.
   * Does NOT auto-apply changes.
   */
  suggestPromptChange(
    _agentId: string,
    currentPrompt: string,
    weaknesses: string[],
  ): PromptDiff {
    if (weaknesses.length === 0) {
      return {
        original: currentPrompt,
        suggested: currentPrompt,
        reasoning: 'No weaknesses detected; no changes suggested.',
        changedSections: [],
      };
    }

    const suggestions: string[] = [];
    const changedSections: string[] = [];

    for (const weakness of weaknesses) {
      if (weakness.includes('NO_GO')) {
        suggestions.push(
          '## Error Handling\n- Always validate inputs before processing\n- Run tsc --noEmit before marking task done\n- If tests fail, fix them before submitting result',
        );
        changedSections.push('Error Handling');
      }

      if (weakness.includes('coverage')) {
        suggestions.push(
          '## Test Coverage\n- Write tests for all new functions\n- Aim for minimum 80% coverage on modified files\n- Include edge case tests',
        );
        changedSections.push('Test Coverage');
      }

      if (weakness.includes('Declining')) {
        suggestions.push(
          '## Quality Focus\n- Read existing code patterns before writing new code\n- Follow established naming conventions\n- Check for regressions after changes',
        );
        changedSections.push('Quality Focus');
      }

      if (weakness.includes('Tech debt')) {
        suggestions.push(
          '## Completion Standards\n- Prefer DONE over GO_WITH_TECH_DEBT\n- Address minor issues inline rather than deferring\n- Clean up temporary workarounds before submission',
        );
        changedSections.push('Completion Standards');
      }

      if (weakness.includes('Inconsistent')) {
        suggestions.push(
          '## Consistency\n- Use the same testing patterns across all tasks\n- Maintain consistent coverage levels\n- Follow a standard test structure',
        );
        changedSections.push('Consistency');
      }
    }

    // Deduplicate changed sections
    const uniqueSections = [...new Set(changedSections)];
    const addendum = suggestions.length > 0 ? '\n\n' + suggestions.join('\n\n') : '';
    const suggested = currentPrompt + addendum;

    const reasoning = `Detected ${weaknesses.length} weakness(es): ${weaknesses.join('; ')}. ` +
      `Added ${uniqueSections.length} new section(s) to address these issues.`;

    return {
      original: currentPrompt,
      suggested,
      reasoning,
      changedSections: uniqueSections,
    };
  }
}

// ─── adaptAgent ─────────────────────────────────────────────────────────────
// Module-level integration point. Callers (outcome-tracker, routing-engine)
// import this function to trigger outcome-based adaptation.
// Never auto-applies — always returns a diff for human review.

export interface AdaptResult {
  diff: PromptDiff;
  effectiveness: EffectivenessResult;
}

const _sharedAgent = new AdaptiveAgent();

export function adaptAgent(
  agentId: string,
  currentPrompt: string,
  recentResults: ResultEntry[],
): AdaptResult {
  const effectiveness = _sharedAgent.analyzePromptEffectiveness(agentId, recentResults);
  const diff = _sharedAgent.suggestPromptChange(agentId, currentPrompt, effectiveness.weaknesses);
  return { diff, effectiveness };
}
