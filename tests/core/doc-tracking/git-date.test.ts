import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process'; // test-only setup, not in src
import { getFileGitDateAsync } from '../../../src/core/doc-tracking/git-date.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('getFileGitDateAsync', () => {
  it('returns the git commit date for a tracked file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-git-'));
    const run = (args: string[]) => spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
    run(['init']); run(['config', 'user.email', 't@t']); run(['config', 'user.name', 't']);
    writeFileSync(join(dir, 'a.md'), '# a');
    run(['add', 'a.md']); run(['commit', '-m', 'x']);
    const ms = await getFileGitDateAsync(dir, 'a.md');
    expect(ms).toBeGreaterThan(0);
  });
  it('falls back to mtime for an untracked file (no git)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-nogit-'));
    writeFileSync(join(dir, 'b.md'), '# b');
    const ms = await getFileGitDateAsync(dir, 'b.md');
    expect(ms).toBeGreaterThan(0);
  });
  it('returns 0 for a missing file with no git', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-miss-'));
    const ms = await getFileGitDateAsync(dir, 'nope.md');
    expect(ms).toBe(0);
  });
});
