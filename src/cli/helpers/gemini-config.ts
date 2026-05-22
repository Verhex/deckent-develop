// ─── Gemini CLI MCP Config Generator ────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const DECKENT_MCP_ENTRY = {
  command: 'deckent-mcp',
  args: [] as string[],
  timeout: 600,
};

/**
 * Generate Gemini CLI MCP config. Creates/updates ~/.gemini/settings.json.
 * Preserves existing settings — only adds/updates mcpServers.deckent.
 */
export function generateGeminiConfig(_projectRoot: string): { settingsPath: string } {
  const settingsPath = join(homedir(), '.gemini', 'settings.json');

  upsertGeminiSettings(settingsPath);

  return { settingsPath };
}

/**
 * Read settings.json, merge the mcpServers.deckent entry, and write back.
 * If the file does not exist it is created with just the deckent entry.
 */
function upsertGeminiSettings(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let settings: Record<string, unknown> = {};

  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        settings = parsed as Record<string, unknown>;
      }
    } catch {
      // Invalid JSON — start fresh but preserve nothing
      settings = {};
    }
  }

  // Ensure mcpServers object exists
  if (
    typeof settings['mcpServers'] !== 'object' ||
    settings['mcpServers'] === null ||
    Array.isArray(settings['mcpServers'])
  ) {
    settings['mcpServers'] = {};
  }

  const mcpServers = settings['mcpServers'] as Record<string, unknown>;
  mcpServers['deckent'] = { ...DECKENT_MCP_ENTRY };

  writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}
