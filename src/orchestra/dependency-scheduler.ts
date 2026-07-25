// ═══ Chain Dependency Execution Scheduler ═══════════════════════════
// Sprint 139 Task 028 — Wave 1 Early Wire
// Sprint 139 Task 029 — Cascade Blocking with Event Stream Integration
// Sprint 139 Task 030 — Dependency Graph Persistence + Resume Integration
//
// Provides real topological ordering for sprint task execution:
//   - DependencyGraph with Kahn's algorithm
//   - Collision-aware wave assignment (reuses Sprint 138 detectScopeCollisions)
//   - enforceWaveDependency: filter tasks whose deps are all DONE
//   - cascadeBlockDependents: mark transitive dependents BLOCKED on failure
//   - unblockDependents: re-enable dependents when a blocker resolves
//   - applyFailureCascade: wire decideCascadeAction → cascadeBlockDependents (Task 029)
//   - applyResolutionUnblock: wire fix resolution → unblockDependents (Task 029)
//   - persistDependencyGraph: serialize graph to JSON + Mermaid .mmd (Task 030)
//   - loadDependencyGraph: restore graph from JSON checkpoint (Task 030)
//   - generateMermaidDiagram: human-readable Mermaid diagram with status highlighting

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Task } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import { DECKENT_DIR } from '../core/constants.js';
import { deriveExecutionTopology } from '../core/execution-topology.js';
import { debugLog } from '../core/utils.js';

// ─── Types ──────────────────────────────────────────────────────────

/** Adjacency + metadata for dependency graph. */
export interface DependencyGraph {
  /** task ID → set of task IDs it depends on */
  dependencies: Map<string, Set<string>>;
  /** task ID → set of task IDs that depend on it (reverse edges) */
  dependents: Map<string, Set<string>>;
  /** task ID → assigned wave index (populated after topological sort) */
  waveAssignment: Map<string, number>;
  /** Ordered execution waves */
  waves: DependencyWave[];
  /** True if a cycle was detected */
  hasCycle: boolean;
  /** Task IDs involved in the cycle (empty if no cycle) */
  cycleTaskIds: string[];
}

export interface DependencyWave {
  waveIndex: number;
  taskIds: string[];
}

/** Result of enforceWaveDependency filtering. */
export interface EnforcementResult {
  eligible: string[];
  blocked: string[];
  reasons: Map<string, string[]>; // taskId → list of unresolved dep IDs
}

/** Result of cascadeBlockDependents. */
export interface CascadeResult {
  blockedTaskIds: string[];
  totalBlocked: number;
}

/** Result of unblockDependents. */
export interface UnblockResult {
  unblockedTaskIds: string[];
  totalUnblocked: number;
}

/**
 * Event log callback type for cascade/unblock state transitions.
 * Callers (sprint-spawner) provide this to write to the event stream
 * without creating a circular import dependency.
 */
export type CascadeEventCallback = (event: CascadeTransitionEvent) => void;

/** State transition event emitted by cascade/unblock operations. */
export interface CascadeTransitionEvent {
  /** 'BLOCKED' when task is cascade-blocked, 'UNBLOCKED' when re-enabled */
  transition: 'BLOCKED' | 'UNBLOCKED';
  /** The task whose state changed */
  taskId: string;
  /** The task that caused the cascade (failed) or was resolved (unblocked) */
  triggerTaskId: string;
  /** Failure category (CODE/RUNTIME/AMBIGUOUS) — only for BLOCKED transitions */
  failureCategory?: string;
  /** Previous status before transition */
  fromStatus: TaskStatus;
  /** New status after transition */
  toStatus: TaskStatus;
}

/**
 * Input to applyFailureCascade — carries failure classification from Task 024.
 * Avoids direct import of FailureContext/CascadeDecision from result-evaluator.
 */
export interface CascadeBlockOptions {
  /** Whether cascade should actually be applied (false for RUNTIME/AMBIGUOUS) */
  shouldCascade: boolean;
  /** Failure category from classifyFailure (CODE | RUNTIME | AMBIGUOUS) */
  failureCategory: string;
  /** Optional event callback for event stream logging */
  onTransition?: CascadeEventCallback;
}

/** Result of applyFailureCascade — adds decision metadata to CascadeResult */
export interface ApplyFailureCascadeResult extends CascadeResult {
  /** Whether cascade was applied (false for RUNTIME/AMBIGUOUS no-op) */
  cascadeApplied: boolean;
  /** Failure category used for this decision */
  failureCategory: string;
}

// ─── Core: Build Dependency Graph ───────────────────────────────────

/**
 * Build a DependencyGraph from tasks using Kahn's algorithm for topological sort.
 * Integrates Sprint 138 scope collision detection to add synthetic dependency edges
 * between tasks that write to the same files.
 *
 * @param tasks - Sprint tasks with dependencies and scope
 * @param includeCollisions - Whether to add collision edges (default: true)
 * @returns Complete dependency graph with wave assignments
 */
export function buildDependencyGraph(
  tasks: Task[],
  includeCollisions = true,
): DependencyGraph {
  const topology = deriveExecutionTopology(tasks, { maxWorkers: Math.max(1, tasks.length) });
  const selectedEdges = includeCollisions ? topology.effectiveEdges : topology.authoredEdges;
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  for (const task of tasks) {
    dependencies.set(task.id, new Set());
    dependents.set(task.id, new Set());
  }

  for (const edge of selectedEdges) {
    const from = tasks[edge.from - 1]?.id;
    const to = tasks[edge.to - 1]?.id;
    if (from && to) {
      dependencies.get(to)?.add(from);
      dependents.get(from)?.add(to);
    }
  }

  for (const finding of topology.findings) {
    if (finding.code === 'unresolved-dependency') {
      const taskId = tasks[(finding.slots[0] ?? 1) - 1]?.id ?? `slot-${finding.slots[0] ?? '?'}`;
      // Preserve the unresolved ref in the runtime dependency set. Dropping it
      // would make enforceWaveDependency treat the task as eligible even
      // though the shared topology authority rejected the plan.
      dependencies.get(taskId)?.add(finding.ref ?? 'unresolved-dependency');
      debugLog(
        'dependency-scheduler:buildGraph',
        `Task ${taskId}: dependency "${finding.ref ?? ''}" is unresolved`,
      );
    }
  }

  const selectedTopology = includeCollisions
    ? topology
    : deriveExecutionTopology(
        tasks.map(task => ({ ...task, scope: { ...task.scope, filesWrite: [] } })),
        { maxWorkers: Math.max(1, tasks.length) },
      );
  const waves: DependencyWave[] = selectedTopology.waves.map(wave => ({
    waveIndex: wave.wave - 1,
    taskIds: wave.slots.map(slot => tasks[slot - 1]!.id),
  }));
  const waveAssignment = new Map<string, number>();
  for (const wave of waves) {
    for (const taskId of wave.taskIds) waveAssignment.set(taskId, wave.waveIndex);
  }

  const cycleSlots = selectedTopology.findings
    .filter(finding => finding.code === 'dependency-cycle')
    .flatMap(finding => finding.slots);
  const cycleTaskIds = [...new Set(cycleSlots.map(slot => tasks[slot - 1]?.id).filter(Boolean) as string[])];
  if (cycleTaskIds.length > 0) debugLog('dependency-scheduler', `Cycle detected: ${cycleTaskIds.join(', ')}`);
  return {
    dependencies,
    dependents,
    waveAssignment,
    waves,
    hasCycle: cycleTaskIds.length > 0,
    cycleTaskIds,
  };
}

// ─── Enforcement: Filter Eligible Tasks ─────────────────────────────

/**
 * Filter a list of candidate task IDs to only those whose dependencies
 * are ALL in the DONE set. Tasks with unresolved dependencies are returned
 * as blocked with the specific unresolved dep IDs.
 *
 * @param graph - Dependency graph from buildDependencyGraph
 * @param candidateTaskIds - Task IDs to check eligibility
 * @param doneTasks - Set of task IDs that have completed successfully
 * @returns Eligible and blocked task lists with reasons
 */
export function enforceWaveDependency(
  graph: DependencyGraph,
  candidateTaskIds: string[],
  doneTasks: Set<string>,
): EnforcementResult {
  const eligible: string[] = [];
  const blocked: string[] = [];
  const reasons = new Map<string, string[]>();

  for (const taskId of candidateTaskIds) {
    const deps = graph.dependencies.get(taskId);
    if (!deps || deps.size === 0) {
      eligible.push(taskId);
      continue;
    }

    const unresolved = [...deps].filter(d => !doneTasks.has(d));
    if (unresolved.length === 0) {
      eligible.push(taskId);
    } else {
      blocked.push(taskId);
      reasons.set(taskId, unresolved);
    }
  }

  return { eligible, blocked, reasons };
}

// ─── Cascade: Block Dependents on Failure ───────────────────────────

/**
 * When a task fails (NO_GO), cascade-block all its transitive dependents.
 * Uses BFS to find all tasks that transitively depend on the failed task.
 *
 * @param graph - Dependency graph
 * @param failedTaskId - The task that failed
 * @param tasks - Full task array (statuses will be mutated to PAUSED for blocked tasks)
 * @param onTransition - Optional callback invoked for each state transition (event stream hook)
 * @returns List of blocked task IDs
 */
export function cascadeBlockDependents(
  graph: DependencyGraph,
  failedTaskId: string,
  tasks: Task[],
  onTransition?: CascadeEventCallback,
): CascadeResult {
  const blockedTaskIds: string[] = [];
  const visited = new Set<string>();
  const queue = [failedTaskId];
  visited.add(failedTaskId);

  // BFS through dependents
  while (queue.length > 0) {
    const current = queue.shift()!;
    const deps = graph.dependents.get(current) ?? new Set();

    for (const depId of deps) {
      if (visited.has(depId)) continue;
      visited.add(depId);
      blockedTaskIds.push(depId);
      queue.push(depId);
    }
  }

  // Mark blocked tasks as PAUSED (blocked by failed dependency)
  const blockedSet = new Set(blockedTaskIds);
  for (const task of tasks) {
    if (blockedSet.has(task.id) && task.status === TaskStatus.PENDING) {
      const fromStatus = task.status;
      task.status = TaskStatus.PAUSED;
      debugLog('dependency-scheduler:cascade', `Task ${task.id} blocked by failed ${failedTaskId}`);
      // Emit state transition for event stream logging (caller handles writeEvent)
      if (onTransition) {
        onTransition({
          transition: 'BLOCKED',
          taskId: task.id,
          triggerTaskId: failedTaskId,
          fromStatus,
          toStatus: TaskStatus.PAUSED,
        });
      }
    }
  }

  return { blockedTaskIds, totalBlocked: blockedTaskIds.length };
}

// ─── Cascade Wire: Task 029 — Integration with decideCascadeAction ──────

/**
 * Apply failure cascade based on a CascadeDecision from decideCascadeAction (Task 024).
 *
 * Implements Alperen's Q1 risk-taking policy:
 * - CODE failure → cascade block all transitive dependents (shouldCascade: true)
 * - RUNTIME failure → no cascade, retry (shouldCascade: false)
 * - AMBIGUOUS → no cascade, retry (risk-taking: assume infra until proven code)
 *
 * State transitions: PENDING → PAUSED (BLOCKED)
 * Each transition is reported via onTransition callback for event stream logging.
 *
 * @param graph - Dependency graph with reverse edges
 * @param failedTaskId - The task that was evaluated as NO_GO
 * @param tasks - Full task array (PENDING dependents will be mutated to PAUSED)
 * @param options - Cascade options including shouldCascade, failureCategory, callback
 * @returns Result with cascadeApplied flag and blocked task list
 */
export function applyFailureCascade(
  graph: DependencyGraph,
  failedTaskId: string,
  tasks: Task[],
  options: CascadeBlockOptions,
): ApplyFailureCascadeResult {
  const { shouldCascade, failureCategory, onTransition } = options;

  // RUNTIME / AMBIGUOUS: risk-taking policy — no cascade, retry without blocking
  if (!shouldCascade) {
    debugLog(
      'dependency-scheduler:applyFailureCascade',
      `Task ${failedTaskId} (${failureCategory}): no cascade — retry path`,
    );
    return {
      blockedTaskIds: [],
      totalBlocked: 0,
      cascadeApplied: false,
      failureCategory,
    };
  }

  // CODE failure: cascade block transitive dependents
  debugLog(
    'dependency-scheduler:applyFailureCascade',
    `Task ${failedTaskId} (CODE): cascading block to transitive dependents`,
  );

  // Wrap onTransition to inject failureCategory into event
  const wrappedCallback: CascadeEventCallback | undefined = onTransition
    ? (event) => onTransition({ ...event, failureCategory })
    : undefined;

  const cascadeResult = cascadeBlockDependents(graph, failedTaskId, tasks, wrappedCallback);

  return {
    ...cascadeResult,
    cascadeApplied: true,
    failureCategory,
  };
}

// ─── Unblock: Re-enable Dependents ──────────────────────────────────

/**
 * When a previously failed task is resolved (e.g., fix worker succeeds),
 * check its direct dependents and unblock those whose ALL dependencies
 * are now satisfied (DONE).
 *
 * State transitions: PAUSED (BLOCKED) → PENDING (UNBLOCKED)
 * Each transition is reported via onTransition callback for event stream logging.
 *
 * @param graph - Dependency graph
 * @param resolvedTaskId - The task that was just resolved
 * @param tasks - Full task array (statuses will be mutated from PAUSED → PENDING)
 * @param doneTasks - Set of currently DONE task IDs (should include resolvedTaskId)
 * @param onTransition - Optional callback for each UNBLOCKED state transition
 * @returns List of unblocked task IDs
 */
export function unblockDependents(
  graph: DependencyGraph,
  resolvedTaskId: string,
  tasks: Task[],
  doneTasks: Set<string>,
  onTransition?: CascadeEventCallback,
): UnblockResult {
  const unblockedTaskIds: string[] = [];
  const directDependents = graph.dependents.get(resolvedTaskId) ?? new Set();

  const taskMap = new Map(tasks.map(t => [t.id, t]));

  for (const depId of directDependents) {
    const task = taskMap.get(depId);
    if (!task || task.status !== TaskStatus.PAUSED) continue;

    // Check if ALL dependencies of this task are now done
    const deps = graph.dependencies.get(depId) ?? new Set();
    const allDone = [...deps].every(d => doneTasks.has(d));

    if (allDone) {
      const fromStatus = task.status;
      task.status = TaskStatus.PENDING;
      unblockedTaskIds.push(depId);
      debugLog('dependency-scheduler:unblock', `Task ${depId} unblocked after ${resolvedTaskId} resolved`);
      // Emit state transition for event stream logging
      if (onTransition) {
        onTransition({
          transition: 'UNBLOCKED',
          taskId: depId,
          triggerTaskId: resolvedTaskId,
          fromStatus,
          toStatus: TaskStatus.PENDING,
        });
      }
    }
  }

  return { unblockedTaskIds, totalUnblocked: unblockedTaskIds.length };
}

// ─── Persistence: Serializable Format (Task 030) ────────────────────

/**
 * JSON-serializable representation of a DependencyGraph.
 * Maps and Sets are converted to plain objects/arrays for safe JSON round-trip.
 */
export interface SerializedDependencyGraph {
  /** task ID → list of task IDs it depends on */
  dependencies: Record<string, string[]>;
  /** task ID → list of task IDs that depend on it */
  dependents: Record<string, string[]>;
  /** task ID → assigned wave index */
  waveAssignment: Record<string, number>;
  /** Ordered execution waves */
  waves: DependencyWave[];
  /** True if a cycle was detected */
  hasCycle: boolean;
  /** Task IDs involved in the cycle */
  cycleTaskIds: string[];
  /** ISO 8601 timestamp when this graph was persisted */
  persistedAt: string;
  /** Sprint ID for context */
  sprintId: string;
}

/**
 * Serialize a DependencyGraph (Map/Set-based) to a plain JSON-safe object.
 */
export function serializeDependencyGraph(
  graph: DependencyGraph,
  sprintId: string,
): SerializedDependencyGraph {
  const dependencies: Record<string, string[]> = {};
  for (const [id, deps] of graph.dependencies) {
    dependencies[id] = [...deps].sort();
  }

  const dependents: Record<string, string[]> = {};
  for (const [id, deps] of graph.dependents) {
    dependents[id] = [...deps].sort();
  }

  const waveAssignment: Record<string, number> = {};
  for (const [id, wave] of graph.waveAssignment) {
    waveAssignment[id] = wave;
  }

  return {
    dependencies,
    dependents,
    waveAssignment,
    waves: graph.waves,
    hasCycle: graph.hasCycle,
    cycleTaskIds: graph.cycleTaskIds,
    persistedAt: new Date().toISOString(),
    sprintId,
  };
}

/**
 * Restore a DependencyGraph from its serialized form.
 * Converts plain arrays/objects back to Map<string, Set<string>>.
 */
export function deserializeDependencyGraph(
  serialized: SerializedDependencyGraph,
): DependencyGraph {
  const dependencies = new Map<string, Set<string>>();
  for (const [id, deps] of Object.entries(serialized.dependencies)) {
    dependencies.set(id, new Set(deps));
  }

  const dependents = new Map<string, Set<string>>();
  for (const [id, deps] of Object.entries(serialized.dependents)) {
    dependents.set(id, new Set(deps));
  }

  const waveAssignment = new Map<string, number>();
  for (const [id, wave] of Object.entries(serialized.waveAssignment)) {
    waveAssignment.set(id, wave);
  }

  return {
    dependencies,
    dependents,
    waveAssignment,
    waves: serialized.waves,
    hasCycle: serialized.hasCycle,
    cycleTaskIds: serialized.cycleTaskIds,
  };
}

/**
 * Generate a Mermaid `graph TD` diagram from a DependencyGraph.
 * Highlights completed/failed tasks with distinct styles.
 *
 * @param graph - The dependency graph to visualize
 * @param taskStatusMap - Optional map of task ID → TaskStatus for highlighting
 * @returns Mermaid diagram string (ready for .mmd file)
 */
export function generateMermaidDiagram(
  graph: DependencyGraph,
  taskStatusMap?: Map<string, TaskStatus>,
): string {
  const lines: string[] = ['graph TD'];

  // Collect all task IDs from wave assignment
  const allTaskIds = [...graph.waveAssignment.keys()].sort();

  // Emit nodes with wave labels
  for (const taskId of allTaskIds) {
    const wave = graph.waveAssignment.get(taskId) ?? 0;
    const safeId = taskId.replace(/-/g, '_');
    lines.push(`  ${safeId}["${taskId} (W${wave})"]`);
  }

  // Emit dependency edges
  for (const [taskId, deps] of graph.dependencies) {
    const safeTaskId = taskId.replace(/-/g, '_');
    for (const dep of deps) {
      const safeDep = dep.replace(/-/g, '_');
      lines.push(`  ${safeDep} --> ${safeTaskId}`);
    }
  }

  // Emit style highlights based on task status
  if (taskStatusMap && taskStatusMap.size > 0) {
    const doneIds: string[] = [];
    const noGoIds: string[] = [];
    const pausedIds: string[] = [];
    const executingIds: string[] = [];

    for (const [taskId, status] of taskStatusMap) {
      if (!graph.waveAssignment.has(taskId)) continue;
      const safeId = taskId.replace(/-/g, '_');
      if (status === TaskStatus.DONE) doneIds.push(safeId);
      else if (status === TaskStatus.NO_GO) noGoIds.push(safeId);
      else if (status === TaskStatus.PAUSED) pausedIds.push(safeId);
      else if (status === TaskStatus.EXECUTING) executingIds.push(safeId);
    }

    if (doneIds.length > 0) {
      lines.push(`  classDef done fill:#4caf50,stroke:#2e7d32,color:#fff`);
      lines.push(`  class ${doneIds.join(',')} done`);
    }
    if (noGoIds.length > 0) {
      lines.push(`  classDef nogo fill:#f44336,stroke:#c62828,color:#fff`);
      lines.push(`  class ${noGoIds.join(',')} nogo`);
    }
    if (pausedIds.length > 0) {
      lines.push(`  classDef paused fill:#ff9800,stroke:#e65100,color:#fff`);
      lines.push(`  class ${pausedIds.join(',')} paused`);
    }
    if (executingIds.length > 0) {
      lines.push(`  classDef executing fill:#2196f3,stroke:#1565c0,color:#fff`);
      lines.push(`  class ${executingIds.join(',')} executing`);
    }
  }

  return lines.join('\n');
}

// ─── File I/O: Persist + Load (Task 030) ────────────────────────────

function depGraphJsonPath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, DECKENT_DIR, `${sprintId}-depgraph.json`);
}

function depGraphMmdPath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, DECKENT_DIR, `${sprintId}-depgraph.mmd`);
}

/**
 * Persist a DependencyGraph to disk in two formats:
 * 1. JSON (`sprint-NNN-depgraph.json`) — machine-readable, used by resume
 * 2. Mermaid (`sprint-NNN-depgraph.mmd`) — human-readable, Claude Code auto-renders
 *
 * Fail-safe: write errors are logged but do not crash the sprint.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Sprint identifier (e.g. "sprint-139")
 * @param graph - Dependency graph to persist
 * @param taskStatusMap - Optional status map for Mermaid highlighting
 * @returns `true` if both files were written, `false` if an error occurred
 */
export function persistDependencyGraph(
  projectRoot: string,
  sprintId: string,
  graph: DependencyGraph,
  taskStatusMap?: Map<string, TaskStatus>,
): boolean {
  try {
    mkdirSync(join(projectRoot, DECKENT_DIR), { recursive: true });

    const serialized = serializeDependencyGraph(graph, sprintId);
    const jsonPath = depGraphJsonPath(projectRoot, sprintId);
    writeFileSync(jsonPath, JSON.stringify(serialized, null, 2), 'utf-8');
    debugLog('dependency-scheduler:persist', `JSON graph written to ${jsonPath}`);

    const mmd = generateMermaidDiagram(graph, taskStatusMap);
    const mmdPath = depGraphMmdPath(projectRoot, sprintId);
    writeFileSync(mmdPath, mmd, 'utf-8');
    debugLog('dependency-scheduler:persist', `Mermaid graph written to ${mmdPath}`);

    return true;
  } catch (e) {
    debugLog('dependency-scheduler:persist:error', e);
    return false;
  }
}

/**
 * Load a persisted DependencyGraph from disk.
 * Returns `null` if the file does not exist or is malformed.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Sprint identifier
 * @returns Restored DependencyGraph, or null
 */
export function loadDependencyGraph(
  projectRoot: string,
  sprintId: string,
): DependencyGraph | null {
  const jsonPath = depGraphJsonPath(projectRoot, sprintId);
  if (!existsSync(jsonPath)) {
    debugLog('dependency-scheduler:load', `No depgraph found at ${jsonPath}`);
    return null;
  }
  try {
    const raw = readFileSync(jsonPath, 'utf-8');
    const serialized = JSON.parse(raw) as SerializedDependencyGraph;
    if (!serialized.sprintId || !serialized.waves || !serialized.dependencies) {
      debugLog('dependency-scheduler:load', 'Malformed depgraph JSON');
      return null;
    }
    return deserializeDependencyGraph(serialized);
  } catch (e) {
    debugLog('dependency-scheduler:load:error', e);
    return null;
  }
}
