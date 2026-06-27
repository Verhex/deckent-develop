/**
 * OpenRouterSource — optional enrichment `ModelCatalogSource` backed by OpenRouter.
 *
 * Fetches `https://openrouter.ai/api/v1/models` at **sync-time only** and normalizes
 * each entry into a provider-agnostic `CatalogEntry`. Network is never touched at runtime.
 *
 * Graceful by contract: any fetch error, HTTP error, or parse error returns `[]` and
 * logs a warning — it never throws, never aborts the registry sync, and never corrupts
 * the catalog populated by other sources (e.g. LocalStaticSource).
 *
 * Field mapping (OpenRouter → CatalogEntry):
 *   model.id (provider/slug) → providerId + modelId (split on first '/')
 *   pricing.prompt           → price.input  (string, per-token USD)
 *   pricing.completion       → price.output (string, per-token USD)
 *   pricing.cache_read       → price.cacheRead  (optional, per-token USD)
 *   pricing.cache_write      → price.cacheWrite (optional, per-token USD)
 *   context_length           → contextLimit
 *   top_provider.max_completion_tokens → outputLimit
 *
 * Sprint 330 Task 330-014 (Spec Pillar 4 — F1-PCACHE).
 */

import { ErrorRegistry } from '../errors.js';
import { normalizeProviderId } from './catalog-source.js';
import type { ModelCatalogSource } from './catalog-source.js';
import { CACHE_ARCHETYPE, type CacheArchetype, type CatalogEntry } from './types.js';

// ─── Injectable fetch seam ────────────────────────────────────────────────────

export type FetchFn = typeof globalThis.fetch;

// ─── External API types (OpenRouter schema) ───────────────────────────────────

interface OpenRouterPricing {
  prompt?: string | number;
  completion?: string | number;
  cache_read?: string | number;
  cache_write?: string | number;
  [key: string]: unknown;
}

interface OpenRouterTopProvider {
  max_completion_tokens?: number;
  context_length?: number;
}

interface OpenRouterModel {
  /** Format: "provider/model-slug" (e.g. "anthropic/claude-3.5-sonnet"). */
  id: string;
  name?: string;
  pricing?: OpenRouterPricing;
  context_length?: number;
  top_provider?: OpenRouterTopProvider;
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

// ─── Source constants ─────────────────────────────────────────────────────────

export const OPENROUTER_SOURCE_ID = 'openrouter';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';

// ─── Provider cache profile (adapter-boundary defaults) ───────────────────────

interface ProviderCacheProfile {
  archetype: CacheArchetype;
  verifyField: string;
  minCacheablePrefix?: number;
}

const PROVIDER_CACHE_PROFILE: Readonly<Record<string, ProviderCacheProfile>> = {
  anthropic: {
    archetype: CACHE_ARCHETYPE.EXPLICIT_MARKER,
    verifyField: 'cache_read_input_tokens',
  },
  openai: {
    archetype: CACHE_ARCHETYPE.IMPLICIT_AUTO,
    verifyField: 'prompt_tokens_details.cached_tokens',
    minCacheablePrefix: 1024,
  },
  google: {
    archetype: CACHE_ARCHETYPE.IMPLICIT_AUTO,
    verifyField: 'cachedContentTokenCount',
    minCacheablePrefix: 2048,
  },
};

const DEFAULT_CACHE_PROFILE: ProviderCacheProfile = {
  archetype: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  verifyField: 'cached_tokens',
};

function profileFor(canonicalProviderId: string): ProviderCacheProfile {
  return PROVIDER_CACHE_PROFILE[canonicalProviderId] ?? DEFAULT_CACHE_PROFILE;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a price value that may arrive as a string or number. Returns 0 for missing/invalid. */
function parsePrice(raw: string | number | undefined): number {
  if (raw === undefined || raw === null) return 0;
  const n = typeof raw === 'number' ? raw : parseFloat(raw as string);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Split an OpenRouter model ID ("provider/model-slug") into its components.
 * Returns `null` for IDs that don't match the expected format.
 */
function splitModelId(id: string): { providerId: string; modelId: string } | null {
  const slash = id.indexOf('/');
  if (slash < 1 || slash === id.length - 1) return null;
  return { providerId: id.slice(0, slash), modelId: id.slice(slash + 1) };
}

// ─── Normalization ────────────────────────────────────────────────────────────

function toCatalogEntry(model: OpenRouterModel): CatalogEntry | null {
  const parts = splitModelId(model.id);
  if (!parts) return null;

  const { providerId: rawProviderId, modelId } = parts;
  const providerId = normalizeProviderId(rawProviderId);
  const profile = profileFor(providerId);

  return {
    providerId,
    modelId,
    apiStyle: 'openai-chat',
    contextLimit: model.context_length ?? model.top_provider?.context_length ?? 0,
    outputLimit: model.top_provider?.max_completion_tokens ?? 0,
    price: {
      input: parsePrice(model.pricing?.prompt),
      output: parsePrice(model.pricing?.completion),
      cacheRead: parsePrice(model.pricing?.cache_read),
      cacheWrite: parsePrice(model.pricing?.cache_write),
    },
    cacheArchetype: profile.archetype,
    cacheVerifyField: profile.verifyField,
    ...(profile.minCacheablePrefix !== undefined ? { minCacheablePrefix: profile.minCacheablePrefix } : {}),
    sourceId: OPENROUTER_SOURCE_ID,
    confidence: 'unconfirmed',
  };
}

// ─── Source implementation ────────────────────────────────────────────────────

/**
 * Optional enrichment source backed by `https://openrouter.ai/api/v1/models`.
 *
 * The `fetchFn` constructor parameter is the test seam — inject a mock in tests to
 * avoid any real network I/O. Production uses `globalThis.fetch` by default.
 *
 * @example
 * const src = new OpenRouterSource();
 * // register at enrichment tier — overrides builtin-default, yields to local-override/custom
 * registry.register(src, 'enrichment');
 */
export class OpenRouterSource implements ModelCatalogSource {
  readonly id = OPENROUTER_SOURCE_ID;

  private readonly fetchFn: FetchFn;

  constructor(fetchFn: FetchFn = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  /**
   * Fetch and normalize all entries from OpenRouter.
   *
   * Returns `[]` (never throws) on any network failure, HTTP error, or parse error,
   * so callers (the registry) can safely skip this source without aborting the sync.
   */
  async fetch(): Promise<CatalogEntry[]> {
    let payload: OpenRouterResponse;
    try {
      const res = await this.fetchFn(OPENROUTER_URL);
      if (!res.ok) {
        throw ErrorRegistry.createError('DECKENT_E072', {
          message: `HTTP ${res.status} ${res.statusText}`,
        });
      }
      payload = (await res.json()) as OpenRouterResponse;
    } catch (err) {
      console.warn(
        `[catalog] OpenRouterSource: fetch failed (${err instanceof Error ? err.message : String(err)}); returning empty catalog.`,
      );
      return [];
    }

    if (!payload?.data || !Array.isArray(payload.data)) {
      console.warn('[catalog] OpenRouterSource: unexpected response shape; returning empty catalog.');
      return [];
    }

    const entries: CatalogEntry[] = [];
    for (const model of payload.data) {
      if (!model?.id || typeof model.id !== 'string') continue;
      const entry = toCatalogEntry(model);
      if (entry) entries.push(entry);
    }

    return entries;
  }
}
