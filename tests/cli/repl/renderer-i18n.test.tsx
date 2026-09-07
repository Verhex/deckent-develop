import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

let rendered: ReactNode;
vi.mock('ink', async () => {
  const React = await import('react');
  return {
    Box: (props: { children?: ReactNode }) => React.createElement('box', props),
    Text: (props: { children?: ReactNode }) => React.createElement('text', props),
    render: vi.fn((node: ReactNode) => {
      rendered = node;
      return { unmount: vi.fn(), waitUntilExit: async () => undefined };
    }),
  };
});

vi.mock('../../../src/cli/helpers/theme.js', () => ({ colorTier: () => 'none' }));
vi.mock('../../../src/cli/repl/ink-palette.js', () => ({
  resolveInkPalette: () => ({ accent: {}, muted: {} }),
}));

import { getMessage } from '../../../src/cli/helpers/messages.js';
import { runInkProbe } from '../../../src/cli/repl/ink-probe.js';
import { buildApprovalDemoCopy } from '../../../src/cli/repl/run.js';

function visibleText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return visibleText((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

describe('REPL renderer catalog wiring', () => {
  it('renders the diagnostic probe in the explicitly selected language', async () => {
    vi.useFakeTimers();
    try {
      const pending = runInkProbe('tr');
      await vi.runAllTimersAsync();
      await pending;
      expect(visibleText(rendered)).toContain(
        getMessage('tui.ink_probe.detail', 'tr', { version: (await import('react')).version }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('builds both approval demo fields from the same resolved language', () => {
    expect(buildApprovalDemoCopy('en')).toEqual({
      summary: getMessage('tui.approval_demo.summary', 'en'),
      reason: getMessage('tui.approval_demo.reason', 'en'),
    });
    expect(buildApprovalDemoCopy('tr')).toEqual({
      summary: getMessage('tui.approval_demo.summary', 'tr'),
      reason: getMessage('tui.approval_demo.reason', 'tr'),
    });
  });
});
