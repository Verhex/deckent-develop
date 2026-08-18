// tests/cli/native-read-ranged.test.ts
// ═══ 562-002 — deckent_read_file ranged read {path, offset?, limit?} ═════════
// Hermetic tmpdir project, real dispatcher (no mocks): the registry handler must
// (a) leave the DEFAULT single-shot read byte-identical, (b) return an exact
// cat -n numbered slice with a totalLines/range meta line, (c) keep the
// dispatcher's path containment as the single gate, and (d) cover a 5,000-line
// file — comfortably past the tool-result broker's 16KB preview cap — in three
// slices whose union is the whole file.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildNativeToolRegistry,
  resolveReadFileRange,
  renderRangedRead,
  splitFileLines,
} from '../../src/cli/repl/native-tool-registry.js';

let root: string;
const SMALL = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
/** ~21 bytes/line × 5000 ⇒ ~100KB, i.e. > DEFAULT_MAX_PREVIEW_BYTES (16KB), so the
 *  broker truncates and the ranged path must go through the content-store capture. */
const BIG = Array.from({ length: 5000 }, (_, i) => `line-${i + 1}-${'x'.repeat(10)}`);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'native-read-ranged-'));
  writeFileSync(join(root, 'small.txt'), `${SMALL.join('\n')}\n`, 'utf-8');
  writeFileSync(join(root, 'big.txt'), `${BIG.join('\n')}\n`, 'utf-8');
  writeFileSync(join(root, 'exact.txt'), 'HELLO', 'utf-8');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const read = async (args: Record<string, unknown>) =>
  buildNativeToolRegistry({ cwd: () => root }).get('deckent_read_file')!.handler(args);

/** Strips the meta line and the cat -n gutter, giving back the raw file lines. */
function recoverLines(output: string): string[] {
  const [meta, ...body] = output.split('\n');
  expect(meta).toMatch(/^\[deckent\] read_file: totalLines=/);
  return body.map((l) => l.slice(l.indexOf('\t') + 1));
}

describe('562-002 — default read behaviour is untouched', () => {
  it('returns the raw content byte-identically when neither offset nor limit is given', async () => {
    expect(await read({ path: 'exact.txt' })).toEqual({ ok: true, output: 'HELLO' });
    expect(await read({ path: 'small.txt' })).toEqual({ ok: true, output: `${SMALL.join('\n')}\n` });
  });

  it('degrades a malformed offset/limit to the default full read instead of guessing a slice', async () => {
    for (const args of [{ offset: 0 }, { offset: -3 }, { limit: 0 }, { offset: 'abc' }, { limit: null }]) {
      const r = await read({ path: 'small.txt', ...args });
      expect(r, JSON.stringify(args)).toEqual({ ok: true, output: `${SMALL.join('\n')}\n` });
    }
  });

  it('an oversized default read stays honestly truncated AND now reports totalLines', async () => {
    const r = await read({ path: 'big.txt' });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('[deckent] tool-result truncated:');
    expect(r.output).toContain('[deckent] read_file: totalLines=5000;');
    expect(r.output.startsWith(BIG[0]!)).toBe(true);
  });
});

describe('562-002 — ranged read: numbered slice + totalLines/range meta', () => {
  it('returns exactly the requested window, cat -n numbered, with a meta line', async () => {
    const r = await read({ path: 'small.txt', offset: 2, limit: 2 });
    expect(r.ok).toBe(true);
    expect(r.output).toBe(
      '[deckent] read_file: totalLines=5 range=2-3 returned=2 hasMore=true nextOffset=4\n' +
      '     2\tbeta\n' +
      '     3\tgamma',
    );
  });

  it('offset alone reads to EOF and reports hasMore=false', async () => {
    const r = await read({ path: 'small.txt', offset: 4 });
    expect(r.output.split('\n')[0]).toBe('[deckent] read_file: totalLines=5 range=4-5 returned=2 hasMore=false');
    expect(recoverLines(r.output)).toEqual(['delta', 'epsilon']);
  });

  it('limit alone starts at line 1', async () => {
    const r = await read({ path: 'small.txt', limit: 2 });
    expect(r.output.split('\n')[0]).toBe('[deckent] read_file: totalLines=5 range=1-2 returned=2 hasMore=true nextOffset=3');
    expect(recoverLines(r.output)).toEqual(['alpha', 'beta']);
  });

  it('an out-of-range offset is an honest empty result plus meta, never a clamped slice', async () => {
    const r = await read({ path: 'small.txt', offset: 99, limit: 10 });
    expect(r.ok).toBe(true);
    expect(r.output).toBe('[deckent] read_file: totalLines=5 range=empty returned=0 hasMore=false requestedOffset=99');
  });
});

describe('562-002 — containment is unchanged (the dispatcher stays the single gate)', () => {
  it('refuses an out-of-scope path in ranged mode exactly as in default mode', async () => {
    const ranged = await read({ path: '../escape.txt', offset: 1, limit: 5 });
    expect(ranged.ok).toBe(false);
    expect(ranged.output).toMatch(/mcp-error|scope/);
    const plain = await read({ path: '../escape.txt' });
    expect(plain.ok).toBe(false);
    expect(plain.output).toMatch(/mcp-error|scope/);
  });

  it('reports a missing file honestly in ranged mode', async () => {
    const r = await read({ path: 'nope.txt', offset: 1, limit: 5 });
    expect(r.ok).toBe(false);
    expect(r.output).toContain('[mcp-error]');
  });
});

describe('562-002 — slice-union proof over a 5,000-line file', () => {
  it('three slices cover the file completely and their union equals the whole file', async () => {
    const first = await read({ path: 'big.txt', offset: 1, limit: 1667 });
    const second = await read({ path: 'big.txt', offset: 1668, limit: 1667 });
    const third = await read({ path: 'big.txt', offset: 3335, limit: 1667 });

    expect(first.output.split('\n')[0]).toBe(
      '[deckent] read_file: totalLines=5000 range=1-1667 returned=1667 hasMore=true nextOffset=1668',
    );
    expect(second.output.split('\n')[0]).toBe(
      '[deckent] read_file: totalLines=5000 range=1668-3334 returned=1667 hasMore=true nextOffset=3335',
    );
    expect(third.output.split('\n')[0]).toBe(
      '[deckent] read_file: totalLines=5000 range=3335-5000 returned=1666 hasMore=false',
    );

    const union = [...recoverLines(first.output), ...recoverLines(second.output), ...recoverLines(third.output)];
    expect(union.length).toBe(5000);
    expect(union).toEqual(BIG);
    // numbering is absolute, not slice-relative
    expect(second.output.split('\n')[1]).toBe(`  1668\t${BIG[1667]!}`);
  });
});

describe('562-002 — pure seams', () => {
  it('resolveReadFileRange: null means "default full read"', () => {
    expect(resolveReadFileRange({ path: 'x' })).toBeNull();
    expect(resolveReadFileRange({ offset: 0, limit: -1 })).toBeNull();
    expect(resolveReadFileRange({ offset: 7 })).toEqual({ offset: 7, limit: null });
    expect(resolveReadFileRange({ limit: 3 })).toEqual({ offset: 1, limit: 3 });
    expect(resolveReadFileRange({ offset: 2.9, limit: 4.9 })).toEqual({ offset: 2, limit: 4 });
  });

  it('splitFileLines: a trailing newline terminates the last line, empty file has zero lines', () => {
    expect(splitFileLines('')).toEqual([]);
    expect(splitFileLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitFileLines('a\nb')).toEqual(['a', 'b']);
    expect(splitFileLines('a\n\n')).toEqual(['a', '']);
  });

  it('renderRangedRead: reports totalLines/returned/hasMore for the requested window', () => {
    const view = renderRangedRead('a\nb\nc\n', { offset: 2, limit: 1 });
    expect(view).toEqual({
      output: '[deckent] read_file: totalLines=3 range=2-2 returned=1 hasMore=true nextOffset=3\n     2\tb',
      totalLines: 3,
      returned: 1,
      hasMore: true,
    });
  });
});
