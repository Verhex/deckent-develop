#!/usr/bin/env node
/**
 * check-test-failures.mjs — per-file test failure ratchet
 *
 * Why this exists: the 2026-08 CI outage left ~560 failing tests across the suites
 * (see PAZARTESI.md, "TEST BORCU ENVANTERİ"). Fixing all of them before continuing
 * runtime work (FAZ 4) would serialise the schedule, but working on top of a red
 * suite destroys the regression signal — you cannot tell "my change broke this" from
 * "this was already broken". This gate keeps the signal without demanding a green
 * suite: known debt is recorded per file, NEW failures fail the build.
 *
 * It deliberately mirrors the existing ratchet culture in this repo
 * (scripts/spawnsync-baseline.json, error-handling-baseline.json).
 *
 * Input is one or more Vitest JSON reports:
 *   npx vitest run tests/cli/ --reporter=json --outputFile=/tmp/cli.json
 *   node scripts/check-test-failures.mjs /tmp/cli.json [...more.json]
 *
 * Modes:
 *   (default)          fail when a file has MORE failures than the baseline, or when a
 *                      file that is absent from the baseline has any failure at all
 *   --strict           additionally fail on stale entries (file improved but baseline
 *                      not ratcheted) — use once the cleanup has settled
 *   --update           merge the given reports into the baseline (reviewed change only):
 *                      observed files are replaced, unobserved files are carried over —
 *                      so updating after a partial run cannot erase debt it never saw
 *
 * Exit 0 — no new failures
 * Exit 1 — new failures (or, with --strict, stale entries)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASELINE_PATH = join(ROOT, 'scripts/test-failure-baseline.json');

/** @typedef {{ file: string, failed: number }} BaselineEntry */

function parseArgs(argv) {
  const reports = [];
  let mode = 'check';
  let strict = false;
  for (const arg of argv) {
    if (arg === '--update') mode = 'update';
    else if (arg === '--strict') strict = true;
    else if (arg.startsWith('--')) {
      process.stderr.write(`[test-failures] unknown flag: ${arg}\n`);
      process.exit(2);
    } else reports.push(arg);
  }
  return { reports, mode, strict };
}

/**
 * Collect per-file failure counts from Vitest JSON reports.
 * A file that fails to load reports zero assertions with status 'failed' at file level;
 * it is counted as a single failure so a collapsing suite cannot hide behind an empty list.
 * @param {string[]} reportPaths
 * @returns {Map<string, number>}
 */
function collectFailures(reportPaths) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const reportPath of reportPaths) {
    if (!existsSync(reportPath)) {
      process.stderr.write(`[test-failures] report not found: ${reportPath}\n`);
      process.exit(2);
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    for (const suite of report.testResults ?? []) {
      const file = relative(ROOT, resolve(suite.name)).split('\\').join('/');
      const assertions = suite.assertionResults ?? [];
      const failed = assertions.filter((a) => a.status === 'failed').length;
      const collapsed = suite.status === 'failed' && assertions.length === 0 ? 1 : 0;
      const total = failed + collapsed;
      // Same file can appear in more than one report (overlapping suite globs);
      // keep the highest observation rather than summing duplicates.
      counts.set(file, Math.max(counts.get(file) ?? 0, total));
    }
  }
  return counts;
}

/** @returns {{ version: 1, note: string, entries: BaselineEntry[] }} */
function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return { version: 1, note: '', entries: [] };
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
}

/**
 * Rewrite the baseline for the OBSERVED files only.
 *
 * A partial run must not erase debt it never looked at: updating after
 * `vitest run tests/core/` would otherwise drop every orchestra/cli/mcp entry and
 * silently turn their known failures into "new" ones on the next full run.
 * Files present in the reports are replaced (including down to zero, which removes
 * them); files absent from the reports are carried over untouched.
 */
function writeBaseline(counts, previous) {
  const merged = new Map(previous.map((e) => [e.file, e.failed]));
  for (const [file, failed] of counts) {
    if (failed > 0) merged.set(file, failed);
    else merged.delete(file);
  }
  const entries = [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, failed]) => ({ file, failed }));
  const baseline = {
    version: 1,
    note: existsSync(BASELINE_PATH)
      ? JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).note
      : 'Known test debt from the 2026-08 CI outage (PAZARTESI.md · TEST BORCU ENVANTERİ). '
        + 'NEW failures fail the gate; this file is not a target to grow. Reduce it — '
        + 'FAZ 3 packages P1-P6 exist to empty it.',
    entries,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');
  return entries;
}

function main() {
  const { reports, mode, strict } = parseArgs(process.argv.slice(2));
  if (reports.length === 0) {
    process.stderr.write(
      '[test-failures] usage: node scripts/check-test-failures.mjs <vitest-report.json> [...] [--update] [--strict]\n',
    );
    process.exit(2);
  }

  const counts = collectFailures(reports);

  if (mode === 'update') {
    const entries = writeBaseline(counts, loadBaseline().entries);
    const total = entries.reduce((n, e) => n + e.failed, 0);
    process.stdout.write(
      `[test-failures] baseline written: ${entries.length} file(s), ${total} known failure(s)\n`,
    );
    return;
  }

  const baseline = loadBaseline();
  const known = new Map(baseline.entries.map((e) => [e.file, e.failed]));

  const regressions = [];
  const improvements = [];
  for (const [file, failed] of [...counts.entries()].sort()) {
    const expected = known.get(file) ?? 0;
    if (failed > expected) regressions.push({ file, expected, actual: failed });
    else if (failed < expected) improvements.push({ file, expected, actual: failed });
  }

  // A baseline entry whose file is absent from the given reports is not evidence of
  // improvement — the suite simply was not run. Only compare what was observed.
  for (const r of regressions) {
    process.stdout.write(
      `  ✗ ${r.file}: ${r.actual} failure(s), baseline ${r.expected}\n`,
    );
  }
  for (const i of improvements) {
    process.stdout.write(
      `  ↓ ${i.file}: ${i.actual} failure(s), baseline ${i.expected} — ratchet with --update\n`,
    );
  }

  const observedTotal = [...counts.values()].reduce((n, v) => n + v, 0);
  if (regressions.length > 0) {
    process.stdout.write(
      `\n[test-failures] FAIL — ${regressions.length} file(s) got worse `
      + `(${observedTotal} observed failures). New breakage is not allowed on top of known debt.\n`,
    );
    process.exit(1);
  }
  if (strict && improvements.length > 0) {
    process.stdout.write(
      `\n[test-failures] FAIL (--strict) — ${improvements.length} stale baseline entr(y|ies); `
      + 'ratchet them in the same reviewed change.\n',
    );
    process.exit(1);
  }
  process.stdout.write(
    `\n[test-failures] OK — no new failures `
    + `(${observedTotal} known failure(s) across ${counts.size} observed file(s)`
    + `${improvements.length > 0 ? `, ${improvements.length} improved` : ''}).\n`,
  );
}

main();
