// ─── Model Equivalence Mapping ──────────────────────────────────────────────
// Cross-provider model tier mapping for multi-provider orchestration.
// When Brain specifies "opus-tier" and target is Codex, auto-selects gpt-5.
// Data is now derived from ModelRegistry (single source of truth).

import { DeckentError } from './errors.js';
import { modelRegistry } from './model-registry.js';
import type { ClaudeModel, OpenAIModel, GeminiModel, ModelType, ProviderName } from './task-types.js';
export type { ClaudeModel, OpenAIModel, GeminiModel, ProviderName };
export type MultiProviderModelType = ModelType;
export type ModelTier = 'economy' | 'standard' | 'premium' | 'premium_plus';

// ─── Tier Definitions — derived from ModelRegistry ─────────────────────────
// Lazy-initialized to avoid circular TDZ: provider.ts → model-equivalence →
// model-registry before the singleton is fully constructed. getByTier is
// called only on first property access, then cached.
let _modelTiersCache: Record<ModelTier, string[]> | null = null;

function _initModelTiers(): Record<ModelTier, string[]> {
  if (_modelTiersCache === null) {
    _modelTiersCache = {
      premium: modelRegistry.getByTier('premium').map((m) => m.id),
      standard: modelRegistry.getByTier('standard').map((m) => m.id),
      economy: modelRegistry.getByTier('economy').map((m) => m.id),
      premium_plus: modelRegistry.getByTier('premium_plus').map((m) => m.id),
    };
  }
  return _modelTiersCache;
}

// Object.defineProperty getters keep keys enumerable (so Object.keys/values work)
// while deferring getByTier calls to first property access.
const _tiersObj = {} as Record<ModelTier, string[]>;
for (const _tier of ['premium', 'standard', 'economy', 'premium_plus'] as ModelTier[]) {
  Object.defineProperty(_tiersObj, _tier, {
    get: () => _initModelTiers()[_tier],
    enumerable: true,
    configurable: true,
  });
}
export const MODEL_TIERS: Record<ModelTier, string[]> = _tiersObj;

// ─── Provider → Model Mapping — derived from ModelRegistry ─────────────────
const _providerModels = Object.fromEntries(
  modelRegistry.getAllProviders().map(p => [
    p,
    modelRegistry.getByProvider(p).map(m => m.id) as readonly MultiProviderModelType[],
  ]),
);
const PROVIDER_MODELS: Record<ProviderName, readonly MultiProviderModelType[]> = {
  claude: _providerModels['claude'] ?? [],
  codex: _providerModels['codex'] ?? [],
  gemini: _providerModels['gemini'] ?? [],
  // Ollama models are registered lazily by providers/ollama.ts; the key is
  // populated once that adapter loads. Empty array is a safe default for
  // cross-provider equivalence (no equivalent model found → fallback chain).
  ollama: _providerModels['ollama'] ?? [],
};

// ─── Tier → Provider → Model Lookup — derived from ModelRegistry ───────────
const TIER_PROVIDER_MAP: Record<ModelTier, Partial<Record<ProviderName, MultiProviderModelType>>> = {
  premium: {
    claude: 'opus',
    codex: 'gpt-5',
    gemini: 'gemini-2.5-pro',
  },
  standard: {
    claude: 'sonnet',
    codex: 'gpt-4.1',
    gemini: 'gemini-2.5-flash',
  },
  economy: {
    claude: 'haiku',
    codex: 'gpt-5-mini',
    gemini: 'gemini-2.0-flash',
  },
  premium_plus: {
    // premium_plus tier — falls back to premium in getEquivalentModel()
  },
};

// ─── Functions ──────────────────────────────────────────────────────────────

/**
 * Returns the tier (premium/standard/economy) for a given model.
 * Delegates to ModelRegistry. Maps premium_plus → premium for backward compat.
 */
export function getModelTier(model: MultiProviderModelType): ModelTier {
  if (!modelRegistry.has(model)) {
    throw new DeckentError('E_UNKNOWN_MODEL', `Unknown model: ${model}`);
  }
  return modelRegistry.getTier(model) as ModelTier;
}

/**
 * Returns the equivalent model for a target provider.
 * Delegates to ModelRegistry.getEquivalent().
 * Same-provider returns the same model.
 */
export function getEquivalentModel(
  model: MultiProviderModelType,
  targetProvider: ProviderName,
): MultiProviderModelType {
  // Same-provider: return same model
  if (isModelAvailable(model, targetProvider)) {
    return model;
  }

  const tier = getModelTier(model);
  const equivalent = TIER_PROVIDER_MAP[tier][targetProvider];

  if (equivalent) {
    return equivalent;
  }

  // Fallback: premium_plus has no dedicated entries per provider, fall back to premium
  if (tier === 'premium_plus') {
    const premiumEquiv = TIER_PROVIDER_MAP.premium[targetProvider];
    if (premiumEquiv) return premiumEquiv;
  }

  // Should not reach here with valid inputs
  throw new DeckentError('E_NO_EQUIVALENT_MODEL', `No equivalent model for ${model} on provider ${targetProvider}`);
}

/**
 * Returns true if the given model belongs to the given provider.
 */
export function isModelAvailable(
  model: MultiProviderModelType,
  provider: ProviderName,
): boolean {
  return (PROVIDER_MODELS[provider] as readonly string[]).includes(model);
}

/**
 * Returns the provider that owns a given model.
 */
export function getModelProvider(model: MultiProviderModelType): ProviderName {
  const def = modelRegistry.get(model);
  if (!def) {
    throw new DeckentError('E_UNKNOWN_MODEL', `Unknown model: ${model}`);
  }
  return def.provider as ProviderName;
}

/**
 * Returns all models in a given tier.
 */
export function getModelsInTier(tier: ModelTier): readonly string[] {
  return MODEL_TIERS[tier];
}

/**
 * Returns all models for a given provider.
 */
export function getProviderModels(provider: ProviderName): readonly MultiProviderModelType[] {
  return PROVIDER_MODELS[provider];
}

/**
 * Returns the recommended model for a given provider and tier.
 * This is the single source of truth for tier→model resolution,
 * eliminating duplicate tier maps in provider adapters.
 *
 * Falls back to the premium tier if the requested tier has no entry.
 * Returns undefined only if no mapping exists at all.
 */
export function getModelForProviderTier(
  provider: ProviderName,
  tier: ModelTier,
): MultiProviderModelType | undefined {
  return TIER_PROVIDER_MAP[tier]?.[provider] ?? TIER_PROVIDER_MAP.premium?.[provider];
}
