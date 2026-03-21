import { describe, it, expect } from 'vitest';
import { ETACalculator } from '../../../src/cli/helpers/eta-calculator.js';

describe('ETACalculator', () => {
  const calc = new ETACalculator();

  // ─── calculateETA ─────────────────────────────────────────────────

  describe('calculateETA', () => {
    it('returns 0 when all tasks completed', () => {
      expect(calc.calculateETA(5, 5, 10000)).toBe(0);
    });

    it('returns -1 when no data (0 completed, no durations)', () => {
      expect(calc.calculateETA(0, 5, 0)).toBe(-1);
    });

    it('returns linear estimate from elapsed time', () => {
      // 2 done in 10s => 5ms/task => 3 remaining => 15s
      const eta = calc.calculateETA(2, 5, 10000);
      expect(eta).toBe(15000);
    });

    it('uses task durations with weighted average when provided', () => {
      // durations: [1000, 2000, 3000] — last 3 get 2x weight
      // all 3 are "last 3" so all get 2x weight: avg = (2*1000 + 2*2000 + 2*3000)/6 = 2000
      // remaining = 2, so eta = 4000
      const eta = calc.calculateETA(3, 5, 6000, [1000, 2000, 3000]);
      expect(eta).toBe(4000);
    });

    it('single duration gives linear estimate', () => {
      // 1 duration of 5000ms, 4 remaining
      const eta = calc.calculateETA(1, 5, 5000, [5000]);
      expect(eta).toBe(20000);
    });

    it('gives more weight to recent tasks', () => {
      // durations: [1000, 1000, 1000, 5000, 5000, 5000]
      // first 3 weight=1, last 3 weight=2
      // sum = 3*1000 + 6*5000 = 33000, totalWeight = 9
      // avg = 33000/9 = 3666.67
      const eta1 = calc.calculateETA(6, 8, 18000, [1000, 1000, 1000, 5000, 5000, 5000]);
      // remaining = 2 => eta = ~7333
      expect(eta1).toBeGreaterThan(7000);
      expect(eta1).toBeLessThan(8000);
    });

    it('returns -1 when 0 completed and empty durations', () => {
      expect(calc.calculateETA(0, 10, 5000, [])).toBe(-1);
    });

    it('returns 0 when remaining is 0', () => {
      expect(calc.calculateETA(10, 10, 50000, [5000])).toBe(0);
    });

    it('handles durations with single entry', () => {
      const eta = calc.calculateETA(1, 3, 2000, [2000]);
      expect(eta).toBe(4000);
    });
  });

  // ─── formatETA ────────────────────────────────────────────────────

  describe('formatETA', () => {
    it('returns "calculating..." for negative value', () => {
      expect(calc.formatETA(-1)).toBe('calculating...');
    });

    it('returns "~0s" for 0', () => {
      expect(calc.formatETA(0)).toBe('~0s');
    });

    it('formats seconds only when under 60s', () => {
      expect(calc.formatETA(30000)).toBe('~30s');
    });

    it('formats minutes only when exact', () => {
      expect(calc.formatETA(120000)).toBe('~2m');
    });

    it('formats minutes and seconds', () => {
      expect(calc.formatETA(150000)).toBe('~2m 30s');
    });

    it('formats 1 second', () => {
      expect(calc.formatETA(1000)).toBe('~1s');
    });

    it('formats 59 seconds', () => {
      expect(calc.formatETA(59000)).toBe('~59s');
    });

    it('formats exactly 1 minute', () => {
      expect(calc.formatETA(60000)).toBe('~1m');
    });

    it('formats 5 minutes 30 seconds', () => {
      expect(calc.formatETA(330000)).toBe('~5m 30s');
    });

    it('rounds to nearest second', () => {
      expect(calc.formatETA(1500)).toBe('~2s');
    });
  });
});
