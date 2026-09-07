import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReplApp, type ReplEngine } from '../../../src/cli/repl/app.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { buildReplLabels, buildShortcutsPanel } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const roots: string[] = [];
const t = (key: string): string => getMessage(key, 'en');

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function activityEngine(): { engine: ReplEngine; finish(): void } {
  let finish: (() => void) | undefined;
  const engine = Object.assign(async (_input: string, callbacks: Parameters<ReplEngine>[1]) => {
    callbacks.onToolActivity?.({
      kind: 'executing', id: 'call-motion', tool: 'deckent_bash',
      label: 'executing {tool} · {elapsed}', compactLabel: 'executing · {elapsed} · {tool}',
      cancelRequestedLabel: 'cancel requested {tool} · {elapsed}',
      cancelRequestedCompactLabel: 'cancel requested · {elapsed} · {tool}',
      statusLabel: 'active tool: {tool}',
    });
    await new Promise<void>((resolve) => { finish = resolve; });
    callbacks.onToolActivity?.({ kind: 'clear', id: 'call-motion' });
    callbacks.onTurnEnd({ inputTokens: 0, outputTokens: 0 });
  }, { close: vi.fn() }) as ReplEngine;
  return { engine, finish: () => finish?.() };
}

function mount(engine: ReplEngine, options: { reducedMotion?: boolean; ascii?: boolean } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'deckent-reduced-motion-')); roots.push(cwd);
  const element = (reducedMotion: boolean) => <ReplApp
    provider={{} as never} dispatcher={{ dispatch: vi.fn(async () => '') }} labels={buildReplLabels(t)}
    providerName="fixture" cwd={cwd} registerConfirm={() => {}} registerToolSink={() => {}}
    slashRegistry={buildSlashRegistry('en')} initialSelection={{ provider: 'fixture', model: 'fixture' }}
    onSwitch={() => ({ provider: 'fixture', model: 'fixture' })} onApprovalMode={() => {}}
    inboxLabels={{} as never} pickerLabels={buildPickerLabels(t)} pickerSpecs={{}}
    liveFooterLabels={{ unitHours: 'h', unitMinutes: 'm', unitSeconds: 's' }}
    approvalLabels={{} as never} runFlowCardLabels={{} as never} runFlowMountLabels={{} as never}
    doSlashLabels={{} as never} caretStyle="marker" dualStreamOverflow="..."
    shortcutsPanel={buildShortcutsPanel(t)} nativeEngine={engine} replSurfaceEnabled
    reducedMotion={reducedMotion} pickerAscii={options.ascii === true}
  />;
  const view = render(element(options.reducedMotion === true));
  return { ...view, setReducedMotion: (value: boolean) => view.rerender(element(value)) };
}

describe('mounted ReplApp reduced motion', () => {
  it.each([
    ['explicit preference', { reducedMotion: true }],
    ['ASCII capability', { ascii: true }],
  ] as const)('suppresses only decorative 80ms churn for %s', async (_name, options) => {
    vi.useFakeTimers();
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const fixture = activityEngine();
    const view = mount(fixture.engine, options);
    try {
      view.stdin.write('go\r');
      await vi.advanceTimersByTimeAsync(0);
      expect(view.lastFrame()).toContain('executing deckent_bash · 0s');
      expect(intervals.mock.calls.some((call) => call[1] === 80)).toBe(false);
      expect(intervals.mock.calls.some((call) => call[1] === 1_000)).toBe(true);
      const frames = view.frames.length;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(view.lastFrame()).toContain('executing deckent_bash · 1s');
      expect(view.frames.length).toBeGreaterThan(frames);
      fixture.finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(view.lastFrame()).toContain('ready');
    } finally { fixture.finish(); view.unmount(); intervals.mockRestore(); }
  });

  it('keeps normal animation and disposes it when the preference changes live', async () => {
    vi.useFakeTimers();
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const clears = vi.spyOn(globalThis, 'clearInterval');
    const fixture = activityEngine();
    const view = mount(fixture.engine);
    try {
      view.stdin.write('go\r');
      await vi.advanceTimersByTimeAsync(0);
      expect(intervals.mock.calls.some((call) => call[1] === 80)).toBe(true);
      const animatedFrame = view.lastFrame();
      await vi.advanceTimersByTimeAsync(80);
      expect(view.lastFrame()).not.toBe(animatedFrame);
      const decorativeCall = intervals.mock.calls.findIndex((call) => call[1] === 80);
      const decorativeHandle = intervals.mock.results[decorativeCall]?.value;
      expect(decorativeHandle).toBeDefined();
      view.setReducedMotion(true);
      expect(clears).toHaveBeenCalledWith(decorativeHandle);
      expect(view.lastFrame()).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    } finally { fixture.finish(); view.unmount(); intervals.mockRestore(); clears.mockRestore(); }
  });
});
