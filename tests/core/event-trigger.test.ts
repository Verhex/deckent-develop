import { describe, it, expect } from 'vitest';
import { matchTrigger } from '../../src/core/event-trigger.js';
import type { EventTrigger, IncomingEvent } from '../../src/core/event-trigger.js';

const baseTrigger: EventTrigger = {
  id: 'trig-001',
  eventType: 'webhook.push',
  source: 'github',
  action: 'run-ci',
  tenantId: 'acme',
  enabled: true,
};

const baseEvent: IncomingEvent = {
  eventType: 'webhook.push',
  source: 'github',
  tenantId: 'acme',
};

describe('matchTrigger', () => {
  it('returns matching trigger on exact match', () => {
    const result = matchTrigger(baseEvent, [baseTrigger]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(baseTrigger);
  });

  it('returns empty array when eventType does not match', () => {
    const event: IncomingEvent = { ...baseEvent, eventType: 'deploy.complete' };
    expect(matchTrigger(event, [baseTrigger])).toHaveLength(0);
  });

  it('excludes triggers from different tenantId', () => {
    const event: IncomingEvent = { ...baseEvent, tenantId: 'other-tenant' };
    expect(matchTrigger(event, [baseTrigger])).toHaveLength(0);
  });

  it('skips disabled triggers', () => {
    const disabled: EventTrigger = { ...baseTrigger, enabled: false };
    expect(matchTrigger(baseEvent, [disabled])).toHaveLength(0);
  });

  it('returns empty array when source does not match', () => {
    const event: IncomingEvent = { ...baseEvent, source: 'gitlab' };
    expect(matchTrigger(event, [baseTrigger])).toHaveLength(0);
  });

  it('matches multiple triggers for same event', () => {
    const second: EventTrigger = { ...baseTrigger, id: 'trig-002', action: 'notify-slack' };
    const result = matchTrigger(baseEvent, [baseTrigger, second]);
    expect(result).toHaveLength(2);
  });
});
