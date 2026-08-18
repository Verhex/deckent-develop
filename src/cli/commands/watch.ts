import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { DASHBOARD_FILE, TASKS_DIR } from '../../core/constants.js';
import { getCurrentSprintId } from '../../core/event-stream.js';
import { isSessionActive, createWatchLayout, attachToWorkerPane, TmuxError } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getDefaultProviderName } from '../../orchestra/sprint-utils.js';
import { dockerContainerNameForTask } from '../../core/task-result-settlement.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** H) Export cleanupWatchWindow so cleanup.ts can call it. */
export function cleanupWatchWindow(): void {
  try {
    spawnSync('tmux', ['kill-window', '-t', 'deckent:watch'], { encoding: 'utf-8' });
  } catch {
    // Watch window may not exist — ignore
  }
}

/** J) Read sprint ID from a task file to detect stale workers. */
function getTaskSprintId(root: string, taskId: string): string | null {
  const taskPath = join(root, TASKS_DIR, `task-${taskId}.json`);
  if (!existsSync(taskPath)) return null;
  try {
    const data = JSON.parse(readFileSync(taskPath, 'utf-8')) as { sprintId?: string };
    return data.sprintId ?? null;
  } catch {
    return null;
  }
}

// J) The current sprint ID is resolved by the canonical core/event-stream
//    `getCurrentSprintId` (active→state). R4-SPRINTID (Sprint 318) — conscious
//    semantic change: `watch` now reflects the ACTIVE sprint (sprint-active.json
//    → sprint-state.json) instead of the stale `config.last_sprint_id`, so the
//    stale-worker warning compares against the sprint that is actually running.

/** I) Explain why a worker window was not found. */
function explainMissingWorker(root: string, taskId: string): string {
  const resultPath = join(root, TASKS_DIR, `task-${taskId}.result`);
  if (existsSync(resultPath)) {
    try {
      const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as { selfAssessment?: string };
      return `Worker finished (assessment: ${result.selfAssessment ?? 'unknown'}). Task is complete.`;
    } catch {
      return 'Worker finished. Task result file exists.';
    }
  }

  const taskPath = join(root, TASKS_DIR, `task-${taskId}.json`);
  if (!existsSync(taskPath)) {
    return `Task ${taskId} not found. Check task ID with \`deckent status\`.`;
  }

  try {
    const task = JSON.parse(readFileSync(taskPath, 'utf-8')) as { provider?: string; status?: string };
    if (task.provider && task.provider !== 'claude') {
      return `Wrong provider: task uses '${task.provider}' (not tmux). Use \`deckent status\` to monitor subprocess workers.`;
    }
    if (task.status === 'PENDING' || task.status === 'DRAFT') {
      return `Worker not yet spawned. Task status: ${task.status}. Wait for sprint to progress to EXECUTE phase.`;
    }
    return `Worker window not found. Task status: ${task.status ?? 'unknown'}. The worker may have exited.`;
  } catch {
    return `Worker window not found for task ${taskId}. The worker may have finished or crashed.`;
  }
}

/** Get the provider for a task from its task JSON file. */
export function getTaskProvider(root: string, taskId: string): string {
  const taskPath = join(root, TASKS_DIR, `task-${taskId}.json`);
  if (!existsSync(taskPath)) return 'claude';
  try {
    const data = JSON.parse(readFileSync(taskPath, 'utf-8')) as { provider?: string };
    return data.provider ?? getDefaultProviderName();
  } catch {
    return 'claude';
  }
}

/** Read the spawn backend (docker/tmux/subprocess) for a task from its
 *  heartbeat file. Returns null when no heartbeat is present or the field
 *  is missing — caller falls back to the existing tmux/subprocess flow. */
export function getTaskBackend(root: string, taskId: string): string | null {
  const hbPath = join(root, TASKS_DIR, `task-${taskId}.hb`);
  if (!existsSync(hbPath)) return null;
  try {
    const data = JSON.parse(readFileSync(hbPath, 'utf-8')) as { backend?: string };
    return data.backend ?? null;
  } catch {
    return null;
  }
}

/** Follow the exact project-scoped Docker worker container logs. */
export function watchDockerLogs(projectRoot: string, taskId: string): void {
  const containerName = dockerContainerNameForTask(projectRoot, taskId);
  print(`Following docker logs: ${containerName}`);
  print('Press Ctrl+C to stop.');
  const proc = spawn('docker', ['logs', '-f', containerName], { stdio: 'inherit' });
  proc.on('error', (err) => {
    printError(new Error(`Failed to follow docker logs: ${err.message}`));
  });
}

/** Watch subprocess worker log file for non-tmux providers (codex/gemini). */
export function watchSubprocessLog(root: string, taskId: string): void {
  const logPath = join(root, TASKS_DIR, `task-${taskId}.log`);
  if (!existsSync(logPath)) {
    print(`Log file not found: ${logPath}`);
    print('The worker may not have started yet or has already finished.');
    return;
  }
  print(`Tailing subprocess log: ${logPath}`);
  print('Press Ctrl+C to stop.');
  const tail = spawn('tail', ['-f', logPath], { stdio: 'inherit' });
  tail.on('error', (err) => {
    printError(new Error(`Failed to tail log: ${err.message}`));
  });
}

/** K) Compute dynamic split ratio based on terminal width. */
function computeSplitRatio(): number {
  const cols = process.stdout.columns ?? 80;
  // Narrow terminal: give more space to dashboard (70/30)
  // Wide terminal: more balanced (60/40)
  if (cols < 100) return 30;
  if (cols < 140) return 35;
  return 40;
}

export function registerWatch(program: Command): void {
  program
    .command('watch')
    .description(getMessage('cli.watch.desc', getLanguage(undefined)))
    .option('--follow <taskId>', 'Follow a specific worker live — docker logs -f (docker backend), tmux pane, or subprocess log')
    .action((opts: { follow?: string }) => {
      const root = resolveProjectRoot();

      if (!existsSync(join(root, DASHBOARD_FILE))) {
        printError(new Error('No active sprint. Run `deckent start` first.'));
        process.exitCode = 1;
        return;
      }

      // Docker workers don't run inside tmux — skip the session check when
      // the user is following a docker-backed task so the smoke command can
      // stream logs without requiring a tmux server.
      const followingDocker =
        opts.follow !== undefined &&
        getTaskBackend(root, opts.follow) === 'docker';

      if (!followingDocker && !isSessionActive()) {
        printError(new Error('No tmux session found. Run `deckent start` first.'));
        process.exitCode = 1;
        return;
      }

      try {
        if (opts.follow) {
          const taskId = opts.follow;

          // J) Sprint ID check: warn if task is from a different sprint
          const taskSprintId = getTaskSprintId(root, taskId);
          const currentSprintId = getCurrentSprintId(root);
          if (taskSprintId && currentSprintId && taskSprintId !== currentSprintId) {
            print(`Warning: Task ${taskId} is from sprint ${taskSprintId}, but current sprint is ${currentSprintId}.`);
            print('The worker window may be stale or already cleaned up.');
          }

          // Docker backend: stream container logs via `docker logs -f` so
          // the user sees live output instead of the snapshot that `logs
          // --tail` would produce. Falls through to provider/tmux paths
          // when the heartbeat reports a non-docker backend.
          const backend = getTaskBackend(root, taskId);
          if (backend === 'docker') {
            watchDockerLogs(root, taskId);
            return;
          }

          // B) Subprocess log viewer for non-claude providers
          const provider = getTaskProvider(root, taskId);
          if (provider !== 'claude') {
            watchSubprocessLog(root, taskId);
            return;
          }

          attachToWorkerPane(taskId);
        } else {
          // K) Dynamic split ratio
          const splitRatio = computeSplitRatio();
          // Pass split ratio via a wrapper that temporarily sets env var
          process.env['DECKENT_WATCH_SPLIT'] = String(splitRatio);
          createWatchLayout(root);
          delete process.env['DECKENT_WATCH_SPLIT'];
        }

        print('Watch mode active. Press Ctrl+B D to detach.');
      } catch (error) {
        if (error instanceof TmuxError) {
          // I) Better error message explaining why worker wasn't found
          if (opts.follow) {
            const explanation = explainMissingWorker(root, opts.follow);
            printError(new Error(`${error.message}\n  Hint: ${explanation}`));
          } else {
            printError(error);
          }
          process.exitCode = 1;
        } else {
          throw error;
        }
      }
    });
}
