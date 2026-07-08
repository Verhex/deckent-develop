// ─── WORKER-GIT-GUARD (381-001) ────────────────────────────────────────────
// Proves the git-shim actually blocks destructive subcommands and passes
// read-only ones through — real binary, not a mock (ADR-D-002 hermeticity:
// tmpdir fixture, async spawn, no spawnSync) — plus pure-function coverage
// of the PATH-prefix wiring shared by all 3 spawn backends
// (docker/subprocess/tmux).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import {
  buildGitGuardShim,
  installGitGuard,
  resolveHostGitPath,
  buildDockerGitGuardArgs,
  buildGitGuardPathExport,
  buildGitGuardDir,
  prependGitGuardToPath,
  isGitGuardSupportedPlatform,
  GIT_GUARD_DENYLISTED_SUBCOMMANDS,
  GIT_GUARD_BLOCKED_EXIT_CODE,
  CONTAINER_GIT_PATH,
} from '../../src/orchestra/git-worker-guard.js';

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Async spawn wrapper — no spawnSync anywhere in this hermetic test suite. */
function run(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: env ?? process.env });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('git-worker-guard', () => {
  let tmpRoot: string;
  let repoDir: string;
  let shimDir: string;
  let shimPath: string;
  let realGit: string;

  beforeEach(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-git-guard-'));
    repoDir = join(tmpRoot, 'repo');
    shimDir = join(tmpRoot, 'shim');
    realGit = resolveHostGitPath();

    // Real git repo fixture — read-only commands need real history to prove
    // the shim's passthrough path is byte-for-byte real git, not a stub.
    await run(realGit, ['init', repoDir], tmpRoot);
    await run(realGit, ['config', 'user.email', 'guard-test@deckent.local'], repoDir);
    await run(realGit, ['config', 'user.name', 'deckent-guard-test'], repoDir);
    await run(realGit, ['commit', '--allow-empty', '-m', 'init'], repoDir);

    const install = installGitGuard(shimDir, realGit);
    shimPath = join(install.shimDir, 'git');
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('buildGitGuardShim (pure)', () => {
    it('starts with a POSIX shebang and embeds the real git path', () => {
      const script = buildGitGuardShim('/usr/bin/git');
      expect(script.startsWith('#!/bin/sh\n')).toBe(true);
      expect(script).toContain("REAL_GIT='/usr/bin/git'");
    });

    it('lists every denylisted subcommand in the case pattern', () => {
      const script = buildGitGuardShim('/usr/bin/git');
      for (const sub of GIT_GUARD_DENYLISTED_SUBCOMMANDS) {
        expect(script).toContain(sub);
      }
    });

    it('en and tr messages both mention the exit code path and are distinct', () => {
      const en = buildGitGuardShim('/usr/bin/git', 'en');
      const tr = buildGitGuardShim('/usr/bin/git', 'tr');
      expect(en).toContain(`exit ${GIT_GUARD_BLOCKED_EXIT_CODE}`);
      expect(tr).toContain(`exit ${GIT_GUARD_BLOCKED_EXIT_CODE}`);
      expect(en).not.toBe(tr);
      expect(en).toMatch(/is blocked for workers/);
      expect(tr).toMatch(/engellendi/);
    });

    it('escapes an embedded single quote in the real git path', () => {
      const script = buildGitGuardShim("/tmp/weird'path/git");
      expect(script).toContain(String.raw`REAL_GIT='/tmp/weird'\''path/git'`);
    });
  });

  describe('installGitGuard (pure I/O)', () => {
    it('writes an executable dir/git file', () => {
      expect(existsSync(shimPath)).toBe(true);
      const mode = statSync(shimPath).mode & 0o777;
      expect(mode).toBe(0o755);
    });

    it('is idempotent across repeated installs (retry/fix-worker re-spawn)', () => {
      installGitGuard(shimDir, realGit);
      installGitGuard(shimDir, realGit);
      expect(existsSync(shimPath)).toBe(true);
      expect(readFileSync(shimPath, 'utf-8')).toContain('REAL_GIT=');
    });
  });

  describe('real shim execution — blocked subcommands', () => {
    it.each(['stash', 'reset', 'checkout', 'clean', 'rebase', 'commit', 'revert'])(
      'blocks git %s with exit %s and a stderr message',
      async (sub) => {
        const result = await run(shimPath, [sub], repoDir);
        expect(result.code).toBe(GIT_GUARD_BLOCKED_EXIT_CODE);
        expect(result.stderr.length).toBeGreaterThan(0);
        expect(result.stderr).toContain(sub);
      },
    );

    it('blocks `git stash` (bare)', async () => {
      const result = await run(shimPath, ['stash'], repoDir);
      expect(result.code).toBe(GIT_GUARD_BLOCKED_EXIT_CODE);
    });

    it('blocks `git reset --hard`', async () => {
      const result = await run(shimPath, ['reset', '--hard'], repoDir);
      expect(result.code).toBe(GIT_GUARD_BLOCKED_EXIT_CODE);
    });

    it('blocks `git checkout -- .`', async () => {
      const result = await run(shimPath, ['checkout', '--', '.'], repoDir);
      expect(result.code).toBe(GIT_GUARD_BLOCKED_EXIT_CODE);
    });

    it('blocks `git clean -fd`', async () => {
      const result = await run(shimPath, ['clean', '-fd'], repoDir);
      expect(result.code).toBe(GIT_GUARD_BLOCKED_EXIT_CODE);
    });
  });

  describe('real shim execution — read-only passthrough', () => {
    it('passes `git status` through to real git (exit 0, matches real output)', async () => {
      const viaShim = await run(shimPath, ['status'], repoDir);
      const viaReal = await run(realGit, ['status'], repoDir);
      expect(viaShim.code).toBe(0);
      expect(viaShim.stdout).toBe(viaReal.stdout);
    });

    it('passes `git diff` through to real git (exit 0)', async () => {
      const result = await run(shimPath, ['diff'], repoDir);
      expect(result.code).toBe(0);
    });

    it('passes `git show HEAD:` through to real git (disk-verify path stays intact)', async () => {
      const viaShim = await run(shimPath, ['show', 'HEAD'], repoDir);
      const viaReal = await run(realGit, ['show', 'HEAD'], repoDir);
      expect(viaShim.code).toBe(0);
      expect(viaShim.stdout).toBe(viaReal.stdout);
    });

    it('passes an unknown subcommand through unchanged (permissive default)', async () => {
      const result = await run(shimPath, ['--version'], repoDir);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/git version/);
    });
  });

  describe('resolveHostGitPath', () => {
    it('finds a real, existing git binary on this host', () => {
      const resolved = resolveHostGitPath();
      expect(existsSync(resolved)).toBe(true);
    });

    it('falls back to the POSIX default when PATH has no git', () => {
      const resolved = resolveHostGitPath({ PATH: '/no/such/dir' }, 'linux');
      expect(resolved).toBe('/usr/bin/git');
    });

    it('falls back to the win32 default when PATH has no git.exe', () => {
      const resolved = resolveHostGitPath({ PATH: 'C:\\no\\such\\dir' }, 'win32');
      expect(resolved).toBe('git.exe');
    });
  });

  describe('PATH-prefix wiring — docker backend', () => {
    it('buildDockerGitGuardArgs mounts the shim dir read-only under /workspace', () => {
      const result = buildDockerGitGuardArgs('/host/.tasks/.git-guard-381-001', '/workspace');
      expect(result.mountArgs).toEqual(['-v', '/host/.tasks/.git-guard-381-001:/workspace/.git-guard-bin:ro']);
      expect(result.containerShimDir).toBe('/workspace/.git-guard-bin');
      expect(result.exportPathLine).toBe('export PATH="/workspace/.git-guard-bin:$PATH"');
    });

    it('uses the documented Debian/Dockerfile.worker git path as the container default', () => {
      expect(CONTAINER_GIT_PATH).toBe('/usr/bin/git');
    });
  });

  describe('PATH-prefix wiring — subprocess backend', () => {
    it('prependGitGuardToPath prepends onto an existing PATH using the platform delimiter', () => {
      const result = prependGitGuardToPath('/host/.git-guard-x', '/usr/bin:/bin');
      expect(result).toBe(`/host/.git-guard-x${delimiter}/usr/bin:/bin`);
    });

    it('prependGitGuardToPath handles an empty/undefined current PATH', () => {
      expect(prependGitGuardToPath('/host/.git-guard-x', undefined)).toBe('/host/.git-guard-x');
      expect(prependGitGuardToPath('/host/.git-guard-x', '')).toBe('/host/.git-guard-x');
    });

    it('isGitGuardSupportedPlatform is false only for win32', () => {
      expect(isGitGuardSupportedPlatform('linux')).toBe(true);
      expect(isGitGuardSupportedPlatform('darwin')).toBe(true);
      expect(isGitGuardSupportedPlatform('win32')).toBe(false);
    });
  });

  describe('PATH-prefix wiring — tmux backend', () => {
    it('buildGitGuardPathExport produces a POSIX export line for the send-keys prefix', () => {
      expect(buildGitGuardPathExport('/host/.git-guard-381-001')).toBe(
        'export PATH="/host/.git-guard-381-001:$PATH"',
      );
    });
  });

  describe('buildGitGuardDir — project-path non-leak (DECKBROKER-WIRE parity)', () => {
    it('lives outside any project directory (OS tmpdir), never embedding a caller-supplied path', () => {
      const dir = buildGitGuardDir('381-001');
      expect(dir.startsWith(tmpdir())).toBe(true);
      expect(dir).toContain('381-001');
    });

    it('returns a different directory on every call, even for the same taskId (cross-project collision-safety)', () => {
      const a = buildGitGuardDir('381-001');
      const b = buildGitGuardDir('381-001');
      expect(a).not.toBe(b);
    });
  });
});
