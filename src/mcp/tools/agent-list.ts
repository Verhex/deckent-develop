import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildAgentCatalogEntries } from '../../core/agent-catalog-projection.js';
import { readCatalogStats } from '../../core/catalog-stats-read-model.js';
import { mcpToolDescription } from './description-catalog.js';

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
// S5 (sprint-523 task 9): canonical projection lives in core; the local
// duplicate builder + helpers are deleted and this surface re-exports the truth.
export { buildAgentCatalogEntries } from '../../core/agent-catalog-projection.js';
export type { AgentCatalogSurfaceEntry } from '../../core/agent-catalog-projection.js';

export function registerAgentListTool(server: McpServer): void {
  server.registerTool(
    'deckent_agent_list',
    {
      title: 'Agent List',
      description: mcpToolDescription('deckent_agent_list'),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const root = process.cwd();
        const catalogStats = readCatalogStats(root);
        const entries = buildAgentCatalogEntries(root);
        const agents = entries.map(({ displayType: _displayType, ...entry }) => {
          const legacyRatio = entry.uses === 0
            ? null
            : Math.max(0, Math.min(1, entry.successRate > 1 ? entry.successRate / 100 : entry.successRate));
          const stats = catalogStats.agents[entry.id] ?? {
            uses: entry.uses,
            successes: legacyRatio === null ? 0 : Math.round(legacyRatio * entry.uses),
            successRatio: legacyRatio,
            successPercent: legacyRatio === null ? null : Math.round(legacyRatio * 100),
            lastUsedInSprint: null,
          };
          return { ...entry, ...stats, successRate: stats.successRatio };
        });

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
