import type { ProviderDefinition } from '../core/config-types.js';

// ─── Cross-provider credential keys (F1-014 — the ONE source of truth) ─────────
/**
 * Canonical **provider-binary → credential env var** map. This is the single
 * source of truth that BOTH per-worker auth surfaces derive from:
 *   - the SUBPROCESS scrub set (`providers/subprocess.ts`) — remove every one of
 *     these from the inherited host env, then re-inject ONLY the owning worker's
 *     own credential, and
 *   - the DOCKER forward-allowlist (`orchestra/spawn-backend-docker.ts`) — forward
 *     ONLY the owning provider's credential into its container, never a foreign one.
 *
 * Before F1-014 phase-2 these two lived as parallel, hand-maintained literals; a
 * new provider had to be registered in both or a key would silently cross-leak.
 * They now both read from this map, so a built-in provider's credential is
 * declared in exactly one place. The map mirrors `core/provider.ts`
 * `applyDeckSecretsToEnv` exactly (claude→ANTHROPIC_API_KEY, codex→OPENAI_API_KEY,
 * gemini→GOOGLE_API_KEY, deepseek→DEEPSEEK_API_KEY, qwen→DASHSCOPE_API_KEY,
 * zhipu→ZHIPU_API_KEY).
 *
 * Cross-leaking any of these is the ADR-076 failure class — most acutely handing a
 * subscription claude worker an `ANTHROPIC_API_KEY` (the claude CLI prefers the env
 * key over the `~/.claude` session → silent API-mode demotion → Tier-1 timeout →
 * the mass-synthetic-NO_GO that killed Sprint 213).
 */
export const BASE_PROVIDER_CREDENTIAL_ENV = {
  claude: 'ANTHROPIC_API_KEY',
  codex: 'OPENAI_API_KEY',
  gemini: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
} as const satisfies Record<string, string>;

/**
 * The static base scrub set — every built-in provider's credential env var, in
 * the canonical map order. Equal byte-for-byte to the pre-phase-2 literal set
 * `['ANTHROPIC_API_KEY','OPENAI_API_KEY','GOOGLE_API_KEY','DEEPSEEK_API_KEY',
 * 'DASHSCOPE_API_KEY','ZHIPU_API_KEY']`.
 */
const BASE_CREDENTIAL_KEYS: readonly string[] = Object.values(BASE_PROVIDER_CREDENTIAL_ENV);

/** Options for {@link resolveCrossProviderCredentialKeys}. */
export interface ResolveCrossProviderKeysOptions {
  /**
   * The config-driven provider registry (F1-012, `config.providers?.registry` —
   * the same array fed to `applyDeckSecretsToEnv`). Each entry's `apiKeyEnv`
   * (when present and non-empty) is unioned into the result so a config-declared
   * `openai-compatible` provider's credential is scrubbed from foreign workers
   * too — closing the F1-014 phase-1 gap where arbitrary `apiKeyEnv` keys leaked
   * because the static base set could not know them. Absent / empty → exactly the
   * static base set (backward-compatible).
   */
  readonly registry?: readonly ProviderDefinition[];
}

/**
 * Resolve the full cross-provider credential SCRUB set: the static base set ∪
 * every registered provider's `apiKeyEnv`. Deterministic (insertion order: base
 * keys first, then registry keys in declaration order) and deduped. Pure — no
 * env reads, no I/O, provider-agnostic; identical on every platform.
 */
export function resolveCrossProviderCredentialKeys(
  opts?: ResolveCrossProviderKeysOptions,
): string[] {
  const keys = new Set<string>(BASE_CREDENTIAL_KEYS);
  const registry = opts?.registry;
  if (Array.isArray(registry)) {
    for (const def of registry) {
      const apiKeyEnv = typeof def?.apiKeyEnv === 'string' ? def.apiKeyEnv.trim() : '';
      if (apiKeyEnv) keys.add(apiKeyEnv);
    }
  }
  return [...keys];
}
