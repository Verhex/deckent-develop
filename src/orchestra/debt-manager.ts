// ─── Debt Management ───────────────────────────────────────────────
// Extracted from brain.ts — debt resolution, escalation, cross-dependencies
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { TaskStatus, TaskEvaluation, DebtPriority } from '../core/types.js';
import type {
  Task, TaskResult, Sprint, PatternEntry, DecayResult,
} from '../core/types.js';
import {
  BRAIN_DIR, TASKS_DIR, DEBT_FILE, PATTERNS_FILE,
  SPRINTS_DIR, ARCHIVE_DIR, MEMORY_FILE,
  DEBT_HIGH_PRIORITY_SPRINTS, DEBT_CRITICAL_SPRINTS,
} from '../core/constants.js';
import { countBrainLines, parseDebtTable, generateDebtTable, readJsonSafe } from '../core/utils.js';
import { updateTaskStatus, releaseAllLocks } from '../agents/worker.js';

// ═══ Internal Helpers ══════════════════════════════════════════════

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * E) Smart memory trim: preserve sprint section headers but trim detail lines
 * from older sections. Keeps section headers intact to preserve learning history,
 * only removes verbose detail lines when absolutely necessary.
 */
function smartTrimMemory(content: string, targetLines = 80): string {
  const lines = content.split('\n');
  if (lines.length <= targetLines) return content;

  // Parse content into sections (by ## headers)
  type Section = { header: string; lines: string[] };
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection) sections.push(currentSection);
      currentSection = { header: line, lines: [] };
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      // Lines before any header (preamble)
      if (sections.length === 0) {
        sections.push({ header: '', lines: [line] });
      } else {
        sections[0]!.lines.push(line);
      }
    }
  }
  if (currentSection) sections.push(currentSection);

  // First pass: try to fit within target by trimming older sections' details
  // Keep the last 3 sections fully, trim earlier ones to header only
  const recentCount = 3;
  const oldSections = sections.slice(0, Math.max(0, sections.length - recentCount));
  const recentSections = sections.slice(Math.max(0, sections.length - recentCount));

  const result: string[] = [];
  // Old sections: keep header + first summary line only
  for (const sec of oldSections) {
    if (sec.header) result.push(sec.header);
    // Keep first non-empty content line as a brief summary
    const firstContent = sec.lines.find(l => l.trim().length > 0);
    if (firstContent) result.push(firstContent);
  }
  // Recent sections: keep in full
  for (const sec of recentSections) {
    if (sec.header) result.push(sec.header);
    result.push(...sec.lines);
  }

  // If still over target, trim trailing empty lines and fall back to last targetLines
  const trimmed = result.join('\n').replace(/\n{3,}/g, '\n\n');
  const trimmedLines = trimmed.split('\n');
  if (trimmedLines.length > targetLines) {
    // Last resort: keep last targetLines but try to start at a section boundary
    const lastPortion = trimmedLines.slice(trimmedLines.length - targetLines);
    // Find the first ## header in lastPortion to start cleanly
    const firstHeader = lastPortion.findIndex(l => l.startsWith('## '));
    if (firstHeader > 0) return lastPortion.slice(firstHeader).join('\n');
    return lastPortion.join('\n');
  }
  return trimmed;
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
  const brainPath = join(projectRoot, BRAIN_DIR);
  const workerId = task.assignedWorker ?? `w-${task.id}`;

  if (evaluation === TaskEvaluation.DONE) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.DONE);
    releaseAllLocks(projectRoot, workerId);
    return;
  }

  if (evaluation === TaskEvaluation.GO_WITH_TECH_DEBT) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.DONE);
    releaseAllLocks(projectRoot, workerId);

    // Add debt item
    const debtPath = join(brainPath, DEBT_FILE);
    mkdirSync(brainPath, { recursive: true });
    const existing = readFileSafe(debtPath);
    const items = existing ? parseDebtTable(existing) : [];
    items.push({
      id: `debt-${task.id}`,
      description: `Tech debt from ${task.id}: ${result.notes}`.slice(0, 80),
      originTaskId: task.id,
      originSprintId: task.sprintId ?? '',
      priority: DebtPriority.NORMAL,
      sprintsOpen: 0,
      resolved: false,
      createdAt: now(),
    });
    writeFileSync(debtPath, generateDebtTable(items), 'utf-8');
    return;
  }

  // NO_GO — keep locks, create fix task
  updateTaskStatus(projectRoot, task.id, TaskStatus.NO_GO);

  const fixTask: Task = {
    id: `${task.id}-fix`,
    title: `Fix: ${task.title}`,
    description: `Priority fix for NO_GO task ${task.id}. Notes: ${result.notes}`,
    model: task.model,
    effort: task.effort,
    priority: 'CRITICAL',
    reason: `Task ${task.id} evaluated as NO_GO`,
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
  const debtPath = join(projectRoot, BRAIN_DIR, DEBT_FILE);
  const content = readFileSafe(debtPath);
  if (!content) return;

  const items = parseDebtTable(content);
  let changed = false;

  for (const item of items) {
    if (item.resolved) continue;
    item.sprintsOpen++;
    if (item.sprintsOpen >= DEBT_CRITICAL_SPRINTS && item.priority !== DebtPriority.CRITICAL) {
      item.priority = DebtPriority.CRITICAL;
      changed = true;
    } else if (item.sprintsOpen >= DEBT_HIGH_PRIORITY_SPRINTS && item.priority === DebtPriority.NORMAL) {
      item.priority = DebtPriority.HIGH;
      changed = true;
    }
    changed = true; // sprintsOpen always increments
  }

  if (changed) {
    mkdirSync(join(projectRoot, BRAIN_DIR), { recursive: true });
    writeFileSync(debtPath, generateDebtTable(items), 'utf-8');
  }
}

/**
 * Mark a debt item as resolved in the given sprint.
 * @param projectRoot - Project root directory
 * @param debtId - The debt item ID to resolve (e.g., "debt-037-001")
 * @param resolvedInSprintId - Sprint ID where the debt was resolved
 * @returns true if the item was found and resolved, false otherwise
 */
export function resolveDebt(projectRoot: string, debtId: string, resolvedInSprintId: string): boolean {
  const debtPath = join(projectRoot, BRAIN_DIR, DEBT_FILE);
  const content = readFileSafe(debtPath);
  if (!content) return false;
  const items = parseDebtTable(content);
  const item = items.find(d => d.id === debtId);
  if (!item || item.resolved) return false;
  item.resolved = true;
  item.resolvedInSprintId = resolvedInSprintId;
  mkdirSync(join(projectRoot, BRAIN_DIR), { recursive: true });
  writeFileSync(debtPath, generateDebtTable(items), 'utf-8');
  return true;
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
  const brainPath = join(projectRoot, BRAIN_DIR);
  const debtPath = join(brainPath, DEBT_FILE);
  const content = readFileSafe(debtPath);
  if (!content) return 0;

  const items = parseDebtTable(content);
  const resolvedItems = items.filter(d => d.resolved);
  const openItems = items.filter(d => !d.resolved);

  if (resolvedItems.length === 0) return 0;

  const archiveDirPath = join(brainPath, ARCHIVE_DIR);
  mkdirSync(archiveDirPath, { recursive: true });

  const archivePath = join(archiveDirPath, 'DEBT-ARCHIVE.md');
  let allArchived = resolvedItems;
  if (existsSync(archivePath)) {
    const archiveContent = readFileSafe(archivePath);
    const existingItems = parseDebtTable(archiveContent);
    // Merge without duplicates (by id)
    const existingIds = new Set(existingItems.map(i => i.id));
    const newItems = resolvedItems.filter(i => !existingIds.has(i.id));
    allArchived = [...existingItems, ...newItems];
  }
  writeFileSync(archivePath, generateDebtTable(allArchived), 'utf-8');

  // Update DEBT.md with only open items
  writeFileSync(debtPath, generateDebtTable(openItems), 'utf-8');

  return resolvedItems.length;
}

// ═══ Decay ═════════════════════════════════════════════════════════

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
  const linesBefore = countBrainLines(projectRoot);
  const brainPath = join(projectRoot, BRAIN_DIR);

  // Track what we'll remove
  let removedDebtCount = 0;
  let removedPatternCount = 0;
  const archivedSprints: string[] = [];

  const shouldRun = opts?.force || linesBefore > budget;
  if (!shouldRun) {
    return { linesBefore, linesAfter: linesBefore, archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0 };
  }

  // 1. Remove resolved patterns
  const patternsPath = join(brainPath, PATTERNS_FILE);
  if (existsSync(patternsPath)) {
    const raw = readJsonSafe<PatternEntry[] | { active?: PatternEntry[]; resolved?: PatternEntry[] }>(patternsPath);
    if (raw) {
      // Support both formats: plain array or { active, resolved } object
      const patterns = Array.isArray(raw)
        ? raw
        : [...(raw.active ?? []), ...(raw.resolved ?? [])];
      const resolved = patterns.filter(p => p.resolved);
      removedPatternCount = resolved.length;
      const active = patterns.filter(p => !p.resolved);
      writeFileSync(patternsPath, JSON.stringify(active, null, 2), 'utf-8');
    }
  }

  // 2. Archive resolved debt to .brain/archive/DEBT-ARCHIVE.md
  removedDebtCount = archiveResolvedDebt(projectRoot);

  // 3. Archive old sprint logs (keep last 2)
  const sprintsPath = join(brainPath, SPRINTS_DIR);
  if (existsSync(sprintsPath)) {
    const archivePath = join(brainPath, ARCHIVE_DIR);
    const sprintFiles = readdirSync(sprintsPath).filter(f => f.endsWith('.md')).sort();
    const toArchive = sprintFiles.slice(0, Math.max(0, sprintFiles.length - 2));
    if (toArchive.length > 0) {
      mkdirSync(archivePath, { recursive: true });
      // G) Ensure archive is tracked by git: write a .gitkeep so git tracks the directory
      // and a local .gitignore negation to override any parent .gitignore that excludes it
      const archiveGitignorePath = join(archivePath, '.gitignore');
      if (!existsSync(archiveGitignorePath)) {
        writeFileSync(archiveGitignorePath, '# This file ensures the archive directory is tracked by git\n!*\n', 'utf-8');
      }
      for (const file of toArchive) {
        const content = readFileSync(join(sprintsPath, file), 'utf-8');
        writeFileSync(join(archivePath, file), content, 'utf-8');
        unlinkSync(join(sprintsPath, file));
        archivedSprints.push(file);
      }
    }
  }

  // 4. Memory archive — trim old sections
  const memoryPath = join(brainPath, MEMORY_FILE);
  if (existsSync(memoryPath) && countBrainLines(projectRoot) > budget) {
    const content = readFileSafe(memoryPath);
    const currentNum = getSprintNumber(sprintId);
    const lines = content.split('\n');
    const kept: string[] = [];
    let currentSectionOld = false;

    for (const line of lines) {
      // F) More tolerant regex: matches "## Sprint sprint-NNN", "## Sprint NNN", "## Sprint N-M Özet", etc.
      const sectionMatch = line.match(/^## Sprint (?:sprint-)?(\d+)/i);
      if (sectionMatch?.[1]) {
        const sectionNum = parseInt(sectionMatch[1], 10);
        currentSectionOld = (currentNum - sectionNum) >= decaySprints;
      }
      if (!currentSectionOld) kept.push(line);
    }
    writeFileSync(memoryPath, kept.join('\n'), 'utf-8');
  }

  // 5. Last resort — smart truncation: preserve sprint headers, trim detail content
  if (countBrainLines(projectRoot) > budget) {
    const memContent = readFileSafe(join(brainPath, MEMORY_FILE));
    // E) Improved truncation: keep headers + recent content, trim old section details
    const trimmedContent = smartTrimMemory(memContent);
    writeFileSync(join(brainPath, MEMORY_FILE), trimmedContent, 'utf-8');
  }

  const linesAfter = countBrainLines(projectRoot);
  return { linesBefore, linesAfter, archivedSprints, removedDebtCount, removedPatternCount };
}

/**
 * Backward-compatible alias for runDecay. Runs decay without force option.
 * @param projectRoot - Project root directory
 * @param currentSprintId - Current sprint ID for retention calculations
 */
export function decay(projectRoot: string, currentSprintId: string): void {
  runDecay(projectRoot, currentSprintId);
}
