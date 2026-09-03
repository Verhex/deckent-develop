// src/cli/helpers/terminal-links.ts
// ═══ TERMINAL-READABILITY-002 — capability-gated OSC 8 hyperlinks ═══
//
// OSC 8 (`ESC ] 8 ; ; url BEL text ESC ] 8 ; ; BEL`) makes a label clickable
// in terminals that implement it and prints garbage bytes in some that do
// not (legacy consoles, CI log viewers, an old multiplexer). The Terminal
// therefore writes OSC 8 only where the host is PROVEN to render it, from the
// environment signals each host sets, and never through a multiplexer whose
// passthrough is unproven. `terminal.links` (auto | on | off) lets the
// operator override the evidence in either direction. Pure and env-free:
// the caller passes the environment and the TTY fact.
//
// File references are deliberately NOT wrapped: VS Code, Cursor and JetBrains
// detect `path:line:col` in plain text and open the file AT THE LINE, while an
// OSC 8 `file://` link would take precedence and lose the line. The visible
// `path:line:col` text (kept as one unbroken span by the renderer) is the
// carrier every host understands.

export type HyperlinkSetting = 'auto' | 'on' | 'off';

export type TerminalHost =
  | 'vscode' | 'cursor' | 'iterm' | 'wezterm' | 'ghostty' | 'kitty'
  | 'windows-terminal' | 'vte' | 'konsole' | 'apple-terminal' | 'multiplexer' | 'unknown';

export type HyperlinkReason =
  | 'setting-on' | 'setting-off' | 'host-supported' | 'host-unsupported'
  | 'multiplexer-unproven' | 'not-a-tty' | 'no-evidence';

export interface HyperlinkDecision {
  enabled: boolean;
  host: TerminalHost;
  reason: HyperlinkReason;
}

export interface HyperlinkInput {
  env: Readonly<Record<string, string | undefined>>;
  /** `terminal.links` as configured (unvalidated; anything else means auto). */
  setting: unknown;
  stdoutIsTTY: boolean;
}

const SETTINGS: readonly HyperlinkSetting[] = ['auto', 'on', 'off'];

/** Normalize the configured value; unknown → auto (the evidence decides). */
export function resolveHyperlinkSetting(value: unknown): HyperlinkSetting {
  if (typeof value !== 'string') return 'auto';
  const token = value.trim().toLowerCase();
  return (SETTINGS as readonly string[]).includes(token) ? (token as HyperlinkSetting) : 'auto';
}

/** VTE ≥ 0.50 (VTE_VERSION 5000) renders OSC 8. */
const VTE_MIN_VERSION = 5000;

/** Which terminal host is rendering, from the signals each one sets. */
export function detectTerminalHost(env: Readonly<Record<string, string | undefined>>): TerminalHost {
  // A multiplexer owns the pane: whatever launched it (VS Code, iTerm) is not
  // the renderer, and passthrough of OSC 8 depends on its version/config.
  if (env['TMUX'] || env['STY'] || (env['TERM_PROGRAM'] ?? '').toLowerCase() === 'tmux') return 'multiplexer';
  const program = (env['TERM_PROGRAM'] ?? '').toLowerCase();
  if (program === 'vscode') return env['CURSOR_TRACE_ID'] || env['CURSOR_SESSION'] ? 'cursor' : 'vscode';
  if (program === 'iterm.app') return 'iterm';
  if (program === 'wezterm') return 'wezterm';
  if (program === 'ghostty') return 'ghostty';
  if (program === 'apple_terminal') return 'apple-terminal';
  if (env['WT_SESSION']) return 'windows-terminal';
  if (env['KITTY_WINDOW_ID'] || (env['TERM'] ?? '') === 'xterm-kitty') return 'kitty';
  if (env['KONSOLE_VERSION']) return 'konsole';
  if (env['VTE_VERSION']) return 'vte';
  return 'unknown';
}

function hostRendersOsc8(host: TerminalHost, env: Readonly<Record<string, string | undefined>>): boolean | 'unproven' {
  switch (host) {
    case 'vscode': case 'cursor': case 'iterm': case 'wezterm': case 'ghostty': case 'kitty':
    case 'windows-terminal': case 'konsole':
      return true;
    case 'vte': {
      const version = Number.parseInt(env['VTE_VERSION'] ?? '', 10);
      return Number.isInteger(version) && version >= VTE_MIN_VERSION;
    }
    case 'apple-terminal':
      return false;
    case 'multiplexer':
      return 'unproven';
    case 'unknown':
      return 'unproven';
  }
}

/** The one decision the renderers consume. */
export function resolveHyperlinks(input: HyperlinkInput): HyperlinkDecision {
  const host = detectTerminalHost(input.env);
  if (!input.stdoutIsTTY) return { enabled: false, host, reason: 'not-a-tty' };
  const setting = resolveHyperlinkSetting(input.setting);
  if (setting === 'on') return { enabled: true, host, reason: 'setting-on' };
  if (setting === 'off') return { enabled: false, host, reason: 'setting-off' };
  const renders = hostRendersOsc8(host, input.env);
  if (renders === true) return { enabled: true, host, reason: 'host-supported' };
  if (renders === false) return { enabled: false, host, reason: 'host-unsupported' };
  return { enabled: false, host, reason: host === 'multiplexer' ? 'multiplexer-unproven' : 'no-evidence' };
}
