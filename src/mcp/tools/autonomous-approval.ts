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
import { makeApprovalGate } from '../../orchestra/autonomous/approval-adapter.js';
import { autonomousPendingPath } from '../../core/constants.js';

// ─── Filesystem layout (mirrors autonomous.ts / autonomous-surface.ts) ──────


// ─── Shared response helpers (mirrors autonomous-surface.ts) ────────────────

function ok(data: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function fail(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
    isError: true,
  };
}

// ─── deckent_autonomous_approve ──────────────────────────────────────────────

export function registerAutonomousApproveTool(server: McpServer): void {
  server.registerTool(
    'deckent_autonomous_approve',
    {
      title: 'Autonomous Approve',
      description:
        'Approve a pending autonomous-engine trigger — a backlog entry parked by the ' +
        'G2/G3 policy gate as `policy: approval-required` (or any other parked trigger ' +
        'id). Exec-free: records the accept decision to ' +
        '.deckent/autonomous/{pending.json,decisions.json} via the approval-adapter ' +
        'public API; the running autonomous loop (or `deckent autonomous approve`) picks ' +
        'it up and replays the trigger on its next cycle. Nothing is executed here. See ' +
        'also deckent_autonomous_reject, deckent_autonomous_status (pendingApprovals ' +
        'count), and deckent_autonomous action=pending (full listing).',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        id: z.string().optional().describe('Trigger/backlog-entry id to approve (alternative to triggerId)'),
        triggerId: z.string().optional().describe('Trigger/backlog-entry id to approve (preferred over id)'),
        reason: z.string().optional().describe('Reason recorded with the approve decision'),
        root: z.string().optional().describe('Project root path (default: cwd)'),
      }),
    },
    async ({ id, triggerId, reason, root: rootParam }) => {
      const root = rootParam ?? process.cwd();
      const tid = triggerId ?? id;
      if (!tid) return fail('triggerId (or id) is required for approve.');

      try {
        const gate = makeApprovalGate({ pendingPath: autonomousPendingPath(root), projectRoot: root });
        const wasPending = gate.pending().some((p) => p.triggerId === tid);
        gate.accept(tid, reason);
        return ok({ triggerId: tid, approved: true, wasPending });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ─── deckent_autonomous_reject ───────────────────────────────────────────────

export function registerAutonomousRejectTool(server: McpServer): void {
  server.registerTool(
    'deckent_autonomous_reject',
    {
      title: 'Autonomous Reject',
      description:
        'Reject a pending autonomous-engine trigger — a backlog entry parked by the ' +
        'G2/G3 policy gate as `policy: approval-required` (or any other parked trigger ' +
        'id). Exec-free: records the reject decision to ' +
        '.deckent/autonomous/{pending.json,decisions.json} via the approval-adapter ' +
        'public API; the running autonomous loop (or `deckent autonomous reject`) picks ' +
        'it up and never replays the trigger. Nothing is executed here. See also ' +
        'deckent_autonomous_approve, deckent_autonomous_status (pendingApprovals count), ' +
        'and deckent_autonomous action=pending (full listing).',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        id: z.string().optional().describe('Trigger/backlog-entry id to reject (alternative to triggerId)'),
        triggerId: z.string().optional().describe('Trigger/backlog-entry id to reject (preferred over id)'),
        reason: z.string().optional().describe('Reason recorded with the reject decision'),
        root: z.string().optional().describe('Project root path (default: cwd)'),
      }),
    },
    async ({ id, triggerId, reason, root: rootParam }) => {
      const root = rootParam ?? process.cwd();
      const tid = triggerId ?? id;
      if (!tid) return fail('triggerId (or id) is required for reject.');

      try {
        const gate = makeApprovalGate({ pendingPath: autonomousPendingPath(root), projectRoot: root });
        const wasPending = gate.pending().some((p) => p.triggerId === tid);
        gate.reject(tid, reason);
        return ok({ triggerId: tid, rejected: true, wasPending });
      } catch (err) {
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
