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
export function loadMcpServers(root: string): McpServersMap {
  const user = readMcpJson(join(homedir(), '.deckent', 'mcp.json'));
  const project = readMcpJson(join(root, '.mcp.json'));
  const local = readMcpJson(join(root, '.mcp.local.json'));

  const merged: McpServersMap = { ...user, ...project, ...local };

  return interpolateConfig(merged, root);
}
