import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_GREP_MAX_FILE_BYTES,
  DEFAULT_GREP_MAX_SKIP_NOTES,
  formatGrepOutput,
  readBoundedTextFile,
  scanFileForGrep,
  splitGrepLines,
} from '../../src/cli/repl/native-grep.js';

describe('native-grep line splitting', () => {
  it('normalizes CRLF and legacy CR to logical lines', () => {
    expect(splitGrepLines('a\r\nb\rc')).toEqual(['a', 'b', 'c']);
  });
});

describe('readBoundedTextFile', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'native-grep-read-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('rejects files larger than the byte limit without full allocation', () => {
    writeFileSync(join(root, 'huge.bin'), Buffer.alloc(DEFAULT_GREP_MAX_FILE_BYTES + 1, 97));
    const read = readBoundedTextFile(join(root, 'huge.bin'), DEFAULT_GREP_MAX_FILE_BYTES);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.kind).toBe('too-large');
  });
});

describe('scanFileForGrep', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'native-grep-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds a match in a 1.2MB file with 12–20KB lines and elides the preview', () => {
    const lines: string[] = [];
    let bytes = 0;
    const targetLine = 42;
    while (bytes < 1_200_000) {
      const idx = lines.length + 1;
      const line = idx === targetLine
        ? `TARGET-NEEDLE ${'x'.repeat(18_000)}`
        : `filler-${idx} ${'y'.repeat(14_000)}`;
      lines.push(line);
      bytes += Buffer.byteLength(line, 'utf8') + 1;
    }
    writeFileSync(join(root, 'big.txt'), lines.join('\n') + '\n', 'utf8');
    const re = /TARGET-NEEDLE/;
    const result = scanFileForGrep({
      fileAbs: join(root, 'big.txt'),
      rel: 'big.txt',
      re,
      maxBytesPerLine: 2048,
      maxFileBytes: DEFAULT_GREP_MAX_FILE_BYTES,
    });
    expect(result.skipped).toBeNull();
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({ line: targetLine });
    expect(result.hits[0]!.text).toContain('TARGET-NEEDLE');
    expect(result.hits[0]!.text).toContain('bytes elided');
    expect(Buffer.byteLength(result.hits[0]!.text, 'utf8')).toBeLessThanOrEqual(2048);
  });

  it('stops collecting inside the scanner when maxHitsRemaining is reached', () => {
    const lines = Array.from({ length: 10_000 }, (_, i) => `MATCH-${i + 1}`);
    writeFileSync(join(root, 'many.txt'), `${lines.join('\n')}\n`, 'utf8');
    const result = scanFileForGrep({
      fileAbs: join(root, 'many.txt'),
      rel: 'many.txt',
      re: /MATCH-/,
      maxBytesPerLine: 2048,
      maxFileBytes: DEFAULT_GREP_MAX_FILE_BYTES,
      maxHitsRemaining: 12,
    });
    expect(result.hits).toHaveLength(12);
    expect(result.hitCapReached).toBe(true);
  });

  it('reports too-large instead of silent skip', () => {
    writeFileSync(join(root, 'huge.bin'), Buffer.alloc(DEFAULT_GREP_MAX_FILE_BYTES + 1, 97));
    const result = scanFileForGrep({
      fileAbs: join(root, 'huge.bin'),
      rel: 'huge.bin',
      re: /a/,
      maxBytesPerLine: 2048,
      maxFileBytes: DEFAULT_GREP_MAX_FILE_BYTES,
    });
    expect(result.hits).toHaveLength(0);
    expect(result.skipped?.kind).toBe('too-large');
  });

  it('reports binary instead of no-match', () => {
    writeFileSync(join(root, 'bin.dat'), Buffer.from([0x48, 0x00, 0x65]));
    const result = scanFileForGrep({
      fileAbs: join(root, 'bin.dat'),
      rel: 'bin.dat',
      re: /H/,
      maxBytesPerLine: 2048,
      maxFileBytes: DEFAULT_GREP_MAX_FILE_BYTES,
    });
    expect(result.skipped?.kind).toBe('binary');
  });

  it('reports read-error for missing files', () => {
    const result = scanFileForGrep({
      fileAbs: join(root, 'missing.txt'),
      rel: 'missing.txt',
      re: /x/,
      maxBytesPerLine: 2048,
      maxFileBytes: DEFAULT_GREP_MAX_FILE_BYTES,
    });
    expect(result.skipped?.kind).toBe('read-error');
  });
});

describe('formatGrepOutput', () => {
  it('never claims no matches when files were skipped', () => {
    const out = formatGrepOutput({
      hits: [],
      skipped: [{ rel: 'big.dat', kind: 'too-large', detail: '999 bytes > limit 1' }],
      filesScanned: 0,
      capped: false,
    });
    expect(out).toContain('not fully scanned');
    expect(out).not.toBe('[deckent] no matches');
  });

  it('emits typed skip reasons even when there are zero hits', () => {
    const out = formatGrepOutput({
      hits: [],
      skipped: [
        { rel: 'a.bin', kind: 'binary', detail: 'contains NUL byte' },
        { rel: 'b.dat', kind: 'too-large', detail: '999 bytes > limit 1' },
        { rel: 'c.txt', kind: 'read-error', detail: 'read failed' },
      ],
      filesScanned: 0,
      capped: false,
    });
    expect(out).toContain('skipped a.bin (binary: contains NUL byte)');
    expect(out).toContain('skipped b.dat (too-large:');
    expect(out).toContain('skipped c.txt (read-error: read failed)');
  });

  it('elides excess skipped-file notes while keeping counts honest', () => {
    const skipped = Array.from({ length: DEFAULT_GREP_MAX_SKIP_NOTES + 5 }, (_, i) => ({
      rel: `file-${i}.txt`,
      kind: 'read-error' as const,
      detail: 'read failed',
    }));
    const out = formatGrepOutput({
      hits: [],
      skipped,
      filesScanned: 0,
      capped: false,
    });
    expect(out).toContain('5 additional skipped file(s) elided');
    expect(out).toContain('file-0.txt');
    expect(out).not.toContain(`file-${DEFAULT_GREP_MAX_SKIP_NOTES + 4}.txt`);
  });

  it('includes cap metadata when hits exist but output was truncated', () => {
    const out = formatGrepOutput({
      hits: [{ rel: 'a.txt', line: 1, text: 'x' }],
      skipped: [],
      filesScanned: 1,
      capped: true,
    });
    expect(out).toContain('truncated (200 hits cap)');
  });
});
