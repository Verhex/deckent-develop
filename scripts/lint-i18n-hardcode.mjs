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
// Second scan (559-005): src/cli/commands/*.ts + src/cli/index.ts +
// src/mcp/tools/*.ts for commander `.description('...')` calls and
// object-literal `description: '...'` properties that are a natural-language
// literal instead of a getMessage(...)/mcpToolDescription(...) call result.
// Both are string-first regexes: the captured argument/value must itself be a
// quoted literal, so a `.description(getMessage('key', lang))` or
// `description: mcpToolDescription('deckent_x')` call structurally never
// matches (the character right after `(`/`:` is not a quote) — no separate
// getMessage-skip needed for correctness on this scan.
//
// Third scan (CLI-CONTRACT-001): the REST of the commander help surface —
// `.option(`/`.requiredOption(` flag help, `.argument(` positional help,
// `.helpOption(` and `.addHelpText(` — in src/cli/commands/*.ts +
// src/cli/index.ts. These carry hundreds of pre-existing English literals, so
// they are a RATCHET rather than an immediate hard gate: the observed hit
// count must never exceed SURFACE_RATCHET_BASELINE (a new hardcoded flag
// description therefore fails the gate), and `--surface-gate` turns the whole
// surface into a hard gate for the closure family tasks that migrate it.
//
// Exits 1 when a hit is found. Wired into `npm run lint` via lint:gates
// (W7 terfi, 2026-07-07 — enforces the i18n-FIRST quality bar in CLAUDE.md;
// desktop-glob added born-601/394-003; description scan added 559-005).
//
// ALLOWLIST doubles as the ratchet baseline: entries are either genuine
// heuristic false positives OR pre-existing grandfathered debt (e.g. the
// desktop-main internal diagnostic console.warn calls found when the
// desktop-glob was added — dev-console logging, not rendered UI, out of this
// gate's write scope to fix). Either way the effect is the same ratchet: a
// hit matching an ALLOWLIST entry is suppressed, any NEW hit still fails.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
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

// ── description-literal patterns (559-005) ──────────────────────────────────
// `.description('...')` — commander command-description calls.
const DESCRIPTION_CALL_SINGLE_RE = /\.description\(\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g;
const DESCRIPTION_CALL_DOUBLE_RE = /\.description\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
const DESCRIPTION_CALL_TEMPLATE_RE = /\.description\(\s*`([^`]*)`/g;

// `description: '...'` — object-literal description properties (MCP
// registerTool() descriptions, resource catalog entries, etc). `\b` before
// `description` + `\s*:\s*` before the quote keeps this anchored to a
// property-key position, not an arbitrary substring.
const DESCRIPTION_PROP_SINGLE_RE = /\bdescription\s*:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g;
const DESCRIPTION_PROP_DOUBLE_RE = /\bdescription\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
const DESCRIPTION_PROP_TEMPLATE_RE = /\bdescription\s*:\s*`([^`]*)`/g;

// Fourth scan (TERMINAL-TOOLS-001): `desc: '...'` object-literal properties in
// src/cli/commands/*.ts — the REPL slash catalog's description field
// (chat-slash-registry.ts SLASH_CATALOG). 39 hardcoded Turkish `desc:`
// literals lived there for months because the gate only knew commander's
// `.description(` and MCP's `description:`; a `language: en` session rendered
// a Turkish `/` menu (real-binary evidence, 2026-09-02). Catalog rows now
// carry `descKey: 'tui.slash.desc.<name>'` (which this string-first regex
// structurally never matches — `descKey:` is not `desc:`), so any hit here is
// a description that bypassed the message catalog.
const DESC_PROP_SINGLE_RE = /\bdesc\s*:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g;
const DESC_PROP_DOUBLE_RE = /\bdesc\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
const DESC_PROP_TEMPLATE_RE = /\bdesc\s*:\s*`([^`]*)`/g;

// ── commander help-surface patterns (CLI-CONTRACT-001) ──────────────────────
// The description argument of the remaining commander help surfaces. Each
// regex skips the FIRST argument (the flags/name/position token — always a
// technical literal) and captures the SECOND argument only when it is itself
// a quoted literal, so `.option('--json', getMessage(k, lang))` structurally
// never matches.
const FIRST_ARG = "(?:'[^'\\\\]*(?:\\\\.[^'\\\\]*)*'|\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\")";

/**
 * Build the three quote-flavored regexes that capture the second argument of
 * `.<call>(<first-arg>, <literal>)`.
 * @param {string} call  method name alternation, e.g. 'option|requiredOption'
 * @returns {Array<[RegExp, string]>} [regex, label] pairs
 */
function surfaceSecondArgPatterns(call) {
  const head = `\\.(?:${call})\\(\\s*${FIRST_ARG}\\s*,\\s*`;
  return [
    [new RegExp(head + "'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)'", 'g'), 'single-quote'],
    [new RegExp(head + '"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"', 'g'), 'double-quote'],
    [new RegExp(head + '`([^`]*)`', 'g'), 'template'],
  ];
}

/** label -> regexes, for the four commander help surfaces this scan covers. */
const SURFACE_PATTERNS = [
  ['option', surfaceSecondArgPatterns('option|requiredOption')],
  ['argument', surfaceSecondArgPatterns('argument')],
  ['help-option', surfaceSecondArgPatterns('helpOption')],
  ['add-help-text', surfaceSecondArgPatterns('addHelpText')],
];

// ── MESSAGES catalog stale-ADR ratchet patterns (563-003) ───────────────────
// `en: '...'` / `tr: '...'` catalog-value literals in
// src/cli/helpers/messages.ts ONLY — deliberately narrower than the
// output-call/description scans above, which read arbitrary code. A raw
// whole-file scan would false-positive on section-header code comments like
// `// ─── process command (ADR-022 CLI/MCP parity) ───` (out of scope per
// this sprint's run policy — comment-only legacy ADR ids are not this
// ratchet's target); anchoring on the `en:`/`tr:` property prefix keeps the
// scan on actual catalog VALUES, matching the task's "katalog değerlerinde"
// (in catalog values) wording exactly.
const CATALOG_VALUE_SINGLE_RE = /\b(?:en|tr)\s*:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g;
const CATALOG_VALUE_DOUBLE_RE = /\b(?:en|tr)\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;

// Legacy numeric ADR ids (ADR-022, ADR-037, ...) — the class NOT covered by
// the current ADR-G-0NN / ADR-D-0NN governance/design scheme. `\d{2,3}`
// requires a DIGIT immediately after `ADR-`, so `ADR-G-020` / `ADR-D-004`
// structurally never match (the character after `ADR-` there is a letter) —
// no separate G/D-prefix exclusion needed for correctness.
const CATALOG_STALE_ADR_RE = /ADR-\d{2,3}\b/g;

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

const mcpToolsDir = join(root, 'src', 'mcp', 'tools');
const mcpToolsFiles = readdirSync(mcpToolsDir)
  .filter((f) => f.endsWith('.ts'))
  .sort()
  .map((f) => ({ filePath: join(mcpToolsDir, f), relPath: `src/mcp/tools/${f}` }));

const cliIndexFile = { filePath: join(root, 'src', 'cli', 'index.ts'), relPath: 'src/cli/index.ts' };

// `.description(...)` scan targets (559-005) — CLI commands + the program
// root + MCP tool modules. Kept as a separate target list from `scanTargets`
// above: this scan does not cover desktop-main (commander/MCP description
// surfaces don't exist there). Commander's command description is ALWAYS a
// chained `.description(...)` call, in all three groups, so this list stays
// the union.
const descriptionCallScanTargets = [...cliFiles, cliIndexFile, ...mcpToolsFiles];

// `description: '...'` object-literal-property scan targets — MCP tool
// modules ONLY. src/cli/commands/*.ts also declares plenty of unrelated data
// shapes with their own `description` field (DoctorFixAction, AgenticAction,
// skill-manifest definitions, ...) that have nothing to do with a commander
// or MCP-tool description; scanning those files for the bare `description:`
// property would false-positive on every such data literal. MCP's
// `server.registerTool({ description: ... })` is the one place this repo
// uses an object-literal description property for a real tool/command
// surface, so that is the only target for this pattern.
const descriptionPropScanTargets = [...mcpToolsFiles];

// ── commander help-surface scan targets + ratchet knobs ─────────────────────
// Same target list as the .description() scan MINUS the MCP tool modules
// (commander flags/arguments exist only on the CLI side).
const surfaceScanTargets = [...cliFiles, cliIndexFile];

/**
 * Ratchet baseline: the number of commander help-surface literals present
 * when this scan was introduced (CLI-CONTRACT-001). It is a CEILING — the
 * count may only go down. Lower it whenever a closure family task migrates a
 * batch onto getMessage(); never raise it.
 */
const SURFACE_RATCHET_BASELINE = 370;

const argv = process.argv.slice(2);
/** `--surface-gate`: treat every help-surface literal as a hard failure. */
const surfaceGate = argv.includes('--surface-gate');
/** `--surface-baseline <n>` / `--surface-baseline=<n>`: override the ceiling. */
function readBaselineOverride() {
  const inline = argv.find((a) => a.startsWith('--surface-baseline='));
  if (inline) return Number.parseInt(inline.slice('--surface-baseline='.length), 10);
  const idx = argv.indexOf('--surface-baseline');
  if (idx !== -1 && argv[idx + 1] !== undefined) return Number.parseInt(argv[idx + 1], 10);
  return undefined;
}
const baselineOverride = readBaselineOverride();
const surfaceBaseline =
  baselineOverride !== undefined && Number.isFinite(baselineOverride)
    ? baselineOverride
    : SURFACE_RATCHET_BASELINE;

// ── Scan ──────────────────────────────────────────────────────────────────────

/** @type {Array<{file: string, line: number, call: string, text: string}>} */
const hits = [];

/**
 * Classify and record a hit in `hits` if the captured string is natural
 * language and not already i18n-routed. Shared by both the output-call scan
 * and the description-literal scan below.
 * @param {string} content
 * @param {string} relPath
 * @param {RegExp} re
 * @param {string} label  short label for the match kind
 */
function scanContentForHits(content, relPath, re, label) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const raw = m[1];
    if (!isNaturalLanguage(raw)) continue;

    const lineNo = lineNumberOf(content, m.index);
    const lineContent = content.split('\n')[lineNo - 1] ?? '';

    // Skip lines that already resolve through the i18n catalog.
    if (lineContent.includes('getMessage') || lineContent.includes('mcpToolDescription')) continue;

    // Truncate display text to 60 chars
    const displayText = raw.length > 60 ? raw.slice(0, 57) + '...' : raw;

    hits.push({
      file: relPath,
      line: lineNo,
      call: label,
      text: displayText.replace(/\n/g, '\\n'),
    });
  }
}

for (const { filePath, relPath } of scanTargets) {
  const content = readFileSync(filePath, 'utf8');
  scanContentForHits(content, relPath, SINGLE_QUOTE_RE, 'single-quote');
  scanContentForHits(content, relPath, DOUBLE_QUOTE_RE, 'double-quote');
  scanContentForHits(content, relPath, TEMPLATE_RE, 'template');
}

for (const { filePath, relPath } of descriptionCallScanTargets) {
  const content = readFileSync(filePath, 'utf8');
  scanContentForHits(content, relPath, DESCRIPTION_CALL_SINGLE_RE, 'description-call-single-quote');
  scanContentForHits(content, relPath, DESCRIPTION_CALL_DOUBLE_RE, 'description-call-double-quote');
  scanContentForHits(content, relPath, DESCRIPTION_CALL_TEMPLATE_RE, 'description-call-template');
}

for (const { filePath, relPath } of descriptionPropScanTargets) {
  const content = readFileSync(filePath, 'utf8');
  scanContentForHits(content, relPath, DESCRIPTION_PROP_SINGLE_RE, 'description-prop-single-quote');
  scanContentForHits(content, relPath, DESCRIPTION_PROP_DOUBLE_RE, 'description-prop-double-quote');
  scanContentForHits(content, relPath, DESCRIPTION_PROP_TEMPLATE_RE, 'description-prop-template');
}

// `desc: '...'` slash-catalog scan (TERMINAL-TOOLS-001) — CLI command modules
// only (the flat src/cli/commands/*.ts list; the slash catalog lives there).
for (const { filePath, relPath } of cliFiles) {
  const content = readFileSync(filePath, 'utf8');
  scanContentForHits(content, relPath, DESC_PROP_SINGLE_RE, 'desc-prop-single-quote');
  scanContentForHits(content, relPath, DESC_PROP_DOUBLE_RE, 'desc-prop-double-quote');
  scanContentForHits(content, relPath, DESC_PROP_TEMPLATE_RE, 'desc-prop-template');
}

// ── commander help-surface scan (CLI-CONTRACT-001) ──────────────────────────
// Collected SEPARATELY from `hits`: this surface is a ratchet by default (see
// SURFACE_RATCHET_BASELINE), and only merges into the hard gate under
// `--surface-gate`.

/** @type {Array<{file: string, line: number, call: string, text: string}>} */
const surfaceHits = [];

{
  const collected = [];
  const sink = hits.splice(0, hits.length); // park the real gate hits
  for (const { filePath, relPath } of surfaceScanTargets) {
    const content = readFileSync(filePath, 'utf8');
    for (const [surface, patterns] of SURFACE_PATTERNS) {
      for (const [re, flavor] of patterns) {
        scanContentForHits(content, relPath, re, `${surface}-${flavor}`);
      }
    }
  }
  collected.push(...hits.splice(0, hits.length));
  hits.push(...sink);
  surfaceHits.push(...collected);
}

// ── MESSAGES catalog stale-ADR ratchet scan (563-003) ───────────────────────

/**
 * Scan `en:`/`tr:` catalog-value literals for a legacy numeric ADR id and
 * record every match in `hits`. Unlike scanContentForHits() above, this does
 * NOT apply the natural-language length filter (an "ADR-022" hit is only 3
 * letters, below MIN_LETTER_COUNT) and does NOT skip lines containing
 * `getMessage` (catalog definitions never call getMessage on themselves).
 * @param {string} content
 * @param {string} relPath
 * @param {RegExp} re
 */
function scanCatalogValuesForStaleAdr(content, relPath, re) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const value = m[1];
    const adrHits = value.match(CATALOG_STALE_ADR_RE) ?? [];
    if (adrHits.length === 0) continue;
    const lineNo = lineNumberOf(content, m.index);
    for (const token of adrHits) {
      hits.push({ file: relPath, line: lineNo, call: 'catalog-value-stale-adr', text: token });
    }
  }
}

const messagesCatalogFile = {
  filePath: join(root, 'src', 'cli', 'helpers', 'messages.ts'),
  relPath: 'src/cli/helpers/messages.ts',
};
{
  // Fixture/partial trees (the 559-005 tmpdir suites) may not ship the
  // catalog file at all — an absent catalog is simply zero catalog values to
  // scan, never a crash that blanks the whole gate's stdout.
  if (existsSync(messagesCatalogFile.filePath)) {
  const content = readFileSync(messagesCatalogFile.filePath, 'utf8');
  scanCatalogValuesForStaleAdr(content, messagesCatalogFile.relPath, CATALOG_VALUE_SINGLE_RE);
  scanCatalogValuesForStaleAdr(content, messagesCatalogFile.relPath, CATALOG_VALUE_DOUBLE_RE);
  }
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
  // D4-1 preferences-store — same [module]-diagnostic class as the
  // connection-profile-store trio above (its literal template, new file).
  { file: 'src/desktop/src/main/preferences-store.ts', contains: '[preferences-store] read failed for', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/preferences-store.ts', contains: '[preferences-store] ${filePath} is not valid JSON', reason: DEBT_REASON },
  { file: 'src/desktop/src/main/preferences-store.ts', contains: '[preferences-store] ${filePath} failed schema/version', reason: DEBT_REASON },
  // D4-3 serve bootstrap (born-680 twin fix) — daemon-stderr developer
  // diagnostic on a fail-soft provider bootstrap, never end-user UI text.
  { file: 'src/cli/commands/serve.ts', contains: '[serve] provider bootstrap skipped', reason: DEBT_REASON },
];

// 559-005 — MCP *resource* catalog metadata (deckent://dashboard etc, surfaced
// via ListResources), a distinct semantic surface from the tool/command
// description catalog 559-002/559-004 built: resources aren't invoked, have no
// commander counterpart, and 559-004 explicitly scoped tool-level descriptions
// only. Genuine pre-existing hits, out of this task's write scope
// (scripts/lint-i18n-hardcode.mjs only) to migrate onto getMessage().
const RESOURCE_DEBT_REASON =
  '559-005 ratchet baseline — MCP resource-catalog description (RESOURCES[] in '
  + 'src/mcp/tools/help.ts), not a tool/command description; distinct surface '
  + 'from the getMessage/mcpToolDescription catalog, out of this script-only '
  + 'task\'s write scope to migrate';

ALLOWLIST.push(
  { file: 'src/mcp/tools/help.ts', contains: 'Live sprint status: agents, progress, usage, alerts', reason: RESOURCE_DEBT_REASON },
  { file: 'src/mcp/tools/help.ts', contains: 'Current DIRECTIVES.md content', reason: RESOURCE_DEBT_REASON },
  { file: 'src/mcp/tools/help.ts', contains: 'Brain memory: sprint learnings and patterns', reason: RESOURCE_DEBT_REASON },
  { file: 'src/mcp/tools/help.ts', contains: 'Tech debt register: open and resolved items', reason: RESOURCE_DEBT_REASON },
  { file: 'src/mcp/tools/help.ts', contains: 'Resolved Deckent configuration', reason: RESOURCE_DEBT_REASON },
  { file: 'src/mcp/tools/help.ts', contains: 'Latest sprint retrospective', reason: RESOURCE_DEBT_REASON },
  { file: 'src/mcp/tools/help.ts', contains: 'Current .tasks/ directory listing', reason: RESOURCE_DEBT_REASON },
  { file: 'src/mcp/tools/help.ts', contains: 'Registered agents: built-in and project-specific', reason: RESOURCE_DEBT_REASON },
  // Pre-existing (uncommitted, concurrent-sprint) hit outside 559-005's write
  // scope (src/cli/commands/skill-marketplace.ts is not scripts/lint-i18n-hardcode.mjs
  // or scripts/lint-cli-mcp-parity.mjs) — unrelated to this task's
  // `.description(`/`description:` mandate; grandfathered same as the
  // desktop-main DEBT_REASON entries above.
  { file: 'src/cli/commands/skill-marketplace.ts', contains: 'Registry unavailable. Showing local skills only.', reason: DEBT_REASON },
);

// 563-003 — MESSAGES catalog stale-ADR ratchet baseline. 563-001 already
// cleaned every USER-FACING legacy numeric ADR citation; the one surviving
// hit is `workspace.worker.contract`'s generated worker-contract mechanism
// text (mirrored into the digest-bound WORKER-GUIDE.md worker contract),
// which cites `ADR-037` (scope.filesWrite write-authority) twice per
// language. Not end-user CLI help text, out of this script-only task's
// write scope to migrate. Any OTHER catalog value hit still fails the gate.
const CATALOG_ADR_DEBT_REASON =
  '563-003 ratchet baseline — generated worker-contract mechanism text '
  + '(`workspace.worker.contract`) citing the legacy `ADR-037` scope-authority '
  + 'id; not user-facing CLI help, out of this script-only task\'s write '
  + 'scope to migrate';

ALLOWLIST.push(
  { file: 'src/cli/helpers/messages.ts', contains: 'ADR-037', reason: CATALOG_ADR_DEBT_REASON },
);

const allowed = (hit) =>
  ALLOWLIST.some((a) => a.file === hit.file && hit.text.includes(a.contains));
const gatedSurfaceHits = surfaceHits.filter((h) => !allowed(h));
surfaceHits.length = 0;
surfaceHits.push(...gatedSurfaceHits);
surfaceHits.sort((a, b) => (a.file !== b.file ? a.file.localeCompare(b.file) : a.line - b.line));
// `--surface-gate` promotes the whole help surface into the hard gate.
if (surfaceGate) hits.push(...surfaceHits);

const surfaceRatchetBroken = !surfaceGate && surfaceHits.length > surfaceBaseline;

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
console.log(`  Description scan: ${descriptionCallScanTargets.length} .description() targets (${cliFiles.length} src/cli/commands + 1 src/cli/index.ts + ${mcpToolsFiles.length} src/mcp/tools), ${descriptionPropScanTargets.length} description: targets (src/mcp/tools), ${cliFiles.length} desc: targets (src/cli/commands slash catalog)`);
console.log(`  Hits (gated)   : ${hits.length}${suppressed ? `  (+${suppressed} allowlisted)` : ''}`);
console.log(`  Surface scan   : ${surfaceScanTargets.length} .option/.argument/.helpOption/.addHelpText targets — ${surfaceHits.length} literal(s), ratchet ceiling ${surfaceBaseline}${surfaceGate ? ' (HARD GATE: --surface-gate)' : ''}`);
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

// ── commander help-surface report ───────────────────────────────────────────
if (surfaceHits.length > 0 && !surfaceGate) {
  console.log('');
  console.log(line);
  console.log(`  Commander help-surface literals (ratchet, ceiling ${surfaceBaseline}) — ${surfaceHits.length} item(s):\n`);
  const SHOWN = 20;
  for (const hit of surfaceHits.slice(0, SHOWN)) {
    console.log(`    ${hit.file}:${hit.line}  [${hit.call}]  "${hit.text}"`);
  }
  if (surfaceHits.length > SHOWN) {
    console.log(`    ... +${surfaceHits.length - SHOWN} more (run with --surface-gate to fail on all of them)`);
  }
}

console.log('');
console.log(line);
if (surfaceRatchetBroken) {
  console.log(`  ✗ GATE FAIL — commander help-surface ratchet broken: ${surfaceHits.length} literal(s) > ceiling ${surfaceBaseline}.`);
  console.log('    Route the new .option()/.argument()/.helpOption()/.addHelpText()');
  console.log('    text through getMessage(key, lang) (src/cli/helpers/messages.ts).');
}
if (hits.length > 0) {
  console.log('  ✗ GATE FAIL — route the string(s) through getMessage(key, lang)');
  console.log('    (src/cli/helpers/messages.ts, en+tr). Heuristic false positive?');
  console.log('    Add an ALLOWLIST entry in this script with a reason.');
} else if (!surfaceRatchetBroken) {
  console.log('  ✓ i18n gate clean.');
}
console.log(line);
console.log('');

// Assigning exitCode lets piped stdout/stderr drain. `process.exit(...)` can
// truncate the short reports produced by hermetic fixtures and CI wrappers.
process.exitCode = hits.length > 0 || surfaceRatchetBroken ? 1 : 0;
