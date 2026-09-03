// src/cli/repl/ink-palette.ts
// ═══ TERMINAL-READABILITY-001 — Ink role palette (theme-mapped, tier-resolved) ═══
//
// Ink colors through chalk, and chalk converts a hex literal to the nearest
// ANSI color by its OWN level detection — it never consults the project color
// gate (helpers/theme.ts) and never knows whether the host theme is light or
// dark. Every card that painted its own teal / gold hex therefore ignored the
// user's IDE theme. This module is the only place Ink components take a color
// from: it projects the generated palette roles (design/tokens/terminal.map.json
// → helpers/generated/palette.ts) onto Text props for the tier theme.ts admitted.
//
//   ansi16    named 16-colors — the HOST palette paints them, so a user's
//             VS Code / Cursor / JetBrains / Windows Terminal theme decides the
//             actual pixels (the tier every IDE terminal gets by default)
//   ansi256   `ansi256(n)` — only when a dark background is known
//   truecolor the NOVA token hex — only when a dark background is known
//   none      no color, no attribute: textual carriers only
//
// Attributes (inverse for focus, underline for links) are tier-independent
// carriers; SGR dim is not a role and never will be (owner decision 2026-09-03).
// Pure and React-free; the context lives in ink-palette-context.tsx.

import { PALETTE, type PaletteRole } from '../helpers/generated/palette.js';
import type { ColorTier } from '../helpers/theme.js';

export type InkRole = PaletteRole;

export interface InkRoleStyle {
  color?: string;
  bold?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

export type InkPalette = Readonly<Record<InkRole, InkRoleStyle>>;

export const INK_ROLES: readonly InkRole[] = Object.keys(PALETTE) as InkRole[];

/** SGR 16-color parameter → chalk color name (what Ink's `color` prop accepts). */
const ANSI16_NAME: Readonly<Record<string, string>> = {
  '30': 'black', '31': 'red', '32': 'green', '33': 'yellow', '34': 'blue', '35': 'magenta', '36': 'cyan', '37': 'white',
  '90': 'gray', '91': 'redBright', '92': 'greenBright', '93': 'yellowBright', '94': 'blueBright', '95': 'magentaBright', '96': 'cyanBright', '97': 'whiteBright',
};

function tierColor(role: InkRole, tier: ColorTier): string | undefined {
  const entry = PALETTE[role];
  if (tier === 'truecolor' && entry.hex !== null) return entry.hex;
  if (tier === 'ansi256' && entry.ansi256 !== null) return `ansi256(${entry.ansi256})`;
  if (entry.ansi16 === '') return undefined;
  const name = ANSI16_NAME[entry.ansi16];
  if (name === undefined) throw new Error(`palette role ${role}: not a 16-color SGR parameter: ${entry.ansi16}`);
  return name;
}

function roleStyle(role: InkRole, tier: ColorTier): InkRoleStyle {
  if (tier === 'none') return {};
  const entry = PALETTE[role];
  const style: InkRoleStyle = {};
  const color = tierColor(role, tier);
  if (color !== undefined) style.color = color;
  if (entry.attrs.includes('1')) style.bold = true;
  if (entry.attrs.includes('4')) style.underline = true;
  if (entry.attrs.includes('7')) style.inverse = true;
  return style;
}

/** Resolve every role for one tier (call once per render root; the result is immutable). */
export function resolveInkPalette(tier: ColorTier): InkPalette {
  const out: Partial<Record<InkRole, InkRoleStyle>> = {};
  for (const role of INK_ROLES) out[role] = Object.freeze(roleStyle(role, tier));
  return Object.freeze(out) as InkPalette;
}
