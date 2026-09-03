// tests/cli/helpers/terminal-links.test.ts
// ═══ TERMINAL-READABILITY-002 — capability-gated OSC 8 hyperlinks ═══
//
// Owner decision (2026-09-03): OSC 8 hyperlinks are emitted only where the
// host terminal is PROVEN to render them (VS Code / Cursor, iTerm2, WezTerm,
// Ghostty, kitty, Windows Terminal, VTE ≥ 0.50, Konsole); under a multiplexer
// or an unknown host no OSC byte is written (the visible text stays the
// carrier and the IDE's own link detection still works); `terminal.links`
// (auto | on | off) lets the operator override the evidence. Pure, hermetic.

import { describe, it, expect } from 'vitest';
import { detectTerminalHost, resolveHyperlinks, resolveHyperlinkSetting } from '../../../src/cli/helpers/terminal-links.js';

const tty = { stdoutIsTTY: true };

describe('detectTerminalHost', () => {
  it('reads the host from the environment signals each terminal sets', () => {
    expect(detectTerminalHost({ TERM_PROGRAM: 'vscode' })).toBe('vscode');
    expect(detectTerminalHost({ TERM_PROGRAM: 'vscode', CURSOR_TRACE_ID: 'x' })).toBe('cursor');
    expect(detectTerminalHost({ TERM_PROGRAM: 'iTerm.app' })).toBe('iterm');
    expect(detectTerminalHost({ TERM_PROGRAM: 'WezTerm' })).toBe('wezterm');
    expect(detectTerminalHost({ TERM_PROGRAM: 'ghostty' })).toBe('ghostty');
    expect(detectTerminalHost({ TERM_PROGRAM: 'Apple_Terminal' })).toBe('apple-terminal');
    expect(detectTerminalHost({ WT_SESSION: 'abc' })).toBe('windows-terminal');
    expect(detectTerminalHost({ TERM: 'xterm-kitty' })).toBe('kitty');
    expect(detectTerminalHost({ KITTY_WINDOW_ID: '1' })).toBe('kitty');
    expect(detectTerminalHost({ VTE_VERSION: '7600' })).toBe('vte');
    expect(detectTerminalHost({ KONSOLE_VERSION: '230800' })).toBe('konsole');
    expect(detectTerminalHost({ TMUX: '/tmp/tmux-1000/default,1,0', TERM_PROGRAM: 'tmux' })).toBe('multiplexer');
    expect(detectTerminalHost({})).toBe('unknown');
  });
  it('a multiplexer wins over an inherited host signal (the pane, not the outer app, renders)', () => {
    expect(detectTerminalHost({ TMUX: '/tmp/x', TERM_PROGRAM: 'vscode' })).toBe('multiplexer');
    expect(detectTerminalHost({ STY: '1234.pts-0.host' })).toBe('multiplexer');
  });
});

describe('resolveHyperlinkSetting', () => {
  it('accepts auto | on | off (case-insensitive) and falls back to auto', () => {
    expect(resolveHyperlinkSetting('on')).toBe('on');
    expect(resolveHyperlinkSetting('OFF')).toBe('off');
    expect(resolveHyperlinkSetting(undefined)).toBe('auto');
    expect(resolveHyperlinkSetting('bogus')).toBe('auto');
    expect(resolveHyperlinkSetting(1)).toBe('auto');
  });
});

describe('resolveHyperlinks', () => {
  it('auto: enabled only on a proven host', () => {
    for (const env of [
      { TERM_PROGRAM: 'vscode' }, { TERM_PROGRAM: 'vscode', CURSOR_TRACE_ID: 'x' }, { TERM_PROGRAM: 'iTerm.app' },
      { TERM_PROGRAM: 'WezTerm' }, { TERM_PROGRAM: 'ghostty' }, { WT_SESSION: 'a' }, { TERM: 'xterm-kitty' },
      { VTE_VERSION: '5000' }, { KONSOLE_VERSION: '220380' },
    ]) {
      const d = resolveHyperlinks({ env, setting: undefined, ...tty });
      expect(d.enabled, JSON.stringify(env)).toBe(true);
      expect(d.reason).toBe('host-supported');
    }
  });
  it('auto: an old VTE, Apple Terminal, a multiplexer and an unknown host get no OSC bytes', () => {
    expect(resolveHyperlinks({ env: { VTE_VERSION: '4900' }, setting: undefined, ...tty })).toMatchObject({ enabled: false, reason: 'host-unsupported' });
    expect(resolveHyperlinks({ env: { TERM_PROGRAM: 'Apple_Terminal' }, setting: undefined, ...tty })).toMatchObject({ enabled: false, reason: 'host-unsupported' });
    expect(resolveHyperlinks({ env: { TMUX: '/tmp/x' }, setting: undefined, ...tty })).toMatchObject({ enabled: false, reason: 'multiplexer-unproven' });
    expect(resolveHyperlinks({ env: {}, setting: undefined, ...tty })).toMatchObject({ enabled: false, reason: 'no-evidence' });
  });
  it('not a TTY: never, whatever the setting says', () => {
    expect(resolveHyperlinks({ env: { TERM_PROGRAM: 'vscode' }, setting: 'on', stdoutIsTTY: false })).toMatchObject({ enabled: false, reason: 'not-a-tty' });
  });
  it('setting on / off overrides the evidence on a TTY', () => {
    expect(resolveHyperlinks({ env: { TMUX: '/tmp/x' }, setting: 'on', ...tty })).toMatchObject({ enabled: true, reason: 'setting-on', host: 'multiplexer' });
    expect(resolveHyperlinks({ env: { TERM_PROGRAM: 'vscode' }, setting: 'off', ...tty })).toMatchObject({ enabled: false, reason: 'setting-off', host: 'vscode' });
  });
  it('carries the host so a status surface can name it', () => {
    expect(resolveHyperlinks({ env: { TERM_PROGRAM: 'vscode', CURSOR_TRACE_ID: '1' }, setting: undefined, ...tty }).host).toBe('cursor');
  });
});
