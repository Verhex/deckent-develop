// ─── Result Merger ──────────────────────────────────────────────────────────
// Overlap detection between worker results.
// Note: mergeResults was removed — sprint-reporter.calculateMetrics() owns
// that aggregation now.

export interface OverlapEntry {
  file: string;
  workers: string[];
}

export interface OverlapDetectable {
  taskId: string;
  filesChanged: string[];
}

export class ResultMerger {
  /**
   * Detect files modified by multiple workers (real post-execution overlaps).
   * Distinct from pre-spawn detectScopeCollisions — this checks actual
   * filesChanged from worker .result files.
   */
  detectOverlaps(results: OverlapDetectable[]): OverlapEntry[] {
    const fileToWorkers = new Map<string, string[]>();

    for (const result of results) {
      for (const file of result.filesChanged) {
        const workers = fileToWorkers.get(file) ?? [];
        workers.push(result.taskId);
        fileToWorkers.set(file, workers);
      }
    }

    const overlaps: OverlapEntry[] = [];
    for (const [file, workers] of fileToWorkers) {
      if (workers.length > 1) {
        overlaps.push({ file, workers: [...new Set(workers)] });
      }
    }

    return overlaps.sort((a, b) => a.file.localeCompare(b.file));
  }
}
