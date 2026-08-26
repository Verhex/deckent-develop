import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getLanguage, getMessage } from '../../cli/helpers/messages.js';
import { listFederatedPendingItems } from '../../core/approval-inbox-federation.js';
import { shortCodeFor } from '../../core/approval-short-code.js';
import { gatewayHome } from '../../connectors/gateway/gateway-paths.js';
import { loadConfig } from '../../core/config.js';
import { ApprovalStore } from '../../core/approval-store.js';
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
      // MCP is strictly read-only. The store constructor computes the current
      // policy's effective-expiry view in memory, but never runs sweepExpired,
      // stage production, migration, reissue, or any decision write.
      const store = new ApprovalStore(root, config.approval?.lifecycle
        ? { lifecycle: config.approval.lifecycle }
        : {});
      const storeSnapshot = store.load();
      const quarantined = storeSnapshot.quarantined.map(item => ({
        origin: 'broker-native' as const,
        id: item.file.endsWith('.request.json')
          ? item.file.slice(0, -'.request.json'.length)
          : item.file,
        sourceReference: item.sourceReference,
        lifecycleReasonCode: item.reasonCode,
        quarantined: true as const,
      }));
      const expired = storeSnapshot.expired
        .filter(entry => entry.request.tenantId === authority?.tenant_id)
        .map(entry => {
          const timeoutReceipt = store.getTimeoutReceipt(entry.request.id);
          return {
            id: entry.request.id,
            expiresAt: entry.lifecycle?.effectiveExpiresAt ?? entry.request.expiresAt,
            ...(entry.request.version === '2.0' ? {
              origin: entry.lifecycle?.origin ?? entry.request.origin,
              riskTier: entry.lifecycle?.riskTier ?? entry.request.riskTier,
              lifecycleStage: 'expired' as const,
              lifecycleGeneration: entry.request.lifecycleGeneration,
              policySnapshotDigest: entry.request.policySnapshotDigest,
              appliedPolicyDigest: entry.lifecycle?.appliedPolicyDigest
                ?? entry.request.policySnapshotDigest,
              sourceReference: entry.request.source.reference,
            } : {}),
            ...(timeoutReceipt ? { timeoutReceipt } : {}),
          };
        });
      // D1 federated inbox: other surfaces' pending decisions are visible on
      // MCP too (read-only rows with origin + current decide-command hint).
      const federated = listFederatedPendingItems(root, { gatewayHomeDir: gatewayHome() })
        .filter(item => item.tenantId === undefined || item.tenantId === authority?.tenant_id)
        .map(item => ({
          origin: item.origin,
          id: item.id,
          shortCode: shortCodeFor(item.id),
          summary: item.summary,
          decideHint: getMessage(item.decideHintKey, lang),
          ...(item.requestedAt ? { requestedAt: item.requestedAt } : {}),
          ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}),
          ...(item.riskTier ? { riskTier: item.riskTier } : {}),
          ...(item.lifecycleStage ? { lifecycleStage: item.lifecycleStage } : {}),
          ...(item.quarantined ? {
            quarantined: true,
            lifecycleReasonCode: item.lifecycleReasonCode ?? 'unknown',
            sourceReference: item.sourceReference ?? null,
          } : item.sourceReference ? { sourceReference: item.sourceReference } : {}),
          ...(item.unreadable ? { unreadable: true } : {}),
        }));
      if (authority?.enabled !== true) {
        return wrapMcp(
          { pending: [], federated, quarantined, expired, authority: 'disabled' as const },
          getMessage('approvals.authority_disabled', lang),
        );
      }
      const pending = storeSnapshot.pending
        .filter(entry => entry.request.tenantId === authority.tenant_id)
        .map(entry => {
          const { request, lifecycle } = entry;
          return {
            id: request.id,
            shortCode: shortCodeFor(request.id),
            summary: request.summary,
            expiresAt: lifecycle?.effectiveExpiresAt ?? request.expiresAt,
            ...(request.version === '2.0' ? {
              origin: lifecycle?.origin ?? request.origin,
              riskTier: lifecycle?.riskTier ?? request.riskTier,
              lifecycleStage: request.slaStage,
              lifecycleGeneration: request.lifecycleGeneration,
              policySnapshotDigest: request.policySnapshotDigest,
              appliedPolicyDigest: lifecycle?.appliedPolicyDigest
                ?? request.policySnapshotDigest,
              sourceReference: request.source.reference,
              policyTransitionChanged: lifecycle?.policyTransitionChanged ?? false,
              weakeningIgnored: lifecycle?.weakeningIgnored ?? false,
            } : {}),
          };
        });
      const summary = pending.length === 0
        ? getMessage('approvals.none_pending', lang)
        : pending.map(request => {
          const line = getMessage('approvals.pending_line', lang, {
            code: request.shortCode,
            id: request.id,
            summary: request.summary,
            expiresAt: request.expiresAt,
          });
          if (!('origin' in request)) return line;
          return `${line}\n${getMessage('approvals.lifecycle_detail', lang, {
            origin: String(request.origin),
            riskTier: String(request.riskTier),
            stage: String(request.lifecycleStage),
            expiresAt: request.expiresAt,
          })}`;
        }).join('\n');
      return wrapMcp({ pending, federated, quarantined, expired, authority: 'ready' as const }, summary);
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
