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
export type RegistryProviderName = 'claude' | 'codex' | 'gemini' | 'ollama' | 'openrouter' | 'local-llm';

/** Config-extensible registry ownership, including keyless local runtimes. */
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
  /**
   * Marks this model as the current generation's answer for its
   * (provider, tier) pair — the one tier-equivalence should resolve to.
   *
   * MASTER-PLAN 669: without it `getByProviderAndTier` returns the FIRST
   * registered GA model of a tier, so registration order silently decides real
   * dispatch identity. Measured 2026-07-26: tier equivalence resolved the
   * standard-tier codex counterpart of `claude-sonnet-5` to `gpt-4.1` — an older
   * generation — while `gpt-5.6-terra` sat later in the same tier.
   *
   * ACTIVE since 2026-07-26 (owner-approved; MASTER-PLAN 670). Four sets had
   * more than one GA model, so registration order was silently deciding real
   * dispatch identity; each now names its current generation explicitly:
   * `claude/premium → claude-opus-5`, `codex/standard → gpt-5.6-terra`,
   * `codex/premium → gpt-5.5`, `codex/premium_plus → gpt-5.6-sol`,
   * `codex/economy → gpt-5.6-luna`. Sets with a
   * single GA model carry no flag — there is nothing for order to decide.
   *
   * The flag designates GENERATION, not entitlement. Whether an account may
   * actually call the designated model is a separately measured fact, recorded
   * by the entitlement memory (MASTER-PLAN 671(b)); the catalog must never
   * assert it, because only a live dispatch can establish it.
   *
   * At most ONE model per (provider, tier) may carry the flag — enforced at all
   * three entry points by `assertSoleTierPreferencePerSet` (constructor,
   * `loadFromCatalog`, `register`), because a second one would reintroduce
   * registration-order-as-identity inside the fix for it.
   */
  preferredForTier?: boolean;
}

/**
 * Options for parametric model resolution (F1-PD).
 *
 * Provider/tier can be inferred from an exact API id, but a dynamic cloud
 * identity is admitted only with finite pricing plus an immutable evidence
 * reference. Local Ollama tags are the sole zero-cost default. This keeps the
 * catalog extensible without turning naming heuristics into cloud authority.
 */
export interface ParametricResolveOptions {
  /** Explicit provider ownership when the API ID is not unambiguously namespaced. */
  provider?: RegistryProviderNameExt;
  /** Force the tier instead of inferring it from the id. */
  tier?: ModelTier;
  /** @deprecated Canonical identity requires this to equal `id`. */
  apiId?: string;
  /** Context window in tokens (default 200_000). */
  contextWindow?: number;
  /** Cost per million tokens. Every dynamic cloud entry requires this together
   *  with `pricingEvidenceRef`; only explicitly owned local identities may use
   *  the zero default. */
  costPerMillion?: ModelCost;
  /** Opaque pricing source reference required for every dynamic cloud entry. */
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
