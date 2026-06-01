import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleCommand,
  createSprintStatusBar,
  registerCommands,
  type CommandsVsCodeApi,
  type StatusBarItem,
} from '../../extensions/vscode/src/commands.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStatusBarItem(): StatusBarItem {
  return {
    text: '',
    tooltip: '',
    show: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeApi(): CommandsVsCodeApi {
  const terminal = { sendText: vi.fn(), show: vi.fn() };
  return {
    commands: {
      registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    window: {
      createTerminal: vi.fn().mockReturnValue(terminal),
      createStatusBarItem: vi.fn().mockReturnValue(makeStatusBarItem()),
      showInformationMessage: vi.fn(),
    },
    env: {
      openExternal: vi.fn(),
    },
  };
}

function makeContext(): { subscriptions: { dispose(): void }[] } {
  return { subscriptions: [] };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extensions/vscode commands (212-014)', () => {
  let api: CommandsVsCodeApi;

  beforeEach(() => {
    api = makeApi();
  });

  it('startSprint handler creates terminal and sends deckent start', () => {
    handleCommand('deckent.startSprint', api);
    expect(api.window.createTerminal).toHaveBeenCalledWith('Deckent');
    const terminal = vi.mocked(api.window.createTerminal).mock.results[0]!.value as {
      sendText: ReturnType<typeof vi.fn>;
      show: ReturnType<typeof vi.fn>;
    };
    expect(terminal.sendText).toHaveBeenCalledWith('deckent start');
    expect(terminal.show).toHaveBeenCalled();
  });

  it('showDashboard handler opens an external URL', () => {
    handleCommand('deckent.showDashboard', api);
    expect(api.env.openExternal).toHaveBeenCalledWith(expect.stringContaining('localhost'));
  });

  it('createSprintStatusBar creates item with text and calls show', () => {
    const item = createSprintStatusBar(api);
    expect(api.window.createStatusBarItem).toHaveBeenCalled();
    expect(item.text).toContain('Deckent');
    expect(vi.mocked(item.show)).toHaveBeenCalled();
  });

  it('handleCommand with unknown command id is a no-op and does not throw', () => {
    expect(() => handleCommand('deckent.unknownCommand', api)).not.toThrow();
    expect(api.window.createTerminal).not.toHaveBeenCalled();
    expect(api.env.openExternal).not.toHaveBeenCalled();
  });

  it('registerCommands pushes startSprint, showDashboard, and statusBar to subscriptions', () => {
    const context = makeContext();
    registerCommands(context, api);
    expect(context.subscriptions).toHaveLength(3);
    const calls = vi.mocked(api.commands.registerCommand).mock.calls.map(([id]) => id);
    expect(calls).toContain('deckent.startSprint');
    expect(calls).toContain('deckent.showDashboard');
  });
});
