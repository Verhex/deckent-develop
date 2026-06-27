// Task 343-005: canonical VS Code extension — full activation seam test.
// Asserts registerCommand + createStatusBarItem + context.subscriptions.push all fire
// with an injected vscode double (no real VS Code runtime required).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  activate,
  deactivate,
  type ExtensionContext,
  type VsCodeApi,
  type StatusBarItem,
} from '../../extensions/vscode/src/extension.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStatusBarItem(): StatusBarItem {
  return {
    text: '',
    tooltip: '',
    show: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeVsCodeApi(bar?: StatusBarItem): VsCodeApi {
  const statusBar = bar ?? makeStatusBarItem();
  return {
    commands: {
      registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    window: {
      showInformationMessage: vi.fn(),
      createStatusBarItem: vi.fn().mockReturnValue(statusBar),
    },
  };
}

function makeContext(): ExtensionContext {
  return { subscriptions: [] };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('canonical VS Code extension activation (343-005)', () => {
  let context: ExtensionContext;

  beforeEach(() => {
    context = makeContext();
    deactivate();
  });

  it('registers deckent.startSprint command via registerCommand', () => {
    const vscode = makeVsCodeApi();
    activate(context, vscode);

    const ids = vi.mocked(vscode.commands.registerCommand).mock.calls.map(([id]) => id);
    expect(ids).toContain('deckent.startSprint');
  });

  it('registers deckent.showDashboard command via registerCommand', () => {
    const vscode = makeVsCodeApi();
    activate(context, vscode);

    const ids = vi.mocked(vscode.commands.registerCommand).mock.calls.map(([id]) => id);
    expect(ids).toContain('deckent.showDashboard');
  });

  it('creates status-bar item via createStatusBarItem(id, alignment, priority)', () => {
    const vscode = makeVsCodeApi();
    activate(context, vscode);

    expect(vscode.window.createStatusBarItem).toHaveBeenCalledOnce();
    const call = vi.mocked(vscode.window.createStatusBarItem!).mock.calls[0]!;
    const [id, alignment, priority] = call;
    expect(id).toBe('deckent');
    expect(typeof alignment).toBe('number');
    expect(typeof priority).toBe('number');
  });

  it('shows the status-bar item on activation', () => {
    const bar = makeStatusBarItem();
    const vscode = makeVsCodeApi(bar);
    activate(context, vscode);

    expect(vi.mocked(bar.show)).toHaveBeenCalledOnce();
  });

  it('sets status-bar text and tooltip on activation', () => {
    const bar = makeStatusBarItem();
    const vscode = makeVsCodeApi(bar);
    activate(context, vscode);

    expect(bar.text).toBe('$(rocket) Deckent');
    expect(bar.tooltip).toBe('Deckent — AI Agent Orchestrator');
  });

  it('pushes command disposables and status-bar item into context.subscriptions', () => {
    const vscode = makeVsCodeApi();
    activate(context, vscode);

    // 2 commands + 1 status-bar item = 3 subscriptions
    expect(context.subscriptions).toHaveLength(3);
  });

  it('status-bar item is in subscriptions — dispose-on-deactivate guaranteed', () => {
    const bar = makeStatusBarItem();
    const vscode = makeVsCodeApi(bar);
    activate(context, vscode);

    expect(context.subscriptions).toContain(bar);
  });
});
