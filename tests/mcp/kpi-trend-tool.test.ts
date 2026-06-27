/**
 * Hermetic tests for deckent_kpi trend mode (KPI Faz-2, Sprint 332 Task 10)
 *
 * Uses a real seeded tmpdir memory.db — no project-root or gitignored state
 * is read, satisfying test-hermeticity rules (CUSTOM discipline).
 *
 * Coverage:
 *   (1) trend mode with seeded data → { kpiId, series:[{periodKey,value,status}] }
 *   (2) trend mode with empty history → series:[], no throw
 *   (3) trend mode with missing DB → series:[], no throw
 *   (4) scorecard mode (no trend) → unchanged { sprintId, kpis } shape
 *   (5) n parameter limits the number of points returned
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import { registerKpiTool } from '../../src/mcp/tools/kpi.js';

// ─── Mock server ──────────────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface MockServer {
  tools: Map<string, { schema: unknown; handler: ToolHandler }>;
  registerTool(name: string, schema: unknown, handler: ToolHandler): void;
}

function createMockServer(): MockServer {
  const tools = new Map<string, { schema: unknown; handler: ToolHandler }>();
  return {
    tools,
    registerTool(name, schema, handler) {
      tools.set(name, { schema, handler });
    },
  };
}

function parseText(result: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(result.content[0]!.text);
}

// ─── Hermetic DB helpers ──────────────────────────────────────────────────────

const tmpdirs: string[] = [];

function makeTmpDb(): { dir: string; dbPath: string; store: KpiStore } {
  const dir = mkdtempSync(join(tmpdir(), 'kpi-trend-test-'));
  tmpdirs.push(dir);
  const dbPath = join(dir, 'memory.db');
  const store = new KpiStore(dbPath);
  return { dir, dbPath, store };
}

afterEach(() => {
  for (const dir of tmpdirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deckent_kpi trend mode — seeded data', () => {
  it('(1) returns { kpiId, series:[...] } with numeric points', async () => {
    const { dbPath, store } = makeTmpDb();

    store.upsertResults([
      { tenantId: 'default', kpiId: 'cost_per_sprint', grain: 'sprint', periodKey: 'sprint-329', value: 1.50, target: 3.0, status: 'healthy' },
      { tenantId: 'default', kpiId: 'cost_per_sprint', grain: 'sprint', periodKey: 'sprint-330', value: 2.00, target: 3.0, status: 'healthy' },
      { tenantId: 'default', kpiId: 'cost_per_sprint', grain: 'sprint', periodKey: 'sprint-331', value: 2.75, target: 3.0, status: 'healthy' },
    ]);
    store.close();

    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer, {
      dbPathFn: () => dbPath,
      sprintFn: () => null,
    });

    const result = await server.tools.get('deckent_kpi')!.handler({ trend: 'cost_per_sprint', n: 5 });
    expect(result.isError).toBeUndefined();

    const data = parseText(result) as { kpiId: string; series: Array<Record<string, unknown>> };
    expect(data.kpiId).toBe('cost_per_sprint');
    expect(Array.isArray(data.series)).toBe(true);
    expect(data.series.length).toBe(3);

    // Ordered old→new
    expect(data.series[0]!['periodKey']).toBe('sprint-329');
    expect(data.series[1]!['periodKey']).toBe('sprint-330');
    expect(data.series[2]!['periodKey']).toBe('sprint-331');

    // Each point has numeric value + status
    for (const point of data.series) {
      expect(typeof point['periodKey']).toBe('string');
      expect(typeof point['value']).toBe('number');
      expect(typeof point['status']).toBe('string');
    }

    expect(data.series[2]!['value']).toBe(2.75);
    expect(data.series[2]!['status']).toBe('healthy');
  });
});

describe('deckent_kpi trend mode — empty / missing data', () => {
  it('(2) empty history → { kpiId, series:[] }, no throw', async () => {
    const { dbPath, store } = makeTmpDb();
    // No results seeded — just initialise the store so the DB file exists.
    store.close();

    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer, {
      dbPathFn: () => dbPath,
      sprintFn: () => null,
    });

    const result = await server.tools.get('deckent_kpi')!.handler({ trend: 'cost_per_sprint', n: 5 });
    expect(result.isError).toBeUndefined();

    const data = parseText(result) as { kpiId: string; series: unknown[] };
    expect(data.kpiId).toBe('cost_per_sprint');
    expect(data.series).toHaveLength(0);
  });

  it('(3) missing DB → { kpiId, series:[] }, no throw', async () => {
    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer, {
      dbPathFn: () => '/nonexistent/path/memory.db',
      sprintFn: () => null,
    });

    const result = await server.tools.get('deckent_kpi')!.handler({ trend: 'cost_per_sprint', n: 5 });
    expect(result.isError).toBeUndefined();

    const data = parseText(result) as { kpiId: string; series: unknown[] };
    expect(data.kpiId).toBe('cost_per_sprint');
    expect(data.series).toHaveLength(0);
  });
});

describe('deckent_kpi trend mode — scorecard fallback', () => {
  it('(4) no trend arg → returns unchanged { sprintId, kpis } scorecard shape', async () => {
    const { dbPath, store } = makeTmpDb();
    store.upsertResults([{
      tenantId: 'default',
      kpiId: 'cost_per_sprint',
      grain: 'sprint',
      periodKey: 'sprint-331',
      value: 2.75,
      target: 3.0,
      status: 'healthy',
    }]);
    store.close();

    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer, {
      dbPathFn: () => dbPath,
      sprintFn: () => null,
    });

    const result = await server.tools.get('deckent_kpi')!.handler({ sprint: 'sprint-331' });
    expect(result.isError).toBeUndefined();

    const data = parseText(result) as { sprintId: string; kpis: Array<Record<string, unknown>> };
    expect(data.sprintId).toBe('sprint-331');
    expect(Array.isArray(data.kpis)).toBe(true);
    // Must NOT have kpiId / series (trend shape)
    expect((data as Record<string, unknown>)['kpiId']).toBeUndefined();
    expect((data as Record<string, unknown>)['series']).toBeUndefined();

    const costKpi = data.kpis.find(k => k['id'] === 'cost_per_sprint');
    expect(costKpi).toBeDefined();
    expect(costKpi!['value']).toBe(2.75);
  });
});

describe('deckent_kpi trend mode — n parameter', () => {
  it('(5) n=2 limits the returned series to 2 most-recent points', async () => {
    const { dbPath, store } = makeTmpDb();

    store.upsertResults([
      { tenantId: 'default', kpiId: 'cost_per_sprint', grain: 'sprint', periodKey: 'sprint-328', value: 1.00, target: null, status: 'healthy' },
      { tenantId: 'default', kpiId: 'cost_per_sprint', grain: 'sprint', periodKey: 'sprint-329', value: 1.50, target: null, status: 'healthy' },
      { tenantId: 'default', kpiId: 'cost_per_sprint', grain: 'sprint', periodKey: 'sprint-330', value: 2.00, target: null, status: 'healthy' },
    ]);
    store.close();

    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer, {
      dbPathFn: () => dbPath,
      sprintFn: () => null,
    });

    const result = await server.tools.get('deckent_kpi')!.handler({ trend: 'cost_per_sprint', n: 2 });
    const data = parseText(result) as { kpiId: string; series: Array<Record<string, unknown>> };

    expect(data.series).toHaveLength(2);
    // 2 most recent, old→new ordering
    expect(data.series[0]!['periodKey']).toBe('sprint-329');
    expect(data.series[1]!['periodKey']).toBe('sprint-330');
  });
});
