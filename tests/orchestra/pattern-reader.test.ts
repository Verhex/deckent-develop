import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { PatternReader, type PatternFilter } from '../../src/orchestra/pattern-reader.js';
import type { LearningEntry } from '../../src/orchestra/pattern-recorder.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

function makeEntry(overrides: Partial<LearningEntry> = {}): LearningEntry {
  return {
    taskType: 'feature',
    agent: 'worker-1',
    skills: ['typescript'],
    model: 'opus',
    effort: 'high',
    evaluation: 'DONE',
    coverage: 85,
    durationMs: 60000,
    sprintId: 'sprint-001',
    recordedAt: '2026-03-22T00:00:00.000Z',
    ...overrides,
  };
}

function setupEntries(entries: LearningEntry[]): void {
  // Group entries by sprint ID
  const bySprint = new Map<string, LearningEntry[]>();
  for (const e of entries) {
    const arr = bySprint.get(e.sprintId) ?? [];
    arr.push(e);
    bySprint.set(e.sprintId, arr);
  }

  const files = Array.from(bySprint.keys()).map(id => `${id}.json`);
  mockExistsSync.mockReturnValue(true);
  mockReaddirSync.mockReturnValue(files as unknown as ReturnType<typeof readdirSync>);

  // Each readFileSync call returns the entries for a specific file
  for (const [sprintId] of bySprint) {
    const sprintEntries = bySprint.get(sprintId)!;
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(sprintEntries));
  }
}

describe('PatternReader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('queryPatterns', () => {
    it('returns empty array when learning directory does not exist', () => {
      mockExistsSync.mockReturnValueOnce(false);
      const reader = new PatternReader('/repo');
      expect(reader.queryPatterns({})).toEqual([]);
    });

    it('returns all entries when no filter is applied', () => {
      const entries = [makeEntry(), makeEntry({ taskType: 'bugfix' })];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const result = reader.queryPatterns({});
      expect(result).toHaveLength(2);
    });

    it('filters by taskType', () => {
      const entries = [
        makeEntry({ taskType: 'feature' }),
        makeEntry({ taskType: 'bugfix' }),
        makeEntry({ taskType: 'feature' }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const result = reader.queryPatterns({ taskType: 'feature' });
      expect(result).toHaveLength(2);
      expect(result.every(e => e.taskType === 'feature')).toBe(true);
    });

    it('filters by agent', () => {
      const entries = [
        makeEntry({ agent: 'worker-1' }),
        makeEntry({ agent: 'worker-2' }),
        makeEntry({ agent: null }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const result = reader.queryPatterns({ agent: 'worker-1' });
      expect(result).toHaveLength(1);
    });

    it('filters by model', () => {
      const entries = [
        makeEntry({ model: 'opus' }),
        makeEntry({ model: 'sonnet' }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      expect(reader.queryPatterns({ model: 'opus' })).toHaveLength(1);
    });

    it('filters by evaluation', () => {
      const entries = [
        makeEntry({ evaluation: 'DONE' }),
        makeEntry({ evaluation: 'NO_GO' }),
        makeEntry({ evaluation: 'DONE' }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      expect(reader.queryPatterns({ evaluation: 'DONE' })).toHaveLength(2);
    });

    it('filters by minCoverage', () => {
      const entries = [
        makeEntry({ coverage: 90 }),
        makeEntry({ coverage: 50 }),
        makeEntry({ coverage: 85 }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      expect(reader.queryPatterns({ minCoverage: 80 })).toHaveLength(2);
    });

    it('filters by sprintRange', () => {
      const entries = [
        makeEntry({ sprintId: 'sprint-001' }),
        makeEntry({ sprintId: 'sprint-005' }),
        makeEntry({ sprintId: 'sprint-010' }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const result = reader.queryPatterns({
        sprintRange: { from: 'sprint-002', to: 'sprint-008' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.sprintId).toBe('sprint-005');
    });

    it('combines multiple filters', () => {
      const entries = [
        makeEntry({ taskType: 'feature', model: 'opus', coverage: 90 }),
        makeEntry({ taskType: 'feature', model: 'sonnet', coverage: 90 }),
        makeEntry({ taskType: 'bugfix', model: 'opus', coverage: 90 }),
        makeEntry({ taskType: 'feature', model: 'opus', coverage: 50 }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const result = reader.queryPatterns({
        taskType: 'feature',
        model: 'opus',
        minCoverage: 80,
      });
      expect(result).toHaveLength(1);
    });

    it('skips malformed files gracefully', () => {
      // Only return true for the learningPath existsSync check.
      // debugLog → appendToErrorsFile calls existsSync('.brain') — returning false
      // prevents it from calling readFileSync internally and consuming mock queue.
      mockExistsSync.mockImplementation((p: unknown) =>
        String(p).endsWith('learning'),
      );
      mockReaddirSync.mockReturnValue(['sprint-001.json', 'sprint-002.json'] as unknown as ReturnType<typeof readdirSync>);
      mockReadFileSync.mockReturnValueOnce('not valid json');
      mockReadFileSync.mockReturnValueOnce(JSON.stringify([makeEntry()]));

      const reader = new PatternReader('/repo');
      const result = reader.queryPatterns({});
      expect(result).toHaveLength(1);
    });
  });

  describe('getSuccessfulCombinations', () => {
    it('returns empty array when no entries exist', () => {
      mockExistsSync.mockReturnValueOnce(false);
      const reader = new PatternReader('/repo');
      expect(reader.getSuccessfulCombinations('feature')).toEqual([]);
    });

    it('returns successful combos with DONE and coverage > 80', () => {
      const entries = [
        makeEntry({ evaluation: 'DONE', coverage: 90 }),
        makeEntry({ evaluation: 'DONE', coverage: 85 }),
        makeEntry({ evaluation: 'DONE', coverage: 50 }), // coverage too low
        makeEntry({ evaluation: 'NO_GO', coverage: 90 }), // wrong evaluation
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const combos = reader.getSuccessfulCombinations('feature');
      expect(combos).toHaveLength(1);
      expect(combos[0]!.count).toBe(2);
    });

    it('groups by agent/skills/model combination', () => {
      const entries = [
        makeEntry({ agent: 'worker-1', skills: ['ts'], model: 'opus', evaluation: 'DONE', coverage: 90 }),
        makeEntry({ agent: 'worker-1', skills: ['ts'], model: 'opus', evaluation: 'DONE', coverage: 88 }),
        makeEntry({ agent: 'worker-2', skills: ['ts'], model: 'opus', evaluation: 'DONE', coverage: 85 }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const combos = reader.getSuccessfulCombinations('feature');
      expect(combos).toHaveLength(2);
      expect(combos[0]!.count).toBe(2); // worker-1 has higher count
    });

    it('sorts by count descending', () => {
      const entries = [
        makeEntry({ agent: 'a', evaluation: 'DONE', coverage: 90 }),
        makeEntry({ agent: 'b', evaluation: 'DONE', coverage: 90 }),
        makeEntry({ agent: 'b', evaluation: 'DONE', coverage: 90 }),
        makeEntry({ agent: 'b', evaluation: 'DONE', coverage: 90 }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const combos = reader.getSuccessfulCombinations('feature');
      expect(combos[0]!.agent).toBe('b');
      expect(combos[0]!.count).toBe(3);
    });

    it('filters by taskType', () => {
      const entries = [
        makeEntry({ taskType: 'feature', evaluation: 'DONE', coverage: 90 }),
        makeEntry({ taskType: 'bugfix', evaluation: 'DONE', coverage: 90 }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      expect(reader.getSuccessfulCombinations('feature')).toHaveLength(1);
      expect(reader.getSuccessfulCombinations('bugfix')).toHaveLength(0); // different read
    });
  });

  describe('getFailedCombinations', () => {
    it('returns empty array when no entries exist', () => {
      mockExistsSync.mockReturnValueOnce(false);
      const reader = new PatternReader('/repo');
      expect(reader.getFailedCombinations('feature')).toEqual([]);
    });

    it('returns only NO_GO entries', () => {
      const entries = [
        makeEntry({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
        makeEntry({ evaluation: 'DONE', sprintId: 'sprint-001' }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const combos = reader.getFailedCombinations('feature');
      expect(combos).toHaveLength(1);
      expect(combos[0]!.count).toBe(1);
    });

    it('includes lastSprint for each combination', () => {
      const entries = [
        makeEntry({ evaluation: 'NO_GO', sprintId: 'sprint-001' }),
        makeEntry({ evaluation: 'NO_GO', sprintId: 'sprint-005' }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const combos = reader.getFailedCombinations('feature');
      expect(combos[0]!.lastSprint).toBe('sprint-005');
      expect(combos[0]!.count).toBe(2);
    });

    it('sorts by recency first then count', () => {
      const entries = [
        makeEntry({ agent: 'a', evaluation: 'NO_GO', sprintId: 'sprint-001' }),
        makeEntry({ agent: 'a', evaluation: 'NO_GO', sprintId: 'sprint-001' }),
        makeEntry({ agent: 'b', evaluation: 'NO_GO', sprintId: 'sprint-005' }),
      ];
      setupEntries(entries);

      const reader = new PatternReader('/repo');
      const combos = reader.getFailedCombinations('feature');
      // b is more recent, should come first
      expect(combos[0]!.agent).toBe('b');
    });
  });
});
