import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { expandAtRefs } from '../../src/cli/repl/at-ref.js';
import { deriveAtRefExpansionBudgetChars } from '../../src/cli/repl/app.js';

const readerFor = (files: Readonly<Record<string, string>>) => (path: string): string | null =>
  Object.prototype.hasOwnProperty.call(files, path) ? (files[path] as string) : null;

describe('expandAtRefs — budget-aware inline/descriptor decision', () => {
  it('keeps a small single reference inline with full typed lineage', () => {
    const content = 'first\nsecond';
    const result = expandAtRefs('read @small.txt', readerFor({ 'small.txt': content }), {
      expansionBudgetChars: content.length,
    });

    expect(result.prompt).toBe('read @small.txt\n\n[@ref] small.txt:\n```\nfirst\nsecond\n```');
    expect(result.refs).toEqual([{
      path: 'small.txt', ok: true, truncated: false, mode: 'inline',
      digest: createHash('sha256').update(content).digest('hex'),
      bytes: Buffer.byteLength(content), lines: 2,
    }]);
  });

  it('uses a lossless descriptor when the full reference exceeds the budget', () => {
    const content = '€\nbody';
    const digest = createHash('sha256').update(content).digest('hex');
    const result = expandAtRefs('read @large.md', readerFor({ 'large.md': content }), {
      expansionBudgetChars: content.length - 1,
    });

    expect(result.prompt).toContain(`[@ref-descriptor] large.md — ${Buffer.byteLength(content)} bytes, 2 lines, sha256:${digest.slice(0, 12)}`);
    expect(result.prompt).not.toContain('\nbody\n');
    expect(result.refs).toEqual([{
      path: 'large.md', ok: true, truncated: false, mode: 'descriptor',
      digest, bytes: Buffer.byteLength(content), lines: 2,
    }]);
  });

  it('admits references in order and descriptors the first one that no longer fits', () => {
    const files = { 'one.txt': '12345', 'two.txt': 'abcdef' };
    const result = expandAtRefs('compare @one.txt @two.txt', readerFor(files), {
      expansionBudgetChars: 5,
    });

    expect(result.refs.map(({ path, mode }) => ({ path, mode }))).toEqual([
      { path: 'one.txt', mode: 'inline' },
      { path: 'two.txt', mode: 'descriptor' },
    ]);
    expect(result.prompt).toContain('\n12345\n');
    expect(result.prompt).not.toContain('\nabcdef\n');
  });

  it('preserves the exact legacy prompt when no budget is supplied', () => {
    const result = expandAtRefs('explain @a.ts', readerFor({ 'a.ts': 'const x = 1;' }));
    expect(result.prompt).toBe('explain @a.ts\n\n[@ref] a.ts:\n```\nconst x = 1;\n```');
  });

  it('proves the incident shape: 3 x ~50K refs with ~120K budget descriptors the remainder', () => {
    const files = {
      'a.md': 'a'.repeat(50_000),
      'b.md': 'b'.repeat(50_000),
      'c.md': 'c'.repeat(50_000),
    };
    const result = expandAtRefs('@a.md @b.md @c.md', readerFor(files), { expansionBudgetChars: 120_000 });

    expect(result.refs.map((ref) => ref.mode)).toEqual(['inline', 'inline', 'descriptor']);
    expect(result.prompt).toContain('[@ref-descriptor] c.md — 50000 bytes, 1 lines');
  });
});

describe('deriveAtRefExpansionBudgetChars', () => {
  it('subtracts output, safety, and transcript reservations before taking a conservative share', () => {
    expect(deriveAtRefExpansionBudgetChars(() => 131_000, 0)).toBe(124_500);
    expect(deriveAtRefExpansionBudgetChars(() => 131_000, 13_500)).toBe(117_750);
  });

  it('preserves legacy inline behavior when authority is absent or throws', () => {
    expect(deriveAtRefExpansionBudgetChars(undefined, 0)).toBeUndefined();
    expect(deriveAtRefExpansionBudgetChars(() => { throw new Error('unavailable'); }, 0)).toBeUndefined();
  });
});
