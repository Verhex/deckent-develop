/**
 * Cache Archetype Classifier — Spec Pillar 3 (F1-PCACHE).
 *
 * Classifies a provider's caching mechanism into one of five archetypes (A–E) and
 * maps it to the usage-response field name that confirms cache activity. This is
 * **core logic** — it is intentionally decoupled from the catalog data layer; the
 * archetype is a property of the provider API contract, not of any catalog source.
 *
 * Unknown providers return `null` (honest-ambiguous signal) — never a silent default.
 * (Law #2: EVERY ENVIRONMENT — unknown must fail honestly, never silently.)
 *
 * Sprint 330 Task 330-015 (Spec Pillar 3 — F1-PCACHE).
 */

import { CACHE_ARCHETYPE, type CacheArchetype } from './types.js';

// ─── Archetype Map ────────────────────────────────────────────────────────────

/**
 * Canonical provider-ID → CacheArchetype mapping (A–E).
 *
 * A · IMPLICIT_AUTO   — provider caches automatically; no client action required.
 * B · EXPLICIT_MARKER — client must annotate cache boundaries in the request body.
 * C · EXPLICIT_RESOURCE — client references a pre-uploaded cached resource/context.
 * D · LOCAL_KV        — cache is managed client-side in a local key-value store.
 * E · NONE            — provider offers no caching mechanism.
 */
const ARCHETYPE_MAP: Readonly<Record<string, CacheArchetype>> = {
  // ── A · IMPLICIT_AUTO ──────────────────────────────────────────────────────
  openai: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  deepseek: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  'gemini-impl': CACHE_ARCHETYPE.IMPLICIT_AUTO,
  mistral: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  xai: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  glm: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  groq: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  together: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  togetherai: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  fireworks: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  'fireworks-ai': CACHE_ARCHETYPE.IMPLICIT_AUTO,
  'qwen-impl': CACHE_ARCHETYPE.IMPLICIT_AUTO,
  'claude-cli': CACHE_ARCHETYPE.IMPLICIT_AUTO,

  // ── B · EXPLICIT_MARKER ───────────────────────────────────────────────────
  'anthropic-api': CACHE_ARCHETYPE.EXPLICIT_MARKER,
  bedrock: CACHE_ARCHETYPE.EXPLICIT_MARKER,
  vertex: CACHE_ARCHETYPE.EXPLICIT_MARKER,
  'qwen-explicit': CACHE_ARCHETYPE.EXPLICIT_MARKER,

  // ── C · EXPLICIT_RESOURCE ─────────────────────────────────────────────────
  'gemini-cachedcontent': CACHE_ARCHETYPE.EXPLICIT_RESOURCE,
  moonshotai: CACHE_ARCHETYPE.EXPLICIT_RESOURCE,

  // ── D · LOCAL_KV ──────────────────────────────────────────────────────────
  vllm: CACHE_ARCHETYPE.LOCAL_KV,
  llamacpp: CACHE_ARCHETYPE.LOCAL_KV,
  ollama: CACHE_ARCHETYPE.LOCAL_KV,

  // ── E · NONE ──────────────────────────────────────────────────────────────
  cohere: CACHE_ARCHETYPE.NONE,
} as const;

// ─── Verify-Field Map ─────────────────────────────────────────────────────────

/**
 * Usage-response field name that confirms cache activity for the given provider.
 *
 * Only providers with a non-default or absent verify field appear here.
 * Known providers NOT in this map use the IMPLICIT_AUTO default:
 *   `prompt_tokens_details.cached_tokens`
 */
const VERIFY_FIELD_OVERRIDES: Readonly<Record<string, string>> = {
  // DeepSeek uses a distinct cache-hit field name
  deepseek: 'prompt_cache_hit_tokens',

  // Anthropic family (marker-cache): usage field is specific to Anthropic's API contract
  'anthropic-api': 'cache_read_input_tokens',
  bedrock: 'cache_read_input_tokens',
  vertex: 'cache_read_input_tokens',

  // Gemini family: both implicit and resource-cache share the same usage field
  'gemini-impl': 'cachedContentTokenCount',
  'gemini-cachedcontent': 'cachedContentTokenCount',

  // LOCAL_KV: no server-side verify field (cache is client-managed)
  vllm: '',
  llamacpp: '',
  ollama: '',

  // NONE: no caching — no verify field
  cohere: '',
} as const;

/** Default verify field for IMPLICIT_AUTO providers not in VERIFY_FIELD_OVERRIDES. */
const IMPLICIT_AUTO_VERIFY_FIELD = 'prompt_tokens_details.cached_tokens';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify a provider's cache archetype (A–E).
 *
 * Returns `null` for unrecognized providers — the caller must handle the ambiguous
 * case explicitly. Never silently defaults to IMPLICIT_AUTO or any other archetype.
 */
export function classifyArchetype(providerId: string): CacheArchetype | null {
  return ARCHETYPE_MAP[providerId] ?? null;
}

/**
 * Return the provider usage-response field name that confirms cache activity.
 *
 * Returns `null` for unrecognized providers (same honest-signal contract as
 * `classifyArchetype`). Returns `''` for providers with no caching or no server-side
 * verify field (LOCAL_KV and NONE archetypes). Returns the provider-specific field
 * name for archetype B/C, or the shared IMPLICIT_AUTO default for archetype A providers
 * not otherwise overridden.
 */
export function cacheVerifyField(providerId: string): string | null {
  if (!(providerId in ARCHETYPE_MAP)) {
    return null;
  }
  if (providerId in VERIFY_FIELD_OVERRIDES) {
    return VERIFY_FIELD_OVERRIDES[providerId] as string;
  }
  return IMPLICIT_AUTO_VERIFY_FIELD;
}
