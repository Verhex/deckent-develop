// ═══ Tool Shadow Policy — TOOL-REG-SHADOW (Sıra-24 kapanışı) ═══════════════
// Deterministic same-name tool conflict resolution across sources
// (builtin/project/mcp), layered ON TOP of tool-registry.ts as a pure
// resolve-layer. A future seeding step merges builtin + project + MCP tool
// definitions into a single ToolRegistry; when two sources register the same
// tool `name`, this module decides the winner (builtin > project > mcp by
// default, config-overridable) and records every shadowed loser to an audit
// trail — a shadowed entry is never silently deleted and never silently
// selected.
//
// This module never imports, extends, or mutates tool-registry.ts's
// `ToolRegistry` class itself — it only imports the `ToolDefinition` TYPE
// (erased at compile time) as the default generic payload, so composing
// this resolver with the real registry stays a caller-side concern.
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import orchestra/,
// cli/, api/, or mcp/. This module only imports from ./tool-registry.js
// (core -> core), so it introduces no new Layer-1 edge.
//
// Config wiring: `tool_shadow.priority` is expected to live in the project
// config (.deckent/config.json) once a downstream task wires it through
// config.ts — out of this task's write scope. Until then, callers pass a
// `ToolShadowPolicyConfig` explicitly (mirrors routing-engine.ts's
// `options?.skillAgentAffinity ?? false` default-off convention: the flag is
// injected by the caller, never read from a global singleton here).

import { z } from 'zod';
import type { ToolDefinition } from './tool-registry.js';

// ─── Source & default priority ─────────────────────────────────────────────

export const TOOL_SHADOW_SOURCES = ['builtin', 'project', 'mcp'] as const;
export const ToolShadowSourceSchema = z.enum(TOOL_SHADOW_SOURCES);
/** Who registered a candidate tool definition. */
export type ToolShadowSource = z.infer<typeof ToolShadowSourceSchema>;

/** Highest-priority first. Applied whenever no (valid) config override is given — feature is default-off. */
export const DEFAULT_TOOL_SHADOW_PRIORITY: readonly ToolShadowSource[] = ['builtin', 'project', 'mcp'];

// ─── Config (`tool_shadow.priority`) ────────────────────────────────────────

/**
 * Mirrors the project config's `tool_shadow.priority` field. Optional +
 * default-off: an absent/undefined `priority` means
 * {@link DEFAULT_TOOL_SHADOW_PRIORITY} applies untouched.
 */
export const ToolShadowPolicyConfigSchema = z.object({
  priority: z.array(ToolShadowSourceSchema).optional(),
});
export type ToolShadowPolicyConfig = z.infer<typeof ToolShadowPolicyConfigSchema>;

// ─── Priority resolution ────────────────────────────────────────────────────

export interface ToolShadowPriorityResolution {
  /** Effective priority order actually applied (highest-priority source first). */
  priority: readonly ToolShadowSource[];
  /** True when no override was supplied, or a supplied one was invalid — the default order was used. */
  usedDefault: boolean;
  /** Present only when a supplied override was rejected (not a permutation of {@link TOOL_SHADOW_SOURCES}). */
  errors?: string[];
}

function isPermutationOfSources(candidate: readonly ToolShadowSource[]): boolean {
  if (candidate.length !== TOOL_SHADOW_SOURCES.length) return false;
  const seen = new Set(candidate);
  return seen.size === TOOL_SHADOW_SOURCES.length && TOOL_SHADOW_SOURCES.every((s) => seen.has(s));
}

/**
 * Resolves the effective source priority order from an optional config
 * override. Fail-honest: an invalid override (wrong length, duplicate, or
 * unknown source) never throws — it falls back to
 * {@link DEFAULT_TOOL_SHADOW_PRIORITY} and reports why via `errors`, since
 * this is a pure function fed by a user-editable config file.
 */
export function resolveShadowPriority(config?: ToolShadowPolicyConfig): ToolShadowPriorityResolution {
  if (!config?.priority) {
    return { priority: DEFAULT_TOOL_SHADOW_PRIORITY, usedDefault: true };
  }
  if (!isPermutationOfSources(config.priority)) {
    return {
      priority: DEFAULT_TOOL_SHADOW_PRIORITY,
      usedDefault: true,
      errors: [
        `tool_shadow.priority must be a permutation of [${TOOL_SHADOW_SOURCES.join(', ')}], got: [${config.priority.join(', ')}]`,
      ],
    };
  }
  return { priority: config.priority, usedDefault: false };
}

// ─── Candidate & audit entry ────────────────────────────────────────────────

/** One source's registration attempt for a tool name — the resolve-layer's unit of input. */
export interface ToolShadowCandidate<T = ToolDefinition> {
  readonly name: string;
  readonly source: ToolShadowSource;
  readonly definition: T;
}

/** A losing candidate for a name that had a conflict — retained for audit, never deleted, never selected. */
export interface ToolShadowAuditEntry<T = ToolDefinition> {
  readonly name: string;
  readonly selectedSource: ToolShadowSource;
  readonly shadowedSource: ToolShadowSource;
  readonly shadowedDefinition: T;
}

export interface ToolShadowResolution<T = ToolDefinition> {
  /** One winning candidate per unique tool name, in first-seen order. */
  selected: readonly ToolShadowCandidate<T>[];
  /** Every shadowed (non-winning) candidate, across all conflicting names. */
  auditLog: readonly ToolShadowAuditEntry<T>[];
  /** The priority resolution actually applied — see {@link resolveShadowPriority}. */
  priorityResolution: ToolShadowPriorityResolution;
}

// ─── Resolution ─────────────────────────────────────────────────────────────

/**
 * Deterministically resolves same-name tool conflicts across sources.
 * Candidates are grouped by `name`; within a group, the candidate whose
 * `source` ranks highest in the effective priority order wins (builtin >
 * project > mcp by default). Ties — two candidates from the same source —
 * keep first-seen order (`Array.prototype.sort` is a stable sort per spec,
 * and ADR-D-001 pins `target`/`lib` to ES2022).
 *
 * Pure composition over tool-registry.ts: this function never imports or
 * mutates `ToolRegistry`; it only decides which candidate a caller should
 * register there, and preserves every shadowed loser in `auditLog`.
 */
export function resolveToolShadowing<T = ToolDefinition>(
  candidates: readonly ToolShadowCandidate<T>[],
  config?: ToolShadowPolicyConfig,
): ToolShadowResolution<T> {
  const priorityResolution = resolveShadowPriority(config);
  const rank = new Map<ToolShadowSource, number>(priorityResolution.priority.map((source, index) => [source, index]));

  const byName = new Map<string, ToolShadowCandidate<T>[]>();
  for (const candidate of candidates) {
    const group = byName.get(candidate.name);
    if (group) group.push(candidate);
    else byName.set(candidate.name, [candidate]);
  }

  const selected: ToolShadowCandidate<T>[] = [];
  const auditLog: ToolShadowAuditEntry<T>[] = [];

  for (const group of byName.values()) {
    const ranked = [...group].sort(
      (a, b) => (rank.get(a.source) ?? Number.POSITIVE_INFINITY) - (rank.get(b.source) ?? Number.POSITIVE_INFINITY),
    );
    const [winner, ...losers] = ranked;
    if (!winner) continue;
    selected.push(winner);
    for (const loser of losers) {
      auditLog.push({
        name: loser.name,
        selectedSource: winner.source,
        shadowedSource: loser.source,
        shadowedDefinition: loser.definition,
      });
    }
  }

  return { selected, auditLog, priorityResolution };
}
