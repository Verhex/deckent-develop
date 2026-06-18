import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process'; // test-only setup
import { resolveTrackedFiles, computeCodeDrift } from '../../../src/core/doc-tracking/code-drift.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

function gitRepo(): void {
  const run = (args: string[]) => spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
  run(['init']); run(['config', 'user.email', 't@t']); run(['config', 'user.name', 't']);
}

describe('resolveTrackedFiles', () => {
  it('expands globs against tracked files and keeps plain paths', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-cd-'));
    gitRepo();
    mkdirSync(join(dir, 'src/core'), { recursive: true });
    writeFileSync(join(dir, 'src/core/a.ts'), 'export const a=1;');
    writeFileSync(join(dir, 'src/core/b.ts'), 'export const b=2;');
    spawnSync('git', ['add', '-A'], { cwd: dir }); spawnSync('git', ['commit', '-m', 'x'], { cwd: dir });
    const files = await resolveTrackedFiles(dir, ['src/core/**']);
    expect(files).toContain('src/core/a.ts');
    expect(files).toContain('src/core/b.ts');
  });
});

describe('computeCodeDrift', () => {
  it('returns null when tracks is empty or null', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-cd-'));
    expect(await computeCodeDrift(dir, null, 0)).toBeNull();
    expect(await computeCodeDrift(dir, [], 0)).toBeNull();
  });
  it('returns true when a tracked file is newer than the doc', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-cd-'));
    gitRepo();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/x.ts'), 'export const x=1;');
    spawnSync('git', ['add', '-A'], { cwd: dir }); spawnSync('git', ['commit', '-m', 'x'], { cwd: dir });
    // doc "last updated" at epoch 0 → any real commit date is newer → drift
    expect(await computeCodeDrift(dir, ['src/x.ts'], 0)).toBe(true);
  });
  it('returns false when no tracked file is newer than the doc', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-cd-'));
    gitRepo();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/y.ts'), 'export const y=1;');
    spawnSync('git', ['add', '-A'], { cwd: dir }); spawnSync('git', ['commit', '-m', 'y'], { cwd: dir });
    // doc "last updated" far in the future → nothing newer → no drift
    expect(await computeCodeDrift(dir, ['src/y.ts'], Date.now() + 86400000)).toBe(false);
  });
});
