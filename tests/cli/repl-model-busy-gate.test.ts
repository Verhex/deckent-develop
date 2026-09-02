// ═══ Task 388-001 — REPL-MODEL-BUSY-GATE — pure-logic tests ═════════════════
//
// born-533: app.tsx's handleSubmit `/model`/`/provider` branch used to call
// `onSwitch` (which splices the shared provider/model backend) UNCONDITIONALLY
// the instant the command was submitted — including while a turn was still
// streaming (`working === true`). That races the in-flight turn against the
// new backend (corrupted-output/crash). The fix (`resolveSwitchGate`) refuses
// the switch while busy instead of racing it.
//
// Why no Ink mount: ink-testing-library is NOT a project dependency (confirmed
// repeatedly — see tests/cli/repl-turn-exception.test.ts,
// tests/cli/repl/app-surface-wire.test.tsx), so this suite exercises the pure,
// JSX-free `resolveSwitchGate` app.tsx exports for exactly this reason, and
// mirrors handleSubmit's gated `/model`/`/provider` block 1:1 (same style as
// app-surface-wire.test.tsx's `dispatchLine` mirror).

import { describe, it, expect, vi } from 'vitest';
import { resolveSwitchGate, type ReplLabels } from '../../src/cli/repl/app.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

/** en gate label — app.tsx owns no English fallback since TERMINAL-TOOLS-002. */
const EN_LABELS: Pick<ReplLabels, 'switchBusy'> = { switchBusy: getMessage('tui.switch_busy', 'en') };

/** Mirrors app.tsx handleSubmit's `/model`/`/provider` gated block 1:1: only
 * the actual-switch path (an argument present) is gated; a status query never
 * touches the gate at all. */
function dispatchSwitch(
  working: boolean,
  kind: 'model' | 'provider',
  arg: string | undefined,
  onSwitch: () => void,
  labels: Pick<ReplLabels, 'switchBusy'>,
): string | null {
  if (!arg) return null; // status query — not gated, no line asserted here
  const gate = resolveSwitchGate(working, kind, labels);
  if (gate.kind === 'rejected') return gate.line;
  onSwitch();
  return null;
}

describe('resolveSwitchGate — busy vs idle (born-533, 388-001)', () => {
  it('idle → apply (idle çalışır tıpkı öncesi gibi, byte-identical path)', () => {
    expect(resolveSwitchGate(false, 'model', EN_LABELS)).toEqual({ kind: 'apply' });
    expect(resolveSwitchGate(false, 'provider', EN_LABELS)).toEqual({ kind: 'apply' });
  });

  it('busy → rejected, with the injected en line naming the switch kind', () => {
    expect(resolveSwitchGate(true, 'model', EN_LABELS)).toEqual({
      kind: 'rejected',
      line: 'cannot switch model while a turn is in progress — wait for it to finish, or /interrupt first',
    });
    expect(resolveSwitchGate(true, 'provider', EN_LABELS)).toEqual({
      kind: 'rejected',
      line: 'cannot switch provider while a turn is in progress — wait for it to finish, or /interrupt first',
    });
  });

  it('busy → rejected honors a caller-supplied localized {kind} template', () => {
    const labels = { switchBusy: 'tur devam ederken {kind} değiştirilemez' };
    expect(resolveSwitchGate(true, 'model', labels)).toEqual({
      kind: 'rejected',
      line: 'tur devam ederken model değiştirilemez',
    });
    expect(resolveSwitchGate(true, 'provider', labels)).toEqual({
      kind: 'rejected',
      line: 'tur devam ederken provider değiştirilemez',
    });
  });

  it('never returns rejected while idle regardless of labels', () => {
    expect(resolveSwitchGate(false, 'model', { switchBusy: 'anything' })).toEqual({ kind: 'apply' });
  });
});

describe('handleSubmit /model·/provider mirror — no backend splice while busy (race YOK)', () => {
  it('busy /model <arg> → onSwitch is NEVER called; the reject line is returned instead', () => {
    const onSwitch = vi.fn();
    const line = dispatchSwitch(true, 'model', 'sonnet', onSwitch, EN_LABELS);
    expect(onSwitch).not.toHaveBeenCalled();
    expect(line).toBe('cannot switch model while a turn is in progress — wait for it to finish, or /interrupt first');
  });

  it('busy /provider <arg> → onSwitch is NEVER called; the reject line is returned instead', () => {
    const onSwitch = vi.fn();
    const line = dispatchSwitch(true, 'provider', 'codex', onSwitch, EN_LABELS);
    expect(onSwitch).not.toHaveBeenCalled();
    expect(line).toBe('cannot switch provider while a turn is in progress — wait for it to finish, or /interrupt first');
  });

  it('idle /model <arg> → onSwitch runs exactly once, no reject line (idle davranışı korunur)', () => {
    const onSwitch = vi.fn();
    const line = dispatchSwitch(false, 'model', 'opus', onSwitch, EN_LABELS);
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(line).toBeNull();
  });

  it('idle /provider <arg> → onSwitch runs exactly once, no reject line', () => {
    const onSwitch = vi.fn();
    const line = dispatchSwitch(false, 'provider', 'gemini', onSwitch, EN_LABELS);
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(line).toBeNull();
  });

  it('busy bare /model (no arg) → status query, NOT gated — onSwitch never applicable here', () => {
    const onSwitch = vi.fn();
    const line = dispatchSwitch(true, 'model', undefined, onSwitch, EN_LABELS);
    expect(onSwitch).not.toHaveBeenCalled();
    expect(line).toBeNull(); // handleSubmit's own else-branch renders the status line, not this gate
  });

  it('rapid busy /model then /provider both reject independently — no partial splice of either', () => {
    const onSwitch = vi.fn();
    const modelLine = dispatchSwitch(true, 'model', 'haiku', onSwitch, EN_LABELS);
    const providerLine = dispatchSwitch(true, 'provider', 'ollama', onSwitch, EN_LABELS);
    expect(onSwitch).not.toHaveBeenCalled();
    expect(modelLine).toContain('model');
    expect(providerLine).toContain('provider');
  });
});
