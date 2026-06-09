#!/usr/bin/env node
// scripts/lint-i18n-hardcode.mjs
//
// Report-only: scans src/cli/commands/*.ts for likely hardcoded user-facing
// strings — console.log / console.error / console.warn / process.stdout.write
// calls that contain natural-language literals instead of routing through
// getMessage(key, lang) from src/cli/helpers/messages.ts.
//
// Always exits with code 0 — never blocks CI.
//
// TODO: Wire into `npm run lint` and CI once the allowlist is tuned and
//       getMessage coverage is improved (follow-up sprint item).

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
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

// ── Scan ──────────────────────────────────────────────────────────────────────

const cliDir = join(root, 'src', 'cli', 'commands');
const files = readdirSync(cliDir).filter((f) => f.endsWith('.ts')).sort();

/** @type {Array<{file: string, line: number, call: string, text: string}>} */
const hits = [];

for (const file of files) {
  const filePath = join(cliDir, file);
  const content = readFileSync(filePath, 'utf8');
  const relPath = `src/cli/commands/${file}`;

  // Check if this file uses getMessage — if so, we still flag lines that DON'T
  const usesGetMessage = content.includes('getMessage');

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
console.log('│' + ' i18n Hardcode Lint Report (report-only)'.padEnd(W) + '│');
console.log('└' + '─'.repeat(W) + '┘');
console.log('');
console.log(`  Files scanned  : ${files.length}`);
console.log(`  Potential hits : ${hits.length}`);
console.log('');
console.log(line);

if (hits.length === 0) {
  console.log('  ✓ No hardcoded natural-language strings found in CLI commands.');
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
console.log('  Note: This is a heuristic scan — false positives exist.');
console.log('  Before enforcing as a CI gate, tune an allowlist and confirm');
console.log('  each hit genuinely requires getMessage() routing.');
console.log(line);
console.log('');

process.exit(0);
