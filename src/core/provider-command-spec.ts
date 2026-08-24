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
   *  - 'argument' → the prompt is appended as a positional argument after all
   *                 provider/model flags (cursor-agent).
   */
  promptFeed: 'stdin' | 'inline' | 'argument';
  /**
   * Task-private container OAuth/session destination relative to HOME. For the
   * legacy providers this also names the default host-relative source; providers
   * with platform config authority (Cursor) resolve the host source separately.
   * Null means the provider has no file-backed session directory.
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
   * Builds provider args that load the immutable system-prompt core from its
   * container path. Undefined when the provider has no approved core channel.
   */
  systemPromptCoreArgs?: (containerCorePath: string) => string[];
  /**
   * Provider args that suppress project-context discovery around the immutable
   * system-prompt core. Undefined when no measured suppression channel exists.
   */
  contextSuppressionArgs?: string[];
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
    systemPromptCoreArgs: (containerCorePath) => ['-c', `model_instructions_file=${containerCorePath}`],
    contextSuppressionArgs: ['-c', 'project_doc_max_bytes=0'],
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
  cursor: {
    binary: 'cursor-agent',
    baseArgs: ['--mode', 'ask', '-p', '--trust', '--output-format', 'json'],
    modelFlag: '--model',
    approvalArgs: ['--force'],
    allowedToolsFlag: null,
    availableToolsFlag: null,
    isolatedContextArgs: [],
    promptFeed: 'argument',
    // Containers run the Linux CLI, whose file credential store is rooted here.
    // The host source is platform-specific and is resolved independently by the
    // Docker backend; never use this destination to infer a host mount source.
    oauthHomeDir: '.config/cursor',
    reasoningEffortArgs: null,
    excludeDynamicPromptSectionsFlag: null,
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
  if (spec.promptFeed === 'argument') {
    // SEC-1 (2026-08-19): `--` stops option parsing so a prompt beginning with
    // `-` can never smuggle a flag into the provider CLI (cursor-agent honors
    // it — real-binary proven; the separator is inert for a non-dash prompt).
    parts.push('--', `"$(cat ${promptPath})"`);
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

// ═══ TOOL-AUTHORITY-001 filesystem-write-guard — Bash-defeats-Write escape ═══
// T1 (above) surfaces whether a write-scope reaches the CLI as a tool flag at
// all. This sibling surfaces the COMPLEMENTARY axis: even when the flag IS
// present and Write()/Edit() are dutifully path-scoped, buildDockerAllowedTools
// (spawn-backend-docker.ts) and sprint-spawner.ts UNCONDITIONALLY co-grant a
// bare, unscoped `Bash` — and a shell can `echo > f`, `tee`, `rm`, `mv` anywhere,
// so the path-scope is defeated at the filesystem level (ADR-G-020 write-scope
// is advisory in practice). This predicate makes that escape typed + auditable
// on the TASK_ASSIGN event. It is DELIBERATELY advisory (ADR-G-020 advisory-mode,
// same class as T1): real enforcement — dropping or command-scoping the shell
// grant, or a container fs-guard — is a named residual on TOOL-AUTHORITY-001,
// not this slice. The verdict is derivation-robust: BOTH the docker and
// sprint-spawner derivations co-grant unscoped Bash alongside scoped Write, so
// the escape holds regardless of which one produced the string (their only
// divergence is write-TARGET content, not the shell co-grant).

/** Tool identifiers that grant an UNSCOPED, filesystem-write-capable shell.
 *  A bare `Bash` grant defeats Write()/Edit() path-scoping; a hypothetical
 *  command-scoped `Bash(<allowlist>)` grant is a different axis and is NOT
 *  treated as an unscoped escape here. */
const UNSCOPED_SHELL_WRITE_TOOLS = ['Bash'] as const;

export type WriteScopeShellEscapeReason =
  | 'NO_WRITE_GRANT'
  | 'WRITE_GRANT_UNSCOPED'
  | 'WRITE_SCOPE_TOOL_BOUND'
  | 'WRITE_SCOPE_DEFEATED_BY_SHELL';

export interface WriteScopeShellEscape {
  /** True ONLY for WRITE_SCOPE_DEFEATED_BY_SHELL — a path-scoped write authority
   *  coexists with an unscoped shell that can write outside it. */
  readonly escaped: boolean;
  readonly reasonCode: WriteScopeShellEscapeReason;
  /** The unscoped shell tool(s) granted, for the audit trail. */
  readonly shellTools: readonly string[];
  /** Whether the task declared a real filesWrite scope (vs only the default
   *  `.tasks/` heartbeat target) — audit context, does not change the verdict. */
  readonly declaredScope: boolean;
}

/** Split a `--allowedTools` string into top-level tool tokens, respecting the
 *  parentheses of a scoped grant so the commas INSIDE `Write(a,b)` do not split
 *  the token. */
function splitAllowedToolTokens(allowedTools: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < allowedTools.length; i += 1) {
    const ch = allowedTools[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      tokens.push(allowedTools.slice(start, i).trim());
      start = i + 1;
    }
  }
  tokens.push(allowedTools.slice(start).trim());
  return tokens.filter((t) => t.length > 0);
}

/**
 * Resolve whether a worker's granted tool surface lets it escape its declared
 * write-scope through an unscoped shell. Parses the ACTUAL `--allowedTools`
 * grant string (the bytes the provider CLI receives): a path-scoped
 * `Write(...)`/`Edit(...)` co-granted with a bare unscoped shell is escapable
 * (WRITE_SCOPE_DEFEATED_BY_SHELL); a bare `Write`/`Edit` is itself unscoped so
 * there is nothing narrower to defeat (WRITE_GRANT_UNSCOPED); a path-scoped
 * write with no shell holds at the tool level (WRITE_SCOPE_TOOL_BOUND); no write
 * authority at all is NO_WRITE_GRANT. Pure — exported for unit tests.
 */
export function resolveWriteScopeShellEscape(
  allowedTools: string | undefined,
  writeScope: readonly string[] | undefined,
): WriteScopeShellEscape {
  const declaredScope = (writeScope ?? []).some((p) => typeof p === 'string' && p.trim().length > 0);
  const tokens = splitAllowedToolTokens(allowedTools ?? '');
  const shellTools = UNSCOPED_SHELL_WRITE_TOOLS.filter((shell) => tokens.includes(shell));
  const writeTokens = tokens.filter((t) => /^(?:Write|Edit)\b/.test(t));
  if (writeTokens.length === 0) {
    return { escaped: false, reasonCode: 'NO_WRITE_GRANT', shellTools, declaredScope };
  }
  // A write token is path-scoped iff it carries a non-empty parenthesized arg.
  const hasScopedWrite = writeTokens.some((t) => /^(?:Write|Edit)\(\s*[^)]/.test(t));
  const hasUnscopedWrite = writeTokens.some((t) => /^(?:Write|Edit)$/.test(t));
  if (hasUnscopedWrite && !hasScopedWrite) {
    return { escaped: false, reasonCode: 'WRITE_GRANT_UNSCOPED', shellTools, declaredScope };
  }
  if (shellTools.length > 0) {
    return { escaped: true, reasonCode: 'WRITE_SCOPE_DEFEATED_BY_SHELL', shellTools, declaredScope };
  }
  return { escaped: false, reasonCode: 'WRITE_SCOPE_TOOL_BOUND', shellTools, declaredScope };
}
