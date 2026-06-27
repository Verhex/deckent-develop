// ─── KPI Definition Schema, Builtins & Loader ─────────────────────────────────
// Defines the runtime KPI definition format (zod schema), the 8 Faz-1 built-in
// KPIs, and the config loader that merges builtins with validated custom defs.
//
// Schema pattern: mirrors NERVOUS_SYSTEM_SCHEMA in src/core/config.ts:286.
// i18n-first: every `title` is { en, tr } — no hardcoded user-visible strings.
// NETWORK-ZERO: pure module, no I/O, no network.

import { z } from 'zod';
import { ErrorRegistry } from '../errors.js';
import { BASE_MEASURES } from './measure-catalog.js';
import { evaluateFormula, FormulaError } from './formula-evaluator.js';

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const KPI_TITLE_SCHEMA = z.object({
  en: z.string().min(1),
  tr: z.string().min(1),
});

const KPI_THRESHOLD_SCHEMA = z.object({
  warn: z.number(),
  critical: z.number(),
});

const KPI_DIRECTION_SCHEMA = z.enum(['up', 'down']);
const KPI_FORMAT_SCHEMA = z.enum(['number', 'percent', 'currency', 'duration']);
const KPI_TIER_SCHEMA = z.enum(['universal', 'dogfood', 'custom']);
const KPI_GRAIN_SCHEMA = z.enum(['sprint', 'day', 'week', 'month']);

// ─── Main Schema ─────────────────────────────────────────────────────────────

/** Zod schema for a KPI definition (spec §6 format). Matches the config-file
 *  shape. Follows the NERVOUS_SYSTEM_SCHEMA pattern (config.ts:286). */
export const KPI_DEFINITION_SCHEMA = z
  .object({
    /** Unique snake_case identifier. Must start with a lowercase letter. */
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, 'id must be lower-snake_case'),
    /** i18n display name — {en, tr} required. No hardcoded strings. */
    title: KPI_TITLE_SCHEMA,
    /** Arithmetic formula over catalog measure IDs (spec §6 DSL).
     *  Evaluated by the sandboxed formula-evaluator (SSOT). */
    formula: z.string().min(1),
    /** SI / domain unit string for display (e.g. "USD", "tokens", "ratio"). */
    unit: z.string().min(1),
    format: KPI_FORMAT_SCHEMA,
    /** Whether a higher ('up') or lower ('down') value is better. */
    direction: KPI_DIRECTION_SCHEMA,
    /** Optional performance target. */
    target: z.number().optional(),
    /** Warning/critical boundaries. Semantics are direction-aware:
     *  'down' KPI: value ≥ critical → critical; ≥ warn → warn.
     *  'up'   KPI: value ≤ critical → critical; ≤ warn → warn. */
    threshold: KPI_THRESHOLD_SCHEMA.optional(),
    grain: KPI_GRAIN_SCHEMA,
    /** Classification tier: universal (all users) | dogfood (deckent internal) | custom (user). */
    tier: KPI_TIER_SCHEMA,
    /** Tenant scope — 'global' for built-ins; a tenant_id string for tenant-scoped custom KPIs. */
    scope: z.string().default('global'),
    /** Whether this KPI is active. Disabled KPIs are stored but not computed. */
    enabled: z.boolean().default(true),
  })
  .strict();

/** TypeScript type inferred from `KPI_DEFINITION_SCHEMA`. */
export type KpiDefinitionSpec = z.infer<typeof KPI_DEFINITION_SCHEMA>;

// ─── Formula catalog validation ───────────────────────────────────────────────

/** Sample measures map: all catalog IDs set to 1.0 for identifier-whitelist check. */
function buildSampleMeasures(): Record<string, number> {
  return Object.fromEntries(Object.keys(BASE_MEASURES).map(id => [id, 1.0]));
}

/**
 * Validate a raw unknown value as a `KpiDefinitionSpec`.
 *
 * 1. Parses the Zod schema — throws `ZodError` on structural violations.
 * 2. Evaluates the formula with all catalog measures set to 1.0 to ensure every
 *    identifier in the formula is a known catalog measure ID — throws `Error`
 *    on unknown-identifier (catalog-external measure reference).
 *
 * @throws {z.ZodError}    On schema validation failure.
 * @throws {DeckentError}  (code DECKENT_E073) On formula referencing a non-catalog identifier.
 */
export function validateKpiDefinition(raw: unknown): KpiDefinitionSpec {
  const def = KPI_DEFINITION_SCHEMA.parse(raw);

  const sample = buildSampleMeasures();
  try {
    evaluateFormula(def.formula, sample);
  } catch (err) {
    if (err instanceof FormulaError) {
      throw ErrorRegistry.createError('DECKENT_E073', {
        message: `KPI "${def.id}" formula error: ${err.message}`,
      });
    }
    throw err;
  }

  return def;
}

// ─── Builtin KPI Catalog (8 Faz-1 KPIs) ─────────────────────────────────────

/** 8 Phase-1 built-in KPIs: 5 universal + 3 dogfood. */
export const BUILTIN_KPIS: readonly KpiDefinitionSpec[] = [
  // ── Universal KPIs (5) ────────────────────────────────────────────────────

  {
    id: 'cost_per_sprint',
    title: { en: 'Cost / Sprint', tr: 'Sprint Başına Maliyet' },
    formula: 'cost_usd / sprint_count',
    unit: 'USD',
    format: 'currency',
    direction: 'down',
    threshold: { warn: 3.0, critical: 3.5 },
    grain: 'sprint',
    tier: 'universal',
    scope: 'global',
    enabled: true,
  },
  {
    id: 'token_per_task',
    title: { en: 'Tokens / Task', tr: 'Görev Başına Token' },
    formula: '(tokens_input + tokens_output) / tasks_total',
    unit: 'tokens',
    format: 'number',
    direction: 'down',
    grain: 'sprint',
    tier: 'universal',
    scope: 'global',
    enabled: true,
  },
  {
    id: 'cache_hit_rate',
    title: { en: 'Cache Hit Rate', tr: 'Önbellek İsabeti Oranı' },
    formula: 'cache_read / (cache_read + tokens_input)',
    unit: 'ratio',
    format: 'percent',
    direction: 'up',
    grain: 'sprint',
    tier: 'universal',
    scope: 'global',
    enabled: true,
  },
  {
    id: 'cost_per_kloc',
    title: { en: 'Cost / KLoC', tr: 'KSatır Başına Maliyet' },
    formula: 'cost_usd / (lines_added / 1000)',
    unit: 'USD/KLoC',
    format: 'currency',
    direction: 'down',
    grain: 'sprint',
    tier: 'universal',
    scope: 'global',
    enabled: true,
  },
  {
    id: 'avg_retry',
    title: { en: 'Avg Retries / Task', tr: 'Görev Başına Ortalama Yeniden Deneme' },
    formula: 'retries / tasks_total',
    unit: 'retries/task',
    format: 'number',
    direction: 'down',
    grain: 'sprint',
    tier: 'universal',
    scope: 'global',
    enabled: true,
  },

  // ── Dogfood KPIs (3) ──────────────────────────────────────────────────────

  {
    id: 'no_go_rate',
    title: { en: 'No-Go Rate', tr: 'NO-GO Oranı' },
    formula: 'no_go / tasks_total',
    unit: 'ratio',
    format: 'percent',
    direction: 'down',
    threshold: { warn: 0.15, critical: 0.3 },
    grain: 'sprint',
    tier: 'dogfood',
    scope: 'global',
    enabled: true,
  },
  {
    id: 'completion_rate',
    title: { en: 'Completion Rate', tr: 'Tamamlanma Oranı' },
    formula: 'tasks_done / tasks_total',
    unit: 'ratio',
    format: 'percent',
    direction: 'up',
    grain: 'sprint',
    tier: 'dogfood',
    scope: 'global',
    enabled: true,
  },
  {
    id: 'boundary_violation_rate',
    title: { en: 'Boundary Violation Rate', tr: 'Sınır İhlali Oranı' },
    formula: 'boundary_violations / tasks_total',
    unit: 'ratio',
    format: 'percent',
    direction: 'down',
    grain: 'sprint',
    tier: 'dogfood',
    scope: 'global',
    enabled: true,
  },
] as const;

// ─── Config Loader ────────────────────────────────────────────────────────────

/**
 * Merge built-in KPI definitions with optional validated custom definitions.
 *
 * - Starts with the 8 built-in KPIs.
 * - For each entry in `customDefs`: validates it with `validateKpiDefinition`
 *   (throws on schema error or catalog-external formula identifier), then
 *   inserts it — overriding the built-in with the same `id` if present.
 * - Returns the final ordered list (builtins first, unless overridden).
 *
 * @param customDefs  Raw (unvalidated) custom KPI definitions from config.
 * @throws {z.ZodError | Error}  If any custom definition is invalid.
 */
export function loadKpiDefinitions(
  customDefs?: readonly unknown[],
): KpiDefinitionSpec[] {
  const map = new Map<string, KpiDefinitionSpec>(
    BUILTIN_KPIS.map(k => [k.id, k]),
  );

  if (customDefs && customDefs.length > 0) {
    for (const raw of customDefs) {
      const def = validateKpiDefinition(raw);
      map.set(def.id, def);
    }
  }

  return [...map.values()];
}
