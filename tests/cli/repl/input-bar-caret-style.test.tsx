// tests/cli/repl/input-bar-caret-style.test.tsx
// TERMINAL-TOOLS-003 — the composer caret keeps a NON-color carrier when the
// color gate is suppressed. Honoring NO_COLOR for the Ink surface disables
// chalk's inverse attribute too, so the caret would vanish; `caretStyle`
// ('inverse' | 'marker') is resolved by run.tsx from theme.ts and the marker
// style renders an explicit `|` before the caret cell instead (design rule:
// meaning is never carried by color alone).

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputBar } from '../../../src/cli/repl/input-bar.js';
import { buildReplLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const tick = (ms = 25): Promise<void> => new Promise((r) => setTimeout(r, ms));
const en = buildReplLabels((k) => getMessage(k, 'en'));

describe('InputBar — caretStyle', () => {
  const roots: string[] = [];
  afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

  function mount(caretStyle: 'inverse' | 'marker') {
    const root = mkdtempSync(join(tmpdir(), 'deckent-caret-'));
    roots.push(root);
    return render(
      <InputBar
        active
        onSubmit={() => {}}
        onInterrupt={() => {}}
        menuMoreAbove={en.menuMoreAbove}
        menuMoreBelow={en.menuMoreBelow}
        reverseSearchLabel={en.reverseSearch}
        historyProjectRoot={root}
        caretStyle={caretStyle}
      />,
    );
  }

  it('marker style renders an explicit `|` before the caret cell (mid-line and at the end)', async () => {
    const { stdin, lastFrame, unmount } = mount('marker');
    await tick();
    stdin.write('ab');
    await tick();
    expect(lastFrame() ?? '').toContain('› ab|');
    stdin.write('\x1b[D'); // left
    await tick();
    expect(lastFrame() ?? '').toContain('› a|b');
    unmount();
  });

  it('inverse style renders no marker glyph (the caret is the inverse attribute)', async () => {
    const { stdin, lastFrame, unmount } = mount('inverse');
    await tick();
    stdin.write('ab');
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('› ab');
    expect(frame).not.toContain('|');
    unmount();
  });
});
