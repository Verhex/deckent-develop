// ═══ Provider-Agnostic Token Usage ══════════════════════════════════
// Worker Output Contract & Observability (spec §1.3).
//
// A single, provider-agnostic shape for the actual token consumption of a
// worker run. Every ProviderAdapter normalizes its native usage report
// (Anthropic `input_tokens/output_tokens/cache_*`, OpenAI
// `prompt_tokens/completion_tokens`, Ollama `prompt_eval_count/eval_count`,
// Gemini `usageMetadata.*`) into this one type via {@link normalizeUsage},
// so the orchestrator's result assembler can account cost cross-provider
// without knowing which backend served the request.
//
// `source` records HOW the numbers were obtained — `provider-adapter` when
// the backend reported real usage (zero added latency, just captured), or
// `tokenizer-fallback` when deckent had to count the prompt+output text
// itself because the provider reported nothing. The distinction keeps the
// accounting honest: a fallback estimate is never silently passed off as a
// provider-reported measurement.
//
// Pure module: no side effects, no I/O, no spawn surface. Distinct from the
// legacy `TokenUsage` in `task-types.ts` (claude-shaped, worker-result
// embed) — this is the canonical capture type for the new contract.

/** How the token counts were obtained — provider truth vs deckent estimate. */
export type TokenUsageSource = 'provider-adapter' | 'tokenizer-fallback';

/**
 * Provider-agnostic, fully-populated token usage for a single worker run.
 * All numeric fields are non-negative integers; `totalTokens` is the sum the
 * caller can rely on (filled by {@link normalizeUsage} when not provided).
 */
export interface TokenUsage {
  /** Non-cached input/prompt tokens. */
  inputTokens: number;
  /** Generated output/completion tokens (includes reasoning tokens when a provider folds them in). */
  outputTokens: number;
  /** Tokens read from the prompt cache (a cache hit). 0 when no cache was used. */
  cacheReadTokens: number;
  /** Tokens written to the prompt cache on this call (cache creation). 0 when none. */
  cacheCreationTokens: number;
  /** Total tokens — provider-reported when available, else `inputTokens + outputTokens`. */
  totalTokens: number;
  /** Provenance of the counts. */
  source: TokenUsageSource;
}

/**
 * Loosely-typed input to {@link normalizeUsage}: every numeric field is
 * optional (an adapter fills only what its native format reports) and
 * `source` may be overridden (defaults to `provider-adapter`).
 *
 * NOTE: the spec sketched this as `Partial<TokenUsage> & Record<string, number | undefined>`,
 * but that intersection is ill-typed — `source` is a string union, not a
 * number — so it collapses `source` to `never`. This dedicated input type
 * captures the same intent without the type hole.
 */
export interface RawTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalTokens?: number;
  source?: TokenUsageSource;
}

/** Coerce to a non-negative integer; anything invalid (NaN, negative, non-number) → 0. */
function toCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

/**
 * Normalize a partial token-usage report into a fully-populated {@link TokenUsage}.
 *
 * - Missing or invalid numeric fields default to 0 (clamped non-negative, floored).
 * - `totalTokens` is honored when provided (a provider's own total may include
 *   reasoning/cache nuances the simple sum misses); otherwise it is filled as
 *   `inputTokens + outputTokens`.
 * - `source` defaults to `provider-adapter` (the common case — an adapter that
 *   parsed a real provider report); callers using the tokenizer fallback pass
 *   `source: 'tokenizer-fallback'` explicitly.
 *
 * Pure and total: never throws, never returns undefined.
 */
export function normalizeUsage(raw: RawTokenUsage = {}): TokenUsage {
  const inputTokens = toCount(raw.inputTokens);
  const outputTokens = toCount(raw.outputTokens);
  const cacheReadTokens = toCount(raw.cacheReadTokens);
  const cacheCreationTokens = toCount(raw.cacheCreationTokens);
  const totalTokens =
    raw.totalTokens !== undefined ? toCount(raw.totalTokens) : inputTokens + outputTokens;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens,
    source: raw.source ?? 'provider-adapter',
  };
}
