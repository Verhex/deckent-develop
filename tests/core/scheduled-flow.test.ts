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
    expect(result.getMinutes()).toBe(30);
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
});
