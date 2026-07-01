import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../src/core/tool-registry.js';
import { ToolSearchIndex, CORE_TOOL_NAMES } from '../../src/core/tool-search.js';
import { buildCoreToolSurface, deferredIndexLine, summarizeEagerSchema } from '../../src/core/tool-core.js';
// Disk-verify: seed from the REAL, canonical MCP tool catalog (B-MCPCATALOG-SSOT), same
// pattern as tests/core/tool-search.test.ts — not a hand-copied duplicate. Only the TEST
// reaches into src/mcp/tools; the source module (tool-core.ts) never imports mcp/ (ADR-D-004 C1).
import { TOOL_CATALOG } from '../../src/mcp/tools/index.js';

function seedRegistryFromCatalog(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const entry of TOOL_CATALOG) {
    registry.registerFromShape(
      {
        name: entry.name,
        description: entry.description,
        paramsSchema: z.object({}).passthrough(),
        annotations: { readOnlyHint: entry.readOnly },
      },
      {
        category: entry.readOnly ? 'monitoring' : 'lifecycle',
        handlerRef: `mcp:${entry.name}`,
      },
    );
  }
  return registry;
}

function buildSyntheticRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerFromShape(
    {
      name: 'deckent_status',
      description: 'Get the current sprint dashboard: agents, progress, usage, alerts',
      paramsSchema: z.object({ verbose: z.boolean().optional() }),
      annotations: { readOnlyHint: true },
    },
    { category: 'monitoring', handlerRef: 'mcp:deckent_status' },
  );
  registry.registerFromShape(
    {
      name: 'deckent_plan',
      description: 'Plan the next sprint',
      paramsSchema: z.object({ taskId: z.string(), count: z.number().default(1) }),
      annotations: {},
    },
    { category: 'lifecycle', handlerRef: 'mcp:deckent_plan' },
  );
  registry.registerFromShape(
    {
      name: 'deckent_run',
      description: 'Run the sprint',
      paramsSchema: z.object({}),
      annotations: {},
    },
    { category: 'lifecycle', handlerRef: 'mcp:deckent_run' },
  );
  registry.registerFromShape(
    {
      name: 'deckent_start',
      description: 'Start the sprint',
      paramsSchema: z.object({}),
      annotations: {},
    },
    { category: 'lifecycle', handlerRef: 'mcp:deckent_start' },
  );
  registry.registerFromShape(
    {
      name: 'deckent_review',
      description: 'Review sprint results',
      paramsSchema: z.object({}),
      annotations: {},
    },
    { category: 'monitoring', handlerRef: 'mcp:deckent_review' },
  );
  registry.registerFromShape(
    {
      name: 'deckent_help',
      description: 'Help',
      paramsSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    { category: 'catalog', handlerRef: 'mcp:deckent_help' },
  );
  registry.registerFromShape(
    {
      name: 'deckent_memory_query',
      description: 'Query memory',
      paramsSchema: z.object({ query: z.string().nullable() }),
      annotations: { readOnlyHint: true },
    },
    { category: 'knowledge', handlerRef: 'mcp:deckent_memory_query' },
  );
  registry.registerFromShape(
    {
      name: 'deckent_kill',
      description: 'Stop one or all running workers by task identifier',
      paramsSchema: z.object({ taskId: z.string().optional(), all: z.boolean().optional() }),
      annotations: { destructiveHint: true },
    },
    { category: 'lifecycle', handlerRef: 'mcp:deckent_kill' },
  );
  registry.registerFromShape(
    {
      name: 'deckent_recover',
      description: 'Recover a crashed sprint',
      paramsSchema: z.object({}),
      annotations: {},
    },
    { category: 'lifecycle', handlerRef: 'mcp:deckent_recover' },
  );
  return registry;
}

describe('summarizeEagerSchema', () => {
  it('derives name/type/optional for each top-level field', () => {
    const schema = z.object({
      taskId: z.string().optional(),
      all: z.boolean(),
      count: z.number().default(1),
      query: z.string().nullable(),
    });
    const summary = summarizeEagerSchema(schema);
    expect(summary).toEqual(
      expect.arrayContaining([
        { name: 'taskId', type: 'string', optional: true },
        { name: 'all', type: 'boolean', optional: false },
        { name: 'count', type: 'number', optional: true },
        { name: 'query', type: 'string', optional: true },
      ]),
    );
    expect(summary).toHaveLength(4);
  });

  it('returns [] for an empty object schema', () => {
    expect(summarizeEagerSchema(z.object({}))).toEqual([]);
  });

  it('returns [] for a non-object top-level schema', () => {
    expect(summarizeEagerSchema(z.string())).toEqual([]);
  });

  it('labels array/enum/union fields with a simplified type name', () => {
    const schema = z.object({
      tags: z.array(z.string()),
      mode: z.enum(['a', 'b']),
      value: z.union([z.string(), z.number()]),
    });
    const summary = summarizeEagerSchema(schema);
    expect(summary).toEqual(
      expect.arrayContaining([
        { name: 'tags', type: 'array', optional: false },
        { name: 'mode', type: 'enum', optional: false },
        { name: 'value', type: 'union', optional: false },
      ]),
    );
  });

  it('never fabricates a field absent from the real schema', () => {
    const schema = z.object({ onlyField: z.string() });
    const summary = summarizeEagerSchema(schema);
    expect(summary.map((f) => f.name)).toEqual(['onlyField']);
  });
});

describe('buildCoreToolSurface', () => {
  it('produces one {tool, eagerSchema, fullRef} entry per core tool, in coreTools() order', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    const surface = buildCoreToolSurface(index);
    expect(surface.map((e) => e.tool)).toEqual([...CORE_TOOL_NAMES]);
    for (const entry of surface) {
      expect(entry.fullRef).toBe(entry.tool);
      expect(Array.isArray(entry.eagerSchema)).toBe(true);
    }
  });

  it('derives eagerSchema from the real paramsSchema, not a hardcoded copy', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    const surface = buildCoreToolSurface(index);
    const statusEntry = surface.find((e) => e.tool === 'deckent_status')!;
    expect(statusEntry.eagerSchema).toEqual([{ name: 'verbose', type: 'boolean', optional: true }]);

    const killLikeEntry = surface.find((e) => e.tool === 'deckent_memory_query')!;
    expect(killLikeEntry.eagerSchema).toEqual([{ name: 'query', type: 'string', optional: true }]);
  });

  it('is a pure derivation over ToolSearchIndex.coreTools() — silently skips absent core names', () => {
    const registry = new ToolRegistry();
    registry.registerFromShape(
      { name: 'deckent_status', description: 'status', paramsSchema: z.object({}) },
      { category: 'monitoring', handlerRef: 'mcp:deckent_status' },
    );
    const index = new ToolSearchIndex(registry);
    const surface = buildCoreToolSurface(index);
    expect(surface.map((e) => e.tool)).toEqual(['deckent_status']);
  });

  it('the eager-7 names are all real, disk-verified tools', () => {
    const catalogNames = new Set(TOOL_CATALOG.map((t) => t.name));
    const index = new ToolSearchIndex(seedRegistryFromCatalog());
    const surface = buildCoreToolSurface(index);
    for (const entry of surface) {
      expect(catalogNames.has(entry.tool)).toBe(true);
    }
  });

  it('is deterministic: repeated calls return identical output', () => {
    const index = new ToolSearchIndex(seedRegistryFromCatalog());
    expect(buildCoreToolSurface(index)).toEqual(buildCoreToolSurface(index));
  });
});

describe('deferredIndexLine', () => {
  it('lists every non-core tool, alphabetically sorted, in a single line', () => {
    const registry = buildSyntheticRegistry();
    const line = deferredIndexLine(registry.list());
    expect(line).toContain('deckent_kill');
    expect(line).toContain('deckent_recover');
    expect(line.indexOf('deckent_kill')).toBeLessThan(line.indexOf('deckent_recover'));
    // core names must never appear in the deferred line
    for (const coreName of CORE_TOOL_NAMES) {
      expect(line).not.toContain(coreName);
    }
  });

  it('reports the correct deferred count in the prefix', () => {
    const registry = buildSyntheticRegistry();
    const line = deferredIndexLine(registry.list());
    expect(line.startsWith('+2 ')).toBe(true);
  });

  it('returns "" when every tool is in the core set', () => {
    const registry = new ToolRegistry();
    registry.registerFromShape(
      { name: 'deckent_status', description: 'status', paramsSchema: z.object({}) },
      { category: 'monitoring', handlerRef: 'mcp:deckent_status' },
    );
    expect(deferredIndexLine(registry.list())).toBe('');
  });

  it('returns "" for an empty tool list', () => {
    expect(deferredIndexLine([])).toBe('');
  });

  it('is deterministic regardless of input (registration) order', () => {
    const registry = buildSyntheticRegistry();
    const forward = deferredIndexLine(registry.list());
    const reversed = deferredIndexLine([...registry.list()].reverse());
    expect(reversed).toBe(forward);
  });

  it('never fabricates a tool name absent from the input list', () => {
    const registry = seedRegistryFromCatalog();
    const catalogNames = new Set(TOOL_CATALOG.map((t) => t.name));
    const line = deferredIndexLine(registry.list());
    const listedNames = line.replace(/^\+\d+ more tools \(searchTools\/describeTool\): /, '').split(', ');
    for (const name of listedNames) {
      expect(catalogNames.has(name)).toBe(true);
    }
  });
});
