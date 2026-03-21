// ─── Agent Performance Formatter ────────────────────────────────────
import type { TaskEvaluation } from '../../core/types.js';

export interface AgentStats {
  agentId: string;
  totalTasks: number;
  doneTasks: number;
  techDebtTasks: number;
  noGoTasks: number;
  successRate: number;
}

export class AgentPerformanceFormatter {
  format(
    evaluations: Map<string, TaskEvaluation | string>,
    taskAgentMap: Map<string, string>,
  ): string {
    const agentGroups = this.groupByAgent(evaluations, taskAgentMap);
    const stats = this.calculateStats(agentGroups);

    if (stats.length === 0) {
      return 'No agent performance data';
    }

    const lines: string[] = ['Agent Performance:'];
    lines.push('');

    for (const stat of stats) {
      const underperformer = stat.successRate < 60;
      const marker = underperformer ? ' [UNDERPERFORMER]' : '';
      lines.push(`  ${stat.agentId}: ${stat.doneTasks}/${stat.totalTasks} DONE (${stat.successRate.toFixed(0)}%)${marker}`);
      if (stat.techDebtTasks > 0) {
        lines.push(`    Tech Debt: ${stat.techDebtTasks}`);
      }
      if (stat.noGoTasks > 0) {
        lines.push(`    NO_GO: ${stat.noGoTasks}`);
      }
    }

    return lines.join('\n');
  }

  groupByAgent(
    evaluations: Map<string, TaskEvaluation | string>,
    taskAgentMap: Map<string, string>,
  ): Map<string, Array<{ taskId: string; evaluation: string }>> {
    const groups = new Map<string, Array<{ taskId: string; evaluation: string }>>();

    for (const [taskId, evaluation] of evaluations) {
      const agentId = taskAgentMap.get(taskId) ?? 'unknown';
      const list = groups.get(agentId) ?? [];
      list.push({ taskId, evaluation: String(evaluation) });
      groups.set(agentId, list);
    }

    return groups;
  }

  calculateStats(
    groups: Map<string, Array<{ taskId: string; evaluation: string }>>,
  ): AgentStats[] {
    const stats: AgentStats[] = [];

    for (const [agentId, tasks] of groups) {
      const totalTasks = tasks.length;
      const doneTasks = tasks.filter((t) => t.evaluation === 'DONE').length;
      const techDebtTasks = tasks.filter((t) => t.evaluation === 'GO_WITH_TECH_DEBT').length;
      const noGoTasks = tasks.filter((t) => t.evaluation === 'NO_GO').length;
      const successRate = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;

      stats.push({ agentId, totalTasks, doneTasks, techDebtTasks, noGoTasks, successRate });
    }

    return stats.sort((a, b) => b.successRate - a.successRate);
  }
}
