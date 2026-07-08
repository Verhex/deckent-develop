import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DueDispatch } from './flow-scheduler.js';

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

/** Approval status of a pending event-triggered dispatch (ROADMAP FLOW-EVENT-DISPATCH). */
export type PendingEventDispatchStatus = 'pending' | 'approved';

/**
 * A pending, approval-gated dispatch created when an EventTrigger matches an
 * IncomingEvent. Event-triggered dispatch always requires human approval —
 * mirrors the human-in-the-loop guard already enforced for scheduled
 * self-dispatch (self-dispatch.ts PendingDispatchQueue). Approving only flips
 * `status`; it never auto-runs the underlying action.
 */
export interface PendingEventDispatch {
  id: string;
  trigger: EventTrigger;
  event: IncomingEvent;
  enqueuedAt: string;
  status: PendingEventDispatchStatus;
  approvedAt?: string;
}

/** Build a pending event-dispatch entry for a matched trigger/event pair. */
export function createPendingEventDispatch(
  trigger: EventTrigger,
  event: IncomingEvent,
  id: string,
  clock: () => Date = () => new Date(),
): PendingEventDispatch {
  return {
    id,
    trigger,
    event,
    enqueuedAt: clock().toISOString(),
    status: 'pending',
  };
}

// ─── Event-dispatch approval queue (FLOW-EVENT-DISPATCH) ───────────────────
// Event-triggered dispatches (DueDispatch kind==='event', produced once
// FlowRuntime.tick is given real listTriggers/listEvents sources — see
// flow-runtime.ts) always require human approval before the matched flow
// proceeds, mirroring the scheduled self-dispatch human-in-the-loop gate
// (self-dispatch.ts PendingDispatchQueue). Persisted to disk (not in-memory)
// so a separate `deckent flow approve <id>` invocation can read and flip an
// entry.

/** Path of the persisted pending event-dispatch approval queue. */
export function pendingEventDispatchPath(projectRoot: string): string {
  return join(projectRoot, '.deckent', 'flows', 'pending-event-dispatch.json');
}

function readEventDispatchQueue(path: string): PendingEventDispatch[] {
  try {
    if (!existsSync(path)) return [];
    return JSON.parse(readFileSync(path, 'utf-8')) as PendingEventDispatch[];
  } catch {
    return []; // corrupt/unreadable queue -> start fresh, never crash the caller
  }
}

function writeEventDispatchQueue(path: string, queue: PendingEventDispatch[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(queue, null, 2), 'utf-8');
}

/**
 * Enqueue newly matched event-triggered dispatches from a FlowRuntime tick
 * onto the persisted pending-approval queue. Non-event dispatches are
 * ignored. Returns the newly-added entries (empty, and no file write, when
 * none matched).
 */
export function enqueuePendingEventDispatches(
  projectRoot: string,
  dispatches: DueDispatch[],
  deps: { clock?: () => Date } = {},
): PendingEventDispatch[] {
  const eventDispatches = dispatches.filter(
    (d): d is Extract<DueDispatch, { kind: 'event' }> => d.kind === 'event',
  );
  if (eventDispatches.length === 0) return [];

  const path = pendingEventDispatchPath(projectRoot);
  const queue = readEventDispatchQueue(path);
  const clock = deps.clock ?? (() => new Date());

  const added: PendingEventDispatch[] = [];
  for (const d of eventDispatches) {
    const id = `evt-${queue.length + added.length + 1}`;
    added.push(createPendingEventDispatch(d.trigger, d.event, id, clock));
  }
  writeEventDispatchQueue(path, [...queue, ...added]);
  return added;
}

/** List event-dispatch entries still awaiting human approval. */
export function listPendingEventDispatches(projectRoot: string): PendingEventDispatch[] {
  return readEventDispatchQueue(pendingEventDispatchPath(projectRoot)).filter(
    e => e.status === 'pending',
  );
}

/**
 * The "approveDispatch reader": read the persisted pending event-dispatch
 * queue, flip entry `id` pending -> approved, and persist. Returns the
 * updated entry, or null when the id is unknown or already approved
 * (idempotent guard). Approving does NOT auto-run anything further — it only
 * unblocks the entry so the flow can proceed; invoking the actual action
 * stays the caller's responsibility, same contract as scheduled self-dispatch
 * (self-dispatch.ts PendingDispatchQueue.approveDispatch).
 */
export function approveDispatch(
  projectRoot: string,
  id: string,
  clock: () => Date = () => new Date(),
): PendingEventDispatch | null {
  const path = pendingEventDispatchPath(projectRoot);
  const queue = readEventDispatchQueue(path);
  const entry = queue.find(e => e.id === id);
  if (!entry || entry.status !== 'pending') return null;
  entry.status = 'approved';
  entry.approvedAt = clock().toISOString();
  writeEventDispatchQueue(path, queue);
  return entry;
}
