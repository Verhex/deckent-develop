// 583/N3 «Makine Dairesi» — xterm theme derivation, pinned against the REAL
// token builder for every watch: switch the bridge lighting, the machinery
// below deck follows. Zero color literals in the derivation (kanun-10) — every
// expected value here comes out of buildCssVariables itself.
import { describe, it, expect } from 'vitest';
import { buildCssVariables, WATCHES, type WatchName } from '../src/shared/theme-tokens.js';
import {
  deriveXtermTheme,
  semanticVarName,
  type SemanticVarReader,
} from '../src/renderer/shell/xterm-theme.js';

/**
 * The semantic layer is PURE INDIRECTION — buildCssVariables emits
 * `var(--dk-p-…)` references, and the browser's getComputedStyle substitutes
 * them to the primitive hex (CSS custom-property computed-value rule). This
 * reader models exactly that one-level substitution, so the pins below hold
 * the derivation against what the LIVE reader actually sees.
 */
function readerFor(watch: WatchName): {
  read: SemanticVarReader;
  resolved: (name: Parameters<SemanticVarReader>[0]) => string;
} {
  const vars = buildCssVariables(watch, {});
  const substitute = (value: string): string => {
    const reference = /^var\((--[\w-]+)\)$/.exec(value.trim());
    return reference ? (vars[reference[1] as string] ?? '') : value;
  };
  const read: SemanticVarReader = (name) => substitute(vars[semanticVarName(name)] ?? '');
  return { read, resolved: read };
}

describe('semanticVarName', () => {
  it('uses the runtime prefix — the SAME custom properties applyWatch sets', () => {
    expect(semanticVarName('bg')).toBe('--dk-s-bg');
    expect(semanticVarName('text-muted')).toBe('--dk-s-text-muted');
  });
});

describe('deriveXtermTheme — token-derived palette per watch', () => {
  const watches = Object.keys(WATCHES) as WatchName[];

  it.each(watches)('%s: core surfaces map bg/text and every slot resolves to a real value', (watch) => {
    const { read, resolved } = readerFor(watch);
    const theme = deriveXtermTheme(read);
    expect(theme.background).toBe(resolved('bg'));
    expect(theme.foreground).toBe(resolved('text'));
    expect(theme.cursor).toBe(resolved('accent'));
    expect(theme.cursorAccent).toBe(resolved('bg'));
    for (const [slot, value] of Object.entries(theme)) {
      expect(value, `slot ${slot} must resolve for watch ${watch}`).not.toBe('');
      expect(value, `slot ${slot} must be substituted, never a raw var() ref`).not.toMatch(/^var\(/);
    }
  });

  it.each(watches)("%s: ANSI slots wear the watch's own vocabulary (go/caution/abort/accent/brass)", (watch) => {
    const { read, resolved } = readerFor(watch);
    const theme = deriveXtermTheme(read);
    expect(theme.green).toBe(resolved('go'));
    expect(theme.yellow).toBe(resolved('caution'));
    expect(theme.red).toBe(resolved('abort'));
    expect(theme.magenta).toBe(resolved('accent'));
    expect(theme.blue).toBe(resolved('brass'));
    expect(theme.cyan).toBe(resolved('brass'));
    expect(theme.brightBlack).toBe(resolved('text-muted'));
  });

  it('selection is the accent with an alpha wash when the token resolves to #RRGGBB', () => {
    const { read, resolved } = readerFor('day-watch');
    const accent = resolved('accent');
    expect(accent).toMatch(/^#[0-9a-fA-F]{6}$/); // the real primitives are 6-digit hex
    expect(deriveXtermTheme(read).selectionBackground).toBe(`${accent}4D`);
  });

  it('an exotic custom accent passes through un-alpha-ed (honest, never mangled)', () => {
    const { read } = readerFor('day-watch');
    const custom: SemanticVarReader = (name) =>
      name === 'accent' ? 'rgb(10, 20, 30)' : read(name);
    expect(deriveXtermTheme(custom).selectionBackground).toBe('rgb(10, 20, 30)');
  });
});
