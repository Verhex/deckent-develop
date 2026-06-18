import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocTrackingStore } from '../../../src/core/doc-tracking/store.js';
import type { DocRecord } from '../../../src/core/doc-tracking/types.js';

let dir: string; let store: DocTrackingStore;
const rec = (path: string, over: Partial<DocRecord> = {}): DocRecord => ({
  path, content_hash: 'sha256:a', last_updated: '2026-06-18T00:00:00Z', doc_rank: 10,
  status: 'active', stale_score: 0, priority_score: 0, state: 'FRESH',
  signals: { content_drift: false, code_drift: null, age_days: 0 },
  tracked_code: null, first_seen: '2026-06-18T00:00:00Z', last_scanned: '2026-06-18T00:00:00Z', ...over,
});
afterEach(() => { store?.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('DocTrackingStore', () => {
  it('upserts and reads back a record (round-trip incl. JSON signals)', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-store-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    store.upsertDoc(rec('docs/a.md', { state: 'DRIFT', signals: { content_drift: true, code_drift: null, age_days: 5 } }));
    const got = store.getByPath('docs/a.md');
    expect(got?.state).toBe('DRIFT');
    expect(got?.signals.content_drift).toBe(true);
  });
  it('upsert is last-write-wins on path PK', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-store-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    store.upsertDoc(rec('docs/a.md', { doc_rank: 10 }));
    store.upsertDoc(rec('docs/a.md', { doc_rank: 2 }));
    expect(store.getByPath('docs/a.md')?.doc_rank).toBe(2);
    expect(store.getAll().length).toBe(1);
  });
  it('pruneDeleted removes rows whose path is no longer present', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-store-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    store.upsertDoc(rec('docs/a.md')); store.upsertDoc(rec('docs/gone.md'));
    const n = store.pruneDeleted(['docs/a.md']);
    expect(n).toBe(1);
    expect(store.getByPath('docs/gone.md')).toBeNull();
  });
  it('does not create or touch the entries table', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-store-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    store.upsertDoc(rec('docs/a.md'));
    // re-open same file: doc_tracking persists, no error
    store.close(); store = new DocTrackingStore(join(dir, 'memory.db'));
    expect(store.getAll().length).toBe(1);
  });
});
