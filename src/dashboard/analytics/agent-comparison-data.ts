// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentPerformance {
  agentId: string;
  tasksCompleted: number;
  tasksFailed: number;
  techDebtTasks: number;
  avgDurationMs: number;
  avgCoverage: number;
}

export interface AgentComparisonEntry {
  agentId: string;
  tasksCompleted: number;
  tasksFailed: number;
  techDebtTasks: number;
  successRate: number;
  avgDurationMs: number;
  avgCoverage: number;
  totalTasks: number;
}

export type SortColumn =
  | 'agentId'
  | 'tasksCompleted'
  | 'tasksFailed'
  | 'successRate'
  | 'avgDurationMs'
  | 'avgCoverage'
  | 'totalTasks';

export type SortDirection = 'asc' | 'desc';

// ─── AgentComparisonData ─────────────────────────────────────────────────────

export class AgentComparisonData {
  prepareComparisonTable(agents: AgentPerformance[]): AgentComparisonEntry[] {
    return agents.map((a) => {
      const totalTasks = a.tasksCompleted + a.tasksFailed + a.techDebtTasks;
      const successRate = totalTasks > 0
        ? Math.round(((a.tasksCompleted + a.techDebtTasks) / totalTasks) * 100 * 100) / 100
        : 0;

      return {
        agentId: a.agentId,
        tasksCompleted: a.tasksCompleted,
        tasksFailed: a.tasksFailed,
        techDebtTasks: a.techDebtTasks,
        successRate,
        avgDurationMs: a.avgDurationMs,
        avgCoverage: a.avgCoverage,
        totalTasks,
      };
    });
  }

  sortByColumn(
    data: AgentComparisonEntry[],
    column: SortColumn,
    direction: SortDirection = 'desc',
  ): AgentComparisonEntry[] {
    const sorted = [...data];
    sorted.sort((a, b) => {
      const aVal = a[column];
      const bVal = b[column];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const numA = typeof aVal === 'number' ? aVal : 0;
      const numB = typeof bVal === 'number' ? bVal : 0;

      return direction === 'asc' ? numA - numB : numB - numA;
    });
    return sorted;
  }

  getBestPerformer(data: AgentComparisonEntry[]): AgentComparisonEntry | null {
    if (data.length === 0) return null;

    let best = data[0]!;
    for (const entry of data) {
      if (entry.successRate > best.successRate) {
        best = entry;
      } else if (
        entry.successRate === best.successRate &&
        entry.totalTasks > best.totalTasks
      ) {
        best = entry;
      }
    }
    return best;
  }

  getWorstPerformer(data: AgentComparisonEntry[]): AgentComparisonEntry | null {
    if (data.length === 0) return null;

    let worst = data[0]!;
    for (const entry of data) {
      if (entry.successRate < worst.successRate) {
        worst = entry;
      } else if (
        entry.successRate === worst.successRate &&
        entry.totalTasks > worst.totalTasks
      ) {
        worst = entry;
      }
    }
    return worst;
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
}
