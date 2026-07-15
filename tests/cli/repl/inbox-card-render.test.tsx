// SURF-3 — InboxCard RENDER tests via ink-testing-library (installed 2026-07-16,
// Alperen-authorized). Closes the session-long "Ink components are not
// render-testable" gap: we mount the real component, read its frames, and drive
// its useInput (Esc).
//
// Timing notes (real-terminal details, not InboxCard bugs): Ink flushes effects
// asynchronously (the feed-populating useEffect needs a tick), and a LONE Escape
// is buffered by Ink's parser (waiting to see if it starts an escape sequence
// like an arrow key) then flushed after a short timeout — so the Esc keypress
// needs a longer tick than a regular key.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { InboxCard } from '../../../src/cli/repl/inbox-card.js';

const ESC = String.fromCharCode(27);
const tick = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('InboxCard — render + Esc (ink-testing-library proof)', () => {
  it('open=false renders nothing (no card, no stdin ownership)', () => {
    const { lastFrame } = render(
      <InboxCard open={false} feed={() => ['x']} followHint="hint" onClose={() => {}} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('open=true renders the feed lines + the follow hint', async () => {
    const feed = (): string[] => ['Active runs', '  1. abc · running', 'Tip: follow'];
    const { lastFrame } = render(
      <InboxCard open={true} feed={feed} followHint="LIVE-Esc-close" onClose={() => {}} />,
    );
    await tick(); // let the feed-populating useEffect flush
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Active runs');
    expect(frame).toContain('1. abc · running');
    expect(frame).toContain('LIVE-Esc-close');
  });

  it('Esc keypress invokes onClose (the useInput handler actually fires)', async () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <InboxCard open={true} feed={() => ['row']} followHint="h" onClose={onClose} />,
    );
    await tick();
    stdin.write(ESC);
    await tick(80); // lone ESC is buffered then flushed — needs the longer wait
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isActive=false suppresses the Esc handler (mutex deference)', async () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <InboxCard open={true} feed={() => ['row']} followHint="h" onClose={onClose} isActive={false} />,
    );
    await tick();
    stdin.write(ESC);
    await tick(80);
    expect(onClose).not.toHaveBeenCalled();
  });

  void React;
});
