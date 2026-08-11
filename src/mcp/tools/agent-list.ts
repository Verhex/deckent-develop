import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgentPoolManager } from '../../core/agent-pool.js';
import type {
  AgentCatalogLayer,
  AgentDeclaredSource,
  AgentPromptAvailability,
  AgentRoutabilityBlocker,
} from '../../core/agent-types.js';
import { readJsonSafe } from '../../core/utils.js';

// ─── Agent catalog read model (row 7011, slice S4) ──────────────────────────
//
// This tool no longer discovers agents itself. Every id, every facet and every
// precedence decision comes from the resolver (`AgentPoolManager`) — the same
// resolver `deckent agent list` consumes — so the two surfaces can no longer
// report different sets, different counts, or (D3) different provenance words
// for the same record. The deleted `readAgents()` scanned `.deckent/agents`
// directly and re-derived a `'built-in' | 'temp'` vocabulary from
// `source`/`persistent`, which is exactly the divergence D3 rules out.
//
// The projection below is duplicated in `src/cli/commands/agent.ts` on purpose:
// ADR-D-004 C3 forbids `mcp/ ↔ cli/` imports, and this slice holds no write
// authority in `src/core/`, where the shared projection belongs. Parity is held
// by tests/cli/agent-surface-readmodel.test.ts until that module exists.

/** One catalog record as the read surfaces render it — §3.4's four facets, kept separate. */
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
  /** Display word for the CLI's Type column; not part of the machine payload. */
  displayType: string | null;
}

/** Fixed collation (R3) — never locale-dependent `localeCompare`. */
function byId(a: AgentCatalogSurfaceEntry, b: AgentCatalogSurfaceEntry): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The resolver's message for a manifest whose bytes could not be read or parsed at all
 * (`AgentPoolManager._recordInvalidManifest`). Such a record has no describable content —
 * it is reported id-only. A record that parsed but failed schema validation is fully
 * describable and is rendered from the path the resolver itself reported.
 */
function isUnreadableManifest(errors: string[]): boolean {
  return errors.some((e) => e.startsWith('agent.json exists but is unreadable'));
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
      model: readModelField(raw),
      uses: readStatNumber(raw, 'totalUses', 'uses'),
      successRate: Math.round(readStatNumber(raw, 'successRate', 'successRate')),
      diagnostics: record.errors,
      displayType: readDisplayType(raw),
    });
  }

  return entries.sort(byId);
}

function readModelField(raw: Record<string, unknown> | null): string | null {
  const preferred = raw?.['preferredModel'];
  if (typeof preferred === 'string') return preferred;
  const model = raw?.['model'];
  return typeof model === 'string' ? model : null;
}

function readStatNumber(
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

function readDisplayType(raw: Record<string, unknown> | null): string | null {
  const type = raw?.['type'];
  if (typeof type === 'string') return type;
  const source = raw?.['source'];
  return typeof source === 'string' ? source : null;
}

export function registerAgentListTool(server: McpServer): void {
  server.registerTool(
    'deckent_agent_list',
    {
      title: 'Agent List',
      description:
        'List every agent the Deckent agent-catalog resolver resolves for this project — ' +
        'the same read model `deckent agent list` renders, so both surfaces always agree. ' +
        'Each record carries the four catalog facets kept separate: enabled (owner intent), ' +
        'routable (dispatchable now, with typed reasons), validity (schema conformance) and ' +
        'provenance (declared source, observed layer, resolved path). ' +
        'Records the resolver rejected are reported as validity "invalid" with the resolver ' +
        'diagnostics rather than silently dropped; archived records are never listed. ' +
        'Use to audit agent pool health, check which agents are actually dispatchable, or ' +
        'understand routing assignments.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const entries = buildAgentCatalogEntries(process.cwd());
        const agents = entries.map(({ displayType: _displayType, ...entry }) => entry);

        const response = {
          agents,
          total: agents.length,
          enabled: agents.filter((a) => a.enabled).length,
          routable: agents.filter((a) => a.routable.value).length,
          invalid: agents.filter((a) => a.validity === 'invalid').length,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
