// SURF-3 D3a+D3b — InboxCard RENDER tests via ink-testing-library (installed
// 2026-07-16, Alperen-authorized). Mounts the real component, reads its frames,
// and drives its useInput (↑↓ focus-nav, ↵ detail, Esc). Closes the session-long
// "Ink components are not render-testable" gap for the interactive inbox.
//
// Timing notes (real-terminal details, not InboxCard bugs): Ink flushes effects
// asynchronously (the feed-populating useEffect needs a tick), and multi-byte
// ESCAPE SEQUENCES (a lone Esc, and the arrow-key CSI codes \x1b[A / \x1b[B) are
// buffered by Ink's parser then flushed after a short timeout — so those
// keypresses need a longer tick than a plain char (Enter = '\r').
//
// pollMs is set huge so the 1s live-refresh interval never fires mid-test (the
// mount tick still populates rows + focuses the first row); the poll-realign
// logic itself is unit-tested in tests/cli/run-flow-inbox.test.ts.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { InboxCard } from '../../../src/cli/repl/inbox-card.js';
import { DEFAULT_INBOX_LABELS, type InboxRow } from '../../../src/cli/repl/run-flow-inbox.js';

const ESC = String.fromCharCode(27);
const UP = '\x1b[A';
const DOWN = '\x1b[B';
const ENTER = '\r';
const tick = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));

const ROWS: InboxRow[] = [
  { flowId: 'flow-aaa-1', state: 'DETACHED_RUNNING', intentSummary: 'add auth' },
  { flowId: 'flow-bbb-2', state: 'COMPLETED', intentSummary: 'fix bug', done: 2, total: 2 },
];
const feed = (): InboxRow[] => ROWS;

// Never let the 1s interval fire during a test.
const CARD = (extra: Record<string, unknown> = {}): React.ReactElement => (
  <InboxCard open feed={feed} labels={DEFAULT_INBOX_LABELS} onClose={() => {}} pollMs={100000} {...extra} />
);

describe('InboxCard — render (ink-testing-library proof)', () => {
  it('open=false renders nothing (no card, no stdin ownership)', () => {
    const { lastFrame } = render(<InboxCard open={false} feed={feed} onClose={() => {}} />);
    expect(lastFrame()).toBe('');
  });

  it('open=true renders header + rows + nav hint, first row focused by default', async () => {
    const { lastFrame } = render(CARD());
    await tick(); // let the feed-populating useEffect flush + realign to row 0
    const frame = lastFrame() ?? '';
    expect(frame).toContain(DEFAULT_INBOX_LABELS.header); // "Active runs"
    expect(frame).toContain('❯ 1. flow-aaa · running add auth'); // row 0 focused
    expect(frame).toContain('2. flow-bbb · completed (2/2) fix bug'); // row 1 present
    expect(frame).toContain('↑↓ select'); // nav hint (list mode)
  });
});

describe('InboxCard — focus navigation (D3b)', () => {
  it('↓ moves the focus cursor to the next row', async () => {
    const { lastFrame, stdin } = render(CARD());
    await tick();
    stdin.write(DOWN);
    await tick(80); // arrow CSI is a buffered escape sequence
    const frame = lastFrame() ?? '';
    expect(frame).toContain('❯ 2. flow-bbb · completed (2/2) fix bug'); // row 1 now focused
    expect(frame).not.toContain('❯ 1. flow-aaa'); // row 0 no longer focused
  });

  it('↑ from the first row wraps to the last', async () => {
    const { lastFrame, stdin } = render(CARD());
    await tick();
    stdin.write(UP);
    await tick(80);
    expect(lastFrame() ?? '').toContain('❯ 2. flow-bbb'); // wrapped to last
  });

  it('↵ opens the focused run detail in-card (list hidden)', async () => {
    const { lastFrame, stdin } = render(CARD());
    await tick();
    stdin.write(ENTER);
    await tick(80);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Run flow-aaa · running'); // detail header
    expect(frame).toContain('id: flow-aaa-1'); // full id
    expect(frame).toContain('intent: add auth');
    expect(frame).toContain('↑↓ browse'); // detail hint
    expect(frame).not.toContain(DEFAULT_INBOX_LABELS.header); // list is hidden
  });
});

describe('InboxCard — two-level Esc + mutex (D3a/D3b)', () => {
  it('Esc from an OPEN detail returns to the list (does NOT close the card)', async () => {
    const onClose = vi.fn();
    const { lastFrame, stdin } = render(CARD({ onClose }));
    await tick();
    stdin.write(ENTER); // open detail
    await tick(80);
    stdin.write(ESC); // back to list
    await tick(80);
    expect(onClose).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').toContain(DEFAULT_INBOX_LABELS.header); // list restored
  });

  it('Esc from the LIST invokes onClose (the card closes)', async () => {
    const onClose = vi.fn();
    const { stdin } = render(CARD({ onClose }));
    await tick();
    stdin.write(ESC);
    await tick(80);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isActive=false suppresses every key (mutex deference)', async () => {
    const onClose = vi.fn();
    const { lastFrame, stdin } = render(CARD({ onClose, isActive: false }));
    await tick();
    stdin.write(DOWN);
    await tick(80);
    stdin.write(ESC);
    await tick(80);
    expect(onClose).not.toHaveBeenCalled();
    // no navigation happened — row 0 still focused
    expect(lastFrame() ?? '').toContain('❯ 1. flow-aaa');
  });

  void React;
});
