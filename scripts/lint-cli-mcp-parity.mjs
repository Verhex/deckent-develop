#!/usr/bin/env node
// scripts/lint-cli-mcp-parity.mjs
//
// Report-only: scans src/cli/commands/*.ts for CLI command names and
// src/mcp/tools/*.ts for MCP tool registrations, then prints a parity report
// showing commands without a matching MCP tool and vice versa.
//
// Always exits with code 0 — never blocks CI.
//
// TODO: Wire into `npm run lint` and CI after review + allowlist tuning
//       (define an explicit allowlist of known CLI-only / MCP-only items).

import { readFileSync, readdirSync } from 'node:fs';
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

// ── 4. Report ─────────────────────────────────────────────────────────────────

const W = 64;
const line = '─'.repeat(W);

console.log('');
console.log('┌' + '─'.repeat(W) + '┐');
console.log('│' + ' CLI ↔ MCP Parity Report (report-only)'.padEnd(W) + '│');
console.log('└' + '─'.repeat(W) + '┘');
console.log('');
console.log(`  CLI commands scanned : ${cliCommands.size}`);
console.log(`  MCP tools scanned    : ${mcpTools.size}`);
console.log('');
console.log(line);

if (cliOnly.length === 0) {
  console.log('  ✓ All CLI commands have a matching MCP tool.');
} else {
  console.log(`  CLI-only (no matching MCP tool) — ${cliOnly.length} item(s):`);
  console.log('');
  for (const { cmd, file } of cliOnly) {
    console.log(`    cli:${cmd.padEnd(26)}  ← ${file}`);
  }
}

console.log('');
console.log(line);

if (mcpOnly.length === 0) {
  console.log('  ✓ All MCP tools have a matching CLI command.');
} else {
  console.log(`  MCP-only (no matching CLI command) — ${mcpOnly.length} item(s):`);
  console.log('');
  for (const { tool, file } of mcpOnly) {
    console.log(`    mcp:${tool.padEnd(32)}  ← ${file}`);
  }
}

console.log('');
console.log(line);
console.log('  Note: Some gaps are expected — CLI-only commands (e.g. chat,');
console.log('  dashboard, serve) have no MCP equivalent by design. MCP-only');
console.log('  tools may be intentional. Review before enforcing as a gate.');
console.log(line);
console.log('');

process.exit(0);
