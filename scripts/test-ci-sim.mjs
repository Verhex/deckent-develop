#!/usr/bin/env node
// test-ci-sim.mjs — clean-state CI reproducer (Sprint 215 Task 215-002).
//
// Problem: green-local ≠ green-CI when tests accidentally read gitignored local
// state (.deckent/config.json, .brain/memory.db, ~/.deckent fixtures, etc.).
// This script hides that state in a tmp suffix, runs `CI=1 vitest run`, then
// ALWAYS restores the state via try/finally — even when vitest throws.
//
// Usage:
//   node scripts/test-ci-sim.mjs                 # full run, restore on exit
//   node scripts/test-ci-sim.mjs --dry-run       # stash + restore, skip vitest
//   node scripts/test-ci-sim.mjs --keep-stash    # leave stash dirs for inspection
//   node scripts/test-ci-sim.mjs -- <vitest args># pass-through args after `--`
//
// Exit codes: 0 = vitest passed, 1 = vitest failed, 2 = stash/restore error.

import { spawn } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = process.env.CI_SIM_ROOT
  ? resolve(process.env.CI_SIM_ROOT)
  : resolve(fileURLToPath(import.meta.url), '..', '..');

// Paths that may carry gitignored local state — hidden during the simulated CI run.
// Stash ONLY gitignored local state — what a fresh CI checkout genuinely
// lacks. `.brain/memory.db` is gitignored (rebuilt from exports); `.brain/
// exports/*` are git-TRACKED and PRESENT in CI, so hiding all of `.brain`
// over-reports false non-hermetic failures (tests reading committed exports).
// `.deckent/config.json` is gitignored. Mirror real CI, not more.
export const DEFAULT_STASH_TARGETS = ['.deckent/config.json', '.brain/memory.db'];

/**
 * Rename each existing target to `${target}${suffix}`.
 * Returns the list of {from, to} entries actually stashed (skips missing paths).
 */
export function stashPaths(targets, suffix, rootDir = REPO_ROOT) {
  const stashed = [];
  for (const target of targets) {
    const from = resolve(rootDir, target);
    if (!existsSync(from)) continue;
    const to = `${from}${suffix}`;
    renameSync(from, to);
    stashed.push({ from, to });
  }
  return stashed;
}

/**
 * Restore stashed entries in REVERSE order. Each restore is independently
 * try/catch'd so one failure does not block the remaining restores.
 * Returns {restored, errors} so the caller can log + exit non-zero if needed.
 */
export function restorePaths(stashed) {
  const errors = [];
  const restored = [];
  for (let i = stashed.length - 1; i >= 0; i--) {
    const entry = stashed[i];
    try {
      if (existsSync(entry.to)) {
        // A test may have RECREATED entry.from (e.g. the suite writes
        // .brain/memory.db + exports during the run). renameSync(stash →
        // .brain) then fails with ENOTEMPTY and strands the real state in the
        // stash — a data-loss trap (Sprint 215 nearly lost 6MB memory.db +
        // 6068 archive files this way). The stash is the source of truth, so
        // discard any test-recreated path first, then restore the stash.
        if (existsSync(entry.from)) {
          rmSync(entry.from, { recursive: true, force: true });
        }
        renameSync(entry.to, entry.from);
        restored.push(entry.from);
      }
    } catch (err) {
      errors.push({ path: entry.from, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { restored, errors };
}

/**
 * Async spawn of `npx vitest run <args>` with CI=1 in env. Long-running
 * subprocesses MUST be async (DIRECTIVES Sprint 215 hermeticity rule —
 * spawnSync blocks the worker loop). Returns { code, signal }.
 */
export function runVitest(extraArgs = [], opts = {}) {
  const sleepMs = parseInt(process.env.CI_SIM_RUNNER_SLEEP_MS ?? '0', 10);
  if (sleepMs > 0) {
    return new Promise((r) => setTimeout(() => r({ code: 0, signal: null }), sleepMs));
  }
  const env = { ...process.env, CI: '1', ...(opts.env ?? {}) };
  const cwd = opts.cwd ?? REPO_ROOT;
  const stdio = opts.stdio ?? 'inherit';
  return new Promise((resolveP, rejectP) => {
    const child = spawn('npx', ['vitest', 'run', ...extraArgs], { env, cwd, stdio });
    child.once('error', rejectP);
    child.once('exit', (code, signal) => resolveP({ code: code ?? 1, signal }));
  });
}

/**
 * Orchestrate: stash → run → restore (always, via try/finally).
 * Injectable runner makes this unit-testable without spawning real vitest.
 */
export async function runCiSim(opts = {}) {
  const targets = opts.targets ?? DEFAULT_STASH_TARGETS;
  const rootDir = opts.rootDir ?? REPO_ROOT;
  const suffix = opts.suffix ?? `.cisim-stash-${Date.now()}`;
  const runner = opts.runner ?? runVitest;
  const keepStash = opts.keepStash ?? false;

  let stashed = [];
  let runOutcome = { code: 2, signal: null, error: null };

  try {
    stashed = stashPaths(targets, suffix, rootDir);
    opts.onStash?.(stashed);
    if (opts.dryRun) {
      runOutcome = { code: 0, signal: null, skipped: true };
    } else {
      try {
        runOutcome = await runner(opts.vitestArgs ?? [], { cwd: rootDir, env: { CI: '1' } });
      } catch (err) {
        runOutcome = { code: 2, signal: null, error: err instanceof Error ? err.message : String(err) };
      }
    }
  } finally {
    // Always restore — even when stashing itself partially failed or runner threw.
    if (!keepStash) {
      const restoreResult = restorePaths(stashed);
      runOutcome.restored = restoreResult.restored;
      runOutcome.restoreErrors = restoreResult.errors;
    } else {
      runOutcome.stashed = stashed.map((s) => s.to);
    }
  }

  return runOutcome;
}

function parseArgs(argv) {
  const opts = { dryRun: false, keepStash: false, vitestArgs: [] };
  const args = argv.slice(2);
  const dashDash = args.indexOf('--');
  const head = dashDash >= 0 ? args.slice(0, dashDash) : args;
  const tail = dashDash >= 0 ? args.slice(dashDash + 1) : [];
  for (const a of head) {
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--keep-stash') opts.keepStash = true;
  }
  opts.vitestArgs = tail;
  return opts;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  const opts = parseArgs(process.argv);
  let stashedForSignal = [];
  const signalHandler = (sig) => {
    process.stderr.write(`[ci-sim] received ${sig}, restoring stash...\n`);
    restorePaths(stashedForSignal);
    process.exit(2);
  };
  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);
  process.stderr.write(`[ci-sim] stashing local state: ${DEFAULT_STASH_TARGETS.join(', ')}\n`);
  const result = await runCiSim({ ...opts, onStash: (s) => { stashedForSignal = s; } });
  process.off('SIGINT', signalHandler);
  process.off('SIGTERM', signalHandler);
  if (result.restoreErrors?.length) {
    process.stderr.write(`[ci-sim] WARN restore errors: ${JSON.stringify(result.restoreErrors)}\n`);
  }
  process.stderr.write(`[ci-sim] vitest exit code=${result.code}\n`);
  process.exit(result.code);
}
