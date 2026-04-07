import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ModelType } from '../core/types.js';
import type { ProviderAdapter } from '../core/provider.js';
import { debugLog } from '../core/utils.js';
import {
  TMUX_SESSION_NAME,
  TMUX_AUDITOR_WINDOW,
  TMUX_WORKER_PREFIX,
  TASKS_DIR,
} from '../core/constants.js';

// ─── SpawnOptions ───────────────────────────────────────────────────
export interface SpawnOptions {
  allowedTools?: string;
  autoApprove?: boolean;
}

// ─── TmuxError ──────────────────────────────────────────────────────
export class TmuxError extends Error {
  constructor(
    message: string,
    public readonly command?: string,
  ) {
    super(message);
    this.name = 'TmuxError';
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────

function run(args: string[]): string {
  const result = spawnSync('tmux', args, { encoding: 'utf-8' });
  if (result.status !== 0) {
    const cmd = `tmux ${args.join(' ')}`;
    throw new TmuxError(
      result.stderr?.trim() || `tmux command failed with status ${result.status}`,
      cmd,
    );
  }
  return (result.stdout ?? '').trim();
}

function workerWindowName(taskId: string): string {
  return `${TMUX_WORKER_PREFIX}${taskId}`;
}

/**
 * Write prompt to a temp file and pass via stdin redirection.
 * This eliminates shell injection risk — no prompt content is ever
 * interpreted by the shell.
 */
function writePromptFile(projectRoot: string, prompt: string): string {
  const tmpDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  const id = randomBytes(8).toString('hex');
  const promptPath = join(tmpDir, `.prompt-${id}.txt`);
  writeFileSync(promptPath, prompt, 'utf-8');
  return promptPath;
}

/** Exported for testing */
export function cleanupPromptFile(promptPath: string): void {
  try { unlinkSync(promptPath); } catch (e) { debugLog('cleanupPromptFile:unlinkSync', e); }
}

/** Default worker timeout in seconds (20 minutes) */
export const WORKER_TIMEOUT_SECONDS = 1200;

/**
 * Build the shell command to invoke a worker.
 * If a ProviderAdapter is supplied, delegates to adapter.buildCommand().
 * Otherwise falls back to the default Claude CLI syntax wrapped with a
 * `timeout` guard. When the timeout fires, a `.timeout` marker file is
 * written so result-collector can detect the failure immediately.
 */
export function buildWorkerCommand(
  model: ModelType,
  promptFilePath: string,
  opts?: SpawnOptions,
  adapter?: ProviderAdapter,
  taskId?: string,
  timeoutSeconds?: number,
): string {
  // Delegate to provider adapter when available
  if (adapter) {
    return adapter.buildCommand(model, promptFilePath, {
      allowedTools: opts?.allowedTools,
      autoApprove: opts?.autoApprove,
    });
  }

  // Default: Claude CLI syntax (backward compat)
  // Use stdin redirection from file — no shell metacharacter risk
  let cmd = `claude -p - --model ${model}`;
  if (opts?.allowedTools) {
    // allowedTools is a controlled string (never user input)
    cmd += ` --allowedTools '${opts.allowedTools}'`;
  }
  if (opts?.autoApprove) {
    cmd += ' --dangerously-skip-permissions';
  }
  cmd += ` < ${promptFilePath}`;

  // Wrap with timeout + EXIT trap — guarantees .result file is ALWAYS written.
  // Without this, workers can exit without writing .result (crash, permission error, etc.)
  // causing the entire sprint to stall waiting for a result that will never come.
  const tSec = timeoutSeconds ?? WORKER_TIMEOUT_SECONDS;
  if (tSec > 0 && taskId) {
    const tasksDir = join(promptFilePath, '..'); // .tasks/ dir (prompt is inside .tasks/)
    const resultFile = join(tasksDir, `task-${taskId}.result`);
    const timeoutMarker = join(tasksDir, `task-${taskId}.timeout`);
    const fallbackJson = JSON.stringify({
      taskId, workerId: `w-${taskId}`, filesChanged: [], linesAdded: 0,
      linesRemoved: 0, testsPassed: false, coverage: 0,
      selfAssessment: 'NO_GO', notes: 'Worker exited without writing result file',
    });
    // RFILE env var avoids nested quoting issues; trap fires on ANY exit (normal, crash, timeout)
    // Use single-quoted JSON to prevent bash brace expansion on { }
    const trap = `RFILE=${resultFile}; trap '[ -f $RFILE ] || echo '"'"'${fallbackJson}'"'"' > $RFILE' EXIT`;
    cmd = `${trap}; timeout ${tSec} sh -c '${cmd.replace(/'/g, "'\\''")}' || echo "WORKER_TIMEOUT" > ${timeoutMarker}`;
  }
  return cmd;
}

/** @deprecated Use buildWorkerCommand instead. Kept for backward compatibility. */
export const buildClaudeCommand = buildWorkerCommand;

// ─── Public API ─────────────────────────────────────────────────────

export function isSessionActive(): boolean {
  const result = spawnSync('tmux', ['has-session', '-t', TMUX_SESSION_NAME], {
    encoding: 'utf-8',
  });
  return result.status === 0;
}

export function ensureSession(): void {
  if (isSessionActive()) return;
  run(['new-session', '-d', '-s', TMUX_SESSION_NAME]);
}

export function spawnWorker(
  taskId: string,
  model: ModelType,
  prompt: string,
  projectDir: string,
  opts?: SpawnOptions,
  adapter?: ProviderAdapter,
): void {
  const windowName = workerWindowName(taskId);
  run([
    'new-window',
    '-t', TMUX_SESSION_NAME,
    '-n', windowName,
    '-c', projectDir,
  ]);
  const promptPath = writePromptFile(projectDir, prompt);
  const cmd = buildWorkerCommand(model, promptPath, opts, adapter, taskId);
  run([
    'send-keys',
    '-t', `${TMUX_SESSION_NAME}:${windowName}`,
    cmd,
    'Enter',
  ]);

  // Capture worker output to a log file via pipe-pane
  const logPath = join(projectDir, TASKS_DIR, `task-${taskId}.log`);
  run([
    'pipe-pane',
    '-t', `${TMUX_SESSION_NAME}:${windowName}`,
    '-o',
    `cat >> ${logPath}`,
  ]);
}

export function killWorker(taskId: string): void {
  const windowName = workerWindowName(taskId);
  run(['kill-window', '-t', `${TMUX_SESSION_NAME}:${windowName}`]);
}

/**
 * @internal Lists active worker windows in tmux. Used only within orchestra/.
 * Not part of the public API surface.
 */
export function listWorkers(): string[] {
  try {
    const output = run([
      'list-windows',
      '-t', TMUX_SESSION_NAME,
      '-F', '#{window_name}',
    ]);
    if (!output) return [];
    return output
      .split('\n')
      .filter((name) => name.startsWith(TMUX_WORKER_PREFIX))
      .map((name) => name.slice(TMUX_WORKER_PREFIX.length));
  } catch {
    return [];
  }
}

function windowExists(windowName: string): boolean {
  const result = spawnSync('tmux', [
    'list-windows', '-t', TMUX_SESSION_NAME, '-F', '#{window_name}',
  ], { encoding: 'utf-8' });
  if (result.status !== 0) return false;
  return (result.stdout ?? '').split('\n').some(name => name.trim() === windowName);
}

/**
 * @internal Used only within orchestra/ — spawns auditor in a tmux window.
 * Not part of the public API surface.
 */
export function startAuditor(projectDir: string, opts?: SpawnOptions, adapter?: ProviderAdapter): void {
  if (!windowExists(TMUX_AUDITOR_WINDOW)) {
    run([
      'new-window',
      '-t', TMUX_SESSION_NAME,
      '-n', TMUX_AUDITOR_WINDOW,
      '-c', projectDir,
    ]);
  }
  const promptPath = writePromptFile(projectDir, 'auditor');
  const cmd = buildWorkerCommand('sonnet', promptPath, opts, adapter);
  run([
    'send-keys',
    '-t', `${TMUX_SESSION_NAME}:${TMUX_AUDITOR_WINDOW}`,
    cmd,
    'Enter',
  ]);
}

export function attach(): void {
  spawnSync('tmux', ['attach', '-t', TMUX_SESSION_NAME], {
    encoding: 'utf-8',
    stdio: 'inherit',
  });
}

export function destroy(): void {
  try {
    run(['kill-session', '-t', TMUX_SESSION_NAME]);
  } catch (e) {
    debugLog('destroy:killSession', e);
  }
}

/**
 * Kill all deckent tmux sessions. Called on SIGINT for graceful shutdown.
 * Equivalent to destroy() but named explicitly for SIGINT/interrupt use cases.
 */
export function killAllSessions(): void {
  try {
    run(['kill-session', '-t', TMUX_SESSION_NAME]);
  } catch (e) {
    debugLog('killAllSessions:killSession', e);
  }
}

/**
 * @internal Sends keys to a tmux pane. Used only within orchestra/.
 * Not part of the public API surface.
 */
export function sendKeys(target: string, keys: string): void {
  run([
    'send-keys',
    '-t', `${TMUX_SESSION_NAME}:${target}`,
    keys,
    'Enter',
  ]);
}

export function setupWatchWindow(sessionName: string, projectRoot: string): void {
  const watchWindow = 'watch';

  // Check if watch window already exists
  const hasWindow = spawnSync('tmux', [
    'list-windows', '-t', sessionName, '-F', '#{window_name}',
  ], { encoding: 'utf-8' });

  if (!hasWindow.stdout?.includes(watchWindow)) {
    spawnSync('tmux', [
      'new-window', '-t', sessionName, '-n', watchWindow,
      `watch -n 2 cat ${join(projectRoot, '.dashboard')}`,
    ], { encoding: 'utf-8' });

    spawnSync('tmux', [
      'split-window', '-t', `${sessionName}:${watchWindow}`, '-h', '-p', '40',
      `watch -n 3 "ls -la ${join(projectRoot, '.tasks')}/*.hb 2>/dev/null | tail -20"`,
    ], { encoding: 'utf-8' });
  }
}

export function createWatchLayout(projectRoot: string): void {
  const watchWindow = 'watch';

  // Check if watch window already exists
  if (!windowExists(watchWindow)) {
    // Create new window with dashboard watch
    run([
      'new-window', '-t', TMUX_SESSION_NAME, '-n', watchWindow,
      `watch -n 2 cat ${join(projectRoot, '.dashboard')}`,
    ]);

    // Split right pane (40%) for worker heartbeat list
    spawnSync('tmux', [
      'split-window', '-t', `${TMUX_SESSION_NAME}:${watchWindow}`, '-h', '-p', '40',
      `watch -n 3 "ls -la ${join(projectRoot, '.tasks')}/*.hb 2>/dev/null | tail -20"`,
    ], { encoding: 'utf-8' });
  }

  // Select watch window and attach
  spawnSync('tmux', ['select-window', '-t', `${TMUX_SESSION_NAME}:${watchWindow}`], {
    encoding: 'utf-8',
  });
  spawnSync('tmux', ['attach-session', '-t', TMUX_SESSION_NAME], {
    encoding: 'utf-8',
    stdio: 'inherit',
  });
}

export function attachToWorkerPane(taskId: string): void {
  const windowName = workerWindowName(taskId);

  // Check if worker window exists
  if (!windowExists(windowName)) {
    throw new TmuxError(`Worker window ${windowName} not found`);
  }

  spawnSync('tmux', ['select-window', '-t', `${TMUX_SESSION_NAME}:${windowName}`], {
    encoding: 'utf-8',
  });
  spawnSync('tmux', ['attach-session', '-t', TMUX_SESSION_NAME], {
    encoding: 'utf-8',
    stdio: 'inherit',
  });
}
