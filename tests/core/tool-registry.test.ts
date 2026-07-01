import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ToolRegistry,
  toolDefinitionFromShape,
  deriveRiskFromAnnotations,
  TOOL_CATEGORIES,
  TOOL_RISK_LEVELS,
} from '../../src/core/tool-registry.js';
// Disk-verify: the REAL, canonical MCP tool catalog (B-MCPCATALOG-SSOT) — not a
// hand-copied duplicate. TOOL_CATALOG only carries name/description/readOnly,
// so seeding uses a generic passthrough schema; production seeding with each
// tool's real zod schema is TOOL-2+/cutover work (mcp/tools/index.ts is not in
// this task's write scope).
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

describe('ToolRegistry seeded from the disk-verified MCP catalog', () => {
  const registry = seedRegistryFromCatalog();
  const catalogNames = new Set(TOOL_CATALOG.map((t) => t.name));

  it('contains exactly the tools present in TOOL_CATALOG', () => {
    expect(registry.size).toBe(TOOL_CATALOG.length);
    for (const def of registry.list()) {
      expect(catalogNames.has(def.name)).toBe(true);
    }
  });

  it('contains the known real tool names used as TOOL-2 core-set candidates', () => {
    const coreCandidates = [
      'deckent_status',
      'deckent_config',
      'deckent_plan',
      'deckent_run',
      'deckent_start',
      'deckent_review',
      'deckent_help',
      'deckent_memory_query',
    ];
    for (const name of coreCandidates) {
      expect(catalogNames.has(name)).toBe(true); // sanity: still real on disk
      expect(registry.has(name)).toBe(true);
      expect(registry.get(name)?.description).toBe(
        TOOL_CATALOG.find((t) => t.name === name)!.description,
      );
    }
  });

  it('never fabricates a tool name absent from the real catalog', () => {
    expect(registry.has('deckent_totally_made_up_tool')).toBe(false);
  });
});

describe('ToolRegistry.validateParams', () => {
  it('validates well-formed params against the registered schema', () => {
    const registry = new ToolRegistry();
    registry.registerFromShape(
      {
        name: 'test_tool',
        description: 'a synthetic tool for registry-mechanism tests',
        paramsSchema: z.object({ taskId: z.string(), all: z.boolean().optional() }),
        annotations: { destructiveHint: true },
      },
      { category: 'lifecycle', handlerRef: 'test:test_tool' },
    );

    expect(registry.validateParams('test_tool', { taskId: '123' })).toEqual({ valid: true });
    expect(registry.validateParams('test_tool', { taskId: '123', all: true })).toEqual({ valid: true });
  });

  it('rejects params with a wrong type', () => {
    const registry = new ToolRegistry();
    registry.registerFromShape(
      {
        name: 'test_tool',
        description: 'a synthetic tool for registry-mechanism tests',
        paramsSchema: z.object({ taskId: z.string() }),
      },
      { category: 'lifecycle', handlerRef: 'test:test_tool' },
    );

    const result = registry.validateParams('test_tool', { taskId: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('rejects params missing a required field', () => {
    const registry = new ToolRegistry();
    registry.registerFromShape(
      {
        name: 'test_tool',
        description: 'a synthetic tool for registry-mechanism tests',
        paramsSchema: z.object({ taskId: z.string() }),
      },
      { category: 'lifecycle', handlerRef: 'test:test_tool' },
    );

    expect(registry.validateParams('test_tool', {}).valid).toBe(false);
  });

  it('returns an error for an unknown tool name without throwing', () => {
    const registry = new ToolRegistry();
    const result = registry.validateParams('does_not_exist', { anything: true });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Unknown tool: "does_not_exist"']);
  });
});

describe('ToolRegistry risk derivation', () => {
  it('derives destructive from destructiveHint', () => {
    expect(deriveRiskFromAnnotations({ destructiveHint: true })).toBe('destructive');
  });

  it('derives safe from readOnlyHint', () => {
    expect(deriveRiskFromAnnotations({ readOnlyHint: true })).toBe('safe');
  });

  it('defaults to moderate when annotations are absent or empty', () => {
    expect(deriveRiskFromAnnotations()).toBe('moderate');
    expect(deriveRiskFromAnnotations({})).toBe('moderate');
  });

  it('prefers destructiveHint over readOnlyHint when both are set', () => {
    expect(deriveRiskFromAnnotations({ readOnlyHint: true, destructiveHint: true })).toBe('destructive');
  });

  it('is exposed on the ToolDefinition produced by toolDefinitionFromShape', () => {
    const def = toolDefinitionFromShape(
      {
        name: 'deckent_kill',
        description: 'Stop one or all running workers',
        paramsSchema: z.object({}),
        annotations: { destructiveHint: true },
      },
      { category: 'lifecycle', handlerRef: 'mcp:deckent_kill' },
    );
    expect(def.risk).toBe('destructive');
    expect(TOOL_RISK_LEVELS).toContain(def.risk);
    expect(TOOL_CATEGORIES).toContain(def.category);
  });
});

describe('ToolRegistry is a pure catalog — no dispatch capability', () => {
  it('never invokes anything: handlerRef is a plain string, never a callable', () => {
    const registry = seedRegistryFromCatalog();
    for (const def of registry.list()) {
      expect(typeof def.handlerRef).toBe('string');
    }
  });

  it('exposes no call/dispatch/execute/invoke method', () => {
    const registry = new ToolRegistry() as unknown as Record<string, unknown>;
    expect(registry.call).toBeUndefined();
    expect(registry.dispatch).toBeUndefined();
    expect(registry.execute).toBeUndefined();
    expect(registry.invoke).toBeUndefined();
  });

  it('register upserts rather than throwing on a duplicate name', () => {
    const registry = new ToolRegistry();
    registry.registerFromShape(
      { name: 'dup', description: 'v1', paramsSchema: z.object({}) },
      { category: 'config', handlerRef: 'test:dup' },
    );
    registry.registerFromShape(
      { name: 'dup', description: 'v2', paramsSchema: z.object({}) },
      { category: 'config', handlerRef: 'test:dup' },
    );
    expect(registry.size).toBe(1);
    expect(registry.get('dup')?.description).toBe('v2');
  });
});
