// ─── Deckent Embeddable SDK — Public Entry (F2-008-SDK-1) ───────────────────
//
// Programmatic, CLI-free surface for embedding deckent's core read/probe
// primitives into another process. `package.json` `exports` is intentionally
// left untouched here (publish-surface changes are Alperen's gate) — see
// this task's .result notes for the suggested subpath-export addition.

export { createDeckentClient } from './deckent-client.js';
export type {
  DeckentClient,
  DeckentClientOptions,
  DeckentSdkStatus,
  DeckentMemoryQueryOptions,
  DeckentLimitsOptions,
  DeckentLimitsResult,
} from './deckent-client.js';

// ─── Upstream primitive types ───────────────────────────────────────────
// Re-exported so SDK consumers don't need to reach into src/core or
// src/orchestra directly to type their own code against method results.
export type { Task, TaskScope, TaskPriority, TaskEffort, GoNoGoCriteria } from '../core/task-types.js';
export type { DashboardState } from '../core/monitoring-types.js';
export type { MemoryQueryParams, MemorySearchResult } from '../core/memory-types.js';
export type { ParsedDirectiveTask } from '../orchestra/task-builder.js';
export type {
  SubscriptionLimitResult,
  SubscriptionLimitProbe,
  SubscriptionLimitUnavailable,
  LimitGateResult,
  LimitGateVerdict,
  LimitGateThresholds,
  SpawnImpl,
  ProbeSubscriptionLimitsOptions,
} from '../core/limit-preflight.js';
