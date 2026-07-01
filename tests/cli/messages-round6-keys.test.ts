/**
 * Task 353-016 (MESSAGES-KEYS-2) — hermetic guard for the round-6
 * sole-authority key-addition task.
 *
 * Round-6 TERM tasks' .result notes were mined for reported i18n key needs
 * (see .tasks/task-353-016.plan for the source citations):
 *   - 353-007 (TERM-LIVE / live-footer.ts)   -> live_footer.* (11 keys)
 *   - 353-010 (TERM-CONNECT / connect-wizard.ts) -> connect.step.* (7 keys)
 * 353-008/353-009/353-012 reported no specific key needs (docImpact: none or
 * unspecified) and are intentionally NOT represented here — inventing keys
 * for an unreported need would be a nogo per this task's goNogo.
 *
 * This is key-only addition: no structural change to MessageMap/getMessage,
 * and no wiring into live-footer.ts/connect-wizard.ts (both out of write
 * scope — this task adds translations only).
 *
 * Hermetic: reads committed source + imports getMessage only — no gitignored
 * state.
 */

import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';
import {
  DEFAULT_LIVE_FOOTER_LABELS,
  type LiveFooterLabels,
} from '../../src/cli/helpers/live-footer.js';

// ─── live_footer.* (353-007) ───────────────────────────────────────────────

const LIVE_FOOTER_KEYS = [
  'live_footer.idle',
  'live_footer.running',
  'live_footer.elapsed',
  'live_footer.provider',
  'live_footer.auth',
  'live_footer.next',
  'live_footer.healthy',
  'live_footer.degraded',
  'live_footer.unknown',
  'live_footer.logged_in',
  'live_footer.logged_out',
] as const;

// Maps each live_footer.* key to the DEFAULT_LIVE_FOOTER_LABELS field it
// mirrors, proving the en text is byte-identical to the existing string-free
// default (so a future REPL-wiring task swapping options.labels for
// getMessage(...) produces no visible diff).
const LIVE_FOOTER_KEY_TO_LABEL_FIELD: Record<
  (typeof LIVE_FOOTER_KEYS)[number],
  keyof LiveFooterLabels
> = {
  'live_footer.idle': 'idle',
  'live_footer.running': 'running',
  'live_footer.elapsed': 'elapsed',
  'live_footer.provider': 'provider',
  'live_footer.auth': 'auth',
  'live_footer.next': 'next',
  'live_footer.healthy': 'healthy',
  'live_footer.degraded': 'degraded',
  'live_footer.unknown': 'unknown',
  'live_footer.logged_in': 'loggedIn',
  'live_footer.logged_out': 'loggedOut',
};

describe('live_footer.* keys (353-007 docImpact — cited by source task)', () => {
  it.each(LIVE_FOOTER_KEYS)('%s resolves to a non-empty, non-key-echo string in en', (key) => {
    const resolved = getMessage(key, 'en');
    expect(resolved).not.toBe(key);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it.each(LIVE_FOOTER_KEYS)('%s resolves to a non-empty, non-key-echo string in tr', (key) => {
    const resolved = getMessage(key, 'tr');
    expect(resolved).not.toBe(key);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it.each(LIVE_FOOTER_KEYS)(
    '%s en text is byte-identical to DEFAULT_LIVE_FOOTER_LABELS (no visible diff on future wiring)',
    (key) => {
      const field = LIVE_FOOTER_KEY_TO_LABEL_FIELD[key];
      expect(getMessage(key, 'en')).toBe(DEFAULT_LIVE_FOOTER_LABELS[field]);
    },
  );

  it('healthy / degraded / unknown / logged_in / logged_out differ between en and tr (genuinely localized)', () => {
    expect(getMessage('live_footer.healthy', 'en')).not.toBe(getMessage('live_footer.healthy', 'tr'));
    expect(getMessage('live_footer.degraded', 'en')).not.toBe(getMessage('live_footer.degraded', 'tr'));
    expect(getMessage('live_footer.unknown', 'en')).not.toBe(getMessage('live_footer.unknown', 'tr'));
    expect(getMessage('live_footer.logged_in', 'en')).not.toBe(getMessage('live_footer.logged_in', 'tr'));
    expect(getMessage('live_footer.logged_out', 'en')).not.toBe(getMessage('live_footer.logged_out', 'tr'));
  });
});

// ─── connect.step.* (353-010) ──────────────────────────────────────────────

describe('connect.step.* keys (353-010 docImpact — cited by source task)', () => {
  it('connect.step.install_cli interpolates {provider} and {instruction}', () => {
    const en = getMessage('connect.step.install_cli', 'en', { provider: 'codex', instruction: 'npm i -g codex' });
    expect(en).toContain('codex');
    expect(en).toContain('npm i -g codex');
    const tr = getMessage('connect.step.install_cli', 'tr', { provider: 'codex', instruction: 'npm i -g codex' });
    expect(tr).toContain('codex');
    expect(tr).toContain('npm i -g codex');
  });

  it('connect.step.login interpolates {provider}', () => {
    expect(getMessage('connect.step.login', 'en', { provider: 'gemini' })).toContain('gemini');
    expect(getMessage('connect.step.login', 'tr', { provider: 'gemini' })).toContain('gemini');
  });

  it('connect.step.mcp_unsupported interpolates {host}', () => {
    expect(getMessage('connect.step.mcp_unsupported', 'en', { host: 'claude' })).toContain('claude');
    expect(getMessage('connect.step.mcp_unsupported', 'tr', { host: 'claude' })).toContain('claude');
  });

  it('connect.step.attach_mcp interpolates {host}', () => {
    expect(getMessage('connect.step.attach_mcp', 'en', { host: 'codex' })).toContain('codex');
    expect(getMessage('connect.step.attach_mcp', 'tr', { host: 'codex' })).toContain('codex');
  });

  it('connect.step.ide_cursor_setup takes no params and resolves in both langs', () => {
    expect(getMessage('connect.step.ide_cursor_setup', 'en').length).toBeGreaterThan(0);
    expect(getMessage('connect.step.ide_cursor_setup', 'tr').length).toBeGreaterThan(0);
  });

  it('connect.step.ide_terminal_guidance takes no params and resolves in both langs', () => {
    expect(getMessage('connect.step.ide_terminal_guidance', 'en').length).toBeGreaterThan(0);
    expect(getMessage('connect.step.ide_terminal_guidance', 'tr').length).toBeGreaterThan(0);
  });

  it('connect.step.wsl_recommended interpolates {shell}', () => {
    expect(getMessage('connect.step.wsl_recommended', 'en', { shell: 'powershell' })).toContain('powershell');
    expect(getMessage('connect.step.wsl_recommended', 'tr', { shell: 'powershell' })).toContain('powershell');
  });

  it('every connect.step.* key genuinely differs between en and tr', () => {
    const keys = [
      'connect.step.install_cli',
      'connect.step.login',
      'connect.step.mcp_unsupported',
      'connect.step.attach_mcp',
      'connect.step.ide_cursor_setup',
      'connect.step.ide_terminal_guidance',
      'connect.step.wsl_recommended',
    ] as const;
    for (const key of keys) {
      expect(getMessage(key, 'en'), key).not.toBe(getMessage(key, 'tr'));
    }
  });
});

// ─── no-collision + fallback-contract regression ──────────────────────────

describe('getMessage fallback behavior: unaffected by the new round-6 keys (no collision)', () => {
  it('a pre-existing, unrelated key still resolves exactly as before', () => {
    expect(getMessage('health.unknown', 'en')).toBe('unknown');
    expect(getMessage('health.unknown', 'tr')).toBe('bilinmiyor');
  });

  it('a genuinely unknown key still echoes the key itself (fallback contract intact)', () => {
    const unknownKey = 'live_footer.this_key_does_not_exist_xyz';
    expect(getMessage(unknownKey, 'en')).toBe(unknownKey);
    expect(getMessage(unknownKey, 'tr')).toBe(unknownKey);
  });

  it('an unsupported lang falls back to the en template, not a crash', () => {
    expect(getMessage('connect.step.ide_cursor_setup', 'fr')).toBe(getMessage('connect.step.ide_cursor_setup', 'en'));
  });
});
