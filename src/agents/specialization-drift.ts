// ─── Specialization Drift Detector ──────────────────────────────────────────
// Detects when an agent's actual task execution drifts from its declared specialization.

// ─── Types ──────────────────────────────────────────────────────────

export interface RecentResult {
  taskType: string;
  taskTitle: string;
  evaluation: string;
}

export interface DriftReport {
  agentId: string;
  originalSpecialization: string[];
  currentSpecialization: string[];
  driftScore: number;
  recommendation: 'keep' | 'respecialize' | 'create_new_agent';
}

// ─── Constants ──────────────────────────────────────────────────────

const DRIFT_THRESHOLD = 0.6;
const RESPECIALIZE_THRESHOLD = 0.8;

// ─── SpecializationDriftDetector ────────────────────────────────────

export class SpecializationDriftDetector {
  /**
   * Detect drift between an agent's declared keywords and actual task execution.
   * driftScore: 0 = perfectly aligned, 1 = completely drifted.
   */
  detect(
    agentId: string,
    triggerKeywords: string[],
    recentResults: RecentResult[],
  ): DriftReport {
    if (recentResults.length === 0) {
      return {
        agentId,
        originalSpecialization: [...triggerKeywords],
        currentSpecialization: [],
        driftScore: 0,
        recommendation: 'keep',
      };
    }

    const originalSet = new Set(triggerKeywords.map(k => k.toLowerCase()));
    const actualKeywords = this._extractActualKeywords(recentResults);
    const currentSpecialization = [...new Set(actualKeywords)];

    const driftScore = this._computeDriftScore(originalSet, actualKeywords);
    const recommendation = this._computeRecommendation(driftScore);

    return {
      agentId,
      originalSpecialization: [...triggerKeywords],
      currentSpecialization,
      driftScore,
      recommendation,
    };
  }

  /**
   * Extract keywords from actual task results.
   */
  _extractActualKeywords(results: RecentResult[]): string[] {
    const keywords: string[] = [];
    for (const r of results) {
      const combined = `${r.taskType} ${r.taskTitle}`.toLowerCase();
      const tokens = combined
        .split(/[\s\-_.,;:!?()[\]{}"'`/\\|@#$%^&*+=<>~]+/)
        .filter(t => t.length >= 2);
      keywords.push(...tokens);
    }
    return [...new Set(keywords)];
  }

  /**
   * Compute drift score: 0 = aligned, 1 = drifted.
   * Based on overlap between original keywords and actual task keywords.
   */
  _computeDriftScore(originalSet: Set<string>, actualKeywords: string[]): number {
    if (originalSet.size === 0 && actualKeywords.length === 0) return 0;
    if (originalSet.size === 0) return 1;
    if (actualKeywords.length === 0) return 0;

    const actualSet = new Set(actualKeywords);
    let matchCount = 0;
    for (const keyword of actualSet) {
      if (originalSet.has(keyword)) {
        matchCount++;
      }
    }

    const overlapRatio = matchCount / Math.max(originalSet.size, actualSet.size);
    return Math.round((1 - overlapRatio) * 100) / 100;
  }

  /**
   * Determine recommendation based on drift score.
   */
  _computeRecommendation(driftScore: number): 'keep' | 'respecialize' | 'create_new_agent' {
    if (driftScore < DRIFT_THRESHOLD) return 'keep';
    if (driftScore < RESPECIALIZE_THRESHOLD) return 'respecialize';
    return 'create_new_agent';
  }
}
