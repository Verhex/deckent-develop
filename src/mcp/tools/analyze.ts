import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { analyzeProject } from '../../core/analyzer.js';

export function registerAnalyzeTool(server: McpServer): void {
  server.registerTool(
    'deckent_analyze_project',
    {
      title: 'Analyze Project',
      description: 'Analyze project stack, size, and methodology recommendation.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      const root = process.cwd();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(analyzeProject(root)),
        }],
      };
    },
  );
}
