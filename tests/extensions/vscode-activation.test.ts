import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  activate,
  deactivate,
  type ExtensionContext,
  type VsCodeApi,
} from '../../extensions/vscode/src/extension.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeVsCodeApi(): VsCodeApi {
  return {
    commands: {
      registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    window: {
      showInformationMessage: vi.fn(),
    },
  };
}

function makeContext(): ExtensionContext {
  return { subscriptions: [] };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extensions/vscode scaffold (212-013)', () => {
  let context: ExtensionContext;
  let vscode: VsCodeApi;

  beforeEach(() => {
    context = makeContext();
    vscode = makeVsCodeApi();
    deactivate();
  });

  it('activate registers deckent.startSprint command', () => {
    activate(context, vscode);
    const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
    const ids = calls.map(([id]) => id);
    expect(ids).toContain('deckent.startSprint');
  });

  it('activate registers deckent.showDashboard command', () => {
    activate(context, vscode);
    const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
    const ids = calls.map(([id]) => id);
    expect(ids).toContain('deckent.showDashboard');
  });

  it('activate pushes command disposables to subscriptions', () => {
    activate(context, vscode);
    expect(context.subscriptions.length).toBe(2);
  });

  it('deactivate is callable without throwing', () => {
    expect(() => deactivate()).not.toThrow();
  });

  it('deactivate is idempotent — callable multiple times', () => {
    activate(context, vscode);
    expect(() => {
      deactivate();
      deactivate();
    }).not.toThrow();
  });

  it('manifest has required engines.vscode field', () => {
    const manifestPath = join(process.cwd(), 'extensions/vscode/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    const engines = manifest['engines'] as Record<string, unknown> | undefined;
    expect(engines).toBeDefined();
    expect(typeof engines!['vscode']).toBe('string');
  });

  it('manifest contributes deckent.startSprint and deckent.showDashboard commands', () => {
    const manifestPath = join(process.cwd(), 'extensions/vscode/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    const contributes = manifest['contributes'] as Record<string, unknown> | undefined;
    const commands = contributes?.['commands'] as Array<{ command: string }> | undefined;
    expect(commands).toBeDefined();
    const ids = (commands ?? []).map((c) => c.command);
    expect(ids).toContain('deckent.startSprint');
    expect(ids).toContain('deckent.showDashboard');
  });
});
