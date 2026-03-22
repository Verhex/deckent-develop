import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, TaskResult } from '../../core/types.js';
import { TaskEvaluation, SprintStatus, SprintPhase } from '../../core/types.js';
import { TASKS_DIR, PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { finalizeSprint } from '../../orchestra/brain.js';
import { evaluateResult } from '../../orchestra/sprint-controller.js';
import { loadConfig } from '../../core/config.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';

function readLanguage(root: string): string {
  try {
    const configPath = join(root, PROJECT_CONFIG_PATH);
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { language?: string };
      return config.language ?? 'en';
    }
  } catch {
    // fallback
  }
  return 'en';
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * Build a Sprint object and evaluations from .tasks/ directory contents.
 * Reads task JSON files and .result files, evaluates each result.
 */
function buildSprintFromTasks(root: string): {
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
    if (task) tasks.push(task);
  }

  // Determine sprint ID from tasks
  const sprintId = tasks[0]?.sprintId ?? 'sprint-unknown';

  // Read all result files
  const resultFiles = readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.result'));
  for (const file of resultFiles) {
    const result = readJsonSafe<TaskResult>(join(tasksDir, file));
    if (result) results.push(result);
  }

  // Evaluate each task
  for (const task of tasks) {
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

export function registerFinalize(program: Command): void {
  program
    .command('finalize')
    .description('Finalize a sprint: update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md, config, run decay')
    .option('--skip-decay', 'Skip memory/debt decay phase')
    .option('--skip-hooks', 'Skip plugin afterSprint hooks')
    .action(async (opts: { skipDecay?: boolean; skipHooks?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = readLanguage(root);

      try {
        const { sprintId, tasks, results, evaluations } = buildSprintFromTasks(root);

        if (tasks.length === 0) {
          print(getMessage('finalize.no_tasks', lang));
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
