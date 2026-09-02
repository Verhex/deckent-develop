// tests/cli/repl/turn-abort-wire.test.tsx
// ═══ TERMINAL-TOOLS-008 — real active-turn abort (REPL wiring) ══════════════
//
// Single-surface contract §10.1: "/interrupt and Escape currently clear pending
// input but do not abort the active provider turn." Now: the native engine
// exposes cancelTurn() (session.cancel → AbortController), busy-controls'
// applyInterrupt reports whether a real abort happened, the transcript line is
// honest ("interrupted" vs "not available on this engine"), Esc reaches the
// policy through the composer (only when no menu consumed it) and /interrupt
// works without the repl_surface flag. Hermetic: mock adapter + Ink render.

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { createNativeEngine } from '../../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../../src/cli/repl/native-tool-registry.js';
import { applyInterrupt, markBusy, initialBusyControlsState } from '../../../src/cli/repl/busy-controls.js';
import { renderBusyDecision } from '../../../src/cli/repl/app.js';
import { buildReplLabels, withRenewSlash, buildRenewSlashLabels } from '../../../src/cli/repl/run.js';
import { InputBar } from '../../../src/cli/repl/input-bar.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../../src/agent/provider-tooluse/types.js';

const ROOT = join(__dirname, '..', '..', '..');
const tick = (ms = 25): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('native engine — cancelTurn()', () => {
  it('is false while idle; true during a turn, and the blocked provider stream ends promptly', async () => {
    let signal: AbortSignal | undefined;
    const adapter: ProviderAdapter = {
      name: 'blocking',
      async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
        signal = req.signal;
        yield { type: 'text-delta', text: 'partial' };
        await new Promise<void>((resolve) => { req.signal?.addEventListener('abort', () => resolve()); });
        throw new DOMException('The operation was aborted', 'AbortError');
      },
    };
    const engine = createNativeEngine({
      adapter, model: 'm', cwd: tmpdir(), registry: buildNativeToolRegistry({ cwd: () => tmpdir() }),
      confirm: async () => 'y', toolSink: () => {},
    } as never);
    expect(typeof engine.cancelTurn).toBe('function');
    expect(engine.cancelTurn!()).toBe(false); // nothing in flight

    let out = '';
    let ended = false;
    const turn = engine('go', { output: (t) => { out += t; }, onTurnEnd: () => { ended = true; } });
    while (!out.includes('partial')) await tick(5);
    expect(engine.cancelTurn!()).toBe(true);
    await Promise.race([turn, tick(2000).then(() => { throw new Error('turn did not end after cancelTurn'); })]);
    expect(signal?.aborted).toBe(true);
    expect(ended).toBe(true);
    expect(engine.cancelTurn!()).toBe(false); // back to idle
  });
});

describe('run.tsx withRenewSlash — the wrapper forwards every engine member', () => {
  it('cancelTurn, hydrateTranscript, getContextBudgetTokens, setApprovalMode, close and renewBudgetEpoch survive the wrap', () => {
    const calls: string[] = [];
    const inner = (async () => {}) as unknown as import('../../../src/cli/repl/native-agent-bridge.js').ReplEngine;
    inner.cancelTurn = () => { calls.push('cancelTurn'); return true; };
    inner.hydrateTranscript = () => { calls.push('hydrate'); };
    inner.getContextBudgetTokens = () => 42;
    inner.setApprovalMode = () => { calls.push('mode'); };
    inner.close = () => { calls.push('close'); };
    inner.renewBudgetEpoch = () => ({ epoch: 2 });
    const wrapped = withRenewSlash(inner, buildRenewSlashLabels((k) => getMessage(k, 'en')));
    expect(wrapped.cancelTurn?.()).toBe(true);
    wrapped.hydrateTranscript?.([]);
    expect(wrapped.getContextBudgetTokens?.()).toBe(42);
    wrapped.setApprovalMode?.('suggest');
    wrapped.close?.();
    expect(wrapped.renewBudgetEpoch?.()).toEqual({ epoch: 2 });
    expect(calls).toEqual(['cancelTurn', 'hydrate', 'mode', 'close']);
  });
});

describe('busy-controls — applyInterrupt reports whether a real abort happened', () => {
  it('a canceller returning true → interrupted+aborted; returning false → interrupted but not aborted', () => {
    const yes = applyInterrupt(markBusy(), () => true);
    expect(yes.decision).toEqual({ kind: 'interrupted', aborted: true });
    const no = applyInterrupt(markBusy(), () => false);
    expect(no.decision).toEqual({ kind: 'interrupted', aborted: false });
    expect(applyInterrupt(initialBusyControlsState(), () => true).decision).toEqual({ kind: 'interrupt-noop', reason: 'idle' });
  });

  it('renders honest lines: an aborted turn vs an engine without an abort seam (en + tr catalog rows)', () => {
    for (const lang of ['en', 'tr'] as const) {
      const labels = buildReplLabels((k) => getMessage(k, lang));
      expect(renderBusyDecision({ kind: 'interrupted', aborted: true }, labels)).toBe(getMessage('tui.busy_interrupted', lang));
      expect(renderBusyDecision({ kind: 'interrupted', aborted: false }, labels)).toBe(getMessage('tui.busy_interrupt_unavailable', lang));
    }
    expect(getMessageLanguages('tui.busy_interrupt_unavailable')).toEqual(expect.arrayContaining(['en', 'tr']));
    // the interrupted row no longer promises "after the current step" — the stream stops now
    expect(getMessage('tui.busy_interrupted', 'en')).not.toContain('after the current step');
  });
});

describe('InputBar — Esc reaches the caller only when no menu consumed it', () => {
  const roots: string[] = [];
  afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
  const en = buildReplLabels((k) => getMessage(k, 'en'));

  function mount(onEscape: () => void) {
    const root = mkdtempSync(join(tmpdir(), 'deckent-esc-'));
    roots.push(root);
    return render(
      <InputBar
        active onSubmit={() => {}} onInterrupt={() => {}} onEscape={onEscape}
        slashRegistry={buildSlashRegistry('en')}
        menuHint={en.menuHint} menuMoreAbove={en.menuMoreAbove} menuMoreBelow={en.menuMoreBelow}
        reverseSearchLabel={en.reverseSearch} historyProjectRoot={root} caretStyle="marker"
      />,
    );
  }

  it('Esc with an empty composer calls onEscape', async () => {
    const onEscape = vi.fn();
    const { stdin, unmount } = mount(onEscape);
    await tick();
    stdin.write('\x1b');
    await tick(60);
    expect(onEscape).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('Esc while the `/` menu is open closes the menu and does NOT call onEscape', async () => {
    const onEscape = vi.fn();
    const { stdin, lastFrame, unmount } = mount(onEscape);
    await tick();
    stdin.write('/');
    await tick();
    expect(lastFrame() ?? '').toContain('/help');
    stdin.write('\x1b');
    await tick(60);
    expect(onEscape).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').not.toContain('/help');
    unmount();
  });
});

describe('app.tsx wiring', () => {
  const src = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');

  it('the interrupt canceller aborts the native turn (cancelTurn) — not only the queue', () => {
    expect(src).toMatch(/nativeEngine\?\.cancelTurn\?\.\(\)/);
  });

  it('Esc-interrupt is delivered through the composer (onEscape), not a flag-gated App-level Esc hook', () => {
    expect(src).toMatch(/onEscape=\{/);
    expect(src).not.toMatch(/isActive: replSurfaceEnabled && working && confirm === null/);
  });

  it('/interrupt is handled regardless of repl_surface.enabled', () => {
    // the interrupt branch must appear BEFORE the `if (replSurfaceEnabled) {` term/busy block
    const interruptAt = src.indexOf("busyAction.kind === 'interrupt'");
    const gateAt = src.indexOf('if (replSurfaceEnabled) {\n      const termCmd = parseTermCommand(trimmed);');
    expect(interruptAt).toBeGreaterThan(0);
    expect(gateAt).toBeGreaterThan(0);
    expect(interruptAt).toBeLessThan(gateAt);
  });
});
