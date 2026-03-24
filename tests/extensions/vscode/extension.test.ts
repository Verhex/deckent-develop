import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  activate,
  deactivate,
  getMcpConfig,
} from '../../../src/extensions/vscode/extension.js';
import type {
  ExtensionContext,
  VsCodeApi,
  StatusBarItem,
} from '../../../src/extensions/vscode/extension.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStatusBarItem(): StatusBarItem {
  return {
    text: '',
    tooltip: '',
    show: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeVsCodeApi(statusBarItem: StatusBarItem): VsCodeApi {
  return {
    commands: {
      registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    window: {
      createStatusBarItem: vi.fn().mockReturnValue(statusBarItem),
    },
    StatusBarAlignment: { Left: 1 },
  };
}

function makeContext(): ExtensionContext {
  return { subscriptions: [] };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Deckent VS Code Extension', () => {
  let context: ExtensionContext;
  let vscode: VsCodeApi;
  let barItem: StatusBarItem;

  beforeEach(() => {
    context = makeContext();
    barItem = makeStatusBarItem();
    vscode = makeVsCodeApi(barItem);
    // Reset module state between tests
    deactivate();
  });

  // ── activate ────────────────────────────────────────────────────────────

  it('creates a status bar item on activation', () => {
    activate(context, vscode);
    expect(vscode.window.createStatusBarItem).toHaveBeenCalledOnce();
    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(1, 100);
  });

  it('shows the status bar item on activation', () => {
    activate(context, vscode);
    expect(barItem.show).toHaveBeenCalledOnce();
  });

  it('sets status bar text to "Deckent: Idle" initially', () => {
    activate(context, vscode);
    expect(barItem.text).toBe('Deckent: Idle');
  });

  it('sets status bar tooltip', () => {
    activate(context, vscode);
    expect(barItem.tooltip).toBe('Deckent — AI Agent Orchestrator');
  });

  it('registers 3 commands', () => {
    activate(context, vscode);
    expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(3);
  });

  it('registers deckent.start command', () => {
    activate(context, vscode);
    const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
    const ids = calls.map(([id]) => id);
    expect(ids).toContain('deckent.start');
  });

  it('registers deckent.status command', () => {
    activate(context, vscode);
    const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
    const ids = calls.map(([id]) => id);
    expect(ids).toContain('deckent.status');
  });

  it('registers deckent.explain command', () => {
    activate(context, vscode);
    const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
    const ids = calls.map(([id]) => id);
    expect(ids).toContain('deckent.explain');
  });

  it('pushes status bar item and command disposables to subscriptions', () => {
    activate(context, vscode);
    // 1 status bar + 3 commands = 4 subscriptions
    expect(context.subscriptions).toHaveLength(4);
  });

  // ── deactivate ──────────────────────────────────────────────────────────

  it('is callable without prior activation', () => {
    expect(() => deactivate()).not.toThrow();
  });

  it('disposes status bar item on deactivation', () => {
    activate(context, vscode);
    deactivate();
    expect(barItem.dispose).toHaveBeenCalledOnce();
  });

  // ── getMcpConfig ────────────────────────────────────────────────────────

  it('returns correct MCP command', () => {
    const config = getMcpConfig();
    expect(config.command).toBe('deckent-mcp');
  });

  it('returns --stdio in args', () => {
    const config = getMcpConfig();
    expect(config.args).toEqual(['--stdio']);
  });

  it('returns a positive timeout', () => {
    const config = getMcpConfig();
    expect(config.timeout).toBeGreaterThan(0);
    expect(config.timeout).toBe(30_000);
  });
});
