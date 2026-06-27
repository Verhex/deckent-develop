/**
 * Hermetic tests for the deckent_kpi MCP tool (KPI Faz-2, Sprint 331 Task 8)
 *
 * Uses a real seeded tmpdir memory.db (KpiStore) — no project-root or gitignored
 * state is read, satisfying the test-hermeticity rules (CUSTOM discipline).
 *
 * Coverage:
 *   (1) registration + schema
 *   (2) seeded DB → kpis[] with numeric cost_per_sprint value
 *   (3) no-sprint / missing-db → empty kpis[]
 *   (4) tenantId isolation
 *   (5) JSON shape matches deckent kpi --json wire format
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
  const dir = mkdtempSync(join(tmpdir(), 'kpi-tool-test-'));
  tmpdirs.push(dir);
  const dbPath = join(dir, 'memory.db');
  const store = new KpiStore(dbPath);
  return { dir, dbPath, store };
}

afterEach(() => {
  // Clean up all tmpdir fixtures created in this suite.
  for (const dir of tmpdirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deckent_kpi MCP tool — registration', () => {
  it('(1a) registers deckent_kpi on the server', () => {
    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer);
    expect(server.tools.has('deckent_kpi')).toBe(true);
  });

  it('(1b) schema accepts empty args (both fields optional)', () => {
    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer);
    const { schema } = server.tools.get('deckent_kpi')!;
    const { inputSchema } = schema as { inputSchema: { parse: (v: unknown) => unknown } };
    expect(() => inputSchema.parse({})).not.toThrow();
    expect(() => inputSchema.parse({ sprint: 'sprint-331', tenantId: 'acme' })).not.toThrow();
  });

  it('(1c) tool is readOnly (readOnlyHint: true)', () => {
    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer);
    const { schema } = server.tools.get('deckent_kpi')!;
    const { annotations } = schema as { annotations: { readOnlyHint: boolean } };
    expect(annotations.readOnlyHint).toBe(true);
  });
});

describe('deckent_kpi — seeded DB returns kpis[]', () => {
  it('(2) pre-computed result for cost_per_sprint → numeric value in response', async () => {
    const { dbPath, store } = makeTmpDb();

    // Seed a pre-computed KPI result directly (fastest path — no rollup needed).
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
      sprintFn: () => null, // sprint explicitly provided in args
    });

    const result = await server.tools.get('deckent_kpi')!.handler({ sprint: 'sprint-331' });
    const data = parseText(result) as { sprintId: string; kpis: Array<Record<string, unknown>> };

    expect(data.sprintId).toBe('sprint-331');
    expect(Array.isArray(data.kpis)).toBe(true);

    const costKpi = data.kpis.find((k) => k['id'] === 'cost_per_sprint');
    expect(costKpi).toBeDefined();
    expect(typeof costKpi!['value']).toBe('number');
    expect(costKpi!['value']).toBe(2.75);
    expect(costKpi!['status']).toBe('healthy');
    expect(costKpi!['direction']).toBe('down');
    expect(costKpi!['format']).toBe('currency');
    expect(costKpi!['formatted']).toBe('$2.75');
  });

  it('(3) all 8 built-in KPI slots appear (result-null slots included)', async () => {
    const { dbPath, store } = makeTmpDb();

    // Seed only one KPI; the rest will be returned with result: null (no data).
    store.upsertResults([{
      tenantId: 'default',
      kpiId: 'cost_per_sprint',
      grain: 'sprint',
      periodKey: 'sprint-999',
      value: 1.50,
      target: null,
      status: 'healthy',
    }]);
    store.close();

    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer, {
      dbPathFn: () => dbPath,
      sprintFn: () => null,
    });

    const result = await server.tools.get('deckent_kpi')!.handler({ sprint: 'sprint-999' });
    const data = parseText(result) as { sprintId: string; kpis: Array<Record<string, unknown>> };

    // All 8 built-in sprint-grain KPIs must appear in the response.
    expect(data.kpis.length).toBe(8);

    // KPIs without results have value: null + status: 'unknown'.
    const noDataKpi = data.kpis.find((k) => k['id'] === 'no_go_rate');
    expect(noDataKpi).toBeDefined();
    expect(noDataKpi!['value']).toBeNull();
    expect(noDataKpi!['status']).toBe('unknown');
  });
});

describe('deckent_kpi — no-data paths', () => {
  it('(4) missing DB → returns { sprintId, kpis: [] } (no error)', async () => {
    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer, {
      dbPathFn: () => '/nonexistent/path/memory.db',
      sprintFn: () => null,
    });

    const result = await server.tools.get('deckent_kpi')!.handler({ sprint: 'sprint-000' });
    expect(result.isError).toBeUndefined();
    const data = parseText(result) as { sprintId: string; kpis: unknown[] };
    expect(data.kpis).toHaveLength(0);
  });

  it('(5) no sprint arg + sprintFn returns null → sprintId null, kpis []', async () => {
    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer, {
      dbPathFn: () => '/nonexistent/path/memory.db',
      sprintFn: () => null,
    });

    const result = await server.tools.get('deckent_kpi')!.handler({});
    const data = parseText(result) as { sprintId: null; kpis: unknown[] };
    expect(data.sprintId).toBeNull();
    expect(data.kpis).toHaveLength(0);
  });
});

describe('deckent_kpi — tenant isolation', () => {
  it('(6) tenantId arg is respected — other-tenant data not returned', async () => {
    const { dbPath, store } = makeTmpDb();

    store.upsertResults([
      {
        tenantId: 'acme',
        kpiId: 'cost_per_sprint',
        grain: 'sprint',
        periodKey: 'sprint-10',
        value: 9.99,
        target: null,
        status: 'critical',
      },
      {
        tenantId: 'default',
        kpiId: 'cost_per_sprint',
        grain: 'sprint',
        periodKey: 'sprint-10',
        value: 1.23,
        target: null,
        status: 'healthy',
      },
    ]);
    store.close();

    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer, {
      dbPathFn: () => dbPath,
      sprintFn: () => null,
    });

    // Request with default tenant — must get 1.23, not 9.99.
    const result = await server.tools.get('deckent_kpi')!.handler({
      sprint: 'sprint-10',
      tenantId: 'default',
    });
    const data = parseText(result) as { kpis: Array<Record<string, unknown>> };
    const cost = data.kpis.find((k) => k['id'] === 'cost_per_sprint');
    expect(cost!['value']).toBe(1.23);
    expect(cost!['status']).toBe('healthy');
  });
});

describe('deckent_kpi — wire shape', () => {
  it('(7) each kpi item has required fields with correct types', async () => {
    const { dbPath, store } = makeTmpDb();
    store.upsertResults([{
      tenantId: 'default',
      kpiId: 'cache_hit_rate',
      grain: 'sprint',
      periodKey: 'sprint-100',
      value: 0.755,
      target: null,
      status: 'healthy',
    }]);
    store.close();

    const server = createMockServer();
    registerKpiTool(server as unknown as McpServer, {
      dbPathFn: () => dbPath,
      sprintFn: () => null,
    });

    const result = await server.tools.get('deckent_kpi')!.handler({ sprint: 'sprint-100' });
    const data = parseText(result) as { kpis: Array<Record<string, unknown>> };
    const cacheKpi = data.kpis.find((k) => k['id'] === 'cache_hit_rate');

    expect(cacheKpi).toBeDefined();
    expect(typeof cacheKpi!['id']).toBe('string');
    expect(typeof cacheKpi!['title']).toBe('string');
    expect(cacheKpi!['title']).toBe('Cache Hit Rate'); // def.title.en
    expect(typeof cacheKpi!['formatted']).toBe('string');
    expect(cacheKpi!['formatted']).toBe('75.5%');
    expect(typeof cacheKpi!['direction']).toBe('string');
    expect(typeof cacheKpi!['format']).toBe('string');
    expect(typeof cacheKpi!['unit']).toBe('string');
  });
});
