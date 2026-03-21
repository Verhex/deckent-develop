// ─── Parallel Pipeline Manager ─────────────────────────────────────────────
// Topological sort of tasks into execution waves based on dependencies.
// Wave 0: no deps, Wave 1: depends only on wave 0, etc.

export interface ExecutionWave {
  waveIndex: number;
  taskIds: string[];
}

export interface PipelineTask {
  id: string;
  dependencies: string[];
}

/**
 * Topological sort tasks into parallel execution waves.
 * Wave 0 contains tasks with no dependencies.
 * Wave N contains tasks whose dependencies all resolve in waves < N.
 * Throws on circular dependencies.
 */
export class ParallelPipelineManager {
  createPipeline(tasks: PipelineTask[]): ExecutionWave[] {
    if (tasks.length === 0) return [];

    // Build adjacency and in-degree maps
    const taskMap = new Map<string, PipelineTask>();
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // dep -> tasks that depend on it

    for (const task of tasks) {
      taskMap.set(task.id, task);
      inDegree.set(task.id, 0);
      if (!dependents.has(task.id)) {
        dependents.set(task.id, []);
      }
    }

    // Validate dependencies reference known tasks and compute in-degrees
    for (const task of tasks) {
      const validDeps = task.dependencies.filter(dep => taskMap.has(dep));
      inDegree.set(task.id, validDeps.length);
      for (const dep of validDeps) {
        const list = dependents.get(dep);
        if (list) {
          list.push(task.id);
        }
      }
    }

    const waves: ExecutionWave[] = [];
    const resolved = new Set<string>();
    let remaining = tasks.length;

    while (remaining > 0) {
      // Collect tasks with in-degree 0
      const waveTaskIds: string[] = [];
      for (const [id, deg] of inDegree) {
        if (deg === 0 && !resolved.has(id)) {
          waveTaskIds.push(id);
        }
      }

      if (waveTaskIds.length === 0) {
        // Remaining tasks all have unresolved deps -> circular dependency
        const unresolved = [...inDegree.keys()].filter(id => !resolved.has(id));
        throw new Error(`Circular dependency detected among tasks: ${unresolved.join(', ')}`);
      }

      // Sort for deterministic output
      waveTaskIds.sort();

      waves.push({
        waveIndex: waves.length,
        taskIds: waveTaskIds,
      });

      // Mark resolved and decrement dependents
      for (const id of waveTaskIds) {
        resolved.add(id);
        remaining--;
        const deps = dependents.get(id) ?? [];
        for (const depId of deps) {
          const current = inDegree.get(depId) ?? 0;
          inDegree.set(depId, current - 1);
        }
      }
    }

    return waves;
  }

  /**
   * Human-readable visualization of the execution plan.
   */
  getExecutionPlan(waves: ExecutionWave[]): string {
    if (waves.length === 0) return 'No tasks to execute.';

    const lines: string[] = ['Execution Plan:'];
    for (const wave of waves) {
      lines.push(`  Wave ${wave.waveIndex}: [${wave.taskIds.join(', ')}]`);
    }
    lines.push(`Total waves: ${waves.length}`);
    return lines.join('\n');
  }
}
