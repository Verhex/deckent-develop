// ─── born-667b (task 427-024): RECON-DIFF — timeout-placeholder task-scope-diff signal ───
//
// The docker backend's on_exit() EXIT-trap (buildOnExitTrap, spawn-backend-docker.ts)
// used to run `git diff --name-only` / `git ls-files --others --exclude-standard` with
// NO pathspec restriction, from the WHOLE project root (bind-mounted read-write into
// every worker's container). In a multi-worker sprint, one worker's `git diff` therefore
// also picked up every OTHER concurrently-running worker's uncommitted changes — a
// worker that touched nothing itself could still get workPresent=true/TIMEOUT_WITH_WORK
// purely because a sibling worker was mid-edit (TT550 phantom-vakası), misleading
// Brain's Spurious-NO_GO reconcile path.
//
// Fix: buildOnExitTrap gained an optional 3rd `scopeFilesWrite` param — when provided,
// both git calls (+ the diffStat shortstat) get a `-- <pathspec>` filter built from the
// task's own scope.filesWrite, so git itself computes the intersection. An empty scope
// (or empty intersection) is reported honestly as workPresent=false, no git call at all.
//
// Coverage:
//   1. buildScopedDiffPathspec — pure quoting (incl. embedded single-quote escape).
//   2. buildOnExitTrap — string-level: 2-arg back-compat, 3-arg empty vs non-empty scope.
//   3. Proof-of-function — real `git init` + real `sh` run of the extracted on_exit
//      diff-computation core (mirrors docker-exit-marker.test.ts's runMarkerHeredoc
//      technique): an in-scope + out-of-scope tracked+untracked file mix proves only
//      in-scope files are counted, and the TT550 regression (all real changes are
//      out-of-scope) proves the empty-intersection case is reported honestly.
//
// Hermetic: tmpdir for all I/O, async spawn only (no spawnSync), real git + real sh.

import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildOnExitTrap,
  buildScopedDiffPathspec,
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
  const d = mkdtempSync(join(tmpdir(), 'deckent-scopediff-'));
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

/**
 * Stage the current working-tree state as the "baseline" — `git add` only, no
 * `git commit`. This project's own WORKER-GIT-GUARD (git-worker-guard.ts) shadows
 * `git` on PATH for worker sessions and denylists `commit` (exit 97) — this test
 * process runs under that same guard, so a real commit is unavailable. `git add`
 * (staging, not denylisted) is an equivalent baseline for this fixture's purposes:
 * `git diff --name-only` (unqualified) compares the worktree against the INDEX,
 * so a staged-then-later-edited file is picked up identically to a
 * committed-then-edited one, and a never-staged new file is still "untracked"
 * for `git ls-files --others --exclude-standard`.
 */
async function stageBaseline(dir: string): Promise<void> {
  await run('git', ['add', '-A'], dir);
}

/**
 * Extract the on_exit() diff-computation + RESULTEOF/NORESULTEOF branch from a
 * buildOnExitTrap() script — everything from `local changed_files=""` through (but
 * NOT including) the trailing `fsync_file "$RFILE"`. Deliberately EXCLUDES the
 * `cd "$CONTAINER_WORKSPACE"` line (a hardcoded `/workspace` in production) so the
 * extracted core runs in whatever `cwd` the test's own `spawn()` call provides —
 * a real isolated tmp git repo, not the real project checkout.
 */
function extractDiffCore(script: string): string {
  const lines = script.split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === 'local changed_files=""');
  if (startIdx === -1) throw new Error('changed_files start marker not found');
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === 'fsync_file "$RFILE"');
  if (endIdx === -1) throw new Error('fsync_file end marker not found');
  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * Run the extracted diff-computation core against a real repo, forcing exitCode
 * (non-zero triggers the TIMEOUT_WITH_WORK branch when changed_files is non-empty;
 * either exit code takes the EXIT_WITHOUT_RESULT else-branch when it is empty) and
 * return the parsed `.result` JSON it writes.
 */
async function runDiffCore(
  repoDir: string,
  script: string,
  exitCode: number,
): Promise<Record<string, unknown>> {
  const rfile = join(repoDir, '.out-result.json');
  const scriptPath = join(repoDir, '.run-core.sh');
  const wrapped = [
    '#!/bin/sh',
    `RFILE=${JSON.stringify(rfile)}`,
    'HBFILE="/nonexistent-hb-file-for-test"',
    `exit_code=${exitCode}`,
    'run_check() {',
    extractDiffCore(script),
    '}',
    'run_check',
  ].join('\n');
  writeFileSync(scriptPath, wrapped, { mode: 0o755 });
  await run('sh', [scriptPath], repoDir);
  return JSON.parse(readFileSync(rfile, 'utf-8')) as Record<string, unknown>;
}

// ─── 1. buildScopedDiffPathspec — pure quoting ───────────────────────────────

describe('buildScopedDiffPathspec', () => {
  it('single-quotes each entry and space-joins them', () => {
    expect(buildScopedDiffPathspec(['src/a.ts', 'tests/b.test.ts'])).toBe(
      "'src/a.ts' 'tests/b.test.ts'",
    );
  });

  it('escapes an embedded single quote via the POSIX close/escape/reopen idiom', () => {
    expect(buildScopedDiffPathspec(["it's/a.ts"])).toBe("'it'\\''s/a.ts'");
  });

  it('drops blank/whitespace-only entries and trims surrounding whitespace', () => {
    expect(buildScopedDiffPathspec(['  x.ts  ', '', '   '])).toBe("'x.ts'");
  });

  it('returns an empty string for an empty list', () => {
    expect(buildScopedDiffPathspec([])).toBe('');
  });
});

// ─── 2. buildOnExitTrap — string-level scoping behavior ──────────────────────

describe('buildOnExitTrap — scope.filesWrite pathspec wiring', () => {
  it('2-arg call (no scope) preserves the legacy unscoped git commands (back-compat)', () => {
    const trap = buildOnExitTrap('legacy-001', 'opus');
    expect(trap).toContain(
      'changed_files=$({ git diff --name-only; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u || true)',
    );
    expect(trap).toContain('diff_stat=$(git diff --shortstat 2>/dev/null');
    expect(trap).not.toContain('git diff --name-only --');
    expect(trap).not.toContain('git diff --shortstat --');
  });

  it('3-arg call with a non-empty scope adds a `-- <pathspec>` filter to every diff command', () => {
    const trap = buildOnExitTrap('scoped-001', 'sonnet', ['src/orchestra/spawn-backend-docker.ts', 'tests/a.ts']);
    const pathspec = "'src/orchestra/spawn-backend-docker.ts' 'tests/a.ts'";
    expect(trap).toContain(`git diff --name-only -- ${pathspec}`);
    expect(trap).toContain(`git ls-files --others --exclude-standard -- ${pathspec}`);
    expect(trap).toContain(`git diff --shortstat -- ${pathspec}`);
  });

  it('3-arg call with an EMPTY scope makes no git call at all — honest empty intersection', () => {
    const trap = buildOnExitTrap('scoped-empty-001', 'sonnet', []);
    expect(trap).toContain('changed_files=""');
    expect(trap).toContain('diff_stat=""');
    expect(trap).not.toContain('git diff --name-only');
    expect(trap).not.toContain('git diff --shortstat');
    expect(trap).not.toContain('git ls-files');
  });
});

// ─── 3. Proof-of-function — real git + real sh ───────────────────────────────

describe('buildOnExitTrap — real-repo proof-of-function (TT550 phantom-vakası regression)', () => {
  it(
    'TIMEOUT_WITH_WORK counts ONLY in-scope files, ignoring a concurrent sibling worker\'s changes',
    async () => {
      const repo = freshTmp();
      await initRepo(repo);
      writeFileSync(join(repo, 'in-scope.ts'), 'export const a = 1;\n');
      writeFileSync(join(repo, 'out-of-scope.ts'), 'export const b = 1;\n');
      await stageBaseline(repo);

      // This task's own edit (tracked, in scope).
      appendFileSync(join(repo, 'in-scope.ts'), '// edited\n');
      // A concurrent SIBLING worker's edit (tracked, out of this task's scope).
      appendFileSync(join(repo, 'out-of-scope.ts'), '// edited by another worker\n');
      // This task's own new file (untracked, in scope).
      writeFileSync(join(repo, 'in-scope-new.ts'), 'export const c = 1;\n');
      // A sibling worker's new file (untracked, out of scope).
      writeFileSync(join(repo, 'out-of-scope-new.ts'), 'export const d = 1;\n');

      const trap = buildOnExitTrap('t-scope', 'sonnet', ['in-scope.ts', 'in-scope-new.ts']);
      const json = await runDiffCore(repo, trap, 1);

      expect(json.selfAssessment).toBe('TIMEOUT_WITH_WORK');
      const filesChanged = json.filesChanged as string[];
      expect(filesChanged.sort()).toEqual(['in-scope-new.ts', 'in-scope.ts']);
      expect(filesChanged).not.toContain('out-of-scope.ts');
      expect(filesChanged).not.toContain('out-of-scope-new.ts');
      expect(json.notes).toContain('git diff shows 2 files modified');
    },
  );

  it(
    'empty intersection (only a sibling worker changed files) honestly reports workPresent=false',
    async () => {
      const repo = freshTmp();
      await initRepo(repo);
      writeFileSync(join(repo, 'mine.ts'), 'export const a = 1;\n');
      writeFileSync(join(repo, 'sibling.ts'), 'export const b = 1;\n');
      await stageBaseline(repo);

      // Only the SIBLING worker's file changes — this task's own file is untouched.
      appendFileSync(join(repo, 'sibling.ts'), '// edited by another worker\n');

      const trap = buildOnExitTrap('t-empty-scope', 'sonnet', ['mine.ts']);
      const json = await runDiffCore(repo, trap, 1);

      // A sprint-wide (unscoped) diff would show 1 file — the scoped signal must not.
      expect(json.selfAssessment).toBe('NO_GO');
      expect(json.markerType).toBe('EXIT_WITHOUT_RESULT');
      expect(json.workPresent).toBe(false);
      expect(json.diffStat).toBe('');
    },
  );

  it('a genuinely in-scope change is still detected (no false negative)', async () => {
    const repo = freshTmp();
    await initRepo(repo);
    writeFileSync(join(repo, 'mine.ts'), 'export const a = 1;\n');
    await stageBaseline(repo);

    appendFileSync(join(repo, 'mine.ts'), '// my own edit\n');

    const trap = buildOnExitTrap('t-real-work', 'sonnet', ['mine.ts']);
    const json = await runDiffCore(repo, trap, 1);

    expect(json.selfAssessment).toBe('TIMEOUT_WITH_WORK');
    expect(json.filesChanged).toEqual(['mine.ts']);
  });
});
