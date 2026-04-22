// ─── Debt Management ───────────────────────────────────────────────
// Extracted from brain.ts — debt resolution, escalation, cross-dependencies
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TaskStatus, TaskEvaluation } from '../core/types.js';
import type {
  Task, TaskResult, Sprint, DecayResult,
} from '../core/types.js';
import {
  BRAIN_DIR, TASKS_DIR,
  MEMORY_DB_FILE,
  DEBT_HIGH_PRIORITY_SPRINTS, DEBT_CRITICAL_SPRINTS,
} from '../core/constants.js';
import { updateTaskStatus, releaseAllLocks } from '../agents/worker.js';
import { MemoryStore } from '../core/memory-store.js';
import type { MemoryEntryV2, CreateEntryInput } from '../core/memory-types.js';

// ═══ Internal Helpers ══════════════════════════════════════════════

/**
 * Open the Memory V2 SQLite DB if it exists. Returns null when the DB
 * file is absent (pure V1 project) or cannot be opened.
 */
function getMemoryStore(projectRoot: string): MemoryStore | null {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  try {
    if (!existsSync(dbPath)) return null;
    return new MemoryStore(dbPath);
  } catch { return null; }
}

/**
 * Convert a MemoryEntryV2 row back into a CreateEntryInput that can be
 * passed to `store.upsert()`. Tags are NOT round-tripped here because
 * upsert re-derives them; callers should supply tags separately if needed.
 */
function debtEntryToInput(entry: MemoryEntryV2): CreateEntryInput {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    content: entry.content,
    source: entry.source,
    summary: entry.summary ?? undefined,
    status: entry.status,
    priority: entry.priority,
    sprint_id: entry.sprint_id ?? undefined,
    sprint_num: entry.sprint_num,
    tags: entry.tag_text ? entry.tag_text.split(' ').filter(Boolean) : [],
    metadata: JSON.parse(entry.metadata || '{}') as Record<string, unknown>,
  };
}

function now(): string {
  return new Date().toISOString();
}

function getSprintNumber(sprintId: string): number {
  const match = sprintId.match(/sprint-(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : 0;
}

// ═══ Exported Functions ════════════════════════════════════════════

/**
 * Handle a task evaluation result by updating task status, releasing locks,
 * and creating debt items or fix tasks as needed.
 * - DONE: marks task done, releases locks
 * - GO_WITH_TECH_DEBT: marks done, releases locks, adds debt entry
 * - NO_GO: marks no-go, creates a priority fix task
 * @param projectRoot - Project root directory
 * @param task - The evaluated task
 * @param evaluation - The evaluation outcome
 * @param result - The worker's task result
 */
export function handleEvaluation(
  projectRoot: string,
  task: Task,
  evaluation: TaskEvaluation,
  result: TaskResult,
): void {
  const workerId = task.assignedWorker ?? `w-${task.id}`;

  if (evaluation === TaskEvaluation.DONE) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.DONE);
    releaseAllLocks(projectRoot, workerId);
    return;
  }

  if (evaluation === TaskEvaluation.GO_WITH_TECH_DEBT) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.DONE);
    releaseAllLocks(projectRoot, workerId);

    const debtId = `debt-${task.id}`;

    // ── Memory V2: DB-first ──────────────────────────────────────
    const store = getMemoryStore(projectRoot);
    if (store) {
      try {
        if (!store.getById(debtId)) {
          store.insert({
            id: debtId,
            type: 'debt',
            title: `Tech debt from ${task.id}: ${result.notes}`.slice(0, 80),
            content: `Task ${task.id} evaluated as GO_WITH_TECH_DEBT. Notes: ${result.notes}`,
            source: 'brain',
            status: 'active',
            priority: 'normal',
            sprint_id: task.sprintId,
            sprint_num: parseInt((task.sprintId ?? '').replace(/\D/g, ''), 10) || 0,
            tags: ['debt', task.id],
            metadata: { originTaskId: task.id, originSprintId: task.sprintId ?? '', sprintsOpen: 0 },
          });
        }
      } finally { store.close(); }
      return;
    }
    // No DB available — debt entry skipped (Memory V2 DB required)
    return;
  }

  // NO_GO — keep locks, create fix task
  updateTaskStatus(projectRoot, task.id, TaskStatus.NO_GO);

  // D-3: Build enriched fix context with specific failure details
  const fixReasonParts: string[] = [`Task ${task.id} evaluated as NO_GO`];
  if (result.rubricScores) {
    const rs = result.rubricScores;
    if (typeof rs.correctness === 'number') fixReasonParts.push(`correctness=${rs.correctness}`);
    if (typeof rs.test_coverage === 'number') fixReasonParts.push(`test_coverage=${rs.test_coverage}`);
    if (typeof rs.scope_compliance === 'number') fixReasonParts.push(`scope_compliance=${rs.scope_compliance}`);
  }
  if (!result.testsPassed) fixReasonParts.push('tests failed');
  if ((result.filesChanged?.length ?? 0) === 0) fixReasonParts.push('no files changed');
  const enrichedReason = fixReasonParts.join('; ');

  const fixDescription = [
    `Priority fix for NO_GO task ${task.id}.`,
    result.notes ? `Original worker notes: ${result.notes.slice(0, 500)}` : '',
    result.rubricScores ? `Rubric: correctness=${result.rubricScores.correctness ?? '?'}, test_coverage=${result.rubricScores.test_coverage ?? '?'}, scope_compliance=${result.rubricScores.scope_compliance ?? '?'}` : '',
    `Expected scope: ${(task.scope?.directories ?? []).join(', ')}`,
    `Files that should change: ${(task.scope?.filesWrite ?? []).join(', ')}`,
  ].filter(Boolean).join('\n');

  const fixTask: Task = {
    id: `${task.id}-fix`,
    title: `Fix: ${task.title}`,
    description: fixDescription,
    model: task.model,
    effort: task.effort,
    priority: 'CRITICAL',
    reason: enrichedReason,
    scope: task.scope,
    dependencies: [],
    goNogo: task.goNogo,
    status: TaskStatus.PENDING,
    sprintId: task.sprintId,
    isPriorityFix: true,
    fixForTaskId: task.id,
    createdAt: now(),
  };
  mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });
  writeFileSync(
    join(projectRoot, TASKS_DIR, `task-${fixTask.id}.json`),
    JSON.stringify(fixTask, null, 2),
    'utf-8',
  );
}

/**
 * Detect and create fix tasks for cross-dependency failures.
 * When a NO_GO task depends on a completed task, a cross-fix task is created
 * for the dependency to investigate whether it caused the failure.
 * @param projectRoot - Project root directory
 * @param sprint - The current sprint with all tasks
 * @param evaluations - Map of task ID to evaluation result
 * @returns Array of newly created cross-fix tasks
 */
export function handleCrossDependencies(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
): Task[] {
  const fixTasks: Task[] = [];
  const noGoTasks = sprint.tasks.filter(t => evaluations.get(t.id) === TaskEvaluation.NO_GO);

  for (const noGoTask of noGoTasks) {
    for (const depId of noGoTask.dependencies) {
      const depEval = evaluations.get(depId);
      if (depEval === TaskEvaluation.DONE || depEval === TaskEvaluation.GO_WITH_TECH_DEBT) {
        const depTask = sprint.tasks.find(t => t.id === depId);
        if (!depTask) continue;

        const fixTask: Task = {
          id: `${depId}-xfix`,
          title: `Cross-fix: ${depTask.title}`,
          description: `Cross-dependency fix: ${noGoTask.id} (NO_GO) depends on ${depId}`,
          model: depTask.model,
          effort: depTask.effort,
          priority: 'CRITICAL',
          reason: `Cross-dependency: ${noGoTask.id} failed, may be caused by ${depId}`,
          scope: depTask.scope,
          dependencies: [],
          goNogo: depTask.goNogo,
          status: TaskStatus.PENDING,
          sprintId: depTask.sprintId,
          isPriorityFix: true,
          fixForTaskId: depId,
          createdAt: now(),
        };
        fixTasks.push(fixTask);

        mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });
        writeFileSync(
          join(projectRoot, TASKS_DIR, `task-${fixTask.id}.json`),
          JSON.stringify(fixTask, null, 2),
          'utf-8',
        );
      }
    }
  }
  return fixTasks;
}

/**
 * Escalate open debt items by incrementing sprintsOpen and promoting priority.
 * Items open >= 3 sprints become HIGH, items open >= 5 sprints become CRITICAL.
 * @param projectRoot - Project root directory
 */
export function escalateDebt(projectRoot: string): void {
  // ── Memory V2: DB-first ────────────────────────────────────────
  const store = getMemoryStore(projectRoot);
  if (store) {
    try {
      const debts = store.getByType('debt').filter(d => d.status !== 'resolved');
      for (const debt of debts) {
        const meta = JSON.parse(debt.metadata || '{}') as Record<string, unknown>;
        const sprintsOpen = (typeof meta.sprintsOpen === 'number' ? meta.sprintsOpen : 0) + 1;
        let newPriority = debt.priority;
        if (sprintsOpen >= DEBT_CRITICAL_SPRINTS && debt.priority !== 'critical') newPriority = 'critical';
        else if (sprintsOpen >= DEBT_HIGH_PRIORITY_SPRINTS && debt.priority === 'normal') newPriority = 'high';
        store.upsert({
          ...debtEntryToInput(debt),
          priority: newPriority,
          metadata: { ...meta, sprintsOpen },
        }, 'brain');
      }
    } finally { store.close(); }
    return;
  }
  // No DB available — escalation skipped
}

/**
 * Mark a debt item as resolved in the given sprint.
 * @param projectRoot - Project root directory
 * @param debtId - The debt item ID to resolve (e.g., "debt-037-001")
 * @param resolvedInSprintId - Sprint ID where the debt was resolved
 * @returns true if the item was found and resolved, false otherwise
 */
export function resolveDebt(projectRoot: string, debtId: string, resolvedInSprintId: string): boolean {
  // ── Memory V2: DB-first ────────────────────────────────────────
  const store = getMemoryStore(projectRoot);
  if (store) {
    try {
      const entry = store.getById(debtId);
      if (!entry || entry.status === 'resolved') return false;
      const meta = JSON.parse(entry.metadata || '{}') as Record<string, unknown>;
      store.upsert({
        ...debtEntryToInput(entry),
        status: 'resolved',
        metadata: { ...meta, resolvedInSprintId },
      }, 'brain');
      return true;
    } finally { store.close(); }
  }

  // No DB available — resolve skipped
  return false;
}

// ═══ Archive ═══════════════════════════════════════════════════════

/**
 * Archive all resolved debt items to .brain/archive/DEBT-ARCHIVE.md.
 * Moves resolved records out of DEBT.md into a separate archive file,
 * keeping only open (unresolved) items in the active debt table.
 * @param projectRoot - Project root directory
 * @returns Number of items archived
 */
export function archiveResolvedDebt(projectRoot: string): number {
  // ── Memory V2: DB-first ────────────────────────────────────────
  // In V2 resolved debts are already soft-deleted via status='resolved'.
  // "Archiving" in the DB sense means nothing needs to move — the entry
  // stays in place and is excluded from active queries.  We just count
  // how many are resolved for the caller's reporting.
  const store = getMemoryStore(projectRoot);
  if (store) {
    try {
      const resolved = store.getByType('debt').filter(d => d.status === 'resolved');
      return resolved.length;
    } finally { store.close(); }
  }

  // No DB available — archive returns 0
  return 0;
}

// ═══ Decay ═════════════════════════════════════════════════════════

/**
 * Files in .brain/ that are permanent and must never be decayed.
 * These are excluded from the "decayable" line count used for budget decisions.
 */
export const DECAY_EXEMPT = new Set(['DECISIONS.md', 'PROJECT-IDENTITY.md']);

/**
 * Result of a brain budget audit — shows decayable vs permanent line accounting.
 */
export interface BrainBudgetAudit {
  /** Lines in decayable files (MEMORY.md, DEBT.md, PATTERNS.md, sprint logs, etc.) */
  decayableLines: number;
  /** Lines in permanent exempt files (DECISIONS.md, PROJECT-IDENTITY.md) */
  permanentLines: number;
  /** Total lines across all .brain/ files */
  totalLines: number;
  /** Budget status: OK if decayable <= budget, OVER otherwise */
  status: 'OK' | 'OVER';
}

/**
 * Audit .brain/ directory against memory budget.
 * Separates permanent (DECAY_EXEMPT) files from decayable files for accurate accounting.
 * @param projectRoot - Project root directory
 * @param budget - Memory budget in lines (default 900)
 * @returns Audit result with decayable/permanent/total counts and status
 */
export function auditBrainBudget(projectRoot: string, budget = 900): BrainBudgetAudit {
  // ── Memory V2: DB-first ────────────────────────────────────────
  const store = getMemoryStore(projectRoot);
  if (store) {
    try {
      const total = store.totalCount();
      // Identity entries map to DECAY_EXEMPT files in V1
      const exempt = store.getByType('identity').length
        + store.getByType('adr').length;
      const decayable = total - exempt;
      return {
        status: decayable > budget ? 'OVER' : 'OK',
        totalLines: total,
        permanentLines: exempt,
        decayableLines: decayable,
      };
    } finally { store.close(); }
  }

  // No DB available — report OK (empty project)
  return { decayableLines: 0, permanentLines: 0, totalLines: 0, status: 'OK' };
}

export interface RunDecayOptions {
  memoryBudget?: number;
  decaySprints?: number;
  force?: boolean;
}

/**
 * Run the brain memory decay process to keep .brain/ within budget.
 * Removes resolved patterns, resolved debt (with retention window),
 * archives old sprint logs, and trims MEMORY.md if needed.
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint ID for retention calculations
 * @param opts - Optional settings; force=true runs decay even under budget
 * @returns Summary of what was removed and the before/after line counts
 */
export function runDecay(projectRoot: string, sprintId: string, opts?: RunDecayOptions): DecayResult {
  const budget = opts?.memoryBudget ?? 900;
  const decaySprints = opts?.decaySprints ?? 8;

  // ── Memory V2: DB-first ────────────────────────────────────────
  const store = getMemoryStore(projectRoot);
  if (store) {
    try {
      const currentNum = getSprintNumber(sprintId);
      const totalBefore = store.totalCount();
      const shouldRun = opts?.force || totalBefore > budget;
      if (!shouldRun) {
        return { linesBefore: totalBefore, linesAfter: totalBefore, archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0 };
      }
      store.decay(currentNum, decaySprints);
      const totalAfter = store.totalCount();
      return {
        linesBefore: totalBefore,
        linesAfter: totalAfter,
        archivedSprints: [],
        removedDebtCount: 0,
        removedPatternCount: 0,
      };
    } finally { store.close(); }
  }

  // No DB available — decay is a no-op
  return { linesBefore: 0, linesAfter: 0, archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0 };
}

/**
 * Backward-compatible alias for runDecay. Runs decay without force option.
 * @param projectRoot - Project root directory
 * @param currentSprintId - Current sprint ID for retention calculations
 */
export function decay(projectRoot: string, currentSprintId: string): void {
  runDecay(projectRoot, currentSprintId);
}
