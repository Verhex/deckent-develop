#!/usr/bin/env node
/**
 * AFFECTED-RESOLVER (born-400-001)
 *
 * Pure changed-file → affected-test resolver. Never calls git itself — the
 * caller supplies the changed-file list (STDIN, newline- or comma-separated,
 * or `--changed a,b,c`). Builds a static ESM import graph over `src/**` +
 * `tests/**` (Node16/nodenext `.js`-specifier → `.ts`/`.tsx` source
 * resolution) and returns every `tests/**` `.test.ts`/`.test.tsx` file that
 * transitively imports a changed module.
 *
 * Edge patterns counted (over-inclusive by design — a missed test is worse
 * than an extra one): `import ... from '...'`, `export ... from '...'`,
 * dynamic `import('...')`, bare side-effect `import '...'`,
 * `vi.mock('...')` / `vi.doMock('...')`.
 *
 * Known-missing classes (documented, not silently dropped — honest stats via
 * `unresolvedImports` in `--json` output):
 *   1. readFileSync-based composition-pin tests (~15 files) that read src
 *      text directly instead of importing — no static import/export/vi.mock
 *      keyword touches the target, so it is structurally invisible here.
 *   2. Fixture-JSON path readers — a test resolves a path out of JSON
 *      content at runtime; no static specifier to scan.
 *   3. Template-literal dynamic import (`import(\`...\`)`) — presence is
 *      detected and bumps `unresolvedImports`, but the target can't be
 *      statically resolved from a template literal.
 *   4. `@/`-alias specifiers (e.g. tests/docs/github-pages-deploy.test.ts)
 *      — bare/aliased, correctly counted in `unresolvedImports`; no
 *      tsconfig `paths` alias resolution is implemented (relative-specifier
 *      resolution only, per ADR-D-001 Node16/nodenext).
 *   5. (KAPANDI — born-606 Brain-fix) `scripts/**` artık evrende; .mjs
 *      importları çözülür ve scripts-değişikliği testlerini bulur.
 *   CommonJS `require()` is intentionally not scanned — the project is
 *   ESM-only (ADR-D-001) and it is not part of the spec's edge-pattern set.
 *
 * Usage:
 *   node scripts/affected-tests.mjs --changed src/a.ts,src/b.ts [--root <path>] [--json]
 *   git diff --name-only main... | node scripts/affected-tests.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';

// ─── Constants ─────────────────────────────────────────────────────────────

// born-606 kapanış-fix'i (Brain): `scripts/` de evrende — gate-script'lerinin
// KENDİLERİ load-bearing (bu dosya dahil); dışarıda kalmaları "scripts değişti →
// 0 affected" eksiltmesi üretiyordu (canlı-smoke yakaladı).
const SCAN_DIRS = ['src', 'tests', 'scripts'];
const RELATIVE_JS_EXT_RE = /\.jsx?$/;
const TEST_FILE_RE = /\.test\.(ts|tsx)$/;

// Edge-extraction patterns. All operate on raw file text (line/regex scan —
// no TS parser, per spec: comment-internal false positives are accepted
// over-inclusion, not a correctness bug).
const RE_FROM = /\bfrom\s+['"]([^'"]+)['"]/g;
const RE_DYNAMIC_LITERAL = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;
const RE_DYNAMIC_TEMPLATE = /\bimport\s*\(\s*`/g;
const RE_BARE_SIDE_EFFECT = /^\s*import\s+['"]([^'"]+)['"]/gm;
const RE_VI_MOCK = /\bvi\.(?:mock|doMock)\(\s*['"]([^'"]+)['"]/g;

// ─── Path helpers ──────────────────────────────────────────────────────────

/** Normalize any OS path separator to posix `/` (rule d — Windows input/output). */
export function toPosix(p) {
  return p.split(sep).join('/').split('\\').join('/');
}

export function isTestPath(relPosixPath) {
  return relPosixPath.startsWith('tests/') && TEST_FILE_RE.test(relPosixPath);
}

// ─── File discovery ────────────────────────────────────────────────────────

function walk(dir, results) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, results);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.mjs') || entry.name.endsWith('.cjs'))) {
      results.push(full);
    }
  }
}

/**
 * Recursively list every `.ts`/`.tsx` file under `src/` and `tests/`,
 * excluding any `**\/node_modules/**` subtree (src/desktop + src/dashboard
 * both embed their own node_modules — must be excluded generically, not by
 * a hardcoded per-project path, since the exclusion applies at any depth).
 * @param {string} root
 * @returns {string[]} absolute paths
 */
export function listProjectFiles(root) {
  const results = [];
  for (const base of SCAN_DIRS) {
    walk(join(root, base), results);
  }
  return results;
}

// ─── Import-edge extraction ────────────────────────────────────────────────

/**
 * Extract every import-like specifier from file content, plus a count of
 * template-literal dynamic imports (unresolvable by construction — see
 * known-missing class 3 above).
 * @param {string} content
 * @returns {{ specifiers: string[], templateDynamicCount: number }}
 */
export function extractSpecifiers(content) {
  const specifiers = [];
  let m;

  RE_FROM.lastIndex = 0;
  while ((m = RE_FROM.exec(content)) !== null) specifiers.push(m[1]);

  RE_DYNAMIC_LITERAL.lastIndex = 0;
  while ((m = RE_DYNAMIC_LITERAL.exec(content)) !== null) specifiers.push(m[1]);

  RE_BARE_SIDE_EFFECT.lastIndex = 0;
  while ((m = RE_BARE_SIDE_EFFECT.exec(content)) !== null) specifiers.push(m[1]);

  RE_VI_MOCK.lastIndex = 0;
  while ((m = RE_VI_MOCK.exec(content)) !== null) specifiers.push(m[1]);

  let templateDynamicCount = 0;
  RE_DYNAMIC_TEMPLATE.lastIndex = 0;
  while (RE_DYNAMIC_TEMPLATE.exec(content) !== null) templateDynamicCount++;

  return { specifiers, templateDynamicCount };
}

/**
 * Resolve a relative ESM specifier to an absolute source path, using
 * membership in `resolvableSet` rather than `existsSync` — this is what
 * lets a deleted changed-file's candidate path (folded into `resolvableSet`
 * by the caller even though absent on disk) still match an importer that
 * literally still references it (rule: deleted-file behavior).
 * Only `.js`/`.jsx` specifier extensions are extension-swapped — `.mjs`/
 * `.cjs` are real non-TS files (e.g. scripts/*.mjs) never compiled from
 * `.ts`, so they are deliberately left unresolved.
 * @param {string} fromDir - absolute directory of the importing file
 * @param {string} spec - raw specifier text
 * @param {Set<string>} resolvableSet - absolute paths eligible as targets
 * @returns {string | null}
 */
export function resolveSpecifier(fromDir, spec, resolvableSet) {
  if (!spec.startsWith('.')) return null;

  const clean = spec.split('?')[0].split('#')[0];
  const withoutExt = clean.replace(RELATIVE_JS_EXT_RE, '');
  const base = resolve(fromDir, withoutExt);

  // born-606 Brain-fix: `.mjs`/`.cjs` specifier'lar GERÇEK dosyalardır (TS'ten
  // derlenmez) — literal yol önce denenir; scripts/*.mjs importları böyle çözülür.
  const literal = resolve(fromDir, spec);
  const candidates = [
    ...(spec.endsWith('.mjs') || spec.endsWith('.cjs') ? [literal] : []),
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (resolvableSet.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Single-pass scan building a Map-based reverse import index
 * (target-absolute-path → Set of importer-absolute-paths).
 * @param {string[]} files - absolute paths (as returned by listProjectFiles)
 * @param {Set<string>} resolvableSet
 * @returns {{ reverseIndex: Map<string, Set<string>>, edgesResolved: number, unresolvedImports: number }}
 */
export function buildReverseGraph(files, resolvableSet) {
  const reverseIndex = new Map();
  let edgesResolved = 0;
  let unresolvedImports = 0;

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const fromDir = dirname(file);
    const { specifiers, templateDynamicCount } = extractSpecifiers(content);
    unresolvedImports += templateDynamicCount;

    for (const spec of specifiers) {
      const target = resolveSpecifier(fromDir, spec, resolvableSet);
      if (!target) {
        unresolvedImports++;
        continue;
      }
      edgesResolved++;
      let importers = reverseIndex.get(target);
      if (!importers) {
        importers = new Set();
        reverseIndex.set(target, importers);
      }
      importers.add(file);
    }
  }

  return { reverseIndex, edgesResolved, unresolvedImports };
}

// ─── Core resolver ─────────────────────────────────────────────────────────

/**
 * Compute every affected test file for a given changed-file list.
 * @param {string} root - project root
 * @param {string[]} changedInputs - raw changed-file path strings
 * @returns {{ changed: string[], affected: string[], graphStats: object }}
 */
export function computeAffectedTests(root, changedInputs) {
  const files = listProjectFiles(root);
  const knownSet = new Set(files);

  const changedAbsSet = new Set();
  const deletedCandidates = new Set();
  for (const raw of changedInputs) {
    const normalized = toPosix(raw).trim();
    if (!normalized) continue;
    const abs = resolve(root, normalized);
    changedAbsSet.add(abs);
    if (!knownSet.has(abs)) deletedCandidates.add(abs);
  }

  // Deleted-file behavior: fold missing changed-file candidates into the
  // resolvable universe so an importer that still literally references the
  // now-deleted path resolves to it (deletion = riskiest change class).
  const resolvableSet = new Set([...knownSet, ...deletedCandidates]);
  const { reverseIndex, edgesResolved, unresolvedImports } = buildReverseGraph(files, resolvableSet);

  const visited = new Set(changedAbsSet);
  const queue = [...changedAbsSet];
  while (queue.length > 0) {
    const current = queue.shift();
    const importers = reverseIndex.get(current);
    if (!importers) continue;
    for (const importer of importers) {
      if (!visited.has(importer)) {
        visited.add(importer);
        queue.push(importer);
      }
    }
  }

  const affected = [];
  for (const abs of visited) {
    if (!knownSet.has(abs)) continue; // drop deleted/unknown seeds from output
    const rel = toPosix(relative(root, abs));
    if (isTestPath(rel)) affected.push(rel);
  }
  affected.sort();

  return {
    changed: [...changedAbsSet].map(abs => toPosix(relative(root, abs))),
    affected,
    graphStats: {
      filesScanned: files.length,
      edgesResolved,
      unresolvedImports,
      deletedChangedFiles: deletedCandidates.size,
    },
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function parseChangedList(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = { root: process.cwd(), json: false, changed: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') {
      args.root = resolve(argv[++i]);
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--changed') {
      args.changed = argv[++i] ?? '';
    }
  }
  return args;
}

function readStdinSync() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawChanged = args.changed !== null ? args.changed : readStdinSync();
  const changedList = parseChangedList(rawChanged);

  const result = computeAffectedTests(args.root, changedList);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const testPath of result.affected) console.log(testPath);
  }
  process.exitCode = 0;
}

// Only run main() when invoked directly (not when imported by tests) —
// mirrors the established convention in scripts/dead-code-audit.mjs.
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  main();
}
