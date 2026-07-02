// ─── Tool Schema Override — dynamic field-override + generation-memo (TOOL-REG-2 slice) ──
// MASTER-PLAN Sıra-24 (TOOL-REG) continuation slice, on top of tool-availability.ts's
// first slice: two independent, composable pieces — (a) project-config-driven
// field-level schema overrides (default value / enum narrowing / description) applied
// on top of an existing ToolDefinition, and (b) a content-hash memoizer for a tool's
// describe-output (schema + description). Both operate purely on ToolDefinition
// instances handed in by the caller — this module never imports tool-registry.ts's
// ToolRegistry, tool-search.ts, or tool-availability.ts, so shadow/override-policy and
// registry/search wiring stay explicit follow-up work (see docs/adr for Sıra-24).
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import orchestra/cli/api/mcp.
// This module only imports node builtins, zod, ./constants.js, and the `ToolDefinition`
// *type* from ./tool-registry.js (structural reference only, same as tool-core.ts) — clean.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z, ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod';
import type { ToolDefinition } from './tool-registry.js';
import { SETTINGS_DIR } from './constants.js';

// ─── (a) Dynamic Schema Override — project-config field overrides ───────────

const TOOL_OVERRIDES_SCHEMA_VERSION = 1;

export interface ToolFieldOverride {
  /** New default value for the field. Applied only if it validates against the
   *  (possibly enum-narrowed) field schema — an invalid default is skipped. */
  default?: unknown;
  /** Narrows an existing `ZodEnum` field to a subset of its original values.
   *  Ignored (fail-soft) if the field isn't an enum or any value isn't in the
   *  original enum. */
  enum?: string[];
  /** Replaces the field's description. */
  description?: string;
}

export interface ToolOverrideEntry {
  /** Replaces the tool's top-level description. */
  description?: string;
  /** Per-field overrides, keyed by field name in the tool's paramsSchema shape. */
  fields?: Record<string, ToolFieldOverride>;
}

export interface ToolOverridesConfig {
  version: number;
  /** Per-tool override entries, keyed by tool name. */
  tools: Record<string, ToolOverrideEntry>;
}

const toolFieldOverrideSchema = z
  .object({
    default: z.unknown().optional(),
    enum: z.array(z.string()).min(1).optional(),
    description: z.string().optional(),
  })
  .strict();

const toolOverrideEntrySchema = z
  .object({
    description: z.string().optional(),
    fields: z.record(toolFieldOverrideSchema).optional(),
  })
  .strict();

const toolOverridesConfigSchema = z
  .object({
    version: z.number(),
    tools: z.record(toolOverrideEntrySchema),
  })
  .strict();

function emptyToolOverridesConfig(): ToolOverridesConfig {
  return { version: TOOL_OVERRIDES_SCHEMA_VERSION, tools: {} };
}

function toolOverridesFilePath(projectRoot: string): string {
  return join(projectRoot, SETTINGS_DIR, 'tool-overrides.json');
}

/**
 * Loads the project's tool-overrides config. Fail-soft: a missing, unreadable,
 * or schema-invalid file yields the empty config (no overrides) rather than
 * throwing — a corrupt tool-overrides.json must never block tool use. Mirrors
 * tool-availability.ts's `loadToolsetsConfig`.
 */
export function loadToolOverridesConfig(projectRoot: string): ToolOverridesConfig {
  const filePath = toolOverridesFilePath(projectRoot);
  if (!existsSync(filePath)) return emptyToolOverridesConfig();
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
    const result = toolOverridesConfigSchema.safeParse(parsed);
    return result.success ? result.data : emptyToolOverridesConfig();
  } catch {
    return emptyToolOverridesConfig();
  }
}

interface ZodDefWithInner {
  typeName: string;
  innerType?: ZodTypeAny;
}

interface ZodEnumDef {
  typeName: string;
  values?: string[];
}

/** Peels Optional/Nullable wrappers off `field`, returning the inner type plus
 *  a rewrap function that restores the same wrapper chain around a replacement
 *  inner type. Stops (rewrap = identity) at anything else, including Default —
 *  narrowing an already-defaulted enum is out of scope for this slice. */
function unwrapForEnum(field: ZodTypeAny): { inner: ZodTypeAny; rewrap: (next: ZodTypeAny) => ZodTypeAny } {
  const def = field._def as ZodDefWithInner;
  if (def.typeName === 'ZodOptional' && def.innerType) {
    const { inner, rewrap } = unwrapForEnum(def.innerType);
    return { inner, rewrap: (next) => rewrap(next).optional() };
  }
  if (def.typeName === 'ZodNullable' && def.innerType) {
    const { inner, rewrap } = unwrapForEnum(def.innerType);
    return { inner, rewrap: (next) => rewrap(next).nullable() };
  }
  return { inner: field, rewrap: (next) => next };
}

/** Narrows `field` to a `ZodEnum` restricted to `values`, preserving its
 *  Optional/Nullable wrapper chain. Returns `undefined` (fail-soft, caller
 *  keeps the original field) when `field` isn't an enum, `values` is empty,
 *  or any value falls outside the original enum's values. */
function narrowEnumField(field: ZodTypeAny, values: string[]): ZodTypeAny | undefined {
  const { inner, rewrap } = unwrapForEnum(field);
  const def = inner._def as ZodEnumDef;
  if (def.typeName !== 'ZodEnum' || !def.values) return undefined;

  const originalValues = new Set(def.values);
  if (values.length === 0 || !values.every((value) => originalValues.has(value))) return undefined;

  const narrowed = z.enum(values as [string, ...string[]]);
  return rewrap(narrowed);
}

/** Applies one field's override (enum narrowing, then description, then
 *  default) to `field`, skipping any individual piece that doesn't validate. */
function applySingleFieldOverride(field: ZodTypeAny, override: ToolFieldOverride): ZodTypeAny {
  let updated = field;

  if (override.enum) {
    updated = narrowEnumField(updated, override.enum) ?? updated;
  }

  if (override.description !== undefined) {
    updated = updated.describe(override.description);
  }

  if (override.default !== undefined && updated.safeParse(override.default).success) {
    updated = updated.default(override.default);
  }

  return updated;
}

/** Applies `fields` overrides to `schema`'s shape. Fail-soft: non-object
 *  schemas and unknown field names pass through unchanged. Rebuilds the
 *  object via `.extend()` (not `z.object()`) so strict/passthrough/catchall
 *  config on the original schema survives. */
function applyFieldOverrides(schema: ZodTypeAny, fields: Record<string, ToolFieldOverride> | undefined): ZodTypeAny {
  if (!fields || Object.keys(fields).length === 0) return schema;
  if (!(schema instanceof ZodObject)) return schema;

  let result = schema;
  for (const [fieldName, override] of Object.entries(fields)) {
    const shape = result.shape as ZodRawShape;
    const original = shape[fieldName];
    if (!original) continue;
    result = result.extend({ [fieldName]: applySingleFieldOverride(original, override) });
  }
  return result;
}

/**
 * Applies `config`'s override entry for `def.name` (if any) on top of `def`,
 * returning a new `ToolDefinition` — never mutates `def` or its schema in
 * place. A tool with no matching entry in `config.tools` is returned as-is.
 */
export function applyToolOverrides(def: ToolDefinition, config: ToolOverridesConfig): ToolDefinition {
  const entry = config.tools[def.name];
  if (!entry) return def;

  return {
    ...def,
    description: entry.description ?? def.description,
    paramsSchema: applyFieldOverrides(def.paramsSchema, entry.fields),
  };
}

// ─── (b) Generation Memo — content-hash memoized describe output ────────────

export interface ToolDescribeMemoOptions {
  /** Injectable hash function (default: sha256 hex digest via node:crypto,
   *  matching file-lock.ts/audit-writer.ts precedent). Tests may inject a
   *  simpler function to make hash collisions/changes easy to reason about. */
  hash?: (content: string) => string;
}

interface MemoEntry<T> {
  contentHash: string;
  value: T;
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Content-hash memoizer for a tool's describe-output (schema + description).
 * `sourceContent` is a caller-supplied fingerprint of whatever `generate`
 * derives its output from (e.g. `JSON.stringify` of the tool's description +
 * override entry) — this module has no opinion on what "describe output"
 * looks like, so it never imports tool-search.ts; a caller wires the actual
 * describeTool()-shaped output in. `generate` only re-runs when
 * `sourceContent`'s hash changes for a given `id`; otherwise the cached value
 * is returned untouched. Mirrors tool-availability.ts's `ToolAvailabilityCache`
 * (Map-based entries, injectable determinism hook, invalidate/clear/size).
 */
export class ToolDescribeMemo<T> {
  private readonly entries = new Map<string, MemoEntry<T>>();
  private readonly hash: (content: string) => string;
  private generationCount = 0;

  constructor(opts: ToolDescribeMemoOptions = {}) {
    this.hash = opts.hash ?? sha256Hex;
  }

  /** Returns the memoized value for `id` if `sourceContent`'s hash matches the
   *  cached entry; otherwise calls `generate()`, caches, and returns it. */
  describe(id: string, sourceContent: string, generate: () => T): T {
    const contentHash = this.hash(sourceContent);
    const cached = this.entries.get(id);
    if (cached && cached.contentHash === contentHash) {
      return cached.value;
    }
    const value = generate();
    this.generationCount += 1;
    this.entries.set(id, { contentHash, value });
    return value;
  }

  /** Drops a single cached entry, forcing the next describe() call for `id`
   *  to regenerate regardless of content hash. */
  invalidate(id: string): void {
    this.entries.delete(id);
  }

  /** Drops all cached entries. Does not reset the {@link generations} counter —
   *  that counter is a monotonic total, independent of current cache size. */
  clear(): void {
    this.entries.clear();
  }

  /** Total number of times `generate` has actually run — test/observability hook. */
  get generations(): number {
    return this.generationCount;
  }

  get size(): number {
    return this.entries.size;
  }
}
