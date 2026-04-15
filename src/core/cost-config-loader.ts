/**
 * Cost Config Loader — User-editable parametric cost management
 *
 * Reads `.deckent/cost-config.json` or falls back to bundled baseline.
 * Implements unit safety pin (costPerToken > 0.01 throws) to prevent
 * 1,000,000× billing errors (per-MTok vs per-token confusion).
 *
 * Zero hard-code principle: all pricing, rate limits, context windows,
 * budget caps are read from config file, never sabit in source code.
 *
 * Sprint 141 Task 141-SAFE-01
 * See: .claude/projects/-home-alperen-deckent-dev/memory/project_sprint141_parametric_cost_system.md
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BillingMode = 'api' | 'subscription' | 'free_tier';
export type SubscriptionMethod = 'cccost_interceptor' | 'admin_api' | 'none';
export type DeckentTier = 'economy' | 'standard' | 'premium' | 'premium_plus';

export interface ModelPricing {
  input_cost_per_token: number;
  output_cost_per_token: number;
  cache_creation_input_token_cost?: number | null;
  cache_creation_input_token_cost_above_1hr?: number | null;
  cache_read_input_token_cost?: number | null;
  max_input_tokens: number;
  max_output_tokens?: number;
  supports_prompt_caching?: boolean;
  supports_reasoning?: boolean;
  supports_vision?: boolean;
  supports_tool_choice?: boolean;
  deckent_tier?: DeckentTier;
  deckent_aliases?: string[];
  enabled?: boolean;
  _source?: string;
  _verified_at?: string;
  _notes?: string;
}

export interface RateLimitTier {
  rpm: number;
  itpm: number;
  otpm: number;
}

export interface SubscriptionTracking {
  method: SubscriptionMethod;
  supported: boolean;
  path?: string;
  reason?: string;
  risk_level?: 'low' | 'medium' | 'high';
}

export interface ProviderConfig {
  enabled: boolean;
  billing_modes_supported: BillingMode[];
  default_billing_mode?: BillingMode;
  api_endpoint?: string;
  models: Record<string, ModelPricing>;
  rate_limits?: Record<string, RateLimitTier>;
  subscription_tracking?: SubscriptionTracking;
}

export interface CostLimits {
  sprint_max_usd: number;
  daily_max_usd: number;
  monthly_max_usd?: number;
  auto_confirm_below_usd?: number;
  alert_thresholds?: {
    warning_percent: number;
    critical_percent: number;
    block_percent: number;
  };
}

export interface UpdateConfig {
  sources_priority: Array<'litellm' | 'openrouter' | 'bundled'>;
  litellm_url?: string;
  openrouter_url?: string;
  validation_delta_percent?: number;
  cache_duration_hours?: number;
}

export interface CostConfig {
  _version: string;
  _last_updated?: string;
  _update_source?: string;
  _user_notes?: string;
  providers: Record<string, ProviderConfig>;
  cost_limits: CostLimits;
  update_config: UpdateConfig;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const PROJECT_COST_CONFIG = '.deckent/cost-config.json';

/** Path to bundled baseline — resolved relative to compiled dist/core/ location. */
function getBundledBaselinePath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);
  // Compiled location: dist/core/cost-config-loader.js
  // Baseline location: dist/core/pricing-data-baseline.json (copied at build-time)
  // Fallback: src/core/pricing-data-baseline.json (tsc dev mode)
  const distBaseline = join(thisDir, 'pricing-data-baseline.json');
  if (existsSync(distBaseline)) return distBaseline;
  // Dev fallback
  const srcBaseline = join(thisDir, '..', '..', 'src', 'core', 'pricing-data-baseline.json');
  return srcBaseline;
}

// ─── Unit Safety Pin ───────────────────────────────────────────────────────

/**
 * Unit safety check — Sprint 140 $42 disaster prevention.
 *
 * LiteLLM JSON values are per-token (e.g., 5e-06 = $5/MTok).
 * If someone accidentally uses per-MTok (5 instead of 5e-06), cost
 * calculations become 1,000,000× wrong. This pin catches it early.
 *
 * Opus 4.6 output is $25/MTok = $0.000025/token. Max realistic value
 * in the entire 2026 pricing universe is ~$0.0001/token (hypothetical
 * premium_plus reasoning). We use 0.01 as a safe ceiling — anything
 * bigger is definitely a unit error.
 */
export function validateCostUnit(costPerToken: number, field: string, modelId: string): void {
  if (costPerToken < 0) {
    throw new CostConfigError(
      `Negative cost in ${modelId}.${field}: ${costPerToken}`,
    );
  }
  if (costPerToken > 0.01) {
    throw new CostConfigError(
      `Unit error in ${modelId}.${field}: ${costPerToken} is too large for per-token cost. ` +
        `Expected per-token (e.g. 5e-06 = $5/MTok for Opus input). ` +
        `Did you accidentally use per-MTok value? Max allowed: 0.01 (prevents 1,000,000× billing errors).`,
    );
  }
}

// ─── Error Type ─────────────────────────────────────────────────────────────

export class CostConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CostConfigError';
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateCostConfig(config: unknown): CostConfig {
  if (!config || typeof config !== 'object') {
    throw new CostConfigError('Cost config must be an object');
  }
  const c = config as Record<string, unknown>;

  if (!c._version || typeof c._version !== 'string') {
    throw new CostConfigError('Missing _version field');
  }
  if (!c.providers || typeof c.providers !== 'object') {
    throw new CostConfigError('Missing providers field');
  }
  if (!c.cost_limits || typeof c.cost_limits !== 'object') {
    throw new CostConfigError('Missing cost_limits field');
  }
  if (!c.update_config || typeof c.update_config !== 'object') {
    throw new CostConfigError('Missing update_config field');
  }

  // Validate cost_limits
  const limits = c.cost_limits as Record<string, unknown>;
  if (typeof limits.sprint_max_usd !== 'number' || limits.sprint_max_usd < 0) {
    throw new CostConfigError('cost_limits.sprint_max_usd must be a non-negative number');
  }
  if (typeof limits.daily_max_usd !== 'number' || limits.daily_max_usd < 0) {
    throw new CostConfigError('cost_limits.daily_max_usd must be a non-negative number');
  }

  // Validate providers and unit-check every model
  const providers = c.providers as Record<string, unknown>;
  for (const [providerName, providerRaw] of Object.entries(providers)) {
    const provider = providerRaw as Record<string, unknown>;
    if (typeof provider.enabled !== 'boolean') {
      throw new CostConfigError(`providers.${providerName}.enabled must be boolean`);
    }
    if (!Array.isArray(provider.billing_modes_supported) || provider.billing_modes_supported.length === 0) {
      throw new CostConfigError(`providers.${providerName}.billing_modes_supported must be non-empty array`);
    }
    const models = provider.models as Record<string, unknown> | undefined;
    if (!models || typeof models !== 'object') {
      throw new CostConfigError(`providers.${providerName}.models must be an object`);
    }

    // Unit safety pin for every model
    for (const [modelId, modelRaw] of Object.entries(models)) {
      const model = modelRaw as Record<string, unknown>;
      if (typeof model.input_cost_per_token !== 'number') {
        throw new CostConfigError(`${providerName}.${modelId}.input_cost_per_token must be number`);
      }
      if (typeof model.output_cost_per_token !== 'number') {
        throw new CostConfigError(`${providerName}.${modelId}.output_cost_per_token must be number`);
      }
      if (typeof model.max_input_tokens !== 'number' || model.max_input_tokens < 1000) {
        throw new CostConfigError(`${providerName}.${modelId}.max_input_tokens must be number >= 1000`);
      }

      // Unit safety on every cost field
      validateCostUnit(model.input_cost_per_token, 'input_cost_per_token', modelId);
      validateCostUnit(model.output_cost_per_token, 'output_cost_per_token', modelId);

      if (model.cache_creation_input_token_cost != null) {
        validateCostUnit(model.cache_creation_input_token_cost as number, 'cache_creation_input_token_cost', modelId);
      }
      if (model.cache_creation_input_token_cost_above_1hr != null) {
        validateCostUnit(
          model.cache_creation_input_token_cost_above_1hr as number,
          'cache_creation_input_token_cost_above_1hr',
          modelId,
        );
      }
      if (model.cache_read_input_token_cost != null) {
        validateCostUnit(model.cache_read_input_token_cost as number, 'cache_read_input_token_cost', modelId);
      }
    }
  }

  return c as unknown as CostConfig;
}

// ─── Loader (with hot-reload) ───────────────────────────────────────────────

let cachedConfig: CostConfig | null = null;
let cachedPath: string | null = null;
let cachedMtime: number = 0;

export function loadCostConfig(projectRoot: string, options?: { forceReload?: boolean }): CostConfig {
  const configPath = join(projectRoot, PROJECT_COST_CONFIG);
  const now = Date.now();

  // Hot-reload check — if mtime changed or force, re-read
  if (!options?.forceReload && cachedConfig && cachedPath === configPath) {
    try {
      const stat = statSync(configPath);
      if (stat.mtimeMs === cachedMtime) return cachedConfig;
    } catch {
      // File doesn't exist, use cache
      if (cachedConfig) return cachedConfig;
    }
  }

  let rawConfig: unknown;

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      rawConfig = JSON.parse(content);
      cachedMtime = statSync(configPath).mtimeMs;
    } catch (err) {
      throw new CostConfigError(
        `Failed to parse ${PROJECT_COST_CONFIG}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    // Fall back to bundled baseline
    const baselinePath = getBundledBaselinePath();
    if (!existsSync(baselinePath)) {
      throw new CostConfigError(
        `Neither ${PROJECT_COST_CONFIG} nor bundled baseline (${baselinePath}) found. Deckent installation broken?`,
      );
    }
    const content = readFileSync(baselinePath, 'utf-8');
    rawConfig = JSON.parse(content);
    cachedMtime = now;
  }

  const config = validateCostConfig(rawConfig);
  cachedConfig = config;
  cachedPath = configPath;
  return config;
}

// ─── Initialization (copy baseline on first run) ───────────────────────────

/**
 * Initialize `.deckent/cost-config.json` from bundled baseline if missing.
 * Called by `deckent init` and lazily by `loadCostConfig` when user edits
 * the file for the first time.
 */
export function initCostConfig(projectRoot: string, options?: { force?: boolean }): { created: boolean; path: string } {
  const configPath = join(projectRoot, PROJECT_COST_CONFIG);

  if (existsSync(configPath) && !options?.force) {
    return { created: false, path: configPath };
  }

  const baselinePath = getBundledBaselinePath();
  if (!existsSync(baselinePath)) {
    throw new CostConfigError(`Bundled baseline not found at ${baselinePath}`);
  }

  mkdirSync(dirname(configPath), { recursive: true });
  const baselineContent = readFileSync(baselinePath, 'utf-8');
  writeFileSync(configPath, baselineContent, 'utf-8');

  // Clear cache so next load re-reads
  cachedConfig = null;
  cachedPath = null;
  cachedMtime = 0;

  return { created: true, path: configPath };
}

// ─── Lookup helpers ────────────────────────────────────────────────────────

/**
 * Find a model by ID or alias across all providers.
 * Returns the first match (deterministic order: enabled providers first, alphabetical).
 */
export function findModel(
  config: CostConfig,
  modelIdOrAlias: string,
): { provider: string; modelId: string; pricing: ModelPricing } | null {
  const providerOrder = Object.entries(config.providers)
    .filter(([, p]) => p.enabled)
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [providerName, provider] of providerOrder) {
    // Direct model ID match
    if (provider.models[modelIdOrAlias]) {
      return { provider: providerName, modelId: modelIdOrAlias, pricing: provider.models[modelIdOrAlias]! };
    }
    // Alias match
    for (const [modelId, pricing] of Object.entries(provider.models)) {
      if (pricing.deckent_aliases?.includes(modelIdOrAlias)) {
        return { provider: providerName, modelId, pricing };
      }
    }
  }
  return null;
}

/**
 * List all enabled models across all providers.
 */
export function listEnabledModels(
  config: CostConfig,
): Array<{ provider: string; modelId: string; pricing: ModelPricing }> {
  const result: Array<{ provider: string; modelId: string; pricing: ModelPricing }> = [];
  for (const [providerName, provider] of Object.entries(config.providers)) {
    if (!provider.enabled) continue;
    for (const [modelId, pricing] of Object.entries(provider.models)) {
      if (pricing.enabled !== false) {
        result.push({ provider: providerName, modelId, pricing });
      }
    }
  }
  return result;
}

/**
 * Convert per-token cost to per-MTok for display (multiply by 1M).
 * Never used in calculations — always per-token for math.
 */
export function formatCostPerMTok(costPerToken: number): string {
  return `$${(costPerToken * 1_000_000).toFixed(2)}/MTok`;
}
