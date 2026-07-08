import { FlowScheduler, type DueDispatch } from './flow-scheduler.js';
import { FlowRegistry } from './flow-registry.js';
import { type EventTrigger, type IncomingEvent } from './event-trigger.js';

export type DispatchCallback = (dispatches: DueDispatch[]) => void;

interface FlowRuntimeOptions {
  intervalMs?: number;
  clock?: () => Date;
  setIntervalFn?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
  /** Source of registered event triggers for the event-dispatch path (FLOW-EVENT-DISPATCH). Defaults to none. */
  listTriggers?: () => EventTrigger[];
  /** Source of incoming events to match against triggers. Defaults to none. */
  listEvents?: () => IncomingEvent[];
}

/**
 * Runtime daemon that wraps FlowScheduler in a periodic tick loop.
 * Injectable clock and timer functions make it fully test-deterministic.
 */
export class FlowRuntime {
  private readonly registry: FlowRegistry;
  private readonly scheduler: FlowScheduler;
  private readonly intervalMs: number;
  private readonly clock: () => Date;
  private readonly setIntervalFn: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  private readonly clearIntervalFn: (id: ReturnType<typeof setInterval>) => void;
  private readonly listTriggers: () => EventTrigger[];
  private readonly listEvents: () => IncomingEvent[];

  private timerId: ReturnType<typeof setInterval> | undefined;

  constructor(registry: FlowRegistry, options: FlowRuntimeOptions = {}) {
    this.registry = registry;
    this.scheduler = new FlowScheduler();
    this.intervalMs = options.intervalMs ?? 60_000;
    this.clock = options.clock ?? (() => new Date());
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
    this.listTriggers = options.listTriggers ?? (() => []);
    this.listEvents = options.listEvents ?? (() => []);
  }

  /** Run a single tick: collect due dispatches (scheduled + event-triggered) and call the callback. */
  tick(callback: DispatchCallback): void {
    const flows = this.registry.listFlows();
    const triggers = this.listTriggers();
    const events = this.listEvents();
    const now = this.clock();
    const dispatches = this.scheduler.collectDue(flows, triggers, events, now);
    callback(dispatches);
  }

  /** Start the periodic tick loop. No-op if already running. */
  start(callback: DispatchCallback): void {
    if (this.timerId !== undefined) return;
    this.timerId = this.setIntervalFn(() => this.tick(callback), this.intervalMs);
  }

  /** Stop the tick loop. No-op if not running. */
  stop(): void {
    if (this.timerId === undefined) return;
    this.clearIntervalFn(this.timerId);
    this.timerId = undefined;
  }

  /** Whether the runtime is currently running. */
  get running(): boolean {
    return this.timerId !== undefined;
  }
}
