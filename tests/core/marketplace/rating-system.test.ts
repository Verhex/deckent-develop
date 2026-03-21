import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RatingSystem } from '../../../src/core/marketplace/rating-system.js';
import type { RatingSystemFS } from '../../../src/core/marketplace/rating-system.js';

// ─── Mock FS ─────────────────────────────────────────────────────────────────

function createMockFS(files: Record<string, string> = {}): RatingSystemFS {
  const store = new Map(Object.entries(files));

  return {
    existsSync: vi.fn((p: string) => store.has(p)),
    readFileSync: vi.fn((p: string) => {
      if (!store.has(p)) throw new Error(`ENOENT: ${p}`);
      return store.get(p)!;
    }),
    writeFileSync: vi.fn((p: string, content: string) => {
      store.set(p, typeof content === 'string' ? content : String(content));
    }),
    mkdirSync: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RatingSystem', () => {
  const dataDir = '/tmp/ratings';

  describe('calculateLocalRating', () => {
    it('returns 0 for zero stats', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      const rating = rs.calculateLocalRating('skill-a', {
        successRate: 0,
        avgCoverage: 0,
        frequency: 0,
      });
      expect(rating).toBe(0);
    });

    it('returns max 5 for perfect stats', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      const rating = rs.calculateLocalRating('skill-b', {
        successRate: 1.0,
        avgCoverage: 100,
        frequency: 100,
      });
      expect(rating).toBe(5);
    });

    it('weights success rate at 60%', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      const rating = rs.calculateLocalRating('skill-c', {
        successRate: 1.0,
        avgCoverage: 0,
        frequency: 0,
      });
      // 1.0 * 0.6 * 5 = 3.0
      expect(rating).toBe(3);
    });

    it('weights coverage at 30%', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      const rating = rs.calculateLocalRating('skill-d', {
        successRate: 0,
        avgCoverage: 100,
        frequency: 0,
      });
      // 100/100 * 0.3 * 5 = 1.5
      expect(rating).toBe(1.5);
    });

    it('weights frequency at 10%', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      const rating = rs.calculateLocalRating('skill-e', {
        successRate: 0,
        avgCoverage: 0,
        frequency: 100,
      });
      // 100/100 * 0.1 * 5 = 0.5
      expect(rating).toBe(0.5);
    });

    it('caps frequency at 100', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      const rating1 = rs.calculateLocalRating('skill-f', {
        successRate: 0,
        avgCoverage: 0,
        frequency: 100,
      });
      const rating2 = rs.calculateLocalRating('skill-g', {
        successRate: 0,
        avgCoverage: 0,
        frequency: 500,
      });
      expect(rating1).toBe(rating2);
    });

    it('clamps negative values to 0', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      const rating = rs.calculateLocalRating('skill-h', {
        successRate: -1,
        avgCoverage: -50,
        frequency: -10,
      });
      expect(rating).toBe(0);
    });

    it('persists rating to data file', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      rs.calculateLocalRating('skill-persist', {
        successRate: 0.8,
        avgCoverage: 75,
        frequency: 20,
      });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('submitRating', () => {
    it('submits a valid rating', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      const submission = rs.submitRating('skill-a', 4, 'Great skill');
      expect(submission.skillId).toBe('skill-a');
      expect(submission.rating).toBe(4);
      expect(submission.comment).toBe('Great skill');
    });

    it('throws for rating below 1', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      expect(() => rs.submitRating('skill-a', 0)).toThrow('between 1 and 5');
    });

    it('throws for rating above 5', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      expect(() => rs.submitRating('skill-a', 6)).toThrow('between 1 and 5');
    });

    it('throws for non-integer rating', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      expect(() => rs.submitRating('skill-a', 3.5)).toThrow('integer');
    });

    it('allows optional comment', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      const submission = rs.submitRating('skill-a', 5);
      expect(submission.comment).toBeUndefined();
    });
  });

  describe('getRatings', () => {
    it('returns empty data when no file', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      const data = rs.getRatings();
      expect(data.ratings).toEqual([]);
      expect(data.submissions).toEqual([]);
    });

    it('returns stored data', () => {
      const stored = {
        ratings: [{ skillId: 'x', successRate: 0.5, avgCoverage: 50, frequency: 10, rating: 2.5, updatedAt: '' }],
        submissions: [{ skillId: 'x', rating: 4, submittedAt: '' }],
        updatedAt: '',
      };
      const fs = createMockFS({
        [`${dataDir}/ratings.json`]: JSON.stringify(stored),
      });
      const rs = new RatingSystem(dataDir, { fs });

      const data = rs.getRatings();
      expect(data.ratings).toHaveLength(1);
      expect(data.submissions).toHaveLength(1);
    });
  });

  describe('getSkillRating', () => {
    it('returns null for unknown skill', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      expect(rs.getSkillRating('nonexistent')).toBeNull();
    });

    it('returns rating after calculateLocalRating', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      rs.calculateLocalRating('my-skill', { successRate: 0.8, avgCoverage: 70, frequency: 10 });
      // After write, we need to simulate read from the stored value
      // Since our mock fs tracks writes, getSkillRating should read back
      const rating = rs.getSkillRating('my-skill');
      expect(rating).not.toBeNull();
    });
  });

  describe('getSkillSubmissions', () => {
    it('returns empty array for no submissions', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      expect(rs.getSkillSubmissions('skill-a')).toEqual([]);
    });
  });

  describe('formatRating', () => {
    it('formats rating as X/5', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      expect(rs.formatRating(3.5)).toBe('3.5/5');
    });

    it('clamps to 0-5 range', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      expect(rs.formatRating(-1)).toBe('0/5');
      expect(rs.formatRating(10)).toBe('5/5');
    });

    it('rounds to 1 decimal', () => {
      const fs = createMockFS();
      const rs = new RatingSystem(dataDir, { fs });

      expect(rs.formatRating(3.456)).toBe('3.5/5');
    });
  });
});
