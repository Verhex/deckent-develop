#!/usr/bin/env node
/**
 * Chain Safety Gate — Sprint 146
 *
 * Post-sprint quality gate that verifies all sprint completion criteria.
 * Designed to run after `deckent_review` to confirm GO decision is sound.
 *
 * Checks:
 *   1. TypeScript build (tsc --noEmit) — REQUIRED
 *   2. Vitest fail count < 3 — REQUIRED
 *   3. Doctor score ≥ 90 — REQUIRED
 *   4. Sprint cost < $95 — OPTIONAL (skipped if no cost data)
 *   5. NO_GO task count ≤ 2 — OPTIONAL (skipped if no task results)
 *   6. Prompt linter avg ≥ 75 — OPTIONAL (skipped if no prompt files)
 *
 * Exit codes:
 *   0 — all required checks passed (GO)
 *   1 — one or more required checks failed (FAIL)
 *   2 — critical error (cannot run checks)
 *
 * Usage:
 *   node scripts/chain-gate-check.mjs [--json] [--sprint <id>] [--root <path>]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── CLI argument parsing ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const outputJson = args.includes('--json');
const rootIdx = args.indexOf('--root');
const projectRoot = rootIdx !== -1 && args[rootIdx + 1]
  ? resolve(args[rootIdx + 1])
  : process.cwd();
const sprintIdx = args.indexOf('--sprint');
const sprintId = sprintIdx !== -1 && args[sprintIdx + 1]
  ? args[sprintIdx + 1]
  : null;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * @typedef {{ name: string, passed: boolean, required: boolean, message: string, durationMs?: number }} CheckResult
 */

// ─── Thresholds ─────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  vitestMaxFail: 3,
  doctorMinScore: 90,
  maxCostUsd: 95,
  maxNoGoCount: 2,
  minPromptLinterAvg: 75,
};

// ─── Check 1: TypeScript build ──────────────────────────────────────────────

/**
 * Run tsc --noEmit and verify exit code 0.
 * @param {string} root
 * @returns {CheckResult}
 */
export function checkTypeScript(root = projectRoot) {
  const start = Date.now();
  const result = spawnSync('npx', ['tsc', '--noEmit'], {
    encoding: 'utf-8',
    cwd: root,
    timeout: 120_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - start;
  const passed = result.status === 0;
  const output = ((result.stderr ?? '') + (result.stdout ?? '')).trim();
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

// ─── Check 2: Vitest fail count ─────────────────────────────────────────────

/**
 * Run vitest and count failures. Must be < THRESHOLDS.vitestMaxFail.
 * @param {string} root
 * @param {number} maxFail - Maximum allowed failures (default 3)
 * @returns {CheckResult}
 */
export function checkVitestFailCount(root = projectRoot, maxFail = THRESHOLDS.vitestMaxFail) {
  const start = Date.now();
  const result = spawnSync('npx', ['vitest', 'run', '--reporter', 'basic'], {
    encoding: 'utf-8',
    cwd: root,
    timeout: 180_000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  const durationMs = Date.now() - start;
  const output = ((result.stdout ?? '') + (result.stderr ?? '')).trim();

  // Parse failure count from vitest output
  // Matches patterns like "3 failed", "Tests  3 failed"
  const failMatch = output.match(/(\d+)\s+failed/i);
  const failCount = failMatch ? parseInt(failMatch[1], 10) : (result.status !== 0 ? 1 : 0);
  const passed = result.status === 0 || failCount < maxFail;

  return {
    name: 'Vitest Fail Count',
    passed,
    required: true,
    message: passed
      ? `vitest passed (${failCount} failures, threshold < ${maxFail})`
      : `vitest has ${failCount} failures — threshold is < ${maxFail}`,
    durationMs,
  };
}

// ─── Check 3: Doctor score ──────────────────────────────────────────────────

/**
 * Run deckent doctor --json and verify score ≥ THRESHOLDS.doctorMinScore.
 * @param {string} root
 * @param {number} minScore - Minimum required score (default 90)
 * @returns {CheckResult}
 */
export function checkDoctorScore(root = projectRoot, minScore = THRESHOLDS.doctorMinScore) {
  const start = Date.now();
  const result = spawnSync('npx', ['deckent', 'doctor', '--json'], {
    encoding: 'utf-8',
    cwd: root,
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - start;

  if (result.error || result.status === null) {
    return {
      name: 'Doctor Score',
      passed: false,
      required: true,
      message: `doctor command failed to run: ${result.error?.message ?? 'timeout'}`,
      durationMs,
    };
  }

  let score = null;
  try {
    const stdout = result.stdout?.trim() ?? '';
    // Try to parse JSON output
    const jsonStart = stdout.indexOf('{');
    if (jsonStart !== -1) {
      const data = JSON.parse(stdout.slice(jsonStart));
      score = typeof data.score === 'number' ? data.score
        : typeof data.overall === 'number' ? data.overall
        : null;
    }
  } catch {
    // If JSON parsing fails, try extracting score from text output
    const scoreMatch = (result.stdout + result.stderr).match(/(\d+)\s*\/\s*100/);
    score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
  }

  if (score === null) {
    return {
      name: 'Doctor Score',
      passed: false,
      required: true,
      message: 'doctor output did not contain a parseable score',
      durationMs,
    };
  }

  const passed = score >= minScore;
  return {
    name: 'Doctor Score',
    passed,
    required: true,
    message: passed
      ? `doctor score ${score}/100 ≥ ${minScore} (OK)`
      : `doctor score ${score}/100 < ${minScore} (FAIL)`,
    durationMs,
  };
}

// ─── Check 4: Sprint cost ────────────────────────────────────────────────────

/**
 * Read sprint cost from metrics file and verify < THRESHOLDS.maxCostUsd.
 * @param {string} root
 * @param {string|null} sprint - Sprint ID (e.g. "sprint-146")
 * @param {number} maxCost - Maximum allowed cost in USD (default $95)
 * @returns {CheckResult}
 */
export function checkSprintCost(root = projectRoot, sprint = sprintId, maxCost = THRESHOLDS.maxCostUsd) {
  const metricsFiles = [];
  const deckentDir = join(root, '.deckent');

  if (existsSync(deckentDir)) {
    try {
      const files = readdirSync(deckentDir);
      const pattern = sprint ? `${sprint}-metrics` : '-metrics';
      metricsFiles.push(
        ...files
          .filter(f => f.includes(pattern) && f.endsWith('.jsonl'))
          .map(f => join(deckentDir, f))
      );
    } catch { /* skip */ }
  }

  if (metricsFiles.length === 0) {
    return {
      name: 'Sprint Cost',
      passed: true,
      required: false,
      message: 'no metrics file found — skipping cost check',
    };
  }

  let totalCostUsd = 0;
  let hasData = false;

  for (const metricsFile of metricsFiles) {
    try {
      const lines = readFileSync(metricsFile, 'utf-8').trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (typeof entry.costUsd === 'number') {
            totalCostUsd += entry.costUsd;
            hasData = true;
          } else if (typeof entry.totalCostUsd === 'number') {
            totalCostUsd = entry.totalCostUsd;
            hasData = true;
          }
        } catch { /* skip malformed lines */ }
      }
    } catch { /* skip unreadable files */ }
  }

  if (!hasData) {
    return {
      name: 'Sprint Cost',
      passed: true,
      required: false,
      message: 'no cost data in metrics — skipping cost check',
    };
  }

  const passed = totalCostUsd < maxCost;
  return {
    name: 'Sprint Cost',
    passed,
    required: false,
    message: passed
      ? `sprint cost $${totalCostUsd.toFixed(2)} < $${maxCost} (OK)`
      : `sprint cost $${totalCostUsd.toFixed(2)} ≥ $${maxCost} (OVER BUDGET)`,
  };
}

// ─── Check 5: NO_GO count ────────────────────────────────────────────────────

/**
 * Count NO_GO task results and verify ≤ THRESHOLDS.maxNoGoCount.
 * @param {string} root
 * @param {string|null} sprint - Sprint ID to filter results
 * @param {number} maxNoGo - Maximum allowed NO_GO count (default 2)
 * @returns {CheckResult}
 */
export function checkNoGoCount(root = projectRoot, sprint = sprintId, maxNoGo = THRESHOLDS.maxNoGoCount) {
  const tasksDir = join(root, '.tasks');
  if (!existsSync(tasksDir)) {
    return {
      name: 'NO_GO Count',
      passed: true,
      required: false,
      message: 'no .tasks/ directory — skipping NO_GO check',
    };
  }

  let resultFiles;
  try {
    resultFiles = readdirSync(tasksDir).filter(f => f.endsWith('.result'));
  } catch {
    return {
      name: 'NO_GO Count',
      passed: true,
      required: false,
      message: 'cannot read .tasks/ directory',
    };
  }

  if (resultFiles.length === 0) {
    return {
      name: 'NO_GO Count',
      passed: true,
      required: false,
      message: 'no result files found — skipping NO_GO check',
    };
  }

  let noGoCount = 0;
  let totalCount = 0;

  for (const file of resultFiles) {
    try {
      const result = JSON.parse(readFileSync(join(tasksDir, file), 'utf-8'));
      // Filter by sprint if provided
      if (sprint && result.sprintId && result.sprintId !== sprint) continue;
      totalCount++;
      if (
        result.selfAssessment === 'NO_GO' ||
        result.evaluationDecision === 'NO_GO'
      ) {
        noGoCount++;
      }
    } catch { /* skip malformed results */ }
  }

  if (totalCount === 0) {
    return {
      name: 'NO_GO Count',
      passed: true,
      required: false,
      message: `no results for sprint ${sprint ?? 'any'} — skipping NO_GO check`,
    };
  }

  const passed = noGoCount <= maxNoGo;
  return {
    name: 'NO_GO Count',
    passed,
    required: false,
    message: passed
      ? `NO_GO count ${noGoCount}/${totalCount} ≤ ${maxNoGo} (OK)`
      : `NO_GO count ${noGoCount}/${totalCount} > ${maxNoGo} (FAIL)`,
  };
}

// ─── Check 6: Prompt linter ──────────────────────────────────────────────────

/**
 * Run prompt linter and verify avg score ≥ THRESHOLDS.minPromptLinterAvg.
 * @param {string} root
 * @param {string|null} sprint - Sprint ID
 * @param {number} minAvg - Minimum avg linter score (default 75)
 * @returns {CheckResult}
 */
export function checkPromptLinter(root = projectRoot, sprint = sprintId, minAvg = THRESHOLDS.minPromptLinterAvg) {
  const linterScript = join(root, 'scripts', 'prompt-linter.mjs');
  if (!existsSync(linterScript)) {
    return {
      name: 'Prompt Linter',
      passed: true,
      required: false,
      message: 'prompt-linter.mjs not found — skipping',
    };
  }

  const linterArgs = ['scripts/prompt-linter.mjs', '--json'];
  if (sprint) linterArgs.push('--sprint', sprint);

  const start = Date.now();
  const result = spawnSync('node', linterArgs, {
    encoding: 'utf-8',
    cwd: root,
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - start;

  // Exit code 2 means no prompt files found — skip
  if (result.status === 2) {
    return {
      name: 'Prompt Linter',
      passed: true,
      required: false,
      message: 'no prompt files found — skipping linter check',
      durationMs,
    };
  }

  let avgScore = null;
  try {
    const stdout = result.stdout?.trim() ?? '';
    const jsonStart = stdout.indexOf('{');
    if (jsonStart !== -1) {
      const data = JSON.parse(stdout.slice(jsonStart));
      avgScore = typeof data.avg === 'number' ? data.avg
        : typeof data.average === 'number' ? data.average
        : null;
    }
  } catch { /* ignore JSON parse errors */ }

  if (avgScore === null) {
    // Try to extract from text output
    const avgMatch = (result.stdout + result.stderr).match(/avg(?:erage)?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
    avgScore = avgMatch ? parseFloat(avgMatch[1]) : null;
  }

  if (avgScore === null) {
    return {
      name: 'Prompt Linter',
      passed: result.status === 0,
      required: false,
      message: result.status === 0
        ? 'linter passed (no score parsed)'
        : 'linter failed (could not parse avg score)',
      durationMs,
    };
  }

  const passed = avgScore >= minAvg;
  return {
    name: 'Prompt Linter',
    passed,
    required: false,
    message: passed
      ? `prompt linter avg ${avgScore.toFixed(1)}/100 ≥ ${minAvg} (OK)`
      : `prompt linter avg ${avgScore.toFixed(1)}/100 < ${minAvg} (FAIL)`,
    durationMs,
  };
}

// ─── Run all checks ──────────────────────────────────────────────────────────

/**
 * Run all 6 chain gate checks and return results.
 * @param {string} root
 * @param {string|null} sprint
 * @returns {{ checks: CheckResult[], passed: boolean, requiredFailed: number }}
 */
export function runAllChecks(root = projectRoot, sprint = sprintId) {
  const checks = [
    checkTypeScript(root),
    checkVitestFailCount(root),
    checkDoctorScore(root),
    checkSprintCost(root, sprint),
    checkNoGoCount(root, sprint),
    checkPromptLinter(root, sprint),
  ];

  const requiredFailed = checks.filter(c => c.required && !c.passed).length;
  const passed = requiredFailed === 0;

  return { checks, passed, requiredFailed };
}

// ─── Main (CLI entry point) ──────────────────────────────────────────────────

// Only run when executed directly (not when imported in tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  let exitCode = 0;

  try {
    const { checks, passed, requiredFailed } = runAllChecks();

    if (outputJson) {
      process.stdout.write(JSON.stringify({ checks, passed, requiredFailed }, null, 2) + '\n');
    } else {
      const width = 60;
      const bar = '─'.repeat(width);
      process.stdout.write(`\n┌${bar}┐\n`);
      process.stdout.write(`│ Chain Safety Gate${' '.repeat(width - 18)}│\n`);
      if (sprintId) {
        const label = ` Sprint: ${sprintId}`;
        process.stdout.write(`│${label}${' '.repeat(width - label.length)}│\n`);
      }
      process.stdout.write(`└${bar}┘\n\n`);

      for (const check of checks) {
        const icon = check.passed ? '✓' : (check.required ? '✗' : '⚠');
        const label = check.required ? '' : ' (optional)';
        process.stdout.write(`  ${icon} ${check.name}${label}: ${check.message}\n`);
        if (check.durationMs !== undefined) {
          process.stdout.write(`    (${check.durationMs}ms)\n`);
        }
      }

      process.stdout.write('\n');

      if (passed) {
        process.stdout.write('  ✅ Chain gate PASSED — GO\n\n');
      } else {
        process.stdout.write(`  ❌ Chain gate FAILED — ${requiredFailed} required check(s) failed\n\n`);
      }
    }

    exitCode = passed ? 0 : 1;
  } catch (err) {
    if (outputJson) {
      process.stderr.write(JSON.stringify({ error: String(err) }) + '\n');
    } else {
      process.stderr.write(`Chain gate critical error: ${err}\n`);
    }
    exitCode = 2;
  }

  process.exit(exitCode);
}
