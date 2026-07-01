// ═══ Task 354-001 — REPL-SURFACE-WIRE — pure-logic tests ═══════════════════
//
// Wires buildLiveFooter (helpers/live-footer.ts) + term-mode.ts +
// chat-turn-queue.ts into the Ink REPL App (src/cli/repl/app.tsx), all gated
// behind a `replSurfaceEnabled` seam prop that defaults to false/absent so the
// pre-354-001 render stays byte-identical when the feature is off.
//
// Why this file has no JSX despite the `.tsx` extension the task's write
// scope names: `ink-testing-library` is NOT a project dependency (confirmed
// via package.json — same finding as sprint 285, recorded in
// tests/cli/repl-tool-multi-tag-repro.test.ts), and vitest.config.ts's
// `test.include` is `['tests/**/*.test.ts']`, which does not match `.tsx`
// (empirically verified: `npx vitest run tests/cli/repl-surface-wire.test.tsx`
// → "No test files found", exit 1 — vitest.config.ts is outside this task's
// write scope, so that gap cannot be closed here). Given that, this suite
// exercises the real, JSX-free decision logic app.tsx exports for exactly
// this reason — `resolveModeLabel` and `bgPayloadsToTurnTexts` — the same
// "pull pure logic out of the component so it's testable without mounting
// Ink" pattern already established by `createConfirmQueue` (see
// tests/cli/repl-confirm-queue.test.ts).

import { describe, it, expect } from 'vitest';
import { resolveModeLabel, bgPayloadsToTurnTexts, type ReplLabels } from '../../src/cli/repl/app.js';
import { initialTermModeState, applyModeCommand } from '../../src/cli/repl/term-mode.js';
import { createChatTurnQueue } from '../../src/cli/repl/chat-turn-queue.js';

const NO_LABELS: Pick<ReplLabels, 'modeAsk' | 'modeRun' | 'modeControl'> = {};

describe('resolveModeLabel — mode-indicator label resolution (Ask/Run/Control)', () => {
  it('falls back to the English canonical name when no labels are supplied', () => {
    expect(resolveModeLabel('ask', NO_LABELS)).toBe('Ask');
    expect(resolveModeLabel('run', NO_LABELS)).toBe('Run');
    expect(resolveModeLabel('control', NO_LABELS)).toBe('Control');
  });

  it('uses caller-supplied labels when present (i18n-first seam)', () => {
    const labels = { modeAsk: 'Sor', modeRun: 'Çalıştır', modeControl: 'Yönet' };
    expect(resolveModeLabel('ask', labels)).toBe('Sor');
    expect(resolveModeLabel('run', labels)).toBe('Çalıştır');
    expect(resolveModeLabel('control', labels)).toBe('Yönet');
  });

  it('a partial override only replaces the supplied mode, others stay English-default', () => {
    expect(resolveModeLabel('run', { modeRun: 'Çalıştır' })).toBe('Çalıştır');
    expect(resolveModeLabel('ask', { modeRun: 'Çalıştır' })).toBe('Ask');
  });

  it('composes with term-mode.ts applyModeCommand — end-to-end mode-switch flow', () => {
    // Mirrors app.tsx's handleSubmit: '/run' transitions state, then the new
    // mode's label is what the indicator would render.
    const start = initialTermModeState();
    expect(resolveModeLabel(start.mode, NO_LABELS)).toBe('Ask');

    const afterRun = applyModeCommand(start, '/run');
    expect(afterRun.changed).toBe(true);
    expect(resolveModeLabel(afterRun.state.mode, NO_LABELS)).toBe('Run');

    const afterControl = applyModeCommand(afterRun.state, '/control');
    expect(afterControl.changed).toBe(true);
    expect(resolveModeLabel(afterControl.state.mode, NO_LABELS)).toBe('Control');
  });
});

describe('bgPayloadsToTurnTexts — ChatTurnQueue drain → Turn[\'bg\'] text mapping', () => {
  it('empty payload list → empty text list', () => {
    expect(bgPayloadsToTurnTexts([])).toEqual([]);
  });

  it('one payload, one event → one text (no trailing newline)', () => {
    const texts = bgPayloadsToTurnTexts([
      { source: 'sprint-354', events: [{ source: 'sprint-354', summary: 'sprint 354 finished' }] },
    ]);
    expect(texts).toEqual(['sprint 354 finished']);
  });

  it('one payload, multiple coalesced events → newline-joined single text', () => {
    const texts = bgPayloadsToTurnTexts([
      {
        source: 'sprint-354',
        events: [
          { source: 'sprint-354', summary: 'task 001 done' },
          { source: 'sprint-354', summary: 'task 002 done' },
        ],
      },
    ]);
    expect(texts).toEqual(['task 001 done\ntask 002 done']);
  });

  it('multiple payloads → one text per payload, order preserved', () => {
    const texts = bgPayloadsToTurnTexts([
      { source: 'sprint-354', events: [{ source: 'sprint-354', summary: 'a1' }] },
      { source: 'watch-x', events: [{ source: 'watch-x', summary: 'w1' }] },
    ]);
    expect(texts).toEqual(['a1', 'w1']);
  });

  it('integrates with the real ChatTurnQueue — mid-turn buffer, turn-end drain (Hermes rule)', () => {
    // Mirrors app.tsx's inputIter turn-boundary: userTurnActive toggles around
    // the yield, and only the post-turn drain may ever produce turn text.
    const queue = createChatTurnQueue();
    queue.userTurnActive = true;
    queue.enqueueBg({ source: 'sprint-354', summary: 'sprint 354 finished' });
    queue.enqueueBg({ source: 'autonomous-tick', summary: 'tick #7 completed' });

    // Mid-turn: drain is a no-op, so nothing is ever rendered as a mid-turn injection.
    expect(bgPayloadsToTurnTexts(queue.drainAsTurns())).toEqual([]);

    queue.userTurnActive = false;
    expect(bgPayloadsToTurnTexts(queue.drainAsTurns())).toEqual([
      'sprint 354 finished',
      'tick #7 completed',
    ]);
    // Drained queue → no further turns until new bg events arrive.
    expect(bgPayloadsToTurnTexts(queue.drainAsTurns())).toEqual([]);
  });
});
