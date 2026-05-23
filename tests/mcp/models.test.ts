// ─── MCP deckent_models tool tests (Sprint 190 190-011) ───────────────────
// Tests: list action, provider filter, tier lookup, refresh cache invalidate

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  loadCatalog: vi.fn(),
  registerTool: vi.fn(),
}));

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../src/core/model-catalog.js', () => ({
  loadCatalog: hoisted.loadCatalog,
}));

// ─── Static imports (after mocks) ──────────────────────────────────────────

import { registerModelsTool } from '../../src/mcp/tools/models.js';
import type { ModelDefinition } from '../../src/core/model-registry.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const MODEL_OPUS: ModelDefinition = {
  id: 'opus',
  apiId: 'claude-opus-4-6',
  provider: 'claude',
  tier: 'premium',
  contextWindow: 1_000_000,
  costPerMillion: { input: 15, output: 75 },
  capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
  status: 'ga',
};

const MODEL_SONNET: ModelDefinition = {
  id: 'sonnet',
  apiId: 'claude-sonnet-4-6',
  provider: 'claude',
  tier: 'standard',
  contextWindow: 200_000,
  costPerMillion: { input: 3, output: 15 },
  capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
  status: 'ga',
};

const MODEL_GPT5: ModelDefinition = {
  id: 'gpt-5',
  apiId: 'gpt-5',
  provider: 'codex',
  tier: 'premium',
  contextWindow: 1_000_000,
  costPerMillion: { input: 5, output: 15 },
  capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
  status: 'ga',
};

const CATALOG_RESULT = {
  models: [MODEL_OPUS, MODEL_SONNET, MODEL_GPT5],
  source: 'bundled' as const,
  fetchedAt: null,
  ageMs: null,
  warnings: [],
};

// ─── MCP server mock builder ───────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

function buildMockServer(): { registerTool: ReturnType<typeof vi.fn>; getHandler: (name: string) => ToolHandler } {
  const handlers = new Map<string, ToolHandler>();
  const registerTool = vi.fn(
    (name: string, _schema: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    },
  );
  return {
    registerTool,
    getHandler: (name: string) => {
      const h = handlers.get(name);
      if (!h) throw new Error(`No handler registered for ${name}`);
      return h;
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('registerModelsTool', () => {
  it('registers a tool named deckent_models', () => {
    const server = buildMockServer();
    registerModelsTool(server as unknown as Parameters<typeof registerModelsTool>[0]);
    expect(server.registerTool).toHaveBeenCalledWith(
      'deckent_models',
      expect.objectContaining({ title: 'Model Catalog' }),
      expect.any(Function),
    );
  });
});

describe('deckent_models — list action', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    hoisted.loadCatalog.mockReset();
    const server = buildMockServer();
    registerModelsTool(server as unknown as Parameters<typeof registerModelsTool>[0]);
    handler = server.getHandler('deckent_models');
  });

  it('returns all models when no provider filter is given', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    const result = await handler({ action: 'list' });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.action).toBe('list');
    expect(data.modelCount).toBe(3);
    expect(data.models).toHaveLength(3);
    expect(data.provider).toBe('all');
  });

  it('filters models by provider when provider param is given', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    const result = await handler({ action: 'list', provider: 'claude' });

    const data = JSON.parse(result.content[0]!.text);
    expect(data.modelCount).toBe(2);
    expect(data.models.every((m: ModelDefinition) => m.provider === 'claude')).toBe(true);
    expect(data.provider).toBe('claude');
  });

  it('returns empty models array when provider filter matches nothing', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    const result = await handler({ action: 'list', provider: 'ollama' });

    const data = JSON.parse(result.content[0]!.text);
    expect(data.modelCount).toBe(0);
    expect(data.models).toHaveLength(0);
  });

  it('passes offline flag to loadCatalog', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    await handler({ action: 'list', offline: true });

    expect(hoisted.loadCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ offline: true }),
    );
  });

  it('returns error response when loadCatalog throws', async () => {
    hoisted.loadCatalog.mockRejectedValue(new Error('network error'));

    const result = await handler({ action: 'list' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.error).toBe(true);
    expect(data.message).toContain('network error');
  });
});

describe('deckent_models — refresh action', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    hoisted.loadCatalog.mockReset();
    const server = buildMockServer();
    registerModelsTool(server as unknown as Parameters<typeof registerModelsTool>[0]);
    handler = server.getHandler('deckent_models');
  });

  it('calls loadCatalog with forceRefresh: true', async () => {
    const fetchedAt = Date.now();
    hoisted.loadCatalog.mockResolvedValue({
      ...CATALOG_RESULT,
      source: 'remote' as const,
      fetchedAt,
    });

    const result = await handler({ action: 'refresh' });

    expect(hoisted.loadCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: true }),
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.action).toBe('refresh');
    expect(data.source).toBe('remote');
    expect(data.modelCount).toBe(3);
    expect(data.fetchedAt).toBe(fetchedAt);
  });

  it('returns error on refresh failure', async () => {
    hoisted.loadCatalog.mockRejectedValue(new Error('timeout'));

    const result = await handler({ action: 'refresh' });

    expect(result.isError).toBe(true);
  });
});

describe('deckent_models — tier action', () => {
  let handler: ToolHandler;

  beforeEach(() => {
    hoisted.loadCatalog.mockReset();
    const server = buildMockServer();
    registerModelsTool(server as unknown as Parameters<typeof registerModelsTool>[0]);
    handler = server.getHandler('deckent_models');
  });

  it('returns tier info for a known model id', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    const result = await handler({ action: 'tier', model: 'opus' });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.action).toBe('tier');
    expect(data.id).toBe('opus');
    expect(data.tier).toBe('premium');
    expect(data.provider).toBe('claude');
  });

  it('finds a model by apiId', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    const result = await handler({ action: 'tier', model: 'claude-opus-4-6' });

    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe('opus');
    expect(data.apiId).toBe('claude-opus-4-6');
  });

  it('returns error when model is not found', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    const result = await handler({ action: 'tier', model: 'nonexistent' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.error).toBe(true);
    expect(data.message).toContain('nonexistent');
  });

  it('returns error when model param is missing', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    const result = await handler({ action: 'tier' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.error).toBe(true);
  });
});
