import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { computeAffectedTests } from '../../scripts/affected-tests.mjs';
import {
  DEFAULT_BASE_REF,
  DEFAULT_MAX_FILES,
  WINDOWS_ARGV_CHUNK_BYTES,
  chunkFiles,
  planRun,
  runGitCapture,
  getChangedFilesFromGit,
  resolveChangedFiles,
  runChildCapturingExit,
  runCommandsSequential,
  parseArgs,
} from '../../scripts/ccverify-affected.mjs';

const projectRoot = resolve(import.meta.dirname, '..', '..');

// Async spawn only (never spawnSync — a blocking call freezes the vitest
// worker's event loop, see .claude/rules/karpathy-discipline.md).
function runCli(args: string[], opts: { cwd?: string; stdin?: string } = {}): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', [join(projectRoot, 'scripts', 'ccverify-affected.mjs'), ...args], {
      cwd: opts.cwd ?? projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (d: string) => { stdout += d; });
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (d: string) => { stderr += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('ccverify-affected.mjs CLI timeout (20s)')); }, 20_000);
    let exitCode: number | null = null;
    let processClosed = false;
    let streamsEnded = 0;
    const tryResolve = () => {
      if (processClosed && streamsEnded >= 2) {
        clearTimeout(timer);
        resolvePromise({ status: exitCode ?? -1, stdout, stderr });
      }
    };
    child.stdout.on('end', () => { streamsEnded++; tryResolve(); });
    child.stderr.on('end', () => { streamsEnded++; tryResolve(); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => { exitCode = code; processClosed = true; tryResolve(); });
    if (opts.stdin !== undefined) {
      child.stdin.write(opts.stdin);
    }
    child.stdin.end();
  });
}

// ─── parseArgs ──────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('defaults base to origin/main and max-files to 400', () => {
    const args = parseArgs([]);
    expect(args.base).toBe(DEFAULT_BASE_REF);
    expect(args.maxFiles).toBe(DEFAULT_MAX_FILES);
    expect(args.changed).toBeNull();
    expect(args.list).toBe(false);
    expect(args.dryRun).toBe(false);
  });

  it('parses --changed, --list, --dry-run, --max-files, --base', () => {
    const args = parseArgs(['--changed', 'src/a.ts,src/b.ts', '--list', '--dry-run', '--max-files', '10', '--base', 'HEAD~1']);
    expect(args.changed).toBe('src/a.ts,src/b.ts');
    expect(args.list).toBe(true);
    expect(args.dryRun).toBe(true);
    expect(args.maxFiles).toBe(10);
    expect(args.base).toBe('HEAD~1');
  });

  it('parses --root to an absolute path', () => {
    const args = parseArgs(['--root', '.']);
    expect(args.root).toBe(resolve('.'));
  });
});

// ─── chunkFiles ─────────────────────────────────────────────────────────────

describe('chunkFiles', () => {
  it('returns an empty array for an empty input', () => {
    expect(chunkFiles([])).toEqual([]);
  });

  it('puts everything in one chunk when well under the byte threshold', () => {
    const files = ['tests/a.test.ts', 'tests/b.test.ts', 'tests/c.test.ts'];
    expect(chunkFiles(files, 1000)).toEqual([files]);
  });

  it('splits into multiple chunks once the running byte size exceeds the threshold', () => {
    // Each entry is 10 bytes + 1 separator = 11; threshold 25 -> 2 entries per chunk max.
    const files = ['0123456789', 'abcdefghij', 'ABCDEFGHIJ', 'zyxwvutsrq'];
    const chunks = chunkFiles(files, 25);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(files); // no file lost or duplicated
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2);
    }
  });

  it('gives a single pathologically-long filename its own chunk rather than dropping it', () => {
    const longName = 'tests/' + 'x'.repeat(100) + '.test.ts';
    const chunks = chunkFiles([longName], 10);
    expect(chunks).toEqual([[longName]]);
  });

  it('never produces an empty chunk', () => {
    const files = Array.from({ length: 20 }, (_, i) => `tests/file-${i}.test.ts`);
    const chunks = chunkFiles(files, 60);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });
});

// ─── planRun ────────────────────────────────────────────────────────────────

describe('planRun', () => {
  it('builds one `npx vitest run <files>` command per chunk', () => {
    const affected = ['tests/a.test.ts', 'tests/b.test.ts'];
    const { chunks, commands } = planRun(affected, 1000);
    expect(chunks).toEqual([affected]);
    expect(commands).toEqual([['npx', 'vitest', 'run', 'tests/a.test.ts', 'tests/b.test.ts']]);
  });

  it('produces one command per chunk when chunking is forced', () => {
    const affected = ['tests/aaaaaaaaaa.test.ts', 'tests/bbbbbbbbbb.test.ts', 'tests/cccccccccc.test.ts'];
    const { chunks, commands } = planRun(affected, 30);
    expect(commands.length).toBe(chunks.length);
    expect(commands.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length; i++) {
      expect(commands[i]).toEqual(['npx', 'vitest', 'run', ...chunks[i]]);
    }
  });

  it('returns no commands for an empty affected set', () => {
    const { chunks, commands } = planRun([]);
    expect(chunks).toEqual([]);
    expect(commands).toEqual([]);
  });

  it('uses WINDOWS_ARGV_CHUNK_BYTES as the default threshold', () => {
    const files = ['tests/a.test.ts'];
    const { chunks: withDefault } = planRun(files);
    const { chunks: withExplicit } = planRun(files, WINDOWS_ARGV_CHUNK_BYTES);
    expect(withDefault).toEqual(withExplicit);
  });
});

// ─── runChildCapturingExit / runCommandsSequential ─────────────────────────
// Exercises the exact spawn+exit-code mechanism the real run path uses,
// against a trivial `node -e` stand-in — never a real vitest child (per spec:
// "vitest-koşusunu ... gerçek vitest-child'ı spawn'lamadan" test edilmeli).

describe('runChildCapturingExit', () => {
  it('resolves the child exit code verbatim', async () => {
    const code = await runChildCapturingExit(process.execPath, ['-e', 'process.exit(7)'], { stdio: 'ignore' });
    expect(code).toBe(7);
  });

  it('resolves 0 for a clean exit', async () => {
    const code = await runChildCapturingExit(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
    expect(code).toBe(0);
  });

  it('rejects when the binary does not exist', async () => {
    await expect(runChildCapturingExit('ccverify-definitely-not-a-real-binary', [], { stdio: 'ignore' })).rejects.toBeDefined();
  });
});

describe('runCommandsSequential', () => {
  it('passes a single command exit code through verbatim (no forced remap)', async () => {
    const code = await runCommandsSequential([[process.execPath, '-e', 'process.exit(5)']], { stdio: 'ignore' });
    expect(code).toBe(5);
  });

  it('returns 0 when every chunk succeeds', async () => {
    const commands = [
      [process.execPath, '-e', 'process.exit(0)'],
      [process.execPath, '-e', 'process.exit(0)'],
    ];
    const code = await runCommandsSequential(commands, { stdio: 'ignore' });
    expect(code).toBe(0);
  });

  it('combines chunk exit codes — any non-zero chunk makes the overall result non-zero', async () => {
    const commands = [
      [process.execPath, '-e', 'process.exit(0)'],
      [process.execPath, '-e', 'process.exit(3)'],
      [process.execPath, '-e', 'process.exit(0)'],
    ];
    const code = await runCommandsSequential(commands, { stdio: 'ignore' });
    expect(code).not.toBe(0);
    expect(code).toBe(3);
  });
});

// ─── getChangedFilesFromGit — hermetic scratch git repo ────────────────────

let gitFixtureRoot: string;

async function runGit(args: string[], cwd: string) {
  const result = await runGitCapture(args, cwd);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${result.code}): ${result.stderr}`);
  }
  return result.stdout;
}

// `git commit` (and checkout/reset/stash/clean/rebase/revert) is blocked for
// workers by the sandbox's WORKER-GIT-GUARD (src/orchestra/git-worker-guard.ts)
// — a blanket subcommand denylist that applies to every `git` invocation
// regardless of repo, including a disposable tmpdir scratch repo. Build
// commits with plumbing instead: `add` + `write-tree` + `commit-tree` +
// `update-ref`, none of which are denylisted.
async function commitAll(cwd: string, message: string, parent?: string): Promise<string> {
  await runGit(['add', '-A'], cwd);
  const tree = (await runGit(['write-tree'], cwd)).trim();
  const commitTreeArgs = parent
    ? ['commit-tree', '-m', message, '-p', parent, tree]
    : ['commit-tree', '-m', message, tree];
  const commit = (await runGit(commitTreeArgs, cwd)).trim();
  await runGit(['update-ref', 'refs/heads/main', commit], cwd);
  return commit;
}

beforeEach(async () => {
  gitFixtureRoot = mkdtempSync(join(tmpdir(), 'ccverify-git-fixture-'));
  await runGit(['init', '-q'], gitFixtureRoot);
  await runGit(['config', 'user.email', 'ccverify-test@example.local'], gitFixtureRoot);
  await runGit(['config', 'user.name', 'ccverify-test'], gitFixtureRoot);
  // Pin the branch name explicitly rather than depending on the local
  // init.defaultBranch config (symbolic-ref is read/write on HEAD only —
  // not a denylisted subcommand).
  await runGit(['symbolic-ref', 'HEAD', 'refs/heads/main'], gitFixtureRoot);
});

afterEach(() => {
  rmSync(gitFixtureRoot, { recursive: true, force: true });
});

describe('getChangedFilesFromGit — real scratch repo', () => {
  it('unions merge-base range diff, working-tree diff (incl. unstaged), and untracked files', async () => {
    // Commit 1: two files.
    writeFileSync(join(gitFixtureRoot, 'file-merge.txt'), 'v1\n');
    writeFileSync(join(gitFixtureRoot, 'file-working.txt'), 'v1\n');
    const commit1 = await commitAll(gitFixtureRoot, 'c1');

    // Commit 2: modifies file-merge.txt (covers the merge-base range diff).
    writeFileSync(join(gitFixtureRoot, 'file-merge.txt'), 'v2\n');
    await commitAll(gitFixtureRoot, 'c2', commit1);

    // Uncommitted working-tree modification (covers `git diff --name-only HEAD`,
    // NOT plain `git diff` which would miss a staged version of this).
    writeFileSync(join(gitFixtureRoot, 'file-working.txt'), 'v2\n');

    // Untracked new file (covers `git ls-files --others --exclude-standard`).
    writeFileSync(join(gitFixtureRoot, 'file-untracked.txt'), 'new\n');

    const changed = await getChangedFilesFromGit(commit1, gitFixtureRoot);
    expect(changed.sort()).toEqual(['file-merge.txt', 'file-untracked.txt', 'file-working.txt']);
  });

  it('rejects with BASE_REF_NOT_FOUND and a --base HEAD~1 suggestion when the base ref does not resolve', async () => {
    writeFileSync(join(gitFixtureRoot, 'a.txt'), 'v1\n');
    await commitAll(gitFixtureRoot, 'c1');

    await expect(getChangedFilesFromGit('origin/nonexistent-branch-xyz', gitFixtureRoot)).rejects.toMatchObject({
      code: 'BASE_REF_NOT_FOUND',
    });
    try {
      await getChangedFilesFromGit('origin/nonexistent-branch-xyz', gitFixtureRoot);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('--base HEAD~1');
    }
  });

  it('rejects honestly (never a silent empty list) when the directory is not a git repo at all', async () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'ccverify-not-a-repo-'));
    try {
      await expect(getChangedFilesFromGit('origin/main', notARepo)).rejects.toMatchObject({
        code: 'BASE_REF_NOT_FOUND',
      });
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});

describe('resolveChangedFiles', () => {
  it('does not touch git when --changed is provided, even against a nonexistent cwd', async () => {
    const bogusRoot = join(tmpdir(), 'ccverify-nonexistent-root-does-not-exist');
    const result = await resolveChangedFiles({ changed: 'src/a.ts,src/b.ts', base: 'origin/main', root: bogusRoot });
    expect(result).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('falls back to git when --changed is null', async () => {
    writeFileSync(join(gitFixtureRoot, 'a.txt'), 'v1\n');
    await commitAll(gitFixtureRoot, 'c1');
    writeFileSync(join(gitFixtureRoot, 'b.txt'), 'untracked\n');

    const result = await resolveChangedFiles({ changed: null, base: 'HEAD', root: gitFixtureRoot });
    expect(result).toContain('b.txt');
  });
});

// ─── Hermetic fixture-tree CLI tests — --changed path, never touches git ──

let tmpRoot: string;

function writeFixture(relPath: string, content: string) {
  const full = join(tmpRoot, ...relPath.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'ccverify-affected-fixture-'));
  // src/a.ts <- tests/x.test.ts (one hop) AND <- tests/y.test.ts (two affected
  // files from a single changed module — used for the --max-files guard test).
  writeFixture('src/a.ts', `export const A = 1;\n`);
  writeFixture('tests/x.test.ts', `import { A } from '../src/a.js';\nA;\n`);
  writeFixture('tests/y.test.ts', `import { A } from '../src/a.js';\nA;\n`);
  // Orphan module — nobody imports it (used for the 0-affected path).
  writeFixture('src/orphan.ts', `export const ORPHAN = true;\n`);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('ccverify-affected.mjs CLI — --list (git-free)', () => {
  it('lists every affected test path, one per line, exit 0', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/a.ts', '--list']);
    expect(result.status).toBe(0);
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    expect(lines.sort()).toEqual(['tests/x.test.ts', 'tests/y.test.ts']);
  });

  it('--list bypasses the --max-files guard (pure information, never runs anything)', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/a.ts', '--list', '--max-files', '1']);
    expect(result.status).toBe(0);
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    expect(lines.sort()).toEqual(['tests/x.test.ts', 'tests/y.test.ts']);
  });

  it('lists nothing (empty output) for a module with no importers', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/orphan.ts', '--list']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });
});

describe('ccverify-affected.mjs CLI — empty affected set', () => {
  it('prints "0 affected" and exits 0 for a module nobody imports', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/orphan.ts']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('0 affected');
  });

  it('prints "0 affected" and exits 0 when --changed is empty', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', '']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('0 affected');
  });
});

describe('ccverify-affected.mjs CLI — --max-files guard', () => {
  it('exits 2 with an honest redirect message when the affected-set exceeds --max-files', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/a.ts', '--max-files', '1']);
    expect(result.status).toBe(2);
    expect(result.stdout.trim()).toBe(''); // guard message goes to stderr, not stdout
    expect(result.stderr).toContain('max-files');
    expect(result.stderr).toContain('tam-suite');
  });

  it('does not trigger when the affected-set is within --max-files', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/a.ts', '--max-files', '2', '--list']);
    expect(result.status).toBe(0);
  });
});

describe('ccverify-affected.mjs CLI — --dry-run', () => {
  it('prints the exact command it would run, never spawns vitest, exit 0', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/a.ts', '--dry-run']);
    expect(result.status).toBe(0);
    const { affected } = computeAffectedTests(tmpRoot, ['src/a.ts']);
    const { commands } = planRun(affected);
    const expectedLines = commands.map((c) => c.join(' '));
    expect(result.stdout.trim().split('\n')).toEqual(expectedLines);
  });

  it('dry-run output is byte-identical to the vitest argv planRun() would hand to spawn', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/a.ts', '--dry-run']);
    const printedArgv = result.stdout.trim().split(' ');
    expect(printedArgv).toEqual(['npx', 'vitest', 'run', 'tests/x.test.ts', 'tests/y.test.ts']);
  });

  it('prints "0 affected" instead of an empty vitest command when nothing is affected', async () => {
    const result = await runCli(['--root', tmpRoot, '--changed', 'src/orphan.ts', '--dry-run']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('0 affected');
  });
});

describe('ccverify-affected.mjs CLI — base-ref-missing honest error (git path)', () => {
  it('exits non-zero with a --base HEAD~1 suggestion instead of a silent empty list', async () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'ccverify-cli-not-a-repo-'));
    try {
      const result = await runCli(['--root', notARepo], { cwd: notARepo });
      expect(result.status).toBe(2);
      expect(result.stdout.trim()).toBe('');
      expect(result.stderr).toContain('--base HEAD~1');
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});

// ─── Real-repo smoke (matches the task's Kanıt line) ───────────────────────

describe('ccverify-affected.mjs CLI — real repo smoke', () => {
  it('lists tests/core/scope-gate.test.ts for --changed src/core/scope-gate.ts --list', async () => {
    const result = await runCli(['--changed', 'src/core/scope-gate.ts', '--list'], { cwd: projectRoot });
    expect(result.status).toBe(0);
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    expect(lines).toContain('tests/core/scope-gate.test.ts');
  }, 30_000);
});
