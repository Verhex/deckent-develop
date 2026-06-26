/**
 * LocalStaticSource — the offline-first DEFAULT `ModelCatalogSource` (Spec Pillar 4).
 *
 * Reads the existing local pricing file `.deckent/cost-config.json` (via the shared
 * `cost-config-loader`, which transparently falls back to the bundled baseline) and
 * normalizes it into provider-agnostic `CatalogEntry[]`. It is the air-gapped /
 * zero-setup baseline: **no network, ever** — if every enrichment source is down or
 * absent, the catalog still works on LocalStatic alone.
 *
 * Normalization happens at this adapter boundary (Spec Pillar 4): cost-config's
 * per-token prices + context/output limits map straight across; the cache
 * **archetype + verify-field + min-prefix** come from deckent's own provider profile
 * (cache mechanism is *core logic, not source data*). The canonical archetype
 * classifier is Task 015 `cache-archetype.ts`; the compact provider profile below is
 * the adapter-boundary default until that module lands, at which point sources
 * delegate to it.
 *
 * Sprint 330 Task 330-013 (Spec Pillar 4 — F1-PCACHE).
 */

import {
  loadCostConfig,
  listEnabledModels,
  type CostConfig,
  type ModelPricing,
} from '../cost-config-loader.js';
import { normalizeProviderId } from './catalog-source.js';
import type { ModelCatalogSource } from './catalog-source.js';
import { CACHE_ARCHETYPE, type CacheArchetype, type CatalogEntry } from './types.js';

/** Injectable config reader — defaults to the real `loadCostConfig`, overridable in tests. */
export type CostConfigReader = (projectRoot: string) => CostConfig;

/** Stable id for entries produced by this source. */
export const LOCAL_STATIC_SOURCE_ID = 'local-static';

/**
 * Per-provider cache profile (canonical provider id → cache mechanism facts).
 *
 * This is the *adapter-boundary default*: cache mechanism is core logic, not data
 * from the cost-config file. Task 015 `cache-archetype.ts` will own the canonical
 * classifier; keep this map small and aligned with the Spec Pillar 3 archetype table.
 */
interface ProviderCacheProfile {
  apiStyle: string;
  archetype: CacheArchetype;
  /** Provider usage-response field that reports cache reads ("" when unmeasured). */
  verifyField: string;
  /** Minimum prefix tokens before caching engages, when the provider defines one. */
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

/** Fallback profile for providers not in the table — auto-cache is the common case. */
const DEFAULT_CACHE_PROFILE: ProviderCacheProfile = {
  apiStyle: '',
  archetype: CACHE_ARCHETYPE.IMPLICIT_AUTO,
  verifyField: 'cached_tokens',
};

function profileFor(canonicalProviderId: string): ProviderCacheProfile {
  const profile = PROVIDER_CACHE_PROFILE[canonicalProviderId];
  if (profile) return profile;
  // No table entry: auto-cache default, apiStyle mirrors the provider id.
  return { ...DEFAULT_CACHE_PROFILE, apiStyle: canonicalProviderId };
}

/**
 * Map a single cost-config model record to a normalized `CatalogEntry`.
 * Prices are USD-per-token (cost-config's native unit, enforced by `validateCostUnit`);
 * null cache costs normalize to 0 (provider does not bill that lane).
 */
function toCatalogEntry(rawProviderId: string, modelId: string, pricing: ModelPricing): CatalogEntry {
  const providerId = normalizeProviderId(rawProviderId);
  const profile = profileFor(providerId);
  return {
    providerId,
    modelId,
    apiStyle: profile.apiStyle,
    contextLimit: pricing.max_input_tokens,
    outputLimit: pricing.max_output_tokens ?? 0,
    price: {
      input: pricing.input_cost_per_token,
      output: pricing.output_cost_per_token,
      cacheRead: pricing.cache_read_input_token_cost ?? 0,
      cacheWrite: pricing.cache_creation_input_token_cost ?? 0,
    },
    cacheArchetype: profile.archetype,
    cacheVerifyField: profile.verifyField,
    ...(profile.minCacheablePrefix !== undefined ? { minCacheablePrefix: profile.minCacheablePrefix } : {}),
    sourceId: LOCAL_STATIC_SOURCE_ID,
    confidence: 'confirmed',
  };
}

/**
 * Offline-first catalog source backed by `.deckent/cost-config.json`.
 *
 * @example
 * const src = new LocalStaticSource(projectRoot);
 * const entries = await src.fetch(); // never touches the network
 */
export class LocalStaticSource implements ModelCatalogSource {
  readonly id = LOCAL_STATIC_SOURCE_ID;

  private readonly projectRoot: string;
  private readonly readConfig: CostConfigReader;

  /**
   * @param projectRoot Directory containing `.deckent/cost-config.json`.
   * @param readConfig  Config reader seam (defaults to the shared `loadCostConfig`,
   *                    which itself falls back to the bundled baseline).
   */
  constructor(projectRoot: string, readConfig: CostConfigReader = loadCostConfig) {
    this.projectRoot = projectRoot;
    this.readConfig = readConfig;
  }

  /**
   * Produce normalized catalog entries from the local cost-config.
   *
   * Graceful by contract: if the config is absent, unreadable, or invalid, this
   * returns `[]` (never throws) so the registry degrades to whatever other sources
   * provide — or to an empty catalog — instead of crashing the hot path.
   */
  async fetch(): Promise<CatalogEntry[]> {
    let config: CostConfig;
    try {
      config = this.readConfig(this.projectRoot);
    } catch (err) {
      console.warn(
        `[catalog] LocalStaticSource: could not read cost-config (${err instanceof Error ? err.message : String(err)}); ` +
          `serving empty catalog.`,
      );
      return [];
    }

    return listEnabledModels(config).map(({ provider, modelId, pricing }) =>
      toCatalogEntry(provider, modelId, pricing),
    );
  }
}
