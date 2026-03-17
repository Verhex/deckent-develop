import { spawnSync } from 'node:child_process';
import type { ModelType } from '../core/types.js';
import {
  TMUX_SESSION_NAME,
  TMUX_AUDITOR_WINDOW,
  TMUX_WORKER_PREFIX,
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

function buildClaudeCommand(
  model: ModelType,
  prompt: string,
  opts?: SpawnOptions,
): string {
  let cmd = `claude -p '${prompt}' --model ${model}`;
  if (opts?.allowedTools) {
    cmd += ` --allowedTools '${opts.allowedTools}'`;
  }
  if (opts?.autoApprove) {
    cmd += ' --dangerously-skip-permissions';
  }
  return cmd;
}

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
): void {
  const windowName = workerWindowName(taskId);
  run([
    'new-window',
    '-t', TMUX_SESSION_NAME,
    '-n', windowName,
    '-c', projectDir,
  ]);
  const cmd = buildClaudeCommand(model, prompt, opts);
  run([
    'send-keys',
    '-t', `${TMUX_SESSION_NAME}:${windowName}`,
    cmd,
    'Enter',
  ]);
}

export function killWorker(taskId: string): void {
  const windowName = workerWindowName(taskId);
  run(['kill-window', '-t', `${TMUX_SESSION_NAME}:${windowName}`]);
}

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

export function startAuditor(projectDir: string, opts?: SpawnOptions): void {
  if (!windowExists(TMUX_AUDITOR_WINDOW)) {
    run([
      'new-window',
      '-t', TMUX_SESSION_NAME,
      '-n', TMUX_AUDITOR_WINDOW,
      '-c', projectDir,
    ]);
  }
  const cmd = buildClaudeCommand('sonnet', 'auditor', opts);
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
  } catch {
    // Session doesn't exist — silent
  }
}

export function sendKeys(target: string, keys: string): void {
  run([
    'send-keys',
    '-t', `${TMUX_SESSION_NAME}:${target}`,
    keys,
    'Enter',
  ]);
}
