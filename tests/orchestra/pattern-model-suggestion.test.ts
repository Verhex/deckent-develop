import { describe, it, expect } from 'vitest';
import {
  parsePatterns,
  deduplicatePatterns,
  suggestModelFromPatterns,
  resolveTaskModel,
} from '../../src/orchestra/model-selector.js';
import type { PatternEntry, TaskScope, ResolvedConfig, UsageMetrics } from '../../src/core/types.js';

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
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
      usage_thresholds: { '5hr': 0.8, weekly: 0.9 },
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    ...overrides,
  };
}

function makeUsage(overrides: Partial<UsageMetrics> = {}): UsageMetrics {
  return { fiveHourPercent: 10, weeklyPercent: 10, measuredAt: '2026-03-20T00:00:00.000Z', ...overrides };
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
  it('returns opus for file_outside_scope with occurrences >= 2 in src/ scope', () => {
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 2)];
    expect(suggestModelFromPatterns(scope, patterns)).toBe('opus');
  });

  it('returns null for file_outside_scope with only 1 occurrence', () => {
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 1)];
    expect(suggestModelFromPatterns(scope, patterns)).toBeNull();
  });

  it('returns opus for circular_dependency with occurrences >= 1 in src/ scope', () => {
    const scope = makeScope(['src/orchestra/']);
    const patterns = [makePattern('circular_dependency', 1)];
    expect(suggestModelFromPatterns(scope, patterns)).toBe('opus');
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

  it('returns opus for tests/ scope with circular_dependency', () => {
    const scope = makeScope(['tests/orchestra/']);
    const patterns = [makePattern('circular_dependency', 2)];
    expect(suggestModelFromPatterns(scope, patterns)).toBe('opus');
  });
});

// ─── resolveTaskModel with patterns ────────────────────────────────

describe('resolveTaskModel with patterns', () => {
  it('upgrades sonnet to opus when patterns indicate boundary violations', () => {
    const config = makeConfig();
    const usage = makeUsage();
    // Single dir → -1 → haiku → but haiku_allowed=false → sonnet normally
    // With boundary violation patterns → upgraded to opus
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 3)];
    const result = resolveTaskModel('Add utility', 'Simple utility function', scope, config, usage, patterns);
    expect(result).toBe('opus');
  });

  it('does not upgrade when no patterns provided', () => {
    const config = makeConfig();
    const usage = makeUsage();
    const scope = makeScope(['src/core/']);
    // Single dir → -1 → haiku → haiku_allowed=false → sonnet (no patterns)
    const result = resolveTaskModel('Add utility', 'Simple utility function', scope, config, usage);
    expect(result).toBe('sonnet');
  });

  it('pattern upgrade is still capped by pro_plan constraint', () => {
    const config = makeConfig({ mode: 'pro_plan' });
    const usage = makeUsage();
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 5)];
    // Patterns suggest opus, but pro_plan caps at sonnet
    const result = resolveTaskModel('Task in src/', 'Source task', scope, config, usage, patterns);
    expect(result).toBe('sonnet');
  });

  it('pattern upgrade is capped by usage pressure', () => {
    const config = makeConfig();
    const usage = makeUsage({ fiveHourPercent: 90 });
    const scope = makeScope(['src/core/']);
    const patterns = [makePattern('file_outside_scope', 5)];
    // Patterns suggest opus, but high usage downgrades to sonnet
    const result = resolveTaskModel('Task in src/', 'Source task', scope, config, usage, patterns);
    expect(result).toBe('sonnet');
  });

  it('empty patterns array has no effect on model selection', () => {
    const config = makeConfig();
    const usage = makeUsage();
    const scope = makeScope(['src/core/']);
    const withPatterns = resolveTaskModel('Add util', 'Simple', scope, config, usage, []);
    const withoutPatterns = resolveTaskModel('Add util', 'Simple', scope, config, usage);
    expect(withPatterns).toBe(withoutPatterns);
  });
});
