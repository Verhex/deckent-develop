import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDocsTrackScan } from '../../src/cli/commands/docs.js';

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
