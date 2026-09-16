#!/usr/bin/env node
// lint-skill-routing-eligibility.mjs — D10 resolver-bypass gate (row 9034).
//
// Contract: on the routing surface (`src/orchestra`), skill selection happens
// ONLY through the plan-time adapter (`routing-plan-adapter.ts`). Any other
// module there that re-derives skill routability itself — validating or deriving
// a profile, or resolving/snapshotting the catalog to decide candidacy — is a
// resolver bypass and FAILS this gate: a second selection path is exactly how a
// silent skip re-enters the tree after it was closed in one place.
//
// Pool LOADING (`loadSkills()`) is deliberately NOT a violation: the planner and
// the mid-sprint adapter load a pool and hand it to the adapter, which is the
// sanctioned direction. What is banned is deciding eligibility elsewhere.
//
// Second rule: the adapter must keep the full typed rejection vocabulary. A
// narrowed vocabulary means some excluded class stopped being reported — the
// exact regression this gate exists to catch.
//
// Exit codes: 0 = clean · 1 = violations · 2 = infrastructure error.
//
// Usage:
//   node scripts/lint-skill-routing-eligibility.mjs [--root <path>]
//
// NOT wired into any npm script or lint:gates chain in this slice — that wiring
// is a follow-up owner decision, not one made here.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Routing surface scanned by this gate, repo-relative (POSIX form). */
export const ROUTING_SURFACE_DIR = 'src/orchestra';

/** The ONE module allowed to decide skill routing eligibility. */
export const ADAPTER_RELATIVE_PATH = 'src/orchestra/routing-plan-adapter.ts';

/** Symbols that constitute skill-eligibility authority. */
export const ELIGIBILITY_AUTHORITY_SYMBOLS = Object.freeze([
  'validateSkillProfile',
  'deriveCanonicalSkillProfile',
  'deriveSkillProfileState',
  'deriveSkillRoutingState',
  'resolveSkillCatalog',
  'snapshotSkillCatalog',
]);

/** The typed rejection vocabulary the adapter must keep reporting. */
export const REQUIRED_REJECTION_REASONS = Object.freeze([
  'profile-missing',
  'disabled',
  'retired',
  'quarantined',
  'invalid-profile',
]);

/**
 * Blank out comments while preserving line count and column positions, so a
 * prose mention of an authority symbol never produces a false violation.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripComments(source) {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, ' '),
  );
  return withoutBlocks
    .split('\n')
    .map((line) => {
      const index = line.indexOf('//');
      return index === -1 ? line : line.slice(0, index);
    })
    .join('\n');
}

/**
 * List the TypeScript files on the routing surface, repo-relative, POSIX-form,
 * sorted — deterministic on every platform (Immutable Law 2).
 *
 * @param {string} root - repo root
 * @returns {string[]}
 */
export function listRoutingSurfaceFiles(root) {
  const surfaceRoot = join(root, ...ROUTING_SURFACE_DIR.split('/'));
  /** @type {string[]} */
  const files = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
      files.push(relative(root, full).split(sep).join('/'));
    }
  };
  walk(surfaceRoot);
  return files.sort();
}

/**
 * Find eligibility-authority call sites and imports in one non-adapter file.
 *
 * @param {string} relativePath
 * @param {string} source
 * @returns {Array<{ type: 'resolver-bypass', file: string, line: number, symbol: string, detail: string }>}
 */
export function scanFileForBypass(relativePath, source) {
  const findings = [];
  const lines = stripComments(source).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isImport = /^\s*import\b/.test(line) || /\bfrom\s+['"]/.test(line);
    for (const symbol of ELIGIBILITY_AUTHORITY_SYMBOLS) {
      const word = new RegExp(`\\b${symbol}\\b`);
      if (!word.test(line)) continue;
      const isCall = new RegExp(`\\b${symbol}\\s*\\(`).test(line);
      if (!isCall && !isImport) continue;
      findings.push({
        type: 'resolver-bypass',
        file: relativePath,
        line: i + 1,
        symbol,
        detail: isCall
          ? `calls ${symbol}() — skill eligibility is decided only in ${ADAPTER_RELATIVE_PATH}`
          : `imports ${symbol} — skill eligibility authority may not leave ${ADAPTER_RELATIVE_PATH}`,
      });
    }
  }
  return findings;
}

/**
 * Verify the adapter still declares every typed rejection reason.
 *
 * @param {string} source
 * @returns {Array<{ type: 'missing-typed-rejection', file: string, line: number, symbol: string, detail: string }>}
 */
export function checkRejectionVocabulary(source) {
  const body = stripComments(source);
  return REQUIRED_REJECTION_REASONS.filter((reason) => !body.includes(`'${reason}'`)).map(
    (reason) => ({
      type: 'missing-typed-rejection',
      file: ADAPTER_RELATIVE_PATH,
      line: 0,
      symbol: reason,
      detail: `typed rejection reason '${reason}' is no longer declared — that exclusion class would be silent again`,
    }),
  );
}

/**
 * Run the gate over a repo root.
 *
 * @param {string} root
 * @returns {{ ok: boolean, findings: Array<{ type: string, file: string, line: number, symbol: string, detail: string }>, scannedFiles: number }}
 */
export function runGate(root) {
  const surfaceRoot = join(root, ...ROUTING_SURFACE_DIR.split('/'));
  if (!existsSync(surfaceRoot) || !statSync(surfaceRoot).isDirectory()) {
    throw new Error(`routing surface not found: ${ROUTING_SURFACE_DIR}`);
  }
  const adapterPath = join(root, ...ADAPTER_RELATIVE_PATH.split('/'));
  if (!existsSync(adapterPath)) {
    throw new Error(`routing adapter not found: ${ADAPTER_RELATIVE_PATH}`);
  }

  const findings = [];
  const files = listRoutingSurfaceFiles(root);
  for (const file of files) {
    if (file === ADAPTER_RELATIVE_PATH) continue;
    findings.push(...scanFileForBypass(file, readFileSync(join(root, ...file.split('/')), 'utf-8')));
  }
  findings.push(...checkRejectionVocabulary(readFileSync(adapterPath, 'utf-8')));
  return { ok: findings.length === 0, findings, scannedFiles: files.length };
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === __filename;

if (isMain) {
  const argv = process.argv.slice(2);
  const rootFlag = argv.indexOf('--root');
  const root = rootFlag === -1 ? process.cwd() : resolve(argv[rootFlag + 1] ?? '.');
  try {
    const result = runGate(root);
    if (result.ok) {
      process.stdout.write(
        `[skill-routing-eligibility] CLEAN: ${result.scannedFiles} routing-surface file(s), no resolver bypass\n`,
      );
      process.exit(0);
    }
    for (const finding of result.findings) {
      const at = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
      process.stderr.write(`[skill-routing-eligibility] ${finding.type} ${at} — ${finding.detail}\n`);
    }
    process.stderr.write(
      `[skill-routing-eligibility] FAILURE: ${result.findings.length} violation(s)\n`,
    );
    process.exit(1);
  } catch (err) {
    process.stderr.write(
      `[skill-routing-eligibility] infrastructure error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  }
}
