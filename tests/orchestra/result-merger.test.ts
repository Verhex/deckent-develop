import { describe, it, expect } from 'vitest';
import { ResultMerger } from '../../src/orchestra/result-merger.js';
import type { MergeableResult, OverlapDetectable } from '../../src/orchestra/result-merger.js';

describe('ResultMerger', () => {
  const merger = new ResultMerger();

  // ─── mergeResults ────────────────────────────────────────────────

  describe('mergeResults', () => {
    it('returns zeroed result for empty input', () => {
      const merged = merger.mergeResults([]);
      expect(merged.totalFilesChanged).toEqual([]);
      expect(merged.totalLinesAdded).toBe(0);
      expect(merged.totalLinesRemoved).toBe(0);
      expect(merged.combinedCoverage).toBe(0);
      expect(merged.allTestsPassed).toBe(true);
    });

    it('merges single result correctly', () => {
      const results: MergeableResult[] = [
        { filesChanged: ['src/a.ts'], linesAdded: 10, linesRemoved: 5, coverage: 85, testsPassed: true },
      ];
      const merged = merger.mergeResults(results);
      expect(merged.totalFilesChanged).toEqual(['src/a.ts']);
      expect(merged.totalLinesAdded).toBe(10);
      expect(merged.totalLinesRemoved).toBe(5);
      expect(merged.combinedCoverage).toBe(85);
      expect(merged.allTestsPassed).toBe(true);
    });

    it('deduplicates filesChanged across workers', () => {
      const results: MergeableResult[] = [
        { filesChanged: ['src/a.ts', 'src/b.ts'], linesAdded: 5, linesRemoved: 2, coverage: 80, testsPassed: true },
        { filesChanged: ['src/a.ts', 'src/c.ts'], linesAdded: 3, linesRemoved: 1, coverage: 90, testsPassed: true },
      ];
      const merged = merger.mergeResults(results);
      expect(merged.totalFilesChanged).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    });

    it('sums lines added and removed', () => {
      const results: MergeableResult[] = [
        { filesChanged: [], linesAdded: 10, linesRemoved: 5, coverage: 0, testsPassed: true },
        { filesChanged: [], linesAdded: 20, linesRemoved: 8, coverage: 0, testsPassed: true },
      ];
      const merged = merger.mergeResults(results);
      expect(merged.totalLinesAdded).toBe(30);
      expect(merged.totalLinesRemoved).toBe(13);
    });

    it('averages non-zero coverages', () => {
      const results: MergeableResult[] = [
        { filesChanged: [], linesAdded: 0, linesRemoved: 0, coverage: 80, testsPassed: true },
        { filesChanged: [], linesAdded: 0, linesRemoved: 0, coverage: 90, testsPassed: true },
      ];
      const merged = merger.mergeResults(results);
      expect(merged.combinedCoverage).toBe(85);
    });

    it('skips zero coverage in average', () => {
      const results: MergeableResult[] = [
        { filesChanged: [], linesAdded: 0, linesRemoved: 0, coverage: 0, testsPassed: true },
        { filesChanged: [], linesAdded: 0, linesRemoved: 0, coverage: 80, testsPassed: true },
      ];
      const merged = merger.mergeResults(results);
      expect(merged.combinedCoverage).toBe(80);
    });

    it('allTestsPassed is false if any worker failed', () => {
      const results: MergeableResult[] = [
        { filesChanged: [], linesAdded: 0, linesRemoved: 0, coverage: 90, testsPassed: true },
        { filesChanged: [], linesAdded: 0, linesRemoved: 0, coverage: 85, testsPassed: false },
      ];
      const merged = merger.mergeResults(results);
      expect(merged.allTestsPassed).toBe(false);
    });

    it('allTestsPassed is true when all pass', () => {
      const results: MergeableResult[] = [
        { filesChanged: [], linesAdded: 0, linesRemoved: 0, coverage: 0, testsPassed: true },
        { filesChanged: [], linesAdded: 0, linesRemoved: 0, coverage: 0, testsPassed: true },
      ];
      const merged = merger.mergeResults(results);
      expect(merged.allTestsPassed).toBe(true);
    });

    it('sorts totalFilesChanged alphabetically', () => {
      const results: MergeableResult[] = [
        { filesChanged: ['src/z.ts', 'src/a.ts'], linesAdded: 0, linesRemoved: 0, coverage: 0, testsPassed: true },
      ];
      const merged = merger.mergeResults(results);
      expect(merged.totalFilesChanged).toEqual(['src/a.ts', 'src/z.ts']);
    });
  });

  // ─── detectOverlaps ──────────────────────────────────────────────

  describe('detectOverlaps', () => {
    it('returns empty for no overlaps', () => {
      const results: OverlapDetectable[] = [
        { taskId: 'w1', filesChanged: ['src/a.ts'] },
        { taskId: 'w2', filesChanged: ['src/b.ts'] },
      ];
      expect(merger.detectOverlaps(results)).toEqual([]);
    });

    it('detects single file overlap', () => {
      const results: OverlapDetectable[] = [
        { taskId: 'w1', filesChanged: ['src/shared.ts'] },
        { taskId: 'w2', filesChanged: ['src/shared.ts'] },
      ];
      const overlaps = merger.detectOverlaps(results);
      expect(overlaps).toHaveLength(1);
      expect(overlaps[0]!.file).toBe('src/shared.ts');
      expect(overlaps[0]!.workers).toEqual(['w1', 'w2']);
    });

    it('detects multiple overlaps', () => {
      const results: OverlapDetectable[] = [
        { taskId: 'w1', filesChanged: ['src/a.ts', 'src/b.ts'] },
        { taskId: 'w2', filesChanged: ['src/a.ts', 'src/b.ts'] },
      ];
      const overlaps = merger.detectOverlaps(results);
      expect(overlaps).toHaveLength(2);
    });

    it('deduplicates worker IDs', () => {
      const results: OverlapDetectable[] = [
        { taskId: 'w1', filesChanged: ['src/a.ts'] },
        { taskId: 'w1', filesChanged: ['src/a.ts'] },
      ];
      const overlaps = merger.detectOverlaps(results);
      // w1 appears twice in input but should be deduplicated
      expect(overlaps[0]!.workers).toEqual(['w1']);
    });

    it('sorts overlaps by file name', () => {
      const results: OverlapDetectable[] = [
        { taskId: 'w1', filesChanged: ['z.ts', 'a.ts'] },
        { taskId: 'w2', filesChanged: ['z.ts', 'a.ts'] },
      ];
      const overlaps = merger.detectOverlaps(results);
      expect(overlaps[0]!.file).toBe('a.ts');
      expect(overlaps[1]!.file).toBe('z.ts');
    });

    it('returns empty for empty input', () => {
      expect(merger.detectOverlaps([])).toEqual([]);
    });
  });
});
