// ─── Result Merger ──────────────────────────────────────────────────────────
// Merges multiple worker results into a unified sprint summary.

export interface MergeableResult {
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  coverage: number;
  testsPassed: boolean;
}

export interface MergedResult {
  totalFilesChanged: string[];
  totalLinesAdded: number;
  totalLinesRemoved: number;
  combinedCoverage: number;
  allTestsPassed: boolean;
}

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
   * Merge multiple worker results into a single summary.
   * - totalFilesChanged: deduplicated union of all files
   * - combinedCoverage: average of all non-zero coverages
   * - allTestsPassed: true only if all workers passed
   */
  mergeResults(results: MergeableResult[]): MergedResult {
    if (results.length === 0) {
      return {
        totalFilesChanged: [],
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
        combinedCoverage: 0,
        allTestsPassed: true,
      };
    }

    const allFiles = new Set<string>();
    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;
    let allTestsPassed = true;
    let coverageSum = 0;
    let coverageCount = 0;

    for (const result of results) {
      for (const file of result.filesChanged) {
        allFiles.add(file);
      }
      totalLinesAdded += result.linesAdded;
      totalLinesRemoved += result.linesRemoved;
      if (!result.testsPassed) allTestsPassed = false;
      if (result.coverage > 0) {
        coverageSum += result.coverage;
        coverageCount++;
      }
    }

    return {
      totalFilesChanged: [...allFiles].sort(),
      totalLinesAdded,
      totalLinesRemoved,
      combinedCoverage: coverageCount > 0 ? Math.round((coverageSum / coverageCount) * 100) / 100 : 0,
      allTestsPassed,
    };
  }

  /**
   * Detect files modified by multiple workers (overlaps).
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
