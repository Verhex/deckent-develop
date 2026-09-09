// tests/cli/native-read-file-modes.test.ts
// ═══ 7111 — deckent_read_file bounded views: outline / range / search ═══════
// Hermetic tmpdir fixture that reproduces the incident shape: a Markdown file
// with headings, a fenced block containing a fake heading, and a 20 KB table
// line (larger than the 16 KB broker preview cap). Every rendered view must
// (a) fit the budget by construction, (b) elide overlong lines with an explicit
// continuation marker, (c) tell the model exactly where to resume.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import {
  boundLine,
  extractMarkdownHeadings,
  renderOutlineView,
  renderRangeView,
  renderSearchView,
  resolveReadFileBudget,
  resolveReadFileViewRequest,
  splitLines,
} from '../../src/cli/repl/native-read-file.js';
import { DEFAULT_MAX_PREVIEW_BYTES } from '../../src/agent/tool-result-broker.js';

const LONG_LINE = `| id | ${'cell-value-'.repeat(1_800)} |`; // ≈ 20 KB
const FIXTURE = [
  '# Title',
  'intro line',
  '## Section A',
  'alpha needle one',
  '```',
  '# not a heading (fenced)',
  '```',
  '### Sub A.1',
  LONG_LINE,
  'beta needle two',
  '## Section B',
  ...Array.from({ length: 300 }, (_, i) => `row ${i + 1} · payload ${'x'.repeat(40)}`),
  '#### Deep',
  'gamma needle three',
].join('\n') + '\n';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'read-file-modes-'));
  writeFileSync(join(root, 'big.md'), FIXTURE, 'utf-8');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const bytes = (s: string) => Buffer.byteLength(s, 'utf-8');
const read = (args: Record<string, unknown>) => buildNativeToolRegistry({ cwd: () => root }).get('deckent_read_file')!.handler(args);

describe('resolveReadFileBudget', () => {
  it('derives the per-line share from the tool-result cap and clamps overrides', () => {
    expect(resolveReadFileBudget()).toEqual({ maxTotalBytes: DEFAULT_MAX_PREVIEW_BYTES, maxBytesPerLine: DEFAULT_MAX_PREVIEW_BYTES / 8 });
    expect(resolveReadFileBudget({ maxPreviewBytes: 4096 })).toEqual({ maxTotalBytes: 4096, maxBytesPerLine: 512 });
    expect(resolveReadFileBudget({ maxPreviewBytes: 4096, maxBytesPerLine: 10 })).toEqual({ maxTotalBytes: 4096, maxBytesPerLine: 96 });
    expect(resolveReadFileBudget({ maxPreviewBytes: 4096, maxBytesPerLine: 99_999 })).toEqual({ maxTotalBytes: 4096, maxBytesPerLine: 4096 });
  });
});

describe('resolveReadFileViewRequest', () => {
  it('returns null for the legacy argument shapes so they stay byte-identical', () => {
    expect(resolveReadFileViewRequest({ path: 'a' })).toBeNull();
    expect(resolveReadFileViewRequest({ path: 'a', offset: 3, limit: 2 })).toBeNull();
  });
  it('infers search mode from pattern and ignores malformed numbers instead of guessing', () => {
    expect(resolveReadFileViewRequest({ path: 'a', pattern: 'x' })).toMatchObject({ mode: 'search', startLine: 1, maxMatches: 50, context: 0 });
    expect(resolveReadFileViewRequest({ path: 'a', startLine: 'nope', endLine: -4 })).toMatchObject({ mode: 'content', startLine: 1, endLine: null });
    expect(resolveReadFileViewRequest({ path: 'a', mode: 'search', pattern: 'x', context: 99, maxMatches: 9_999 })).toMatchObject({ context: 10, maxMatches: 500 });
  });
});

describe('outline mode', () => {
  it('lists Markdown headings with line numbers outside fenced code, plus size/line/longest-line stats', async () => {
    const result = await read({ path: 'big.md', mode: 'outline' });
    expect(result.ok).toBe(true);
    const [meta, ...rows] = result.output.split('\n');
    expect(meta).toMatch(/^\[deckent\] read_file: mode=outline bytes=\d+ totalLines=313 longestLine=L9:\d+B linesOver=1\(>2048B\) headings=5 shown=1-5 hasMore=false$/);
    expect(rows).toEqual([
      '     1\t# Title',
      '     3\t## Section A',
      '     8\t### Sub A.1',
      '    11\t## Section B',
      '   312\t#### Deep',
    ]);
    expect(bytes(result.output)).toBeLessThanOrEqual(DEFAULT_MAX_PREVIEW_BYTES);
  });

  it('pages headings deterministically under a tiny budget and names the continuation', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `## heading number ${i + 1} with a reasonably long title`);
    const text = `${lines.join('\n')}\n`;
    const budget = resolveReadFileBudget({ maxPreviewBytes: 1024 });
    const first = renderOutlineView(text, { outlineOffset: 1 }, budget);
    expect(bytes(first.output)).toBeLessThanOrEqual(1024);
    expect(first.hasMore).toBe(true);
    expect(first.output).toContain(`nextOutlineOffset=${first.shown + 1}`);
    const second = renderOutlineView(text, { outlineOffset: first.nextOutlineOffset! }, budget);
    expect(second.output.split('\n')[1]).toContain(`heading number ${first.shown + 1} `);
    expect(extractMarkdownHeadings(splitLines(text))).toHaveLength(200);
  });

  it('says so honestly when a file has no headings', () => {
    const view = renderOutlineView('plain\ntext\n', { outlineOffset: 1 }, resolveReadFileBudget());
    expect(view.headings).toBe(0);
    expect(view.output).toContain('note=no-markdown-headings');
  });
});

describe('content mode — byte-bounded line ranges', () => {
  it('elides the 20 KB line behind an explicit marker and keeps the whole result under the cap', async () => {
    const result = await read({ path: 'big.md', startLine: 8, endLine: 10 });
    expect(result.ok).toBe(true);
    expect(bytes(result.output)).toBeLessThanOrEqual(DEFAULT_MAX_PREVIEW_BYTES);
    const [meta, ...rows] = result.output.split('\n');
    expect(meta).toBe('[deckent] read_file: mode=range totalLines=313 range=8-10 returned=3 hasMore=false maxBytesPerLine=2048 elidedLines=1');
    expect(rows[0]).toBe('     8\t### Sub A.1');
    expect(rows[1]).toMatch(/^ {5}9\t\| id \| cell-value-.* \[… \d+ bytes elided; re-read \{startLine: 9, endLine: 9, lineByteOffset: \d+\}\]$/);
    expect(bytes(rows[1]!.slice(rows[1]!.indexOf('\t') + 1))).toBeLessThanOrEqual(2048);
    expect(rows[2]).toBe('    10\tbeta needle two');
  });

  it('continues an elided line from the named lineByteOffset and reaches its end', async () => {
    const first = await read({ path: 'big.md', startLine: 9, endLine: 9 });
    const marker = /lineByteOffset: (\d+)\}/.exec(first.output);
    expect(marker).not.toBeNull();
    let offset = Number(marker![1]);
    let hops = 1;
    let reachedEnd = false;
    while (hops < 32) {
      const next = await read({ path: 'big.md', startLine: 9, endLine: 9, lineByteOffset: offset, maxBytesPerLine: 8_000 });
      expect(bytes(next.output)).toBeLessThanOrEqual(DEFAULT_MAX_PREVIEW_BYTES);
      expect(next.output).toContain(`[… ${offset} bytes before lineByteOffset]`);
      const again = /lineByteOffset: (\d+)\}/.exec(next.output);
      hops++;
      if (again === null) { reachedEnd = true; expect(next.output.trimEnd().endsWith('|')).toBe(true); break; }
      expect(Number(again[1])).toBeGreaterThan(offset);
      offset = Number(again[1]);
    }
    expect(reachedEnd).toBe(true);
    expect(hops).toBeLessThanOrEqual(5);
  });

  it('stops at the byte budget with hasMore + nextStartLine instead of truncating silently', () => {
    const text = `${Array.from({ length: 500 }, (_, i) => `line ${i + 1} ${'y'.repeat(60)}`).join('\n')}\n`;
    const budget = resolveReadFileBudget({ maxPreviewBytes: 2048 });
    const view = renderRangeView(text, { startLine: 1, endLine: null, lineByteOffset: 0 }, budget);
    expect(bytes(view.output)).toBeLessThanOrEqual(2048);
    expect(view.hasMore).toBe(true);
    expect(view.nextStartLine).toBe(view.returned + 1);
    expect(view.output).toContain(`nextStartLine=${view.returned + 1}`);
    const rest = renderRangeView(text, { startLine: view.nextStartLine!, endLine: null, lineByteOffset: 0 }, budget);
    expect(rest.output.split('\n')[1]).toContain(`line ${view.returned + 1} `);
  });

  it('answers an out-of-range start honestly (empty range, never clamped)', () => {
    const view = renderRangeView('a\nb\n', { startLine: 50, endLine: null, lineByteOffset: 0 }, resolveReadFileBudget());
    expect(view).toMatchObject({ returned: 0, hasMore: false, totalLines: 2 });
    expect(view.output).toBe('[deckent] read_file: mode=range totalLines=2 range=empty returned=0 hasMore=false maxBytesPerLine=2048 elidedLines=0 requestedStartLine=50');
  });

  it('boundLine never splits a multi-byte character and respects the per-line budget exactly', () => {
    const line = 'ğüşiöç'.repeat(400);
    const bounded = boundLine(line, 7, 0, 200);
    expect(bytes(bounded.text)).toBeLessThanOrEqual(200);
    expect(bounded.text).not.toContain('�');
    expect(bounded.elidedBytes).toBeGreaterThan(0);
    expect(boundLine('short', 1, 0, 200)).toEqual({ text: 'short', elidedBytes: 0 });
    expect(boundLine('short', 1, 99, 200).text).toBe('[… line 1 has 5 bytes; lineByteOffset 99 is past its end]');
  });
});

describe('search mode', () => {
  it('returns grep -n style hits with bounded context and honest counts', async () => {
    const result = await read({ path: 'big.md', pattern: 'needle', context: 1 });
    expect(result.ok).toBe(true);
    const [meta, ...rows] = result.output.split('\n');
    expect(meta).toBe('[deckent] read_file: mode=search pattern="needle" totalLines=313 matches=3 shown=3 context=1 hasMore=false maxBytesPerLine=2048');
    expect(rows[0]).toBe('     3-\t## Section A');
    expect(rows[1]).toBe('     4:\talpha needle one');
    expect(rows[2]).toBe('     5-\t```');
    expect(rows).toContain('--');
    expect(rows.some((r) => r.startsWith('     9-\t| id |') && r.includes('bytes elided'))).toBe(true);
    expect(rows).toContain('    10:\tbeta needle two');
    expect(rows).toContain('   313:\tgamma needle three');
    expect(bytes(result.output)).toBeLessThanOrEqual(DEFAULT_MAX_PREVIEW_BYTES);
  });

  it('supports literal + ignoreCase, caps matches and names the resume line', () => {
    const text = `${Array.from({ length: 120 }, (_, i) => `Row.${i + 1} needle`).join('\n')}\n`;
    const budget = resolveReadFileBudget();
    const capped = renderSearchView(text, { pattern: 'row.', literal: true, ignoreCase: true, context: 0, maxMatches: 10, startLine: 1, lineByteOffset: 0 }, budget);
    expect(capped).toMatchObject({ shown: 10, hasMore: true, nextStartLine: 11 });
    expect(capped.output).toContain('matches=11+ shown=10');
    const resumed = renderSearchView(text, { pattern: 'row.', literal: true, ignoreCase: true, context: 0, maxMatches: 500, startLine: capped.nextStartLine!, lineByteOffset: 0 }, budget);
    expect(resumed).toMatchObject({ shown: 110, hasMore: false });
    const regexLiteral = renderSearchView(text, { pattern: 'row.', literal: false, ignoreCase: false, context: 0, maxMatches: 500, startLine: 1, lineByteOffset: 0 }, budget);
    expect(regexLiteral.matches).toBe(0);
  });

  it('reports an invalid regular expression instead of throwing', async () => {
    const result = await read({ path: 'big.md', pattern: '(' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('error=invalid-pattern');
  });

  it('stays under the byte budget with many matches', () => {
    const text = `${Array.from({ length: 2000 }, (_, i) => `hit ${i} ${'z'.repeat(50)}`).join('\n')}\n`;
    const view = renderSearchView(text, { pattern: 'hit', literal: false, ignoreCase: false, context: 2, maxMatches: 500, startLine: 1, lineByteOffset: 0 }, resolveReadFileBudget({ maxPreviewBytes: 3000 }));
    expect(bytes(view.output)).toBeLessThanOrEqual(3000);
    expect(view.hasMore).toBe(true);
    expect(view.nextStartLine).toBe(view.shown + 1);
  });
});

describe('registry wiring', () => {
  it('keeps deckent_read_file silent-tier + core exposure and advertises the views in its schema', () => {
    const def = buildNativeToolRegistry({ cwd: () => root }).get('deckent_read_file')!;
    expect(def.tier).toBe('silent');
    expect(def.exposure).toBe('core');
    const properties = def.inputSchema['properties'] as Record<string, unknown>;
    for (const key of ['mode', 'startLine', 'endLine', 'maxBytesPerLine', 'lineByteOffset', 'outlineOffset', 'pattern', 'literal', 'ignoreCase', 'context', 'maxMatches', 'offset', 'limit']) {
      expect(properties, key).toHaveProperty(key);
    }
    expect(def.description).toContain('mode outline');
  });

  it('honours a caller-supplied readFile budget', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => root, readFile: { maxPreviewBytes: 2048, maxBytesPerLine: 128 } });
    const result = await reg.get('deckent_read_file')!.handler({ path: 'big.md', startLine: 1, endLine: 313 });
    expect(bytes(result.output)).toBeLessThanOrEqual(2048);
    expect(result.output).toContain('maxBytesPerLine=128');
    expect(result.output).toContain('hasMore=true');
  });

  it('keeps the legacy full read and ranged read byte-identical', async () => {
    writeFileSync(join(root, 'small.txt'), 'a\nb\nc\n');
    expect(await read({ path: 'small.txt' })).toEqual({ ok: true, output: 'a\nb\nc\n' });
    expect((await read({ path: 'small.txt', offset: 2, limit: 1 })).output).toBe('[deckent] read_file: totalLines=3 range=2-2 returned=1 hasMore=true nextOffset=3\n     2\tb');
  });

  it('keeps the dispatcher containment as the single gate', async () => {
    const result = await read({ path: '../escape.md', mode: 'outline' });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('[mcp-error]');
  });
});
