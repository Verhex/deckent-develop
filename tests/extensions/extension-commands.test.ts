// Task 214-011: VS Code extension command palette handlers.
// Tests: startSprint terminal, showDashboard URL, status output channel, unknown command no-op.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleCommand,
  registerCommands,
  type CommandsVsCodeApi,
  type OutputChannel,
  type StatusBarItem,
} from '../../extensions/vscode/src/commands.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOutputChannel(): OutputChannel {
  return { appendLine: vi.fn(), show: vi.fn() };
}

function makeStatusBarItem(): StatusBarItem {
  return { text: '', tooltip: '', show: vi.fn(), dispose: vi.fn() };
}

function makeApi(): CommandsVsCodeApi {
  const terminal = { sendText: vi.fn(), show: vi.fn() };
  return {
    commands: {
      registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    window: {
      createTerminal: vi.fn().mockReturnValue(terminal),
      createOutputChannel: vi.fn().mockReturnValue(makeOutputChannel()),
      createStatusBarItem: vi.fn().mockReturnValue(makeStatusBarItem()),
      showInformationMessage: vi.fn(),
    },
    env: {
      openExternal: vi.fn(),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extensions/vscode command palette handlers (214-011)', () => {
  let api: CommandsVsCodeApi;

  beforeEach(() => {
    api = makeApi();
  });

  it('startSprint creates terminal named Deckent and sends deckent start', () => {
    handleCommand('deckent.startSprint', api);

    expect(api.window.createTerminal).toHaveBeenCalledWith('Deckent');
    const terminal = vi.mocked(api.window.createTerminal).mock.results[0]!.value as {
      sendText: ReturnType<typeof vi.fn>;
      show: ReturnType<typeof vi.fn>;
    };
    expect(terminal.sendText).toHaveBeenCalledWith('deckent start');
    expect(terminal.show).toHaveBeenCalled();
  });

  it('showDashboard opens an external URL containing localhost', () => {
    handleCommand('deckent.showDashboard', api);

    expect(api.env.openExternal).toHaveBeenCalledTimes(1);
    const url = vi.mocked(api.env.openExternal).mock.calls[0]![0] as string;
    expect(url).toContain('localhost');
  });

  it('status creates output channel, appends lines, and shows it', () => {
    handleCommand('deckent.status', api);

    expect(api.window.createOutputChannel).toHaveBeenCalledWith('Deckent');
    const channel = vi.mocked(api.window.createOutputChannel).mock.results[0]!.value as OutputChannel;
    expect(vi.mocked(channel.appendLine)).toHaveBeenCalled();
    expect(vi.mocked(channel.show)).toHaveBeenCalled();
  });

  it('unknown command id is a no-op and does not throw', () => {
    expect(() => handleCommand('deckent.unknownXyz', api)).not.toThrow();
    expect(api.window.createTerminal).not.toHaveBeenCalled();
    expect(api.env.openExternal).not.toHaveBeenCalled();
    expect(api.window.createOutputChannel).not.toHaveBeenCalled();
  });

  it('registerCommands registers startSprint and showDashboard commands', () => {
    const context = { subscriptions: [] as { dispose(): void }[] };
    registerCommands(context, api);

    const ids = vi.mocked(api.commands.registerCommand).mock.calls.map(([id]) => id);
    expect(ids).toContain('deckent.startSprint');
    expect(ids).toContain('deckent.showDashboard');
  });
});
