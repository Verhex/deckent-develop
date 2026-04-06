// ─── Model Registry ─────────────────────────────────────────────────────────
// Single source of truth for all model definitions across providers.
// All other modules (task-types, model-equivalence, providers) delegate here.

import { DeckentError } from './errors.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Provider name — defined here to avoid circular import with task-types.ts */
export type RegistryProviderName = 'claude' | 'codex' | 'gemini';

export type ModelTier = 'economy' | 'standard' | 'premium' | 'premium_plus';

export type ModelStatus = 'ga' | 'preview' | 'deprecated';

export interface ModelCapabilities {
  streaming: boolean;
  toolUse: boolean;
  vision: boolean;
  codeExecution: boolean;
  reasoning: boolean;
}

export interface ModelCost {
  input: number;
  output: number;
}

export interface ModelDefinition {
  id: string;
  apiId: string;
  provider: RegistryProviderName;
  tier: ModelTier;
  contextWindow: number;
  costPerMillion: ModelCost;
  capabilities: ModelCapabilities;
  status: ModelStatus;
  maxOutputTokens?: number;
}

// ─── Built-in Model Catalog ────────────────────────────────────────────────

export const BUILTIN_MODELS: readonly ModelDefinition[] = [
  // Claude (3)
  {
    id: 'opus',
    apiId: 'claude-opus-4-6',
    provider: 'claude',
    tier: 'premium',
    contextWindow: 1_000_000,
    costPerMillion: { input: 15, output: 75 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  },
  {
    id: 'sonnet',
    apiId: 'claude-sonnet-4-6',
    provider: 'claude',
    tier: 'standard',
    contextWindow: 200_000,
    costPerMillion: { input: 3, output: 15 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  },
  {
    id: 'haiku',
    apiId: 'claude-haiku-4-5-20251001',
    provider: 'claude',
    tier: 'economy',
    contextWindow: 200_000,
    costPerMillion: { input: 0.8, output: 4 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  },
  // OpenAI (6)
  {
    id: 'o3',
    apiId: 'o3',
    provider: 'codex',
    tier: 'premium_plus',
    contextWindow: 200_000,
    costPerMillion: { input: 10, output: 40 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
  },
  {
    id: 'gpt-5',
    apiId: 'gpt-5',
    provider: 'codex',
    tier: 'premium',
    contextWindow: 1_000_000,
    costPerMillion: { input: 5, output: 15 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  },
  {
    id: 'gpt-4.1',
    apiId: 'gpt-4.1',
    provider: 'codex',
    tier: 'standard',
    contextWindow: 1_000_000,
    costPerMillion: { input: 2, output: 8 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  },
  {
    id: 'o4-mini',
    apiId: 'o4-mini',
    provider: 'codex',
    tier: 'standard',
    contextWindow: 200_000,
    costPerMillion: { input: 1.1, output: 4.4 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
  },
  {
    id: 'gpt-5-mini',
    apiId: 'gpt-5-mini',
    provider: 'codex',
    tier: 'economy',
    contextWindow: 1_000_000,
    costPerMillion: { input: 1.25, output: 5 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  },
  {
    id: 'gpt-4.1-mini',
    apiId: 'gpt-4.1-mini',
    provider: 'codex',
    tier: 'economy',
    contextWindow: 1_000_000,
    costPerMillion: { input: 0.4, output: 1.6 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  },
  // Gemini (4)
  {
    id: 'gemini-3.1-pro-preview',
    apiId: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    tier: 'premium_plus',
    contextWindow: 2_000_000,
    costPerMillion: { input: 2.5, output: 15 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'preview',
  },
  {
    id: 'gemini-2.5-pro',
    apiId: 'gemini-2.5-pro',
    provider: 'gemini',
    tier: 'premium',
    contextWindow: 1_000_000,
    costPerMillion: { input: 2.5, output: 15 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  },
  {
    id: 'gemini-2.5-flash',
    apiId: 'gemini-2.5-flash',
    provider: 'gemini',
    tier: 'standard',
    contextWindow: 1_000_000,
    costPerMillion: { input: 0.15, output: 0.6 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  },
  {
    id: 'gemini-2.0-flash',
    apiId: 'gemini-2.0-flash',
    provider: 'gemini',
    tier: 'economy',
    contextWindow: 1_000_000,
    costPerMillion: { input: 0.1, output: 0.4 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  },
] as const;

// ─── Tier ordering for comparison ──────────────────────────────────────────

const TIER_ORDER: Record<ModelTier, number> = {
  economy: 0,
  standard: 1,
  premium: 2,
  premium_plus: 3,
};

// ─── ModelRegistry Class ───────────────────────────────────────────────────

export class ModelRegistry {
  private models = new Map<string, ModelDefinition>();

  constructor(builtins: readonly ModelDefinition[] = BUILTIN_MODELS) {
    for (const model of builtins) {
      this.models.set(model.id, model);
    }
  }

  get(id: string): ModelDefinition | undefined {
    return this.models.get(id);
  }

  getOrThrow(id: string): ModelDefinition {
    const model = this.models.get(id);
    if (!model) {
      throw new DeckentError('E_UNKNOWN_MODEL', `Unknown model: ${id}`);
    }
    return model;
  }

  has(id: string): boolean {
    return this.models.has(id);
  }

  getByProvider(provider: RegistryProviderName): ModelDefinition[] {
    return [...this.models.values()].filter(m => m.provider === provider);
  }

  getByTier(tier: ModelTier): ModelDefinition[] {
    return [...this.models.values()].filter(m => m.tier === tier);
  }

  getByProviderAndTier(provider: RegistryProviderName, tier: ModelTier): ModelDefinition | undefined {
    return [...this.models.values()].find(
      m => m.provider === provider && m.tier === tier && m.status === 'ga',
    );
  }

  getEquivalent(modelId: string, targetProvider: RegistryProviderName): string {
    const source = this.getOrThrow(modelId);
    // Same provider — return same model
    if (source.provider === targetProvider) {
      return source.id;
    }
    const equivalent = this.getByProviderAndTier(targetProvider, source.tier);
    if (equivalent) {
      return equivalent.id;
    }
    // Fallback: try one tier down
    const tiers: ModelTier[] = ['premium_plus', 'premium', 'standard', 'economy'];
    const idx = tiers.indexOf(source.tier);
    for (let i = idx + 1; i < tiers.length; i++) {
      const tier = tiers[i];
      if (!tier) continue;
      const fallback = this.getByProviderAndTier(targetProvider, tier);
      if (fallback) return fallback.id;
    }
    throw new DeckentError('E_NO_EQUIVALENT_MODEL', `No equivalent model for ${modelId} on provider ${targetProvider}`);
  }

  getTier(modelId: string): ModelTier {
    return this.getOrThrow(modelId).tier;
  }

  /** Numeric tier for backward compat with task-types.ts getModelTier() */
  getNumericTier(modelId: string): number {
    return TIER_ORDER[this.getTier(modelId)];
  }

  compareTiers(a: ModelTier, b: ModelTier): number {
    return TIER_ORDER[a] - TIER_ORDER[b];
  }

  isAtLeastTier(modelId: string, minTier: ModelTier): boolean {
    const modelTier = this.getTier(modelId);
    return TIER_ORDER[modelTier] >= TIER_ORDER[minTier];
  }

  register(definition: ModelDefinition): void {
    this.models.set(definition.id, definition);
  }

  unregister(id: string): boolean {
    return this.models.delete(id);
  }

  estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const model = this.getOrThrow(modelId);
    return (
      (inputTokens / 1_000_000) * model.costPerMillion.input +
      (outputTokens / 1_000_000) * model.costPerMillion.output
    );
  }

  resolveApiId(modelId: string): string {
    return this.getOrThrow(modelId).apiId;
  }

  getAllModelIds(): string[] {
    return [...this.models.keys()];
  }

  getAllModels(): ModelDefinition[] {
    return [...this.models.values()];
  }

  getAllProviders(): RegistryProviderName[] {
    const providers = new Set<RegistryProviderName>();
    for (const m of this.models.values()) {
      providers.add(m.provider);
    }
    return [...providers];
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

export const modelRegistry = new ModelRegistry();

// ─── Derived type for compile-time safety ──────────────────────────────────

export type BuiltinModelId = (typeof BUILTIN_MODELS)[number]['id'];

/** Backward compat: BuiltinModelId + arbitrary string for runtime-registered models */
export type ModelType = BuiltinModelId | (string & {});
