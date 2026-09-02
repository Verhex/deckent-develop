// born-529 REPL-ERRORBOUNDARY-I18N (389-001) — ReplErrorBoundary's user-visible label
// used to be permanently the hardcoded English default: run.tsx mounted
// `<ReplErrorBoundary>` without a `label` prop at all, so app.tsx's
// `this.props.label ?? 'REPL render error'` fallback fired regardless of `lang`.
// Fix: run.tsx now passes `label={t('tui.render_error')}` — the same
// `t = (key) => getMessage(key, lang)` helper already used for every other label on
// the same <ReplApp> call site (buildReplLabels/buildApprovalLabels).
//
// No ink-testing-library in this project (confirmed convention — see ink-tui skill):
// tests exercise the already-exported `ReplErrorBoundary` class directly (a plain
// `Component` subclass — calling `.render()` returns a plain JSX element object, no
// mount/DOM needed) instead of mounting the Ink tree. The run.tsx wiring itself is
// locked in with a source-scan regression guard, same pattern as
// tests/cli/mcp-client-gate.test.ts.
//
// Hermetic: reads only committed repo source + in-memory class instances, no I/O,
// no network, no gitignored state.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';

import { ReplErrorBoundary } from '../../src/cli/repl/app.js';
import { buildReplErrorDescriber } from '../../src/cli/repl/run.js';
import { InjectedLabelMissingError, INJECTED_LABEL_MISSING_CODE } from '../../src/cli/helpers/injected-label.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const ROOT = join(import.meta.dirname, '..', '..');

function renderCaught(label: string, error: Error | string, describeError?: (err: Error) => string): string {
  const boundary = new ReplErrorBoundary({ children: null, label, ...(describeError ? { describeError } : {}) });
  boundary.state = ReplErrorBoundary.getDerivedStateFromError(typeof error === 'string' ? new Error(error) : error);
  const rendered = boundary.render() as ReactElement<{ children: string }>;
  return rendered.props.children;
}

describe('ReplErrorBoundary i18n wiring (born-529)', () => {
  it('run.tsx passes the label prop from getMessage(\'tui.render_error\', lang) — not left unset/hardcoded', () => {
    const src = readFileSync(join(ROOT, 'src', 'cli', 'repl', 'run.tsx'), 'utf-8');
    expect(src).toMatch(/<ReplErrorBoundary label=\{t\(['"]tui\.render_error['"]\)\}[^>]*>/);
    // Guard against regressing to the old bare form.
    expect(src).not.toMatch(/<ReplErrorBoundary>\s*\n\s*<ReplApp/);
  });

  it('renders the label supplied via props, proving it is prop-driven and not a fixed hardcoded string', () => {
    expect(renderCaught('custom injected label', 'boom')).toBe('⚠ custom injected label: boom');
  });

  it('lang=tr resolves tui.render_error to the Turkish message', () => {
    expect(getMessage('tui.render_error', 'tr')).toBe('REPL render hatası');
  });

  it('lang=tr → the boundary renders the Turkish fallback text', () => {
    const trLabel = getMessage('tui.render_error', 'tr');
    expect(renderCaught(trLabel, 'patladı')).toBe('⚠ REPL render hatası: patladı');
  });

  it('lang=en → the boundary renders the English fallback text', () => {
    const enLabel = getMessage('tui.render_error', 'en');
    expect(renderCaught(enLabel, 'boom')).toBe('⚠ REPL render error: boom');
  });

  // Main-session REVISE (2026-09-02, TERMINAL-TOOLS-001): the boundary is a
  // string-free mechanism — it owns NO English default. `label` is a required
  // injected prop and the explanation of a typed error is resolved by the
  // caller (run.tsx buildReplErrorDescriber) from the message catalog.
  it('app.tsx carries no mechanism-owned English fallback for the boundary label', () => {
    const src = readFileSync(join(ROOT, 'src', 'cli', 'repl', 'app.tsx'), 'utf-8');
    expect(src).not.toContain("'REPL render error'");
    // Scope the fallback check to the boundary class body itself.
    const start = src.indexOf('export class ReplErrorBoundary');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\nexport ', start + 1);
    const boundaryBlock = src.slice(start, end === -1 ? undefined : end);
    expect(boundaryBlock).not.toMatch(/label\s*\?\?\s*['"]/);
    expect(boundaryBlock).toMatch(/describeError/);
  });

  it('run.tsx injects a catalog-backed error describer alongside the label', () => {
    const src = readFileSync(join(ROOT, 'src', 'cli', 'repl', 'run.tsx'), 'utf-8');
    expect(src).toMatch(/<ReplErrorBoundary label=\{t\(['"]tui\.render_error['"]\)\} describeError=\{buildReplErrorDescriber\(lang\)\}>/);
  });

  for (const lang of ['tr', 'en'] as const) {
    it(`lang=${lang} → an InjectedLabelMissingError renders the ${lang} catalog explanation, never the error's own text`, () => {
      const label = getMessage('tui.render_error', lang);
      const err = new InjectedLabelMissingError('menuMoreAbove');
      const out = renderCaught(label, err, buildReplErrorDescriber(lang));
      const expected = getMessage('tui.injected_label_missing', lang, { label: 'menuMoreAbove', code: INJECTED_LABEL_MISSING_CODE });
      expect(out).toBe(`⚠ ${label}: ${expected}`);
      expect(out).not.toContain('injected label missing');
      expect(expected).not.toContain(INJECTED_LABEL_MISSING_CODE.toLowerCase());
    });
  }

  it('the describer passes an ordinary error message through unchanged (technical pass-through, no invented prose)', () => {
    expect(buildReplErrorDescriber('tr')(new Error('E_SOMETHING'))).toBe('E_SOMETHING');
  });

  it('without a describer the boundary renders the typed error\'s technical code only', () => {
    const out = renderCaught(getMessage('tui.render_error', 'en'), new InjectedLabelMissingError('banner.hint'));
    expect(out).toBe(`⚠ REPL render error: ${INJECTED_LABEL_MISSING_CODE}`);
  });
});
