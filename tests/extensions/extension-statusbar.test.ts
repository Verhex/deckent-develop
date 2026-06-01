// Task 214-013: VS Code extension status bar — sprint progress + click→dashboard.
// Tests: item create, progress text, click command, dispose cleanup.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DeckentStatusBar,
  createStatusBar,
  type StatusBarVsCodeApi,
  type StatusBarItem,
} from '../../extensions/vscode/src/statusbar.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(): StatusBarItem {
  return {
    text: '',
    tooltip: '',
    command: undefined,
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeApi(): { api: StatusBarVsCodeApi; item: StatusBarItem } {
  const item = makeItem();
  const api: StatusBarVsCodeApi = {
    window: {
      createStatusBarItem: vi.fn().mockReturnValue(item),
    },
  };
  return { api, item };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extensions/vscode statusbar (214-013)', () => {
  let api: StatusBarVsCodeApi;
  let item: StatusBarItem;

  beforeEach(() => {
    ({ api, item } = makeApi());
  });

  it('creates a StatusBarItem and shows it on construction', () => {
    new DeckentStatusBar(api);

    expect(api.window.createStatusBarItem).toHaveBeenCalledTimes(1);
    expect(vi.mocked(item.show)).toHaveBeenCalledTimes(1);
  });

  it('updateProgress sets item text to X/Y format', () => {
    const bar = new DeckentStatusBar(api);
    bar.updateProgress({ done: 3, total: 10 });

    expect(item.text).toContain('3/10');
  });

  it('sets item.command to deckent.showDashboard by default (click→dashboard)', () => {
    new DeckentStatusBar(api);

    expect(item.command).toBe('deckent.showDashboard');
  });

  it('accepts a custom dashboard command override', () => {
    new DeckentStatusBar(api, 'deckent.customCmd');

    expect(item.command).toBe('deckent.customCmd');
  });

  it('dispose calls item.dispose and clears the polling interval', () => {
    vi.useFakeTimers();
    const bar = new DeckentStatusBar(api);
    const getProgress = vi.fn().mockReturnValue({ done: 1, total: 5 });
    bar.startPolling(getProgress, 1000);

    bar.dispose();

    vi.advanceTimersByTime(5000);
    expect(vi.mocked(item.dispose)).toHaveBeenCalledTimes(1);
    expect(getProgress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('createStatusBar factory returns a DeckentStatusBar instance', () => {
    const bar = createStatusBar(api);

    expect(bar).toBeInstanceOf(DeckentStatusBar);
    expect(api.window.createStatusBarItem).toHaveBeenCalledTimes(1);
  });
});
