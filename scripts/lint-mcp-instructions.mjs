#!/usr/bin/env node
/**
 * lint-mcp-instructions.mjs
 *
 * Validates that DECKENT_MCP_INSTRUCTIONS in src/mcp/server.ts lists exactly
 * the same tools that are registered via server.registerTool() in src/mcp/tools/*.ts
 *
 * Exit codes:
 *   0 — OK, no drift
 *   1 — drift detected (missing or extra tool names)
 *   2 — file not found or parse error
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();
const SERVER_TS = join(PROJECT_ROOT, 'src', 'mcp', 'server.ts');
const TOOLS_DIR = join(PROJECT_ROOT, 'src', 'mcp', 'tools');

/**
 * Extract tool names listed in the ## Tools (N) section of DECKENT_MCP_INSTRUCTIONS.
 * Returns { count: number (from header), tools: string[] } or null on parse error.
 * @param {string} serverSource - raw content of server.ts
 */
function extractInstructionTools(serverSource) {
  // Find the DECKENT_MCP_INSTRUCTIONS template literal
  const instrStart = serverSource.indexOf('DECKENT_MCP_INSTRUCTIONS');
  if (instrStart === -1) return null;

  // Find the ## Tools (N) header
  const toolsHeaderMatch = serverSource.match(/## Tools \((\d+)\)/);
  if (!toolsHeaderMatch) return null;
  const declaredCount = parseInt(toolsHeaderMatch[1], 10);

  // Extract all lines matching "- deckent_xxx:" pattern inside the template literal
  const toolLinePattern = /^- (deckent_[a-z_]+):/gm;
  const tools = [];
  let match;
  while ((match = toolLinePattern.exec(serverSource)) !== null) {
    tools.push(match[1]);
  }

  return { count: declaredCount, tools };
}

/**
 * Scan all .ts files in src/mcp/tools/ and extract tool names from
 * server.registerTool('deckent_xxx', ...) calls.
 * @returns {string[]} sorted list of registered tool names
 */
function extractRegisteredTools() {
  let files;
  try {
    files = readdirSync(TOOLS_DIR).filter(f => f.endsWith('.ts'));
  } catch (err) {
    process.stderr.write(`lint-mcp-instructions: cannot read tools dir: ${err.message}\n`);
    process.exit(2);
  }

  const tools = new Set();
  // Match: server.registerTool( followed by optional whitespace/newline then 'deckent_xxx'
  const pattern = /server\.registerTool\(\s*['"`](deckent_[a-z_]+)['"`]/g;

  for (const file of files) {
    if (file === 'index.ts') continue; // index.ts just re-exports, no registerTool calls
    const content = readFileSync(join(TOOLS_DIR, file), 'utf-8');
    let m;
    while ((m = pattern.exec(content)) !== null) {
      tools.add(m[1]);
    }
    pattern.lastIndex = 0; // reset for next file
  }

  return [...tools].sort();
}

function main() {
  // Read server.ts
  let serverSource;
  try {
    serverSource = readFileSync(SERVER_TS, 'utf-8');
  } catch (err) {
    process.stderr.write(`lint-mcp-instructions: cannot read server.ts: ${err.message}\n`);
    process.exit(2);
  }

  const instrResult = extractInstructionTools(serverSource);
  if (!instrResult) {
    process.stderr.write('lint-mcp-instructions: could not parse DECKENT_MCP_INSTRUCTIONS\n');
    process.exit(2);
  }

  const { count: declaredCount, tools: instrTools } = instrResult;
  const registeredTools = extractRegisteredTools();

  const instrSet = new Set(instrTools);
  const regSet = new Set(registeredTools);

  const missingFromInstr = registeredTools.filter(t => !instrSet.has(t));
  const extraInInstr = instrTools.filter(t => !regSet.has(t));

  const actualCount = registeredTools.length;
  const instrCount = instrTools.length;

  let hasError = false;

  if (declaredCount !== actualCount) {
    process.stderr.write(
      `lint-mcp-instructions: ## Tools header says ${declaredCount} but ${actualCount} tools are registered\n`,
    );
    hasError = true;
  }

  if (instrCount !== actualCount) {
    process.stderr.write(
      `lint-mcp-instructions: instructions list ${instrCount} tools but ${actualCount} are registered\n`,
    );
    hasError = true;
  }

  if (missingFromInstr.length > 0) {
    process.stderr.write(
      `lint-mcp-instructions: registered but NOT in instructions (${missingFromInstr.length}):\n`,
    );
    for (const t of missingFromInstr) {
      process.stderr.write(`  - ${t}\n`);
    }
    hasError = true;
  }

  if (extraInInstr.length > 0) {
    process.stderr.write(
      `lint-mcp-instructions: in instructions but NOT registered (${extraInInstr.length}):\n`,
    );
    for (const t of extraInInstr) {
      process.stderr.write(`  + ${t}\n`);
    }
    hasError = true;
  }

  if (hasError) {
    process.exit(1);
  }

  process.stdout.write(`OK: ${actualCount} tools, ${instrCount} in instructions\n`);
  process.exit(0);
}

main();
