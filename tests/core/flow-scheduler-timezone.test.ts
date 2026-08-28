import { describe, expect, it } from 'vitest';
import { nextRun } from '../../src/core/scheduled-flow.js';

describe('timezone-aware nextRun', () => {
  it.each([
    ['winter', '2026-01-01T00:00:00.000Z', '2026-01-01T06:00:00.000Z'],
    ['summer', '2026-07-01T00:00:00.000Z', '2026-07-01T06:00:00.000Z'],
  ])('uses fixed UTC+3 for Istanbul in %s', (_season, from, expected) => {
    expect(nextRun('0 9 * * *', new Date(from), 'Europe/Istanbul').toISOString()).toBe(expected);
  });

  it('skips Berlin spring-forward nonexistent 02:30', () => {
    const result = nextRun(
      '30 2 * * *',
      new Date('2026-03-28T01:30:00.000Z'),
      'Europe/Berlin',
    );
    expect(result.toISOString()).toBe('2026-03-30T00:30:00.000Z');
  });

  it('returns both occurrences of Berlin fall-back repeated 02:30', () => {
    const first = nextRun(
      '30 2 * * *',
      new Date('2026-10-24T00:30:00.000Z'),
      'Europe/Berlin',
    );
    expect(first.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(nextRun('30 2 * * *', first, 'Europe/Berlin').toISOString())
      .toBe('2026-10-25T01:30:00.000Z');
  });

  it('keeps the omitted-timezone path exactly UTC', () => {
    const from = new Date('2026-03-29T01:45:12.000Z');
    expect(nextRun('0 9 * * *', from).toISOString()).toBe('2026-03-29T09:00:00.000Z');
  });
});
