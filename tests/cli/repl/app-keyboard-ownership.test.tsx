import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReplApp, type ConfirmTrigger, type ReplEngine } from '../../../src/cli/repl/app.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { buildReplLabels, buildShortcutsPanel } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import type { PickerSpec } from '../../../src/cli/repl/picker.js';

const tick = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const CTRL_C = '\x03';
const ENTER = '\r';
const t = (key: string): string => getMessage(key, 'en');
const labels = buildReplLabels(t);
const pickerLabels = buildPickerLabels(t);
const roots: string[] = [];

const MODEL_SPEC: PickerSpec = {
  kind: 'model',
  initialId: 'model-a',
  scopes: ['session'],
  candidates: [{ id: 'model-a', label: 'model-a', state: 'current', facts: [] }],
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function mountApp(options: { cwd?: string; sessionId?: string; replSurfaceEnabled?: boolean; startupRecentSessions?: boolean; dispatcher?: { dispatch: (name: string, args: Record<string, unknown>) => Promise<string> } } = {}) {
  const cwd = options.cwd ?? mkdtempSync(join(tmpdir(), 'deckent-l6-keyboard-'));
  if (!options.cwd) roots.push(cwd);
  let confirmTrigger: ConfirmTrigger | undefined;
  const engine = Object.assign(async () => {}, {
    close: vi.fn(),
  }) as unknown as ReplEngine;
  const mounted = render(
    <ReplApp
      provider={{} as never}
      dispatcher={options.dispatcher ?? { dispatch: vi.fn(async () => '') }}
      labels={labels}
      providerName="diagnostic"
      cwd={cwd}
      registerConfirm={(trigger) => { confirmTrigger = trigger; }}
      registerToolSink={() => {}}
      slashRegistry={buildSlashRegistry('en')}
      initialSelection={{ provider: 'diagnostic', model: 'model-a' }}
      onSwitch={() => ({ provider: 'diagnostic', model: 'model-a' })}
      onApprovalMode={() => {}}
      inboxLabels={{} as never}
      pickerLabels={pickerLabels}
      pickerSpecs={{ model: () => MODEL_SPEC }}
      liveFooterLabels={{} as never}
      approvalLabels={{} as never}
      runFlowCardLabels={{} as never}
      runFlowMountLabels={{} as never}
      doSlashLabels={{} as never}
      caretStyle="marker"
      dualStreamOverflow="..."
      shortcutsPanel={buildShortcutsPanel(t)}
      nativeEngine={engine}
      {...(options.sessionId ? { sessionId: options.sessionId } : {})}
      {...(options.replSurfaceEnabled ? { replSurfaceEnabled: true } : {})}
      {...(options.startupRecentSessions ? { startupRecentSessions: true } : {})}
    />,
  );
  return { ...mounted, getConfirmTrigger: () => confirmTrigger };
}

async function openPicker(stdin: { write(value: string): void }, lastFrame: () => string | undefined): Promise<void> {
  stdin.write('/approve');
  stdin.write(ENTER);
  await tick(100);
  expect(lastFrame() ?? '').toContain(pickerLabels.title.approve);
}

describe('ReplApp mounted keyboard ownership', () => {
  it('keeps startup recent-session discovery off by default but lets explicit /resume load it', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4-startup-'));
    roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs');
    mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, 'prior.json'), JSON.stringify({ jobId: 'job-1', status: 'completed', startedAt: '2026-09-07T00:00:00.000Z', summary: 'prior session' }));
    const { stdin, lastFrame, unmount } = mountApp({ cwd, replSurfaceEnabled: true });
    try {
      await tick();
      expect(lastFrame() ?? '').not.toContain('prior session');
      stdin.write('/resume');
      stdin.write(ENTER);
      await tick(100);
      expect(lastFrame() ?? '').toContain('prior session');
    } finally {
      unmount();
    }
  });

  it('shows the startup teaser once when explicitly enabled', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l4-startup-on-'));
    roots.push(cwd);
    const jobs = join(cwd, '.deckent', 'runtime', 'jobs');
    mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, 'prior.json'), JSON.stringify({ jobId: 'job-2', status: 'completed', startedAt: '2026-09-07T00:00:00.000Z', summary: 'startup session' }));
    const { lastFrame, unmount } = mountApp({ cwd, replSurfaceEnabled: true, startupRecentSessions: true });
    await tick(100);
    expect(lastFrame() ?? '').toContain('startup session');
    unmount();
  });

  it('native /status preserves run output and appends the full local chat context', async () => {
    const dispatch = vi.fn(async () => 'run truth: unavailable');
    const { stdin, lastFrame, unmount } = mountApp({ sessionId: 'chat-memory-123', dispatcher: { dispatch } });
    await tick();
    stdin.write('/status');
    stdin.write(ENTER);
    await tick(100);
    expect(dispatch).toHaveBeenCalledWith('deckent_status', { root: '.' });
    expect(lastFrame() ?? '').toContain('run truth: unavailable');
    expect(lastFrame() ?? '').toContain('local active chat context: chat-memory-123');
    unmount();
  });

  it('picker consumes Ctrl-C exactly once, then idle Ctrl-C follows the normal arm policy', async () => {
    const { stdin, lastFrame, unmount } = mountApp();
    await tick();
    await openPicker(stdin, lastFrame);

    stdin.write(CTRL_C);
    await tick(100);
    expect(lastFrame() ?? '').not.toContain(pickerLabels.title.approve);
    expect(lastFrame() ?? '').not.toContain(labels.ctrlCArm);

    // If the old global gate also consumed the picker key, this is the second
    // Ctrl-C and exits. With one owner it is the first idle press and arms.
    stdin.write(CTRL_C);
    await tick(80);
    expect(lastFrame() ?? '').toContain(labels.ctrlCArm);

    // The app remains mounted and can open the real picker again.
    await openPicker(stdin, lastFrame);
    unmount();
  });

  it('an inactive picker does not suppress fallback Ctrl-C owned above it', async () => {
    const { stdin, lastFrame, getConfirmTrigger, unmount } = mountApp();
    await tick();
    await openPicker(stdin, lastFrame);
    const trigger = getConfirmTrigger();
    expect(trigger).toBeTypeOf('function');
    const pending = trigger!('higher-priority confirmation');
    await tick(80);
    expect(lastFrame() ?? '').toContain('higher-priority confirmation');

    stdin.write(CTRL_C);
    await tick(80);
    expect(lastFrame() ?? '').toContain(labels.ctrlCArm);
    expect(lastFrame() ?? '').toContain(pickerLabels.title.approve);

    stdin.write('n');
    await expect(pending).resolves.toBe('n');
    unmount();
  });
});
