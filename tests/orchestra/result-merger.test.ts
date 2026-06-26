import { describe, it, expect } from 'vitest';
import { ResultMerger } from '../../src/orchestra/result-merger.js';
import type { OverlapDetectable } from '../../src/orchestra/result-merger.js';

describe('ResultMerger', () => {
  const merger = new ResultMerger();

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
