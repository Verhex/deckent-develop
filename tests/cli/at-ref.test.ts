// ═══ at-ref — `@path` REPL file references (TERM-AT-REF 583/N2b) ═════════════
//
// Pure-logic suite for src/cli/repl/at-ref.ts + the input-bar/run wiring seams
// (atMenuMatches, createScopedAtRefReader). No Ink mount — ink-testing-library
// is not a project dependency (same precedent as repl-input-bar-menu-submit
// .test.ts / app-surface-wire.test.tsx), so the interactive `@`-menu behavior
// is pinned through the SAME pure helpers the component's key handler and
// render both call. Hermetic: the only fs access is a per-test mkdtemp under
// os.tmpdir() (reader suite), removed in afterEach.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractAtRefs,
  expandAtRefs,
  filterAtPaths,
  activeAtQuery,
  completeAtToken,
  isScopedRelPath,
  createCachedPathLister,
  AT_REF_MAX_REFS,
  AT_REF_MAX_CHARS,
} from '../../src/cli/repl/at-ref.js';
import { atMenuMatches } from '../../src/cli/repl/input-bar.js';
import { createScopedAtRefReader } from '../../src/cli/repl/run.js';

// ─── extractAtRefs ───────────────────────────────────────────────────────────

describe('extractAtRefs — token grammar', () => {
  it('extracts a token at start of text and after whitespace', () => {
    expect(extractAtRefs('@src/a.ts please')).toEqual(['src/a.ts']);
    expect(extractAtRefs('review @src/a.ts and @docs/b.md now')).toEqual(['src/a.ts', 'docs/b.md']);
  });

  it('stops a token at the next whitespace', () => {
    expect(extractAtRefs('@a.ts\t@b.ts\n@c.ts')).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('ignores emails (non-space before the @)', () => {
    expect(extractAtRefs('mail me at alperen@example.com')).toEqual([]);
  });

  it('ignores a literal @@ escape and a bare @', () => {
    expect(extractAtRefs('a @@literal escape')).toEqual([]);
    expect(extractAtRefs('just an @ alone')).toEqual([]);
  });

  it('de-duplicates repeated refs in first-seen order', () => {
    expect(extractAtRefs('@a.ts then @b.ts then @a.ts')).toEqual(['a.ts', 'b.ts']);
  });

  it('no tokens → empty array', () => {
    expect(extractAtRefs('plain message, nothing referenced')).toEqual([]);
  });
});

// ─── expandAtRefs ────────────────────────────────────────────────────────────

describe('expandAtRefs — prompt injection', () => {
  const readerFor = (files: Record<string, string>) => (rel: string): string | null =>
    Object.prototype.hasOwnProperty.call(files, rel) ? (files[rel] as string) : null;

  it('no refs → byte-identical passthrough, empty refs', () => {
    const r = expandAtRefs('hello world', () => 'never called');
    expect(r).toEqual({ prompt: 'hello world', refs: [] });
  });

  it('injects one fenced block per resolved ref, after the user text', () => {
    const r = expandAtRefs('explain @a.ts', readerFor({ 'a.ts': 'const x = 1;' }));
    expect(r.refs).toEqual([{ path: 'a.ts', ok: true, truncated: false }]);
    expect(r.prompt.startsWith('explain @a.ts\n\n')).toBe(true);
    expect(r.prompt).toContain('[@ref] a.ts:\n```\nconst x = 1;\n```');
  });

  it('escalates the fence when the content itself contains ```', () => {
    const content = 'docs:\n```ts\ncode\n```';
    const r = expandAtRefs('see @doc.md', readerFor({ 'doc.md': content }));
    expect(r.prompt).toContain('````\n' + content + '\n````');
  });

  it('caps content at AT_REF_MAX_CHARS with an explicit truncation marker', () => {
    const big = 'x'.repeat(AT_REF_MAX_CHARS + 100);
    const r = expandAtRefs('read @big.txt', readerFor({ 'big.txt': big }));
    expect(r.refs).toEqual([{ path: 'big.txt', ok: true, truncated: true }]);
    expect(r.prompt).toContain(`(truncated at ${AT_REF_MAX_CHARS} chars)`);
    expect(r.prompt).not.toContain(big); // full body never leaks through
    expect(r.prompt).toContain('x'.repeat(AT_REF_MAX_CHARS));
  });

  it('expands at most AT_REF_MAX_REFS refs and NOTES the extras by name', () => {
    const files: Record<string, string> = {};
    const tokens: string[] = [];
    for (let i = 1; i <= AT_REF_MAX_REFS + 2; i++) { files[`f${i}.ts`] = `body ${i}`; tokens.push(`@f${i}.ts`); }
    const r = expandAtRefs(tokens.join(' '), readerFor(files));
    expect(r.refs).toHaveLength(AT_REF_MAX_REFS);
    expect(r.prompt).toContain(`body ${AT_REF_MAX_REFS}`);
    expect(r.prompt).not.toContain(`body ${AT_REF_MAX_REFS + 1}`);
    expect(r.prompt).toContain('2 additional reference(s) not expanded');
    expect(r.prompt).toContain(`f${AT_REF_MAX_REFS + 1}.ts, f${AT_REF_MAX_REFS + 2}.ts`);
  });

  it('notes an unreadable ref honestly instead of dropping it', () => {
    const r = expandAtRefs('see @gone.ts and @a.ts', readerFor({ 'a.ts': 'ok' }));
    expect(r.refs).toEqual([
      { path: 'gone.ts', ok: false, truncated: false },
      { path: 'a.ts', ok: true, truncated: false },
    ]);
    expect(r.prompt).toContain('[@ref] gone.ts — unreadable');
    expect(r.prompt).toContain('[@ref] a.ts:');
  });
});

// ─── filterAtPaths ───────────────────────────────────────────────────────────

describe('filterAtPaths — fuzzy ordering', () => {
  const candidates = [
    'src/cli/repl/input-bar.tsx',
    'src/cli/repl/app.tsx',
    'tests/cli/input-history.test.ts',
    'docs/inputs.md',
    'README.md',
  ];

  it('empty query → first `limit` candidates as provided', () => {
    expect(filterAtPaths(candidates, '', 3)).toEqual(candidates.slice(0, 3));
  });

  it('ranks basename-prefix above path-prefix above substring above subsequence', () => {
    const list = ['a/zzz-input.ts', 'input-bar.ts', 'inp/other.ts', 'x/i-n-p-u-t.ts'];
    expect(filterAtPaths(list, 'inp')).toEqual([
      'input-bar.ts',    // basename prefix (tier 0)
      'inp/other.ts',    // full-path prefix (tier 1)
      'a/zzz-input.ts',  // substring (tier 2)
      'x/i-n-p-u-t.ts',  // subsequence (tier 3)
    ]);
  });

  it('is case-insensitive and excludes non-matches', () => {
    expect(filterAtPaths(candidates, 'README')).toEqual(['README.md']);
    expect(filterAtPaths(candidates, 'zzz-no-match')).toEqual([]);
  });

  it('breaks ties by shorter path, then lexicographic (deterministic)', () => {
    expect(filterAtPaths(['b/aa.ts', 'a/aa.ts', 'aa.ts'], 'aa')).toEqual(['aa.ts', 'a/aa.ts', 'b/aa.ts']);
  });

  it('caps at the limit (default 8)', () => {
    const many = Array.from({ length: 20 }, (_, i) => `file${String(i).padStart(2, '0')}.ts`);
    expect(filterAtPaths(many, 'file')).toHaveLength(8);
    expect(filterAtPaths(many, 'file', 3)).toHaveLength(3);
  });

  it('matches a directory candidate by its basename despite the trailing slash', () => {
    expect(filterAtPaths(['src/cli/repl/', 'src/replies.ts'], 'repl')[0]).toBe('src/cli/repl/');
  });
});

// ─── activeAtQuery / completeAtToken ─────────────────────────────────────────

describe('activeAtQuery — cursor-token detection (menu-open condition)', () => {
  it('opens on a bare @ at start of buffer (empty query)', () => {
    expect(activeAtQuery('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('opens after whitespace and carries the typed query up to the cursor', () => {
    expect(activeAtQuery('fix @src/ap', 11)).toEqual({ start: 4, query: 'src/ap' });
    expect(activeAtQuery('fix @src/ap', 7)).toEqual({ start: 4, query: 'sr' }); // cursor mid-token
  });

  it('never opens for an email-style @ (non-space before it)', () => {
    expect(activeAtQuery('alperen@exa', 11)).toBeNull();
  });

  it('never opens for a literal @@ escape', () => {
    expect(activeAtQuery('a @@lit', 7)).toBeNull();
    expect(activeAtQuery('@@', 1)).toBeNull();
  });

  it('closed when the cursor left the @-word or there is no @', () => {
    expect(activeAtQuery('@a.ts done', 10)).toBeNull(); // whitespace between @-token and cursor
    expect(activeAtQuery('plain text', 5)).toBeNull();
  });
});

describe('completeAtToken — selection splice', () => {
  it('replaces the token with @path + trailing space and places the cursor after it', () => {
    expect(completeAtToken('fix @sr', 7, 4, 'src/a.ts')).toEqual({ buffer: 'fix @src/a.ts ', cursor: 14 });
  });

  it('preserves text right of the cursor', () => {
    expect(completeAtToken('see @sr now', 7, 4, 'src')).toEqual({ buffer: 'see @src  now', cursor: 9 });
  });
});

// ─── atMenuMatches (input-bar seam) ──────────────────────────────────────────

describe('atMenuMatches — @-menu open-state resolution', () => {
  const provider = (): string[] => ['src/a.ts', 'src/b.ts'];

  it('closed without a provider (feature inert when unwired)', () => {
    expect(atMenuMatches(undefined, { buffer: '@a', cursor: 2 }, null)).toBeNull();
  });

  it('open with the active token + fuzzy matches', () => {
    expect(atMenuMatches(provider, { buffer: '@a', cursor: 2 }, null))
      .toEqual({ token: { start: 0, query: 'a' }, matches: ['src/a.ts'] });
  });

  it('closed for the Esc-dismissed token, open again for a different @ index', () => {
    expect(atMenuMatches(provider, { buffer: '@a', cursor: 2 }, 0)).toBeNull();
    expect(atMenuMatches(provider, { buffer: 'x @a', cursor: 4 }, 0))
      .toEqual({ token: { start: 2, query: 'a' }, matches: ['src/a.ts'] });
  });

  it('closed when nothing matches the query', () => {
    expect(atMenuMatches(provider, { buffer: '@zzz-none', cursor: 9 }, null)).toBeNull();
  });
});

// ─── isScopedRelPath ─────────────────────────────────────────────────────────

describe('isScopedRelPath — pure textual scope gate', () => {
  it('accepts project-relative paths (incl. balanced ..)', () => {
    expect(isScopedRelPath('src/a.ts')).toBe(true);
    expect(isScopedRelPath('a/../b.ts')).toBe(true);
    expect(isScopedRelPath('./src/a.ts')).toBe(true);
  });

  it('rejects escapes, absolutes (POSIX + Windows forms), and empties', () => {
    expect(isScopedRelPath('../outside.ts')).toBe(false);
    expect(isScopedRelPath('a/../../outside.ts')).toBe(false);
    expect(isScopedRelPath('/etc/passwd')).toBe(false);
    expect(isScopedRelPath('C:\\win\\system32')).toBe(false);
    expect(isScopedRelPath('C:/win/system32')).toBe(false);
    expect(isScopedRelPath('\\\\server\\share')).toBe(false);
    expect(isScopedRelPath('')).toBe(false);
    expect(isScopedRelPath('.')).toBe(false);
  });
});

// ─── createCachedPathLister ──────────────────────────────────────────────────

describe('createCachedPathLister — cached @-menu candidates', () => {
  /** Fake walkProjectFiles: visits `files` (abs paths) until the visitor stops. */
  const walkOf = (files: string[], counter: { walks: number }) =>
    (rootAbs: string, visit: (fileAbs: string) => boolean): void => {
      counter.walks += 1;
      for (const f of files) if (!visit(join(rootAbs, f))) return;
    };

  it('lists rel files + derived ancestor dirs (trailing /), sorted', () => {
    const counter = { walks: 0 };
    const list = createCachedPathLister(walkOf(['src/cli/a.ts', 'README.md'], counter), () => '/proj');
    expect(list('')).toEqual(['README.md', 'src/', 'src/cli/', 'src/cli/a.ts']);
  });

  it('caches within the TTL, re-walks after it, invalidates on root change', () => {
    const counter = { walks: 0 };
    let now = 1_000;
    let root = '/proj';
    const list = createCachedPathLister(walkOf(['a.ts'], counter), () => root, { ttlMs: 100, now: () => now });
    list(''); list('');
    expect(counter.walks).toBe(1);        // second call inside the TTL → cache
    now += 101;
    list('');
    expect(counter.walks).toBe(2);        // TTL elapsed → fresh walk
    root = '/other';
    list('');
    expect(counter.walks).toBe(3);        // /cd (root change) → fresh walk
  });

  it('stops the walk at the file cap and never returns more than `cap` entries', () => {
    const counter = { walks: 0 };
    const files = Array.from({ length: 50 }, (_, i) => `f${String(i).padStart(2, '0')}.ts`);
    const seen: string[] = [];
    const walk = (rootAbs: string, visit: (fileAbs: string) => boolean): void => {
      counter.walks += 1;
      for (const f of files) { seen.push(f); if (!visit(join(rootAbs, f))) return; }
    };
    const list = createCachedPathLister(walk, () => '/proj', { cap: 10 });
    expect(list('')).toHaveLength(10);
    expect(seen).toHaveLength(10); // visitor-false stopped the walk AT the cap
  });
});

// ─── createScopedAtRefReader (run.tsx wiring — hermetic tmpdir) ──────────────

describe('createScopedAtRefReader — scope-guarded real reader', () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it('reads an in-scope file; null for missing / escape / absolute / binary', async () => {
    dir = await mkdtemp(join(tmpdir(), 'atref-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'a.ts'), 'const ok = true;', 'utf-8');
    await writeFile(join(dir, 'bin.dat'), Buffer.from([0x62, 0x00, 0x63]));
    const read = createScopedAtRefReader(() => dir as string);
    expect(read('src/a.ts')).toBe('const ok = true;');
    expect(read('src/missing.ts')).toBeNull();
    expect(read('../outside.ts')).toBeNull();
    expect(read(join(dir, 'src', 'a.ts'))).toBeNull(); // absolute is refused even in-scope
    expect(read('bin.dat')).toBeNull();                // NUL byte → binary → never injected
  });

  it('refuses a symlink inside cwd whose real target escapes it (born-536 mirror)', async () => {
    if (process.platform === 'win32') return; // symlink creation needs privileges on Windows
    dir = await mkdtemp(join(tmpdir(), 'atref-'));
    const inner = join(dir, 'proj');
    await mkdir(inner, { recursive: true });
    await writeFile(join(dir, 'secret.txt'), 'outside-secret', 'utf-8');
    await symlink(join(dir, 'secret.txt'), join(inner, 'leak.txt'));
    const read = createScopedAtRefReader(() => inner);
    expect(read('leak.txt')).toBeNull();
  });
});
