// ═══ git-workflow-service — 583/N4 (KARAR-2 İKİSİ-BİRDEN) ═══════════════════
//
// Real git in a tmpdir (async spawn — spawnSync FORBIDDEN, hermeticity rule),
// mirroring run-diff-service's own proof style. The service is the ONE git
// surface both the chat tools and `runs --commit` ride; these pins hold its
// honesty lines: not-a-git-repo notes, stderr-carrying failures, the
// parent-repo `-- .` safety pathspec, and the N1 gitBase proposal semantics.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import {
  runGitCapture,
  gitWorkflowStatus,
  gitWorkflowLog,
  gitWorkflowDiff,
  gitWorkflowAdd,
  gitWorkflowCommit,
  buildCommitProposal,
  buildRunCommitProposal,
  GIT_DIFF_TEXT_CAP,
} from '../../src/orchestra/git-workflow-service.js';
import { saveRunHandle } from '../../src/core/run-flow-store.js';

/** Run a git command via async spawn (test-side twin of runGitCapture). */
function gitRun(cwd: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
    };
    const child = spawn('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => { stdout += String(d); });
    child.on('error', () => resolve({ code: -1, stdout }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout }));
  });
}

async function initRepo(dir: string): Promise<void> {
  expect((await gitRun(dir, ['init', '--quiet', '-b', 'main'])).code).toBe(0);
  await gitRun(dir, ['config', '--local', 'core.hooksPath', '/dev/null']);
  await gitRun(dir, ['config', '--local', 'commit.gpgsign', 'false']);
  // Repo-LOCAL identity: the SERVICE's own git commit runs with the plain
  // process env (no test-injected GIT_AUTHOR_*), and a fresh checkout/CI has
  // no global identity — without this the commit dies "Author identity unknown".
  await gitRun(dir, ['config', '--local', 'user.name', 'test']);
  await gitRun(dir, ['config', '--local', 'user.email', 'test@example.com']);
}

async function baseline(dir: string): Promise<void> {
  writeFileSync(join(dir, 'base.txt'), 'baseline\n', 'utf-8');
  expect((await gitRun(dir, ['add', 'base.txt'])).code).toBe(0);
  expect((await gitRun(dir, ['commit', '--quiet', '--no-gpg-sign', '-m', 'baseline'])).code).toBe(0);
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'git-wf-svc-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('gitWorkflowStatus', () => {
  it('a non-git directory answers note:not-a-git-repo (honest, never a throw)', async () => {
    const status = await gitWorkflowStatus(root);
    expect(status.note).toBe('not-a-git-repo');
    expect(status.clean).toBe(true);
  });

  it('clean repo → branch + clean; dirty repo → XY-coded entries incl. untracked', async () => {
    await initRepo(root);
    await baseline(root);
    const clean = await gitWorkflowStatus(root);
    expect(clean.note).toBeUndefined();
    expect(clean.branch).toBe('main');
    expect(clean.clean).toBe(true);

    writeFileSync(join(root, 'base.txt'), 'changed\n', 'utf-8');
    writeFileSync(join(root, 'new.txt'), 'brand new\n', 'utf-8');
    const dirty = await gitWorkflowStatus(root);
    expect(dirty.clean).toBe(false);
    expect(dirty.entries).toContainEqual({ path: 'base.txt', code: ' M' });
    expect(dirty.entries).toContainEqual({ path: 'new.txt', code: '??' });
  });
});

describe('gitWorkflowLog', () => {
  it('parses sha/subject/author/date (field-separator survives spaces in subjects)', async () => {
    await initRepo(root);
    await baseline(root);
    writeFileSync(join(root, 'base.txt'), 'v2\n', 'utf-8');
    await gitRun(root, ['add', '-A']);
    await gitRun(root, ['commit', '--quiet', '--no-gpg-sign', '-m', 'a subject with spaces']);

    const log = await gitWorkflowLog(root, 5);
    expect(Array.isArray(log)).toBe(true);
    const entries = log as Array<{ sha: string; subject: string; author: string; date: string }>;
    expect(entries).toHaveLength(2);
    expect(entries[0]!.subject).toBe('a subject with spaces');
    expect(entries[0]!.author).toBe('test');
    expect(entries[0]!.sha).toMatch(/^[0-9a-f]{7,}$/);
    expect(entries[1]!.subject).toBe('baseline');
  });

  it('unborn HEAD (no commits) → empty array, non-git → note', async () => {
    await initRepo(root);
    expect(await gitWorkflowLog(root)).toEqual([]);
    const nonGit = mkdtempSync(join(tmpdir(), 'git-wf-non-'));
    try {
      expect(await gitWorkflowLog(nonGit)).toEqual({ note: 'not-a-git-repo' });
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });
});

describe('gitWorkflowDiff', () => {
  it('worktree change shows a real hunk; staged:true shows only the staged set', async () => {
    await initRepo(root);
    await baseline(root);
    writeFileSync(join(root, 'base.txt'), 'baseline\nadded line\n', 'utf-8');

    const worktree = await gitWorkflowDiff(root);
    expect(worktree.text).toContain('+added line');
    expect(worktree.truncated).toBe(false);

    const stagedBefore = await gitWorkflowDiff(root, { staged: true });
    expect(stagedBefore.text).toBe('');

    await gitRun(root, ['add', '-A']);
    const stagedAfter = await gitWorkflowDiff(root, { staged: true });
    expect(stagedAfter.text).toContain('+added line');
  });

  it('oversized diffs are truncated at the explicit cap (never silently)', async () => {
    await initRepo(root);
    await baseline(root);
    writeFileSync(join(root, 'big.txt'), `${'x'.repeat(80)}\n`.repeat(1200), 'utf-8');
    await gitRun(root, ['add', 'big.txt']);
    await gitRun(root, ['commit', '--quiet', '--no-gpg-sign', '-m', 'big']);
    writeFileSync(join(root, 'big.txt'), `${'y'.repeat(80)}\n`.repeat(1200), 'utf-8');

    const diff = await gitWorkflowDiff(root);
    expect(diff.truncated).toBe(true);
    expect(diff.text.length).toBe(GIT_DIFF_TEXT_CAP);
  });
});

describe('gitWorkflowAdd', () => {
  it('default stages everything under root (untracked included), explicit paths stage only those', async () => {
    await initRepo(root);
    await baseline(root);
    writeFileSync(join(root, 'a.txt'), 'a\n', 'utf-8');
    writeFileSync(join(root, 'b.txt'), 'b\n', 'utf-8');

    const one = await gitWorkflowAdd(root, ['a.txt']);
    expect(one).toMatchObject({ ok: true, staged: 1 });

    const all = await gitWorkflowAdd(root);
    expect(all).toMatchObject({ ok: true, staged: 2 });
  });

  it('PARENT-REPO SAFETY: a project inside a host repo never stages the host\'s files (`-A -- .`)', async () => {
    // host repo with its own dirty file + a project subdirectory
    await initRepo(root);
    await baseline(root);
    writeFileSync(join(root, 'host-dirty.txt'), 'host change\n', 'utf-8');
    const project = join(root, 'project');
    mkdirSync(project);
    writeFileSync(join(project, 'proj.txt'), 'project file\n', 'utf-8');

    const added = await gitWorkflowAdd(project);
    expect(added.ok).toBe(true);
    const staged = await gitRun(root, ['diff', '--staged', '--name-only']);
    expect(staged.stdout).toContain('project/proj.txt');
    expect(staged.stdout).not.toContain('host-dirty.txt');
  });

  it('a bad explicit path carries git\'s own stderr honestly', async () => {
    await initRepo(root);
    await baseline(root);
    const bad = await gitWorkflowAdd(root, ['no-such-file.txt']);
    expect(bad.ok).toBe(false);
    expect(bad.error).toBeTruthy();
  });
});

describe('gitWorkflowCommit', () => {
  it('commits the staged set and reports the short sha', async () => {
    await initRepo(root);
    await baseline(root);
    writeFileSync(join(root, 'c.txt'), 'c\n', 'utf-8');
    await gitWorkflowAdd(root);

    const committed = await gitWorkflowCommit(root, 'feat: c file\n\ndeckent-run: flow-1');
    expect(committed.ok).toBe(true);
    expect(committed.sha).toMatch(/^[0-9a-f]{7,}$/);
    const log = await gitRun(root, ['log', '-n1', '--pretty=%s']);
    expect(log.stdout.trim()).toBe('feat: c file');
  });

  it('empty message and nothing-staged both fail with honest errors (never a silent no-op)', async () => {
    await initRepo(root);
    await baseline(root);
    expect((await gitWorkflowCommit(root, '   ')).ok).toBe(false);
    const nothing = await gitWorkflowCommit(root, 'no changes staged');
    expect(nothing.ok).toBe(false);
    expect(nothing.error).toBeTruthy();
  });
});

describe('buildCommitProposal', () => {
  it('clean tree → note:clean; untracked-only tree is NOT clean (counted via status)', async () => {
    await initRepo(root);
    await baseline(root);
    expect((await buildCommitProposal(root)).note).toBe('clean');

    writeFileSync(join(root, 'fresh.txt'), 'fresh\n', 'utf-8');
    const proposal = await buildCommitProposal(root);
    expect(proposal.note).toBeUndefined();
    expect(proposal.files).toContainEqual({ path: 'fresh.txt', insertions: 0, deletions: 0 });
  });

  it('intent becomes the subject (72-char cap, first line only) + the deckent-run trailer', async () => {
    await initRepo(root);
    await baseline(root);
    writeFileSync(join(root, 'base.txt'), 'edited\n', 'utf-8');

    const short = await buildCommitProposal(root, { intentSummary: 'add auth flow\nsecond line ignored', flowId: 'flow-abc-123' });
    expect(short.suggestedMessage).toBe('add auth flow\n\ndeckent-run: flow-abc-123');

    const long = await buildCommitProposal(root, { intentSummary: 'x'.repeat(100) });
    const subject = long.suggestedMessage.split('\n')[0]!;
    expect(subject.length).toBe(72);
    expect(subject.endsWith('…')).toBe(true);

    const noIntent = await buildCommitProposal(root, { flowId: 'flow-abc-123' });
    expect(noIntent.suggestedMessage.startsWith('deckent: run flow-abc changes')).toBe(true);
  });

  it('baseSha pins the stats to the run\'s OWN feet (a commit made mid-run still counts)', async () => {
    await initRepo(root);
    await baseline(root);
    const base = (await gitRun(root, ['rev-parse', 'HEAD'])).stdout.trim();
    // the "run" commits a change (worktree ends clean vs HEAD)…
    writeFileSync(join(root, 'base.txt'), 'run edit\n', 'utf-8');
    await gitRun(root, ['add', '-A']);
    await gitRun(root, ['commit', '--quiet', '--no-gpg-sign', '-m', 'mid-run commit']);

    // …so a HEAD-based proposal is clean, but the base-anchored one sees the feet:
    expect((await buildCommitProposal(root)).note).toBe('clean');
    const anchored = await buildCommitProposal(root, { baseSha: base });
    expect(anchored.note).toBeUndefined();
    expect(anchored.files.some((f) => f.path === 'base.txt')).toBe(true);
  });
});

describe('buildRunCommitProposal (flow-aware, N1 gitBase join)', () => {
  it('no handle → HEAD-fallback proposal still works', async () => {
    await initRepo(root);
    await baseline(root);
    writeFileSync(join(root, 'base.txt'), 'x\n', 'utf-8');
    const proposal = await buildRunCommitProposal(root, 'flow-none', 'goal');
    expect(proposal.files.length).toBeGreaterThan(0);
    expect(proposal.suggestedMessage).toContain('goal');
  });

  it('a stored handle\'s gitBase anchors the stats (same feet as --diff)', async () => {
    await initRepo(root);
    await baseline(root);
    const base = (await gitRun(root, ['rev-parse', 'HEAD'])).stdout.trim();
    writeFileSync(join(root, 'base.txt'), 'run output\n', 'utf-8');
    await gitRun(root, ['add', '-A']);
    await gitRun(root, ['commit', '--quiet', '--no-gpg-sign', '-m', 'run commit']);

    saveRunHandle(root, {
      flowId: 'flow-h', revision: 1, planDigest: 'd',
      handle: { flowId: 'flow-h', jobId: 'j', logRef: 'l' },
      startedAt: '2026-07-18T00:00:00.000Z',
      gitBase: base,
    });
    const proposal = await buildRunCommitProposal(root, 'flow-h', 'the goal');
    expect(proposal.note).toBeUndefined();
    expect(proposal.files.some((f) => f.path === 'base.txt')).toBe(true);
    expect(proposal.suggestedMessage).toBe('the goal\n\ndeckent-run: flow-h');
  });
});

describe('runGitCapture', () => {
  it('captures stderr on failure and never throws on a missing cwd-command context', async () => {
    await initRepo(root);
    const res = await runGitCapture(root, ['rev-parse', 'definitely-not-a-ref']);
    expect(res.code).not.toBe(0);
    expect(res.stderr.length).toBeGreaterThan(0);
  });
});
