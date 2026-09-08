import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ReplApp } from '../../../src/cli/repl/app.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { buildLiveFooterLabels, buildReplLabels, buildShortcutsPanel } from '../../../src/cli/repl/run.js';

const t = (key: string): string => getMessage(key, 'en');

function app(feed: { getSnapshot: () => string | null; subscribe: (listener: () => void) => () => void }) {
  return <ReplApp
    provider={{} as never}
    dispatcher={{ dispatch: vi.fn(async () => '') }}
    labels={buildReplLabels(t)}
    providerName="fixture"
    cwd="/private/startup-health"
    registerConfirm={() => {}}
    registerToolSink={() => {}}
    slashRegistry={buildSlashRegistry('en')}
    initialSelection={{ provider: 'fixture', model: 'fixture' }}
    onSwitch={() => ({ provider: 'fixture', model: 'fixture' })}
    onApprovalMode={() => {}}
    inboxLabels={{} as never}
    pickerLabels={buildPickerLabels(t)}
    liveFooterLabels={buildLiveFooterLabels(t)}
    approvalLabels={{} as never}
    runFlowCardLabels={{} as never}
    runFlowMountLabels={{} as never}
    doSlashLabels={{} as never}
    caretStyle="marker"
    shortcutsPanel={buildShortcutsPanel(t)}
    healthAuthFeed={feed}
  />;
}

describe('Ink-owned startup health lifecycle', () => {
  it('renders an auth-only completion through subscribed state and ignores updates after unmount', async () => {
    let line: string | null = null;
    const listeners = new Set<() => void>();
    const feed = {
      getSnapshot: () => line,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    };
    const stdoutWrite = vi.spyOn(process.stdout, 'write');
    const view = render(app(feed));
    try {
      expect(view.lastFrame()).not.toContain('auth: logged in');
      stdoutWrite.mockClear();
      line = 'auth: logged in';
      for (const listener of listeners) listener();
      await vi.waitFor(() => expect(view.lastFrame()).toContain('auth: logged in'));
      expect(stdoutWrite).not.toHaveBeenCalled();

      view.unmount();
      expect(listeners.size).toBe(0);
      line = 'auth: stale late update';
      for (const listener of listeners) listener();
      expect(view.lastFrame()).not.toContain('stale late update');
    } finally {
      view.unmount();
      stdoutWrite.mockRestore();
    }
  });
});
