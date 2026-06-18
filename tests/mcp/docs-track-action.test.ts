import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDocsTrackScan, runDocsTrackStatus } from '../../src/cli/commands/docs.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('deckent_docs track actions (handler layer)', () => {
  it('track-scan then track-status returns rows from memory.db', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-mcp-'));
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs/a.md'), '# A\nbody\n');
    const scan = await runDocsTrackScan(dir, { write: false, prune: false });
    expect(scan.count).toBeGreaterThanOrEqual(1);
    const rows = runDocsTrackStatus(dir, { stale: false });
    expect(rows.some(r => r.path === 'docs/a.md')).toBe(true);
  });
});
