import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { interpolateConfig } from '../core/deck-interpolation.js';
import type { McpServerDef } from './types.js';

export type McpServersMap = Record<string, McpServerDef>;

function readMcpJson(filePath: string): McpServersMap {
  if (!existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if ('mcpServers' in obj && typeof obj['mcpServers'] === 'object' && obj['mcpServers'] !== null) {
        return obj['mcpServers'] as McpServersMap;
      }
      return obj as McpServersMap;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Load MCP servers from 3-scope config and merge with precedence
 * local > project > user (ADR-004 pattern).
 *
 * Scopes:
 *   - user    : ~/.deckent/mcp.json  (global, shared across projects)
 *   - project : {root}/.mcp.json     (git-tracked, shared with team)
 *   - local   : {root}/.mcp.local.json (personal/secret, gitignored)
 *
 * Secrets in env/headers values are resolved via .deck interpolation (AS-2).
 */
export interface LoadMcpServersOptions {
  /**
   * Include the git-tracked project scope (`<root>/.mcp.json`). REPL-575 K1-C
   * smart-split: the operator's OWN scopes (user `~/.deckent/mcp.json` + gitignored
   * personal `.mcp.local.json`) are always trusted, but a git-tracked `.mcp.json`
   * travels with the repo (a clone you didn't author) and is opt-in behind
   * `mcp_client_enabled`. Default `true` — every non-REPL caller sees all scopes,
   * exactly as before. Set `false` to load only the trusted scopes.
   */
  includeProjectScope?: boolean;
}

export function loadMcpServers(root: string, opts: LoadMcpServersOptions = {}): McpServersMap {
  const user = readMcpJson(join(homedir(), '.deckent', 'mcp.json'));
  const project = readMcpJson(join(root, '.mcp.json'));
  const local = readMcpJson(join(root, '.mcp.local.json'));

  // Precedence local > project > user (ADR-004). When project scope is excluded
  // (smart-split, flag off) the git-tracked map drops out entirely, keeping the
  // operator's own user+local servers.
  const merged: McpServersMap = opts.includeProjectScope === false
    ? { ...user, ...local }
    : { ...user, ...project, ...local };

  return interpolateConfig(merged, root);
}
