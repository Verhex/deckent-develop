import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  snapshotWorkerScope,
  rollbackWorkerScope,
  dropWorkerSnapshot,
  writeStashRef,
  readStashRef,
} from '../../src/agents/worker-rollback.js';

/**
 * Sprint 177 Task 1 — Worker rollback: git-stash snapshot-on-spawn
 *
 * Verifies that workers snapshot the working tree at spawn-time via
 * `git stash --include-untracked --keep-index`, that NO_GO verdicts
 * cleanly revert the entire working tree, and that DONE / GWT verdicts
 * drop the stash without reverting (worker changes preserved).
 */
describe('worker rollback — git stash snapshot-on-spawn (Sprint 177 Task 1)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'worker-rb-'));
    execSync('git init -q', { cwd: tmp });
    execSync('git config user.email test@test', { cwd: tmp });
    execSync('git config user.name test', { cwd: tmp });
    writeFileSync(join(tmp, 'baseline.ts'), 'export const x = 1;\n');
    execSync('git add -A && git commit -q -m initial', { cwd: tmp });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('snapshot captures pre-spawn state with --include-untracked', () => {
    writeFileSync(join(tmp, 'pre-spawn-dirty.ts'), 'pre-spawn change\n');
    const ref = snapshotWorkerScope(tmp, 'task-001');

    expect(ref).toMatch(/^stash@\{[0-9]+\}$/);

    const stashList = execSync('git stash list', { cwd: tmp, encoding: 'utf-8' });
    expect(stashList).toContain('deckent-worker-task-001');

    dropWorkerSnapshot(tmp, ref);
    const after = execSync('git stash list', { cwd: tmp, encoding: 'utf-8' });
    expect(after.trim()).toBe('');
  });

  it('rollback reverts worker scope writes (NO_GO path)', () => {
    const ref = snapshotWorkerScope(tmp, 'task-002');

    writeFileSync(join(tmp, 'worker-output.ts'), 'export const y = 2;\n');
    writeFileSync(join(tmp, 'baseline.ts'), 'export const x = 999;\n');

    rollbackWorkerScope(tmp, ref, ['baseline.ts', 'worker-output.ts']);

    expect(existsSync(join(tmp, 'worker-output.ts'))).toBe(false);
    expect(readFileSync(join(tmp, 'baseline.ts'), 'utf-8')).toBe('export const x = 1;\n');

    const stashList = execSync('git stash list', { cwd: tmp, encoding: 'utf-8' });
    expect(stashList.trim()).toBe('');
  });

  it('dropSnapshot on DONE path keeps worker changes', () => {
    const ref = snapshotWorkerScope(tmp, 'task-003');

    writeFileSync(join(tmp, 'kept.ts'), 'kept\n');

    dropWorkerSnapshot(tmp, ref);

    expect(existsSync(join(tmp, 'kept.ts'))).toBe(true);
    const stashList = execSync('git stash list', { cwd: tmp, encoding: 'utf-8' });
    expect(stashList).not.toContain('deckent-worker-task-003');
    expect(stashList.trim()).toBe('');
  });

  it('rollback also reverts out-of-scope writes (advisory ADR-037 violation)', () => {
    const ref = snapshotWorkerScope(tmp, 'task-004');

    writeFileSync(join(tmp, 'out-of-scope.ts'), 'sneaky\n');
    rollbackWorkerScope(tmp, ref, ['in-scope.ts']);

    expect(existsSync(join(tmp, 'out-of-scope.ts'))).toBe(false);

    const stashList = execSync('git stash list', { cwd: tmp, encoding: 'utf-8' });
    expect(stashList.trim()).toBe('');
  });

  it('sidecar persistence: writeStashRef/readStashRef round-trip', () => {
    const tasksDir = join(tmp, '.tasks');
    execSync(`mkdir -p ${tasksDir}`);

    writeStashRef(tmp, 'task-005', 'stash@{0}');
    expect(readStashRef(tmp, 'task-005')).toBe('stash@{0}');

    expect(readStashRef(tmp, 'task-nonexistent')).toBeNull();
  });
});
