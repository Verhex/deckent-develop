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
 * Advisory by contract: the tool NEVER blocks or mutates project state beyond
 * the report artifact (`.analysis/xverify/<id>.md`) + the verifier task files.
 * A REFUTED verdict is information for the caller, not an enforcement signal.
 *
 * Thin wrapper: all behavior lives in `runXverifyCommandCore` — the same core
 * the CLI action calls — so the two surfaces cannot drift (CLI-MCP parity).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { ALL_PROVIDER_NAMES } from '../../core/types.js';
import { runXverifyForResult } from '../../cli/commands/xverify.js';

export function registerXverifyTool(server: McpServer): void {
  server.registerTool(
    'deckent_xverify',
    {
      title: 'Cross-verify (advisory)',
      description:
        'Dispatch an adversarial verifier worker on a DIFFERENT provider to try to refute a claim '
        + 'about finished work. Advisory only — returns CONFIRMED/REFUTED/UNCLEAR + a report path, '
        + 'never blocks. The verifier is chosen to differ from `author` '
        + '(session A authored → session B\'s provider verifies).',
      annotations: {
        // Spawns a real verifier worker + writes a report file — not read-only.
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      inputSchema: z.object({
        claim: z.string().min(1).describe('The claim about finished work to adversarially verify'),
        author: z.enum(ALL_PROVIDER_NAMES as unknown as [string, ...string[]])
          .describe('Provider that authored the claimed work — the verifier must differ'),
        verifier: z.enum(ALL_PROVIDER_NAMES as unknown as [string, ...string[]]).optional()
          .describe('Explicit verifier provider (must differ from author; default: cross_verify.verifier_priority)'),
        verifierModel: z.string().optional()
          .describe('Explicit verifier model id (canonical provider API id) — bypasses tier-equivalence'),
        diff: z.boolean().optional().describe('Attach `git diff HEAD` as evidence context'),
        files: z.string().optional().describe('Comma-separated files the claim says were changed'),
        timeoutMs: z.number().int().positive().optional().describe('Verifier timeout in ms (default 300000)'),
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
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `xverify failed: ${err instanceof Error ? err.message : String(err)}`,
          }],
        };
      }
    },
  );
}
