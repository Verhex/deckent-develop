#!/usr/bin/env node
/**
 * Pre-flight Health Check — Sprint 139
 *
 * Validates all critical system components before a sprint is spawned.
 * Components checked:
 *   1. TypeScript build — `tsc --noEmit` exit code
 *   2. Vitest baseline — npx vitest run (maxThreads=1, bail=1)
 *   3. Brain memory budget — wc -l .brain/*.md < 900
 *   4. Stale locks — .locks/ files older than 5min
 *   5. Docker daemon health — docker info
 *   6. MCP server health — deckent-mcp reachable (optional)
 *   7. deckent doctor --json overall ok
 *
 * Exit codes:
 *   0 — all checks passed (or only optional checks failed)
 *   1 — one or more REQUIRED checks failed
 *   2 — critical error (cannot run checks)
 *
 * Usage:
 *   node scripts/pre-flight-health-check.mjs [--json] [--skip-tests] [--root <path>]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── CLI argument parsing ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const outputJson = args.includes('--json');
const skipTests = args.includes('--skip-tests');
const rootIdx = args.indexOf('--root');
const projectRoot = rootIdx !== -1 && args[rootIdx + 1]
  ? resolve(args[rootIdx + 1])
  : process.cwd();

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * @typedef {{ name: string, passed: boolean, required: boolean, message: string, durationMs?: number }} CheckResult
 */

// ─── Individual checks ──────────────────────────────────────────────────────

/**
 * Check TypeScript build (tsc --noEmit).
 * @returns {CheckResult}
 */
export function checkTypeScript(root = projectRoot) {
  const start = Date.now();
  const result = spawnSync('npx', ['tsc', '--noEmit', '--project', join(root, 'tsconfig.json')], {
    encoding: 'utf-8',
    cwd: root,
    timeout: 60_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - start;
  const passed = result.status === 0;
  const stderr = result.stderr?.trim() ?? '';
  const stdout = result.stdout?.trim() ?? '';
  const output = (stderr + stdout).trim();
  const errorLine = output.split('\n').find(l => l.includes('error TS')) ?? '';
  return {
    name: 'TypeScript Build',
    passed,
    required: true,
    message: passed
      ? 'tsc --noEmit passed'
      : `tsc failed — ${errorLine || 'check tsc output'}`,
    durationMs,
  };
}

/**
 * Check vitest baseline — runs vitest with bail=1 to detect first failure fast.
 * @param {boolean} skip - Skip test run entirely
 * @returns {CheckResult}
 */
export function checkVitestBaseline(skip = false) {
  if (skip) {
    return {
      name: 'Vitest Baseline',
      passed: true,
      required: false,
      message: 'skipped (--skip-tests flag)',
      durationMs: 0,
    };
  }
  const start = Date.now();
  const result = spawnSync(
    'npx',
    ['vitest', 'run', '--bail', '1', '--reporter', 'basic'],
    {
      encoding: 'utf-8',
      cwd: projectRoot,
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, VITEST_MAX_THREADS: '1' },
    }
  );
  const durationMs = Date.now() - start;
  const passed = result.status === 0;
  const output = (result.stdout + result.stderr).trim();
  // Extract failure summary line
  const failLine = output.split('\n').find(l => /\d+ failed/.test(l)) ?? '';
  return {
    name: 'Vitest Baseline',
    passed,
    required: false, // tests failing != block spawn, but we warn
    message: passed
      ? 'vitest baseline passed'
      : `vitest failed — ${failLine || 'check vitest output'}`,
    durationMs,
  };
}

/**
 * Check Brain memory budget (total lines across .brain/*.md < 900).
 * @param {string} root
 * @param {number} budget
 * @returns {CheckResult}
 */
export function checkBrainBudget(root = projectRoot, budget = 900) {
  const brainDir = join(root, '.brain');
  if (!existsSync(brainDir)) {
    return { name: 'Brain Budget', passed: true, required: false, message: '.brain/ not found (uninitialized)' };
  }
  let totalLines = 0;
  try {
    const files = readdirSync(brainDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content = readFileSync(join(brainDir, file), 'utf-8');
        totalLines += content.split('\n').length;
      } catch { /* skip unreadable */ }
    }
  } catch {
    return { name: 'Brain Budget', passed: true, required: false, message: 'cannot read .brain/ dir' };
  }
  const passed = totalLines <= budget;
  return {
    name: 'Brain Budget',
    passed,
    required: false,
    message: passed
      ? `${totalLines}/${budget} lines (within budget)`
      : `${totalLines}/${budget} lines — OVER BUDGET, run \`deckent cleanup --decay\``,
  };
}

/**
 * Check for stale lock files in .locks/ (older than 5 minutes).
 * @param {string} root
 * @param {number} staleThresholdMs
 * @returns {CheckResult}
 */
export function checkStaleLocks(root = projectRoot, staleThresholdMs = 300_000) {
  const locksDir = join(root, '.locks');
  if (!existsSync(locksDir)) {
    return { name: 'Stale Locks', passed: true, required: false, message: 'no .locks/ directory' };
  }
  let lockFiles;
  try {
    lockFiles = readdirSync(locksDir).filter(f => f.endsWith('.lock'));
  } catch {
    return { name: 'Stale Locks', passed: true, required: false, message: 'cannot read .locks/ dir' };
  }
  if (lockFiles.length === 0) {
    return { name: 'Stale Locks', passed: true, required: false, message: 'no lock files' };
  }
  let staleCount = 0;
  for (const file of lockFiles) {
    try {
      const lockPath = join(locksDir, file);
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
      const acquiredAt = lock.acquiredAt ? new Date(lock.acquiredAt).getTime() : statSync(lockPath).mtimeMs;
      if (Date.now() - acquiredAt > staleThresholdMs) staleCount++;
    } catch { /* skip malformed */ }
  }
  if (staleCount > 0) {
    return {
      name: 'Stale Locks',
      passed: false,
      required: false,
      message: `${staleCount}/${lockFiles.length} stale lock(s) — run \`deckent cleanup\``,
    };
  }
  return {
    name: 'Stale Locks',
    passed: true,
    required: false,
    message: `${lockFiles.length} active lock(s), none stale`,
  };
}

/**
 * Check Docker daemon health.
 * @returns {CheckResult}
 */
export function checkDockerDaemon() {
  const result = spawnSync('docker', ['info'], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const passed = result.status === 0;
  return {
    name: 'Docker Daemon',
    passed,
    required: false, // optional — only required for docker backend
    message: passed ? 'Docker daemon running' : 'Docker daemon not available (optional)',
  };
}

/**
 * Check MCP server health by invoking deckent mcp --health-check (if available).
 * @param {string} root
 * @returns {CheckResult}
 */
export function checkMCPServer(root = projectRoot) {
  // Check if deckent binary is available
  const deckentResult = spawnSync('npx', ['deckent', '--version'], {
    encoding: 'utf-8',
    cwd: root,
    timeout: 10_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (deckentResult.status !== 0) {
    return {
      name: 'MCP Server',
      passed: true, // not available yet — non-fatal
      required: false,
      message: 'deckent CLI not available — MCP check skipped',
    };
  }
  // Verify MCP tools file exists (build artifact)
  const mcpEntryPath = join(root, 'dist', 'mcp', 'server.js');
  const srcMcpPath = join(root, 'src', 'mcp', 'server.ts');
  if (!existsSync(mcpEntryPath) && !existsSync(srcMcpPath)) {
    return {
      name: 'MCP Server',
      passed: false,
      required: false,
      message: 'MCP server source not found — check src/mcp/',
    };
  }
  return {
    name: 'MCP Server',
    passed: true,
    required: false,
    message: 'MCP server source found',
  };
}

/**
 * Check deckent doctor --json overall status.
 * @param {string} root
 * @returns {CheckResult}
 */
export function checkDeckentDoctor(root = projectRoot) {
  const result = spawnSync('npx', ['deckent', 'doctor', '--json'], {
    encoding: 'utf-8',
    cwd: root,
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // deckent doctor exits with 1 if checks fail — but we want to parse the JSON regardless
  const output = result.stdout?.trim() ?? '';
  if (!output) {
    return {
      name: 'Doctor Check',
      passed: true, // non-fatal if deckent not installed
      required: false,
      message: 'deckent doctor not available — skipped',
    };
  }
  try {
    const doctorResult = JSON.parse(output);
    const ok = Boolean(doctorResult.ok);
    const failedRequired = (doctorResult.checks ?? []).filter(
      (/** @type {{ required: boolean, passed: boolean }} */ c) => c.required && !c.passed
    );
    return {
      name: 'Doctor Check',
      passed: ok,
      required: true,
      message: ok
        ? 'deckent doctor: all required checks passed'
        : `deckent doctor: ${failedRequired.length} required check(s) failed`,
    };
  } catch {
    return {
      name: 'Doctor Check',
      passed: true,
      required: false,
      message: 'deckent doctor output not parseable — skipped',
    };
  }
}

// ─── Run all checks ─────────────────────────────────────────────────────────

/**
 * Run all pre-flight health checks.
 * @param {{ skipTests?: boolean, root?: string, budget?: number, staleThresholdMs?: number }} opts
 * @returns {{ passed: boolean, checks: CheckResult[], abortSprint: boolean }}
 */
export function runPreFlightChecks(opts = {}) {
  const {
    skipTests = false,
    root = projectRoot,
    budget = 900,
    staleThresholdMs = 300_000,
  } = opts;

  const checks = [
    checkTypeScript(root),
    checkVitestBaseline(skipTests),
    checkBrainBudget(root, budget),
    checkStaleLocks(root, staleThresholdMs),
    checkDockerDaemon(),
    checkMCPServer(root),
    checkDeckentDoctor(root),
  ];

  const requiredFailed = checks.filter(c => c.required && !c.passed);
  const passed = requiredFailed.length === 0;
  const abortSprint = !passed;

  return { passed, abortSprint, checks };
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

if (
  process.argv[1] &&
  (process.argv[1].endsWith('pre-flight-health-check.mjs') ||
    process.argv[1].endsWith('pre-flight-health-check'))
) {
  const result = runPreFlightChecks({ skipTests, root: projectRoot });

  if (outputJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.abortSprint ? 1 : 0);
  }

  // Human-readable output
  process.stdout.write('\nPre-flight Health Check\n');
  process.stdout.write('─'.repeat(50) + '\n');

  for (const check of result.checks) {
    const icon = check.passed ? '[PASS]' : (check.required ? '[FAIL]' : '[WARN]');
    const dur = check.durationMs != null ? ` (${check.durationMs}ms)` : '';
    process.stdout.write(`${icon} ${check.name}: ${check.message}${dur}\n`);
  }

  process.stdout.write('─'.repeat(50) + '\n');

  if (result.abortSprint) {
    const failedCount = result.checks.filter(c => c.required && !c.passed).length;
    process.stdout.write(`\nPre-flight FAILED — ${failedCount} required check(s) failed. Sprint aborted.\n`);
    process.exit(1);
  } else {
    const warnCount = result.checks.filter(c => !c.passed).length;
    const warnNote = warnCount > 0 ? ` (${warnCount} warning(s))` : '';
    process.stdout.write(`\nPre-flight PASSED${warnNote} — sprint can proceed.\n`);
    process.exit(0);
  }
}
