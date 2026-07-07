// ─── Cross-provider credential SCRUB helper (F1-014 phase-3, born-518) ───────
/**
 * Central credential-scrub helper for provider spawn paths.
 *
 * P0-SEC gap (born-518, audit §4.4): `applyDeckSecretsToEnv` (core/provider.ts)
 * writes every configured provider's secret into the shared `process.env` —
 * by design, so each adapter can read its OWN key back out. The bug is on the
 * READ side: `providers/subprocess.ts` was the ONLY spawn path that scrubbed
 * every OTHER provider's credential out of the child env before handing it to
 * a worker. Every other adapter's `spawn()` built its child env with a bare
 * `{...process.env}` (or equivalent), inheriting every provider's secret
 * unconditionally. In a mixed-provider fleet (e.g. a claude + codex sprint
 * running side by side) a codex worker's child process could read the
 * claude worker's `ANTHROPIC_API_KEY` straight out of its own inherited env —
 * and vice versa — even though it never asked for that credential.
 *
 * This module extracts the scrub-then-reinject pattern subprocess.ts already
 * implemented inline so there is exactly ONE implementation, reusable by every
 * adapter's spawn path. `providers/subprocess.ts` has adopted
 * {@link scrubCrossProviderEnv} (this task, born-518). The following spawn
 * paths still build their child env WITHOUT this helper and remain vulnerable
 * until a follow-up task (expanded write scope) migrates them — see
 * `tests/providers/cred-scrub-all-adapters.test.ts` §C for executable proof:
 *   - `providers/codex.ts` `CodexAdapter.spawn()` (`{...process.env}`)
 *   - `providers/gemini.ts` `buildGeminiSpawnEnv()` (`{...process.env}`, only
 *     strips `GEMINI_CLI_IDE_*`, no cross-provider scrub)
 *   - `providers/ollama.ts` `OllamaAdapter.spawn()` (`{...process.env, ...opts.env}`)
 *   - `providers/openai-compatible.ts` `OpenAICompatibleAdapter.spawn()` (same shape)
 *   - `providers/openrouter.ts` `OpenRouterProvider.spawn()` (same shape)
 *   - `orchestra/spawn-backend.ts` `TmuxBackend` → `tmuxSpawnWorker` (the
 *     "tmux-Claude default" the audit calls out — outside this task's scope,
 *     both read and write)
 */

/**
 * Return a COPY of `hostEnv` with every key in `scrubKeys` removed.
 *
 * Pure — never mutates `hostEnv`. Callers pass the full cross-provider
 * credential key set (`resolveCrossProviderCredentialKeys()` from
 * `./cross-provider-keys.js`, the F1-014 single source of truth) so a child
 * process's inherited env starts from zero foreign provider secrets.
 *
 * @param hostEnv    the base environment to derive the child env from
 *                    (production callers pass `process.env`; tests inject a
 *                    synthetic snapshot for hermeticity)
 * @param scrubKeys  every provider credential env-var name to strip
 */
export function scrubCrossProviderEnv(
  hostEnv: NodeJS.ProcessEnv,
  scrubKeys: readonly string[],
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...hostEnv };
  for (const key of scrubKeys) {
    delete env[key];
  }
  return env;
}

/**
 * Convenience wrapper: {@link scrubCrossProviderEnv}, then re-inject `ownEnv`
 * (this spawn's OWN credential override, e.g. `{ANTHROPIC_API_KEY: '...'}`)
 * on top of the scrubbed copy. Absent/empty `ownEnv` leaves the child with NO
 * credential key for any provider, so the CLI falls back to its own
 * session/subscription auth exactly as before this fix (ADR-076).
 *
 * This is the ONE-CALL shape a `ProviderAdapter.spawn()` implementation
 * should use to build its child env — see the module docstring for the
 * adapters that have not yet adopted it.
 *
 * `providers/subprocess.ts` uses the lower-level {@link scrubCrossProviderEnv}
 * directly instead of this wrapper, because its own reinject step has
 * additional precedence rules (DeckBroker resolution takes priority over
 * `opts.env`) that a flat `ownEnv` merge does not model.
 */
export function buildProviderChildEnv(
  hostEnv: NodeJS.ProcessEnv,
  scrubKeys: readonly string[],
  ownEnv?: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  const env = scrubCrossProviderEnv(hostEnv, scrubKeys);
  if (ownEnv) {
    Object.assign(env, ownEnv);
  }
  return env;
}
