#!/usr/bin/env node
/**
 * validate-publish.mjs — npm publish v0.100.0 readiness gates
 *
 * Sprint 180 W5-1 — Crisis Stabilization §6.
 *
 * 6 readiness gates:
 *   1. pack_size_and_count     — npm pack package size <= calibrated ceiling below
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

import { execSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXEC_AUTHORITY_ABI_NAME,
  EXEC_AUTHORITY_ABI_VERSION,
  EXEC_AUTHORITY_HANDLE_ABI,
  EXEC_AUTHORITY_NAPI_VERSION,
  EXEC_AUTHORITY_NATIVE_PACKAGE,
  nativeSourceTreeIdentity,
} from './build-exec-authority-native.mjs';
import {
  NPM_SHRINKWRAP_FILENAME,
  readCanonicalNpmShrinkwrapIdentity,
} from './npm-shrinkwrap-contract.mjs';

const SCRIPT_DIR = resolve(fileURLToPath(import.meta.url), '..');

/** Category-baseline ratchet file — see checkPackCategoryBaseline (Sprint 413 413-002). */
const BASELINE_PATH = join(SCRIPT_DIR, 'pack-baseline.json');

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
// 2026-08-14 re-calibration (0.100.0 rebaseline): threshold raised 5 MB → 6 MB. The
// compiled dist/ grew with the accumulated production code (measured packed size 5.11 MB
// / 5,360,281 bytes at 0.100.0 — all legitimate dist/{core,orchestra,cli} .js + .d.ts,
// no docs/ or archive in the tarball; `files` is dist/bin/assets/README/LICENSE only).
// 6 MB gives ~17% headroom while staying far below npm's 50 MB warning — same calibration
// pattern as the earlier 2→3→5 MB bumps, not a way to hide a real bloat regression.
// 2026-09-01 native-custody delivery re-calibration: the exact publish inventory now
// deliberately includes the versioned native ABI source plus one complete current-host
// Release artifact pair. The real packed tarball is 6,436,995 bytes; 7 MB leaves 14.0%
// headroom while the category ratchet still detects unadmitted files or category growth.
const MAX_PACK_BYTES = 7 * 1024 * 1024; // 7 MB (native-custody delivery calibration above)

// Sprint 413 (413-002, PUB-02): the absolute file-count pin (920±800, upper bound
// 1720) is retired — it WARNed on the honest, all-legitimate 1853-file compiled
// output (876 .js + 863 .d.ts + 57 .md + 50 .json + 7 assets) and made
// `runReadinessGates().ok` false on zero actual regression; raising the tolerance
// again would just hide the next real bloat regression instead of catching it.
// Replaced by a categorical baseline-delta ratchet — see checkPackCategoryBaseline /
// scripts/pack-baseline.json below — that tracks (dir-depth-2 × extension-class)
// buckets against a committed, pack-generated baseline instead of one global count.

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

// ─── JSON pack parser (live CLI path — Sprint 413 413-002 / PUB-01) ───────────
//
// `parsePackOutput` above scrapes npm's human-readable `npm pack --dry-run` text —
// the section-header format and even whether stdout is non-empty vary across npm
// versions / non-TTY environments (PUB-01: reproduced empty-output risk on npm 11.x
// non-TTY). It stays exported unchanged because three test files outside this task's
// write scope unit-test it directly against synthetic npm-notice fixtures. The real
// CLI invocation (runCli, below) no longer uses it: it shells out to
// `npm pack --dry-run --json --ignore-scripts` and parses the JSON directly via
// parsePackJson. No text fallback on parse failure — an empty/malformed pack result
// must FAIL the gates honestly (PUB-01 regression lock), never silently pass.

/**
 * Format a byte count for human display, matching the `packageSize` field shape
 * `parsePackOutput`/`parseSizeToBytes` round-trip (e.g. "3.6 MB", "512 B").
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${Math.round(bytes)} B`;
}

/**
 * Parse `npm pack --dry-run --json --ignore-scripts` stdout. Returns the same shape
 * as parsePackOutput ({ files, fileSizes, packageSize, packageSizeBytes, fileCount })
 * so every gate below can consume either via normalizeParsed. On malformed JSON, an
 * empty array, or a missing/non-array `files[]` — the honest empty/zeroed shape is
 * returned (never throws, never fabricates data); downstream gates (checkPackSizeAndCount's
 * `packageSizeBytes <= 0` branch, checkPackCategoryBaseline's empty-fileSizes branch)
 * turn that into an explicit FAIL.
 * @param {string} jsonText
 * @returns {{ files: string[], fileSizes: Array<{ path: string, bytes: number }>, packageSize: string, packageSizeBytes: number, fileCount: number, packageName: string }}
 */
export function parsePackJson(jsonText) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { files: [], fileSizes: [], packageSize: '', packageSizeBytes: 0, fileCount: 0, packageName: '' };
  }

  const entry = Array.isArray(parsed) ? parsed[0] : undefined;
  if (!entry || typeof entry !== 'object' || !Array.isArray(/** @type {{files?: unknown}} */ (entry).files)) {
    return { files: [], fileSizes: [], packageSize: '', packageSizeBytes: 0, fileCount: 0, packageName: '' };
  }

  const rawFiles = /** @type {{ files: Array<{ path?: unknown, size?: unknown }>, size?: unknown, entryCount?: unknown, name?: unknown }} */ (entry);
  const fileSizes = rawFiles.files
    .map((f) => ({ path: String(f?.path ?? ''), bytes: Number(f?.size ?? 0) || 0 }))
    .filter((f) => f.path.length > 0);
  const files = fileSizes.map((f) => f.path);
  const packageSizeBytes = Number(rawFiles.size ?? 0) || 0;

  return {
    files,
    fileSizes,
    packageSize: formatBytes(packageSizeBytes),
    packageSizeBytes,
    fileCount: Number(rawFiles.entryCount ?? files.length) || files.length,
    packageName: typeof rawFiles.name === 'string' ? rawFiles.name : '',
  };
}

/**
 * Accept either a raw npm-pack TEXT blob (legacy path, parsed via parsePackOutput)
 * or an already-parsed pack object (JSON path, e.g. from parsePackJson) — lets every
 * gate below stay agnostic to which parser produced the data.
 * @param {string | { files: string[], fileSizes: Array<{ path: string, bytes: number }>, packageSize: string, packageSizeBytes: number, fileCount: number }} input
 */
export function normalizeParsed(input) {
  return typeof input === 'string' ? parsePackOutput(input) : input;
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
 * @param {string | ReturnType<typeof parsePackJson>} packOutput raw npm-notice text OR a pre-parsed pack object (normalizeParsed)
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string }}
 */
export function checkPackSizeAndCount(packOutput) {
  const { packageSize, packageSizeBytes, fileCount, fileSizes } = normalizeParsed(packOutput);
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

  if (!sizeOk) {
    return {
      gate: 'pack_size_and_count',
      ok: false,
      severity: 'error',
      message: `Package size ${packageSize} exceeds ${MAX_PACK_BYTES / 1024 / 1024} MB limit (${packageSizeBytes} > ${MAX_PACK_BYTES} bytes)`,
      topOffenders,
    };
  }

  return {
    gate: 'pack_size_and_count',
    ok: true,
    severity: 'info',
    message: `Pack ${packageSize} (${packageSizeBytes} bytes), ${fileCount} files`,
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
  const { files } = normalizeParsed(packOutput);
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

// ─── PKG-05: lint:builtins-drift (standalone diagnostic) ──────────────────
//
// Not added to GATES/runReadinessGates — those are asserted at exactly 8 entries by
// tests outside this task's write scope (same precedent as checkCriticalFilesInTarball
// below). Wired into the CLI print/exit-code path only (runCli + entry block).

/**
 * Async-spawn wrapper around `node scripts/builtins-drift-check.mjs --check` (see runCli).
 * Exit 0 = baseline-green (no new drift beyond the pinned baseline). Non-zero = new drift
 * or a scan/missing-baseline error. builtins-drift-check.mjs writes its actionable FAIL
 * detail — the drifted-key list plus the exact re-pin command
 * (`node scripts/builtins-drift-check.mjs --write`) — to STDERR, so both streams are
 * relayed into the gate message; an execSync-style stdout-only capture would silently
 * drop that detail.
 * @param {{ exitCode: number, stdout?: string, stderr?: string }} cmdResult
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string }}
 */
export function checkBuiltinsDrift(cmdResult) {
  const ok = cmdResult?.exitCode === 0;
  const stdout = (cmdResult?.stdout ?? '').trim();
  const stderr = (cmdResult?.stderr ?? '').trim();

  if (ok) {
    return {
      gate: 'builtins_drift',
      ok: true,
      severity: 'info',
      message: `[drift-gate] baseline-green — ${stdout || 'builtins-drift-check --check exited 0'}`,
    };
  }

  const detail = [stderr, stdout].filter(Boolean).join(' | ') || `exited ${cmdResult?.exitCode} with no output`;
  return {
    gate: 'builtins_drift',
    ok: false,
    severity: 'error',
    message: `[drift-gate] builtins-drift-check --check exited ${cmdResult?.exitCode} — ${detail.slice(0, 2000)}`,
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
  const { files } = normalizeParsed(packOutput);
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

const ROOT_DEPENDENCY_LOCK_FILES = Object.freeze([
  NPM_SHRINKWRAP_FILENAME,
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]);

/**
 * The published package has exactly one dependency-resolution authority: the
 * canonical root npm-shrinkwrap.json. npm pack's JSON inventory supplies only
 * paths and byte lengths, so this gate binds that inventory to a stable-read
 * source identity produced by npm-shrinkwrap-contract.mjs.
 * @param {string | ReturnType<typeof parsePackJson>} packOutput
 * @param {{ name?: string, version?: string }} pkg
 * @param {string} root
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'error', message: string, missing: string[], unexpected: string[], npmShrinkwrapIdentity?: ReturnType<typeof readCanonicalNpmShrinkwrapIdentity> }}
 */
export function checkNpmShrinkwrapTarball(packOutput, pkg, root = process.cwd()) {
  const gate = 'npm_shrinkwrap_tarball';
  const fail = (message, missing = [], unexpected = []) => ({
    gate,
    ok: false,
    severity: 'error',
    message,
    missing,
    unexpected,
  });
  const parsed = normalizeParsed(packOutput);
  const entries = parsed.fileSizes.map(({ path, bytes }) => ({
    path: path.replace(/^\.\//u, ''),
    bytes,
  }));
  const shrinkwrapEntries = entries.filter(entry => entry.path === NPM_SHRINKWRAP_FILENAME);
  const unexpected = entries
    .filter(entry => ROOT_DEPENDENCY_LOCK_FILES.includes(entry.path)
      && entry.path !== NPM_SHRINKWRAP_FILENAME)
    .map(entry => entry.path);
  const missing = shrinkwrapEntries.length === 0 ? [NPM_SHRINKWRAP_FILENAME] : [];
  if (shrinkwrapEntries.length !== 1 || unexpected.length > 0) {
    const duplicate = shrinkwrapEntries.length > 1
      ? [`${NPM_SHRINKWRAP_FILENAME} (${shrinkwrapEntries.length} entries)`]
      : [];
    return fail(
      `packed dependency lock authority mismatch${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}${duplicate.length > 0 ? `; duplicate: ${duplicate.join(', ')}` : ''}${unexpected.length > 0 ? `; unexpected root lock: ${unexpected.join(', ')}` : ''}`,
      missing,
      [...duplicate, ...unexpected],
    );
  }
  let npmShrinkwrapIdentity;
  try {
    npmShrinkwrapIdentity = readCanonicalNpmShrinkwrapIdentity(resolve(root));
  } catch (error) {
    return fail(`canonical npm shrinkwrap is unsafe or invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (pkg?.name !== npmShrinkwrapIdentity.name
    || pkg?.version !== npmShrinkwrapIdentity.version) {
    return fail('npm pack package identity differs from canonical npm shrinkwrap identity');
  }
  if (shrinkwrapEntries[0].bytes !== npmShrinkwrapIdentity.byteLength) {
    return fail(`packed byte count differs from source file: ${NPM_SHRINKWRAP_FILENAME}`);
  }
  return {
    gate,
    ok: true,
    severity: 'info',
    message: `${NPM_SHRINKWRAP_FILENAME} is the sole packed root lock (${npmShrinkwrapIdentity.byteLength} bytes, ${npmShrinkwrapIdentity.packageCount} packages, ${npmShrinkwrapIdentity.sha256})`,
    missing: [],
    unexpected: [],
    npmShrinkwrapIdentity,
  };
}

const NATIVE_ARTIFACT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'abiName',
  'abiVersion',
  'handleAbi',
  'napiVersion',
  'packageName',
  'packageVersion',
  'rootPackageName',
  'rootPackageVersion',
  'platform',
  'arch',
  'buildType',
  'binaryFile',
  'binaryByteLength',
  'binarySha256',
  'nativeSourceTreeSha256',
]);
const NATIVE_BINARY_FILE = 'exec_authority.node';
const NATIVE_ARTIFACT_FILE = 'artifact.json';
const NATIVE_BINARY_MAX_BYTES = 128 * 1024 * 1024;
const NATIVE_MANIFEST_MAX_BYTES = 1024 * 1024;
const NATIVE_RUNTIME_METADATA_MAX_BYTES = 16 * 1024;
const NATIVE_SOURCE_FILE_MAX_BYTES = 8 * 1024 * 1024;
const SHA256_WITH_PREFIX_RE = /^sha256:[a-f0-9]{64}$/u;

function exactObjectKeys(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index]);
}

function validNativePackageVersion(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && !value.includes('\0');
}

function readStablePublishFile(root, relativePath, maximumBytes) {
  const canonicalRoot = realpathSync.native(root);
  const path = join(canonicalRoot, ...relativePath.split('/'));
  const named = lstatSync(path, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n
    || named.size <= 0n || named.size > BigInt(maximumBytes)
    || realpathSync.native(path) !== path) {
    throw new Error(`E_PUBLISH_NATIVE_FILE_UNSAFE:${relativePath}`);
  }
  let fd;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n
      || before.dev !== named.dev || before.ino !== named.ino
      || before.size !== named.size || before.mtimeNs !== named.mtimeNs) {
      throw new Error(`E_PUBLISH_NATIVE_FILE_CHANGED:${relativePath}`);
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const afterPath = lstatSync(path, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || after.mtimeNs !== before.mtimeNs
      || afterPath.dev !== before.dev || afterPath.ino !== before.ino
      || afterPath.size !== before.size || afterPath.mtimeNs !== before.mtimeNs
      || BigInt(bytes.byteLength) !== before.size) {
      throw new Error(`E_PUBLISH_NATIVE_FILE_CHANGED:${relativePath}`);
    }
    return bytes;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function validateNativeArtifact(
  artifact,
  nativePackageVersion,
  rootPackageVersion,
  platform,
  arch,
  binaryBytes,
  nativeSourceSha256,
) {
  if (!exactObjectKeys(artifact, NATIVE_ARTIFACT_KEYS)
    || Object.keys(artifact).some((key, index) => key !== NATIVE_ARTIFACT_KEYS[index])) return false;
  if (artifact.schemaVersion !== 1
    || artifact.kind !== 'deckent-exec-authority-native-artifact'
    || artifact.abiName !== EXEC_AUTHORITY_ABI_NAME
    || artifact.abiVersion !== EXEC_AUTHORITY_ABI_VERSION
    || artifact.handleAbi !== EXEC_AUTHORITY_HANDLE_ABI
    || artifact.napiVersion !== EXEC_AUTHORITY_NAPI_VERSION
    || artifact.packageName !== EXEC_AUTHORITY_NATIVE_PACKAGE
    || artifact.packageVersion !== nativePackageVersion
    || artifact.rootPackageName !== 'deckent'
    || artifact.rootPackageVersion !== rootPackageVersion
    || artifact.platform !== platform
    || artifact.arch !== arch
    || artifact.buildType !== 'Release'
    || artifact.binaryFile !== NATIVE_BINARY_FILE
    || !Number.isSafeInteger(artifact.binaryByteLength)
    || artifact.binaryByteLength <= 0
    || typeof artifact.binarySha256 !== 'string'
    || !SHA256_WITH_PREFIX_RE.test(artifact.binarySha256)
    || artifact.nativeSourceTreeSha256 !== nativeSourceSha256) {
    return false;
  }
  return artifact.binaryByteLength === binaryBytes.byteLength
    && artifact.binarySha256
      === `sha256:${createHash('sha256').update(binaryBytes).digest('hex')}`;
}

/**
 * Standalone native-delivery publish gate. `npm pack --dry-run --json` exposes
 * only path and byte-count inventory, so this binds that inventory to the exact
 * owner-local files while the installed-package verifier remains responsible
 * for re-reading bytes from the extracted package. No absent/partial prebuild,
 * generated build tree, Debug output, symlink, hard link, or stale source digest
 * is accepted here.
 *
 * @param {string | ReturnType<typeof parsePackJson>} packOutput
 * @param {{ name?: string, version?: string }} pkg
 * @param {string} root
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'error', message: string, missing: string[], unexpected: string[] }}
 */
export function checkNativeExecAuthorityTarball(
  packOutput,
  pkg,
  root = process.cwd(),
  platform = process.platform,
  arch = process.arch,
) {
  const gate = 'native_exec_authority_tarball';
  const fail = (message, missing = [], unexpected = []) => ({
    gate,
    ok: false,
    severity: 'error',
    message,
    missing,
    unexpected,
  });
  if (pkg?.name !== 'deckent' || !validNativePackageVersion(pkg?.version)) {
    return fail('root package identity is missing or invalid');
  }
  if (!['linux', 'darwin', 'win32'].includes(platform)
    || !['x64', 'arm64', 'ia32', 'arm'].includes(arch)) {
    return fail(`current native platform is unsupported: ${platform}-${arch}`);
  }

  const parsed = normalizeParsed(packOutput);
  const normalizedEntries = parsed.fileSizes.map(({ path, bytes }) => ({
    path: path.replace(/^\.\//u, ''),
    bytes,
  }));
  const packedSizes = new Map();
  const duplicatePaths = [];
  for (const entry of normalizedEntries) {
    if (packedSizes.has(entry.path)) duplicatePaths.push(entry.path);
    packedSizes.set(entry.path, entry.bytes);
  }
  if (duplicatePaths.length > 0) {
    return fail(`duplicate native pack inventory path(s): ${duplicatePaths.join(', ')}`, [], duplicatePaths);
  }

  let sourceIdentity;
  try {
    sourceIdentity = nativeSourceTreeIdentity(root);
  } catch (error) {
    return fail(`native source identity unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }

  const prebuildRoot = `native/exec-authority/prebuilds/${platform}-${arch}/napi-v${EXEC_AUTHORITY_NAPI_VERSION}`;
  const artifactPath = `${prebuildRoot}/${NATIVE_ARTIFACT_FILE}`;
  const binaryPath = `${prebuildRoot}/${NATIVE_BINARY_FILE}`;
  const required = ['package.json', ...sourceIdentity.paths, artifactPath, binaryPath];
  const missing = required.filter(path => !packedSizes.has(path));

  const packedNativeSource = normalizedEntries
    .map(entry => entry.path)
    .filter(path => path === 'native/exec-authority/package.json'
      || path === 'native/exec-authority/binding.gyp'
      || path === 'native/exec-authority/index.mjs'
      || path.startsWith('native/exec-authority/src/'))
    .sort();
  const expectedNativeSource = [...sourceIdentity.paths].sort();
  const unexpectedSource = packedNativeSource.filter(path => !expectedNativeSource.includes(path));

  const nativePaths = normalizedEntries
    .map(entry => entry.path)
    .filter(path => path.startsWith('native/exec-authority/'));
  const unexpectedNativeRoot = nativePaths.filter(path => !expectedNativeSource.includes(path)
    && !path.startsWith('native/exec-authority/prebuilds/'));
  const generatedLeak = nativePaths.filter(path => path.startsWith('native/exec-authority/build/')
    || path.includes('/Debug/')
    || /\/prebuilds\/(?:\.next-|\.backup-|\.staging-|\.tmp-)/u.test(path));
  const prebuildFiles = nativePaths.filter(path => path.startsWith('native/exec-authority/prebuilds/'));
  const invalidPrebuildLayout = prebuildFiles.filter(path => !/^native\/exec-authority\/prebuilds\/[^/]+\/napi-v8\/(?:artifact\.json|exec_authority\.node)$/u.test(path));
  const prebuildDirectories = new Map();
  for (const path of prebuildFiles) {
    const directory = path.slice(0, path.lastIndexOf('/'));
    const names = prebuildDirectories.get(directory) ?? new Set();
    names.add(path.slice(path.lastIndexOf('/') + 1));
    prebuildDirectories.set(directory, names);
  }
  const partialPrebuilds = [];
  for (const [directory, names] of prebuildDirectories) {
    if (!names.has(NATIVE_ARTIFACT_FILE) || !names.has(NATIVE_BINARY_FILE)) {
      partialPrebuilds.push(directory);
    }
  }
  // TN-PACKAGE currently publishes one host-built, current-platform pair.
  // Accepting additional complete directories here would let validate:publish
  // return GO while the installed-package verifier (correctly) rejects the
  // ambiguous payload. A future signed multi-platform artifact aggregator must
  // introduce its own authority before this exact-one contract can widen.
  const unexpectedPrebuildDirectories = [...prebuildDirectories.keys()]
    .filter(directory => directory !== prebuildRoot);
  const unexpected = [...new Set([
    ...unexpectedSource,
    ...unexpectedNativeRoot,
    ...generatedLeak,
    ...invalidPrebuildLayout,
    ...partialPrebuilds,
    ...unexpectedPrebuildDirectories,
  ])].sort();
  if (missing.length > 0 || unexpected.length > 0) {
    return fail(
      `native package inventory mismatch${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}${unexpected.length > 0 ? `; unsafe/unexpected: ${unexpected.join(', ')}` : ''}`,
      missing,
      unexpected,
    );
  }

  try {
    for (const relativePath of required) {
      const maximumBytes = relativePath === binaryPath
        ? NATIVE_BINARY_MAX_BYTES
        : relativePath === artifactPath
          || relativePath === 'package.json'
          || relativePath === 'native/exec-authority/package.json'
          ? NATIVE_RUNTIME_METADATA_MAX_BYTES
        : sourceIdentity.paths.includes(relativePath)
          ? NATIVE_SOURCE_FILE_MAX_BYTES
          : NATIVE_MANIFEST_MAX_BYTES;
      const bytes = readStablePublishFile(root, relativePath, maximumBytes);
      if (packedSizes.get(relativePath) !== bytes.byteLength) {
        return fail(`packed byte count differs from source file: ${relativePath}`);
      }
    }
    const rootPackage = JSON.parse(
      readStablePublishFile(root, 'package.json', NATIVE_RUNTIME_METADATA_MAX_BYTES)
        .toString('utf8'),
    );
    const nativePackage = JSON.parse(
      readStablePublishFile(
        root,
        'native/exec-authority/package.json',
        NATIVE_RUNTIME_METADATA_MAX_BYTES,
      )
        .toString('utf8'),
    );
    const nativeScripts = nativePackage?.scripts;
    const nativeBinary = nativePackage?.binary;
    if (nativePackage?.name !== EXEC_AUTHORITY_NATIVE_PACKAGE
      || !validNativePackageVersion(nativePackage?.version)
      || nativePackage.private !== true
      || nativePackage.main !== 'index.mjs'
      || nativePackage.type !== 'module'
      || !exactObjectKeys(nativeBinary, ['napi_versions'])
      || !Array.isArray(nativeBinary.napi_versions)
      || nativeBinary.napi_versions.length !== 1
      || nativeBinary.napi_versions[0] !== EXEC_AUTHORITY_NAPI_VERSION
      || nativeScripts === null
      || typeof nativeScripts !== 'object'
      || Array.isArray(nativeScripts)
      || ['preinstall', 'install', 'postinstall'].some(name => Object.hasOwn(nativeScripts, name))) {
      return fail('nested native package identity is invalid');
    }
    const rootScripts = rootPackage?.scripts;
    if (rootPackage?.name !== 'deckent'
      || rootPackage?.version !== pkg.version
      || !validNativePackageVersion(rootPackage?.version)
      || rootPackage?.type !== 'module'
      || rootPackage?.gypfile === true
      || (rootScripts !== undefined && (rootScripts === null
        || typeof rootScripts !== 'object'
        || Array.isArray(rootScripts)))
      || (rootScripts !== undefined
        && ['preinstall', 'install', 'postinstall'].some(name => Object.hasOwn(rootScripts, name)))) {
      return fail('root package native install lifecycle is invalid');
    }
    const artifactBytes = readStablePublishFile(
      root,
      artifactPath,
      NATIVE_RUNTIME_METADATA_MAX_BYTES,
    );
    const binaryBytes = readStablePublishFile(root, binaryPath, NATIVE_BINARY_MAX_BYTES);
    const artifact = JSON.parse(artifactBytes.toString('utf8'));
    if (artifactBytes.toString('utf8') !== `${JSON.stringify(artifact, null, 2)}\n`) {
      return fail('current-platform native artifact JSON is not canonical');
    }
    if (!validateNativeArtifact(
      artifact,
      nativePackage.version,
      rootPackage.version,
      platform,
      arch,
      binaryBytes,
      sourceIdentity.sha256,
    )) {
      return fail('current-platform native artifact schema or byte identity is invalid');
    }
  } catch (error) {
    return fail(`native package bytes are unsafe or invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    gate,
    ok: true,
    severity: 'info',
    message: `native source and ${platform}-${arch}/napi-v${EXEC_AUTHORITY_NAPI_VERSION} artifact pair are exactly packed`,
    missing: [],
    unexpected: [],
  };
}

// ─── PKG-02: pack category-baseline delta ratchet (standalone diagnostic) ────
//
// Replaces the retired absolute file-count pin (see MAX_PACK_BYTES comment above).
// Buckets packed files by (dir-depth-2 × extension-class) instead of one global
// count, and ratchets against a committed baseline (scripts/pack-baseline.json,
// generated for real via `node scripts/validate-publish.mjs --write-baseline` — never
// hand-authored). Not added to GATES/runReadinessGates — same 8-entries constraint as
// checkCriticalFilesInTarball above; wired into the CLI print/exit-code path only.

const CATEGORY_COUNT_GROWTH_TOLERANCE = 0.10; // a category may grow up to +10% in file count
const CATEGORY_TOTAL_BYTES_GROWTH_LIMIT = 5 * 1024 * 1024; // total packed bytes may grow up to 5 MB vs baseline

// ─── REL-CHANGELOG: the shipping version has a canonical release-notes section ──
//
// The 0.100.0 rebaseline makes this a HARD publish-readiness gate: a version bump
// without a matching, non-empty `## [X.Y.Z]` section in the ROOT CHANGELOG.md — the
// single source `.github/workflows/release.yml`'s changelog extractor reads — must
// fail readiness. No silent publish of a version that has no release notes. The
// exact-anchor match mirrors that extractor: the version token must end at `]`, so
// `## [0.100.0]` never matches a `## [0.100.0-sprint84]` heading.
//
// Standalone (not in the 8-entry GATES array — that count is test-pinned): wired into
// the CLI print/exit path (extraChecks), same precedent as checkCriticalFilesInTarball.
/**
 * @param {string} root project root
 * @returns {{ gate: string, ok: boolean, severity: 'error', message: string }}
 */
export function checkChangelogSectionForVersion(root) {
  const gate = 'changelog_section';
  let version;
  try {
    version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')).version;
  } catch (err) {
    return { gate, ok: false, severity: 'error', message: `cannot read package.json version: ${err.message}` };
  }
  if (typeof version !== 'string' || version.length === 0) {
    return { gate, ok: false, severity: 'error', message: 'package.json has no version string' };
  }
  let changelog;
  try {
    changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf-8');
  } catch (err) {
    return { gate, ok: false, severity: 'error', message: `cannot read root CHANGELOG.md: ${err.message}` };
  }
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Exact-anchor, SINGULAR: heading is `## [VERSION]`, VERSION ends at ] (mirrors the
  // release.yml changelog extractor, which fails on zero OR duplicate headings). A
  // global match + count===1 is the contract — the first-match `.exec` alone would let
  // a duplicate `## [VERSION]` heading through and splice ambiguous release notes.
  const anchor = new RegExp(`^##\\s+\\[${escaped}\\](?:\\s|$)`, 'gm');
  const matches = [...changelog.matchAll(anchor)];
  if (matches.length === 0) {
    return {
      gate,
      ok: false,
      severity: 'error',
      message: `no canonical release-notes section '## [${version}]' in root CHANGELOG.md — a version bump requires a matching, non-empty changelog entry before publish (run scripts/release-prepare.mjs --version ${version}, then fill in the section).`,
    };
  }
  if (matches.length > 1) {
    return {
      gate,
      ok: false,
      severity: 'error',
      message: `${matches.length} duplicate '## [${version}]' headings in root CHANGELOG.md — a version must have exactly one release-notes section (the release.yml extractor rejects duplicates too).`,
    };
  }
  const match = matches[0];
  // Non-empty: at least one non-blank line AFTER the heading line, before the next
  // `## ` heading or EOF (skip past the heading line's own `— DATE` remainder).
  const lineEnd = changelog.indexOf('\n', match.index);
  const after = lineEnd === -1 ? '' : changelog.slice(lineEnd + 1);
  const body = after.split(/\n## /)[0] ?? '';
  if (body.trim().length === 0) {
    return {
      gate,
      ok: false,
      severity: 'error',
      message: `release-notes section '## [${version}]' in root CHANGELOG.md is empty — fill in the release notes before publish.`,
    };
  }
  return {
    gate,
    ok: true,
    severity: 'error',
    message: `canonical release-notes section '## [${version}]' present in root CHANGELOG.md`,
  };
}

/**
 * Classify a packed file path into an extension bucket. `.d.ts` is checked before
 * `.js`/generic so declaration files don't fall into the `.js`-adjacent bucket.
 * @param {string} path
 * @returns {'.js' | '.d.ts' | '.md' | '.json' | 'asset'}
 */
export function classifyPackEntry(path) {
  if (path.endsWith('.d.ts')) return '.d.ts';
  if (path.endsWith('.js')) return '.js';
  if (path.endsWith('.md')) return '.md';
  if (path.endsWith('.json')) return '.json';
  return 'asset';
}

/**
 * Bucket key = first two path segments (or `.` for a root-level file) joined with
 * `::` + the extension class, e.g. `dist/cli::.js`, `.::asset`.
 * @param {string} path
 * @returns {string}
 */
export function categoryKeyForPath(path) {
  const parts = path.split('/');
  const dir = parts.length <= 1 ? '.' : parts.slice(0, Math.min(2, parts.length - 1)).join('/');
  return `${dir}::${classifyPackEntry(path)}`;
}

/**
 * @param {Array<{ path: string, bytes: number }>} fileSizes
 * @returns {{ categories: Record<string, { count: number, bytes: number }>, totalBytes: number, totalFiles: number }}
 */
export function buildCategoryInventory(fileSizes) {
  /** @type {Record<string, { count: number, bytes: number }>} */
  const categories = {};
  let totalBytes = 0;
  for (const { path, bytes } of fileSizes) {
    const key = categoryKeyForPath(path);
    const bucket = categories[key] ?? { count: 0, bytes: 0 };
    bucket.count += 1;
    bucket.bytes += bytes;
    categories[key] = bucket;
    totalBytes += bytes;
  }
  return { categories, totalBytes, totalFiles: fileSizes.length };
}

/**
 * @param {Array<{ path: string, bytes: number }>} fileSizes
 * @param {{ categories: Record<string, { count: number, bytes: number }>, totalBytes: number } | null | undefined} baseline
 * @param {readonly string[]} [admittedNewCategories]
 * @returns {{ gate: string, ok: boolean, severity: 'info'|'warning'|'error', message: string, newCategories: string[], grown: string[] }}
 */
export function checkPackCategoryBaseline(fileSizes, baseline, admittedNewCategories = []) {
  if (!fileSizes || fileSizes.length === 0) {
    return {
      gate: 'pack_category_baseline',
      ok: false,
      severity: 'error',
      message: 'Empty pack file list — cannot evaluate category baseline (npm pack produced no files)',
      newCategories: [],
      grown: [],
    };
  }

  if (!baseline || !baseline.categories) {
    return {
      gate: 'pack_category_baseline',
      ok: false,
      severity: 'error',
      message: `No baseline loaded (${BASELINE_PATH} missing or malformed) — run: node scripts/validate-publish.mjs --write-baseline`,
      newCategories: [],
      grown: [],
    };
  }

  const current = buildCategoryInventory(fileSizes);
  const admitted = new Set(admittedNewCategories);
  const newCategories = Object.keys(current.categories)
    .filter((key) => !(key in baseline.categories) && !admitted.has(key));

  /** @type {string[]} */
  const grown = [];
  for (const [key, cur] of Object.entries(current.categories)) {
    const base = baseline.categories[key];
    if (!base || base.count <= 0) continue; // new categories are reported separately above
    if (cur.count > base.count * (1 + CATEGORY_COUNT_GROWTH_TOLERANCE)) {
      const pct = (((cur.count - base.count) / base.count) * 100).toFixed(1);
      grown.push(`${key}: ${base.count}→${cur.count} (+${pct}%)`);
    }
  }

  const totalBytesDelta = current.totalBytes - (baseline.totalBytes ?? 0);

  /** @type {string[]} */
  const reasons = [];
  if (newCategories.length > 0) reasons.push(`new categories not in baseline: ${newCategories.join(', ')}`);
  if (grown.length > 0) reasons.push(`category count grew >10%: ${grown.join('; ')}`);
  if (totalBytesDelta > CATEGORY_TOTAL_BYTES_GROWTH_LIMIT) {
    reasons.push(
      `total packed size grew ${(totalBytesDelta / (1024 * 1024)).toFixed(2)} MB vs baseline (limit 5 MB)`,
    );
  }

  if (reasons.length > 0) {
    return {
      gate: 'pack_category_baseline',
      ok: false,
      severity: 'error',
      message: `Pack category baseline delta gate failed — ${reasons.join(' | ')}`,
      newCategories,
      grown,
    };
  }

  return {
    gate: 'pack_category_baseline',
    ok: true,
    severity: 'info',
    message: `Pack matches category baseline (${current.totalFiles} files across ${Object.keys(current.categories).length} categories, Δ${(totalBytesDelta / 1024).toFixed(1)} kB vs baseline)`,
    newCategories: [],
    grown: [],
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
 * Execute a shell command and capture exit code + stdout. Never throws. Retained
 * (sync execSync, not spawnSync) for adr_lint/link_lint — those are plain `npm run`
 * invocations with no output-format fragility. The pack call (PUB-01) and the
 * builtins-drift gate (below) both need spawnAsync instead: the pack call for its
 * JSON rewrite, the drift gate because execSync's error path only exposes
 * `err.stdout` — it drops `err.stderr`, which is exactly where
 * builtins-drift-check.mjs writes its actionable FAIL detail.
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
 * Async subprocess runner — never spawnSync (blocks the event loop; ADR-D-002 /
 * PUB-01 both call this out). Captures stdout/stderr separately so JSON.parse never
 * has to fight interleaved log noise.
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
function spawnAsync(cmd, args, cwd) {
  return new Promise((resolvePromise) => {
    const proc = spawn(cmd, args, { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => resolvePromise({ exitCode: code ?? 1, stdout, stderr }));
    proc.on('error', (err) => resolvePromise({ exitCode: 1, stdout: '', stderr: String(err) }));
  });
}

/**
 * Load scripts/pack-baseline.json. Never throws — a missing/malformed baseline is
 * reported by checkPackCategoryBaseline as an honest FAIL, not a crash.
 * @returns {{ categories: Record<string, { count: number, bytes: number }>, totalBytes: number, totalFiles: number } | null}
 */
function loadPackBaseline() {
  try {
    const raw = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
    if (!raw || typeof raw !== 'object' || !raw.categories) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * @param {string} projectRoot
 */
export async function runCli(projectRoot) {
  const root = resolve(projectRoot);
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));

  const packResult = await spawnAsync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], root);
  const parsedPack = parsePackJson(packResult.stdout);
  const adrResult = safeExec('npm run --silent lint:adr', root);
  const linkResult = safeExec('npm run --silent lint:link', root);
  const builtinsDriftResult = await spawnAsync(
    process.execPath,
    [join(SCRIPT_DIR, 'builtins-drift-check.mjs'), '--check'],
    root,
  );

  const result = runReadinessGates({
    packOutput: parsedPack,
    pkg,
    adrResult,
    linkResult,
    projectRoot: root,
  });

  const nativeExecAuthorityCheck = checkNativeExecAuthorityTarball(parsedPack, pkg, root);
  const npmShrinkwrapCheck = checkNpmShrinkwrapTarball(parsedPack, pkg, root);
  // The immutable historical pack baseline predates the owner-admitted native
  // payload. Only the two categories fully proven by the exact native gate may
  // bypass "new category" rejection; all other new categories and the global
  // byte-growth ratchet remain enforced.
  const admittedNativeCategories = nativeExecAuthorityCheck.ok
    ? ['native/exec-authority::.json', 'native/exec-authority::asset']
    : [];
  const categoryBaselineCheck = checkPackCategoryBaseline(
    parsedPack.fileSizes,
    loadPackBaseline(),
    admittedNativeCategories,
  );
  const builtinsDriftCheck = checkBuiltinsDrift(builtinsDriftResult);

  return {
    ...result,
    packOutput: parsedPack,
    pkg,
    categoryBaselineCheck,
    builtinsDriftCheck,
    nativeExecAuthorityCheck,
    npmShrinkwrapCheck,
  };
}

/**
 * `--write-baseline`: run a REAL `npm pack --dry-run --json` and (re)write
 * scripts/pack-baseline.json from it. Refuses to write unless every normal
 * readiness, builtins, critical-file, native-package, and changelog gate passes.
 * The category-delta gate is deliberately excluded because accepting that exact
 * measured delta is the purpose of this owner-invoked operation. A baseline must
 * always be pack-generated, never fabricated or used to launder another failed gate.
 * @param {string} projectRoot
 * @returns {Promise<number>} process exit code
 */
export async function writePackBaseline(projectRoot) {
  const root = resolve(projectRoot);
  const validation = await runCli(root);
  const criticalFiles = checkCriticalFilesInTarball(validation.packOutput, validation.pkg);
  const changelog = checkChangelogSectionForVersion(root);
  const admissionChecks = [
    ...validation.checks,
    validation.builtinsDriftCheck,
    validation.npmShrinkwrapCheck,
    validation.nativeExecAuthorityCheck,
    criticalFiles,
    changelog,
  ];
  const blockers = admissionChecks.filter(check => !check.ok);
  if (blockers.length > 0) {
    console.error(
      `Refusing to write baseline: publish admission failed (${blockers.map(check => check.gate).join(', ')}).`,
    );
    return 1;
  }

  const inventory = buildCategoryInventory(validation.packOutput.fileSizes);
  const baseline = {
    generatedAt: new Date().toISOString(),
    totalBytes: inventory.totalBytes,
    totalFiles: inventory.totalFiles,
    categories: inventory.categories,
  };
  const baselinePath = join(root, 'scripts', 'pack-baseline.json');
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');
  console.log(
    `Wrote ${baselinePath}: ${inventory.totalFiles} files, ${Object.keys(inventory.categories).length} categories, ${(inventory.totalBytes / (1024 * 1024)).toFixed(2)} MB unpacked.`,
  );
  return 0;
}

const entryArg = process.argv[1] ?? '';
if (entryArg !== '' && fileURLToPath(import.meta.url) === resolve(entryArg)) {
  const cliArgs = process.argv.slice(2);
  const writeBaseline = cliArgs.includes('--write-baseline');
  const projectRoot = cliArgs.find((a) => !a.startsWith('--')) ?? '.';

  if (writeBaseline) {
    process.exit(await writePackBaseline(projectRoot));
  }

  console.log('\n  npm publish readiness — 8 gate validation\n');

  const result = await runCli(projectRoot);

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

  // Named gate step: builtins-drift-check --check (async spawn, see runCli). Always printed —
  // unlike the FAIL-only diagnostics below — so a baseline-green run has a visible drift-gate
  // line, not just silence.
  const driftCheck = result.builtinsDriftCheck;
  const driftTag = driftCheck.ok
    ? '\x1b[32mPASS\x1b[0m'
    : driftCheck.severity === 'warning'
      ? '\x1b[33mWARN\x1b[0m'
      : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${driftTag}] ${driftCheck.gate}: ${driftCheck.message}`);

  const criticalFiles = checkCriticalFilesInTarball(result.packOutput, result.pkg);
  const extraChecks = [
    criticalFiles,
    result.npmShrinkwrapCheck,
    result.nativeExecAuthorityCheck,
    result.categoryBaselineCheck,
    checkChangelogSectionForVersion(projectRoot),
  ];
  for (const check of extraChecks) {
    if (!check.ok) {
      console.log(`  [\x1b[31mFAIL\x1b[0m] ${check.gate}: ${check.message}`);
    }
  }

  console.log(
    `\n  Summary: ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warnings} warnings`,
  );

  const allOk = result.ok && extraChecks.every((c) => c.ok) && driftCheck.ok;
  console.log(allOk ? '\n  Beta launch READY.\n' : '\n  Beta launch BLOCKED — fix gates above.\n');

  process.exit(allOk ? 0 : 1);
}
