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
//
// TERM5-QUEUE (Sprint 427, Task 427-004) — `enqueueCorrelatedResult` layers a
// flowId-correlated, rich-result completion (Task-3/427-003's flowId-filtered
// `createRunCompletionWatch`, run-completion-watch.ts) on top of the same two
// primitives, with zero change to either: it buffers via `enqueueBg` and then
// immediately attempts `drainAsTurns()`. While idle that attempt succeeds and
// hands the caller a turn to render right away ("idle REPL uyanir"); mid-turn
// it inherits `drainAsTurns()`'s existing no-op, so the event simply waits in
// the buffer for the next natural turn-end drain ("active-turn'de buffer").
// Formatting the `ChatTurnBgEvent` stays the caller's job (see the doc on
// `ChatTurnBgEvent.summary` below) — mirrors run.tsx's `buildBgTurnEvent`
// (born-642) precedent. That wiring, plus the `enabled` flag's real source
// (`config.terminal.run_flow_v2`), lives in run.tsx and is a follow-up task —
// this module only owns the idle-produce-vs-active-buffer mechanism.

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
  /**
   * TERM5-QUEUE (427-004) — buffers a flowId-correlated, already-formatted
   * completion event (`enqueueBg` underneath) and immediately attempts to
   * drain it. Returns the drained `ChatTurnPayload[]` when idle (a non-empty
   * result is the "produce this turn now / wake the REPL" signal) or `[]`
   * while `userTurnActive` is true (the event stays buffered — exactly
   * `drainAsTurns()`'s existing mid-turn no-op, unchanged).
   *
   * `enabled=false` is a total no-op: the event is never buffered and `[]` is
   * returned, byte-identical to never calling this method at all — the
   * caller gates this with its own flag (e.g. `terminal.run_flow_v2`).
   */
  enqueueCorrelatedResult(event: ChatTurnBgEvent, enabled: boolean): ChatTurnPayload[];
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

    enqueueCorrelatedResult(event, enabled) {
      if (!enabled) return [];
      queue.enqueueBg(event);
      return queue.drainAsTurns();
    },
  };

  return queue;
}
