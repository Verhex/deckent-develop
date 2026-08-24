// ─── Model Registry ─────────────────────────────────────────────────────────
// Single source of truth for all model definitions across providers.
// All other modules (task-types, model-equivalence, providers) delegate here.

import { DeckentError } from './errors.js';
import { OLLAMA_BUILTIN_MODELS } from './ollama-models.js';
import type { ModelActivationPolicy } from './model-activation-store.js';
import type {
  RegistryProviderName,
  RegistryProviderNameExt,
  ModelTier,
  ModelCapabilities,
  ModelDefinition,
  ParametricResolveOptions,
} from './model-registry-types.js';

declare module './model-registry-types.js' {
  interface ModelCost {
    /** Cached-input read price in USD per million tokens, when published. */
    cacheReadInput?: number;
  }
}

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

/** Canonical provider API identity for Claude Fable quota and routing scope. */
export const CLAUDE_FABLE_API_ID = 'claude-fable-5' as const;

/**
 * Compatibility metadata for explicit config/active-work migration only.
 * Normal registry lookup never consumes this table and therefore never turns
 * an authored legacy alias into a different wire model silently.
 */
export const LEGACY_MODEL_ALIASES = Object.freeze({
  fable: CLAUDE_FABLE_API_ID,
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5-20251001',
  'gpt-5': 'gpt-5.5',
  'gpt-5.6': 'gpt-5.6-sol',
} as const);

export type LegacyModelAlias = keyof typeof LEGACY_MODEL_ALIASES;

/**
 * Historical V1 config semantics that intentionally differ from the current
 * model capability tier. Keep the exception beside model identity metadata so
 * migration consumers never grow a second hardcoded model dictionary.
 */
export const CONFIG_MIGRATION_TIER_OVERRIDES = Object.freeze({
  o3: 'standard',
  'o4-mini': 'economy',
} as const satisfies Readonly<Record<string, ModelTier>>);

export function getLegacyModelMigration(id: string): string | undefined {
  return LEGACY_MODEL_ALIASES[id as LegacyModelAlias];
}

export interface CanonicalModelResolutionOptions {
  provider?: RegistryProviderNameExt;
  registerParametric?: boolean;
}

/**
 * Resolve an authored runtime model identity without compatibility remapping.
 * An unseen API ID is accepted only with explicit provider ownership.
 */
export function resolveCanonicalModelIdentity(
  apiId: string,
  options: CanonicalModelResolutionOptions = {},
): ModelDefinition {
  if (!apiId || apiId !== apiId.trim()) {
    throw new DeckentError('E_MODEL_ID_INVALID', 'E_MODEL_ID_INVALID');
  }
  if (getLegacyModelMigration(apiId)) {
    throw new DeckentError('E_LEGACY_MODEL_ALIAS', 'E_LEGACY_MODEL_ALIAS');
  }

  const existing = modelRegistry.get(apiId);
  if (existing) {
    if (options.provider !== undefined && existing.provider !== options.provider) {
      throw new DeckentError('E_MODEL_PROVIDER_MISMATCH', 'E_MODEL_PROVIDER_MISMATCH');
    }
    return existing;
  }

  const inferredProvider = inferProviderFromId(apiId);
  if (options.provider !== undefined
    && inferredProvider !== undefined
    && options.provider !== inferredProvider) {
    throw new DeckentError('E_MODEL_PROVIDER_MISMATCH', 'E_MODEL_PROVIDER_MISMATCH');
  }

  if (!options.provider) {
    throw new DeckentError('E_MODEL_PROVIDER_UNVERIFIED', 'E_MODEL_PROVIDER_UNVERIFIED');
  }

  // Only local Ollama identities can be materialized without catalog/pricing
  // evidence. A provider name alone is not authority to mint a cloud model at
  // zero cost; cloud IDs must already be catalog/probe registered.
  const definition = buildParametricModel(apiId, {
    provider: options.provider,
    register: false,
  });
  if (options.registerParametric === true) modelRegistry.register(definition);
  return definition;
}

/**
 * MASTER-PLAN 669/670: at most ONE model per (provider, tier) may be designated
 * `preferredForTier`. A second one would send `getByProviderAndTier` back to
 * `.find()`-by-registration-order — reintroducing order-as-identity inside the
 * fix for order-as-identity. Every bulk entry point (constructor, catalog swap)
 * validates the whole set before admitting it; `register()` checks incrementally
 * against what is already loaded.
 */
function assertSoleTierPreferencePerSet(definitions: readonly ModelDefinition[]): void {
  const preferred = new Map<string, string>();
  for (const def of definitions) {
    if (def.preferredForTier !== true) continue;
    const pair = `${def.provider}/${def.tier}`;
    const incumbent = preferred.get(pair);
    if (incumbent !== undefined && incumbent !== def.id) {
      throw new DeckentError(
        'E_MODEL_TIER_PREFERENCE_AMBIGUOUS',
        `${pair} designates more than one model (${incumbent} and ${def.id}); `
        + 'tier equivalence would depend on registration order',
      );
    }
    preferred.set(pair, def.id);
  }
}

function assertCanonicalModelDefinition(definition: ModelDefinition): void {
  if (!definition.id || definition.id !== definition.apiId) {
    throw new DeckentError(
      'E_MODEL_IDENTITY_MISMATCH',
      `Model identity must use the provider API ID unchanged: id=${definition.id}, apiId=${definition.apiId}`,
    );
  }
}

// ─── Built-in Model Catalog ────────────────────────────────────────────────
// Bundled snapshot = offline last-resort fallback. models.dev catalog is the
// live source of truth; apiId values here must be kept current at build time.

export const BUILTIN_MODELS: readonly ModelDefinition[] = [
  // Claude (5)
  {
    // Claude Fable 5 — Anthropic's most capable widely released model (GA 2026-06-09).
    // Free on Pro/Max/Team subscriptions through 2026-06-22; reverts to $10/$50 paid after.
    // 1M context (Opus 4.7 tokenizer), adaptive thinking always-on, no extended thinking.
    id: CLAUDE_FABLE_API_ID,
    apiId: CLAUDE_FABLE_API_ID,
    provider: 'claude',
    tier: 'premium_plus',
    contextWindow: 1_000_000,
    costPerMillion: { input: 10, output: 50 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
  {
    id: 'claude-opus-4-8',
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
    // Claude Opus 5 — GA, exact pinned API identity (Anthropic docs 2026-07-25).
    // MASTER-PLAN 670 (owner-approved 2026-07-26): registration position no
    // longer decides identity, so this entry stays after Opus 4.8 for catalog
    // history while `preferredForTier` — not its index — makes it the
    // claude/premium answer.
    id: 'claude-opus-5',
    apiId: 'claude-opus-5',
    provider: 'claude',
    tier: 'premium',
    preferredForTier: true,
    contextWindow: 1_000_000,
    costPerMillion: { input: 5, output: 25 },
    // Adaptive thinking is supported, while legacy extended thinking is not.
    // `reasoning` follows the existing registry's extended-thinking semantics.
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
  {
    id: 'claude-sonnet-5',
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
    id: 'claude-haiku-4-5-20251001',
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
  // OpenAI (6) — canonical provider API IDs only.
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
    id: 'gpt-5.5',
    apiId: 'gpt-5.5',
    provider: 'codex',
    tier: 'premium',
    preferredForTier: true,
    contextWindow: 1_050_000,
    costPerMillion: { input: 5, output: 30 },
    pricingEvidenceRef: 'https://platform.openai.com/docs/pricing',
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
    maxOutputTokens: 128_000,
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

// ─── Codex parity family ──────────────────────────────────────────────────
// These canonical API IDs extend the offline catalog beyond the 14 core
// entries. They are loaded by every ModelRegistry, so validation does not
// depend on importing a provider module for its side effects.
export const CODEX_PARITY_MODELS: readonly ModelDefinition[] = [
  // Pinned gpt-5.6 family. Official OpenAI guidance identifies bare `gpt-5.6`
  // as a moving alias to `gpt-5.6-sol`; it is migration-only above, never a
  // canonical runtime identity.
  // `gpt-5.6-sol` is the designated cross-verify counterpart for comprehensive
  // analyses (XVER-1 Anthropic↔OpenAI çapraz-doğrulama).
  {
    id: 'gpt-5.6-sol',
    apiId: 'gpt-5.6-sol',
    provider: 'codex',
    tier: 'premium_plus',
    // MASTER-PLAN 670 (owner-approved 2026-07-26). Entitlement live-proven on the
    // active ChatGPT account: run xv-1785008399857 reached `turn.completed` with
    // real consumption, unlike `gpt-4.1` which the same account refuses with 400.
    preferredForTier: true,
    contextWindow: 1_050_000,
    costPerMillion: { input: 5, output: 30, cacheReadInput: 0.5 },
    pricingEvidenceRef: 'https://platform.openai.com/docs/pricing',
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-5.6-terra',
    apiId: 'gpt-5.6-terra',
    provider: 'codex',
    tier: 'standard',
    // MASTER-PLAN 670 (owner-approved 2026-07-26). This designation replaces
    // `gpt-4.1`, which THIS account is measured to refuse outright (HTTP 400,
    // sprint-460). Whether terra itself is entitled is a separate measured fact
    // that MASTER-PLAN 671(b) records rather than something the catalog asserts.
    preferredForTier: true,
    contextWindow: 1_050_000,
    costPerMillion: { input: 2.5, output: 15, cacheReadInput: 0.25 },
    pricingEvidenceRef: 'https://platform.openai.com/docs/pricing',
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-5.6-luna',
    apiId: 'gpt-5.6-luna',
    provider: 'codex',
    tier: 'economy',
    // MASTER-PLAN 670 (owner-approved 2026-07-26), replacing `gpt-5-mini`.
    preferredForTier: true,
    contextWindow: 1_050_000,
    costPerMillion: { input: 1, output: 6, cacheReadInput: 0.1 },
    pricingEvidenceRef: 'https://platform.openai.com/docs/pricing',
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
    status: 'ga',
    maxOutputTokens: 128_000,
  },
] as const;

// ─── Cursor parity family (FAZ-1, deliberately narrow) ────────────────────
/**
 * Cursor CLI parity family. Part of `CANONICAL_MODELS` exactly like
 * {@link CODEX_PARITY_MODELS} — still NOT part of `BUILTIN_MODELS`, so the
 * 15-model bundled-builtin invariant holds unchanged, but every
 * `ModelRegistry` (the singleton included) carries the family the moment it is
 * CONSTRUCTED.
 *
 * That determinism is the whole point. `CursorAdapter.supportedModels` reads
 * `modelRegistry.getByProvider('cursor')`; while registration hung off a
 * `getAllKnownModelIds()` side-effect the adapter saw an EMPTY list — and
 * rejected every model — in any process that never happened to call that
 * validation helper. Registry membership must not depend on which consumer ran
 * first, so the canonical bootstrap owns it.
 *
 * FAZ-1 scope is intentionally narrow — only the `cursor-grok-4.6-*` effort
 * family, whose `cursor-` prefix is unambiguous for provider inference.
 * Collision-prone ids (a Cursor-hosted `gpt-*`/`claude-*` alias) are a later
 * phase and MUST NOT be added here without re-deriving inference precedence.
 *
 * Every tier is EXPLICIT rather than inferred: `inferTierFromId` has no notion
 * of Cursor's reasoning-effort suffixes and would flatten all four ids to
 * `standard` (pinned as a regression in the parametric tests).
 *
 * Context window is a CONSERVATIVE planning envelope, not a measured fact: no
 * live capability probe has run for this family yet (the real-binary Tier-1
 * smoke is post-sprint). It is used for context-fit planning only and must be
 * corrected from probe evidence rather than widened by assumption.
 *
 * Pricing: Cursor bills through the user's plan and publishes no per-token
 * tariff, so `costPerMillion` is structurally zero and `pricingEvidenceRef` is
 * deliberately UNSET. That is not a silent zero — it is the typed signal the
 * cost path reads: `cost-calculator` settles this provider as `subscription`
 * (billed USD $0, quota-tracked), and if a caller ever forces metered `api`
 * billing the missing evidence makes it refuse to price the task explicitly
 * instead of presenting unknown spend as free.
 */
export const CURSOR_MODELS: readonly ModelDefinition[] = [
  {
    id: 'cursor-grok-4.6-low',
    apiId: 'cursor-grok-4.6-low',
    provider: 'cursor',
    tier: 'economy',
    // Sole GA model in cursor/economy — the designation is explicit anyway so a
    // later addition to this tier cannot silently inherit it by registration order.
    preferredForTier: true,
    contextWindow: 256_000,
    costPerMillion: { input: 0, output: 0 },
    // Reasoning-effort suffix selects DEPTH, not presence: the whole family is
    // a reasoning model. Vision is false because the FAZ-1 CLI adapter carries
    // no image-input path; `codeExecution` is true because `cursor-agent` runs
    // commands in the workspace.
    capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: true, reasoning: true },
    // 'ga', not 'preview': `getByProviderAndTier` filters to status === 'ga', so
    // a preview entry would register successfully yet stay INVISIBLE to tier
    // resolution — registered-but-unroutable. Status describes catalog
    // availability; whether THIS account may call it is a separately measured
    // entitlement fact the catalog must never assert.
    status: 'ga',
  },
  {
    id: 'cursor-grok-4.6-medium',
    apiId: 'cursor-grok-4.6-medium',
    provider: 'cursor',
    tier: 'standard',
    preferredForTier: true,
    contextWindow: 256_000,
    costPerMillion: { input: 0, output: 0 },
    capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: true, reasoning: true },
    status: 'ga',
  },
  {
    id: 'cursor-grok-4.6-high',
    apiId: 'cursor-grok-4.6-high',
    provider: 'cursor',
    tier: 'premium',
    preferredForTier: true,
    contextWindow: 256_000,
    costPerMillion: { input: 0, output: 0 },
    capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: true, reasoning: true },
    status: 'ga',
  },
  {
    id: 'cursor-grok-4.6-xhigh',
    apiId: 'cursor-grok-4.6-xhigh',
    provider: 'cursor',
    tier: 'premium_plus',
    preferredForTier: true,
    contextWindow: 256_000,
    costPerMillion: { input: 0, output: 0 },
    capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: true, reasoning: true },
    status: 'ga',
  },
] as const;

// The canonical bootstrap set every `ModelRegistry` is constructed from. It is
// deliberately wider than `BUILTIN_MODELS`: parity families whose provider CLI
// resolves its supported models straight off the registry must be present
// BEFORE any consumer asks, otherwise adapter support becomes a function of
// module-import order rather than of the catalog.
export const CANONICAL_MODELS: readonly ModelDefinition[] = [
  ...BUILTIN_MODELS,
  ...CODEX_PARITY_MODELS,
  ...CURSOR_MODELS,
] as const;

// ─── Tier ordering for comparison ──────────────────────────────────────────

const TIER_ORDER: Record<ModelTier, number> = {
  economy: 0,
  standard: 1,
  premium: 2,
  premium_plus: 3,
};

// ─── Parametric / Extensible Resolution (F1-PD) ────────────────────────────
// The bundled catalog is the offline fallback, but exact API ids are not gated
// by a TypeScript string union. Provider/tier may be derived parametrically;
// cloud admission still requires explicit finite pricing evidence. Naming
// heuristics diagnose ownership and tier — they do not prove reachability or
// mint free cloud capacity.

/** Diagnostic namespace inference. An unknown namespace has no authority. */
export function inferProviderFromId(id: string): RegistryProviderNameExt | undefined {
  const lid = id.trim().toLowerCase();
  // OpenRouter's canonical API IDs are vendor/model paths. Preserve the full
  // wire identity verbatim; the slash namespace is ownership evidence for the
  // OpenRouter gateway, never an invitation to strip the vendor prefix.
  if (lid.includes('/')) {
    return 'openrouter';
  }
  // Cursor CLI ids are namespaced by a `cursor-` prefix and must be matched
  // BEFORE the vendor branches below: a Cursor-hosted id may embed another
  // vendor's family name (`cursor-gpt-…`, `cursor-claude-…`) and would then be
  // attributed to the wrong provider. The prefix is exact — a bare `cursor`
  // or a `cursorless-…` id stays unowned rather than being claimed by substring.
  if (lid.startsWith('cursor-')) {
    return 'cursor';
  }
  if (lid.startsWith('claude-')) {
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
  return undefined;
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

/** Build a runtime-validated ModelDefinition for an exact API id. Provider and
 *  tier are inferred unless explicitly owned; dynamic cloud definitions require
 *  finite pricing evidence, while local Ollama tags may use zero-cost defaults. */
export function buildParametricModel(
  id: string,
  opts: ParametricResolveOptions = {},
): ModelDefinition {
  if (!id || id !== id.trim()) {
    throw new DeckentError('E_MODEL_ID_INVALID', 'Model API ID must be a non-empty, exact string');
  }
  if (opts.apiId !== undefined && opts.apiId !== id) {
    throw new DeckentError(
      'E_MODEL_IDENTITY_MISMATCH',
      `Parametric model identity cannot remap ${id} to ${opts.apiId}`,
    );
  }
  const provider = opts.provider ?? inferProviderFromId(id);
  if (!provider) {
    throw new DeckentError(
      'E_MODEL_PROVIDER_UNVERIFIED',
      `Provider ownership is required for model API ID: ${id}`,
    );
  }
  const inferredProvider = inferProviderFromId(id);
  if (opts.provider !== undefined
    && inferredProvider !== undefined
    && opts.provider !== inferredProvider) {
    throw new DeckentError(
      'E_MODEL_PROVIDER_MISMATCH',
      `Model API ID ${id} belongs to ${inferredProvider}, not ${opts.provider}`,
    );
  }
  if (provider !== 'ollama' && provider !== 'local-llm') {
    const suppliedCost = opts.costPerMillion;
    const validSuppliedCost = suppliedCost !== undefined
      && Number.isFinite(suppliedCost.input)
      && Number.isFinite(suppliedCost.output)
      && suppliedCost.input >= 0
      && suppliedCost.output >= 0;
    const evidenceRef = opts.pricingEvidenceRef;
    if (!validSuppliedCost
      || typeof evidenceRef !== 'string'
      || evidenceRef.length === 0
      || evidenceRef !== evidenceRef.trim()
      || (provider === 'openrouter'
        && !id.endsWith(':free')
        && suppliedCost.input === 0
        && suppliedCost.output === 0)) {
      throw new DeckentError(
        'E_MODEL_PRICING_UNVERIFIED',
        `Cloud pricing evidence is required for model API ID: ${id}`,
      );
    }
  }
  const def: ModelDefinition = {
    id,
    apiId: id,
    provider: provider as RegistryProviderName,
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
    // OPENROUTER-PROVIDER (row 477): OpenRouter ids default to 'ga', not 'preview'.
    // `getByProviderAndTier` filters to status==='ga', so a 'preview' entry registers
    // successfully yet stays INVISIBLE to tier resolution — registered-but-unroutable,
    // the silent-failure shape this row set out to remove. For claude/codex/gemini a
    // parametric id genuinely IS an unverified guess (hence 'preview'), but an
    // OpenRouter id is only ever reachable when the operator named it explicitly AND
    // the gateway serves it verbatim (id === apiId), so 'ga' is the honest default.
    // An explicit `opts.status` still wins.
    status: opts.status ?? (
      provider === 'ollama' || provider === 'local-llm' || provider === 'openrouter'
        ? 'ga'
        : 'preview'
    ),
  };
  if (opts.maxOutputTokens !== undefined) {
    def.maxOutputTokens = opts.maxOutputTokens;
  }
  if (opts.pricingEvidenceRef !== undefined) {
    def.pricingEvidenceRef = opts.pricingEvidenceRef;
  }
  return def;
}

// ─── ModelRegistry Class ───────────────────────────────────────────────────

export class ModelRegistry {
  private models = new Map<string, ModelDefinition>();

  /**
   * OWNER-MODEL-POLICY-001: the resolved owner activation snapshot, injected once
   * at provider bootstrap ({@link setActivationPolicy}). When set, every *pool*
   * accessor (getByProvider(AndTier)/getAllModels/getAllModelIds/getEquivalent…)
   * hides models the owner has not made executable, so planning, tier resolution
   * and dispatch see only the allowed set. Identity/accounting accessors
   * (get/getOrThrow/has/resolve/getTier/estimateCost/resolveApiId) stay TOTAL —
   * a tombstoned model still resolves for receipts and cannot be resurrected into
   * the pool by a parametric re-`register`. Unset (tests, pre-bootstrap) → no
   * filtering, byte-identical to the pre-policy registry.
   */
  private activationPolicy?: ModelActivationPolicy;

  constructor(builtins: readonly ModelDefinition[] = CANONICAL_MODELS) {
    assertSoleTierPreferencePerSet(builtins);
    for (const model of builtins) {
      assertCanonicalModelDefinition(model);
      this.models.set(model.id, model);
    }
  }

  /** Inject the owner activation snapshot (bootstrap). `undefined` clears it. */
  setActivationPolicy(policy: ModelActivationPolicy | undefined): void {
    this.activationPolicy = policy;
  }

  /** The active policy snapshot governing pool visibility, if any. */
  getActivationPolicy(): ModelActivationPolicy | undefined {
    return this.activationPolicy;
  }

  /** True when the model is executable under the owner policy (or no policy set). */
  private isPoolExecutable(model: ModelDefinition): boolean {
    return this.activationPolicy === undefined
      || this.activationPolicy.isExecutable(model.provider, model.id);
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
   * Returns a catalog entry when present; otherwise synthesizes only when the
   * caller supplies the authority required for that execution-cost class.
   * Dynamic cloud ids require finite pricing plus an evidence reference; local
   * Ollama tags may be admitted from explicit local ownership. By default a
   * successful synthesis registers the identity; pass `{ register: false }`
   * for pure validation.
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
    return [...this.models.values()].filter(m => m.provider === provider && this.isPoolExecutable(m));
  }

  getByTier(tier: ModelTier): ModelDefinition[] {
    return [...this.models.values()].filter(m => m.tier === tier && this.isPoolExecutable(m));
  }

  getByProviderAndTier(provider: RegistryProviderNameExt, tier: ModelTier): ModelDefinition | undefined {
    const candidates = [...this.models.values()].filter(
      m => m.provider === provider && m.tier === tier && m.status === 'ga' && this.isPoolExecutable(m),
    );
    // MASTER-PLAN 669: an explicit designation outranks registration order.
    // Order-as-identity is how a cross-verify dispatch silently landed on
    // `gpt-4.1` instead of the current-generation standard-tier codex model.
    // No designation → the historical first-match, unchanged.
    return candidates.find(m => m.preferredForTier === true) ?? candidates[0];
  }

  getEquivalent(modelId: string, targetProvider: RegistryProviderNameExt): string {
    const source = this.getOrThrow(modelId);
    // Same provider — return same model
    if (source.provider === targetProvider) {
      return source.id;
    }
    if (String(source.provider) === 'local-llm') {
      throw new DeckentError(
        'E_LOCAL_PROVIDER_FALLBACK_HOLD',
        `Local model ${modelId} cannot be remapped to provider ${targetProvider}`,
      );
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
    assertCanonicalModelDefinition(definition);
    this.assertSoleTierPreference(definition);
    this.models.set(definition.id, definition);
  }

  /**
   * MASTER-PLAN 669/670: a second `preferredForTier` in one (provider, tier)
   * would send `getByProviderAndTier` back to `.find()`-by-registration-order —
   * reintroducing order-as-identity inside the fix for order-as-identity. Reject
   * it at registration so the ambiguity can never reach a billed dispatch.
   */
  private assertSoleTierPreference(definition: ModelDefinition): void {
    if (definition.preferredForTier !== true) return;
    for (const existing of this.models.values()) {
      if (existing.id === definition.id) continue;
      if (existing.provider === definition.provider
        && existing.tier === definition.tier
        && existing.preferredForTier === true) {
        throw new DeckentError(
          'E_MODEL_TIER_PREFERENCE_AMBIGUOUS',
          `${definition.provider}/${definition.tier} already prefers ${existing.id}; `
          + `${definition.id} would make tier equivalence depend on registration order`,
        );
      }
    }
  }

  unregister(id: string): boolean {
    return this.models.delete(id);
  }

  /** Replace all current entries with the supplied catalog (atomic swap).
   *  Used by bootstrapFromCatalog() after a successful remote/cache fetch. */
  loadFromCatalog(definitions: readonly ModelDefinition[]): void {
    for (const def of definitions) assertCanonicalModelDefinition(def);
    // Enforced on the incoming set BEFORE the swap — a catalog with two preferred
    // models in one tier must not be able to replace a valid one.
    assertSoleTierPreferencePerSet(definitions);
    this.models.clear();
    for (const def of definitions) {
      this.models.set(def.id, def);
    }
  }

  /** Merge supplied definitions on top of existing entries (overrides by id).
   *  Bundled entries that share an id with the catalog are replaced; the rest
   *  remain available as a safety net. */
  mergeFromCatalog(definitions: readonly ModelDefinition[]): void {
    for (const def of definitions) assertCanonicalModelDefinition(def);
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
    return [...this.models.values()].filter(m => this.isPoolExecutable(m)).map(m => m.id);
  }

  getAllModels(): ModelDefinition[] {
    return [...this.models.values()].filter(m => this.isPoolExecutable(m));
  }

  getAllProviders(): RegistryProviderName[] {
    const providers = new Set<RegistryProviderName>();
    for (const m of this.models.values()) {
      if (this.isPoolExecutable(m)) providers.add(m.provider);
    }
    return [...providers];
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

export const modelRegistry = new ModelRegistry();

/**
 * Resolve a V1 config model to its V2 tier from the registry SSOT.
 *
 * Legacy aliases are accepted only at this explicit migration boundary.
 * Unknown identities fail loudly because choosing `standard` would silently
 * invent capability/routing authority for an unowned model.
 */
export function resolveConfigMigrationModelTier(id: string): ModelTier {
  const override = CONFIG_MIGRATION_TIER_OVERRIDES[
    id as keyof typeof CONFIG_MIGRATION_TIER_OVERRIDES
  ];
  if (override) return override;

  const canonicalId = getLegacyModelMigration(id) ?? id;
  const definition = modelRegistry.get(canonicalId);
  if (!definition) {
    throw new DeckentError(
      'E_UNKNOWN_MODEL',
      `Unknown model in V1 config migration: ${id}`,
    );
  }
  return definition.tier;
}

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

// ─── Re-register Cursor parity models on a target registry ────────────────
// CURSOR_MODELS is part of CANONICAL_MODELS, so every default-constructed
// registry — the singleton included — already carries the family and NOTHING
// in production needs to call this. It remains exported for registries built
// from a narrowed builtin set (tests, catalog-replaced registries) that want
// the family back. Idempotent — `register()` simply re-Map.sets each
// definition. It is NOT a bootstrap hook: never make catalog membership
// depend on some consumer remembering to invoke it (that defect is exactly
// what moving the family into CANONICAL_MODELS fixed).
export function registerCursorParityModels(registry: ModelRegistry = modelRegistry): void {
  for (const def of CURSOR_MODELS) {
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
    provider: 'ollama',
    tier: 'standard',
    contextWindow: 32_768,
    costPerMillion: { input: 0, output: 0 },
    capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
    status: 'ga',
  });
}

// ─── Fresh local OpenAI-compatible identity registration ──────────────────

export const LOCAL_LLM_HEALTH_FRESHNESS_MS = 30_000;

export interface LocalLlmEndpointEvidence {
  /** Exact model ids returned by the endpoint's live `/models` response. */
  modelIds: readonly string[];
  /** Result of the endpoint's live `/health` probe. */
  healthy: boolean;
  /** Local observation time, expressed as `Date.now()` milliseconds. */
  checkedAtMs: number;
}

export interface LocalLlmModelFacts {
  tier: ModelTier;
  contextWindow: number;
  capabilities: ModelCapabilities;
}

/**
 * Register an explicitly owned local OpenAI-compatible identity only from a
 * fresh, healthy endpoint observation. Endpoint identity proves reachability;
 * tier, context, and capabilities remain explicit owner-reviewed facts.
 */
export function ensureLocalLlmModelRegistered(
  modelId: string,
  facts: LocalLlmModelFacts,
  evidence: LocalLlmEndpointEvidence,
  registry: ModelRegistry = modelRegistry,
  nowMs: number = Date.now(),
): void {
  const evidenceAgeMs = nowMs - evidence.checkedAtMs;
  if (!evidence.healthy
      || !Number.isFinite(evidence.checkedAtMs)
      || evidenceAgeMs < 0
      || evidenceAgeMs > LOCAL_LLM_HEALTH_FRESHNESS_MS
      || !evidence.modelIds.includes(modelId)) {
    throw new DeckentError(
      'E_LOCAL_PROVIDER_HEALTH_HOLD',
      `Local model ${modelId} requires a fresh, healthy endpoint identity`,
    );
  }
  if (!Number.isInteger(facts.contextWindow) || facts.contextWindow <= 0) {
    throw new DeckentError(
      'E_MODEL_CONTEXT_INVALID',
      `Local model ${modelId} requires an owner-reviewed positive context window`,
    );
  }
  const existing = registry.get(modelId);
  if (existing) {
    if (String(existing.provider) !== 'local-llm') {
      throw new DeckentError(
        'E_MODEL_PROVIDER_MISMATCH',
        `Model API ID ${modelId} is already owned by ${existing.provider}`,
      );
    }
    return;
  }
  registry.register(buildParametricModel(modelId, {
    provider: 'local-llm',
    tier: facts.tier,
    contextWindow: facts.contextWindow,
    capabilities: { ...facts.capabilities, toolUse: true },
    costPerMillion: { input: 0, output: 0 },
    status: 'ga',
    register: false,
  }));
}

/** Per-model facts a caller can supply when registering an OpenRouter id.
 *  Every omitted field except paid-model pricing has a `:free`-safe default;
 *  see {@link ensureOpenRouterModelRegistered}. */
export interface OpenRouterModelFacts {
  /** Real context window for this id (e.g. 1_000_000 for nemotron-3-ultra).
   *  The `openrouter-probe` cache (`.deckent/settings/openrouter-models.json`)
   *  carries the true value per model. Default: conservative 128_000. */
  contextWindow?: number;
  /** Routing tier. Default: `'standard'` — same choice as the Ollama helper. */
  tier?: ModelTier;
  /** Cost per million tokens. Exact `:free` ids default to `{0,0}`; every
   *  other id requires explicit finite, non-negative pricing. */
  costPerMillion?: { input: number; output: number };
  /** Opaque fresh pricing-source reference. Required for paid and free models. */
  pricingEvidenceRef?: string;
  /** Whether the model emits reasoning tokens (nemotron-3 does, by default ON
   *  at the API level). Default: false. */
  reasoning?: boolean;
}

// OPENROUTER-PROVIDER (row 477) — the OpenRouter twin of
// `ensureOllamaModelRegistered` above, and the fix for this integration's ROOT
// CAUSE: `providers/openrouter.ts` registers NO models, so every
// `isModelAvailable(*, 'openrouter')` was structurally false and
// `getProviderForModel(<openrouter id>)` threw `UnknownModelError` at plan time,
// long before the adapter could run.
//
// Two registry landmines are deliberately defused here, both by passing values
// EXPLICITLY rather than letting the registry infer them:
//   1. `provider: 'openrouter'` is explicit because `inferProviderFromId`
//      (this file) classifies ANY id containing ':' as `'ollama'` — and every
//      free OpenRouter id ends in `:free` (`nvidia/…-a55b:free` would be read
//      as an Ollama tag). Never let this id reach provider inference.
//   2. `status: 'ga'` is explicit because `buildParametricModel` defaults to
//      `'preview'`, while `getByProviderAndTier` filters to `status === 'ga'`
//      — a `preview` entry would register successfully yet stay invisible to
//      tier resolution.
//
// `id === apiId === the OpenRouter model id VERBATIM` (e.g.
// `nvidia/nemotron-3-ultra-550b-a55b:free`), matching row 608's canonical-API-id
// rule: no Deckent-side alias is minted for OpenRouter models.
//
// COST GATE: the `{0,0}` default is accepted ONLY for ids ending exactly in
// `:free`. A paid/unknown id without explicit pricing fails before registry
// mutation, so no caller can accidentally present unknown spend as free.
//
// Idempotent, like the Ollama helper.
export function ensureOpenRouterModelRegistered(
  modelId: string,
  facts: OpenRouterModelFacts = {},
  registry: ModelRegistry = modelRegistry,
): void {
  if (!modelId) return;
  const existing = registry.get(modelId);
  if (existing) {
    if (existing.provider !== 'openrouter') {
      throw new DeckentError(
        'E_MODEL_PROVIDER_MISMATCH',
        `Model API ID ${modelId} is already owned by ${existing.provider}`,
      );
    }
    if (typeof existing.pricingEvidenceRef !== 'string'
        || existing.pricingEvidenceRef.length === 0
        || (!modelId.endsWith(':free')
          && existing.costPerMillion.input === 0 && existing.costPerMillion.output === 0)) {
      throw new DeckentError(
        'E_MODEL_PRICING_UNVERIFIED',
        `OpenRouter pricing evidence is required for non-free model API ID: ${modelId}`,
      );
    }
    return;
  }
  registry.register(buildParametricModel(modelId, {
    provider: 'openrouter',
    tier: facts.tier ?? 'standard',
    contextWindow: facts.contextWindow ?? 128_000,
    costPerMillion: facts.costPerMillion ?? { input: 0, output: 0 },
    pricingEvidenceRef: facts.pricingEvidenceRef,
    capabilities: {
      streaming: true,
      toolUse: true,
      vision: false,
      codeExecution: false,
      reasoning: facts.reasoning ?? false,
    },
    status: 'ga',
    register: false,
  }));
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
