// ─── Provider Capability Matrix ─────────────────────────────────────────────
// Defines what each provider can do: features, context limits, cost.

import type { ProviderName } from './model-equivalence.js';
import { getModelProvider } from './model-equivalence.js';
import type { ModelType } from './task-types.js';
import { DeckentError } from './errors.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProviderCapability {
  streaming: boolean;
  toolUse: boolean;
  vision: boolean;
  codeExecution: boolean;
  maxContextTokens: number;
  costPerMillionTokens: { input: number; output: number };
}

// ─── Capability Data ────────────────────────────────────────────────────────

const PROVIDER_CAPABILITIES: Record<ProviderName, ProviderCapability> = {
  claude: {
    streaming: true,
    toolUse: true,
    vision: true,
    codeExecution: true,
    maxContextTokens: 200_000,
    costPerMillionTokens: { input: 15, output: 75 },
  },
  codex: {
    streaming: true,
    toolUse: true,
    vision: true,
    codeExecution: true,
    maxContextTokens: 1_047_576,
    costPerMillionTokens: { input: 2, output: 8 },
  },
  gemini: {
    streaming: true,
    toolUse: true,
    vision: true,
    codeExecution: true,
    maxContextTokens: 1_048_576,
    costPerMillionTokens: { input: 1.25, output: 10 },
  },
};

// ─── Valid provider names (for runtime validation) ──────────────────────────

const VALID_PROVIDERS = new Set<string>(Object.keys(PROVIDER_CAPABILITIES));

function assertValidProvider(provider: string): asserts provider is ProviderName {
  if (!VALID_PROVIDERS.has(provider)) {
    throw new DeckentError(
      'DECKENT_E070',
      `Unknown provider: "${provider}". Valid providers: ${[...VALID_PROVIDERS].join(', ')}`,
      `Use one of: ${[...VALID_PROVIDERS].join(', ')}`,
    );
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the full capability descriptor for a provider.
 * Throws DeckentError if provider is unknown.
 */
export function getCapabilities(provider: ProviderName): ProviderCapability {
  assertValidProvider(provider);
  return { ...PROVIDER_CAPABILITIES[provider] };
}

/**
 * Get all providers that have a given boolean capability set to true,
 * or (for numeric capabilities) have a non-zero value.
 */
export function getProvidersWithCapability(capability: keyof ProviderCapability): ProviderName[] {
  const result: ProviderName[] = [];
  for (const [name, caps] of Object.entries(PROVIDER_CAPABILITIES)) {
    const value = caps[capability];
    if (typeof value === 'boolean' && value) {
      result.push(name as ProviderName);
    } else if (typeof value === 'number' && value > 0) {
      result.push(name as ProviderName);
    } else if (typeof value === 'object' && value !== null) {
      // costPerMillionTokens — always "has" this capability
      result.push(name as ProviderName);
    }
  }
  return result;
}

/**
 * Check whether a provider meets all the given requirements.
 * For boolean fields: provider must have `true` if requirement is `true`.
 * For numeric fields: provider value must be >= requirement value.
 * For costPerMillionTokens: provider cost must be <= requirement cost (cheaper = better).
 * Throws DeckentError if provider is unknown.
 */
export function canProviderHandle(
  provider: ProviderName,
  requirements: Partial<ProviderCapability>,
): boolean {
  assertValidProvider(provider);
  const caps = PROVIDER_CAPABILITIES[provider];

  for (const [key, required] of Object.entries(requirements)) {
    const k = key as keyof ProviderCapability;
    const actual = caps[k];

    if (typeof required === 'boolean') {
      if (required && !actual) return false;
    } else if (typeof required === 'number') {
      if ((actual as number) < required) return false;
    } else if (typeof required === 'object' && required !== null && typeof actual === 'object' && actual !== null) {
      // costPerMillionTokens: provider cost must be <= budget
      const reqCost = required as { input: number; output: number };
      const actCost = actual as { input: number; output: number };
      if (actCost.input > reqCost.input || actCost.output > reqCost.output) return false;
    }
  }

  return true;
}

/**
 * Get all provider names.
 */
export function getAllProviders(): ProviderName[] {
  return Object.keys(PROVIDER_CAPABILITIES) as ProviderName[];
}

/**
 * Get capabilities for a specific model by resolving its provider first.
 * This enables model-level capability queries without duplicating data per-model.
 *
 * When ModelRegistry (Task 1) lands, this will delegate to per-model definitions.
 * For now, returns the provider-level capabilities as a reasonable approximation.
 */
export function getModelCapabilities(modelId: ModelType): ProviderCapability {
  try {
    const provider = getModelProvider(modelId);
    return { ...PROVIDER_CAPABILITIES[provider] };
  } catch {
    // Unknown model — return a conservative default
    return {
      streaming: true,
      toolUse: true,
      vision: false,
      codeExecution: false,
      maxContextTokens: 200_000,
      costPerMillionTokens: { input: 3, output: 15 },
    };
  }
}
