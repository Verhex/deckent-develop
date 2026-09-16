#!/usr/bin/env node
// lint-no-spawnsync.mjs — mechanical hard-gate for ADR-D-002 (C4/C5) + ADR-G-002.
//
// WHAT THIS IS (honest framing): a NO-NEW-spawnSync RATCHET + a HOT-PATH hard-block.
// It does NOT audit the existing calls against ADR-G-002 M1–M6 — the current call
// sites are grandfathered as an un-audited baseline. Its two guarantees are:
//   (1) Ratchet — a spawnSync call site absent from the baseline fails the gate, so
//       no NEW spawnSync can be added without a conscious `--update` (which is
//       diff-visible in review). `spawnSync` blocks the event loop → CI timeouts +
//       O(n) scan contention (ADR-D-002, Sprint 279 auditor 30s-scan regression).
//   (2) Hot-path hard-block — a spawnSync in a hot-path file (loop / scan / worker
//       dispatch / evaluate loop, where async is non-negotiable) must be on the
//       hand-maintained `hotPathDebt` list WITH a named migration owner. `--update`
//       regenerates only `sanctioned`; it NEVER auto-adds a hot-path site, so a new
//       hot-path spawnSync fails until someone consciously records it + an owner.
//
// Baseline: scripts/spawnsync-baseline.json  (regenerate `sanctioned` with --update;
// initialise the whole file with --init).
//
// Exit: 0 = clean, 1 = violations, 2 = scan error
// Usage:
//   node scripts/lint-no-spawnsync.mjs           # check (CI / lint:spawnsync)
//   node scripts/lint-no-spawnsync.mjs --update  # refresh the non-hot-path baseline
//   node scripts/lint-no-spawnsync.mjs --init    # (re)generate the full baseline

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const BASELINE_PATH = join(REPO_ROOT, 'scripts', 'spawnsync-baseline.json');

// Hot-path files: subprocess work here runs in a loop / scan / worker-dispatch /
// evaluate-loop cadence where a synchronous spawn blocks the event loop. A
// spawnSync in one of these MUST be on `hotPathDebt` with a real migration owner;
// a NEW one hard-fails. Owners are honest: only auditor.ts is covered by the
// ADR-D-002 W2 (ADR-087-W) migration; the docker backend + liveness probe have no
// prior owner, so they get an explicit born-item (HOTPATH-SPAWN-ASYNC).
export const HOT_PATH_FILES = {
  'src/monitor/auditor.ts': 'ADR-087-W (W2 — auditor residual spawnSync → async migration)',
  'src/orchestra/spawn-backend-docker.ts': 'HOTPATH-SPAWN-ASYNC (born; worker-dispatch/retry docker CLI calls)',
  'src/orchestra/tmux.ts': 'HOTPATH-SPAWN-ASYNC (born; tmux spawn backend — worker dispatch, parallel to docker)',
  'src/orchestra/worker-liveness.ts': 'HOTPATH-SPAWN-ASYNC (born; EVALUATE-loop docker-ps probe default)',
  'src/orchestra/monitor-adapter.ts': 'HOTPATH-SPAWN-ASYNC (born; backend-agnostic worker-monitor scan/poll adapter)',
  'src/core/output-collector.ts': 'HOTPATH-SPAWN-ASYNC (born; per-worker docker/tmux output capture during sprint)',
};

/**
 * Extract real `spawnSync(` CALL sites from a source file. Excludes: import lines,
 * comment lines (`//` / `*`), string-literal mentions (`'spawnSync` / `"spawnSync`),
 * and the ADR-G-002 detection-pattern string (`spawnSync.*shell.*true`) that the
 * enforcer/auditor carry as data, not as a call.
 * @param {string} content
 * @returns {Array<{line: number, code: string}>}
 */
export function extractSpawnSyncCalls(content) {
  const calls = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue; // comment
    if (trimmed.startsWith('import ') || trimmed.startsWith('} from')) continue; // import
    // A real call: the token `spawnSync` followed by `(`, not preceded by an
    // identifier char. `.` is NOT excluded, so a namespace/method call like
    // `cp.spawnSync(...)` (via `import * as cp from 'node:child_process'`) still
    // counts — that is a plausible evasion the ratchet must catch. `nodeSpawnSync(`
    // / `xSpawnSync(` do not match (their token is `SpawnSync`, capital S).
    if (!/(^|[^A-Za-z0-9_])spawnSync\s*\(/.test(raw)) continue;
    // Exclude the ADR-G-002 detection PATTERN carried as a string, and any spawnSync
    // that appears only inside a quoted string on this line.
    if (/['"`]spawnSync/.test(raw)) continue; // 'spawnSync...' literal / pattern
    calls.push({ line: i + 1, code: trimmed });
  }
  return calls;
}

/**
 * Recursively collect .ts files under `dir`, excluding node_modules and the
 * dashboard subtree (its own toolchain).
 * @param {string} dir
 * @param {string[]} [results]
 * @returns {string[]}
 */
function collectTsFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dashboard') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectTsFiles(full, results);
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) results.push(full);
  }
  return results;
}

/**
 * Scan src/ and return every spawnSync call site, split by hot-path membership.
 * @returns {{ sanctionedFound: Array<{file:string,code:string}>, hotPathFound: Array<{file:string,code:string}> }}
 */
export function scanSource(srcDir = SRC_DIR, rootDir = REPO_ROOT) {
  const sanctionedFound = [];
  const hotPathFound = [];
  for (const abs of collectTsFiles(srcDir)) {
    const rel = relative(rootDir, abs).replace(/\\/g, '/');
    const calls = extractSpawnSyncCalls(readFileSync(abs, 'utf-8'));
    for (const c of calls) {
      const entry = { file: rel, code: c.code };
      if (HOT_PATH_FILES[rel]) hotPathFound.push(entry);
      else sanctionedFound.push(entry);
    }
  }
  return { sanctionedFound, hotPathFound };
}

/** Multiset key for a call site (file + normalized code). */
const keyOf = (e) => JSON.stringify([e.file, e.code]);

/** Build a count-map (multiset) from a list of entries. */
function countMap(entries) {
  const m = new Map();
  for (const e of entries) m.set(keyOf(e), (m.get(keyOf(e)) ?? 0) + 1);
  return m;
}

/**
 * Compare the live scan against the baseline. A live occurrence beyond the
 * baseline count is a NEW spawnSync. Hot-path files are matched against
 * `hotPathDebt`; everything else against `sanctioned`.
 * @returns {{ newCalls: Array<{file:string,code:string,hotPath:boolean,owner?:string}>, missing: Array }}
 */
export function diffAgainstBaseline(scan, baseline) {
  const sanctionedBase = countMap(baseline.sanctioned ?? []);
  const hotPathBase = countMap((baseline.hotPathDebt ?? []).map((e) => ({ file: e.file, code: e.code })));

  const newCalls = [];
  const flag = (found, base, hotPath) => {
    const liveCounts = countMap(found);
    for (const [k, liveN] of liveCounts) {
      const baseN = base.get(k) ?? 0;
      if (liveN > baseN) {
        const [file, code] = JSON.parse(k);
        for (let i = 0; i < liveN - baseN; i++) {
          newCalls.push({ file, code, hotPath, owner: hotPath ? HOT_PATH_FILES[file] : undefined });
        }
      }
    }
  };
  flag(scan.sanctionedFound, sanctionedBase, false);
  flag(scan.hotPathFound, hotPathBase, true);
  return { newCalls };
}

/** Load the baseline JSON (or a default empty shape). */
export function loadBaseline(path = BASELINE_PATH) {
  if (!existsSync(path)) return { sanctioned: [], hotPathDebt: [] };
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// ─── CLI ─────────────────────────────────────────────────────────────────

function dedupeSorted(entries) {
  // Preserve multiplicity but produce a stable, diff-friendly order.
  return [...entries].sort((a, b) => (a.file === b.file ? a.code.localeCompare(b.code) : a.file.localeCompare(b.file)));
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  const mode = process.argv[2];
  let scan;
  try {
    scan = scanSource();
  } catch (err) {
    process.stderr.write(`[no-spawnsync] ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }

  if (mode === '--init') {
    // Full (re)generation: hot-path files → hotPathDebt (with owner), rest → sanctioned.
    const hotPathDebt = dedupeSorted(scan.hotPathFound).map((e) => ({ ...e, owner: HOT_PATH_FILES[e.file] }));
    const out = {
      note:
        'ADR-D-002 no-new-spawnSync ratchet baseline. `sanctioned` = un-audited '
        + 'grandfathered call sites (NOT verified against ADR-G-002 M1–M6); a site '
        + 'absent here fails the gate. `hotPathDebt` = hot-path spawnSync pending async '
        + 'migration, each with a named owner. Regenerate `sanctioned` with --update; '
        + 'hotPathDebt is hand-maintained (a new hot-path spawnSync must be added here '
        + 'with an owner, consciously).',
      sanctioned: dedupeSorted(scan.sanctionedFound),
      hotPathDebt,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
    process.stdout.write(`[no-spawnsync] --init: ${out.sanctioned.length} sanctioned + ${hotPathDebt.length} hot-path debt written\n`);
    process.exit(0);
  }

  const baseline = loadBaseline();

  if (mode === '--update') {
    // Refresh ONLY the non-hot-path baseline. Never touches hotPathDebt, so a new
    // hot-path spawnSync cannot be silently grandfathered by --update.
    baseline.sanctioned = dedupeSorted(scan.sanctionedFound);
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
    process.stdout.write(`[no-spawnsync] --update: sanctioned baseline refreshed (${baseline.sanctioned.length} sites); hotPathDebt untouched\n`);
    process.exit(0);
  }

  const { newCalls } = diffAgainstBaseline(scan, baseline);
  if (newCalls.length === 0) {
    const hp = (baseline.hotPathDebt ?? []).length;
    process.stdout.write(
      `[no-spawnsync] ✓ no new spawnSync — ${baseline.sanctioned?.length ?? 0} sanctioned (grandfathered), ${hp} hot-path debt tracked\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`[no-spawnsync] FAIL: ${newCalls.length} new spawnSync call site(s):\n`);
  for (const c of newCalls) {
    if (c.hotPath) {
      process.stderr.write(
        `  ${c.file}: [HOT-PATH — forbidden] ${c.code}\n`
        + `    Use async spawn (node:child_process spawn + Promise). If genuinely unavoidable,\n`
        + `    add it to hotPathDebt in scripts/spawnsync-baseline.json WITH a migration owner (owner: ${c.owner ?? 'HOTPATH-SPAWN-ASYNC'}).\n`,
      );
    } else {
      process.stderr.write(
        `  ${c.file}: [new spawnSync] ${c.code}\n`
        + `    Prefer async spawn (ADR-D-002 C4). If sanctioned (ADR-G-002 M1–M6, one-shot <250ms),\n`
        + `    run \`node scripts/lint-no-spawnsync.mjs --update\` to grandfather it (diff-visible in review).\n`,
      );
    }
  }
  process.exit(1);
}
