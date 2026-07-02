// ─── OpenRouter Doc-Route Resolver (OPENROUTER-DOC-ROUTE, Sprint 361 task 361-003) ──
// Carryover of Sprint 360 task 360-008 (never executed — same spec). Pure,
// side-effect-free companion to `openrouter-models.ts` (360-007): given a task,
// a (default-off) config flag pair, and an already-loaded free-model cache,
// decide whether to suggest routing this task to a zero-cost OpenRouter model.
//
// Deliberately NOT wired into `routeTaskV2` yet — this task's write scope is only
// this module + its test file (routing-engine.ts changes are explicitly NO-GO for
// 361-003). The routeTaskV2 wire point is slice 2, left as a follow-up (see the
// worker .result notes / docImpact).
//
// Doc-kind classification mirrors `model-tier-guard.ts`'s scope-shape classifier
// (the "haiku rule" precedent: economy-tier models are gated the same way — only
// doc/audit-shaped tasks qualify, everything else is code-bearing). That
// classifier is private to model-tier-guard.ts and this task's write scope
// excludes that file, so the same shape-check is mirrored locally here rather
// than exported — matching model-tier-guard.ts's own precedent of mirroring
// orchestra/rubric-registry locally to avoid a cross-file dependency.

import type { Task, TaskScope } from './task-types.js';
import type { FreeModelCache } from './openrouter-models.js';

// ─── Config shape ────────────────────────────────────────────────────────────

/**
 * Local config shape for the OpenRouter doc-route feature. Default-off by
 * contract (`enabled: false` / `doc_route: false` until a caller opts in).
 * Not yet part of the global `DeckentConfig` — wiring that in is the slice-2
 * follow-up noted above.
 */
export interface OpenRouterRouteConfig {
  enabled: boolean;
  doc_route: boolean;
  /** Pinned free-model id (e.g. `meta-llama/llama-3.1-8b-instruct:free`). No
   *  value ever auto-picked from the cache — an unset or stale (not-in-cache)
   *  model always resolves to `null`, never a fabricated guess. */
  model?: string;
}

/** The suggestion `resolveOpenRouterDocRoute` returns when it recommends routing. */
export interface OpenRouterRouteSuggestion {
  provider: 'openrouter';
  model: string;
}

// ─── Doc-kind classification (mirrors model-tier-guard.ts kindFromScope) ─────

const SOURCE_CODE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];

function hasSourceDir(scope: TaskScope): boolean {
  return (scope.directories ?? []).some(d =>
    d === 'src' || d === 'tests' || d === 'lib' ||
    SOURCE_CODE_PREFIXES.some(p => d.startsWith(p)),
  );
}

/** Scope-shape fallback: doc-kind only when every write is a `docs/*.md` file
 *  and no source-code directory is in scope. Fail-closed otherwise. */
function isDocKindScope(scope: TaskScope): boolean {
  const writes = scope.filesWrite ?? [];
  return writes.length > 0 && !hasSourceDir(scope) &&
    writes.every(f => f.startsWith('docs/') && f.endsWith('.md'));
}

/**
 * True when `task` is doc-kind (documentation or audit) — the only kinds this
 * resolver may ever suggest OpenRouter routing for. Code-bearing kinds are
 * ASLA (never), regardless of flags. Prefers the canonical `task.type` (set by
 * the planner) and falls back to scope-shape classification when absent.
 */
function isDocKindTask(task: Task): boolean {
  if (task.type) return task.type === 'documentation' || task.type === 'audit';
  return isDocKindScope(task.scope);
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve whether `task` should be routed to a free OpenRouter model.
 *
 * Pure and deterministic — never throws, never touches the network or disk
 * (the caller supplies an already-loaded `cache`). Returns `null` unless ALL
 * of the following hold:
 *   1. `config.enabled` AND `config.doc_route` are both true (default-off).
 *   2. `task` is doc-kind (see {@link isDocKindTask}) — a code/tsx task is
 *      ASLA (never suggested), independent of flags.
 *   3. `config.model` is set (no value is ever auto-picked from the cache).
 *   4. `config.model` matches an entry's `id` in `cache.models` — a pinned
 *      model that is stale or unknown to the cache never yields a suggestion.
 */
export function resolveOpenRouterDocRoute(
  task: Task,
  config: OpenRouterRouteConfig,
  cache: FreeModelCache,
): OpenRouterRouteSuggestion | null {
  if (!config.enabled || !config.doc_route) return null;
  if (!isDocKindTask(task)) return null;
  if (!config.model) return null;
  if (!cache.models.some(m => m.id === config.model)) return null;

  return { provider: 'openrouter', model: config.model };
}
