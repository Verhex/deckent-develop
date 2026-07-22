import { describe, it, expect } from 'vitest';
import {
  parsePatterns,
  deduplicatePatterns,
  suggestModelFromPatterns,
  resolveTaskModel,
} from '../../src/orchestra/model-selector.js';
import type { PatternEntry, TaskScope, ResolvedConfig } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeScope(dirs: string[], filesWrite: string[] = []): TaskScope {
  return { directories: dirs, filesRead: [], filesWrite };
}

function makePattern(pattern: string, occurrences: number, resolved = false): PatternEntry {
  return {
    pattern,
    occurrences,
    firstDetectedInSprint: 'sprint-001',
    lastDetectedInSprint: 'sprint-005',
    resolved,
  };
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: false,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    ...overrides,
  };
}

// ─── parsePatterns ──────────────────────────────────────────────────

describe('parsePatterns', () => {
  it('parses valid JSON array of patterns', () => {
    const patterns: PatternEntry[] = [makePattern('file_outside_scope', 5)];
    const result = parsePatterns(JSON.stringify(patterns));
    expect(result).toHaveLength(1);
    expect(result[0]?.pattern).toBe('file_outside_scope');
    expect(result[0]?.occurrences).toBe(5);
  });

  it('returns empty array for empty string', () => {
    expect(parsePatterns('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parsePatterns('   ')).toEqual([]);
  });

  it('returns empty array for malformed JSON', () => {
    expect(parsePatterns('{ not valid json')).toEqual([]);
  });

  it('returns empty array when JSON is not an array', () => {
    expect(parsePatterns('{"pattern": "test"}')).toEqual([]);
  });

  it('parses multiple pattern entries', () => {
    const patterns: PatternEntry[] = [
      makePattern('stale_heartbeat', 10),
      makePattern('circular_dependency', 2),
    ];
    const result = parsePatterns(JSON.stringify(patterns));
    expect(result).toHaveLength(2);
    expect(result.map(p => p.pattern)).toContain('stale_heartbeat');
    expect(result.map(p => p.pattern)).toContain('circular_dependency');
  });
});

// ─── deduplicatePatterns ────────────────────────────────────────────

describe('deduplicatePatterns', () => {
  it('removes duplicate pattern entries, keeping highest occurrences', () => {
    const patterns: PatternEntry[] = [
      makePattern('stale_heartbeat', 5),
      makePattern('stale_heartbeat', 10),
    ];
    const result = deduplicatePatterns(patterns);
    expect(result).toHaveLength(1);
    expect(result[0]?.occurrences).toBe(10);
  });

  it('preserves unique patterns', () => {
    const patterns: PatternEntry[] = [
      makePattern('stale_heartbeat', 5),
      makePattern('circular_dependency', 3),
    ];
    const result = deduplicatePatterns(patterns);
    expect(result).toHaveLength(2);
  });

  it('handles empty array', () => {
    expect(deduplicatePatterns([])).toEqual([]);
  });

  it('keeps single entry unchanged', () => {
    const patterns: PatternEntry[] = [makePattern('file_outside_scope', 7)];
    const result = deduplicatePatterns(patterns);
    expect(result).toHaveLength(1);
    expect(result[0]?.pattern).toBe('file_outside_scope');
  });

  it('deduplicates three entries with same pattern', () => {
    const patterns: PatternEntry[] = [
      makePattern('stale_heartbeat', 3),
      makePattern('stale_heartbeat', 15),
      makePattern('stale_heartbeat', 7),
    ];
    const result = deduplicatePatterns(patterns);
    expect(result).toHaveLength(1);
    expect(result[0]?.occurrences).toBe(15);
  });
});

// ─── suggestModelFromPatterns ───────────────────────────────────────

describe('suggestModelFromPatterns', () => {
  it('returns the canonical premium model for file_outside_scope with occurrences >= 2 in src/ scope', () => {
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 2)];
    expect(suggestModelFromPatterns(scope, patterns)).toBe('claude-opus-4-8');
  });

  it('returns null for file_outside_scope with only 1 occurrence', () => {
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 1)];
    expect(suggestModelFromPatterns(scope, patterns)).toBeNull();
  });

  it('returns the canonical premium model for circular_dependency with occurrences >= 1 in src/ scope', () => {
    const scope = makeScope(['src/orchestra/']);
    const patterns = [makePattern('circular_dependency', 1)];
    expect(suggestModelFromPatterns(scope, patterns)).toBe('claude-opus-4-8');
  });

  it('returns null for docs/ scope even with boundary violations', () => {
    const scope = makeScope(['docs/']);
    const patterns = [makePattern('file_outside_scope', 5)];
    expect(suggestModelFromPatterns(scope, patterns)).toBeNull();
  });

  it('returns null for empty patterns array', () => {
    const scope = makeScope(['src/core/']);
    expect(suggestModelFromPatterns(scope, [])).toBeNull();
  });

  it('returns null when all patterns are resolved', () => {
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 10, true /* resolved */)];
    expect(suggestModelFromPatterns(scope, patterns)).toBeNull();
  });

  it('returns null for stale_heartbeat patterns (not a model upgrade trigger)', () => {
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('stale_heartbeat', 100)];
    expect(suggestModelFromPatterns(scope, patterns)).toBeNull();
  });

  it('returns the canonical premium model for tests/ scope with circular_dependency', () => {
    const scope = makeScope(['tests/orchestra/']);
    const patterns = [makePattern('circular_dependency', 2)];
    expect(suggestModelFromPatterns(scope, patterns)).toBe('claude-opus-4-8');
  });
});

// ─── resolveTaskModel with patterns ────────────────────────────────

describe('resolveTaskModel with patterns', () => {
  it('upgrades the canonical standard model to the canonical premium model when patterns indicate boundary violations', () => {
    const config = makeConfig();
    // Single dir → -1 → economy → but haiku_allowed=false → standard normally
    // With boundary violation patterns → upgraded to premium
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 3)];
    const result = resolveTaskModel('Add utility', 'Simple utility function', scope, config, patterns);
    expect(result).toBe('claude-opus-4-8');
  });

  it('does not upgrade when no patterns provided', () => {
    const config = makeConfig();
    const scope = makeScope(['src/core/']);
    // Single dir → -1 → economy → haiku_allowed=false → standard (no patterns)
    const result = resolveTaskModel('Add utility', 'Simple utility function', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });

  it('pattern upgrade is still capped by pro_plan constraint', () => {
    const config = makeConfig({ mode: 'pro_plan' });
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 5)];
    // Patterns suggest premium, but pro_plan caps at standard
    const result = resolveTaskModel('Task in src/', 'Source task', scope, config, patterns);
    expect(result).toBe('claude-sonnet-5');
  });

  it('empty patterns array has no effect on model selection', () => {
    const config = makeConfig();
    const scope = makeScope(['src/core/']);
    const withPatterns = resolveTaskModel('Add util', 'Simple', scope, config, []);
    const withoutPatterns = resolveTaskModel('Add util', 'Simple', scope, config);
    expect(withPatterns).toBe(withoutPatterns);
  });

  it('resolved patterns do not trigger model upgrade', () => {
    const config = makeConfig();
    const scope = makeScope(['src/orchestra/']);
    const patterns = [makePattern('file_outside_scope', 10, true)];
    const result = resolveTaskModel('Refactor orchestra', 'Orchestra refactor', scope, config, patterns);
    expect(result).not.toBe('claude-opus-4-8');
  });

  it('multiple mixed patterns — only unresolved boundary violations count', () => {
    const config = makeConfig();
    const scope = makeScope(['src/core/']);
    const patterns: PatternEntry[] = [
      makePattern('file_outside_scope', 5, true),  // resolved — no effect
      makePattern('stale_heartbeat', 100, false),   // not a trigger — no effect
    ];
    const result = resolveTaskModel('Add util', 'Simple', scope, config, patterns);
    expect(result).toBe('claude-sonnet-5');
  });
});

// ─── parsePatterns + deduplicatePatterns pipeline ──────────────────

describe('parsePatterns + deduplicatePatterns pipeline', () => {
  it('pipeline: raw JSON string → parsed → deduplicated', () => {
    const raw: PatternEntry[] = [
      makePattern('file_outside_scope', 3),
      makePattern('file_outside_scope', 7),
      makePattern('stale_heartbeat', 2),
    ];
    const parsed = parsePatterns(JSON.stringify(raw));
    const deduped = deduplicatePatterns(parsed);
    expect(deduped).toHaveLength(2);
    const fos = deduped.find(p => p.pattern === 'file_outside_scope');
    expect(fos?.occurrences).toBe(7);
  });

  it('pipeline: empty string → no patterns → no model upgrade', () => {
    const parsed = parsePatterns('');
    const deduped = deduplicatePatterns(parsed);
    expect(deduped).toHaveLength(0);
    const scope = makeScope(['src/core/']);
    const config = makeConfig();
    const result = resolveTaskModel('Add util', 'Simple', scope, config, deduped);
    expect(result).toBe('claude-sonnet-5');
  });

  it('pipeline: JSON with duplicates triggers model upgrade after deduplication', () => {
    const raw: PatternEntry[] = [
      makePattern('file_outside_scope', 1),
      makePattern('file_outside_scope', 3),
    ];
    const deduped = deduplicatePatterns(parsePatterns(JSON.stringify(raw)));
    expect(deduped[0]?.occurrences).toBe(3);
    const scope = makeScope(['src/orchestra/']);
    const config = makeConfig();
    const result = resolveTaskModel('Refactor module', 'Complex refactor', scope, config, deduped);
    expect(result).toBe('claude-opus-4-8');
  });

  it('pipeline: malformed JSON → empty array → no upgrade', () => {
    const parsed = parsePatterns('{broken json');
    const deduped = deduplicatePatterns(parsed);
    expect(deduped).toHaveLength(0);
    const suggestion = suggestModelFromPatterns(makeScope(['src/core/']), deduped);
    expect(suggestion).toBeNull();
  });

  it('pipeline: non-array JSON → empty array', () => {
    const parsed = parsePatterns('{"pattern": "file_outside_scope", "occurrences": 5}');
    expect(deduplicatePatterns(parsed)).toHaveLength(0);
  });

  it('deduplicatePatterns preserves resolved flag of highest-occurrence entry', () => {
    const patterns: PatternEntry[] = [
      makePattern('circular_dependency', 5, true),
      makePattern('circular_dependency', 2, false),
    ];
    const result = deduplicatePatterns(patterns);
    expect(result).toHaveLength(1);
    expect(result[0]?.occurrences).toBe(5);
    expect(result[0]?.resolved).toBe(true);
  });
});

// ─── suggestModelFromPatterns edge cases ───────────────────────────

describe('suggestModelFromPatterns — additional edge cases', () => {
  it('returns null for empty scope directories', () => {
    const scope = makeScope([]);
    const patterns = [makePattern('file_outside_scope', 5)];
    expect(suggestModelFromPatterns(scope, patterns)).toBeNull();
  });

  it('returns the canonical premium model for bare "src" directory (without trailing slash)', () => {
    const scope = makeScope(['src']);
    const patterns = [makePattern('circular_dependency', 1)];
    expect(suggestModelFromPatterns(scope, patterns)).toBe('claude-opus-4-8');
  });

  it('returns the canonical premium model for bare "tests" directory', () => {
    const scope = makeScope(['tests']);
    const patterns = [makePattern('file_outside_scope', 3)];
    expect(suggestModelFromPatterns(scope, patterns)).toBe('claude-opus-4-8');
  });

  it('mixed scope: one src dir triggers upgrade even with other non-src dirs', () => {
    const scope = makeScope(['docs/', 'src/core/']);
    const patterns = [makePattern('file_outside_scope', 2)];
    expect(suggestModelFromPatterns(scope, patterns)).toBe('claude-opus-4-8');
  });

  it('file_outside_scope with exactly 1 occurrence does not trigger upgrade', () => {
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 1)];
    expect(suggestModelFromPatterns(scope, patterns)).toBeNull();
  });

  it('returns null when all patterns have zero occurrences', () => {
    const scope = makeScope(['src/core/']);
    const patterns: PatternEntry[] = [
      { pattern: 'file_outside_scope', occurrences: 0, firstDetectedInSprint: 'sprint-001', lastDetectedInSprint: 'sprint-001', resolved: false },
    ];
    expect(suggestModelFromPatterns(scope, patterns)).toBeNull();
  });
});
