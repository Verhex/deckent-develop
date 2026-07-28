/**
 * deckent_xverify MCP tool — session-level adversarial cross-verification
 * (XVERIFY-TOOL; CLI parity with `deckent xverify`).
 *
 * The MCP surface exists so BOTH interactive sessions can invoke the advisory
 * hakem in-band: the Claude Code session calls it to have a Codex verifier try
 * to refute Claude-authored work, and the side-session Codex calls it with
 * `author: 'codex'` to get a Claude verifier — the verifier is always chosen to
 * DIFFER from the author (enforced by `selectVerifierProvider` through the
 * synthetic task's `provider` field; see cli/commands/xverify.ts).
 *
 * Provider output is evidence only. The host derives an authoritative
 * allow/no-go/hold disposition from typed criteria and immutable evidence.
 *
 * Thin wrapper: all behavior lives in `runXverifyCommandCore` — the same core
 * the CLI action calls — so the two surfaces cannot drift (CLI-MCP parity).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { ALL_PROVIDER_NAMES } from '../../core/types.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import { runXverifyForResult } from '../../cli/commands/xverify.js';
import { getLanguage, getMessage } from '../../cli/helpers/messages.js';

export function registerXverifyTool(
  server: McpServer,
  runtime: {
    providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  } = {},
): void {
  const lang = getLanguage(undefined);
  server.registerTool(
    'deckent_xverify',
    {
      title: getMessage('xverify.mcp.title', lang),
      description: getMessage('xverify.mcp.description', lang),
      annotations: {
        // Spawns a real verifier worker + writes a report file — not read-only.
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      inputSchema: z.object({
        claim: z.string().min(1).describe(getMessage('xverify.mcp.claim', lang)),
        author: z.enum(ALL_PROVIDER_NAMES as unknown as [string, ...string[]])
          .describe(getMessage('xverify.mcp.author', lang)),
        verifier: z.enum(ALL_PROVIDER_NAMES as unknown as [string, ...string[]]).optional()
          .describe(getMessage('xverify.mcp.verifier', lang)),
        verifierModel: z.string().optional()
          .describe(getMessage('xverify.mcp.verifier_model', lang)),
        diff: z.boolean().optional().describe(getMessage('xverify.mcp.diff', lang)),
        files: z.string().optional().describe(getMessage('xverify.mcp.files', lang)),
        timeoutMs: z.number().int().positive().optional()
          .describe(getMessage('xverify.mcp.timeout', lang)),
      }),
    },
    async ({ claim, author, verifier, verifierModel, diff, files, timeoutMs }) => {
      try {
        const result = await runXverifyForResult(claim, {
          author,
          verifier,
          verifierModel,
          diff,
          files,
          timeout: timeoutMs !== undefined ? String(timeoutMs) : undefined,
        }, {
          ...(runtime.providerAuthority
            ? { providerAuthority: runtime.providerAuthority }
            : {}),
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: getMessage('xverify.mcp.failed', lang, {
              error: err instanceof Error ? err.message : String(err),
            }),
          }],
        };
      }
    },
  );
}
