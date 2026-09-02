// ═══ busy-controls — /queue /interrupt /steer durum-makinesi ═══════════════
// TERM-BUSY, DIRECTIVES.md Task 8 / MASTER-PLAN Sıra-51, §9.3 row6.
//
// Pure state machine — no I/O, no rendering, no process control. A REPL
// surface (explicit Ink-wire follow-up) parses raw lines via
// `parseBusyCommand`, resolves Esc/Ctrl-C via `BUSY_KEY_ACTIONS`, dispatches
// through `resolveQueueCommand` / `applyInterrupt` / `applySteer`, and acts
// on the returned decision (localized display, actually cancelling the
// running turn, etc.). String-free by design — i18n-first: only structured
// decisions cross the boundary, never prose.
//
// chat-turn-queue.ts is a READ-ONLY dependency here: `/queue` never mutates
// it — `Pick<ChatTurnQueue, 'size'>` enforces this at the type level, so
// `enqueueBg`/`drainAsTurns` cannot be called even by accident. The queue's
// own buffering/draining lifecycle stays fully owned by the REPL loop that
// already drives it (chat-turn-queue.ts itself is never modified here).

import type { ChatTurnQueue } from './chat-turn-queue.js';

export type BusyPhase = 'idle' | 'busy';

export interface BusyControlsState {
  readonly phase: BusyPhase;
  /** Idempotency guard — true once `/interrupt` has fired for the current busy turn. */
  readonly interruptRequested: boolean;
  /** FIFO of `/steer` messages queued for the currently-running turn. */
  readonly steerNotes: readonly string[];
}

/** A fresh terminal starts idle — nothing running, nothing to queue/interrupt/steer. */
export function initialBusyControlsState(): BusyControlsState {
  return { phase: 'idle', interruptRequested: false, steerNotes: [] };
}

/** Turn-start transition — resets per-turn interrupt/steer bookkeeping, regardless of prior state. */
export function markBusy(): BusyControlsState {
  return { phase: 'busy', interruptRequested: false, steerNotes: [] };
}

export interface TurnEndResult {
  readonly state: BusyControlsState;
  /** The turn's FIFO steer notes, drained exactly once, in submission order. */
  readonly drainedSteerNotes: readonly string[];
}

/** Turn-end transition — the drain-plan: caller receives pending steer notes once, then state resets to idle. */
export function markIdle(state: BusyControlsState): TurnEndResult {
  return {
    state: { phase: 'idle', interruptRequested: false, steerNotes: [] },
    drainedSteerNotes: state.steerNotes,
  };
}

// ─── /queue ──────────────────────────────────────────────────────────────

export interface QueueStatusDecision {
  readonly kind: 'queue-status';
  readonly busy: boolean;
  readonly pendingBackgroundBuckets: number;
}

/**
 * `/queue` — delegate to ChatTurnQueue for background-work status. Read-only
 * by construction: the parameter type only exposes `size()`, so this
 * function cannot buffer into or drain the queue, whatever phase it's called in.
 */
export function resolveQueueCommand(
  state: BusyControlsState,
  chatTurnQueue: Pick<ChatTurnQueue, 'size'>,
): QueueStatusDecision {
  return {
    kind: 'queue-status',
    busy: state.phase === 'busy',
    pendingBackgroundBuckets: chatTurnQueue.size(),
  };
}

// ─── /interrupt ──────────────────────────────────────────────────────────

/** Injected by the REPL surface — the actual process/turn cancellation
 *  mechanism. TERMINAL-TOOLS-008: returns `true` when a REAL abort seam fired
 *  (the native engine's session.cancel → AbortController); `false`/void when
 *  only pending input could be cleared (no seam on this engine). */
export type Canceller = () => boolean | void;

export type InterruptDecision =
  /** `aborted` (TERMINAL-TOOLS-008): the canceller reported a REAL abort seam
   *  fired (native engine → session.cancel → AbortController). False means only
   *  pending input was cleared — the caller must say so, never claim a stop. */
  | { readonly kind: 'interrupted'; readonly aborted: boolean }
  | { readonly kind: 'interrupt-noop'; readonly reason: 'idle' | 'already-requested' };

export interface InterruptResult {
  readonly state: BusyControlsState;
  readonly decision: InterruptDecision;
}

/**
 * `/interrupt` — politely stop the running turn via an injected canceller.
 * Idle → no-op informational result, canceller never invoked (nothing runs).
 * Already-requested → no-op too, canceller never invoked again — makes
 * double-interrupt (e.g. Esc then Ctrl-C) idempotent by construction.
 */
export function applyInterrupt(state: BusyControlsState, canceller: Canceller): InterruptResult {
  if (state.phase === 'idle') {
    return { state, decision: { kind: 'interrupt-noop', reason: 'idle' } };
  }
  if (state.interruptRequested) {
    return { state, decision: { kind: 'interrupt-noop', reason: 'already-requested' } };
  }
  const aborted = canceller() === true;
  return {
    state: { ...state, interruptRequested: true },
    decision: { kind: 'interrupted', aborted },
  };
}

// ─── /steer ──────────────────────────────────────────────────────────────

export type SteerDecision =
  | { readonly kind: 'steer-queued'; readonly position: number }
  | { readonly kind: 'steer-noop'; readonly reason: 'idle' | 'empty' };

export interface SteerResult {
  readonly state: BusyControlsState;
  readonly decision: SteerDecision;
}

/**
 * `/steer <msg>` — append a steering note to the running turn's FIFO queue.
 * Idle → no-op (nothing running to steer). Blank message → no-op. Notes
 * drain via `markIdle` at turn-end, in the order they were submitted.
 */
export function applySteer(state: BusyControlsState, message: string): SteerResult {
  if (state.phase === 'idle') {
    return { state, decision: { kind: 'steer-noop', reason: 'idle' } };
  }
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return { state, decision: { kind: 'steer-noop', reason: 'empty' } };
  }
  const steerNotes = [...state.steerNotes, trimmed];
  return {
    state: { ...state, steerNotes },
    decision: { kind: 'steer-queued', position: steerNotes.length },
  };
}

// ─── raw-line parsing ────────────────────────────────────────────────────

export type BusyCommandAction =
  | { readonly kind: 'queue' }
  | { readonly kind: 'interrupt' }
  | { readonly kind: 'steer'; readonly message: string }
  | { readonly kind: 'none' };

/**
 * Parse a raw REPL line into a busy-control action. Pure lexing only — the
 * caller (Ink-wire follow-up) invokes resolveQueueCommand / applyInterrupt /
 * applySteer with the parsed result; this function never dispatches itself.
 *
 * Command keyword matching is case-insensitive (`/Queue`, `/INTERRUPT`,
 * `/Steer ...` all resolve the same as their lowercase form, born-531) — only
 * the keyword itself is case-folded; a `/steer` message's own casing is
 * sliced from the original (non-folded) `trimmed` string and preserved as-is.
 */
export function parseBusyCommand(line: string): BusyCommandAction {
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();
  if (lower === '/queue') return { kind: 'queue' };
  if (lower === '/interrupt') return { kind: 'interrupt' };
  if (lower === '/steer' || lower.startsWith('/steer ')) {
    return { kind: 'steer', message: trimmed.slice('/steer'.length).trim() };
  }
  return { kind: 'none' };
}

// ─── key→action resolution (Esc/Ctrl-C — Ink-wire follow-up) ─────────────

export type BusyKeyAction = 'interrupt';

/**
 * Both Esc and Ctrl-C resolve to 'interrupt' — the standard TUI cancel
 * gesture. Wiring actual Ink key events to this table is an explicit
 * follow-up task; this module only defines the key→action contract it
 * wires to.
 */
export const BUSY_KEY_ACTIONS: Readonly<Record<string, BusyKeyAction>> = {
  escape: 'interrupt',
  'ctrl+c': 'interrupt',
};

export function resolveKeyAction(key: string): BusyKeyAction | undefined {
  return BUSY_KEY_ACTIONS[key];
}
