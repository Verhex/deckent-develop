// ─── Conflict Resolver ──────────────────────────────────────────────────────
// Detects and resolves file-level conflicts between parallel worker results.
// Sprint 138: Added plan-time scope collision detection (ADR-035).

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

// ═══ Plan-Time Scope Collision Detection ══════════════════════════════
// Sprint 138 — Task 004 (ADR-035)
// Detects file write collisions BEFORE tasks run, builds collision-aware waves.

import type { Task } from '../core/types.js';
import { ParallelPipelineManager } from './parallel-pipeline.js';
import type { ExecutionWave } from './parallel-pipeline.js';
import { debugLog } from '../core/utils.js';

/** Map of file path → array of task IDs that write to it (only files with 2+ writers). */
export type CollisionMap = Map<string, string[]>;

/** Collision detection result with metadata. */
export interface CollisionResult {
  collisions: CollisionMap;
  collisionCount: number;
  collidingPairs: Array<[string, string]>;
}

/**
 * Detect scope collisions among tasks at plan-time.
 * Returns files written by 2+ tasks and the colliding task pairs.
 */
export function detectScopeCollisions(tasks: Task[]): CollisionResult {
  const fileWriters: Map<string, string[]> = new Map();

  for (const task of tasks) {
    if (!task.scope?.filesWrite) continue;

    for (const file of task.scope.filesWrite) {
      const normalized = file.trim();
      if (!normalized) continue;

      const writers = fileWriters.get(normalized) ?? [];
      writers.push(task.id);
      fileWriters.set(normalized, writers);
    }
  }

  // Filter to only collisions (2+ writers)
  const collisions: CollisionMap = new Map();
  for (const [file, writers] of fileWriters) {
    if (writers.length >= 2) {
      collisions.set(file, writers);
    }
  }

  // Build unique collision pairs
  const collidingPairs: Array<[string, string]> = [];
  const seenPairs = new Set<string>();
  for (const writers of collisions.values()) {
    for (let i = 0; i < writers.length; i++) {
      for (let j = i + 1; j < writers.length; j++) {
        const wi = writers[i]!;
        const wj = writers[j]!;
        const pair = [wi, wj].sort().join(':');
        if (!seenPairs.has(pair)) {
          seenPairs.add(pair);
          collidingPairs.push([wi, wj]);
        }
      }
    }
  }

  return { collisions, collisionCount: collisions.size, collidingPairs };
}

/**
 * Build collision-aware execution waves via augmented topological sort.
 *
 * Strategy:
 * 1. Start with dependency-based topological sort
 * 2. Add synthetic dependency edges for colliding tasks
 *    (lower ID → higher ID within each pair)
 * 3. Re-run topological sort with augmented edges
 * 4. Respect maxWorkers limit per wave
 */
export function buildCollisionAwareWaves(
  tasks: Task[],
  maxWorkers: number,
): ExecutionWave[] {
  if (tasks.length === 0) return [];

  const { collidingPairs } = detectScopeCollisions(tasks);

  // Build augmented dependency list
  const taskDeps = new Map<string, string[]>();
  for (const task of tasks) {
    taskDeps.set(task.id, [...(task.dependencies ?? [])]);
  }

  // Add collision edges: lower ID task first, higher depends on it
  for (const [a, b] of collidingPairs) {
    const sorted = [a, b].sort();
    const first = sorted[0]!;
    const second = sorted[1]!;
    const secondDeps = taskDeps.get(second);
    if (secondDeps && !secondDeps.includes(first)) {
      secondDeps.push(first);
      debugLog('conflict-resolver', `Collision edge: ${second} → ${first} (shared file write)`);
    }
  }

  // Topological sort with augmented deps
  const pipeline = new ParallelPipelineManager();
  const pipelineTasks = tasks.map(t => ({
    id: t.id,
    dependencies: taskDeps.get(t.id) ?? [],
  }));

  const rawWaves = pipeline.createPipeline(pipelineTasks);

  // Split waves that exceed maxWorkers
  const waves: ExecutionWave[] = [];
  for (const wave of rawWaves) {
    if (wave.taskIds.length <= maxWorkers) {
      waves.push({ waveIndex: waves.length, taskIds: wave.taskIds });
    } else {
      for (let i = 0; i < wave.taskIds.length; i += maxWorkers) {
        const chunk = wave.taskIds.slice(i, i + maxWorkers);
        waves.push({ waveIndex: waves.length, taskIds: chunk });
      }
    }
  }

  return waves;
}
