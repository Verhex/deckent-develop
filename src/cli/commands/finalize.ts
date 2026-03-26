import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, TaskResult } from '../../core/types.js';
import { TaskEvaluation, SprintStatus, SprintPhase } from '../../core/types.js';
import { TASKS_DIR, BRAIN_DIR } from '../../core/constants.js';
import { finalizeSprint } from '../../orchestra/brain.js';
import { evaluateResult } from '../../orchestra/sprint-controller.js';
import { loadConfig } from '../../core/config.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { readJsonSafe } from '../../core/utils.js';
import { loadReviewState } from './review.js';

/**
 * Build a Sprint object and evaluations from .tasks/ directory contents.
 * Reads task JSON files and .result files, evaluates each result.
 * Integrates review state: rejected tasks are evaluated as NO_GO.
 * If sprintFilter is provided, only tasks with that sprintId are included.
 */
function buildSprintFromTasks(root: string, sprintFilter?: string): {
  sprintId: string;
  tasks: Task[];
  results: TaskResult[];
  evaluations: Map<string, TaskEvaluation>;
} {
  const tasksDir = join(root, TASKS_DIR);
  const tasks: Task[] = [];
  const results: TaskResult[] = [];
  const evaluations = new Map<string, TaskEvaluation>();

  if (!existsSync(tasksDir)) {
    return { sprintId: 'sprint-unknown', tasks, results, evaluations };
  }

  // Read all task JSON files
  const taskFiles = readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.json'));
  for (const file of taskFiles) {
    const task = readJsonSafe<Task>(join(tasksDir, file));
    if (task) {
      // If a sprint filter is provided, only include tasks matching that sprint
      if (!sprintFilter || task.sprintId === sprintFilter) {
        tasks.push(task);
      }
    }
  }

  // Determine sprint ID: use filter if provided, else derive from tasks
  const sprintId = sprintFilter ?? tasks[0]?.sprintId ?? 'sprint-unknown';

  // Read all result files
  const resultFiles = readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.result'));
  for (const file of resultFiles) {
    const result = readJsonSafe<TaskResult>(join(tasksDir, file));
    if (result) results.push(result);
  }

  // Load review state to integrate rejected tasks
  const reviewState = loadReviewState(root, sprintId);
  const rejectedTaskIds = new Set<string>();
  if (reviewState) {
    for (const review of reviewState.reviews) {
      if (review.decision === 'rejected') {
        rejectedTaskIds.add(review.taskId);
      }
    }
  }

  // Evaluate each task
  for (const task of tasks) {
    // Review-rejected tasks → NO_GO regardless of result
    if (rejectedTaskIds.has(task.id)) {
      evaluations.set(task.id, TaskEvaluation.NO_GO);
      continue;
    }
    const result = results.find(r => r.taskId === task.id);
    if (result) {
      const evaluation = evaluateResult(result, task);
      evaluations.set(task.id, evaluation);
    } else {
      // No result file = NO_GO (timeout or incomplete)
      evaluations.set(task.id, TaskEvaluation.NO_GO);
    }
  }

  return { sprintId, tasks, results, evaluations };
}

/** Check if a sprint has already been finalized by checking sprint log */
function isSprintAlreadyFinalized(root: string, sprintId: string): boolean {
  const sprintLogPath = join(root, BRAIN_DIR, 'sprints', `${sprintId}.md`);
  return existsSync(sprintLogPath);
}

/** Detect tasks that are still in-progress */
export function detectIncompleteTasks(tasks: Task[]): Task[] {
  const activeStatuses = new Set(['EXECUTING', 'CLAIMED', 'TESTING', 'DOCUMENTING']);
  return tasks.filter(t => activeStatuses.has(t.status));
}

/** Detect mixed sprint IDs */
export function detectMixedSprints(tasks: Task[]): string[] {
  const ids = new Set<string>();
  for (const t of tasks) {
    if (t.sprintId) ids.add(t.sprintId);
  }
  return [...ids];
}

export function registerFinalize(program: Command): void {
  program
    .command('finalize')
    .description('Finalize a sprint: update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md, config, run decay')
    .option('--sprint <id>', 'Specific sprint ID to finalize (e.g. sprint-063). Defaults to auto-detect from tasks.')
    .option('--skip-decay', 'Skip memory/debt decay phase')
    .option('--skip-hooks', 'Skip plugin afterSprint hooks')
    .option('--force', 'Force finalize even if tasks are still in-progress or already finalized')
    .action(async (opts: { sprint?: string; skipDecay?: boolean; skipHooks?: boolean; force?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);

      try {
        const { sprintId, tasks, results, evaluations } = buildSprintFromTasks(root, opts.sprint);

        if (tasks.length === 0) {
          print(getMessage('finalize.no_tasks', lang));
          return;
        }

        // (G) Mixed sprint detection
        const sprintIds = detectMixedSprints(tasks);
        if (sprintIds.length > 1) {
          print(`Warning: Mixed sprint IDs detected: ${sprintIds.join(', ')}. Proceeding with ${sprintId}.`);
        }

        // (F) Completion guard — reject if tasks still in-progress
        const incomplete = detectIncompleteTasks(tasks);
        if (incomplete.length > 0 && !opts.force) {
          const ids = incomplete.map(t => t.id).join(', ');
          print(`Cannot finalize: ${incomplete.length} task(s) still in-progress (${ids}). Use --force to override.`);
          return;
        } else if (incomplete.length > 0) {
          print(`Warning: Forcing finalize with ${incomplete.length} in-progress task(s).`);
        }

        // (H) Duplicate finalize protection
        if (isSprintAlreadyFinalized(root, sprintId) && !opts.force) {
          print(`Sprint ${sprintId} has already been finalized. Use --force to re-finalize.`);
          return;
        }

        const sprint = {
          id: sprintId,
          number: parseInt(sprintId.replace('sprint-', ''), 10) || 0,
          status: SprintStatus.COMPLETE,
          phase: SprintPhase.COMPLETE,
          tasks,
          workers: tasks.map(t => `w-${t.id}`),
          completedAt: new Date().toISOString(),
        };

        const config = await loadConfig(root);

        const metrics = await finalizeSprint(root, sprint, evaluations, results, {
          skipDecay: opts.skipDecay,
          skipHooks: opts.skipHooks,
          config,
        });

        print(getMessage('finalize.complete', lang, {
          sprintId,
          total: String(metrics.totalTasks),
          done: String(metrics.completedTasks),
          debt: String(metrics.techDebtTasks),
          noGo: String(metrics.noGoTasks),
        }));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
