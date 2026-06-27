/**
 * deckent_kpi MCP tool — Sprint KPI scorecard (KPI Faz-2, Sprint 331 Task 8)
 *
 * Exposes the same JSON shape as `deckent kpi --json`:
 *   { sprintId, kpis: [{id, title, value, formatted, target, status, direction, format, unit}] }
 *
 * READ-only: delegates all computation to KpiService.listSprintViews (SSOT).
 * No DB writes beyond KpiService's own live-path self-heal.
 *
 * Injectable deps (dbPathFn, sprintFn) make the tool hermetic in tests —
 * production callers pass no deps and rely on process.cwd() + sprint-state.
 *
 * ADR-008: mcp/ must not import from cli/. formatKpiValue is inlined here
 * (same logic as cli/commands/kpi.ts) to respect the import-direction rule.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { KpiService } from '../../core/kpi/kpi-service.js';
import type { KpiView } from '../../core/kpi/kpi-service.js';
import type { KpiFormat } from '../../core/kpi/types.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { getCurrentSprintId } from '../../monitor/sprint-state.js';

// ─── Injectable deps ──────────────────────────────────────────────────────────

export interface KpiToolDeps {
  /** Override DB path resolution for hermetic tests. */
  dbPathFn?: (root: string) => string;
  /** Override current-sprint resolution for hermetic tests. */
  sprintFn?: (root: string) => string | null;
}

// ─── Value formatting (mirrors cli/commands/kpi.ts — inlined per ADR-008) ────

function formatKpiValue(value: number | null, format: KpiFormat): string {
  if (value === null) return '—';
  switch (format) {
    case 'currency': return `$${value.toFixed(2)}`;
    case 'percent': return `${(value * 100).toFixed(1)}%`;
    case 'duration': return `${value.toFixed(1)}s`;
    case 'number':
    default: return value.toLocaleString('en-US');
  }
}

// ─── View → wire shape ────────────────────────────────────────────────────────

interface KpiWireItem {
  id: string;
  title: string;
  value: number | null;
  formatted: string;
  target: number | null;
  status: string;
  direction: string;
  format: string;
  unit: string;
}

function mapViews(views: KpiView[]): KpiWireItem[] {
  return views.map(({ definition: def, result }) => ({
    id: def.id,
    title: def.title.en,
    value: result?.value ?? null,
    formatted: formatKpiValue(result?.value ?? null, def.format),
    target: def.target ?? result?.target ?? null,
    status: result?.status ?? 'unknown',
    direction: def.direction,
    format: def.format,
    unit: def.unit,
  }));
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerKpiTool(server: McpServer, deps: KpiToolDeps = {}): void {
  const resolveDbPath = deps.dbPathFn ?? ((root: string) => join(root, BRAIN_DIR, MEMORY_DB_FILE));
  const resolveSprint = deps.sprintFn ?? getCurrentSprintId;

  server.registerTool(
    'deckent_kpi',
    {
      title: 'KPI Scorecard',
      description:
        'Show the KPI scorecard for a sprint — returns { sprintId, kpis } with ' +
        'cost, token, cache, retry, completion, and quality metrics. ' +
        'Delegates to KpiService (SSOT); read-only.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        sprint: z.string().optional().describe(
          'Sprint ID (e.g. "sprint-330") — defaults to the current active sprint',
        ),
        tenantId: z.string().optional().describe(
          'Tenant scope — defaults to "default"',
        ),
      }),
    },
    async ({ sprint, tenantId }) => {
      try {
        const root = process.cwd();
        const dbPath = resolveDbPath(root);
        const sprintId = sprint ?? resolveSprint(root);
        const tenant = tenantId ?? 'default';

        if (!sprintId || !existsSync(dbPath)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ sprintId: sprintId ?? null, kpis: [] }),
            }],
          };
        }

        const service = new KpiService(dbPath, { tenantId: tenant });
        let views: KpiView[];
        try {
          views = service.listSprintViews(sprintId);
        } finally {
          service.close();
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ sprintId, kpis: mapViews(views) }),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error reading KPI data: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }
    },
  );
}
