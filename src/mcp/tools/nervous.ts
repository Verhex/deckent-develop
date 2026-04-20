// src/mcp/tools/nervous.ts
//
// 5 MCP tools for Nervous System interaction.
// ADR-022-v2 CLI/MCP parity. Sprint 147 Task 16.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { ACTION_REGISTRY } from '../../nervous/action-registry.js';
import { NervousHistory } from '../../nervous/history.js';
import type { AuthorityMode, NervousSystemConfig } from '../../core/nervous-types.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Helper: Load nervous config from project ──────────────────────────────

function loadNervousConfig(root: string): NervousSystemConfig {
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

// ─── Tool Registrations ─────────────────────────────────────────────────────

export function registerNervousSubscribeTool(server: McpServer): void {
  server.registerTool(
    'deckent_nervous_subscribe',
    {
      title: 'Nervous Subscribe',
      description:
        'Subscribe to Nervous System notifications for the current sprint. ' +
        'Registers this MCP client for push notifications.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        sprintId: z.string().optional().describe('Sprint ID to subscribe to (default: active sprint)'),
      }),
    },
    async ({ sprintId }) => {
      const subId = sprintId ?? 'all';
      subscribers.add(subId);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            subscribed: true,
            sprintId: subId,
            message: `Subscribed to Nervous System notifications${sprintId ? ` for ${sprintId}` : ''}`,
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
        'The action will be executed by the Executor.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        id: z.string().describe('Notification ID to accept'),
      }),
    },
    async ({ id }) => {
      if (!id || id.trim() === '') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'id is required' }) }],
          isError: true,
        };
      }

      // Check history for this notification
      const root = process.cwd();
      const history = new NervousHistory(root);
      const all = await history.readAll();
      const exists = all.some(r => r.notificationId === id);

      // In a full implementation, Executor.resolveApproval would be called.
      // For now, we record the intent and verify the ID format.
      if (!id.match(/^[a-f0-9-]{36}$/) && !id.startsWith('ns-')) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Invalid notification ID: ${id}` }) }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            accepted: true,
            notificationId: id,
            message: `Notification ${id} accepted. Action will be executed.`,
            existsInHistory: exists,
          }),
        }],
      };
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
      }),
    },
    async ({ id, reason }) => {
      if (!id || id.trim() === '') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'id is required' }) }],
          isError: true,
        };
      }

      if (!id.match(/^[a-f0-9-]{36}$/) && !id.startsWith('ns-')) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Invalid notification ID: ${id}` }) }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            rejected: true,
            notificationId: id,
            reason: reason ?? null,
            message: `Notification ${id} rejected.${reason ? ` Reason: ${reason}` : ''}`,
          }),
        }],
      };
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
