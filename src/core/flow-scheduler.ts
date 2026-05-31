import type { ScheduledFlow } from './scheduled-flow.js';
import { nextRun } from './scheduled-flow.js';
import { type EventTrigger, type IncomingEvent, matchTrigger } from './event-trigger.js';

/** A flow that is due to run at the given tick. */
export interface DueFlow {
  flow: ScheduledFlow;
  nextRun: Date;
}

/** A unified dispatch item — either a scheduled flow or an event-matched trigger. */
export type DueDispatch =
  | { kind: 'scheduled'; flow: ScheduledFlow; nextRun: Date }
  | { kind: 'event'; trigger: EventTrigger; event: IncomingEvent };

/**
 * Pure tick-based scheduler for registered flows.
 * Call tick(flows, now) periodically — no setInterval, no I/O.
 * Unified trigger source: cron-based (ScheduledFlow) and event-based
 * (EventTrigger from event-trigger.ts) share DueFlow as the dispatch type.
 */
export class FlowScheduler {
  private readonly lastRunAt = new Map<string, Date>();

  /**
   * Scan flows and return those whose nextRun is ≤ now.
   * Updates internal lastRunAt state for each due flow.
   * Results are sorted by nextRun ascending.
   */
  tick(flows: ScheduledFlow[], now: Date): DueFlow[] {
    const due: DueFlow[] = [];

    for (const flow of flows) {
      if (!flow.enabled) continue;

      const last = this.lastRunAt.get(flow.id) ?? new Date(0);
      const next = nextRun(flow.cronExpr, last);

      if (next <= now) {
        due.push({ flow, nextRun: next });
        this.lastRunAt.set(flow.id, now);
      }
    }

    return due.sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime());
  }

  /**
   * Collect all dispatch items due at `now`:
   * - Scheduled flows whose nextRun ≤ now
   * - Event-triggered flows matched by matchTrigger against incoming events
   */
  collectDue(
    flows: ScheduledFlow[],
    triggers: EventTrigger[],
    events: IncomingEvent[],
    now: Date,
  ): DueDispatch[] {
    const dueFlows: DueDispatch[] = this.tick(flows, now).map(df => ({
      kind: 'scheduled' as const,
      flow: df.flow,
      nextRun: df.nextRun,
    }));

    const dueEvents: DueDispatch[] = [];
    for (const event of events) {
      for (const trigger of matchTrigger(event, triggers)) {
        dueEvents.push({ kind: 'event', trigger, event });
      }
    }

    return [...dueFlows, ...dueEvents];
  }

  /** Reset state for a specific flow (e.g. after manual trigger). */
  reset(flowId: string): void {
    this.lastRunAt.delete(flowId);
  }
}
