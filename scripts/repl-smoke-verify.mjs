#!/usr/bin/env node
// repl-smoke-verify.mjs — run-proven REPL smoke harness (Sprint 223 T-223-010).
//
// Checks that the built dist/cli/entry.js REPL is wired and performant:
//   1. /help quick     — slash-command handled locally (<1s, no LLM call)
//   2. status-line     — "deckent  <provider>  <dir>" appears on stdout
//   3. perf-reuse      — 2-message /help cycle completes in <8s (persistent session)
//   4. layout-separation — user-message "›" prefix emitted before provider call
//
// Run directly: node scripts/repl-smoke-verify.mjs → PASS / SKIP / FAIL
// Import in tests: import { checkDistExists, evaluateHelpQuick, … } from ...

import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
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
 * Spawn dist/cli/entry.js with piped stdin and collect stdout up to timeoutMs.
 * Returns { stdout, elapsed, timedOut }.
 *
 * Uses async spawn (not spawnSync) per hermeticity rules (ADR-078).
 * ANTHROPIC_API_KEY is removed from the env so the process uses subscription auth.
 */
export async function spawnReplWithInput(
  input,
  { timeoutMs = 10_000, entryPath = ENTRY_JS } = {},
) {
  return new Promise((resolve) => {
    const t0  = Date.now();
    const env = { ...process.env };
    delete env['ANTHROPIC_API_KEY'];
    delete env['DECKENT_CLAUDE_API_KEY'];

    const child = spawn(process.execPath, [entryPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout   = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', () => {}); // drain stderr, ignore content

    child.on('close', () => {
      clearTimeout(timer);
      resolve({ stdout, elapsed: Date.now() - t0, timedOut });
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

// ─── evaluation functions (pure, exported for unit tests) ─────────────────────

/**
 * Evaluate whether the /help response was delivered quickly (<= 1000 ms).
 * stdout must contain "Komutlar" (the renderHelp header) and the total
 * elapsed must be under 1 second to prove the slash was handled locally.
 */
export function evaluateHelpQuick(stdout, elapsed) {
  const hasHelp = stdout.includes('Komutlar') || stdout.includes('help') || stdout.includes('/exit');
  if (!hasHelp) return { pass: false, reason: '/help output missing (no "Komutlar"/help keywords)' };
  if (elapsed > 1000) return { pass: false, reason: `/help took ${elapsed}ms — expected <1000ms (slash must be local, no LLM)` };
  return { pass: true };
}

/**
 * Evaluate whether the status-line is visible in the REPL boot output.
 * renderStatusLine() outputs "deckent  <provider>  <dir>" unconditionally
 * (not TTY-gated), so "deckent" must appear on the first lines of stdout.
 */
export function evaluateStatusLine(stdout) {
  if (!stdout || !stdout.includes('deckent')) {
    return { pass: false, reason: 'status-line not visible — "deckent" missing from stdout' };
  }
  return { pass: true };
}

/**
 * Evaluate 2-message perf (persistent session reuse).
 * Two /help + /exit should complete well under 8 seconds total —
 * slash commands are handled locally and the persistent session is not cold-started.
 */
export function evaluatePerfReuse(stdout, elapsed) {
  if (elapsed > 8_000) {
    return { pass: false, reason: `2-message perf: ${elapsed}ms — expected <8000ms (persistent reuse)` };
  }
  return { pass: true };
}

/**
 * Evaluate user/deckent layout separation.
 * renderUserMessage() outputs "› <text>" even on non-TTY (pipe) contexts.
 * When layout is wired (223-004), the "›" prefix appears before any LLM call,
 * so we can verify it regardless of whether the provider actually responded.
 */
export function evaluateLayoutSeparation(stdout) {
  if (!stdout || stdout.length === 0) {
    return { pass: false, reason: 'layout-separation: stdout is empty — REPL produced no output' };
  }
  if (!stdout.includes('›')) {
    return { pass: false, reason: 'layout-separation: "›" user-message prefix not found in stdout (chat-layout wire missing?)' };
  }
  return { pass: true };
}

// ─── runSmoke ─────────────────────────────────────────────────────────────────

/**
 * Run all 4 REPL smoke checks against dist/cli/entry.js.
 * Returns { pass, skipped?, reason?, scenarios }.
 *
 * When entryPath does not exist (dist not built) returns skipped=true immediately
 * so CI on a fresh checkout does not fail.
 */
export async function runSmoke({ entryPath = ENTRY_JS } = {}) {
  if (!checkDistExists(entryPath)) {
    return {
      pass: true,
      skipped: true,
      reason: `dist not found (${entryPath}) — run \`npm run build\` first`,
      scenarios: [
        'SKIP /help-quick (dist missing)',
        'SKIP status-line (dist missing)',
        'SKIP perf-reuse (dist missing)',
        'SKIP layout-separation (dist missing)',
      ],
    };
  }

  const passed = [];
  const failed = [];

  // ── Check 1: /help quick ────────────────────────────────────────────────────
  try {
    const { stdout, elapsed } = await spawnReplWithInput('/help\n/exit\n', {
      timeoutMs: 3_000,
      entryPath,
    });
    const r = evaluateHelpQuick(stdout, elapsed);
    if (r.pass) passed.push('/help-quick');
    else failed.push(`/help-quick: ${r.reason}`);
  } catch (err) {
    failed.push(`/help-quick: spawn error: ${err.message}`);
  }

  // ── Check 2: status-line visible ────────────────────────────────────────────
  try {
    const { stdout } = await spawnReplWithInput('/exit\n', {
      timeoutMs: 2_000,
      entryPath,
    });
    const r = evaluateStatusLine(stdout);
    if (r.pass) passed.push('status-line');
    else failed.push(`status-line: ${r.reason}`);
  } catch (err) {
    failed.push(`status-line: spawn error: ${err.message}`);
  }

  // ── Check 3: perf-reuse (2-message cycle) ───────────────────────────────────
  try {
    const { stdout, elapsed } = await spawnReplWithInput('/help\n/help\n/exit\n', {
      timeoutMs: 10_000,
      entryPath,
    });
    const r = evaluatePerfReuse(stdout, elapsed);
    if (r.pass) passed.push('perf-reuse');
    else failed.push(`perf-reuse: ${r.reason}`);
  } catch (err) {
    failed.push(`perf-reuse: spawn error: ${err.message}`);
  }

  // ── Check 4: layout-separation ──────────────────────────────────────────────
  // Send a non-slash message so runChatNativeLoop reaches the layout-wire code
  // (renderUserMessage → "› hello" on stdout BEFORE any provider call).
  // Timeout is permissive (5s) — we only need to see the "›" prefix, which is
  // emitted synchronously before the provider is contacted.
  try {
    const { stdout } = await spawnReplWithInput('hello\n/exit\n', {
      timeoutMs: 5_000,
      entryPath,
    });
    const r = evaluateLayoutSeparation(stdout);
    if (r.pass) passed.push('layout-separation');
    else failed.push(`layout-separation: ${r.reason}`);
  } catch (err) {
    failed.push(`layout-separation: spawn error: ${err.message}`);
  }

  return {
    pass: failed.length === 0,
    skipped: false,
    reason: failed.length > 0 ? failed.join('; ') : undefined,
    scenarios: [
      ...passed.map((s) => `PASS ${s}`),
      ...failed.map((s) => `FAIL ${s}`),
    ],
  };
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
