#!/usr/bin/env node
// lint-layer-shims.mjs — ADR-D-004 (C3) mcp/ <-> cli/ sanctioned-exception ratchet.
//
// WHAT THIS IS (honest framing): a REGISTRY-SCOPED ratchet, not a full mcp/-wide
// C3-edge scan. It derives the set of "governed" files from
// .deckent/settings/layer-shims.json's `shims[].from` values, and for each governed
// file verifies every `cli/`-crossing import found in it is covered by a registered
// entry: same `to` module specifier, and every imported symbol a subset of that
// entry's (or entries') allowed `symbols` union. "No registry entry, no import"
// (ADR-D-004 C5). It does NOT auto-discover a brand-new, not-yet-governed mcp/ file
// that starts importing cli/ — extending the scan to every Layer-1 edge + every
// mcp/ file is ADR-D-004's own documented D004-W6 (hard graph gate + full-edge
// scan), tracked separately.
//
// Registry: .deckent/settings/layer-shims.json
//
// Exit: 0 = clean, 1 = violations, 2 = scan/validation error
// Usage:
//   node scripts/lint-layer-shims.mjs                        # check (real repo)
//   node scripts/lint-layer-shims.mjs --root <dir> --registry <path>  # fixture use

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const REGISTRY_PATH = join(REPO_ROOT, '.deckent', 'settings', 'layer-shims.json');

const REQUIRED_FIELDS = ['id', 'from', 'to', 'symbols', 'reason', 'adrRef', 'owner', 'expiry'];

/**
 * Extract `cli/`-crossing named-import blocks from a TS source file's content.
 * Matches both single-line and multi-line `import {...} from '...'` (incl.
 * `type` prefixes on individual named bindings, stripped from the result).
 * Namespace/default imports are not handled — not present in any governed file
 * today; add if a future governed file genuinely needs it (YAGNI).
 * @param {string} content
 * @returns {Array<{to: string, symbols: string[]}>}
 */
export function extractCliCrossings(content) {
  const crossings = [];
  const importBlockRe = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importBlockRe.exec(content)) !== null) {
    const specifier = m[2];
    if (!specifier.includes('/cli/')) continue;
    const symbols = m[1]
      .split(',')
      .map((s) => s.replace(/^\s*type\s+/, '').trim())
      .filter(Boolean);
    crossings.push({ to: specifier, symbols });
  }
  return crossings;
}

/**
 * Resolve a relative import specifier (as written in `fromFileRel`) to a
 * repo-root-relative, POSIX-separated path, so registry `to` entries can be
 * matched independent of the importing file's own location.
 * @param {string} fromFileRel repo-root-relative path of the importing file
 * @param {string} specifier the raw import specifier string
 * @param {string} rootDir
 * @returns {string}
 */
export function resolveSpecifier(fromFileRel, specifier, rootDir) {
  const fromDir = dirname(join(rootDir, fromFileRel));
  const abs = resolve(fromDir, specifier);
  return relative(rootDir, abs).split(sep).join('/');
}

/** Load the shim registry JSON (or an empty default shape). */
export function loadRegistry(path = REGISTRY_PATH) {
  if (!existsSync(path)) return { shims: [] };
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Validate every registry entry carries all required fields (expiry included).
 * @returns {Array<{id: string, missingFields: string[]}>}
 */
export function validateRegistry(registry) {
  const problems = [];
  for (const entry of registry.shims ?? []) {
    const missingFields = REQUIRED_FIELDS.filter((f) => {
      const v = entry[f];
      return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    });
    if (missingFields.length > 0) {
      problems.push({ id: entry.id ?? '(no id)', missingFields });
    }
  }
  return problems;
}

/**
 * Check one governed file's actual `cli/`-crossing imports against its
 * registered entries.
 * @param {string} absPath
 * @param {string} fromFileRel repo-root-relative path of this file
 * @param {Array<object>} entries registry entries whose `from` === fromFileRel
 * @param {string} rootDir
 * @returns {Array<{type: 'unregistered-crossing'|'unregistered-symbol', to: string, symbols: string[]}>}
 */
export function checkFile(absPath, fromFileRel, entries, rootDir = REPO_ROOT) {
  const content = readFileSync(absPath, 'utf-8');
  const crossings = extractCliCrossings(content);
  const violations = [];
  for (const crossing of crossings) {
    // Registry `to` values are stored repo-root-relative; resolve this file's
    // raw specifier the same way before matching.
    const resolvedTo = resolveSpecifier(fromFileRel, crossing.to, rootDir);
    const matches = entries.filter((e) => e.to === resolvedTo);
    if (matches.length === 0) {
      violations.push({ type: 'unregistered-crossing', to: resolvedTo, symbols: crossing.symbols });
      continue;
    }
    const allowed = new Set(matches.flatMap((e) => e.symbols));
    const disallowed = crossing.symbols.filter((s) => !allowed.has(s));
    if (disallowed.length > 0) {
      violations.push({ type: 'unregistered-symbol', to: resolvedTo, symbols: disallowed });
    }
  }
  return violations;
}

/**
 * Run the full registry-scoped check: group entries by governed file, check
 * each file that still exists, flag `stale-entry` for one that no longer does.
 * @returns {Array<{file: string, violations: Array<object>}>}
 */
export function runCheck(registry = loadRegistry(), rootDir = REPO_ROOT) {
  const problems = validateRegistry(registry);
  if (problems.length > 0) {
    const details = problems.map((p) => `${p.id}: missing [${p.missingFields.join(', ')}]`).join('; ');
    throw new Error(`invalid layer-shims registry entries — ${details}`);
  }

  const byFile = new Map();
  for (const entry of registry.shims ?? []) {
    if (!byFile.has(entry.from)) byFile.set(entry.from, []);
    byFile.get(entry.from).push(entry);
  }

  const results = [];
  for (const [relFile, entries] of byFile) {
    const abs = join(rootDir, relFile);
    if (!existsSync(abs)) {
      results.push({ file: relFile, violations: [{ type: 'stale-entry', to: '', symbols: [] }] });
      continue;
    }
    const violations = checkFile(abs, relFile, entries, rootDir);
    if (violations.length > 0) results.push({ file: relFile, violations });
  }
  return results;
}

// ─── CLI ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { root: REPO_ROOT, registry: REGISTRY_PATH };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') opts.root = resolve(argv[++i]);
    else if (argv[i] === '--registry') opts.registry = resolve(argv[++i]);
  }
  return opts;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  const { root, registry: registryPath } = parseArgs(process.argv.slice(2));

  let registry;
  let results;
  try {
    registry = loadRegistry(registryPath);
    results = runCheck(registry, root);
  } catch (err) {
    process.stderr.write(`[layer-shims] ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }

  if (results.length === 0) {
    process.stdout.write(`[layer-shims] ✓ all ${(registry.shims ?? []).length} governed crossing(s) accounted for\n`);
    process.exit(0);
  }

  process.stderr.write(`[layer-shims] FAIL: ${results.length} governed file(s) with violations:\n`);
  for (const r of results) {
    for (const v of r.violations) {
      if (v.type === 'stale-entry') {
        process.stderr.write(`  ${r.file}: [stale] governed file no longer exists\n`);
      } else if (v.type === 'unregistered-crossing') {
        process.stderr.write(
          `  ${r.file}: [unregistered crossing] import from '${v.to}' has no matching layer-shims.json entry\n`
          + `    Add an entry (from/to/symbols/reason/adrRef/owner/expiry) to .deckent/settings/layer-shims.json.\n`,
        );
      } else {
        process.stderr.write(
          `  ${r.file}: [unregistered symbol] '${v.symbols.join(', ')}' imported from '${v.to}' is not in the allowed symbols list\n`
          + `    Add the symbol to the matching entry's "symbols" in .deckent/settings/layer-shims.json.\n`,
        );
      }
    }
  }
  process.exit(1);
}
