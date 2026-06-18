import { describe, it, expect } from 'vitest';
import { parseFrontmatter, hashBody, writeManagedFrontmatter } from '../../../src/core/doc-tracking/frontmatter.js';

const FM = `---\ntitle: Hi\ndoc_rank: 10\ntracks:\n  - src/a.ts\n---\n\n# Body\ntext\n`;

describe('parseFrontmatter', () => {
  it('parses managed scalars + tracks list and isolates body', () => {
    const r = parseFrontmatter(FM);
    expect(r.ok).toBe(true);
    expect(r.data.doc_rank).toBe(10);
    expect(r.data.tracks).toEqual(['src/a.ts']);
    expect(r.body).toBe('# Body\ntext\n');
  });
  it('reports no front-matter when line 1 is not ---', () => {
    const r = parseFrontmatter('# ADR\n---\nx\n');
    expect(r.ok).toBe(false);
    expect(r.body).toBe('# ADR\n---\nx\n');
  });
});

describe('hashBody', () => {
  it('is stable across CRLF and trailing whitespace', () => {
    expect(hashBody('a\r\nb  \n')).toBe(hashBody('a\nb\n'));
  });
  it('has sha256: prefix', () => {
    expect(hashBody('x')).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('writeManagedFrontmatter', () => {
  it('updates managed keys, preserves others (title/tracks), keeps body', () => {
    const out = writeManagedFrontmatter(FM, { doc_rank: 1, status: 'active', last_updated: '2026-06-18', content_hash: 'sha256:abc' });
    expect(out).toContain('title: Hi');
    expect(out).toContain('- src/a.ts');
    expect(out).toContain('doc_rank: 1');
    expect(out).toContain('status: active');
    expect(out).toContain('content_hash: sha256:abc');
    expect(out).toContain('# Body');
  });
  it('prepends front-matter when none exists', () => {
    const out = writeManagedFrontmatter('# Plain\n', { doc_rank: 5, status: 'active', last_updated: '2026-06-18', content_hash: 'sha256:z' });
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('# Plain');
  });
  it('is idempotent for identical fields', () => {
    const f = { doc_rank: 1, status: 'active' as const, last_updated: '2026-06-18', content_hash: 'sha256:abc' };
    const once = writeManagedFrontmatter(FM, f);
    expect(writeManagedFrontmatter(once, f)).toBe(once);
  });
  it('writes <temp> when content_hash is null', () => {
    const out = writeManagedFrontmatter('# X\n', { doc_rank: 9, status: 'temp', last_updated: '2026-06-18', content_hash: null });
    expect(out).toContain('content_hash: <temp>');
  });
});
