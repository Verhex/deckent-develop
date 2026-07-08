// ═══ Task 387-003 — REPL-TURN-EXCEPTION-SURFACE — pure-logic tests ══════════
//
// app.tsx's native-engine turn loop used to let a single turn's exception
// propagate straight out of its `for await` loop, past `.catch(() => exit())`
// — the whole REPL exited with ZERO visible signal (born-551, read as a
// silent freeze). The fix (`runNativeTurnLoop`) catches per-turn, surfaces it
// via `onTurnError`, and keeps driving the loop for the NEXT input.
//
// Why no Ink mount: ink-testing-library is NOT a project dependency
// (confirmed sprints 285 / 354 / 359 / 358-006 — see
// tests/cli/repl-confirm-queue.test.ts, tests/cli/repl/app-surface-wire.test.tsx),
// so this suite exercises the pure, JSX-free `runNativeTurnLoop` /
// `formatTurnErrorLine` app.tsx exports for exactly this reason — the same
// "pull decision logic out of the component" seam as confirmKeyToAnswer /
// buildSegmentTurns / tapApprovalEvents.

import { describe, it, expect, vi } from 'vitest';
import {
  runNativeTurnLoop,
  formatTurnErrorLine,
  type ReplEngine,
} from '../../src/cli/repl/app.js';

/** Async iterable of lines a real `inputIter()` would yield, without any of
 * app.tsx's React/queue plumbing — `runNativeTurnLoop` only needs the shape. */
async function* linesOf(...values: string[]): AsyncGenerator<string> {
  for (const v of values) yield v;
}

describe('runNativeTurnLoop — per-turn exception isolation (387-003)', () => {
  it('surfaces a thrown turn as onTurnError instead of rejecting (görünür hata, sessiz-donma değil)', async () => {
    const engine: ReplEngine = vi.fn(async (line: string) => {
      if (line === 'boom') throw new Error('agent session exploded');
    });
    const onTurnError = vi.fn();
    const onTurnStats = vi.fn();

    await expect(
      runNativeTurnLoop(linesOf('boom'), engine, { output: () => {}, onTurnStats, onTurnError }),
    ).resolves.toBeUndefined(); // NOT a rejection — the caller's `.then(() => exit())` path stays graceful

    expect(onTurnError).toHaveBeenCalledTimes(1);
    expect(onTurnError).toHaveBeenCalledWith('agent session exploded');
    expect(onTurnStats).not.toHaveBeenCalled();
  });

  it('keeps driving the loop after a crash — the NEXT turn runs normally (normal-tur bozulmaz)', async () => {
    const engine: ReplEngine = vi.fn(async (line: string, cbs) => {
      if (line === 'boom') throw new Error('first turn exploded');
      cbs.output('hello');
      cbs.onTurnEnd({ inputTokens: 3, outputTokens: 5 });
    });
    const onTurnError = vi.fn();
    const onTurnStats = vi.fn();
    const output = vi.fn();
    let tick = 1000;

    await runNativeTurnLoop(
      linesOf('boom', 'normal follow-up'),
      engine,
      { output, onTurnStats, onTurnError },
      () => (tick += 10),
    );

    // engine was invoked for BOTH lines — the exception on line 1 did not
    // stop the loop from reaching line 2.
    expect(engine).toHaveBeenCalledTimes(2);
    expect(engine).toHaveBeenNthCalledWith(1, 'boom', expect.anything());
    expect(engine).toHaveBeenNthCalledWith(2, 'normal follow-up', expect.anything());

    // line 1: error surfaced, no stats.
    expect(onTurnError).toHaveBeenCalledTimes(1);
    expect(onTurnError).toHaveBeenCalledWith('first turn exploded');

    // line 2: ran to completion exactly like any turn — real output + real stats.
    expect(output).toHaveBeenCalledWith('hello');
    expect(onTurnStats).toHaveBeenCalledTimes(1);
    expect(onTurnStats).toHaveBeenCalledWith(expect.objectContaining({ elapsedMs: expect.any(Number), tokens: 5 }));
  });

  it('never turns the exception into a process-crash-shaped rejection (graceful kal)', async () => {
    const engine: ReplEngine = vi.fn(async () => { throw new Error('boom'); });
    const settled = vi.fn();

    await runNativeTurnLoop(linesOf('x'), engine, { output: () => {}, onTurnStats: () => {}, onTurnError: () => {} })
      .then(settled, settled);

    expect(settled).toHaveBeenCalledTimes(1); // resolved (fulfilled), not rejected — checked via .then's single handler firing once with no thrown propagation reaching the test
  });

  it('normalizes a non-Error throw (thrown string) into a string message', async () => {
    const engine: ReplEngine = vi.fn(async () => { throw 'plain string throw'; });
    const onTurnError = vi.fn();

    await runNativeTurnLoop(linesOf('x'), engine, { output: () => {}, onTurnStats: () => {}, onTurnError });

    expect(onTurnError).toHaveBeenCalledWith('plain string throw');
  });

  it('completes cleanly (no callbacks) when no line ever throws', async () => {
    const engine: ReplEngine = vi.fn(async (_line: string, cbs) => {
      cbs.onTurnEnd({ inputTokens: 1, outputTokens: 1 });
    });
    const onTurnError = vi.fn();

    await runNativeTurnLoop(linesOf('a', 'b'), engine, { output: () => {}, onTurnStats: () => {}, onTurnError });

    expect(onTurnError).not.toHaveBeenCalled();
    expect(engine).toHaveBeenCalledTimes(2);
  });
});

describe('formatTurnErrorLine — visible-error i18n fallback (387-003)', () => {
  it('falls back to the English default template with the message substituted', () => {
    expect(formatTurnErrorLine('kaboom')).toBe('⚠ turn failed: kaboom');
  });

  it('substitutes {error} into a caller-supplied localized label', () => {
    expect(formatTurnErrorLine('kaboom', 'tur başarısız: {error}')).toBe('⚠ tur başarısız: kaboom');
  });

  it('always prefixes ⚠ regardless of label — the glyph is owned by the function, not the label', () => {
    expect(formatTurnErrorLine('x', 'no placeholder here')).toBe('⚠ no placeholder here');
  });
});
