// ─── Recommendation Engine ──────────────────────────────────────────
import type { SprintMetrics, TaskEvaluation } from '../../core/types.js';
import type { AgentStats } from './agent-performance.js';

export interface Recommendation {
  type: 'fix' | 'warning' | 'suggestion' | 'regression' | 'success';
  message: string;
  priority: number; // lower = higher priority
}

export interface RecommendationInput {
  metrics: SprintMetrics;
  evaluations: Map<string, TaskEvaluation | string>;
  agentPerformance: AgentStats[];
  previousCoverage?: number;
}

const MAX_RECOMMENDATIONS = 5;

export class RecommendationEngine {
  generate(input: RecommendationInput): Recommendation[] {
    const recommendations: Recommendation[] = [];

    this.checkNoGoFixes(input, recommendations);
    this.checkTechDebtWarning(input, recommendations);
    this.checkAgentSuggestions(input, recommendations);
    this.checkCoverageRegression(input, recommendations);
    this.checkAllDone(input, recommendations);

    // Sort by priority (lower = more important) and limit
    recommendations.sort((a, b) => a.priority - b.priority);
    return recommendations.slice(0, MAX_RECOMMENDATIONS);
  }

  private checkNoGoFixes(input: RecommendationInput, recs: Recommendation[]): void {
    const noGoTasks: string[] = [];
    for (const [taskId, evaluation] of input.evaluations) {
      if (evaluation === 'NO_GO') {
        noGoTasks.push(taskId);
      }
    }
    if (noGoTasks.length > 0) {
      recs.push({
        type: 'fix',
        message: `Fix ${noGoTasks.length} NO_GO task(s): ${noGoTasks.join(', ')}`,
        priority: 1,
      });
    }
  }

  private checkTechDebtWarning(input: RecommendationInput, recs: Recommendation[]): void {
    if (input.metrics.techDebtTasks > 0) {
      recs.push({
        type: 'warning',
        message: `${input.metrics.techDebtTasks} task(s) completed with tech debt. Review and schedule cleanup.`,
        priority: 3,
      });
    }
  }

  private checkAgentSuggestions(input: RecommendationInput, recs: Recommendation[]): void {
    const underperformers = input.agentPerformance.filter((a) => a.successRate < 60 && a.totalTasks > 0);
    if (underperformers.length > 0) {
      const names = underperformers.map((a) => `${a.agentId} (${a.successRate.toFixed(0)}%)`);
      recs.push({
        type: 'suggestion',
        message: `Underperforming agent(s): ${names.join(', ')}. Consider reassigning tasks or upgrading model.`,
        priority: 4,
      });
    }
  }

  private checkCoverageRegression(input: RecommendationInput, recs: Recommendation[]): void {
    if (input.previousCoverage !== undefined && input.previousCoverage > 0) {
      const diff = input.metrics.coveragePercent - input.previousCoverage;
      if (diff < -1) {
        recs.push({
          type: 'regression',
          message: `Coverage regressed by ${Math.abs(diff).toFixed(1)}% (${input.previousCoverage.toFixed(1)}% -> ${input.metrics.coveragePercent.toFixed(1)}%).`,
          priority: 2,
        });
      }
    }
  }

  private checkAllDone(input: RecommendationInput, recs: Recommendation[]): void {
    const allDone = Array.from(input.evaluations.values()).every((e) => e === 'DONE');
    if (allDone && input.evaluations.size > 0) {
      recs.push({
        type: 'success',
        message: 'All tasks completed successfully. Ready for next sprint.',
        priority: 10,
      });
    }
  }
}
