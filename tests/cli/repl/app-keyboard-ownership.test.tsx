import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync } from 'node:fs';
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

function mountApp() {
  const cwd = mkdtempSync(join(tmpdir(), 'deckent-l6-keyboard-'));
  roots.push(cwd);
  let confirmTrigger: ConfirmTrigger | undefined;
  const engine = Object.assign(async () => {}, {
    close: vi.fn(),
  }) as unknown as ReplEngine;
  const mounted = render(
    <ReplApp
      provider={{} as never}
      dispatcher={{ dispatch: vi.fn(async () => '') }}
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
      shortcutsPanel={buildShortcutsPanel(t)}
      nativeEngine={engine}
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
