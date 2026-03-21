// ─── Types ───────────────────────────────────────────────────────────────────

export interface SprintDataPoint {
  sprintId: string;
  totalTasks: number;
  completedTasks: number;
  techDebtTasks: number;
  noGoTasks: number;
  coverage: number;
}

export interface TimelineEntry {
  sprintId: string;
  successRate: number;
  coverageRate: number;
  taskCount: number;
}

export type TrendDirection = 'improving' | 'stable' | 'declining';

export interface PeakValley {
  sprintId: string;
  successRate: number;
}

// ─── SuccessChartData ────────────────────────────────────────────────────────

export class SuccessChartData {
  prepareTimelineData(sprints: SprintDataPoint[]): TimelineEntry[] {
    return sprints.map((s) => {
      const successRate = s.totalTasks > 0
        ? Math.round(((s.completedTasks + s.techDebtTasks) / s.totalTasks) * 100 * 100) / 100
        : 0;

      return {
        sprintId: s.sprintId,
        successRate,
        coverageRate: s.coverage,
        taskCount: s.totalTasks,
      };
    });
  }

  calculateTrend(data: TimelineEntry[]): TrendDirection {
    if (data.length < 2) return 'stable';

    // Use linear regression slope over the last N data points
    const recent = data.slice(-Math.min(data.length, 5));
    const n = recent.length;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recent[i]!.successRate;
      sumXY += i * recent[i]!.successRate;
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 'stable';

    const slope = (n * sumXY - sumX * sumY) / denominator;

    // Threshold: slope > 2 = improving, < -2 = declining, else stable
    if (slope > 2) return 'improving';
    if (slope < -2) return 'declining';
    return 'stable';
  }

  findPeakSprint(data: TimelineEntry[]): PeakValley | null {
    if (data.length === 0) return null;

    let peak = data[0]!;
    for (const entry of data) {
      if (entry.successRate > peak.successRate) {
        peak = entry;
      }
    }

    return { sprintId: peak.sprintId, successRate: peak.successRate };
  }

  findValleySprint(data: TimelineEntry[]): PeakValley | null {
    if (data.length === 0) return null;

    let valley = data[0]!;
    for (const entry of data) {
      if (entry.successRate < valley.successRate) {
        valley = entry;
      }
    }

    return { sprintId: valley.sprintId, successRate: valley.successRate };
  }

  calculateMovingAverage(data: TimelineEntry[], windowSize: number): number[] {
    if (data.length === 0 || windowSize <= 0) return [];

    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = data.slice(start, i + 1);
      const avg = window.reduce((sum, d) => sum + d.successRate, 0) / window.length;
      result.push(Math.round(avg * 100) / 100);
    }
    return result;
  }
}
