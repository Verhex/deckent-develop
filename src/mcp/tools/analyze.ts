import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { analyzeProject } from '../../core/analyzer.js';
import { enrichResponse } from '../helpers/enrich.js';

function generateConfigSuggestion(analysis: Record<string, unknown>): string[] {
  const suggestions: string[] = [];
  // safe: optional field access — values compared to string literals, no crash on undefined
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
      description: 'Analyze the current project to detect: language (TypeScript/JavaScript/Python/Go/Rust/etc.), framework (React/Express/FastAPI/etc.), test framework (vitest/jest/pytest/etc.), build tool (tsc/webpack/vite/etc.), CI system (GitHub Actions/GitLab CI/etc.), project size (small/medium/large based on file count), and methodology recommendation. Returns config suggestions (e.g. recommended plan mode, worker count). Useful before init to pick the right configuration, or to verify stack detection. Does not modify any files.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      const root = process.cwd();

      try {
        // safe: analyzeProject returns ProjectAnalysis — cast to Record for dynamic key spreading into enrichResponse
        const analysis = analyzeProject(root) as unknown as Record<string, unknown>;
        const configSuggestion = generateConfigSuggestion(analysis);
        const enriched = enrichResponse('analyze', { ...analysis, configSuggestion });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(enriched),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Failed to analyze project: ${message}` }) }],
          isError: true,
        };
      }
    },
  );
}
