// ─── 524-007 — the 523-001-fix unmeasurable-diff RCA ─────────────────────────
//
// Signature under investigation: a worker leaves REAL work on disk, and the
// settled result carries `filesChanged: []` with
// `workAttribution.reasonCode = ATTRIBUTION_DIFF_UNMEASURABLE`. Both 523-001 and
// 523-001-fix settled that way on the same scope while their new files survived
// on disk — so the cause is systematic, not a property of one attempt.
//
// The first draft blamed a stale resume baseline. That theory is REFUTED, twice
// over: the archived result and the landing proposal carry the same attempt id,
// and — pinned by `refutes the stale-baseline theory` below — a baseline bound to
// a foreign attempt is rejected by the header check
// (spawn-backend-docker.ts:2289-2294) as ATTRIBUTION_AUTHORITY_MISMATCH. It can
// never reach the unmeasurable branch. A different mechanism had to be found.
//
// ── The mechanism (measured, with file-and-line evidence) ───────────────────
//
// `reconcileDockerResultWorkAttribution` measures the whole scope inside ONE
// try block (spawn-backend-docker.ts:2306-2328). Its single catch is
// `return hold('ATTRIBUTION_DIFF_UNMEASURABLE')` (:2327). `hold()` (:2280-2284)
// yields `{filesChanged: [], linesAdded: 0, linesRemoved: 0}`, and
// `writeAttributionResult` (:2241-2243) writes that empty set OVER whatever the
// worker claimed, then forces `selfAssessment = 'NO_GO'` (:2255-2259).
//
// So the loop is all-or-nothing: ONE unmeasurable scope entry discards EVERY
// change already measured before it. That is the whole "real work on disk,
// filesChanged: []" signature — the work is not lost, it is merely unclaimed.
//
// Four throw sites reach that catch, each probed against real git:
//   1. gitBlobHash        :2178-2180  E_BLOB_HASH_UNAVAILABLE
//   2. countTextLines     :2185-2186  E_BINARY_OR_UNMEASURABLE_NUMSTAT
//   3. blobNumstat        :2208-2214  E_BINARY_OR_UNMEASURABLE_NUMSTAT
//   4. gitBlobLineCount   :2194-2196  E_BASELINE_BLOB_UNAVAILABLE
//
// ── What fired in sprint 523 ────────────────────────────────────────────────
//
// Throw site 1, on the FIRST scoped file, on every attempt. `runGitCommandAsync`
// (:2147-2149) spawns git with `{cwd, shell: false, stdio}` and NO `env` key, so
// the child inherits `process.env`. A deckent session runs under the git guard,
// which exports git-location variables — measured live in this workspace:
//
//     GIT_DIR=/run/deckent-git/common
//     GIT_COMMON_DIR=/run/deckent-git/common
//     GIT_WORK_TREE=/workspace
//
// Those override `cwd` for repository resolution, and that object store is a
// read-only mount. `git hash-object -w` under it fails with
// `unable to create temporary file: Read-only file system` / `fatal: Unable to
// add <path> to database`, so gitBlobHash throws on the first scoped file
// regardless of its content. Content-independence is exactly why two attempts on
// the same scope produced the identical reason code.
//
// `the 523 signature` below reproduces that inheritance: identical repo,
// identical on-disk work, and the ONLY difference is ambient git-location env —
// VERIFIED with a clean environment, ATTRIBUTION_DIFF_UNMEASURABLE without one.
// A non-repo GIT_DIR stands in for the read-only store so the reproduction is
// deterministic on every host rather than dependent on mount permissions; both
// land on the same non-zero `git hash-object -w`, which is the predicate.
//
// This slice is read-only RCA: it changes NO production behaviour. The fix is a
// NAMED follow-up — see the .result notes.
//
// Hermetic: tmpdir for all I/O, real `git init`, async spawn only (no
// spawnSync) — ADR-D-002 C1/C4. The guard's git env is cleared for the file, in
// the same way and for the same reason as
// tests/orchestra/attribution-limit-death.test.ts:50-79, and restored after.

import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildScopeAttributionManifest,
  computeScopeBaselineManifest,
  reconcileDockerResultWorkAttribution,
  SCOPE_BASELINE_DELIM,
} from '../../src/orchestra/spawn-backend-docker.js';

// ─── hermetic tmp/git helpers ───────────────────────────────────────────────

/**
 * The git guard exports GIT_DIR / GIT_WORK_TREE / GIT_COMMON_DIR pointing at the
 * host repository. Every git these fixtures run — and every git the reconcile
 * itself spawns, since runGitCommandAsync passes no `env` — would otherwise act
 * on that repository instead of the isolated tmp repo. Clearing them is what
 * makes the file hermetic; `the 523 signature` re-sets one of them deliberately,
 * inside a single test, and restores it in a finally.
 */
const GIT_LOCATION_ENV_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
] as const;
const savedGitEnv = new Map<string, string | undefined>();

beforeAll(() => {
  for (const key of GIT_LOCATION_ENV_KEYS) {
    savedGitEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterAll(() => {
  for (const [key, value] of savedGitEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
});

function freshTmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-unmeasurable-rca-'));
  tmpDirs.push(d);
  return d;
}

/** Run a command asynchronously (no spawnSync — ADR-D-002 C4). */
function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr}`));
    });
  });
}

const ATTEMPT_ID = 'attempt-524-007-rca';

interface ReconcileFixture {
  readonly repo: string;
  readonly resultPath: string;
  readonly baselinePath: string;
}

/**
 * A repo whose scoped files are captured in a claim-time baseline. `seed` is the
 * worktree as it looked when the attempt started; the caller then mutates it to
 * model what the attempt actually wrote.
 *
 * `contentManifest` overrides the captured baseline body for the one case that
 * needs a baseline hash git cannot resolve; the header — and therefore the
 * attempt id and scope digest the reconcile validates — is always the real one.
 */
async function fixture(
  scope: readonly string[],
  seed: Record<string, string>,
  contentManifest?: string,
): Promise<ReconcileFixture> {
  const repo = freshTmp();
  await run('git', ['init', '-q'], repo);
  for (const [path, content] of Object.entries(seed)) {
    const slash = path.lastIndexOf('/');
    if (slash > 0) mkdirSync(join(repo, path.slice(0, slash)), { recursive: true });
    writeFileSync(join(repo, path), content, 'utf-8');
  }
  const baselinePath = join(repo, '.scope-baseline');
  writeFileSync(
    baselinePath,
    buildScopeAttributionManifest(
      ATTEMPT_ID,
      scope,
      contentManifest ?? await computeScopeBaselineManifest(repo, scope),
    ),
    'utf-8',
  );
  const resultPath = join(repo, '.result.json');
  return { repo, resultPath, baselinePath };
}

/** A worker result carrying a claim — the thing a HOLD overwrites. */
function writeWorkerResult(resultPath: string, overrides: Record<string, unknown> = {}): void {
  writeFileSync(resultPath, JSON.stringify({
    taskId: 't-524-007',
    workerId: 'docker-t-524-007',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'worker prose',
    ...overrides,
  }), 'utf-8');
}

function readResult(resultPath: string): Record<string, any> {
  return JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, any>;
}

/** The real, measurable edit every fixture below models as "the work". */
const REAL_FILE = 'src/real.ts';
const REAL_BEFORE = 'export const a = 1;\n';
const REAL_AFTER = 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n';

// ─── A. the mechanism: one bad entry discards every measured change ──────────

describe('ATTRIBUTION_DIFF_UNMEASURABLE — the all-or-nothing scope loop', () => {
  // Sorts after REAL_FILE under localeCompare (spawn-backend-docker.ts:2029), so
  // the real change is already measured and sitting in `changes` when the throw
  // happens. That ordering is the point: what is discarded is measured work.
  const LATE_BAD = 'zz-unmeasurable.bin';

  it('measures the real edit on its own — the work IS measurable and IS on disk', async () => {
    const scope = [REAL_FILE];
    const { repo, resultPath, baselinePath } = await fixture(scope, { [REAL_FILE]: REAL_BEFORE });
    writeFileSync(join(repo, REAL_FILE), REAL_AFTER, 'utf-8');
    writeWorkerResult(resultPath, { filesChanged: [REAL_FILE], linesAdded: 2 });

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo, resultPath, baselinePath, attemptId: ATTEMPT_ID, scopeFilesWrite: scope,
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'VERIFIED', filesChanged: [REAL_FILE], linesAdded: 2, linesRemoved: 0,
    });
  });

  it('discards that measured change wholesale when a later scope entry is unmeasurable', async () => {
    const scope = [REAL_FILE, LATE_BAD];
    const { repo, resultPath, baselinePath } = await fixture(scope, { [REAL_FILE]: REAL_BEFORE });
    // Identical real work as the control above …
    writeFileSync(join(repo, REAL_FILE), REAL_AFTER, 'utf-8');
    // … plus one entry the line-count evidence path cannot measure.
    writeFileSync(join(repo, LATE_BAD), Buffer.from([0x41, 0x00, 0x42]));
    writeWorkerResult(resultPath, { filesChanged: [REAL_FILE], linesAdded: 2 });

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo, resultPath, baselinePath, attemptId: ATTEMPT_ID, scopeFilesWrite: scope,
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'ATTRIBUTION_DIFF_UNMEASURABLE',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
    });
    // The measured edit is gone from the settled result …
    const result = readResult(resultPath);
    expect(result.filesChanged).toEqual([]);
    expect(result.linesAdded).toBe(0);
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.notes).toContain('WORK_ATTRIBUTION_HOLD:ATTRIBUTION_DIFF_UNMEASURABLE');
    // … while the work itself is still sitting on disk, untouched. Unclaimed,
    // not lost — the exact 523-001-fix signature.
    expect(readFileSync(join(repo, REAL_FILE), 'utf-8')).toBe(REAL_AFTER);
  });

  it('overwrites a worker claim that named real in-scope files', async () => {
    const scope = [REAL_FILE, LATE_BAD];
    const { repo, resultPath, baselinePath } = await fixture(scope, { [REAL_FILE]: REAL_BEFORE });
    writeFileSync(join(repo, REAL_FILE), REAL_AFTER, 'utf-8');
    writeFileSync(join(repo, LATE_BAD), Buffer.from([0x00]));
    // The worker reported its work honestly and in scope.
    writeWorkerResult(resultPath, {
      filesChanged: [REAL_FILE], linesAdded: 2, linesRemoved: 0, selfAssessment: 'DONE',
    });

    await reconcileDockerResultWorkAttribution({
      projectRoot: repo, resultPath, baselinePath, attemptId: ATTEMPT_ID, scopeFilesWrite: scope,
    });

    const result = readResult(resultPath);
    // An in-scope claim, so nothing was flagged as a boundary violation — the
    // claim was simply erased by the hold.
    expect(result.workAttribution.claimedOutsideScope).toBeUndefined();
    expect(result.filesChanged).toEqual([]);
    expect(result.totalLinesAdded).toBe(0);
    expect(result.selfAssessment).toBe('NO_GO');
  });
});

// ─── B. every reachable throw site funnels into the one catch ────────────────

describe('ATTRIBUTION_DIFF_UNMEASURABLE — the four throw sites', () => {
  it('gitBlobHash: a scope entry that is a directory at reconcile time (E_BLOB_HASH_UNAVAILABLE)', async () => {
    // Absent at baseline, so capture omits it without complaint
    // (computeScopeBaselineManifest skips what does not exist); present at
    // reconcile, where `git hash-object -w -- <dir>` exits 128.
    const scope = [REAL_FILE, 'zz-created-dir'];
    const { repo, resultPath, baselinePath } = await fixture(scope, { [REAL_FILE]: REAL_BEFORE });
    writeFileSync(join(repo, REAL_FILE), REAL_AFTER, 'utf-8');
    mkdirSync(join(repo, 'zz-created-dir'));
    writeWorkerResult(resultPath);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo, resultPath, baselinePath, attemptId: ATTEMPT_ID, scopeFilesWrite: scope,
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'HOLD', reasonCode: 'ATTRIBUTION_DIFF_UNMEASURABLE', filesChanged: [],
    });
  });

  it('countTextLines: a file created with a NUL byte (E_BINARY_OR_UNMEASURABLE_NUMSTAT)', async () => {
    const scope = ['zz-new.bin'];
    const { repo, resultPath, baselinePath } = await fixture(scope, {});
    writeFileSync(join(repo, 'zz-new.bin'), Buffer.from([0x41, 0x00, 0x42]));
    writeWorkerResult(resultPath);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo, resultPath, baselinePath, attemptId: ATTEMPT_ID, scopeFilesWrite: scope,
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'HOLD', reasonCode: 'ATTRIBUTION_DIFF_UNMEASURABLE',
    });
  });

  it('blobNumstat: a baselined text file rewritten as binary (numstat prints "-\\t-")', async () => {
    // `git diff --numstat <textBlob> <binaryBlob>` exits 0 and prints "-\t-", so
    // this one is caught by the digit regex at :2210-2212, not by an exit code.
    const scope = ['zz-flipped.dat'];
    const { repo, resultPath, baselinePath } = await fixture(scope, { 'zz-flipped.dat': 'a\nb\n' });
    writeFileSync(join(repo, 'zz-flipped.dat'), Buffer.from([0x61, 0x00, 0x62, 0x0a]));
    writeWorkerResult(resultPath);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo, resultPath, baselinePath, attemptId: ATTEMPT_ID, scopeFilesWrite: scope,
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'HOLD', reasonCode: 'ATTRIBUTION_DIFF_UNMEASURABLE',
    });
  });

  it('gitBlobLineCount: a deleted file whose baseline blob is not in the object store', async () => {
    // Models a baseline whose loose blob no longer resolves — the delete branch
    // asks git to count lines in a blob it cannot read, and `git cat-file` exits
    // 128. The header stays authentic; only the content line is fabricated.
    const scope = ['zz-deleted.ts'];
    const missingBlob = '0'.repeat(40);
    const { repo, resultPath, baselinePath } = await fixture(
      scope, {}, `zz-deleted.ts${SCOPE_BASELINE_DELIM}${missingBlob}\n`,
    );
    // The file is absent on disk, so afterHash is null and the delete branch runs.
    writeWorkerResult(resultPath);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo, resultPath, baselinePath, attemptId: ATTEMPT_ID, scopeFilesWrite: scope,
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'HOLD', reasonCode: 'ATTRIBUTION_DIFF_UNMEASURABLE',
    });
  });
});

// ─── C. the 523 signature: ambient git-location env is inherited ─────────────

describe('ATTRIBUTION_DIFF_UNMEASURABLE — the sprint-523 mechanism', () => {
  it('the 523 signature: identical work, measurable only when git-location env is absent', async () => {
    const scope = [REAL_FILE];

    // Control — clean environment, real work on disk, measured exactly.
    const clean = await fixture(scope, { [REAL_FILE]: REAL_BEFORE });
    writeFileSync(join(clean.repo, REAL_FILE), REAL_AFTER, 'utf-8');
    writeWorkerResult(clean.resultPath, { filesChanged: [REAL_FILE], linesAdded: 2 });
    const measured = await reconcileDockerResultWorkAttribution({
      projectRoot: clean.repo,
      resultPath: clean.resultPath,
      baselinePath: clean.baselinePath,
      attemptId: ATTEMPT_ID,
      scopeFilesWrite: scope,
    });
    expect(measured, JSON.stringify(measured)).toMatchObject({
      state: 'VERIFIED', filesChanged: [REAL_FILE], linesAdded: 2,
    });

    // Same repo shape, same edit, same baseline — the ONLY difference is that a
    // git-location variable is set in the ambient environment, exactly as the
    // guard sets GIT_DIR=/run/deckent-git/common for a deckent session.
    // runGitCommandAsync (spawn-backend-docker.ts:2147-2149) passes no `env`, so
    // the spawned git inherits it and stops resolving `cwd` as the repository.
    const guarded = await fixture(scope, { [REAL_FILE]: REAL_BEFORE });
    writeFileSync(join(guarded.repo, REAL_FILE), REAL_AFTER, 'utf-8');
    writeWorkerResult(guarded.resultPath, { filesChanged: [REAL_FILE], linesAdded: 2 });

    const foreignGitDir = join(freshTmp(), 'not-a-repo');
    mkdirSync(foreignGitDir, { recursive: true });
    const savedGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = foreignGitDir;
    let outcome;
    try {
      outcome = await reconcileDockerResultWorkAttribution({
        projectRoot: guarded.repo,
        resultPath: guarded.resultPath,
        baselinePath: guarded.baselinePath,
        attemptId: ATTEMPT_ID,
        scopeFilesWrite: scope,
      });
    } finally {
      if (savedGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = savedGitDir;
    }

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'ATTRIBUTION_DIFF_UNMEASURABLE',
      filesChanged: [],
      linesAdded: 0,
    });
    // The worker's honest claim is erased and the attempt is downgraded, though
    // its work is still on disk and was provably measurable moments earlier.
    const result = readResult(guarded.resultPath);
    expect(result.filesChanged).toEqual([]);
    expect(result.selfAssessment).toBe('NO_GO');
    expect(readFileSync(join(guarded.repo, REAL_FILE), 'utf-8')).toBe(REAL_AFTER);
  });

  it('refutes the stale-baseline theory: a foreign attempt id holds as AUTHORITY_MISMATCH', async () => {
    // A baseline bound to another attempt is rejected by the header check
    // (:2289-2294) before the measurement loop is ever entered, so a resume
    // against an old baseline cannot produce ATTRIBUTION_DIFF_UNMEASURABLE.
    const scope = [REAL_FILE];
    const { repo, resultPath, baselinePath } = await fixture(scope, { [REAL_FILE]: REAL_BEFORE });
    writeFileSync(join(repo, REAL_FILE), REAL_AFTER, 'utf-8');
    writeWorkerResult(resultPath);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId: 'a-different-attempt-id',
      scopeFilesWrite: scope,
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'HOLD', reasonCode: 'ATTRIBUTION_AUTHORITY_MISMATCH',
    });
    expect(outcome.reasonCode).not.toBe('ATTRIBUTION_DIFF_UNMEASURABLE');
  });
});
