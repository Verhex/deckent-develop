// ═══ L4-D — native tool activity is a transient, honest turn fact ══════════

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReplApp, runNativeTurnLoop, type ReplEngine } from '../../../src/cli/repl/app.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { buildReplLabels, buildShortcutsPanel } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import type { PickerSpec } from '../../../src/cli/repl/picker.js';
import { clipTerminalCells } from '../../../src/cli/repl/dual-stream.js';
import { displayWidth } from '../../../src/cli/repl/cursor-model.js';

const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const roots: string[] = [];
const t = (key: string): string => getMessage(key, 'en');
const MODEL_SPEC: PickerSpec = {
  kind: 'model', initialId: 'fixture', scopes: ['session'],
  candidates: [{ id: 'fixture', label: 'fixture', state: 'current', facts: [] }],
};

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function mount(engine: ReplEngine, replSurfaceEnabled = true) {
  const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4d-activity-'));
  roots.push(cwd);
  const view = (candidate: ReplEngine) => (
    <ReplApp
      provider={{} as never} dispatcher={{ dispatch: vi.fn(async () => '') }} labels={buildReplLabels(t)}
      providerName="fixture" cwd={cwd} registerConfirm={() => {}} registerToolSink={() => {}}
      slashRegistry={buildSlashRegistry('en')} initialSelection={{ provider: 'fixture', model: 'fixture' }}
      onSwitch={() => ({ provider: 'fixture', model: 'fixture' })} onApprovalMode={() => {}}
      inboxLabels={{} as never} pickerLabels={buildPickerLabels(t)} pickerSpecs={{ model: () => MODEL_SPEC }}
      liveFooterLabels={{ unitHours: 'h', unitMinutes: 'm', unitSeconds: 's' }}
      approvalLabels={{} as never} runFlowCardLabels={{} as never} runFlowMountLabels={{} as never}
      doSlashLabels={{} as never} caretStyle="marker" dualStreamOverflow="..."
      shortcutsPanel={buildShortcutsPanel(t)} nativeEngine={candidate} {...(replSurfaceEnabled ? { replSurfaceEnabled: true } : {})}
    />
  );
  const mounted = render(view(engine));
  return { ...mounted, replaceEngine: (candidate: ReplEngine) => mounted.rerender(view(candidate)) };
}

describe('mounted native tool activity', () => {
  it('advances mounted tool duration monotonically across a backwards wall-clock change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T00:00:00.000Z'));
    let release: (() => void) | undefined;
    const engine = Object.assign(async (_input: string, cbs: Parameters<ReplEngine>[1]) => {
      cbs.onToolActivity?.({
        kind: 'executing', id: 'monotonic-call', tool: 'deckent_bash',
        label: 'executing {tool} · {elapsed}', compactLabel: 'executing · {elapsed} · {tool}',
        cancelRequestedLabel: 'cancel requested {tool} · {elapsed}',
        cancelRequestedCompactLabel: 'cancel requested · {elapsed} · {tool}', statusLabel: '{tool}',
      });
      await new Promise<void>((resolve) => { release = resolve; });
      cbs.onToolActivity?.({ kind: 'clear', id: 'monotonic-call' });
      cbs.onTurnEnd({ inputTokens: 0, outputTokens: 0 });
    }, { close: vi.fn() }) as ReplEngine;
    const { stdin, lastFrame, unmount } = mount(engine);
    try {
      stdin.write('go\r');
      await vi.advanceTimersByTimeAsync(0);
      expect(lastFrame() ?? '').toContain('executing deckent_bash · 0s');
      vi.setSystemTime(new Date('2026-09-07T23:59:00.000Z'));
      await vi.advanceTimersByTimeAsync(1_000);
      expect(lastFrame() ?? '').toContain('executing deckent_bash · 1s');
    } finally {
      release?.();
      await vi.advanceTimersByTimeAsync(0);
      unmount();
    }
  });

  it('drops an old engine callback after that turn has closed before a later turn can own the anchor', async () => {
    const events: string[] = [];
    const activity = (id: string) => ({
      kind: 'executing' as const, id, tool: id, label: '{tool} {elapsed}',
      compactLabel: '{elapsed} {tool}', cancelRequestedLabel: '{tool} {elapsed}',
      cancelRequestedCompactLabel: '{elapsed} {tool}', statusLabel: '{tool}',
    });
    const engine = (async (input: string, cbs: Parameters<ReplEngine>[1]) => {
      if (input === 'old') {
        setTimeout(() => cbs.onToolActivity?.(activity('old')), 0);
      } else cbs.onToolActivity?.(activity('new'));
      cbs.onTurnEnd({ inputTokens: 0, outputTokens: 0 });
    }) as ReplEngine;
    async function* lines() { yield 'old'; yield 'new'; }
    await runNativeTurnLoop(lines(), engine, {
      output: () => {}, onTurnStats: () => {}, onTurnError: () => {},
      onToolActivity: (event) => { if (event.kind === 'executing') events.push(event.id); },
    });
    await tick();
    expect(events).toEqual(['new']);
  });

  it('keeps compact state and elapsed before a long tool name in the 48-column anchor budget', () => {
    const compact = 'executing · 0s · deckent_bash_with_a_long_tool_name';
    const budget = 48 - displayWidth('● deckent · ');
    expect(clipTerminalCells(compact, budget, '...')).toContain('executing · 0s');
  });

  it('keeps an unabortable tool visible after Ctrl-C until its matching canonical completion', async () => {
    let release: (() => void) | undefined;
    const engine = Object.assign(async (_input: string, cbs: Parameters<ReplEngine>[1]) => {
      cbs.onToolActivity?.({
        kind: 'executing', id: 'call-1', tool: 'deckent_bash\u202Eunsafe',
        action: 'Run command unsafe',
        label: getMessage('tui.native_tool_executing', 'en'),
        compactLabel: getMessage('tui.native_tool_executing_compact', 'en'),
        cancelRequestedLabel: getMessage('tui.native_tool_cancel_requested', 'en'),
        cancelRequestedCompactLabel: getMessage('tui.native_tool_cancel_requested_compact', 'en'),
        statusLabel: getMessage('tui.native_tool_status', 'en'),
      });
      await new Promise<void>((resolve) => { release = resolve; });
      cbs.onToolActivity?.({ kind: 'clear', id: 'call-1' });
      cbs.onTurnEnd({ inputTokens: 0, outputTokens: 0 });
    }, { cancelTurn: vi.fn(() => true), close: vi.fn() }) as ReplEngine;
    const { stdin, lastFrame, unmount } = mount(engine);
    try {
      stdin.write('go\r');
      await tick();
      expect(lastFrame() ?? '').toContain('executing Run command unsafe');
      stdin.write('\x03');
      await tick();
      expect(engine.cancelTurn).toHaveBeenCalledTimes(1);
      expect(lastFrame() ?? '').toContain('cancel requested for Run command unsafe');
      expect(lastFrame() ?? '').not.toContain('provider stream was aborted');
      release?.();
      await tick();
      // Completed transcript facts remain in scrollback. The current anchor is
      // instead proven idle; it must not rewrite history to conceal an action.
      expect(lastFrame() ?? '').toContain('ready');
    } finally { unmount(); }
  });

  it('does not render activity when repl_surface is disabled', async () => {
    const engine = Object.assign(async (_input: string, cbs: Parameters<ReplEngine>[1]) => {
      cbs.onToolActivity?.({
        kind: 'executing', id: 'off', tool: 'deckent_bash', label: 'executing {tool} · {elapsed}',
        compactLabel: 'executing · {elapsed} · {tool}',
        cancelRequestedLabel: 'cancel requested for {tool} · waiting for the tool to end ({elapsed})',
        cancelRequestedCompactLabel: 'cancel requested · {elapsed} · {tool}',
        statusLabel: 'local active tool: {tool}',
      });
      cbs.onTurnEnd({ inputTokens: 0, outputTokens: 0 });
    }, { close: vi.fn() }) as ReplEngine;
    const { stdin, lastFrame, unmount } = mount(engine, false);
    try {
      stdin.write('go\r'); await tick();
      expect(lastFrame() ?? '').not.toContain('executing deckent_bash');
    } finally { unmount(); }
  });

  it('keeps an activity through a nonmatching clear and removes it only for its matching call id', async () => {
    let release: (() => void) | undefined;
    const engine = Object.assign(async (_input: string, cbs: Parameters<ReplEngine>[1]) => {
      cbs.onToolActivity?.({
        kind: 'executing', id: 'call-1', tool: 'deckent_bash', label: 'executing {tool} · {elapsed}',
        compactLabel: 'executing · {elapsed} · {tool}',
        cancelRequestedLabel: 'cancel requested for {tool} · waiting for the tool to end ({elapsed})',
        cancelRequestedCompactLabel: 'cancel requested · {elapsed} · {tool}',
        statusLabel: 'local active tool: {tool}',
      });
      cbs.onToolActivity?.({ kind: 'clear', id: 'other-call' });
      await new Promise<void>((resolve) => { release = resolve; });
      cbs.onToolActivity?.({ kind: 'clear', id: 'call-1' });
      cbs.onTurnEnd({ inputTokens: 0, outputTokens: 0 });
    }, { close: vi.fn() }) as ReplEngine;
    const { stdin, lastFrame, unmount } = mount(engine);
    try {
      stdin.write('go\r'); await tick();
      expect(lastFrame() ?? '').toContain('executing deckent_bash');
      release?.(); await tick();
      expect(lastFrame() ?? '').toContain('ready');
    } finally { unmount(); }
  });

  it('keeps an executing tool anchor when Ctrl-L clears the screen', async () => {
    let release: (() => void) | undefined;
    const engine = Object.assign(async (_input: string, cbs: Parameters<ReplEngine>[1]) => {
      cbs.onToolActivity?.({
        kind: 'executing', id: 'clear-call', tool: 'deckent_bash', label: 'executing {tool} · {elapsed}',
        compactLabel: 'executing · {elapsed} · {tool}',
        cancelRequestedLabel: 'cancel requested for {tool} · waiting for the tool to end ({elapsed})',
        cancelRequestedCompactLabel: 'cancel requested · {elapsed} · {tool}',
        statusLabel: 'local active tool: {tool}',
      });
      await new Promise<void>((resolve) => { release = resolve; });
      cbs.onToolActivity?.({ kind: 'clear', id: 'clear-call' });
      cbs.onTurnEnd({ inputTokens: 0, outputTokens: 0 });
    }, { close: vi.fn() }) as ReplEngine;
    const { stdin, lastFrame, unmount } = mount(engine);
    try {
      stdin.write('go\r'); await tick(); stdin.write('\x0c'); await tick();
      expect(lastFrame() ?? '').toContain('executing deckent_bash');
    } finally { release?.(); unmount(); }
  });

  it('clears a thrown turn through the loop finally without treating it as a tool result', async () => {
    const events: Array<{ kind: string; id?: string }> = [];
    const engine = (async () => { throw new Error('fixture failure'); }) as ReplEngine;
    async function* lines() { yield 'go'; }
    await runNativeTurnLoop(lines(), engine, {
      output: () => {}, onTurnStats: () => {}, onTurnError: () => {},
      onToolActivity: (event) => events.push(event),
    });
    expect(events).toEqual([{ kind: 'clear' }]);
  });

  it.each([
    ['slash', (stdin: { write: (value: string) => void }) => stdin.write('/interrupt\r')],
    ['Escape', (stdin: { write: (value: string) => void }) => stdin.write('\x1b')],
    ['Ctrl-C', (stdin: { write: (value: string) => void }) => stdin.write('\x03')],
  ])('%s uses the active-tool-safe interrupt path', async (_name, trigger) => {
    let release: (() => void) | undefined;
    const engine = Object.assign(async (_input: string, cbs: Parameters<ReplEngine>[1]) => {
      cbs.onToolActivity?.({
        kind: 'executing', id: 'interrupt-call', tool: 'deckent_bash', label: 'executing {tool} · {elapsed}',
        compactLabel: 'executing · {elapsed} · {tool}',
        cancelRequestedLabel: 'cancel requested for {tool} · waiting for the tool to end ({elapsed})',
        cancelRequestedCompactLabel: 'cancel requested · {elapsed} · {tool}',
        statusLabel: 'local active tool: {tool}',
      });
      await new Promise<void>((resolve) => { release = resolve; });
      cbs.onToolActivity?.({ kind: 'clear', id: 'interrupt-call' });
      cbs.onTurnEnd({ inputTokens: 0, outputTokens: 0 });
    }, { cancelTurn: vi.fn(() => true), close: vi.fn() }) as ReplEngine;
    const { stdin, lastFrame, unmount } = mount(engine);
    try {
      stdin.write('go\r'); await tick();
      trigger(stdin); await tick();
      expect(engine.cancelTurn).toHaveBeenCalledTimes(1);
      expect(lastFrame() ?? '').toContain('cancel requested for deckent_bash');
      expect(lastFrame() ?? '').not.toContain('provider stream was aborted');
    } finally { release?.(); unmount(); }
  });
});
