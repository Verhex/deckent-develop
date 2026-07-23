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
// The same gate also ratchets actionable Markdown aliases (`Model: sonnet`,
// `/model sonnet`, or an exact alias table cell). Prose is not scanned, and
// the alias dictionary is derived from LEGACY_MODEL_ALIASES below — never
// duplicated here.
//
// Baseline: scripts/model-literal-baseline.json (regenerate with --update;
// initialise with --init). Source and Markdown debt live in separate fields.
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
const MARKDOWN_ROOT_FILES = [
  'README.md',
  'README-TR.md',
  'DECKENT.md',
  'DIRECTIVES.md',
  '.deckent/DIRECTIVES-features.md',
];
const MARKDOWN_ROOT_DIRS = ['docs', 'examples'];
const MARKDOWN_EXCLUDED_PREFIXES = [
  'docs/archive/',
  'docs/analysis/',
  'docs/audits/',
  'docs/logs/',
  'docs/superpowers/',
  'docs/alperen-analysis/',
];
const MARKDOWN_EXCLUDED_FILES = new Set([
  'docs/MASTER-PLAN.md',
  'docs/CHANGELOG.md',
  'docs/SPRINT-LOG.md',
]);
const MARKDOWN_MIGRATION_MARKER = '<!-- deckent:model-alias-migration -->';

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

/** Derive migration-only legacy aliases from LEGACY_MODEL_ALIASES source. */
export function deriveLegacyModelAliasesFromSource(content) {
  const start = content.indexOf('export const LEGACY_MODEL_ALIASES');
  if (start === -1) return new Set();
  const end = content.indexOf('} as const);', start);
  if (end === -1) return new Set();
  const aliases = new Set();
  for (const rawLine of content.slice(start, end).split('\n')) {
    const line = rawLine.trim();
    const match = /^(?:'([^']+)'|([a-zA-Z][\w.-]*)):\s*'[^']+'/.exec(line);
    const alias = match?.[1] ?? match?.[2];
    if (alias) aliases.add(alias);
  }
  return aliases;
}

export function deriveLegacyModelAliases(registryPath = REGISTRY_PATH) {
  return deriveLegacyModelAliasesFromSource(readFileSync(registryPath, 'utf-8'));
}

function normalizeMarkdownCell(cell) {
  let value = cell.trim();
  while (
    (value.startsWith('`') && value.endsWith('`'))
    || (value.startsWith('**') && value.endsWith('**'))
    || (value.startsWith('*') && value.endsWith('*'))
  ) {
    value = value.startsWith('**') ? value.slice(2, -2).trim() : value.slice(1, -1).trim();
  }
  return value;
}

function isMigrationTableHeader(cells) {
  return cells.some((cell) => /^(?:legacy (?:model )?alias|migration input|rejected input)$/i.test(
    normalizeMarkdownCell(cell),
  ));
}

/**
 * Extract actionable legacy-model alias sites from Markdown. Ordinary prose is
 * intentionally invisible. A migration/rejection table must declare that role
 * in its header, or a single exceptional row may use the review-visible marker.
 *
 * @param {string} content
 * @param {Set<string>} aliases
 * @returns {Array<{line: number, kind: 'directive-model'|'slash-model'|'table-cell', code: string}>}
 */
export function extractActionableMarkdownAliasSites(content, aliases) {
  const sites = [];
  const lines = content.split('\n');
  let migrationTable = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|');
    const cells = isTableRow ? trimmed.slice(1, -1).split('|') : [];

    if (!isTableRow) migrationTable = false;
    if (isTableRow && isMigrationTableHeader(cells)) {
      migrationTable = true;
      continue;
    }
    if (trimmed.includes(MARKDOWN_MIGRATION_MARKER)) continue;

    const directive = /^\s*(?:[-*]\s*)?(?:force)?model\s*:\s*`?([^\s`|#]+)`?/i.exec(raw);
    if (directive && aliases.has(directive[1])) {
      sites.push({ line: i + 1, kind: 'directive-model', code: trimmed });
      continue;
    }

    const slashModel = /(?:^|[\s>`|›$])\/model\s+`?([^\s`|]+)`?/g;
    let commandMatch;
    let hasSlashAlias = false;
    while ((commandMatch = slashModel.exec(raw)) !== null) {
      if (aliases.has(commandMatch[1])) {
        hasSlashAlias = true;
        break;
      }
    }
    if (hasSlashAlias) {
      sites.push({ line: i + 1, kind: 'slash-model', code: trimmed });
      continue;
    }

    if (isTableRow && !migrationTable && cells.some((cell) => aliases.has(normalizeMarkdownCell(cell)))) {
      sites.push({ line: i + 1, kind: 'table-cell', code: trimmed });
    }
  }

  return sites;
}

/** Current user/agent instruction Markdown only; historical evidence is excluded. */
export function isActionableMarkdownPath(relPath) {
  const rel = relPath.replace(/\\/g, '/');
  if (!rel.endsWith('.md')) return false;
  if (MARKDOWN_EXCLUDED_FILES.has(rel)) return false;
  if (MARKDOWN_EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix))) return false;
  return MARKDOWN_ROOT_FILES.includes(rel)
    || MARKDOWN_ROOT_DIRS.some((dir) => rel.startsWith(`${dir}/`));
}

function collectMarkdownFiles(dir, rootDir, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectMarkdownFiles(full, rootDir, results);
    } else {
      const rel = relative(rootDir, full).replace(/\\/g, '/');
      if (isActionableMarkdownPath(rel)) results.push(full);
    }
  }
  return results;
}

/**
 * Scan current Markdown instruction surfaces for actionable legacy aliases.
 * @param {string} [rootDir]
 * @param {Set<string>} [aliases]
 * @returns {Array<{file: string, kind: string, code: string}>}
 */
export function scanActionableMarkdown(
  rootDir = REPO_ROOT,
  aliases = deriveLegacyModelAliases(),
) {
  const candidates = [];
  for (const rel of MARKDOWN_ROOT_FILES) {
    const abs = join(rootDir, rel);
    if (existsSync(abs) && statSync(abs).isFile()) candidates.push(abs);
  }
  for (const rel of MARKDOWN_ROOT_DIRS) {
    collectMarkdownFiles(join(rootDir, rel), rootDir, candidates);
  }

  const found = [];
  for (const abs of [...new Set(candidates)]) {
    const rel = relative(rootDir, abs).replace(/\\/g, '/');
    for (const site of extractActionableMarkdownAliasSites(readFileSync(abs, 'utf-8'), aliases)) {
      found.push({ file: rel, kind: site.kind, code: site.code });
    }
  }
  return found;
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
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue; // comment
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

/**
 * A legacy alias may exist only as an input discriminator at the explicit
 * config-migration boundary. This exemption is deliberately line- and
 * file-shaped: it does not permit alias-valued defaults, assignments, or
 * return values anywhere, including elsewhere in config-migration.ts.
 *
 * @param {{file: string, code: string}} site
 * @returns {boolean}
 */
export function isExplicitLegacyMigrationSite(site) {
  return site.file === 'src/core/config-migration.ts'
    && /^case\s+(['"`])[^'"`]+\1\s*:\s*$/.test(site.code);
}

/** Multiset key for a source/docs site (file + optional kind + normalized code). */
const keyOf = (e) => JSON.stringify([e.file, e.kind ?? null, e.code]);

/** Build a count-map (multiset) from a list of entries. */
function countMap(entries) {
  const m = new Map();
  for (const e of entries) m.set(keyOf(e), (m.get(keyOf(e)) ?? 0) + 1);
  return m;
}

/**
 * Compare the live scan against the baseline. A live occurrence beyond the
 * baseline count (per (file, code) key) is a NEW model-name literal.
 * @param {Array<{file: string, kind?: string, code: string}>} scan
 * @param {{ sanctioned?: Array<{file: string, kind?: string, code: string}> }} baseline
 * @returns {{ newCalls: Array<{file: string, kind?: string, code: string}> }}
 */
export function diffAgainstBaseline(scan, baseline) {
  const base = countMap(baseline.sanctioned ?? []);
  const liveCounts = countMap(scan);
  const newCalls = [];
  for (const [k, liveN] of liveCounts) {
    const baseN = base.get(k) ?? 0;
    if (liveN > baseN) {
      const [file, kind, code] = JSON.parse(k);
      const entry = kind ? { file, kind, code } : { file, code };
      for (let i = 0; i < liveN - baseN; i++) newCalls.push(entry);
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
  return [...entries].sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if ((a.kind ?? '') !== (b.kind ?? '')) return (a.kind ?? '').localeCompare(b.kind ?? '');
    return a.code.localeCompare(b.code);
  });
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  const mode = process.argv[2];
  let scan;
  let markdownScan;
  try {
    scan = scanSource();
    markdownScan = scanActionableMarkdown();
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
        + 'fields, never copy-pasted here. `sanctionedMarkdown` separately tracks '
        + 'actionable legacy aliases in current docs; aliases are derived from '
        + 'LEGACY_MODEL_ALIASES. Regenerate with --update.',
      sanctioned: dedupeSorted(scan),
      sanctionedMarkdown: dedupeSorted(markdownScan),
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
    process.stdout.write(
      `[no-model-literal] --init: ${out.sanctioned.length} source + ${out.sanctionedMarkdown.length} Markdown sanctioned sites written\n`,
    );
    process.exit(0);
  }

  const baseline = loadBaseline();

  if (mode === '--update') {
    baseline.sanctioned = dedupeSorted(scan);
    baseline.sanctionedMarkdown = dedupeSorted(markdownScan);
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
    process.stdout.write(
      `[no-model-literal] --update: baseline refreshed (${baseline.sanctioned.length} source + ${baseline.sanctionedMarkdown.length} Markdown sites)\n`,
    );
    process.exit(0);
  }

  const { newCalls } = diffAgainstBaseline(scan, baseline);
  const { newCalls: newMarkdownCalls } = diffAgainstBaseline(
    markdownScan,
    { sanctioned: baseline.sanctionedMarkdown ?? [] },
  );
  const legacyCalls = scanSource(SRC_DIR, REPO_ROOT, deriveLegacyModelAliases())
    .filter((site) => !isExplicitLegacyMigrationSite(site));
  if (newCalls.length === 0 && legacyCalls.length === 0 && newMarkdownCalls.length === 0) {
    process.stdout.write(
      `[no-model-literal] ✓ no new canonical literal, runtime legacy alias, or actionable docs alias — `
      + `${baseline.sanctioned?.length ?? 0} source + ${baseline.sanctionedMarkdown?.length ?? 0} Markdown sites sanctioned (grandfathered)\n`,
    );
    process.exit(0);
  }

  process.stderr.write(
    `[no-model-literal] FAIL: ${newCalls.length} new canonical literal site(s), `
    + `${legacyCalls.length} runtime legacy alias site(s), `
    + `${newMarkdownCalls.length} actionable Markdown alias site(s):\n`,
  );
  for (const c of newCalls) {
    process.stderr.write(
      `  ${c.file}: [new model literal] ${c.code}\n`
      + `    Reference src/core/model-registry.ts (the SSOT) instead of hardcoding the model name.\n`
      + `    If genuinely grandfathered debt, run \`node scripts/lint-no-model-literal.mjs --update\` (diff-visible in review).\n`,
    );
  }
  for (const c of legacyCalls) {
    process.stderr.write(
      `  ${c.file}: [legacy runtime alias] ${c.code}\n`
      + '    Legacy aliases are migration-input metadata only; runtime producers must resolve a registered API ID.\n',
    );
  }
  for (const c of newMarkdownCalls) {
    process.stderr.write(
      `  ${c.file}: [actionable Markdown alias:${c.kind ?? 'unknown'}] ${c.code}\n`
      + '    Use an exact registered provider API ID, or document migration in prose/a table with an explicit migration header.\n'
      + '    If genuinely grandfathered debt, run `node scripts/lint-no-model-literal.mjs --update` (diff-visible in review).\n',
    );
  }
  process.exit(1);
}
