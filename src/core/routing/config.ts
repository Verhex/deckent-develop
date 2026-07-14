// ═══ RoutingEngineV3 — Config Schema + 3-Layer Merge ══════════════════
// Slice-0 FOUNDATION (sprint-445, Task 445-010). Owns the `routing_v3` block's
// runtime validation (zod), the single defaults declaration, and the resolver
// that layers default → global → project, reusing the SAME `deepMerge`
// primitive `core/config.ts`'s own `mergeConfigs`/`loadConfig` use for the
// rest of DeckentConfig. This module — not config.ts — is the schema's home:
// `routing_v3` is exclusively consumed by the routing3 subsystem (see the doc
// comment on `RoutingV3Config` in config-types.ts for the full rationale).
//
// Nothing here alters a live routing decision (Slice-0 constraint) — this is
// schema + merge plumbing only; `enabled` defaults to `false` until Slice-3.

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
    enabled: z.boolean(),
    weights: ROUTING_V3_WEIGHTS_SCHEMA,
    confidenceFloor: z.number().min(0).max(1),
    governanceMode: ROUTING_V3_GOVERNANCE_MODE_SCHEMA,
    topK: z.number().int().positive(),
    structuralConfidence: z.number().min(0).max(1),
  })
  .strict();

// ─── Defaults (the ONE place routing_v3 defaults live) ────────────────

/**
 * Single source of truth for `routing_v3` defaults. Do NOT duplicate any of
 * these values elsewhere (e.g. config.ts's `createDefaultConfig`) — Task
 * 445-010's nogo is explicit: defaults duplicated in two places is a NO_GO.
 * `enabled: false` — the RoutingEngineV3 cut-over flips this in Slice-3.
 */
export const DEFAULT_ROUTING_V3_CONFIG: RoutingV3Config = {
  enabled: false,
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
