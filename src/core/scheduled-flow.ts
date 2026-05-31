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
    throw new Error(`Invalid cron expression "${expr}": expected 5 fields, got ${fields.length}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [string, string, string, string, string];

  for (const field of fields) {
    if (!CRON_FIELD_RE.test(field)) {
      throw new Error(`Invalid cron field "${field}" in expression "${expr}"`);
    }
  }

  if (!validateField(minute, 0, 59)) throw new Error(`Invalid minute field "${minute}"`);
  if (!validateField(hour, 0, 23)) throw new Error(`Invalid hour field "${hour}"`);
  if (!validateField(dayOfMonth, 1, 31)) throw new Error(`Invalid day-of-month field "${dayOfMonth}"`);
  if (!validateField(month, 1, 12)) throw new Error(`Invalid month field "${month}"`);
  if (!validateField(dayOfWeek, 0, 7)) throw new Error(`Invalid day-of-week field "${dayOfWeek}"`);

  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

/**
 * Compute the next run time after `from` for a given cron expression.
 * This is a skeleton implementation: returns the next whole-minute boundary
 * after `from` that matches the minute field (full scheduling deferred to F3 runtime).
 */
export function nextRun(cronExpr: string, from: Date = new Date()): Date {
  const parsed = parseCronExpr(cronExpr);
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  if (parsed.minute !== '*') {
    const targetMinute = parseInt(parsed.minute, 10);
    if (!Number.isNaN(targetMinute)) {
      while (next.getMinutes() !== targetMinute) {
        next.setMinutes(next.getMinutes() + 1);
      }
    }
  }

  return next;
}
