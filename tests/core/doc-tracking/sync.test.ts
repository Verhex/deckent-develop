import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDocTrackingSync } from '../../../src/core/doc-tracking/sync.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('runDocTrackingSync', () => {
  it('scans docs into memory.db without writing front-matter', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-sync-'));
    mkdirSync(join(dir, 'docs/guide'), { recursive: true });
    writeFileSync(join(dir, 'docs/guide/g.md'), '# G\nbody\n');
    const r = await runDocTrackingSync(dir);
    expect(r.count).toBeGreaterThanOrEqual(1);
    // front-matter NOT written (write:false)
    expect(readFileSync(join(dir, 'docs/guide/g.md'), 'utf-8')).toBe('# G\nbody\n');
  });
});
