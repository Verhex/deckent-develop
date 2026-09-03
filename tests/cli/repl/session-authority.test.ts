// tests/cli/repl/session-authority.test.ts
// ═══ TERMINAL-SESSION-AUTHORITY-001 — one posture + approval state for every surface ═══
//
// Owner decision (2026-09-03): the Ask/Run/Control posture and the approval
// mode lived only inside the Ink App; the readline loop had neither, so
// `/term` and `/approve` could not apply there. The session authority is a
// surface-independent state holder both consume: pure transitions from
// term-mode.ts (applyModeTarget, gateAction) and permission-types
// (APPROVAL_MODES), change signals for whoever renders, no I/O. Hermetic.

import { describe, it, expect } from 'vitest';
import { createSessionAuthority } from '../../../src/cli/repl/session-authority.js';
import { DEFAULT_TERM_MODE } from '../../../src/cli/repl/term-mode.js';

describe('createSessionAuthority', () => {
  it('starts from the given posture and approval, defaulting to the term-mode default and suggest', () => {
    expect(createSessionAuthority({}).state()).toEqual({ posture: DEFAULT_TERM_MODE, approval: 'suggest' });
    expect(createSessionAuthority({ posture: 'ask', approval: 'full-auto' }).state()).toEqual({ posture: 'ask', approval: 'full-auto' });
  });

  it('setPosture applies the term-mode transition and reports whether anything changed', () => {
    const a = createSessionAuthority({ posture: 'ask' });
    expect(a.setPosture('run')).toEqual({ changed: true, state: { posture: 'run', approval: 'suggest' } });
    expect(a.setPosture('run')).toEqual({ changed: false, state: { posture: 'run', approval: 'suggest' } });
    expect(a.posture()).toBe('run');
  });

  it('setApproval switches the approval mode and refuses an unknown mode with a typed result', () => {
    const a = createSessionAuthority({});
    expect(a.setApproval('auto-edit')).toEqual({ changed: true, state: { posture: DEFAULT_TERM_MODE, approval: 'auto-edit' } });
    expect(a.setApproval('auto-edit').changed).toBe(false);
    expect(a.setApproval('bogus' as never)).toEqual({ changed: false, state: { posture: DEFAULT_TERM_MODE, approval: 'auto-edit' }, rejected: 'bogus' });
  });

  it('gate() decides an action against the CURRENT posture (the same gate the Ink App uses)', () => {
    const a = createSessionAuthority({ posture: 'ask' });
    expect(a.gate({ tool: 'deckent_bash', args: {} }).kind).toBe('deny');
    a.setPosture('run');
    expect(a.gate({ tool: 'deckent_bash', args: {} }).kind).toBe('allow');
  });

  it('confirmPolicy mirrors the native engine: full-auto allows, auto-edit allows non-shell only, suggest asks', () => {
    const a = createSessionAuthority({});
    expect(a.confirmPolicy('deckent_write_file')).toBe('ask');
    a.setApproval('auto-edit');
    expect(a.confirmPolicy('deckent_write_file')).toBe('allow');
    expect(a.confirmPolicy('deckent_bash')).toBe('ask');
    expect(a.confirmPolicy('bash')).toBe('ask');
    a.setApproval('full-auto');
    expect(a.confirmPolicy('deckent_bash')).toBe('allow');
  });

  it('subscribers hear every change and can unsubscribe', () => {
    const a = createSessionAuthority({});
    const seen: string[] = [];
    const off = a.subscribe((s: { posture: string; approval: string }) => seen.push(`${s.posture}/${s.approval}`));
    a.setPosture('control');
    a.setPosture('control');
    a.setApproval('full-auto');
    off();
    a.setPosture('ask');
    expect(seen).toEqual(['control/suggest', 'control/full-auto']);
  });
});
