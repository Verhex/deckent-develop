/**
 * Tests for the deckent_cost MCP tool (Sprint 332 Task 332-015)
 *
 * Hermetic: all I/O is bypassed via injectable CostToolDeps —
 * no real .deckent/cost-config.json or resource-log.jsonl is touched.
 *
 * goNogo: "hermetic test invokes the registered tool against a seeded tmpdir
 * state → returns valid cost JSON (numeric, delegated to the existing cost SSOT;
 * empty → honest empty, no throw)"
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';
import { registerCostTool, getCostView } from '../../src/mcp/tools/cost.js';

// ─── Mock server builder ─────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function buildMockServer() {
  const handlers = new Map<string, ToolHandler>();
  const registerTool = vi.fn(
    (name: string, _schema: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    },
  );
  return {
    registerTool,
    getHandler: (name: string) => handlers.get(name),
    registeredNames: () => [...handlers.keys()],
  };
}

// ─── Fixture factory ──────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<CostConfig> = {}): CostConfig {
  return {
    _version: '2.0.0-test',
    providers: {
      anthropic: {
        enabled: true,
        billing_modes_supported: ['api', 'subscription'],
        default_billing_mode: 'subscription',
        models: {
          'claude-sonnet-5': {
            input_cost_per_token: 0.000003,
            output_cost_per_token: 0.000015,
            max_input_tokens: 200000,
            supports_prompt_caching: true,
            deckent_tier: 'standard',
            deckent_aliases: ['sonnet'],
          },
        },
      },
    },
    cost_limits: {
      sprint_max_usd: 5.0,
      daily_max_usd: 20.0,
    },
    update_config: {
      sources_priority: ['bundled'],
    },
    ...overrides,
  } as CostConfig;
}

// ─── Registration tests ───────────────────────────────────────────────────────

describe('deckent_cost MCP tool — registration', () => {
  it('(1) registerCostTool registers deckent_cost on the server', () => {
    const server = buildMockServer();
    registerCostTool(server as unknown as McpServer, {
      configFn: () => makeConfig(),
      spendFn: () => 0,
    });
    expect(server.registeredNames()).toContain('deckent_cost');
    expect(server.registerTool).toHaveBeenCalledTimes(1);
  });

  it('(2) tool schema accepts optional sprint and tenantId fields', () => {
    const server = buildMockServer();
    registerCostTool(server as unknown as McpServer, {
      configFn: () => makeConfig(),
      spendFn: () => 0,
    });
    const [, schema] = server.registerTool.mock.calls[0]!;
    const { inputSchema } = schema as { inputSchema: { parse: (v: unknown) => unknown } };
    expect(() => inputSchema.parse({})).not.toThrow();
    expect(() =>
      inputSchema.parse({ sprint: 'sprint-332', tenantId: 'default' }),
    ).not.toThrow();
  });

  it('(3) tool annotation is readOnly', () => {
    const server = buildMockServer();
    registerCostTool(server as unknown as McpServer, {
      configFn: () => makeConfig(),
      spendFn: () => 0,
    });
    const [, schema] = server.registerTool.mock.calls[0]!;
    const { annotations } = schema as {
      annotations: { readOnlyHint: boolean; destructiveHint: boolean };
    };
    expect(annotations.readOnlyHint).toBe(true);
    expect(annotations.destructiveHint).toBe(false);
  });
});

// ─── getCostView data shape ───────────────────────────────────────────────────

describe('getCostView — data shape', () => {
  it('(4) returns numeric budget fields matching config', () => {
    const config = makeConfig();
    const view = getCostView('/tmp/test-root', { configFn: () => config, spendFn: () => 0 });
    expect(typeof view.budget.sprintMaxUsd).toBe('number');
    expect(typeof view.budget.dailyMaxUsd).toBe('number');
    expect(view.budget.sprintMaxUsd).toBe(5.0);
    expect(view.budget.dailyMaxUsd).toBe(20.0);
    expect(view.budget.monthlyMaxUsd).toBeNull();
    expect(view.budget.autoConfirmBelowUsd).toBeNull();
  });

  it('(5) returns optional budget fields when set in config', () => {
    const config = makeConfig({
      cost_limits: {
        sprint_max_usd: 3.0,
        daily_max_usd: 10.0,
        monthly_max_usd: 50.0,
        auto_confirm_below_usd: 0.5,
      },
    });
    const view = getCostView('/tmp/test-root', { configFn: () => config, spendFn: () => 0 });
    expect(view.budget.monthlyMaxUsd).toBe(50.0);
    expect(view.budget.autoConfirmBelowUsd).toBe(0.5);
  });

  it('(6) returns enabled providers with per-MTok pricing', () => {
    const config = makeConfig();
    const view = getCostView('/tmp/test-root', { configFn: () => config, spendFn: () => 0 });
    expect(view.providers).toHaveProperty('anthropic');
    const m = view.providers['anthropic']!.models['claude-sonnet-5'];
    expect(m).toBeDefined();
    expect(m!.inputPerMTok).toBeCloseTo(3.0);
    expect(m!.outputPerMTok).toBeCloseTo(15.0);
    expect(m!.maxInputTokens).toBe(200000);
    expect(m!.tier).toBe('standard');
    expect(m!.aliases).toEqual(['sonnet']);
  });

  it('(7) spendTodayUsd comes from injected spendFn', () => {
    const config = makeConfig();
    const view = getCostView('/tmp/test-root', { configFn: () => config, spendFn: () => 1.42 });
    expect(view.spendTodayUsd).toBe(1.42);
  });

  it('(8) returns configVersion and null configLastUpdated when absent', () => {
    const config = makeConfig();
    const view = getCostView('/tmp/test-root', { configFn: () => config, spendFn: () => 0 });
    expect(view.configVersion).toBe('2.0.0-test');
    expect(view.configLastUpdated).toBeNull();
  });

  it('(9) configLastUpdated is returned when present in config', () => {
    const config = makeConfig({ _last_updated: '2026-06-27T00:00:00.000Z' });
    const view = getCostView('/tmp/test-root', { configFn: () => config, spendFn: () => 0 });
    expect(view.configLastUpdated).toBe('2026-06-27T00:00:00.000Z');
  });

  it('(10) returns empty providers map when no enabled models — honest empty, no throw', () => {
    const config = makeConfig({
      providers: {
        anthropic: {
          enabled: false,
          billing_modes_supported: ['api'],
          models: {
            'claude-sonnet-5': {
              input_cost_per_token: 0.000003,
              output_cost_per_token: 0.000015,
              max_input_tokens: 200000,
            },
          },
        },
      },
    });
    const view = getCostView('/tmp/test-root', { configFn: () => config, spendFn: () => 0 });
    expect(Object.keys(view.providers)).toHaveLength(0);
    expect(view.spendTodayUsd).toBe(0);
    // budget still present
    expect(typeof view.budget.sprintMaxUsd).toBe('number');
  });

  it('(11) provider defaultBillingMode falls back to first supported mode when default_billing_mode absent', () => {
    const config = makeConfig({
      providers: {
        openai: {
          enabled: true,
          billing_modes_supported: ['api'],
          // no default_billing_mode
          models: {
            'gpt-4o': {
              input_cost_per_token: 0.0000025,
              output_cost_per_token: 0.00001,
              max_input_tokens: 128000,
            },
          },
        },
      },
    });
    const view = getCostView('/tmp/test-root', { configFn: () => config, spendFn: () => 0 });
    expect(view.providers['openai']!.defaultBillingMode).toBe('api');
  });
});

// ─── Handler invocation ───────────────────────────────────────────────────────

describe('deckent_cost tool handler', () => {
  it('(12) handler returns valid JSON cost view with numeric fields', async () => {
    const config = makeConfig();
    const server = buildMockServer();
    registerCostTool(server as unknown as McpServer, {
      configFn: () => config,
      spendFn: () => 2.5,
    });
    const handler = server.getHandler('deckent_cost');
    expect(handler).toBeDefined();
    const result = await handler!({});
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');
    const data = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(typeof (data['budget'] as Record<string, unknown>)['sprintMaxUsd']).toBe('number');
    expect(typeof data['spendTodayUsd']).toBe('number');
    expect(data['spendTodayUsd']).toBe(2.5);
    expect(result.isError).toBeUndefined();
  });

  it('(13) handler accepts sprint and tenantId args without error', async () => {
    const config = makeConfig();
    const server = buildMockServer();
    registerCostTool(server as unknown as McpServer, {
      configFn: () => config,
      spendFn: () => 0,
    });
    const handler = server.getHandler('deckent_cost')!;
    const result = await handler({ sprint: 'sprint-332', tenantId: 'acme' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data).toHaveProperty('budget');
    expect(data).toHaveProperty('providers');
  });

  it('(14) handler returns isError response on configFn throw, does not propagate', async () => {
    const server = buildMockServer();
    registerCostTool(server as unknown as McpServer, {
      configFn: () => {
        throw new Error('config missing in test');
      },
    });
    const handler = server.getHandler('deckent_cost')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/config missing in test/);
  });
});
