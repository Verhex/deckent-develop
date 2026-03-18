import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DIRECTIVES_FILE } from '../../core/constants.js';
import { enrichResponse } from '../helpers/enrich.js';

function computeBreakdown(content: string): { code: number; docs: number; test: number; analysis: number } {
  const headers = content.match(/^##\s+(Görev|Task)\s+\d+[:\s].*/gm) ?? [];
  let code = 0, docs = 0, test = 0, analysis = 0;
  for (const header of headers) {
    if (/verif|history|comparison|doc\s+criter/i.test(header)) docs++;
    else if (/\btest\b/i.test(header)) test++;
    else if (/analyz|analiz/i.test(header)) analysis++;
    else code++;
  }
  return { code, docs, test, analysis };
}

function computeEstimatedModels(breakdown: { code: number; docs: number; test: number; analysis: number }): { opus: number; sonnet: number; haiku: number } {
  const complex = breakdown.code + breakdown.test;
  return {
    opus: Math.ceil(complex * 0.4),
    sonnet: Math.ceil(complex * 0.6) + Math.ceil(breakdown.analysis * 0.5),
    haiku: breakdown.docs + Math.floor(breakdown.analysis * 0.5),
  };
}

export function registerSetDirectivesTool(server: McpServer): void {
  server.registerTool(
    'deckent_set_directives',
    {
      title: 'Set Directives',
      description: 'Write DIRECTIVES.md content. Claude should format natural language goals into "## Görev N:" or "## Task N:" blocks that the brain engine can parse.',
      inputSchema: z.object({
        content: z.string().describe('Formatted DIRECTIVES.md content with ## Görev/Task N: blocks'),
      }),
    },
    async ({ content }) => {
      const root = process.cwd();
      writeFileSync(join(root, DIRECTIVES_FILE), content, 'utf-8');

      // Count tasks by matching ## Görev or ## Task headers
      const taskCount = (content.match(/^##\s+(Görev|Task)\s+\d+/gm) ?? []).length;
      const breakdown = computeBreakdown(content);
      const estimatedModels = computeEstimatedModels(breakdown);

      const response = enrichResponse('set_directives', { success: true, taskCount, breakdown, estimatedModels });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(response),
        }],
      };
    },
  );
}
