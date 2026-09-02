// tests/cli/helpers/injected-label.test.ts
// TERMINAL-TOOLS-001 — string-free mechanism guard.
//
// AGENTS quality bar: mechanism modules (TUI/render) carry no user-visible
// text; labels are injected by the caller from the message catalog. A missing
// injection is a programmer-contract violation and must fail loudly with a
// typed error — never degrade to a hardcoded English fallback.
//
// Main-session REVISE (2026-09-02): the error MESSAGE itself must not leak
// English prose either (ReplErrorBoundary renders `err.message`). Contract:
// message === stable technical code, the missing label lives in a structured
// field, and any user-facing explanation is resolved by the caller from the
// message catalog for the session language.

import { describe, it, expect } from 'vitest';
import {
  requireInjectedLabel,
  InjectedLabelMissingError,
  INJECTED_LABEL_MISSING_CODE,
} from '../../../src/cli/helpers/injected-label.js';

describe('requireInjectedLabel', () => {
  it('returns the injected string unchanged', () => {
    expect(requireInjectedLabel('menuMoreBelow', '↓ {n} daha')).toBe('↓ {n} daha');
  });

  it('throws a typed InjectedLabelMissingError carrying the label in a structured field', () => {
    let caught: unknown;
    try { requireInjectedLabel('banner.hint', undefined); } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(InjectedLabelMissingError);
    const typed = caught as InjectedLabelMissingError;
    expect(typed.name).toBe('InjectedLabelMissingError');
    expect(typed.label).toBe('banner.hint');
    expect(typed.code).toBe(INJECTED_LABEL_MISSING_CODE);
  });

  it('the error message is exactly the stable technical code — no natural-language prose can leak to a user surface', () => {
    let caught: unknown;
    try { requireInjectedLabel('menuMoreAbove', undefined); } catch (err) { caught = err; }
    const message = (caught as Error).message;
    expect(message).toBe(INJECTED_LABEL_MISSING_CODE);
    expect(message).toMatch(/^E_[A-Z_]+$/);
    expect(message).not.toMatch(/\s/);
    expect(INJECTED_LABEL_MISSING_CODE).toBe('E_INJECTED_LABEL_MISSING');
  });

  it('treats an empty string as missing (an empty label is not a rendered label)', () => {
    expect(() => requireInjectedLabel('menuMoreAbove', '')).toThrow(InjectedLabelMissingError);
  });
});
