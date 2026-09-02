import { describe, it, expect } from 'vitest';
import { renderTurnStatsFooter } from '../../src/cli/commands/chat-native.js';
import { parseStreamJsonLine } from '../../src/cli/commands/chat-session.js';

// Sprint 224 T-224-021 — per-turn stats footer (⏱ elapsed · tokens).

describe('renderTurnStatsFooter (T-224-021)', () => {
  it('elapsed only when usage absent', () => {
    const f = renderTurnStatsFooter(3200);
    expect(f).toContain('⏱');
    expect(f).toContain('3.2s');
    expect(f).not.toContain('tok');
  });

  it('elapsed + token count when usage present', () => {
    const f = renderTurnStatsFooter(3200, { inputTokens: 6000, outputTokens: 240 });
    expect(f).toContain('3.2s');
    expect(f).toContain('240 tok');
  });

  it('formats large token counts as k', () => {
    const f = renderTurnStatsFooter(1000, { inputTokens: 0, outputTokens: 1234 });
    expect(f).toContain('1.2k tok');
  });

  // TERMINAL-TOOLS-003 — dim follows the theme.ts color gate: FORCE_COLOR=1
  // paints it, NO_COLOR / a pipe (vitest workers are not a TTY) keeps it plain.
  it('is dim-wrapped only when the color gate allows it (FORCE_COLOR=1); plain under NO_COLOR / off-TTY', () => {
    const noColor = process.env['NO_COLOR'];
    const forceColor = process.env['FORCE_COLOR'];
    try {
      delete process.env['NO_COLOR'];
      process.env['FORCE_COLOR'] = '1';
      expect(renderTurnStatsFooter(1000)).toMatch(/\x1b\[2m.*\x1b\[0m/);
      delete process.env['FORCE_COLOR'];
      process.env['NO_COLOR'] = '1';
      expect(renderTurnStatsFooter(1000)).not.toMatch(/\x1b\[/);
      delete process.env['NO_COLOR'];
      expect(renderTurnStatsFooter(1000)).not.toMatch(/\x1b\[/); // off-TTY default
    } finally {
      if (noColor === undefined) delete process.env['NO_COLOR']; else process.env['NO_COLOR'] = noColor;
      if (forceColor === undefined) delete process.env['FORCE_COLOR']; else process.env['FORCE_COLOR'] = forceColor;
    }
  });
});

describe('parseStreamJsonLine — usage extraction (T-224-021)', () => {
  it('pulls input/output tokens off the result event', () => {
    const r = parseStreamJsonLine(
      JSON.stringify({ type: 'result', result: 'done', usage: { input_tokens: 6054, output_tokens: 240 } }),
    );
    expect(r.done).toBe(true);
    expect(r.usage).toEqual({ inputTokens: 6054, outputTokens: 240 });
  });

  it('result without usage → usage undefined (footer falls back to time-only)', () => {
    const r = parseStreamJsonLine(JSON.stringify({ type: 'result', result: 'done' }));
    expect(r.done).toBe(true);
    expect(r.usage).toBeUndefined();
  });
});
