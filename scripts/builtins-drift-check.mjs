#!/usr/bin/env node
// builtins-drift-check.mjs — mechanical two-tree drift gate for MASTER-PLAN 502 (406-001 dilim-1).
//
// WHAT THIS IS (honest framing): a drift-INVENTORY tool + a NO-NEW-drift RATCHET across
// `.deckent/{agents,skills}` (this repo's own live dev catalog) vs `src/core/builtins/{agents,skills}`
// (what `bundle-builtins.mjs` ships inside the npm package and `deckent init` seeds onto a fresh
// project). It does NOT decide which side is canonical and does NOT merge anything — that decision
// is Alperen's (see docs/analysis/builtins-drift-inventory-2026-07-11.md). Its two guarantees are:
//   (1) Inventory — a complete, file-by-file drift report (only-in-A / only-in-B / content-diff),
//       with `stats` fields normalized out (they moved to a gitignored sidecar per born-605 and
//       are pure noise for a canonicality comparison).
//   (2) Ratchet — a drift item absent from the pinned baseline fails `--check`, so no NEW drift
//       can silently appear without a conscious `--write` (diff-visible in review), mirroring
//       scripts/lint-no-spawnsync.mjs's baseline-ratchet shape.
//
// Baseline: `.deckent/builtins-drift-baseline.json` by default (override with `--baseline <path>`,
// mainly for hermetic tests). Regenerate with `--write`; initialize the same way.
//
// Exit: 0 = clean/report, 1 = new drift (--check only), 2 = scan error / missing baseline (--check)
// Usage:
//   node scripts/builtins-drift-check.mjs                 # human-readable report (exit 0/2)
//   node scripts/builtins-drift-check.mjs --json          # machine-readable report (exit 0/2)
//   node scripts/builtins-drift-check.mjs --check         # ratchet vs baseline (exit 0/1/2)
//   node scripts/builtins-drift-check.mjs --write         # (re)write the baseline from current scan

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const DEFAULT_BASELINE_PATH = join(REPO_ROOT, '.deckent', 'builtins-drift-baseline.json');

// Directory names that are never part of the shipped catalog (LRU eviction targets / archive) —
// mirrors bundle-builtins.mjs's own skip list so the gate and the bundler agree on the universe.
const SKIP_DIR_NAMES = (name) => name === 'archive' || name.startsWith('temp-');

/** @typedef {{ deckentDir: string, builtinsDir: string, manifestFile: string, docFile: string }} CategoryConfig */

/** @type {Record<string, CategoryConfig>} */
export const CATEGORIES = {
  agents: {
    deckentDir: join(REPO_ROOT, '.deckent', 'agents'),
    builtinsDir: join(REPO_ROOT, 'src', 'core', 'builtins', 'agents'),
    manifestFile: 'agent.json',
    docFile: 'PROMPT.md',
  },
  skills: {
    deckentDir: join(REPO_ROOT, '.deckent', 'skills'),
    builtinsDir: join(REPO_ROOT, 'src', 'core', 'builtins', 'skills'),
    manifestFile: 'manifest.json',
    docFile: 'SKILL.md',
  },
};

// ─── Filesystem helpers ─────────────────────────────────────────────────────

/** List item directory names under `dir`, excluding archive/temp-*. Returns [] if dir is absent. */
export function listItemDirs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES(entry)) continue;
    let st;
    try {
      st = statSync(join(dir, entry));
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(entry);
  }
  return out.sort();
}

// ─── JSON comparison (stats-normalized, key-order-insensitive) ─────────────

/** Recursively sort object keys and drop a top-level `stats` key (605 sidecar noise). */
export function normalizeManifestForCompare(value, depth = 0) {
  if (Array.isArray(value)) return value.map((v) => normalizeManifestForCompare(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (depth === 0 && key === 'stats') continue; // 605: stats moved to gitignored sidecar
      // sprint-561 skill-unlock: derived canonical V3 profile is persisted to
      // the PROJECT pool only — like stats it is live derived-state, never an
      // authored-drift signal against the builtin package tree.
      if (depth === 0 && (key === 'profile' || key === 'profileProvenance')) continue;
      out[key] = normalizeManifestForCompare(value[key], depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Compare two JSON manifest files after stats-normalization.
 * @returns {{ equal: boolean, diffKeys?: string[], error?: string }}
 */
export function compareManifestJson(pathA, pathB) {
  let rawA, rawB;
  try {
    rawA = JSON.parse(readFileSync(pathA, 'utf-8'));
  } catch (err) {
    return { equal: false, error: `unreadable/invalid JSON at ${pathA}: ${err instanceof Error ? err.message : String(err)}` };
  }
  try {
    rawB = JSON.parse(readFileSync(pathB, 'utf-8'));
  } catch (err) {
    return { equal: false, error: `unreadable/invalid JSON at ${pathB}: ${err instanceof Error ? err.message : String(err)}` };
  }
  const a = normalizeManifestForCompare(rawA);
  const b = normalizeManifestForCompare(rawB);
  const equal = JSON.stringify(a) === JSON.stringify(b);
  if (equal) return { equal: true };
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffKeys = [...allKeys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
  return { equal: false, diffKeys };
}

// ─── Text comparison (dependency-free LCS line-diff) ───────────────────────

/**
 * Minimal O(n*m) LCS-based line diff. Returns counts + the first `limit` changed line numbers
 * (1-based, in file A's numbering for removals / file B's for additions) — enough to locate the
 * change without vendoring a full diff library (ADR-D-005: no new runtime dependency for this).
 * @returns {{ added: number, removed: number, sample: Array<{type:'add'|'remove', line:number, text:string}> }}
 */
export function diffLines(textA, textB, limit = 8) {
  const a = textA.split('\n');
  const b = textB.split('\n');
  const n = a.length, m = b.length;
  // dp[i][j] = LCS length of a[i..] and b[j..]
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0, j = 0, added = 0, removed = 0;
  const sample = [];
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      removed++;
      if (sample.length < limit) sample.push({ type: 'remove', line: i + 1, text: a[i] });
      i++;
    } else {
      added++;
      if (sample.length < limit) sample.push({ type: 'add', line: j + 1, text: b[j] });
      j++;
    }
  }
  while (i < n) {
    removed++;
    if (sample.length < limit) sample.push({ type: 'remove', line: i + 1, text: a[i] });
    i++;
  }
  while (j < m) {
    added++;
    if (sample.length < limit) sample.push({ type: 'add', line: j + 1, text: b[j] });
    j++;
  }
  return { added, removed, sample };
}

/** Compare two text files (PROMPT.md/SKILL.md) by exact content; attach a line-diff when unequal. */
export function compareTextFile(pathA, pathB) {
  const a = readFileSync(pathA, 'utf-8');
  const b = readFileSync(pathB, 'utf-8');
  if (a === b) return { equal: true };
  return { equal: false, ...diffLines(a, b) };
}

// ─── Scan ───────────────────────────────────────────────────────────────────

/**
 * Scan one category (agents|skills) and return a full drift report.
 * @param {CategoryConfig} cfg
 * @returns {{
 *   excluded: string[],
 *   onlyInDeckent: Array<{item:string, files:{manifest:boolean, doc:boolean}}>,
 *   onlyInBuiltins: Array<{item:string, files:{manifest:boolean, doc:boolean}}>,
 *   commonDiffs: Array<{item:string, file:'manifest'|'doc', kind:'json'|'text', detail:object}>,
 * }}
 */
export function scanCategory(cfg) {
  const deckentItems = new Set(listItemDirs(cfg.deckentDir));
  const builtinsItems = new Set(listItemDirs(cfg.builtinsDir));
  const allItems = [...new Set([...deckentItems, ...builtinsItems])].sort();

  const excluded = [];
  const onlyInDeckent = [];
  const onlyInBuiltins = [];
  const commonDiffs = [];

  for (const item of allItems) {
    const inDeckent = deckentItems.has(item);
    const inBuiltins = builtinsItems.has(item);

    const aManifestPath = join(cfg.deckentDir, item, cfg.manifestFile);
    const aDocPath = join(cfg.deckentDir, item, cfg.docFile);
    const bManifestPath = join(cfg.builtinsDir, item, cfg.manifestFile);
    const bDocPath = join(cfg.builtinsDir, item, cfg.docFile);

    const aHasManifest = inDeckent && existsSync(aManifestPath);
    const aHasDoc = inDeckent && existsSync(aDocPath);
    const bHasManifest = inBuiltins && existsSync(bManifestPath);
    const bHasDoc = inBuiltins && existsSync(bDocPath);

    // Not a valid catalog item on EITHER side (e.g. .deckent/skills/docs — a memory-export dir
    // with neither manifest nor doc file). Exclude, but surface it so the report stays honest.
    if (!aHasManifest && !aHasDoc && !bHasManifest && !bHasDoc) {
      excluded.push(item);
      continue;
    }

    if (inDeckent && !inBuiltins) {
      onlyInDeckent.push({ item, files: { manifest: aHasManifest, doc: aHasDoc } });
      continue;
    }
    if (!inDeckent && inBuiltins) {
      onlyInBuiltins.push({ item, files: { manifest: bHasManifest, doc: bHasDoc } });
      continue;
    }

    // Present on both sides — compare per-file, independently.
    if (aHasManifest && bHasManifest) {
      const cmp = compareManifestJson(aManifestPath, bManifestPath);
      if (!cmp.equal) commonDiffs.push({ item, file: 'manifest', kind: 'json', detail: cmp });
    } else if (aHasManifest !== bHasManifest) {
      commonDiffs.push({
        item,
        file: 'manifest',
        kind: 'presence',
        detail: { onlySide: aHasManifest ? 'deckent' : 'builtins' },
      });
    }

    if (aHasDoc && bHasDoc) {
      const cmp = compareTextFile(aDocPath, bDocPath);
      if (!cmp.equal) commonDiffs.push({ item, file: 'doc', kind: 'text', detail: cmp });
    } else if (aHasDoc !== bHasDoc) {
      commonDiffs.push({
        item,
        file: 'doc',
        kind: 'presence',
        detail: { onlySide: aHasDoc ? 'deckent' : 'builtins' },
      });
    }
  }

  return { excluded, onlyInDeckent, onlyInBuiltins, commonDiffs };
}

/** Scan every category. @returns {Record<string, ReturnType<typeof scanCategory>>} */
export function scanAll(categories = CATEGORIES) {
  const report = {};
  for (const [name, cfg] of Object.entries(categories)) {
    report[name] = scanCategory(cfg);
  }
  return report;
}

// ─── Baseline (ratchet) ─────────────────────────────────────────────────────

/** Stable key identifying one drift item, for baseline membership checks. */
function driftKey(category, entry) {
  if (entry.kind === 'only-a' || entry.kind === 'only-b') return `${category}::${entry.kind}::${entry.item}`;
  return `${category}::diff::${entry.item}::${entry.file}`;
}

/** Flatten a scanAll() report into a stable list of drift-item keys (one per only-a/only-b/content-diff). */
export function flattenDriftKeys(report) {
  const keys = [];
  for (const [category, cat] of Object.entries(report)) {
    for (const e of cat.onlyInDeckent) keys.push(driftKey(category, { kind: 'only-a', item: e.item }));
    for (const e of cat.onlyInBuiltins) keys.push(driftKey(category, { kind: 'only-b', item: e.item }));
    for (const e of cat.commonDiffs) keys.push(driftKey(category, e));
  }
  return keys.sort();
}

export function loadBaseline(path = DEFAULT_BASELINE_PATH) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function writeBaseline(report, path = DEFAULT_BASELINE_PATH) {
  const out = {
    note:
      'builtins-drift-check ratchet baseline (MASTER-PLAN 502 / 406-001). `driftKeys` = every '
      + 'known-drift item (only-in-.deckent / only-in-builtins / content-diff) at the time this '
      + 'was written — grandfathered, NOT a canonicality decision. A NEW key beyond this list '
      + 'fails `--check`. Regenerate consciously with `--write` (diff-visible in review) after a '
      + 'deliberate change; a resolved (no-longer-drifting) key simply stops appearing here on the '
      + 'next `--write` and does not need manual removal.',
    generatedFrom: 'node scripts/builtins-drift-check.mjs --write',
    driftKeys: flattenDriftKeys(report),
  };
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n', 'utf-8');
  return out;
}

/**
 * Compare a live scan against a baseline.
 * @returns {{ newKeys: string[], resolvedKeys: string[] }}
 */
export function diffAgainstBaseline(report, baseline) {
  const liveKeys = new Set(flattenDriftKeys(report));
  const baseKeys = new Set(baseline?.driftKeys ?? []);
  const newKeys = [...liveKeys].filter((k) => !baseKeys.has(k)).sort();
  const resolvedKeys = [...baseKeys].filter((k) => !liveKeys.has(k)).sort();
  return { newKeys, resolvedKeys };
}

// ─── Human-readable report ──────────────────────────────────────────────────

export function formatHumanReport(report) {
  const lines = [];
  for (const [category, cat] of Object.entries(report)) {
    lines.push(`\n=== ${category} ===`);
    lines.push(`  excluded (no manifest/doc on either side): ${cat.excluded.length ? cat.excluded.join(', ') : '(none)'}`);
    lines.push(`  only in .deckent: ${cat.onlyInDeckent.length}`);
    for (const e of cat.onlyInDeckent) lines.push(`    - ${e.item} (manifest=${e.files.manifest}, doc=${e.files.doc})`);
    lines.push(`  only in builtins: ${cat.onlyInBuiltins.length}`);
    for (const e of cat.onlyInBuiltins) lines.push(`    - ${e.item} (manifest=${e.files.manifest}, doc=${e.files.doc})`);
    lines.push(`  content-diff: ${cat.commonDiffs.length}`);
    for (const e of cat.commonDiffs) {
      if (e.kind === 'presence') {
        lines.push(`    - ${e.item}/${e.file}: only present in ${e.detail.onlySide}`);
      } else if (e.kind === 'json') {
        lines.push(`    - ${e.item}/${e.file}: JSON diff (keys: ${e.detail.diffKeys?.join(', ') ?? e.detail.error})`);
      } else {
        lines.push(`    - ${e.item}/${e.file}: text diff (+${e.detail.added}/-${e.detail.removed} lines)`);
      }
    }
  }
  return lines.join('\n');
}

function summaryCounts(report) {
  let onlyA = 0, onlyB = 0, diffs = 0, excluded = 0;
  for (const cat of Object.values(report)) {
    onlyA += cat.onlyInDeckent.length;
    onlyB += cat.onlyInBuiltins.length;
    diffs += cat.commonDiffs.length;
    excluded += cat.excluded.length;
  }
  return { onlyA, onlyB, diffs, excluded };
}

// ─── CLI ─────────────────────────────────────────────────────────────────

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const mode = argv.find((a) => a === '--check' || a === '--write' || a === '--json');
  const baselineFlagIdx = argv.indexOf('--baseline');
  const baselinePath = baselineFlagIdx >= 0 ? resolve(argv[baselineFlagIdx + 1]) : DEFAULT_BASELINE_PATH;

  let report;
  try {
    report = scanAll();
  } catch (err) {
    process.stderr.write(`[builtins-drift-check] ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }

  if (mode === '--write') {
    try {
      const written = writeBaseline(report, baselinePath);
      process.stdout.write(`[builtins-drift-check] --write: ${written.driftKeys.length} drift key(s) written to ${baselinePath}\n`);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[builtins-drift-check] ERROR writing baseline: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(2);
    }
  }

  if (mode === '--check') {
    const baseline = loadBaseline(baselinePath);
    if (!baseline) {
      process.stderr.write(
        `[builtins-drift-check] no baseline at ${baselinePath}.\n`
        + `  Run \`node scripts/builtins-drift-check.mjs --write\` to pin the current (reviewed) drift state, then re-run --check.\n`,
      );
      process.exit(2);
    }
    const { newKeys, resolvedKeys } = diffAgainstBaseline(report, baseline);
    if (newKeys.length === 0) {
      process.stdout.write(
        `[builtins-drift-check] ✓ no new drift — ${baseline.driftKeys.length} known drift item(s) grandfathered`
        + (resolvedKeys.length ? `, ${resolvedKeys.length} resolved since baseline (informational; --write to prune)\n` : '\n'),
      );
      process.exit(0);
    }
    process.stderr.write(`[builtins-drift-check] FAIL: ${newKeys.length} new drift item(s) beyond baseline:\n`);
    for (const k of newKeys) process.stderr.write(`  ${k}\n`);
    process.stderr.write(`  If intentional, run \`node scripts/builtins-drift-check.mjs --write\` to grandfather it (diff-visible in review).\n`);
    process.exit(1);
  }

  const counts = summaryCounts(report);
  if (mode === '--json') {
    process.stdout.write(JSON.stringify({ summary: counts, report }, null, 2) + '\n');
    process.exit(0);
  }

  process.stdout.write(
    `[builtins-drift-check] only-in-.deckent=${counts.onlyA} only-in-builtins=${counts.onlyB} `
    + `content-diff=${counts.diffs} excluded=${counts.excluded}\n`,
  );
  process.stdout.write(formatHumanReport(report) + '\n');
  process.exit(0);
}
