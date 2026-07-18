/**
 * 583/N3 «Makine Dairesi» — xterm theme DERIVED from the watch tokens.
 *
 * xterm paints on a canvas, so CSS variables cannot cascade into it — the
 * theme must be handed over as literal color values. The dashboard hardcodes
 * an inline teal/gold palette; the Desktop shell instead derives every value
 * from the SAME semantic tokens the rest of the app wears (D4-1 SSOT,
 * theme-tokens.ts) — switch the watch, the machinery below deck changes
 * lighting with the bridge. Zero color literals in this module (kanun-10).
 *
 * Pure over an injected reader so the derivation is hermetically pinned
 * against buildCssVariables() output for every watch — no DOM required.
 */
import { CSS_VAR_PREFIX, type SemanticTokenName } from '../../shared/theme-tokens.js';

/** Reads one SEMANTIC token's current value (e.g. from getComputedStyle). */
export type SemanticVarReader = (name: SemanticTokenName) => string;

/** The exact ITheme subset the panel sets (structural — no xterm import). */
export interface DerivedXtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

/** CSS custom-property name of a semantic token (the runtime's own naming). */
export function semanticVarName(name: SemanticTokenName): string {
  return `${CSS_VAR_PREFIX.semantic}${name}`;
}

/** #RRGGBB → #RRGGBBAA; any other format passes through untouched (honest —
 *  a custom token in an exotic format still selects, just without alpha). */
function withAlpha(color: string, alphaHex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : color;
}

/**
 * Map the 13 semantic tokens onto xterm's palette. ANSI slots follow the
 * watch's own vocabulary: go→green, caution→yellow, abort→red, accent→magenta
 * (the route ink), brass→blue+cyan (instrument metal), inks→white/black axis.
 */
export function deriveXtermTheme(read: SemanticVarReader): DerivedXtermTheme {
  const bg = read('bg');
  const text = read('text');
  const textMuted = read('text-muted');
  const accent = read('accent');
  const brass = read('brass');
  const go = read('go');
  const caution = read('caution');
  const abort = read('abort');
  return {
    background: bg,
    foreground: text,
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: withAlpha(accent, '4D'), // ~30% route-ink wash
    black: bg,
    red: abort,
    green: go,
    yellow: caution,
    blue: brass,
    magenta: accent,
    cyan: brass,
    white: text,
    brightBlack: textMuted,
    brightRed: abort,
    brightGreen: go,
    brightYellow: caution,
    brightBlue: brass,
    brightMagenta: accent,
    brightCyan: brass,
    brightWhite: text,
  };
}
