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
import { buildApprovalDemoCopy, buildReplErrorDescriber, localizeNativeError } from '../../../src/cli/repl/run.js';
import { resolveTerminalGlyphs } from '../../../src/cli/helpers/terminal-glyphs.js';
import { InjectedLabelMissingError, INJECTED_LABEL_MISSING_CODE } from '../../../src/cli/helpers/injected-label.js';

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

  it('maps approval-demo owned punctuation with the resolved ASCII palette', () => {
    const glyphs = resolveTerminalGlyphs(true);
    expect(buildApprovalDemoCopy('en', glyphs)).toEqual({
      summary: 'DEMO - permission to run rm -rf ./build (live test card)',
      reason: getMessage('tui.approval_demo.reason', 'en'),
    });
    expect(buildApprovalDemoCopy('tr', glyphs)).toEqual({
      summary: 'DEMO - rm -rf ./build çalıştırma izni (canlı test kartı)',
      reason: getMessage('tui.approval_demo.reason', 'tr'),
    });
  });

  it.each([
    ['en', false],
    ['en', true],
    ['tr', false],
    ['tr', true],
  ] as const)('preserves raw native-error values with replacement syntax and placeholders in %s ascii=%s', (lang, ascii) => {
    const provider = "$&/$`/$'/{detail}/{detail} · —";
    const detail = "$&/$`/$'/{provider}/{provider} · —";
    const dash = ascii ? '-' : '—';
    const expected = lang === 'en'
      ? `switch failed ${dash} ${provider} needs an API key: set ${detail}`
      : `geçiş başarısız ${dash} ${provider} için API anahtarı gerekli: ${detail} tanımlayın`;
    expect(localizeNativeError({
      error: 'fallback must not win',
      errorCode: 'missing-api-key',
      provider,
      detail,
    } as never, lang, 'switch', resolveTerminalGlyphs(ascii))).toBe(expected);
  });

  it.each([
    ['en', false],
    ['en', true],
    ['tr', false],
    ['tr', true],
  ] as const)('preserves raw injected-label values after owned template mapping in %s ascii=%s', (lang, ascii) => {
    const label = "$&/$`/$'/{code}/{code} · —";
    const dash = ascii ? '-' : '—';
    const err = new InjectedLabelMissingError(label);
    const expected = lang === 'en'
      ? `Terminal label "${label}" was not injected (${INJECTED_LABEL_MISSING_CODE}). This is a Deckent defect, not a configuration problem ${dash} report it with the code.`
      : `"${label}" terminal etiketi enjekte edilmedi (${INJECTED_LABEL_MISSING_CODE}). Bu bir yapılandırma sorunu değil, Deckent kusurudur ${dash} kodla birlikte bildirin.`;
    expect(buildReplErrorDescriber(lang, resolveTerminalGlyphs(ascii))(err)).toBe(expected);
  });

  it('preserves the canonical unknown-key fallback and raw mechanism error', () => {
    const raw = "$&/$`/$'/{provider}/{detail} · —";
    expect(localizeNativeError({
      error: raw,
      errorCode: 'future-provider-error',
      provider: 'ignored',
      detail: 'ignored',
    } as never, 'tr', 'boot', resolveTerminalGlyphs(true))).toBe(raw);
  });
});
