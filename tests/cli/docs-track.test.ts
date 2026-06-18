import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDocsTrackScan, runDocsTrackCheck } from '../../src/cli/commands/docs.js';
import { DocTrackingStore } from '../../src/core/doc-tracking/store.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('runDocsTrackScan', () => {
  it('scans the repo, writes front-matter, persists to memory.db', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-cli-'));
    mkdirSync(join(dir, 'docs/guide'), { recursive: true });
    writeFileSync(join(dir, 'docs/guide/g.md'), '# G\nbody\n');
    const res = await runDocsTrackScan(dir, { write: true, prune: false });
    expect(res.count).toBeGreaterThanOrEqual(1);
    expect(readFileSync(join(dir, 'docs/guide/g.md'), 'utf-8')).toContain('doc_rank:');
  });
});

describe('runDocsTrackCheck', () => {
  it('ok=true when no critical-stale docs', () => {
    const d = mkdtempSync(join(tmpdir(), 'dt-chk-'));
    try {
      const store = new DocTrackingStore(join(d, '.brain/memory.db'));
      store.upsertDoc({ path: 'docs/a.md', content_hash: 'sha256:a', last_updated: '2026-06-18T00:00:00Z', doc_rank: 10, status: 'active', stale_score: 0, priority_score: 0, state: 'FRESH', signals: { content_drift: false, code_drift: null, age_days: 0 }, tracked_code: null, first_seen: '2026-06-18T00:00:00Z', last_scanned: '2026-06-18T00:00:00Z' });
      store.close();
      const r = runDocsTrackCheck(d, {});
      expect(r.ok).toBe(true);
      expect(r.violations.length).toBe(0);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  it('ok=false and lists violations when a CRITICAL_STALE doc exists', () => {
    const d = mkdtempSync(join(tmpdir(), 'dt-chk-'));
    try {
      const store = new DocTrackingStore(join(d, '.brain/memory.db'));
      store.upsertDoc({ path: 'docs/crit.md', content_hash: 'sha256:c', last_updated: '2026-06-18T00:00:00Z', doc_rank: 0, status: 'active', stale_score: 50, priority_score: 100, state: 'CRITICAL_STALE', signals: { content_drift: true, code_drift: null, age_days: 0 }, tracked_code: null, first_seen: '2026-06-18T00:00:00Z', last_scanned: '2026-06-18T00:00:00Z' });
      store.close();
      const r = runDocsTrackCheck(d, {});
      expect(r.ok).toBe(false);
      expect(r.violations.map(v => v.path)).toContain('docs/crit.md');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
