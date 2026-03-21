import { describe, it, expect } from 'vitest';
import {
  SkillHeatmapData,
} from '../../src/dashboard/analytics/skill-heatmap-data.js';
import type {
  LearningEntry,
} from '../../src/dashboard/analytics/skill-heatmap-data.js';

describe('SkillHeatmapData', () => {
  const heatmap = new SkillHeatmapData();

  const sampleEntries: LearningEntry[] = [
    { skills: ['typescript-expert', 'testing-expert'], success: true },
    { skills: ['typescript-expert', 'testing-expert'], success: true },
    { skills: ['typescript-expert', 'react-specialist'], success: false },
    { skills: ['react-specialist', 'testing-expert'], success: true },
    { skills: ['security-specialist'], success: true },
  ];

  // ─── buildCoUsageMatrix ────────────────────────────────────────────────────

  describe('buildCoUsageMatrix', () => {
    it('returns empty matrix for no entries', () => {
      const matrix = heatmap.buildCoUsageMatrix([]);
      expect(matrix.size).toBe(0);
    });

    it('builds symmetric matrix', () => {
      const matrix = heatmap.buildCoUsageMatrix(sampleEntries);
      const tsToTest = matrix.get('typescript-expert')?.get('testing-expert') ?? 0;
      const testToTs = matrix.get('testing-expert')?.get('typescript-expert') ?? 0;
      expect(tsToTest).toBe(testToTs);
    });

    it('counts co-usage correctly', () => {
      const matrix = heatmap.buildCoUsageMatrix(sampleEntries);
      // typescript-expert + testing-expert appears 2 times
      const count = matrix.get('typescript-expert')?.get('testing-expert') ?? 0;
      expect(count).toBe(2);
    });

    it('includes self-usage (diagonal)', () => {
      const matrix = heatmap.buildCoUsageMatrix(sampleEntries);
      // typescript-expert appears in 3 entries, so self-count = 3
      const selfCount = matrix.get('typescript-expert')?.get('typescript-expert') ?? 0;
      expect(selfCount).toBe(3);
    });

    it('handles single-skill entries', () => {
      const matrix = heatmap.buildCoUsageMatrix(sampleEntries);
      const securitySelf = matrix.get('security-specialist')?.get('security-specialist') ?? 0;
      expect(securitySelf).toBe(1);
    });

    it('deduplicates skills within an entry', () => {
      const entries: LearningEntry[] = [
        { skills: ['ts', 'ts', 'ts'], success: true },
      ];
      const matrix = heatmap.buildCoUsageMatrix(entries);
      expect(matrix.get('ts')?.get('ts')).toBe(1);
    });
  });

  // ─── getMostCommonPair ─────────────────────────────────────────────────────

  describe('getMostCommonPair', () => {
    it('returns null for no entries', () => {
      expect(heatmap.getMostCommonPair([])).toBeNull();
    });

    it('finds most common pair', () => {
      const pair = heatmap.getMostCommonPair(sampleEntries);
      expect(pair).not.toBeNull();
      // typescript-expert + testing-expert = 2 co-occurrences
      expect(pair!.count).toBe(2);
      expect([pair!.skillA, pair!.skillB].sort()).toEqual(
        ['testing-expert', 'typescript-expert'],
      );
    });

    it('returns null when all entries have single skill', () => {
      const entries: LearningEntry[] = [
        { skills: ['a'], success: true },
        { skills: ['b'], success: true },
      ];
      expect(heatmap.getMostCommonPair(entries)).toBeNull();
    });
  });

  // ─── getSuccessfulPairs ────────────────────────────────────────────────────

  describe('getSuccessfulPairs', () => {
    it('returns pairs above success threshold', () => {
      const pairs = heatmap.getSuccessfulPairs(sampleEntries, 0.8);
      // typescript-expert + testing-expert: 2/2 success = 100%
      const tsTest = pairs.find(
        (p) =>
          [p.skillA, p.skillB].sort().join('|') ===
          'testing-expert|typescript-expert',
      );
      expect(tsTest).toBeDefined();
    });

    it('excludes pairs below threshold', () => {
      const pairs = heatmap.getSuccessfulPairs(sampleEntries, 1.0);
      // typescript-expert + react-specialist: 0/1 success = 0%
      const tsReact = pairs.find(
        (p) =>
          [p.skillA, p.skillB].sort().join('|') ===
          'react-specialist|typescript-expert',
      );
      expect(tsReact).toBeUndefined();
    });

    it('returns empty for empty entries', () => {
      expect(heatmap.getSuccessfulPairs([], 0.5)).toEqual([]);
    });
  });

  // ─── formatCell ────────────────────────────────────────────────────────────

  describe('formatCell', () => {
    it('returns 0 for zero maxCount', () => {
      expect(heatmap.formatCell(5, 0)).toBe(0);
    });

    it('returns 0 for zero count', () => {
      expect(heatmap.formatCell(0, 10)).toBe(0);
    });

    it('returns 1 for max count', () => {
      expect(heatmap.formatCell(10, 10)).toBe(1);
    });

    it('returns correct intensity fraction', () => {
      expect(heatmap.formatCell(5, 10)).toBe(0.5);
    });

    it('rounds to 2 decimal places', () => {
      expect(heatmap.formatCell(1, 3)).toBeCloseTo(0.33, 2);
    });
  });

  // ─── buildHeatmapCells ─────────────────────────────────────────────────────

  describe('buildHeatmapCells', () => {
    it('returns empty for empty matrix', () => {
      const cells = heatmap.buildHeatmapCells(new Map());
      expect(cells).toEqual([]);
    });

    it('returns cells with correct structure', () => {
      const matrix = heatmap.buildCoUsageMatrix(sampleEntries);
      const cells = heatmap.buildHeatmapCells(matrix);
      expect(cells.length).toBeGreaterThan(0);
      const cell = cells[0]!;
      expect(cell).toHaveProperty('row');
      expect(cell).toHaveProperty('col');
      expect(cell).toHaveProperty('count');
      expect(cell).toHaveProperty('intensity');
    });

    it('intensity values are between 0 and 1', () => {
      const matrix = heatmap.buildCoUsageMatrix(sampleEntries);
      const cells = heatmap.buildHeatmapCells(matrix);
      for (const cell of cells) {
        expect(cell.intensity).toBeGreaterThanOrEqual(0);
        expect(cell.intensity).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─── getUniqueSkills ───────────────────────────────────────────────────────

  describe('getUniqueSkills', () => {
    it('returns empty for no entries', () => {
      expect(heatmap.getUniqueSkills([])).toEqual([]);
    });

    it('returns sorted unique skills', () => {
      const skills = heatmap.getUniqueSkills(sampleEntries);
      expect(skills).toEqual([
        'react-specialist',
        'security-specialist',
        'testing-expert',
        'typescript-expert',
      ]);
    });

    it('deduplicates across entries', () => {
      const entries: LearningEntry[] = [
        { skills: ['a', 'b'], success: true },
        { skills: ['b', 'c'], success: true },
        { skills: ['a', 'c'], success: true },
      ];
      expect(heatmap.getUniqueSkills(entries)).toEqual(['a', 'b', 'c']);
    });
  });
});
