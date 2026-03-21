// ─── Sprint Comparison ──────────────────────────────────────────────
import type { SprintMetrics } from '../../core/types.js';

export interface SprintDelta {
  coverageDelta: number;
  durationDelta: number;
  noGoRateDelta: number;
  taskCountDelta: number;
  debtDelta: number;
  isFirst: boolean;
}

export class SprintComparison {
  compare(
    current: SprintMetrics,
    previous: SprintMetrics | null,
  ): SprintDelta {
    if (!previous) {
      return {
        coverageDelta: 0,
        durationDelta: 0,
        noGoRateDelta: 0,
        taskCountDelta: 0,
        debtDelta: 0,
        isFirst: true,
      };
    }

    return {
      coverageDelta: current.coveragePercent - previous.coveragePercent,
      durationDelta: current.durationMs - previous.durationMs,
      noGoRateDelta: current.noGoRate - previous.noGoRate,
      taskCountDelta: current.totalTasks - previous.totalTasks,
      debtDelta: current.totalOpenDebt - previous.totalOpenDebt,
      isFirst: false,
    };
  }

  formatDelta(delta: SprintDelta): string {
    if (delta.isFirst) {
      return 'First sprint - no comparison available';
    }

    const lines: string[] = ['Sprint Comparison:'];

    lines.push(`  Coverage: ${this.formatChange(delta.coverageDelta, '%', true)}`);
    lines.push(`  Duration: ${this.formatDurationChange(delta.durationDelta)}`);
    lines.push(`  NO_GO rate: ${this.formatChange(delta.noGoRateDelta, '%', false)}`);
    lines.push(`  Task count: ${this.formatIntChange(delta.taskCountDelta)}`);
    lines.push(`  Open debt: ${this.formatIntChange(delta.debtDelta)}`);

    return lines.join('\n');
  }

  private formatChange(value: number, unit: string, _positiveIsGood: boolean): string {
    if (value === 0) return `0${unit} (no change)`;
    const sign = value > 0 ? '+' : '';
    const formatted = `${sign}${value.toFixed(1)}${unit}`;
    return formatted;
  }

  private formatDurationChange(deltaMs: number): string {
    if (deltaMs === 0) return '0s (no change)';
    const sign = deltaMs > 0 ? '+' : '-';
    const absSec = Math.abs(Math.round(deltaMs / 1000));
    return `${sign}${absSec}s`;
  }

  private formatIntChange(value: number): string {
    if (value === 0) return '0 (no change)';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value}`;
  }
}
