// ─── Tool Availability — TTL probe cache + toolset enable/disable (TOOL-REG slice) ──
// MASTER-PLAN Sıra-24 (TOOL-REG) first slice: two independent, composable pieces —
// (a) an in-memory TTL memoizer for tool-source availability probes (mcp-server up
// etc.), and (b) a disk-persisted enable/disable set for tools. Both operate purely
// on tool ids (strings) — they never import tool-registry.ts, so a ToolDefinition's
// schema/dispatch concerns stay out of this slice by design (schema-override,
// generation-memo, and shadow/override-policy are explicit follow-up work).
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import orchestra/cli/api/mcp.
// This module only imports node builtins + ./constants.js (a core/ sibling) — clean.

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SETTINGS_DIR } from './constants.js';

// ─── (a) Availability Cache — TTL probe memoization ──────────────────────────

/** A tool-source liveness check. May be sync or async (real probes — e.g. an
 *  mcp-server ping — are typically async; checkAvailability() awaits either). */
export type ToolAvailabilityProbe = () => boolean | Promise<boolean>;

export interface ToolAvailabilityCacheOptions {
  /** Injected clock (ms). Defaults to Date.now(). Tests supply a fake clock to
   *  assert TTL expiry deterministically without real sleeps. */
  now?: () => number;
  /** Default TTL applied when checkAvailability() omits `ttlMs`. */
  defaultTtlMs?: number;
}

interface AvailabilityEntry {
  available: boolean;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;

/**
 * Memoizes tool-source availability probes for `ttlMs`. Within the TTL window,
 * repeated `checkAvailability()` calls for the same id return the cached result
 * without re-invoking `probe`; once expired, the next call re-probes and
 * refreshes the cache entry.
 */
export class ToolAvailabilityCache {
  private readonly entries = new Map<string, AvailabilityEntry>();
  private readonly now: () => number;
  private readonly defaultTtlMs: number;

  constructor(opts: ToolAvailabilityCacheOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.defaultTtlMs = opts.defaultTtlMs ?? DEFAULT_TTL_MS;
  }

  async checkAvailability(
    id: string,
    probe: ToolAvailabilityProbe,
    opts: { ttlMs?: number } = {},
  ): Promise<boolean> {
    const ttlMs = opts.ttlMs ?? this.defaultTtlMs;
    const nowMs = this.now();
    const cached = this.entries.get(id);
    if (cached && nowMs < cached.expiresAt) {
      return cached.available;
    }
    const available = await probe();
    this.entries.set(id, { available, expiresAt: nowMs + ttlMs });
    return available;
  }

  /** Drops a single cached entry, forcing the next checkAvailability() call to re-probe. */
  invalidate(id: string): void {
    this.entries.delete(id);
  }

  /** Drops all cached entries. */
  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

// ─── (b) Toolset Enable/Disable — persisted, restart-survive ────────────────

const TOOLSETS_SCHEMA_VERSION = 1;

export interface ToolsetsConfig {
  version: number;
  /** Ids of explicitly disabled tools. Absence from this list means enabled —
   *  a missing/corrupt file therefore fails soft to "everything enabled". */
  disabled: string[];
}

export interface ToolsetStatus {
  id: string;
  isDisabled: boolean;
}

function emptyToolsetsConfig(): ToolsetsConfig {
  return { version: TOOLSETS_SCHEMA_VERSION, disabled: [] };
}

function isToolsetsConfig(value: unknown): value is ToolsetsConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.version === 'number' &&
    Array.isArray(v.disabled) &&
    v.disabled.every((entry) => typeof entry === 'string')
  );
}

function toolsetsFilePath(projectRoot: string): string {
  return join(projectRoot, SETTINGS_DIR, 'toolsets.json');
}

/**
 * Loads the persisted toolset enable/disable set. Fail-soft: a missing,
 * unreadable, or schema-invalid file yields the empty (all-enabled) config
 * rather than throwing — a corrupt toolsets.json must never block tool use.
 */
export function loadToolsetsConfig(projectRoot: string): ToolsetsConfig {
  const filePath = toolsetsFilePath(projectRoot);
  if (!existsSync(filePath)) return emptyToolsetsConfig();
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
    return isToolsetsConfig(parsed) ? parsed : emptyToolsetsConfig();
  } catch {
    return emptyToolsetsConfig();
  }
}

/** Atomic write (tmp + rename) — mirrors approval-store.ts/approval-broker.ts
 *  `atomicWriteJson`: a crash mid-write never leaves a torn toolsets.json, and
 *  a concurrent reader never observes a half-written file. */
function saveToolsetsConfig(projectRoot: string, config: ToolsetsConfig): void {
  const filePath = toolsetsFilePath(projectRoot);
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup — the rename error below is what the caller needs.
    }
    throw err;
  }
}

/** Enables or disables a tool by id and persists the result. Pure disk
 *  round-trip (no in-memory instance state) — a fresh process reading the
 *  same `projectRoot` via {@link loadToolsetsConfig} sees the change, which
 *  is what makes this restart-survive. */
export function setToolEnabled(projectRoot: string, id: string, enabled: boolean): ToolsetsConfig {
  const config = loadToolsetsConfig(projectRoot);
  const disabledSet = new Set(config.disabled);
  if (enabled) {
    disabledSet.delete(id);
  } else {
    disabledSet.add(id);
  }
  const updated: ToolsetsConfig = { version: config.version, disabled: [...disabledSet].sort() };
  saveToolsetsConfig(projectRoot, updated);
  return updated;
}

export function isToolDisabled(projectRoot: string, id: string): boolean {
  return loadToolsetsConfig(projectRoot).disabled.includes(id);
}

export function getToolsetStatus(projectRoot: string, id: string): ToolsetStatus {
  return { id, isDisabled: isToolDisabled(projectRoot, id) };
}
