// src/mcp/tools/nervous-edit.ts
//
// MCP surface for two nervous plan-builders — both PLAN-ONLY / READ-ONLY,
// neither one executes a real nervous action:
//
// `deckent_nervous_edit` wraps 357-006's `cli/repl/nervous-bridge.ts`
// `handleEdit` (APPROVE-007b accept-with-edited-payload plan builder) so it is
// callable from MCP. It returns `handleEdit`'s `NervousBridgePlanResult` only —
// applying the plan is a distinct, injectable step owned by nervous-bridge.ts's
// own `applyNervousBridgePlan` (an executor + pending-store, not called here).
//
// `deckent_nervous_undo` builds an undo PLAN for the most recent
// reversible+accepted+success `ExecutionRecord` (or a specific record id),
// using `NervousHistory`'s own public read API (`findRecentReversible` /
// `findById`). It never calls `NervousHistory.markUndone` itself — Nervous has
// no compensating-action executor that actually reverses the underlying effect
// of a past action, so "undo" here is an audit-trail bookkeeping plan, not a
// real rollback, and the tool says so explicitly (`supported: false` when
// nothing undoable exists) rather than implying a real revert is possible.
//
// Sıra-75 (Sprint 361 Task 361-014, DEFER-002-NERVOUS).
//
// ADR-D-004 (C3) note: importing `handleEdit` from `cli/repl/nervous-bridge.ts`
// crosses the mcp/ ↔ cli/ edge. The sibling file `nervous.ts` already crosses
// this identical edge (`cli/commands/nervous.js` — `acceptPanicGuard`,
// `listPendingPanicEvents`) for the same reason (reusing nervous read/plan
// logic); this follows that shipped precedent rather than duplicating the
// plan-building logic a second time. See task .result notes for the
// exception-registry follow-up flag.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NervousNotification, ExecutionRecord } from '../../core/nervous-types.js';
import { NERVOUS_PENDING_FILE } from '../../core/constants.js';
import {
  handleEdit,
  type NervousPendingStore,
  type NervousBridgePlanResult,
} from '../../cli/repl/nervous-bridge.js';
import { NervousHistory } from '../../nervous/history.js';
import { mcpToolDescription } from './description-catalog.js';

// ─── Disk-backed pending store (production reader) ─────────────────────────
// nervous-bridge.ts's own banner deliberately deferred "a real disk/IPC-backed
// reader in production wiring" as follow-up work not owned by that module —
// this is that follow-up, scoped to this MCP tool only. Fail-safe: a missing
// or corrupt file yields [] (never throws), mirroring the same fail-safe
// contract as `readPendingApprovals` (core/pending-approvals.ts).

class DiskNervousPendingStore implements NervousPendingStore {
  constructor(private readonly root: string) {}

  listPending(): readonly NervousNotification[] {
    const path = join(this.root, NERVOUS_PENDING_FILE);
    if (!existsSync(path)) return [];
    try {
      const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
      return Array.isArray(data) ? (data as NervousNotification[]) : [];
    } catch {
      return [];
    }
  }
}

// ─── Pure handler: deckent_nervous_edit ─────────────────────────────────────

export interface NervousEditInput {
  readonly id: string;
  readonly modifiedPayload: Record<string, unknown>;
  readonly root?: string;
}

/**
 * Pure handler for `deckent_nervous_edit`. Delegates to nervous-bridge.ts's
 * `handleEdit` against an injected `store` — defaults to the disk-backed
 * pending-notification reader when the register function does not inject one.
 * Returns the plan only; nothing is executed here.
 */
export function handleNervousEdit(
  input: NervousEditInput,
  store?: NervousPendingStore,
): NervousBridgePlanResult {
  const id = input.id?.trim() ?? '';
  if (!id) {
    throw new Error('id is required');
  }
  if (!input.modifiedPayload || Object.keys(input.modifiedPayload).length === 0) {
    throw new Error('modifiedPayload is required and must be a non-empty object');
  }
  const root = input.root ?? process.cwd();
  const resolvedStore = store ?? new DiskNervousPendingStore(root);
  return handleEdit(resolvedStore, id, input.modifiedPayload);
}

// ─── Pure handler: deckent_nervous_undo ─────────────────────────────────────

export type NervousUndoStepKind = 'mark-undone';

export interface NervousUndoStep {
  readonly kind: NervousUndoStepKind;
  readonly recordId: string;
}

export interface NervousUndoPlan {
  readonly record: ExecutionRecord;
  readonly steps: readonly NervousUndoStep[];
  readonly note: string;
}

export type NervousUndoPlanResult =
  | { readonly supported: true; readonly plan: NervousUndoPlan }
  | { readonly supported: false; readonly reason: string; readonly recordId?: string };

const UNDO_NOTE =
  'This marks the record as undone in the Nervous audit trail ' +
  '(NervousHistory.markUndone) only. Nervous has no compensating-action ' +
  'executor that reverses the underlying effect of the original action — ' +
  'applying this plan does not roll back files, state, or side effects.';

/** Read-only surface of `NervousHistory` this handler depends on. */
export interface NervousUndoHistorySource {
  findRecentReversible(limit?: number): Promise<ExecutionRecord[]>;
  findById(id: string): Promise<ExecutionRecord | null>;
}

export interface NervousUndoInput {
  readonly id?: string;
  readonly root?: string;
}

/**
 * Pure handler for `deckent_nervous_undo`. Builds an undo PLAN for the most
 * recent reversible+accepted+successful action (or a specific `id`) using
 * `NervousHistory`'s own public read API — never calls `markUndone` itself.
 * When nothing reversible is found, or the targeted record is not an
 * undoable accepted action, returns an honest `supported: false` result
 * instead of a plan.
 */
export async function handleNervousUndo(
  input: NervousUndoInput,
  history?: NervousUndoHistorySource,
): Promise<NervousUndoPlanResult> {
  const root = input.root ?? process.cwd();
  const source = history ?? new NervousHistory(root);

  let record: ExecutionRecord | null;
  if (input.id && input.id.trim() !== '') {
    const targetId = input.id.trim();
    record = await source.findById(targetId);
    if (!record) {
      return { supported: false, reason: `No execution record found for id: ${targetId}`, recordId: targetId };
    }
    if (!record.reversible || record.decision !== 'accepted' || record.outcome !== 'success') {
      return {
        supported: false,
        reason: `Record ${record.id} is not an undoable accepted action (reversible=${record.reversible}, decision=${record.decision}, outcome=${record.outcome})`,
        recordId: record.id,
      };
    }
  } else {
    const recent = await source.findRecentReversible(10);
    record = recent.find(r => r.decision === 'accepted') ?? null;
    if (!record) {
      return { supported: false, reason: 'No reversible accepted action found in Nervous history' };
    }
  }

  return {
    supported: true,
    plan: {
      record,
      steps: [{ kind: 'mark-undone', recordId: record.id }],
      note: UNDO_NOTE,
    },
  };
}

// ─── Tool Registrations ─────────────────────────────────────────────────────

export function registerNervousEditTool(server: McpServer): void {
  server.registerTool(
    'deckent_nervous_edit',
    {
      title: 'Nervous Edit',
      description: mcpToolDescription('deckent_nervous_edit'),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        id: z.string().describe('Pending notification ID, id-prefix, or shortCode to accept with an edited payload'),
        modifiedPayload: z.record(z.string(), z.unknown()).describe('Payload fields to shallow-merge onto the original action payload before accepting'),
        root: z.string().optional().describe('Project root path (for locating the pending-notification store)'),
      }),
    },
    async ({ id, modifiedPayload, root }) => {
      try {
        const result = handleNervousEdit({ id, modifiedPayload, root });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}

export function registerNervousUndoTool(server: McpServer): void {
  server.registerTool(
    'deckent_nervous_undo',
    {
      title: 'Nervous Undo',
      description: mcpToolDescription('deckent_nervous_undo'),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        id: z.string().optional().describe('Specific ExecutionRecord id to target (default: most recent reversible accepted action)'),
        root: z.string().optional().describe('Project root path'),
      }),
    },
    async ({ id, root }) => {
      try {
        const result = await handleNervousUndo({ id, root });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}

/** Barrel registration — mirrors `registerNervousTools` (nervous.ts). */
export function registerNervousEditTools(server: McpServer): void {
  registerNervousEditTool(server);
  registerNervousUndoTool(server);
}
