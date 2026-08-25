#!/usr/bin/env node
// scripts/lint-cli-mcp-parity.mjs
//
// Gate (baseline-ratchet): scans src/cli/commands/*.ts for CLI command names
// and src/mcp/tools/*.ts for MCP tool registrations, then compares the parity
// gaps against scripts/cli-mcp-parity-baseline.json.
//
// Exit 1 only on NEW gaps (a CLI command or MCP tool added without its
// counterpart and without a baseline entry). Known-intentional gaps (chat,
// dashboard, serve, ...) live in the baseline. Stale baseline entries warn.
// Regenerate the baseline after an intentional change:
//   node scripts/lint-cli-mcp-parity.mjs --update-baseline
// Wired into `npm run lint` via lint:gates (W7 terfi, 2026-07-07).
//
// Description-key parity (559-005): beyond command-name parity above, also
// checks that every `surface: 'cli-shared'` entry in
// src/mcp/tools/description-catalog.ts's MCP_TOOL_DESCRIPTION_BINDINGS
// declares a `key` that is genuinely the description key some CLI command
// reads via `.description(getMessage('<key>', ...))` — catching key
// drift/typo/rename desync between the two surfaces sharing one sentence
// (559-002 CLI catalog + 559-004 MCP binding table). Same baseline-ratchet
// discipline as the command-name gaps: new gaps fail, known ones live in
// `descriptionKeyGaps` in the same baseline file.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── 1. Scan CLI commands ──────────────────────────────────────────────────────

const cliDir = join(root, 'src', 'cli', 'commands');
const cliFiles = readdirSync(cliDir).filter((f) => f.endsWith('.ts'));

/** @type {Map<string, string>} commandName → filename */
const cliCommands = new Map();

for (const file of cliFiles) {
  const content = readFileSync(join(cliDir, file), 'utf8');

  // Match `program` (the register-function parameter) followed immediately or
  // on the next line by `.command('name ...')`.  Uses \s* so both
  //   program.command('foo')          and
  //   program\n    .command('foo')    are captured.
  // We do NOT match sub-commands like `agentCmd.command(...)`.
  const re = /\bprogram\s*\.command\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    // Strip argument/option specs: 'command <arg> [opt]' → 'command'
    const baseName = m[1].split(/\s+/)[0];
    if (!cliCommands.has(baseName)) {
      cliCommands.set(baseName, file);
    }
  }
}

// Also capture the multi-line pattern: `program\n  .command('foo')`
for (const file of cliFiles) {
  const content = readFileSync(join(cliDir, file), 'utf8');
  const re = /\bprogram\s*\n\s*\.command\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const baseName = m[1].split(/\s+/)[0];
    if (!cliCommands.has(baseName)) {
      cliCommands.set(baseName, file);
    }
  }
}

// ── 2. Scan MCP tools ─────────────────────────────────────────────────────────

const mcpToolsDir = join(root, 'src', 'mcp', 'tools');
const mcpFiles = readdirSync(mcpToolsDir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');

/** @type {Map<string, string>} toolName → filename */
const mcpTools = new Map();

for (const file of mcpFiles) {
  const content = readFileSync(join(mcpToolsDir, file), 'utf8');
  // Match server.registerTool(\n?  'deckent_name'
  const re = /registerTool\(\s*\n?\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1];
    if (name.startsWith('deckent_')) {
      mcpTools.set(name, file);
    }
  }
}

// ── 2b. Parse MCP tool description-key bindings (559-005) ────────────────────

/** @typedef {{ tool: string, key: string, surface: string }} DescriptionBinding */

const descriptionCatalogPath = join(root, 'src', 'mcp', 'tools', 'description-catalog.ts');
const descriptionCatalogContent = readFileSync(descriptionCatalogPath, 'utf8');

/** @type {DescriptionBinding[]} */
const descriptionBindings = [];
{
  const re = /(deckent_[a-zA-Z0-9_]+):\s*\{\s*key:\s*'([^']+)',\s*surface:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(descriptionCatalogContent)) !== null) {
    descriptionBindings.push({ tool: m[1], key: m[2], surface: m[3] });
  }
}

// Keys actually used as a real `.description(getMessage('<key>', ...))` call
// site across the CLI surface — the single source of truth a cli-shared
// binding's `key` must match.
const usedDescriptionKeys = new Set();
{
  const re = /\.description\(\s*getMessage\(\s*'([^']+)'/g;
  for (const file of [join(root, 'src', 'cli', 'index.ts'), ...cliFiles.map((f) => join(cliDir, f))]) {
    const content = readFileSync(file, 'utf8');
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) usedDescriptionKeys.add(m[1]);
  }
}

// cli-shared bindings whose declared key is not actually read by any CLI
// command's own `.description(getMessage(...))` call — key drift.
const descriptionKeyGaps = descriptionBindings
  .filter((b) => b.surface === 'cli-shared' && !usedDescriptionKeys.has(b.key))
  .map((b) => `${b.tool}:${b.key}`)
  .sort();

// ── 3. Build parity map ───────────────────────────────────────────────────────

/**
 * Normalize a CLI command name to a form comparable to MCP tool suffixes.
 * Replaces hyphens with underscores (set-directives → set_directives).
 * @param {string} name
 * @returns {string}
 */
function normCli(name) {
  return name.replace(/-/g, '_').toLowerCase();
}

/**
 * Strip the deckent_ prefix from an MCP tool name.
 * @param {string} name
 * @returns {string}
 */
function normMcp(name) {
  return name.replace(/^deckent_/, '');
}

// Build a normalized CLI set for quick reverse-lookup
const cliNorm = new Map(); // normalized → original CLI name
for (const [cmd] of cliCommands) {
  cliNorm.set(normCli(cmd), cmd);
}

// Build a normalized MCP set
const mcpNorm = new Map(); // normalized suffix → original deckent_name
for (const [tool] of mcpTools) {
  mcpNorm.set(normMcp(tool), tool);
}

/**
 * Try to find a matching MCP tool for a CLI command.
 * Strategies (in order):
 *   1. Exact match after normalization          analyze      ↔ analyze
 *   2. CLI is a prefix of MCP suffix            analyze      ↔ analyze_project
 *   3. MCP suffix is a prefix of CLI name       nervous      ↔ nervous_subscribe (partial)
 * @param {string} cliName
 * @returns {string|null} matching deckent_* tool name or null
 */
function findMcpForCli(cliName) {
  const n = normCli(cliName);
  if (mcpNorm.has(n)) return mcpNorm.get(n);
  for (const [mcpSuffix, mcpFull] of mcpNorm) {
    if (mcpSuffix.startsWith(n + '_') || n.startsWith(mcpSuffix + '_')) {
      return mcpFull;
    }
  }
  return null;
}

/**
 * Try to find a matching CLI command for an MCP tool.
 * @param {string} mcpName  full deckent_* name
 * @returns {string|null} matching CLI command name or null
 */
function findCliForMcp(mcpName) {
  const n = normMcp(mcpName);
  if (cliNorm.has(n)) return cliNorm.get(n);
  for (const [cliNormKey, cliFull] of cliNorm) {
    if (n.startsWith(cliNormKey + '_') || cliNormKey.startsWith(n + '_')) {
      return cliFull;
    }
  }
  return null;
}

// CLI commands with no matching MCP tool
const cliOnly = [];
for (const [cmd, file] of cliCommands) {
  if (!findMcpForCli(cmd)) {
    cliOnly.push({ cmd, file });
  }
}
cliOnly.sort((a, b) => a.cmd.localeCompare(b.cmd));

// MCP tools with no matching CLI command
const mcpOnly = [];
for (const [tool, file] of mcpTools) {
  if (!findCliForMcp(tool)) {
    mcpOnly.push({ tool, file });
  }
}
mcpOnly.sort((a, b) => a.tool.localeCompare(b.tool));

// ── 4. Baseline (accepted, known-intentional gaps) ────────────────────────────

const BASELINE_PATH = join(__dirname, 'cli-mcp-parity-baseline.json');

if (process.argv.includes('--update-baseline')) {
  const existing = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : {};
  const baseline = {
    _comment:
      'Accepted CLI↔MCP parity gaps. lint-cli-mcp-parity.mjs fails only on gaps NOT listed here. Regenerate: node scripts/lint-cli-mcp-parity.mjs --update-baseline',
    cliOnly: cliOnly.map((x) => x.cmd),
    mcpOnly: mcpOnly.map((x) => x.tool),
    descriptionKeyGaps,
    // Authority intent is hand-authored policy, not a discovered gap. Preserve
    // it during mechanical baseline refreshes so --update-baseline cannot erase
    // the reason an operator-only mutation surface exists.
    intentionalCliAuthority: existing.intentionalCliAuthority ?? {},
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(
    `✓ baseline updated: ${baseline.cliOnly.length} CLI-only + ${baseline.mcpOnly.length} MCP-only `
    + `+ ${baseline.descriptionKeyGaps.length} description-key gap(s) accepted (${BASELINE_PATH})`,
  );
  process.exit(0);
}

let baseline = { cliOnly: [], mcpOnly: [], descriptionKeyGaps: [], intentionalCliAuthority: {} };
if (existsSync(BASELINE_PATH)) {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  // Older baseline files predate 559-005 and won't carry this field.
  baseline.descriptionKeyGaps ??= [];
  baseline.intentionalCliAuthority ??= {};
} else {
  console.error(`✗ baseline missing: ${BASELINE_PATH} — run with --update-baseline first`);
  process.exit(1);
}

const newCliOnly = cliOnly.filter((x) => !baseline.cliOnly.includes(x.cmd));
const newMcpOnly = mcpOnly.filter((x) => !baseline.mcpOnly.includes(x.tool));
const staleCli = baseline.cliOnly.filter((name) => !cliOnly.some((x) => x.cmd === name));
const staleMcp = baseline.mcpOnly.filter((name) => !mcpOnly.some((x) => x.tool === name));

const newDescriptionKeyGaps = descriptionKeyGaps.filter((g) => !baseline.descriptionKeyGaps.includes(g));
const staleDescriptionKeyGaps = baseline.descriptionKeyGaps.filter((g) => !descriptionKeyGaps.includes(g));

// Operator-only mutation intent is stronger than an ordinary accepted gap:
// it must remain a real CLI-only command, carry the catalogued risk/capability,
// and must fail (rather than merely warn as stale) if an MCP counterpart appears.
const authorityIntentErrors = [];
const registryContent = readFileSync(join(root, 'src', 'core', 'command-registry.ts'), 'utf8');
for (const [name, intent] of Object.entries(baseline.intentionalCliAuthority)) {
  if (!baseline.cliOnly.includes(name) || !cliCommands.has(name) || findMcpForCli(name)) {
    authorityIntentErrors.push(`${name}: must remain a registered, baselined CLI-only command`);
  }
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const catalogEntry = new RegExp(
    `entry\\('${escapedName}',\\s*'[^']+',\\s*'([^']+)',\\s*'([^']+)',\\s*\\[([^\\]]*)\\]`,
    'u',
  ).exec(registryContent);
  if (!catalogEntry || catalogEntry[1] !== intent.risk
    || catalogEntry[2] !== 'providers' || catalogEntry[3].replace(/\s/gu, '') !== "'cli'") {
    authorityIntentErrors.push(`${name}: registry must catalog ${intent.risk}/providers/CLI-only authority`);
  }
  if (intent.capability !== 'provider-observation-migration'
    || intent.mcpPolicy !== 'forbidden'
    || JSON.stringify(intent.operations) !== JSON.stringify(['prepare', 'decide', 'apply'])) {
    authorityIntentErrors.push(`${name}: prepare/decide/apply MCP prohibition intent drifted`);
  }
}

// ── 5. Report ─────────────────────────────────────────────────────────────────

const W = 64;
const line = '─'.repeat(W);

console.log('');
console.log('┌' + '─'.repeat(W) + '┐');
console.log('│' + ' CLI ↔ MCP Parity Gate (baseline-ratchet)'.padEnd(W) + '│');
console.log('└' + '─'.repeat(W) + '┘');
console.log('');
console.log(`  CLI commands scanned : ${cliCommands.size}`);
console.log(`  MCP tools scanned    : ${mcpTools.size}`);
console.log(`  cli-shared description bindings scanned : ${descriptionBindings.filter((b) => b.surface === 'cli-shared').length}`);
console.log('');
console.log(line);

console.log(
  `  Known-intentional gaps (baseline): ${baseline.cliOnly.length} CLI-only + ${baseline.mcpOnly.length} MCP-only `
  + `+ ${baseline.descriptionKeyGaps.length} description-key`,
);
console.log('');
console.log(line);

if (newCliOnly.length === 0 && newMcpOnly.length === 0 && newDescriptionKeyGaps.length === 0 && authorityIntentErrors.length === 0) {
  console.log('  ✓ No NEW parity gaps beyond the accepted baseline.');
} else {
  if (newCliOnly.length > 0) {
    console.log(`  ✗ NEW CLI-only (no matching MCP tool) — ${newCliOnly.length} item(s):`);
    console.log('');
    for (const { cmd, file } of newCliOnly) {
      console.log(`    cli:${cmd.padEnd(26)}  ← ${file}`);
    }
    console.log('');
  }
  if (newMcpOnly.length > 0) {
    console.log(`  ✗ NEW MCP-only (no matching CLI command) — ${newMcpOnly.length} item(s):`);
    console.log('');
    for (const { tool, file } of newMcpOnly) {
      console.log(`    mcp:${tool.padEnd(32)}  ← ${file}`);
    }
    console.log('');
  }
  if (newDescriptionKeyGaps.length > 0) {
    console.log(`  ✗ NEW description-key gap (cli-shared key not read by any CLI command) — ${newDescriptionKeyGaps.length} item(s):`);
    console.log('');
    for (const gap of newDescriptionKeyGaps) {
      console.log(`    ${gap}`);
    }
    console.log('');
    console.log('  MCP_TOOL_DESCRIPTION_BINDINGS declares a cli-shared key that no CLI');
    console.log('  command actually reads via .description(getMessage(\'<key>\', ...)) —');
    console.log('  fix the key drift in src/mcp/tools/description-catalog.ts, or if');
    console.log('  intentional, accept it below.');
  }
  if (authorityIntentErrors.length > 0) {
    console.log(`  ✗ CLI authority intent violation — ${authorityIntentErrors.length} item(s):`);
    for (const error of authorityIntentErrors) console.log(`    ${error}`);
    console.log('');
  }
  console.log('  Add the missing counterpart, or if the gap is intentional,');
  console.log('  accept it: node scripts/lint-cli-mcp-parity.mjs --update-baseline');
}

if (staleCli.length > 0 || staleMcp.length > 0 || staleDescriptionKeyGaps.length > 0) {
  console.log('');
  console.log(
    `  ⚠ Stale baseline entries (gap no longer exists): ${[...staleCli, ...staleMcp, ...staleDescriptionKeyGaps].join(', ')}`,
  );
  console.log('    Prune with: node scripts/lint-cli-mcp-parity.mjs --update-baseline');
}

console.log('');
console.log(line);
console.log('');

// Assigning exitCode lets piped stdout/stderr drain. `process.exit(...)` can
// truncate the short reports produced by hermetic fixtures and CI wrappers.
process.exitCode = newCliOnly.length > 0 || newMcpOnly.length > 0
  || newDescriptionKeyGaps.length > 0 || authorityIntentErrors.length > 0 ? 1 : 0;
