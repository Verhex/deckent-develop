import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DIRECTIVES_FILE } from '../../core/constants.js';
import { enrichResponse } from '../helpers/enrich.js';
import { getActiveDirectivesProtection } from '../../nervous/observer.js';
import { modelRegistry, LEGACY_MODEL_ALIASES } from '../../core/model-registry.js';

// 454-004: the tool description's Model example must teach an exact provider
// API ID + explicit Provider ownership — never a retired alias
// (resolveCanonicalModelIdentity() throws E_LEGACY_MODEL_ALIAS on
// "opus"/"sonnet"/"haiku"/"gpt-5"/"gpt-5.6"). Mirrors run.ts's canonical-model voice.
const DIRECTIVES_EXAMPLE_MODEL = modelRegistry.getByProviderAndTier('claude', 'standard');
if (!DIRECTIVES_EXAMPLE_MODEL) throw new Error('E_DIRECTIVES_EXAMPLE_MODEL_UNAVAILABLE');
const DIRECTIVES_EXAMPLE_MODEL_ID = DIRECTIVES_EXAMPLE_MODEL.id;
const DIRECTIVES_REJECTED_LEGACY_ALIASES = Object.keys(LEGACY_MODEL_ALIASES).join('/');
const DIRECTIVES_PROVIDER_NAMES = [...new Set(
  modelRegistry.getAllModels().map(model => model.provider),
)].sort().join('/');

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

function computeEstimatedModels(breakdown: { code: number; docs: number; test: number; analysis: number }): Record<string, number> {
  const complex = breakdown.code + breakdown.test;
  const premium = modelRegistry.getByProviderAndTier('claude', 'premium');
  const standard = modelRegistry.getByProviderAndTier('claude', 'standard');
  const economy = modelRegistry.getByProviderAndTier('claude', 'economy');
  if (!premium || !standard || !economy) throw new Error('E_DIRECTIVES_ESTIMATE_MODEL_UNAVAILABLE');
  return {
    [premium.id]: Math.ceil(complex * 0.4),
    [standard.id]: Math.ceil(complex * 0.6) + Math.ceil(breakdown.analysis * 0.5),
    [economy.id]: breakdown.docs + Math.floor(breakdown.analysis * 0.5),
  };
}

export function registerSetDirectivesTool(server: McpServer): void {
  server.registerTool(
    'deckent_set_directives',
    {
      title: 'Set Directives',
      description: `Write DIRECTIVES.md content. The brain engine parses "## Task N:" or "## Görev N:" blocks to create sprint tasks. Each block should include: Model (an exact provider API ID, e.g. ${DIRECTIVES_EXAMPLE_MODEL_ID} — see deckent_models for the live catalog; legacy aliases [${DIRECTIVES_REJECTED_LEGACY_ALIASES}] are rejected), optional Provider (explicit ownership: ${DIRECTIVES_PROVIDER_NAMES}, required when it can't be inferred from the id's prefix), Effort (low/normal/high), Skills (e.g. typescript-expert), Files, Scope (directory list), and Description. Example format:

## Task 1: Add authentication middleware
- Model: ${DIRECTIVES_EXAMPLE_MODEL_ID}
- Provider: claude
- Effort: normal
- Skills: typescript-expert
- Files: src/middleware/auth.ts
- Scope: src/middleware/

### Description
Implement JWT-based authentication middleware...

Prerequisite: deckent_init must have been run. Overwrites DIRECTIVES.md each call. Run deckent_plan after to preview tasks.`,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        content: z.string().describe('Formatted DIRECTIVES.md content with ## Task N: or ## Görev N: blocks. Each block needs Model (exact provider API ID — no legacy aliases), Effort, Skills, Files, Scope, and Description sub-sections; Provider is optional.'),
      }),
    },
    async ({ content }) => {
      const root = process.cwd();

      try {
      writeFileSync(join(root, DIRECTIVES_FILE), content, 'utf-8');

      // Refresh directives_protection baseline so auto_restore uses the new content.
      // Sprint 177 fix: kill+cleanup sonrası yanlış baseline restore'unu önler.
      try {
        getActiveDirectivesProtection()?.updateBaseline();
      } catch { /* baseline update is best-effort — never block set_directives */ }

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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Failed to write directives: ${message}` }) }],
          isError: true,
        };
      }
    },
  );
}
