// ─── Sprint 330 Task 9 — formatKpiValue (deckent kpi CLI) ─────────────────────
// Unit coverage for the exported value formatter that the `deckent kpi` table,
// the `--json` "formatted" field, and the Task-10 retro scorecard all share.
// Pure function, no I/O — fully hermetic.

import { describe, it, expect } from 'vitest';
import { formatKpiValue } from '../../src/cli/commands/kpi.js';

describe('formatKpiValue', () => {
  describe('currency', () => {
    it('renders $x.xx with two decimals', () => {
      expect(formatKpiValue(7, 'currency')).toBe('$7.00');
      expect(formatKpiValue(1.234, 'currency')).toBe('$1.23');
      expect(formatKpiValue(0, 'currency')).toBe('$0.00');
    });

    it('rounds to the cent', () => {
      expect(formatKpiValue(3.555, 'currency')).toBe('$3.56');
    });
  });

  describe('percent', () => {
    it('scales a 0..1 ratio to x.x%', () => {
      expect(formatKpiValue(0.755, 'percent')).toBe('75.5%');
      expect(formatKpiValue(0.15, 'percent')).toBe('15.0%');
      expect(formatKpiValue(1, 'percent')).toBe('100.0%');
      expect(formatKpiValue(0, 'percent')).toBe('0.0%');
    });
  });

  describe('number', () => {
    it('locale-groups with thousands separators (en-US, deterministic)', () => {
      expect(formatKpiValue(50000, 'number')).toBe('50,000');
      expect(formatKpiValue(1234567, 'number')).toBe('1,234,567');
    });

    it('keeps small integers ungrouped', () => {
      expect(formatKpiValue(42, 'number')).toBe('42');
      expect(formatKpiValue(0, 'number')).toBe('0');
    });

    it('preserves fractional values', () => {
      expect(formatKpiValue(0.33, 'number')).toBe('0.33');
    });
  });

  describe('duration', () => {
    it('renders seconds with one decimal', () => {
      expect(formatKpiValue(12.4, 'duration')).toBe('12.4s');
      expect(formatKpiValue(90, 'duration')).toBe('90.0s');
      expect(formatKpiValue(0, 'duration')).toBe('0.0s');
    });
  });

  describe('null', () => {
    it('renders an em-dash for missing data regardless of format', () => {
      expect(formatKpiValue(null, 'currency')).toBe('—');
      expect(formatKpiValue(null, 'percent')).toBe('—');
      expect(formatKpiValue(null, 'number')).toBe('—');
      expect(formatKpiValue(null, 'duration')).toBe('—');
    });
  });
});
