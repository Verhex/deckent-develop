// src/mcp/tools/autonomous-approval.ts
//
// `deckent_autonomous_approve` + `deckent_autonomous_reject` (Sıra-74 remaining
// surface, Sprint 363 Task 363-009, DEFER-001).
//
// The existing `deckent_autonomous` tool (autonomous.ts) already covers
// approve/reject as sub-actions, but does so alongside status/backlog/start/stop
// in one broad control-surface tool. This module splits approve/reject into
// their own dedicated tools — same shape as the 359-016 / 361-014 precedent
// (`autonomous-surface.ts` split `backlog`/`status` out of `deckent_autonomous`
// for the same reason: a focused, single-purpose MCP surface per action).
//
// Talks directly to `orchestra/autonomous/approval-adapter.ts`'s `makeApprovalGate`
// (the mcp/ -> orchestra/ edge ADR-D-004 C3 allows), not through `cli/` — no
// `cli/commands/autonomous.js` import, unlike the original `deckent_autonomous`.
//
// EXEC-FREE: no `executor` option is passed to `makeApprovalGate`, so
// accept()/reject() here only record the human decision to
// `.deckent/autonomous/{pending.json,decisions.json}` for the running
// autonomous loop (or `deckent autonomous approve/reject` CLI) to pick up on
// its next cycle — mirrors `deckent_autonomous action=approve/reject`, which
// makes the same exec-free choice. This resolves triggers the G2/G3
// policy-gate (policy-gate.ts) parked with `policy: 'approval-required'`
// (or any other parked trigger id) — see approval-adapter.ts's 🔴 NO
// AUTO-APPROVE invariant: nothing but an explicit accept()/reject() call ever
// clears a pending trigger.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import {
  ClosedApprovalRequestError,
  UnknownApprovalRequestError,
  makeApprovalGate,
} from '../../orchestra/autonomous/approval-adapter.js';
import { autonomousPendingPath } from '../../core/constants.js';
import { loadConfig } from '../../core/config.js';
import { resolveLocalOsPrincipal } from '../../core/principal.js';
import { getLanguage, getMessage } from '../../cli/helpers/messages.js';
import { getMcpToolDescriptionLanguage, mcpToolDescription } from './description-catalog.js';

// ─── Filesystem layout (mirrors autonomous.ts / autonomous-surface.ts) ──────


// ─── Shared response helpers (mirrors autonomous-surface.ts) ────────────────

function ok(data: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function fail(message: string, detail: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message, ...detail }) }],
    isError: true,
  };
}

// ─── deckent_autonomous_approve ──────────────────────────────────────────────

export function registerAutonomousApproveTool(server: McpServer): void {
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_autonomous_approve',
    {
      title: getMessage('autonomous.mcp_approve.title', registerLang),
      description: mcpToolDescription('deckent_autonomous_approve'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        id: z.string().optional().describe(getMessage('autonomous.mcp_approve.id_desc', registerLang)),
        triggerId: z.string().optional().describe(getMessage('autonomous.mcp_approve.trigger_id_desc', registerLang)),
        reason: z.string().optional().describe(getMessage('autonomous.mcp_approve.reason_desc', registerLang)),
        root: z.string().optional().describe(getMessage('autonomous.mcp.root_desc', registerLang)),
      }),
    },
    async ({ id, triggerId, reason, root: rootParam }) => {
      const root = rootParam ?? process.cwd();
      const appConfig = await loadConfig(root);
      const lang = getLanguage(appConfig.language);
      const tid = triggerId ?? id;
      if (!tid) return fail(getMessage('autonomous.mcp_approve.id_required', lang));

      try {
        const gate = makeApprovalGate({
          pendingPath: autonomousPendingPath(root),
          projectRoot: root,
          lifecycle: appConfig.approval!.lifecycle,
          principal: resolveLocalOsPrincipal('mcp'),
          strictTenantIsolation: appConfig.strict_tenant_isolation ?? false,
        });
        const wasPending = gate.pending().some((p) => p.triggerId === tid);
        gate.accept(tid, reason);
        return ok({ triggerId: tid, approved: true, wasPending });
      } catch (err) {
        if (err instanceof ClosedApprovalRequestError) {
          return fail(
            err.reasonCode === 'expired'
              ? getMessage('approval.channel.expired', lang, { id: tid })
              : getMessage('autonomous.resolve_not_found', lang, { triggerId: tid }),
            { code: err.code, reasonCode: err.reasonCode, triggerId: tid, expiresAt: err.expiresAt },
          );
        }
        if (err instanceof UnknownApprovalRequestError) {
          return fail(getMessage('autonomous.resolve_not_found', lang, { triggerId: tid }), {
            code: err.code,
            triggerId: tid,
          });
        }
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ─── deckent_autonomous_reject ───────────────────────────────────────────────

export function registerAutonomousRejectTool(server: McpServer): void {
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_autonomous_reject',
    {
      title: getMessage('autonomous.mcp_reject.title', registerLang),
      description: mcpToolDescription('deckent_autonomous_reject'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        id: z.string().optional().describe(getMessage('autonomous.mcp_reject.id_desc', registerLang)),
        triggerId: z.string().optional().describe(getMessage('autonomous.mcp_reject.trigger_id_desc', registerLang)),
        reason: z.string().optional().describe(getMessage('autonomous.mcp_reject.reason_desc', registerLang)),
        root: z.string().optional().describe(getMessage('autonomous.mcp.root_desc', registerLang)),
      }),
    },
    async ({ id, triggerId, reason, root: rootParam }) => {
      const root = rootParam ?? process.cwd();
      const appConfig = await loadConfig(root);
      const lang = getLanguage(appConfig.language);
      const tid = triggerId ?? id;
      if (!tid) return fail(getMessage('autonomous.mcp_reject.id_required', lang));

      try {
        const gate = makeApprovalGate({
          pendingPath: autonomousPendingPath(root),
          projectRoot: root,
          lifecycle: appConfig.approval!.lifecycle,
          principal: resolveLocalOsPrincipal('mcp'),
          strictTenantIsolation: appConfig.strict_tenant_isolation ?? false,
        });
        const wasPending = gate.pending().some((p) => p.triggerId === tid);
        gate.reject(tid, reason);
        return ok({ triggerId: tid, rejected: true, wasPending });
      } catch (err) {
        if (err instanceof ClosedApprovalRequestError) {
          return fail(
            err.reasonCode === 'expired'
              ? getMessage('approval.channel.expired', lang, { id: tid })
              : getMessage('autonomous.resolve_not_found', lang, { triggerId: tid }),
            { code: err.code, reasonCode: err.reasonCode, triggerId: tid, expiresAt: err.expiresAt },
          );
        }
        if (err instanceof UnknownApprovalRequestError) {
          return fail(getMessage('autonomous.resolve_not_found', lang, { triggerId: tid }), {
            code: err.code,
            triggerId: tid,
          });
        }
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ─── Barrel Registration ────────────────────────────────────────────────────

export function registerAutonomousApprovalTools(server: McpServer): void {
  registerAutonomousApproveTool(server);
  registerAutonomousRejectTool(server);
}
