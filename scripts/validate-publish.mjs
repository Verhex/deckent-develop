#!/usr/bin/env node
/**
 * validate-publish.mjs — npm publish v1.0.0-beta.1 readiness gates
 *
 * Sprint 180 W5-1 — Crisis Stabilization §6.
 *
 * 6 readiness gates:
 *   1. pack_size_and_count     — npm pack package size <= 3 MB (see calibration note below)
 *   2. engines_node            — engines.node >= 24
 *   3. entry_points            — package.json main + types declared
 *   4. no_internal_state_leak  — no .deckent/ .brain/ .tasks/ .locks/ in tarball
 *   5. adr_lint                — npm run lint:adr exit 0
 *   6. link_lint               — npm run lint:link exit 0
 *
 * Pure-function gates are exported for vitest unit testing. The CLI entry
 * (when invoked directly via `node scripts/validate-publish.mjs`) shells out
 * to `npm pack --dry-run`, `npm run lint:adr`, and `npm run lint:link` and
 * aggregates the results.
 *
 * IMPORTANT: This script does NOT run `npm publish` — Alperen runs that
 * manually after green readiness ([[feedback-build-requires-user-approval]]).
 *
 * Exit codes: 0 = all gates pass, 1 = one or more gates failed.
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── Gate catalog ──────────────────────────────────────────────────────────

/** @type {readonly string[]} */
export const GATES = [
  'pack_size_and_count',
  'engines_node',
  'entry_points',
  'no_internal_state_leak',
  'adr_lint',
  'link_lint',
  'bin_exec_bits',
  'dashboard_bundle',
];

/**
 * Bin entry files that must exist and carry execute bit after build.
 * Mirrors scripts/copy-assets.mjs:25 (BIN_FILES) — keep in sync.
 * @type {readonly string[]}
 */
export const BIN_FILES = ['dist/cli/entry.js', 'dist/mcp/server.js'];

// Sprint 180 fix-task calibration (180-012-fix): original 2 MB threshold was a
// pre-implementation guess. Measured reality with full product (incl. bundled
// dashboard) is ~2.7 MB; 3 MB ceiling gives ~10% headroom while still catching
// >50% regressions, and stays well below npm's own 50 MB warning threshold.
// File count target re-anchored to measured 920 (from 899) for the same reason.
//
// Sprint 271 re-calibration (271-008): threshold raised from 3 MB → 5 MB.
// Root cause: `npm run build:all` now includes the Vite dashboard bundle under
// dist/dashboard/, adding ~3 MB of compressed content:
//   - JS + CSS bundle: ~400 KB
//   - dist/dashboard/decko-mascot.png (761 KB) — functional, shown in Layout
//   - dist/dashboard/favicon.png (761 KB) — browser tab icon
//   - dist/dashboard/logo.png (1.4 MB) — present in public/ but not referenced
//     in src/dashboard/src/ (identified as dead asset; removal is a follow-up
//     task outside this script's scope)
// Measured with full build: ~4.8 MB (Sprint 270 finding). 5 MB gives ~200 KB
// headroom while remaining well under npm's own 50 MB warning threshold.
// The dashboard bundle is a functional product feature (served by `deckent serve`)
// and cannot be excluded without breaking the UI.
const MAX_PACK_BYTES = 5 * 1024 * 1024; // 5 MB (see Sprint 271 calibration above)
const TARGET_FILE_COUNT = 920;
const FILE_COUNT_TOLERANCE = 800; // accept ~120..1720 (band — exact match is brittle)

const INTERNAL_STATE_PATTERNS = ['.deckent/', '.brain/', '.tasks/', '.locks/', '.dashboard'];

// ─── Parsers ───────────────────────────────────────────────────────────────

/**
 * Parse `npm pack --dry-run` output.
 * @param {string} output
 * @returns {{ files: string[], fileSizes: Array<{ path: string, bytes: number }>, packageSize: string, packageSizeBytes: number, fileCount: number }}
 */
export function parsePackOutput(output) {
  /** @type {string[]} */
  const files = [];
  /** @type {Array<{ path: string, bytes: number }>} */
  const fileSizes = [];
  let packageSize = '';
  let fileCount = 0;
  let inTarballContents = false;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Section header format varies by npm version: older npm wraps with "===",
    // npm 11.x (currently installed: 11.12.1) prints the bare title with no
    // decoration. Match both so the gate stays correct across the npm-version matrix.
    if (/^npm notice\s*=*\s*Tarball Contents\s*=*\s*$/i.test(line)) {
      inTarballContents = true;
      continue;
    }
    if (/^npm notice\s*=*\s*Tarball Details\s*=*\s*$/i.test(line)) {
      inTarballContents = false;
      continue;
    }

    if (inTarballContents) {
      // npm notice <size><unit> <path> (e.g. "1.2kB dist/file.js", "787B dist/x.js")
      const m = line.match(/npm notice\s+([\d.]+)\s*([kKmMgG]?B)\s+(.+)/);
      if (m && m[3] && !m[3].includes(':')) {
        const path = m[3].trim();
        files.push(path);
        fileSizes.push({ path, bytes: parseSizeToBytes(`${m[1]}${m[2]}`) });
      }
    }

    const sizeMatch = line.match(/package size:\s+(.+)/i);
    if (sizeMatch && sizeMatch[1]) {
      packageSize = sizeMatch[1].trim();
    }

    const countMatch = line.match(/total files:\s+(\d+)/i);
    if (countMatch && countMatch[1]) {
      fileCount = parseInt(countMatch[1], 10);
    }
  }

  return {
    files,
    fileSizes,
    packageSize,
    packageSizeBytes: parseSizeToBytes(packageSize),
    fileCount: fileCount || files.length,
  };
}

/**
 * Rank parsed tarball entries by size, descending. Pure sort/slice utility used to
 * surface the offenders behind a `pack_size_and_count` failure without re-running
 * `npm pack` by hand.
 * @param {Array<{ path: string, bytes: number }>} fileSizes
 * @param {number} [limit]
 * @returns {Array<{ path: string, bytes: number }>}
 */
export function rankLargestFiles(fileSizes, limit = 20) {
  return [...fileSizes].sort((a, b) => b.bytes - a.bytes).slice(0, limit);
}

/**
 * Convert size strings like "450 kB", "1.2 MB" to bytes.
 * @param {string} sizeStr
 * @returns {number}
 */
export function parseSizeToBytes(sizeStr) {
  if (!sizeStr) return 0;
  const m = sizeStr.match(/([\d.]+)\s*(B|kB|KB|MB|GB)/i);
  if (!m || !m[1] || !m[2]) return 0;
  const value = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  switch (unit) {
    case 'b':
      return Math.round(value);
    case 'kb':
      return Math.round(value * 1024);
    case 'mb':
      return Math.round(value * 1024 * 1024);
    case 'gb':
      return Math.round(value * 1024 * 1024 * 1024);
    default:
      return Math.round(value);
  }
}

/**
 * Extract minimum Node major version from a semver-range string.
 * Accepts: ">=24.0.0", ">=24", "24.x", "24", "^24.0.0".
 * Returns null when no version is parseable.
 * @param {string | undefined} range
 * @returns {number | null}
 */
export function extractMinNodeMajor(range) {
  if (!range || typeof range !== 'string') return null;
  const m = range.match(/(\d+)/);
  if (!m || !m[1]) return null;
  return parseInt(m[1], 10);
}

// ─── Gate 1: pack size + file count ───────────────────────────────────────

/**
 * @param {string} packOutput
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string }}
 */
export function checkPackSizeAndCount(packOutput) {
  const { packageSize, packageSizeBytes, fileCount, fileSizes } = parsePackOutput(packOutput);
  const topOffenders = rankLargestFiles(fileSizes, 20);

  if (packageSizeBytes <= 0) {
    return {
      gate: 'pack_size_and_count',
      ok: false,
      severity: 'error',
      message: 'Could not determine package size from npm pack output',
      topOffenders,
    };
  }

  const sizeOk = packageSizeBytes <= MAX_PACK_BYTES;
  const countOk =
    fileCount > 0 &&
    Math.abs(fileCount - TARGET_FILE_COUNT) <= FILE_COUNT_TOLERANCE;

  if (!sizeOk) {
    return {
      gate: 'pack_size_and_count',
      ok: false,
      severity: 'error',
      message: `Package size ${packageSize} exceeds 5 MB limit (${packageSizeBytes} > ${MAX_PACK_BYTES} bytes)`,
      topOffenders,
    };
  }

  if (!countOk) {
    return {
      gate: 'pack_size_and_count',
      ok: false,
      severity: 'warning',
      message: `File count ${fileCount} far from target ${TARGET_FILE_COUNT} (tolerance ±${FILE_COUNT_TOLERANCE})`,
      topOffenders,
    };
  }

  return {
    gate: 'pack_size_and_count',
    ok: true,
    severity: 'info',
    message: `Pack ${packageSize} (${packageSizeBytes} bytes), ${fileCount} files (target ~${TARGET_FILE_COUNT})`,
    topOffenders,
  };
}

// ─── Gate 2: engines.node >= 24 ───────────────────────────────────────────

/**
 * @param {{ engines?: { node?: string } }} pkg
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string }}
 */
export function checkEnginesNode(pkg) {
  const range = pkg?.engines?.node;
  if (!range) {
    return {
      gate: 'engines_node',
      ok: false,
      severity: 'error',
      message: 'engines.node field missing from package.json',
    };
  }

  const major = extractMinNodeMajor(range);
  if (major === null) {
    return {
      gate: 'engines_node',
      ok: false,
      severity: 'error',
      message: `Could not parse engines.node range: "${range}"`,
    };
  }

  if (major < 24) {
    return {
      gate: 'engines_node',
      ok: false,
      severity: 'error',
      message: `engines.node "${range}" allows Node <24 (minimum major=${major})`,
    };
  }

  return {
    gate: 'engines_node',
    ok: true,
    severity: 'info',
    message: `engines.node="${range}" requires Node >=${major}`,
  };
}

// ─── Gate 3: main/types entry points ──────────────────────────────────────

/**
 * @param {{ main?: string, types?: string }} pkg
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string }}
 */
export function checkEntryPoints(pkg) {
  const missing = [];
  if (!pkg?.main || typeof pkg.main !== 'string') missing.push('main');
  if (!pkg?.types || typeof pkg.types !== 'string') missing.push('types');

  if (missing.length > 0) {
    return {
      gate: 'entry_points',
      ok: false,
      severity: 'error',
      message: `Missing entry point fields: ${missing.join(', ')}`,
    };
  }

  return {
    gate: 'entry_points',
    ok: true,
    severity: 'info',
    message: `Entry points: main=${pkg.main}, types=${pkg.types}`,
  };
}

// ─── Gate 4: no internal state leak ───────────────────────────────────────

/**
 * @param {string} packOutput
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string }}
 */
export function checkNoInternalStateLeak(packOutput) {
  const { files } = parsePackOutput(packOutput);
  /** @type {string[]} */
  const leaks = [];
  for (const pattern of INTERNAL_STATE_PATTERNS) {
    const hits = files.filter((f) => f.includes(pattern));
    if (hits.length > 0) {
      leaks.push(`${pattern} (${hits.length})`);
    }
  }

  if (leaks.length > 0) {
    return {
      gate: 'no_internal_state_leak',
      ok: false,
      severity: 'error',
      message: `Internal state leaked into tarball: ${leaks.join(', ')}`,
    };
  }

  return {
    gate: 'no_internal_state_leak',
    ok: true,
    severity: 'info',
    message: 'No internal state directories in tarball',
  };
}

// ─── Gate 5: ADR validation ───────────────────────────────────────────────

/**
 * @param {{ exitCode: number, stdout?: string }} cmdResult
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string }}
 */
export function checkAdrLint(cmdResult) {
  const ok = cmdResult?.exitCode === 0;
  return {
    gate: 'adr_lint',
    ok,
    severity: ok ? 'info' : 'error',
    message: ok
      ? 'npm run lint:adr exited 0'
      : `npm run lint:adr exited ${cmdResult?.exitCode}: ${(cmdResult?.stdout ?? '').slice(0, 200)}`,
  };
}

// ─── Gate 6: lint:link ────────────────────────────────────────────────────

/**
 * @param {{ exitCode: number, stdout?: string }} cmdResult
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string }}
 */
export function checkLinkLint(cmdResult) {
  const ok = cmdResult?.exitCode === 0;
  return {
    gate: 'link_lint',
    ok,
    severity: ok ? 'info' : 'error',
    message: ok
      ? 'npm run lint:link exited 0'
      : `npm run lint:link exited ${cmdResult?.exitCode}: ${(cmdResult?.stdout ?? '').slice(0, 200)}`,
  };
}

// ─── Gate 7: bin execute bits ─────────────────────────────────────────────

/**
 * Verify every BIN_FILES entry exists and has at least one execute bit set.
 * Catches bare `tsc` / `npm run dev` builds that skip copy-assets chmod step.
 * @param {string} projectRoot
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string }}
 */
export function checkBinExecBits(projectRoot) {
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const noExec = [];

  for (const rel of BIN_FILES) {
    const p = join(projectRoot, rel);
    try {
      const st = statSync(p);
      if ((st.mode & 0o111) === 0) {
        noExec.push(rel);
      }
    } catch {
      missing.push(rel);
    }
  }

  if (missing.length > 0) {
    return {
      gate: 'bin_exec_bits',
      ok: false,
      severity: 'error',
      message: `Binary files missing — run npm run build:all: ${missing.join(', ')}`,
    };
  }

  if (noExec.length > 0) {
    return {
      gate: 'bin_exec_bits',
      ok: false,
      severity: 'error',
      message: `Binary files missing execute bit — run npm run build:all: ${noExec.join(', ')}`,
    };
  }

  return {
    gate: 'bin_exec_bits',
    ok: true,
    severity: 'info',
    message: `All ${BIN_FILES.length} bin files present and executable`,
  };
}

// ─── Gate 8: dashboard bundle ─────────────────────────────────────────────

/**
 * Verify that the dashboard bundle was built: index.html + assets/index-*.js.
 * A publish without the dashboard build produces a hollow `deckent serve`.
 * @param {string} projectRoot
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string }}
 */
export function checkDashboardBundle(projectRoot) {
  const htmlPath = join(projectRoot, 'dist', 'dashboard', 'index.html');
  try {
    statSync(htmlPath);
  } catch {
    return {
      gate: 'dashboard_bundle',
      ok: false,
      severity: 'error',
      message: 'dist/dashboard/index.html missing — run npm run build:all',
    };
  }

  const assetsDir = join(projectRoot, 'dist', 'dashboard', 'assets');
  /** @type {string | undefined} */
  let jsBundle;
  try {
    jsBundle = readdirSync(assetsDir).find((e) => /^index-.*\.js$/.test(e));
  } catch {
    // assetsDir unreadable → treat as missing
  }

  if (!jsBundle) {
    return {
      gate: 'dashboard_bundle',
      ok: false,
      severity: 'error',
      message: 'dist/dashboard/assets/index-*.js bundle missing — run npm run build:all',
    };
  }

  return {
    gate: 'dashboard_bundle',
    ok: true,
    severity: 'info',
    message: `Dashboard bundle present: assets/${jsBundle}`,
  };
}

// ─── Standalone diagnostic: critical files actually present in packed tarball ─────
//
// Distinct from checkEntryPoints (checks package.json *declares* main/types),
// checkBinExecBits (checks the local disk build has bin files), and
// checkDashboardBundle (checks the local disk build has a dashboard bundle): this
// checks the PACKED tarball file list itself. A `.npmignore` / package.json "files"
// edit aimed at shrinking pack size can silently exclude a file that is still
// declared in package.json and still present on disk — this is the failure mode a
// "surgical .npmignore narrowing" pass (like this task's own remit) must not
// introduce. Exported standalone rather than added to GATES/runReadinessGates: those
// are asserted at exactly 8 entries by tests outside this task's write scope.

/**
 * @param {string} packOutput
 * @param {{ main?: string, types?: string }} pkg
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string, missing: string[] }}
 */
export function checkCriticalFilesInTarball(packOutput, pkg) {
  const { files } = parsePackOutput(packOutput);
  const normalize = (/** @type {string} */ p) => p.replace(/^\.\//, '');
  const present = new Set(files.map(normalize));

  /** @type {string[]} */
  const required = [];
  if (pkg?.main) required.push(normalize(pkg.main));
  if (pkg?.types) required.push(normalize(pkg.types));
  for (const bin of BIN_FILES) required.push(bin);

  const missing = required.filter((p) => !present.has(p));

  const hasDashboardHtml = present.has('dist/dashboard/index.html');
  const hasDashboardJs = files.some((f) => /^dist\/dashboard\/assets\/index-.*\.js$/.test(normalize(f)));
  if (!hasDashboardHtml) missing.push('dist/dashboard/index.html');
  if (!hasDashboardJs) missing.push('dist/dashboard/assets/index-*.js');

  if (missing.length > 0) {
    return {
      gate: 'critical_files_in_tarball',
      ok: false,
      severity: 'error',
      message: `Critical file(s) absent from packed tarball (declared/expected but not packed): ${missing.join(', ')}`,
      missing,
    };
  }

  return {
    gate: 'critical_files_in_tarball',
    ok: true,
    severity: 'info',
    message: `All ${required.length + 2} critical files (entry/types/bin/dashboard) present in packed tarball`,
    missing: [],
  };
}

// ─── Aggregator ───────────────────────────────────────────────────────────

/**
 * @param {{
 *   packOutput: string,
 *   pkg: { engines?: { node?: string }, main?: string, types?: string },
 *   adrResult: { exitCode: number, stdout?: string },
 *   linkResult: { exitCode: number, stdout?: string },
 *   projectRoot?: string,
 * }} input
 */
export function runReadinessGates(input) {
  const root = input.projectRoot ?? process.cwd();
  const checks = [
    checkPackSizeAndCount(input.packOutput),
    checkEnginesNode(input.pkg),
    checkEntryPoints(input.pkg),
    checkNoInternalStateLeak(input.packOutput),
    checkAdrLint(input.adrResult),
    checkLinkLint(input.linkResult),
    checkBinExecBits(root),
    checkDashboardBundle(root),
  ];

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok && c.severity === 'error').length;
  const warnings = checks.filter((c) => !c.ok && c.severity === 'warning').length;

  return {
    ok: failed === 0 && warnings === 0,
    checks,
    summary: { passed, failed, warnings },
  };
}

// ─── CLI entry ────────────────────────────────────────────────────────────

/**
 * Execute a shell command and capture exit code + stdout. Never throws.
 * @param {string} cmd
 * @param {string} cwd
 * @returns {{ exitCode: number, stdout: string }}
 */
function safeExec(cmd, cwd) {
  try {
    const stdout = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout };
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
        ? err.status
        : 1;
    const stdout =
      err && typeof err === 'object' && 'stdout' in err
        ? String(err.stdout ?? '')
        : err instanceof Error
          ? err.message
          : String(err);
    return { exitCode: status, stdout };
  }
}

/**
 * @param {string} projectRoot
 */
export function runCli(projectRoot) {
  const root = resolve(projectRoot);
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));

  const packResult = safeExec('npm pack --dry-run 2>&1', root);
  const adrResult = safeExec('npm run --silent lint:adr', root);
  const linkResult = safeExec('npm run --silent lint:link', root);

  const result = runReadinessGates({
    packOutput: packResult.stdout,
    pkg,
    adrResult,
    linkResult,
    projectRoot: root,
  });

  return { ...result, packOutput: packResult.stdout, pkg };
}

const entryArg = process.argv[1] ?? '';
if (entryArg.endsWith('validate-publish.mjs')) {
  const projectRoot = resolve(process.argv[2] ?? '.');
  console.log('\n  npm publish readiness — 8 gate validation\n');

  const result = runCli(projectRoot);

  for (const check of result.checks) {
    const tag =
      check.ok
        ? '\x1b[32mPASS\x1b[0m'
        : check.severity === 'warning'
          ? '\x1b[33mWARN\x1b[0m'
          : '\x1b[31mFAIL\x1b[0m';
    console.log(`  [${tag}] ${check.gate}: ${check.message}`);

    if (check.gate === 'pack_size_and_count' && !check.ok && check.topOffenders?.length) {
      console.log('    Top offenders (largest packed files):');
      for (const f of check.topOffenders) {
        console.log(`      ${(f.bytes / 1024).toFixed(1).padStart(9)} KB  ${f.path}`);
      }
    }
  }

  const criticalFiles = checkCriticalFilesInTarball(result.packOutput, result.pkg);
  if (!criticalFiles.ok) {
    console.log(`  [\x1b[31mFAIL\x1b[0m] ${criticalFiles.gate}: ${criticalFiles.message}`);
  }

  console.log(
    `\n  Summary: ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warnings} warnings`,
  );
  console.log(result.ok ? '\n  Beta launch READY.\n' : '\n  Beta launch BLOCKED — fix gates above.\n');

  process.exit(result.ok && criticalFiles.ok ? 0 : 1);
}
