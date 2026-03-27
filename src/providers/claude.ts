import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelType, UsageMetrics } from '../core/types.js';
import { CLAUDE_MODELS } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../core/provider.js';
import { ProviderError } from '../core/provider.js';
import {
  spawnWorker,
  killWorker,
  listWorkers,
  ensureSession,
  isSessionActive,
  cleanupPromptFile,
} from '../orchestra/tmux.js';
import { TASKS_DIR } from '../core/constants.js';
import {
  SubprocessSpawnBackend,
  CLAUDE_SUBPROCESS_CONFIG,
} from './subprocess.js';

// ─── Types ──────────────────────────────────────────────────────────

export type ClaudeBackend = 'tmux' | 'subprocess' | 'mcp';

export interface ClaudeAdapterOptions {
  /** Execution backend: 'tmux' (default), 'subprocess' (headless), 'mcp' (future) */
  claude_backend?: ClaudeBackend;
}

// ─── Constants ───────────────────────────────────────────────────────

const SUPPORTED_MODELS: readonly ModelType[] = [...CLAUDE_MODELS];
const SAFE_USAGE_DEFAULT: UsageMetrics = {
  fiveHourPercent: 50,
  weeklyPercent: 30,
  measuredAt: new Date().toISOString(),
};

/**
 * Informative error message for MCP backend — includes sprint context,
 * alternatives, and roadmap reference so callers know what to do instead.
 */
const MCP_NOT_IMPLEMENTED_MESSAGE =
  'MCP backend is not yet implemented (deferred past Sprint 048). ' +
  "Alternatives: set claude_backend to 'tmux' (default) or 'subprocess'. " +
  'Roadmap: see DECKENT-MASTER-BLUEPRINT.md for planned MCP integration.';

// ─── ClaudeAdapter ───────────────────────────────────────────────────

/**
 * ClaudeAdapter — ProviderAdapter implementation backed by tmux + Claude CLI.
 *
 * Wraps tmux.ts functions (spawnWorker, killWorker, listWorkers, isSessionActive)
 * and exposes them through the ProviderAdapter interface.
 *
 * Supports three backends via `claude_backend` config:
 * - 'tmux' (default): uses tmux sessions for worker management
 * - 'subprocess': headless child_process.spawn via SubprocessSpawnBackend
 * - 'mcp': future — throws ProviderError if selected
 */
export class ClaudeAdapter implements ProviderAdapter {
  readonly name = 'claude-tmux';
  readonly supportedModels: readonly ModelType[] = SUPPORTED_MODELS;

  private readonly projectDir: string;
  private readonly backend: ClaudeBackend;
  private subprocessBackend: SubprocessSpawnBackend | null = null;

  constructor(projectDir: string, opts?: ClaudeAdapterOptions) {
    this.projectDir = projectDir;
    this.backend = opts?.claude_backend ?? 'tmux';

    if (this.backend === 'subprocess') {
      this.subprocessBackend = new SubprocessSpawnBackend(projectDir, {
        providerConfig: CLAUDE_SUBPROCESS_CONFIG,
      });
    }
  }

  /**
   * Get the active backend name.
   */
  getBackend(): ClaudeBackend {
    return this.backend;
  }

  /**
   * Spawn a worker using the configured backend.
   * Throws ProviderError if backend is 'mcp' (not yet implemented).
   */
  spawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts?: ProviderSpawnOptions,
  ): void {
    if (this.backend === 'mcp') {
      throw new ProviderError(MCP_NOT_IMPLEMENTED_MESSAGE, 'claude');
    }

    if (this.backend === 'subprocess' && this.subprocessBackend) {
      this.subprocessBackend.spawn(taskId, model, prompt, opts);
      return;
    }

    // tmux backend (default)
    const dir = opts?.projectDir ?? this.projectDir;
    ensureSession();
    spawnWorker(taskId, model, prompt, dir, {
      allowedTools: opts?.allowedTools,
      autoApprove: opts?.autoApprove,
    });
  }

  /**
   * Kill a running worker and clean up.
   */
  kill(taskId: string): void {
    if (this.backend === 'subprocess' && this.subprocessBackend) {
      this.subprocessBackend.kill(taskId);
      return;
    }

    // tmux backend (default)
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
   * List currently active worker task IDs.
   */
  listWorkers(): string[] {
    if (this.backend === 'subprocess' && this.subprocessBackend) {
      return this.subprocessBackend.listWorkers();
    }
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
        shell: process.platform === 'win32',
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
   * Check whether this adapter is available in the current environment.
   * Returns false immediately for MCP backend (not yet implemented).
   * For tmux/subprocess: runs `claude --version` and checks exit code.
   */
  async isAvailable(): Promise<boolean> {
    if (this.backend === 'mcp') {
      return false;
    }

    try {
      const result = spawnSync('claude', ['--version'], {
        encoding: 'utf-8',
        timeout: 5_000,
        shell: process.platform === 'win32',
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Build the shell command string that Claude CLI would use.
   * Command format varies by backend:
   * - tmux: `claude -p - --model ${model} [opts] < ${promptPath}`
   * - subprocess: `claude -p "${prompt}" --dangerously-skip-permissions --model ${model}`
   */
  buildCommand(
    model: ModelType,
    promptPath: string,
    opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>,
  ): string {
    if (this.backend === 'subprocess') {
      let cmd = `claude -p "${promptPath}" --dangerously-skip-permissions --model ${model}`;
      if (opts?.allowedTools) {
        cmd += ` --allowedTools '${opts.allowedTools}'`;
      }
      return cmd;
    }

    // tmux backend (default)
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
   * Only meaningful for tmux backend.
   */
  isSessionActive(): boolean {
    if (this.backend === 'subprocess') {
      return true; // subprocess doesn't need tmux session
    }
    return isSessionActive();
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Create a ClaudeAdapter instance for the given project directory.
 */
export function createClaudeAdapter(
  projectDir: string,
  opts?: ClaudeAdapterOptions,
): ClaudeAdapter {
  return new ClaudeAdapter(projectDir, opts);
}
