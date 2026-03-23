// ─── Model Equivalence Mapping ──────────────────────────────────────────────
// Cross-provider model tier mapping for multi-provider orchestration.
// When Brain specifies "opus-tier" and target is Codex, auto-selects gpt-5.

import { DeckentError } from './errors.js';
import type { ClaudeModel, OpenAIModel, GeminiModel, ModelType, ProviderName } from './task-types.js';
export type { ClaudeModel, OpenAIModel, GeminiModel, ProviderName };
export type MultiProviderModelType = ModelType;
export type ModelTier = 'premium' | 'standard' | 'economy';

// ─── Tier Definitions ───────────────────────────────────────────────────────
export const MODEL_TIERS = {
  premium: ['opus', 'gpt-5', 'gemini-2.5-pro'],
  standard: ['sonnet', 'gpt-4.1', 'o3', 'gemini-2.5-flash'],
  economy: ['haiku', 'gpt-5-mini', 'gpt-4.1-mini', 'o4-mini', 'gemini-2.0-flash'],
} as const;

// ─── Provider → Model Mapping ───────────────────────────────────────────────
const PROVIDER_MODELS: Record<ProviderName, readonly MultiProviderModelType[]> = {
  claude: ['opus', 'sonnet', 'haiku'],
  codex: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};

// ─── Tier → Provider → Model Lookup ────────────────────────────────────────
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
};

// ─── Functions ──────────────────────────────────────────────────────────────

/**
 * Returns the tier (premium/standard/economy) for a given model.
 */
export function getModelTier(model: MultiProviderModelType): ModelTier {
  for (const [tier, models] of Object.entries(MODEL_TIERS)) {
    if ((models as readonly string[]).includes(model)) {
      return tier as ModelTier;
    }
  }
  // Should never reach here with valid MultiProviderModelType
  throw new DeckentError('E_UNKNOWN_MODEL', `Unknown model: ${model}`);
}

/**
 * Returns the equivalent model for a target provider.
 * All tiers now have entries for all providers (gemini-2.0-flash covers economy).
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
  for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
    if ((models as readonly string[]).includes(model)) {
      return provider as ProviderName;
    }
  }
  throw new DeckentError('E_UNKNOWN_MODEL', `Unknown model: ${model}`);
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
