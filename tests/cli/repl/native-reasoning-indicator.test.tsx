// ═══ 7108 — the mounted phase anchor shows a collapsed hidden-reasoning fact ═══
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

const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const roots: string[] = [];
const t = (key: string): string => getMessage(key, 'en');
const MODEL_SPEC: PickerSpec = {
  kind: 'model', initialId: 'fixture', scopes: ['session'],
  candidates: [{ id: 'fixture', label: 'fixture', state: 'current', facts: [] }],
};

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function mount(engine: ReplEngine) {
  const cwd = mkdtempSync(join(tmpdir(), 'deckent-7108-indicator-'));
  roots.push(cwd);
  return render(
    <ReplApp
      provider={{} as never} dispatcher={{ dispatch: vi.fn(async () => '') }} labels={buildReplLabels(t)}
      providerName="fixture" cwd={cwd} registerConfirm={() => {}} registerToolSink={() => {}}
      slashRegistry={buildSlashRegistry('en')} initialSelection={{ provider: 'fixture', model: 'fixture' }}
      onSwitch={() => ({ provider: 'fixture', model: 'fixture' })} onApprovalMode={() => {}}
      inboxLabels={{} as never} pickerLabels={buildPickerLabels(t)} pickerSpecs={{ model: () => MODEL_SPEC }}
      liveFooterLabels={{ unitHours: 'h', unitMinutes: 'm', unitSeconds: 's' }}
      approvalLabels={{} as never} runFlowCardLabels={{} as never} runFlowMountLabels={{} as never}
      doSlashLabels={{} as never} caretStyle="marker" dualStreamOverflow="..."
      shortcutsPanel={buildShortcutsPanel(t)} nativeEngine={engine} replSurfaceEnabled={true}
    />,
  );
}

describe('mounted hidden-reasoning indicator', () => {
  it('shows "~N hidden reasoning tokens" on the phase anchor while thinking streams and clears it afterwards', async () => {
    let release: (() => void) | undefined;
    const engine = Object.assign(async (_input: string, cbs: Parameters<ReplEngine>[1]) => {
      cbs.onReasoningActivity?.({ kind: 'thinking', approxTokens: 1_234, label: getMessage('tui.native_reasoning_active', 'en') });
      await new Promise<void>((resolve) => { release = resolve; });
      cbs.onReasoningActivity?.({ kind: 'clear' });
      cbs.output('answer');
      cbs.onTurnEnd({ inputTokens: 0, outputTokens: 0 });
    }, { close: vi.fn() }) as ReplEngine;
    const { stdin, lastFrame, unmount } = mount(engine);
    try {
      stdin.write('go\r');
      await tick();
      const expected = getMessage('tui.native_reasoning_active', 'en', { tokens: '1234' });
      expect(expected).toContain('1234');
      expect(lastFrame() ?? '').toContain(expected);
      release?.();
      await tick();
      expect(lastFrame() ?? '').not.toContain(expected);
      expect(lastFrame() ?? '').toContain('answer');
    } finally {
      release?.();
      await tick();
      unmount();
    }
  });

  it('runNativeTurnLoop forwards reasoning activity only while its turn is open and clears at turn end', async () => {
    const seen: string[] = [];
    const engine = (async (input: string, cbs: Parameters<ReplEngine>[1]) => {
      if (input === 'late') setTimeout(() => cbs.onReasoningActivity?.({ kind: 'thinking', approxTokens: 1, label: 'late {tokens}' }), 0);
      else cbs.onReasoningActivity?.({ kind: 'thinking', approxTokens: 2, label: 'now {tokens}' });
      cbs.onTurnEnd({ inputTokens: 0, outputTokens: 0 });
    }) as ReplEngine;
    async function* lines() { yield 'late'; yield 'now'; }
    await runNativeTurnLoop(lines(), engine, {
      output: () => {}, onTurnStats: () => {}, onTurnError: () => {},
      onReasoningActivity: (event, turnId) => seen.push(`${turnId}:${event.kind}${event.kind === 'thinking' ? `:${event.label}` : ''}`),
    });
    await tick();
    expect(seen).toEqual(['1:clear', '2:thinking:now {tokens}', '2:clear']);
  });
});
