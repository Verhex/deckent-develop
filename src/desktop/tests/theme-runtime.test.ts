// D4-1 — theme-runtime pins: the DOM edge applies every layer + data-theme,
// is idempotent across watch switches (constant key set), and honors custom
// overrides. Hermetic node-env: a structural fake element, no real DOM.

import { describe, it, expect } from 'vitest';
import { applyWatch, type ThemeTargetElement } from '../src/renderer/theme-runtime.js';
import { DEFAULT_PREFERENCES } from '../src/shared/theme-tokens.js';

function makeFakeRoot(): ThemeTargetElement & {
  vars: Map<string, string>;
  attrs: Map<string, string>;
} {
  const vars = new Map<string, string>();
  const attrs = new Map<string, string>();
  return {
    vars,
    attrs,
    style: {
      setProperty: (name: string, value: string) => {
        vars.set(name, value);
      },
    },
    setAttribute: (name: string, value: string) => {
      attrs.set(name, value);
    },
  };
}

describe('applyWatch (D4-1)', () => {
  it('defaults to day-watch: stamps data-theme and materializes all three layers', () => {
    const root = makeFakeRoot();
    const applied = applyWatch(root);
    expect(applied.watch).toBe('day-watch');
    expect(root.attrs.get('data-theme')).toBe('day-watch');
    expect(root.vars.get('--dk-p-magenta')).toBe('#BD4278');
    expect(root.vars.get('--dk-s-accent')).toBe('var(--dk-p-magenta)');
    expect(root.vars.get('--dk-c-btn-bg')).toBe('var(--dk-s-accent)');
  });

  it('switching watches fully replaces the semantic layer (no stale night values after going back)', () => {
    const root = makeFakeRoot();
    applyWatch(root, { watch: 'night-watch', customTokens: {} });
    expect(root.vars.get('--dk-s-bg')).toBe('var(--dk-p-night)');
    applyWatch(root, { watch: 'day-watch', customTokens: {} });
    expect(root.vars.get('--dk-s-bg')).toBe('var(--dk-p-buff)');
    expect(root.attrs.get('data-theme')).toBe('day-watch');
  });

  it('custom tokens override the semantic pointer with a raw value', () => {
    const root = makeFakeRoot();
    applyWatch(root, { watch: 'open-sea', customTokens: { accent: '#654321' } });
    expect(root.vars.get('--dk-s-accent')).toBe('#654321');
    // dropping the override on re-apply restores the pointer (constant key set)
    applyWatch(root, { watch: 'open-sea', customTokens: {} });
    expect(root.vars.get('--dk-s-accent')).toBe('var(--dk-p-magentaSea)');
  });

  it('returns the exact variable map it set (callers/tests can assert without re-deriving)', () => {
    const root = makeFakeRoot();
    const applied = applyWatch(root, DEFAULT_PREFERENCES);
    for (const [name, value] of Object.entries(applied.variables)) {
      expect(root.vars.get(name)).toBe(value);
    }
  });
});
