import { spawnSync } from 'node:child_process';
import type { ModelType } from '../core/types.js';
import type { ProviderSpawnOptions } from '../core/provider.js';
import { ensureSession, spawnWorker as tmuxSpawnWorker, killWorker as tmuxKillWorker, listWorkers as tmuxListWorkers } from './tmux.js';
import { SubprocessSpawnBackend } from '../providers/subprocess.js';
import { DockerSpawnBackend, isDockerAvailable } from './spawn-backend-docker.js';

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
  /** Whether this is a fix/retry spawn — adds -fix suffix to prompt filename */
  isPriorityFix?: boolean;
  /**
   * Per-task adaptive timeout in seconds, computed by brainEstimateTimeout().
   * When set, overrides the backend's default timeout constant.
   * Passed as TASK_TIMEOUT env var to Docker containers and as timeoutSeconds
   * parameter to tmux/subprocess backends.
   */
  taskTimeoutSeconds?: number;
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
    // Sprint 168 C0e Cross-Backend Contract: tmpfiles persist until sprint cleanup,
    // archived together by archivePromptFiles() during sprint cleanup phase.
    // (Same as Docker backend spawn-backend-docker.ts:941-942 — Sprint 156 Task 4.)
    // Tmux backend's prompt files are named with random hex (no embedded taskId),
    // so the active-worker selective filter in claude.ts._cleanupOrphanedPromptFiles
    // does NOT protect them — see ADR-048 Consequences (Negative).
    const dir = opts?.projectDir ?? this.projectDir;
    ensureSession();
    tmuxSpawnWorker(taskId, model, prompt, dir, {
      allowedTools: opts?.allowedTools,
      autoApprove: opts?.autoApprove,
      taskTimeoutSeconds: opts?.taskTimeoutSeconds,
    });
  }

  kill(taskId: string): void {
    tmuxKillWorker(taskId);
  }

  list(): string[] {
    return tmuxListWorkers();
  }

  async isAvailable(): Promise<boolean> {
    const result = spawnSync('tmux', ['-V'], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return result.status === 0;
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
  private _backend: SubprocessSpawnBackend | null = null;

  constructor(projectDir: string, opts?: { timeoutMs?: number }) {
    this.projectDir = projectDir;
    this.timeoutMs = opts?.timeoutMs ?? 0;
  }

  private getBackend(timeoutOverrideMs?: number): SubprocessSpawnBackend {
    // When a per-task timeout is provided, create a fresh backend with that timeout
    // (SubprocessSpawnBackend.defaultTimeoutMs is protected, so we can't mutate it)
    if (timeoutOverrideMs != null) {
      return new SubprocessSpawnBackend(this.projectDir, {
        defaultTimeoutMs: timeoutOverrideMs,
      });
    }
    if (!this._backend) {
      this._backend = new SubprocessSpawnBackend(this.projectDir, {
        defaultTimeoutMs: this.timeoutMs,
      });
    }
    return this._backend;
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    // Sprint 168 C0e Cross-Backend Contract: tmpfiles persist until sprint cleanup,
    // archived together by archivePromptFiles() during sprint cleanup phase.
    // (Same as Docker backend spawn-backend-docker.ts:941-942 — Sprint 156 Task 4.)
    // Subprocess backend does NOT currently write `.prompt-*.txt` files (prompts
    // are passed via child_process argv / stdin), so the cross-backend contract
    // here is a marker that future prompt persistence MUST follow this lifecycle.
    const timeoutOverrideMs = opts?.taskTimeoutSeconds != null
      ? opts.taskTimeoutSeconds * 1000
      : undefined;
    this.getBackend(timeoutOverrideMs).spawn(taskId, model, prompt, opts);
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

export type BackendType = 'tmux' | 'subprocess' | 'docker' | 'auto';

export interface SpawnBackendFactoryOptions {
  /**
   * Backend type to use.
   * - 'docker': isolated Docker containers (recommended)
   * - 'tmux': tmux windows (legacy, shared filesystem)
   * - 'subprocess': child processes (Windows fallback)
   * - 'auto' (default): docker → tmux → subprocess fallback chain
   */
  backend?: BackendType;

  /** Project root directory for spawned workers */
  projectDir: string;

  /** Default worker timeout in ms (0 = no timeout) */
  defaultTimeoutMs?: number;

  /** Docker image for worker containers (default: deckent-worker:latest) */
  dockerImage?: string;

  /** Docker container timeout in seconds (default: 1200 = 20 minutes) */
  dockerTimeoutSeconds?: number;

  /** Docker graceful shutdown timeout in seconds (default: 15). SIGTERM → grace → SIGKILL. */
  dockerGracefulTimeoutSeconds?: number;
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

    if (backendType === 'docker') {
      return new DockerSpawnBackend(opts.projectDir, {
        image: opts.dockerImage,
        timeoutSeconds: opts.dockerTimeoutSeconds
          ?? (opts.defaultTimeoutMs ? Math.floor(opts.defaultTimeoutMs / 1000) : undefined),
        gracefulTimeoutSeconds: opts.dockerGracefulTimeoutSeconds,
      });
    }

    if (backendType === 'subprocess') {
      return new SubprocessBackend(opts.projectDir, {
        timeoutMs: opts.defaultTimeoutMs,
      });
    }

    if (backendType === 'tmux') {
      return new TmuxBackend(opts.projectDir);
    }

    // 'auto': prefer docker if available, then tmux, then subprocess
    if (isDockerAvailable()) {
      return new DockerSpawnBackend(opts.projectDir, {
        image: opts.dockerImage,
        timeoutSeconds: opts.dockerTimeoutSeconds
          ?? (opts.defaultTimeoutMs ? Math.floor(opts.defaultTimeoutMs / 1000) : undefined),
        gracefulTimeoutSeconds: opts.dockerGracefulTimeoutSeconds,
      });
    }
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
