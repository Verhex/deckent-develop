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
import type { ModelType, OpenAIModel } from '../core/types.js';
import { PROVIDER_MODEL_MAP, isOpenAIModel } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../core/provider.js';
import { ProviderError } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';

// ─── Constants ───────────────────────────────────────────────────────

const CODEX_MODELS: readonly OpenAIModel[] = [...PROVIDER_MODEL_MAP.codex] as OpenAIModel[];

/**
 * Tier-based model mapping for Codex CLI.
 * Used by getModelForTier() to select appropriate models.
 */
export const CODEX_TIER_MODELS = {
  premium: 'gpt-5' as OpenAIModel,
  standard: 'gpt-4.1' as OpenAIModel,
  economy: 'gpt-4.1-mini' as OpenAIModel,
} as const;

/** Auth modes supported by Codex CLI */
export type CodexAuthMode = 'api_key' | 'subscription' | 'none';

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
 * Requires: `codex` CLI installed + OPENAI_API_KEY or ChatGPT subscription auth.
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

    // Build env — inject API key from DECKENT_OPENAI_API_KEY if available
    const spawnEnv = { ...process.env };
    const deckentKey = process.env['DECKENT_OPENAI_API_KEY'];
    if (deckentKey && !spawnEnv['OPENAI_API_KEY']) {
      spawnEnv['OPENAI_API_KEY'] = deckentKey;
    }

    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['ignore', logFd, logFd],
      env: spawnEnv,
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

  // ─── isAvailable() ──────────────────────────────────────────────────

  /**
   * Check whether the Codex CLI is available and auth is configured.
   * Checks both API key auth (OPENAI_API_KEY / DECKENT_OPENAI_API_KEY)
   * and ChatGPT subscription auth (via `codex auth status`).
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check codex CLI availability first
      const versionResult = spawnSync('codex', ['--version'], {
        encoding: 'utf-8',
        timeout: 5_000,
      });
      if (versionResult.status !== 0) return false;

      // Check auth — API key or subscription
      const authMode = this.detectAuthMode();
      return authMode !== 'none';
    } catch {
      return false;
    }
  }

  // ─── detectAuthMode() ─────────────────────────────────────────────

  /**
   * Detect the current auth mode for Codex CLI.
   * Returns 'api_key' if OPENAI_API_KEY or DECKENT_OPENAI_API_KEY is set,
   * 'subscription' if `codex auth status` reports active login,
   * or 'none' if no auth is available.
   */
  detectAuthMode(): CodexAuthMode {
    // Check API key first (fastest path)
    const apiKey = process.env['OPENAI_API_KEY'] ?? process.env['DECKENT_OPENAI_API_KEY'];
    if (apiKey) return 'api_key';

    // Check subscription auth via codex CLI
    try {
      const result = spawnSync('codex', ['auth', 'status'], {
        encoding: 'utf-8',
        timeout: 5_000,
      });
      if (result.status === 0 && result.stdout?.includes('logged in')) {
        return 'subscription';
      }
    } catch {
      // CLI not available or auth check failed
    }

    return 'none';
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

  // ─── getModelForTier() ─────────────────────────────────────────────

  /**
   * Get the recommended Codex model for a given capability tier.
   */
  getModelForTier(tier: 'premium' | 'standard' | 'economy'): OpenAIModel {
    return CODEX_TIER_MODELS[tier];
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
