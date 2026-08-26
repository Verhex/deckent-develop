import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderBanner, type BannerContext } from '../../src/cli/commands/chat-banner.js';
import { renderStatusLine, type StatusLineContext } from "../../src/cli/commands/chat-status-line.js";

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

// WIRE-014: physically merged from tests/cli/repl-status-line-wire.test.ts.
{
// ─── Helpers ────────────────────────────────────────────────────────
function ctx(overrides: Partial<StatusLineContext> = {}): StatusLineContext {
    return {
        provider: 'claude',
        dir: '/workspace',
        activeSprint: null,
        ...overrides,
    };
}

// ─── Tests ──────────────────────────────────────────────────────────
describe('renderStatusLine — status-line wire (222-006)', () => {
    it('renders status line with provider and dir by default (undefined config)', () => {
        const result = renderStatusLine(ctx(), undefined);
        expect(result).toContain('claude');
        expect(result).toContain('/workspace');
        expect(result.length).toBeGreaterThan(0);
    });
    it('reflects the provider name in the rendered output', () => {
        const resultClaude = renderStatusLine(ctx({ provider: 'claude' }), undefined);
        const resultOllama = renderStatusLine(ctx({ provider: 'ollama' }), undefined);
        expect(resultClaude).toContain('claude');
        expect(resultOllama).toContain('ollama');
    });
    it('returns empty string when status_line config is false (config-kapalı→yok)', () => {
        const result = renderStatusLine(ctx(), false);
        expect(result).toBe('');
    });
    it('shows dir correctly when status_line is true', () => {
        const result = renderStatusLine(ctx({ dir: '/home/user/myproject' }), true);
        expect(result).toContain('/home/user/myproject');
    });
    it('includes active sprint when present', () => {
        const result = renderStatusLine(ctx({ activeSprint: 'sprint-222' }), undefined);
        expect(result).toContain('sprint-222');
    });
    it('omits sprint when activeSprint is null', () => {
        const result = renderStatusLine(ctx({ activeSprint: null }), undefined);
        expect(result).not.toContain('sprint-');
        expect(result).toContain('claude');
    });
});
}
