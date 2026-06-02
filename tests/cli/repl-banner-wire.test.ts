import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderBanner, type BannerContext } from '../../src/cli/commands/chat-banner.js';

const ENTRY_SRC = readFileSync('src/cli/entry.ts', 'utf-8');

describe('repl-banner-wire — entry.ts wires renderBanner', () => {
  it('entry.ts imports renderBanner from chat-banner', () => {
    expect(ENTRY_SRC).toMatch(/import\s*\{[^}]*renderBanner[^}]*\}\s*from.*chat-banner/);
  });

  it('entry.ts calls renderBanner (wire present)', () => {
    expect(ENTRY_SRC).toMatch(/renderBanner\s*\(/);
  });
});

describe('repl-banner-wire — renderBanner behaviour in REPL boot context', () => {
  const ctx: BannerContext = { provider: 'claude', dir: '/home/user/project' };

  it('returns non-empty banner string when TTY=true (banner is rendered)', () => {
    const out = renderBanner(ctx, true);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('deckent');
  });

  it('returns empty string when TTY=false (TTY-only, pipe context suppressed)', () => {
    const out = renderBanner(ctx, false);
    expect(out).toBe('');
  });

  it('reflects the active provider name in banner output', () => {
    const geminiCtx: BannerContext = { provider: 'gemini', dir: '/tmp/proj' };
    const out = renderBanner(geminiCtx, true);
    expect(out).toContain('gemini');
  });
});
