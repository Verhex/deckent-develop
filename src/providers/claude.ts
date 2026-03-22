import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelType, UsageMetrics } from '../core/types.js';
import { CLAUDE_MODELS } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../core/provider.js';
import {
  spawnWorker,
  killWorker,
  listWorkers,
  ensureSession,
  isSessionActive,
  cleanupPromptFile,
} from '../orchestra/tmux.js';
import { TASKS_DIR } from '../core/constants.js';

// ─── Constants ───────────────────────────────────────────────────────

const SUPPORTED_MODELS: readonly ModelType[] = [...CLAUDE_MODELS];
const SAFE_USAGE_DEFAULT: UsageMetrics = {
  fiveHourPercent: 50,
  weeklyPercent: 30,
  measuredAt: new Date().toISOString(),
};

// ─── ClaudeAdapter ───────────────────────────────────────────────────

/**
 * ClaudeAdapter — ProviderAdapter implementation backed by tmux + Claude CLI.
 *
 * Wraps tmux.ts functions (spawnWorker, killWorker, listWorkers, isSessionActive)
 * and exposes them through the ProviderAdapter interface.
 */
export class ClaudeAdapter implements ProviderAdapter {
  readonly name = 'claude-tmux';
  readonly supportedModels: readonly ModelType[] = SUPPORTED_MODELS;

  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * Spawn a tmux worker window running Claude CLI with the given prompt.
   */
  spawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts?: ProviderSpawnOptions,
  ): void {
    const dir = opts?.projectDir ?? this.projectDir;
    ensureSession();
    spawnWorker(taskId, model, prompt, dir, {
      allowedTools: opts?.allowedTools,
      autoApprove: opts?.autoApprove,
    });
  }

  /**
   * Kill a running worker tmux window and clean up any orphaned prompt tmpfiles.
   */
  kill(taskId: string): void {
    killWorker(taskId);
    this._cleanupOrphanedPromptFiles();
  }

  /**
   * Clean up orphaned `.prompt-*.txt` tmpfiles left behind by spawnWorker.
   * Called automatically after kill() to prevent file accumulation.
   */
  private _cleanupOrphanedPromptFiles(): void {
    const tasksDir = join(this.projectDir, TASKS_DIR);
    if (!existsSync(tasksDir)) return;
    try {
      const files = readdirSync(tasksDir);
      for (const file of files) {
        if (file.startsWith('.prompt-') && file.endsWith('.txt')) {
          cleanupPromptFile(join(tasksDir, file));
        }
      }
    } catch {
      // ignore — tasks dir may be inaccessible
    }
  }

  /**
   * List currently active worker task IDs from tmux windows.
   */
  listWorkers(): string[] {
    return listWorkers();
  }

  /**
   * Check Claude CLI usage (5-hour and weekly percentages).
   * Runs `claude -p /usage` and parses the output.
   * Falls back to safe defaults if the command fails.
   */
  async checkUsage(): Promise<UsageMetrics> {
    try {
      const result = spawnSync('claude', ['-p', '/usage'], {
        encoding: 'utf-8',
        timeout: 10_000,
      });
      if (result.status !== 0 || !result.stdout) {
        return { ...SAFE_USAGE_DEFAULT, measuredAt: new Date().toISOString() };
      }

      const output = result.stdout;
      const fiveHrMatch =
        output.match(/5[- ]?h(?:r|our(?:ly)?)?[:\s]+(\d+(?:\.\d+)?)\s*%/i) ??
        output.match(/(\d+(?:\.\d+)?)\s*%[^%\n]*5[- ]?h/i);
      const weeklyMatch =
        output.match(/week(?:ly)?[:\s]+(\d+(?:\.\d+)?)\s*%/i) ??
        output.match(/(\d+(?:\.\d+)?)\s*%[^%\n]*week/i);

      const fiveHourPercent = fiveHrMatch?.[1]
        ? parseFloat(fiveHrMatch[1])
        : SAFE_USAGE_DEFAULT.fiveHourPercent;
      const weeklyPercent = weeklyMatch?.[1]
        ? parseFloat(weeklyMatch[1])
        : SAFE_USAGE_DEFAULT.weeklyPercent;

      return { fiveHourPercent, weeklyPercent, measuredAt: new Date().toISOString() };
    } catch {
      return { ...SAFE_USAGE_DEFAULT, measuredAt: new Date().toISOString() };
    }
  }

  /**
   * Check whether the Claude CLI is available in the current environment.
   * Runs `claude --version` and checks exit code.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = spawnSync('claude', ['--version'], {
        encoding: 'utf-8',
        timeout: 5_000,
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Build the shell command string that Claude CLI would use.
   * Equivalent to tmux.ts buildClaudeCommand().
   */
  buildCommand(
    model: ModelType,
    promptPath: string,
    opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>,
  ): string {
    let cmd = `claude -p - --model ${model}`;
    if (opts?.allowedTools) {
      cmd += ` --allowedTools '${opts.allowedTools}'`;
    }
    if (opts?.autoApprove) {
      cmd += ' --dangerously-skip-permissions';
    }
    cmd += ` < ${promptPath}`;
    return cmd;
  }

  /**
   * Check whether the tmux session is active.
   */
  isSessionActive(): boolean {
    return isSessionActive();
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Create a ClaudeAdapter instance for the given project directory.
 */
export function createClaudeAdapter(projectDir: string): ClaudeAdapter {
  return new ClaudeAdapter(projectDir);
}
