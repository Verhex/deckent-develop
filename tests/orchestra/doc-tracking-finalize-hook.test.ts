import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maybeRunDocTrackingSync } from '../../src/orchestra/sprint-finalizer.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('maybeRunDocTrackingSync', () => {
  it('does nothing when sync_on_finalize is not set', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-hook-'));
    const r = await maybeRunDocTrackingSync(dir, undefined);
    expect(r.ran).toBe(false);
  });
  it('runs a sync when sync_on_finalize is true', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-hook-'));
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs/a.md'), '# A\nbody\n');
    const r = await maybeRunDocTrackingSync(dir, { doc_tracking: { sync_on_finalize: true } });
    expect(r.ran).toBe(true);
    expect(r.count).toBeGreaterThanOrEqual(1);
  });
  it('is fail-safe — never throws even if the root is unusable', async () => {
    const r = await maybeRunDocTrackingSync('/nonexistent/path/xyz-doc-tracking', { doc_tracking: { sync_on_finalize: true } });
    expect(r.ran).toBe(true); // attempted; error swallowed → no count guaranteed
  });
});
