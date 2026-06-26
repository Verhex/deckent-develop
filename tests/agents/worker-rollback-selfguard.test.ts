import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotWorkerScope, rollbackWorkerScope } from '../../src/agents/worker-rollback.js';

// Sprint-326 self-wipe fix: the worker snapshot/rollback git operations must
// (a) be NO-OPs in the deckent-dev dogfood self-tree (ADR-039 guard), and
// (b) NEVER `git checkout HEAD -- . && git clean -fd` the whole tree on an
// empty scope (the footgun that deleted 326-001's output + reverted DIRECTIVES).
const NOSTASH = 'stash@{NOSTASH}';

function git(repo: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function initRepo(isDeckent: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'wr-guard-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@t.t']);
  git(dir, ['config', 'user.name', 't']);
  if (isDeckent) {
    mkdirSync(join(dir, '.deckent'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'deckent' }));
  } else {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'some-user-app' }));
  }
  writeFileSync(join(dir, 'tracked.txt'), 'committed\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-qm', 'init']);
  return dir;
}

describe('worker-rollback self-project guard + empty-scope safety (Sprint-326 self-wipe)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it('SELF-TREE: snapshot is a no-op — returns NOSTASH, does NOT sweep an untracked sibling file', () => {
    const repo = initRepo(true);
    dirs.push(repo);
    const sibling = join(repo, 'sibling-untracked.ts'); // another task's in-progress deliverable
    writeFileSync(sibling, 'export const x = 1;\n');
    const ref = snapshotWorkerScope(repo, 'task-001');
    expect(ref).toBe(NOSTASH);
    expect(existsSync(sibling)).toBe(true); // not swept into a stash
  });

  it('SELF-TREE: rollback is a no-op — does NOT wipe the working tree', () => {
    const repo = initRepo(true);
    dirs.push(repo);
    const sibling = join(repo, 'sibling-untracked.ts');
    writeFileSync(sibling, 'export const x = 1;\n');
    writeFileSync(join(repo, 'tracked.txt'), 'locally-modified\n'); // uncommitted tracked change
    rollbackWorkerScope(repo, NOSTASH, []); // empty scope — pre-fix this whole-tree-wiped
    expect(existsSync(sibling)).toBe(true);
    expect(git(repo, ['diff', '--name-only'])).toContain('tracked.txt');
  });

  it('NON-SELF repo: empty-scope rollback NEVER whole-tree-wipes (footgun fix)', () => {
    const repo = initRepo(false);
    dirs.push(repo);
    const outOfScope = join(repo, 'other-task-deliverable.ts'); // untracked, out of scope
    writeFileSync(outOfScope, 'export const y = 2;\n');
    writeFileSync(join(repo, 'tracked.txt'), 'modified\n');
    rollbackWorkerScope(repo, NOSTASH, []); // empty scope
    expect(existsSync(outOfScope)).toBe(true); // pre-fix: deleted by `git clean -fd`
    expect(git(repo, ['diff', '--name-only'])).toContain('tracked.txt'); // pre-fix: reverted by `checkout HEAD -- .`
  });
});
