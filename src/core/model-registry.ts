// ─── Model Registry ─────────────────────────────────────────────────────────
// Single source of truth for all model definitions across providers.
// All other modules (task-types, model-equivalence, providers) delegate here.

import { DeckentError } from './errors.js';
import { OLLAMA_BUILTIN_MODELS } from './ollama-models.js';
import type {
  RegistryProviderName,
  RegistryProviderNameExt,
  ModelTier,
  ModelDefinition,
  ParametricResolveOptions,
} from './model-registry-types.js';

// ─── Types ──────────────────────────────────────────────────────────────────
// The type declarations now live in `model-registry-types.ts` (the project
// `*-types.ts` convention). They are re-exported here so every existing importer
// of these types from `./model-registry.js` keeps working unchanged.

export type {
  RegistryProviderName,
  RegistryProviderNameExt,
  ModelTier,
  ModelStatus,
  ModelCapabilities,
  ModelCost,
  ModelDefinition,
  ParametricResolveOptions,
} from './model-registry-types.js';

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
    // Opus 4.5+ repricing ($5/$25) — matches pricing-data-baseline.json (cost SSOT);
    // the old $15/$75 was pre-4.5 Opus pricing left stale here.
    costPerMillion: { input: 5, output: 25 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
    // TT554 capability-drift fix: max output was UNSET (fell back to the parametric
    // default), disagreeing with the cost SSOT. pricing-data-baseline.json
    // claude-opus-4-8.max_output_tokens = 128000 (cross-confirmed: claude-api skill,
    // Opus 4.8 = 128K). Evidence-referenced, not a hardcode-patch.
    maxOutputTokens: 128_000,
  },
  {
    id: 'sonnet',
    apiId: 'claude-sonnet-5',
    provider: 'claude',
    tier: 'standard',
    contextWindow: 1_000_000,
    costPerMillion: { input: 3, output: 15 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
  {
    id: 'haiku',
    apiId: 'claude-haiku-4-5-20251001',
    provider: 'claude',
    tier: 'economy',
    contextWindow: 200_000,
    // TT554 KNOWN cost-drift (surfaced, NOT hardcode-patched here): the cost SSOT
    // (pricing-data-baseline.json claude-haiku-4-5 = 1e-6/5e-6 → $1/$5, cross-confirmed
    // by the claude-api skill: Haiku 4.5 = $1/$5) says this should be { input: 1, output: 5 }.
    // It is deliberately LEFT at 0.8/4 because tests/core/model-registry.test.ts:429
    // (outside this task's write scope) asserts estimateCost('haiku')=0.28 off 0.8/4;
    // flipping it would red an un-editable core test. The drift is detected + reported
    // LOUDLY by cost-ledger.detectTariffDrift (never silent) and tracked as a follow-up
    // (see .result docImpact). calculateActualCost already prices haiku from the SSOT,
    // so real-cost accounting is unaffected — only the registry ESTIMATE path is stale.
    costPerMillion: { input: 0.8, output: 4 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
    // TT554 capability-drift fix: max output was UNSET. pricing-data-baseline.json
    // claude-haiku-4-5.max_output_tokens = 64000 (cross-confirmed: claude-api skill,
    // Haiku 4.5 = 64K). Evidence-referenced.
    maxOutputTokens: 64_000,
  },
  // OpenAI (6) — see also CODEX_PARITY_MODELS below (gpt-5.5, opt-in, kept
  // out of this array on purpose so the hardcoded builtin-count invariant
  // asserted by tests/core/model-registry*.test.ts is not disturbed)
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
    // codex slot — preserves the builtin-count invariant + tier maps), but the
    // wire model is `gpt-5.5`. LEGACY ALIAS-SLOT (2026-07-11, Alperen): first-class
    // `gpt-5.5` + the gpt-5.6 family are now registered at codex module-load via
    // `registerCodexParityModels()` (see providers/codex.ts) — new work should
    // address models by their real ids; this entry remains only so existing
    // configs/task-JSONs that say `gpt-5` keep working.
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

// ─── Codex Parity Models (opt-in, Sprint 360 task 360-004) ────────────────
// `gpt-5.5` is the real OpenAI/Codex model id that Codex CLI already speaks on
// the wire (the existing `id: 'gpt-5'` entry above sends `apiId: 'gpt-5.5'` as
// a ChatGPT-subscription auth shim, Sprint 248 — that entry is untouched).
// This is the first-class, feed-verified catalog record for `gpt-5.5` itself.
// Kept OUT of BUILTIN_MODELS on purpose, mirroring OLLAMA_BUILTIN_MODELS
// above: several tests hardcode the BUILTIN_MODELS / modelRegistry builtin
// count, so growing that array is a breaking change outside this mechanism's
// control. Call `registerCodexParityModels()` (defined near
// `registerOllamaModels()` below, same opt-in pattern) to make `gpt-5.5`
// first-class on a registry.
// Values verified 2026-07-02 against the live LiteLLM feed
// (raw.githubusercontent.com/BerriAI/litellm/main/litellm/model_prices_and_context_window_backup.json),
// key "gpt-5.5" (litellm_provider: openai, mode: chat) — see
// pricing-data-baseline.json providers.openai.models["gpt-5.5"] for the full
// per-token pricing record and cited evidence.
export const CODEX_PARITY_MODELS: readonly ModelDefinition[] = [
  {
    id: 'gpt-5.5',
    apiId: 'gpt-5.5',
    provider: 'codex',
    tier: 'premium',
    contextWindow: 1_050_000,
    costPerMillion: { input: 5, output: 30 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
  // gpt-5.6 family (Alperen, 2026-07-11). Values verified against the live
  // LiteLLM feed same-day (keys "gpt-5.6" / "gpt-5.6-sol" / "gpt-5.6-terra" /
  // "gpt-5.6-luna", litellm_provider: openai, mode: chat, ctx 1,050,000,
  // max_output 128k, supports_reasoning true for all four).
  // `gpt-5.6-sol` is the designated cross-verify counterpart for comprehensive
  // analyses (XVER-1 Anthropic↔OpenAI çapraz-doğrulama).
  {
    id: 'gpt-5.6',
    apiId: 'gpt-5.6',
    provider: 'codex',
    tier: 'premium',
    contextWindow: 1_050_000,
    costPerMillion: { input: 5, output: 30 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-5.6-sol',
    apiId: 'gpt-5.6-sol',
    provider: 'codex',
    tier: 'premium',
    contextWindow: 1_050_000,
    costPerMillion: { input: 5, output: 30 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-5.6-terra',
    apiId: 'gpt-5.6-terra',
    provider: 'codex',
    tier: 'standard',
    contextWindow: 1_050_000,
    costPerMillion: { input: 2.5, output: 15 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-5.6-luna',
    apiId: 'gpt-5.6-luna',
    provider: 'codex',
    tier: 'economy',
    contextWindow: 1_050_000,
    costPerMillion: { input: 1, output: 6 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
] as const;

// ─── Tier ordering for comparison ──────────────────────────────────────────

const TIER_ORDER: Record<ModelTier, number> = {
  economy: 0,
  standard: 1,
  premium: 2,
  premium_plus: 3,
};

// ─── Parametric / Extensible Resolution (F1-PD) ────────────────────────────
// The bundled BUILTIN_MODELS catalog is the offline fallback, but the registry
// is no longer a closed set: an unknown / brand-new model id is RESOLVED into a
// runtime-validated ModelDefinition rather than rejected. The string-union
// hardcode (OpenAIModel / GeminiModel in task-types.ts) no longer gates runtime
// resolution — provider + tier are derived parametrically from the id, with
// every field overridable via ParametricResolveOptions.

/** Infer the provider from a model id using common naming conventions.
 *  Falls back to 'claude' (the project default provider) when no pattern matches. */
export function inferProviderFromId(id: string): RegistryProviderNameExt {
  const lid = id.toLowerCase().trim();
  if (
    lid.startsWith('claude') ||
    lid.startsWith('opus') ||
    lid.startsWith('sonnet') ||
    lid.startsWith('haiku') ||
    lid.startsWith('fable')
  ) {
    return 'claude';
  }
  if (lid.startsWith('gemini') || lid.startsWith('google')) {
    return 'gemini';
  }
  // OpenAI / Codex: gpt-* plus the "o-series" reasoning models (o1/o3/o4/o5...).
  if (lid.startsWith('gpt') || lid.startsWith('codex') || /^o\d/.test(lid)) {
    return 'codex';
  }
  if (lid.startsWith('ollama') || lid.startsWith('llama') || lid.includes(':')) {
    // `name:tag` shape (e.g. `qwen3:8b`) is the Ollama local-tag convention.
    return 'ollama';
  }
  return 'claude';
}

/** Infer the capability tier from a model id using common naming conventions.
 *  Token boundaries (`\b`) are used so a small-model token like `mini` is only
 *  matched as a word — e.g. `gemini` (which contains the substring "mini") is
 *  NOT mis-classified as economy. Defaults to 'standard' when no pattern matches. */
export function inferTierFromId(id: string): ModelTier {
  const lid = id.toLowerCase().trim();
  // economy: explicit small-model tokens.
  if (/\b(mini|nano)\b/.test(lid) || lid.includes('haiku')) {
    return 'economy';
  }
  // premium_plus: top-tier reasoning / flagship tokens.
  if (/\b(ultra|max|o3)\b/.test(lid)) {
    return 'premium_plus';
  }
  // premium: flagship chat tokens.
  if (lid.includes('opus') || /\bpro\b/.test(lid) || /\bgpt-?5\b/.test(lid)) {
    return 'premium';
  }
  // standard: mid-tier tokens.
  if (lid.includes('flash') || lid.includes('sonnet') || /\bgpt-?4/.test(lid)) {
    return 'standard';
  }
  return 'standard';
}

/** Build a runtime-validated ModelDefinition for an arbitrary (possibly unknown)
 *  model id. Provider and tier are inferred from the id unless overridden; the
 *  remaining fields fall back to safe, neutral defaults. This is the parametric
 *  core that lets the catalog accept new model ids without a code change. */
export function buildParametricModel(
  id: string,
  opts: ParametricResolveOptions = {},
): ModelDefinition {
  const provider = opts.provider ?? (inferProviderFromId(id) as RegistryProviderName);
  const def: ModelDefinition = {
    id,
    apiId: opts.apiId ?? id,
    provider,
    tier: opts.tier ?? inferTierFromId(id),
    contextWindow: opts.contextWindow ?? 200_000,
    costPerMillion: opts.costPerMillion ?? { input: 0, output: 0 },
    capabilities: {
      streaming: opts.capabilities?.streaming ?? true,
      toolUse: opts.capabilities?.toolUse ?? true,
      vision: opts.capabilities?.vision ?? false,
      codeExecution: opts.capabilities?.codeExecution ?? false,
      reasoning: opts.capabilities?.reasoning ?? false,
    },
    status: opts.status ?? 'ga',
  };
  if (opts.maxOutputTokens !== undefined) {
    def.maxOutputTokens = opts.maxOutputTokens;
  }
  return def;
}

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

  /**
   * Parametric resolution (F1-PD) — the non-throwing counterpart of getOrThrow().
   *
   * Returns the catalog entry for `id` when present; otherwise synthesizes a
   * runtime-validated ModelDefinition (provider + tier inferred from the id,
   * every field overridable via `opts`) instead of rejecting an unknown / new
   * model id. By default the synthesized entry is also registered so subsequent
   * lookups (get / getOrThrow / resolveApiId / cost) treat it as first-class;
   * pass `{ register: false }` to resolve without mutating the registry.
   *
   * This keeps the bundled catalog as the fallback while making it extensible:
   * a brand-new model id is accepted without a code change.
   */
  resolve(id: string, opts: ParametricResolveOptions = {}): ModelDefinition {
    const existing = this.models.get(id);
    if (existing) return existing;
    const def = buildParametricModel(id, opts);
    if (opts.register ?? true) {
      this.models.set(def.id, def);
    }
    return def;
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

// ─── Opt-in: register Codex parity models on a target registry ────────────
// Mirrors registerOllamaModels() immediately above. Not called automatically
// at module load (see CODEX_PARITY_MODELS comment) — a Codex provider
// bootstrap can call this to make `gpt-5.5` first-class. Idempotent:
// re-registering a model is a no-op since `register()` simply re-Map.sets it.
export function registerCodexParityModels(registry: ModelRegistry = modelRegistry): void {
  for (const def of CODEX_PARITY_MODELS) {
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
