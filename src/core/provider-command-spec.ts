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
// The deckent-facing model alias is mapped to its wire `apiId` (e.g. gpt-5→gpt-5.5,
// opus→claude-opus-4-8) at the call site, NOT here — keeps the spec model-agnostic.

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
    baseArgs: ['-p', '-'],
    modelFlag: '--model',
    approvalArgs: ['--dangerously-skip-permissions'],
    allowedToolsFlag: '--allowedTools',
    promptFeed: 'stdin',
    oauthHomeDir: '.claude',
  },
  codex: {
    binary: 'codex',
    baseArgs: ['exec', '--skip-git-repo-check'],
    modelFlag: '--model',
    // Container is the external sandbox → bypass codex's internal sandbox+approvals.
    approvalArgs: ['--dangerously-bypass-approvals-and-sandbox'],
    allowedToolsFlag: null,
    promptFeed: 'stdin',
    oauthHomeDir: '.codex',
  },
  gemini: {
    binary: 'gemini',
    baseArgs: ['-p', PROMPT_CAT_TOKEN, '--output-format', 'json'],
    modelFlag: '-m',
    // yolo = auto-approve all tools (a worker must write files); skip-trust =
    // trust the workspace headlessly (else the CLI aborts with a trust prompt).
    approvalArgs: ['--approval-mode', 'yolo', '--skip-trust'],
    allowedToolsFlag: null,
    promptFeed: 'inline',
    oauthHomeDir: '.gemini',
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
  opts: { allowedTools?: string; autoApprove?: boolean } = {},
): string {
  const parts: string[] = [spec.binary];
  for (const arg of spec.baseArgs) {
    parts.push(arg === PROMPT_CAT_TOKEN ? `"$(cat ${promptPath})"` : arg);
  }
  parts.push(spec.modelFlag, apiId);
  if (spec.allowedToolsFlag && opts.allowedTools) {
    parts.push(spec.allowedToolsFlag, `"${opts.allowedTools}"`);
  }
  if (opts.autoApprove) {
    parts.push(...spec.approvalArgs);
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
