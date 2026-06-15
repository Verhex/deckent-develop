// @vitest-environment happy-dom
// D7: TerminalPanel renders the terminal chrome ONLY when the server injected a
// terminal bootstrap token (terminalEnabled). Disabled → null (no dead bar).
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// Stub the terminal-api so no real WS/fetch runs; getBootstrapToken reads the
// window var, which we set per-test.
vi.mock('../../src/dashboard/src/lib/terminal-api.js', async (orig) => {
  const actual = await orig() as Record<string, unknown>;
  return {
    ...actual,
    getBootstrapToken: () =>
      (globalThis as unknown as { __DECKENT_TERMINAL_TOKEN__?: string }).__DECKENT_TERMINAL_TOKEN__,
    listSessions: vi.fn().mockResolvedValue([]),
  };
});

import { TerminalPanel } from '../../src/dashboard/src/components/terminal/TerminalPanel';

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { __DECKENT_TERMINAL_TOKEN__?: string }).__DECKENT_TERMINAL_TOKEN__;
});

describe('TerminalPanel — availability gate (D7)', () => {
  it('renders nothing when no terminal token is injected (terminal disabled)', () => {
    const { container } = render(React.createElement(TerminalPanel));
    expect(container.firstChild).toBeNull();
  });

  it('renders the terminal chrome when a terminal token is present (enabled)', () => {
    (globalThis as unknown as { __DECKENT_TERMINAL_TOKEN__?: string }).__DECKENT_TERMINAL_TOKEN__ = 'tok-123';
    const { container } = render(React.createElement(TerminalPanel));
    expect(container.firstChild).not.toBeNull();
  });
});
