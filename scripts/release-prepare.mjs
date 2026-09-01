#!/usr/bin/env node
/**
 * release-prepare.mjs — fail-closed release-notes + version-triple prep (task 414-002, RC4B / REL-03/04)
 *
 * Sole responsibility: given `--version vX.Y.Z[-prerelease][+build]`, prevalidate and update the three
 * files .github/workflows/release.yml's "Verify release integrity" step (REL-01) demands agree
 * exactly — package.json, npm-shrinkwrap.json (both its top-level `.version` AND
 * `.packages[""].version`), and CHANGELOG.md (a new, exact-anchor-compatible `## [VERSION] — DATE`
 * section skeleton) — and nothing else. It replaces scripts/bump-version.sh, which only ever
 * touched package.json, silently dropped prerelease/build metadata, and created its own git tag.
 *
 * Publishing is OWNER-MANUAL (0.100.0 rebaseline, 2026-08-14): release.yml no longer runs any
 * automatic `npm publish` or GitHub Release — it only builds, validates and attests. This script
 * NEVER tags, NEVER pushes, and NEVER publishes; it only prepares the working tree. A human
 * commits, fills in the CHANGELOG skeleton with real notes, and — from a validated tree — runs the
 * owner-manual publish (`npm run build:all && npm run validate:publish && npm publish --access
 * public --ignore-scripts`; no `--provenance`, which needs a supported CI/trusted-publishing env).
 *
 * Atomicity model: every mutation is computed and *validated* in memory first (JSON parse/
 * stringify round-trip, version-triple-equality, and the exact-anchor CHANGELOG section-format
 * contract — the same contract release.yml's changelog extractor enforces at publish time). Files
 * are only written — each via write-to-`.tmp`-then-`renameSync` — once ALL validations pass. A
 * failure at any validation step writes nothing.
 *
 * Pure functions are exported for vitest unit testing; the CLI entry point
 * (`node scripts/release-prepare.mjs --version ...`) is guarded below, mirroring
 * validate-publish.mjs's testable-exports pattern.
 *
 * Exit codes: 0 = success (or `--dry-run` preview), 1 = validation/usage error.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(fileURLToPath(import.meta.url), '..');
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');

const USAGE =
  'Usage: node scripts/release-prepare.mjs --version <X.Y.Z[-prerelease][+build]> [--root <dir>] [--dry-run]';

// ─── Version parsing (official semver.org regex — full spec) ───────────────

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Strip an optional leading `v`/`V` and validate against full semver.
 * @param {string} raw
 * @returns {string} normalized version (no leading v)
 */
export function parseVersionArg(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('--version is required, e.g. --version 1.2.3 or --version v1.2.3-beta.1');
  }
  const stripped = raw.replace(/^[vV]/, '');
  if (!SEMVER_RE.test(stripped)) {
    throw new Error(
      `--version "${raw}" is not a valid semver (expected X.Y.Z[-prerelease][+build], e.g. 1.2.3 or 1.2.3-beta.1)`,
    );
  }
  return stripped;
}

// ─── package.json / npm-shrinkwrap.json version mutation ───────────────────

/**
 * @param {string} pkgJsonText
 * @param {string} version
 * @returns {string} updated package.json text (2-space indent, trailing newline)
 */
export function applyVersionToPackageJson(pkgJsonText, version) {
  const pkg = JSON.parse(pkgJsonText);
  pkg.version = version;
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Updates BOTH version fields npm lockfile-v3 carries for the root package: the top-level
 * `.version` and `.packages[""].version`. Leaves every nested dependency's `.version` untouched.
 * @param {string} shrinkwrapJsonText
 * @param {string} version
 * @returns {string} updated npm-shrinkwrap.json text
 */
export function applyVersionToNpmShrinkwrap(shrinkwrapJsonText, version) {
  const shrinkwrap = JSON.parse(shrinkwrapJsonText);
  shrinkwrap.version = version;
  if (
    shrinkwrap.packages &&
    typeof shrinkwrap.packages === 'object' &&
    shrinkwrap.packages[''] &&
    typeof shrinkwrap.packages[''] === 'object'
  ) {
    shrinkwrap.packages[''].version = version;
  }
  return `${JSON.stringify(shrinkwrap, null, 2)}\n`;
}

// ─── CHANGELOG.md exact-anchor section contract ─────────────────────────────
// Mirrors .github/workflows/release.yml's "Extract changelog for this version" step EXACTLY (same
// regex construction) — this IS the contract the release-notes parser consumes: singular heading,
// full-headed `## [VERSION]`, non-empty body before the next `## ` heading or EOF.

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} content
 * @param {string} version
 * @returns {{ ok: boolean, reason?: string, matchCount: number }}
 */
export function validateChangelogSectionFormat(content, version) {
  const headingRe = new RegExp(`^## \\[?v?${escapeRegExp(version)}\\]?(?=[\\]\\s]|$)`);
  const lines = content.split('\n');
  const matchedLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i])) matchedLines.push(i);
  }
  if (matchedLines.length === 0) {
    return { ok: false, reason: `no heading exact-matches version ${version}`, matchCount: 0 };
  }
  if (matchedLines.length > 1) {
    return {
      ok: false,
      reason: `${matchedLines.length} duplicate headings exact-match version ${version}`,
      matchCount: matchedLines.length,
    };
  }
  const start = matchedLines[0] + 1;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines.slice(start, end).join('\n').trim();
  if (!body) {
    return { ok: false, reason: `section for version ${version} is empty`, matchCount: 1 };
  }
  return { ok: true, matchCount: 1 };
}

/**
 * @param {string} version
 * @param {string} isoDate YYYY-MM-DD
 * @returns {string} new section text — no leading/trailing blank lines
 */
export function buildChangelogSectionSkeleton(version, isoDate) {
  return [
    `## [${version}] — ${isoDate}`,
    '',
    '### Added',
    '',
    '- TBD — fill in real release notes before tagging (see docs/release/release-checklist.md)',
    '',
    '---',
  ].join('\n');
}

/**
 * Inserts `sectionText` immediately before the first existing `## ` heading (i.e. right after the
 * file's role-banner), newest-first — matching this file's established ordering.
 * @param {string} existingContent
 * @param {string} sectionText
 * @returns {string}
 */
export function insertChangelogSection(existingContent, sectionText) {
  const headingMatch = existingContent.match(/\n(## )/);
  const insertAt = headingMatch ? headingMatch.index + 1 : existingContent.length;
  const before = existingContent.slice(0, insertAt).replace(/\n*$/, '\n\n');
  const after = existingContent.slice(insertAt);
  return `${before}${sectionText}\n\n${after}`;
}

// ─── Atomic file write ───────────────────────────────────────────────────────

function writeAtomic(path, content) {
  const tmpPath = `${path}.release-prepare.tmp`;
  writeFileSync(tmpPath, content, 'utf-8');
  renameSync(tmpPath, path);
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/**
 * @param {{ version: string, root?: string, dryRun?: boolean, today?: string }} opts
 *   `today` is injectable for hermetic tests (defaults to real UTC today, YYYY-MM-DD).
 * @returns {{ ok: boolean, error?: string, version?: string, changed?: string[], dryRun?: boolean }}
 */
export function prepareRelease(opts) {
  const root = opts.root ?? DEFAULT_ROOT;
  const version = parseVersionArg(opts.version);
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  const pkgPath = join(root, 'package.json');
  const shrinkwrapPath = join(root, 'npm-shrinkwrap.json');
  const changelogPath = join(root, 'CHANGELOG.md');
  for (const p of [pkgPath, shrinkwrapPath, changelogPath]) {
    if (!existsSync(p)) {
      return { ok: false, error: `missing required file: ${p}` };
    }
  }

  const pkgText = readFileSync(pkgPath, 'utf-8');
  const shrinkwrapText = readFileSync(shrinkwrapPath, 'utf-8');
  const changelogText = readFileSync(changelogPath, 'utf-8');

  const existingFormat = validateChangelogSectionFormat(changelogText, version);
  if (existingFormat.ok) {
    return {
      ok: false,
      error: `CHANGELOG.md already has a section for version ${version} — refusing to create a duplicate (use a different --version, or edit the existing section by hand)`,
    };
  }

  const newPkgText = applyVersionToPackageJson(pkgText, version);
  const newShrinkwrapText = applyVersionToNpmShrinkwrap(shrinkwrapText, version);
  const sectionText = buildChangelogSectionSkeleton(version, today);
  const newChangelogText = insertChangelogSection(changelogText, sectionText);

  // Self-check: the SAME triple-equality gate REL-01 enforces at tag-push time, verified here
  // BEFORE anything is written, plus the section-format contract. Validation failure aborts with
  // zero writes. Each individual replacement is atomic; an external process termination between
  // files can leave a partial triple, which REL-01 must reject rather than misreport as prepared.
  const pkgVersion = JSON.parse(newPkgText).version;
  const shrinkwrapVersion = JSON.parse(newShrinkwrapText).version;
  const shrinkwrapPackageVersion = JSON.parse(newShrinkwrapText).packages?.['']?.version;
  if (pkgVersion !== version
    || shrinkwrapVersion !== version
    || shrinkwrapPackageVersion !== version) {
    return {
      ok: false,
      error: `post-write version-triple-equality self-check failed: package.json=${pkgVersion} npm-shrinkwrap.json=${shrinkwrapVersion} npm-shrinkwrap.json#packages['']=${shrinkwrapPackageVersion} target=${version}`,
    };
  }
  const newFormat = validateChangelogSectionFormat(newChangelogText, version);
  if (!newFormat.ok) {
    return { ok: false, error: `CHANGELOG.md section-format self-check failed: ${newFormat.reason}` };
  }

  if (opts.dryRun) {
    return {
      ok: true,
      version,
      changed: [pkgPath, shrinkwrapPath, changelogPath],
      dryRun: true,
    };
  }

  writeAtomic(pkgPath, newPkgText);
  writeAtomic(shrinkwrapPath, newShrinkwrapText);
  writeAtomic(changelogPath, newChangelogText);

  return {
    ok: true,
    version,
    changed: [pkgPath, shrinkwrapPath, changelogPath],
  };
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

function runCli(cliArgs) {
  const versionIdx = cliArgs.indexOf('--version');
  const rootIdx = cliArgs.indexOf('--root');
  const dryRun = cliArgs.includes('--dry-run');
  const rawVersion = versionIdx >= 0 ? cliArgs[versionIdx + 1] : undefined;
  const root = rootIdx >= 0 ? cliArgs[rootIdx + 1] : undefined;

  if (!rawVersion) {
    console.error(USAGE);
    return 1;
  }

  let result;
  try {
    result = prepareRelease({ version: rawVersion, root, dryRun });
  } catch (err) {
    console.error(`❌ release-prepare failed: ${err.message}`);
    console.error(USAGE);
    return 1;
  }

  if (!result.ok) {
    console.error(`❌ release-prepare failed: ${result.error}`);
    return 1;
  }

  if (result.dryRun) {
    console.log(`📝 Dry-run: would update to ${result.version} in:`);
    for (const f of result.changed) console.log(`   ${f}`);
    console.log('\nRun without --dry-run to apply.');
    return 0;
  }

  console.log(`✅ release-prepare complete — ${result.version}`);
  for (const f of result.changed) console.log(`   updated: ${f}`);
  console.log(
    '\nThis script does NOT create git tags, push, or publish — publishing is owner-manual (0.100.0 rebaseline).',
  );
  console.log('Next steps:');
  console.log(`  1. Fill in the CHANGELOG.md [${result.version}] section with real release notes.`);
  console.log(
    `  2. git add package.json npm-shrinkwrap.json CHANGELOG.md && git commit -m "chore(release): prepare v${result.version}"`,
  );
  console.log('  3. Owner-manual publish from a validated tree (no automatic publish, no --provenance):');
  console.log('       npm run build:all && npm run validate:publish');
  console.log('       npm publish --access public --ignore-scripts');
  console.log('     The release.yml workflow only builds/validates/attests — it never publishes.');
  return 0;
}

const entryArg = process.argv[1] ?? '';
if (entryArg !== '' && fileURLToPath(import.meta.url) === resolve(entryArg)) {
  process.exitCode = runCli(process.argv.slice(2));
}
