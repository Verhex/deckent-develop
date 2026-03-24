import {
  spawn,
  type ChildProcess,
  spawnSync,
  type SpawnOptions as NodeSpawnOptions,
} from 'node:child_process';
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  openSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';
import type { ModelType, OpenAIModel, UsageMetrics } from '../core/types.js';
import { PROVIDER_MODEL_MAP, isOpenAIModel } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../core/provider.js';
import { ProviderError } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';

// ─── Constants ───────────────────────────────────────────────────────

const CODEX_MODELS: readonly OpenAIModel[] = [...PROVIDER_MODEL_MAP.codex] as OpenAIModel[];

const SAFE_USAGE_DEFAULT: UsageMetrics = {
  fiveHourPercent: 50,
  weeklyPercent: 30,
  measuredAt: new Date().toISOString(),
};

// ─── Worker Entry ────────────────────────────────────────────────────

interface CodexWorkerEntry {
  taskId: string;
  process: ChildProcess;
  logPath: string;
  spawnedAt: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ─── CodexAdapter ────────────────────────────────────────────────────

/**
 * CodexAdapter — ProviderAdapter implementation for OpenAI Codex CLI.
 *
 * Spawns workers as child_process.spawn instances running the `codex` CLI
 * with stdout/stderr redirected to log files. Each worker tracks its PID
 * for kill/list operations.
 *
 * Requires: `codex` CLI installed + OPENAI_API_KEY environment variable.
 */
export class CodexAdapter implements ProviderAdapter {
  readonly name = 'codex';
  readonly supportedModels: readonly ModelType[] = CODEX_MODELS;

  private readonly projectDir: string;
  private readonly workers = new Map<string, CodexWorkerEntry>();

  /** Default timeout in ms before a worker is killed automatically (0 = no timeout) */
  protected defaultTimeoutMs: number;

  constructor(projectDir: string, opts?: { defaultTimeoutMs?: number }) {
    this.projectDir = projectDir;
    this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 0;
  }

  // ─── spawn() ────────────────────────────────────────────────────────

  spawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts?: ProviderSpawnOptions,
  ): void {
    if (!isOpenAIModel(model)) {
      throw new ProviderError(
        `Unsupported model "${model}" for codex provider. Supported: ${CODEX_MODELS.join(', ')}`,
        this.name,
      );
    }

    if (this.workers.has(taskId)) {
      throw new ProviderError(
        `Worker for task "${taskId}" is already running`,
        this.name,
      );
    }

    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    ensureDir(tasksDir);

    const logPath = opts?.logPath ?? join(tasksDir, `task-${taskId}.log`);
    const logFd = openSync(logPath, 'a');

    const args = this.buildArgs(model, prompt, opts);
    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env },
    };

    const child = spawn('codex', args, spawnOpts);
    closeSync(logFd);

    // Write heartbeat
    this.writeHeartbeat(taskId, dir, 'EXECUTING');

    const entry: CodexWorkerEntry = {
      taskId,
      process: child,
      logPath,
      spawnedAt: new Date().toISOString(),
    };

    // Set up timeout if configured
    const timeout = this.defaultTimeoutMs;
    if (timeout > 0) {
      entry.timeoutHandle = setTimeout(() => {
        this.killWithSignal(taskId, 'SIGKILL');
      }, timeout);
    }

    this.workers.set(taskId, entry);

    // Prompt is passed as a positional arg to `codex exec`, no stdin needed.

    // Cleanup on exit
    child.once('exit', () => {
      const w = this.workers.get(taskId);
      if (w?.timeoutHandle) clearTimeout(w.timeoutHandle);
      this.workers.delete(taskId);
    });
  }

  // ─── kill() ─────────────────────────────────────────────────────────

  kill(taskId: string): void {
    this.killWithSignal(taskId, 'SIGTERM');
  }

  // ─── listWorkers() ──────────────────────────────────────────────────

  listWorkers(): string[] {
    return Array.from(this.workers.keys());
  }

  // ─── checkUsage() ───────────────────────────────────────────────────

  /**
   * Check OpenAI API usage / rate limit status.
   * Attempts to query the OpenAI API via the codex CLI.
   * Falls back to safe defaults if unavailable.
   */
  async checkUsage(): Promise<UsageMetrics> {
    try {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        return { ...SAFE_USAGE_DEFAULT, measuredAt: new Date().toISOString() };
      }

      // OpenAI doesn't expose a simple CLI usage command like Claude.
      // Return conservative defaults — actual tracking is handled by brain.ts UsageTracker.
      return {
        fiveHourPercent: 0,
        weeklyPercent: 0,
        measuredAt: new Date().toISOString(),
      };
    } catch {
      return { ...SAFE_USAGE_DEFAULT, measuredAt: new Date().toISOString() };
    }
  }

  // ─── isAvailable() ──────────────────────────────────────────────────

  /**
   * Check whether the Codex CLI is available and an OpenAI API key is set.
   * Checks both OPENAI_API_KEY and DECKENT_OPENAI_API_KEY env vars.
   * Note: ChatGPT OAuth login (`codex --login`) is another valid auth path,
   * but we only detect the API key method here for non-interactive use.
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check for API key (either standard or deckent-specific)
      const apiKey = process.env['OPENAI_API_KEY'] ?? process.env['DECKENT_OPENAI_API_KEY'];
      if (!apiKey) {
        return false;
      }

      // Check codex CLI availability
      const result = spawnSync('codex', ['--version'], {
        encoding: 'utf-8',
        timeout: 5_000,
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  // ─── buildCommand() ─────────────────────────────────────────────────

  /**
   * Build the shell command string for running codex CLI.
   * Format: `codex exec --full-auto "<prompt>" --model <model>`
   * For file-based prompts, the prompt file content is read and passed as arg.
   */
  buildCommand(
    model: ModelType,
    promptPath: string,
    _opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>,
  ): string {
    return `codex exec --full-auto "$(cat ${promptPath})" --model ${model}`;
  }

  // ─── buildPlannerCommand() ──────────────────────────────────────────

  /**
   * Build CLI command + args for planner invocations using Codex.
   * Format: codex exec --full-auto <prompt> --model <model>
   */
  buildPlannerCommand(prompt: string, model: ModelType): { command: string; args: string[] } {
    return {
      command: 'codex',
      args: ['exec', '--full-auto', prompt, '--model', model],
    };
  }

  // ─── Internal helpers ───────────────────────────────────────────────

  private buildArgs(model: ModelType, prompt: string, _opts?: ProviderSpawnOptions): string[] {
    const args = ['exec', '--full-auto', prompt, '--model', model];
    return args;
  }

  private killWithSignal(taskId: string, signal: NodeJS.Signals): void {
    const entry = this.workers.get(taskId);
    if (!entry) {
      throw new ProviderError(
        `No running worker for task "${taskId}"`,
        this.name,
      );
    }
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    entry.process.kill(signal);
    this.workers.delete(taskId);
  }

  // ─── Heartbeat ──────────────────────────────────────────────────────

  protected writeHeartbeat(taskId: string, dir: string, status: string): void {
    const hbPath = join(dir, TASKS_DIR, `task-${taskId}.hb`);
    const hb = {
      workerId: `codex-${taskId}`,
      taskId,
      status,
      currentAction: 'Codex worker running',
      timestamp: new Date().toISOString(),
      filesChangedCount: 0,
      sequence: 0,
    };
    try {
      writeFileSync(hbPath, JSON.stringify(hb, null, 2), 'utf-8');
    } catch {
      // Non-fatal: heartbeat write failure should not stop the worker
    }
  }

  // ─── Accessors (for testing/subclassing) ────────────────────────────

  getWorkerEntry(taskId: string): CodexWorkerEntry | undefined {
    return this.workers.get(taskId);
  }

  getLogPath(taskId: string): string {
    return join(this.projectDir, TASKS_DIR, `task-${taskId}.log`);
  }

  getProjectDir(): string {
    return this.projectDir;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Factory ──────────────────────────────────────────────────────────

/**
 * Create a CodexAdapter instance for the given project directory.
 */
export function createCodexAdapter(
  projectDir: string,
  opts?: { defaultTimeoutMs?: number },
): CodexAdapter {
  return new CodexAdapter(projectDir, opts);
}
