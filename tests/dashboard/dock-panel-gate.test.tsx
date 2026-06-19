// @vitest-environment happy-dom
// DA-T.1: DockPanel (the bottom terminal bar) renders ONLY when the server
// injected a terminal bootstrap token — same availability rule as TerminalPanel.
// Disabled (non-localhost / no --terminal) → null, so there is no dead empty
// bar on every dashboard page. Mirrors terminal-panel-gate.test.tsx (D7).
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../../src/dashboard/src/lib/terminal-api.js', async (orig) => {
  const actual = await orig() as Record<string, unknown>;
  return {
    ...actual,
    getBootstrapToken: () =>
      (globalThis as unknown as { __DECKENT_TERMINAL_TOKEN__?: string }).__DECKENT_TERMINAL_TOKEN__,
  };
});

import { DockPanel } from '../../src/dashboard/src/components/DockPanel';

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { __DECKENT_TERMINAL_TOKEN__?: string }).__DECKENT_TERMINAL_TOKEN__;
});

const child = () => React.createElement('span', null, 'terminal-body');

describe('DockPanel — terminal availability gate (DA-T.1)', () => {
  it('renders nothing when no terminal token is injected (no dead bar)', () => {
    const { container } = render(React.createElement(DockPanel, null, child()));
    expect(container.firstChild).toBeNull();
  });

  it('renders the dock bar when a terminal token is present', () => {
    (globalThis as unknown as { __DECKENT_TERMINAL_TOKEN__?: string }).__DECKENT_TERMINAL_TOKEN__ = 'tok-123';
    const { container } = render(React.createElement(DockPanel, null, child()));
    expect(container.querySelector('[data-dock-panel="true"]')).not.toBeNull();
  });
});
