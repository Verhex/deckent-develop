#!/usr/bin/env node
// lint-no-model-literal.mjs — mechanical hard-gate: model-name string-literals may
// only live in src/core/model-registry.ts (the SSOT). Born-item 431-001.
//
// WHAT THIS IS (honest framing): a NO-NEW-MODEL-LITERAL RATCHET, structurally
// mirroring scripts/lint-no-spawnsync.mjs. It does NOT migrate existing call sites
// to reference the registry — the current sites are grandfathered as an un-audited
// baseline. Its one guarantee: a model-name string-literal site absent from the
// baseline fails the gate, so no NEW hardcoded model name can be added outside
// model-registry.ts without a conscious `--update` (diff-visible in review).
//
// The "known model names" dictionary is NOT copy-pasted into this file — doing so
// would itself violate the SSOT this gate enforces. It is derived DYNAMICALLY at
// scan time by text-parsing the `id: '...'` fields out of BUILTIN_MODELS and
// CODEX_PARITY_MODELS in model-registry.ts (readFileSync + regex, no import — this
// is a plain-node script with no TS loader, and dist/ may be stale mid-sprint).
// Only `id` fields count, never `apiId` (a different, wire-level concern) — `apiId`
// is spelled with a capital `I`, so the literal substring `id:` never occurs inside
// `apiId:`, and the two are told apart without any lookbehind/lookaround trickery.
//
// Baseline: scripts/model-literal-baseline.json (regenerate with --update;
// initialise with --init).
//
// Exit: 0 = clean, 1 = violations, 2 = scan error
// Usage:
//   node scripts/lint-no-model-literal.mjs           # check (CI / lint:model-literal)
//   node scripts/lint-no-model-literal.mjs --update  # refresh the baseline
//   node scripts/lint-no-model-literal.mjs --init    # (re)generate the full baseline

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const BASELINE_PATH = join(REPO_ROOT, 'scripts', 'model-literal-baseline.json');
const REGISTRY_PATH = join(SRC_DIR, 'core', 'model-registry.ts');
const REGISTRY_REL = 'src/core/model-registry.ts';

// The two registry arrays the known-id dictionary is derived from. Each array's
// source is bounded by its `export const NAME` marker and the `] as const;` that
// closes the literal — both arrays in model-registry.ts use this exact form.
const REGISTRY_ARRAYS = ['BUILTIN_MODELS', 'CODEX_PARITY_MODELS'];

/**
 * Slice the literal-array source text for `arrayName` out of `content` (the raw
 * model-registry.ts source, or an equivalent fixture in tests). Returns '' if
 * either marker is not found.
 * @param {string} content
 * @param {string} arrayName
 * @returns {string}
 */
export function sliceRegistryArray(content, arrayName) {
  const startMarker = `export const ${arrayName}`;
  const start = content.indexOf(startMarker);
  if (start === -1) return '';
  const end = content.indexOf('] as const;', start);
  if (end === -1) return '';
  return content.slice(start, end);
}

/**
 * Text-parse the `id: '...'` field of every model-definition object literal inside
 * an array-literal source slice. Deliberately line-based (one property per line, the
 * project's own formatting) rather than a single regex over the whole blob, so a
 * sibling `apiId: '...'` field is never mistaken for the model id — `apiId` has a
 * capital `I`, so the literal substring `id:` never appears inside it.
 * @param {string} arraySource
 * @returns {string[]}
 */
export function extractIdFields(arraySource) {
  const ids = [];
  for (const rawLine of arraySource.split('\n')) {
    const trimmed = rawLine.trim();
    const m = /^id:\s*'([^']+)'/.exec(trimmed);
    if (m) ids.push(m[1]);
  }
  return ids;
}

/**
 * Derive the full known-model-id dictionary from model-registry.ts SOURCE TEXT
 * (already read into a string — no disk access here, so this is the pure,
 * fixture-testable half of derivation).
 * @param {string} content
 * @returns {Set<string>}
 */
export function deriveKnownModelIdsFromSource(content) {
  const ids = new Set();
  for (const arrayName of REGISTRY_ARRAYS) {
    for (const id of extractIdFields(sliceRegistryArray(content, arrayName))) ids.add(id);
  }
  return ids;
}

/**
 * Read model-registry.ts off disk and derive the known-model-id dictionary.
 * @param {string} [registryPath]
 * @returns {Set<string>}
 */
export function deriveKnownModelIds(registryPath = REGISTRY_PATH) {
  return deriveKnownModelIdsFromSource(readFileSync(registryPath, 'utf-8'));
}

/**
 * Extract model-name string-literal SITES from a source file: a line is a "site" if
 * it contains at least one quoted string (single, double, or interpolation-free
 * backtick) whose full content exactly equals one of `knownIds`. One entry per
 * LINE (not per match) — mirrors extractSpawnSyncCalls's boolean per-line gate, and
 * correctly reproduces a real duplicate-line case (e.g. two config presets that both
 * say `brain_model: 'opus',` verbatim) via the count-based multiset diff downstream,
 * rather than fabricating N near-duplicate rows for a line with several literals
 * (e.g. a `type X = 'a' | 'b' | ...` union). Excludes comment lines (`//` / `*`) and
 * import lines, mirroring extractSpawnSyncCalls's technique exactly.
 * @param {string} content
 * @param {Set<string>} knownIds
 * @returns {Array<{line: number, code: string}>}
 */
export function extractModelLiteralSites(content, knownIds) {
  const sites = [];
  const lines = content.split('\n');
  const STRING_RE = /'([^'\\]*)'|"([^"\\]*)"|`([^`$]*)`/g;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue; // comment
    if (trimmed.startsWith('import ') || trimmed.startsWith('} from')) continue; // import
    STRING_RE.lastIndex = 0;
    let hasKnownLiteral = false;
    let m;
    while ((m = STRING_RE.exec(raw)) !== null) {
      const value = m[1] ?? m[2] ?? m[3];
      if (knownIds.has(value)) {
        hasKnownLiteral = true;
        break;
      }
    }
    if (hasKnownLiteral) sites.push({ line: i + 1, code: trimmed });
  }
  return sites;
}

/**
 * Recursively collect .ts files under `dir`, excluding node_modules, the dashboard
 * subtree (its own toolchain), and model-registry.ts itself (the one SSOT file
 * exempt from its own gate). `rootDir` is used only to compute the relative path
 * for the model-registry.ts exclusion check, so this works against a fixture root
 * in tests as well as the real repo.
 * @param {string} dir
 * @param {string} rootDir
 * @param {string[]} [results]
 * @returns {string[]}
 */
function collectTsFiles(dir, rootDir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dashboard') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectTsFiles(full, rootDir, results);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      const rel = relative(rootDir, full).replace(/\\/g, '/');
      if (rel === REGISTRY_REL) continue;
      results.push(full);
    }
  }
  return results;
}

/**
 * Scan `srcDir` (excluding model-registry.ts) for every model-name string-literal
 * site, against the `knownIds` dictionary.
 * @param {string} [srcDir]
 * @param {string} [rootDir]
 * @param {Set<string>} [knownIds]
 * @returns {Array<{file: string, code: string}>}
 */
export function scanSource(srcDir = SRC_DIR, rootDir = REPO_ROOT, knownIds = deriveKnownModelIds()) {
  const found = [];
  for (const abs of collectTsFiles(srcDir, rootDir)) {
    const rel = relative(rootDir, abs).replace(/\\/g, '/');
    for (const site of extractModelLiteralSites(readFileSync(abs, 'utf-8'), knownIds)) {
      found.push({ file: rel, code: site.code });
    }
  }
  return found;
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
 * baseline count (per (file, code) key) is a NEW model-name literal.
 * @param {Array<{file: string, code: string}>} scan
 * @param {{ sanctioned?: Array<{file: string, code: string}> }} baseline
 * @returns {{ newCalls: Array<{file: string, code: string}> }}
 */
export function diffAgainstBaseline(scan, baseline) {
  const base = countMap(baseline.sanctioned ?? []);
  const liveCounts = countMap(scan);
  const newCalls = [];
  for (const [k, liveN] of liveCounts) {
    const baseN = base.get(k) ?? 0;
    if (liveN > baseN) {
      const [file, code] = JSON.parse(k);
      for (let i = 0; i < liveN - baseN; i++) newCalls.push({ file, code });
    }
  }
  return { newCalls };
}

/** Load the baseline JSON (or a default empty shape). */
export function loadBaseline(path = BASELINE_PATH) {
  if (!existsSync(path)) return { sanctioned: [] };
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
    process.stderr.write(`[no-model-literal] ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }

  if (mode === '--init') {
    const out = {
      note:
        'Model-name string-literal ratchet baseline (born-item 431-001). `sanctioned` = '
        + 'un-audited grandfathered call sites (model names hardcoded outside the '
        + 'src/core/model-registry.ts SSOT); a site absent here fails the gate. Known '
        + 'model ids are derived dynamically at scan time from model-registry.ts `id` '
        + 'fields, never copy-pasted here. Regenerate with --update.',
      sanctioned: dedupeSorted(scan),
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
    process.stdout.write(`[no-model-literal] --init: ${out.sanctioned.length} sanctioned sites written\n`);
    process.exit(0);
  }

  const baseline = loadBaseline();

  if (mode === '--update') {
    baseline.sanctioned = dedupeSorted(scan);
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
    process.stdout.write(`[no-model-literal] --update: sanctioned baseline refreshed (${baseline.sanctioned.length} sites)\n`);
    process.exit(0);
  }

  const { newCalls } = diffAgainstBaseline(scan, baseline);
  if (newCalls.length === 0) {
    process.stdout.write(
      `[no-model-literal] ✓ no new model-name literal — ${baseline.sanctioned?.length ?? 0} sanctioned (grandfathered)\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`[no-model-literal] FAIL: ${newCalls.length} new model-name literal site(s):\n`);
  for (const c of newCalls) {
    process.stderr.write(
      `  ${c.file}: [new model literal] ${c.code}\n`
      + `    Reference src/core/model-registry.ts (the SSOT) instead of hardcoding the model name.\n`
      + `    If genuinely grandfathered debt, run \`node scripts/lint-no-model-literal.mjs --update\` (diff-visible in review).\n`,
    );
  }
  process.exit(1);
}
