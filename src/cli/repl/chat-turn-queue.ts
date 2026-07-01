// ═══ ChatTurnQueue — Hermes user-msg bg-completed-work queue ═══════════════
// TERM-2, DIRECTIVES.md Task 9 / MASTER-PLAN row 41.
//
// Hermes rule: work that finishes in the BACKGROUND while a user turn is in
// flight must never be injected mid-turn — it is buffered and only surfaces
// as brand-new turn(s) once the active turn ends. This module is the pure,
// I/O-free core: no rendering, no chat-loop driving, no i18n. A REPL surface
// (explicit follow-up task) toggles `userTurnActive` around each user turn
// and calls `drainAsTurns()` at turn-end to inject the result.
//
// `enqueueBg` never injects — it only ever buffers, coalescing an event into
// the previous bucket when it shares the same `source` as the bucket's most
// recent event (consecutive-same-source merge). `drainAsTurns()` itself
// enforces the "not mid-turn" invariant: while `userTurnActive` is true it is
// a no-op returning `[]` and leaves the queue untouched, rather than trusting
// the caller to only invoke it at the right moment.

/** One background-completed-work notification. */
export interface ChatTurnBgEvent {
  /** Origin identifying consecutive-same-source runs (e.g. a sprint id, an autonomous-tick id). */
  readonly source: string;
  /** Caller-resolved description of what completed (i18n resolved by the caller, not this module). */
  readonly summary: string;
}

/** One drained, already-coalesced turn — a single bucket of consecutive same-source events. */
export interface ChatTurnPayload {
  readonly source: string;
  readonly events: readonly ChatTurnBgEvent[];
}

export interface ChatTurnQueue {
  /** True while a user-initiated turn is in flight. Toggled by the REPL loop (follow-up task). */
  userTurnActive: boolean;
  /** Buffer a background-completed event. Never injects; coalesces into the last same-source bucket. */
  enqueueBg(event: ChatTurnBgEvent): void;
  /**
   * Drain all buffered buckets as ordered turn payloads and clear the queue.
   * No-op returning `[]` (queue left untouched) while `userTurnActive` is true.
   */
  drainAsTurns(): ChatTurnPayload[];
  /** Number of buffered buckets (post-coalesce), not raw event count. */
  size(): number;
}

interface ChatTurnBucket {
  source: string;
  events: ChatTurnBgEvent[];
}

export function createChatTurnQueue(): ChatTurnQueue {
  const buckets: ChatTurnBucket[] = [];

  const queue: ChatTurnQueue = {
    userTurnActive: false,

    enqueueBg(event) {
      const last = buckets[buckets.length - 1];
      if (last && last.source === event.source) {
        last.events.push(event);
      } else {
        buckets.push({ source: event.source, events: [event] });
      }
    },

    drainAsTurns() {
      if (queue.userTurnActive) return [];
      const drained = buckets.splice(0, buckets.length);
      return drained.map((bucket) => ({ source: bucket.source, events: bucket.events.slice() }));
    },

    size() {
      return buckets.length;
    },
  };

  return queue;
}
