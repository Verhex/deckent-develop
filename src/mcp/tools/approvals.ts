import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getLanguage, getMessage } from '../../cli/helpers/messages.js';
import { listFederatedPendingItems } from '../../core/approval-inbox-federation.js';
import { shortCodeFor } from '../../core/approval-short-code.js';
import { gatewayHome } from '../../connectors/gateway/gateway-paths.js';
import { openApprovalAuthorityRuntime } from '../../core/approval-authority-runtime.js';
import { loadConfig } from '../../core/config.js';
import { wrapResponse } from '../helpers/format.js';
import { mcpToolDescription } from './description-catalog.js';

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
      description: mcpToolDescription('deckent_approvals'),
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
      // D1 federated inbox: other surfaces' pending decisions are visible on
      // MCP too (read-only rows with origin + current decide-command hint).
      const federated = listFederatedPendingItems(root, { gatewayHomeDir: gatewayHome() })
        .map(item => ({
          origin: item.origin,
          id: item.id,
          shortCode: shortCodeFor(item.id),
          summary: item.summary,
          decideHint: getMessage(item.decideHintKey, lang),
          ...(item.requestedAt ? { requestedAt: item.requestedAt } : {}),
          ...(item.unreadable ? { unreadable: true } : {}),
        }));
      if (authority?.enabled !== true) {
        return wrapMcp(
          { pending: [], federated, authority: 'disabled' as const },
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
          shortCode: shortCodeFor(request.id),
          summary: request.summary,
          expiresAt: request.expiresAt,
        }));
        const summary = pending.length === 0
          ? getMessage('approvals.none_pending', lang)
          : pending.map(request => getMessage('approvals.pending_line', lang, { ...request, code: request.shortCode })).join('\n');
        return wrapMcp({ pending, federated, authority: 'ready' as const }, summary);
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
