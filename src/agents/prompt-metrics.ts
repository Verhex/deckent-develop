// ─── Prompt Metrics ─────────────────────────────────────────────────────────
// Collects and formats metrics about prompt versions and experiments.
import type { PromptVersion } from './prompt-version.js';
import type { Experiment } from './prompt-ab-test.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface PromptMetricsReport {
  agentId: string;
  currentVersion: number;
  totalVersions: number;
  currentSuccessRate: number;
  bestVersion: { version: number; successRate: number };
  worstVersion: { version: number; successRate: number };
  experimentStatus: 'none' | 'active' | 'completed';
  trend: 'improving' | 'declining' | 'stable';
}

// ─── Constants ──────────────────────────────────────────────────────

const TREND_WINDOW = 3;
const TREND_THRESHOLD = 0.05;  // 5% difference to detect a trend

// ─── PromptMetrics ──────────────────────────────────────────────────

export class PromptMetrics {
  /**
   * Collect metrics for an agent from its prompt versions and experiment.
   */
  collectMetrics(
    agentId: string,
    versions: PromptVersion[],
    experiment?: Experiment,
  ): PromptMetricsReport {
    const totalVersions = versions.length;

    // Current version is the highest version number
    const sorted = [...versions].sort((a, b) => a.version - b.version);
    const currentVersion = sorted.length > 0 ? sorted[sorted.length - 1]! : null;
    const currentVersionNum = currentVersion?.version ?? 0;
    const currentSuccessRate = currentVersion?.stats.successRate ?? 0;

    // Best and worst versions
    const best = this._findBest(sorted);
    const worst = this._findWorst(sorted);

    // Experiment status
    let experimentStatus: 'none' | 'active' | 'completed' = 'none';
    if (experiment) {
      experimentStatus = experiment.status;
    }

    // Trend from last TREND_WINDOW versions
    const trend = this._calculateTrend(sorted);

    return {
      agentId,
      currentVersion: currentVersionNum,
      totalVersions,
      currentSuccessRate,
      bestVersion: best,
      worstVersion: worst,
      experimentStatus,
      trend,
    };
  }

  /**
   * Format a metrics report into a human-readable string.
   */
  formatMetricsReport(report: PromptMetricsReport): string {
    const lines: string[] = [];
    lines.push(`Prompt Metrics for agent: ${report.agentId}`);
    lines.push(`  Current version: v${report.currentVersion}`);
    lines.push(`  Total versions: ${report.totalVersions}`);
    lines.push(`  Current success rate: ${(report.currentSuccessRate * 100).toFixed(1)}%`);
    lines.push(`  Best version: v${report.bestVersion.version} (${(report.bestVersion.successRate * 100).toFixed(1)}%)`);
    lines.push(`  Worst version: v${report.worstVersion.version} (${(report.worstVersion.successRate * 100).toFixed(1)}%)`);
    lines.push(`  Experiment: ${report.experimentStatus}`);
    lines.push(`  Trend: ${report.trend}`);
    return lines.join('\n');
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private _findBest(versions: PromptVersion[]): { version: number; successRate: number } {
    if (versions.length === 0) {
      return { version: 0, successRate: 0 };
    }
    let best = versions[0]!;
    for (const v of versions) {
      if (v.stats.successRate > best.stats.successRate) {
        best = v;
      } else if (
        v.stats.successRate === best.stats.successRate &&
        v.stats.uses > best.stats.uses
      ) {
        best = v;
      }
    }
    return { version: best.version, successRate: best.stats.successRate };
  }

  private _findWorst(versions: PromptVersion[]): { version: number; successRate: number } {
    if (versions.length === 0) {
      return { version: 0, successRate: 0 };
    }
    let worst = versions[0]!;
    for (const v of versions) {
      if (v.stats.successRate < worst.stats.successRate) {
        worst = v;
      }
    }
    return { version: worst.version, successRate: worst.stats.successRate };
  }

  private _calculateTrend(versions: PromptVersion[]): 'improving' | 'declining' | 'stable' {
    if (versions.length < 2) return 'stable';

    const recent = versions.slice(-TREND_WINDOW);
    if (recent.length < 2) return 'stable';

    // Compare first and last in the window
    const first = recent[0]!;
    const last = recent[recent.length - 1]!;

    const diff = last.stats.successRate - first.stats.successRate;

    if (diff > TREND_THRESHOLD) return 'improving';
    if (diff < -TREND_THRESHOLD) return 'declining';
    return 'stable';
  }
}
