import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DECKENT_DIR } from '../../core/constants.js';

const AGENTS_DIR = join(DECKENT_DIR, 'agents');

export function registerAgentsResource(server: McpServer): void {
  server.registerResource(
    'agents',
    'deckent://agents',
    {
      title: 'Agent Pool',
      description: 'Agent pool list from .deckent/agents/',
      mimeType: 'application/json',
    },
    async (uri) => {
      const root = process.cwd();
      const agentsDir = join(root, AGENTS_DIR);

      if (!existsSync(agentsDir)) {
        const text = JSON.stringify({ agents: [] });
        return { contents: [{ uri: uri.href, text, mimeType: 'application/json' }] };
      }

      const agents: unknown[] = [];
      let dirs: string[] = [];
      try {
        dirs = readdirSync(agentsDir);
      } catch { /* empty on read error */ }

      for (const dir of dirs) {
        const agentFile = join(agentsDir, dir, 'agent.json');
        if (existsSync(agentFile)) {
          try {
            const content = readFileSync(agentFile, 'utf-8');
            agents.push(JSON.parse(content));
          } catch { /* skip malformed files */ }
        }
      }

      const text = JSON.stringify({ agents });
      return { contents: [{ uri: uri.href, text, mimeType: 'application/json' }] };
    },
  );
}
