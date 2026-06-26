// ═══ ProviderCacheAdapter — canonical contract + archetypes A · B · D · E ═══
// Spec: docs/superpowers/specs/2026-06-26-worker-prompt-provider-cache-architecture-design.md
//       (Pillar 3 — "ProviderAdapter cache-emit layer (5 archetypes)").
//
// The full provider fleet collapses to FIVE cache archetypes. A single
// deterministic, tiered, byte-stable prompt artifact (Pillar 2: T0 global / T1
// tenant-class / T2 volatile tail) is realized into each provider's cache dialect
// by an adapter. The adapter chooses *how* to cache; it never reshapes the prompt
// bytes of the stable prefix (that is what makes any cache hit possible at all).
//
//   A · IMPLICIT-AUTO   — no marker; keep the prefix byte-stable + emit a tenant
//                         cache-key (`prompt_cache_key` / `x-grok-conv-id`).
//   B · EXPLICIT-MARKER — place `cache_control` breakpoint(s) at the T0/T1 tier
//                         boundaries (≤4 — Anthropic's hard limit).
//   C · EXPLICIT-RESOURCE — create → reference → delete lifecycle. Lives in the
//                         sibling module `./cache-adapter-resource.ts`.
//   D · LOCAL-KV        — byte-exact prefix + a per-tenant `cache_salt` isolation key.
//   E · NONE            — no-op; flag honestly that optimization does nothing.
//
// ── Consolidation note (sibling Task 330-018) ───────────────────────────────
// `./cache-adapter-resource.ts` (archetype C) currently carries its OWN forward-
// compatible copies of the contract types below, to stay build-independent under
// parallel-spawn (it declares no dependency on this file). This module is the
// CANONICAL home of `ProviderCacheAdapter` + the shared types. The contract here
// is byte-compatible with the sibling's mirror (same names, same string values,
// `ProviderCachePayload` is a strict superset), so consolidation is a mechanical
// import re-point with no behavioural change.
//
// ── Honesty invariants (spec §"Error handling") ─────────────────────────────
// - NO cache pricing is hardcoded here — economics live in the cost-calculator +
//   model registry (Pillars 4–5), never in an adapter.
// - A cache number that was not reported by the provider is NEVER fabricated:
//   `extractCacheUsage` returns 0 with `source: 'unmeasured'` (kills the legacy
//   `inputTokens × 4` heuristic on paths where a real field exists).
// - Archetype E is flagged as an explicit no-op (`noCache` marker) so it can never
//   be mistaken for a silently-failing cache.
//
// Pure of ambient I/O: emit is a pure transform; extractCacheUsage parses a string.

// ─── Shared cache contract ──────────────────────────────────────────────────

/**
 * The five provider cache archetypes (spec Pillar 3).
 *
 * NOTE: these are the adapter-layer labels (hyphen form). The catalog classifier
 * (`core/catalog/cache-archetype.ts`) uses an underscore form (`IMPLICIT_AUTO`)
 * for the same five concepts; mapping between the two is a catalog↔adapter seam
 * concern, intentionally not collapsed here.
 */
export type CacheArchetype =
  | 'IMPLICIT-AUTO'
  | 'EXPLICIT-MARKER'
  | 'EXPLICIT-RESOURCE'
  | 'LOCAL-KV'
  | 'NONE';

/**
 * The tiered, byte-stable prompt artifact (spec Pillar 2).
 * - `t0` global contract — deepest, most-reused cache layer (every task of every project)
 * - `t1` tenant/project prefix — ADR operative-state, persona, skill-set (a task-class)
 * - `t2` volatile tail — task id, description, scope, goNogo — NEVER cached
 */
export interface SegmentedPrompt {
  readonly t0: string;
  readonly t1: string;
  readonly t2: string;
}

/**
 * Where a provider-dialect cache-key rides. Archetype A providers name the
 * tenant cache-key differently and carry it in different transports:
 *   - OpenAI / DeepSeek / most OpenAI-compatible → `prompt_cache_key` (request body)
 *   - xAI / Grok                                 → `x-grok-conv-id`  (HTTP header)
 */
export interface CacheKeyDirective {
  /** Provider-dialect field/header name, e.g. 'prompt_cache_key' | 'x-grok-conv-id'. */
  readonly name: string;
  /** Whether the key is sent in the request body or as an HTTP header. */
  readonly transport: 'body' | 'header';
  /** The tenant-scoped key value. */
  readonly value: string;
}

/**
 * One content block in an archetype-B (EXPLICIT-MARKER) emission. A block with
 * `cacheControl: true` carries a `cache_control: { type: 'ephemeral' }` breakpoint
 * marking the end of a cacheable prefix; the provider caches everything up to and
 * including it. The volatile tail block carries `cacheControl: false`.
 */
export interface CacheControlBlock {
  readonly text: string;
  readonly cacheControl: boolean;
}

/**
 * Honest no-op signal for archetype E (NONE). Its presence on a payload means the
 * provider has no prompt-cache and the optimization did literally nothing — so E
 * can never be misread as a silently-failing cache. `reason` is a stable machine
 * code (not user-facing prose).
 */
export interface NoCacheMarker {
  readonly reason: 'PROVIDER_HAS_NO_PROMPT_CACHE';
}

/**
 * Realized provider payload produced by an adapter's `emit`. `prompt` is always
 * present (the flat text to send, with the stable prefix byte-preserved). The
 * remaining fields are archetype-specific and optional, so one flat type serves
 * every archetype:
 *   - A → `cacheKey`            (tenant cache-key dialect placement)
 *   - B → `cacheControlBlocks`  (cache_control breakpoint segmentation)
 *   - C → `cachedContentHandle` (server-side resource reference — sibling module)
 *   - D → `cacheSalt`           (per-tenant local-KV prefix isolation)
 *   - E → `noCache`             (explicit no-op marker)
 * `tenantKey` is the generic tenant scope, threaded when an archetype uses it.
 */
export interface ProviderCachePayload {
  /** Text to actually send to the provider on this call (stable prefix byte-preserved). */
  readonly prompt: string;
  /** Archetype C: handle of the server-side cache resource being referenced. */
  readonly cachedContentHandle?: string;
  /** Tenant-scoped cache key (multi-tenant isolation, spec Pillar 2). */
  readonly tenantKey?: string;
  /** Archetype A: provider-dialect placement of the tenant cache-key. */
  readonly cacheKey?: CacheKeyDirective;
  /** Archetype B: explicit `cache_control` breakpoint segmentation (≤4 markers). */
  readonly cacheControlBlocks?: readonly CacheControlBlock[];
  /** Archetype D: vLLM / llama.cpp per-tenant prefix-cache isolation salt. */
  readonly cacheSalt?: string;
  /** Archetype E: explicit signal that this provider has no prompt-cache. */
  readonly noCache?: NoCacheMarker;
}

/** Provenance of cache-usage numbers — measured vs not-reported (never fabricated). */
export type CacheUsageSource = 'provider-adapter' | 'unmeasured';

/**
 * Cache-specific token usage extracted from a provider's raw response. A field
 * the provider did not report is left 0 with `source: 'unmeasured'` — deckent
 * never invents a cache number it did not measure.
 */
export interface CacheUsage {
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly source: CacheUsageSource;
}

/**
 * Base adapter contract realized per provider archetype. `emit` produces the
 * provider payload from the segmented artifact; `extractCacheUsage` reads the
 * provider's verify field back out. Archetype C extends this with an explicit
 * create→reference→delete lifecycle in the sibling module.
 */
export interface ProviderCacheAdapter {
  readonly archetype: CacheArchetype;
  emit(segmented: SegmentedPrompt, tenantKey?: string): ProviderCachePayload;
  extractCacheUsage(raw: string): CacheUsage;
}

// ─── Shared parse helpers (honest, fabrication-free) ────────────────────────

/** The canonical "we did not measure a cache number" result. */
const UNMEASURED: CacheUsage = {
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  source: 'unmeasured',
};

/** Flatten the whole tiered artifact to the byte-exact wire string (prefix untouched). */
function flatten(segmented: SegmentedPrompt): string {
  return segmented.t0 + segmented.t1 + segmented.t2;
}

/** Parse JSON into a plain object, or null on malformed / non-object / null input. */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return asObject(parsed);
}

/** Narrow an unknown value to a plain object, else null. */
function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Read a non-negative integer off an arbitrary value, else undefined (garbage/negative ⇒ unmeasured). */
function readNonNegInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

// ─── Archetype A · IMPLICIT-AUTO ────────────────────────────────────────────

/** Construction options for {@link ImplicitAutoCacheAdapter}. */
export interface ImplicitAutoOptions {
  /** Provider-dialect cache-key name, e.g. 'prompt_cache_key' | 'x-grok-conv-id'. */
  readonly cacheKeyName: string;
  /** Whether the cache-key rides in the request body or an HTTP header. */
  readonly cacheKeyTransport: 'body' | 'header';
}

/**
 * Archetype A: the provider caches automatically by detecting a repeated prefix —
 * there is no marker to place. The adapter's only levers are (1) keep the prefix
 * byte-stable (it concatenates the tiers verbatim, touching nothing) and (2) emit
 * a tenant-scoped cache-key, which both raises the hit-rate and prevents
 * cross-tenant cache bleed (spec Pillar 2). Providers: OpenAI, DeepSeek,
 * Gemini-implicit, Mistral, xAI, GLM, Groq, Together, Fireworks, Qwen-implicit,
 * Claude-CLI.
 */
export class ImplicitAutoCacheAdapter implements ProviderCacheAdapter {
  readonly archetype: CacheArchetype = 'IMPLICIT-AUTO';

  private readonly cacheKeyName: string;
  private readonly cacheKeyTransport: 'body' | 'header';

  constructor(opts: ImplicitAutoOptions) {
    this.cacheKeyName = opts.cacheKeyName;
    this.cacheKeyTransport = opts.cacheKeyTransport;
  }

  /** OpenAI / DeepSeek dialect: tenant key in `prompt_cache_key` (request body). */
  static openAiStyle(): ImplicitAutoCacheAdapter {
    return new ImplicitAutoCacheAdapter({ cacheKeyName: 'prompt_cache_key', cacheKeyTransport: 'body' });
  }

  /** xAI / Grok dialect: tenant key in the `x-grok-conv-id` HTTP header. */
  static xaiStyle(): ImplicitAutoCacheAdapter {
    return new ImplicitAutoCacheAdapter({ cacheKeyName: 'x-grok-conv-id', cacheKeyTransport: 'header' });
  }

  /**
   * Emit the byte-stable prompt (prefix untouched) plus, when a tenant is given,
   * the dialect cache-key directive. No `cache_control` marker — the provider
   * auto-detects the cached prefix.
   */
  emit(segmented: SegmentedPrompt, tenantKey?: string): ProviderCachePayload {
    const prompt = flatten(segmented);
    if (tenantKey === undefined) return { prompt };
    return {
      prompt,
      tenantKey,
      cacheKey: { name: this.cacheKeyName, transport: this.cacheKeyTransport, value: tenantKey },
    };
  }

  /**
   * Read archetype-A cache hits:
   *   - OpenAI / xAI / most OpenAI-compatible → `usage.prompt_tokens_details.cached_tokens`
   *   - DeepSeek                              → `usage.prompt_cache_hit_tokens`
   *   - flat fallback                         → `usage.cached_tokens`
   * Archetype-A cache writes are free/implicit, so there is no creation field
   * (`cacheCreationTokens` stays 0). No recognized field ⇒ `unmeasured`.
   */
  extractCacheUsage(raw: string): CacheUsage {
    const obj = parseJsonObject(raw);
    if (obj === null) return UNMEASURED;
    const usage = asObject(obj['usage']);
    if (usage === null) return UNMEASURED;

    const details = asObject(usage['prompt_tokens_details']);
    const nested = details !== null ? readNonNegInt(details['cached_tokens']) : undefined;
    const cacheRead =
      nested ?? readNonNegInt(usage['prompt_cache_hit_tokens']) ?? readNonNegInt(usage['cached_tokens']);

    if (cacheRead === undefined) return UNMEASURED;
    return { cacheReadTokens: cacheRead, cacheCreationTokens: 0, source: 'provider-adapter' };
  }
}

// ─── Archetype B · EXPLICIT-MARKER ──────────────────────────────────────────

/** Anthropic's hard limit on `cache_control` breakpoints per request. */
const MAX_CACHE_BREAKPOINTS = 4;

/**
 * Archetype B: the client must mark cache boundaries with `cache_control`
 * breakpoints. We anchor a breakpoint to the END of each non-empty stable tier —
 * one at the T0/T1 boundary (caches T0, the layer reused by every task-class) and
 * one at the T1/T2 boundary (caches T0+T1, reused within a task-class). The
 * volatile T2 tail is never cached. With exactly two stable tiers this is ≤2
 * breakpoints, always within the ≤4 limit. Providers: Anthropic-API / Bedrock /
 * Vertex, Qwen-explicit, OpenRouter(Claude).
 */
export class ExplicitMarkerCacheAdapter implements ProviderCacheAdapter {
  readonly archetype: CacheArchetype = 'EXPLICIT-MARKER';

  /**
   * Segment into cache_control blocks: a breakpoint on each non-empty stable tier
   * (skipping an empty tier so a breakpoint is never wasted), and the tail with no
   * marker. `prompt` carries the flat fallback text (prefix byte-preserved).
   */
  emit(segmented: SegmentedPrompt, tenantKey?: string): ProviderCachePayload {
    const blocks: CacheControlBlock[] = [];
    if (segmented.t0 !== '') blocks.push({ text: segmented.t0, cacheControl: true });
    if (segmented.t1 !== '') blocks.push({ text: segmented.t1, cacheControl: true });
    blocks.push({ text: segmented.t2, cacheControl: false });

    // Invariant guard (Anthropic ≤4): structurally we emit ≤2, but assert it so a
    // future tier addition can never silently exceed the provider limit.
    const breakpoints = blocks.filter((b) => b.cacheControl).length;
    if (breakpoints > MAX_CACHE_BREAKPOINTS) {
      throw new Error(
        `EXPLICIT-MARKER emitted ${breakpoints} cache_control breakpoints, exceeds limit ${MAX_CACHE_BREAKPOINTS}`,
      );
    }

    const payload: ProviderCachePayload = { prompt: flatten(segmented), cacheControlBlocks: blocks };
    return tenantKey === undefined ? payload : { ...payload, tenantKey };
  }

  /**
   * Read archetype-B cache usage from Anthropic's `usage` block:
   *   - `cache_read_input_tokens`     → cacheReadTokens
   *   - `cache_creation_input_tokens` → cacheCreationTokens
   * B is the one archetype with a real cache-WRITE cost (1.25×/2×), so creation
   * tokens matter and are captured. Neither field present ⇒ `unmeasured`.
   */
  extractCacheUsage(raw: string): CacheUsage {
    const obj = parseJsonObject(raw);
    if (obj === null) return UNMEASURED;
    const usage = asObject(obj['usage']);
    if (usage === null) return UNMEASURED;

    const read = readNonNegInt(usage['cache_read_input_tokens']);
    const creation = readNonNegInt(usage['cache_creation_input_tokens']);
    if (read === undefined && creation === undefined) return UNMEASURED;

    return { cacheReadTokens: read ?? 0, cacheCreationTokens: creation ?? 0, source: 'provider-adapter' };
  }
}

// ─── Archetype D · LOCAL-KV ─────────────────────────────────────────────────

/**
 * Archetype D: cache is a client-/server-local KV of the prefill state, keyed by a
 * byte-exact prompt prefix (vLLM APC, llama.cpp slots, Ollama). The economic lever
 * is byte-exactness (the prefix is concatenated verbatim) plus a per-tenant
 * `cache_salt`, which partitions the local prefix cache so one tenant cannot read
 * another's cached prefill. There is no token-level billing field (it is
 * latency-only, $0), so `extractCacheUsage` is honestly `unmeasured`.
 */
export class LocalKvCacheAdapter implements ProviderCacheAdapter {
  readonly archetype: CacheArchetype = 'LOCAL-KV';

  /**
   * Emit the byte-exact prompt plus, when a tenant is given, a `cacheSalt` equal to
   * the tenant key — the vLLM/llama.cpp isolation knob. Distinct tenants ⇒ distinct
   * salts ⇒ isolated local prefix caches.
   */
  emit(segmented: SegmentedPrompt, tenantKey?: string): ProviderCachePayload {
    const prompt = flatten(segmented);
    if (tenantKey === undefined) return { prompt };
    return { prompt, tenantKey, cacheSalt: tenantKey };
  }

  /**
   * LOCAL-KV is latency-only ($0) with no server-reported token cache field. We do
   * NOT fabricate a number — always `unmeasured`.
   */
  extractCacheUsage(_raw: string): CacheUsage {
    return UNMEASURED;
  }
}

// ─── Archetype E · NONE ─────────────────────────────────────────────────────

/**
 * Archetype E: the provider offers no prompt-cache at all (e.g. Cohere). The
 * adapter is a deliberate no-op: it returns the full prompt and an explicit
 * `noCache` marker so the absence of caching is loud, never silent. It does not
 * thread a tenant cache-key — there is no tenant-scoped cache to isolate, and
 * carrying one would falsely imply caching. `extractCacheUsage` is always
 * `unmeasured`.
 */
export class NoneCacheAdapter implements ProviderCacheAdapter {
  readonly archetype: CacheArchetype = 'NONE';

  emit(segmented: SegmentedPrompt, _tenantKey?: string): ProviderCachePayload {
    return { prompt: flatten(segmented), noCache: { reason: 'PROVIDER_HAS_NO_PROMPT_CACHE' } };
  }

  extractCacheUsage(_raw: string): CacheUsage {
    return UNMEASURED;
  }
}
