/**
 * deckent_kpi MCP tool — Sprint KPI scorecard + trend (KPI Faz-2, Sprint 331-332)
 *
 * Scorecard mode (default): returns { sprintId, kpis: [{id, title, value, …}] }
 * Trend mode (trend arg set): returns { kpiId, series: [{periodKey, value, status}] }
 *
 * READ-only: delegates all computation to KpiService (SSOT).
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
import type { ResultRow } from '../../core/kpi/kpi-store.js';
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

// ─── Trend → wire shape ──────────────────────────────────────────────────────

interface KpiTrendPoint {
  periodKey: string;
  value: number;
  status: string;
}

interface KpiTrendWire {
  kpiId: string;
  series: KpiTrendPoint[];
}

function mapTrend(kpiId: string, rows: ResultRow[]): KpiTrendWire {
  return {
    kpiId,
    series: rows.map(r => ({
      periodKey: r.periodKey,
      value: r.value,
      status: r.status,
    })),
  };
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
        'Show the KPI scorecard for a sprint (default) or trend series for a single KPI. ' +
        'Scorecard: returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics. ' +
        'Trend (when trend arg set): returns { kpiId, series: [{periodKey, value, status}] }. ' +
        'Delegates to KpiService (SSOT); read-only.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        sprint: z.string().optional().describe(
          'Sprint ID (e.g. "sprint-330") — defaults to the current active sprint (scorecard mode only)',
        ),
        tenantId: z.string().optional().describe(
          'Tenant scope — defaults to "default"',
        ),
        trend: z.string().optional().describe(
          'KPI ID to fetch trend for (e.g. "cost_per_sprint") — activates trend mode',
        ),
        n: z.number().int().positive().optional().describe(
          'Number of sprint periods to return in trend mode — defaults to 10',
        ),
      }),
    },
    async ({ sprint, tenantId, trend, n }) => {
      try {
        const root = process.cwd();
        const dbPath = resolveDbPath(root);
        const tenant = tenantId ?? 'default';

        // ── Trend mode ────────────────────────────────────────────────────────
        if (trend !== undefined) {
          if (!existsSync(dbPath)) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ kpiId: trend, series: [] }),
              }],
            };
          }

          const service = new KpiService(dbPath, { tenantId: tenant });
          let rows: ResultRow[];
          try {
            rows = service.getTrend(trend, n ?? 10);
          } finally {
            service.close();
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(mapTrend(trend, rows)),
            }],
          };
        }

        // ── Scorecard mode (default) ──────────────────────────────────────────
        const sprintId = sprint ?? resolveSprint(root);

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
