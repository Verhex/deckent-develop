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
import {
  assertLiveUsageBudgetSupport,
  type ExecutionLandingCapability,
  type LiveUsageBudgetSupport,
} from '../core/live-execution-budget.js';
import { resolveHostExecutionBudget } from './runtime-budget-monitor.js';
import type { TaskResultSettlementRefV1 } from '../core/task-result-settlement.js';
import type { ExecutionLandingContextEnvelopeV1 } from '../core/execution-landing-context.js';
import { authHealthCheck } from '../agents/worker.js';

export type { SandboxOptions };
export { SandboxSpawnBackend };

/**
 * Host-only result projection requested by a protocol-aware caller.
 *
 * This is a closed, versioned contract rather than an arbitrary callback: the
 * backend may project only a terminal xverify verdict that it observed in the
 * provider's assistant output before immutable result settlement.
 */
export interface HostTerminalResultContractV1 {
  version: 1;
  kind: 'terminal-verdict';
  protocol: 'xverify-v1';
}

export interface SpawnBackendRecoveryReport {
  adopted: string[];
  closedNotDispatched: string[];
  closedAbsentAfterExit: string[];
  retiredLanded: string[];
  resumedContinuations: string[];
}

export interface SpawnBackendRecoveryOptions {
  /**
   * `resume` restores interrupted execution where safe. `contain` is used by
   * destructive shutdown surfaces and must never dispatch replacement work.
   */
  mode?: 'resume' | 'contain' | 'terminal-only';
}

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
  readonly liveUsageBudgetSupport?: LiveUsageBudgetSupport;
  readonly executionLandingCapability?: ExecutionLandingCapability;

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
   * Classify this coordinator's authority over a task's worker inventory.
   * Process-local backends return `unknown` for task ids they have never
   * observed, which prevents a freshly restarted coordinator from treating an
   * empty in-memory registry as proof that a live child vanished.
   */
  workerInventoryState?(taskId: string): 'active' | 'absent' | 'unknown';

  /**
   * Check whether this backend is available in the current environment.
   * For TmuxBackend: checks if tmux is installed.
   * For SubprocessBackend: always true (requires only Node.js).
   */
  isAvailable(): Promise<boolean>;

  /**
   * Reconcile durable pre-crash attempts after the coordinator holds project
   * leadership and before checkpoint state is interpreted. Backends without a
   * host-owned attempt journal omit this method.
   */
  reconcilePendingAttempts?(
    options?: SpawnBackendRecoveryOptions,
  ): Promise<SpawnBackendRecoveryReport>;
}

// ─── SpawnBackendOptions ──────────────────────────────────────────────────────

export interface SpawnBackendOptions extends ProviderSpawnOptions {
  /** Override project directory for this spawn */
  projectDir?: string;
  /** Tools the worker is allowed to use */
  allowedTools?: string;
  /**
   * Provider-visible built-in tool schema for a finite protocol worker.
   * Unlike `allowedTools`, this removes unused tool definitions from model
   * context. Currently consumed only by provider specs that declare support.
   */
  availableTools?: string;
  /**
   * Run with the provider's isolated finite-context flags. This is opt-in and
   * protocol-scoped; ordinary implementation workers keep their existing
   * project instructions, hooks, plugins, and session behavior.
   */
  isolatedContext?: boolean;
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
  /** Exact host-owned attempt authority for Docker result finalization. */
  settlementRef?: TaskResultSettlementRefV1;
  /** Host-owned pre-mount landing context; Docker-only and never worker-authored. */
  executionLandingContext?: ExecutionLandingContextEnvelopeV1;
  /** Optional protocol-specific host projection applied before settlement. */
  hostTerminalResultContract?: HostTerminalResultContractV1;
  /**
   * Owner authorization to run a final-only-usage provider (no incremental
   * measured stream) under host wall-clock containment. Absent = fail closed:
   * a live token ceiling is refused rather than silently unenforced.
   */
  finalOnlyUsageContainment?: {
    readonly maxWallClockSeconds: number;
    readonly profileRef: string;
    readonly policyDigest: string;
  };
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

export function preflightClaudeAuthForLocalBackend(
  projectDir: string,
  taskId: string,
  provider: string | undefined,
  opts?: SpawnBackendOptions,
): boolean {
  if (provider !== 'claude') return true;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(opts?.env ?? {}),
    CLAUDE_AUTH_REQUIRED: '1',
  };
  if (!opts?.env?.['ANTHROPIC_API_KEY']) {
    delete env.ANTHROPIC_API_KEY;
    delete env.DECKENT_CLAUDE_API_KEY;
  }
  return authHealthCheck(projectDir, taskId, undefined, env).ok;
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
  readonly liveUsageBudgetSupport = undefined;

  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    checkLethalGuard(opts?.actionId, this.name);
    const dir = opts?.projectDir ?? this.projectDir;
    const executionBudget = resolveHostExecutionBudget(dir, taskId, opts?.executionBudget);
    assertLiveUsageBudgetSupport(executionBudget, this.liveUsageBudgetSupport, this.name);
    // Sprint 168 C0e Cross-Backend Contract: tmpfiles persist until sprint cleanup,
    // archived together by archivePromptFiles() during sprint cleanup phase.
    // (Same as Docker backend spawn-backend-docker.ts:941-942 — Sprint 156 Task 4.)
    // Sprint 170 P0-3: tmux worker prompt files embed taskId
    // (`.prompt-{taskId}-{hash}.txt`, see tmux.ts writePromptFile), so the
    // active-worker selective filter in claude.ts._cleanupOrphanedPromptFiles
    // DOES protect them. Only the taskId-less Auditor prompt keeps the legacy
    // hex-only name — see ADR-048 Consequences (Negative) for the history.
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
  readonly liveUsageBudgetSupport = undefined;

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
  /** Per-task timeout backends are not provider-cached; retain their inventory authority. */
  private readonly taskBackends = new Map<string, SubprocessSpawnBackend>();
  private readonly observedTaskIds = new Set<string>();

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
    const modelDefinition = modelRegistry.get(model);
    if (!modelDefinition) {
      throw new SpawnBackendError(
        `Subprocess backend cannot resolve a provider for unregistered model "${model}". `
        + 'Register the canonical API model identity with its explicit provider before dispatch.',
        'subprocess',
      );
    }
    const provider = modelDefinition.provider;
    const dir = opts?.projectDir ?? this.projectDir;
    if (!preflightClaudeAuthForLocalBackend(dir, taskId, provider, opts)) return;
    const timeoutOverrideMs = opts?.taskTimeoutSeconds != null
      ? opts.taskTimeoutSeconds * 1000
      : undefined;
    const taskBackend = this.getBackendForProvider(provider, timeoutOverrideMs);
    taskBackend.spawn(taskId, model, prompt, opts);
    this.taskBackends.set(taskId, taskBackend);
    this.observedTaskIds.add(taskId);
  }

  kill(taskId: string): void {
    const taskBackend = this.taskBackends.get(taskId);
    if (taskBackend?.listWorkers().includes(taskId)) {
      taskBackend.kill(taskId);
      this.taskBackends.delete(taskId);
      return;
    }
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
    const backends = new Set([
      ...this.backendsByProvider.values(),
      ...this.taskBackends.values(),
    ]);
    const active = new Set(Array.from(backends).flatMap(b => b.listWorkers() as string[]));
    for (const taskId of this.taskBackends.keys()) {
      if (!active.has(taskId)) this.taskBackends.delete(taskId);
    }
    return [...active];
  }

  workerInventoryState(taskId: string): 'active' | 'absent' | 'unknown' {
    if (this.list().includes(taskId)) return 'active';
    return this.observedTaskIds.has(taskId) ? 'absent' : 'unknown';
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
  readonly liveUsageBudgetSupport = undefined;

  private readonly projectDir: string;
  private readonly inner: SandboxSpawnBackend;
  private readonly observedTaskIds = new Set<string>();

  constructor(projectDir: string, opts?: SandboxOptions) {
    this.projectDir = projectDir;
    this.inner = new SandboxSpawnBackend(projectDir, opts);
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    checkLethalGuard(opts?.actionId, this.name);
    const dir = opts?.projectDir ?? this.projectDir;
    const provider = modelRegistry.get(model)?.provider;
    if (!preflightClaudeAuthForLocalBackend(dir, taskId, provider, opts)) return;
    this.inner.spawn(taskId, model, prompt, opts);
    this.observedTaskIds.add(taskId);
  }

  kill(taskId: string): void {
    this.inner.kill(taskId);
  }

  list(): string[] {
    return this.inner.listWorkers() as string[];
  }

  workerInventoryState(taskId: string): 'active' | 'absent' | 'unknown' {
    if (this.list().includes(taskId)) return 'active';
    return this.observedTaskIds.has(taskId) ? 'absent' : 'unknown';
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
   * Per-worker Docker swap ceiling (docker `--memory-swap`). Wired from
   * `config.worker_memory_swap`. Undefined → the backend derives it from the
   * memory limit at × 1.5, the documented ratio. Must never be below the limit.
   */
  dockerMemorySwap?: string;

  /**
   * Opt-in per-TaskKind Docker memory limits, wired from
   * `config.worker_memory_limit_by_kind`. Swap for a kind is auto-derived at
   * limit × 1.5. Undefined/empty → every kind uses the default limit.
   */
  dockerKindMemoryLimits?: Record<string, string>;

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
        // MASTER-PLAN 666: both were previously unreachable from config — swap
        // fell back to a fixed constant and per-kind limits were never passed.
        memorySwap: opts.dockerMemorySwap,
        kindMemoryLimits: opts.dockerKindMemoryLimits,
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
