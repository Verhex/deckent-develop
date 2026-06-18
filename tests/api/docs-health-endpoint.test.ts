import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerResponse } from 'node:http';
import { aggregateHeatmap, registerDocsHealthRoute } from '../../src/api/docs-health-endpoint.js';
import { DocTrackingStore } from '../../src/core/doc-tracking/store.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('aggregateHeatmap', () => {
  it('buckets rows by rank-range × state with counts', () => {
    const cells = aggregateHeatmap([
      { doc_rank: 0, state: 'DRIFT' },
      { doc_rank: 5, state: 'DRIFT' },
      { doc_rank: 95, state: 'FRESH' },
    ]);
    expect(cells.find(c => c.bucket === '0' && c.state === 'DRIFT')?.count).toBe(1);
    expect(cells.find(c => c.bucket === '1-10' && c.state === 'DRIFT')?.count).toBe(1);
    expect(cells.find(c => c.bucket === '95+' && c.state === 'FRESH')?.count).toBe(1);
  });
});

describe('registerDocsHealthRoute', () => {
  it('responds 200 with rows + heatmap for GET /api/docs/health', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-api-'));
    const store = new DocTrackingStore(join(dir, '.brain/memory.db'));
    store.upsertDoc({ path: 'docs/a.md', content_hash: 'sha256:a', last_updated: '2026-06-18T00:00:00Z', doc_rank: 0, status: 'active', stale_score: 0, priority_score: 0, state: 'DRIFT', signals: { content_drift: false, code_drift: null, age_days: 1 }, tracked_code: null, first_seen: '2026-06-18T00:00:00Z', last_scanned: '2026-06-18T00:00:00Z' });
    store.close();
    let statusCode = 0; let payload = '';
    const res = {
      writeHead: (s: number) => { statusCode = s; },
      end: (b: string) => { payload += b; },
    } as unknown as ServerResponse;
    const handled = registerDocsHealthRoute('/api/docs/health', res, dir);
    expect(handled).toBe(true);
    expect(statusCode).toBe(200);
    const json = JSON.parse(payload);
    expect(json.rows.some((r: { path: string }) => r.path === 'docs/a.md')).toBe(true);
    expect(Array.isArray(json.heatmap)).toBe(true);
  });
  it('returns false for an unrelated URL', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-api-'));
    const res = { writeHead: () => {}, end: () => {} } as unknown as ServerResponse;
    expect(registerDocsHealthRoute('/api/status', res, dir)).toBe(false);
  });
});
