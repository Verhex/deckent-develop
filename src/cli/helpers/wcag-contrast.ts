// src/cli/helpers/wcag-contrast.ts
// ═══ TERMINAL-READABILITY-001 — WCAG 2.2 contrast math + host auto-contrast model ═══
//
// Pure, dependency-free. Used by the readability gate (tests) and available to
// runtime diagnostics (`deckent doctor` can report the effective tier/theme
// legibility without re-deriving the formulas). No I/O, no env.

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] {
  const raw = hex.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex color: ${hex}`);
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG 2.x relative luminance of an sRGB hex color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colors (1 … 21), order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Model of a host terminal's minimum-contrast feature (xterm.js
 * `minimumContrastRatio`, VS Code / Cursor default 4.5): when the pair is
 * below `ratio`, the foreground is moved toward white on a dark background
 * (toward black on a light one) in small steps until the ratio holds or the
 * color reaches pure white / black. `ratio <= 1` disables the model.
 */
export function ensureMinimumContrast(fg: string, bg: string, ratio: number): string {
  if (ratio <= 1 || contrastRatio(fg, bg) >= ratio) return fg;
  const towardWhite = relativeLuminance(bg) < 0.5;
  let rgb = parseHex(fg);
  for (let step = 0; step < 100; step++) {
    rgb = rgb.map((c) => (towardWhite ? c + (255 - c) * 0.1 + 1 : c - c * 0.1 - 1)) as [number, number, number];
    const candidate = toHex(rgb);
    if (contrastRatio(candidate, bg) >= ratio) return candidate;
    if (candidate === '#ffffff' || candidate === '#000000') return candidate;
  }
  return towardWhite ? '#ffffff' : '#000000';
}
