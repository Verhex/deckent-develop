// ═══ Provider Overflow Gate (pre-spawn) ════════════════════════════════
// F1-010 — dynamic subscription → API overflow gate (Sprint 333 Task 333-002).
//
// The STATIC tier-preserving resolver `resolveWithOverflow` (provider-overflow.ts,
// Sprint 215 / F1-009) is wired only REACTIVELY in the FIX phase
// (mid-sprint-adapter.applyRateLimitFailover, after a 429 already happened).
//
// This module adds the PRE-SPAWN decision: before a worker is dispatched, if its
// subscription provider is currently rate-limited/quota-exhausted (signal from
// `RateLimitState` / `shouldThrottle`, token-quota.ts) AND an API overflow target
// is configured, overflow THAT one worker onto an equivalent-tier API model so the
// fleet keeps throughput (subscription + API together for max throughput).
//
// **Scope:** DECISION logic only — no I/O, no spawn, no network. The caller
// (sprint-spawner.ts) applies the returned decision. Tier-preservation is
// DELEGATED to the existing `resolveWithOverflow` — never re-implemented here.
//
// Provider-agnostic: any subscription provider → any configured API provider.
//
// ADR-010 compliant: pure functions, no new runtime deps.
// ADR-008 compliant: imports only sibling `core/` modules.
// Law #2 / ADR-076 honest-fail: overflow requested but no target configured →
// keep the original provider + advisory note; NEVER silently degrade to claude.
//
// TODO(phase2): multi-worker fleet rebalancing (not just one worker at a time) and
// mid-flight overflow (re-route a worker that hits a limit DURING execution, not
// only pre-spawn). Both are deliberate follow-ups — noted, not stubbed.

import type { Task } from './task-types.js';
import { shouldThrottle, type RateLimitState } from './token-quota.js';
import { resolveWithOverflow } from './provider-overflow.js';
import {
  modelRegistry,
  type ModelRegistry,
  type RegistryProviderName,
} from './model-registry.js';

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Pre-spawn overflow configuration (the `config.provider_overflow` block).
 * Provider-agnostic: `apiProvider` may be any registry provider name.
 */
export interface ProviderOverflowConfig {
  /**
   * Master switch for the dynamic pre-spawn overflow gate. Overflow only ever
   * happens when this is strictly `true`. `undefined`/`false` ⇒ gate disabled
   * (default-off) ⇒ today's behavior is byte-for-byte unchanged.
   */
  dynamic?: boolean;
  /**
   * The API provider to overflow rate-limited subscription workers onto
   * (e.g. `'codex'`, `'gemini'`). When absent, an overflow that would otherwise
   * fire is refused with an honest advisory (never a silent claude fallback).
   */
  apiProvider?: RegistryProviderName;
}

/** Why `decidePreSpawnOverflow` returned what it did — drives caller logging. */
export type PreSpawnOverflowReason =
  | 'disabled'       // gate flag off (default) — no overflow attempted
  | 'already_api'    // task already in API authMode — nothing to overflow
  | 'no_limit'       // no rate-limit/quota signal — subscription still has budget
  | 'no_target'      // limited, but no API overflow target configured (advisory)
  | 'no_equivalent'  // limited + target set, but no tier-equivalent model (advisory)
  | 'overflow';      // limited + target → overflow to equivalent-tier API model

/**
 * Result of a pre-spawn overflow decision.
 *
 * `overflowProvider` is the API provider to swap THIS worker onto, or `null` to
 * keep the original provider unchanged (every non-overflow case). When non-null,
 * `overflowModel` carries the tier-equivalent model resolved on that provider
 * (delegated from `resolveWithOverflow`), so the caller swaps provider + model
 * together and never has to re-resolve.
 *
 * `advisory` is a human-readable honest-fail note for the refusal cases
 * (`no_target` / `no_equivalent`) — the caller surfaces it instead of silently
 * degrading. `null` when there is nothing to advise.
 */
export interface PreSpawnOverflowDecision {
  overflowProvider: RegistryProviderName | null;
  overflowModel: string | null;
  reason: PreSpawnOverflowReason;
  advisory: string | null;
}

/** Named arguments for {@link decidePreSpawnOverflow}. */
export interface DecidePreSpawnOverflowInput {
  /** The worker task about to be dispatched (treated as immutable). */
  task: Task;
  /** Latest subscription rate-limit snapshot; `null` ⇒ no signal (no overflow). */
  rateLimitState: RateLimitState | null;
  /** The `config.provider_overflow` block; `undefined` ⇒ gate disabled. */
  providerConfig: ProviderOverflowConfig | undefined;
  /** ModelRegistry for tier-equivalent resolution (injectable for tests). */
  registry?: ModelRegistry;
  /** Forecast input tokens for the next call — forwarded to `shouldThrottle`. */
  estimatedTokens?: number;
}

// ─── Internal ─────────────────────────────────────────────────────────

/** Build a "keep the original provider" decision (no overflow). */
function noOverflow(
  reason: PreSpawnOverflowReason,
  advisory: string | null = null,
): PreSpawnOverflowDecision {
  return { overflowProvider: null, overflowModel: null, reason, advisory };
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Decide whether ONE worker should overflow from its subscription provider onto a
 * configured API provider BEFORE it is spawned.
 *
 * Decision flow (short-circuits in order):
 *   1. Gate disabled (`providerConfig.dynamic !== true`) → `disabled`, no overflow.
 *   2. Task already in API mode → `already_api`, no overflow.
 *   3. No quota pressure (`shouldThrottle` false / `null` state) → `no_limit`.
 *   4. Limited but no `apiProvider` configured → `no_target` + honest advisory
 *      (keep the original provider — never silently degrade to claude; Law #2 / ADR-076).
 *   5. Limited + target configured → delegate to `resolveWithOverflow`:
 *      - overflow found → `overflow` with the tier-equivalent provider/model;
 *      - no tier-equivalent on the target → `no_equivalent` + honest advisory.
 *
 * Tier-preservation (model equivalence + selection) is delegated to
 * `resolveWithOverflow` — this function never re-implements it.
 *
 * Never throws.
 */
export function decidePreSpawnOverflow({
  task,
  rateLimitState,
  providerConfig,
  registry = modelRegistry,
  estimatedTokens = 0,
}: DecidePreSpawnOverflowInput): PreSpawnOverflowDecision {
  // 1. Gate disabled — default-off. Anything other than strictly `true` is off.
  if (providerConfig?.dynamic !== true) {
    return noOverflow('disabled');
  }

  // 2. Already an API-mode task — nothing to overflow.
  if (task.authMode === 'api') {
    return noOverflow('already_api');
  }

  // 3. No quota pressure → keep the subscription path (no advisory needed).
  if (!shouldThrottle(rateLimitState, estimatedTokens)) {
    return noOverflow('no_limit');
  }

  // 4. Limited, but no API overflow target configured. Honest-fail: keep the
  //    original provider + advisory; refuse to silently pick a provider the user
  //    never configured (Law #2 + ADR-076 — never a silent claude fallback).
  const target = providerConfig.apiProvider;
  if (!target) {
    return noOverflow(
      'no_target',
      `Worker provider "${String(task.provider ?? 'subscription')}" is rate-limited and dynamic `
      + `overflow is enabled, but no provider_overflow.apiProvider is configured. Keeping the `
      + `original provider — refusing to silently degrade. Set provider_overflow.apiProvider `
      + `(e.g. "codex"/"gemini") to enable overflow.`,
    );
  }

  // 5. Limited + target configured → delegate the tier-preserving resolution to
  //    the EXISTING resolver. resolveWithOverflow re-checks already_api/throttle
  //    (both already handled above) and returns the equivalent-tier API model.
  const resolution = resolveWithOverflow(task, registry, rateLimitState, {
    apiProvider: target,
    estimatedTokens,
  });

  if (resolution.overflowed && resolution.fallbackProvider) {
    return {
      overflowProvider: resolution.fallbackProvider,
      overflowModel: resolution.fallbackModel ?? null,
      reason: 'overflow',
      advisory: null,
    };
  }

  // 6. Target configured but no tier-equivalent model on it. Honest-fail again —
  //    keep the original provider; never degrade to claude.
  return noOverflow(
    'no_equivalent',
    `Worker provider "${String(task.provider ?? 'subscription')}" is rate-limited but the configured `
    + `overflow target "${String(target)}" has no tier-equivalent model for "${task.model}". `
    + `Keeping the original provider — refusing to silently degrade.`,
  );
}
