#!/usr/bin/env node
/**
 * check-error-handling.mjs — ErrorRegistry raw-throw ratchet
 *
 * Syntax-aware scan of production TypeScript for executable `throw new Error(...)`
 * statements. Existing debt is recorded as duplicate-aware, path-bound syntax fingerprints:
 * additions fail, and reductions also require the baseline to be ratcheted in the
 * same reviewed change so removed debt cannot become hidden headroom.
 *
 * Exit code 0 — current observations exactly match the baseline
 * Exit code 1 — new raw throws or stale baseline reductions exist
 *
 * Usage:
 *   node scripts/check-error-handling.mjs
 *   npm run lint:errors
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ─── Config ─────────────────────────────────────────────────────────

const SCAN_DIRS = [
  'src/cli/commands',
  'src/orchestra',
  'src/core',
  'src/agents',
];
const BASELINE_PATH = 'scripts/error-handling-baseline.json';
const EXCLUDE_DIRS = new Set(['node_modules', 'dist']);

// ─── Scanner ────────────────────────────────────────────────────────

/**
 * @typedef {{ file: string, line: number, content: string }} Observation
 * @typedef {{ file: string, fingerprint: string, count: number }} BaselineEntry
 * @typedef {{ version: 2, entries: BaselineEntry[] }} ErrorBaseline
 * @typedef {{ file: string, fingerprint: string, expected: number, actual: number }} BaselineReduction
 */

/**
 * Scan a TypeScript file for executable `throw new Error(...)` statements.
 * Comments, strings and other error classes are not observations.
 *
 * @param {string} filePath
 * @returns {Observation[]}
 */
export function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const source = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  /** @type {Observation[]} */
  const observations = [];

  /** @param {import('typescript').Node} node */
  function visit(node) {
    if (
      ts.isThrowStatement(node)
      && node.expression
      && ts.isNewExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'Error'
    ) {
      const start = node.getStart(source);
      const { line } = source.getLineAndCharacterOfPosition(start);
      observations.push({
        file: filePath,
        line: line + 1,
        content: content.slice(start, node.getEnd()).trim(),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return observations;
}

/**
 * Recursively collect production TypeScript files under a directory.
 *
 * @param {string} dir
 * @returns {string[]}
 */
export function collectTsFiles(dir) {
  /** @type {string[]} */
  const files = [];

  /** @param {string} current */
  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      const full = join(current, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  }

  walk(dir);
  return files.sort();
}

/**
 * Load and validate the committed baseline, if present.
 *
 * @param {string} root
 * @returns {ErrorBaseline | null}
 */
export function loadBaseline(root = ROOT) {
  const path = join(root, BASELINE_PATH);
  if (!existsSync(path)) return null;

  const parsed = JSON.parse(readFileSync(path, 'utf-8'));
  if (parsed?.version !== 2 || !Array.isArray(parsed.entries)) {
    throw new TypeError(`Invalid error-handling baseline: ${path}`);
  }
  for (const entry of parsed.entries) {
    if (
      !entry
      || typeof entry !== 'object'
      || typeof entry.file !== 'string'
      || !entry.file.startsWith('src/')
      || typeof entry.fingerprint !== 'string'
      || !/^[a-f0-9]{64}$/.test(entry.fingerprint)
      || !Number.isInteger(entry.count)
      || entry.count < 1
    ) {
      throw new TypeError(`Invalid error-handling baseline entry: ${JSON.stringify(entry)}`);
    }
  }
  return /** @type {ErrorBaseline} */ (parsed);
}

/**
 * Convert observations to deterministic relative per-file counts.
 *
 * @param {Observation[]} observations
 * @param {string} root
 * @returns {Record<string, number>}
 */
export function fingerprintObservations(observations, root = ROOT) {
  /** @type {Map<string, BaselineEntry>} */
  const entries = new Map();
  for (const observation of observations) {
    const file = relative(root, observation.file).replaceAll('\\', '/');
    const normalized = observation.content.replace(/\s+/g, ' ').trim();
    const fingerprint = createHash('sha256').update(normalized).digest('hex');
    const key = `${file}\0${fingerprint}`;
    const existing = entries.get(key);
    entries.set(key, {
      file,
      fingerprint,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...entries.values()].sort((a, b) => (
    a.file.localeCompare(b.file) || a.fingerprint.localeCompare(b.fingerprint)
  ));
}

/**
 * Compare current observations with the committed baseline.
 *
 * @param {Observation[]} observations
 * @param {ErrorBaseline | null} baseline
 * @param {string} root
 * @returns {{
 *   violations: Observation[],
 *   reductions: BaselineReduction[],
 *   knownCount: number,
 *   currentEntries: BaselineEntry[],
 * }}
 */
export function compareWithBaseline(observations, baseline, root = ROOT) {
  const currentEntries = fingerprintObservations(observations, root);
  if (!baseline) {
    return {
      violations: observations,
      reductions: [],
      knownCount: 0,
      currentEntries,
    };
  }

  /** @type {Map<string, Observation[]>} */
  const observationsByIdentity = new Map();
  for (const observation of observations) {
    const file = relative(root, observation.file).replaceAll('\\', '/');
    const normalized = observation.content.replace(/\s+/g, ' ').trim();
    const fingerprint = createHash('sha256').update(normalized).digest('hex');
    const key = `${file}\0${fingerprint}`;
    const existing = observationsByIdentity.get(key) ?? [];
    existing.push(observation);
    observationsByIdentity.set(key, existing);
  }

  /** @type {Observation[]} */
  const violations = [];
  /** @type {BaselineReduction[]} */
  const reductions = [];
  const baselineByIdentity = new Map(
    baseline.entries.map(entry => [`${entry.file}\0${entry.fingerprint}`, entry]),
  );
  const currentByIdentity = new Map(
    currentEntries.map(entry => [`${entry.file}\0${entry.fingerprint}`, entry]),
  );
  const identities = new Set([...baselineByIdentity.keys(), ...currentByIdentity.keys()]);

  for (const key of [...identities].sort()) {
    const baselineEntry = baselineByIdentity.get(key);
    const currentEntry = currentByIdentity.get(key);
    const file = currentEntry?.file ?? baselineEntry?.file ?? '';
    const fingerprint = currentEntry?.fingerprint ?? baselineEntry?.fingerprint ?? '';
    const expected = baselineEntry?.count ?? 0;
    const actual = currentEntry?.count ?? 0;
    if (actual > expected) {
      violations.push(...(observationsByIdentity.get(key) ?? []).slice(expected));
    } else if (actual < expected) {
      reductions.push({ file, fingerprint, expected, actual });
    }
  }

  return {
    violations,
    reductions,
    knownCount: observations.length - violations.length,
    currentEntries,
  };
}

/**
 * Run the canonical gate across all governed production directories.
 *
 * A project without a baseline treats every observation as new. Tests can pass an
 * explicit baseline without writing repository state.
 *
 * @param {string} root
 * @param {{ baseline?: ErrorBaseline | null }} options
 * @returns {{
 *   violations: Observation[],
 *   reductions: BaselineReduction[],
 *   observations: Observation[],
 *   knownCount: number,
 *   currentEntries: BaselineEntry[],
 *   filesScanned: number,
 * }}
 */
export function runCheck(root = ROOT, options = {}) {
  /** @type {Observation[]} */
  const observations = [];
  let filesScanned = 0;

  for (const scanDir of SCAN_DIRS) {
    const files = collectTsFiles(join(root, scanDir));
    for (const file of files) {
      observations.push(...scanFile(file));
      filesScanned++;
    }
  }

  const baseline = Object.hasOwn(options, 'baseline')
    ? options.baseline ?? null
    : loadBaseline(root);
  return {
    ...compareWithBaseline(observations, baseline, root),
    observations,
    filesScanned,
  };
}

/**
 * Format new observations for human-readable output.
 *
 * @param {Observation[]} violations
 * @param {string} root
 * @returns {string}
 */
export function formatViolations(violations, root = ROOT) {
  if (violations.length === 0) return '';

  const lines = [
    `ErrorRegistry lint: ${violations.length} violation(s) found — all are new raw throws`,
    '',
    'New executable throws:',
  ];

  for (const violation of violations) {
    const file = relative(root, violation.file).replaceAll('\\', '/');
    lines.push(`  ${file}:${violation.line}`);
    lines.push(`    Found: ${violation.content}`);
    lines.push('    Suggested fix: use DeckentError/ErrorRegistry or explicitly ratchet the reviewed baseline');
    lines.push('');
  }

  lines.push('How to fix: migrate each site to a registered DeckentError family, then rerun npm run lint:errors.');
  return lines.join('\n');
}

/**
 * @param {BaselineReduction[]} reductions
 * @returns {string}
 */
export function formatReductions(reductions) {
  if (reductions.length === 0) return '';

  const lines = [
    `ErrorRegistry lint: ${reductions.length} stale baseline entr${reductions.length === 1 ? 'y' : 'ies'} found`,
    '',
    'Ratchet the baseline in the same reviewed change:',
  ];
  for (const reduction of reductions) {
    lines.push(
      `  ${reduction.file}#${reduction.fingerprint.slice(0, 12)}: `
      + `baseline=${reduction.expected}, current=${reduction.actual}`,
    );
  }
  return lines.join('\n');
}

// ─── CLI Entry Point ────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const result = runCheck();

  if (result.violations.length === 0 && result.reductions.length === 0) {
    console.log(
      `ErrorRegistry lint: OK — ${result.filesScanned} file(s) scanned, `
      + `0 new violation(s), ${result.knownCount} known baseline occurrence(s)`,
    );
    process.exit(0);
  }

  const messages = [
    formatViolations(result.violations),
    formatReductions(result.reductions),
  ].filter(Boolean);
  console.error(messages.join('\n\n'));
  console.error(
    `\nResult: ${result.violations.length} new violation(s), `
    + `${result.reductions.length} stale baseline entr${result.reductions.length === 1 ? 'y' : 'ies'} `
    + `across ${result.filesScanned} files — FAIL`,
  );
  process.exit(1);
}
