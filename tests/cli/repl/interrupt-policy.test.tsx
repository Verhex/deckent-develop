// tests/cli/repl/interrupt-policy.test.tsx
// ═══ TERMINAL-TOOLS-006 — Ctrl-C states its target; a draft is never fatal ══
//
// Real-binary evidence (2026-09-02 PTY): Ctrl-C with a half-typed draft tore
// down the whole session (Ink's exitOnCtrlC default) — draft, transcript and
// warm provider child gone on one keystroke. Contract (pure policy,
// interrupt-policy.ts): Ctrl-C with a draft discards the draft; Ctrl-C while
// a turn is running requests the interrupt; Ctrl-C on an idle, empty
// composer arms an exit; a SECOND Ctrl-C inside the window exits. Ctrl-D on
// an empty composer exits at once (readline EOF convention). Every non-exit
// decision has a catalog hint naming the next key. Hermetic.

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolveCtrlC, CTRL_C_EXIT_WINDOW_MS, type CtrlCDecision } from '../../../src/cli/repl/interrupt-policy.js';
import { InputBar } from '../../../src/cli/repl/input-bar.js';
import { buildReplLabels } from '../../../src/cli/repl/run.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';

const ROOT = join(__dirname, '..', '..', '..');
const T0 = 1_000_000;

describe('resolveCtrlC — decision matrix', () => {
  const base = { signal: 'int' as const, draftNonEmpty: false, working: false, armedAt: null, now: T0 };

  it('a draft is discarded, never the session (first press arms)', () => {
    expect(resolveCtrlC({ ...base, draftNonEmpty: true })).toEqual<CtrlCDecision>({ kind: 'clear-draft', armedAt: T0 });
  });

  it('while a turn is running the first press requests the interrupt', () => {
    expect(resolveCtrlC({ ...base, working: true })).toEqual<CtrlCDecision>({ kind: 'interrupt-turn', armedAt: T0 });
    // a draft wins over the running turn: the user is editing, keep the turn
    expect(resolveCtrlC({ ...base, working: true, draftNonEmpty: true })).toEqual<CtrlCDecision>({ kind: 'clear-draft', armedAt: T0 });
  });

  it('idle + empty arms the exit; the second press inside the window exits', () => {
    expect(resolveCtrlC(base)).toEqual<CtrlCDecision>({ kind: 'arm-exit', armedAt: T0 });
    expect(resolveCtrlC({ ...base, armedAt: T0, now: T0 + CTRL_C_EXIT_WINDOW_MS })).toEqual<CtrlCDecision>({ kind: 'exit' });
    expect(resolveCtrlC({ ...base, armedAt: T0, now: T0 + CTRL_C_EXIT_WINDOW_MS + 1 })).toEqual<CtrlCDecision>({ kind: 'arm-exit', armedAt: T0 + CTRL_C_EXIT_WINDOW_MS + 1 });
  });

  it('an armed second press exits regardless of draft/working (the user asked twice)', () => {
    expect(resolveCtrlC({ ...base, armedAt: T0, now: T0 + 10, draftNonEmpty: true })).toEqual<CtrlCDecision>({ kind: 'exit' });
    expect(resolveCtrlC({ ...base, armedAt: T0, now: T0 + 10, working: true })).toEqual<CtrlCDecision>({ kind: 'exit' });
  });

  it('Ctrl-D (EOF on an empty composer) exits immediately', () => {
    expect(resolveCtrlC({ ...base, signal: 'eof' })).toEqual<CtrlCDecision>({ kind: 'exit' });
  });

  it('honors a custom window', () => {
    expect(resolveCtrlC({ ...base, armedAt: T0, now: T0 + 500, windowMs: 400 })).toEqual<CtrlCDecision>({ kind: 'arm-exit', armedAt: T0 + 500 });
  });
});

describe('catalog + labels — every non-exit decision has a hint naming the next key', () => {
  it('tui.ctrl_c_* rows exist in en and tr and are carried by ReplLabels', () => {
    for (const key of ['tui.ctrl_c_draft_cleared', 'tui.ctrl_c_interrupt', 'tui.ctrl_c_arm']) {
      expect(getMessageLanguages(key), key).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en')).toContain('Ctrl-C');
      expect(getMessage(key, 'tr')).toContain('Ctrl-C');
    }
    const tr = buildReplLabels((k) => getMessage(k, 'tr'));
    expect(tr.ctrlCDraftCleared).toBe(getMessage('tui.ctrl_c_draft_cleared', 'tr'));
    expect(tr.ctrlCInterrupt).toBe(getMessage('tui.ctrl_c_interrupt', 'tr'));
    expect(tr.ctrlCArm).toBe(getMessage('tui.ctrl_c_arm', 'tr'));
  });
});

describe('wiring', () => {
  it('run.tsx mounts Ink with exitOnCtrlC: false so the policy owns Ctrl-C', () => {
    const src = readFileSync(join(ROOT, 'src/cli/repl/run.tsx'), 'utf-8');
    expect(src).toMatch(/exitOnCtrlC:\s*false/);
  });

  it('app.tsx routes InputBar interrupts through resolveCtrlC (no unconditional exit)', () => {
    const src = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
    expect(src).toMatch(/resolveCtrlC\(/);
    expect(src).not.toMatch(/onInterrupt=\{\(\) => exit\(\)\}/);
  });
});

describe('InputBar — hands the signal and the draft state to the caller', () => {
  const roots: string[] = [];
  afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
  const en = buildReplLabels((k) => getMessage(k, 'en'));
  const tick = (ms = 25): Promise<void> => new Promise((r) => setTimeout(r, ms));

  function mount(onInterrupt: (signal: 'int' | 'eof', draftNonEmpty: boolean) => void) {
    const root = mkdtempSync(join(tmpdir(), 'deckent-ctrlc-'));
    roots.push(root);
    return render(
      <InputBar
        active
        onSubmit={() => {}}
        onInterrupt={onInterrupt}
        menuMoreAbove={en.menuMoreAbove}
        menuMoreBelow={en.menuMoreBelow}
        reverseSearchLabel={en.reverseSearch}
        historyProjectRoot={root}
        caretStyle="marker"
      />,
    );
  }

  it('Ctrl-C with a draft → ("int", true) and the composer is cleared', async () => {
    const onInterrupt = vi.fn();
    const { stdin, lastFrame, unmount } = mount(onInterrupt);
    await tick();
    stdin.write('half typed');
    await tick();
    stdin.write('\x03');
    await tick();
    expect(onInterrupt).toHaveBeenCalledWith('int', true);
    expect(lastFrame() ?? '').not.toContain('half typed');
    unmount();
  });

  it('Ctrl-C on an empty composer → ("int", false); Ctrl-D → ("eof", false)', async () => {
    const onInterrupt = vi.fn();
    const { stdin, unmount } = mount(onInterrupt);
    await tick();
    stdin.write('\x03');
    await tick();
    expect(onInterrupt).toHaveBeenLastCalledWith('int', false);
    stdin.write('\x04');
    await tick();
    expect(onInterrupt).toHaveBeenLastCalledWith('eof', false);
    unmount();
  });
});
