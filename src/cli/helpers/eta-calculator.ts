// ─── ETA Calculator ─────────────────────────────────────────────────

export class ETACalculator {
  calculateETA(
    completed: number,
    total: number,
    elapsedMs: number,
    taskDurations: number[] = [],
  ): number {
    const remaining = total - completed;
    if (remaining <= 0) return 0;
    if (completed === 0 && taskDurations.length === 0) return -1; // no data

    // Use rolling weighted average if we have task durations
    if (taskDurations.length > 0) {
      const avgMs = this.weightedAverage(taskDurations);
      return Math.round(avgMs * remaining);
    }

    // Fallback: linear estimate from elapsed time
    if (completed > 0) {
      const perTask = elapsedMs / completed;
      return Math.round(perTask * remaining);
    }

    return -1; // no data
  }

  formatETA(etaMs: number): string {
    if (etaMs < 0) return 'calculating...';
    if (etaMs === 0) return '~0s';

    const totalSeconds = Math.round(etaMs / 1000);
    if (totalSeconds < 60) {
      return `~${totalSeconds}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (seconds === 0) {
      return `~${minutes}m`;
    }
    return `~${minutes}m ${seconds}s`;
  }

  private weightedAverage(durations: number[]): number {
    if (durations.length === 0) return 0;
    if (durations.length === 1) return durations[0] ?? 0;

    // Last 3 tasks get 2x weight
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < durations.length; i++) {
      const isRecent = i >= durations.length - 3;
      const weight = isRecent ? 2 : 1;
      weightedSum += (durations[i] ?? 0) * weight;
      totalWeight += weight;
    }
    return weightedSum / totalWeight;
  }
}
