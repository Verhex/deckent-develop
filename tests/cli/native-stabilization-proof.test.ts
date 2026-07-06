// tests/cli/native-stabilization-proof.test.ts
// Task 375-008 — M5-PROOF-HARNESS (ADR-D-010 native-flip stabilization-proof run).
//
// ADR-D-010's behavior-guarantee table proves FIFO / no-loss / dupe-swallow / ESC-clear
// (input-queue.ts) + steer-jump-ahead (busy-controls.ts) + stream-segmenter completion /
// UTF-8-boundary / clear-recreate (stream-segmenter.ts) + cursor-model code-point safety
// (cursor-model.ts) — but each lives in its OWN isolated unit-test file. This suite is the
// M5 evidence question: does the contract still hold once these cores are COMPOSED in the
// exact shape app.tsx actually wires them when the native-agent flag is ON (the
// `nativeEngine` branch, src/cli/repl/app.tsx:850-863 — driven by the SAME inputIter drain
// loop at app.tsx:798-838), rather than each core tested alone?
//
// No PTY, no Ink mount — ink-testing-library is not a project dependency (confirmed
// precedent: tests/cli/repl/f11-016-stab.test.tsx). `createNativeModeHarness()` below is a
// module-level composition of the REAL pure cores + fake nativeEngine/output feeds standing
// in for the provider and the Ink render — not a rewrite or a mock of any of them.
//
// This task does NOT decide or perform the M4→M5 default flip (native-flag.ts, run.tsx,
// app.tsx are untouched — out of write-scope). It only produces the scenario-by-scenario
// evidence docs/analysis/m5-flip-evidence.md reports on.

import { describe, it, expect } from 'vitest';
import { isNativeAgentEnabled } from '../../src/cli/repl/native-flag.js';
import { createInputQueue, type InputQueue, type EnqueueDecision } from '../../src/cli/repl/input-queue.js';
import {
  initialBusyControlsState, markBusy, markIdle, applySteer,
  type BusyControlsState,
} from '../../src/cli/repl/busy-controls.js';
import { createStreamSegmenter, type StreamSegmenter, type Segment } from '../../src/cli/repl/stream-segmenter.js';
import {
  fromBuffer, toBuffer, applyCursorEdit, moveCursor, type CursorState,
} from '../../src/cli/repl/cursor-model.js';
import { steerNotesToInputs, truncateQueuePreview } from '../../src/cli/repl/app.js';

const EMOJI = '🎉'; // U+1F389, surrogate pair — the astral-plane torture case throughout

// ─── Harness: mirrors app.tsx's inputIter (798-838) + native branch (850-863) ───────────

interface NativeModeHarness {
  readonly queue: InputQueue;
  readonly segments: Segment[];
  /** Lines actually handed to nativeEngine, in real dispatch order (not submit order). */
  readonly dispatched: string[];
  submit(line: string): EnqueueDecision;
  cancel(): void;
  /** clearScreen()'s FIX-3 behavior: recreate the segmenter, discarding any stale partial. */
  recreateSegmenter(): void;
  output(text: string | Uint8Array): void;
  steer(message: string): ReturnType<typeof applySteer>['decision'];
  busyPhase(): BusyControlsState['phase'];
  /** Drains the queue exactly as app.tsx's native branch does per turn: dequeue → markBusy →
   *  await nativeEngine(line) → segmenter.flush() → markIdle → steer-drain merge-ahead.
   *  Finite (stops when the queue empties) — the real inputIter loops forever awaiting a
   *  `wake` promise instead; that difference does not affect the contract under test. */
  runUntilDrained(nativeEngine: (line: string) => Promise<void>): Promise<void>;
}

function createNativeModeHarness(): NativeModeHarness {
  const queue = createInputQueue();
  let busyCtl = initialBusyControlsState();
  const segments: Segment[] = [];
  const dispatched: string[] = [];
  let segmenterRef: StreamSegmenter = createStreamSegmenter((s) => segments.push(s));

  return {
    queue,
    segments,
    dispatched,
    submit: (line) => queue.enqueue(line),
    cancel: () => queue.clear(),
    recreateSegmenter: () => { segmenterRef = createStreamSegmenter((s) => segments.push(s)); },
    output: (text) => segmenterRef.feed(text),
    steer: (message) => { const r = applySteer(busyCtl, message); busyCtl = r.state; return r.decision; },
    busyPhase: () => busyCtl.phase,
    async runUntilDrained(nativeEngine) {
      while (queue.size() > 0) {
        const line = queue.dequeue() as string;
        dispatched.push(line);
        busyCtl = markBusy();
        await nativeEngine(line);
        segmenterRef.flush();
        const turnEnd = markIdle(busyCtl);
        busyCtl = turnEnd.state;
        if (turnEnd.drainedSteerNotes.length > 0) {
          const merged = steerNotesToInputs(turnEnd.drainedSteerNotes, queue.snapshot());
          queue.clear();
          for (const steered of merged) queue.enqueue(steered);
        }
      }
    },
  };
}

// ─── Native-flag grounding — the composition really is the flag-ON shape ───────────────

describe('native-flag gate — this harness models the DECKENT_NATIVE_AGENT=1 / --native shape', () => {
  it('isNativeAgentEnabled resolves ON for the config this suite proves against', () => {
    expect(isNativeAgentEnabled({ DECKENT_NATIVE_AGENT: '1' }, [])).toBe(true);
    expect(isNativeAgentEnabled({}, ['--native'])).toBe(true);
  });
});

// ─── 1. FIFO order preserved under native dispatch ─────────────────────────────────────

describe('native composition — FIFO order preserved through the nativeEngine dispatch loop', () => {
  it('dispatches queued lines to nativeEngine in exact submit order', async () => {
    const h = createNativeModeHarness();
    h.submit('alpha');
    h.submit('beta');
    h.submit('gamma');
    await h.runUntilDrained(async () => {});
    expect(h.dispatched).toEqual(['alpha', 'beta', 'gamma']);
  });
});

// ─── 2. No-loss: input arriving while nativeEngine is mid-turn ─────────────────────────

describe('native composition — input arriving mid-turn is never lost', () => {
  it('a line submitted WHILE nativeEngine is awaiting is queued and dispatched next, not dropped', async () => {
    const h = createNativeModeHarness();
    h.submit('first');
    await h.runUntilDrained(async (line) => {
      if (line === 'first') {
        // simulates a user typing + hitting Enter while the first turn streams —
        // exactly what handleSubmit's tail (app.tsx:1016-1019) does concurrently
        // with the awaited nativeEngine(...) call in the real component.
        h.submit('second');
      }
    });
    expect(h.dispatched).toEqual(['first', 'second']);
  });
});

// ─── 3. Duplicate-Enter swallow at the native submit boundary ──────────────────────────

describe('native composition — duplicate-Enter fire is swallowed before it ever reaches dispatch', () => {
  it('an immediate resubmission of the same trimmed text swallows, never double-dispatches', async () => {
    const h = createNativeModeHarness();
    expect(h.submit('deploy').kind).toBe('queued');
    expect(h.submit('deploy')).toEqual({ kind: 'swallowed', reason: 'duplicate-enter' });
    await h.runUntilDrained(async () => {});
    expect(h.dispatched).toEqual(['deploy']); // exactly once, not twice
  });

  it('the dupe guard resets after a turn dispatches — a deliberate later repeat is not swallowed', async () => {
    const h = createNativeModeHarness();
    h.submit('status');
    await h.runUntilDrained(async () => {}); // dequeue() resets the guard (input-queue.ts:69)
    expect(h.submit('status').kind).toBe('queued'); // deliberate repeat, not a dup-fire
    await h.runUntilDrained(async () => {});
    expect(h.dispatched).toEqual(['status', 'status']);
  });
});

// ─── 4. ESC/cancel clears mid-turn pending queue + resets the dupe guard ───────────────

describe('native composition — ESC/cancel clears pending input mid native-session', () => {
  it('cancel() (the Canceller app.tsx:897 wires into applyInterrupt) empties the queue', () => {
    const h = createNativeModeHarness();
    h.submit('a');
    h.submit('b');
    h.cancel();
    expect(h.queue.size()).toBe(0);
    expect(h.queue.snapshot()).toEqual([]);
  });

  it('resets the dupe guard so the same text is queueable again right after a cancel', () => {
    const h = createNativeModeHarness();
    h.submit('reboot');
    h.cancel();
    expect(h.submit('reboot').kind).toBe('queued'); // not misread as a duplicate-enter
  });
});

// ─── 5. Steer-note turn-end drain jumps ahead — composed through the native dispatch loop ──

describe('native composition — turn-end steer notes jump ahead of already-queued lines in the native dispatch loop', () => {
  it('a /steer note submitted mid-turn is dispatched BEFORE a real message queued in the same turn', async () => {
    const h = createNativeModeHarness();
    h.submit('task1');
    await h.runUntilDrained(async (line) => {
      if (line === 'task1') {
        // mid-turn: the "busy" phase is active (markBusy() ran before this await),
        // so applySteer() actually queues rather than no-op'ing idle.
        expect(h.busyPhase()).toBe('busy');
        const decision = h.steer('urgent-note');
        expect(decision).toEqual({ kind: 'steer-queued', position: 1 });
        h.submit('task2'); // a normal message arrives in the SAME turn window
      }
    });
    // task1 dispatches first (already in flight); then the drained steer note jumps
    // ahead of task2 for the next turn — steerNotesToInputs(['urgent-note'], ['task2']).
    expect(h.dispatched).toEqual(['task1', 'urgent-note', 'task2']);
  });
});

// ─── 6. stream-segmenter composition through nativeEngine's output callback ────────────

describe('native composition — stream-segmenter emits in order when fed exclusively via nativeEngine output()', () => {
  it('prose lines, a fenced code block, and a table all emit correctly through the native path', async () => {
    const h = createNativeModeHarness();
    h.submit('explain');
    await h.runUntilDrained(async (line) => {
      if (line !== 'explain') return;
      h.output('first line\n');
      h.output('```ts\nconst x = 1;\n```\n');
      h.output('| a | b |\n|---|---|\n| 1 | 2 |\n');
      h.output('trailing partial (no newline yet)');
      // flush() happens automatically in runUntilDrained after this callback returns.
    });
    expect(h.segments).toEqual([
      { kind: 'line', markdown: 'first line' },
      { kind: 'block', markdown: '```ts\nconst x = 1;\n```' },
      { kind: 'block', markdown: '| a | b |\n|---|---|\n| 1 | 2 |' },
      { kind: 'line', markdown: 'trailing partial (no newline yet)' }, // emitted by the post-turn flush()
    ]);
  });
});

// ─── 7. UTF-8 multi-byte chunk-boundary safety under native streaming ──────────────────

describe('native composition — UTF-8/Turkish/emoji chunk-boundary safety holds when native-fed one byte at a time', () => {
  it('reassembles a Turkish+emoji line fed through nativeEngine output() one byte at a time', async () => {
    const TURKISH = 'Şu çörək ğıpta İÖÜ ödülü — café ☕ 🇹🇷 😀';
    const bytes = new TextEncoder().encode(TURKISH);
    expect(bytes.length).toBeGreaterThan(TURKISH.length); // sanity: genuinely multi-byte

    const h = createNativeModeHarness();
    h.submit('stream-turkish');
    await h.runUntilDrained(async (line) => {
      if (line !== 'stream-turkish') return;
      for (const b of bytes) h.output(new Uint8Array([b])); // one byte per native output() call
    });
    expect(h.segments).toEqual([{ kind: 'line', markdown: TURKISH }]);
    expect(h.segments[0]!.markdown).not.toContain('�');
  });
});

// ─── 8. clearScreen-equivalent segmenter recreation drops a stale partial mid-session ──

describe('native composition — a /clear mid native-session cannot resurface the pre-clear partial', () => {
  it('recreateSegmenter() (the clearScreen FIX-3 mechanism) starts clean; the old partial never stitches onto post-clear text', async () => {
    const h = createNativeModeHarness();
    h.submit('turn-a');
    h.submit('turn-b');
    await h.runUntilDrained(async (line) => {
      if (line === 'turn-a') {
        h.output('pre-clear partial'); // in-flight, no trailing newline — buffered
        h.recreateSegmenter();         // user hits /clear mid-turn
        return;                        // note: no flush() call reaches the OLD instance's buffer
      }
      if (line === 'turn-b') {
        h.output('post-clear line\n'); // fresh instance — must render clean
      }
    });
    // 'pre-clear partial' never appears anywhere in the emitted segments.
    expect(h.segments.some((s) => s.markdown.includes('pre-clear partial'))).toBe(false);
    expect(h.segments).toEqual([{ kind: 'line', markdown: 'post-clear line' }]);
  });
});

// ─── 9. cursor-model code-point-safe edit → submit → native-dispatch round-trip ────────

describe('native composition — cursor-model families: an edited astral-plane buffer survives intact through queue → native dispatch', () => {
  it('an emoji built via insert/move survives the whole submit→dequeue→nativeEngine(line) round-trip unbisected', async () => {
    // Build "hi 🎉!" by composing cursor-model's code-point-safe primitives —
    // the same core ADR-D-010 KALAN (a) names as the not-yet-wired line-edit.ts
    // replacement; this proves the CORE composes cleanly with the queue/dispatch
    // pipeline (the open question for a flip), not that the UI wiring is done.
    let state: CursorState = fromBuffer('hi !', 3); // cursor between "hi " and "!"
    state = applyCursorEdit(state, 'insert', EMOJI).state;
    expect(state.codePoints[3]).toBe(EMOJI); // whole code point, never a lone surrogate
    const moved = moveCursor(state, 'left');
    expect(moved.state.cursor).toBe(3); // one atomic step back over the WHOLE emoji

    const built = toBuffer(state);
    expect(built).toBe('hi 🎉!');

    const h = createNativeModeHarness();
    const decision = h.submit(built);
    expect(decision.kind).toBe('queued');
    await h.runUntilDrained(async () => {});
    expect(h.dispatched).toEqual(['hi 🎉!']); // intact — no U+FFFD, no split surrogate
  });
});

// ─── 10. truncateQueuePreview stays code-point-safe against a live native-mode queue ───

describe('native composition — queue-preview truncation stays code-point-safe while populated via native submits', () => {
  it('a long emoji-heavy line queued through submit() truncates without bisecting a surrogate pair', () => {
    const h = createNativeModeHarness();
    const long = 'x' + EMOJI.repeat(65); // mirrors f11-016-stab.test.tsx FIX-4 fixture
    h.submit(long);
    h.submit('short');
    const [preview0, preview1] = h.queue.snapshot().map((l) => truncateQueuePreview(l));
    const points = [...preview0!];
    expect(points).toHaveLength(61); // 60 whole code points + ellipsis
    expect(points.at(-1)).toBe('…');
    expect(preview1).toBe('short'); // untouched — under the cap
  });
});
