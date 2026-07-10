#!/usr/bin/env node
// scripts/lint-i18n-hardcode.mjs
//
// Gate: scans src/cli/commands/*.ts (flat) and src/desktop/src/main/**/*.ts
// (recursive) for likely hardcoded user-facing strings — console.log /
// console.error / console.warn / console.info / process.stdout.write /
// process.stderr.write calls that contain natural-language literals instead
// of routing through getMessage(key, lang) from src/cli/helpers/messages.ts
// (CLI side) or the t(key) bridge in src/desktop/src/main/i18n.ts (desktop
// side — DESK-1, born-496).
//
// Exits 1 when a hit is found. Wired into `npm run lint` via lint:gates
// (W7 terfi, 2026-07-07 — enforces the i18n-FIRST quality bar in CLAUDE.md;
// desktop-glob added born-601/394-003).
//
// ALLOWLIST doubles as the ratchet baseline: entries are either genuine
// heuristic false positives OR pre-existing grandfathered debt (e.g. the
// desktop-main internal diagnostic console.warn calls found when the
// desktop-glob was added — dev-console logging, not rendered UI, out of this
// gate's write scope to fix). Either way the effect is the same ratchet: a
// hit matching an ALLOWLIST entry is suppressed, any NEW hit still fails.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Minimum word length to consider a string "natural language".
 * Strings shorter than this (after trimming) are likely technical tokens.
 */
const MIN_WORD_LENGTH = 4;

/**
 * Minimum number of letters in a string to be considered natural language.
 * Filters out pure-symbol/punctuation strings.
 */
const MIN_LETTER_COUNT = 4;

/**
 * Output calls to scan. We capture the first string argument (quoted or
 * template literal) that immediately follows the opening parenthesis.
 */
const OUTPUT_CALLS = [
  'console\\.log',
  'console\\.error',
  'console\\.warn',
  'console\\.info',
  'process\\.stdout\\.write',
  'process\\.stderr\\.write',
];

// ── Patterns ──────────────────────────────────────────────────────────────────

// Matches: console.log('...'), console.log("..."), console.log(`...`)
// Group 1: the string contents (inside the first quote)
const SINGLE_QUOTE_RE = new RegExp(
  `(?:${OUTPUT_CALLS.join('|')})\\s*\\(\\s*'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)'`,
  'g'
);
const DOUBLE_QUOTE_RE = new RegExp(
  `(?:${OUTPUT_CALLS.join('|')})\\s*\\(\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`,
  'g'
);
// Template literals: capture content between backticks (simplified — no nested backticks)
const TEMPLATE_RE = new RegExp(
  `(?:${OUTPUT_CALLS.join('|')})\\s*\\(\\s*\`([^\`]*)\``,
  'g'
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the string looks like natural-language user-facing text.
 * Rejects purely technical strings (ANSI escapes, whitespace-only,
 * interpolation-only, very short, all-symbol).
 *
 * @param {string} raw  string content as it appears inside the quotes
 * @returns {boolean}
 */
function isNaturalLanguage(raw) {
  // Strip ANSI escape sequences
  const stripped = raw
    .replace(/\\x1[bB][^m]*m/g, '')   // \x1b[...m  (escaped form)
    .replace(/\x1b\[[^m]*m/g, '')     // actual ESC sequences
    .replace(/\\u001[bB][^m]*m/g, '') //  form
    .replace(/\\n|\\r|\\t/g, ' ')     // common control escapes
    .replace(/\$\{[^}]*\}/g, '')      // strip template interpolations
    .trim();

  if (stripped.length < MIN_WORD_LENGTH) return false;

  // Count letter characters
  const letters = (stripped.match(/[a-zA-Z]/g) ?? []).length;
  if (letters < MIN_LETTER_COUNT) return false;

  // Must contain at least one "word" (2+ consecutive letters)
  if (!/[a-zA-Z]{2,}/.test(stripped)) return false;

  // Skip strings that are purely JSON-like or code tokens
  if (/^[\{\}\[\]<>\/\\|:]+$/.test(stripped)) return false;

  return true;
}

/**
 * Given file contents and a line offset for a regex match, return the 1-based
 * line number of that match.
 *
 * @param {string} content
 * @param {number} matchIndex character index of the match
 * @returns {number}
 */
function lineNumberOf(content, matchIndex) {
  return content.slice(0, matchIndex).split('\n').length;
}

// ── Scan targets ──────────────────────────────────────────────────────────────

/**
 * Recursively collect `.ts` file paths under `dir` (skips node_modules and
 * `.d.ts`). Mirrors the collector convention in scripts/lint-no-spawnsync.mjs.
 * @param {string} dir
 * @param {string[]} [results]
 * @returns {string[]}
 */
function collectTsFilesRecursive(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectTsFilesRecursive(full, results);
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) results.push(full);
  }
  return results;
}

const cliDir = join(root, 'src', 'cli', 'commands');
const desktopMainDir = join(root, 'src', 'desktop', 'src', 'main');

// CLI side stays a FLAT, non-recursive scan — identical to prior behavior
// (a subdirectory like src/cli/commands/init-templates/ is not descended into).
const cliFiles = readdirSync(cliDir)
  .filter((f) => f.endsWith('.ts'))
  .sort()
  .map((f) => ({ filePath: join(cliDir, f), relPath: `src/cli/commands/${f}` }));

// Desktop main side is a RECURSIVE scan (src/desktop/src/main/**/*.ts).
const desktopFiles = collectTsFilesRecursive(desktopMainDir)
  .sort()
  .map((filePath) => ({ filePath, relPath: relative(root, filePath).replace(/\\/g, '/') }));

const scanTargets = [...cliFiles, ...desktopFiles];

// ── Scan ──────────────────────────────────────────────────────────────────────

/** @type {Array<{file: string, line: number, call: string, text: string}>} */
const hits = [];

for (const { filePath, relPath } of scanTargets) {
  const content = readFileSync(filePath, 'utf8');

  /**
   * Classify and record a hit if the string is natural language.
   * @param {RegExp} re
   * @param {string} label  short label for the output call type
   */
  const scanRe = (re, label) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const raw = m[1];
      if (!isNaturalLanguage(raw)) continue;

      const lineNo = lineNumberOf(content, m.index);
      const lineContent = content.split('\n')[lineNo - 1] ?? '';

      // Skip lines that also call getMessage (allowed: already i18n-routed)
      if (lineContent.includes('getMessage')) continue;

      // Truncate display text to 60 chars
      const displayText = raw.length > 60 ? raw.slice(0, 57) + '...' : raw;

      hits.push({
        file: relPath,
        line: lineNo,
        call: label,
        text: displayText.replace(/\n/g, '\\n'),
      });
    }
  };

  scanRe(SINGLE_QUOTE_RE, 'single-quote');
  scanRe(DOUBLE_QUOTE_RE, 'double-quote');
  scanRe(TEMPLATE_RE, 'template');
}

// ── Allowlist ─────────────────────────────────────────────────────────────────
// { file, contains, reason }. A hit is suppressed when hit.file === file AND
// hit.text includes `contains`. Two kinds of entry live here, both suppressed
// the same way — this list IS the new-vs-existing ratchet:
//   1. Heuristic false positives — the string isn't real user-facing text.
//   2. Grandfathered debt — a genuine pre-existing hit outside this gate's
//      write scope to fix (e.g. desktop-main internal console.warn diagnostics
//      found when the desktop-glob was added, born-601/394-003). Recorded here
//      with a reason so it stays visible instead of silently passing; any
//      OTHER hit (different file or text) still fails the gate.
// Keep entries justified — real user-facing strings belong in messages.ts.
const DEBT_REASON =
  'grandfathered debt (born-394-003 desktop-glob rollout) — internal [module] '
  + 'console.warn diagnostic, printed to the main-process stdout/devtools console '
  + 'for developers, never rendered as end-user UI text; out of this task\'s write '
  + 'scope (scripts/lint-i18n-hardcode.mjs only) to migrate onto the i18n.ts t(key) bridge';

const ALLOWLIST = [
  { file: 'src/desktop/src/main/auto-update.ts', contains: '[deckent-desktop] auto-update not yet wired', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/connection-profile-store.ts', contains: '[connection-profile-store] read failed for', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/connection-profile-store.ts', contains: '[connection-profile-store] ${filePath} is not valid JSON', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/connection-profile-store.ts', contains: '[connection-profile-store] ${filePath} does not contain a', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/connection-profile-store.ts', contains: '[connection-profile-store] dropped ${invalidDropped} sche', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/ipc-handlers.ts', contains: '[ipc-handlers] rejected untrusted sender on channel', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/ipc-handlers.ts', contains: '[ipc-handlers] RegisterIpcHandlersDeps.isLocalRendererUrl', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/security.ts', contains: '[security] blocked navigation to disallowed URL', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/security.ts', contains: '[security] blocked window.open to disallowed URL', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/security.ts', contains: '[security] blocked <webview> attach attempt', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/security.ts', contains: '[security] denied permission request', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/security.ts', contains: '[security] denied permission check', reason: DEBT_REASON },
];

const allowed = (hit) =>
  ALLOWLIST.some((a) => a.file === hit.file && hit.text.includes(a.contains));
const suppressed = hits.filter(allowed).length;
const gated = hits.filter((h) => !allowed(h));
hits.length = 0;
hits.push(...gated);

// Sort by file then line
hits.sort((a, b) => {
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  return a.line - b.line;
});

// ── Report ────────────────────────────────────────────────────────────────────

const W = 72;
const line = '─'.repeat(W);

console.log('');
console.log('┌' + '─'.repeat(W) + '┐');
console.log('│' + ' i18n Hardcode Lint (gate)'.padEnd(W) + '│');
console.log('└' + '─'.repeat(W) + '┘');
console.log('');
console.log(`  Files scanned  : ${scanTargets.length}  (${cliFiles.length} src/cli/commands + ${desktopFiles.length} src/desktop/src/main)`);
console.log(`  Hits (gated)   : ${hits.length}${suppressed ? `  (+${suppressed} allowlisted)` : ''}`);
console.log('');
console.log(line);

if (hits.length === 0) {
  console.log('  ✓ No hardcoded natural-language strings found in CLI commands or desktop main.');
} else {
  console.log(`  Hardcoded strings not routed through getMessage() — ${hits.length} item(s):\n`);

  let lastFile = '';
  for (const hit of hits) {
    if (hit.file !== lastFile) {
      if (lastFile !== '') console.log('');
      console.log(`  ${hit.file}`);
      lastFile = hit.file;
    }
    const loc = `${hit.line}`.padStart(4);
    console.log(`    line ${loc}  "${hit.text}"`);
  }
}

console.log('');
console.log(line);
if (hits.length > 0) {
  console.log('  ✗ GATE FAIL — route the string(s) through getMessage(key, lang)');
  console.log('    (src/cli/helpers/messages.ts, en+tr). Heuristic false positive?');
  console.log('    Add an ALLOWLIST entry in this script with a reason.');
} else {
  console.log('  ✓ i18n gate clean.');
}
console.log(line);
console.log('');

process.exit(hits.length > 0 ? 1 : 0);
