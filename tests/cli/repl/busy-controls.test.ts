import { describe, it, expect, vi } from 'vitest';
import {
  initialBusyControlsState,
  markBusy,
  markIdle,
  resolveQueueCommand,
  applyInterrupt,
  applySteer,
  parseBusyCommand,
  resolveKeyAction,
  BUSY_KEY_ACTIONS,
  type BusyControlsState,
} from '../../../src/cli/repl/busy-controls.js';
import { createChatTurnQueue } from '../../../src/cli/repl/chat-turn-queue.js';

const busyState = (overrides: Partial<BusyControlsState> = {}): BusyControlsState => ({
  phase: 'busy',
  interruptRequested: false,
  steerNotes: [],
  ...overrides,
});

describe('busy-controls — initial state + phase transitions', () => {
  it('starts idle, no interrupt requested, no steer notes', () => {
    expect(initialBusyControlsState()).toEqual({
      phase: 'idle',
      interruptRequested: false,
      steerNotes: [],
    });
  });

  it('markBusy transitions to busy and resets bookkeeping', () => {
    expect(markBusy()).toEqual({ phase: 'busy', interruptRequested: false, steerNotes: [] });
  });

  it('markIdle transitions to idle and drains steer notes exactly once, in order', () => {
    const state = busyState({ interruptRequested: true, steerNotes: ['a', 'b'] });
    const result = markIdle(state);
    expect(result.state).toEqual({ phase: 'idle', interruptRequested: false, steerNotes: [] });
    expect(result.drainedSteerNotes).toEqual(['a', 'b']);

    // Draining again (post-transition) yields nothing — single-drain semantics.
    const second = markIdle(result.state);
    expect(second.drainedSteerNotes).toEqual([]);
  });
});

describe('busy-controls — /queue (busy × idle matrix, read-only ChatTurnQueue)', () => {
  it('idle + /queue → queue-status busy:false, forwards size()', () => {
    const queue = { size: () => 0 };
    const decision = resolveQueueCommand(initialBusyControlsState(), queue);
    expect(decision).toEqual({ kind: 'queue-status', busy: false, pendingBackgroundBuckets: 0 });
  });

  it('busy + /queue → queue-status busy:true, forwards size()', () => {
    const queue = { size: () => 3 };
    const decision = resolveQueueCommand(busyState(), queue);
    expect(decision).toEqual({ kind: 'queue-status', busy: true, pendingBackgroundBuckets: 3 });
  });

  it('never mutates a real ChatTurnQueue — only size() is called (type + runtime proof)', () => {
    const queue = createChatTurnQueue();
    queue.enqueueBg({ source: 'sprint-357', summary: 'worker finished' });
    expect(queue.size()).toBe(1);

    const decision = resolveQueueCommand(busyState(), queue);
    expect(decision.pendingBackgroundBuckets).toBe(1);

    // Untouched after resolveQueueCommand — no buffering, no draining occurred.
    expect(queue.size()).toBe(1);
    expect(queue.drainAsTurns()).toHaveLength(1);
  });
});

describe('busy-controls — /interrupt (busy × idle matrix, injected canceller, idempotent)', () => {
  it('idle + /interrupt → no-op, informational result, canceller never invoked', () => {
    const canceller = vi.fn();
    const result = applyInterrupt(initialBusyControlsState(), canceller);
    expect(result.decision).toEqual({ kind: 'interrupt-noop', reason: 'idle' });
    expect(result.state.phase).toBe('idle');
    expect(canceller).not.toHaveBeenCalled();
  });

  it('busy + first /interrupt → invokes canceller once, sets interruptRequested', () => {
    const canceller = vi.fn();
    const result = applyInterrupt(busyState(), canceller);
    expect(result.decision).toEqual({ kind: 'interrupted', aborted: false }); // vi.fn() returns undefined → no real abort seam
    expect(result.state.interruptRequested).toBe(true);
    expect(canceller).toHaveBeenCalledTimes(1);
  });

  it('busy + double /interrupt (e.g. Esc then Ctrl-C) is idempotent — canceller invoked exactly once', () => {
    const canceller = vi.fn();
    const first = applyInterrupt(busyState(), canceller);
    const second = applyInterrupt(first.state, canceller);

    expect(second.decision).toEqual({ kind: 'interrupt-noop', reason: 'already-requested' });
    expect(canceller).toHaveBeenCalledTimes(1);
  });
});

describe('busy-controls — /steer (busy × idle matrix, FIFO)', () => {
  it('idle + /steer → no-op, nothing running to steer', () => {
    const result = applySteer(initialBusyControlsState(), 'go this way instead');
    expect(result.decision).toEqual({ kind: 'steer-noop', reason: 'idle' });
    expect(result.state.steerNotes).toEqual([]);
  });

  it('busy + blank /steer message → no-op', () => {
    const result = applySteer(busyState(), '   ');
    expect(result.decision).toEqual({ kind: 'steer-noop', reason: 'empty' });
    expect(result.state.steerNotes).toEqual([]);
  });

  it('busy + /steer appends to FIFO in submission order, reporting 1-based position', () => {
    const first = applySteer(busyState(), 'first note');
    expect(first.decision).toEqual({ kind: 'steer-queued', position: 1 });
    expect(first.state.steerNotes).toEqual(['first note']);

    const second = applySteer(first.state, '  second note  ');
    expect(second.decision).toEqual({ kind: 'steer-queued', position: 2 });
    expect(second.state.steerNotes).toEqual(['first note', 'second note']);
  });
});

describe('busy-controls — parseBusyCommand (raw-line lexing)', () => {
  it('parses /queue and /interrupt with no argument', () => {
    expect(parseBusyCommand('/queue')).toEqual({ kind: 'queue' });
    expect(parseBusyCommand('  /interrupt  ')).toEqual({ kind: 'interrupt' });
  });

  it('parses /steer with a message, trimming surrounding whitespace', () => {
    expect(parseBusyCommand('/steer focus on the auth module')).toEqual({
      kind: 'steer',
      message: 'focus on the auth module',
    });
    expect(parseBusyCommand('  /steer   trailing spaces   ')).toEqual({
      kind: 'steer',
      message: 'trailing spaces',
    });
  });

  it('parses bare /steer as an empty message', () => {
    expect(parseBusyCommand('/steer')).toEqual({ kind: 'steer', message: '' });
  });

  it('unrecognized input and non-slash lines → none', () => {
    expect(parseBusyCommand('/nope')).toEqual({ kind: 'none' });
    expect(parseBusyCommand('hello world')).toEqual({ kind: 'none' });
    expect(parseBusyCommand('')).toEqual({ kind: 'none' });
  });
});

describe('busy-controls — key→action resolution (Esc/Ctrl-C, Ink-wire follow-up)', () => {
  it('escape and ctrl+c both resolve to interrupt', () => {
    expect(resolveKeyAction('escape')).toBe('interrupt');
    expect(resolveKeyAction('ctrl+c')).toBe('interrupt');
  });

  it('unrecognized key → undefined', () => {
    expect(resolveKeyAction('tab')).toBeUndefined();
  });

  it('BUSY_KEY_ACTIONS table only maps the documented cancel gestures', () => {
    expect(Object.keys(BUSY_KEY_ACTIONS).sort()).toEqual(['ctrl+c', 'escape']);
  });
});
