import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { analyzeProject } from '../../core/analyzer.js';
import { enrichResponse } from '../helpers/enrich.js';

function generateConfigSuggestion(analysis: Record<string, unknown>): string[] {
  const suggestions: string[] = [];
  const size = analysis.size as string | undefined;
  if (size === 'small') suggestions.push('Consider pro_plan mode for smaller projects');
  if (size === 'large') suggestions.push('Consider max_plan mode with higher worker count');
  const testFramework = analysis.testFramework as string | undefined;
  if (!testFramework || testFramework === 'unknown') suggestions.push('Set up a test framework for better CI coverage');
  return suggestions;
}

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
      const analysis = analyzeProject(root) as unknown as Record<string, unknown>;
      const configSuggestion = generateConfigSuggestion(analysis);
      const enriched = enrichResponse('analyze', { ...analysis, configSuggestion });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(enriched),
        }],
      };
    },
  );
}
