import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getLanguage, getMessage } from '../../cli/helpers/messages.js';
import { openApprovalAuthorityRuntime } from '../../core/approval-authority-runtime.js';
import { loadConfig } from '../../core/config.js';
import { wrapResponse } from '../helpers/format.js';

/**
 * READ-ONLY approval inbox over MCP. It reuses the SAME canonical ApprovalBroker
 * read model as `deckent approvals list` (`openApprovalAuthorityRuntime` →
 * `broker.list('pending')`), and nothing else: there is deliberately no decide /
 * allow / deny surface here. Deciding an approval stays CLI-only behind an
 * interactive live-authenticated TTY, so MCP can never mint a self-approval
 * without live auth. This closes the CLI↔MCP parity gap without widening it.
 */
export function registerApprovalsTool(server: McpServer): void {
  server.registerTool(
    'deckent_approvals',
    {
      title: 'Approval Inbox (read-only)',
      description:
        'List pending runtime approval requests over the canonical ApprovalBroker read '
        + 'model — the SAME source as the `deckent approvals list` CLI. READ-ONLY: this '
        + 'surface never decides, allows, or denies; deciding stays CLI-only behind an '
        + 'interactive live-authenticated TTY, so there is no self-approval path over MCP. '
        + 'Returns each pending request id, summary, and expiry.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      // No inputs: the response always carries both the machine-readable pending
      // array and a human summary, so there is nothing to toggle.
      inputSchema: z.object({}),
    },
    async () => {
      const root = process.cwd();
      const config = await loadConfig(root);
      const lang = getLanguage(config.language);
      const authority = config.approval?.authority;
      if (authority?.enabled !== true) {
        return wrapMcp(
          { pending: [], authority: 'disabled' as const },
          getMessage('approvals.authority_disabled', lang),
        );
      }
      const opened = openApprovalAuthorityRuntime({
        projectRoot: root,
        tenantId: authority.tenant_id,
      });
      if (opened.state !== 'ready') {
        return wrapMcp(
          {
            pending: [],
            authority: 'hold' as const,
            reason: opened.reasonCode,
            detail: opened.detailCode,
          },
          getMessage('approvals.runtime_hold', lang, {
            reason: opened.reasonCode,
            detail: opened.detailCode,
          }),
        );
      }
      try {
        const pending = opened.service.broker.list('pending').map(request => ({
          id: request.id,
          summary: request.summary,
          expiresAt: request.expiresAt,
        }));
        const summary = pending.length === 0
          ? getMessage('approvals.none_pending', lang)
          : pending.map(request => getMessage('approvals.pending_line', lang, request)).join('\n');
        return wrapMcp({ pending, authority: 'ready' as const }, summary);
      } finally {
        opened.service.close();
      }
    },
  );
}

function wrapMcp(data: unknown, summary: string): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(wrapResponse(data, summary)),
    }],
  };
}
