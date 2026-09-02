// tests/cli/repl/slash-menu-more-labels.test.tsx
// TERMINAL-TOOLS-001 — `/` menu scroll hints ("↑ N more" / "↓ N more") i18n.
//
// Design-critic finding (2026-09-02, capture slashmenu-100x30-LANGPROBE=tr-after):
// the localized Turkish `/` menu still ended with a hardcoded English
// `↓ 32 more` because input-bar.tsx (a mechanism module) carried the literal.
// Owner revision (2026-09-02): no exported English fallback either — the
// templates are REQUIRED injected labels (same route as `menuHint`, resolved
// by run.tsx buildReplLabels from `tui.menu_more_*`); a missing injection
// surfaces as a typed error through the REPL error boundary, never as silent
// English. The Ink render cases prove the wire into the real InputBar
// (ink-testing-library, same precedent as approval-card-render.test.tsx).

import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputBar, formatMenuMore, type InputBarProps } from '../../../src/cli/repl/input-bar.js';
import { ReplErrorBoundary } from '../../../src/cli/repl/app.js';
import { buildReplLabels, buildReplErrorDescriber } from '../../../src/cli/repl/run.js';
import { INJECTED_LABEL_MISSING_CODE } from '../../../src/cli/helpers/injected-label.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';
import type { SlashCommand } from '../../../src/cli/commands/chat-slash-registry.js';

const tick = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 12 commands → 8-row window leaves exactly 4 below the fold. */
const TWELVE: SlashCommand[] = Array.from({ length: 12 }, (_, i) => ({
  name: `/c${String(i + 1).padStart(2, '0')}`,
  desc: `desc ${i + 1}`,
}));

describe('formatMenuMore — {n} template', () => {
  it('substitutes the count into the injected template', () => {
    expect(formatMenuMore('↑ {n} daha', 12)).toBe('↑ 12 daha');
    expect(formatMenuMore('↓ {n} more', 4)).toBe('↓ 4 more');
  });
});

describe('menu-more labels — catalog wire', () => {
  it('tui.menu_more_above/below resolve in en AND tr and differ between the languages', () => {
    for (const key of ['tui.menu_more_above', 'tui.menu_more_below']) {
      expect(getMessageLanguages(key), key).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en')).toContain('{n}');
      expect(getMessage(key, 'tr')).toContain('{n}');
      expect(getMessage(key, 'tr')).not.toBe(getMessage(key, 'en'));
    }
  });

  it('buildReplLabels(t) carries menuMoreAbove/menuMoreBelow for the session language', () => {
    const tr = buildReplLabels((k) => getMessage(k, 'tr'));
    expect(tr.menuMoreAbove).toBe(getMessage('tui.menu_more_above', 'tr'));
    expect(tr.menuMoreBelow).toBe(getMessage('tui.menu_more_below', 'tr'));
    const en = buildReplLabels((k) => getMessage(k, 'en'));
    expect(en.menuMoreBelow).toBe(getMessage('tui.menu_more_below', 'en'));
  });
});

describe('InputBar — `/` menu scroll hint (ink-testing-library)', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('typing `/` over a 12-command registry shows the injected Turkish "below" hint with the real count', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-menu-more-'));
    roots.push(root);
    const tr = buildReplLabels((k) => getMessage(k, 'tr'));
    const { stdin, lastFrame, unmount } = render(
      <InputBar
        active
        onSubmit={() => {}}
        onInterrupt={() => {}}
        slashRegistry={TWELVE}
        menuHint={tr.menuHint}
        menuMoreAbove={tr.menuMoreAbove}
        menuMoreBelow={tr.menuMoreBelow}
        reverseSearchLabel={tr.reverseSearch}
        historyProjectRoot={root}
      />,
    );
    await tick();
    stdin.write('/');
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain(formatMenuMore(getMessage('tui.menu_more_below', 'tr'), 4));
    expect(frame).not.toContain('more');
    unmount();
  });

  for (const lang of ['tr', 'en'] as const) {
    it(`a missing injection surfaces through the REPL error boundary as the ${lang} catalog description — never English prose from the mechanism`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'deckent-menu-more-'));
      roots.push(root);
      // React reports the caught render error on console.error; keep the test
      // output pristine without hiding the assertions below.
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const missing = {} as Pick<InputBarProps, 'menuMoreAbove' | 'menuMoreBelow'>;
      const { lastFrame, unmount } = render(
        <ReplErrorBoundary label={getMessage('tui.render_error', lang)} describeError={buildReplErrorDescriber(lang)}>
          <InputBar
            active
            onSubmit={() => {}}
            onInterrupt={() => {}}
            slashRegistry={TWELVE}
            historyProjectRoot={root}
            reverseSearchLabel={getMessage('tui.reverse_search', lang)}
            {...missing}
          />
        </ReplErrorBoundary>,
      );
      await tick();
      // Ink wraps the long explanation at the 100-column frame width, so
      // compare on whitespace-normalized text (reflow is not a content change).
      const frame = (lastFrame() ?? '').replace(/\s+/g, ' ');
      const expected = getMessage('tui.injected_label_missing', lang, { label: 'menuMoreAbove', code: INJECTED_LABEL_MISSING_CODE }).replace(/\s+/g, ' ');
      expect(frame).toContain(getMessage('tui.render_error', lang));
      expect(frame).toContain(expected);
      // The mechanism's own words must not reach the screen: no prose from the
      // error message, no English fallback hint, no menu text.
      expect(frame).not.toContain('injected label missing');
      expect(frame).not.toContain('resolve it via');
      expect(frame).not.toContain('more');
      if (lang === 'tr') expect(frame).not.toContain('REPL render error');
      unmount();
    });
  }

  it('without a describer the boundary renders only the technical code (no prose) for a missing injection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-menu-more-'));
    roots.push(root);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const missing = {} as Pick<InputBarProps, 'menuMoreAbove' | 'menuMoreBelow'>;
    const { lastFrame, unmount } = render(
      <ReplErrorBoundary label={getMessage('tui.render_error', 'en')}>
        <InputBar active onSubmit={() => {}} onInterrupt={() => {}} slashRegistry={TWELVE} historyProjectRoot={root} reverseSearchLabel={getMessage('tui.reverse_search', 'en')} {...missing} />
      </ReplErrorBoundary>,
    );
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain(INJECTED_LABEL_MISSING_CODE);
    expect(frame).not.toContain('injected label missing');
    unmount();
  });
});
