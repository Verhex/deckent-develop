#!/usr/bin/env node
// agentic-do-verify.mjs — run-proven agentic write smoke harness (Sprint 224 T-224-027).
//
// Verifies that dist/cli/entry.js can write a file via agentic tool dispatch:
//   1. Spawns the real entry.js in a tmpdir (non-TTY → auto-approve)
//   2. Sends a write-file request to the REPL
//   3. Checks whether the file was created (PASS) or not (FAIL)
//
// Run directly: node scripts/agentic-do-verify.mjs → PASS / SKIP / FAIL
// Import in tests: import { checkDistExists, evaluateWriteVerify, runSmoke } from ...

import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT  = resolve(dirname(__filename), '..');
const ENTRY_JS   = resolve(REPO_ROOT, 'dist/cli/entry.js');

// ─── helpers (exported for unit tests) ───────────────────────────────────────

/**
 * Return true when the REPL entry point exists at entryPath.
 * When absent the smoke run is skipped — build first with `npm run build`.
 */
export function checkDistExists(entryPath = ENTRY_JS) {
  return existsSync(entryPath);
}

/**
 * Evaluate whether the agentic write succeeded.
 * Returns { pass: true } if the file was created, { pass: false, reason } otherwise.
 */
export function evaluateWriteVerify(filePath) {
  if (!filePath) return { pass: false, reason: 'evaluateWriteVerify: filePath is required' };
  if (existsSync(filePath)) return { pass: true };
  return { pass: false, reason: `agentic write FAIL — file not created: ${filePath}` };
}

/**
 * Spawn entry.js with piped stdin in the given cwd (tmpdir).
 * Non-TTY → execDispatcher auto-approves writes (no interactive prompt).
 * Returns { stdout, stderr, elapsed, timedOut }.
 *
 * Uses async spawn (not spawnSync) per hermeticity rules (ADR-006, ADR-078).
 */
export async function spawnAgenticWrite(input, { timeoutMs = 30_000, entryPath = ENTRY_JS, cwd } = {}) {
  return new Promise((resolve) => {
    const t0  = Date.now();
    const env = { ...process.env };
    delete env['ANTHROPIC_API_KEY'];
    delete env['DECKENT_CLAUDE_API_KEY'];

    const child = spawn(process.execPath, [entryPath], {
      env,
      cwd: cwd ?? REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout   = '';
    let stderr   = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', () => {
      clearTimeout(timer);
      resolve({ stdout, stderr, elapsed: Date.now() - t0, timedOut });
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

// ─── runSmoke ─────────────────────────────────────────────────────────────────

/**
 * Run the agentic-write smoke against dist/cli/entry.js in a tmpdir sandbox.
 * Returns { pass, skipped?, reason?, scenarios }.
 *
 * When entryPath does not exist returns skipped=true so CI does not fail.
 * When tmpDir is provided, the caller owns cleanup; otherwise this function
 * creates and cleans up a temp directory automatically.
 */
export async function runSmoke({ entryPath = ENTRY_JS, tmpDir } = {}) {
  if (!checkDistExists(entryPath)) {
    return {
      pass: true,
      skipped: true,
      reason: `dist not found (${entryPath}) — run \`npm run build\` first`,
      scenarios: ['SKIP agentic-write (dist missing)'],
    };
  }

  const ownsTmpDir = !tmpDir;
  const workDir = tmpDir ?? mkdtempSync(join(tmpdir(), 'deckent-agentic-'));

  try {
    const filename = `agentic-verify-${Date.now()}.md`;
    const filePath = join(workDir, filename);

    const prompt = `Write a file called ${filename} in the current directory with the content "AGENTIC_VERIFY_OK".\n/exit\n`;

    let result;
    try {
      result = await spawnAgenticWrite(prompt, {
        timeoutMs: 30_000,
        entryPath,
        cwd: workDir,
      });
    } catch (err) {
      return {
        pass: false,
        skipped: false,
        reason: `spawn error: ${err.message}`,
        scenarios: [`FAIL agentic-write: spawn error: ${err.message}`],
      };
    }

    const verification = evaluateWriteVerify(filePath);
    return {
      pass: verification.pass,
      skipped: false,
      timedOut: result.timedOut,
      reason: verification.pass ? undefined : verification.reason,
      scenarios: [verification.pass ? 'PASS agentic-write' : `FAIL agentic-write: ${verification.reason}`],
    };
  } finally {
    if (ownsTmpDir) {
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
    }
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSmoke()
    .then((result) => {
      for (const line of result.scenarios) process.stdout.write(line + '\n');
      if (result.skipped) {
        process.stdout.write(`SKIP: ${result.reason}\n`);
        process.exit(0);
      } else if (result.pass) {
        process.stdout.write('PASS\n');
        process.exit(0);
      } else {
        process.stderr.write(`FAIL: ${result.reason}\n`);
        process.exit(1);
      }
    })
    .catch((err) => {
      process.stderr.write(`FAIL: ${err.message}\n`);
      process.exit(1);
    });
}
