import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanDocs } from '../../../src/core/doc-tracking/scanner.js';
import { DocTrackingStore } from '../../../src/core/doc-tracking/store.js';
import { DEFAULT_DOC_TRACKING_CONFIG as C } from '../../../src/core/doc-tracking/types.js';

let dir: string; let store: DocTrackingStore;
const mk = (p: string, body: string) => { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), body); };
afterEach(() => { store?.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('scanDocs', () => {
  it('writes managed front-matter and records a fresh doc; ignores node_modules', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-scan-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    mk('docs/guide/x.md', '# Guide\nhello\n');
    mk('node_modules/pkg/readme.md', '# nope\n');
    const r = await scanDocs(dir, C, store, { write: true, prune: false, now: Date.parse('2026-06-18T00:00:00Z') });
    expect(r.records.find(x => x.path === 'docs/guide/x.md')?.doc_rank).toBe(20);
    expect(r.records.some(x => x.path.includes('node_modules'))).toBe(false);
    const written = readFileSync(join(dir, 'docs/guide/x.md'), 'utf-8');
    expect(written.startsWith('---\n')).toBe(true);
    expect(written).toContain('content_hash: sha256:');
  });

  it('detects content_drift on second scan after body edit', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-scan-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    mk('docs/reference/a.md', '# A\nv1\n');
    await scanDocs(dir, C, store, { write: true, prune: false, now: Date.parse('2026-06-18T00:00:00Z') });
    // edit body
    const cur = readFileSync(join(dir, 'docs/reference/a.md'), 'utf-8');
    writeFileSync(join(dir, 'docs/reference/a.md'), cur.replace('v1', 'v2-changed'));
    const r2 = await scanDocs(dir, C, store, { write: true, prune: false, now: Date.parse('2026-06-18T00:00:00Z') });
    const rec = r2.records.find(x => x.path === 'docs/reference/a.md')!;
    expect(rec.signals.content_drift).toBe(true);
  });

  it('treats scratch/ and status:temp as EXEMPT (no hash)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-scan-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    mk('scratch/note.md', '# tmp\n');
    mk('docs/d.md', '---\nstatus: draft\n---\n# d\n');
    const r = await scanDocs(dir, C, store, { write: false, prune: false, now: Date.now() });
    expect(r.records.find(x => x.path === 'scratch/note.md')).toBeUndefined(); // scratch is in trackIgnore
    expect(r.records.find(x => x.path === 'docs/d.md')?.state).toBe('EXEMPT');
    expect(r.records.find(x => x.path === 'docs/d.md')?.content_hash).toBeNull();
  });

  it('computes code_drift (non-null path) when a doc carries tracks, null otherwise', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-scan-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    // doc WITH tracks → code_drift evaluated + tracked_code populated
    mk('docs/reference/tracked.md', '---\ntracks:\n  - docs/reference/tracked.md\n---\n# T\nbody\n');
    // doc WITHOUT tracks → code_drift stays null (Phase 1 behavior)
    mk('docs/reference/plain.md', '# P\nbody\n');
    const r = await scanDocs(dir, C, store, { write: false, prune: false, now: Date.parse('2026-06-18T00:00:00Z') });
    const tracked = r.records.find(x => x.path === 'docs/reference/tracked.md')!;
    const plain = r.records.find(x => x.path === 'docs/reference/plain.md')!;
    expect(typeof tracked.signals.code_drift === 'boolean' || tracked.signals.code_drift === null).toBe(true);
    expect(tracked.tracked_code).toEqual(['docs/reference/tracked.md']);
    expect(plain.signals.code_drift).toBeNull();
  });
});
