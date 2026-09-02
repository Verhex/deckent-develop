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

  it('contains ANSI escape codes when tty=true', () => {
    const output = renderBanner(BASE_CTX, true, HINT);
    expect(output).toContain('\x1b[');
  });

  it('contains no ANSI escape codes when tty=false', () => {
    const output = renderBanner(BASE_CTX, false, HINT);
    expect(output).not.toContain('\x1b[');
  });
});
