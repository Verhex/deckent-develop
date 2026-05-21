import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  snapshotWorkerScope,
  dropWorkerSnapshot,
  rollbackWorkerScope,
} from '../../src/agents/worker-rollback.js';

describe('worker-rollback untracked-safety (Sprint 181)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'wrb-untracked-'));
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    execFileSync('git', ['config', 'user.email', 'test@deckent'], { cwd: tmp });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: tmp });
    writeFileSync(join(tmp, 'README.md'), '# test\n');
    execFileSync('git', ['add', '.'], { cwd: tmp });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('(a) scope-bounded stash: out-of-scope untracked file survives spawn', () => {
    mkdirSync(join(tmp, 'src/api/terminal'), { recursive: true });
    mkdirSync(join(tmp, 'src/orchestra'), { recursive: true });
    writeFileSync(join(tmp, 'src/api/terminal/uncommitted.ts'), 'export const lost = 1;\n');

    const ref = snapshotWorkerScope(tmp, 'task-001', {
      scopedDirs: ['src/orchestra/'],
    });

    // Out-of-scope untracked file STILL in working tree
    expect(existsSync(join(tmp, 'src/api/terminal/uncommitted.ts'))).toBe(true);

    dropWorkerSnapshot(tmp, ref);
    // Still there after drop (it was never in the stash)
    expect(existsSync(join(tmp, 'src/api/terminal/uncommitted.ts'))).toBe(true);
  });

  it('(b) pre-spawn guard warns when out-of-scope uncommitted changes exist', () => {
    mkdirSync(join(tmp, 'src/api/terminal'), { recursive: true });
    mkdirSync(join(tmp, 'src/orchestra'), { recursive: true });
    writeFileSync(join(tmp, 'src/api/terminal/uncommitted.ts'), 'export const x = 1;\n');

    const onWarn = vi.fn();
    const ref = snapshotWorkerScope(tmp, 'task-002', {
      scopedDirs: ['src/orchestra/'],
      onWarn,
    });

    expect(onWarn).toHaveBeenCalled();
    const call = onWarn.mock.calls[0][0];
    expect(call.code).toBe('UNCOMMITTED_OUT_OF_SCOPE');
    expect(call.files).toContain('src/api/terminal/uncommitted.ts');

    dropWorkerSnapshot(tmp, ref);
  });

  it('(c) archive folder: dropWorkerSnapshot with sprintId+taskId writes patch', () => {
    mkdirSync(join(tmp, 'src/scope'), { recursive: true });
    writeFileSync(join(tmp, 'src/scope/file.ts'), 'export {};\n');

    const ref = snapshotWorkerScope(tmp, 'task-003', {
      scopedDirs: ['src/scope/'],
    });

    dropWorkerSnapshot(tmp, ref, { sprintId: 'sprint-181', taskId: 'task-003' });

    const archiveDir = join(tmp, '.deckent/worker-rollback-history/sprint-181/task-003');
    expect(existsSync(archiveDir)).toBe(true);
  });

  it('(d) NO_GO scope-bounded revert: only scoped paths reverted', () => {
    mkdirSync(join(tmp, 'src/scope'), { recursive: true });
    mkdirSync(join(tmp, 'src/other'), { recursive: true });
    writeFileSync(join(tmp, 'src/other/untouched.ts'), 'export const safe = 1;\n');

    const ref = snapshotWorkerScope(tmp, 'task-004', {
      scopedDirs: ['src/scope/'],
    });

    writeFileSync(join(tmp, 'src/scope/new.ts'), 'export const written = 1;\n');
    rollbackWorkerScope(tmp, ref, ['src/scope/new.ts']);

    expect(existsSync(join(tmp, 'src/scope/new.ts'))).toBe(false);
    expect(existsSync(join(tmp, 'src/other/untouched.ts'))).toBe(true);
    expect(readFileSync(join(tmp, 'src/other/untouched.ts'), 'utf-8')).toBe('export const safe = 1;\n');
  });

  it('(e) DONE keeps scope writes; out-of-scope untouched', () => {
    mkdirSync(join(tmp, 'src/scope'), { recursive: true });
    mkdirSync(join(tmp, 'src/other'), { recursive: true });
    writeFileSync(join(tmp, 'src/other/external.ts'), 'external\n');

    const ref = snapshotWorkerScope(tmp, 'task-005', {
      scopedDirs: ['src/scope/'],
    });

    writeFileSync(join(tmp, 'src/scope/done.ts'), 'done\n');
    dropWorkerSnapshot(tmp, ref);

    expect(existsSync(join(tmp, 'src/scope/done.ts'))).toBe(true);
    expect(existsSync(join(tmp, 'src/other/external.ts'))).toBe(true);
  });
});
