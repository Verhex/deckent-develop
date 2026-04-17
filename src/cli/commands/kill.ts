import type { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { killWorker, TmuxError } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { getMessage } from '../helpers/messages.js';
import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
import { SpawnBackendFactory } from '../../orchestra/spawn-backend.js';
import { getProviderForModel } from '../../core/task-types.js';
import type { ModelType } from '../../core/types.js';

/** Find the task JSON file matching a taskId (handles sprint prefix patterns). */
function findTaskFile(root: string, taskId: string): string | null {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return null;
  const files = readdirSync(tasksDir);
  // Try exact match first: task-{taskId}.json
  const exact = `task-${taskId}.json`;
  if (files.includes(exact)) return join(tasksDir, exact);
  // Try pattern: task-*-{taskId}.json (sprint prefix)
  const match = files.find(f => f.endsWith(`-${taskId}.json`) && f.startsWith('task-'));
  return match ? join(tasksDir, match) : null;
}

/** Update task status to PAUSED after kill. */
function updateTaskStatus(root: string, taskId: string, lang: string): void {
  const taskFile = findTaskFile(root, taskId);
  if (!taskFile) {
    print(getMessage('kill.task_not_found', lang, { taskId }));
    return;
  }
  try {
    const data = JSON.parse(readFileSync(taskFile, 'utf-8'));
    data.status = 'PAUSED';
    writeFileSync(taskFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    print(getMessage('kill.task_status_updated', lang, { taskId }));
  } catch {
    print(getMessage('kill.task_not_found', lang, { taskId }));
  }
}

/** Release locks owned by the killed worker. */
function releaseLocks(root: string, taskId: string, lang: string): void {
  const locksDir = join(root, LOCKS_DIR);
  if (!existsSync(locksDir)) return;
  const files = readdirSync(locksDir);
  let released = 0;
  for (const file of files) {
    try {
      const lockPath = join(locksDir, file);
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
      if (lock.ownerWorkerId === `w-${taskId}` || lock.taskId === taskId) {
        unlinkSync(lockPath);
        released++;
      }
    } catch {
      // Skip unreadable lock files
    }
  }
  if (released > 0) {
    print(getMessage('kill.locks_released', lang, { count: String(released), taskId }));
  }
}

/** Clean up prompt files for the killed task. */
function cleanPromptFiles(root: string, taskId: string, lang: string): void {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return;
  const files = readdirSync(tasksDir);
  let cleaned = 0;
  for (const file of files) {
    if (file.startsWith('.prompt-') && file.includes(taskId)) {
      try {
        unlinkSync(join(tasksDir, file));
        cleaned++;
      } catch {
        // Skip
      }
    }
  }
  if (cleaned > 0) {
    print(getMessage('kill.prompts_cleaned', lang, { count: String(cleaned), taskId }));
  }
}

/**
 * Detect the provider for a task by reading its JSON file and checking the model.
 * Returns 'claude' as default if task file cannot be read.
 */
function detectTaskProvider(root: string, taskId: string): string {
  const taskFile = findTaskFile(root, taskId);
  if (!taskFile) return 'claude';
  try {
    const data = JSON.parse(readFileSync(taskFile, 'utf-8'));
    if (data.provider) return data.provider;
    if (data.model) {
      try {
        return getProviderForModel(data.model as ModelType);
      } catch { /* unknown model */ }
    }
  } catch { /* unreadable */ }
  return 'claude';
}

/** Kill a single worker and clean up its resources. */
function killSingle(root: string, taskId: string, lang: string): boolean {
  const provider = detectTaskProvider(root, taskId);

  // For non-claude providers, try subprocess kill first
  if (provider !== 'claude') {
    try {
      const backend = SpawnBackendFactory.create({
        backend: 'subprocess',
        projectDir: root,
      });
      backend.kill(taskId);
      print(getMessage('kill.worker_killed', lang, { taskId }));
      updateTaskStatus(root, taskId, lang);
      releaseLocks(root, taskId, lang);
      cleanPromptFiles(root, taskId, lang);
      return true;
    } catch {
      // Subprocess kill failed, fall through to tmux attempt
    }
  }

  // Try tmux kill (default for claude or fallback)
  try {
    killWorker(taskId);
    print(getMessage('kill.worker_killed', lang, { taskId }));
    updateTaskStatus(root, taskId, lang);
    releaseLocks(root, taskId, lang);
    cleanPromptFiles(root, taskId, lang);
    return true;
  } catch (error) {
    if (error instanceof TmuxError) {
      // Last resort: try subprocess kill if we haven't already
      if (provider === 'claude') {
        try {
          const backend = SpawnBackendFactory.create({
            backend: 'subprocess',
            projectDir: root,
          });
          backend.kill(taskId);
          print(getMessage('kill.worker_killed', lang, { taskId }));
          updateTaskStatus(root, taskId, lang);
          releaseLocks(root, taskId, lang);
          cleanPromptFiles(root, taskId, lang);
          return true;
        } catch { /* subprocess also failed */ }
      }
      printError(new Error(getMessage('kill.worker_not_found', lang, { taskId })));
      process.exitCode = 1;
      return false;
    }
    throw error;
  }
}

/** Find all active task IDs (EXECUTING or CLAIMED). */
function findActiveTaskIds(root: string): string[] {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return [];
  const files = readdirSync(tasksDir);
  const ids: string[] = [];
  for (const file of files) {
    if (!file.startsWith('task-') || !file.endsWith('.json')) continue;
    try {
      const data = JSON.parse(readFileSync(join(tasksDir, file), 'utf-8'));
      if (data.status === 'EXECUTING' || data.status === 'CLAIMED') {
        ids.push(data.id);
      }
    } catch {
      // Skip unreadable
    }
  }
  return ids;
}

export function registerKill(program: Command): void {
  program
    .command('kill [taskId]')
    .description('Kill a running worker')
    .option('--all', 'Kill all active workers')
    .option('--force', 'Force kill (bypass panic guard)')
    .option('--user-explicit', 'Explicit user confirmation for panic kill override')
    .action(async (taskId: string | undefined, opts: { all?: boolean; force?: boolean; userExplicit?: boolean }) => {
      const root = resolveProjectRoot();
      const config = await loadConfig(root).catch(() => ({ language: 'en' }));
      const lang = config.language ?? 'en';

      if (opts.all) {
        const activeIds = findActiveTaskIds(root);
        if (activeIds.length === 0) {
          print(getMessage('kill.no_active_workers', lang));
          return;
        }
        let killed = 0;
        for (const id of activeIds) {
          try {
            killWorker(id);
            print(getMessage('kill.worker_killed', lang, { taskId: id }));
            killed++;
          } catch {
            // Worker may have already exited
          }
          updateTaskStatus(root, id, lang);
          releaseLocks(root, id, lang);
          cleanPromptFiles(root, id, lang);
        }
        print(getMessage('kill.all_killed', lang, { count: String(killed) }));
        return;
      }

      if (!taskId) {
        printError(new Error('taskId is required (or use --all)'));
        process.exitCode = 1;
        return;
      }

      killSingle(root, taskId, lang);
    });
}
