/**
 * Pricing Updater — Multi-Provider Auto-Fetch
 *
 * Fetches latest pricing data from multiple sources and merges into
 * `.deckent/cost-config.json`. Primary source: LiteLLM JSON (vendored
 * by BerriAI, 100+ providers, daily updates, MIT license).
 * Secondary validator: OpenRouter API (cross-check, warn on >5% delta).
 * Fallback: bundled baseline (ADR-033 offline-first).
 *
 * Zero runtime dependency — uses Node 18+ native fetch().
 *
 * Sprint 141 Task 141-SAFE-02
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  loadCostConfig,
  validateCostConfig,
  CostConfigError,
  type CostConfig,
  type ModelPricing,
} from './cost-config-loader.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type UpdateSource = 'litellm' | 'openrouter' | 'bundled';

export interface UpdateOptions {
  /** Only update these providers (default: all) */
  providers?: string[];
  /** Preview changes without writing */
  dryRun?: boolean;
  /** Source priority order (default: from config) */
  sources?: UpdateSource[];
  /** Skip OpenRouter delta validation */
  skipValidation?: boolean;
}

export interface UpdateResult {
  success: boolean;
  source: UpdateSource;
  modelsUpdated: number;
  modelsAdded: number;
  modelsUnchanged: number;
  warnings: string[];
  deltaReport: Array<{
    model: string;
    field: string;
    oldValue: number | null;
    newValue: number | null;
    deltaPercent: number;
  }>;
  backupPath?: string;
  dryRun: boolean;
}

// ─── LiteLLM Source ────────────────────────────────────────────────────────

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/litellm/model_prices_and_context_window_backup.json';

interface LiteLLMModelEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_creation_input_token_cost_above_1hr?: number;
  cache_read_input_token_cost?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  litellm_provider?: string;
  mode?: string;
  supports_prompt_caching?: boolean;
  supports_reasoning?: boolean;
  supports_vision?: boolean;
  supports_tool_choice?: boolean;
}

/**
 * Fetch LiteLLM pricing data JSON.
 */
export async function fetchLiteLLMPricing(): Promise<Record<string, LiteLLMModelEntry>> {
  const response = await fetch(LITELLM_URL);
  if (!response.ok) {
    throw new CostConfigError(`LiteLLM fetch failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as Record<string, LiteLLMModelEntry>;
  return data;
}

// ─── OpenRouter Source ─────────────────────────────────────────────────────

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';

interface OpenRouterModelEntry {
  id: string;
  name: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
}

interface OpenRouterResponse {
  data: OpenRouterModelEntry[];
}

/**
 * Fetch OpenRouter models list (unauth).
 * Used for secondary validation — not primary source.
 */
export async function fetchOpenRouterPricing(): Promise<OpenRouterModelEntry[]> {
  const response = await fetch(OPENROUTER_URL);
  if (!response.ok) {
    throw new CostConfigError(`OpenRouter fetch failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as OpenRouterResponse;
  return data.data ?? [];
}

// ─── Provider Mapping ──────────────────────────────────────────────────────

/**
 * Map LiteLLM provider name → Deckent provider name.
 * LiteLLM uses vertex_ai, bedrock, etc. for Google/AWS; we only track
 * direct API providers.
 */
const LITELLM_PROVIDER_MAP: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  gemini: 'google',
  vertex_ai: 'google', // Vertex Gemini → google
};

/**
 * Filter LiteLLM entries to only direct API providers we care about.
 */
function filterRelevantModels(
  litellmData: Record<string, LiteLLMModelEntry>,
  allowedProviders: string[] = ['anthropic', 'openai', 'google'],
): Record<string, { provider: string; modelId: string; entry: LiteLLMModelEntry }> {
  const result: Record<string, { provider: string; modelId: string; entry: LiteLLMModelEntry }> = {};

  for (const [modelKey, entry] of Object.entries(litellmData)) {
    if (!entry || typeof entry !== 'object') continue;
    if (!entry.litellm_provider) continue;
    if (entry.mode !== 'chat' && entry.mode !== 'responses') continue;

    const deckentProvider = LITELLM_PROVIDER_MAP[entry.litellm_provider];
    if (!deckentProvider || !allowedProviders.includes(deckentProvider)) continue;

    // Skip fine-tuned variants, dated snapshots (claude-3-sonnet-20240229), etc.
    if (modelKey.includes(':') || modelKey.includes('@')) continue;

    // Normalize model ID: strip provider prefix (gemini/gemini-2.5-pro → gemini-2-5-pro)
    let normalizedId = modelKey;
    if (modelKey.includes('/')) {
      normalizedId = modelKey.split('/').pop()!;
    }
    // Dot → dash for alias consistency (claude-opus-4.6 → claude-opus-4-6)
    normalizedId = normalizedId.replace(/\./g, '-');

    result[normalizedId] = { provider: deckentProvider, modelId: normalizedId, entry };
  }

  return result;
}

// ─── LiteLLM → Deckent Format Conversion ──────────────────────────────────

function liteLLMToDeckentPricing(
  entry: LiteLLMModelEntry,
  modelId: string,
  source: UpdateSource,
): ModelPricing {
  if (typeof entry.input_cost_per_token !== 'number') {
    throw new CostConfigError(`LiteLLM entry ${modelId} missing input_cost_per_token`);
  }
  if (typeof entry.output_cost_per_token !== 'number') {
    throw new CostConfigError(`LiteLLM entry ${modelId} missing output_cost_per_token`);
  }
  if (typeof entry.max_input_tokens !== 'number') {
    throw new CostConfigError(`LiteLLM entry ${modelId} missing max_input_tokens`);
  }

  return {
    input_cost_per_token: entry.input_cost_per_token,
    output_cost_per_token: entry.output_cost_per_token,
    cache_creation_input_token_cost: entry.cache_creation_input_token_cost ?? null,
    cache_creation_input_token_cost_above_1hr: entry.cache_creation_input_token_cost_above_1hr ?? null,
    cache_read_input_token_cost: entry.cache_read_input_token_cost ?? null,
    max_input_tokens: entry.max_input_tokens,
    max_output_tokens: entry.max_output_tokens,
    supports_prompt_caching: entry.supports_prompt_caching,
    supports_reasoning: entry.supports_reasoning,
    supports_vision: entry.supports_vision,
    supports_tool_choice: entry.supports_tool_choice,
    enabled: true,
    _source: source,
    _verified_at: new Date().toISOString().slice(0, 10),
  };
}

// ─── Delta Calculation ─────────────────────────────────────────────────────

function calculateDelta(oldVal: number | null | undefined, newVal: number | null | undefined): number {
  if (oldVal == null && newVal == null) return 0;
  if (oldVal == null || oldVal === 0) return newVal != null ? Infinity : 0;
  if (newVal == null) return -100;
  return ((newVal - oldVal) / oldVal) * 100;
}

// ─── Merge + Write ─────────────────────────────────────────────────────────

/**
 * Merge new pricing data into existing config, preserving user customizations.
 *
 * Rules:
 * - User notes (_user_notes) preserved
 * - cost_limits preserved (user's budget settings)
 * - update_config preserved (user's source priority)
 * - Model pricing: overwritten from source
 * - deckent_tier, deckent_aliases: preserved if existing, set default if new
 * - enabled flag: preserved if user disabled a model
 */
function mergeConfigs(
  existing: CostConfig,
  newData: Map<string, Map<string, ModelPricing>>,
  source: UpdateSource,
): { merged: CostConfig; delta: UpdateResult['deltaReport']; added: number; updated: number; unchanged: number } {
  const merged: CostConfig = {
    _version: existing._version,
    _last_updated: new Date().toISOString(),
    _update_source: source,
    _user_notes: existing._user_notes,
    providers: {},
    cost_limits: existing.cost_limits,
    update_config: existing.update_config,
  };

  const delta: UpdateResult['deltaReport'] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const [providerName, providerConfig] of Object.entries(existing.providers)) {
    merged.providers[providerName] = {
      ...providerConfig,
      models: { ...providerConfig.models },
    };
  }

  for (const [providerName, newModels] of newData.entries()) {
    const provider = merged.providers[providerName];
    if (!provider) continue; // Only update providers user has configured

    for (const [modelId, newPricing] of newModels.entries()) {
      const existingPricing = provider.models[modelId];

      if (!existingPricing) {
        // New model
        provider.models[modelId] = newPricing;
        added++;
        continue;
      }

      // Preserve user fields
      const preserved: ModelPricing = {
        ...newPricing,
        deckent_tier: existingPricing.deckent_tier,
        deckent_aliases: existingPricing.deckent_aliases,
        enabled: existingPricing.enabled,
      };

      // Delta check on all cost fields
      const fields: Array<keyof ModelPricing> = [
        'input_cost_per_token',
        'output_cost_per_token',
        'cache_creation_input_token_cost',
        'cache_creation_input_token_cost_above_1hr',
        'cache_read_input_token_cost',
      ];

      let changed = false;
      for (const field of fields) {
        const oldV = existingPricing[field] as number | null | undefined;
        const newV = preserved[field] as number | null | undefined;
        const deltaPct = calculateDelta(oldV, newV);
        if (Math.abs(deltaPct) > 0.001) {
          changed = true;
          delta.push({
            model: `${providerName}/${modelId}`,
            field: String(field),
            oldValue: oldV ?? null,
            newValue: newV ?? null,
            deltaPercent: deltaPct,
          });
        }
      }

      if (changed) {
        provider.models[modelId] = preserved;
        updated++;
      } else {
        unchanged++;
      }
    }
  }

  return { merged, delta, added, updated, unchanged };
}

// ─── Main Update Function ──────────────────────────────────────────────────

/**
 * Update `.deckent/cost-config.json` from web sources.
 *
 * @param projectRoot - Project root directory
 * @param options - Update options (providers filter, dry-run, etc.)
 */
export async function updatePricing(projectRoot: string, options: UpdateOptions = {}): Promise<UpdateResult> {
  const sources = options.sources ?? ['litellm', 'openrouter', 'bundled'];
  const allowedProviders = options.providers ?? ['anthropic', 'openai', 'google'];
  const dryRun = options.dryRun ?? false;

  // Load existing config (may fall back to baseline)
  const existing = loadCostConfig(projectRoot, { forceReload: true });

  const warnings: string[] = [];
  let usedSource: UpdateSource = 'bundled';
  const newData: Map<string, Map<string, ModelPricing>> = new Map();

  // Try sources in priority order
  for (const source of sources) {
    try {
      if (source === 'litellm') {
        const litellmData = await fetchLiteLLMPricing();
        const filtered = filterRelevantModels(litellmData, allowedProviders);

        for (const { provider, modelId, entry } of Object.values(filtered)) {
          if (!newData.has(provider)) newData.set(provider, new Map());
          try {
            const pricing = liteLLMToDeckentPricing(entry, modelId, 'litellm');
            newData.get(provider)!.set(modelId, pricing);
          } catch (err) {
            warnings.push(
              `Skipped ${provider}/${modelId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        usedSource = 'litellm';
        break; // Primary source succeeded, done
      }
    } catch (err) {
      warnings.push(`Source ${source} failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }

  if (newData.size === 0) {
    return {
      success: false,
      source: 'bundled',
      modelsUpdated: 0,
      modelsAdded: 0,
      modelsUnchanged: 0,
      warnings: [...warnings, 'All sources failed, no update performed'],
      deltaReport: [],
      dryRun,
    };
  }

  // Secondary validation with OpenRouter (optional)
  if (!options.skipValidation) {
    try {
      const openRouterData = await fetchOpenRouterPricing();
      const validationWarnings = validateAgainstOpenRouter(newData, openRouterData, existing);
      warnings.push(...validationWarnings);
    } catch (err) {
      warnings.push(
        `OpenRouter validation skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Merge with existing config
  const { merged, delta, added, updated, unchanged } = mergeConfigs(existing, newData, usedSource);

  // Re-validate merged config (unit safety pin)
  try {
    validateCostConfig(merged);
  } catch (err) {
    return {
      success: false,
      source: usedSource,
      modelsUpdated: 0,
      modelsAdded: 0,
      modelsUnchanged: 0,
      warnings: [
        ...warnings,
        `Merged config failed validation: ${err instanceof Error ? err.message : String(err)}`,
      ],
      deltaReport: delta,
      dryRun,
    };
  }

  // Write (if not dry-run)
  let backupPath: string | undefined;
  if (!dryRun) {
    const configPath = join(projectRoot, '.deckent', 'cost-config.json');
    const cacheDir = join(projectRoot, '.deckent', 'cache');
    mkdirSync(cacheDir, { recursive: true });

    // Backup existing
    if (existsSync(configPath)) {
      const dateStamp = new Date().toISOString().slice(0, 10);
      backupPath = join(cacheDir, `pricing-${dateStamp}.json`);
      writeFileSync(backupPath, readFileSync(configPath, 'utf-8'), 'utf-8');
    }

    // Atomic write
    mkdirSync(dirname(configPath), { recursive: true });
    const tmpPath = configPath + '.tmp';
    writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf-8');
    const { renameSync } = await import('node:fs');
    renameSync(tmpPath, configPath);
  }

  return {
    success: true,
    source: usedSource,
    modelsUpdated: updated,
    modelsAdded: added,
    modelsUnchanged: unchanged,
    warnings,
    deltaReport: delta,
    backupPath,
    dryRun,
  };
}

// ─── OpenRouter Validation ─────────────────────────────────────────────────

function validateAgainstOpenRouter(
  newData: Map<string, Map<string, ModelPricing>>,
  openRouterData: OpenRouterModelEntry[],
  existing: CostConfig,
): string[] {
  const warnings: string[] = [];
  const deltaThreshold = existing.update_config.validation_delta_percent ?? 5;

  // Build OpenRouter lookup
  const orMap = new Map<string, OpenRouterModelEntry>();
  for (const entry of openRouterData) {
    if (!entry.pricing?.prompt || !entry.pricing?.completion) continue;
    // Normalize: "anthropic/claude-opus-4-6" → "claude-opus-4-6"
    const normalized = entry.id.includes('/') ? entry.id.split('/').pop()! : entry.id;
    orMap.set(normalized.replace(/\./g, '-'), entry);
  }

  // Check each model
  for (const [providerName, models] of newData.entries()) {
    for (const [modelId, pricing] of models.entries()) {
      const orEntry = orMap.get(modelId);
      if (!orEntry?.pricing) continue;

      const orInput = parseFloat(orEntry.pricing.prompt ?? '0');
      const orOutput = parseFloat(orEntry.pricing.completion ?? '0');

      const inputDelta = calculateDelta(pricing.input_cost_per_token, orInput);
      const outputDelta = calculateDelta(pricing.output_cost_per_token, orOutput);

      if (Math.abs(inputDelta) > deltaThreshold) {
        warnings.push(
          `${providerName}/${modelId}: input price delta ${inputDelta.toFixed(1)}% between LiteLLM and OpenRouter (${pricing.input_cost_per_token} vs ${orInput})`,
        );
      }
      if (Math.abs(outputDelta) > deltaThreshold) {
        warnings.push(
          `${providerName}/${modelId}: output price delta ${outputDelta.toFixed(1)}% between LiteLLM and OpenRouter`,
        );
      }
    }
  }

  return warnings;
}

// ─── Display Helpers ───────────────────────────────────────────────────────

export function formatUpdateResult(result: UpdateResult): string {
  const lines: string[] = [];
  lines.push(`🔄 Pricing Update ${result.dryRun ? '(dry-run)' : ''}`);
  lines.push(`  Source: ${result.source}`);
  lines.push(`  Status: ${result.success ? '✅ success' : '❌ failed'}`);
  lines.push(`  Models: +${result.modelsAdded} new, ${result.modelsUpdated} updated, ${result.modelsUnchanged} unchanged`);

  if (result.deltaReport.length > 0) {
    lines.push(`  Delta (showing first 10):`);
    for (const d of result.deltaReport.slice(0, 10)) {
      const sign = d.deltaPercent > 0 ? '+' : '';
      lines.push(`    ${d.model}.${d.field}: ${d.oldValue} → ${d.newValue} (${sign}${d.deltaPercent.toFixed(1)}%)`);
    }
    if (result.deltaReport.length > 10) {
      lines.push(`    ... and ${result.deltaReport.length - 10} more`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`  Warnings:`);
    for (const w of result.warnings.slice(0, 5)) {
      lines.push(`    ⚠ ${w}`);
    }
    if (result.warnings.length > 5) {
      lines.push(`    ... and ${result.warnings.length - 5} more`);
    }
  }

  if (result.backupPath) {
    lines.push(`  Backup: ${result.backupPath}`);
  }

  return lines.join('\n');
}
