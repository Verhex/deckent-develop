// Task 214-010: VS Code extension real activation + workspace deckent detection.
// Verifies command registration, deckent CLI/MCP marker detection, deactivate cleanup,
// and the dependency-injected vscode mock wiring.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  activate,
  deactivate,
  isDeckentDetected,
  type ExtensionContext,
  type VsCodeApi,
  type WorkspaceApi,
} from '../../extensions/vscode/src/extension.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWorkspace(present: ReadonlyArray<string>): WorkspaceApi {
  const set = new Set(present);
  return { hasMarker: vi.fn((rel: string) => set.has(rel)) };
}

function makeVsCodeApi(workspace?: WorkspaceApi): VsCodeApi {
  return {
    commands: {
      registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    window: {
      showInformationMessage: vi.fn(),
      createStatusBarItem: vi.fn().mockReturnValue({
        text: '',
        tooltip: '',
        show: vi.fn(),
        dispose: vi.fn(),
      }),
    },
    workspace,
  };
}

function makeContext(): ExtensionContext {
  return { subscriptions: [] };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extensions/vscode activation (214-010)', () => {
  let context: ExtensionContext;

  beforeEach(() => {
    context = makeContext();
    deactivate(); // ensure fresh detection state per test
  });

  it('activate registers both deckent commands via the mocked vscode API', () => {
    const vscode = makeVsCodeApi();
    activate(context, vscode);

    const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
    const ids = calls.map(([id]) => id);
    expect(ids).toContain('deckent.startSprint');
    expect(ids).toContain('deckent.showDashboard');
    expect(context.subscriptions.length).toBe(3); // 2 command disposables + 1 status-bar item
  });

  it('detects deckent workspace when .deckent/config.json marker is present', () => {
    const workspace = makeWorkspace(['.deckent/config.json']);
    const vscode = makeVsCodeApi(workspace);

    activate(context, vscode);

    expect(isDeckentDetected()).toBe(true);
    const messages = vi.mocked(vscode.window.showInformationMessage).mock.calls.map(([m]) => m);
    expect(messages).toContain('Deckent: workspace detected');
  });

  it('does NOT detect deckent when no marker files exist in the workspace', () => {
    const workspace = makeWorkspace([]);
    const vscode = makeVsCodeApi(workspace);

    activate(context, vscode);

    expect(isDeckentDetected()).toBe(false);
    const messages = vi.mocked(vscode.window.showInformationMessage).mock.calls.map(([m]) => m);
    expect(messages).not.toContain('Deckent: workspace detected');
  });

  it('deactivate resets detection state and remains idempotent', () => {
    const workspace = makeWorkspace(['.deckent/config.json']);
    const vscode = makeVsCodeApi(workspace);

    activate(context, vscode);
    expect(isDeckentDetected()).toBe(true);

    deactivate();
    expect(isDeckentDetected()).toBe(false);

    expect(() => {
      deactivate();
      deactivate();
    }).not.toThrow();
    expect(isDeckentDetected()).toBe(false);
  });

  it('treats missing vscode.workspace as no-detection (backward-compatible)', () => {
    const vscode = makeVsCodeApi(); // no workspace adapter
    activate(context, vscode);

    expect(isDeckentDetected()).toBe(false);
    expect(context.subscriptions.length).toBe(3); // 2 command disposables + 1 status-bar item
  });

  it('detects via alternate sprint-state.json marker (CLI/MCP fallback)', () => {
    const workspace = makeWorkspace(['.deckent/sprint-state.json']);
    const vscode = makeVsCodeApi(workspace);

    activate(context, vscode);

    expect(isDeckentDetected()).toBe(true);
    expect(workspace.hasMarker).toHaveBeenCalledWith('.deckent/config.json');
  });
});
