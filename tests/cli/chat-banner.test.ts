import { describe, it, expect } from 'vitest';
import { renderBanner, type BannerContext } from '../../src/cli/commands/chat-banner.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const BASE_CTX: BannerContext = { provider: 'claude', dir: '/home/user/project' };
// TERMINAL-TOOLS-001: renderBanner is string-free — the hint is a required
// injected label (entry.ts resolves `tui.banner.hint` for the session language).
const HINT = getMessage('tui.banner.hint', 'en');

describe('renderBanner', () => {
  it('renders banner with deckent name and provider when tty=true', () => {
    const output = renderBanner(BASE_CTX, true, HINT);
    expect(output).toContain('deckent');
    expect(output).toContain('claude');
  });

  it('includes /help hint in banner output', () => {
    const output = renderBanner(BASE_CTX, true, HINT);
    expect(output).toContain('/help');
  });

  it('reflects the provided provider name in output', () => {
    const ctx: BannerContext = { provider: 'ollama', dir: '/tmp/project' };
    const output = renderBanner(ctx, true, HINT);
    expect(output).toContain('ollama');
    expect(output).not.toContain('claude');
  });

  it('returns empty string when tty=false (pipe/non-TTY context)', () => {
    const output = renderBanner(BASE_CTX, false, HINT);
    expect(output).toBe('');
  });

  it('includes dir in banner output', () => {
    const ctx: BannerContext = { provider: 'gemini', dir: '/workspace/myapp' };
    const output = renderBanner(ctx, true, HINT);
    expect(output).toContain('/workspace/myapp');
  });

  // TERMINAL-TOOLS-003 — color follows the theme.ts SSOT gate, not `tty`:
  // FORCE_COLOR=1 paints even off-TTY (vitest workers are piped); NO_COLOR and
  // TERM=dumb keep the banner plain while still printing it.
  it('contains ANSI escape codes when tty=true and the color gate allows it (FORCE_COLOR=1)', () => {
    const saved = { NO_COLOR: process.env['NO_COLOR'], FORCE_COLOR: process.env['FORCE_COLOR'], TERM: process.env['TERM'] };
    const restore = (): void => {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    };
    try {
      delete process.env['NO_COLOR'];
      process.env['FORCE_COLOR'] = '1';
      expect(renderBanner(BASE_CTX, true, HINT)).toContain('\x1b[');
      delete process.env['FORCE_COLOR'];
      process.env['NO_COLOR'] = '1';
      const plain = renderBanner(BASE_CTX, true, HINT);
      expect(plain).not.toContain('\x1b[');
      expect(plain).toContain('deckent');
      delete process.env['NO_COLOR'];
      process.env['TERM'] = 'dumb';
      expect(renderBanner(BASE_CTX, true, HINT)).not.toContain('\x1b[');
    } finally {
      restore();
    }
  });

  it('contains no ANSI escape codes when tty=false', () => {
    const output = renderBanner(BASE_CTX, false, HINT);
    expect(output).not.toContain('\x1b[');
  });
});
