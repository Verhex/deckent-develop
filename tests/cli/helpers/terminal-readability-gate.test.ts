// tests/cli/helpers/terminal-readability-gate.test.ts
// ═══ TERMINAL-READABILITY-001 — every palette role is readable in every host theme ═══
//
// Owner decision (2026-09-03): the Terminal must stay readable inside VS Code,
// Cursor, JetBrains, Windows Terminal and macOS Terminal under whatever theme
// the user configured. The generated palette (design/tokens/terminal.map.json →
// src/cli/helpers/generated/palette.ts) therefore carries a contrast CLASS per
// role and this gate measures each role against the fixture palettes:
//
//   primary       — text read on its own (body, secondary facts, hints, code,
//                   links, the selected row): ≥ 4.5:1 (WCAG 2.2 AA text)
//   supplemental  — a color that accompanies a textual carrier (a status word,
//                   a risk badge next to its label): ≥ 3:1 (WCAG non-text UI)
//   decorative    — frames, chevrons, bullets that never carry meaning alone:
//                   no threshold, but never dim
//
// Tiers: ansi16 renders through the HOST palette (so the fixture's own colors
// apply — this is the tier every IDE terminal gets unless a dark background is
// proven); truecolor / ansi256 are admitted only when the background is known
// dark (theme.ts darkBackgroundKnown), so they are measured on the dark fixtures.
// Hosts that auto-adjust foreground contrast (xterm.js minimumContrastRatio) are
// modeled; hosts without it are measured raw. Hermetic — no env, no TTY.

import { describe, it, expect } from 'vitest';
import { PALETTE, type PaletteRole } from '../../../src/cli/helpers/generated/palette.js';
import { roleSgrAt } from '../../../src/cli/helpers/theme.js';
import { contrastRatio, ensureMinimumContrast } from '../../../src/cli/helpers/wcag-contrast.js';
import { TERMINAL_THEME_FIXTURES, ansi16Foreground, ansi256Foreground, type TerminalThemeFixture } from './fixtures/terminal-themes.js';

const THRESHOLD: Record<string, number | null> = { primary: 4.5, supplemental: 3, decorative: null };
const ROLES = Object.keys(PALETTE) as PaletteRole[];
const DARK = TERMINAL_THEME_FIXTURES.filter((t) => t.kind === 'dark');

function measured(fg: string, theme: TerminalThemeFixture): number {
  const painted = theme.minimumContrastRatio ? ensureMinimumContrast(fg, theme.background, theme.minimumContrastRatio) : fg;
  return contrastRatio(painted, theme.background);
}

function inverseRatio(theme: TerminalThemeFixture): number {
  // SGR 7 swaps the pair: the text is painted in the background color on the foreground color.
  return contrastRatio(theme.background, theme.foreground);
}

describe('palette schema', () => {
  it('every role declares a contrast class and never uses SGR dim', () => {
    for (const role of ROLES) {
      const entry = PALETTE[role];
      expect(['primary', 'supplemental', 'decorative'], role).toContain(entry.class);
      expect(entry.ansi16, role).not.toBe('2');
      expect(entry.attrs, role).not.toContain('2');
    }
  });
  it('the roles the Terminal surfaces need exist', () => {
    for (const role of ['success', 'error', 'warning', 'info', 'muted', 'accent', 'focus', 'link', 'code']) {
      expect(ROLES, role).toContain(role);
    }
  });
  it('focus is a theme-agnostic carrier (inverse), muted is the default foreground in the host tier', () => {
    expect(PALETTE.focus.attrs).toContain('7');
    expect(PALETTE.focus.ansi16).toBe('');
    expect(PALETTE.muted.ansi16).toBe('');
    expect(PALETTE.muted.class).toBe('primary');
  });
});

describe('ansi16 tier — the host palette paints the role', () => {
  for (const theme of TERMINAL_THEME_FIXTURES) {
    for (const role of ROLES) {
      const entry = PALETTE[role];
      const threshold = THRESHOLD[entry.class];
      if (threshold === null) continue;
      it(`${role} (${entry.class}) reads on ${theme.id}`, () => {
        const ratio = entry.attrs.includes('7') ? inverseRatio(theme) : measured(ansi16Foreground(entry.ansi16, theme), theme);
        expect(ratio, `${role} on ${theme.id}: ${ratio.toFixed(2)}:1 < ${threshold}`).toBeGreaterThanOrEqual(threshold);
      });
    }
  }
});

describe('truecolor / ansi256 tiers — admitted only on a known-dark background', () => {
  for (const theme of DARK) {
    for (const role of ROLES) {
      const entry = PALETTE[role];
      const threshold = THRESHOLD[entry.class];
      if (threshold === null || entry.hex === null) continue;
      it(`${role} token hex reads on ${theme.id}`, () => {
        const ratio = entry.attrs.includes('7') ? inverseRatio(theme) : measured(entry.hex as string, theme);
        expect(ratio, `${role} ${entry.hex} on ${theme.id}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(threshold);
      });
      it(`${role} nearest xterm-256 color reads on ${theme.id}`, () => {
        const ratio = measured(ansi256Foreground(entry.ansi256 as number, theme), theme);
        expect(ratio, `${role} ansi256(${entry.ansi256}) on ${theme.id}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(threshold);
      });
    }
  }
});

describe('roleSgrAt — the SGR the Theme emits per tier', () => {
  it('composes attributes and the tier color; a bare default-foreground role is null', () => {
    expect(roleSgrAt('muted', 'ansi16')).toBeNull();
    expect(roleSgrAt('focus', 'ansi16')).toBe('7');
    expect(roleSgrAt('link', 'ansi16')).toBe(`4;${PALETTE.link.ansi16}`);
    expect(roleSgrAt('success', 'truecolor')).toMatch(/^38;2;\d+;\d+;\d+$/);
    expect(roleSgrAt('success', 'ansi256')).toBe(`38;5;${PALETTE.success.ansi256}`);
    expect(roleSgrAt('success', 'none')).toBeNull();
  });
});
