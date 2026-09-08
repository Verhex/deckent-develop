import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ReplApp } from '../../../src/cli/repl/app.js';
import { buildReplLabels, buildShortcutsPanel, buildStructuredActionLabels, buildToolReadLabels } from '../../../src/cli/repl/run.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { createSessionToolContentStore } from '../../../src/agent/session-tool-content.js';
import { containCapturedToolResult } from '../../../src/agent/tool-result-broker.js';
import type { CliStructuredActionResult } from '../../../src/cli/commands/chat-tool-bridge.js';
import type { CliStructuredActionRequest } from '../../../src/cli/helpers/cli-tool-capture.js';
import type { StructuredActionDecision } from '../../../src/cli/repl/structured-action-picker.js';

const wait = () => new Promise((resolve) => setTimeout(resolve, 90));
const stores: ReturnType<typeof createSessionToolContentStore>[] = [];
const views: ReturnType<typeof render>[] = [];
afterEach(() => { for (const view of views.splice(0)) view.unmount(); for (const store of stores.splice(0)) store.close(); });

function fixture(lang: 'en' | 'tr' = 'en', overrides: Partial<React.ComponentProps<typeof ReplApp>> = {}) {
  const t = (key: string) => getMessage(key, lang);
  const store = createSessionToolContentStore(); stores.push(store);
  const captured = (request: CliStructuredActionRequest): CliStructuredActionResult => {
    const writer = store.beginCapture({ channel: 'stdout', previewBytes: 16 });
    writer.append(Buffer.from(JSON.stringify({ warnings: ['preserved-sync-detail'] })));
    const stdout = writer.finish();
    const stderr = store.beginCapture({ channel: 'stderr', previewBytes: 16 }).finish();
    return { request, envelope: containCapturedToolResult({ stdout, stderr, exitCode: 0, signal: null }),
      rendered: '', stdoutCapture: stdout, stderrCapture: stderr, signal: null, containmentReason: null };
  };
  const dispatchStructuredAction = vi.fn(async (request: CliStructuredActionRequest): Promise<StructuredActionDecision> => ({ kind: 'captured', result: captured(request) }));
  const dispatchRead = vi.fn();
  const dispatch = vi.fn(async () => '');
  const props: React.ComponentProps<typeof ReplApp> = {
    provider: {} as never, dispatcher: { dispatch }, labels: buildReplLabels(t), providerName: 'fixture', cwd: '/tmp',
    registerConfirm: () => {}, registerToolSink: () => {}, slashRegistry: buildSlashRegistry(lang),
    initialSelection: { provider: 'fixture', model: 'fixture' }, onSwitch: () => ({ provider: 'fixture', model: 'fixture' }),
    onApprovalMode: () => {}, inboxLabels: {} as never, pickerLabels: buildPickerLabels(t),
    liveFooterLabels: {} as never, approvalLabels: {} as never, runFlowCardLabels: {} as never,
    runFlowMountLabels: {} as never, doSlashLabels: {} as never, caretStyle: 'marker',
    shortcutsPanel: buildShortcutsPanel(t), nativeEngine: Object.assign(async () => {}, { close: vi.fn() }) as never,
    replSurfaceEnabled: true, lang, initialTermMode: 'run',
    toolRead: { dispatchRead, dispatchStructuredAction, readDetailRange: store.readDetailRange,
      labels: buildToolReadLabels(t), actionLabels: buildStructuredActionLabels(t) }, ...overrides,
  };
  const mount = () => { const view = render(<ReplApp {...props} />); views.push(view); return view; };
  return { props, mount, dispatchStructuredAction, dispatchRead, dispatch, captured, t };
}

describe('structured action production ingress wiring', () => {
  it.each(['en', 'tr'] as const)('picker close performs no action, selection captures once and exposes full detail (%s)', async (lang) => {
    const f = fixture(lang); const ui = f.mount();
    ui.stdin.write('/sync\r'); await wait();
    expect(ui.lastFrame()).toContain(buildStructuredActionLabels(f.t).syncTitle);
    ui.stdin.write('\x1b'); await wait();
    expect(f.dispatchStructuredAction).not.toHaveBeenCalled();
    ui.stdin.write('/sync\r'); await wait(); ui.stdin.write('\x1b[B'); await wait(); ui.stdin.write('\r'); await wait(); await wait();
    expect(f.dispatchStructuredAction).toHaveBeenCalledExactlyOnceWith({ kind: 'sync', mode: 'apply' });
    expect(f.dispatchRead).not.toHaveBeenCalled(); expect(f.dispatch).not.toHaveBeenCalled();
    ui.stdin.write('\r'); await wait();
    expect(ui.lastFrame()).toContain('preserved-sync-detail');
  });

  it('audit gate selection requests an explicit target before dispatch', async () => {
    const f = fixture(); const ui = f.mount();
    ui.stdin.write('/audit\r'); await wait(); ui.stdin.write('\r'); await wait();
    expect(ui.lastFrame()).toContain(buildStructuredActionLabels(f.t).gatePrompt);
    expect(f.dispatchStructuredAction).not.toHaveBeenCalled();
    ui.stdin.write('sprint-724\r'); await wait();
    expect(f.dispatchStructuredAction).toHaveBeenCalledExactlyOnceWith({ kind: 'audit-gate', sprintId: 'sprint-724' });
  });

  it('posture denial precedes the authorized capture seam', async () => {
    const f = fixture('en', { initialTermMode: 'ask' }); const ui = f.mount();
    ui.stdin.write('/sync apply\r'); await wait();
    expect(f.dispatchStructuredAction).not.toHaveBeenCalled(); expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('invalid actions cannot fall through to a legacy or read dispatcher', async () => {
    const f = fixture(); const ui = f.mount();
    ui.stdin.write('/audit retention\r'); await wait();
    expect(ui.lastFrame()).toContain(buildStructuredActionLabels(f.t).invalid);
    expect(f.dispatchStructuredAction).not.toHaveBeenCalled(); expect(f.dispatchRead).not.toHaveBeenCalled(); expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('confirmation denial restores input without installing a fabricated result', async () => {
    const f = fixture(); f.dispatchStructuredAction.mockResolvedValue({ kind: 'denied', rendered: 'fixture-denied' });
    const ui = f.mount(); ui.stdin.write('/sync preview\r'); await wait();
    expect(ui.lastFrame()).toContain('fixture-denied');
    expect(ui.lastFrame()).not.toContain('preserved-sync-detail');
    expect(f.dispatchStructuredAction).toHaveBeenCalledTimes(1);
  });

  it('closing a pending view cannot dispatch a concurrent write action', async () => {
    const f = fixture(); let settle!: (value: StructuredActionDecision) => void;
    f.dispatchStructuredAction.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }));
    const ui = f.mount(); ui.stdin.write('/sync apply\r'); await wait();
    ui.stdin.write('\x1b'); await wait(); ui.stdin.write('/sync apply\r'); await wait();
    expect(ui.lastFrame()).toContain(buildStructuredActionLabels(f.t).busy);
    expect(f.dispatchStructuredAction).toHaveBeenCalledTimes(1);
    settle({ kind: 'captured', result: f.captured({ kind: 'sync', mode: 'apply' }) }); await wait();
  });
});
