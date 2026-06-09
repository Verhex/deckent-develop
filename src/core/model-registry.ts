// ─── Model Registry ─────────────────────────────────────────────────────────
// Single source of truth for all model definitions across providers.
// All other modules (task-types, model-equivalence, providers) delegate here.

import { DeckentError } from './errors.js';
import { OLLAMA_BUILTIN_MODELS } from './ollama-models.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Provider name — defined here to avoid circular import with task-types.ts.
 *
 *  NOTE (Sprint 190 W-F F-11): The local Ollama provider is registered with
 *  a literal `'ollama'` runtime value but kept out of this static type union
 *  because widening it cascades a compile error into task-types.ts
 *  (`getProviderForModel` returns `ProviderName` which is currently 'claude' |
 *  'codex' | 'gemini'). Until task-types.ts gets the matching widen (out of
 *  scope for task 190-009), Ollama model definitions use a `provider` cast
 *  and callers that want Ollama-aware queries pass `'ollama' as RegistryProviderName`.
 *  The runtime catalog still serves Ollama models correctly via
 *  `getByProvider('ollama' as RegistryProviderName)`.
 */
export type RegistryProviderName = 'claude' | 'codex' | 'gemini';

/** Extended provider name including local providers — runtime helper. */
export type RegistryProviderNameExt = RegistryProviderName | 'ollama';

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
// Bundled snapshot = offline last-resort fallback. models.dev catalog is the
// live source of truth; apiId values here must be kept current at build time.

export const BUILTIN_MODELS: readonly ModelDefinition[] = [
  // Claude (4)
  {
    // Claude Fable 5 — Anthropic's most capable widely released model (GA 2026-06-09).
    // Free on Pro/Max/Team subscriptions through 2026-06-22; reverts to $10/$50 paid after.
    // 1M context (Opus 4.7 tokenizer), adaptive thinking always-on, no extended thinking.
    id: 'fable',
    apiId: 'claude-fable-5',
    provider: 'claude',
    tier: 'premium_plus',
    contextWindow: 1_000_000,
    costPerMillion: { input: 10, output: 50 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
  {
    id: 'opus',
    apiId: 'claude-opus-4-8',
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
    // Sprint 248 (Provider Parity): the deckent-facing id stays `gpt-5` (premium
    // codex slot — preserves the 13-model invariant + tier maps), but the wire
    // model is `gpt-5.5`, the current ChatGPT-subscription frontier. A bare
    // `--model gpt-5` is rejected by codex with a ChatGPT account
    // ("model is not supported"); `gpt-5.5` is accepted. The CodexAdapter sends
    // `resolveApiId(model)` so this mapping reaches the CLI. Full first-class
    // gpt-5.5/gpt-5.4-mini ids + per-auth-mode maps are the auto-detect feature.
    apiId: 'gpt-5.5',
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

// ─── Ollama Built-in Models (opt-in) ───────────────────────────────────────
// Re-export from `ollama-models.ts` (Sprint 202 F1 P0) — extracted so
// Pure-Ollama/provider-free config can resolve `getByProviderAndTier('ollama',
// tier)` without depending on the OllamaAdapter side-effect path. Kept out of
// `BUILTIN_MODELS` on purpose so the 13-model / 3-provider invariant holds.
export { OLLAMA_BUILTIN_MODELS } from './ollama-models.js';

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

  getByProviderAndTier(provider: RegistryProviderNameExt, tier: ModelTier): ModelDefinition | undefined {
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

  /** Replace all current entries with the supplied catalog (atomic swap).
   *  Used by bootstrapFromCatalog() after a successful remote/cache fetch. */
  loadFromCatalog(definitions: readonly ModelDefinition[]): void {
    this.models.clear();
    for (const def of definitions) {
      this.models.set(def.id, def);
    }
  }

  /** Merge supplied definitions on top of existing entries (overrides by id).
   *  Bundled entries that share an id with the catalog are replaced; the rest
   *  remain available as a safety net. */
  mergeFromCatalog(definitions: readonly ModelDefinition[]): void {
    for (const def of definitions) {
      this.models.set(def.id, def);
    }
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

// ─── Opt-in: register Ollama models on a target registry ──────────────────
// Called once by `src/providers/ollama.ts` at module-load time. Idempotent:
// re-registering a model is a no-op since `register()` simply re-Map.sets it.
export function registerOllamaModels(registry: ModelRegistry = modelRegistry): void {
  for (const def of OLLAMA_BUILTIN_MODELS) {
    registry.register(def);
  }
}

// ─── On-demand dynamic Ollama tag registration (Sprint 236) ────────────────
// The model-registry is the single source of truth every lookup reads
// (getTier / getProviderForModel / resolveApiId / cost). A locally-pulled
// Ollama tag (e.g. `qwen3.6:27b`) is NOT in the static catalog, so plan-time
// lookups throw "Unknown model" before the OllamaAdapter ever runs. Registering
// the tag on-demand makes it a first-class model across plan→route→spawn in ONE
// move (vs special-casing every callsite). Idempotent. ONLY ollama tags are
// auto-registered here — genuinely-unknown cloud models still throw (real-bug
// signal preserved). tier='standard' routes it like a mid-tier worker; cost=0.
export function ensureOllamaModelRegistered(
  tag: string,
  registry: ModelRegistry = modelRegistry,
): void {
  if (!tag || registry.has(tag)) return;
  registry.register({
    id: tag,
    apiId: tag,
    provider: 'ollama' as unknown as RegistryProviderName,
    tier: 'standard',
    contextWindow: 32_768,
    costPerMillion: { input: 0, output: 0 },
    capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
    status: 'ga',
  });
}

// ─── Catalog Bootstrap (Sprint 190 W-F F-6/F-7) ────────────────────────────

/** Bootstrap the singleton from the live models.dev catalog with 24h cache +
 *  bundled fallback. Safe to call multiple times; idempotent within a process.
 *  Always resolves — falls back to bundled BUILTIN_MODELS if remote + cache
 *  both fail. Use mode='replace' to swap atomically, 'merge' to override
 *  individual ids while keeping bundled safety net. */
export async function bootstrapFromCatalog(
  opts: { mode?: 'replace' | 'merge' } = {},
): Promise<{ source: string; count: number; warnings: string[] }> {
  const mode = opts.mode ?? 'merge';
  const { loadCatalog } = await import('./model-catalog.js');
  const result = await loadCatalog();
  if (mode === 'replace') {
    modelRegistry.loadFromCatalog(result.models);
  } else {
    modelRegistry.mergeFromCatalog(result.models);
  }
  return {
    source: result.source,
    count: result.models.length,
    warnings: result.warnings,
  };
}

// ─── Derived type for compile-time safety ──────────────────────────────────

export type BuiltinModelId = (typeof BUILTIN_MODELS)[number]['id'];

/** Backward compat: BuiltinModelId + arbitrary string for runtime-registered models */
export type ModelType = BuiltinModelId | (string & {});
