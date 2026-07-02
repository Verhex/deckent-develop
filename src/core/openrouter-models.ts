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

import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { SETTINGS_DIR } from './constants.js';

// ─── Injectable fetch seam ────────────────────────────────────────────────────

export type FetchFn = typeof globalThis.fetch;

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** Root-relative path (under `<projectRoot>/`) to the persisted free-model cache. */
export const FREE_MODEL_CACHE_FILE = join(SETTINGS_DIR, 'openrouter-models.json');

// ─── External API shape (only the fields this probe needs) ───────────────────

interface OpenRouterPricing {
  prompt?: string | number;
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
}

// ─── Filtering ────────────────────────────────────────────────────────────────

function parsePromptPrice(raw: string | number | undefined): number {
  if (raw === undefined || raw === null) return NaN;
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return n;
}

/** A model qualifies only when BOTH hold: the id carries the `:free` suffix AND
 *  the prompt price parses to exactly 0. Either signal alone is not trusted —
 *  a `:free`-suffixed id with a non-zero parsed price is excluded rather than
 *  silently accepted. */
function isFreeModel(entry: OpenRouterModelEntry): boolean {
  if (typeof entry.id !== 'string' || !entry.id.endsWith(':free')) return false;
  const price = parsePromptPrice(entry.pricing?.prompt);
  return Number.isFinite(price) && price === 0;
}

function toFreeModel(entry: OpenRouterModelEntry): OpenRouterFreeModel {
  return {
    id: entry.id,
    context: typeof entry.context_length === 'number' ? entry.context_length : 0,
    modality: entry.architecture?.modality ?? 'unknown',
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
  generatedAt: string;
  models: OpenRouterFreeModel[];
}

/**
 * Persist `list` to `<root>/.deckent/settings/openrouter-models.json`. Atomic
 * write (tmp file + rename, best-effort unlink of the tmp file on a failed
 * rename) — the same pattern `approval-allowscope.ts` uses for its on-disk
 * state. `generatedAt` is stamped fresh on every call, so re-running the probe
 * never silently reuses a stale timestamp.
 */
export function writeFreeModelCache(root: string, list: OpenRouterFreeModel[]): FreeModelCache {
  const filePath = join(root, FREE_MODEL_CACHE_FILE);
  const cache: FreeModelCache = {
    generatedAt: new Date().toISOString(),
    models: list,
  };

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
