// src/mcp/tools/nervous.ts
//
// 5 MCP tools for Nervous System interaction.
// ADR-022-v2 CLI/MCP parity. Sprint 147 Task 16.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { ACTION_REGISTRY } from '../../nervous/action-registry.js';
import { NervousHistory } from '../../nervous/history.js';
import { NervousIpcQueue } from '../../nervous/ipc-queue.js';
import type { AuthorityMode, NervousSystemConfigV1 } from '../../core/nervous-types.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  acceptPanicGuard,
  listPendingPanicEvents,
} from '../../cli/commands/nervous.js';

// ─── Helper: Load nervous config from project ──────────────────────────────

function loadNervousConfig(root: string): NervousSystemConfigV1 {
  const configPath = join(root, '.deckent', 'config.json');
  if (!existsSync(configPath)) {
    return { mode: 'balanced', enabled: false };
  }
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const ns = raw.nervous_system;
    if (!ns) return { mode: 'balanced', enabled: false };
    return {
      mode: ns.mode ?? 'balanced',
      actionOverrides: ns.action_overrides ?? ns.actionOverrides ?? undefined,
      quietHours: ns.quiet_hours ?? ns.quietHours ?? undefined,
      throttleWindowMs: ns.throttle_ms ?? ns.throttleWindowMs ?? undefined,
      enabled: ns.enabled ?? false,
    };
  } catch {
    return { mode: 'balanced', enabled: false };
  }
}

function saveNervousConfig(root: string, updates: Record<string, unknown>): void {
  const configPath = join(root, '.deckent', 'config.json');
  let raw: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try { raw = JSON.parse(readFileSync(configPath, 'utf-8')); } catch { /* empty */ }
  }
  if (!raw.nervous_system) raw.nervous_system = {};
  Object.assign(raw.nervous_system as Record<string, unknown>, updates);
  writeFileSync(configPath, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
}

// ─── Subscribers (in-memory, process-lifetime) ──────────────────────────────

const subscribers: Set<string> = new Set();

// ─── Pure handler types ────────────────────────────────────────────────────
// Sprint 180 W2-2 (Task 5): saf fonksiyonlar — IPC queue ile MCP→Executor
// bağlantısını test edilebilir ve register handler'larından bağımsız tutar.

export interface NervousAcceptInput {
  readonly id: string;
  readonly root?: string;
}

export interface NervousAcceptResult {
  readonly accepted: boolean;
  readonly notificationId: string;
  readonly queued: boolean;
  readonly existsInHistory: boolean;
  readonly message: string;
  readonly ipcFile?: string;
}

export interface NervousRejectInput {
  readonly id: string;
  readonly reason?: string;
  readonly root?: string;
}

export interface NervousRejectResult {
  readonly rejected: boolean;
  readonly notificationId: string;
  readonly queued: boolean;
  readonly reason: string | null;
  readonly message: string;
  readonly ipcFile?: string;
}

const NOTIFICATION_ID_PATTERN = /^[a-f0-9-]{36}$/;

function isValidNotificationId(id: string): boolean {
  return NOTIFICATION_ID_PATTERN.test(id) || id.startsWith('ns-');
}

/**
 * Pure handler for `deckent_nervous_accept`.
 *
 * Backward-compat: when `nervous_system.enabled` is false the handler returns
 * the legacy history-only stub response and does NOT touch the IPC queue.
 *
 * When nervous is active the approval is appended to the file-based IPC queue
 * (`.deckent/nervous-ipc/pending/*.json`) so the Executor can resolve it on
 * its next polling tick (1s).
 */
export async function handleNervousAccept(
  input: NervousAcceptInput,
): Promise<NervousAcceptResult> {
  const id = input.id?.trim() ?? '';
  if (!id) {
    throw new Error('id is required');
  }
  if (!isValidNotificationId(id)) {
    throw new Error(`Invalid notification ID: ${id}`);
  }

  const root = input.root ?? process.cwd();
  const config = loadNervousConfig(root);

  // Existing-history check (legacy informational field)
  const history = new NervousHistory(root);
  const all = await history.readAll();
  const existsInHistory = all.some(r => r.notificationId === id);

  if (!config.enabled) {
    return {
      accepted: true,
      notificationId: id,
      queued: false,
      existsInHistory,
      message: `Notification ${id} accepted (nervous inactive — history-only stub).`,
    };
  }

  // Nervous active → enqueue for Executor pickup
  const queue = new NervousIpcQueue(root);
  const ipcFile = await queue.writeApproval({
    notificationId: id,
    decision: 'accepted',
  });

  return {
    accepted: true,
    notificationId: id,
    queued: true,
    existsInHistory,
    message: `Notification ${id} accepted. Action queued for Executor.`,
    ipcFile,
  };
}

/**
 * Pure handler for `deckent_nervous_reject`. Mirrors `handleNervousAccept`
 * with `decision: 'rejected'` and an optional reason.
 */
export async function handleNervousReject(
  input: NervousRejectInput,
): Promise<NervousRejectResult> {
  const id = input.id?.trim() ?? '';
  if (!id) {
    throw new Error('id is required');
  }
  if (!isValidNotificationId(id)) {
    throw new Error(`Invalid notification ID: ${id}`);
  }

  const root = input.root ?? process.cwd();
  const config = loadNervousConfig(root);
  const reason = input.reason ?? null;

  if (!config.enabled) {
    return {
      rejected: true,
      notificationId: id,
      queued: false,
      reason,
      message: `Notification ${id} rejected (nervous inactive — history-only stub).${reason ? ` Reason: ${reason}` : ''}`,
    };
  }

  const queue = new NervousIpcQueue(root);
  const ipcFile = await queue.writeApproval({
    notificationId: id,
    decision: 'rejected',
    reason: input.reason,
  });

  return {
    rejected: true,
    notificationId: id,
    queued: true,
    reason,
    message: `Notification ${id} rejected. Decision queued for Executor.${reason ? ` Reason: ${reason}` : ''}`,
    ipcFile,
  };
}

// ─── Tool Registrations ─────────────────────────────────────────────────────

export function registerNervousSubscribeTool(server: McpServer): void {
  server.registerTool(
    'deckent_nervous_subscribe',
    {
      title: 'Nervous Subscribe',
      description:
        'Subscribe to Nervous System notifications for the current sprint. ' +
        'Registers this MCP client for push notifications. Also surfaces ' +
        'currently pending PanicGuard kill approvals as PANIC_GUARD_KILL_PENDING events (Sprint 180 W4-2).',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        sprintId: z.string().optional().describe('Sprint ID to subscribe to (default: active sprint)'),
        root: z.string().optional().describe('Project root path (for panic event scan)'),
      }),
    },
    async ({ sprintId, root: rootParam }) => {
      const subId = sprintId ?? 'all';
      subscribers.add(subId);
      const root = rootParam ?? process.cwd();

      // Sprint 180 W4-2: include currently pending PanicGuard approval events
      // so MCP subscribers see PANIC_GUARD_KILL_PENDING immediately on subscribe.
      let pendingPanics: ReturnType<typeof listPendingPanicEvents> = [];
      try { pendingPanics = listPendingPanicEvents(root); } catch { pendingPanics = []; }

      // Filter by sprint if explicit sprintId provided
      const filteredPanics = sprintId && sprintId !== 'all'
        ? pendingPanics.filter(p => p.sprintId === sprintId)
        : pendingPanics;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            subscribed: true,
            sprintId: subId,
            message: `Subscribed to Nervous System notifications${sprintId ? ` for ${sprintId}` : ''}`,
            pendingPanics: filteredPanics,
          }),
        }],
      };
    },
  );
}

export function registerNervousAcceptTool(server: McpServer): void {
  server.registerTool(
    'deckent_nervous_accept',
    {
      title: 'Nervous Accept',
      description:
        'Accept a pending Nervous System notification/action. ' +
        'The action will be executed by the Executor. ' +
        'Sprint 180 W4-2: id="panic:<taskId>" approves a PanicGuard-blocked kill.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        id: z.string().describe('Notification ID to accept, or "panic:<taskId>" for PanicGuard approval'),
        root: z.string().optional().describe('Project root path (for panic approval IPC write)'),
      }),
    },
    async ({ id, root: rootParam }) => {
      if (!id || id.trim() === '') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'id is required' }) }],
          isError: true,
        };
      }

      // Sprint 180 W4-2: panic guard approval path
      if (id.startsWith('panic:')) {
        const taskId = id.slice('panic:'.length).trim();
        if (!taskId) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'panic: id requires a non-empty taskId' }) }],
            isError: true,
          };
        }
        const root = rootParam ?? process.cwd();
        const { markerPath, marker } = acceptPanicGuard(root, taskId, 'user-mcp');
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              accepted: true,
              notificationId: id,
              channel: 'PANIC_GUARD_KILL_PENDING',
              taskId,
              markerPath,
              acceptedAt: marker.acceptedAt,
              message: `PanicGuard approval queued for task ${taskId}.`,
            }),
          }],
        };
      }

      // Sprint 180 W2-2 (Task 5): delegate to pure handler — handles backward-
      // compat stub (nervous inactive) and IPC queue write (nervous active).
      try {
        const result = await handleNervousAccept({ id, root: rootParam });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
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

export function registerNervousRejectTool(server: McpServer): void {
  server.registerTool(
    'deckent_nervous_reject',
    {
      title: 'Nervous Reject',
      description:
        'Reject a pending Nervous System notification/action. ' +
        'The action will NOT be executed. Optionally provide a reason.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        id: z.string().describe('Notification ID to reject'),
        reason: z.string().optional().describe('Reason for rejection'),
        root: z.string().optional().describe('Project root path (for IPC queue write)'),
      }),
    },
    async ({ id, reason, root: rootParam }) => {
      try {
        const result = await handleNervousReject({ id, reason, root: rootParam });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
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

export function registerNervousStatusTool(server: McpServer): void {
  server.registerTool(
    'deckent_nervous_status',
    {
      title: 'Nervous Status',
      description:
        'Show Nervous System dashboard: pending notifications, recent history, and current config.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        root: z.string().optional().describe('Project root path'),
      }),
    },
    async ({ root: rootParam }) => {
      const root = rootParam ?? process.cwd();
      const config = loadNervousConfig(root);
      const history = new NervousHistory(root);
      const recent = await history.findRecentReversible(5);
      const allRecords = await history.readAll();

      // Pending = records with outcome 'pending'
      const pending = allRecords.filter(r => r.outcome === 'pending');

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            config: {
              mode: config.mode,
              enabled: config.enabled,
              actionOverrides: config.actionOverrides ?? {},
              quietHours: config.quietHours ?? null,
            },
            pending: pending.map(r => ({
              id: r.notificationId,
              actionId: r.actionId,
              decision: r.decision,
              executedAt: r.executedAt,
            })),
            recent: recent.map(r => ({
              id: r.id,
              actionId: r.actionId,
              decision: r.decision,
              outcome: r.outcome,
              executedAt: r.executedAt,
            })),
            totalRecords: allRecords.length,
            subscribers: subscribers.size,
          }),
        }],
      };
    },
  );
}

export function registerNervousConfigTool(server: McpServer): void {
  server.registerTool(
    'deckent_nervous_config',
    {
      title: 'Nervous Config',
      description:
        'Read or modify Nervous System configuration: authority mode preset, action overrides, and list available actions.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        action: z.enum(['read', 'set_preset', 'set_override', 'list_actions', 'reset'])
          .describe('Config action: read current, set authority preset, set per-action override, list all actions, or reset overrides'),
        preset: z.enum(['strict', 'balanced', 'autopilot', 'full-auto']).optional()
          .describe('Authority mode preset (required for set_preset)'),
        overrides: z.record(z.string(), z.string()).optional()
          .describe('Action overrides map { actionId: policy } (for set_override)'),
        root: z.string().optional().describe('Project root path'),
      }),
    },
    async ({ action, preset, overrides, root: rootParam }) => {
      const root = rootParam ?? process.cwd();

      if (action === 'read') {
        const config = loadNervousConfig(root);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ action: 'read', config }) }],
        };
      }

      if (action === 'list_actions') {
        const actions = ACTION_REGISTRY.map(a => ({
          id: a.id,
          displayName: a.displayName,
          category: a.category,
          defaultRisk: a.defaultRisk,
          reversible: a.reversible,
        }));
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ action: 'list_actions', count: actions.length, actions }),
          }],
        };
      }

      if (action === 'set_preset') {
        if (!preset) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'preset is required for set_preset' }) }],
            isError: true,
          };
        }
        const validModes: AuthorityMode[] = ['strict', 'balanced', 'autopilot', 'full-auto'];
        if (!validModes.includes(preset as AuthorityMode)) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Invalid preset: ${preset}` }) }],
            isError: true,
          };
        }
        saveNervousConfig(root, { mode: preset });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ action: 'set_preset', preset, message: `Authority mode set to: ${preset}` }),
          }],
        };
      }

      if (action === 'set_override') {
        if (!overrides || Object.keys(overrides).length === 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'overrides map is required for set_override' }) }],
            isError: true,
          };
        }
        saveNervousConfig(root, { action_overrides: overrides });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ action: 'set_override', overrides, message: 'Action overrides updated' }),
          }],
        };
      }

      if (action === 'reset') {
        saveNervousConfig(root, { action_overrides: {}, mode: 'balanced' });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ action: 'reset', message: 'Nervous config reset to defaults (balanced, no overrides)' }),
          }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Unknown action: ${action}` }) }],
        isError: true,
      };
    },
  );
}

// ─── Barrel Registration ────────────────────────────────────────────────────

export function registerNervousTools(server: McpServer): void {
  registerNervousSubscribeTool(server);
  registerNervousAcceptTool(server);
  registerNervousRejectTool(server);
  registerNervousStatusTool(server);
  registerNervousConfigTool(server);
}
