import {
  spawn,
  type ChildProcess,
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
import type { ModelType } from '../core/types.js';
import { CLAUDE_MODELS } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../core/provider.js';
import { ProviderError, buildCliInvocation } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';
import { modelRegistry } from '../core/model-registry.js';
import { resolveReasoningEffort } from '../core/reasoning-effort.js';

// ─── SubprocessProviderConfig ───────────────────────────────────────
/**
 * Configuration for a CLI-based provider used by SubprocessSpawnBackend.
 * Allows decoupling from any specific CLI tool (e.g. claude, codex).
 */
export interface SubprocessProviderConfig {
  /** CLI executable name (e.g. 'claude', 'codex') */
  readonly cliCommand: string;
  /** Human-readable name for this subprocess backend */
  readonly name: string;
  /** Models this provider supports */
  readonly supportedModels: readonly ModelType[];
  /**
   * Build CLI arguments for spawning a worker.
   * @param model   The model to use
   * @param opts    Spawn options (allowedTools, autoApprove)
   * @returns Array of CLI arguments
   */
  buildArgs(model: ModelType, opts?: ProviderSpawnOptions): string[];
  /**
   * Build the full shell command string for dry-run / display.
   * @param model       The model to use
   * @param promptPath  Path to the prompt file (stdin redirection)
   * @param opts        Spawn options
   * @returns Shell command string
   */
  buildCommandString(model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove' | 'reasoningEffort'>): string;
  /**
   * Extra CLI args appended at SPAWN time so the provider emits a per-run usage
   * envelope on stdout — captured into `.tasks/task-{id}.log` so the orchestrator's
   * `adapter.extractUsage` can pull REAL token counts (Worker Output Contract,
   * Class-A CLI-agents). Kept out of {@link buildArgs}/{@link buildCommandString}
   * deliberately: the structured-output flag affects only the live spawn, never the
   * unit-tested arg-shape nor the dry-run display string. For Claude this is
   * `['--output-format', 'json']` (proof-of-function verified the agent tool-loop —
   * and its `.result` write — is unaffected by json output). Omitted (undefined) →
   * the provider emits no usage envelope and extraction falls back to estimation.
   */
  readonly usageEmitArgs?: readonly string[];
}

/**
 * Default provider config for Claude CLI. Used when no config is provided.
 */
export const CLAUDE_SUBPROCESS_CONFIG: SubprocessProviderConfig = {
  cliCommand: 'claude',
  name: 'claude-subprocess',
  supportedModels: [...CLAUDE_MODELS],
  buildArgs(model: ModelType, opts?: ProviderSpawnOptions): string[] {
    // Sprint 237: real model name (apiId, e.g. claude-opus-4-8), not alias.
    const args = ['-p', '-', '--model', modelRegistry.get(model)?.apiId ?? model];
    if (opts?.allowedTools) {
      args.push('--allowedTools', opts.allowedTools);
    }
    if (opts?.autoApprove) {
      args.push('--dangerously-skip-permissions');
    }
    // F1-RE: native reasoning-effort flag, opt-in + validated against claude vocabulary.
    const effort = resolveReasoningEffort('claude', opts?.reasoningEffort);
    if (effort) {
      args.push('--effort', effort);
    }
    return args;
  },
  buildCommandString(model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove' | 'reasoningEffort'>): string {
    let cmd = `claude -p - --model ${modelRegistry.get(model)?.apiId ?? model}`;
    if (opts?.allowedTools) {
      cmd += ` --allowedTools '${opts.allowedTools}'`;
    }
    if (opts?.autoApprove) {
      cmd += ' --dangerously-skip-permissions';
    }
    const effort = resolveReasoningEffort('claude', opts?.reasoningEffort);
    if (effort) {
      cmd += ` --effort ${effort}`;
    }
    cmd += ` < ${promptPath}`;
    return cmd;
  },
  // Worker Output Contract (Class-A): make the Claude CLI emit a per-run usage
  // envelope (`{type:"result", usage:{input_tokens,output_tokens,
  // cache_read_input_tokens,cache_creation_input_tokens}}`) on stdout so
  // ClaudeAdapter.extractUsage can capture real token counts from the worker log.
  usageEmitArgs: ['--output-format', 'json'],
};

// ─── Cross-provider credential keys (F1-014 NON-LEAK scrub set) ───────
/**
 * Every provider credential env var deckent may place on the host `process.env`.
 * This is the SCRUB set for the subprocess child env: the child starts from the
 * host env with ALL of these removed, then ONLY the worker's own provider
 * credential is re-injected via `opts.env` (the override map from
 * `applyDeckSecretsToEnv`). Without this scrub the child would inherit the FULL
 * host env and leak EVERY provider's key into EVERY worker — including handing a
 * subscription claude worker an `ANTHROPIC_API_KEY` (the claude CLI prefers the
 * env key over the `~/.claude` session → silent API-mode demotion → Tier-1
 * timeout → the mass-synthetic-NO_GO that killed Sprint 213; ADR-076, F1-014).
 *
 * Source-of-truth is the provider→key mapping in `core/provider.ts`
 * `applyDeckSecretsToEnv` (claude→ANTHROPIC_API_KEY, codex→OPENAI_API_KEY,
 * gemini→GOOGLE_API_KEY, deepseek→DEEPSEEK_API_KEY, qwen→DASHSCOPE_API_KEY,
 * zhipu→ZHIPU_API_KEY). The docker backend (`spawn-backend-docker.ts`) keeps a
 * parallel per-provider FORWARD allowlist; the two are intentionally aligned —
 * each provider's credential is forwarded to ITS worker only, never cross-leaked.
 *
 * TODO(phase2): unify this scrub-set with the docker forward-allowlist behind a
 * single exported provider→credential-env map in `core/` (e.g. a field on
 * `ProviderCommandSpec`) so a new provider's credential is registered in exactly
 * one place. Config-driven providers (F1-012) with arbitrary `apiKeyEnv` are not
 * covered by this static set and would need that unified map to be fully scrubbed.
 */
const CROSS_PROVIDER_CREDENTIAL_KEYS: readonly string[] = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'ZHIPU_API_KEY',
];

// ─── SubprocessWorkerEntry ────────────────────────────────────────────
interface SubprocessWorkerEntry {
  taskId: string;
  process: ChildProcess;
  logPath: string;
  spawnedAt: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ─── SubprocessSpawnBackend ───────────────────────────────────────────
/**
 * SubprocessSpawnBackend — runs workers as child_process.spawn instances
 * without requiring tmux. Each worker runs in an isolated child process with
 * stdout/stderr redirected to a log file at .tasks/task-{id}.log.
 *
 * This backend is the foundation for Windows (non-WSL2) support.
 */
export class SubprocessSpawnBackend implements ProviderAdapter {
  readonly name: string;
  readonly supportedModels: readonly ModelType[];

  private readonly projectDir: string;
  private readonly workers = new Map<string, SubprocessWorkerEntry>();
  private readonly providerConfig: SubprocessProviderConfig;
  /** Host platform — injectable so cross-platform branches are testable without a real spawn. */
  private readonly platform: NodeJS.Platform;
  /** Spawn impl — injectable so tests never launch a real process. */
  private readonly spawnImpl: typeof spawn;

  /** Default timeout in ms before a worker is killed automatically (0 = no timeout) */
  protected defaultTimeoutMs: number;

  constructor(
    projectDir: string,
    opts?: {
      defaultTimeoutMs?: number;
      providerConfig?: SubprocessProviderConfig;
      /** Override host platform (DEP0190 cross-platform seam; defaults to `process.platform`). */
      platform?: NodeJS.Platform;
      /** Override the spawn impl (test hermeticity; defaults to `node:child_process` `spawn`). */
      spawnImpl?: typeof spawn;
    },
  ) {
    this.projectDir = projectDir;
    this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 0;
    this.providerConfig = opts?.providerConfig ?? CLAUDE_SUBPROCESS_CONFIG;
    this.platform = opts?.platform ?? process.platform;
    this.spawnImpl = opts?.spawnImpl ?? spawn;
    this.name = this.providerConfig.name;
    this.supportedModels = this.providerConfig.supportedModels;
  }

  // ─── spawn() ───────────────────────────────────────────────────────

  spawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts?: ProviderSpawnOptions,
  ): void {
    if (this.workers.has(taskId)) {
      throw new ProviderError(
        `Worker for task "${taskId}" is already running`,
        this.name,
      );
    }

    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    ensureDir(tasksDir);

    const logPath = join(tasksDir, `task-${taskId}.log`);
    const logFd = openSync(logPath, 'a');

    // Worker Output Contract: append the provider's usage-emit flag(s) at spawn
    // time only (NOT inside buildArgs) so the per-run usage envelope lands in the
    // worker log for adapter.extractUsage, while the dry-run/display path and the
    // unit-tested buildArgs shape stay byte-stable. Configs without usageEmitArgs
    // (custom/codex) spawn exactly as before.
    const baseArgs = this.providerConfig.buildArgs(model, opts);
    const args = this.providerConfig.usageEmitArgs
      ? [...baseArgs, ...this.providerConfig.usageEmitArgs]
      : baseArgs;
    // SPAWN-1 (DEP0190 + ADR-006): cross-platform shell-free invocation. On win32 this
    // routes through `cmd.exe /c <cli> <args…>` (shell:false) so the .cmd/.ps1 wrapper is
    // resolved via PATHEXT while args stay a discrete escaped array — never shell:true+array.
    const inv = buildCliInvocation(this.providerConfig.cliCommand, args, this.platform);
    // F1-014 (Sprint 333) — per-worker auth NON-LEAK for the subprocess backend.
    // Mirror the docker backend's runtime per-provider allowlist as a SCRUB+inject:
    //   1. base = host process.env (carries PATH/HOME/LANG/… non-secret vars),
    //   2. SCRUB every provider credential key (CROSS_PROVIDER_CREDENTIAL_KEYS) so a
    //      mixed-provider fleet never leaks a foreign key into this worker — and a
    //      subscription claude worker never inherits ANTHROPIC_API_KEY (ADR-076),
    //   3. re-inject ONLY this worker's own credential via opts.env (the per-provider
    //      override map from applyDeckSecretsToEnv; empty in subscription mode → the
    //      worker gets NO key and authenticates via the CLI's session instead).
    // opts.env is the single source of truth for credentials; host env keys are never
    // trusted. A no-secret / single-provider spawn keeps PATH/LANG byte-for-byte and
    // simply carries no provider key. Pure JS map-ops — identical on every platform.
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    for (const key of CROSS_PROVIDER_CREDENTIAL_KEYS) {
      delete childEnv[key];
    }
    if (opts?.env) {
      Object.assign(childEnv, opts.env);
    }
    // BUG-19: Set UTF-8 encoding environment for Windows (forced last, unchanged).
    childEnv['LANG'] = process.env['LANG'] ?? 'en_US.UTF-8';
    childEnv['PYTHONIOENCODING'] = 'utf-8';
    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['pipe', logFd, logFd],
      env: childEnv,
      shell: inv.shell,
    };

    const child = this.spawnImpl(inv.command, inv.args, spawnOpts);
    // BUG-26: DON'T close logFd here — keep open until child exits
    // On Windows the cmd.exe wrapper child inherits the FD; closing it before inherit causes empty logs

    // Write initial heartbeat
    this.writeHeartbeat(taskId, dir, 'EXECUTING', 0);

    // BUG-23: Periodic heartbeat update (every 15 seconds)
    let hbSequence = 0;
    const hbInterval = setInterval(() => {
      hbSequence++;
      this.writeHeartbeat(taskId, dir, 'EXECUTING', hbSequence);
    }, 15_000);

    const entry: SubprocessWorkerEntry = {
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

    // Send prompt via stdin
    if (child.stdin) {
      child.stdin.write(prompt, 'utf-8');
      child.stdin.end();
    }

    // Cleanup on exit
    child.once('exit', (code) => {
      // Stop periodic heartbeat
      clearInterval(hbInterval);

      // BUG-26: Close log file descriptor now that child is done
      try { closeSync(logFd); } catch { /* already closed */ }

      // BUG-24: Write fallback result if worker didn't create one
      const resultPath = join(dir, TASKS_DIR, `task-${taskId}.result`);
      if (!existsSync(resultPath)) {
        try {
          const fallback = {
            taskId,
            filesChanged: [] as string[],
            linesAdded: 0,
            linesRemoved: 0,
            testsPassed: code === 0,
            selfAssessment: code === 0 ? 'GO_WITH_TECH_DEBT' : 'NO_GO',
            notes: `Subprocess worker exited with code ${code ?? 'unknown'}. No explicit result file written by worker.`,
          };
          writeFileSync(resultPath, JSON.stringify(fallback, null, 2), 'utf-8');
        } catch { /* non-fatal */ }
      }

      // Write final heartbeat with DONE status
      this.writeHeartbeat(taskId, dir, code === 0 ? 'DONE' : 'FAILED', hbSequence + 1);

      const w = this.workers.get(taskId);
      if (w?.timeoutHandle) clearTimeout(w.timeoutHandle);
      this.workers.delete(taskId);
    });
  }

  // ─── kill() ────────────────────────────────────────────────────────

  kill(taskId: string): void {
    this.killWithSignal(taskId, 'SIGTERM');
  }

  // ─── listWorkers() ─────────────────────────────────────────────────

  listWorkers(): string[] {
    return Array.from(this.workers.keys());
  }

  // ─── isAvailable() ─────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      // SPAWN-1: shell-free cross-platform probe (see spawn() — win32 → cmd.exe /c wrapper).
      const inv = buildCliInvocation(this.providerConfig.cliCommand, ['--version'], this.platform);
      const child = this.spawnImpl(inv.command, inv.args, {
        stdio: 'pipe',
        timeout: 5_000,
        shell: inv.shell,
      });
      child.once('exit', (code) => resolve(code === 0));
      child.once('error', () => resolve(false));
    });
  }

  // ─── buildCommand() ────────────────────────────────────────────────

  buildCommand(
    model: ModelType,
    promptPath: string,
    opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>,
  ): string {
    return this.providerConfig.buildCommandString(model, promptPath, opts);
  }

  // ─── Internal helpers ──────────────────────────────────────────────

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

  // ─── Heartbeat ─────────────────────────────────────────────────────

  protected writeHeartbeat(taskId: string, dir: string, status: string, sequence = 0): void {
    const hbPath = join(dir, TASKS_DIR, `task-${taskId}.hb`);
    const hb = {
      workerId: `subprocess-${taskId}`,
      taskId,
      status,
      currentAction: status === 'DONE' ? 'Task completed' : status === 'FAILED' ? 'Task failed' : 'Subprocess worker running',
      timestamp: new Date().toISOString(),
      filesChangedCount: 0,
      sequence,
    };
    try {
      writeFileSync(hbPath, JSON.stringify(hb, null, 2), 'utf-8');
    } catch {
      // Non-fatal: heartbeat write failure should not stop the worker
    }
  }

  // ─── Accessors (for testing/subclassing) ───────────────────────────

  getWorkerEntry(taskId: string): SubprocessWorkerEntry | undefined {
    return this.workers.get(taskId);
  }

  getLogPath(taskId: string): string {
    return join(this.projectDir, TASKS_DIR, `task-${taskId}.log`);
  }

  getProjectDir(): string {
    return this.projectDir;
  }

  getProviderConfig(): SubprocessProviderConfig {
    return this.providerConfig;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createSubprocessBackend(
  projectDir: string,
  opts?: { defaultTimeoutMs?: number; providerConfig?: SubprocessProviderConfig },
): SubprocessSpawnBackend {
  return new SubprocessSpawnBackend(projectDir, opts);
}
