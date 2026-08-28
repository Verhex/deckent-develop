import { describe, it, expect, beforeEach } from 'vitest';
import { FlowScheduler } from '../../src/core/flow-scheduler.js';
import type { DueFlow } from '../../src/core/flow-scheduler.js';
import type { ScheduledFlow } from '../../src/core/scheduled-flow.js';

function makeFlow(overrides: Partial<ScheduledFlow> = {}): ScheduledFlow {
  return {
    id: 'flow-001',
    cronExpr: '* * * * *',
    action: 'deckent:start',
    tenantId: 'tenant-a',
    enabled: true,
    ...overrides,
  };
}

describe('FlowScheduler.tick', () => {
  let scheduler: FlowScheduler;

  beforeEach(() => {
    scheduler = new FlowScheduler();
  });

  it('returns due flow when nextRun is in the past', () => {
    const flow = makeFlow({ id: 'f1' });
    const now = new Date('2026-06-01T10:05:00.000Z');
    // lastRunAt defaults to epoch → nextRun = epoch+1min → far in past → due
    const result = scheduler.tick([flow], now);
    expect(result).toHaveLength(1);
    expect(result[0]!.flow.id).toBe('f1');
    expect(result[0]!.nextRun.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it('skips flow whose nextRun is still in the future', () => {
    const flow = makeFlow({ id: 'f2' });
    const now = new Date('2026-06-01T10:05:00.000Z');
    // First tick fires; second tick sets lastRunAt = now → next = now+1min > now
    scheduler.tick([flow], now);
    const result = scheduler.tick([flow], now);
    expect(result).toHaveLength(0);
  });

  it('skips disabled flows regardless of timing', () => {
    const flow = makeFlow({ id: 'f3', enabled: false });
    const now = new Date('2026-06-01T10:05:00.000Z');
    const result = scheduler.tick([flow], now);
    expect(result).toHaveLength(0);
  });

  it('sorts multiple due flows by nextRun ascending', () => {
    // Flow A: lastRun = epoch → nextRun = epoch+1min (earlier)
    // Flow B: lastRun = 2h ago → nextRun = 2h ago + 1min (later than A but still past)
    const now = new Date('2026-06-01T10:05:00.000Z');
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const flowA = makeFlow({ id: 'fA' });
    const flowB = makeFlow({ id: 'fB' });

    // Prime fB's lastRunAt to 2 hours ago by ticking at that point
    scheduler.tick([flowB], twoHoursAgo);

    const result = scheduler.tick([flowA, flowB], now);
    expect(result).toHaveLength(2);
    // fA's nextRun (epoch+1min) comes before fB's nextRun (2h-ago+1min)
    expect(result[0]!.nextRun.getTime()).toBeLessThanOrEqual(result[1]!.nextRun.getTime());
  });

  it('updates lastRunAt so a due flow is not repeated on next tick', () => {
    const flow = makeFlow({ id: 'f5' });
    const now = new Date('2026-06-01T10:05:00.000Z');
    const firstResult = scheduler.tick([flow], now);
    expect(firstResult).toHaveLength(1);
    // Tick again at same time → flow already ran, nextRun = now+1min > now
    const secondResult = scheduler.tick([flow], now);
    expect(secondResult).toHaveLength(0);
  });

  it('triggers again after one minute has elapsed', () => {
    const flow = makeFlow({ id: 'f6', cronExpr: '* * * * *' });
    const now = new Date('2026-06-01T10:05:00.000Z');
    const oneMinuteLater = new Date(now.getTime() + 61 * 1000);
    scheduler.tick([flow], now);
    const result = scheduler.tick([flow], oneMinuteLater);
    expect(result).toHaveLength(1);
  });

  it('uses a flow timezone when computing the next run', () => {
    const flow = makeFlow({
      id: 'istanbul', cronExpr: '0 9 * * *', timezone: 'Europe/Istanbul',
    });
    const firstDay = new Date('2026-01-01T06:00:00.000Z');
    scheduler.tick([flow], firstDay);
    const nextDay = new Date('2026-01-02T06:00:00.000Z');
    expect(scheduler.tick([flow], nextDay)[0]!.nextRun.toISOString())
      .toBe('2026-01-02T06:00:00.000Z');
  });
});

describe('FlowScheduler.reset', () => {
  it('resets lastRunAt so the flow becomes due again', () => {
    const scheduler = new FlowScheduler();
    const flow = makeFlow({ id: 'reset-flow' });
    const now = new Date('2026-06-01T10:05:00.000Z');
    scheduler.tick([flow], now);
    // Without reset, second tick returns nothing
    expect(scheduler.tick([flow], now)).toHaveLength(0);
    // After reset, the flow fires again
    scheduler.reset('reset-flow');
    expect(scheduler.tick([flow], now)).toHaveLength(1);
  });
});

describe('FlowScheduler.missedOccurrences', () => {
  it('returns every missed timezone-aware slot without mutating scheduler state', () => {
    const scheduler = new FlowScheduler();
    const flow = makeFlow({
      id: 'daily-watch',
      cronExpr: '0 9 * * *',
      timezone: 'Europe/Istanbul',
    });

    const after = new Date('2026-08-24T06:00:00.000Z');
    const now = new Date('2026-08-27T06:00:00.000Z');
    const expected = [
      '2026-08-25T06:00:00.000Z',
      '2026-08-26T06:00:00.000Z',
      '2026-08-27T06:00:00.000Z',
    ];

    expect(scheduler.missedOccurrences(flow, after, now)
      .map(({ nextRun: occurrence }) => occurrence.toISOString())).toEqual(expected);
    expect(scheduler.missedOccurrences(flow, after, now)
      .map(({ nextRun: occurrence }) => occurrence.toISOString())).toEqual(expected);
  });

  it('fails closed instead of silently dropping occurrences at its bound', () => {
    const scheduler = new FlowScheduler();
    const flow = makeFlow({ id: 'bounded' });
    expect(() => scheduler.missedOccurrences(
      flow,
      new Date('2026-08-28T09:00:00.000Z'),
      new Date('2026-08-28T09:03:00.000Z'),
      2,
    )).toThrow('exceeded catch-up limit');
  });
});
