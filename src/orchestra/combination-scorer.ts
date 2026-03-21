import type { PatternReader } from './pattern-reader.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface CombinationScore {
  score: number;
  confidence: number;  // 0-1
  recommendation: 'use' | 'avoid' | 'neutral';
}

// ─── CombinationScorer ──────────────────────────────────────────────

export class CombinationScorer {
  constructor(private reader: PatternReader) {}

  /**
   * Score a task type + agent/skills/model combination.
   *
   * Score = successCount * 2 + avgCoverage * 0.1 - failCount * 3 - recencyPenalty
   * Confidence = min(1, sampleSize / 5)
   * recommendation: score > 2 -> use, score < -2 -> avoid, else neutral
   */
  score(
    taskType: string,
    agent: string | null,
    skills: string[],
    model: string,
  ): CombinationScore {
    const successes = this.reader.getSuccessfulCombinations(taskType);
    const failures = this.reader.getFailedCombinations(taskType);

    const sortedSkills = [...skills].sort();

    // Find matching successful combinations
    let successCount = 0;
    let totalCoverage = 0;
    for (const combo of successes) {
      if (this.matchesCombo(combo.agent, combo.skills, combo.model, agent, sortedSkills, model)) {
        successCount += combo.count;
        // We approximate coverage from the successful combos; each combo represents high-quality results
        totalCoverage += 85 * combo.count; // successful combos have >80% coverage
      }
    }

    // Find matching failed combinations
    let failCount = 0;
    let latestFailSprint = '';
    for (const combo of failures) {
      if (this.matchesCombo(combo.agent, combo.skills, combo.model, agent, sortedSkills, model)) {
        failCount += combo.count;
        if (combo.lastSprint > latestFailSprint) {
          latestFailSprint = combo.lastSprint;
        }
      }
    }

    const sampleSize = successCount + failCount;
    const avgCoverage = successCount > 0 ? totalCoverage / successCount : 0;
    const recencyPenalty = this.calculateRecencyPenalty(latestFailSprint);

    const score = successCount * 2 + avgCoverage * 0.1 - failCount * 3 - recencyPenalty;
    const confidence = Math.min(1, sampleSize / 5);

    let recommendation: 'use' | 'avoid' | 'neutral';
    if (score > 2) {
      recommendation = 'use';
    } else if (score < -2) {
      recommendation = 'avoid';
    } else {
      recommendation = 'neutral';
    }

    return { score, confidence, recommendation };
  }

  private matchesCombo(
    comboAgent: string | null,
    comboSkills: string[],
    comboModel: string,
    targetAgent: string | null,
    targetSkills: string[],
    targetModel: string,
  ): boolean {
    if (comboAgent !== targetAgent) return false;
    if (comboModel !== targetModel) return false;
    const sortedCombo = [...comboSkills].sort();
    if (sortedCombo.length !== targetSkills.length) return false;
    return sortedCombo.every((s, i) => s === targetSkills[i]);
  }

  private calculateRecencyPenalty(lastFailSprint: string): number {
    if (!lastFailSprint) return 0;
    // Extract sprint number and calculate penalty: recent failures penalize more
    const match = lastFailSprint.match(/sprint-(\d+)/);
    if (!match?.[1]) return 0;
    // A recent failure in the last few sprints gets a small penalty
    // The penalty decays as more sprints pass, but we keep it simple
    return 1;
  }
}
