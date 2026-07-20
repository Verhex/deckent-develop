// ─── OpenRouter Free-Model Probe (OPENROUTER-FREE-PROBE, Sprint 360 task 360-007) ──
// Narrow, single-purpose module: fetch OpenRouter's public model list and keep only
// the zero-cost `:free`-suffixed entries, then cache that inventory to disk.
//
// Deliberately NOT the same contract as `catalog/openrouter-source.ts` (the model
// CATALOG enrichment source, which is fail-SOFT — any error there returns `[]` so a
// flaky OpenRouter endpoint never aborts a catalog sync). This probe is fail-HONEST:
// a network error, non-OK status, or unexpected response shape THROWS
// {@link OpenRouterProbeError} rather than degrading to an empty/partial list — the
// caller (a host-side CC run, never a worker) must know the probe did not complete,
// so it never persists a fabricated or silently-truncated "free model" inventory.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { SETTINGS_DIR } from './constants.js';
import { ensureOpenRouterModelRegistered } from './model-registry.js';

// ─── Injectable fetch seam ────────────────────────────────────────────────────

export type FetchFn = typeof globalThis.fetch;

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
export const OPENROUTER_FREE_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

/** Root-relative path (under `<projectRoot>/`) to the persisted free-model cache. */
export const FREE_MODEL_CACHE_FILE = join(SETTINGS_DIR, 'openrouter-models.json');

// ─── External API shape (only the fields this probe needs) ───────────────────

interface OpenRouterPricing {
  prompt?: string | number;
  completion?: string | number;
  [key: string]: unknown;
}

interface OpenRouterArchitecture {
  modality?: string;
}

interface OpenRouterModelEntry {
  id: string;
  pricing?: OpenRouterPricing;
  context_length?: number;
  architecture?: OpenRouterArchitecture;
}

interface OpenRouterModelsResponse {
  data: OpenRouterModelEntry[];
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/** Thrown by {@link fetchOpenRouterModels} on any network failure, non-OK HTTP
 *  status, non-JSON body, or a body whose shape isn't `{ data: [...] }`. Never
 *  swallowed into an empty list — this probe never fabricates its result. */
export class OpenRouterProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenRouterProbeError';
  }
}

// ─── Result shape ─────────────────────────────────────────────────────────────

/** One zero-cost OpenRouter `:free` model, reduced to the fields this probe cares
 *  about — id (for routing), context window, and modality (text/vision/etc). */
export interface OpenRouterFreeModel {
  id: string;
  context: number;
  modality: string;
  pricing: { prompt: 0; completion: 0 };
}

// ─── Filtering ────────────────────────────────────────────────────────────────

function parsePrice(raw: string | number | undefined): number {
  if (raw === undefined || raw === null) return NaN;
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return n;
}

/** A model qualifies only when the exact free suffix and both token prices agree. */
function isFreeModel(entry: OpenRouterModelEntry): boolean {
  if (typeof entry.id !== 'string' || !entry.id.endsWith(':free')) return false;
  const prompt = parsePrice(entry.pricing?.prompt);
  const completion = parsePrice(entry.pricing?.completion);
  return Number.isFinite(prompt) && prompt === 0
    && Number.isFinite(completion) && completion === 0;
}

function toFreeModel(entry: OpenRouterModelEntry): OpenRouterFreeModel {
  return {
    id: entry.id,
    context: typeof entry.context_length === 'number' ? entry.context_length : 0,
    modality: entry.architecture?.modality ?? 'unknown',
    pricing: { prompt: 0, completion: 0 },
  };
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch `https://openrouter.ai/api/v1/models` and reduce it to the zero-cost
 * `:free` inventory. Fail-honest by contract: any error THROWS
 * {@link OpenRouterProbeError} instead of returning a partial or empty list.
 *
 * @param fetchImpl - injectable fetch seam for hermetic tests; defaults to
 *   `globalThis.fetch`. Tests MUST inject a stub — never hit the real network.
 */
export async function fetchOpenRouterModels(fetchImpl: FetchFn = globalThis.fetch): Promise<OpenRouterFreeModel[]> {
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_MODELS_URL);
  } catch (err) {
    throw new OpenRouterProbeError(
      `OpenRouter models fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new OpenRouterProbeError(`OpenRouter models fetch failed: HTTP ${response.status} ${response.statusText}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new OpenRouterProbeError(
      `OpenRouter models response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof payload !== 'object' || payload === null || !Array.isArray((payload as OpenRouterModelsResponse).data)) {
    throw new OpenRouterProbeError('OpenRouter models response has unexpected shape (missing "data" array)');
  }

  const models: OpenRouterFreeModel[] = [];
  for (const entry of (payload as OpenRouterModelsResponse).data) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') continue;
    if (!isFreeModel(entry)) continue;
    models.push(toFreeModel(entry));
  }

  return models;
}

// ─── Cache write ──────────────────────────────────────────────────────────────

/** On-disk shape of `.deckent/settings/openrouter-models.json`. */
export interface FreeModelCache {
  schemaVersion: 1;
  source: typeof OPENROUTER_MODELS_URL;
  generatedAt: string;
  expiresAt: string;
  models: OpenRouterFreeModel[];
  payloadHash: string;
}

interface FreeModelCachePayload extends Omit<FreeModelCache, 'payloadHash'> {}

function cachePayloadHash(payload: FreeModelCachePayload): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function isCanonicalIso(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isVerifiedFreeModel(value: unknown): value is OpenRouterFreeModel {
  if (typeof value !== 'object' || value === null) return false;
  const model = value as Partial<OpenRouterFreeModel>;
  return typeof model.id === 'string' && model.id.endsWith(':free')
    && typeof model.context === 'number' && Number.isFinite(model.context) && model.context >= 0
    && typeof model.modality === 'string' && model.modality.length > 0
    && model.pricing?.prompt === 0 && model.pricing.completion === 0;
}

/**
 * Persist `list` to `<root>/.deckent/settings/openrouter-models.json`. Atomic
 * write (tmp file + rename, best-effort unlink of the tmp file on a failed
 * rename) — the same pattern `approval-allowscope.ts` uses for its on-disk
 * state. `generatedAt` is stamped fresh on every call, so re-running the probe
 * never silently reuses a stale timestamp.
 */
export function writeFreeModelCache(
  root: string,
  list: OpenRouterFreeModel[],
  options: { now?: Date; ttlMs?: number } = {},
): FreeModelCache {
  if (!list.every(isVerifiedFreeModel)) {
    throw new OpenRouterProbeError('OpenRouter free-model cache contains unverified pricing');
  }
  const filePath = join(root, FREE_MODEL_CACHE_FILE);
  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? OPENROUTER_FREE_CACHE_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new OpenRouterProbeError('OpenRouter free-model cache TTL must be positive');
  }
  const payload: FreeModelCachePayload = {
    schemaVersion: 1,
    source: OPENROUTER_MODELS_URL,
    generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    models: list,
  };
  const cache: FreeModelCache = { ...payload, payloadHash: cachePayloadHash(payload) };

  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup — the rename error below is what the caller needs.
    }
    throw err;
  }

  return cache;
}

// ─── Cache read ───────────────────────────────────────────────────────────────

/**
 * Read the `:free` inventory previously written by `openrouter-probe`
 * (OPENROUTER-PROVIDER, row 477). Until this existed the cache was write-only —
 * the probe persisted it and nothing ever consumed it.
 *
 * SOFT by contract, unlike {@link fetchOpenRouterModels}: a missing, unreadable,
 * or malformed cache returns `undefined` rather than throwing. The distinction is
 * deliberate — a failed live probe means "the operator asked for fresh data and
 * did not get it" (loud), whereas an absent cache simply means "the probe has not
 * run here yet" (normal on a fresh checkout, and callers have a default).
 */
export function readFreeModelCache(root: string): FreeModelCache | undefined {
  const filePath = join(root, FREE_MODEL_CACHE_FILE);
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const cache = parsed as Partial<FreeModelCache>;
    if (cache.schemaVersion !== 1 || cache.source !== OPENROUTER_MODELS_URL
      || typeof cache.generatedAt !== 'string' || !isCanonicalIso(cache.generatedAt)
      || typeof cache.expiresAt !== 'string' || !isCanonicalIso(cache.expiresAt)
      || Date.parse(cache.expiresAt) <= Date.parse(cache.generatedAt)
      || !Array.isArray(cache.models) || !cache.models.every(isVerifiedFreeModel)
      || typeof cache.payloadHash !== 'string') return undefined;
    const payload: FreeModelCachePayload = {
      schemaVersion: 1,
      source: OPENROUTER_MODELS_URL,
      generatedAt: cache.generatedAt,
      expiresAt: cache.expiresAt,
      models: cache.models,
    };
    if (cachePayloadHash(payload) !== cache.payloadHash) return undefined;
    return { ...payload, payloadHash: cache.payloadHash };
  } catch {
    return undefined;
  }
}

/**
 * Look one model id up in the on-disk `:free` inventory. Returns `undefined` when
 * the cache is absent or does not carry that id — callers fall back to their own
 * conservative defaults (see `ensureOpenRouterModelRegistered`), so a stale or
 * missing cache degrades context-window accuracy, never correctness.
 */
export interface VerifiedOpenRouterFreeModel extends OpenRouterFreeModel {
  pricingEvidenceRef: string;
  fetchedAt: string;
  expiresAt: string;
}

export function lookupFreeModel(
  root: string,
  modelId: string,
  at: Date = new Date(),
): VerifiedOpenRouterFreeModel | undefined {
  const cache = readFreeModelCache(root);
  if (!cache || at.getTime() < Date.parse(cache.generatedAt)
    || at.getTime() >= Date.parse(cache.expiresAt)) return undefined;
  const model = cache.models.find((item) => item.id === modelId);
  if (!model) return undefined;
  return {
    ...model,
    pricingEvidenceRef: `openrouter-model-pricing:${cache.payloadHash}`,
    fetchedAt: cache.generatedAt,
    expiresAt: cache.expiresAt,
  };
}

/**
 * Register `modelId` in the model registry from the verified probe cache, when
 * the cache carries it (OPENROUTER-PROVIDER, row 477).
 *
 * The ONE shared pre-registration seam for every surface that resolves an
 * OpenRouter model identity BEFORE spawn — `deckent run`, the MCP run tool, and
 * the autonomous planner all call `resolveExecutionModelIdentity`, whose
 * parametric path enforces the pricing-evidence gate (`E_MODEL_PRICING_UNVERIFIED`)
 * and has no disk access of its own (it is deliberately pure). Without this
 * call-first seam, every one of those surfaces throws for an id the probe has
 * already verified — the exact breakage found live on 2026-07-20 when the gate
 * landed wired only into the spawn path.
 *
 * Returns true when the id was registered (or already present), false when the
 * cache is absent/expired or does not carry the id — the caller lets the
 * downstream gate fail honestly in that case (an unprobed model must NOT be
 * silently priced as free; the remedy is `deckent openrouter-probe`).
 */
export function registerOpenRouterModelFromCache(root: string, modelId: string): boolean {
  const cached = lookupFreeModel(root, modelId);
  if (!cached) return false;
  // Deferred import shape not needed: model-registry has no import back into
  // this module (comment-only reference), so this static import cannot cycle.
  ensureOpenRouterModelRegistered(modelId, {
    contextWindow: cached.context,
    costPerMillion: { input: cached.pricing.prompt, output: cached.pricing.completion },
    pricingEvidenceRef: cached.pricingEvidenceRef,
  });
  return true;
}
