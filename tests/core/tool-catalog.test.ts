import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { toolDefinitionFromShape } from '../../src/core/tool-registry.js';
// Fixture-only reference to the real core-7 eager set (TOOL-2) — grounds the
// "builtin core-7" example from the task in a real, already-established
// name, without tool-catalog.ts itself depending on tool-search.ts.
import { CORE_TOOL_NAMES } from '../../src/core/tool-search.js';
import {
  TOOL_TRUST_TIERS,
  ToolTrustTierSchema,
  TOOL_CATALOG_RISK_LEVELS,
  ToolCatalogRiskLevelSchema,
  TOOL_CATALOG_SOURCES,
  ToolCatalogSourceSchema,
  classifyToolTrust,
  ToolCatalogEntrySchema,
  toolCatalogEntryFromDefinition,
  ToolCatalog,
  type ToolCatalogEntry,
} from '../../src/core/tool-catalog.js';

describe('ToolTrustTierSchema — 5-tier zod-enum', () => {
  it('accepts all 5 documented tiers', () => {
    expect(TOOL_TRUST_TIERS).toEqual(['Core', 'Project', 'MCP', 'Enterprise', 'Danger']);
    for (const tier of TOOL_TRUST_TIERS) {
      expect(ToolTrustTierSchema.safeParse(tier).success).toBe(true);
    }
  });

  it('rejects a value outside the 5-tier set', () => {
    expect(ToolTrustTierSchema.safeParse('Superuser').success).toBe(false);
    expect(ToolTrustTierSchema.safeParse('core').success).toBe(false); // case-sensitive
  });
});

describe('ToolCatalogRiskLevelSchema — extends tool-registry risk with critical', () => {
  it('accepts the base 3 tool-registry levels plus critical', () => {
    expect(TOOL_CATALOG_RISK_LEVELS).toEqual(['safe', 'moderate', 'destructive', 'critical']);
    for (const level of TOOL_CATALOG_RISK_LEVELS) {
      expect(ToolCatalogRiskLevelSchema.safeParse(level).success).toBe(true);
    }
  });

  it('rejects an unknown risk level', () => {
    expect(ToolCatalogRiskLevelSchema.safeParse('catastrophic').success).toBe(false);
  });
});

describe('ToolCatalogSourceSchema', () => {
  it('accepts all 4 documented sources', () => {
    expect(TOOL_CATALOG_SOURCES).toEqual(['builtin', 'project', 'mcp', 'enterprise']);
    for (const source of TOOL_CATALOG_SOURCES) {
      expect(ToolCatalogSourceSchema.safeParse(source).success).toBe(true);
    }
  });

  it('rejects an unknown source', () => {
    expect(ToolCatalogSourceSchema.safeParse('third-party').success).toBe(false);
  });
});

describe('classifyToolTrust — deterministic source+risk -> tier', () => {
  it('classifies a builtin core-7 tool as Core', () => {
    // CORE_TOOL_NAMES[0] is a real deckent_* builtin name (TOOL-2 eager set) —
    // used here purely as a realistic fixture id, not a functional dependency.
    expect(CORE_TOOL_NAMES.length).toBeGreaterThan(0);
    expect(classifyToolTrust({ source: 'builtin', riskLevel: 'safe' })).toBe('Core');
    expect(classifyToolTrust({ source: 'builtin', riskLevel: 'moderate' })).toBe('Core');
  });

  it('classifies a project-defined tool as Project', () => {
    expect(classifyToolTrust({ source: 'project', riskLevel: 'moderate' })).toBe('Project');
  });

  it('classifies an MCP-seeded tool as MCP', () => {
    expect(classifyToolTrust({ source: 'mcp', riskLevel: 'destructive' })).toBe('MCP');
  });

  it('classifies an enterprise-seeded tool as Enterprise', () => {
    expect(classifyToolTrust({ source: 'enterprise', riskLevel: 'moderate' })).toBe('Enterprise');
  });

  it('clamps to Danger whenever riskLevel is critical, regardless of source', () => {
    for (const source of TOOL_CATALOG_SOURCES) {
      expect(classifyToolTrust({ source, riskLevel: 'critical' })).toBe('Danger');
    }
  });

  it('clamp overrides what would otherwise be the most-trusted tier (builtin)', () => {
    expect(classifyToolTrust({ source: 'builtin', riskLevel: 'critical' })).toBe('Danger');
  });

  it('is a pure function: identical input always yields identical output', () => {
    const input = { source: 'mcp' as const, riskLevel: 'destructive' as const };
    const results = new Set(Array.from({ length: 5 }, () => classifyToolTrust(input)));
    expect(results.size).toBe(1);
  });
});

describe('toolCatalogEntryFromDefinition — bridges a real ToolDefinition into the catalog', () => {
  it('derives id from def.name and trustTier via classifyToolTrust (never passed in directly)', () => {
    const def = toolDefinitionFromShape(
      {
        name: CORE_TOOL_NAMES[0],
        description: 'a real core tool used as a bridge fixture',
        paramsSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      { category: 'monitoring', handlerRef: `mcp:${CORE_TOOL_NAMES[0]}` },
    );

    const entry = toolCatalogEntryFromDefinition(def, {
      source: 'builtin',
      labelKey: 'toolCatalog.core-tool.label',
      scopes: ['core'],
    });

    expect(entry.id).toBe(def.name);
    expect(entry.riskLevel).toBe(def.risk); // 'safe' — carried over, not re-derived
    expect(entry.trustTier).toBe('Core');
    expect(entry.source).toBe('builtin');
    expect(entry.scopes).toEqual(['core']);
  });

  it('lets riskLevel be overridden to critical, which clamps trustTier to Danger', () => {
    const def = toolDefinitionFromShape(
      {
        name: 'deckent_kill',
        description: 'stop one or all running workers',
        paramsSchema: z.object({}),
        annotations: { destructiveHint: true },
      },
      { category: 'lifecycle', handlerRef: 'mcp:deckent_kill' },
    );

    const entry = toolCatalogEntryFromDefinition(def, {
      source: 'builtin',
      labelKey: 'toolCatalog.deckent_kill.label',
      scopes: ['agents'],
      riskLevel: 'critical',
    });

    expect(entry.riskLevel).toBe('critical');
    expect(entry.trustTier).toBe('Danger');
  });
});

describe('ToolCatalogEntrySchema — JSON round-trip', () => {
  it('parses its own serialized output back to an equal value', () => {
    const entry: ToolCatalogEntry = {
      id: 'deckent_status',
      labelKey: 'toolCatalog.deckent_status.label',
      trustTier: 'Core',
      riskLevel: 'safe',
      source: 'builtin',
      scopes: ['orchestra', 'monitoring'],
    };

    const roundTripped = ToolCatalogEntrySchema.parse(JSON.parse(JSON.stringify(entry)));
    expect(roundTripped).toEqual(entry);
  });

  it('rejects a malformed record (wrong trustTier)', () => {
    const malformed = {
      id: 'x',
      labelKey: 'x.label',
      trustTier: 'SuperAdmin',
      riskLevel: 'safe',
      source: 'builtin',
      scopes: [],
    };
    expect(ToolCatalogEntrySchema.safeParse(malformed).success).toBe(false);
  });
});

describe('ToolCatalog — queryable collection', () => {
  function makeEntry(overrides: Partial<ToolCatalogEntry> = {}): ToolCatalogEntry {
    return {
      id: 'tool-a',
      labelKey: 'toolCatalog.tool-a.label',
      trustTier: 'Core',
      riskLevel: 'safe',
      source: 'builtin',
      scopes: [],
      ...overrides,
    };
  }

  it('register/get/has/list/size behave as an upserting map', () => {
    const catalog = new ToolCatalog();
    expect(catalog.size).toBe(0);

    catalog.register(makeEntry());
    expect(catalog.size).toBe(1);
    expect(catalog.has('tool-a')).toBe(true);
    expect(catalog.get('tool-a')?.trustTier).toBe('Core');

    catalog.register(makeEntry({ trustTier: 'Danger', riskLevel: 'critical' }));
    expect(catalog.size).toBe(1); // upsert, not append
    expect(catalog.get('tool-a')?.trustTier).toBe('Danger');
    expect(catalog.list()).toHaveLength(1);
  });

  it('byTrustTier and bySource filter correctly', () => {
    const catalog = new ToolCatalog();
    catalog.register(makeEntry({ id: 'a', source: 'builtin', trustTier: 'Core' }));
    catalog.register(makeEntry({ id: 'b', source: 'mcp', trustTier: 'MCP' }));
    catalog.register(makeEntry({ id: 'c', source: 'project', trustTier: 'Project', riskLevel: 'critical' }));

    expect(catalog.byTrustTier('Core').map((e) => e.id)).toEqual(['a']);
    expect(catalog.bySource('mcp').map((e) => e.id)).toEqual(['b']);
    expect(catalog.list()).toHaveLength(3);
  });

  it('returns undefined/false for an unknown id without throwing', () => {
    const catalog = new ToolCatalog();
    expect(catalog.get('does_not_exist')).toBeUndefined();
    expect(catalog.has('does_not_exist')).toBe(false);
  });

  it('exposes no call/dispatch/execute/invoke method — pure catalog, no execution', () => {
    const catalog = new ToolCatalog() as unknown as Record<string, unknown>;
    expect(catalog.call).toBeUndefined();
    expect(catalog.dispatch).toBeUndefined();
    expect(catalog.execute).toBeUndefined();
    expect(catalog.invoke).toBeUndefined();
  });
});
