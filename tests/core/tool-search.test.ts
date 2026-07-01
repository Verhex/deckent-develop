import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../src/core/tool-registry.js';
import { ToolSearchIndex, CORE_TOOL_NAMES } from '../../src/core/tool-search.js';
// Disk-verify: seed from the REAL, canonical MCP tool catalog (B-MCPCATALOG-SSOT), same
// pattern as tests/core/tool-registry.test.ts — not a hand-copied duplicate.
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
      paramsSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    { category: 'monitoring', handlerRef: 'mcp:deckent_status' },
  );
  registry.registerFromShape(
    {
      name: 'deckent_status_history',
      description: 'Browse historical dashboard snapshots',
      paramsSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    { category: 'knowledge', handlerRef: 'mcp:deckent_status_history' },
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
  return registry;
}

describe('ToolSearchIndex.searchTools', () => {
  it('ranks an exact name match above a partial name match and a token-only match', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    const hits = index.searchTools('deckent_status');
    expect(hits[0]?.name).toBe('deckent_status');
    expect(hits.map((h) => h.name)).toContain('deckent_status_history');
    // exact hit must strictly outscore the partial hit
    const exact = hits.find((h) => h.name === 'deckent_status')!;
    const partial = hits.find((h) => h.name === 'deckent_status_history')!;
    expect(exact.score).toBeGreaterThan(partial.score);
  });

  it('orders same-tier partial matches by overlap ratio, tightest match first', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    const hits = index.searchTools('status');
    const names = hits.map((h) => h.name);
    expect(names[0]).toBe('deckent_status');
    expect(names[1]).toBe('deckent_status_history');
  });

  it('ranks a name-partial match above a description-token-only match', () => {
    const registry = new ToolRegistry();
    registry.registerFromShape(
      { name: 'deckent_kill', description: 'Stop one or all running workers', paramsSchema: z.object({}) },
      { category: 'lifecycle', handlerRef: 'mcp:deckent_kill' },
    );
    registry.registerFromShape(
      {
        name: 'deckent_recover',
        description: 'Recover a crashed sprint; may need to kill orphan processes',
        paramsSchema: z.object({}),
      },
      { category: 'lifecycle', handlerRef: 'mcp:deckent_recover' },
    );
    const index = new ToolSearchIndex(registry);
    const hits = index.searchTools('kill');
    expect(hits.map((h) => h.name)).toEqual(['deckent_kill', 'deckent_recover']);
  });

  it('finds a tool via description tokens when the query does not match the name', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    const hits = index.searchTools('workers');
    expect(hits.map((h) => h.name)).toContain('deckent_kill');
  });

  it('is deterministic: repeated identical calls return identical order and scores', () => {
    const registry = seedRegistryFromCatalog();
    const index = new ToolSearchIndex(registry);
    const first = index.searchTools('sprint', { limit: 50 });
    const second = index.searchTools('sprint', { limit: 50 });
    expect(second).toEqual(first);
  });

  it('returns [] for an empty or whitespace-only query', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    expect(index.searchTools('')).toEqual([]);
    expect(index.searchTools('   ')).toEqual([]);
  });

  it('returns [] when nothing matches', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    expect(index.searchTools('totally-unrelated-xyz')).toEqual([]);
  });

  it('respects the limit option and defaults to a bounded result set', () => {
    const registry = seedRegistryFromCatalog();
    const index = new ToolSearchIndex(registry);
    const hits = index.searchTools('deckent', { limit: 3 });
    expect(hits.length).toBeLessThanOrEqual(3);
    const unbounded = index.searchTools('deckent', { limit: 1000 });
    expect(unbounded.length).toBeGreaterThan(3);
  });

  it('never fabricates a tool name absent from the registry', () => {
    const registry = seedRegistryFromCatalog();
    const index = new ToolSearchIndex(registry);
    const catalogNames = new Set(TOOL_CATALOG.map((t) => t.name));
    for (const hit of index.searchTools('deckent', { limit: TOOL_CATALOG.length })) {
      expect(catalogNames.has(hit.name)).toBe(true);
    }
  });
});

describe('ToolSearchIndex.describeTool', () => {
  it('returns the full tool definition, including the real paramsSchema instance', () => {
    const registry = buildSyntheticRegistry();
    const index = new ToolSearchIndex(registry);
    const described = index.describeTool('deckent_kill');
    expect(described).toBeDefined();
    expect(described?.name).toBe('deckent_kill');
    expect(described?.risk).toBe('destructive');
    // full schema, not a lossy re-derivation: same object identity as registered
    expect(described?.paramsSchema).toBe(registry.get('deckent_kill')?.paramsSchema);
    expect(described?.paramsSchema.safeParse({ taskId: '123' }).success).toBe(true);
  });

  it('returns undefined for an unknown tool name', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    expect(index.describeTool('does_not_exist')).toBeUndefined();
  });
});

describe('ToolSearchIndex.planCall', () => {
  it('labels a valid call with status "valid" and the tool risk', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    const plan = index.planCall('deckent_kill', { taskId: '123' });
    expect(plan).toEqual({ name: 'deckent_kill', status: 'valid', risk: 'destructive', category: 'lifecycle' });
  });

  it('labels an invalid call with status "invalid", still carrying the risk tag', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    const plan = index.planCall('deckent_kill', { taskId: 42 });
    expect(plan.status).toBe('invalid');
    expect(plan.risk).toBe('destructive');
    expect(plan.errors).toBeDefined();
    expect(plan.errors!.length).toBeGreaterThan(0);
  });

  it('labels an unknown tool with status "unknown_tool" and no risk', () => {
    const index = new ToolSearchIndex(buildSyntheticRegistry());
    const plan = index.planCall('does_not_exist', { anything: true });
    expect(plan).toEqual({ name: 'does_not_exist', status: 'unknown_tool', errors: ['Unknown tool: "does_not_exist"'] });
  });

  it('never executes anything: planning a destructive call has no observable side effect', () => {
    const registry = buildSyntheticRegistry();
    const index = new ToolSearchIndex(registry);
    index.planCall('deckent_kill', { all: true });
    // the registry itself is untouched — planning never mutates or invokes
    expect(registry.size).toBe(3);
    expect(registry.has('deckent_kill')).toBe(true);
  });
});

describe('ToolSearchIndex.coreTools', () => {
  it('returns exactly the eager-7 core set in fixed order', () => {
    expect(CORE_TOOL_NAMES).toHaveLength(7);
    const registry = seedRegistryFromCatalog();
    const index = new ToolSearchIndex(registry);
    const core = index.coreTools();
    expect(core.map((t) => t.name)).toEqual([...CORE_TOOL_NAMES]);
  });

  it('the eager-7 names are all real, disk-verified tools', () => {
    const catalogNames = new Set(TOOL_CATALOG.map((t) => t.name));
    for (const name of CORE_TOOL_NAMES) {
      expect(catalogNames.has(name)).toBe(true);
    }
  });

  it('silently skips a core name absent from a partially-seeded registry', () => {
    const registry = new ToolRegistry();
    registry.registerFromShape(
      { name: 'deckent_status', description: 'status', paramsSchema: z.object({}) },
      { category: 'monitoring', handlerRef: 'mcp:deckent_status' },
    );
    const index = new ToolSearchIndex(registry);
    expect(index.coreTools().map((t) => t.name)).toEqual(['deckent_status']);
  });
});

describe('ToolSearchIndex is a pure catalog bridge — no dispatch capability', () => {
  it('exposes no call/dispatch/execute/invoke method', () => {
    const index = new ToolSearchIndex(new ToolRegistry()) as unknown as Record<string, unknown>;
    expect(index.call).toBeUndefined();
    expect(index.dispatch).toBeUndefined();
    expect(index.execute).toBeUndefined();
    expect(index.invoke).toBeUndefined();
  });
});
