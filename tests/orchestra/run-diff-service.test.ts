// ═══ run-diff-service — 583/N1 pins (real git, hermetic, async spawn) ════════
//
// The ONE diff producer both surfaces consume. Pins:
//   * captureGitBase records the start commit (and fail-softs off-git),
//   * computeRunDiff diffs the run handle's base → worktree (added/modified
//     statuses derived), pre-N1 records fall back to HEAD with note:'no-base',
//   * a non-git root answers note:'not-a-git-repo' with zero files, no throw,
//   * splitUnifiedDiff caps per-file/total sizes with explicit truncated flags.
//
// Hermetic: per-test tmpdir git repos built with ASYNC execFile (no spawnSync
// — CUSTOM Test Hermeticity rule).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  captureGitBase,
  computeRunDiff,
  splitUnifiedDiff,
  DIFF_FILE_CAP,
} from '../../src/orchestra/run-diff-service.js';
import { saveRunHandle } from '../../src/core/run-flow-store.js';

const exec = promisify(execFile);

let root: string;

async function git(...args: string[]): Promise<void> {
  await exec('git', args, { cwd: root });
}

async function initRepoWithBase(): Promise<string> {
  await git('init', '-q');
  await git('config', 'user.email', 'test@test');
  await git('config', 'user.name', 'test');
  writeFileSync(join(root, 'a.txt'), 'first\n');
  await git('add', '.');
  await git('commit', '-q', '-m', 'base');
  const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: root });
  return stdout.trim();
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'run-diff-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('captureGitBase', () => {
  it('records HEAD in a git repo and fail-softs (undefined) outside one', async () => {
    const base = await initRepoWithBase();
    expect(await captureGitBase(root)).toBe(base);

    const bare = mkdtempSync(join(tmpdir(), 'run-diff-bare-'));
    try {
      expect(await captureGitBase(bare)).toBeUndefined();
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe('computeRunDiff', () => {
  it("diffs the run handle's recorded base against the worktree with honest statuses", async () => {
    const base = await initRepoWithBase();
    saveRunHandle(root, {
      flowId: 'flow-diff-1', revision: 1, planDigest: 'd',
      handle: { flowId: 'flow-diff-1', jobId: 'j', logRef: 'l' },
      startedAt: '2026-07-17T10:00:00.000Z', gitBase: base,
    });
    // the "run" modifies a.txt and creates b.txt
    writeFileSync(join(root, 'a.txt'), 'first\nsecond\n');
    writeFileSync(join(root, 'b.txt'), 'brand new\n');
    await git('add', '.'); // staged-new files show in diff <base> too once tracked

    const diff = await computeRunDiff(root, 'flow-diff-1');
    expect(diff.base).toBe(base);
    expect(diff.note).toBeUndefined();
    const byPath = new Map(diff.files.map((f) => [f.path, f]));
    expect(byPath.get('a.txt')?.status).toBe('modified');
    expect(byPath.get('a.txt')?.text).toContain('+second');
    expect(byPath.get('b.txt')?.status).toBe('added');
    expect(byPath.get('b.txt')?.text).toContain('+brand new');
  });

  it('pre-N1 record (no gitBase) falls back to HEAD with note:no-base', async () => {
    await initRepoWithBase();
    saveRunHandle(root, {
      flowId: 'flow-diff-2', revision: 1, planDigest: 'd',
      handle: { flowId: 'flow-diff-2', jobId: 'j', logRef: 'l' },
      startedAt: '2026-07-17T10:00:00.000Z',
    });
    writeFileSync(join(root, 'a.txt'), 'first\nchanged\n');

    const diff = await computeRunDiff(root, 'flow-diff-2');
    expect(diff.note).toBe('no-base');
    expect(diff.base).toBeNull();
    expect(diff.files[0]?.text).toContain('+changed');
  });

  it('a non-git project answers note:not-a-git-repo with zero files (never throws)', async () => {
    const diff = await computeRunDiff(root, 'whatever');
    expect(diff).toEqual({ base: null, files: [], truncated: false, note: 'not-a-git-repo' });
  });
});

describe('splitUnifiedDiff — caps are explicit, never silent', () => {
  it('caps an oversized file block and flags it truncated', () => {
    const big = `diff --git a/big.txt b/big.txt\n` + '+x\n'.repeat(DIFF_FILE_CAP);
    const { files } = splitUnifiedDiff(big);
    expect(files[0]?.truncated).toBe(true);
    expect(files[0]!.text.length).toBeLessThanOrEqual(DIFF_FILE_CAP);
  });

  it('derives statuses from headers', () => {
    const raw = [
      'diff --git a/x.txt b/x.txt\nnew file mode 100644\n+++ b/x.txt\n+hi\n',
      'diff --git a/y.txt b/y.txt\ndeleted file mode 100644\n--- a/y.txt\n-bye\n',
    ].join('');
    const { files } = splitUnifiedDiff(raw);
    expect(files.map((f) => f.status)).toEqual(['added', 'deleted']);
  });
});
