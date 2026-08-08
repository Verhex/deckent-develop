// ─── Provider Command Spec (PSL-1, Sprint 252) ──────────────────────────────
//
// Declarative, data-first per-provider worker-command definition — the seed of
// the deckent-core-owned, `deckent upgrade`-distributed provider-command layer
// (MASTER-PLAN §14.B-PSL). The docker backend builds its container worker command
// from this spec instead of hardcoding the claude CLI (Sprint 249 root cause:
// `gemini`/`codex` binaries were fed claude-CLI flags like
// `--dangerously-skip-permissions` and rejected them).
//
// Every flag below is validated against the installed CLIs' own `--help`:
//   - codex-cli 0.137.0: `--full-auto` is deprecated; `--dangerously-bypass-
//     approvals-and-sandbox` is "intended solely for environments that are
//     externally sandboxed" (a docker container) → full autonomy. `exec` reads
//     the prompt from stdin when no positional is given (robust for large prompts).
//   - gemini 0.45.1: `-p`/`--prompt` (headless), `-m`/`--model`, `--approval-mode
//     yolo` (auto-approve all tools; `plan` is read-only and cannot write),
//     `--skip-trust` (trust workspace headlessly), `-o/--output-format json`.
//
// The call site supplies the already-validated exact provider API ID. Explicit
// compatibility migration happens before runtime command construction.

/** Placeholder in `baseArgs` replaced by `"$(cat <promptPath>)"` for inline prompts. */
export const PROMPT_CAT_TOKEN = '{PROMPT_CAT}';

export interface ProviderCommandSpec {
  /** CLI binary (in the container / on host), e.g. 'claude' | 'codex' | 'gemini'. */
  binary: string;
  /**
   * Args between the binary and the model flag. May contain {@link PROMPT_CAT_TOKEN},
   * replaced by `"$(cat <promptPath>)"` when the prompt is fed inline.
   */
  baseArgs: readonly string[];
  /** Flag that selects the model, e.g. '--model' | '-m'. */
  modelFlag: string;
  /** Args appended only when the worker runs with autoApprove (full autonomy). */
  approvalArgs: readonly string[];
  /** Flag for the allowed-tools list, or null if the provider has no such flag. */
  allowedToolsFlag: string | null;
  /**
   * Flag that narrows the provider-visible built-in tool schema, or null when
   * the provider CLI has no equivalent. Distinct from `allowedToolsFlag`,
   * which controls permission; this controls which tool definitions enter the
   * model context at all.
   */
  availableToolsFlag: string | null;
  /**
   * Provider-native flags for an isolated finite-verification context.
   * These suppress project/user customizations and session persistence without
   * changing provider auth. Empty when the CLI has no equivalent contract.
   */
  isolatedContextArgs: readonly string[];
  /**
   * How the prompt reaches the CLI:
   *  - 'stdin'  → command has no prompt; the caller pipes `< <promptFile>`
   *               (claude `-p -`, codex `exec` with no positional).
   *  - 'inline' → the prompt is embedded as `"$(cat <promptPath>)"` via
   *               {@link PROMPT_CAT_TOKEN} (gemini `-p`).
   */
  promptFeed: 'stdin' | 'inline';
  /**
   * Host OAuth/session dir (relative to HOME) to mount into the container so the
   * CLI can authenticate (claude `.claude`, codex `.codex`, gemini `.gemini`),
   * or null for providers with no host session dir.
   */
  oauthHomeDir: string | null;
  /**
   * Builds the reasoning-effort args for a resolved level (F1-RE, Sprint 252), or
   * null when the provider's CLI has no reasoning-effort knob (gemini/ollama).
   * claude → `--effort <level>`; codex → `-c model_reasoning_effort=<level>`.
   * Only invoked when a level was resolved (opt-in via `- ModelEffort:`).
   */
  reasoningEffortArgs: ((level: string) => readonly string[]) | null;
  /**
   * F3.1: the CLI flag that moves per-machine system-prompt sections (cwd, env,
   * git status) into the first user message for a byte-stable cache prefix, or null
   * for a provider whose CLI has no equivalent. claude →
   * `--exclude-dynamic-system-prompt-sections`; codex/gemini → null. Emitted only
   * when the caller opts in via `excludeDynamicPromptSections`.
   */
  excludeDynamicPromptSectionsFlag: string | null;
  /** Whether stdout exposes per-call measured usage before the final response. */
  liveUsage: 'incremental' | 'final-only' | 'none';
}

/**
 * Built-in provider command specs. This map is the single hardcode — and it is
 * exactly the centrally-maintained, upgrade-distributable DATA the PSL design
 * calls for (provider CLIs change flags/structure over time; deckent core owns
 * these definitions and ships updates via `deckent upgrade`).
 *
 * Note: codex/gemini/ollama are host-adapter providers (`isAdapterProvider`); in
 * normal operation they spawn on the host, not docker. These specs make a docker
 * run correct IF the multi-CLI image + per-provider OAuth mount are present (P2),
 * and remove the claude-hardcode regardless. Ollama is host/local-only (no spec).
 */
export const PROVIDER_COMMAND_SPECS: Readonly<Record<string, ProviderCommandSpec>> = {
  claude: {
    binary: 'claude',
    // `--output-format json` makes the print-mode run emit a single result envelope
    // ({ type:'result', usage:{ input_tokens, output_tokens, cache_read_input_tokens,
    // cache_creation_input_tokens }, total_cost_usd, session_id }) on stdout → captured
    // to `.log` → ClaudeAdapter.extractUsage reads the REAL per-task usage (incl. the
    // limit-dominant cacheCreation). Mirrors the gemini spec (which already carries the
    // flag) + the subprocess backend's usageEmitArgs. Without it the default docker/tmux
    // path fell back to the fabricated heuristic (cacheRead=input×4) — the long-standing
    // "token counter never works" gap for the most-used config.
    baseArgs: ['-p', '-', '--output-format', 'json'],
    modelFlag: '--model',
    approvalArgs: ['--dangerously-skip-permissions'],
    allowedToolsFlag: '--allowedTools',
    availableToolsFlag: '--tools',
    isolatedContextArgs: ['--safe-mode', '--disable-slash-commands', '--no-session-persistence'],
    promptFeed: 'stdin',
    oauthHomeDir: '.claude',
    reasoningEffortArgs: (level) => ['--effort', level], // low|medium|high|xhigh|max
    excludeDynamicPromptSectionsFlag: '--exclude-dynamic-system-prompt-sections',
    liveUsage: 'incremental',
  },
  codex: {
    binary: 'codex',
    // `--json` emits a final/cumulative usage event. It is retained for post-run
    // billing evidence, but is NOT a proven incremental stream contract: current
    // `turn.completed` events have no stable call identity and classic
    // `token_count.info.total_token_usage` is cumulative. Live caps fail closed.
    baseArgs: ['exec', '--skip-git-repo-check', '--json'],
    modelFlag: '--model',
    // Container is the external sandbox → bypass codex's internal sandbox+approvals.
    approvalArgs: ['--dangerously-bypass-approvals-and-sandbox'],
    allowedToolsFlag: null,
    availableToolsFlag: null,
    isolatedContextArgs: [],
    promptFeed: 'stdin',
    oauthHomeDir: '.codex',
    reasoningEffortArgs: (level) => ['-c', `model_reasoning_effort=${level}`], // minimal|low|medium|high
    excludeDynamicPromptSectionsFlag: null, // codex CLI has no equivalent flag
    liveUsage: 'final-only',
  },
  gemini: {
    binary: 'gemini',
    baseArgs: ['-p', PROMPT_CAT_TOKEN, '--output-format', 'json'],
    modelFlag: '-m',
    // yolo = auto-approve all tools (a worker must write files); skip-trust =
    // trust the workspace headlessly (else the CLI aborts with a trust prompt).
    approvalArgs: ['--approval-mode', 'yolo', '--skip-trust'],
    allowedToolsFlag: null,
    availableToolsFlag: null,
    isolatedContextArgs: [],
    promptFeed: 'inline',
    oauthHomeDir: '.gemini',
    reasoningEffortArgs: null, // gemini CLI has no reasoning-effort knob
    excludeDynamicPromptSectionsFlag: null, // gemini CLI has no equivalent flag
    liveUsage: 'final-only',
  },
};

/**
 * Build the worker command string for a provider from its spec.
 *
 * @param spec       The provider's {@link ProviderCommandSpec}.
 * @param apiId      The wire model id (already mapped from the deckent alias).
 * @param promptPath Container/host path to the prompt file (used for inline mode;
 *                   for 'stdin' mode the caller pipes `< promptPath` separately).
 * @param opts       allowedTools (claude only) + autoApprove (appends approvalArgs).
 */
export function buildProviderCommand(
  spec: ProviderCommandSpec,
  apiId: string,
  promptPath: string,
  opts: {
    allowedTools?: string;
    availableTools?: string;
    isolatedContext?: boolean;
    autoApprove?: boolean;
    reasoningEffort?: string;
    excludeDynamicPromptSections?: boolean;
  } = {},
): string {
  const parts: string[] = [spec.binary];
  for (const arg of spec.baseArgs) {
    parts.push(arg === PROMPT_CAT_TOKEN ? `"$(cat ${promptPath})"` : arg);
  }
  parts.push(spec.modelFlag, apiId);
  if (spec.allowedToolsFlag && opts.allowedTools) {
    parts.push(spec.allowedToolsFlag, `"${opts.allowedTools}"`);
  }
  if (spec.availableToolsFlag && opts.availableTools) {
    parts.push(spec.availableToolsFlag, `"${opts.availableTools}"`);
  }
  if (opts.isolatedContext) {
    parts.push(...spec.isolatedContextArgs);
  }
  if (opts.autoApprove) {
    parts.push(...spec.approvalArgs);
  }
  // F1-RE (Sprint 252): model reasoning-effort (depth) — opt-in, already
  // resolved + provider-validated by the caller (resolveReasoningEffort).
  if (opts.reasoningEffort && spec.reasoningEffortArgs) {
    parts.push(...spec.reasoningEffortArgs(opts.reasoningEffort));
  }
  // F3.1: prefix-stable system prompt — opt-in, emitted only for a provider whose
  // spec declares the flag (claude). Others have `excludeDynamicPromptSectionsFlag: null`.
  if (opts.excludeDynamicPromptSections && spec.excludeDynamicPromptSectionsFlag) {
    parts.push(spec.excludeDynamicPromptSectionsFlag);
  }
  return parts.join(' ');
}

/**
 * Resolve a provider's command spec, or null for host/local-only or unknown
 * providers (e.g. 'ollama') — the caller (docker backend) then honest-fails
 * instead of degrading to the claude CLI (MF-2/MF-3).
 */
export function getProviderCommandSpec(provider: string): ProviderCommandSpec | null {
  return PROVIDER_COMMAND_SPECS[provider] ?? null;
}

// ═══ TOOL-AUTHORITY-001 T1 — runtime tool-scope enforcement truth ═══════════
// The code-truth (2026-08-05): codex/gemini carry `allowedToolsFlag: null`, so
// a task with a real write-scope spawns with NO runtime tool restriction — and
// nothing said so. That silent full surface is the same "reported-but-not-
// enforcing" class already closed three times over; here enforcement is not
// merely weaker than it looks, it is ABSENT. This predicate makes the truth
// typed so it can ride the TASK_ASSIGN event and become auditable, instead of
// hidden. It is DELIBERATELY advisory (ADR-G-020 advisory-mode) — a bounded
// honesty fix, not fail-closed enforcement (that needs CAPABILITY-001 +
// APPROVAL-001, and the Bash-defeats-Write escape needs a filesystem write
// guard — both are named residuals on TOOL-AUTHORITY-001, not this slice).

export type ToolScopeEnforcementReason =
  | 'ENFORCED_FLAG_PRESENT'
  | 'NO_WRITE_SCOPE'
  | 'UNKNOWN_PROVIDER'
  | 'RUNTIME_TOOL_SCOPE_UNENFORCED';

export interface ToolScopeEnforcement {
  /** True only when the provider CLI can carry a runtime tool-scope flag AND
   *  the task actually declares a write scope to constrain. Flag-level only —
   *  it does NOT assert the scope is unescapable (the Bash escape is residual). */
  readonly flagEnforced: boolean;
  readonly reasonCode: ToolScopeEnforcementReason;
}

/**
 * Resolve whether a task's write-scope is carried to the provider at runtime as
 * a real tool-scope flag. A task with no write scope has nothing to enforce
 * (NO_WRITE_SCOPE); an unknown provider or a provider whose spec has a null
 * `allowedToolsFlag` (codex/gemini today) cannot carry the scope at all
 * (RUNTIME_TOOL_SCOPE_UNENFORCED — the silent-full-surface case).
 */
export function resolveToolScopeEnforcement(
  provider: string,
  writeScope: readonly string[] | undefined,
): ToolScopeEnforcement {
  const hasWriteScope = (writeScope ?? []).some((p) => typeof p === 'string' && p.trim().length > 0);
  if (!hasWriteScope) return { flagEnforced: false, reasonCode: 'NO_WRITE_SCOPE' };
  const spec = getProviderCommandSpec(provider);
  if (!spec) return { flagEnforced: false, reasonCode: 'UNKNOWN_PROVIDER' };
  if (spec.allowedToolsFlag === null) {
    return { flagEnforced: false, reasonCode: 'RUNTIME_TOOL_SCOPE_UNENFORCED' };
  }
  return { flagEnforced: true, reasonCode: 'ENFORCED_FLAG_PRESENT' };
}
