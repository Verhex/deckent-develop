// src/core/agent-catalog-projection.ts
//
// THE one canonical agent-catalog projection (design S5, sprint-523 task 9;
// supersedes the byte-identical duplicate builders sprint-522's S4 left in
// cli/commands/agent.ts and mcp/tools/agent-list.ts). CLI, MCP and the API
// handler all consume this module — no surface may keep its own builder.

import { AgentPoolManager } from './agent-pool.js';
import type { AgentDeclaredSource, AgentCatalogLayer, AgentPromptAvailability, AgentRoutabilityBlocker } from './agent-types.js';
import { readJsonSafe } from './utils.js';

export interface AgentCatalogSurfaceEntry {
  id: string;
  name: string;
  /** Owner intent (§3.4), never conflated with routability. */
  enabled: boolean;
  /** Schema conformance as the resolver classified it. */
  validity: 'valid' | 'invalid';
  /** Can the router dispatch to it right now, and if not, why (D4). */
  routable: { value: boolean; reasons: AgentRoutabilityBlocker[] };
  provenance: {
    /** The manifest's own claim, verbatim (D3). */
    declared: AgentDeclaredSource | null;
    /** The layer actually observed — persona-resolved (S3); null when nothing resolved. */
    layer: AgentCatalogLayer | null;
    /** The path actually read, when one was. */
    resolvedFrom: string | null;
  };
  prompt: { availability: AgentPromptAvailability; degraded: boolean };
  model: string | null;
  uses: number;
  successRate: number;
  /** The resolver's own reasons for an `invalid` classification — never a silent drop (§4.3). */
  diagnostics: string[];
  /** Display word for the Type column. */
  displayType: string | null;
}

/** Fixed collation (R3) — never locale-dependent `localeCompare`. */
function byCatalogId(a: AgentCatalogSurfaceEntry, b: AgentCatalogSurfaceEntry): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The resolver's message for a manifest whose bytes could not be read or parsed at all
 * (`AgentPoolManager._recordInvalidManifest`). Such a record has no describable content
 * and is not rendered; one that parsed but failed schema validation is fully describable
 * and is rendered from the path the resolver itself reported.
 */
function isUnreadableManifest(errors: string[]): boolean {
  return errors.some((e) => e.startsWith('agent.json exists but is unreadable'));
}

function readCatalogModelField(raw: Record<string, unknown> | null): string | null {
  const preferred = raw?.['preferredModel'];
  if (typeof preferred === 'string') return preferred;
  const model = raw?.['model'];
  return typeof model === 'string' ? model : null;
}

function readCatalogStatNumber(
  raw: Record<string, unknown> | null,
  statsField: string,
  flatField: string,
): number {
  const stats = raw?.['stats'];
  if (stats && typeof stats === 'object') {
    const value = (stats as Record<string, unknown>)[statsField];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  const flat = raw?.[flatField];
  return typeof flat === 'number' && Number.isFinite(flat) ? flat : 0;
}

function readCatalogDisplayType(raw: Record<string, unknown> | null): string | null {
  const type = raw?.['type'];
  if (typeof type === 'string') return type;
  const source = raw?.['source'];
  return typeof source === 'string' ? source : null;
}

/**
 * Project the resolver's view for `root` into the surface entry shape.
 * Valid pool entries first, then the records the resolver rejected (ids the pool already
 * carries win — a record invalid in one layer but resolvable from another is not "invalid").
 */
export function buildAgentCatalogEntries(root: string): AgentCatalogSurfaceEntry[] {
  const manager = new AgentPoolManager(root);
  const pool = manager.loadAgents();
  const entries: AgentCatalogSurfaceEntry[] = [];

  for (const agent of pool.values()) {
    const prompt = manager.resolvePrompt(agent.id);
    const reasons: AgentRoutabilityBlocker[] = [];
    if (prompt.blocker) reasons.push(prompt.blocker);
    // D4 (owner, 2026-08-11): no capabilities => definitively non-routable.
    if (!agent.capabilities) reasons.push('capabilities-missing');
    entries.push({
      id: agent.id,
      name: agent.name,
      enabled: agent.enabled,
      validity: 'valid',
      routable: { value: reasons.length === 0, reasons },
      provenance: {
        declared: agent.source ?? null,
        layer: prompt.layer,
        resolvedFrom: prompt.resolvedFrom ?? null,
      },
      prompt: { availability: prompt.availability, degraded: prompt.degraded },
      model: agent.preferredModel ?? null,
      uses: agent.stats?.totalUses ?? 0,
      successRate: Math.round(agent.stats?.successRate ?? 0),
      diagnostics: [],
      displayType: agent.source ?? null,
    });
  }

  const seen = new Set(entries.map((e) => e.id));
  for (const record of manager.getInvalidManifests()) {
    if (seen.has(record.id)) continue;
    // A record whose bytes are unreadable cannot be described on any surface.
    if (isUnreadableManifest(record.errors)) continue;
    seen.add(record.id);
    // Exact-path read of the path the RESOLVER reported — discovery stays with the
    // resolver; this only recovers the declared fields of a record it could not accept.
    const raw = readJsonSafe<Record<string, unknown>>(record.path);
    entries.push({
      id: record.id,
      // §3.2: identity is the directory the resolver observed, never the manifest's own
      // `name` claim — a record that disagrees is exactly why it failed to load.
      name: record.id,
      enabled: raw?.['enabled'] !== false,
      validity: 'invalid',
      routable: { value: false, reasons: ['manifest-invalid'] },
      provenance: {
        declared: typeof raw?.['source'] === 'string' ? (raw['source'] as AgentDeclaredSource) : null,
        layer: null,
        resolvedFrom: record.path,
      },
      prompt: { availability: 'none', degraded: false },
      model: readCatalogModelField(raw),
      uses: readCatalogStatNumber(raw, 'totalUses', 'uses'),
      successRate: Math.round(readCatalogStatNumber(raw, 'successRate', 'successRate')),
      diagnostics: record.errors,
      displayType: readCatalogDisplayType(raw),
    });
  }

  return entries.sort(byCatalogId);
}

