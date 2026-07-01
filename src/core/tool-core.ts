// ═══ Tool Core — pivot-P0 TOOL-CORE (352-009) ═══════════════════════════════
// Eager core-tool-set surface, built strictly on top of TOOL-2's
// `ToolSearchIndex.coreTools()` (./tool-search.js, untouched): a first-turn-ready
// {tool, eagerSchema, fullRef} entry per core tool, plus a one-line defer-index
// for everything else. Pure module — no REPL/MCP wiring here (follow-up work);
// callers own the ToolRegistry/ToolSearchIndex instance and pass it in.
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import mcp/. This
// module only depends on ./tool-registry.js and ./tool-search.js (both core/),
// same pattern as TOOL-1/TOOL-2.

import type { ZodTypeAny } from 'zod';
import type { ZodObject, ZodRawShape } from 'zod';
import type { ToolDefinition } from './tool-registry.js';
import type { ToolSearchIndex } from './tool-search.js';
import { CORE_TOOL_NAMES } from './tool-search.js';

// ─── Eager schema summary ───────────────────────────────────────────────────

/** One top-level param, reduced to its base type + optionality. Never carries validation rules. */
export interface EagerParamSummary {
  name: string;
  /** Simplified zod type label (e.g. "string", "array", "object"), unwrapped through optional/nullable/default. */
  type: string;
  optional: boolean;
}

const ZOD_TYPE_LABELS: Record<string, string> = {
  ZodString: 'string',
  ZodNumber: 'number',
  ZodBoolean: 'boolean',
  ZodArray: 'array',
  ZodObject: 'object',
  ZodEnum: 'enum',
  ZodNativeEnum: 'enum',
  ZodUnion: 'union',
  ZodDiscriminatedUnion: 'union',
  ZodLiteral: 'literal',
  ZodRecord: 'record',
  ZodDate: 'date',
  ZodTuple: 'tuple',
  ZodAny: 'any',
  ZodUnknown: 'unknown',
};

interface ZodDefWithInner {
  typeName: string;
  innerType?: ZodTypeAny;
}

/** Unwraps Optional/Nullable/Default wrappers to find the innermost real type + resulting optionality. */
function unwrap(schema: ZodTypeAny): { inner: ZodTypeAny; optional: boolean } {
  let current = schema;
  let optional = false;
  for (;;) {
    const def = current._def as ZodDefWithInner;
    if ((def.typeName === 'ZodOptional' || def.typeName === 'ZodNullable' || def.typeName === 'ZodDefault') && def.innerType) {
      optional = true;
      current = def.innerType;
    } else {
      break;
    }
  }
  return { inner: current, optional };
}

/**
 * Derives an abbreviated params summary from a tool's real `paramsSchema` —
 * field name/type/optionality only, never validation rules. This is a
 * derivation over the actual schema instance, never a hand-duplicated copy:
 * a schema change is picked up automatically on the next call.
 * Non-object top-level schemas (no enumerable fields) yield `[]`.
 */
export function summarizeEagerSchema(schema: ZodTypeAny): EagerParamSummary[] {
  const { inner } = unwrap(schema);
  if ((inner._def as ZodDefWithInner).typeName !== 'ZodObject') return [];

  const shape = (inner as ZodObject<ZodRawShape>).shape;
  return Object.entries(shape).map(([name, field]) => {
    const { inner: fieldInner, optional } = unwrap(field);
    const type = ZOD_TYPE_LABELS[(fieldInner._def as ZodDefWithInner).typeName] ?? 'unknown';
    return { name, type, optional };
  });
}

// ─── Core surface ───────────────────────────────────────────────────────────

/** Eager-disclosure entry for one core-set tool: abbreviated schema + a full-definition resolver key. */
export interface CoreToolSurfaceEntry {
  tool: string;
  eagerSchema: EagerParamSummary[];
  /** Pass to `ToolSearchIndex.describeTool(fullRef)` to resolve the full (never re-derived) ToolDefinition. */
  fullRef: string;
}

/**
 * Eager-disclosure surface for TOOL-2's core set: one abbreviated-schema entry
 * per tool in `index.coreTools()`, in that method's fixed order. Silently
 * mirrors `coreTools()`'s own skip-if-absent behavior — no fabrication.
 */
export function buildCoreToolSurface(index: ToolSearchIndex): CoreToolSurfaceEntry[] {
  return index.coreTools().map((def: ToolDefinition) => ({
    tool: def.name,
    eagerSchema: summarizeEagerSchema(def.paramsSchema),
    fullRef: def.name,
  }));
}

// ─── Deferred index ─────────────────────────────────────────────────────────

/**
 * One-line, alphabetically-sorted index of every tool in `allTools` that is
 * NOT in `coreNames` — a compact pointer for a caller to search/describe on
 * demand instead of paying for full schemas up front. `''` when nothing is
 * deferred. Sorted (rather than registry-insertion-order) so the line is
 * deterministic regardless of registration order.
 */
export function deferredIndexLine(
  allTools: readonly ToolDefinition[],
  coreNames: readonly string[] = CORE_TOOL_NAMES,
): string {
  const core = new Set(coreNames);
  const deferred = allTools
    .map((def) => def.name)
    .filter((name) => !core.has(name))
    .sort((a, b) => a.localeCompare(b));

  if (deferred.length === 0) return '';
  return `+${deferred.length} more tools (searchTools/describeTool): ${deferred.join(', ')}`;
}
