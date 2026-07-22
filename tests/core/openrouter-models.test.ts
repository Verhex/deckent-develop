// ─── OpenRouter Free-Model Probe tests (task 360-007) ────────────────────────
// Fixture-driven: fetchOpenRouterModels is exercised entirely against an
// injected FetchFn stub — zero real network I/O. Covers the filter/mapping
// contract (":free" suffix AND pricing.prompt === 0), fail-honest throws on
// any malformed/errored response, and the writeFreeModelCache atomic
// write + round-trip read.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fetchOpenRouterModels,
  writeFreeModelCache,
  lookupFreeModel,
  OpenRouterProbeError,
  FREE_MODEL_CACHE_FILE,
  type FetchFn,
} from '../../src/core/openrouter-models.js';

// ─── fixtures ─────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  } as unknown as Response;
}

const MIXED_FIXTURE = {
  data: [
    {
      id: 'meta-llama/llama-3.1-8b-instruct:free',
      pricing: { prompt: '0', completion: '0' },
      context_length: 131072,
      architecture: { modality: 'text->text' },
    },
    {
      // string "0.0000000" must still parse to exactly 0
      id: 'google/gemma-2-9b-it:free',
      pricing: { prompt: '0.0000000', completion: '0' },
      context_length: 8192,
      architecture: { modality: 'text->text' },
    },
    {
      // numeric zero form
      id: 'qwen/qwen-2-7b-instruct:free',
      pricing: { prompt: 0, completion: 0 },
      context_length: 32768,
      architecture: { modality: 'text->text' },
    },
    {
      // missing completion price → excluded even though prompt is zero
      id: 'mistralai/mistral-7b-instruct:free',
      pricing: { prompt: '0' },
    },
    {
      // ":free" suffix but non-zero prompt price → excluded (never trust suffix alone)
      id: 'suspicious/mislabeled:free',
      pricing: { prompt: '0.000002' },
      context_length: 4096,
      architecture: { modality: 'text->text' },
    },
    {
      // paid model, no ":free" suffix → excluded
      id: 'anthropic/claude-3.5-sonnet',
      pricing: { prompt: '0.000003', completion: '0.000015' },
      context_length: 200000,
      architecture: { modality: 'text->text' },
    },
    {
      // pricing missing entirely, but ":free" suffix → excluded (NaN price never satisfies === 0)
      id: 'no-pricing/model:free',
      context_length: 4096,
    },
    {
      // malformed entry: id not a string → skipped without throwing
      id: 12345,
      pricing: { prompt: '0' },
    },
  ],
};

// ─── fetchOpenRouterModels — filter + mapping ────────────────────────────────

describe('fetchOpenRouterModels — filter + mapping', () => {
  it('keeps only exact free ids with both prompt and completion prices equal to zero', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(MIXED_FIXTURE)) as unknown as FetchFn;

    const result = await fetchOpenRouterModels(fetchImpl);

    expect(result).toEqual([
      { id: 'meta-llama/llama-3.1-8b-instruct:free', context: 131072, modality: 'text->text', pricing: { prompt: 0, completion: 0 } },
      { id: 'google/gemma-2-9b-it:free', context: 8192, modality: 'text->text', pricing: { prompt: 0, completion: 0 } },
      { id: 'qwen/qwen-2-7b-instruct:free', context: 32768, modality: 'text->text', pricing: { prompt: 0, completion: 0 } },
    ]);
  });

  it('returns an empty array when no entry qualifies (never fabricates)', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ id: 'anthropic/claude-3.5-sonnet', pricing: { prompt: '0.000003' } }] }),
    ) as unknown as FetchFn;

    const result = await fetchOpenRouterModels(fetchImpl);
    expect(result).toEqual([]);
  });

  it('calls the injected fetchImpl exactly once against the OpenRouter models URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] })) as unknown as FetchFn;
    await fetchOpenRouterModels(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models');
  });
});

// ─── fetchOpenRouterModels — fail-honest on malformed/errored response ───────

describe('fetchOpenRouterModels — fail-honest (never silently degrades)', () => {
  it('throws OpenRouterProbeError when the underlying fetch rejects (network failure)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as FetchFn;

    await expect(fetchOpenRouterModels(fetchImpl)).rejects.toThrow(OpenRouterProbeError);
  });

  it('throws OpenRouterProbeError on a non-OK HTTP status', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({}, { ok: false, status: 503, statusText: 'Service Unavailable' }),
    ) as unknown as FetchFn;

    await expect(fetchOpenRouterModels(fetchImpl)).rejects.toThrow(/HTTP 503/);
  });

  it('throws OpenRouterProbeError when the body is not valid JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    })) as unknown as FetchFn;

    await expect(fetchOpenRouterModels(fetchImpl)).rejects.toThrow(OpenRouterProbeError);
  });

  it('throws OpenRouterProbeError when the response shape has no "data" array', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ models: [] })) as unknown as FetchFn;
    await expect(fetchOpenRouterModels(fetchImpl)).rejects.toThrow(/unexpected shape/);
  });

  it('throws OpenRouterProbeError when the body is null', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(null)) as unknown as FetchFn;
    await expect(fetchOpenRouterModels(fetchImpl)).rejects.toThrow(OpenRouterProbeError);
  });

  it('throws OpenRouterProbeError when "data" is present but not an array', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: 'nope' })) as unknown as FetchFn;
    await expect(fetchOpenRouterModels(fetchImpl)).rejects.toThrow(OpenRouterProbeError);
  });
});

// ─── writeFreeModelCache — atomic write + round-trip ─────────────────────────

describe('writeFreeModelCache — cache round-trip', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openrouter-free-cache-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes .deckent/settings/openrouter-models.json with generatedAt + models', () => {
    const list = [{
      id: 'meta-llama/llama-3.1-8b-instruct:free', context: 131072,
      modality: 'text->text', pricing: { prompt: 0 as const, completion: 0 as const },
    }];

    const returned = writeFreeModelCache(root, list);

    const filePath = join(root, FREE_MODEL_CACHE_FILE);
    expect(existsSync(filePath)).toBe(true);

    const onDisk = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(onDisk.models).toEqual(list);
    expect(onDisk.schemaVersion).toBe(1);
    expect(onDisk.source).toBe('https://openrouter.ai/api/v1/models');
    expect(typeof onDisk.generatedAt).toBe('string');
    expect(new Date(onDisk.generatedAt).toISOString()).toBe(onDisk.generatedAt);
    expect(new Date(onDisk.expiresAt).getTime()).toBeGreaterThan(new Date(onDisk.generatedAt).getTime());
    expect(onDisk.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    // The returned value mirrors exactly what was persisted.
    expect(returned).toEqual(onDisk);
  });

  it('creates the .deckent/settings directory when it does not exist yet', () => {
    expect(existsSync(join(root, '.deckent', 'settings'))).toBe(false);
    writeFreeModelCache(root, []);
    expect(existsSync(join(root, '.deckent', 'settings'))).toBe(true);
  });

  it('persists an empty models array without error', () => {
    writeFreeModelCache(root, []);
    const onDisk = JSON.parse(readFileSync(join(root, FREE_MODEL_CACHE_FILE), 'utf-8'));
    expect(onDisk.models).toEqual([]);
  });

  it('overwrites (never appends) on a second write with different content', () => {
    writeFreeModelCache(root, [{
      id: 'a/model:free', context: 1000, modality: 'text->text', pricing: { prompt: 0, completion: 0 },
    }]);
    writeFreeModelCache(root, [{
      id: 'b/model:free', context: 2000, modality: 'text->text', pricing: { prompt: 0, completion: 0 },
    }]);

    const onDisk = JSON.parse(readFileSync(join(root, FREE_MODEL_CACHE_FILE), 'utf-8'));
    expect(onDisk.models).toEqual([{
      id: 'b/model:free', context: 2000, modality: 'text->text', pricing: { prompt: 0, completion: 0 },
    }]);
  });

  it('returns pricing authority only while the integrity-bound cache is fresh', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const model = {
      id: 'a/model:free', context: 1000, modality: 'text->text',
      pricing: { prompt: 0 as const, completion: 0 as const },
    };
    writeFreeModelCache(root, [model], { now, ttlMs: 60_000 });
    expect(lookupFreeModel(root, model.id, new Date('2026-07-20T12:00:30.000Z')))
      .toMatchObject({
        ...model,
        fetchedAt: '2026-07-20T12:00:00.000Z',
        expiresAt: '2026-07-20T12:01:00.000Z',
      });
    expect(lookupFreeModel(root, model.id, new Date('2026-07-20T12:01:00.000Z')))
      .toBeUndefined();
  });

  it('rejects tampered cache payloads instead of authorizing zero price', () => {
    const model = {
      id: 'a/model:free', context: 1000, modality: 'text->text',
      pricing: { prompt: 0 as const, completion: 0 as const },
    };
    writeFreeModelCache(root, [model]);
    const path = join(root, FREE_MODEL_CACHE_FILE);
    const tampered = JSON.parse(readFileSync(path, 'utf-8'));
    tampered.models[0].id = 'paid/model';
    writeFileSync(path, JSON.stringify(tampered), 'utf-8');
    expect(lookupFreeModel(root, model.id)).toBeUndefined();
  });
});
