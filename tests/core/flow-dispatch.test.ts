import { describe, it, expect, beforeEach } from 'vitest';
import { FlowScheduler } from '../../src/core/flow-scheduler.js';
import type { ScheduledFlow } from '../../src/core/scheduled-flow.js';
import type { EventTrigger, IncomingEvent } from '../../src/core/event-trigger.js';

const now = new Date('2026-01-01T12:00:00.000Z');

const makeFlow = (id: string, enabled = true): ScheduledFlow => ({
  id,
  cronExpr: '* * * * *',
  action: 'run',
  tenantId: 'tenant-1',
  enabled,
});

const makeTrigger = (id: string, eventType: string, source: string, tenantId = 'tenant-1'): EventTrigger => ({
  id,
  eventType,
  source,
  action: 'dispatch',
  tenantId,
  enabled: true,
});

const makeEvent = (eventType: string, source: string, tenantId = 'tenant-1'): IncomingEvent => ({
  eventType,
  source,
  tenantId,
});

describe('FlowScheduler.collectDue', () => {
  let scheduler: FlowScheduler;

  beforeEach(() => {
    scheduler = new FlowScheduler();
  });

  it('returns scheduled due flows when nextRun ≤ now', () => {
    const flow = makeFlow('flow-1');
    const result = scheduler.collectDue([flow], [], [], now);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'scheduled', flow });
  });

  it('returns event-triggered dispatches when event matches trigger', () => {
    const trigger = makeTrigger('trig-1', 'deploy', 'ci');
    const event = makeEvent('deploy', 'ci');

    const result = scheduler.collectDue([], [trigger], [event], now);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'event', trigger, event });
  });

  it('returns both scheduled and event-triggered dispatches combined', () => {
    const flow = makeFlow('flow-2');
    const trigger = makeTrigger('trig-2', 'push', 'github');
    const event = makeEvent('push', 'github');

    const result = scheduler.collectDue([flow], [trigger], [event], now);

    expect(result).toHaveLength(2);
    expect(result.some(d => d.kind === 'scheduled')).toBe(true);
    expect(result.some(d => d.kind === 'event')).toBe(true);
  });

  it('returns empty array when no flows are due and no events match', () => {
    const disabledFlow = makeFlow('flow-3', false);
    const trigger = makeTrigger('trig-3', 'deploy', 'ci');
    const nonMatchingEvent = makeEvent('push', 'github'); // different type/source

    const result = scheduler.collectDue([disabledFlow], [trigger], [nonMatchingEvent], now);

    expect(result).toHaveLength(0);
  });

  it('returns multiple event dispatches for multiple matching triggers', () => {
    const t1 = makeTrigger('trig-a', 'deploy', 'ci');
    const t2 = makeTrigger('trig-b', 'deploy', 'ci');
    const event = makeEvent('deploy', 'ci');

    const result = scheduler.collectDue([], [t1, t2], [event], now);

    expect(result).toHaveLength(2);
    expect(result.every(d => d.kind === 'event')).toBe(true);
  });

  it('does not match trigger from a different tenant', () => {
    const trigger = makeTrigger('trig-x', 'deploy', 'ci', 'tenant-A');
    const event = makeEvent('deploy', 'ci', 'tenant-B');

    const result = scheduler.collectDue([], [trigger], [event], now);

    expect(result).toHaveLength(0);
  });
});
