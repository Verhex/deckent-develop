// ═══ sync git-detection — 7104 (real git, no mocks) ═══════════════════════
//
// getChangedFiles(root, commitCount) must never silently report "no
// changes" when git itself fails, or misreport the comparison base when the
// requested commit window reaches (or exceeds) the repository's actual
// history. Exercised against a REAL git binary in a REAL tmpdir repo — the
// only honest proof for a bug that was a silent git failure in the first
// place. Async spawn only in test setup (hermeticity); the function under
// test itself calls spawnSync (pre-existing production pattern, unchanged
// here — see src/cli/commands/sync.ts).

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import {
  getChangedFiles,
  probeCommitsSince,
  getCommitsSince,
  collectGitChanges,
} from '../../src/cli/commands/sync.js';

// A fixed baseline epoch (2026-01-01T00:00:00Z) plus a per-commit offset
// gives every commit a distinct, deterministic, monotonically increasing
// author/committer date — no reliance on wall-clock time.
const BASE_EPOCH_SECONDS = 1767225600;

function gitRun(cwd: string, args: string[], env?: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += String(d); });
    child.stderr.on('data', (d: Buffer) => { stderr += String(d); });
    child.on('error', () => resolve({ code: -1, stdout, stderr }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function initRepo(dir: string): Promise<void> {
  expect((await gitRun(dir, ['init', '-q'])).code).toBe(0);
  // Hermeticity: never let a host/global hook or gpg prompt touch the test.
  await gitRun(dir, ['config', '--local', 'core.hooksPath', '/dev/null']);
  await gitRun(dir, ['config', '--local', 'commit.gpgsign', 'false']);
}

let commitSeq = 0;

/** Write `fileName`, stage it, and commit with a fixed, deterministic date. */
async function commitFile(dir: string, fileName: string, content: string, message: string): Promise<void> {
  writeFileSync(join(dir, fileName), content, 'utf-8');
  expect((await gitRun(dir, ['add', fileName])).code).toBe(0);
  await commit(dir, message);
}

/** Commit whatever is currently staged, with a fixed deterministic date. */
async function commit(dir: string, message: string): Promise<void> {
  const fixedDate = `@${BASE_EPOCH_SECONDS + commitSeq} +0000`;
  commitSeq += 1;
  const result = await gitRun(dir, [
    '-c', 'user.name=Deckent Test',
    '-c', 'user.email=deckent-test@example.com',
    'commit', '--quiet', '--no-gpg-sign', '-m', message,
  ], {
    GIT_AUTHOR_DATE: fixedDate,
    GIT_COMMITTER_DATE: fixedDate,
  });
  expect(result.code).toBe(0);
}

let root: string;

beforeEach(() => {
  commitSeq = 0;
  root = mkdtempSync(join(tmpdir(), 'deckent-sync-git-detect-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('getChangedFiles — real git (7104)', () => {
  it('(a) single commit, commitCount 1 → root-fallback; added includes the committed file', async () => {
    await initRepo(root);
    await commitFile(root, 'first.txt', 'first\n', 'first commit');

    const changes = getChangedFiles(root, 1);

    expect(changes.detection).toEqual({ mode: 'root-fallback', issue: null });
    expect(changes.added).toEqual(['first.txt']);
    expect(changes.modified).toEqual([]);
    expect(changes.deleted).toEqual([]);
    expect(changes.renamed).toEqual([]);
  });

  it('(b) N == history depth (2 commits, count 2) → root-fallback; added has files from BOTH commits, modified empty', async () => {
    await initRepo(root);
    await commitFile(root, 'a.txt', 'a\n', 'commit a');
    await commitFile(root, 'b.txt', 'b\n', 'commit b');

    const changes = getChangedFiles(root, 2);

    expect(changes.detection).toEqual({ mode: 'root-fallback', issue: null });
    expect([...changes.added].sort()).toEqual(['a.txt', 'b.txt']);
    expect(changes.modified).toEqual([]);
  });

  it('(c) N < history depth (3 commits, count 2) → range; modified/added exact', async () => {
    await initRepo(root);
    await commitFile(root, 'a.txt', 'a\n', 'commit a');       // HEAD~2
    await commitFile(root, 'a.txt', 'a v2\n', 'modify a');     // HEAD~1
    await commitFile(root, 'c.txt', 'c\n', 'add c');           // HEAD

    const changes = getChangedFiles(root, 2);

    expect(changes.detection).toEqual({ mode: 'range', issue: null });
    expect(changes.modified).toEqual(['a.txt']);
    expect(changes.added).toEqual(['c.txt']);
    expect(changes.deleted).toEqual([]);
  });

  it('(d) rename: commit a file, then git mv + commit, count 1 → renamed has the new path, not modified/added', async () => {
    await initRepo(root);
    await commitFile(root, 'old-name.txt', 'stable content that survives the move\n', 'add old-name.txt');

    expect((await gitRun(root, ['mv', 'old-name.txt', 'new-name.txt'])).code).toBe(0);
    await commit(root, 'rename old-name.txt to new-name.txt');

    const changes = getChangedFiles(root, 1);

    expect(changes.detection.mode).toBe('range');
    expect(changes.renamed).toEqual(['new-name.txt']);
    expect(changes.modified).not.toContain('new-name.txt');
    expect(changes.added).not.toContain('new-name.txt');
  });

  it('(e) non-repository directory, count 1 → unavailable / GIT_REV_LIST_FAILED, lists empty', () => {
    // `root` is a plain tmpdir — never git-initialized.
    const changes = getChangedFiles(root, 1);

    expect(changes.detection.mode).toBe('unavailable');
    expect(changes.detection.issue?.code).toBe('GIT_REV_LIST_FAILED');
    expect(typeof changes.detection.issue?.detail).toBe('string');
    expect(changes.detection.issue?.detail.length).toBeGreaterThan(0);
    expect(changes.modified).toEqual([]);
    expect(changes.added).toEqual([]);
    expect(changes.deleted).toEqual([]);
    expect(changes.renamed).toEqual([]);
  });

  it('(f) empty repository (git init, no commits), count 1 → unavailable / GIT_REV_LIST_FAILED', async () => {
    await initRepo(root);
    // No commits — HEAD is unborn, so `git rev-list --count HEAD` fails.

    const changes = getChangedFiles(root, 1);

    expect(changes.detection.mode).toBe('unavailable');
    expect(changes.detection.issue?.code).toBe('GIT_REV_LIST_FAILED');
    expect(typeof changes.detection.issue?.detail).toBe('string');
    expect(changes.detection.issue?.detail.length).toBeGreaterThan(0);
    expect(changes.modified).toEqual([]);
    expect(changes.added).toEqual([]);
    expect(changes.deleted).toEqual([]);
    expect(changes.renamed).toEqual([]);
  });
});

// ═══ (g)/(h) object-format coverage — root-fallback must hold regardless of
// the repository's hash algorithm (7104 correction): it is derived from the
// repository itself (`git ls-tree -r --name-only HEAD`), never a fixed
// empty-tree object id, so a SHA-256 repository (where the SHA-1 empty-tree
// id does not exist as an object) behaves identically to a SHA-1 one. ═══

let sha256Supported = true;

beforeAll(async () => {
  // Toolchain probe (7104 correction): `--object-format=sha256` requires a
  // git build compiled with SHA-256 support. When unsupported, the (g) tests
  // below are an honest typed HOLD (`it.skipIf`, title-flagged) rather than a
  // silent pass or a hard failure of an environment limitation this suite
  // does not control.
  const probeDir = mkdtempSync(join(tmpdir(), 'deckent-sync-git-detect-sha256-probe-'));
  try {
    const result = await gitRun(probeDir, ['init', '-q', '--object-format=sha256']);
    sha256Supported = result.code === 0;
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
});

describe('getChangedFiles — SHA-256 object-format repository (7104 correction, real git)', () => {
  // Deliberately independent of the shared module-level `root`/`commitSeq`
  // (reset by the outer `beforeEach`/`afterEach` before/after EVERY test in
  // this file): the second case below continues the SAME repository the
  // first case created, so this describe owns its own repo dir and its own
  // monotonically increasing commit-date counter, cleaned up in `afterAll`.
  let sha256Repo: string | null = null;
  const SHA256_BASE_EPOCH_SECONDS = BASE_EPOCH_SECONDS + 100_000;
  let sha256CommitSeq = 0;

  async function commitFileSha256(dir: string, fileName: string, content: string, message: string): Promise<void> {
    writeFileSync(join(dir, fileName), content, 'utf-8');
    expect((await gitRun(dir, ['add', fileName])).code).toBe(0);
    const fixedDate = `@${SHA256_BASE_EPOCH_SECONDS + sha256CommitSeq} +0000`;
    sha256CommitSeq += 1;
    const result = await gitRun(dir, [
      '-c', 'user.name=Deckent Test',
      '-c', 'user.email=deckent-test@example.com',
      'commit', '--quiet', '--no-gpg-sign', '-m', message,
    ], {
      GIT_AUTHOR_DATE: fixedDate,
      GIT_COMMITTER_DATE: fixedDate,
    });
    expect(result.code).toBe(0);
  }

  afterAll(() => {
    if (sha256Repo) {
      rmSync(sha256Repo, { recursive: true, force: true });
      sha256Repo = null;
    }
  });

  it.skipIf(!sha256Supported)(
    'HOLD: git toolchain lacks --object-format=sha256 — (g1) 2 commits, count 2 → root-fallback; added has both files',
    async () => {
      sha256Repo = mkdtempSync(join(tmpdir(), 'deckent-sync-git-detect-sha256-'));
      expect((await gitRun(sha256Repo, ['init', '-q', '--object-format=sha256'])).code).toBe(0);
      await gitRun(sha256Repo, ['config', '--local', 'core.hooksPath', '/dev/null']);
      await gitRun(sha256Repo, ['config', '--local', 'commit.gpgsign', 'false']);

      const formatResult = await gitRun(sha256Repo, ['rev-parse', '--show-object-format']);
      expect(formatResult.stdout.trim()).toBe('sha256');

      await commitFileSha256(sha256Repo, 'a.txt', 'a\n', 'commit a');
      await commitFileSha256(sha256Repo, 'b.txt', 'b\n', 'commit b');

      const changes = getChangedFiles(sha256Repo, 2);
      expect(changes.detection).toEqual({ mode: 'root-fallback', issue: null });
      expect([...changes.added].sort()).toEqual(['a.txt', 'b.txt']);
      expect(changes.modified).toEqual([]);
      expect(changes.deleted).toEqual([]);
      expect(changes.renamed).toEqual([]);
    },
  );

  it.skipIf(!sha256Supported)(
    'HOLD: git toolchain lacks --object-format=sha256 — (g2) same repo, 3rd commit modifies a.txt, count 1 → range; modified has a.txt',
    async () => {
      expect(sha256Repo).not.toBeNull();
      await commitFileSha256(sha256Repo as string, 'a.txt', 'a v2\n', 'modify a');

      const changes = getChangedFiles(sha256Repo as string, 1);
      expect(changes.detection).toEqual({ mode: 'range', issue: null });
      expect(changes.modified).toEqual(['a.txt']);
    },
  );
});

describe('getChangedFiles — explicit SHA-1 object-format repository (7104 correction, real git)', () => {
  it('(h) 2 commits, count 2 → root-fallback; added has both files; show-object-format reports sha1', async () => {
    expect((await gitRun(root, ['init', '-q', '--object-format=sha1'])).code).toBe(0);
    await gitRun(root, ['config', '--local', 'core.hooksPath', '/dev/null']);
    await gitRun(root, ['config', '--local', 'commit.gpgsign', 'false']);

    const formatResult = await gitRun(root, ['rev-parse', '--show-object-format']);
    expect(formatResult.stdout.trim()).toBe('sha1');

    await commitFile(root, 'a.txt', 'a\n', 'commit a');
    await commitFile(root, 'b.txt', 'b\n', 'commit b');

    const changes = getChangedFiles(root, 2);
    expect(changes.detection).toEqual({ mode: 'root-fallback', issue: null });
    expect([...changes.added].sort()).toEqual(['a.txt', 'b.txt']);
    expect(changes.modified).toEqual([]);
    expect(changes.deleted).toEqual([]);
    expect(changes.renamed).toEqual([]);
  });
});

// ═══ (i) probeCommitsSince — real git (7104) ═══════════════════════════════

describe('probeCommitsSince — real git (7104)', () => {
  it('(i1) repo with 2 commits, since far in the past → commits.length 2, issue null', async () => {
    await initRepo(root);
    await commitFile(root, 'a.txt', 'a\n', 'commit a');
    await commitFile(root, 'b.txt', 'b\n', 'commit b');

    const probe = probeCommitsSince(root, '2020-01-01T00:00:00Z');
    expect(probe.commits.length).toBe(2);
    expect(probe.issue).toBeNull();
  });

  it('(i2) repo with 2 commits, since far in the future → a SUCCESSFUL zero: commits [], issue null', async () => {
    await initRepo(root);
    await commitFile(root, 'a.txt', 'a\n', 'commit a');
    await commitFile(root, 'b.txt', 'b\n', 'commit b');

    // Contract note (see final report): the spec's literal '2999-01-01T00:00:00Z'
    // triggers a real `git --since` approxidate overflow on this host's git
    // 2.43.0 for a full datetime-with-time-of-day far enough in the future
    // (empirically: any full ISO timestamp from ~2100 onward wraps and STOPS
    // filtering, so the "future" bound would wrongly include every commit) —
    // verified directly against the git binary, not a guess. '2099-01-01T00:00:00Z'
    // is still unambiguously "far future" relative to every fixture commit
    // date (fixed at 2026-01-01 + offset) and reproduces the intended
    // successful-zero semantics without depending on undefined git-version
    // behavior at extreme dates.
    const probe = probeCommitsSince(root, '2099-01-01T00:00:00Z');
    expect(probe.commits).toEqual([]);
    expect(probe.issue).toBeNull();
  });

  it('(i3) non-repository directory → commits [], issue.code GIT_LOG_FAILED, detail a non-empty string', () => {
    // `root` is a plain tmpdir — never git-initialized.
    const probe = probeCommitsSince(root, '2020-01-01T00:00:00Z');
    expect(probe.commits).toEqual([]);
    expect(probe.issue?.code).toBe('GIT_LOG_FAILED');
    expect(typeof probe.issue?.detail).toBe('string');
    expect(probe.issue?.detail.length).toBeGreaterThan(0);
  });

  it('(i4) unborn branch (git init, no commits) → issue.code GIT_LOG_FAILED', async () => {
    await initRepo(root);
    // No commits — HEAD is unborn, so `git log --since=...` fails.

    const probe = probeCommitsSince(root, '2020-01-01T00:00:00Z');
    expect(probe.commits).toEqual([]);
    expect(probe.issue?.code).toBe('GIT_LOG_FAILED');
  });
});

// ═══ (j) getCommitsSince — legacy wrapper compatibility (7104) ═════════════

describe('getCommitsSince — legacy wrapper compatibility (7104)', () => {
  it('(j1) equals probeCommitsSince(...).commits on success', async () => {
    await initRepo(root);
    await commitFile(root, 'a.txt', 'a\n', 'commit a');
    await commitFile(root, 'b.txt', 'b\n', 'commit b');

    const since = '2020-01-01T00:00:00Z';
    expect(getCommitsSince(root, since)).toEqual(probeCommitsSince(root, since).commits);
  });

  it('(j2) returns [] on the non-repository failure (explicit compat: cannot tell a failure from zero)', () => {
    // `root` is a plain tmpdir — never git-initialized.
    expect(getCommitsSince(root, '2020-01-01T00:00:00Z')).toEqual([]);
  });
});

// ═══ (k) collectGitChanges — real git (7104) ═══════════════════════════════

describe('collectGitChanges — real git (7104)', () => {
  it('(k1) non-repository directory → commits 0, lists empty, detection unavailable/GIT_LOG_FAILED', () => {
    const result = collectGitChanges(root, '2020-01-01T00:00:00Z');
    expect(result.commits).toBe(0);
    expect(result.modified).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.deleted).toEqual([]);
    expect(result.renamed).toEqual([]);
    expect(result.detection.mode).toBe('unavailable');
    expect(result.detection.issue?.code).toBe('GIT_LOG_FAILED');
  });

  it('(k2) repo with 3 commits + far-future since → a SUCCESSFUL zero: {commits:0, detection: range/null} — distinct from (k1)\'s failure', async () => {
    await initRepo(root);
    await commitFile(root, 'a.txt', 'a\n', 'commit a');
    await commitFile(root, 'b.txt', 'b\n', 'commit b');
    await commitFile(root, 'c.txt', 'c\n', 'commit c');

    // See the (i2) note above re: '2099-01-01T00:00:00Z' vs. the literal
    // 2999 spec date — same real `git --since` overflow avoidance.
    const result = collectGitChanges(root, '2099-01-01T00:00:00Z');
    expect(result.commits).toBe(0);
    expect(result.detection).toEqual({ mode: 'range', issue: null });
  });

  it('(k3) repo with 3 commits + since 2020 → commits 3, root-fallback, added has all three files', async () => {
    await initRepo(root);
    await commitFile(root, 'a.txt', 'a\n', 'commit a');
    await commitFile(root, 'b.txt', 'b\n', 'commit b');
    await commitFile(root, 'c.txt', 'c\n', 'commit c');

    const result = collectGitChanges(root, '2020-01-01T00:00:00Z');
    expect(result.commits).toBe(3);
    expect(result.detection.mode).toBe('root-fallback');
    expect([...result.added].sort()).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });
});

// ═══ (l) getChangedFiles — invalid commitCount validation (7104) ══════════

describe('getChangedFiles — invalid commitCount validation (7104)', () => {
  const invalidCommitCounts = [NaN, 1.5, Infinity, -Infinity, -1];

  it.each(invalidCommitCounts)('(l1) throws RangeError for commitCount=%p in a real repo', async (value) => {
    await initRepo(root);
    await commitFile(root, 'a.txt', 'a\n', 'commit a');

    expect(() => getChangedFiles(root, value)).toThrow(RangeError);
  });

  it('(l2) throws RangeError before any git call on a non-repository path (validation precedes git)', () => {
    // `root` is a plain tmpdir — never git-initialized. If validation ran
    // AFTER a git call, this would surface as a git-failure detection
    // (e.g. GIT_REV_LIST_FAILED) rather than a RangeError thrown synchronously.
    expect(() => getChangedFiles(root, NaN)).toThrow(RangeError);
  });
});
