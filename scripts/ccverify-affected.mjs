#!/usr/bin/env node
/**
 * GATE-RUNNER (born-400-002)
 *
 * Runs only the vitest files affected by the current change-set, computed via the
 * born-400-001 resolver (`scripts/affected-tests.mjs`). Never calls git when
 * `--changed` is supplied (hermetic-test path).
 *
 * Changed-file sources when `--changed` is absent:
 *   - `git diff --name-only <base>...HEAD`   (merge-base range diff)
 *   - `git diff --name-only HEAD`            (working tree, incl. staged — plain
 *                                              `git diff` misses staged changes)
 *   - `git ls-files --others --exclude-standard` (untracked new files)
 * If `<base>` (default `origin/main`) does not resolve — e.g. an origin-less
 * user clone — this is a hard error with a `--base HEAD~1` suggestion, never a
 * silent empty list.
 *
 * Modes:
 *   --list      print the affected test paths (one per line), exit 0. Works at
 *               any affected-set size — pure information, never runs anything.
 *   --dry-run   print the `npx vitest run <files>` command(s) that WOULD run,
 *               without executing them, exit 0.
 *   (default)   spawn `npx vitest run <files>` (async — spawnSync is banned,
 *               ratchet) and exit with the child's exit code, verbatim.
 *
 * Guards:
 *   --max-files N (default 400): if the affected-set exceeds N, refuse to run a
 *   partial subset (false confidence) — print an honest redirect to run the full
 *   suite instead, exit 2.
 *   Windows argv ceiling: cmd.exe caps a command line at 8191 chars. If the
 *   affected file list would exceed ~6KB, it is split into multiple `vitest run`
 *   invocations ("chunks"); each chunk's exit code is combined (any non-zero ->
 *   overall non-zero).
 *
 * Usage:
 *   node scripts/ccverify-affected.mjs [--base <ref>] [--root <path>]
 *     [--changed <list>] [--list] [--dry-run] [--max-files N]
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAffectedTests, parseChangedList } from './affected-tests.mjs';

// ─── Constants ─────────────────────────────────────────────────────────────

export const DEFAULT_BASE_REF = 'origin/main';
export const DEFAULT_MAX_FILES = 400;
// Windows cmd.exe command-line ceiling is 8191 chars; chunk the affected
// file-list well under that so `npx vitest run <files>` + npx/node overhead
// never risks tripping it.
export const WINDOWS_ARGV_CHUNK_BYTES = 6000;

// ─── Git changed-file resolution ────────────────────────────────────────────

/**
 * Async spawn of a git subcommand, capturing stdout/stderr. Never spawnSync
 * (ratchet — a blocking subprocess call freezes the caller's event loop).
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function runGitCapture(args, cwd) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', rejectP);
    child.on('close', (code) => resolveP({ code: code ?? 1, stdout, stderr }));
  });
}

async function gitRefExists(ref, cwd) {
  const result = await runGitCapture(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
  return result.code === 0;
}

/**
 * Determine the changed-file set from git — union of merge-base range diff,
 * working-tree diff (incl. staged), and untracked files. Throws a
 * `BASE_REF_NOT_FOUND`-coded error (honest-fail, never a silent empty list)
 * when `baseRef` does not resolve in `cwd`.
 * @param {string} baseRef
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
export async function getChangedFilesFromGit(baseRef, cwd) {
  const exists = await gitRefExists(baseRef, cwd);
  if (!exists) {
    const err = new Error(
      `[ccverify-affected] base ref '${baseRef}' çözülemedi (origin yok / henüz fetch edilmemiş ` +
      `bir kullanıcı-repo'su olabilir). Öneri: --base HEAD~1 ile dene, ya da doğru remote/branch adını ver.`
    );
    err.code = 'BASE_REF_NOT_FOUND';
    throw err;
  }

  const [mergeBase, workingTree, untracked] = await Promise.all([
    runGitCapture(['diff', '--name-only', `${baseRef}...HEAD`], cwd),
    runGitCapture(['diff', '--name-only', 'HEAD'], cwd),
    runGitCapture(['ls-files', '--others', '--exclude-standard'], cwd),
  ]);

  const files = new Set();
  for (const result of [mergeBase, workingTree, untracked]) {
    if (result.code !== 0) continue; // e.g. `diff HEAD` on a zero-commit repo — degrade, don't crash
    for (const line of result.stdout.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) files.add(trimmed);
    }
  }
  return [...files];
}

/**
 * @param {{ changed: string | null, base: string, root: string }} args
 * @returns {Promise<string[]>}
 */
export async function resolveChangedFiles(args) {
  if (args.changed !== null) {
    return parseChangedList(args.changed);
  }
  return getChangedFilesFromGit(args.base, args.root);
}

// ─── Chunking + vitest command planning ─────────────────────────────────────

/**
 * Split a file list into chunks whose joined byte-size stays under `maxBytes`
 * (Windows argv-ceiling headroom). A single pathological entry that alone
 * exceeds `maxBytes` still gets its own one-file chunk (never dropped, never
 * an infinite loop).
 * @param {string[]} files
 * @param {number} maxBytes
 * @returns {string[][]}
 */
export function chunkFiles(files, maxBytes = WINDOWS_ARGV_CHUNK_BYTES) {
  if (files.length === 0) return [];
  const chunks = [];
  let current = [];
  let currentBytes = 0;
  for (const f of files) {
    const fBytes = Buffer.byteLength(f, 'utf-8') + 1; // +1 for the join separator
    if (current.length > 0 && currentBytes + fBytes > maxBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(f);
    currentBytes += fBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Build the chunked `npx vitest run <files>` argv plan. The SAME `commands`
 * array is used for both `--dry-run` printing and the real spawn, so the two
 * are identical by construction — not two independently-maintained formats.
 * @param {string[]} affected
 * @param {number} chunkBytes
 * @returns {{ chunks: string[][], commands: string[][] }}
 */
export function planRun(affected, chunkBytes = WINDOWS_ARGV_CHUNK_BYTES) {
  const chunks = chunkFiles(affected, chunkBytes);
  const commands = chunks.map((chunk) => ['npx', 'vitest', 'run', ...chunk]);
  return { chunks, commands };
}

// ─── Child-process execution (async, exit-code-verbatim) ───────────────────

/**
 * Spawn a single command, resolving with its exit code — never spawnSync
 * (ratchet). `opts.stdio` defaults to 'inherit' so a real vitest run streams
 * its own output; tests override it to capture output from a stand-in binary.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, stdio?: import('node:child_process').StdioOptions }} [opts]
 * @returns {Promise<number>}
 */
export function runChildCapturingExit(cmd, cmdArgs, opts = {}) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: opts.cwd ?? process.cwd(),
      env: opts.env ?? process.env,
      stdio: opts.stdio ?? 'inherit',
    });
    child.on('error', rejectP);
    child.on('close', (code) => resolveP(code ?? 1));
  });
}

/**
 * Run every command sequentially (never in parallel — each `vitest run`
 * independently spawns up to `VITEST_MAX_FORKS` workers; running chunks
 * concurrently would multiply memory pressure past the 16GB local cap).
 * Combine exit codes: the first non-zero chunk wins (any ≠0 -> overall ≠0);
 * a single-chunk plan's code passes through verbatim.
 * @param {string[][]} commands
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, stdio?: import('node:child_process').StdioOptions }} [opts]
 * @returns {Promise<number>}
 */
export async function runCommandsSequential(commands, opts = {}) {
  let combined = 0;
  for (const [cmd, ...cmdArgs] of commands) {
    const code = await runChildCapturingExit(cmd, cmdArgs, opts);
    if (code !== 0 && combined === 0) combined = code;
  }
  return combined;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    base: DEFAULT_BASE_REF,
    changed: null,
    list: false,
    dryRun: false,
    maxFiles: DEFAULT_MAX_FILES,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') {
      args.root = resolve(argv[++i]);
    } else if (arg === '--base') {
      args.base = argv[++i];
    } else if (arg === '--changed') {
      args.changed = argv[++i] ?? '';
    } else if (arg === '--list') {
      args.list = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--max-files') {
      args.maxFiles = Number(argv[++i]);
    }
  }
  return args;
}

/**
 * @param {string[]} argv
 * @param {{ stdout?: (line: string) => void, stderr?: (line: string) => void }} [io]
 * @returns {Promise<number>} exit code
 */
export async function main(argv = process.argv.slice(2), io = {}) {
  const log = io.stdout ?? ((line) => console.log(line));
  const errLog = io.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  const args = parseArgs(argv);

  let changed;
  try {
    changed = await resolveChangedFiles(args);
  } catch (err) {
    errLog(err instanceof Error ? err.message : String(err));
    return 2;
  }

  const { affected } = computeAffectedTests(args.root, changed);

  if (args.list) {
    for (const f of affected) log(f);
    return 0;
  }

  if (affected.length === 0) {
    log('0 affected');
    return 0;
  }

  if (affected.length > args.maxFiles) {
    errLog(
      `[ccverify-affected] affected-set ${affected.length} dosya > --max-files ${args.maxFiles} — ` +
      `suite'in çoğu etkilenmiş, tam-suite koş (npx vitest run). Guard exit 2.`
    );
    return 2;
  }

  const { commands } = planRun(affected);

  if (args.dryRun) {
    for (const cmd of commands) log(cmd.join(' '));
    return 0;
  }

  return runCommandsSequential(commands, { cwd: args.root, env: process.env });
}

const isDirectRun = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  try {
    process.exitCode = await main();
  } catch (err) {
    process.stderr.write(`[ccverify-affected] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
  }
}
