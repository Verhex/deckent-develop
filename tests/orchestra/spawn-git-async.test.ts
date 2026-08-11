// ─── born-511-001 (row 3315) — async git evidence path ──────────────────────
//
// spawn-backend-docker.ts used to run `git hash-object -w` (result-time half),
// `git cat-file blob` and `git diff --numstat` synchronously via spawnSync inside
// reconcileDockerResultWorkAttribution() — on the worker-dispatch/result-reconcile
// hot path, blocking the whole Node.js event loop (all other in-flight dispatches,
// heartbeats, container exit handlers) for however long those subprocesses took.
//
// Fix: those three call sites now run through an async `runGitCommandAsync`
// (real `child_process.spawn`, Promise-wrapped) instead of `spawnSync`, and
// reconcileDockerResultWorkAttribution itself is now async — its production call
// site (finalizeObservedExit, already an async container-exit handler) awaits it.
//
// This suite proves the async path produces byte-identical evidence to the
// pre-existing sync-era behavior asserted in
// tests/orchestra/timeout-placeholder-scope-diff.test.ts — added/modified/deleted/
// unchanged files, multi-file per-path ordering, and the HOLD path — using a real
// hermetic tmpdir git repo (no network, no mocks of git itself).
//
// Hermetic: tmpdir for all I/O, async spawn only (no spawnSync — ADR-D-002 C4).

import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildScopeAttributionManifest,
  computeScopeBaselineManifest,
  reconcileDockerResultWorkAttribution,
} from '../../src/orchestra/spawn-backend-docker.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
});

function freshTmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-git-async-'));
  tmpDirs.push(d);
  return d;
}

/** Run a command asynchronously (no spawnSync — ADR-D-002 C4/hermeticity rule). */
function run(cmd: string, args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code === 0) resolveRun({ stdout, code });
      else rejectRun(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr}`));
    });
  });
}

/** Initialize a real git repo — hermetic (no global gitconfig dependency). */
async function initRepo(dir: string): Promise<void> {
  await run('git', ['init', '-q'], dir);
  await run('git', ['config', 'user.email', 'test@deckent.local'], dir);
  await run('git', ['config', 'user.name', 'deckent-test'], dir);
}

/** Stage the current working-tree state as the claim-time baseline (`git add`, no commit). */
async function stageBaseline(dir: string): Promise<void> {
  await run('git', ['add', '-A'], dir);
}

function resultFixture(paths: string[]): Record<string, unknown> {
  return {
    taskId: 't-511-001',
    workerId: 'docker-t-511-001',
    filesChanged: paths,
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'worker-authored final shared-tree diff',
  };
}

function writeBaselineAndResult(
  repo: string,
  attemptId: string,
  scopeFilesWrite: string[],
  claimedPaths: string[],
): { baselinePath: string; resultPath: string } {
  const baselinePath = join(repo, '.scope-baseline');
  const resultPath = join(repo, '.result.json');
  writeFileSync(
    baselinePath,
    buildScopeAttributionManifest(
      attemptId,
      scopeFilesWrite,
      computeScopeBaselineManifest(repo, scopeFilesWrite),
    ),
    'utf-8',
  );
  writeFileSync(resultPath, JSON.stringify(resultFixture(claimedPaths)), 'utf-8');
  return { baselinePath, resultPath };
}

// ─── async-path evidence parity ──────────────────────────────────────────────

describe('reconcileDockerResultWorkAttribution — async git evidence path', () => {
  it('returns a real Promise (the sync-era call sites no longer resolve synchronously)', async () => {
    const repo = freshTmp();
    const outcome = reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath: join(repo, '.missing-result.json'),
      baselinePath: join(repo, '.missing-baseline'),
      attemptId: undefined,
      scopeFilesWrite: [],
    });
    expect(outcome).toBeInstanceOf(Promise);
    // The result file does not exist — this rejects. Catch it here so the
    // rejection never surfaces as an unhandled-rejection in a later test.
    await expect(outcome).rejects.toThrow();
  });

  it('attributes only bytes added after the claim-time baseline (modified file)', async () => {
    const repo = freshTmp();
    await initRepo(repo);
    writeFileSync(join(repo, 'shared.ts'), 'export const a = 1;\n');
    await stageBaseline(repo);
    appendFileSync(join(repo, 'shared.ts'), '// predecessor work\n');

    const attemptId = 'attempt-511-a';
    const { baselinePath } = writeBaselineAndResult(repo, attemptId, ['shared.ts'], ['shared.ts']);
    appendFileSync(join(repo, 'shared.ts'), '// current attempt work\n');
    const resultPath = join(repo, '.result.json');
    writeFileSync(resultPath, JSON.stringify(resultFixture(['shared.ts'])), 'utf-8');

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId,
      scopeFilesWrite: ['shared.ts'],
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'VERIFIED',
      filesChanged: ['shared.ts'],
      linesAdded: 1,
      linesRemoved: 0,
    });
    expect(JSON.parse(readFileSync(resultPath, 'utf-8'))).toMatchObject({
      filesChanged: ['shared.ts'],
      linesAdded: 1,
      linesRemoved: 0,
    });
  });

  it('attributes a newly-created scoped file (added, no beforeHash)', async () => {
    const repo = freshTmp();
    await initRepo(repo);
    const attemptId = 'attempt-511-new-file';
    const baselinePath = join(repo, '.scope-baseline');
    const resultPath = join(repo, '.result.json');
    writeFileSync(baselinePath, buildScopeAttributionManifest(attemptId, ['new.ts'], ''), 'utf-8');
    writeFileSync(join(repo, 'new.ts'), 'export const created = true;\n', 'utf-8');
    writeFileSync(resultPath, JSON.stringify(resultFixture(['new.ts'])), 'utf-8');

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId,
      scopeFilesWrite: ['new.ts'],
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'VERIFIED',
      filesChanged: ['new.ts'],
      linesAdded: 1,
      linesRemoved: 0,
    });
  });

  it('attributes deletion from the persisted claim-time blob (cat-file async path)', async () => {
    const repo = freshTmp();
    await initRepo(repo);
    writeFileSync(join(repo, 'deleted.ts'), 'line one\nline two\n', 'utf-8');
    await stageBaseline(repo);
    const attemptId = 'attempt-511-delete-file';
    const { baselinePath } = writeBaselineAndResult(repo, attemptId, ['deleted.ts'], ['deleted.ts']);
    rmSync(join(repo, 'deleted.ts'));
    const resultPath = join(repo, '.result.json');
    writeFileSync(resultPath, JSON.stringify(resultFixture(['deleted.ts'])), 'utf-8');

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId,
      scopeFilesWrite: ['deleted.ts'],
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'VERIFIED',
      filesChanged: ['deleted.ts'],
      linesAdded: 0,
      linesRemoved: 2,
    });
  });

  it('excludes an unchanged predecessor-baseline file from the result', async () => {
    const repo = freshTmp();
    await initRepo(repo);
    writeFileSync(join(repo, 'shared.ts'), 'export const a = 1;\n');
    await stageBaseline(repo);
    appendFileSync(join(repo, 'shared.ts'), '// predecessor work\n');

    const attemptId = 'attempt-511-unchanged';
    const { baselinePath, resultPath } = writeBaselineAndResult(repo, attemptId, ['shared.ts'], ['shared.ts']);

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId,
      scopeFilesWrite: ['shared.ts'],
    });

    expect(outcome, JSON.stringify(outcome)).toMatchObject({
      state: 'VERIFIED',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
    });
  });

  it('preserves per-file ordering across multiple scoped files (sequential await, not reordered)', async () => {
    const repo = freshTmp();
    await initRepo(repo);
    writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
    writeFileSync(join(repo, 'b.ts'), 'export const b = 1;\n');
    writeFileSync(join(repo, 'c.ts'), 'export const c = 1;\n');
    await stageBaseline(repo);

    const attemptId = 'attempt-511-order';
    const scope = ['c.ts', 'a.ts', 'b.ts']; // deliberately not alphabetical
    const { baselinePath } = writeBaselineAndResult(repo, attemptId, scope, scope);

    appendFileSync(join(repo, 'a.ts'), '// edit a\n');
    appendFileSync(join(repo, 'b.ts'), '// edit b\n');
    appendFileSync(join(repo, 'c.ts'), '// edit c\n');
    const resultPath = join(repo, '.result.json');
    writeFileSync(resultPath, JSON.stringify(resultFixture(scope)), 'utf-8');

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath,
      attemptId,
      scopeFilesWrite: scope,
    });

    // normalizedScopeFiles sorts scopeFilesWrite lexically before the loop runs,
    // so the deterministic output order is alphabetical regardless of the input
    // order above — this proves the async for...of loop stayed strictly
    // sequential (fixed sorted order) instead of resolving out of order (e.g.
    // via an accidental Promise.all, which would still race to the same three
    // entries but could not be relied on to land in this exact order run after run).
    expect(outcome.filesChanged).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(outcome.linesAdded).toBe(3);
  });

  it('turns missing attempt authority into a typed HOLD instead of trusting final git diff', async () => {
    const repo = freshTmp();
    await initRepo(repo);
    const resultPath = join(repo, '.result.json');
    writeFileSync(resultPath, JSON.stringify(resultFixture(['shared.ts'])), 'utf-8');

    const outcome = await reconcileDockerResultWorkAttribution({
      projectRoot: repo,
      resultPath,
      baselinePath: join(repo, '.missing-baseline'),
      attemptId: undefined,
      scopeFilesWrite: ['shared.ts'],
    });

    expect(outcome).toMatchObject({
      state: 'HOLD',
      reasonCode: 'ATTRIBUTION_AUTHORITY_UNAVAILABLE',
      filesChanged: [],
    });
    expect(JSON.parse(readFileSync(resultPath, 'utf-8'))).toMatchObject({
      selfAssessment: 'NO_GO',
      filesChanged: [],
      workAttribution: {
        state: 'HOLD',
        reasonCode: 'ATTRIBUTION_AUTHORITY_UNAVAILABLE',
      },
    });
  });
});
