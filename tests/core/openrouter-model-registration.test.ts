// ─── OPENROUTER-PROVIDER (row 477) — model registration + adapter routing ────
//
// Covers the ROOT CAUSE of the OpenRouter integration gap: `providers/openrouter.ts`
// registered no models at all, so every `isModelAvailable(*, 'openrouter')` was
// structurally false and any OpenRouter id threw `UnknownModelError` at plan time,
// long before the adapter could run.
//
// The two registry landmines these tests pin are NOT hypothetical:
//   1. `inferProviderFromId` classifies any id containing ':' as 'ollama' — and
//      EVERY free OpenRouter id ends in ':free'.
//   2. `buildParametricModel` defaults to status 'preview', while
//      `getByProviderAndTier` only returns status 'ga'.
// A regression in either would leave the model registered-but-unroutable, which is
// exactly the silent-failure shape this row exists to remove.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModelRegistry,
  buildParametricModel,
  ensureOpenRouterModelRegistered,
} from '../../src/core/model-registry.js';
import { DeckentError } from '../../src/core/errors.js';
import { isAdapterProvider } from '../../src/orchestra/sprint-utils.js';

// A real OpenRouter free id — carries both the `provider/slug` shape and the
// `:free` suffix that triggers landmine #1.
const FREE_ID = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const PAID_ID = 'anthropic/claude-sonnet-5';
const VERIFIED_FREE_FACTS = {
  costPerMillion: { input: 0, output: 0 },
  pricingEvidenceRef: 'openrouter-model-pricing:verified-free-0001',
} as const;

describe('ensureOpenRouterModelRegistered — row 477 root-cause fix', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  it('registers an OpenRouter id that was previously unresolvable', () => {
    expect(registry.has(FREE_ID)).toBe(false);
    ensureOpenRouterModelRegistered(FREE_ID, VERIFIED_FREE_FACTS, registry);
    expect(registry.has(FREE_ID)).toBe(true);
  });

  it('LANDMINE 1 — a ":free" id resolves to openrouter, NOT ollama', () => {
    // `inferProviderFromId` reads ':' as an Ollama tag. The helper must pass
    // `provider` explicitly so inference is never consulted for these ids.
    ensureOpenRouterModelRegistered(FREE_ID, VERIFIED_FREE_FACTS, registry);
    expect(registry.get(FREE_ID)?.provider).toBe('openrouter');
  });

  it('LANDMINE 2 — registers as status "ga" so tier resolution can see it', () => {
    // A 'preview' entry registers fine but is invisible to
    // `getByProviderAndTier`, which filters to 'ga' — registered-but-unroutable.
    ensureOpenRouterModelRegistered(FREE_ID, VERIFIED_FREE_FACTS, registry);
    expect(registry.get(FREE_ID)?.status).toBe('ga');
    expect(registry.getByProviderAndTier('openrouter', 'standard')?.id).toBe(FREE_ID);
  });

  it('keeps id === apiId verbatim (row 608 canonical-id rule — no Deckent alias)', () => {
    ensureOpenRouterModelRegistered(FREE_ID, VERIFIED_FREE_FACTS, registry);
    const def = registry.get(FREE_ID);
    expect(def?.id).toBe(FREE_ID);
    expect(def?.apiId).toBe(FREE_ID);
  });

  it('applies caller-supplied facts over the conservative defaults', () => {
    ensureOpenRouterModelRegistered(FREE_ID, {
      ...VERIFIED_FREE_FACTS, contextWindow: 1_000_000, reasoning: true,
    }, registry);
    const def = registry.get(FREE_ID);
    // nemotron-3-ultra is a 1M-context reasoning model; the 128k/false defaults
    // are deliberately conservative, never a claim about a specific model.
    expect(def?.contextWindow).toBe(1_000_000);
    expect(def?.capabilities.reasoning).toBe(true);
  });

  it('falls back to conservative defaults when no facts are supplied', () => {
    ensureOpenRouterModelRegistered(FREE_ID, VERIFIED_FREE_FACTS, registry);
    const def = registry.get(FREE_ID);
    expect(def?.contextWindow).toBe(128_000);
    expect(def?.costPerMillion).toEqual({ input: 0, output: 0 });
  });

  it('is idempotent and never clobbers an existing richer entry', () => {
    ensureOpenRouterModelRegistered(FREE_ID, { ...VERIFIED_FREE_FACTS, contextWindow: 1_000_000 }, registry);
    ensureOpenRouterModelRegistered(FREE_ID, { ...VERIFIED_FREE_FACTS, contextWindow: 128_000 }, registry);
    expect(registry.get(FREE_ID)?.contextWindow).toBe(1_000_000);
  });

  it('ignores an empty id instead of registering junk', () => {
    ensureOpenRouterModelRegistered('', {}, registry);
    expect(registry.has('')).toBe(false);
  });

  it('rejects an unknown paid id before registry mutation instead of pricing it as free', () => {
    expect(() => ensureOpenRouterModelRegistered(PAID_ID, {}, registry)).toThrowError(
      expect.objectContaining<Partial<DeckentError>>({ code: 'E_MODEL_PRICING_UNVERIFIED' }),
    );
    expect(registry.has(PAID_ID)).toBe(false);
  });

  it('rejects a deceptive suffix and invalid explicit zero pricing', () => {
    for (const modelId of ['vendor/model:free-preview', 'vendor/model:free/v2']) {
      expect(() => ensureOpenRouterModelRegistered(modelId, {}, registry)).toThrowError(
        expect.objectContaining<Partial<DeckentError>>({ code: 'E_MODEL_PRICING_UNVERIFIED' }),
      );
      expect(registry.has(modelId)).toBe(false);
    }
    expect(() => ensureOpenRouterModelRegistered(PAID_ID, {
      costPerMillion: { input: 0, output: 0 },
    }, registry)).toThrowError(expect.objectContaining<Partial<DeckentError>>({
      code: 'E_MODEL_PRICING_UNVERIFIED',
    }));
  });

  it('registers a paid exact API id only when explicit pricing is present', () => {
    ensureOpenRouterModelRegistered(PAID_ID, {
      costPerMillion: { input: 3, output: 15 },
      pricingEvidenceRef: 'openrouter-model-pricing:paid-0001',
      contextWindow: 1_000_000,
    }, registry);
    expect(registry.get(PAID_ID)).toMatchObject({
      id: PAID_ID,
      apiId: PAID_ID,
      provider: 'openrouter',
      costPerMillion: { input: 3, output: 15 },
    });
  });

  it('applies the same paid-model gate to generic parametric resolution', () => {
    expect(() => buildParametricModel(PAID_ID, { provider: 'openrouter' })).toThrowError(
      expect.objectContaining<Partial<DeckentError>>({ code: 'E_MODEL_PRICING_UNVERIFIED' }),
    );
    expect(buildParametricModel(FREE_ID, {
      provider: 'openrouter',
      ...VERIFIED_FREE_FACTS,
    }).costPerMillion)
      .toEqual({ input: 0, output: 0 });
  });

  it('rejects a free suffix without fresh pricing evidence', () => {
    expect(() => ensureOpenRouterModelRegistered(FREE_ID, {}, registry)).toThrowError(
      expect.objectContaining<Partial<DeckentError>>({ code: 'E_MODEL_PRICING_UNVERIFIED' }),
    );
    expect(registry.has(FREE_ID)).toBe(false);
  });
});

describe('isAdapterProvider — openrouter joins the host-adapter set (row 477)', () => {
  it('returns true for openrouter, so spawn prefers adapter.spawn() over the docker backend', () => {
    // OpenRouter resolves its key host-side from `.deck` and launches the same
    // `http-agentic-worker` entry as OpenAICompatibleAdapter. Reaching the docker
    // backend would degrade the task to the `claude` CLI — the failure this
    // predicate exists to prevent.
    expect(isAdapterProvider('openrouter')).toBe(true);
  });

  it('leaves the pre-existing contract untouched', () => {
    expect(isAdapterProvider('ollama')).toBe(true);
    expect(isAdapterProvider('codex')).toBe(true);
    expect(isAdapterProvider('gemini')).toBe(true);
    expect(isAdapterProvider('claude')).toBe(false);
  });
});
