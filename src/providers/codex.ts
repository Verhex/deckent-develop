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
import type { ProviderAdapter, ProviderSpawnOptions, ProviderAvailabilityDetail } from '../core/provider.js';
import { ProviderError, resolveBinaryPath, parseSemverFromOutput } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';
import type { ModelTier } from '../core/model-equivalence.js';
import { getModelForProviderTier } from '../core/model-equivalence.js';

// ─── Constants ───────────────────────────────────────────────────────

const CODEX_MODELS: readonly OpenAIModel[] = [...PROVIDER_MODEL_MAP.codex] as OpenAIModel[];

/**
 * Tier-based model mapping for Codex CLI.
 * @deprecated Derived from model-equivalence.ts — use adapter.getModelForTier() instead.
 * Kept for backward compatibility with existing imports.
 */
export const CODEX_TIER_MODELS = {
  get premium() { return (getModelForProviderTier('codex', 'premium') ?? 'gpt-5') as OpenAIModel; },
  get standard() { return (getModelForProviderTier('codex', 'standard') ?? 'gpt-4.1') as OpenAIModel; },
  get economy() { return (getModelForProviderTier('codex', 'economy') ?? 'gpt-4.1-mini') as OpenAIModel; },
};

/** Auth modes supported by Codex CLI */
export type CodexAuthMode = 'api_key' | 'subscription' | 'none';

/** Codex CLI variant (Rust rewrite vs legacy Node) */
export type CodexCliVariant = 'rust' | 'node' | 'unknown';

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
      const versionResult = spawnSync('codex', ['--version'], {
        encoding: 'utf-8',
        timeout: 5_000,
      });
      if (versionResult.status !== 0) return false;
      return this.detectAuthMode() !== 'none';
    } catch {
      return false;
    }
  }

  // ─── diagnoseAvailability() ───────────────────────────────────────

  /**
   * Three-layer probe: binary detection → version parsing → auth check.
   * Auth probes both API key (OPENAI_API_KEY / DECKENT_OPENAI_API_KEY) and
   * subscription (`codex auth status` "logged in" string).
   *
   * Partial state: binary OK but neither api_key nor subscription found.
   */
  async diagnoseAvailability(): Promise<ProviderAvailabilityDetail> {
    let binaryFound = false;
    let versionRaw: string | undefined;
    try {
      const result = spawnSync('codex', ['--version'], { encoding: 'utf-8', timeout: 5_000 });
      if (result.status === 0 && result.stdout) {
        versionRaw = result.stdout.trim();
        binaryFound = true;
      }
    } catch {
      // spawn failure
    }
    const binaryPath = binaryFound ? resolveBinaryPath('codex') : undefined;
    const version = parseSemverFromOutput(versionRaw) ?? versionRaw;
    const versionStatus: ProviderAvailabilityDetail['versionStatus'] = !binaryFound
      ? 'missing'
      : version
        ? 'ok'
        : 'unknown';

    const authMode = binaryFound ? this.detectAuthMode() : 'none';
    const authMethod: ProviderAvailabilityDetail['authMethod'] = authMode === 'api_key'
      ? 'api_key'
      : authMode === 'subscription'
        ? 'session'
        : 'none';
    const authStatus: ProviderAvailabilityDetail['authStatus'] = authMode === 'none'
      ? 'missing'
      : 'ok';
    const available = binaryFound && authMode !== 'none';
    const partial = binaryFound && authMode === 'none';

    let reason: string;
    const hints: string[] = [];
    if (!binaryFound) {
      reason = 'Codex CLI not found in PATH';
      hints.push('Install: npm i -g @openai/codex');
    } else if (authMode === 'none') {
      reason = 'Codex CLI installed but no authentication configured';
      hints.push('Set OPENAI_API_KEY environment variable');
      hints.push('Or run `codex login` to authenticate with ChatGPT subscription');
      hints.push('Alternatively, add DECKENT_OPENAI_API_KEY to .deck file');
    } else if (authMode === 'subscription') {
      reason = `Codex CLI ${version ?? 'installed'} + ChatGPT subscription auth active`;
    } else {
      reason = `Codex CLI ${version ?? 'installed'} + OPENAI_API_KEY configured`;
    }

    return {
      name: 'codex',
      binaryFound,
      binaryPath,
      version,
      versionStatus,
      authMethod,
      authStatus,
      available,
      partial,
      models: [...CODEX_MODELS] as ModelType[],
      reason,
      hints,
    };
  }

  /**
   * Detect Codex CLI variant (Rust rewrite vs legacy Node).
   *
   * Rust rewrite outputs semver like "codex 0.1.2025..." or similar with "rust" marker.
   * Legacy Node outputs "codex-cli 1.x.x" or plain version string.
   */
  detectCliVariant(): CodexCliVariant {
    try {
      const result = spawnSync('codex', ['--version'], {
        encoding: 'utf-8',
        timeout: 5_000,
      });
      if (result.status !== 0) return 'unknown';
      const output = (result.stdout ?? '').toLowerCase();
      // Rust rewrite typically outputs version >= 1.0 with different format
      // or contains "codex" without "codex-cli" prefix
      if (output.includes('codex-cli')) return 'node';
      if (output.includes('codex')) return 'rust';
      return 'unknown';
    } catch {
      return 'unknown';
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
   *
   * Uses `--full-auto` for backward compat with Node CLI.
   * Rust rewrite: exec is non-interactive by default, `--full-auto` is ignored harmlessly.
   * Alternative format `--approval-mode full-auto` also accepted by Rust CLI.
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
   *
   * Rust rewrite: `codex exec "prompt" --model <model>` (exec is non-interactive)
   * Legacy Node: `codex exec --full-auto "prompt" --model <model>`
   *
   * We keep `--full-auto` for backward compat — Rust CLI ignores it harmlessly.
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
   * Delegates to model-equivalence.ts as the single source of truth.
   */
  getModelForTier(tier: ModelTier): OpenAIModel {
    return (getModelForProviderTier('codex', tier) ?? 'gpt-4.1') as OpenAIModel;
  }

  // ─── Internal helpers ───────────────────────────────────────────────

  /**
   * Build CLI args for codex exec.
   *
   * Rust rewrite format: `codex exec "prompt" --model <model>` (exec is non-interactive by default)
   * Legacy Node format: `codex exec --full-auto "prompt" --model <model>`
   *
   * We keep `--full-auto` for backward compat with Node CLI — the Rust rewrite ignores it harmlessly.
   */
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
