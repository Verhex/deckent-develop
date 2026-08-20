// src/mcp/tools/nervous.ts
//
// 5 MCP tools for Nervous System interaction.
// ADR-022-v2 CLI/MCP parity. Sprint 147 Task 16.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { ACTION_REGISTRY } from '../../nervous/action-registry.js';
import { NervousHistory } from '../../nervous/history.js';
import { NervousIpcQueue } from '../../nervous/ipc-queue.js';
import type { AuthorityMode, NervousSystemConfigV1, ExecutionRecord } from '../../core/nervous-types.js';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  unlinkSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { removeNervousPending } from '../../core/pending-approvals.js';
import { BRAIN_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR } from '../../core/constants.js';
import {
  acceptPanicGuard,
  listPendingPanicEvents,
} from '../../cli/commands/nervous.js';
import { getMcpToolDescriptionLanguage, mcpToolDescription } from './description-catalog.js';
import { loadConfig } from '../../core/config.js';
import { getLanguage, getMessage } from '../../cli/helpers/messages.js';

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
  const root = input.root ?? process.cwd();
  const appConfig = await loadConfig(root);
  const lang = getLanguage(appConfig.language);

  if (!id) {
    throw new Error(getMessage('nervous.mcp.id_required', lang));
  }
  if (!isValidNotificationId(id)) {
    throw new Error(getMessage('nervous.mcp.invalid_notification_id', lang, { id }));
  }

  const config = loadNervousConfig(root);

  // Existing-history check (legacy informational field)
  const history = new NervousHistory(root);
  const all = await history.readAll();
  const existsInHistory = all.some(r => r.notificationId === id);

  if (!config.enabled) {
    // W0-TRUTH (#491): accepting must also clear the durable hub, or the entry
    // haunts every status surface forever (2026-07-06 live lie: 4 entries, 5 days).
    removeNervousPending(root, id);
    return {
      accepted: true,
      notificationId: id,
      queued: false,
      existsInHistory,
      message: getMessage('nervous.mcp.accept_stub', lang, { id }),
    };
  }

  // Nervous active → enqueue for Executor pickup
  const queue = new NervousIpcQueue(root);
  const ipcFile = await queue.writeApproval({
    notificationId: id,
    decision: 'accepted',
  });
  // W0-TRUTH (#491): clear the durable hub NOW — the executor's own bridge
  // cleanup is an optional dependency and never fires on this MCP/CLI path.
  removeNervousPending(root, id);

  return {
    accepted: true,
    notificationId: id,
    queued: true,
    existsInHistory,
    message: getMessage('nervous.mcp.accept_queued', lang, { id }),
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
  const root = input.root ?? process.cwd();
  const appConfig = await loadConfig(root);
  const lang = getLanguage(appConfig.language);

  if (!id) {
    throw new Error(getMessage('nervous.mcp.id_required', lang));
  }
  if (!isValidNotificationId(id)) {
    throw new Error(getMessage('nervous.mcp.invalid_notification_id', lang, { id }));
  }

  const config = loadNervousConfig(root);
  const reason = input.reason ?? null;
  const reasonSuffix = reason ? getMessage('nervous.mcp.reject_reason_suffix', lang, { reason }) : '';

  if (!config.enabled) {
    return {
      rejected: true,
      notificationId: id,
      queued: false,
      reason,
      message: `${getMessage('nervous.mcp.reject_stub', lang, { id })}${reasonSuffix}`,
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
    message: `${getMessage('nervous.mcp.reject_queued', lang, { id })}${reasonSuffix}`,
    ipcFile,
  };
}

// ─── Compensating-Action Executor (born-574 / task 382-004) ────────────────
//
// REPL/audit finding: `deckent_nervous_undo` (src/mcp/tools/nervous-edit.ts)
// only ever returns an undo PLAN — nothing in the codebase executes a real
// compensating action, so nothing can actually be undone (silent no-op).
//
// ADR-037 (nervous/action-handlers.ts) scopes what Nervous itself
// self-executes with a REAL, direct disk effect to a narrow maintenance
// allowlist (MAINTENANCE_ACTION_IDS); everything else only ever lands a
// Brain-actionable proposal (.deckent/nervous-recommendations.jsonl) —
// Nervous never touches that resource, so there is nothing on disk to
// reverse for those action ids. Cross-referencing that allowlist against
// ACTION_REGISTRY's `reversible:true` flags leaves exactly one action that is
// BOTH self-executed AND reversible: `ORPHAN_TASK_ARCHIVE` (moves
// `.tasks/task-<n>-*` files into `.brain/archive/sprints/<sprintId>-tasks/`,
// see orchestra/sprint-docs-updater.ts `archiveOrphanTasks`).
//
// `runNervousCompensatingAction` performs a REAL, disk-verifiable reversal
// for that one case and an honest `applied:false` + specific reason for
// every other action id — never a silent/fake success. On a real reversal it
// also appends the compensation to `NervousHistory.markUndone`, closing the
// loop the existing undo PLAN already describes but never executes.
//
// Not yet wired into the live `deckent_nervous_undo` tool: that tool is
// registered in nervous-edit.ts, out of this task's write scope. See this
// task's .result notes (docImpact) for the follow-up wiring work.

/** Registry action ids Nervous self-executes with a real, direct disk effect
 *  (ADR-037 maintenance surface) AND that are marked `reversible:true`. Every
 *  other reversible action is Brain-proposal-only — Nervous never mutated the
 *  resource, so `applied:false` is the only honest answer for it. Kept as an
 *  explicit allowlist (not re-derived from action-handlers.ts, out of this
 *  file's write scope) — a newly-registered maintenance action needs this
 *  list updated by hand; `applied:false` is the fail-safe default either way. */
const SELF_EXECUTED_REVERSIBLE_ACTION_IDS: ReadonlySet<string> = new Set(['ORPHAN_TASK_ARCHIVE']);

export interface NervousCompensatingResult {
  readonly applied: boolean;
  readonly recordId: string;
  readonly actionId: string;
  readonly detail: string;
  readonly restoredFiles?: readonly string[];
}

/** Minimal `NervousHistory` surface `runNervousCompensatingAction` depends on
 *  — injectable so tests can assert the call without touching disk twice. */
export interface NervousCompensatingHistorySink {
  markUndone(originalId: string, compensationDetail: Record<string, unknown>): Promise<void>;
}

function reverseOrphanTaskArchive(record: ExecutionRecord, root: string, lang: string): NervousCompensatingResult {
  const sprintId = record.payload['sprintId'];
  if (typeof sprintId !== 'string' || sprintId.length === 0) {
    return {
      applied: false,
      recordId: record.id,
      actionId: record.actionId,
      detail: getMessage('nervous.mcp.compensate.no_sprint_id', lang),
    };
  }

  const archiveDir = join(root, BRAIN_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR, `${sprintId}-tasks`);
  if (!existsSync(archiveDir)) {
    return {
      applied: false,
      recordId: record.id,
      actionId: record.actionId,
      detail: getMessage('nervous.mcp.compensate.no_archive_dir', lang, { archiveDir }),
    };
  }

  const archivedFiles = readdirSync(archiveDir);
  if (archivedFiles.length === 0) {
    return {
      applied: false,
      recordId: record.id,
      actionId: record.actionId,
      detail: getMessage('nervous.mcp.compensate.archive_empty', lang, { archiveDir }),
    };
  }

  const tasksDir = join(root, '.tasks');
  if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

  const restored: string[] = [];
  const conflicts: string[] = [];
  for (const file of archivedFiles) {
    const dest = join(tasksDir, file);
    if (existsSync(dest)) {
      conflicts.push(file);
      continue;
    }
    copyFileSync(join(archiveDir, file), dest);
    unlinkSync(join(archiveDir, file));
    restored.push(file);
  }

  if (restored.length === 0) {
    return {
      applied: false,
      recordId: record.id,
      actionId: record.actionId,
      detail: getMessage('nervous.mcp.compensate.all_conflict', lang, { count: String(conflicts.length) }),
    };
  }

  return {
    applied: true,
    recordId: record.id,
    actionId: record.actionId,
    detail: conflicts.length > 0
      ? getMessage('nervous.mcp.compensate.restored_with_conflicts', lang, {
        restored: String(restored.length),
        archiveDir,
        skipped: String(conflicts.length),
      })
      : getMessage('nervous.mcp.compensate.restored', lang, { restored: String(restored.length), archiveDir }),
    restoredFiles: restored,
  };
}

function computeCompensatingAction(record: ExecutionRecord, root: string, lang: string): NervousCompensatingResult {
  if (!SELF_EXECUTED_REVERSIBLE_ACTION_IDS.has(record.actionId)) {
    return {
      applied: false,
      recordId: record.id,
      actionId: record.actionId,
      detail: getMessage('nervous.mcp.compensate.no_action_available', lang, { actionId: record.actionId }),
    };
  }

  switch (record.actionId) {
    case 'ORPHAN_TASK_ARCHIVE':
      return reverseOrphanTaskArchive(record, root, lang);
    default:
      // Defensive: a future id added to SELF_EXECUTED_REVERSIBLE_ACTION_IDS
      // without a matching case here must stay honest, not silently succeed.
      return {
        applied: false,
        recordId: record.id,
        actionId: record.actionId,
        detail: getMessage('nervous.mcp.compensate.no_reversal_impl', lang, { actionId: record.actionId }),
      };
  }
}

/**
 * Real compensating-action executor for a Nervous `ExecutionRecord` (born-574
 * / task 382-004). Performs a genuine, disk-verifiable reversal for the one
 * action Nervous both self-executes and marks reversible (`ORPHAN_TASK_ARCHIVE`),
 * and returns an honest `applied:false` + specific reason for every other
 * action id — never a silent/fake success. On a real reversal, appends the
 * compensation to `NervousHistory.markUndone` (default sink: `new
 * NervousHistory(root)`, injectable for tests).
 */
export async function runNervousCompensatingAction(
  record: ExecutionRecord,
  root: string,
  historySink?: NervousCompensatingHistorySink,
): Promise<NervousCompensatingResult> {
  const appConfig = await loadConfig(root);
  const lang = getLanguage(appConfig.language);
  const result = computeCompensatingAction(record, root, lang);
  if (result.applied) {
    const sink = historySink ?? new NervousHistory(root);
    await sink.markUndone(record.id, {
      compensatingAction: result.actionId,
      restoredFiles: result.restoredFiles ?? [],
      detail: result.detail,
    });
  }
  return result;
}

// ─── Tool Registrations ─────────────────────────────────────────────────────

export function registerNervousSubscribeTool(server: McpServer): void {
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_nervous_subscribe',
    {
      title: getMessage('nervous.mcp.subscribe.title', registerLang),
      description: mcpToolDescription('deckent_nervous_subscribe'),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        sprintId: z.string().optional().describe(getMessage('nervous.mcp.subscribe.sprint_id_desc', registerLang)),
        root: z.string().optional().describe(getMessage('nervous.mcp.subscribe.root_desc', registerLang)),
      }),
    },
    async ({ sprintId, root: rootParam }) => {
      const subId = sprintId ?? 'all';
      subscribers.add(subId);
      const root = rootParam ?? process.cwd();
      const appConfig = await loadConfig(root);
      const lang = getLanguage(appConfig.language);

      // Sprint 180 W4-2: include currently pending PanicGuard approval events
      // so MCP subscribers see PANIC_GUARD_KILL_PENDING immediately on subscribe.
      let pendingPanics: ReturnType<typeof listPendingPanicEvents> = [];
      try { pendingPanics = listPendingPanicEvents(root); } catch { pendingPanics = []; }

      // Filter by sprint if explicit sprintId provided
      const filteredPanics = sprintId && sprintId !== 'all'
        ? pendingPanics.filter(p => p.sprintId === sprintId)
        : pendingPanics;

      const sprintSuffix = sprintId ? getMessage('nervous.mcp.subscribed_for_sprint', lang, { sprintId }) : '';

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            subscribed: true,
            sprintId: subId,
            message: getMessage('nervous.mcp.subscribed', lang, { sprintSuffix }),
            pendingPanics: filteredPanics,
          }),
        }],
      };
    },
  );
}

export function registerNervousAcceptTool(server: McpServer): void {
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_nervous_accept',
    {
      title: getMessage('nervous.mcp.accept.title', registerLang),
      description: mcpToolDescription('deckent_nervous_accept'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        id: z.string().describe(getMessage('nervous.mcp.accept.id_desc', registerLang)),
        root: z.string().optional().describe(getMessage('nervous.mcp.accept.root_desc', registerLang)),
      }),
    },
    async ({ id, root: rootParam }) => {
      const root = rootParam ?? process.cwd();
      const appConfig = await loadConfig(root);
      const lang = getLanguage(appConfig.language);

      if (!id || id.trim() === '') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: getMessage('nervous.mcp.id_required', lang) }) }],
          isError: true,
        };
      }

      // Sprint 180 W4-2: panic guard approval path
      if (id.startsWith('panic:')) {
        const taskId = id.slice('panic:'.length).trim();
        if (!taskId) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: getMessage('nervous.mcp.panic_task_id_required', lang) }) }],
            isError: true,
          };
        }
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
              message: getMessage('nervous.mcp.panic_queued', lang, { taskId }),
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
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_nervous_reject',
    {
      title: getMessage('nervous.mcp.reject.title', registerLang),
      description: mcpToolDescription('deckent_nervous_reject'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        id: z.string().describe(getMessage('nervous.mcp.reject.id_desc', registerLang)),
        reason: z.string().optional().describe(getMessage('nervous.mcp.reject.reason_desc', registerLang)),
        root: z.string().optional().describe(getMessage('nervous.mcp.reject.root_desc', registerLang)),
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
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_nervous_status',
    {
      title: getMessage('nervous.mcp.status.title', registerLang),
      description: mcpToolDescription('deckent_nervous_status'),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        root: z.string().optional().describe(getMessage('nervous.mcp.root_desc', registerLang)),
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
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_nervous_config',
    {
      title: getMessage('nervous.mcp.config.title', registerLang),
      description: mcpToolDescription('deckent_nervous_config'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        action: z.enum(['read', 'set_preset', 'set_override', 'list_actions', 'reset'])
          .describe(getMessage('nervous.mcp.config.action_desc', registerLang)),
        preset: z.enum(['strict', 'balanced', 'autopilot', 'full-auto']).optional()
          .describe(getMessage('nervous.mcp.config.preset_desc', registerLang)),
        overrides: z.record(z.string(), z.string()).optional()
          .describe(getMessage('nervous.mcp.config.overrides_desc', registerLang)),
        root: z.string().optional().describe(getMessage('nervous.mcp.root_desc', registerLang)),
      }),
    },
    async ({ action, preset, overrides, root: rootParam }) => {
      const root = rootParam ?? process.cwd();
      const appConfig = await loadConfig(root);
      const lang = getLanguage(appConfig.language);

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
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: getMessage('nervous.mcp.config.preset_required', lang) }) }],
            isError: true,
          };
        }
        const validModes: AuthorityMode[] = ['strict', 'balanced', 'autopilot', 'full-auto'];
        if (!validModes.includes(preset as AuthorityMode)) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: getMessage('nervous.mcp.config.invalid_preset', lang, { preset }) }) }],
            isError: true,
          };
        }
        saveNervousConfig(root, { mode: preset });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ action: 'set_preset', preset, message: getMessage('nervous.mcp.config.preset_set', lang, { preset }) }),
          }],
        };
      }

      if (action === 'set_override') {
        if (!overrides || Object.keys(overrides).length === 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: getMessage('nervous.mcp.config.overrides_required', lang) }) }],
            isError: true,
          };
        }
        saveNervousConfig(root, { action_overrides: overrides });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ action: 'set_override', overrides, message: getMessage('nervous.mcp.config.overrides_updated', lang) }),
          }],
        };
      }

      if (action === 'reset') {
        saveNervousConfig(root, { action_overrides: {}, mode: 'balanced' });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ action: 'reset', message: getMessage('nervous.mcp.config.reset_done', lang) }),
          }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: getMessage('nervous.mcp.config.unknown_action', lang, { action }) }) }],
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
