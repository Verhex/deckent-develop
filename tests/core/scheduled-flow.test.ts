import { describe, it, expect } from 'vitest';
import {
  parseCronExpr,
  nextRun,
} from '../../src/core/scheduled-flow.js';
import type { ScheduledFlow, ParsedCronExpr } from '../../src/core/scheduled-flow.js';

describe('parseCronExpr', () => {
  it('parses a valid every-minute expression', () => {
    const result: ParsedCronExpr = parseCronExpr('* * * * *');
    expect(result.minute).toBe('*');
    expect(result.hour).toBe('*');
    expect(result.dayOfMonth).toBe('*');
    expect(result.month).toBe('*');
    expect(result.dayOfWeek).toBe('*');
  });

  it('parses a specific scheduled expression', () => {
    const result = parseCronExpr('30 9 * * 1-5');
    expect(result.minute).toBe('30');
    expect(result.hour).toBe('9');
    expect(result.dayOfWeek).toBe('1-5');
  });

  it('parses step expressions', () => {
    const result = parseCronExpr('*/5 * * * *');
    expect(result.minute).toBe('*/5');
  });

  it('rejects expression with wrong number of fields', () => {
    expect(() => parseCronExpr('* * * *')).toThrow('expected 5 fields');
    expect(() => parseCronExpr('* * * * * *')).toThrow('expected 5 fields');
  });

  it('rejects out-of-range minute', () => {
    expect(() => parseCronExpr('60 * * * *')).toThrow('Invalid minute field');
  });

  it('rejects out-of-range hour', () => {
    expect(() => parseCronExpr('* 24 * * *')).toThrow('Invalid hour field');
  });

  it('rejects empty expression', () => {
    expect(() => parseCronExpr('')).toThrow();
  });
});

describe('nextRun', () => {
  it('returns a future date after the from date', () => {
    const from = new Date('2026-01-01T10:00:00.000Z');
    const result = nextRun('* * * * *', from);
    expect(result.getTime()).toBeGreaterThan(from.getTime());
  });

  it('advances to the correct target minute', () => {
    const from = new Date('2026-01-01T10:00:00.000Z');
    const result = nextRun('30 * * * *', from);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it('uses current time when no from date is given', () => {
    const before = new Date();
    const result = nextRun('* * * * *');
    expect(result.getTime()).toBeGreaterThan(before.getTime());
  });

  it('returns seconds and milliseconds zeroed', () => {
    const from = new Date('2026-01-01T10:05:30.500Z');
    const result = nextRun('* * * * *', from);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  // --- Full 5-field tests ---

  it('honors the hour field', () => {
    const from = new Date('2026-01-01T10:30:00.000Z');
    const result = nextRun('0 14 * * *', from);
    expect(result.toISOString()).toBe('2026-01-01T14:00:00.000Z');
  });

  it('advances to the next day when hour has already passed', () => {
    const from = new Date('2026-01-01T15:00:00.000Z');
    const result = nextRun('0 9 * * *', from);
    expect(result.toISOString()).toBe('2026-01-02T09:00:00.000Z');
  });

  it('honors the day-of-month field', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const result = nextRun('0 0 15 * *', from);
    expect(result.getUTCDate()).toBe(15);
    expect(result.getUTCMonth()).toBe(0); // January
  });

  it('advances month when day-of-month has already passed', () => {
    const from = new Date('2026-01-20T00:00:00.000Z');
    const result = nextRun('0 0 10 * *', from);
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(10);
  });

  it('honors the month field', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const result = nextRun('0 0 1 3 *', from);
    expect(result.getUTCMonth()).toBe(2); // March (0-indexed)
    expect(result.getUTCDate()).toBe(1);
  });

  it('honors the day-of-week field (Monday-Friday)', () => {
    // 2026-01-03 is a Saturday
    const from = new Date('2026-01-03T00:00:00.000Z');
    const result = nextRun('0 9 * * 1-5', from);
    const dow = result.getUTCDay();
    expect(dow).toBeGreaterThanOrEqual(1);
    expect(dow).toBeLessThanOrEqual(5);
    expect(result.getUTCHours()).toBe(9);
  });

  it('treats dow=7 as Sunday alias', () => {
    // 2026-01-02 is a Friday
    const from = new Date('2026-01-02T00:00:00.000Z');
    const result = nextRun('0 0 * * 7', from);
    expect(result.getUTCDay()).toBe(0); // Sunday
  });

  it('honors step expression */5 for minutes', () => {
    const from = new Date('2026-01-01T10:03:00.000Z');
    const result = nextRun('*/5 * * * *', from);
    expect(result.getUTCMinutes()).toBe(5);
  });

  it('honors step expression */2 for hours', () => {
    const from = new Date('2026-01-01T01:00:00.000Z');
    const result = nextRun('0 */2 * * *', from);
    expect(result.getUTCHours()).toBe(2);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('honors range in minute field', () => {
    const from = new Date('2026-01-01T10:09:00.000Z');
    const result = nextRun('10-15 * * * *', from);
    expect(result.getUTCMinutes()).toBe(10);
  });

  it('honors comma list in minute field', () => {
    const from = new Date('2026-01-01T10:06:00.000Z');
    const result = nextRun('5,15,45 * * * *', from);
    expect(result.getUTCMinutes()).toBe(15);
  });

  it('throws for impossible date expression', () => {
    // Feb 31 does not exist
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(() => nextRun('0 0 31 2 *', from)).toThrow('no match found within 1 year');
  });
});

describe('ScheduledFlow type', () => {
  it('constructs a ScheduledFlow object with tenantId', () => {
    const flow: ScheduledFlow = {
      id: 'flow-001',
      cronExpr: '0 9 * * 1-5',
      action: 'deckent:start',
      tenantId: 'acme',
      enabled: true,
    };
    expect(flow.tenantId).toBe('acme');
    expect(flow.id).toBe('flow-001');
    expect(flow.enabled).toBe(true);
  });

  it('allows optional createdAt field', () => {
    const flow: ScheduledFlow = {
      id: 'flow-002',
      cronExpr: '* * * * *',
      action: 'deckent:status',
      tenantId: 'local',
      enabled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(flow.createdAt).toBeDefined();
  });

  it('allows an optional IANA timezone', () => {
    const flow: ScheduledFlow = {
      id: 'flow-tz', cronExpr: '0 9 * * *', action: 'run',
      tenantId: 'local', enabled: true, timezone: 'Europe/Istanbul',
    };
    expect(flow.timezone).toBe('Europe/Istanbul');
  });
});
