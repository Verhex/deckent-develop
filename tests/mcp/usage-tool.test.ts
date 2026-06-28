/**
 * Tests for the deckent_usage MCP tool (Sprint 275 Task 275-003)
 *
 * Tests tool registration, schema, and core getUsageData() logic using
 * injectable deps so no real ~/.claude filesystem is accessed.
 */

import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { UsageRecord } from '../../src/core/limit-ledger.js';

// ─── Mock server builder ─────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function buildMockServer(): {
  registerTool: ReturnType<typeof vi.fn>;
  getHandler: (name: string) => ToolHandler | undefined;
  registeredNames: () => string[];
} {
  const handlers = new Map<string, ToolHandler>();
  const schemas = new Map<string, unknown>();
  const registerTool = vi.fn((name: string, schema: unknown, handler: ToolHandler) => {
    handlers.set(name, handler);
    schemas.set(name, schema);
  });
  return {
    registerTool,
    getHandler: (name) => handlers.get(name),
    registeredNames: () => [...handlers.keys()],
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    ts: '2026-06-10T00:00:00.000Z',
    model: 'claude-sonnet-4-6',
    sessionFile: 'session-001.jsonl',
    projectDir: 'test-project',
    in: 1000,
    out: 200,
    cacheRead: 5000,
    cacheWrite: 800,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deckent_usage MCP tool — registration', () => {
  it('(1) registerUsageTool registers deckent_usage on the server', async () => {
    const { registerUsageTool } = await import('../../src/mcp/tools/usage.js');
    const server = buildMockServer();
    registerUsageTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    expect(server.registeredNames()).toContain('deckent_usage');
    expect(server.registerTool).toHaveBeenCalledTimes(1);
  });

  it('(2) tool schema accepts all optional fields (sprint, since, until)', async () => {
    const { registerUsageTool } = await import('../../src/mcp/tools/usage.js');
    const server = buildMockServer();
    registerUsageTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    const [, schema] = server.registerTool.mock.calls[0]!;
    const { inputSchema } = schema as { inputSchema: { parse: (v: unknown) => unknown } };
    // all fields optional — should parse with empty object
    expect(() => inputSchema.parse({})).not.toThrow();
    // and with all fields present
    expect(() => inputSchema.parse({ sprint: '275', since: '2026-06-01', until: '2026-06-10' })).not.toThrow();
  });
});

describe('getUsageData — window mode', () => {
  it('(3) returns model summary array when records exist', async () => {
    const { getUsageData } = await import('../../src/mcp/tools/usage.js');
    const records: UsageRecord[] = [
      makeRecord({ model: 'claude-sonnet-4-6', in: 2000, out: 400 }),
      makeRecord({ model: 'claude-haiku-4-5', in: 500, out: 100, cacheRead: 200, cacheWrite: 100 }),
    ];
    const result = await getUsageData(
      { since: '2026-06-01' },
      { parseFn: async () => records, pricesFn: () => ({}) },
    );
    expect(result).toHaveProperty('models');
    expect((result as { models: unknown[] }).models).toHaveLength(2);
    const models = (result as { models: Array<{ model: string; calls: number }> }).models;
    expect(models.some((m) => m.model === 'claude-sonnet-4-6')).toBe(true);
  });

  it('(4) returns empty message when no records found', async () => {
    const { getUsageData } = await import('../../src/mcp/tools/usage.js');
    const result = await getUsageData(
      { since: '2026-06-01' },
      { parseFn: async () => [] },
    );
    expect(result).toHaveProperty('message');
    expect((result as { message: string }).message).toMatch(/no usage records/i);
  });

  it('(5) model summary includes expected shape fields', async () => {
    const { getUsageData } = await import('../../src/mcp/tools/usage.js');
    const records: UsageRecord[] = [makeRecord({ in: 3000, out: 600, cacheRead: 9000, cacheWrite: 1200 })];
    const result = await getUsageData(
      {},
      { parseFn: async () => records, pricesFn: () => ({}) },
    );
    const models = (result as { models: Array<Record<string, unknown>> }).models ?? [];
    expect(models[0]).toMatchObject({
      model: 'claude-sonnet-4-6',
      calls: 1,
      in: 3000,
      out: 600,
      cacheRead: 9000,
      cacheWrite: 1200,
    });
    expect(typeof (models[0] as { hitRate: number }).hitRate).toBe('number');
  });
});

describe('getUsageData — sprint mode', () => {
  it('(6) sprint mode returns tasks + totals + cacheGate shape', async () => {
    const { getUsageData } = await import('../../src/mcp/tools/usage.js');
    const records: UsageRecord[] = [
      makeRecord({ sessionFile: 'sess-275-001.jsonl', in: 2000, out: 300, cacheRead: 4000, cacheWrite: 600 }),
    ];
    const taskMap: Record<string, string> = { 'sess-275-001.jsonl': '275-001' };
    const result = await getUsageData(
      { sprint: '275' },
      {
        parseFn: async () => records,
        buildTaskMapFn: async () => taskMap,
        pricesFn: () => ({}),
      },
    );
    expect(result).toHaveProperty('tasks');
    expect(result).toHaveProperty('totals');
    expect(result).toHaveProperty('cacheGate');
  });

  it('(7) sprint mode with no matching tasks returns empty tasks array', async () => {
    const { getUsageData } = await import('../../src/mcp/tools/usage.js');
    const records: UsageRecord[] = [makeRecord({ sessionFile: 'sess-001.jsonl' })];
    const taskMap: Record<string, string> = { 'sess-001.jsonl': '274-001' };
    const result = await getUsageData(
      { sprint: '275' },
      {
        parseFn: async () => records,
        buildTaskMapFn: async () => taskMap,
        pricesFn: () => ({}),
      },
    );
    // no 275-xxx tasks → tasks array is empty
    const tasks = (result as { tasks: unknown[] }).tasks ?? [];
    expect(tasks).toHaveLength(0);
  });
});

describe('lint-mcp-instructions.mjs', () => {
  it('(8) script exits 0 after adding deckent_usage (37 tools)', () => {
    const scriptPath = join(process.cwd(), 'scripts', 'lint-mcp-instructions.mjs');
    const result = spawnSync('node', [scriptPath], {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^OK:/);
    expect(result.stdout).toContain('37 tools');
  });
});
