import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, TaskResult } from '../../core/types.js';
import { TaskEvaluation, SprintStatus, SprintPhase } from '../../core/types.js';
import { TASKS_DIR, BRAIN_DIR, DECKENT_DIR } from '../../core/constants.js';
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
 *
 * FINALIZE-ARCHIVE-BLIND fix (Sprint 268): task/result collection is
 * archive-aware — after CLEANUP archives files to
 * `.brain/archive/<sprintId>-tasks/`, a re-finalize used to undercount
 * (sprint-267 live bug: "5/5" instead of "6/6") and treat archived results
 * as missing (→ synthetic NO_GO). Both locations are merged, id-deduped,
 * with `.tasks/` taking priority. The archive dir is only resolvable when
 * the sprint ID is known (via `--sprint` or derivable from `.tasks/`).
 *
 * Exported for tests (Sprint 268).
 */
export function buildSprintFromTasks(root: string, sprintFilter?: string): {
  sprintId: string;
  tasks: Task[];
  results: TaskResult[];
  evaluations: Map<string, TaskEvaluation>;
} {
  const tasksDir = join(root, TASKS_DIR);
  const tasks: Task[] = [];
  const results: TaskResult[] = [];
  const evaluations = new Map<string, TaskEvaluation>();

  const tasksDirExists = existsSync(tasksDir);
  // Without a .tasks/ dir AND without an explicit --sprint filter there is no
  // way to locate the per-sprint archive dir either — nothing to finalize.
  if (!tasksDirExists && !sprintFilter) {
    return { sprintId: 'sprint-unknown', tasks, results, evaluations };
  }

  // Read all task JSON files from .tasks/ (priority location)
  const seenTaskIds = new Set<string>();
  if (tasksDirExists) {
    const taskFiles = readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.json'));
    for (const file of taskFiles) {
      const task = readJsonSafe<Task>(join(tasksDir, file));
      if (task) {
        // If a sprint filter is provided, only include tasks matching that sprint
        if (!sprintFilter || task.sprintId === sprintFilter) {
          tasks.push(task);
          seenTaskIds.add(task.id);
        }
      }
    }
  }

  // Determine sprint ID: use filter if provided, else derive from tasks
  const sprintId = sprintFilter ?? tasks[0]?.sprintId ?? 'sprint-unknown';

  // Merge archived task JSONs (.tasks/ wins on id collision)
  const archiveTasksDir = join(root, BRAIN_DIR, 'archive', `${sprintId}-tasks`);
  const archiveDirExists = sprintId !== 'sprint-unknown' && existsSync(archiveTasksDir);
  if (archiveDirExists) {
    const archivedTaskFiles = readdirSync(archiveTasksDir).filter(f => f.startsWith('task-') && f.endsWith('.json'));
    for (const file of archivedTaskFiles) {
      const task = readJsonSafe<Task>(join(archiveTasksDir, file));
      if (task && !seenTaskIds.has(task.id) && (!sprintFilter || task.sprintId === sprintFilter)) {
        tasks.push(task);
        seenTaskIds.add(task.id);
      }
    }
  }

  // Read all result files (.tasks/ first, then archive — deduped by taskId)
  const seenResultIds = new Set<string>();
  if (tasksDirExists) {
    const resultFiles = readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.result'));
    for (const file of resultFiles) {
      const result = readJsonSafe<TaskResult>(join(tasksDir, file));
      if (result) {
        results.push(result);
        seenResultIds.add(result.taskId);
      }
    }
  }
  if (archiveDirExists) {
    const archivedResultFiles = readdirSync(archiveTasksDir).filter(f => f.startsWith('task-') && f.endsWith('.result'));
    for (const file of archivedResultFiles) {
      const result = readJsonSafe<TaskResult>(join(archiveTasksDir, file));
      if (result && !seenResultIds.has(result.taskId)) {
        results.push(result);
        seenResultIds.add(result.taskId);
      }
    }
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
      // FINALIZE-RECOUNT fix (Sprint 268, 1a): a .result that went through
      // Brain EVALUATE carries the authoritative decision in
      // `evaluationDecision`; crash-recovered/manual results only carry the
      // worker's `selfAssessment` (sprint-267 live bug: the recorded decision
      // was ignored and every task was re-counted as a failed use). Success
      // detection therefore uses `evaluationDecision ?? selfAssessment`
      // (DONE / GO_WITH_TECH_DEBT = success). Re-grading via evaluateResult
      // stays as the last resort for results carrying neither (or a
      // non-terminal hint such as TIMEOUT_WITH_WORK).
      const recorded = result.evaluationDecision ?? result.selfAssessment;
      if (recorded === 'DONE' || recorded === 'GO_WITH_TECH_DEBT' || recorded === 'NO_GO') {
        evaluations.set(task.id, recorded as TaskEvaluation);
      } else {
        evaluations.set(task.id, evaluateResult(result, task));
      }
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

        // FINALIZE Duration fix (Sprint 268): the CLI-built sprint object had
        // no startedAt, so calculateMetrics fell back to Date.now() for the
        // start time and wrote Duration=0ms (sprint-267 live bug). Recover
        // the real start from .deckent/sprint-state.json (only when it
        // belongs to THIS sprint), falling back to the coordinator PID
        // record. When neither exists, startedAt stays undefined and the
        // job summary honestly reports the duration as 'unknown'.
        let startedAt: string | undefined;
        const sprintState = readJsonSafe<{ sprintId?: string; startedAt?: string }>(
          join(root, DECKENT_DIR, 'sprint-state.json'),
        );
        if (sprintState?.startedAt && sprintState.sprintId === sprintId) {
          startedAt = sprintState.startedAt;
        } else {
          const pidRecord = readJsonSafe<{ sprintId?: string; startedAt?: string }>(
            join(root, DECKENT_DIR, 'pids', `${sprintId}.pid`),
          );
          if (pidRecord?.startedAt) startedAt = pidRecord.startedAt;
        }

        const sprint = {
          id: sprintId,
          number: parseInt(sprintId.replace('sprint-', ''), 10) || 0,
          status: SprintStatus.COMPLETE,
          phase: SprintPhase.COMPLETE,
          tasks,
          workers: tasks.map(t => `w-${t.id}`),
          startedAt,
          completedAt: new Date().toISOString(),
        };

        const config = await loadConfig(root);

        // Bug N fix (Sprint 166-T2): wire onRuleRegen to regenerateRules so manual
        // finalize regenerates .claude/rules/*.md just like the Brain-driven path
        // in sprint-phases.ts:1238. Dynamic import to avoid pulling MemoryStore /
        // better-sqlite3 into the CLI cold path.
        const { regenerateRules } = await import('../../core/rule-generator.js');

        const metrics = await finalizeSprint(root, sprint, evaluations, results, {
          skipDecay: opts.skipDecay,
          skipHooks: opts.skipHooks,
          config,
          onRuleRegen: async (projectRoot: string): Promise<void> => {
            await regenerateRules(projectRoot);
          },
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
