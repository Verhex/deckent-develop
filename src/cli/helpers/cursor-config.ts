// ─── Cursor MCP Config Generator ────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DECKENT_MCP_ENTRY = {
  command: 'deckent-mcp',
  args: [] as string[],
  timeout: 600,
};

const DECKENT_RULES_CONTENT = `---
description: Deckent AI Agent Orchestrator rules
globs: **/*
---
# Deckent Integration
This project uses Deckent for multi-agent sprint orchestration.
## Rules
- Read DIRECTIVES.md for current sprint goals
- Follow task scope boundaries
- Run tests before reporting completion
## Context
@DECKENT.md
`;

/**
 * Generate Cursor MCP config and rules. Creates .cursor/mcp.json and .cursor/rules/deckent.mdc.
 * Preserves existing config — only adds/updates deckent entries.
 */
export function generateCursorConfig(projectRoot: string): { mcpPath: string; rulesPath: string } {
  const mcpPath = join(projectRoot, '.cursor', 'mcp.json');
  const rulesPath = join(projectRoot, '.cursor', 'rules', 'deckent.mdc');

  upsertCursorMcp(mcpPath);
  upsertCursorRules(rulesPath);

  return { mcpPath, rulesPath };
}

/**
 * Read .cursor/mcp.json, merge the mcpServers.deckent entry, and write back.
 */
function upsertCursorMcp(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let config: Record<string, unknown> = {};

  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        config = parsed as Record<string, unknown>;
      }
    } catch {
      // Invalid JSON — start fresh
      config = {};
    }
  }

  // Ensure mcpServers object exists
  if (
    typeof config['mcpServers'] !== 'object' ||
    config['mcpServers'] === null ||
    Array.isArray(config['mcpServers'])
  ) {
    config['mcpServers'] = {};
  }

  const mcpServers = config['mcpServers'] as Record<string, unknown>;
  mcpServers['deckent'] = { ...DECKENT_MCP_ENTRY };

  writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Write the Cursor rules file for Deckent. Always overwrites — rules are canonical.
 */
function upsertCursorRules(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, DECKENT_RULES_CONTENT, 'utf-8');
}
