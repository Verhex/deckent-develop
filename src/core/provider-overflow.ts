// ═══ Provider Overflow Orchestration ═════════════════════════════════
// Subscription → API overflow selection helper (F1-010, Sprint 215 Task 215-006).
//
// When a subscription provider (Claude session) signals rate/quota exhaustion
// via `RateLimitState`, this module decides whether to overflow the task onto
// an equivalent-tier API provider model (e.g. opus → gpt-5 on 'codex').
//
// **Scope:** SELECTION logic only — not real throttle, not real spawn dispatch.
// Caller (sprint-spawner / task-router) is responsible for actually using the
// returned task. This module never touches I/O or the network.
//
// ADR-010 compliant: pure functions, no new runtime deps.
// ADR-008 compliant: imports only model-registry, token-quota, task-types.
// Integrates with `token-quota.ts` (`shouldThrottle`) as the quota signal.
//
// Sprint 215 Task 215-006 — F1-010 subs→API overflow orchestration.
// Depends on Task 215-004 (provider bootstrap-register).

import type { Task } from './task-types.js';
import { shouldThrottle, type RateLimitState } from './token-quota.js';
import {
  modelRegistry,
  type ModelRegistry,
  type RegistryProviderName,
} from './model-registry.js';

// ─── Types ────────────────────────────────────────────────────────────

/** Reason returned by `resolveWithOverflow` — drives caller's logging/metrics. */
export type OverflowReason =
  | 'no_signal'      // RateLimitState absent or `shouldThrottle()` says fine
  | 'overflow'       // Quota exhausted → equivalent API model selected
  | 'no_equivalent'  // Quota exhausted but no tier-equivalent fallback
  | 'already_api';   // Task is already in 'api' authMode — nothing to overflow

/**
 * Result of an overflow decision.
 *
 * `task` is either the original (when `overflowed === false`) or a NEW Task
 * object with `provider` + `model` swapped and `authMode` flipped to `'api'`.
 * Callers must not assume identity equality with the input task.
 */
export interface OverflowResolution {
  task: Task;
  overflowed: boolean;
  reason: OverflowReason;
  fallbackModel?: string;
  fallbackProvider?: RegistryProviderName;
}

/** Options for `resolveWithOverflow`. */
export interface OverflowOptions {
  /**
   * Preferred API-mode provider for the fallback. Defaults to `'codex'` —
   * covers the OpenAI Codex fleet (gpt-5, gpt-4.1, gpt-5-mini, ...) and any
   * OpenAI-compatible provider that registers its models under this name
   * (DeepSeek/Qwen/GLM per ADR-077 + Task 215-004).
   */
  apiProvider?: RegistryProviderName;
  /** Estimated input tokens for the next call — forwarded to `shouldThrottle`. */
  estimatedTokens?: number;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Decide whether a task should overflow from a subscription provider onto an
 * equivalent-tier API provider model based on the current rate-limit / quota
 * signal.
 *
 * Decision flow:
 *   1. If `task.authMode === 'api'` → return `already_api` (nothing to do).
 *   2. If `shouldThrottle(rateLimitState, estimatedTokens)` is false →
 *      `no_signal` (subscription still has budget — keep task unchanged).
 *   3. Quota exhausted → try `registry.getEquivalent(task.model, apiProvider)`.
 *      - On success: clone task with `provider`/`model` swapped + `authMode='api'`
 *        (graceful, side-effect free).
 *      - On failure: return `no_equivalent` with the original task intact
 *        (caller may decide to retry-wait or fail gracefully).
 *
 * @param task              Source task (treated as immutable).
 * @param registry          ModelRegistry to resolve tier-equivalent models.
 * @param rateLimitState    Latest subscription provider rate-limit snapshot
 *                          (e.g. from anthropic-http-client.ts). `null` ⇒ no signal.
 * @param options           `apiProvider` (default 'codex'), `estimatedTokens`.
 * @returns                 Overflow decision — never throws.
 */
export function resolveWithOverflow(
  task: Task,
  registry: ModelRegistry = modelRegistry,
  rateLimitState: RateLimitState | null = null,
  options: OverflowOptions = {},
): OverflowResolution {
  const apiProvider: RegistryProviderName = options.apiProvider ?? 'codex';
  const estimatedTokens = options.estimatedTokens ?? 0;

  // 1. Task already in API mode — nothing to overflow.
  if (task.authMode === 'api') {
    return { task, overflowed: false, reason: 'already_api' };
  }

  // 2. No quota pressure → keep subscription path.
  if (!shouldThrottle(rateLimitState, estimatedTokens)) {
    return { task, overflowed: false, reason: 'no_signal' };
  }

  // 3. Quota exhausted — try to find an equivalent-tier fallback.
  let fallbackModelId: string | undefined;
  try {
    fallbackModelId = registry.getEquivalent(task.model, apiProvider);
  } catch {
    // `getEquivalent` throws E_NO_EQUIVALENT_MODEL / E_UNKNOWN_MODEL — both
    // are graceful no-op cases for selection. Caller may log via reason.
    fallbackModelId = undefined;
  }

  if (!fallbackModelId) {
    return { task, overflowed: false, reason: 'no_equivalent' };
  }

  // If the resolved "equivalent" is identical to the current model AND the
  // current provider equals the requested fallback provider, there is no real
  // overflow happening (same model, same provider). Treat as no_equivalent so
  // callers do not double-spawn.
  const sameModel = fallbackModelId === task.model;
  const sameProvider = task.provider === apiProvider;
  if (sameModel && sameProvider) {
    return { task, overflowed: false, reason: 'no_equivalent' };
  }

  const overflowedTask: Task = {
    ...task,
    model: fallbackModelId as Task['model'],
    provider: apiProvider,
    authMode: 'api',
  };

  return {
    task: overflowedTask,
    overflowed: true,
    reason: 'overflow',
    fallbackModel: fallbackModelId,
    fallbackProvider: apiProvider,
  };
}
