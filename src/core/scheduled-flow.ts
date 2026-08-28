import { type DeckentError, ErrorRegistry } from './errors.js';

function scheduledFlowError(message: string): DeckentError {
  return ErrorRegistry.createError('DECKENT_E101', { message });
}

/** Parsed representation of a 5-field cron expression. */
export interface ParsedCronExpr {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

/** A scheduled flow definition for F3 process mode. */
export interface ScheduledFlow {
  id: string;
  cronExpr: string;
  action: string;
  tenantId: string;
  enabled: boolean;
  /** IANA timezone for cron fields. Omitted schedules retain UTC semantics. */
  timezone?: string;
  createdAt?: string;
}

const CRON_FIELD_RE = /^(\*|[0-9,\-*/]+)$/;

function validateField(field: string, min: number, max: number): boolean {
  if (field === '*') return true;
  for (const part of field.split(',')) {
    const step = part.split('/');
    const base = step[0] ?? '';
    const range = base.split('-');
    for (const val of range) {
      if (val === '*') continue;
      const n = Number(val);
      if (!Number.isInteger(n) || n < min || n > max) return false;
    }
    if (step[1] !== undefined) {
      const s = Number(step[1]);
      if (!Number.isInteger(s) || s < 1) return false;
    }
  }
  return true;
}

/**
 * Parse and validate a 5-field cron expression.
 * Throws if the expression is invalid.
 * Format: "minute hour day-of-month month day-of-week"
 */
export function parseCronExpr(expr: string): ParsedCronExpr {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw scheduledFlowError(`Invalid cron expression "${expr}": expected 5 fields, got ${fields.length}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [string, string, string, string, string];

  for (const field of fields) {
    if (!CRON_FIELD_RE.test(field)) {
      throw scheduledFlowError(`Invalid cron field "${field}" in expression "${expr}"`);
    }
  }

  if (!validateField(minute, 0, 59)) throw scheduledFlowError(`Invalid minute field "${minute}"`);
  if (!validateField(hour, 0, 23)) throw scheduledFlowError(`Invalid hour field "${hour}"`);
  if (!validateField(dayOfMonth, 1, 31)) throw scheduledFlowError(`Invalid day-of-month field "${dayOfMonth}"`);
  if (!validateField(month, 1, 12)) throw scheduledFlowError(`Invalid month field "${month}"`);
  if (!validateField(dayOfWeek, 0, 7)) throw scheduledFlowError(`Invalid day-of-week field "${dayOfWeek}"`);

  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

// Returns true if value satisfies a single cron sub-part such as "*", "5",
// "1-5", or a step expression like "*/5" or "1-30/2".
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
// the cron day-of-week field. Handles cron convention that 7 is an alias for Sunday (same as 0).
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
 * comma-separated lists (1,3,5), and step expressions (*\/n, a-b\/n).
 *
 * Day-of-week: 0 and 7 both represent Sunday. When both day-of-month and
 * day-of-week fields are non-wildcard, either matching satisfies the constraint
 * (standard Unix cron union semantics).
 *
 * All time arithmetic uses UTC for timezone-independent behaviour.
 *
 * @throws if no match is found within one calendar year (pathological guard).
 */
export function nextRun(cronExpr: string, from: Date = new Date(), timezone?: string): Date {
  const parsed = parseCronExpr(cronExpr);

  if (timezone !== undefined) {
    return nextRunInTimezone(parsed, cronExpr, from, timezone);
  }

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

  throw scheduledFlowError(`nextRun: no match found within 1 year for cron expression "${cronExpr}"`);
}

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function nextRunInTimezone(
  parsed: ParsedCronExpr,
  cronExpr: string,
  from: Date,
  timezone: string,
): Date {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error: unknown) {
    throw scheduledFlowError(
      `Invalid timezone "${timezone}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const candidate = new Date(from);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  const maxIterations = 366 * 24 * 60;

  for (let i = 0; i < maxIterations; i++) {
    const local = localDateTime(formatter, candidate);
    const dow = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
    const domWild = parsed.dayOfMonth === '*';
    const dowWild = parsed.dayOfWeek === '*';
    const dayMatches = domWild && dowWild
      ? true
      : domWild
        ? matchesDayOfWeek(parsed.dayOfWeek, dow)
        : dowWild
          ? matchesField(parsed.dayOfMonth, local.day, 1)
          : matchesField(parsed.dayOfMonth, local.day, 1)
            || matchesDayOfWeek(parsed.dayOfWeek, dow);

    if (
      matchesField(parsed.month, local.month, 1)
      && dayMatches
      && matchesField(parsed.hour, local.hour, 0)
      && matchesField(parsed.minute, local.minute, 0)
    ) {
      return new Date(candidate);
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  throw scheduledFlowError(
    `nextRun: no match found within 1 year for cron expression "${cronExpr}" in timezone "${timezone}"`,
  );
}

function localDateTime(formatter: Intl.DateTimeFormat, date: Date): LocalDateTime {
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
  };
}
