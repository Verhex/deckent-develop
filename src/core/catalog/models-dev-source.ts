/**
 * ModelsDevSource — optional enrichment `ModelCatalogSource` backed by models.dev.
 *
 * Fetches `https://models.dev/api.json` at **sync-time only** and normalizes each
 * entry into a provider-agnostic `CatalogEntry`. Network is never touched at runtime.
 *
 * Graceful by contract: any fetch error, HTTP error, or parse error returns `[]` and
 * logs a warning — it never throws, never aborts the registry sync, and never corrupts
 * the catalog populated by other sources (e.g. LocalStaticSource).
 *
 * Field mapping (models.dev → CatalogEntry):
 *   cost.input       → price.input
 *   cost.output      → price.output
 *   cost.cache_read  → price.cacheRead
 *   cost.cache_write → price.cacheWrite
 *   context          → contextLimit
 *   output           → outputLimit
 *
 * Sprint 330 Task 330-014 (Spec Pillar 4 — F1-PCACHE).
 */

import { normalizeProviderId } from './catalog-source.js';
import type { ModelCatalogSource } from './catalog-source.js';
import { CACHE_ARCHETYPE, type CacheArchetype, type CatalogEntry } from './types.js';

// ─── Injectable fetch seam ────────────────────────────────────────────────────

export type FetchFn = typeof globalThis.fetch;

// ─── External API types (models.dev schema) ───────────────────────────────────

interface ModelsDevCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

interface ModelsDevModel {
  name?: string;
  cost?: ModelsDevCost;
  /** Context window size in tokens. */
  context?: number;
  /** Max output tokens. */
  output?: number;
}

// ─── Source constants ─────────────────────────────────────────────────────────

export const MODELS_DEV_SOURCE_ID = 'models-dev';
const MODELS_DEV_URL = 'https://models.dev/api.json';

// ─── Provider cache profile (adapter-boundary defaults) ───────────────────────

interface ProviderCacheProfile {
  apiStyle: string;
  archetype: CacheArchetype;
  verifyField: string;
  minCacheablePrefix?: number;
}

const PROVIDER_CACHE_PROFILE: Readonly<Record<string, ProviderCacheProfile>> = {
  anthropic: {
    apiStyle: 'anthropic',
    archetype: CACHE_ARCHETYPE.EXPLICIT_MARKER,
    verifyField: 'cache_read_input_tokens',
  },
  openai: {
    apiStyle: 'openai-chat',
    archetype: CACHE_ARCHETYPE.IMPLICIT_AUTO,
    verifyField: 'prompt_tokens_details.cached_tokens',
    minCacheablePrefix: 1024,
  },
  google: {
    apiStyle: 'gemini',
    archetype: CACHE_ARCHETYPE.IMPLICIT_AUTO,
    verifyField: 'cachedContentTokenCount',
    minCacheablePrefix: 2048,
  },
  ollama: {
    apiStyle: 'ollama',
    archetype: CACHE_ARCHETYPE.LOCAL_KV,
    verifyField: '',
  },
};

const DEFAULT_CACHE_PROFILE: ProviderCacheProfile = {
  apiStyle: '',
  archetype: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  verifyField: 'cached_tokens',
};

function profileFor(canonicalProviderId: string): ProviderCacheProfile {
  return PROVIDER_CACHE_PROFILE[canonicalProviderId] ?? { ...DEFAULT_CACHE_PROFILE, apiStyle: canonicalProviderId };
}

// ─── Normalization ────────────────────────────────────────────────────────────

function toCatalogEntry(rawProviderId: string, modelId: string, model: ModelsDevModel): CatalogEntry {
  const providerId = normalizeProviderId(rawProviderId);
  const profile = profileFor(providerId);
  return {
    providerId,
    modelId,
    apiStyle: profile.apiStyle,
    contextLimit: model.context ?? 0,
    outputLimit: model.output ?? 0,
    price: {
      input: model.cost?.input ?? 0,
      output: model.cost?.output ?? 0,
      cacheRead: model.cost?.cache_read ?? 0,
      cacheWrite: model.cost?.cache_write ?? 0,
    },
    cacheArchetype: profile.archetype,
    cacheVerifyField: profile.verifyField,
    ...(profile.minCacheablePrefix !== undefined ? { minCacheablePrefix: profile.minCacheablePrefix } : {}),
    sourceId: MODELS_DEV_SOURCE_ID,
    confidence: 'unconfirmed',
  };
}

// ─── Source implementation ────────────────────────────────────────────────────

/**
 * Optional enrichment source backed by `https://models.dev/api.json`.
 *
 * The `fetchFn` constructor parameter is the test seam — inject a mock in tests to
 * avoid any real network I/O. Production uses `globalThis.fetch` by default.
 *
 * @example
 * const src = new ModelsDevSource();
 * // register at enrichment tier — overrides builtin-default, yields to local-override/custom
 * registry.register(src, 'enrichment');
 */
export class ModelsDevSource implements ModelCatalogSource {
  readonly id = MODELS_DEV_SOURCE_ID;

  private readonly fetchFn: FetchFn;

  constructor(fetchFn: FetchFn = globalThis.fetch) {
    this.fetchFn = fetchFn;
  }

  /**
   * Fetch and normalize all entries from models.dev.
   *
   * Returns `[]` (never throws) on any network failure, HTTP error, or parse error,
   * so callers (the registry) can safely skip this source without aborting the sync.
   */
  async fetch(): Promise<CatalogEntry[]> {
    let raw: unknown;
    try {
      const res = await this.fetchFn(MODELS_DEV_URL);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      raw = await res.json();
    } catch (err) {
      console.warn(
        `[catalog] ModelsDevSource: fetch failed (${err instanceof Error ? err.message : String(err)}); returning empty catalog.`,
      );
      return [];
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      console.warn('[catalog] ModelsDevSource: unexpected response shape; returning empty catalog.');
      return [];
    }

    const entries: CatalogEntry[] = [];
    for (const [providerId, models] of Object.entries(raw as Record<string, unknown>)) {
      if (!models || typeof models !== 'object' || Array.isArray(models)) continue;
      for (const [modelId, model] of Object.entries(models as Record<string, unknown>)) {
        if (!model || typeof model !== 'object' || Array.isArray(model)) continue;
        entries.push(toCatalogEntry(providerId, modelId, model as ModelsDevModel));
      }
    }

    return entries;
  }
}
