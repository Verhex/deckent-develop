// ═══ RoutingEngineV3 — Config Schema + 3-Layer Merge ══════════════════
// Slice-0 FOUNDATION (sprint-445, Task 445-010). Owns the `routing_v3` block's
// runtime validation (zod), the single defaults declaration, and the resolver
// that layers default → global → project, reusing the SAME `deepMerge`
// primitive `core/config.ts`'s own `mergeConfigs`/`loadConfig` use for the
// rest of DeckentConfig. This module — not config.ts — is the schema's home:
// `routing_v3` is exclusively consumed by the routing3 subsystem (see the doc
// comment on `RoutingV3Config` in config-types.ts for the full rationale).
//
// Post-S3 cut-over (2026-07-15): V3 is the only routing engine and the planner
// runs it unconditionally, so `enabled` is a VESTIGIAL no-op — kept as an
// optional, ignored key (not in the defaults) purely so a pre-cut-over config
// that still sets it validates against the strict schema instead of hard-failing.

import { z } from 'zod';
import { deepMerge } from '../config.js';
import { DeckentError } from '../errors.js';
import type { DeckentConfig, RoutingV3Config, RoutingV3Weights } from '../config-types.js';

// ─── Zod Schema (mirrors RoutingV3Config — config-types.ts) ───────────

/** Mirrors {@link RoutingV3Weights}. Sum-to-1.0 is checked separately (zod
 *  has no native cross-field arithmetic constraint that gives a typed error). */
export const ROUTING_V3_WEIGHTS_SCHEMA = z
  .object({
    content: z.number().min(0).max(1),
    positional: z.number().min(0).max(1),
    numerical: z.number().min(0).max(1),
  })
  .strict();

export const ROUTING_V3_GOVERNANCE_MODE_SCHEMA = z.enum(['ai', 'deterministic']);

/** Mirrors {@link RoutingV3Config}. */
export const ROUTING_V3_SCHEMA = z
  .object({
    // Vestigial no-op (S3 cut-over): optional so a pre-cut-over config that
    // still sets it validates; `.strict()` below is intact for every other key.
    enabled: z.boolean().optional(),
    weights: ROUTING_V3_WEIGHTS_SCHEMA,
    confidenceFloor: z.number().min(0).max(1),
    governanceMode: ROUTING_V3_GOVERNANCE_MODE_SCHEMA,
    topK: z.number().int().positive(),
    structuralConfidence: z.number().min(0).max(1),
    signalGatedNumerical: z.boolean(),
  })
  .strict();

// ─── Defaults (the ONE place routing_v3 defaults live) ────────────────

/**
 * Single source of truth for `routing_v3` defaults. Do NOT duplicate any of
 * these values elsewhere (e.g. config.ts's `createDefaultConfig`) — Task
 * 445-010's nogo is explicit: defaults duplicated in two places is a NO_GO.
 * `enabled` is intentionally absent — it is a vestigial no-op post-S3 cut-over
 * (V3 routing is unconditional); the field stays optional on the schema only
 * for back-compat with pre-cut-over configs that still set it.
 */
export const DEFAULT_ROUTING_V3_CONFIG: RoutingV3Config = {
  weights: { content: 0.5, positional: 0.3, numerical: 0.2 },
  // Placeholder thresholds — unconsumed by any runtime code this slice (no
  // spec value exists yet for these three; Slice-2/3 calibrate them
  // empirically against the real vector-selection engine). Conservative
  // starting points: require a solid majority-confidence composite score and
  // structural-evidence match before trusting a vector-routing decision.
  confidenceFloor: 0.6,
  governanceMode: 'ai',
  topK: 5,
  structuralConfidence: 0.7,
  // K1 — 581-kalibrasyon (Alperen-onaylı 2026-07-19): numerical axis drops
  // decision-wide signal-free components (cold cells / absent live) from its
  // mean instead of neutral-flattening. Rollback: `signalGatedNumerical: false`.
  signalGatedNumerical: true,
};

const WEIGHTS_SUM_EPSILON = 1e-9;

function sumWeights(weights: RoutingV3Weights): number {
  return weights.content + weights.positional + weights.numerical;
}

// ─── Typed Errors (DeckentError family — mirrors routing3/types.ts) ───

/** Thrown when `routing_v3` fails zod shape/range validation. */
export class InvalidRoutingV3ConfigError extends DeckentError {
  constructor(detail: string) {
    super(
      'ROUTING3_INVALID_CONFIG',
      `Invalid routing_v3 config: ${detail}`,
      'Check the routing_v3 block shape against RoutingV3Config (core/config-types.ts) — every field is required once the block resolves past defaults.',
    );
    this.name = 'InvalidRoutingV3ConfigError';
  }
}

/** Thrown when `routing_v3.weights` does not sum to 1.0. */
export class RoutingV3WeightsSumError extends DeckentError {
  public readonly sum: number;
  public readonly weights: RoutingV3Weights;
  constructor(sum: number, weights: RoutingV3Weights) {
    super(
      'ROUTING3_INVALID_WEIGHTS_SUM',
      `routing_v3.weights must sum to 1.0, got ${sum} (content=${weights.content}, positional=${weights.positional}, numerical=${weights.numerical})`,
      'Adjust routing_v3.weights.{content,positional,numerical} so they sum to exactly 1.0.',
    );
    this.name = 'RoutingV3WeightsSumError';
    this.sum = sum;
    this.weights = weights;
  }
}

// ─── Validation ────────────────────────────────────────────────────────

/**
 * Zod-validate a fully-merged `routing_v3` config, then enforce the
 * weights-sum-to-1.0 invariant. Throws {@link InvalidRoutingV3ConfigError} or
 * {@link RoutingV3WeightsSumError} on failure; returns the validated,
 * strongly-typed config otherwise.
 */
export function validateRoutingV3Config(config: RoutingV3Config): RoutingV3Config {
  const parsed = ROUTING_V3_SCHEMA.safeParse(config);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
    throw new InvalidRoutingV3ConfigError(detail);
  }

  const sum = sumWeights(parsed.data.weights);
  if (Math.abs(sum - 1.0) > WEIGHTS_SUM_EPSILON) {
    throw new RoutingV3WeightsSumError(sum, parsed.data.weights);
  }

  return parsed.data;
}

// ─── 3-Layer Merge Resolver ─────────────────────────────────────────────

/**
 * Resolve the `routing_v3` block via default → global → project, reusing
 * `deepMerge` from `core/config.ts` — the SAME merge primitive
 * `mergeConfigs`/`loadConfig` use for the rest of `DeckentConfig`. Project
 * overrides global overrides default. Either config argument may be omitted
 * or null (mirrors `mergeConfigs`'s own signature shape).
 *
 * Throws {@link RoutingV3WeightsSumError} or {@link InvalidRoutingV3ConfigError}
 * when the final merged result fails validation.
 */
export function resolveRoutingV3Config(
  globalConfig?: Partial<DeckentConfig> | null,
  projectConfig?: Partial<DeckentConfig> | null,
): RoutingV3Config {
  let merged: RoutingV3Config = structuredClone(DEFAULT_ROUTING_V3_CONFIG);

  if (globalConfig?.routing_v3) {
    merged = deepMerge(merged, globalConfig.routing_v3);
  }
  if (projectConfig?.routing_v3) {
    merged = deepMerge(merged, projectConfig.routing_v3);
  }

  return validateRoutingV3Config(merged);
}

// ─── Work-type → default effort tier (S3: replaces V2 resolveEffortTier) ─────
// Faithful mapping of the retired LOW/HIGH_EFFORT_INTENTS semantics onto the
// closed work-type core: documentation/config work runs light; deep analysis
// runs high; construction lanes default to normal.
export const WORK_TYPE_EFFORT: Readonly<Record<string, 'low' | 'normal' | 'high'>> = {
  build: 'normal',
  fix: 'normal',
  refactor: 'normal',
  document: 'low',
  review: 'normal',
  configure: 'low',
  migrate: 'normal',
  analyze: 'high',
};

/** Default effort tier for a work-type ('normal' for unknown/subtyped input). */
export function effortForWorkType(workType: string): 'low' | 'normal' | 'high' {
  const parent = workType.includes(':') ? workType.split(':')[0]! : workType;
  return WORK_TYPE_EFFORT[parent] ?? 'normal';
}
