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

// Provider → model and tier → provider → model lookups are NO LONGER static
// alias tables. Every resolution below reads the live ModelRegistry so the only
// values ever returned are exact registered API IDs (id === apiId). Reading the
// registry at call time (rather than snapshotting at module load) also avoids the
// circular-import TDZ hazard that forced MODEL_TIERS to be lazy.

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
 * Returns the equivalent model for a target provider as an exact registered API
 * ID (id === apiId). Delegates entirely to ModelRegistry.getEquivalent():
 *   - same provider → the same model id,
 *   - otherwise the ga model matching the source tier (or the next lower tier),
 *   - throws E_UNKNOWN_MODEL for an unregistered source and E_NO_EQUIVALENT_MODEL
 *     when the target provider offers no compatible model (fail loudly — never a
 *     silent Claude-reference default).
 */
export function getEquivalentModel(
  model: MultiProviderModelType,
  targetProvider: ProviderName,
): MultiProviderModelType {
  return modelRegistry.getEquivalent(model, targetProvider);
}

/**
 * Returns true if the given model is a registered model owned by the given
 * provider. Reads the live registry (so dynamically-registered tags count) and
 * never matches a legacy alias — an alias is not a registered id.
 */
export function isModelAvailable(
  model: MultiProviderModelType,
  provider: ProviderName,
): boolean {
  return modelRegistry.get(model)?.provider === provider;
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
 * Returns all registered model IDs for a given provider, read live from the
 * registry (exact API IDs, id === apiId).
 */
export function getProviderModels(provider: ProviderName): readonly MultiProviderModelType[] {
  return modelRegistry.getByProvider(provider).map(m => m.id);
}

/**
 * Returns the recommended model (exact registered API ID) for a given provider
 * and tier, read live from the registry — the single source of truth for
 * tier→model resolution, eliminating duplicate tier maps in provider adapters.
 *
 * Falls back to the provider's premium ga model if the requested tier has no ga
 * entry (e.g. premium_plus on a provider whose flagship is still preview).
 * Returns undefined only when the provider offers no ga model at all.
 */
export function getModelForProviderTier(
  provider: ProviderName,
  tier: ModelTier,
): MultiProviderModelType | undefined {
  return modelRegistry.getByProviderAndTier(provider, tier)?.id
    ?? modelRegistry.getByProviderAndTier(provider, 'premium')?.id;
}
