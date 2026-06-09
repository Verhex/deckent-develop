// Full 5-field cron evaluator for the autonomous engine.
// Re-uses parseCronExpr/ParsedCronExpr/ScheduledFlow from core; overrides nextRun with
// complete minute/hour/day-of-month/month/day-of-week support (ranges, lists, steps).
export type { ParsedCronExpr, ScheduledFlow } from '../../core/scheduled-flow.js';

import { parseCronExpr } from '../../core/scheduled-flow.js';
export { parseCronExpr };

// Returns true if value satisfies a single cron sub-part such as "*", "5",
// "1-5", or a step expression like "star/5" or "1-30/2".
// fieldMin: minimum allowed value for this field (0 for minute/hour/dow, 1 for dom/month)
function matchesPart(part: string, value: number, fieldMin: number): boolean {
  const slashIdx = part.indexOf('/');
  let base: string;
  let step: number;
  if (slashIdx !== -1) {
    base = part.slice(0, slashIdx);
    step = parseInt(part.slice(slashIdx + 1), 10);
    if (!Number.isInteger(step) || step < 1) return false;
  } else {
    base = part;
    step = 1;
  }

  let lo: number;
  let hi: number;
  if (base === '*') {
    lo = fieldMin;
    hi = Infinity;
  } else {
    const dashIdx = base.indexOf('-');
    if (dashIdx !== -1) {
      lo = parseInt(base.slice(0, dashIdx), 10);
      hi = parseInt(base.slice(dashIdx + 1), 10);
    } else {
      lo = parseInt(base, 10);
      hi = lo;
    }
  }

  if (value < lo || value > hi) return false;
  return (value - lo) % step === 0;
}

// Returns true if value matches any comma-separated part of a cron field.
function matchesField(field: string, value: number, fieldMin: number): boolean {
  if (field === '*') return true;
  for (const part of field.split(',')) {
    if (matchesPart(part, value, fieldMin)) return true;
  }
  return false;
}

// Returns true if a JS day-of-week (0=Sun...6=Sat from getUTCDay()) matches
// the cron day-of-week field. Handles the cron convention that 7 is an alias
// for Sunday (same as 0).
function matchesDayOfWeek(field: string, jsDay: number): boolean {
  if (field === '*') return true;
  for (const part of field.split(',')) {
    if (matchesPart(part, jsDay, 0)) return true;
    // 0 (Sun) and 7 (Sun alias) are interchangeable in cron
    if (jsDay === 0 && matchesPart(part, 7, 0)) return true;
  }
  return false;
}

/**
 * Compute the next run time strictly after `from` for a 5-field cron expression.
 *
 * Supports all standard cron syntax: wildcards, exact values, ranges (1-5),
 * comma-separated lists (1,3,5), and step expressions (every-N with slash).
 *
 * Day-of-week: 0 and 7 both represent Sunday. When both day-of-month and
 * day-of-week fields are non-wildcard, either matching satisfies the constraint
 * (standard Unix cron union semantics).
 *
 * All time arithmetic uses UTC for timezone-independent behaviour.
 *
 * @throws if no match is found within one calendar year (pathological guard).
 */
export function nextRun(cronExpr: string, from: Date = new Date()): Date {
  const parsed = parseCronExpr(cronExpr);

  // Advance to the next whole minute after `from`.
  const t = new Date(from);
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() + 1);

  // Hard ceiling: ~1 year of minutes prevents infinite loops on degenerate expressions.
  const MAX_ITER = 366 * 24 * 60;

  for (let i = 0; i < MAX_ITER; i++) {
    // Month check (cron 1-12; JS month is 0-indexed)
    const month = t.getUTCMonth() + 1;
    if (!matchesField(parsed.month, month, 1)) {
      t.setUTCMonth(t.getUTCMonth() + 1, 1); // first day of next month
      t.setUTCHours(0, 0, 0, 0);
      continue;
    }

    // Day check - union semantics when both non-wildcard
    const dom = t.getUTCDate(); // 1-31
    const dow = t.getUTCDay(); // 0=Sun ... 6=Sat
    const domWild = parsed.dayOfMonth === '*';
    const dowWild = parsed.dayOfWeek === '*';

    let dayOk: boolean;
    if (domWild && dowWild) {
      dayOk = true;
    } else if (domWild) {
      dayOk = matchesDayOfWeek(parsed.dayOfWeek, dow);
    } else if (dowWild) {
      dayOk = matchesField(parsed.dayOfMonth, dom, 1);
    } else {
      // Union: either dom or dow satisfies the constraint
      dayOk = matchesField(parsed.dayOfMonth, dom, 1) || matchesDayOfWeek(parsed.dayOfWeek, dow);
    }

    if (!dayOk) {
      t.setUTCDate(t.getUTCDate() + 1);
      t.setUTCHours(0, 0, 0, 0);
      continue;
    }

    // Hour check (0-23)
    const hour = t.getUTCHours();
    if (!matchesField(parsed.hour, hour, 0)) {
      t.setUTCHours(t.getUTCHours() + 1, 0, 0, 0);
      continue;
    }

    // Minute check (0-59)
    const minute = t.getUTCMinutes();
    if (!matchesField(parsed.minute, minute, 0)) {
      t.setUTCMinutes(t.getUTCMinutes() + 1, 0, 0);
      continue;
    }

    return new Date(t);
  }

  throw new Error(`nextRun: no match found within 1 year for cron expression "${cronExpr}"`);
}
