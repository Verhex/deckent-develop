import { spawnSync } from 'node:child_process';
import type { ModelType } from './types.js';
import type { ProviderSpawnOptions } from './provider.js';

// ─── SpawnBackend Interface ───────────────────────────────────────────────────

/**
 * SpawnBackend — abstract interface for worker spawning backends.
 *
 * Implementations:
 *   - TmuxBackend: wraps tmux.ts (default on Linux/macOS/WSL2)
 *   - SubprocessBackend: wraps SubprocessSpawnBackend (Windows, no tmux)
 *
 * Brain uses SpawnBackendFactory.create() to obtain the appropriate backend.
 */
export interface SpawnBackend {
  /** Human-readable backend name (e.g. 'tmux', 'subprocess') */
  readonly name: string;

  /**
   * Spawn a worker process for the given task.
   * @param taskId  Unique task identifier
   * @param model   Model to use
   * @param prompt  Prompt string sent to the worker
   * @param opts    Optional spawn options (projectDir, allowedTools, autoApprove)
   */
  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void;

  /**
   * Kill a running worker by task ID.
   * @param taskId  Task identifier of the worker to kill
   */
  kill(taskId: string): void;

  /**
   * List currently active worker task IDs.
   */
  list(): string[];

  /**
   * Check whether this backend is available in the current environment.
   * For TmuxBackend: checks if tmux is installed.
   * For SubprocessBackend: always true (requires only Node.js).
   */
  isAvailable(): Promise<boolean>;
}

// ─── SpawnBackendOptions ──────────────────────────────────────────────────────

export interface SpawnBackendOptions extends ProviderSpawnOptions {
  /** Override project directory for this spawn */
  projectDir?: string;
  /** Tools the worker is allowed to use */
  allowedTools?: string;
  /** Whether to auto-approve all Claude prompts */
  autoApprove?: boolean;
  /** Log file path override (for subprocess backend) */
  logPath?: string;
}

// ─── SpawnBackendError ────────────────────────────────────────────────────────

export class SpawnBackendError extends Error {
  constructor(
    message: string,
    public readonly backendName: string,
  ) {
    super(message);
    this.name = 'SpawnBackendError';
  }
}

// ─── TmuxBackend ─────────────────────────────────────────────────────────────

/**
 * TmuxBackend — wraps tmux.ts functions behind the SpawnBackend interface.
 *
 * This preserves existing tmux functionality while making it swappable.
 * Requires tmux to be installed and running.
 */
export class TmuxBackend implements SpawnBackend {
  readonly name = 'tmux';

  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    // Lazy import to avoid circular deps and allow mocking in tests
    const tmux = this._getTmux();
    const dir = opts?.projectDir ?? this.projectDir;
    tmux.ensureSession();
    tmux.spawnWorker(taskId, model, prompt, dir, {
      allowedTools: opts?.allowedTools,
      autoApprove: opts?.autoApprove,
    });
  }

  kill(taskId: string): void {
    const tmux = this._getTmux();
    tmux.killWorker(taskId);
  }

  list(): string[] {
    const tmux = this._getTmux();
    return tmux.listWorkers();
  }

  async isAvailable(): Promise<boolean> {
    const result = spawnSync('tmux', ['-V'], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return result.status === 0;
  }

  /**
   * Indirection for testability — allows tests to inject a mock tmux module.
   * @internal
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _getTmux(): any {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../orchestra/tmux.js');
  }
}

// ─── SubprocessBackend ────────────────────────────────────────────────────────

/**
 * SubprocessBackend — wraps SubprocessSpawnBackend behind the SpawnBackend interface.
 *
 * Runs workers as child processes without requiring tmux.
 * Works on any platform with Node.js (including Windows without WSL2).
 */
export class SubprocessBackend implements SpawnBackend {
  readonly name = 'subprocess';

  private readonly projectDir: string;
  private readonly timeoutMs: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _backend: any = null;

  constructor(projectDir: string, opts?: { timeoutMs?: number }) {
    this.projectDir = projectDir;
    this.timeoutMs = opts?.timeoutMs ?? 0;
  }

  private getBackend() {
    if (!this._backend) {
      // Lazy import for testability
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SubprocessSpawnBackend } = require('../providers/subprocess.js');
      this._backend = new SubprocessSpawnBackend(this.projectDir, {
        defaultTimeoutMs: this.timeoutMs,
      });
    }
    return this._backend;
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    this.getBackend().spawn(taskId, model, prompt, opts);
  }

  kill(taskId: string): void {
    this.getBackend().kill(taskId);
  }

  list(): string[] {
    return this.getBackend().listWorkers() as string[];
  }

  async isAvailable(): Promise<boolean> {
    // Subprocess backend only needs Node.js — always available
    return true;
  }
}

// ─── SpawnBackendFactory ──────────────────────────────────────────────────────

export type BackendType = 'tmux' | 'subprocess' | 'auto';

export interface SpawnBackendFactoryOptions {
  /**
   * Backend type to use.
   * - 'tmux': always use TmuxBackend (fail if tmux not available)
   * - 'subprocess': always use SubprocessBackend
   * - 'auto' (default): prefer tmux if available, fall back to subprocess
   */
  backend?: BackendType;

  /** Project root directory for spawned workers */
  projectDir: string;

  /** Default worker timeout in ms (subprocess backend only, 0 = no timeout) */
  defaultTimeoutMs?: number;
}

/**
 * SpawnBackendFactory — selects and creates the appropriate SpawnBackend.
 *
 * Selection logic:
 * 1. If `backend` is explicitly set to 'tmux' or 'subprocess', use that.
 * 2. In 'auto' mode: check if tmux is available → use TmuxBackend.
 *    If tmux is not available → fall back to SubprocessBackend.
 */
export class SpawnBackendFactory {
  /**
   * Create a SpawnBackend based on the given options.
   *
   * @param opts  Factory options including backend preference and projectDir
   * @returns     A SpawnBackend instance ready to use
   */
  static create(opts: SpawnBackendFactoryOptions): SpawnBackend {
    const backendType = opts.backend ?? 'auto';

    if (backendType === 'subprocess') {
      return new SubprocessBackend(opts.projectDir, {
        timeoutMs: opts.defaultTimeoutMs,
      });
    }

    if (backendType === 'tmux') {
      return new TmuxBackend(opts.projectDir);
    }

    // 'auto': check if tmux is installed
    if (SpawnBackendFactory.isTmuxAvailable()) {
      return new TmuxBackend(opts.projectDir);
    }

    return new SubprocessBackend(opts.projectDir, {
      timeoutMs: opts.defaultTimeoutMs,
    });
  }

  /**
   * Synchronous check for tmux availability (used during factory creation).
   */
  static isTmuxAvailable(): boolean {
    const result = spawnSync('tmux', ['-V'], {
      encoding: 'utf-8',
      timeout: 3_000,
    });
    return result.status === 0;
  }

  /**
   * Asynchronous backend creation — checks availability then creates.
   * Use this when you want the backend to confirm its own readiness.
   */
  static async createAsync(opts: SpawnBackendFactoryOptions): Promise<SpawnBackend> {
    const backend = SpawnBackendFactory.create(opts);
    const available = await backend.isAvailable();
    if (!available) {
      throw new SpawnBackendError(
        `Backend "${backend.name}" is not available in the current environment`,
        backend.name,
      );
    }
    return backend;
  }
}
