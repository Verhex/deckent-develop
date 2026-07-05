// ═══ InputQueue — REPL rapid-input FIFO stabilization core (F11-016-STAB) ═══
// Task 368-003, DIRECTIVES.md F11-016 (P1).
//
// Pure, I/O-free FIFO core for lines typed while a REPL turn is streaming.
// No rendering, no process control, no strings of its own — string-free by
// design (i18n-first): callers resolve any user-facing text from the returned
// `EnqueueDecision.reason` discriminant, this module never owns prose.
//
// Mirrors the existing pure-queue pattern in this directory (chat-turn-queue.ts,
// busy-controls.ts's SteerDecision shape) rather than inventing a new one.
//
// Behavior contract (the 4 items this module hardens):
//   1. FIFO       — dequeue() returns lines in exact enqueue order.
//   2. No loss    — enqueue always accepts input; nothing but an intentional
//                    clear() (or a swallow, see #3) can remove a queued line.
//   3. Swallow    — blank/whitespace-only lines, and an immediate duplicate
//                    resubmission of the same trimmed text with no dequeue in
//                    between (the real "Enter fires twice for one keypress"
//                    terminal quirk), are swallowed rather than queued.
//   4. Clear      — clear() (ESC/cancel) empties the queue.
//
// The duplicate guard is purely positional — no Date.now()/timers — so it
// stays deterministic and hermetically testable: it resets on both dequeue()
// and clear(), so a deliberately repeated command later is never permanently
// blocked, only a genuine back-to-back double-fire is swallowed.

/** Outcome of one enqueue() call — queued (with its 1-based FIFO position) or swallowed (with why). */
export type EnqueueDecision =
  | { readonly kind: 'queued'; readonly position: number }
  | { readonly kind: 'swallowed'; readonly reason: 'empty' | 'duplicate-enter' };

export interface InputQueue {
  /**
   * Enqueue a line. Trims before deciding: whitespace-only input swallows as
   * 'empty'; an immediate repeat of the last successfully-queued trimmed text
   * (no dequeue()/clear() since) swallows as 'duplicate-enter'.
   */
  enqueue(line: string): EnqueueDecision;
  /** Dequeue the oldest pending line (FIFO head), or undefined if empty. Resets the duplicate guard. */
  dequeue(): string | undefined;
  /** Clear all pending lines (ESC/cancel) and reset the duplicate guard. */
  clear(): void;
  /** Non-mutating snapshot of pending lines, oldest-first (for a UI preview). */
  snapshot(): readonly string[];
  /** Pending count. */
  size(): number;
}

export function createInputQueue(): InputQueue {
  const buffer: string[] = [];
  let lastEnqueued: string | null = null;

  return {
    enqueue(line) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return { kind: 'swallowed', reason: 'empty' };
      }
      if (trimmed === lastEnqueued) {
        return { kind: 'swallowed', reason: 'duplicate-enter' };
      }
      buffer.push(trimmed);
      lastEnqueued = trimmed;
      return { kind: 'queued', position: buffer.length };
    },

    dequeue() {
      const line = buffer.shift();
      lastEnqueued = null;
      return line;
    },

    clear() {
      buffer.length = 0;
      lastEnqueued = null;
    },

    snapshot() {
      return buffer.slice();
    },

    size() {
      return buffer.length;
    },
  };
}
