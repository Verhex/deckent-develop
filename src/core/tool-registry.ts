// ═══ Tool Registry — pivot-P0 TOOL-1 ("deckenti deckent yapan") ═════════════
// Terminal-native tool catalog core: a single, cross-surface source of truth
// for what Deckent can do (name/description/paramsSchema/risk/category), so
// REPL, MCP, and CLI can eventually read the same registry instead of each
// surface keeping its own hand-maintained tool list (ADR-G-011 Surface Parity).
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import mcp/. This
// module therefore never imports from src/mcp/tools/ — the MCP → ToolDefinition
// bridge below is a structural (duck-typed) adapter: any caller whose shape
// matches `ToolSourceShape` (which mirrors the 2nd-arg config object passed to
// McpServer#registerTool) can seed a registry, without this module depending
// on the mcp/ package. Actual production seeding of mcp/tools/index.ts's real
// tool set into a shared registry is TOOL-2+/cutover work.
//
// This module is a pure catalog: it validates parameters against a tool's zod
// schema but never stores or invokes a callable handler. `handlerRef` is a
// plain string pointer for a future dispatch layer to resolve — dispatch
// execution itself is explicitly out of scope here.

import { z, type ZodTypeAny } from 'zod';

// ─── Risk & Category ────────────────────────────────────────────────────────

export const TOOL_RISK_LEVELS = ['safe', 'moderate', 'destructive'] as const;
/** How much caution a tool call warrants. Derived from MCP-style annotations. */
export type ToolRiskLevel = (typeof TOOL_RISK_LEVELS)[number];

export const TOOL_CATEGORIES = [
  'lifecycle', // init, set_directives, plan, start, run, kill, cleanup, recover, checkpoint
  'monitoring', // status, doctor, watch, kpi, usage, cost, audit, review
  'knowledge', // retro, history, analyze_project, docs, explain, memory_query, feature_query
  'config', // config, sync
  'catalog', // agent_list, skill_list, models, help
  'automation', // autonomous, process, nervous_*
] as const;
/** Coarse functional grouping for a tool — descriptive metadata, not enforced. */
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

/** Structural mirror of the MCP `annotations` object (readOnlyHint/destructiveHint/idempotentHint). */
export interface ToolAnnotationsShape {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

/** destructiveHint wins over readOnlyHint; absent annotations default to 'moderate'. */
export function deriveRiskFromAnnotations(annotations?: ToolAnnotationsShape): ToolRiskLevel {
  if (!annotations) return 'moderate';
  if (annotations.destructiveHint) return 'destructive';
  if (annotations.readOnlyHint) return 'safe';
  return 'moderate';
}

// ─── Tool Definition ────────────────────────────────────────────────────────

/**
 * Structural mirror of the 2nd-arg config object passed to
 * `McpServer#registerTool(name, config, handler)` (see src/mcp/tools/*.ts).
 * Deliberately NOT imported from src/mcp — any shape-compatible caller can
 * use it as the bridge input (ADR-D-004 C1: no core/ -> mcp/ import edge).
 */
export interface ToolSourceShape {
  name: string;
  description: string;
  paramsSchema: ZodTypeAny;
  annotations?: ToolAnnotationsShape;
}

/** A single entry in the cross-surface tool catalog. */
export interface ToolDefinition {
  name: string;
  description: string;
  paramsSchema: ZodTypeAny;
  risk: ToolRiskLevel;
  category: ToolCategory;
  /** Symbolic pointer for a future dispatch layer (e.g. "mcp:deckent_status") — never a callable. */
  handlerRef: string;
}

export interface ToolDefinitionOptions {
  category: ToolCategory;
  handlerRef: string;
}

/**
 * MCP tool -> ToolDefinition bridge. Single-source adapter: the caller passes
 * the real zod schema instance it already owns (e.g. the same object used in
 * `registerTool`), so no schema logic is hand-duplicated here.
 */
export function toolDefinitionFromShape(shape: ToolSourceShape, opts: ToolDefinitionOptions): ToolDefinition {
  return {
    name: shape.name,
    description: shape.description,
    paramsSchema: shape.paramsSchema,
    risk: deriveRiskFromAnnotations(shape.annotations),
    category: opts.category,
    handlerRef: opts.handlerRef,
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface ToolValidationResult {
  valid: boolean;
  errors?: string[];
}

function issuesToErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Cross-surface tool catalog: register/get/list/validate-params only.
 * No dispatch/call/execute method exists on this class by design — this is
 * a pure catalog, never an execution surface (that is TOOL-2+/cutover work).
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /** Upserts a tool definition (replaces any existing entry with the same name). */
  register(def: ToolDefinition): void {
    this.tools.set(def.name, def);
  }

  /** Convenience: builds a ToolDefinition via {@link toolDefinitionFromShape} and registers it. */
  registerFromShape(shape: ToolSourceShape, opts: ToolDefinitionOptions): ToolDefinition {
    const def = toolDefinitionFromShape(shape, opts);
    this.register(def);
    return def;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  get size(): number {
    return this.tools.size;
  }

  /** Validates `params` against the named tool's paramsSchema. Does not invoke anything. */
  validateParams(name: string, params: unknown): ToolValidationResult {
    const def = this.tools.get(name);
    if (!def) {
      return { valid: false, errors: [`Unknown tool: "${name}"`] };
    }
    const result = def.paramsSchema.safeParse(params);
    if (result.success) return { valid: true };
    return { valid: false, errors: issuesToErrors(result.error) };
  }
}
