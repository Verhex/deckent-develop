import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';

export function registerConfigResource(server: McpServer): void {
  server.registerResource(
    'config',
    'deckent://config',
    {
      title: 'Deckent Config',
      description: 'Current project configuration: mode, language, projectName, brain_planning',
      mimeType: 'application/json',
    },
    async (uri) => {
      const root = process.cwd();
      const configPath = join(root, PROJECT_CONFIG_PATH);

      let text: string;
      if (!existsSync(configPath)) {
        text = JSON.stringify({ error: 'Config not found. Run deckent init first.' });
      } else {
        try {
          text = readFileSync(configPath, 'utf-8');
          JSON.parse(text); // validate JSON
        } catch {
          text = JSON.stringify({ error: 'Cannot parse config' });
        }
      }

      return {
        contents: [{ uri: uri.href, text, mimeType: 'application/json' }],
      };
    },
  );
}
