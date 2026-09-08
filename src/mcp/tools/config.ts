import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { loadConfig, validatePartialConfig } from '../../core/config.js';
import {
  withConfigWriteLock,
  writeConfigJsonAtomic,
} from '../../core/config-write-authority.js';
import { setNestedValue, getNestedValue } from '../../core/config-migration.js';
import { enrichResponse } from '../helpers/enrich.js';
import { mcpToolDescription, mcpFieldDescription } from './description-catalog.js';

export function registerConfigTool(server: McpServer): void {
  server.registerTool(
    'deckent_config',
    {
      title: 'Config Manager',
      description: mcpToolDescription('deckent_config'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        action: z.enum(['read', 'get', 'set']).describe(mcpFieldDescription('deckent_config', 'action')),
        key: z.string().optional().describe(mcpFieldDescription('deckent_config', 'key')),
        value: z.unknown().optional().describe(mcpFieldDescription('deckent_config', 'value')),
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
              content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'key is required for action=get' }) }],
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
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'key is required for action=set' }) }],
            isError: true,
          };
        }
        if (value === undefined) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'value is required for action=set' }) }],
            isError: true,
          };
        }

        const configPath = join(root, PROJECT_CONFIG_PATH);
        withConfigWriteLock(configPath, () => {
          let existing: Record<string, unknown> = {};
          if (existsSync(configPath)) {
            existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
          }
          setNestedValue(existing, key, value);
          validatePartialConfig(existing);
          writeConfigJsonAtomic(configPath, existing);
        });

        const enriched = enrichResponse('config', { action, key, value, success: true });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
