// ─── Cache Archetype ──────────────────────────────────────────────────────────

/**
 * How a provider implements prompt caching.
 *
 * IMPLICIT_AUTO    — provider caches automatically; no client marker needed (e.g. Gemini).
 * EXPLICIT_MARKER  — client must mark cache boundaries in the request (e.g. Anthropic cache_control).
 * EXPLICIT_RESOURCE — client references a pre-uploaded resource/context (e.g. OpenAI context caching).
 * LOCAL_KV         — cache is managed client-side in a local KV store (e.g. Ollama, local LLMs).
 * NONE             — provider offers no caching mechanism.
 */
export const CACHE_ARCHETYPE = {
  IMPLICIT_AUTO: 'IMPLICIT_AUTO',
  EXPLICIT_MARKER: 'EXPLICIT_MARKER',
  EXPLICIT_RESOURCE: 'EXPLICIT_RESOURCE',
  LOCAL_KV: 'LOCAL_KV',
  NONE: 'NONE',
} as const;

export type CacheArchetype = (typeof CACHE_ARCHETYPE)[keyof typeof CACHE_ARCHETYPE];

// ─── Regime ───────────────────────────────────────────────────────────────────

/** Billing/access regime under which a model is consumed. */
export type Regime = 'subscription' | 'api' | 'local';

// ─── Catalog Entry ────────────────────────────────────────────────────────────

/** Normalized, provider-agnostic descriptor for a single model variant in the catalog. */
export interface CatalogEntry {
  /** Canonical provider identifier (post-normalization, e.g. "moonshotai" not "kimi"). */
  providerId: string;
  /** Provider-specific model slug (e.g. "claude-sonnet-4-6"). */
  modelId: string;
  /** Provider API flavour (e.g. "openai-chat", "anthropic", "gemini", "ollama"). */
  apiStyle: string;
  /** Maximum input context length in tokens. */
  contextLimit: number;
  /** Maximum output tokens the model can generate in a single call. */
  outputLimit: number;
  /**
   * Pricing per million tokens in USD at the time this entry was last verified.
   * Values are populated at runtime by catalog sources — never hardcoded here.
   */
  price: {
    input: number;
    output: number;
    /** Cost to read a cached token (0 if provider does not charge). */
    cacheRead: number;
    /** Cost to write/store a new cached token (0 if provider does not charge). */
    cacheWrite: number;
  };
  /** Caching strategy this provider/model uses. */
  cacheArchetype: CacheArchetype;
  /**
   * Field name in the provider's usage response that confirms cache activity
   * (e.g. "cache_creation_input_tokens" for Anthropic, "" if not applicable).
   */
  cacheVerifyField: string;
  /** Minimum token prefix length before caching activates (provider-defined, optional). */
  minCacheablePrefix?: number;
  /** Identifier of the CatalogSource that produced this entry (e.g. "anthropic-api", "static"). */
  sourceId: string;
  /** Whether this entry's data has been verified against a live provider API. */
  confidence: 'confirmed' | 'unconfirmed';
}
