// ─── Conflict Resolver ──────────────────────────────────────────────────────
// Detects and resolves file-level conflicts between parallel worker results.

export type ConflictType = 'same_file_write' | 'scope_overlap' | 'test_interference';
export type ConflictStrategy = 'last_writer_wins' | 'first_writer_wins' | 'manual';

export interface Conflict {
  type: ConflictType;
  files: string[];
  workers: string[];
  detail: string;
}

export interface WorkerResult {
  taskId: string;
  filesChanged: string[];
}

export interface ConflictResolution {
  resolved: boolean;
  winner?: string;
}

export class ConflictResolver {
  /**
   * Detect conflicts among worker results.
   * - same_file_write: multiple workers modified the same file
   * - scope_overlap: multiple workers share 2+ overlapping files
   * - test_interference: multiple workers modified the same test file
   */
  detectConflicts(results: WorkerResult[]): Conflict[] {
    if (results.length < 2) return [];

    const conflicts: Conflict[] = [];
    const fileToWorkers = new Map<string, string[]>();

    // Build file -> workers map
    for (const result of results) {
      for (const file of result.filesChanged) {
        const workers = fileToWorkers.get(file) ?? [];
        workers.push(result.taskId);
        fileToWorkers.set(file, workers);
      }
    }

    // Detect same_file_write conflicts
    const sameFileConflictFiles: string[] = [];
    for (const [file, workers] of fileToWorkers) {
      if (workers.length > 1) {
        sameFileConflictFiles.push(file);
        conflicts.push({
          type: 'same_file_write',
          files: [file],
          workers: [...new Set(workers)],
          detail: `File "${file}" modified by workers: ${[...new Set(workers)].join(', ')}`,
        });
      }
    }

    // Detect test_interference: same test file modified by multiple workers
    for (const [file, workers] of fileToWorkers) {
      if (workers.length > 1 && this._isTestFile(file)) {
        // Only add if not already covered by same_file_write for this exact file
        const alreadyReported = conflicts.some(
          c => c.type === 'test_interference' && c.files.includes(file),
        );
        if (!alreadyReported) {
          conflicts.push({
            type: 'test_interference',
            files: [file],
            workers: [...new Set(workers)],
            detail: `Test file "${file}" modified by workers: ${[...new Set(workers)].join(', ')}`,
          });
        }
      }
    }

    // Detect scope_overlap: pairs of workers sharing 2+ files
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const a = results[i];
        const b = results[j];
        if (!a || !b) continue;
        const overlap = a.filesChanged.filter(f => b.filesChanged.includes(f));
        if (overlap.length >= 2) {
          conflicts.push({
            type: 'scope_overlap',
            files: overlap,
            workers: [a.taskId, b.taskId],
            detail: `Workers ${a.taskId} and ${b.taskId} share ${overlap.length} overlapping files`,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve a conflict using the given strategy.
   */
  resolveConflict(conflict: Conflict, strategy: ConflictStrategy): ConflictResolution {
    if (conflict.workers.length === 0) {
      return { resolved: false };
    }

    switch (strategy) {
      case 'last_writer_wins':
        return {
          resolved: true,
          winner: conflict.workers[conflict.workers.length - 1],
        };
      case 'first_writer_wins':
        return {
          resolved: true,
          winner: conflict.workers[0],
        };
      case 'manual':
        return { resolved: false };
      default:
        return { resolved: false };
    }
  }

  /**
   * Generate a human-readable conflict report.
   */
  generateConflictReport(conflicts: Conflict[]): string {
    if (conflicts.length === 0) return 'No conflicts detected.';

    const lines: string[] = [`Conflict Report (${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}):`];
    for (let i = 0; i < conflicts.length; i++) {
      const c = conflicts[i];
      if (!c) continue;
      lines.push(`  ${i + 1}. [${c.type}] ${c.detail}`);
      lines.push(`     Files: ${c.files.join(', ')}`);
      lines.push(`     Workers: ${c.workers.join(', ')}`);
    }
    return lines.join('\n');
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private _isTestFile(file: string): boolean {
    return /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(file) || file.includes('__tests__');
  }
}
