// ═══ approval-inputbar-mutex tests (born-508, sprint-382 task 382-003) ═════
//
// P0 finding: ApprovalCard stayed `useInput`-active (its own `head !== null`)
// at the SAME time InputBar stayed active (`confirm === null`, ignoring
// approvalPending) — Ink forwards a keypress to EVERY active `useInput` hook,
// so a plain 'y' inside an ordinary queued chat message (e.g. "yes, that
// works") was delivered to BOTH: InputBar treated it as a typed character,
// and ApprovalCard's `mapApprovalKey('y') === 'approve'` silently approved
// a pending destructive tool call mid-typing.
//
// Why plain-logic tests, no Ink render / ink-testing-library: same reason as
// tests/cli/app-approval-wire.test.tsx and tests/cli/approval-card.test.tsx —
// ink-testing-library is not a project devDependency, so <ReplApp> /
// <ApprovalCard> cannot be mounted here. The fix is implemented as a pure,
// Ink-free, exported `resolveStdinOwner` in app.tsx for exactly this reason
// (same "pull decision logic out of the Ink component" pattern as
// confirmKeyToAnswer / resolveModeLabel / resolveFooterLines).

import { describe, it, expect } from 'vitest';
import { resolveStdinOwner } from '../../src/cli/repl/app.js';
import { mapApprovalKey } from '../../src/cli/repl/approval-card.js';
import { confirmKeyToAnswer } from '../../src/cli/repl/app.js';

describe('resolveStdinOwner — exactly one stdin consumer active at a time', () => {
  it('idle (no confirm, no approval pending): only InputBar is active', () => {
    expect(resolveStdinOwner(false, false)).toEqual({
      confirmActive: false,
      inputBarActive: true,
      approvalCardActive: true, // gate open — the card itself stays inert (head === null)
    });
  });

  it('approval pending, no confirm modal open: InputBar is INACTIVE — the born-508 fix', () => {
    const owner = resolveStdinOwner(false, true);
    expect(owner.inputBarActive).toBe(false);
    expect(owner.confirmActive).toBe(false);
    // ApprovalCard's external gate is open; its OWN head!==null check (not
    // modeled here — see approval-card.test.tsx) is what actually renders it.
    expect(owner.approvalCardActive).toBe(true);
  });

  it('legacy confirm modal open, no approval pending: only the confirm modal is active', () => {
    expect(resolveStdinOwner(true, false)).toEqual({
      confirmActive: true,
      inputBarActive: false,
      approvalCardActive: false,
    });
  });

  it('confirm modal open AND an approval also pending: confirm modal wins — neither InputBar nor ApprovalCard is active', () => {
    expect(resolveStdinOwner(true, true)).toEqual({
      confirmActive: true,
      inputBarActive: false,
      approvalCardActive: false,
    });
  });

  it('InputBar and the confirm modal are never simultaneously active, for every input combination', () => {
    for (const confirmOpen of [false, true]) {
      for (const approvalPending of [false, true]) {
        const owner = resolveStdinOwner(confirmOpen, approvalPending);
        expect(owner.confirmActive && owner.inputBarActive).toBe(false);
      }
    }
  });

  it('InputBar is never active while an approval is pending, for every confirm-modal state', () => {
    for (const confirmOpen of [false, true]) {
      const owner = resolveStdinOwner(confirmOpen, true);
      expect(owner.inputBarActive).toBe(false);
    }
  });
});

describe('born-508 regression — a "yes..." chat message no longer double-fires an approval while pending', () => {
  it('reproduces the pre-fix hazard: mapApprovalKey(\'y\') alone WOULD approve — the mutex is what prevents delivery', () => {
    // This is the exact keystroke that leaked through both handlers before
    // the fix. The character itself still maps to 'approve' in isolation —
    // proving the fix lives in stdin ROUTING (resolveStdinOwner), not in
    // weakening ApprovalCard's own key semantics.
    expect(mapApprovalKey('y')).toBe('approve');
  });

  it('while an approval is pending, InputBar\'s resolved active flag is false — Ink would never route the keystroke to it', () => {
    const owner = resolveStdinOwner(/* confirmOpen */ false, /* approvalPending */ true);
    expect(owner.inputBarActive).toBe(false);
    // ApprovalCard remains the sole active consumer, so the SAME 'y' keypress
    // in "yes, that works" is now routed to the card ONLY when a real card is
    // pending (head !== null) — exactly the intended single-consumer read.
    expect(owner.approvalCardActive).toBe(true);
  });

  it('with nothing pending, InputBar owns stdin and ordinary confirm-style keys (y/n) are NOT consumed by the (inactive) confirm modal', () => {
    const owner = resolveStdinOwner(false, false);
    expect(owner.inputBarActive).toBe(true);
    expect(owner.confirmActive).toBe(false);
    // confirmKeyToAnswer itself is a pure mapper (app.tsx) — its useInput call
    // site is gated by owner.confirmActive, so with confirmActive===false the
    // handler never runs even though the mapper would happily answer 'y'.
    expect(confirmKeyToAnswer('y', {})).toBe('y');
  });
});
