import { describe, it, expect, vi } from 'vitest';
import { createPromptRegion } from '../../src/cli/commands/chat-render-region.js';

// born-540 — writeAbove full-region clear (RENDER-REGION-CLEAR, task 388-006).
// Regression: writeAbove used to clear only the single terminal row the cursor
// was sitting on (`clearLine(out, 0)`). When the pinned `› ` prompt + the
// user's typed buffer soft-wraps across multiple terminal rows, the cursor
// rests on the BOTTOM wrapped row — a single-row clear left the wrap row(s)
// ABOVE it untouched, so stale glyphs from the previous render survived under
// the freshly written block. Hermetic: fake readline interface + fake write
// stream, no real TTY.

function fakeOut(): NodeJS.WriteStream & { writes: string[] } {
  const writes: string[] = [];
  const stream = {
    isTTY: true,
    columns: 80,
    rows: 24,
    write: (chunk: string) => { writes.push(String(chunk)); return true; },
    writes,
  };
  return stream as unknown as NodeJS.WriteStream & { writes: string[] };
}

function fakeRl(rows: number) {
  return {
    setPrompt: vi.fn(),
    prompt: vi.fn(),
    getCursorPos: vi.fn(() => ({ rows, cols: 0 })),
  };
}

describe('createPromptRegion — writeAbove full-region clear (born-540 / 388-006)', () => {
  it('single-row prompt (getCursorPos rows: 0) → clears the region then writes, no spurious cursor-up', () => {
    const out = fakeOut();
    const rl = fakeRl(0);
    const region = createPromptRegion(rl, out, { isTty: true });
    region.writeAbove('cevap');
    const joined = out.writes.join('');
    // No cursor-up escape (\x1b[NA with N>0) — nothing above the cursor to reach.
    expect(joined).not.toMatch(/\x1b\[[1-9]\d*A/);
    // Column reset + full clear-to-end-of-screen precede the new text.
    const colIdx = joined.indexOf('\x1b[1G');
    const clearIdx = joined.indexOf('\x1b[0J');
    const textIdx = joined.indexOf('cevap');
    expect(colIdx).toBeGreaterThanOrEqual(0);
    expect(clearIdx).toBeGreaterThan(colIdx);
    expect(textIdx).toBeGreaterThan(clearIdx);
  });

  it('wrapped multi-row prompt (getCursorPos rows: 2) → moves cursor to the TOP of the region before clearing (full region, not just the current row)', () => {
    const out = fakeOut();
    const rl = fakeRl(2);
    const region = createPromptRegion(rl, out, { isTty: true });
    region.writeAbove('yeni içerik');
    const joined = out.writes.join('');
    const upIdx = joined.indexOf('\x1b[2A');
    const colIdx = joined.indexOf('\x1b[1G');
    const clearIdx = joined.indexOf('\x1b[0J');
    const textIdx = joined.indexOf('yeni içerik');
    // Order proves the WHOLE wrapped region (both rows) is reached and cleared
    // before the new block is written — not merely the bottom row the cursor
    // started on.
    expect(upIdx).toBeGreaterThanOrEqual(0);
    expect(colIdx).toBeGreaterThan(upIdx);
    expect(clearIdx).toBeGreaterThan(colIdx);
    expect(textIdx).toBeGreaterThan(clearIdx);
  });

  it('repeated writeAbove calls each fully re-clear their region — no leftover artifacts carry across calls', () => {
    const out = fakeOut();
    // First render: user had typed a long line that wrapped 3 rows.
    const rl = fakeRl(3);
    const region = createPromptRegion(rl, out, { isTty: true });
    region.writeAbove('birinci satır');
    const firstJoined = out.writes.join('');
    expect(firstJoined).toContain('\x1b[3A');
    expect(firstJoined).toContain('\x1b[0J');

    // Second render: buffer reset (Enter pressed), single-row now.
    out.writes.length = 0;
    (rl.getCursorPos as ReturnType<typeof vi.fn>).mockReturnValue({ rows: 0, cols: 0 });
    region.writeAbove('ikinci satır');
    const secondJoined = out.writes.join('');
    // The second call independently re-clears based on the CURRENT cursor pos
    // (not skipped, not reusing the previous call's clear) — a full-region
    // clear escape precedes the new text every single time.
    expect(secondJoined).not.toMatch(/\x1b\[[1-9]\d*A/);
    expect(secondJoined).toContain('\x1b[0J');
    expect(secondJoined.indexOf('\x1b[0J')).toBeLessThan(secondJoined.indexOf('ikinci satır'));
    // The stale first-render text must not reappear inside the second write.
    expect(secondJoined).not.toContain('birinci satır');
  });

  it('back-compat: rl without getCursorPos (minimal test double) → treated as single-row, does not throw', () => {
    const out = fakeOut();
    const rl = { setPrompt: vi.fn(), prompt: vi.fn() };
    const region = createPromptRegion(rl, out, { isTty: true });
    expect(() => region.writeAbove('merhaba')).not.toThrow();
    const joined = out.writes.join('');
    expect(joined).toContain('merhaba');
    expect(joined).toContain('\x1b[0J');
    expect(rl.prompt).toHaveBeenCalledWith(true);
  });

  it('non-TTY → unaffected passthrough (no clearing escapes at all)', () => {
    const out = fakeOut();
    (out as unknown as { isTTY: boolean }).isTTY = false;
    const rl = fakeRl(2);
    const region = createPromptRegion(rl, out, { isTty: false });
    region.writeAbove('düz metin');
    expect(out.writes.join('')).toBe('düz metin\n');
    expect(rl.getCursorPos).not.toHaveBeenCalled();
  });
});
