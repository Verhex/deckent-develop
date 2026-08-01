/**
 * Tests for deckent_usage MCP lineage projection (Task 486-011)
 *
 * Verifies the MCP surface projects the SAME canonical aggregate as
 * core/lineage-usage-authority.ts with zero independent inference: no local
 * billing recalculation, no dropped FIX attempts, no silent unknown->0
 * billing coercion.
 */

import { describe, it, expect, vi } from 'vitest';
import { aggregateLineageUsageAuthority } from '../../src/core/lineage-usage-authority.js';
import type { LineageUsageAttempt, LineageUsageAuthorityTask } from '../../src/core/lineage-usage-authority.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function buildMockServer(): {
  registerTool: ReturnType<typeof vi.fn>;
  getHandler: (name: string) => ToolHandler | undefined;
} {
  const handlers = new Map<string, ToolHandler>();
  const schemas = new Map<string, unknown>();
  const registerTool = vi.fn((name: string, schema: unknown, handler: ToolHandler) => {
    handlers.set(name, handler);
    schemas.set(name, schema);
  });
  return { registerTool, getHandler: (name) => handlers.get(name) };
}

function attempt(
  id: string,
  taskId: string,
  overrides: Partial<LineageUsageAttempt> = {},
): LineageUsageAttempt {
  return {
    id,
    taskId,
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 2,
    cacheCreationTokens: 1,
    referenceCostUsd: 0.25,
    ...overrides,
  };
}

describe('deckent_usage MCP tool — lineage input schema', () => {
  it('(1) accepts an optional lineage object of tasks + attempts', async () => {
    const { registerUsageTool } = await import('../../src/mcp/tools/usage.js');
    const server = buildMockServer();
    registerUsageTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    const [, schema] = server.registerTool.mock.calls[0]!;
    const { inputSchema } = schema as { inputSchema: { parse: (v: unknown) => unknown } };
    expect(() => inputSchema.parse({})).not.toThrow();
    expect(() => inputSchema.parse({
      lineage: {
        tasks: [{ id: 'root', billingAuthority: 'subscription' }],
        attempts: [{
          id: 'attempt-root', taskId: 'root',
          inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0,
          referenceCostUsd: 0.1,
        }],
      },
    })).not.toThrow();
  });
});

describe('projectUsageLineage — no independent MCP-side inference', () => {
  it('(2) produces the exact same aggregate as calling the core authority directly', async () => {
    const { projectUsageLineage } = await import('../../src/mcp/tools/usage.js');
    const tasks: LineageUsageAuthorityTask[] = [{ id: 'root', billingAuthority: 'subscription' }];
    const attempts: LineageUsageAttempt[] = [
      attempt('attempt-root', 'root'),
      attempt('attempt-fix', 'root-fix', { fixForTaskId: 'root', referenceCostUsd: 0.5 }),
    ];

    const viaMcp = projectUsageLineage({ tasks, attempts });
    const viaCore = aggregateLineageUsageAuthority({ tasks, attempts });

    expect(viaMcp).toEqual(viaCore);
  });

  it('(3) folds a dynamic FIX attempt into its logical root and retains all usage', async () => {
    const { projectUsageLineage } = await import('../../src/mcp/tools/usage.js');
    const aggregates = projectUsageLineage({
      tasks: [{ id: 'root', billingAuthority: 'subscription' }],
      attempts: [
        attempt('attempt-root', 'root'),
        attempt('attempt-fix', 'root-fix', { fixForTaskId: 'root', inputTokens: 30, referenceCostUsd: 0.5 }),
      ],
    });

    expect(aggregates).toHaveLength(1);
    expect(aggregates[0]).toMatchObject({
      logicalRootTaskId: 'root',
      tokenUsage: { inputTokens: 40, outputTokens: 10, cacheReadTokens: 4, cacheCreationTokens: 2 },
      referenceCostUsd: 0.75,
    });
    expect(aggregates[0]!.attempts.map((a) => a.id)).toEqual(
      expect.arrayContaining(['attempt-root', 'attempt-fix']),
    );
  });

  it('(4) never silently converts an unmetered-invoice gap to zero billed USD', async () => {
    const { projectUsageLineage } = await import('../../src/mcp/tools/usage.js');
    const [aggregate] = projectUsageLineage({
      tasks: [{ id: 'root', billingAuthority: 'metered' }],
      attempts: [attempt('attempt', 'root', { referenceCostUsd: 99 })],
    });

    expect(aggregate!.billedUsd).toEqual({ state: 'unknown', reason: 'missing-metered-invoice' });
    expect(aggregate!.referenceCostUsd).toBe(99);
  });
});

describe('deckent_usage tool handler — lineage mode', () => {
  it('(5) returns the projected aggregate untouched when lineage input is supplied', async () => {
    const { registerUsageTool } = await import('../../src/mcp/tools/usage.js');
    const server = buildMockServer();
    registerUsageTool(server as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
    const handler = server.getHandler('deckent_usage')!;

    const result = await handler({
      lineage: {
        tasks: [{ id: 'root', billingAuthority: 'hybrid' }],
        attempts: [{
          id: 'attempt', taskId: 'root',
          inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheCreationTokens: 1,
          referenceCostUsd: 0.25,
        }],
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as {
      lineage: Array<{ billingAuthority: string; billedUsd: unknown }>;
    };
    expect(parsed.lineage).toHaveLength(1);
    expect(parsed.lineage[0]!.billingAuthority).toBe('hybrid');
    expect(parsed.lineage[0]!.billedUsd).toEqual({ state: 'unknown', reason: 'hybrid-billing-authority' });
  });

  it('(6) existing window-mode getUsageData path is unaffected by the lineage addition', async () => {
    const { getUsageData } = await import('../../src/mcp/tools/usage.js');
    const result = await getUsageData(
      { since: '2026-06-01' },
      { parseFn: async () => [], pricesFn: () => ({}) },
    );
    expect(result).toEqual({ message: 'No usage records found for the specified window.' });
  });
});
