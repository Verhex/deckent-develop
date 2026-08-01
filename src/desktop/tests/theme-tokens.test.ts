// D4-1 («Köprüüstü») — theme-token SSOT pins: the three-layer builder chain,
// preferences schema, and the token validator (done-criterion: "token-validator
// yeşil" — the REAL palette must produce ZERO issues, including WCAG contrast).

import { describe, it, expect } from 'vitest';
import {
  buildCssVariables,
  contrastRatio,
  DEFAULT_PREFERENCES,
  desktopPreferencesSchema,
  PRIMITIVES,
  SEMANTIC_TOKEN_NAMES,
  validateThemeTokens,
  WATCH_NAMES,
  WATCHES,
  type WatchDefinition,
} from '../src/shared/theme-tokens.js';

describe('validateThemeTokens — the REAL palette is green (done-criterion)', () => {
  it('produces ZERO issues for the shipped watches (completeness + hex + WCAG contrast)', () => {
    const issues = validateThemeTokens();
    // Print exact issues on failure — actionable, never a bare boolean.
    expect(issues.map((i) => `${i.watch}: ${i.token} — ${i.problem}`)).toEqual([]);
  });

  it('every watch resolves text/bg at ≥4.5:1 (double-checked directly, not just via the validator)', () => {
    for (const watch of WATCH_NAMES) {
      const d = WATCHES[watch];
      const ratio = contrastRatio(PRIMITIVES[d.text], PRIMITIVES[d.bg]);
      expect(ratio, `${watch} text/bg`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('validateThemeTokens — negative fixtures (the validator actually bites)', () => {
  it('flags a missing semantic token', () => {
    const broken = structuredClone(WATCHES) as Record<string, Partial<WatchDefinition>>;
    delete broken['day-watch']!.accent;
    const issues = validateThemeTokens(broken as never);
    expect(issues.some((i) => i.watch === 'day-watch' && i.token === 'accent' && i.problem.includes('not defined'))).toBe(true);
  });

  it('flags a pointer to an unknown primitive', () => {
    const broken = structuredClone(WATCHES);
    (broken['open-sea'] as Record<string, string>).brass = 'no-such-ink';
    const issues = validateThemeTokens(broken);
    expect(issues.some((i) => i.watch === 'open-sea' && i.problem.includes('unknown primitive'))).toBe(true);
  });

  it('flags an invalid primitive hex', () => {
    const issues = validateThemeTokens(WATCHES, { ...PRIMITIVES, ink: 'kinda-dark' });
    expect(issues.some((i) => i.token === 'ink' && i.problem.includes('not a valid hex'))).toBe(true);
  });

  it('flags a WCAG contrast failure (muted text on same-tone bg)', () => {
    const broken = structuredClone(WATCHES);
    broken['day-watch'].text = 'buffLine'; // near-bg ink → unreadable
    const issues = validateThemeTokens(broken);
    expect(issues.some((i) => i.watch === 'day-watch' && i.problem.includes('below the required'))).toBe(true);
  });
});

describe('buildCssVariables — the three-layer chain is materialized', () => {
  it('primitives carry hex, semantic tokens point at primitives, component tokens point at semantic', () => {
    const vars = buildCssVariables('day-watch');
    expect(vars['--dk-p-magenta']).toBe('#BD4278');
    expect(vars['--dk-s-accent']).toBe('var(--dk-p-magenta)');
    expect(vars['--dk-c-btn-bg']).toBe('var(--dk-s-accent)');
  });

  it('a watch switch re-points the semantic layer (night accent red-shifts — bridge physics)', () => {
    const night = buildCssVariables('night-watch');
    expect(night['--dk-s-accent']).toBe('var(--dk-p-nightAccent)');
    expect(night['--dk-s-bg']).toBe('var(--dk-p-night)');
    // primitives are watch-independent
    expect(night['--dk-p-magenta']).toBe('#BD4278');
  });

  it('a custom override replaces the semantic pointer with the raw value; components keep following', () => {
    const vars = buildCssVariables('day-watch', { accent: '#123456' });
    expect(vars['--dk-s-accent']).toBe('#123456');
    expect(vars['--dk-c-btn-bg']).toBe('var(--dk-s-accent)'); // cascades automatically
  });

  it('emits a CONSTANT key set across watches (idempotent re-apply needs no cleanup)', () => {
    const keys = (w: (typeof WATCH_NAMES)[number]) => Object.keys(buildCssVariables(w)).sort();
    expect(keys('day-watch')).toEqual(keys('night-watch'));
    expect(keys('day-watch')).toEqual(keys('open-sea'));
  });
});

describe('desktopPreferencesSchema', () => {
  it('accepts the defaults and a full valid record', () => {
    expect(desktopPreferencesSchema.parse(DEFAULT_PREFERENCES)).toEqual(DEFAULT_PREFERENCES);
    const full = { version: 2, watch: 'open-sea', customTokens: { accent: '#AABBCC' }, fontSet: 'envanter-legacy' };
    expect(desktopPreferencesSchema.parse(full)).toEqual(full);
  });

  it('rejects an unknown watch, an unknown custom-token key, and a non-hex override', () => {
    expect(desktopPreferencesSchema.safeParse({ version: 2, watch: 'dog-watch', customTokens: {}, fontSet: 'makine-izi' }).success).toBe(false);
    expect(desktopPreferencesSchema.safeParse({ version: 2, watch: 'day-watch', customTokens: { chrome: '#fff' }, fontSet: 'makine-izi' }).success).toBe(false);
    expect(desktopPreferencesSchema.safeParse({ version: 2, watch: 'day-watch', customTokens: { accent: 'red' }, fontSet: 'makine-izi' }).success).toBe(false);
    expect(desktopPreferencesSchema.safeParse({ version: 2, watch: 'day-watch', customTokens: {}, fontSet: 'comic-sans' }).success).toBe(false);
  });

  it('SEMANTIC_TOKEN_NAMES is the single custom-override vocabulary', () => {
    for (const token of SEMANTIC_TOKEN_NAMES) {
      const record = { version: 2, watch: 'day-watch', customTokens: { [token]: '#010203' }, fontSet: 'makine-izi' };
      expect(desktopPreferencesSchema.safeParse(record).success, token).toBe(true);
    }
  });
});
