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
  it('defaults to NOVA (589-seçimi): stamps data-theme and materializes all three layers', () => {
    const root = makeFakeRoot();
    const applied = applyWatch(root);
    expect(applied.watch).toBe('nova');
    expect(root.attrs.get('data-theme')).toBe('nova');
    expect(root.vars.get('--dk-p-magenta')).toBe('#BD4278'); // primitifler her-watch'ta materyalize
    expect(root.vars.get('--dk-s-accent')).toBe('var(--dk-p-novaGlow)'); // NOVA-ışıması
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

  it('applies the selected font set (prefs-v2); omitting fontSet never touches font vars', () => {
    const root = makeFakeRoot();
    applyWatch(root, { watch: 'nova', customTokens: {} }); // fontSet omitted → fonts untouched
    expect(root.vars.has('--dk-font-display')).toBe(false);
    // the zero-arg entry call uses DEFAULT_PREFERENCES → fontSet present → applied
    applyWatch(root);
    expect(root.vars.get('--dk-font-display')).toBe('Tektur, system-ui, sans-serif');
    expect(root.vars.get('--dk-font-body')).toBe("'Chakra Petch', system-ui, sans-serif");
    // a color-only re-apply must NOT revert the user's selected set
    applyWatch(root, { watch: 'nova', customTokens: {}, fontSet: 'envanter-legacy' });
    applyWatch(root, { watch: 'night-watch', customTokens: {} });
    expect(root.vars.get('--dk-font-display')).toBe("'Bricolage Grotesque', system-ui, sans-serif");
    applyWatch(root, { watch: 'nova', customTokens: {}, fontSet: 'envanter-legacy' });
    expect(root.vars.get('--dk-font-display')).toBe("'Bricolage Grotesque', system-ui, sans-serif");
    expect(root.vars.get('--dk-font-data')).toBe(
      "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    );
    // switching back restores the selected-set values (constant key set — idempotent)
    applyWatch(root, { watch: 'nova', customTokens: {}, fontSet: 'makine-izi' });
    expect(root.vars.get('--dk-font-data')).toBe(
      "'Spline Sans Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    );
  });
});
