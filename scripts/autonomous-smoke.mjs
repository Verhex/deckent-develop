#!/usr/bin/env node
// autonomous-smoke.mjs — run-proven e2e smoke harness for `deckent autonomous` (Sprint 228 T-228-004).
//
// Verifies that dist/cli/entry.js autonomous:
//   1. start --max-iterations 2 --interval-ms 200  → bounded loop exits cleanly (code 0)
//   2. status                                       → outputs expected header
//
// Run directly: node scripts/autonomous-smoke.mjs → PASS / SKIP / FAIL
// Import in tests: import { checkDistExists, evaluateStartResult, evaluateStatusOutput, runSmoke } from ...
//
// Security invariants preserved throughout: default-deny + no-auto-approve (empty actionHandlers,
// requiresApproval: true per autonomous.ts defaultPolicy). No sprint-start triggered.

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
 * Return true when the CLI entry point exists at entryPath.
 * When absent the smoke run is skipped — build first with `npm run build`.
 */
export function checkDistExists(entryPath = ENTRY_JS) {
  return existsSync(entryPath);
}

/**
 * Evaluate whether `autonomous start` exited cleanly.
 * Returns { pass: true } on clean exit, { pass: false, reason } otherwise.
 */
export function evaluateStartResult({ code, timedOut }) {
  if (timedOut) return { pass: false, reason: 'autonomous start timed out' };
  if (code !== 0) return { pass: false, reason: `autonomous start exited with code ${code}` };
  return { pass: true };
}

/**
 * Evaluate whether `autonomous status` output contains the expected header.
 * Accepts both EN and TR i18n variants.
 */
export function evaluateStatusOutput({ stdout }) {
  const hasHeader =
    /Autonomous runtime status/i.test(stdout) ||
    /Otonom runtime/i.test(stdout);
  if (!hasHeader) {
    return {
      pass: false,
      reason: `status output missing expected header. Got: ${stdout.slice(0, 200)}`,
    };
  }
  return { pass: true };
}

/**
 * Spawn `node dist/cli/entry.js autonomous <args> [--root <root>]` asynchronously.
 * Uses async spawn (not spawnSync) per ADR-006 / hermeticity rules.
 * Returns { stdout, stderr, elapsed, timedOut, code }.
 */
export async function spawnAutonomousCmd(
  args,
  { timeoutMs = 15_000, entryPath = ENTRY_JS, cwd, root } = {},
) {
  return new Promise((resolve_) => {
    const t0  = Date.now();
    const env = { ...process.env };
    delete env['ANTHROPIC_API_KEY'];
    delete env['DECKENT_CLAUDE_API_KEY'];

    const fullArgs = [entryPath, 'autonomous', ...args];
    if (root) fullArgs.push('--root', root);

    const child = spawn(process.execPath, fullArgs, {
      env,
      cwd: cwd ?? REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout   = '';
    let stderr   = '';
    let timedOut = false;
    let code     = null;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      code = exitCode;
      resolve_({ stdout, stderr, elapsed: Date.now() - t0, timedOut, code });
    });

    child.stdin.end();
  });
}

// ─── runSmoke ─────────────────────────────────────────────────────────────────

/**
 * Run the autonomous e2e smoke against dist/cli/entry.js in a tmpdir sandbox.
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
      scenarios: ['SKIP autonomous-smoke (dist missing)'],
    };
  }

  const ownsTmpDir = !tmpDir;
  const workDir = tmpDir ?? mkdtempSync(join(tmpdir(), 'deckent-autonomous-'));

  try {
    // Step 1: bounded start (2 iterations, 200ms idle ticks, default-deny)
    const startResult = await spawnAutonomousCmd(
      ['start', '--max-iterations', '2', '--interval-ms', '200'],
      { entryPath, root: workDir, timeoutMs: 15_000 },
    );
    const startEval = evaluateStartResult(startResult);

    if (!startEval.pass) {
      return {
        pass: false,
        skipped: false,
        reason: startEval.reason,
        scenarios: [`FAIL autonomous-start: ${startEval.reason}`],
      };
    }

    // Step 2: status check
    const statusResult = await spawnAutonomousCmd(
      ['status'],
      { entryPath, root: workDir, timeoutMs: 10_000 },
    );
    const statusEval = evaluateStatusOutput(statusResult);

    const scenarios = [
      'PASS autonomous-start (bounded 2 iterations, clean exit)',
      statusEval.pass
        ? 'PASS autonomous-status (header present)'
        : `FAIL autonomous-status: ${statusEval.reason}`,
    ];

    return {
      pass: statusEval.pass,
      skipped: false,
      reason: statusEval.pass ? undefined : statusEval.reason,
      scenarios,
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
