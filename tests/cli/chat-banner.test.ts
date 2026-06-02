import { describe, it, expect } from 'vitest';
import { renderBanner, type BannerContext } from '../../src/cli/commands/chat-banner.js';

const BASE_CTX: BannerContext = { provider: 'claude', dir: '/home/user/project' };

describe('renderBanner', () => {
  it('renders banner with deckent name and provider when tty=true', () => {
    const output = renderBanner(BASE_CTX, true);
    expect(output).toContain('deckent');
    expect(output).toContain('claude');
  });

  it('includes /help hint in banner output', () => {
    const output = renderBanner(BASE_CTX, true);
    expect(output).toContain('/help');
  });

  it('reflects the provided provider name in output', () => {
    const ctx: BannerContext = { provider: 'ollama', dir: '/tmp/project' };
    const output = renderBanner(ctx, true);
    expect(output).toContain('ollama');
    expect(output).not.toContain('claude');
  });

  it('returns empty string when tty=false (pipe/non-TTY context)', () => {
    const output = renderBanner(BASE_CTX, false);
    expect(output).toBe('');
  });

  it('includes dir in banner output', () => {
    const ctx: BannerContext = { provider: 'gemini', dir: '/workspace/myapp' };
    const output = renderBanner(ctx, true);
    expect(output).toContain('/workspace/myapp');
  });

  it('contains ANSI escape codes when tty=true', () => {
    const output = renderBanner(BASE_CTX, true);
    expect(output).toContain('\x1b[');
  });

  it('contains no ANSI escape codes when tty=false', () => {
    const output = renderBanner(BASE_CTX, false);
    expect(output).not.toContain('\x1b[');
  });
});
