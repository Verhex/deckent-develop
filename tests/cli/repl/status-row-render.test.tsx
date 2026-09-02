// tests/cli/repl/status-row-render.test.tsx
// TERMINAL-TOOLS-004 — the StatusRow component renders ONE line at a narrow
// width (real Ink render via ink-testing-library). Before: a flex row of
// separate <Text> items lost its spacing ("deckentollama") and wrapped.

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusRow } from '../../../src/cli/repl/status-row.js';

const tick = (ms = 25): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('StatusRow — single-line render', () => {
  it('renders one line with the brand/provider gap intact and the cwd tail visible at 60 columns', async () => {
    const { lastFrame, unmount } = render(
      <StatusRow
        columns={60}
        input={{ brand: 'deckent', provider: 'ollama', cwd: '/tmp/claude-1000/-home-alperen-deckent-dev/scratchpad/probe-project-fresh' }}
      />,
    );
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame.split('\n')).toHaveLength(1);
    expect(frame).toContain('deckent  ollama  …');
    expect(frame).toContain('/probe-project-fresh');
    expect(frame).not.toContain('deckentollama');
    expect(frame.length).toBeLessThanOrEqual(60);
    unmount();
  });

  it('shows the optional segments when they fit', async () => {
    const { lastFrame, unmount } = render(
      <StatusRow columns={120} input={{ brand: 'deckent', provider: 'claude', model: 'claude-sonnet-5', cwd: '/work', sessionTok: 321, approval: 'auto-edit' }} />,
    );
    await tick();
    expect(lastFrame() ?? '').toBe('deckent  claude · claude-sonnet-5  /work  · Σ 321 tok  · »auto-edit');
    unmount();
  });
});
