// ─── Model Registry Types ────────────────────────────────────────────────────
// Pure type declarations for the model registry, extracted from model-registry.ts
// (matches the project `*-types.ts` convention). model-registry.ts re-exports
// every type here, so existing importers of these types from
// `./model-registry.js` keep working unchanged.

/** Provider ownership is part of the canonical runtime model identity.
 *  `'openrouter'` joined in OPENROUTER-PROVIDER (row 477) so OpenRouter model
 *  ids can be registered at all — `ModelDefinition.provider` is typed to this
 *  union, so without it no OpenRouter model could enter the registry and
 *  `isModelAvailable(*, 'openrouter')` was structurally always false. */
export type RegistryProviderName = 'claude' | 'codex' | 'gemini' | 'ollama' | 'openrouter';

/** Backward-compatible name retained for consumers; no longer a wider type. */
export type RegistryProviderNameExt = RegistryProviderName;

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
  /** Opaque immutable source reference for parametric pricing. Bundled catalog
   *  entries are governed by their catalog snapshot; dynamic OpenRouter entries
   *  require this field before registration. */
  pricingEvidenceRef?: string;
  capabilities: ModelCapabilities;
  status: ModelStatus;
  maxOutputTokens?: number;
}

/**
 * Options for parametric model resolution (F1-PD).
 *
 * Every field is optional — when omitted, the registry infers a sensible value
 * from the model id (provider/tier heuristics) or applies a safe default. This
 * is what makes the catalog **parametric / extensible**: an unknown-but-new
 * model id is resolved into a runtime-validated `ModelDefinition` instead of
 * being rejected. Supplying any field overrides the inferred/default value.
 */
export interface ParametricResolveOptions {
  /** Explicit provider ownership when the API ID is not unambiguously namespaced. */
  provider?: RegistryProviderName;
  /** Force the tier instead of inferring it from the id. */
  tier?: ModelTier;
  /** @deprecated Canonical identity requires this to equal `id`. */
  apiId?: string;
  /** Context window in tokens (default 200_000). */
  contextWindow?: number;
  /** Cost per million tokens. Dynamic OpenRouter entries require this together
   *  with `pricingEvidenceRef`; other providers retain the legacy zero default. */
  costPerMillion?: ModelCost;
  /** Opaque pricing source reference required for dynamic OpenRouter entries. */
  pricingEvidenceRef?: string;
  /** Capability flags (defaults: streaming+toolUse true, rest false). */
  capabilities?: Partial<ModelCapabilities>;
  /** Lifecycle status (default 'preview' for an unlisted parametric model). */
  status?: ModelStatus;
  /** Optional max output tokens. */
  maxOutputTokens?: number;
  /**
   * When true (default), a synthesized definition for an unknown id is also
   * registered so future lookups treat it as first-class. Set false to resolve
   * without mutating the registry.
   */
  register?: boolean;
}
