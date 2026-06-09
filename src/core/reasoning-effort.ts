// ─── Model Reasoning-Effort (F1-RE, Sprint 252) ─────────────────────────────
//
// REASONING-DEPTH the model itself offers — DISTINCT from task effort
// (`task.effort` low|normal|high = WORK SIZE, drives timeout/budget/token-estimate
// and must NOT be conflated with this). Reasoning-effort is a provider-CLI-level
// knob (one --effort / config value applies to all of that provider's models),
// validated against the installed CLIs:
//   - claude:  `--effort <low|medium|high|xhigh|max>`  (claude CLI --help)
//   - codex:   `-c model_reasoning_effort=<minimal|low|medium|high>`  (codex `-c key=value`)
//   - gemini / ollama: no CLI reasoning-effort knob → unsupported (always undefined)
//
// Opt-in per task via DIRECTIVES `- ModelEffort: <level>`. When absent, NOTHING is
// sent and the CLI keeps its own default (no behavior change vs. pre-F1-RE).

export interface ProviderReasoningEffort {
  /** Accepted reasoning-effort levels for this provider's CLI (low→high order). */
  readonly levels: readonly string[];
}

/**
 * Reasoning-effort support keyed by provider. Only providers whose CLI exposes a
 * reasoning-effort knob appear here; others (gemini, ollama) are intentionally
 * absent → {@link resolveReasoningEffort} returns undefined for them.
 *
 * This is centrally-maintained data (like ProviderCommandSpec, PSL-1) — when a
 * provider adds/renames effort levels, update here; `deckent upgrade` ships it.
 */
export const REASONING_EFFORT_BY_PROVIDER: Readonly<Record<string, ProviderReasoningEffort>> = {
  claude: { levels: ['low', 'medium', 'high', 'xhigh', 'max'] },
  codex: { levels: ['minimal', 'low', 'medium', 'high'] },
};

/** The reasoning-effort levels a provider's CLI accepts (empty if unsupported). */
export function getReasoningEfforts(provider: string): readonly string[] {
  return REASONING_EFFORT_BY_PROVIDER[provider]?.levels ?? [];
}

/**
 * Resolve the effective reasoning-effort to send to a provider's CLI.
 *
 * @param provider  Resolved task provider (claude/codex/gemini/ollama/…).
 * @param requested Per-task `- ModelEffort:` override (or undefined).
 * @returns The requested level IF the provider supports it; otherwise undefined
 *          (no override, unsupported provider, or an unrecognized level — in
 *          which case nothing is sent and the CLI default applies). Opt-in only:
 *          no `requested` → undefined → no flag emitted (no behavior change).
 */
export function resolveReasoningEffort(provider: string, requested?: string): string | undefined {
  if (!requested) return undefined;
  const levels = REASONING_EFFORT_BY_PROVIDER[provider]?.levels;
  return levels?.includes(requested) ? requested : undefined;
}
