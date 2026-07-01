// ═══ Tool Search — pivot-P0 TOOL-2 (progressive disclosure bridge) ═════════
// Sits on top of TOOL-1 (`./tool-registry.js`) and lets a caller (REPL/MCP/CLI)
// disclose tools progressively instead of dumping the full catalog into a
// prompt: a small eager "core" set, deterministic search over the rest, a
// full-schema describe on demand, and a validate-only call planner.
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import mcp/. This
// module therefore never seeds itself from the production tool catalog — it
// operates purely over a `ToolRegistry` instance handed to it by the caller
// (mcp/, cli/, ...), which owns the production seeding. This also keeps the
// module free of mutable module-level state, so results are deterministic
// and tests stay hermetic (no shared state to leak across test cases).
//
// Like TOOL-1, this is read-only over the registry: no call/dispatch/execute/
// invoke capability exists here. `planCall` validates and labels risk — it
// never runs a handler.

import type { ToolCategory, ToolDefinition, ToolRegistry, ToolRiskLevel } from './tool-registry.js';

// ─── Search ─────────────────────────────────────────────────────────────────

export interface SearchToolsOptions {
  limit?: number;
}

export interface ToolSearchHit {
  name: string;
  description: string;
  category: ToolCategory;
  risk: ToolRiskLevel;
  score: number;
}

const DEFAULT_SEARCH_LIMIT = 10;

/** Tiers are separated by a factor of 1000 so a lower tier can never outscore a higher one. */
const TIER_EXACT = 3;
const TIER_PARTIAL = 2;
const TIER_TOKEN = 1;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokensOf(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(' ');
}

/** Deterministic relevance score: name-exact > name-partial > description/name-token overlap. */
function scoreTool(def: ToolDefinition, queryNorm: string, queryTokens: string[]): number {
  const nameNorm = normalize(def.name);
  if (nameNorm === queryNorm) {
    return TIER_EXACT * 1000;
  }
  if (nameNorm.includes(queryNorm)) {
    const overlapRatio = queryNorm.length / nameNorm.length;
    return TIER_PARTIAL * 1000 + Math.round(overlapRatio * 100);
  }
  const nameTokens = new Set(tokensOf(nameNorm));
  const descTokens = new Set(tokensOf(normalize(def.description)));
  let hits = 0;
  for (const token of queryTokens) {
    if (nameTokens.has(token)) hits += 2;
    else if (descTokens.has(token)) hits += 1;
  }
  return hits === 0 ? 0 : TIER_TOKEN * 1000 + hits;
}

// ─── Describe ───────────────────────────────────────────────────────────────

/** Full tool definition, including the real (never re-derived) `paramsSchema`. */
export type ToolDescription = ToolDefinition;

// ─── Plan ───────────────────────────────────────────────────────────────────

export const TOOL_CALL_PLAN_STATUSES = ['valid', 'invalid', 'unknown_tool'] as const;
export type ToolCallPlanStatus = (typeof TOOL_CALL_PLAN_STATUSES)[number];

export interface ToolCallPlan {
  name: string;
  status: ToolCallPlanStatus;
  /** Present whenever the tool is known, regardless of whether `args` validated. */
  risk?: ToolRiskLevel;
  category?: ToolCategory;
  errors?: string[];
}

// ─── Core set ───────────────────────────────────────────────────────────────

/** Fixed eager-disclosure set: the minimum surface a caller should always see up front. */
export const CORE_TOOL_NAMES = [
  'deckent_status',
  'deckent_plan',
  'deckent_run',
  'deckent_start',
  'deckent_review',
  'deckent_help',
  'deckent_memory_query',
] as const;

// ─── Bridge ─────────────────────────────────────────────────────────────────

/**
 * Progressive-disclosure bridge over a {@link ToolRegistry}: eager core set,
 * deterministic search, full-schema describe, and a validate-only call plan.
 * Holds no state of its own beyond the injected registry reference.
 */
export class ToolSearchIndex {
  constructor(private readonly registry: ToolRegistry) {}

  /** Deterministic, relevance-scored search: name-exact > name-partial > token overlap. */
  searchTools(query: string, options: SearchToolsOptions = {}): ToolSearchHit[] {
    const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
    if (limit <= 0) return [];

    const queryNorm = normalize(query);
    if (queryNorm.length === 0) return [];
    const queryTokens = tokensOf(queryNorm);

    const hits: ToolSearchHit[] = [];
    for (const def of this.registry.list()) {
      const score = scoreTool(def, queryNorm, queryTokens);
      if (score > 0) {
        hits.push({ name: def.name, description: def.description, category: def.category, risk: def.risk, score });
      }
    }

    hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return hits.slice(0, limit);
  }

  /** Full schema + metadata for a single tool, resolved by exact name. Never fabricates. */
  describeTool(name: string): ToolDescription | undefined {
    return this.registry.get(name);
  }

  /** Validates `args` against the tool's schema and labels risk. Never executes anything. */
  planCall(name: string, args: unknown): ToolCallPlan {
    const def = this.registry.get(name);
    if (!def) {
      return { name, status: 'unknown_tool', errors: [`Unknown tool: "${name}"`] };
    }

    const validation = this.registry.validateParams(name, args);
    if (!validation.valid) {
      return { name, status: 'invalid', risk: def.risk, category: def.category, errors: validation.errors };
    }
    return { name, status: 'valid', risk: def.risk, category: def.category };
  }

  /** The eager-7 core set, in {@link CORE_TOOL_NAMES} order. Silently skips absent entries. */
  coreTools(): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const name of CORE_TOOL_NAMES) {
      const def = this.registry.get(name);
      if (def) result.push(def);
    }
    return result;
  }
}
