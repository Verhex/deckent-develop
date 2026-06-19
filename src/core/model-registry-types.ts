// ─── Model Registry Types ────────────────────────────────────────────────────
// Pure type declarations for the model registry, extracted from model-registry.ts
// (matches the project `*-types.ts` convention). model-registry.ts re-exports
// every type here, so existing importers of these types from
// `./model-registry.js` keep working unchanged.

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
  /** Force the provider instead of inferring it from the id. */
  provider?: RegistryProviderName;
  /** Force the tier instead of inferring it from the id. */
  tier?: ModelTier;
  /** Wire / API model id sent to the provider (defaults to the logical id). */
  apiId?: string;
  /** Context window in tokens (default 200_000). */
  contextWindow?: number;
  /** Cost per million tokens (default { input: 0, output: 0 }). */
  costPerMillion?: ModelCost;
  /** Capability flags (defaults: streaming+toolUse true, rest false). */
  capabilities?: Partial<ModelCapabilities>;
  /** Lifecycle status (default 'ga'). */
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
