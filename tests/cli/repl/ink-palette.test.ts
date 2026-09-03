// tests/cli/repl/ink-palette.test.ts
// ═══ TERMINAL-READABILITY-001 — Ink role palette (theme-mapped, tier-resolved) ═══
//
// Ink colors through chalk, which converts a hex to the nearest ANSI color by
// ITS OWN level detection and never consults the project color gate — that is
// how every card ended up painting `#4DB8A4` on a light IDE theme. The Ink
// palette resolves each generated palette role into Text props for the tier
// theme.ts admitted: named 16-colors (the host theme paints them) in ansi16,
// `ansi256(n)` / hex only when a dark background is known, nothing at all when
// color is off. Attributes (inverse / bold / underline) survive every tier
// except 'none'. Hermetic.

import { describe, it, expect } from 'vitest';
import { resolveInkPalette, INK_ROLES, type InkRole } from '../../../src/cli/repl/ink-palette.js';
import { PALETTE } from '../../../src/cli/helpers/generated/palette.js';

const NAMED = /^(black|red|green|yellow|blue|magenta|cyan|white|gray|(red|green|yellow|blue|magenta|cyan|white)Bright)$/;

describe('resolveInkPalette', () => {
  it('ansi16: only named chalk colors (host-theme mapped), never a hex', () => {
    const p = resolveInkPalette('ansi16');
    for (const role of INK_ROLES) {
      const style = p[role];
      if (style.color !== undefined) expect(style.color, role).toMatch(NAMED);
    }
    expect(p.accent.color).toBe('cyan');
    expect(p.muted.color).toBeUndefined();
    expect(p.focus).toEqual({ inverse: true });
    expect(p.link).toEqual({ color: 'blueBright', underline: true });
  });
  it('truecolor: the token hex flows for roles that have one; attribute roles stay attributes', () => {
    const p = resolveInkPalette('truecolor');
    expect(p.success.color).toBe(PALETTE.success.hex);
    expect(p.focus).toEqual({ inverse: true });
  });
  it('ansi256: the nearest xterm index in Ink syntax', () => {
    const p = resolveInkPalette('ansi256');
    expect(p.success.color).toBe(`ansi256(${PALETTE.success.ansi256})`);
  });
  it('none: every role is an empty style (no SGR, textual carriers only)', () => {
    const p = resolveInkPalette('none');
    for (const role of INK_ROLES) expect(p[role], role).toEqual({});
  });
  it('covers exactly the generated palette roles', () => {
    expect([...INK_ROLES].sort()).toEqual(Object.keys(PALETTE).sort());
    const role: InkRole = 'code';
    expect(resolveInkPalette('ansi16')[role].color).toBe('blueBright');
  });
});
