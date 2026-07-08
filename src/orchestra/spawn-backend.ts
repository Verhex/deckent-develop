import { spawnSync } from 'node:child_process';
import type { ModelType } from '../core/types.js';
import type { ProviderSpawnOptions } from '../core/provider.js';
import { ensureSession, spawnWorker as tmuxSpawnWorker, killWorker as tmuxKillWorker, listWorkers as tmuxListWorkers } from './tmux.js';
import { SubprocessSpawnBackend, CLAUDE_SUBPROCESS_CONFIG } from '../providers/subprocess.js';
import type { SubprocessProviderConfig } from '../providers/subprocess.js';
import { CODEX_USAGE_EMIT_ARGS } from '../providers/codex.js';
import { DockerSpawnBackend } from './spawn-backend-docker.js';
import { assertNotLethalWithoutApproval } from '../nervous/panic-gate.js';
import { SandboxSpawnBackend } from '../providers/sandbox.js';
import type { SandboxOptions } from '../providers/sandbox.js';
import { modelRegistry } from '../core/model-registry.js';
import { getProviderCommandSpec } from '../core/provider-command-spec.js';
import { resolveReasoningEffort } from '../core/reasoning-effort.js';
import { getDefaultProviderName } from './sprint-utils.js';

export type { SandboxOptions };
export { SandboxSpawnBackend };

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
  /**
   * Optional action id for the toggle-independent SAFETY_FLOOR guard (GATE-W2).
   * When set, `checkLethalGuard` checks the action against the 5 locked
   * SAFETY_FLOOR actions before any process is spawned — regardless of whether
   * `nervous.enabled` is true. Lethal actions throw SpawnBackendError.
   */
  actionId?: string;
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

// ─── Toggle-Independent Lethal Guard Helper ───────────────────────────────────

/**
 * Run the toggle-independent SAFETY_FLOOR guard before spawning a worker.
 *
 * Delegates to `assertNotLethalWithoutApproval` (panic-gate.ts) which fires
 * regardless of whether `config.nervous_system.enabled` is true. Non-lethal or
 * absent `actionId` is a no-op. Lethal actions (KILL_LIVE_SPRINT,
 * DESTRUCTIVE_GIT, MANUAL_FILE_DELETE, COST_OVER_THRESHOLD,
 * ADR_DEPRECATE_ACCEPTED) throw immediately — no process is ever spawned.
 *
 * @toggleIndependent — active even when nervous system is disabled.
 */
export function checkLethalGuard(actionId: string | undefined, backendName: string): void {
  if (!actionId) return;
  const result = assertNotLethalWithoutApproval(actionId);
  if (result.blocked) {
    throw new SpawnBackendError(result.reason, backendName);
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
    checkLethalGuard(opts?.actionId, this.name);
    // Sprint 168 C0e Cross-Backend Contract: tmpfiles persist until sprint cleanup,
    // archived together by archivePromptFiles() during sprint cleanup phase.
    // (Same as Docker backend spawn-backend-docker.ts:941-942 — Sprint 156 Task 4.)
    // Sprint 170 P0-3: tmux worker prompt files embed taskId
    // (`.prompt-{taskId}-{hash}.txt`, see tmux.ts writePromptFile), so the
    // active-worker selective filter in claude.ts._cleanupOrphanedPromptFiles
    // DOES protect them. Only the taskId-less Auditor prompt keeps the legacy
    // hex-only name — see ADR-048 Consequences (Negative) for the history.
    const dir = opts?.projectDir ?? this.projectDir;
    ensureSession();
    tmuxSpawnWorker(taskId, model, prompt, dir, {
      allowedTools: opts?.allowedTools,
      autoApprove: opts?.autoApprove,
      taskTimeoutSeconds: opts?.taskTimeoutSeconds,
      reasoningEffort: opts?.reasoningEffort, // F1-RE: native model reasoning depth
      excludeDynamicPromptSections: opts?.excludeDynamicPromptSections, // F3.1: prefix-stable cache
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

// ─── Subprocess Provider→CLI Resolution (SUBPROC-PROVIDER-CLI, 364-002) ───────
//
// born-481 (log-evidenced): SubprocessBackend always defaulted to
// CLAUDE_SUBPROCESS_CONFIG regardless of the spawned task's actual provider —
// a provider:codex task (model apiId gpt-5.5) was fed to the claude CLI's
// `--model` flag, which the Claude API rejects (404 -> worker exit 1). The
// CLI-binary + arg-table must be selected FROM THE PROVIDER, reusing
// PROVIDER_COMMAND_SPECS (core/provider-command-spec.ts) — the same SSOT
// spawn-backend-docker.ts's runSpawn() already keys off — so the docker and
// subprocess backends' provider→CLI mapping can never drift apart.
//
// Only STDIN-fed CLIs can be represented here: SubprocessProviderConfig.
// buildArgs(model, opts) has no prompt parameter — SubprocessSpawnBackend
// writes the prompt to the child's stdin separately (providers/subprocess.ts
// spawn(), after buildArgs() runs) — so an 'inline' promptFeed provider
// (gemini's `-p <text>`) cannot be expressed without changing that interface
// (out of this task's write scope). Any such provider, or one with no
// ProviderCommandSpec at all (ollama — host-only, ADR: use its host adapter),
// is an honest SpawnBackendError — never a silent claude-CLI fallback (Yasa #2).

let codexSubprocessConfig: SubprocessProviderConfig | undefined;

/**
 * Build (once, memoized) the codex SubprocessProviderConfig from
 * PROVIDER_COMMAND_SPECS.codex — the CLI binary + flag table are read from
 * that single source of truth, not re-hardcoded here.
 */
function getCodexSubprocessConfig(): SubprocessProviderConfig {
  if (codexSubprocessConfig) return codexSubprocessConfig;

  const spec = getProviderCommandSpec('codex');
  if (!spec) {
    // Unreachable in practice — codex is a built-in PROVIDER_COMMAND_SPECS
    // entry — kept as an honest failure instead of a non-null assertion.
    throw new SpawnBackendError(
      'No ProviderCommandSpec registered for "codex" — cannot build its subprocess CLI config.',
      'subprocess',
    );
  }

  // spec.baseArgs carries '--json' inline (the docker convention); the
  // subprocess backend applies a usage-emit flag ONLY at live-spawn time via
  // SubprocessProviderConfig.usageEmitArgs (mirrors CLAUDE_SUBPROCESS_CONFIG),
  // which keeps buildArgs()/buildCommandString() dry-run-stable — no
  // usage-telemetry flag leaking into the unit-tested arg shape or display string.
  const baseArgs = spec.baseArgs.filter(arg => !CODEX_USAGE_EMIT_ARGS.includes(arg));

  const config: SubprocessProviderConfig = {
    cliCommand: spec.binary,
    name: 'codex-subprocess',
    supportedModels: modelRegistry.getByProvider('codex').map(m => m.id) as ModelType[],
    buildArgs(model, opts) {
      const wireModel = modelRegistry.get(model)?.apiId ?? model;
      const args = [...baseArgs, spec.modelFlag, wireModel];
      if (opts?.autoApprove) {
        args.push(...spec.approvalArgs);
      }
      const effort = resolveReasoningEffort('codex', opts?.reasoningEffort);
      if (effort && spec.reasoningEffortArgs) {
        args.push(...spec.reasoningEffortArgs(effort));
      }
      return args;
    },
    buildCommandString(model, promptPath, opts) {
      const args = config.buildArgs(model, opts);
      return `${spec.binary} ${args.join(' ')} < ${promptPath}`;
    },
    usageEmitArgs: CODEX_USAGE_EMIT_ARGS,
  };

  codexSubprocessConfig = config;
  return config;
}

/**
 * Resolve the SubprocessProviderConfig for a non-claude provider. 'claude' is
 * handled by the caller as a direct CLAUDE_SUBPROCESS_CONFIG passthrough
 * (byte-identical to pre-364-002 behavior — see SubprocessBackend below).
 * 'codex' builds a matching config from PROVIDER_COMMAND_SPECS; any other
 * provider is an honest SpawnBackendError (born-481 — no silent claude
 * fallback), with a specific reason when the provider IS known but its CLI
 * cannot be expressed over this backend's stdin-only prompt delivery.
 */
function resolveSubprocessProviderConfig(provider: string): SubprocessProviderConfig {
  if (provider === 'codex') return getCodexSubprocessConfig();

  const spec = getProviderCommandSpec(provider);
  if (spec && spec.promptFeed !== 'stdin') {
    throw new SpawnBackendError(
      `Subprocess backend cannot spawn provider "${provider}": its CLI ("${spec.binary}") `
      + `expects the prompt as an inline argument, but SubprocessProviderConfig.buildArgs() has `
      + `no prompt access (the subprocess backend only supports stdin-fed CLIs). Use the docker `
      + `backend for this provider instead.`,
      'subprocess',
    );
  }
  throw new SpawnBackendError(
    `Subprocess backend has no CLI command mapping for provider "${provider}" `
    + `(supported: claude, codex). Refusing to silently spawn the claude CLI for a `
    + `mismatched provider — born-481.`,
    'subprocess',
  );
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
  /**
   * One SubprocessSpawnBackend PER PROVIDER (364-002) — each instance owns
   * exactly one CLI binary, fixed at construction via providerConfig. Keyed
   * by provider so a mixed-provider sprint on spawn_backend=subprocess (e.g.
   * claude + codex tasks) gives each task its own CLI instead of every task
   * silently defaulting to claude's (born-481).
   */
  private readonly backendsByProvider = new Map<string, SubprocessSpawnBackend>();

  constructor(projectDir: string, opts?: { timeoutMs?: number }) {
    this.projectDir = projectDir;
    this.timeoutMs = opts?.timeoutMs ?? 0;
  }

  private getBackendForProvider(provider: string, timeoutOverrideMs?: number): SubprocessSpawnBackend {
    // 'claude' resolves the SAME CLAUDE_SUBPROCESS_CONFIG singleton
    // SubprocessSpawnBackend defaults to internally — byte-identical spawn
    // args to pre-364-002 behavior.
    const providerConfig = provider === 'claude' ? CLAUDE_SUBPROCESS_CONFIG : resolveSubprocessProviderConfig(provider);
    // When a per-task timeout is provided, create a fresh backend with that timeout
    // (SubprocessSpawnBackend.defaultTimeoutMs is protected, so we can't mutate it)
    if (timeoutOverrideMs != null) {
      return new SubprocessSpawnBackend(this.projectDir, {
        defaultTimeoutMs: timeoutOverrideMs,
        providerConfig,
      });
    }
    let backend = this.backendsByProvider.get(provider);
    if (!backend) {
      backend = new SubprocessSpawnBackend(this.projectDir, {
        defaultTimeoutMs: this.timeoutMs,
        providerConfig,
      });
      this.backendsByProvider.set(provider, backend);
    }
    return backend;
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    checkLethalGuard(opts?.actionId, this.name);
    // Sprint 168 C0e Cross-Backend Contract: tmpfiles persist until sprint cleanup,
    // archived together by archivePromptFiles() during sprint cleanup phase.
    // (Same as Docker backend spawn-backend-docker.ts:941-942 — Sprint 156 Task 4.)
    // Subprocess backend does NOT currently write `.prompt-*.txt` files (prompts
    // are passed via child_process argv / stdin), so the cross-backend contract
    // here is a marker that future prompt persistence MUST follow this lifecycle.
    // 364-002 (born-481): resolve the CLI-binary from the TASK'S ACTUAL PROVIDER,
    // not a fixed claude default — mirrors spawn-backend-docker.ts's runSpawn().
    const provider = modelRegistry.get(model)?.provider ?? getDefaultProviderName();
    const timeoutOverrideMs = opts?.taskTimeoutSeconds != null
      ? opts.taskTimeoutSeconds * 1000
      : undefined;
    this.getBackendForProvider(provider, timeoutOverrideMs).spawn(taskId, model, prompt, opts);
  }

  kill(taskId: string): void {
    // Scan every provider backend this instance has spawned through — a
    // mixed-provider sprint may hold the taskId on any one of them.
    for (const backend of this.backendsByProvider.values()) {
      if (backend.listWorkers().includes(taskId)) {
        backend.kill(taskId);
        return;
      }
    }
    // No cached backend currently tracks this taskId — surface the SAME
    // "No running worker" error SubprocessSpawnBackend itself throws (matches
    // pre-364-002 behavior for an unknown/already-exited task).
    this.getBackendForProvider('claude').kill(taskId);
  }

  list(): string[] {
    return Array.from(this.backendsByProvider.values()).flatMap(b => b.listWorkers() as string[]);
  }

  async isAvailable(): Promise<boolean> {
    // Subprocess backend only needs Node.js — always available
    return true;
  }
}

// ─── SandboxBackend ───────────────────────────────────────────────────────────

/**
 * SandboxBackend — adapts SandboxSpawnBackend to the SpawnBackend interface.
 *
 * SandboxSpawnBackend extends SubprocessSpawnBackend (providers/) which exposes
 * listWorkers() instead of list(). This thin adapter bridges the gap so that
 * SandboxSpawnBackend can be used wherever SpawnBackend is expected.
 *
 * Activated with `deckent start --sandbox`.
 */
export class SandboxBackend implements SpawnBackend {
  readonly name = 'claude-sandbox';

  private readonly inner: SandboxSpawnBackend;

  constructor(projectDir: string, opts?: SandboxOptions) {
    this.inner = new SandboxSpawnBackend(projectDir, opts);
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    checkLethalGuard(opts?.actionId, this.name);
    this.inner.spawn(taskId, model, prompt, opts);
  }

  kill(taskId: string): void {
    this.inner.kill(taskId);
  }

  list(): string[] {
    return this.inner.listWorkers() as string[];
  }

  async isAvailable(): Promise<boolean> {
    return this.inner.isAvailable();
  }
}

/**
 * Factory — create a SandboxBackend for the given project root.
 * Use this from CLI/API surfaces (e.g. `deckent start --sandbox`).
 */
export function createSandboxBackend(projectDir: string, opts?: SandboxOptions): SandboxBackend {
  return new SandboxBackend(projectDir, opts);
}

// ─── Tmux Deprecation Warning ─────────────────────────────────────────────────

/**
 * Tracks sprint-scoped tmux deprecation warnings.
 * Populated by resolveBackend() when explicit 'tmux' is requested.
 * Reset at process start and can be reset for testing via resetTmuxDeprecationWarning().
 */
const _tmuxDeprecationWarned = new Set<string>();

/**
 * Reset the tmux deprecation warning tracker.
 * Call this at sprint start or in tests to allow the warning to be re-emitted.
 */
export function resetTmuxDeprecationWarning(): void {
  _tmuxDeprecationWarned.clear();
}

/**
 * Resolve the effective backend type to use.
 *
 * - 'auto' always resolves to 'docker' (Sprint 177 — default changed from tmux to docker).
 *   This eliminates the old auto→tmux fallback that caused Sprint 176 issues.
 * - 'tmux' emits a one-time deprecation warning. tmux support will be removed in Sprint 178.
 * - All other values pass through unchanged.
 *
 * @param backend  Requested backend type ('auto' | 'docker' | 'tmux' | 'subprocess')
 * @returns        Resolved backend type to actually instantiate
 */
export function resolveBackend(backend: string): string {
  if (backend === 'auto') {
    return process.platform === 'win32' ? 'subprocess' : 'docker';
  }

  if (backend === 'tmux') {
    const warnKey = 'tmux-deprecation';
    if (!_tmuxDeprecationWarned.has(warnKey)) {
      _tmuxDeprecationWarned.add(warnKey);
      console.warn(
        '[deckent] DEPRECATION: spawn_backend="tmux" is deprecated and will be removed in Sprint 178. ' +
        'Migrate to spawn_backend="docker" (recommended) or spawn_backend="subprocess" (Windows fallback). ' +
        'See docs/guide/troubleshooting.md for migration instructions.',
      );
    }
  }

  return backend;
}

// ─── SpawnBackendFactory ──────────────────────────────────────────────────────

export type BackendType = 'tmux' | 'subprocess' | 'docker' | 'auto' | 'sandbox';

export interface SpawnBackendFactoryOptions {
  /**
   * Backend type to use.
   * - 'docker': isolated Docker containers (recommended)
   * - 'tmux': tmux windows (legacy, DEPRECATED — will be removed Sprint 178)
   * - 'subprocess': child processes (Windows fallback)
   * - 'auto' (default): resolves to 'docker' (Sprint 177 — changed from tmux fallback)
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

  /**
   * Per-worker Docker memory limit (docker `--memory`), e.g. "2g". Sprint 318
   * (B-WORKERMEM): wired from config.worker_memory_limit. Undefined → the backend
   * default DEFAULT_WORKER_MEMORY_LIMIT ('4g').
   */
  dockerMemoryLimit?: string;

  /**
   * Sandbox backend options (memory limit, allowed dirs, network block).
   * Only consulted when backend is 'sandbox'.
   */
  sandboxOptions?: SandboxOptions;
}

/**
 * SpawnBackendFactory — selects and creates the appropriate SpawnBackend.
 *
 * Selection logic (Sprint 177 — updated):
 * 1. resolveBackend() is called first: 'auto' → 'docker'; 'tmux' → deprecation warning.
 * 2. Resolved type maps directly to the corresponding backend class.
 *    No more auto→tmux→subprocess chain (Sprint 176 root cause eliminated).
 */
export class SpawnBackendFactory {
  /**
   * Create a SpawnBackend based on the given options.
   *
   * @param opts  Factory options including backend preference and projectDir
   * @returns     A SpawnBackend instance ready to use
   */
  static create(opts: SpawnBackendFactoryOptions): SpawnBackend {
    const resolved = resolveBackend(opts.backend ?? 'auto');

    if (resolved === 'docker') {
      return new DockerSpawnBackend(opts.projectDir, {
        image: opts.dockerImage,
        timeoutSeconds: opts.dockerTimeoutSeconds
          ?? (opts.defaultTimeoutMs ? Math.floor(opts.defaultTimeoutMs / 1000) : undefined),
        gracefulTimeoutSeconds: opts.dockerGracefulTimeoutSeconds,
        memoryLimit: opts.dockerMemoryLimit, // B-WORKERMEM (Sprint 318): config-driven --memory
      });
    }

    if (resolved === 'subprocess') {
      return new SubprocessBackend(opts.projectDir, {
        timeoutMs: opts.defaultTimeoutMs,
      });
    }

    if (resolved === 'tmux') {
      return new TmuxBackend(opts.projectDir);
    }

    if (resolved === 'sandbox') {
      return new SandboxBackend(opts.projectDir, opts.sandboxOptions);
    }

    // Fallback — should not be reached after resolveBackend() normalisation
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
