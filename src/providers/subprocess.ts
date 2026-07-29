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
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import type { ModelType } from '../core/types.js';
import { CLAUDE_MODELS } from '../core/types.js';
import type { ProviderAdapter, ProviderSpawnOptions } from '../core/provider.js';
import { ProviderError, buildCliInvocation } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';
import { modelRegistry } from '../core/model-registry.js';
import { resolveReasoningEffort } from '../core/reasoning-effort.js';
import { debugLog } from '../core/utils.js';
import { normalizeStreamEvent } from '../core/log-event.js';
import {
  assertLiveUsageBudgetSupport,
  hasLiveUsageCeiling,
  type LiveUsageBudgetSupport,
} from '../core/live-execution-budget.js';
import { makeActivityOnEvent } from '../agents/worker-activity.js';
import type { ProviderDefinition } from '../core/config-types.js';
import type { DeckBrokerDenial } from '../core/deck-broker.js';
import { resolveCrossProviderCredentialKeys } from './cross-provider-keys.js';
import { scrubCrossProviderEnv } from './provider.js';
import {
  installGitGuard,
  resolveHostGitPath,
  prependGitGuardToPath,
  isGitGuardSupportedPlatform,
  buildGitGuardDir,
} from '../orchestra/git-worker-guard.js';
import { createRuntimeBudgetMonitor, resolveHostExecutionBudget } from '../orchestra/runtime-budget-monitor.js';
import {
  killProcessGroupWithEscalation,
} from '../core/process-tree-termination.js';

// Compatibility exports: provider adapters and public imports keep one stable
// surface while the platform-neutral primitive lives in core.
export {
  killProcessGroupWithEscalation,
  signalProcessGroup,
  SIGKILL_ESCALATION_MS,
} from '../core/process-tree-termination.js';

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
  buildCommandString(model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove' | 'reasoningEffort' | 'excludeDynamicPromptSections'>): string;
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
  /**
   * SURF-3 S2 — args that make this CLI emit a per-tool STREAM (NDJSON, one
   * event per line) instead of the single `usageEmitArgs` envelope, so the
   * subprocess backend can tap live tool-by-tool activity. Used ONLY when
   * `live_trace.enabled` is on (else `usageEmitArgs` keeps today's byte-stable
   * single-envelope path). Claude: `['--output-format','stream-json','--verbose']`
   * (the `result` line still carries usage — extractUsage scans lines, unchanged).
   * Omitted → this provider has no live-stream mode (no behavior change).
   */
  readonly liveStreamArgs?: readonly string[];
  /**
   * Live budget evidence is authoritative only when the worker cannot mutate
   * the host ledger. Same-user production subprocesses must leave this unset;
   * Docker owns the trusted production path. Test harnesses may opt in with an
   * isolated fake child to exercise the stream monitor itself.
   */
  readonly liveBudgetEvidenceTrust?: 'host-isolated';
  /**
   * Canonical cost classification for this adapter. Omitted means remote.
   * Local test/CLI adapters may declare local explicitly; callers cannot
   * downgrade a remote adapter through per-spawn options.
   */
  readonly executionCostClass?: 'remote' | 'local';
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
    // F3.1: prefix-stable system prompt (per-machine sections → first user message)
    // for cache reuse. Default system prompt only — this backend never passes
    // --system-prompt, so the flag always applies.
    if (opts?.excludeDynamicPromptSections) {
      args.push('--exclude-dynamic-system-prompt-sections');
    }
    return args;
  },
  buildCommandString(model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove' | 'reasoningEffort' | 'excludeDynamicPromptSections'>): string {
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
    // F3.1: prefix-stable system prompt (per-machine sections → first user message).
    if (opts?.excludeDynamicPromptSections) {
      cmd += ' --exclude-dynamic-system-prompt-sections';
    }
    cmd += ` < ${promptPath}`;
    return cmd;
  },
  // Worker Output Contract (Class-A): make the Claude CLI emit a per-run usage
  // envelope (`{type:"result", usage:{input_tokens,output_tokens,
  // cache_read_input_tokens,cache_creation_input_tokens}}`) on stdout so
  // ClaudeAdapter.extractUsage can capture real token counts from the worker log.
  usageEmitArgs: ['--output-format', 'json'],
  // SURF-3 S2 — stream-json + --verbose for live tool-by-tool activity (only
  // when live_trace.enabled). The final `result` line still carries usage.
  liveStreamArgs: ['--output-format', 'stream-json', '--verbose'],
};

// ─── SubprocessWorkerEntry ────────────────────────────────────────────
interface SubprocessWorkerEntry {
  taskId: string;
  process: ChildProcess;
  logPath: string;
  spawnedAt: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  /**
   * MOAT-2 (ADR-G-013): the 15s coordinator-side heartbeat interval. Stored on
   * the entry so {@link SubprocessSpawnBackend.killWithSignal} can clear it
   * deterministically at reap time instead of waiting for the child's (possibly
   * slow) `exit` event to fire the closure-scoped clear.
   */
  hbInterval?: ReturnType<typeof setInterval>;
  /**
   * 458-002 (A4): the typed DeckBroker denial that made this spawn fail closed —
   * present ONLY when a broker was supplied AND refused this task's credential.
   * Absent both when no broker was passed and when the resolve was granted, so
   * `undefined` never means "denied for an unknown reason". Lives on the worker
   * entry (not a side map) so it shares the entry's lifecycle and cannot leak.
   */
  deckBrokerDenial?: DeckBrokerDenial;
  /**
   * 459-002 (A5): present ONLY when NO broker was supplied at all
   * (`opts.deckBroker` undefined) — the pre-458-002 legacy `opts.env`
   * passthrough branch. Mutually exclusive with {@link deckBrokerDenial}: a
   * spawn is either "broker never given" (this flag) or "broker given and
   * rejected" ({@link deckBrokerDenial}), never both, so the two are always
   * separately observable via their own accessor.
   */
  deckBrokerLegacy?: true;
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
  get liveUsageBudgetSupport(): LiveUsageBudgetSupport | undefined {
    return this.providerConfig.liveStreamArgs
      && this.providerConfig.liveBudgetEvidenceTrust === 'host-isolated'
      ? 'measured-stream'
      : undefined;
  }

  private readonly projectDir: string;
  private readonly workers = new Map<string, SubprocessWorkerEntry>();
  private readonly providerConfig: SubprocessProviderConfig;
  /** Host platform — injectable so cross-platform branches are testable without a real spawn. */
  private readonly platform: NodeJS.Platform;
  /** Spawn impl — injectable so tests never launch a real process. */
  private readonly spawnImpl: typeof spawn;
  /**
   * F1-014 phase-2: the cross-provider credential SCRUB set for this backend —
   * the static base set ∪ any config-declared provider's `apiKeyEnv` (F1-012
   * registry). Resolved once at construction from the shared single-source-of-
   * truth resolver; absent registry → byte-for-byte the static base set.
   */
  private readonly crossProviderCredentialKeys: readonly string[];

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
      /**
       * F1-012 config-driven provider registry (`config.providers?.registry`).
       * When supplied, each declared provider's `apiKeyEnv` joins the scrub set
       * so a custom `openai-compatible` provider's credential is never leaked
       * cross-provider into a foreign worker (F1-014 phase-2). Absent → the
       * static base scrub behaviour is unchanged.
       */
      providerRegistry?: readonly ProviderDefinition[];
    },
  ) {
    this.projectDir = projectDir;
    this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 0;
    this.providerConfig = opts?.providerConfig ?? CLAUDE_SUBPROCESS_CONFIG;
    this.platform = opts?.platform ?? process.platform;
    this.spawnImpl = opts?.spawnImpl ?? spawn;
    this.crossProviderCredentialKeys = resolveCrossProviderCredentialKeys(
      opts?.providerRegistry ? { registry: opts.providerRegistry } : undefined,
    );
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
    const executionBudget = resolveHostExecutionBudget(dir, taskId, opts?.executionBudget);
    assertLiveUsageBudgetSupport(
      executionBudget,
      this.liveUsageBudgetSupport,
      this.name,
      this.providerConfig.executionCostClass ?? 'remote',
    );

    // Worker Output Contract: append the provider's usage-emit flag(s) at spawn
    // time only (NOT inside buildArgs) so the per-run usage envelope lands in the
    // worker log for adapter.extractUsage, while the dry-run/display path and the
    // unit-tested buildArgs shape stay byte-stable. Configs without usageEmitArgs
    // (custom/codex) spawn exactly as before.
    const baseArgs = this.providerConfig.buildArgs(model, opts);
    // SURF-3 S2 — live tool-by-tool activity (flag-gated). When on AND this
    // provider declares `liveStreamArgs`, swap the single-envelope usage args for
    // the stream-json args so stdout carries per-tool events; else byte-stable.
    const budgetMonitoring = hasLiveUsageCeiling(executionBudget);
    const logPath = join(tasksDir, `task-${taskId}.log`);
    const logFd = openSync(logPath, 'a');
    const liveActivity = opts?.liveTraceEnabled === true && this.providerConfig.liveStreamArgs !== undefined;
    const streamCapture = liveActivity || budgetMonitoring;
    const emitArgs = streamCapture ? this.providerConfig.liveStreamArgs : this.providerConfig.usageEmitArgs;
    const args = emitArgs
      ? [...baseArgs, ...emitArgs]
      : baseArgs;
    // SPAWN-1 (DEP0190 + ADR-006): cross-platform shell-free invocation. On win32 this
    // routes through `cmd.exe /c <cli> <args…>` (shell:false) so the .cmd/.ps1 wrapper is
    // resolved via PATHEXT while args stay a discrete escaped array — never shell:true+array.
    const inv = buildCliInvocation(this.providerConfig.cliCommand, args, this.platform);
    // F1-014 (Sprint 333) — per-worker auth NON-LEAK for the subprocess backend.
    // Mirror the docker backend's runtime per-provider allowlist as a SCRUB+inject:
    //   1. base = host process.env (carries PATH/HOME/LANG/… non-secret vars),
    //   2. SCRUB every provider credential key (this.crossProviderCredentialKeys —
    //      the shared static base set ∪ any F1-012 config provider's apiKeyEnv) so a
    //      mixed-provider fleet never leaks a foreign key into this worker — and a
    //      subscription claude worker never inherits ANTHROPIC_API_KEY (ADR-076),
    //   3. re-inject ONLY this worker's own credential via opts.env (the per-provider
    //      override map from applyDeckSecretsToEnv; empty in subscription mode → the
    //      worker gets NO key and authenticates via the CLI's session instead).
    // opts.env is the single source of truth for credentials; host env keys are never
    // trusted. A no-secret / single-provider spawn keeps PATH/LANG byte-for-byte and
    // simply carries no provider key. Pure JS map-ops — identical on every platform.
    // born-518: scrub extracted to the shared providers/provider.ts helper so
    // every adapter's spawn path can share one implementation instead of
    // re-deriving it — see that module's docstring for adoption status.
    const childEnv: NodeJS.ProcessEnv = scrubCrossProviderEnv(process.env, this.crossProviderCredentialKeys);
    // DECKBROKER-WIRE (354-006, flag-gated, ADR-G-005/G-017 row 422): when the
    // caller hands a DeckBroker (opts.deckBroker — minted by bootstrapProviders
    // only when config.deck_broker.enabled), resolve THIS task's own credential
    // through it instead of the opts.env passthrough below — task-scoped,
    // audited, TTL'd, and the .deck file path itself never reaches this worker.
    //
    // 458-002 (A4) — the broker is a SECURITY BOUNDARY, so its two negative
    // outcomes are no longer conflated (they were, while this call site consumed
    // the nullable `resolveForTask` compat shim and could not tell them apart):
    //   - broker ABSENT (opts.deckBroker undefined — the default, nothing
    //     upstream wires it yet) → the pre-existing scrub + opts.env reinject
    //     flow runs byte-for-byte unchanged.
    //   - broker PRESENT + DENIED (TTL expired, taskId already consumed, or no
    //     secret configured) → FAIL CLOSED: the legacy opts.env credential
    //     passthrough is NEVER taken, so this worker's child env carries no
    //     credential for this provider at all and the CLI must authenticate via
    //     its own session. Falling back here would let a revoked/consumed
    //     task-scoped handoff be silently re-granted from ambient state,
    //     defeating the broker's TTL + single-use guarantees.
    // A denial is still not an ERROR — spawn continues in a known, deterministic
    // state (no credential) rather than throwing mid-setup — but it is never
    // swallowed either: the typed reason is recorded on the worker entry for the
    // caller ({@link getDeckBrokerDenial}) and traced via debugLog.
    //
    // 459-002 (A5): the "broker never supplied" legacy branch below used to be
    // silent — same debugLog-free code as pre-458-002 — which conflated it with
    // "broker supplied and denied" for anyone tailing debugLog/ERRORS.md: both
    // looked identical (no signal at all vs. a denial signal only on the OTHER
    // branch). It now gets its own tag ({@link getDeckBrokerLegacy}, debugLog
    // 'subprocess:deckbroker-legacy') so the two negative-ish outcomes are each
    // independently observable. `brokered` is `undefined` iff `opts?.deckBroker`
    // was never supplied at all (resolveForTaskWithReason always returns a
    // `{state:'granted'|'denied'}` object when a broker IS supplied) — so this
    // is the precise "broker hiç verilmedi" condition, not merely "opts.env is
    // present". The env-mutation itself is UNCHANGED: it still only runs when
    // `opts.env` is truthy, byte-for-byte the same assignment as before.
    const brokered = opts?.deckBroker?.resolveForTaskWithReason(taskId, this.providerConfig.cliCommand);
    let deckBrokerDenial: DeckBrokerDenial | undefined;
    let deckBrokerLegacy: true | undefined;
    if (brokered?.state === 'granted') {
      Object.assign(childEnv, brokered.env);
    } else if (brokered?.state === 'denied') {
      deckBrokerDenial = brokered;
      debugLog(
        'subprocess:deckbroker-denied',
        `DeckBroker denied the credential for taskId=${taskId} provider="${this.providerConfig.cliCommand}" (reason=${brokered.reason}) — failing closed: no opts.env credential fallback, child spawns with no credential for this provider`,
      );
    } else {
      deckBrokerLegacy = true;
      debugLog(
        'subprocess:deckbroker-legacy',
        `No DeckBroker supplied for taskId=${taskId} provider="${this.providerConfig.cliCommand}" — legacy path: ${opts?.env ? 'reinjecting opts.env credential unchanged' : 'no opts.env credential to reinject'} (unrelated to a fail-closed denial)`,
      );
      if (opts?.env) {
        Object.assign(childEnv, opts.env);
      }
    }
    // BUG-19: Set UTF-8 encoding environment for Windows (forced last, unchanged).
    childEnv['LANG'] = process.env['LANG'] ?? 'en_US.UTF-8';
    childEnv['PYTHONIOENCODING'] = 'utf-8';
    // WORKER-GIT-GUARD (381-001): shadow `git` with a denylist shim so the
    // worker's own git invocations cannot run destructive subcommands
    // (stash/reset/checkout/clean/rebase/commit/revert). POSIX-only for now —
    // native Windows subprocess workers are an honest, logged gap (a POSIX
    // `sh` script named `git` is never resolved by Windows' PATHEXT lookup),
    // not a silently-broken shim (Law #2).
    //
    // The shim dir is deliberately OUTSIDE the project tree (buildGitGuardDir
    // — OS tmpdir, not `dir`/`tasksDir`): folding a project-relative path into
    // childEnv.PATH would put the project's absolute path verbatim into an
    // env var, breaking the DeckBroker non-leak invariant (DECKBROKER-WIRE,
    // 354-006 — ".deck project path never appears in the spawned child env").
    //
    // The PATH string is computed HERE (pure, no I/O) so the spawned child
    // sees it from its very first instruction. The shim FILE itself is
    // materialized further below, right after the initial heartbeat write —
    // deferring the write-to-disk keeps this git-guard I/O from becoming the
    // FIRST writeFileSync call of spawn() (the heartbeat write is). The gap
    // is a few synchronous statements, far shorter than the child's own CLI
    // startup time before it could ever invoke `git`.
    let gitGuardDir: string | undefined;
    if (isGitGuardSupportedPlatform(this.platform)) {
      gitGuardDir = buildGitGuardDir(taskId);
      childEnv['PATH'] = prependGitGuardToPath(gitGuardDir, childEnv['PATH']);
    } else {
      debugLog(
        'subprocess:git-guard-unsupported',
        `WORKER-GIT-GUARD skipped for taskId=${taskId} on platform "${this.platform}" (POSIX-only shim; native Windows tracked as a known gap)`,
      );
    }
    // PGID-TEARDOWN (ADR-G-013, MOAT-2 residual): a plain (non-detached) spawn
    // inherits the coordinator's process group, so a signal sent to just this
    // child's pid never reaches any grandchild the worker forks (e.g. a CLI
    // agent's own bash-tool subprocesses) — those survive as orphans. On POSIX,
    // `detached: true` makes the worker the LEADER of a brand-new process group
    // (its pid becomes the group id), so {@link signalProcessGroup} can target the
    // whole group via `process.kill(-pid, signal)`. Windows has no equivalent
    // group-signal semantics for `process.kill`, and `detached` means something
    // different there (new console, not new process group) — win32 keeps today's
    // single-pid behavior unchanged (see signalProcessGroup's win32 branch).
    // SURF-3 S2 — in live mode, PIPE stdout to JS so it can be teed (raw → the
    // .log, unchanged format + usage path) AND parsed for per-tool activity;
    // stderr still goes straight to logFd. Off (the default), stdout+stderr both
    // FD-redirect exactly as before (byte-identical, no JS read).
    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: streamCapture ? ['pipe', 'pipe', logFd] : ['pipe', logFd, logFd],
      env: childEnv,
      shell: inv.shell,
      detached: this.platform !== 'win32',
    };

    const child = this.spawnImpl(inv.command, inv.args, spawnOpts);

    // SURF-3 S2 — tee stdout: append each raw chunk to the .log (preserving the
    // raw stream-json format extractUsage already scans line-by-line) AND emit a
    // per-tool ACTIVITY line for every complete NDJSON line. Fail-soft: a bad
    // line / failed emit never breaks the worker; a write error degrades to
    // activity-only. Only runs when liveActivity (stdout is piped then).
    const budgetMonitor = streamCapture
      ? createRuntimeBudgetMonitor({
          projectRoot: dir,
          taskId,
          backend: this.name,
          budget: executionBudget,
          onStop: () => {
            try {
              killProcessGroupWithEscalation(child, 'SIGTERM', this.platform);
            } catch { /* already exited */ }
          },
        })
      : null;
    const containObserverFailure = (error: Error): void => {
      try { budgetMonitor?.failObservation(error); } catch { /* terminal evidence is best effort */ }
      try {
        killProcessGroupWithEscalation(child, 'SIGTERM', this.platform);
      } catch { /* already exited */ }
    };
    if (streamCapture && child.stdout) {
      const onActivity = liveActivity ? makeActivityOnEvent({
        projectRoot: dir,
        taskId,
        workerId: `subprocess-${taskId}`,
        enabled: true,
        ...(opts?.sprintId ? { sprintId: opts.sprintId } : {}),
      }) : undefined;
      const provider = this.name;
      let lineBuf = '';
      const observeLine = (line: string): void => {
        if (!line.trim()) return;
        const event = normalizeStreamEvent(line, provider);
        try { onActivity?.(event); } catch { /* activity is best-effort */ }
        try { budgetMonitor?.observe(event); } catch { /* stop callback still ran; marker failure is contained */ }
      };
      child.stdout.on('data', (chunk: Buffer) => {
        try { writeSync(logFd, chunk); } catch { /* raw-log write best-effort */ }
        lineBuf += chunk.toString('utf-8');
        let nl: number;
        while ((nl = lineBuf.indexOf('\n')) !== -1) {
          const line = lineBuf.slice(0, nl);
          lineBuf = lineBuf.slice(nl + 1);
          observeLine(line);
        }
      });
      child.stdout.on('end', () => {
        observeLine(lineBuf);
        try { budgetMonitor?.settle(); } catch { /* missing durable summary becomes UNKNOWN/HOLD */ }
      });
      child.stdout.on('error', (error: Error) => {
        containObserverFailure(
          new Error(`provider stdout observation failed: ${error.message}`),
        );
      });
      // MOAT-2 (ADR-G-013): a flowing Readable holds its OWN event-loop ref that
      // lives until stdout EOF (≈ worker exit) — so piping stdout for the tee
      // would re-pin the coordinator loop past `.result` (the exact linger the
      // `child.unref()` below fixes for the child handle). Unref the stream too:
      // an unref'd stream still delivers 'data' while the EXECUTE result-poll
      // timer keeps the loop alive, but never anchors it on its own (same
      // rationale as hbInterval.unref). Without this, live_trace-on subprocess
      // sprints would linger after completion.
      (child.stdout as unknown as { unref?: () => void }).unref?.();
    } else if (streamCapture) {
      containObserverFailure(
        new Error('provider stdout observation stream was not attached'),
      );
    }
    // BUG-26: DON'T close logFd here — keep open until child exits
    // On Windows the cmd.exe wrapper child inherits the FD; closing it before inherit causes empty logs

    // MOAT-2 ROOT CAUSE (ADR-G-013, sprint-333 ~27min linger): a `child_process`
    // spawned without `detached`/`unref` keeps the PARENT's event loop alive by
    // default until the child exits (that is what `child.unref()` exists to undo —
    // Node docs: "allow the parent to exit independently of the child"). The sprint
    // keys task completion on the `.result` FILE, not the child's `exit` — so a
    // worker that writes its result while its process lingers pins the COORDINATOR's
    // loop for the child's whole lifetime. Empirically verified: same-stdio child
    // ⇒ parent waits the child's full runtime; WITH `child.unref()` ⇒ parent drains
    // immediately. The child handle — not the heartbeat timer — is the dominant
    // anchor, so unref the child here. Safe during the sprint: the EXECUTE-phase
    // result poll loop (waitForResults) keeps the loop alive with its own timer, so
    // an unref'd child never causes a premature mid-sprint exit; it only lets the
    // coordinator exit once the sprint is genuinely done. cleanup()/kill() below
    // still SIGTERM→SIGKILL-reap the child so it cannot survive as an orphan worker.
    child.unref?.();

    // Write initial heartbeat
    this.writeHeartbeat(taskId, dir, 'EXECUTING', 0);

    // WORKER-GIT-GUARD (381-001): materialize the shim now that childEnv.PATH
    // already points at it (see the PATH computation above for why the I/O
    // is deferred to here).
    if (gitGuardDir) {
      installGitGuard(gitGuardDir, resolveHostGitPath(process.env, this.platform));
    }

    // BUG-23: Periodic heartbeat update (every 15 seconds)
    let hbSequence = 0;
    const hbInterval = setInterval(() => {
      hbSequence++;
      this.writeHeartbeat(taskId, dir, 'EXECUTING', hbSequence);
    }, 15_000);
    // MOAT-2 defense-in-depth (ADR-G-013): the child handle (unref'd above) is the
    // dominant loop-anchor, but this 15s heartbeat interval is a SECOND coordinator-
    // side timer that would independently pin the loop, so unref it too — a
    // maintenance timer must never hold the process open. It still fires whenever the
    // loop is otherwise busy (the heartbeat FILE is the Auditor's liveness source, and
    // is unaffected). `?.` guards fake timers in unit tests.
    hbInterval.unref?.();

    const entry: SubprocessWorkerEntry = {
      taskId,
      process: child,
      logPath,
      spawnedAt: new Date().toISOString(),
      hbInterval,
      ...(deckBrokerDenial ? { deckBrokerDenial } : {}),
      ...(deckBrokerLegacy ? { deckBrokerLegacy } : {}),
    };

    // Set up timeout if configured
    const timeout = this.defaultTimeoutMs;
    if (timeout > 0) {
      entry.timeoutHandle = setTimeout(() => {
        this.killWithSignal(taskId, 'SIGKILL');
      }, timeout);
      // MOAT-2 (ADR-G-013): same rationale as hbInterval — the kill-timeout is a
      // background guard, not legitimate coordinator work, so it must not pin the
      // event loop past normal completion. Cleared on exit/kill either way.
      entry.timeoutHandle.unref?.();
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
    // MOAT-2 (ADR-G-013): clear the heartbeat interval at reap time so cleanup()
    // releases the coordinator's event loop immediately, rather than waiting for
    // the child's `exit` closure (which may lag SIGTERM). Idempotent with the
    // exit-handler clearInterval.
    if (entry.hbInterval) clearInterval(entry.hbInterval);
    // MOAT-2 (ADR-G-013) — no orphan worker survives a clean run. `child.unref()`
    // lets the coordinator exit without waiting on the child, so a worker that
    // IGNORES a graceful SIGTERM would otherwise linger as an orphan (trading a
    // lingering coordinator for a lingering worker — still a lifecycle violation).
    // born-568: group-kill + SIGTERM→SIGKILL escalation now lives in the shared
    // {@link killProcessGroupWithEscalation} primitive (also used by codex.ts /
    // gemini.ts) instead of being re-derived here.
    killProcessGroupWithEscalation(entry.process, signal, this.platform);
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

  /**
   * 458-002 (A4): the typed reason a brokered spawn failed closed, for the
   * caller that handed in `opts.deckBroker`. Returns the discriminated
   * {@link DeckBrokerDenial} (never a bare boolean/string) while the worker is
   * tracked; `undefined` when no broker was supplied, when the resolve was
   * granted, or once the worker has been reaped.
   */
  getDeckBrokerDenial(taskId: string): DeckBrokerDenial | undefined {
    return this.workers.get(taskId)?.deckBrokerDenial;
  }

  /**
   * 459-002 (A5): the counterpart to {@link getDeckBrokerDenial} — `true` while
   * the worker is tracked if (and only if) no DeckBroker was supplied for this
   * spawn at all (legacy `opts.env` passthrough branch); `undefined` when a
   * broker was supplied (granted or denied), or once the worker has been
   * reaped. Never both this and {@link getDeckBrokerDenial} at once.
   */
  getDeckBrokerLegacy(taskId: string): true | undefined {
    return this.workers.get(taskId)?.deckBrokerLegacy;
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
  opts?: {
    defaultTimeoutMs?: number;
    providerConfig?: SubprocessProviderConfig;
    /** F1-012 config-driven provider registry (`config.providers?.registry`) — its
     *  `apiKeyEnv` keys join the cross-provider scrub set (F1-014 phase-2). */
    providerRegistry?: readonly ProviderDefinition[];
  },
): SubprocessSpawnBackend {
  return new SubprocessSpawnBackend(projectDir, opts);
}
