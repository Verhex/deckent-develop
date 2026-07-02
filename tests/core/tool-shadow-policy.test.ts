import { describe, it, expect } from 'vitest';
import {
  TOOL_SHADOW_SOURCES,
  ToolShadowSourceSchema,
  DEFAULT_TOOL_SHADOW_PRIORITY,
  ToolShadowPolicyConfigSchema,
  type ToolShadowPolicyConfig,
  resolveShadowPriority,
  resolveToolShadowing,
  type ToolShadowCandidate,
} from '../../src/core/tool-shadow-policy.js';

describe('ToolShadowSourceSchema', () => {
  it('accepts all 3 documented sources', () => {
    expect(TOOL_SHADOW_SOURCES).toEqual(['builtin', 'project', 'mcp']);
    for (const source of TOOL_SHADOW_SOURCES) {
      expect(ToolShadowSourceSchema.safeParse(source).success).toBe(true);
    }
  });

  it('rejects an unknown source', () => {
    expect(ToolShadowSourceSchema.safeParse('enterprise').success).toBe(false);
    expect(ToolShadowSourceSchema.safeParse('third-party').success).toBe(false);
  });
});

describe('resolveShadowPriority — default-off + config override', () => {
  it('defaults to builtin > project > mcp when no config is given', () => {
    const resolution = resolveShadowPriority();
    expect(resolution.priority).toEqual(['builtin', 'project', 'mcp']);
    expect(resolution.priority).toEqual(DEFAULT_TOOL_SHADOW_PRIORITY);
    expect(resolution.usedDefault).toBe(true);
    expect(resolution.errors).toBeUndefined();
  });

  it('defaults when config.priority is omitted', () => {
    const resolution = resolveShadowPriority({});
    expect(resolution.priority).toEqual(DEFAULT_TOOL_SHADOW_PRIORITY);
    expect(resolution.usedDefault).toBe(true);
  });

  it('applies a valid override, flipping the effective order', () => {
    const config: ToolShadowPolicyConfig = { priority: ['mcp', 'project', 'builtin'] };
    const resolution = resolveShadowPriority(config);
    expect(resolution.priority).toEqual(['mcp', 'project', 'builtin']);
    expect(resolution.usedDefault).toBe(false);
    expect(resolution.errors).toBeUndefined();
  });

  it('falls back to default + records an error for a duplicate-source override', () => {
    const resolution = resolveShadowPriority({ priority: ['builtin', 'builtin', 'mcp'] as ToolShadowPolicyConfig['priority'] });
    expect(resolution.priority).toEqual(DEFAULT_TOOL_SHADOW_PRIORITY);
    expect(resolution.usedDefault).toBe(true);
    expect(resolution.errors?.[0]).toMatch(/permutation/);
  });

  it('falls back to default + records an error for a short (missing-source) override', () => {
    const resolution = resolveShadowPriority({ priority: ['builtin', 'mcp'] });
    expect(resolution.priority).toEqual(DEFAULT_TOOL_SHADOW_PRIORITY);
    expect(resolution.usedDefault).toBe(true);
    expect(resolution.errors).toHaveLength(1);
  });

  it('never throws on a malformed override — fail-honest fallback', () => {
    expect(() => resolveShadowPriority({ priority: [] })).not.toThrow();
  });
});

describe('ToolShadowPolicyConfigSchema — JSON round-trip', () => {
  it('parses its own serialized output back to an equal value', () => {
    const config: ToolShadowPolicyConfig = { priority: ['project', 'mcp', 'builtin'] };
    const roundTripped = ToolShadowPolicyConfigSchema.parse(JSON.parse(JSON.stringify(config)));
    expect(roundTripped).toEqual(config);
  });

  it('round-trips an empty config (priority omitted) identically', () => {
    const config: ToolShadowPolicyConfig = {};
    const roundTripped = ToolShadowPolicyConfigSchema.parse(JSON.parse(JSON.stringify(config)));
    expect(roundTripped).toEqual(config);
  });

  it('resolveShadowPriority is unaffected by round-tripping the config', () => {
    const config: ToolShadowPolicyConfig = { priority: ['mcp', 'builtin', 'project'] };
    const before = resolveShadowPriority(config);
    const roundTripped = ToolShadowPolicyConfigSchema.parse(JSON.parse(JSON.stringify(config)));
    const after = resolveShadowPriority(roundTripped);
    expect(after).toEqual(before);
  });

  it('rejects a malformed record (unknown source in priority)', () => {
    const malformed = { priority: ['builtin', 'enterprise', 'mcp'] };
    expect(ToolShadowPolicyConfigSchema.safeParse(malformed).success).toBe(false);
  });
});

describe('resolveToolShadowing — 3-source conflict fixture', () => {
  function makeCandidates(): ToolShadowCandidate<{ marker: string }>[] {
    return [
      { name: 'deckent_status', source: 'mcp', definition: { marker: 'from-mcp' } },
      { name: 'deckent_status', source: 'builtin', definition: { marker: 'from-builtin' } },
      { name: 'deckent_status', source: 'project', definition: { marker: 'from-project' } },
    ];
  }

  it('picks builtin as the deterministic default winner, shadows the other two', () => {
    const resolution = resolveToolShadowing(makeCandidates());

    expect(resolution.selected).toHaveLength(1);
    expect(resolution.selected[0]?.source).toBe('builtin');
    expect(resolution.selected[0]?.definition).toEqual({ marker: 'from-builtin' });

    expect(resolution.auditLog).toHaveLength(2);
    const shadowedSources = resolution.auditLog.map((e) => e.shadowedSource).sort();
    expect(shadowedSources).toEqual(['mcp', 'project']);
    for (const entry of resolution.auditLog) {
      expect(entry.name).toBe('deckent_status');
      expect(entry.selectedSource).toBe('builtin');
      // shadowed definitions are retained (never deleted), not selected.
      expect(entry.shadowedDefinition).toBeDefined();
    }
  });

  it('is deterministic regardless of input candidate order', () => {
    const shuffled = [...makeCandidates()].reverse();
    const resolution = resolveToolShadowing(shuffled);
    expect(resolution.selected[0]?.source).toBe('builtin');
    expect(resolution.auditLog).toHaveLength(2);
  });

  it('honors a config override, flipping the winner to mcp', () => {
    const resolution = resolveToolShadowing(makeCandidates(), { priority: ['mcp', 'project', 'builtin'] });

    expect(resolution.selected).toHaveLength(1);
    expect(resolution.selected[0]?.source).toBe('mcp');
    expect(resolution.selected[0]?.definition).toEqual({ marker: 'from-mcp' });

    const shadowedSources = resolution.auditLog.map((e) => e.shadowedSource).sort();
    expect(shadowedSources).toEqual(['builtin', 'project']);
    expect(resolution.priorityResolution.usedDefault).toBe(false);
  });

  it('falls back to default priority + audits the invalid override in priorityResolution.errors', () => {
    const resolution = resolveToolShadowing(makeCandidates(), { priority: ['mcp', 'mcp', 'builtin'] as ToolShadowPolicyConfig['priority'] });
    expect(resolution.selected[0]?.source).toBe('builtin'); // default order still applied
    expect(resolution.priorityResolution.usedDefault).toBe(true);
    expect(resolution.priorityResolution.errors).toBeDefined();
  });

  it('produces no audit entry and one selected candidate for a non-conflicting name', () => {
    const candidates: ToolShadowCandidate[] = [
      { name: 'deckent_plan', source: 'builtin', definition: { name: 'deckent_plan' } as never },
    ];
    const resolution = resolveToolShadowing(candidates);
    expect(resolution.selected).toHaveLength(1);
    expect(resolution.auditLog).toHaveLength(0);
  });

  it('handles multiple independent conflicting names in one call', () => {
    const candidates: ToolShadowCandidate<{ marker: string }>[] = [
      { name: 'tool-a', source: 'mcp', definition: { marker: 'a-mcp' } },
      { name: 'tool-a', source: 'project', definition: { marker: 'a-project' } },
      { name: 'tool-b', source: 'mcp', definition: { marker: 'b-mcp' } },
      { name: 'tool-b', source: 'builtin', definition: { marker: 'b-builtin' } },
    ];
    const resolution = resolveToolShadowing(candidates);
    expect(resolution.selected).toHaveLength(2);
    expect(resolution.selected.find((c) => c.name === 'tool-a')?.source).toBe('project');
    expect(resolution.selected.find((c) => c.name === 'tool-b')?.source).toBe('builtin');
    expect(resolution.auditLog).toHaveLength(2);
  });

  it('breaks a same-source tie with first-seen order (stable sort)', () => {
    const candidates: ToolShadowCandidate<{ marker: string }>[] = [
      { name: 'dup', source: 'mcp', definition: { marker: 'first' } },
      { name: 'dup', source: 'mcp', definition: { marker: 'second' } },
    ];
    const resolution = resolveToolShadowing(candidates);
    expect(resolution.selected[0]?.definition).toEqual({ marker: 'first' });
    expect(resolution.auditLog[0]?.shadowedDefinition).toEqual({ marker: 'second' });
  });

  it('returns an empty resolution for no candidates', () => {
    const resolution = resolveToolShadowing([]);
    expect(resolution.selected).toEqual([]);
    expect(resolution.auditLog).toEqual([]);
  });
});
