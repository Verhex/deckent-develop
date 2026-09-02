// tests/cli/repl/status-row.test.ts
// ═══ TERMINAL-TOOLS-004 — width-aware REPL status row (pure layout) ═════════
//
// Real-binary evidence (2026-09-02, 100×30 PTY): the bottom status row
// `deckent  <provider>  <cwd>` was a flex row of separate <Text> items; with a
// long cwd Ink squeezed the items ("deckentollama" — the two spaces vanished)
// and wrapped the path onto a second, indented line. The row is now laid out
// by fitStatusRow (display cells, never code units) and rendered as ONE text
// node that cannot wrap. Hermetic: pure function, no Ink, no terminal.

import { describe, it, expect } from 'vitest';
import { fitStatusRow, statusRowText, type StatusRowInput } from '../../../src/cli/repl/status-row.js';
import { displayWidth } from '../../../src/cli/repl/cursor-model.js';

const base: StatusRowInput = {
  brand: 'deckent',
  provider: 'ollama',
  cwd: '/tmp/claude-1000/-home-alperen-deckent-dev/b16e1652-dd2c-4091-bc90-7a159e20ed67/scratchpad/probe-project-fresh',
};

describe('fitStatusRow — one line, never wider than the terminal', () => {
  it('fits everything when the terminal is wide enough (byte-identical segments)', () => {
    const row = fitStatusRow({ ...base, cwd: '/work/app', model: 'm1', sessionTok: 1234, approval: 'auto-edit', resumedId: 'abc' }, 200);
    expect(statusRowText(row)).toBe('deckent  ollama · m1  /work/app  · Σ 1234 tok  · »auto-edit  · ↺ abc');
    expect(row.dropped).toEqual([]);
  });

  it('keeps the brand/provider spacing and tail-truncates the cwd with a leading ellipsis at 100 columns', () => {
    const row = fitStatusRow(base, 100);
    const text = statusRowText(row);
    expect(displayWidth(text)).toBeLessThanOrEqual(100);
    expect(text.startsWith('deckent  ollama  …')).toBe(true);
    expect(text.endsWith('/probe-project-fresh')).toBe(true);
    expect(text).not.toContain('\n');
  });

  it('drops optional segments (resumed → tokens → approval → model) before starving the cwd', () => {
    const input: StatusRowInput = { ...base, cwd: '/home/user/projects/deckent-terminal', model: 'claude-fable-5-1', sessionTok: 987654, approval: 'full-auto', resumedId: 'session-1234' };
    const row = fitStatusRow(input, 60);
    expect(displayWidth(statusRowText(row))).toBeLessThanOrEqual(60);
    expect(row.dropped[0]).toBe('resumed');
    // the cwd tail (the informative part) survives
    expect(statusRowText(row)).toContain('deckent-terminal');
  });

  it('never exceeds the column budget for any width from 1 to 160', () => {
    const input: StatusRowInput = { ...base, model: 'gpt-5.6-sol', sessionTok: 42, approval: 'auto-edit', resumedId: 'r1' };
    for (let columns = 1; columns <= 160; columns++) {
      const text = statusRowText(fitStatusRow(input, columns));
      expect(displayWidth(text), `columns=${columns}`).toBeLessThanOrEqual(columns);
      expect(text).not.toContain('\n');
    }
  });

  it('measures in display cells — a CJK / emoji path counts double-width glyphs', () => {
    const row = fitStatusRow({ ...base, cwd: '/проекты/日本語ディレクトリ/😀/deep/very/long/path/segment' }, 40);
    const text = statusRowText(row);
    expect(displayWidth(text)).toBeLessThanOrEqual(40);
    expect(text.length).toBeLessThan(displayWidth(text) + 40); // sanity: cells ≥ code units for wide glyphs
  });

  it('exposes typed segments so the renderer colors roles, not substrings', () => {
    const row = fitStatusRow({ ...base, cwd: '/w', model: 'm' }, 120);
    expect(row.segments.map((s) => s.role)).toEqual(['brand', 'gap', 'provider', 'model', 'gap', 'cwd']);
  });
});
