import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractLinks,
  classifyHref,
  slugify,
  extractHeadings,
  resolveTarget,
  scanFile,
  scanRoot,
} from '../../scripts/lint-links.mjs';

// ─── helpers ──────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'lint-links-'));
}

function writeFile(root: string, rel: string, content: string): string {
  const full = join(root, rel);
  const dir = full.slice(0, full.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

// ─── classifyHref ─────────────────────────────────────────────────────────

describe('classifyHref', () => {
  it('classifies http/https/mailto as external', () => {
    expect(classifyHref('https://example.com').kind).toBe('external');
    expect(classifyHref('http://example.com').kind).toBe('external');
    expect(classifyHref('mailto:a@b.com').kind).toBe('external');
  });

  it('classifies #anchor as self-anchor', () => {
    expect(classifyHref('#section').kind).toBe('self-anchor');
  });

  it('classifies relative .md as relative-file', () => {
    const r = classifyHref('./foo.md');
    expect(r.kind).toBe('relative-file');
    expect(r.filePart).toBe('./foo.md');
    expect(r.anchor).toBeNull();
  });

  it('splits anchor from relative .md', () => {
    const r = classifyHref('../bar.md#heading-x');
    expect(r.kind).toBe('relative-file');
    expect(r.filePart).toBe('../bar.md');
    expect(r.anchor).toBe('heading-x');
  });

  it('classifies absolute /path as site-relative', () => {
    expect(classifyHref('/reference/config').kind).toBe('site-relative');
    expect(classifyHref('/guide/foo#bar').kind).toBe('site-relative');
  });
});

// ─── slugify ──────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('lowercases and dasherizes', () => {
    expect(slugify('My Heading')).toBe('my-heading');
  });
  it('strips punctuation', () => {
    expect(slugify("It's a Test!")).toBe('its-a-test');
  });
  it('preserves consecutive spaces as multiple dashes (GitHub slug semantics)', () => {
    expect(slugify('foo   bar')).toBe('foo---bar');
  });

  it('preserves underscore and produces double-dash for "Word — Word"', () => {
    expect(slugify('1. Core — Types')).toBe('1-core--types');
    expect(slugify('deckent_init')).toBe('deckent_init');
  });
});

// ─── extractHeadings ──────────────────────────────────────────────────────

describe('extractHeadings', () => {
  it('extracts h1-h6', () => {
    const md = '# A\n## B\n### C section!\n';
    const h = extractHeadings(md);
    expect(h).toContain('a');
    expect(h).toContain('b');
    expect(h).toContain('c-section');
  });
});

// ─── extractLinks ─────────────────────────────────────────────────────────

describe('extractLinks', () => {
  it('extracts markdown link text + href', () => {
    const md = 'See [docs](./docs.md) and [home](/home).';
    const links = extractLinks(md);
    expect(links).toHaveLength(2);
    expect(links[0].href).toBe('./docs.md');
    expect(links[1].href).toBe('/home');
  });

  it('ignores image links', () => {
    const md = '![alt](./img.png) and [link](./real.md)';
    const links = extractLinks(md);
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('./real.md');
  });

  it('strips title attribute', () => {
    const md = '[t](./x.md "title")';
    const links = extractLinks(md);
    expect(links[0].href).toBe('./x.md');
  });

  it('reports line numbers', () => {
    const md = '\n\n[a](./a.md)\n[b](./b.md)';
    const links = extractLinks(md);
    expect(links[0].line).toBe(3);
    expect(links[1].line).toBe(4);
  });
});

// ─── resolveTarget ────────────────────────────────────────────────────────

describe('resolveTarget', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('resolves relative .md when file exists', () => {
    writeFile(root, 'a.md', '# A');
    writeFile(root, 'b.md', '# B');
    const r = resolveTarget({ kind: 'relative-file', filePart: './b.md', anchor: null }, join(root, 'a.md'), root);
    expect(r.exists).toBe(true);
    expect(r.resolvedPath?.endsWith('b.md')).toBe(true);
  });

  it('fails when relative file missing', () => {
    writeFile(root, 'a.md', '# A');
    const r = resolveTarget({ kind: 'relative-file', filePart: './missing.md', anchor: null }, join(root, 'a.md'), root);
    expect(r.exists).toBe(false);
  });

  it('resolves uppercase ALL-CAPS relative when sibling exists with extension', () => {
    writeFile(root, 'a.md', '# A');
    writeFile(root, 'b.md', '# B');
    // VitePress-ish: site-relative no extension /b should resolve to b.md
    const r = resolveTarget({ kind: 'site-relative', filePart: '/b', anchor: null }, join(root, 'a.md'), root);
    expect(r.exists).toBe(true);
  });

  it('site-relative with docs root resolves <docs>/foo.md', () => {
    writeFile(root, 'docs/reference/config.md', '# Config');
    writeFile(root, 'docs/guide/x.md', '# X');
    const r = resolveTarget(
      { kind: 'site-relative', filePart: '/reference/config', anchor: null },
      join(root, 'docs/guide/x.md'),
      root,
      { docsRoot: join(root, 'docs') },
    );
    expect(r.exists).toBe(true);
  });

  it('validates anchor against target heading', () => {
    writeFile(root, 'a.md', '# A\n## Section X');
    writeFile(root, 'b.md', '# B');
    const r = resolveTarget({ kind: 'relative-file', filePart: './a.md', anchor: 'section-x' }, join(root, 'b.md'), root);
    expect(r.exists).toBe(true);
    expect(r.anchorOk).toBe(true);
  });

  it('flags missing anchor', () => {
    writeFile(root, 'a.md', '# A\n## Real');
    writeFile(root, 'b.md', '# B');
    const r = resolveTarget({ kind: 'relative-file', filePart: './a.md', anchor: 'fake' }, join(root, 'b.md'), root);
    expect(r.exists).toBe(true);
    expect(r.anchorOk).toBe(false);
  });

  it('self-anchor validates against the file own headings', () => {
    writeFile(root, 'a.md', '# Top\n## Sub Heading\n[link](#sub-heading)\n[bad](#nope)');
    const r1 = resolveTarget({ kind: 'self-anchor', filePart: '', anchor: 'sub-heading' }, join(root, 'a.md'), root);
    expect(r1.anchorOk).toBe(true);
    const r2 = resolveTarget({ kind: 'self-anchor', filePart: '', anchor: 'nope' }, join(root, 'a.md'), root);
    expect(r2.anchorOk).toBe(false);
  });

  it('external links skipped (exists=null)', () => {
    writeFile(root, 'a.md', '# A');
    const r = resolveTarget({ kind: 'external', filePart: 'https://example.com', anchor: null }, join(root, 'a.md'), root);
    expect(r.exists).toBe(null);
  });
});

// ─── scanFile (integration) ───────────────────────────────────────────────

describe('scanFile', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('flags broken relative link with file:line context', () => {
    writeFile(root, 'a.md', '# A\n\n[link](./missing.md)\n');
    const broken = scanFile(join(root, 'a.md'), root, {});
    expect(broken).toHaveLength(1);
    expect(broken[0].href).toBe('./missing.md');
    expect(broken[0].line).toBe(3);
  });

  it('clean file returns no broken', () => {
    writeFile(root, 'a.md', '# A\n[ok](./b.md)\n');
    writeFile(root, 'b.md', '# B');
    const broken = scanFile(join(root, 'a.md'), root, {});
    expect(broken).toHaveLength(0);
  });

  it('skips external links', () => {
    writeFile(root, 'a.md', '# A\n[ext](https://example.com)\n');
    const broken = scanFile(join(root, 'a.md'), root, {});
    expect(broken).toHaveLength(0);
  });

  it('reports broken anchor on same file', () => {
    writeFile(root, 'a.md', '# A\n## Real\n[bad](#nope)\n');
    const broken = scanFile(join(root, 'a.md'), root, {});
    expect(broken).toHaveLength(1);
    expect(broken[0].reason).toMatch(/anchor/i);
  });
});

// ─── scanRoot + ignore patterns ───────────────────────────────────────────

describe('scanRoot', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('honors ignore patterns (dir prefix)', () => {
    writeFile(root, 'docs/audit/old.md', '[stale](./gone.md)');
    writeFile(root, 'docs/guide/page.md', '# OK');
    const out = scanRoot(root, { ignorePatterns: ['docs/audit/**'] });
    expect(out.broken).toHaveLength(0);
    expect(out.filesScanned).toBeGreaterThan(0);
    // Should have scanned docs/guide/page.md but not docs/audit/old.md
    const scannedRels = out.scannedFiles.map((f: string) => f.replace(root + '/', ''));
    expect(scannedRels).toContain('docs/guide/page.md');
    expect(scannedRels.find((s: string) => s.startsWith('docs/audit/'))).toBeUndefined();
  });

  it('exits with broken count > 0 when broken links exist', () => {
    writeFile(root, 'a.md', '[broken](./missing.md)');
    const out = scanRoot(root, {});
    expect(out.broken.length).toBeGreaterThan(0);
  });

  // Sprint 172 C3-fix — DEFAULT_IGNORES must skip sprint/audit history & internal
  // dirs even when no .lintlinkignore file is present in the repo, so the gate
  // works for fresh OSS installs and CI sandboxes.
  it('skips sprint/audit/internal trees via built-in DEFAULT_IGNORES (no .lintlinkignore needed)', () => {
    writeFile(root, '.brain/sprints/sprint-001.md', '[stale](./gone.md)');
    writeFile(root, '.brain/archive/old.md', '[stale](./gone.md)');
    writeFile(root, '.audit/sprint-171/x.md', '[stale](./gone.md)');
    writeFile(root, '.deckent/workspace/IDENTITY.md', '[stale](./gone.md)');
    writeFile(root, 'docs/audits/sprint-171/00.md', '[stale](./gone.md)');
    writeFile(root, 'docs/development/blueprint.md', '[stale](./gone.md)');
    writeFile(root, 'src/foo.md', '[stale](./gone.md)');
    writeFile(root, 'tests/bar.md', '[stale](./gone.md)');
    writeFile(root, 'examples/baz.md', '[stale](./gone.md)');
    // Useful real surface remains
    writeFile(root, 'docs/guide/ok.md', '# OK');
    writeFile(root, 'README.md', '[guide](./docs/guide/ok.md)');

    const out = scanRoot(root, { useIgnoreFile: false });
    expect(out.broken).toHaveLength(0);
    const rels = out.scannedFiles.map((f: string) => f.replace(root + '/', ''));
    expect(rels).toContain('README.md');
    expect(rels).toContain('docs/guide/ok.md');
    // Sprint/audit history must not be scanned
    expect(rels.find((s: string) => s.startsWith('.brain/sprints/'))).toBeUndefined();
    expect(rels.find((s: string) => s.startsWith('.brain/archive/'))).toBeUndefined();
    expect(rels.find((s: string) => s.startsWith('.audit/'))).toBeUndefined();
    expect(rels.find((s: string) => s.startsWith('.deckent/'))).toBeUndefined();
    expect(rels.find((s: string) => s.startsWith('docs/audits/'))).toBeUndefined();
    expect(rels.find((s: string) => s.startsWith('docs/development/'))).toBeUndefined();
    expect(rels.find((s: string) => s.startsWith('src/'))).toBeUndefined();
    expect(rels.find((s: string) => s.startsWith('tests/'))).toBeUndefined();
    expect(rels.find((s: string) => s.startsWith('examples/'))).toBeUndefined();
  });

  it('extraIgnorePatterns layer on top of defaults additively', () => {
    writeFile(root, 'docs/guide/page.md', '# OK');
    writeFile(root, 'docs/guide/page.md', '[broken](./missing.md)');
    // Without extra ignores → broken
    const withoutExtra = scanRoot(root, { useIgnoreFile: false });
    expect(withoutExtra.broken.length).toBeGreaterThan(0);
    // With extra ignore for docs/guide → clean
    const withExtra = scanRoot(root, {
      useIgnoreFile: false,
      extraIgnorePatterns: ['docs/guide/**'],
    });
    expect(withExtra.broken).toHaveLength(0);
  });
});
