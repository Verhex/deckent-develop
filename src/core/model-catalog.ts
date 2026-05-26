// ─── Model Catalog (Sprint 190 W-F F-6/F-7) ────────────────────────────────
// Runtime model catalog with 3-stage fallback: fresh fetch → 24h cache → bundled.
//
// Source of truth at runtime: https://models.dev/api/v1/catalog
// Cache file: ~/.deckent/cache/models-catalog.json (24h TTL)
// Bundled fallback: BUILTIN_MODELS from model-registry.ts (offline safety net)
//
// Preserves ADR-023 tier-based routing (premium_plus / premium / standard / economy)
// and ADR-017 provider-agnostic adapter interface.

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { DeckentError } from './errors.js';
import {
  BUILTIN_MODELS,
  modelRegistry,
  type ModelDefinition,
  type ModelTier,
  type ModelStatus,
  type RegistryProviderName,
} from './model-registry.js';

// ─── Constants ─────────────────────────────────────────────────────────────

export const CATALOG_URL = 'https://models.dev/api/v1/catalog';
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const FETCH_TIMEOUT_MS = 5_000;

export const CACHE_DIR = join(homedir(), '.deckent', 'cache');
export const CACHE_FILE = join(CACHE_DIR, 'models-catalog.json');

// ─── Types ─────────────────────────────────────────────────────────────────

/** Source of the resolved catalog (debug + telemetry). */
export type CatalogSource = 'remote' | 'cache' | 'bundled';

export interface RemoteCatalogModel {
  id: string;
  apiId?: string;
  provider: string;
  tier?: string;
  status?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  costPerMillion?: {
    input?: number;
    output?: number;
  };
  capabilities?: {
    streaming?: boolean;
    toolUse?: boolean;
    vision?: boolean;
    codeExecution?: boolean;
    reasoning?: boolean;
  };
}

export interface RemoteCatalogResponse {
  version: string;
  generatedAt?: string;
  models: RemoteCatalogModel[];
}

export interface CachedCatalog {
  fetchedAt: number;
  url: string;
  payload: RemoteCatalogResponse;
}

export interface CatalogLoadResult {
  models: ModelDefinition[];
  source: CatalogSource;
  fetchedAt: number | null;
  /** Cache age in ms when source is 'cache' or 'remote' (just-fetched). */
  ageMs: number | null;
  /** Non-fatal warnings collected during load (e.g. malformed cache). */
  warnings: string[];
}

export interface CatalogLoadOptions {
  /** Skip network entirely — fallback to cache → bundled. */
  offline?: boolean;
  /** Override remote URL (mainly for tests). */
  url?: string;
  /** Override cache path (mainly for tests). */
  cachePath?: string;
  /** Force a fresh fetch even if cache is still warm. */
  forceRefresh?: boolean;
  /** Custom fetch implementation (mainly for tests). */
  fetchImpl?: typeof fetch;
  /** Cache TTL override in ms. */
  ttlMs?: number;
  /** Fetch timeout override in ms. */
  timeoutMs?: number;
  /** Now provider for deterministic tests. */
  now?: () => number;
}

// ─── Provider Mapping ──────────────────────────────────────────────────────

const PROVIDER_ALIASES: Record<string, RegistryProviderName | 'ollama'> = {
  // Canonical
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  ollama: 'ollama',
  // Anthropic flavors
  anthropic: 'claude',
  'anthropic.claude': 'claude',
  // OpenAI flavors
  openai: 'codex',
  'openai.codex': 'codex',
  // Google flavors
  google: 'gemini',
  'google.gemini': 'gemini',
  'google-genai': 'gemini',
  // Local LLM flavors
  local: 'ollama',
  llamacpp: 'ollama',
};

export function normalizeProvider(raw: string): RegistryProviderName | 'ollama' | null {
  const key = raw.toLowerCase().trim();
  const mapped = PROVIDER_ALIASES[key];
  if (mapped) return mapped;
  return null;
}

// ─── Tier Mapping ──────────────────────────────────────────────────────────

const TIER_ALIASES: Record<string, ModelTier> = {
  premium_plus: 'premium_plus',
  'premium-plus': 'premium_plus',
  premium: 'premium',
  standard: 'standard',
  economy: 'economy',
  // Common synonyms from upstream catalogs
  max: 'premium_plus',
  flagship: 'premium',
  pro: 'premium',
  balanced: 'standard',
  mid: 'standard',
  budget: 'economy',
  mini: 'economy',
  nano: 'economy',
};

export function normalizeTier(raw: string | undefined): ModelTier | null {
  if (!raw) return null;
  const mapped = TIER_ALIASES[raw.toLowerCase().trim()];
  return mapped ?? null;
}

/** Heuristic tier from cost when catalog doesn't declare one. */
export function inferTierFromCost(inputCost: number, outputCost: number): ModelTier {
  const avg = (inputCost + outputCost) / 2;
  if (avg >= 25) return 'premium_plus';
  if (avg >= 7) return 'premium';
  if (avg >= 1) return 'standard';
  return 'economy';
}

// ─── Status Mapping ────────────────────────────────────────────────────────

const STATUS_ALIASES: Record<string, ModelStatus> = {
  ga: 'ga',
  stable: 'ga',
  released: 'ga',
  preview: 'preview',
  beta: 'preview',
  experimental: 'preview',
  deprecated: 'deprecated',
  retired: 'deprecated',
  legacy: 'deprecated',
};

export function normalizeStatus(raw: string | undefined): ModelStatus {
  if (!raw) return 'ga';
  return STATUS_ALIASES[raw.toLowerCase().trim()] ?? 'ga';
}

// ─── Catalog Entry → ModelDefinition ───────────────────────────────────────

/** Convert a raw remote catalog entry to the canonical ModelDefinition shape.
 *  Returns null if the entry is unusable (unknown provider, missing id, etc.). */
export function mapRemoteEntry(remote: RemoteCatalogModel): ModelDefinition | null {
  if (!remote.id || typeof remote.id !== 'string') return null;

  const provider = normalizeProvider(remote.provider);
  if (!provider) return null;

  const cost = {
    input: remote.costPerMillion?.input ?? 0,
    output: remote.costPerMillion?.output ?? 0,
  };

  const tier =
    normalizeTier(remote.tier) ?? inferTierFromCost(cost.input, cost.output);

  const def: ModelDefinition = {
    id: remote.id,
    apiId: remote.apiId ?? remote.id,
    provider: provider as RegistryProviderName,
    tier,
    contextWindow: remote.contextWindow ?? 200_000,
    costPerMillion: cost,
    capabilities: {
      streaming: remote.capabilities?.streaming ?? true,
      toolUse: remote.capabilities?.toolUse ?? false,
      vision: remote.capabilities?.vision ?? false,
      codeExecution: remote.capabilities?.codeExecution ?? false,
      reasoning: remote.capabilities?.reasoning ?? false,
    },
    status: normalizeStatus(remote.status),
  };

  if (remote.maxOutputTokens !== undefined) {
    def.maxOutputTokens = remote.maxOutputTokens;
  }

  return def;
}

// ─── Cache I/O ─────────────────────────────────────────────────────────────

async function readCache(path: string): Promise<CachedCatalog | null> {
  try {
    const raw = await fs.readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (
      typeof parsed.fetchedAt !== 'number' ||
      !parsed.payload ||
      !Array.isArray(parsed.payload.models)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(path: string, cached: CachedCatalog): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(cached, null, 2), 'utf-8');
}

// ─── Fetch ─────────────────────────────────────────────────────────────────

export async function fetchRemoteCatalog(
  url: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<RemoteCatalogResponse> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? FETCH_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'deckent-cli' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new DeckentError(
        'E_CATALOG_FETCH_HTTP',
        `models.dev catalog HTTP ${res.status}`,
      );
    }
    const json = (await res.json()) as RemoteCatalogResponse;
    if (!json || !Array.isArray(json.models)) {
      throw new DeckentError(
        'E_CATALOG_FETCH_SHAPE',
        'models.dev catalog response missing models[]',
      );
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Bundled Fallback ──────────────────────────────────────────────────────

export function getBundledCatalog(): ModelDefinition[] {
  return [...BUILTIN_MODELS];
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Load the model catalog through the 3-stage fallback chain:
 *   1. fresh fetch from models.dev (skipped if offline or cache still warm)
 *   2. cached file at ~/.deckent/cache/models-catalog.json (if <24h old)
 *   3. bundled BUILTIN_MODELS snapshot (always succeeds)
 *
 * Never throws — bundled is the absorber of last resort.
 */
export async function loadCatalog(
  opts: CatalogLoadOptions = {},
): Promise<CatalogLoadResult> {
  const warnings: string[] = [];
  const url = opts.url ?? CATALOG_URL;
  const cachePath = opts.cachePath ?? CACHE_FILE;
  const ttl = opts.ttlMs ?? CACHE_TTL_MS;
  const now = opts.now ?? (() => Date.now());

  // Stage 1 + 2: try cache for warmness check, then decide whether to fetch.
  const cached = await readCache(cachePath);

  if (!opts.offline) {
    const shouldUseCache =
      !opts.forceRefresh &&
      cached !== null &&
      now() - cached.fetchedAt < ttl;

    if (shouldUseCache && cached) {
      return {
        models: mapCatalogToDefinitions(cached.payload, warnings),
        source: 'cache',
        fetchedAt: cached.fetchedAt,
        ageMs: now() - cached.fetchedAt,
        warnings,
      };
    }

    try {
      const fresh = await fetchRemoteCatalog(url, {
        fetchImpl: opts.fetchImpl,
        timeoutMs: opts.timeoutMs,
      });
      const fetchedAt = now();
      await writeCache(cachePath, { fetchedAt, url, payload: fresh }).catch((err: unknown) => {
        warnings.push(`cache-write-failed: ${(err as Error).message}`);
      });
      return {
        models: mapCatalogToDefinitions(fresh, warnings),
        source: 'remote',
        fetchedAt,
        ageMs: 0,
        warnings,
      };
    } catch (err) {
      warnings.push(`remote-fetch-failed: ${(err as Error).message}`);
      // Fall through to cache → bundled.
    }
  } else {
    warnings.push('offline-mode: network skipped');
  }

  if (cached) {
    return {
      models: mapCatalogToDefinitions(cached.payload, warnings),
      source: 'cache',
      fetchedAt: cached.fetchedAt,
      ageMs: now() - cached.fetchedAt,
      warnings,
    };
  }

  return {
    models: getBundledCatalog(),
    source: 'bundled',
    fetchedAt: null,
    ageMs: null,
    warnings,
  };
}

function mapCatalogToDefinitions(
  catalog: RemoteCatalogResponse,
  warnings: string[],
): ModelDefinition[] {
  const defs: ModelDefinition[] = [];
  for (const remote of catalog.models) {
    const mapped = mapRemoteEntry(remote);
    if (mapped) {
      defs.push(mapped);
    } else {
      warnings.push(`skipped-model: ${remote.id ?? '<no-id>'} (provider=${remote.provider})`);
    }
  }
  // If catalog returned zero usable entries, merge bundled as a safety net.
  if (defs.length === 0) {
    warnings.push('catalog-empty: merged bundled fallback');
    return getBundledCatalog();
  }
  return defs;
}

// ─── Bootstrap Helper ──────────────────────────────────────────────────────

let _catalogBootstrapped = false;

interface BootstrapOptions {
  offline?: boolean;
  force?: boolean;
  /** @internal test seam */
  _fetchImpl?: typeof fetch;
  /** @internal test seam */
  _cachePath?: string;
  /** @internal test seam */
  _registry?: { mergeFromCatalog: (models: ModelDefinition[]) => void };
}

/**
 * Bootstrap the global ModelRegistry from the live models.dev catalog.
 * 3-stage fallback: remote fetch → 24h cache → bundled BUILTIN_MODELS.
 * Idempotent: no-op on repeated calls unless force:true is passed.
 * Never throws — network errors fall back silently to bundled models.
 */
export async function bootstrapFromCatalog(opts?: BootstrapOptions): Promise<void> {
  if (_catalogBootstrapped && !opts?.force) return;
  try {
    const result = await loadCatalog({
      offline: opts?.offline,
      forceRefresh: opts?.force,
      fetchImpl: opts?._fetchImpl,
      cachePath: opts?._cachePath,
    });
    const registry = opts?._registry ?? modelRegistry;
    registry.mergeFromCatalog(result.models);
    _catalogBootstrapped = true;
  } catch {
    // silent fallback — loadCatalog never throws, but guard unexpected errors
  }
}
