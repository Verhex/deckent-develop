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
import { getMessage } from '../../src/cli/helpers/messages.js';

const ROOT = join(import.meta.dirname, '..', '..');

function renderCaught(label: string | undefined, errorMessage: string): string {
  const boundary = new ReplErrorBoundary({ children: null, ...(label !== undefined ? { label } : {}) });
  boundary.state = ReplErrorBoundary.getDerivedStateFromError(new Error(errorMessage));
  const rendered = boundary.render() as ReactElement<{ children: string }>;
  return rendered.props.children;
}

describe('ReplErrorBoundary i18n wiring (born-529)', () => {
  it('run.tsx passes the label prop from getMessage(\'tui.render_error\', lang) — not left unset/hardcoded', () => {
    const src = readFileSync(join(ROOT, 'src', 'cli', 'repl', 'run.tsx'), 'utf-8');
    expect(src).toMatch(/<ReplErrorBoundary label=\{t\(['"]tui\.render_error['"]\)\}>/);
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

  it('does not catch/alter behavior — no label falls back to the mechanism\'s own English default (unchanged catch/fallback contract)', () => {
    expect(renderCaught(undefined, 'boom')).toBe('⚠ REPL render error: boom');
  });
});
