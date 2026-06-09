import { describe, it, expect } from 'vitest';
import { nextRun, parseCronExpr } from '../../../src/orchestra/autonomous/scheduled-flow.js';

// All dates use UTC-based construction to stay timezone-agnostic (CI-hermetic).

// Helper: build a UTC date from parts
function utcDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}

describe('nextRun — full 5-field cron evaluation', () => {
  // ── Basic ──────────────────────────────────────────────────────────────────

  it('returns a future date strictly after `from`', () => {
    const from = utcDate(2026, 1, 1, 10, 0);
    const result = nextRun('* * * * *', from);
    expect(result.getTime()).toBeGreaterThan(from.getTime());
  });

  it('zeros seconds and milliseconds', () => {
    const from = utcDate(2026, 1, 1, 10, 5);
    const result = nextRun('* * * * *', from);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });

  it('advances exactly 1 minute for every-minute wildcard expression', () => {
    const from = utcDate(2026, 1, 1, 10, 30);
    const result = nextRun('* * * * *', from);
    expect(result.getUTCHours()).toBe(10);
    expect(result.getUTCMinutes()).toBe(31);
  });

  // ── Minute field ──────────────────────────────────────────────────────────

  it('advances to the target minute within the same hour', () => {
    const from = utcDate(2026, 1, 1, 10, 0);
    const result = nextRun('30 * * * *', from);
    expect(result.getUTCMinutes()).toBe(30);
    expect(result.getUTCHours()).toBe(10);
  });

  it('wraps to the next hour when target minute has already passed', () => {
    const from = utcDate(2026, 1, 1, 10, 45);
    const result = nextRun('30 * * * *', from);
    expect(result.getUTCMinutes()).toBe(30);
    expect(result.getUTCHours()).toBe(11);
  });

  // ── Step on minute ────────────────────────────────────────────────────────

  it('evaluates */5 step — lands on the next multiple of 5', () => {
    const from = utcDate(2026, 1, 1, 10, 2);
    const result = nextRun('*/5 * * * *', from);
    expect(result.getUTCMinutes()).toBe(5);
    expect(result.getUTCHours()).toBe(10);
  });

  it('evaluates */5 step from minute 0 — next is minute 5', () => {
    const from = utcDate(2026, 1, 1, 10, 0);
    const result = nextRun('*/5 * * * *', from);
    expect(result.getUTCMinutes()).toBe(5);
  });

  it('evaluates */15 step', () => {
    const from = utcDate(2026, 1, 1, 10, 16);
    const result = nextRun('*/15 * * * *', from);
    expect(result.getUTCMinutes()).toBe(30);
  });

  // ── Hour field ────────────────────────────────────────────────────────────

  it('waits until the target hour when already past it', () => {
    const from = utcDate(2026, 1, 1, 10, 0); // 10:00
    const result = nextRun('0 9 * * *', from); // daily at 09:00
    expect(result.getUTCHours()).toBe(9);
    expect(result.getUTCDate()).toBe(2); // next day
  });

  it('fires at the target hour on the same day when not yet reached', () => {
    const from = utcDate(2026, 1, 1, 8, 0); // 08:00
    const result = nextRun('0 9 * * *', from); // daily at 09:00
    expect(result.getUTCHours()).toBe(9);
    expect(result.getUTCDate()).toBe(1); // same day
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('evaluates */3 step on hour', () => {
    const from = utcDate(2026, 1, 1, 4, 0); // 04:00
    const result = nextRun('0 */3 * * *', from); // every 3 hours at :00
    expect(result.getUTCHours()).toBe(6);
    expect(result.getUTCMinutes()).toBe(0);
  });

  // ── Day-of-week ────────────────────────────────────────────────────────────

  it('advances to the next weekday for 1-5 (Mon–Fri)', () => {
    // 2026-01-04 is a Sunday (dow=0)
    const from = utcDate(2026, 1, 4, 10, 0); // Sunday
    const result = nextRun('0 9 * * 1-5', from);
    expect(result.getUTCDay()).toBeGreaterThanOrEqual(1); // Mon–Fri
    expect(result.getUTCDay()).toBeLessThanOrEqual(5);
    expect(result.getUTCHours()).toBe(9);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('stays within current weekday if hour not yet reached', () => {
    // 2026-01-05 is Monday (dow=1)
    const from = utcDate(2026, 1, 5, 8, 0); // Monday at 08:00
    const result = nextRun('0 9 * * 1-5', from);
    expect(result.getUTCDay()).toBe(1); // still Monday
    expect(result.getUTCHours()).toBe(9);
  });

  it('supports Sunday using cron alias 7', () => {
    // 2026-01-05 is Monday — next Sunday is 2026-01-11
    const from = utcDate(2026, 1, 5, 12, 0);
    const result = nextRun('0 0 * * 7', from);
    expect(result.getUTCDay()).toBe(0); // Sunday (JS 0)
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('supports Sunday using cron value 0', () => {
    const from = utcDate(2026, 1, 5, 12, 0); // Monday
    const result = nextRun('0 0 * * 0', from);
    expect(result.getUTCDay()).toBe(0); // Sunday
  });

  it('supports a comma-separated day-of-week list (Mon, Wed, Fri)', () => {
    // 2026-01-06 is Tuesday — next match is Wednesday (dow=3)
    const from = utcDate(2026, 1, 6, 10, 0); // Tuesday
    const result = nextRun('0 9 * * 1,3,5', from);
    expect([1, 3, 5]).toContain(result.getUTCDay()); // Mon, Wed, or Fri
    expect(result.getUTCHours()).toBe(9);
  });

  // ── Day-of-month ──────────────────────────────────────────────────────────

  it('waits for the 15th of the month', () => {
    const from = utcDate(2026, 1, 16, 0, 0); // Jan 16 → next is Feb 15
    const result = nextRun('0 0 15 * *', from);
    expect(result.getUTCDate()).toBe(15);
    expect(result.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(result.getUTCHours()).toBe(0);
  });

  it('returns same day when dom matches and time not yet reached', () => {
    const from = utcDate(2026, 1, 15, 8, 0); // Jan 15 at 08:00
    const result = nextRun('0 9 15 * *', from);
    expect(result.getUTCDate()).toBe(15);
    expect(result.getUTCMonth()).toBe(0); // still January
    expect(result.getUTCHours()).toBe(9);
  });

  // ── Month field ───────────────────────────────────────────────────────────

  it('waits for the target month (March)', () => {
    const from = utcDate(2026, 4, 1, 0, 0); // April — past March
    const result = nextRun('0 0 1 3 *', from); // March 1st at midnight
    expect(result.getUTCMonth()).toBe(2); // March (0-indexed)
    expect(result.getUTCFullYear()).toBe(2027); // next year
    expect(result.getUTCDate()).toBe(1);
    expect(result.getUTCHours()).toBe(0);
  });

  it('fires in the same month when not yet past target month', () => {
    const from = utcDate(2026, 2, 28, 23, 0); // Feb 28
    const result = nextRun('0 0 1 3 *', from); // March 1st midnight
    expect(result.getUTCMonth()).toBe(2); // March
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCDate()).toBe(1);
  });

  // ── Ranges and steps combined ─────────────────────────────────────────────

  it('evaluates minute range with step: 0-30/10', () => {
    const from = utcDate(2026, 1, 1, 10, 0); // 10:00
    const result = nextRun('0-30/10 * * * *', from); // 0,10,20,30 of each hour
    expect(result.getUTCMinutes()).toBe(10);
    expect(result.getUTCHours()).toBe(10);
  });

  it('evaluates step on hour range: 8-18/2', () => {
    const from = utcDate(2026, 1, 1, 8, 0); // 08:00
    const result = nextRun('0 8-18/2 * * *', from); // 8,10,12,14,16,18
    expect(result.getUTCHours()).toBe(10);
    expect(result.getUTCMinutes()).toBe(0);
  });

  // ── Union semantics: both dom and dow non-wildcard ─────────────────────────

  it('returns the closer of dom and dow when both are specified', () => {
    // Expression "0 0 1 * 5" = midnight on the 1st of every month OR every Friday
    // from 2026-01-06 (Tuesday), next Friday = 2026-01-09; next 1st = 2026-02-01
    // So the Friday should win.
    const from = utcDate(2026, 1, 6, 1, 0); // Tuesday Jan 6
    const result = nextRun('0 0 1 * 5', from);
    // Should be Friday Jan 9
    expect(result.getUTCDay()).toBe(5); // Friday
    expect(result.getUTCDate()).toBe(9);
    expect(result.getUTCMonth()).toBe(0); // January
  });

  // ── Complex expressions ───────────────────────────────────────────────────

  it('evaluates "30 9 * * 1-5" — weekdays at 09:30', () => {
    // 2026-01-12 Monday 10:00 → next hit is Tuesday Jan 13 at 09:30
    const from = utcDate(2026, 1, 12, 10, 0);
    const result = nextRun('30 9 * * 1-5', from);
    expect(result.getUTCDay()).toBe(2); // Tuesday
    expect(result.getUTCHours()).toBe(9);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it('uses current time when no `from` is provided', () => {
    const before = new Date();
    const result = nextRun('* * * * *');
    expect(result.getTime()).toBeGreaterThan(before.getTime());
  });
});

// Verify re-exports from core still work
describe('re-exported parseCronExpr', () => {
  it('is available and works correctly from the autonomous module', () => {
    const parsed = parseCronExpr('30 9 * * 1-5');
    expect(parsed.minute).toBe('30');
    expect(parsed.hour).toBe('9');
    expect(parsed.dayOfWeek).toBe('1-5');
  });
});
