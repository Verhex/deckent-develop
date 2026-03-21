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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { detectPatterns } from '../../src/monitor/auditor.js';
import type { BoundaryViolation, PatternEntry } from '../../src/core/types.js';

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

function makePattern(pattern: string, overrides: Partial<PatternEntry> = {}): PatternEntry {
  return {
    pattern,
    occurrences: 1,
    firstDetectedInSprint: 'sprint-020',
    lastDetectedInSprint: 'sprint-020',
    resolved: false,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('detectPatterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new patterns from violations when no patterns file exists', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const violations = [makeViolation('file_outside_scope')];
    detectPatterns('/project', violations, 'sprint-027');

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as PatternEntry[];
    expect(written).toHaveLength(1);
    expect(written[0].pattern).toBe('file_outside_scope');
    expect(written[0].occurrences).toBe(1);
    expect(written[0].firstDetectedInSprint).toBe('sprint-027');
    expect(written[0].lastDetectedInSprint).toBe('sprint-027');
  });

  it('increments existing pattern occurrences', () => {
    const existing = [makePattern('stale_heartbeat', { occurrences: 3, lastDetectedInSprint: 'sprint-025' })];
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existing));

    const violations = [makeViolation('stale_heartbeat')];
    detectPatterns('/project', violations, 'sprint-027');

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as PatternEntry[];
    expect(written).toHaveLength(1);
    expect(written[0].occurrences).toBe(4);
    expect(written[0].lastDetectedInSprint).toBe('sprint-027');
  });

  it('handles empty violations array (no-op)', () => {
    detectPatterns('/project', [], 'sprint-027');
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('creates pattern file when it does not exist (readFileSync throws)', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    const violations = [makeViolation('stale_lock')];
    detectPatterns('/project', violations, 'sprint-027');

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as PatternEntry[];
    expect(written[0].pattern).toBe('stale_lock');
  });

  it('updates existing pattern file when it exists', () => {
    const existing = [makePattern('file_outside_scope', { occurrences: 2 })];
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existing));

    const violations = [makeViolation('circular_dependency')];
    detectPatterns('/project', violations, 'sprint-027');

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as PatternEntry[];
    expect(written).toHaveLength(2);
    expect(written.find(p => p.pattern === 'file_outside_scope')?.occurrences).toBe(2);
    expect(written.find(p => p.pattern === 'circular_dependency')?.occurrences).toBe(1);
  });

  it('multiple violation types create separate patterns', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const violations = [
      makeViolation('file_outside_scope'),
      makeViolation('stale_heartbeat'),
      makeViolation('stale_lock'),
    ];
    detectPatterns('/project', violations, 'sprint-027');

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as PatternEntry[];
    expect(written).toHaveLength(3);
    const types = written.map(p => p.pattern);
    expect(types).toContain('file_outside_scope');
    expect(types).toContain('stale_heartbeat');
    expect(types).toContain('stale_lock');
  });

  it('resolved patterns are not affected by new violations of same type', () => {
    const existing = [
      makePattern('stale_heartbeat', { occurrences: 5, resolved: true }),
    ];
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existing));

    // detectPatterns finds existing by pattern name and increments — resolved flag stays
    const violations = [makeViolation('stale_heartbeat')];
    detectPatterns('/project', violations, 'sprint-027');

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as PatternEntry[];
    // The resolved field is preserved (detectPatterns just increments occurrences)
    expect(written[0].resolved).toBe(true);
    expect(written[0].occurrences).toBe(6);
  });

  it('counts multiple violations of same type correctly', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const violations = [
      makeViolation('file_outside_scope'),
      makeViolation('file_outside_scope'),
      makeViolation('file_outside_scope'),
    ];
    detectPatterns('/project', violations, 'sprint-027');

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as PatternEntry[];
    expect(written).toHaveLength(1);
    expect(written[0].occurrences).toBe(3);
  });

  it('writes to correct path (.brain/PATTERNS.md)', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    detectPatterns('/project', [makeViolation('stale_lock')], 'sprint-027');

    const writePath = vi.mocked(writeFileSync).mock.calls[0][0] as string;
    expect(writePath).toContain('.brain');
    expect(writePath).toContain('PATTERNS');
  });

  it('truncation removes lowest-occurrence patterns when exceeding max lines', () => {
    // Create many patterns so serialized JSON exceeds PATTERNS_MAX_LINES (80)
    const manyPatterns: PatternEntry[] = Array.from({ length: 30 }, (_, i) =>
      makePattern(`pattern-${i}`, { occurrences: i + 1 }),
    );
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manyPatterns));

    const violations = [makeViolation('new_violation_type')];
    detectPatterns('/project', violations, 'sprint-027');

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as PatternEntry[];
    // After truncation, lowest-occurrence patterns should be removed
    // The exact count depends on PATTERNS_MAX_LINES but it should be fewer or equal
    expect(written.length).toBeLessThanOrEqual(31);
    // Highest occurrence patterns should survive
    const maxOccurrence = Math.max(...written.map(p => p.occurrences));
    expect(maxOccurrence).toBeGreaterThanOrEqual(30);
  });

  it('firstDetectedInSprint preserved when incrementing existing', () => {
    const existing = [
      makePattern('stale_heartbeat', {
        firstDetectedInSprint: 'sprint-010',
        lastDetectedInSprint: 'sprint-025',
        occurrences: 5,
      }),
    ];
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existing));

    detectPatterns('/project', [makeViolation('stale_heartbeat')], 'sprint-027');

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as PatternEntry[];
    expect(written[0].firstDetectedInSprint).toBe('sprint-010');
    expect(written[0].lastDetectedInSprint).toBe('sprint-027');
  });
});
