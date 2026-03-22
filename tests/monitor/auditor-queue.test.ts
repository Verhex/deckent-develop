import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  mkdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
}));

import { readFileSync, writeFileSync } from 'node:fs';
import { detectPatterns } from '../../src/monitor/auditor.js';
import type { BoundaryViolation, PatternEntry } from '../../src/core/types.js';
import { PATTERNS_MAX_LINES } from '../../src/core/constants.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeViolation(type: string, overrides: Partial<BoundaryViolation> = {}): BoundaryViolation {
  return {
    type: type as BoundaryViolation['type'],
    agentId: 'worker-1',
    detail: `Test violation: ${type}`,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makePattern(pattern: string, occurrences: number, overrides: Partial<PatternEntry> = {}): PatternEntry {
  return {
    pattern,
    occurrences,
    firstDetectedInSprint: 'sprint-020',
    lastDetectedInSprint: 'sprint-020',
    resolved: false,
    ...overrides,
  };
}

function getWrittenPatterns(): PatternEntry[] {
  const calls = vi.mocked(writeFileSync).mock.calls;
  if (calls.length === 0) return [];
  return JSON.parse(calls[calls.length - 1][1] as string) as PatternEntry[];
}

// ─── Tests: Pattern Queue Eviction (pop vs shift) ────────────────────

describe('auditor pattern queue — pop() eviction behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retains highest-occurrence patterns when truncating', () => {
    // Create 30 patterns — serialized JSON will exceed PATTERNS_MAX_LINES (80)
    const manyPatterns: PatternEntry[] = Array.from({ length: 30 }, (_, i) =>
      makePattern(`pattern-${i}`, i + 1),
    );
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manyPatterns));

    detectPatterns('/project', [makeViolation('file_outside_scope')], 'sprint-036');

    const written = getWrittenPatterns();
    // Highest occurrence value in input is 30 — it must survive truncation
    const maxOccurrence = Math.max(...written.map(p => p.occurrences));
    expect(maxOccurrence).toBeGreaterThanOrEqual(30);
  });

  it('removes lowest-occurrence patterns first during truncation', () => {
    // Create enough patterns to trigger truncation
    const manyPatterns: PatternEntry[] = Array.from({ length: 30 }, (_, i) =>
      makePattern(`pattern-${i}`, i + 1),
    );
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manyPatterns));

    detectPatterns('/project', [makeViolation('stale_heartbeat')], 'sprint-036');

    const written = getWrittenPatterns();
    const minOccurrence = Math.min(...written.map(p => p.occurrences));
    // pattern-0 has occurrences=1 and should have been removed
    // Surviving patterns should have higher occurrence counts
    expect(minOccurrence).toBeGreaterThan(1);
  });

  it('result fits within PATTERNS_MAX_LINES after truncation', () => {
    // 30 patterns guaranteed to overflow 80 lines
    const manyPatterns: PatternEntry[] = Array.from({ length: 30 }, (_, i) =>
      makePattern(`pattern-${i}`, i + 1),
    );
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manyPatterns));

    detectPatterns('/project', [makeViolation('file_outside_scope')], 'sprint-036');

    const written = getWrittenPatterns();
    const serialized = JSON.stringify(written, null, 2);
    const lineCount = serialized.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(PATTERNS_MAX_LINES);
  });

  it('never removes all patterns — at least one entry survives truncation', () => {
    // Even with extremely large patterns list, at least 1 must survive
    const manyPatterns: PatternEntry[] = Array.from({ length: 50 }, (_, i) =>
      makePattern(`very-long-pattern-name-that-takes-many-lines-${i}`, i + 1),
    );
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manyPatterns));

    detectPatterns('/project', [makeViolation('stale_lock')], 'sprint-036');

    const written = getWrittenPatterns();
    expect(written.length).toBeGreaterThanOrEqual(1);
  });

  it('no truncation occurs when pattern count is within limits', () => {
    // 3 patterns — well within 80-line budget
    const fewPatterns: PatternEntry[] = [
      makePattern('stale_heartbeat', 5),
      makePattern('stale_lock', 3),
    ];
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(fewPatterns));

    detectPatterns('/project', [makeViolation('file_outside_scope')], 'sprint-036');

    const written = getWrittenPatterns();
    // Should have 3 patterns (2 existing + 1 new) with no eviction
    expect(written).toHaveLength(3);
    expect(written.find(p => p.pattern === 'stale_heartbeat')?.occurrences).toBe(5);
    expect(written.find(p => p.pattern === 'stale_lock')?.occurrences).toBe(3);
    expect(written.find(p => p.pattern === 'file_outside_scope')?.occurrences).toBe(1);
  });

  it('truncation is stable — equal-occurrence patterns not erroneously removed', () => {
    // All patterns have the same occurrence count
    const equalPatterns: PatternEntry[] = Array.from({ length: 30 }, (_, i) =>
      makePattern(`pattern-${i}`, 10),
    );
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(equalPatterns));

    detectPatterns('/project', [makeViolation('circular_dependency')], 'sprint-036');

    const written = getWrittenPatterns();
    // All written patterns should have occurrences=10 (or =1 for the new one)
    const validOccurrences = written.every(p => p.occurrences === 10 || p.occurrences === 1);
    expect(validOccurrences).toBe(true);
    // At least one survives
    expect(written.length).toBeGreaterThanOrEqual(1);
  });

  it('patterns with higher occurrences are ordered before lower-occurrence ones after truncation', () => {
    // 25 patterns with varying occurrences — after truncation highest should come first
    const manyPatterns: PatternEntry[] = Array.from({ length: 25 }, (_, i) =>
      makePattern(`pattern-${i}`, (25 - i) * 2), // decreasing: 50, 48, 46...
    );
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manyPatterns));

    detectPatterns('/project', [makeViolation('stale_heartbeat')], 'sprint-036');

    const written = getWrittenPatterns();
    // Verify written array is sorted descending by occurrences
    for (let i = 0; i < written.length - 1; i++) {
      expect(written[i]!.occurrences).toBeGreaterThanOrEqual(written[i + 1]!.occurrences);
    }
  });
});
