import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { loadConfig, validatePartialConfig } from '../../core/config.js';
import { setNestedValue, getNestedValue } from '../../core/config-migration.js';
import { enrichResponse } from '../helpers/enrich.js';

export function registerConfigTool(server: McpServer): void {
  server.registerTool(
    'deckent_config',
    {
      title: 'Config Manager',
      description: 'Read, get, or set Deckent configuration values. action=read returns full resolved config, action=get returns a specific key, action=set writes a key-value pair.',
      inputSchema: z.object({
        action: z.enum(['read', 'get', 'set']).describe('Action to perform'),
        key: z.string().optional().describe('Config key (dot-notation, e.g. "brain_provider"). Required for get/set.'),
        value: z.unknown().optional().describe('Value to set. Required for action=set.'),
      }),
    },
    async ({ action, key, value }) => {
      const root = process.cwd();

      try {
        if (action === 'read') {
          const config = await loadConfig(root);
          // safe: spreading resolved config into a generic record for enrichment
          const enriched = enrichResponse('config', { action, config } as unknown as Record<string, unknown>);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
          };
        }

        if (action === 'get') {
          if (!key) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'key is required for action=get' }) }],
              isError: true,
            };
          }
          const config = await loadConfig(root);
          const val = getNestedValue(config as unknown as Record<string, unknown>, key);
          const enriched = enrichResponse('config', { action, key, value: val });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
          };
        }

        // action === 'set'
        if (!key) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'key is required for action=set' }) }],
            isError: true,
          };
        }
        if (value === undefined) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'value is required for action=set' }) }],
            isError: true,
          };
        }

        const configPath = join(root, PROJECT_CONFIG_PATH);
        let existing: Record<string, unknown> = {};
        if (existsSync(configPath)) {
          existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
        }
        setNestedValue(existing, key, value);
        validatePartialConfig(existing);
        writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');

        const enriched = enrichResponse('config', { action, key, value, success: true });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );
}
