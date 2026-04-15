import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readDashboardSafe } from '../../monitor/dashboard-manager.js';
import { debugLog } from '../../core/utils.js';

export function registerDashboardResource(server: McpServer): void {
  server.registerResource(
    'dashboard',
    'deckent://dashboard',
    {
      title: 'Sprint Dashboard',
      description: 'Live sprint status: agents, progress, usage, alerts',
      mimeType: 'application/json',
    },
    async (uri) => {
      const root = process.cwd();
      const result = readDashboardSafe(root);

      if (!result.valid && result.error) {
        debugLog('dashboard-resource:parse-error', result.error);
      }

      // Return the state (either valid from file, or default from merge/missing)
      const output = result.valid
        ? { ...result.state, active: true }
        : { active: false, error: result.error, repaired: result.repaired };

      return {
        contents: [{ uri: uri.href, text: JSON.stringify(output), mimeType: 'application/json' }],
      };
    },
  );
}
