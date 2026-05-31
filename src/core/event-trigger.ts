/** An event-driven trigger definition for F3 process mode (ROADMAP F3-003). */
export interface EventTrigger {
  id: string;
  eventType: string;
  source: string;
  action: string;
  tenantId: string;
  enabled: boolean;
}

/** An incoming event to be matched against registered triggers. */
export interface IncomingEvent {
  eventType: string;
  source: string;
  tenantId: string;
  payload?: unknown;
}

/**
 * Match an incoming event against a list of registered triggers.
 * Returns all triggers that are enabled, belong to the same tenant,
 * and match the event's type and source.
 */
export function matchTrigger(event: IncomingEvent, triggers: EventTrigger[]): EventTrigger[] {
  return triggers.filter(
    t =>
      t.enabled &&
      t.tenantId === event.tenantId &&
      t.eventType === event.eventType &&
      t.source === event.source,
  );
}
