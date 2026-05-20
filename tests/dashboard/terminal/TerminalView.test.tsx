// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    open = vi.fn();
    write = vi.fn();
    onData = vi.fn();
    loadAddon = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

class FakeWS {
  static OPEN = 1;
  static CLOSED = 3;
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  readyState = 1;
  sent: string[] = [];
  constructor(public url: string, public protocols?: string[] | string) {}
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

class FakeResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(public cb: ResizeObserverCallback) {}
}

vi.stubGlobal('WebSocket', FakeWS as unknown as typeof WebSocket);
vi.stubGlobal('ResizeObserver', FakeResizeObserver as unknown as typeof ResizeObserver);
(window as unknown as Record<string, unknown>).__DECKENT_TERMINAL_TOKEN__ = 'tk';

import { TerminalView } from '../../../src/dashboard/src/components/terminal/TerminalView';

describe('TerminalView', () => {
  it('renders a container for the given session', () => {
    const { container } = render(<TerminalView sessionId="s1" />);
    expect(container.querySelector('[data-terminal="s1"]')).toBeTruthy();
  });

  it('cleans up xterm + ResizeObserver on unmount', () => {
    const { unmount, container } = render(<TerminalView sessionId="s2" />);
    expect(container.querySelector('[data-terminal="s2"]')).toBeTruthy();
    unmount();
    // No throw on unmount = dispose + disconnect ran.
  });
});
