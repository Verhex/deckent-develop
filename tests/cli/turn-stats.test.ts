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

  it('is dim-wrapped (ANSI)', () => {
    expect(renderTurnStatsFooter(1000)).toMatch(/\x1b\[2m.*\x1b\[0m/);
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
