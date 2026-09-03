// tests/cli/helpers/wcag-contrast.test.ts
// ═══ TERMINAL-READABILITY-001 — WCAG 2.2 contrast math + host minimum-contrast model ═══
//
// Pure math, hermetic. Known values: black/white = 21:1, #767676 on white ≈ 4.54:1
// (the classic AA boundary gray), a color already above the ratio is returned untouched,
// and the xterm.js-style adjustment moves the foreground toward white on a dark
// background (toward black on a light one) until the ratio holds.

import { describe, it, expect } from 'vitest';
import { contrastRatio, relativeLuminance, ensureMinimumContrast } from '../../../src/cli/helpers/wcag-contrast.js';

describe('relativeLuminance / contrastRatio', () => {
  it('black and white span the full 1:21 range', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 3);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 3);
  });
  it('#767676 on white sits on the AA boundary (≈4.54)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
  });
  it('accepts upper-case and short forms', () => {
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 3);
  });
});

describe('ensureMinimumContrast (host model)', () => {
  it('returns the foreground untouched when the ratio already holds', () => {
    expect(ensureMinimumContrast('#ffffff', '#000000', 4.5)).toBe('#ffffff');
  });
  it('lifts a dark foreground on a dark background until 4.5 holds', () => {
    const adjusted = ensureMinimumContrast('#2472c8', '#181818', 4.5);
    expect(contrastRatio(adjusted, '#181818')).toBeGreaterThanOrEqual(4.5);
    expect(relativeLuminance(adjusted)).toBeGreaterThan(relativeLuminance('#2472c8'));
  });
  it('darkens a pale foreground on a light background until 4.5 holds', () => {
    const adjusted = ensureMinimumContrast('#949800', '#F8F8F8', 4.5);
    expect(contrastRatio(adjusted, '#F8F8F8')).toBeGreaterThanOrEqual(4.5);
    expect(relativeLuminance(adjusted)).toBeLessThan(relativeLuminance('#949800'));
  });
  it('ratio 1 (host feature disabled) never changes anything', () => {
    expect(ensureMinimumContrast('#2472c8', '#181818', 1)).toBe('#2472c8');
  });
});
