// tests/cli/chat-banner-i18n.test.ts
// TERMINAL-TOOLS-001 — legacy REPL banner hint i18n.
//
// Design-critic finding (2026-09-02, capture slashmenu-100x30-DECKENT_INK=0):
// the legacy readline REPL's banner printed the hardcoded Turkish
// `/help komutlar için · doğal dil sohbet` above a now-English `/` menu in an
// English session. Owner revision (2026-09-02): the mechanism must be
// string-free — no exported English fallback either. Contract: renderBanner
// REQUIRES the hint (injected by entry.ts from `tui.banner.hint` for the
// session language); a missing injection throws a typed error instead of
// silently rendering English.

import { describe, it, expect } from 'vitest';
import { renderBanner, type BannerContext } from '../../src/cli/commands/chat-banner.js';
import { InjectedLabelMissingError } from '../../src/cli/helpers/injected-label.js';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';

const CTX: BannerContext = { provider: 'claude', dir: '/tmp/proj' };
const OLD_TURKISH_LITERAL = '/help komutlar için · doğal dil sohbet';
const TURKISH_ONLY_GLYPHS = /[çğıöşüÇĞİÖŞÜ]/;

describe('renderBanner — injected hint (string-free mechanism)', () => {
  it('renders the injected hint verbatim and never the old hardcoded Turkish literal', () => {
    const out = renderBanner(CTX, true, 'HINT-X');
    expect(out).toContain('HINT-X');
    expect(out).not.toContain(OLD_TURKISH_LITERAL);
  });

  it('throws a typed InjectedLabelMissingError when the hint is not injected (no silent English fallback)', () => {
    expect(() => (renderBanner as unknown as (c: BannerContext, t: boolean) => string)(CTX, true)).toThrow(InjectedLabelMissingError);
    expect(() => renderBanner(CTX, true, '')).toThrow(InjectedLabelMissingError);
  });

  it('carries no user-visible text of its own: the rendered banner contains only ctx fields and the injected hint', () => {
    const out = renderBanner(CTX, true, 'HINT-X').replace(/\x1b\[[0-9;]*m/g, '');
    expect(out).toBe(`deckent  ${CTX.provider}  ${CTX.dir}\nHINT-X\n`);
  });

  it('tui.banner.hint resolves in en AND tr; en is English, tr is the former Turkish text', () => {
    expect(getMessageLanguages('tui.banner.hint')).toEqual(expect.arrayContaining(['en', 'tr']));
    expect(getMessage('tui.banner.hint', 'en')).not.toMatch(TURKISH_ONLY_GLYPHS);
    expect(getMessage('tui.banner.hint', 'en')).toContain('/help');
    expect(getMessage('tui.banner.hint', 'tr')).toBe(OLD_TURKISH_LITERAL);
  });

  it('stays silent off-TTY (pipe contract unchanged) — with the hint still required by contract', () => {
    expect(renderBanner(CTX, false, 'HINT-X')).toBe('');
    expect(() => renderBanner(CTX, false, '')).toThrow(InjectedLabelMissingError);
  });
});
