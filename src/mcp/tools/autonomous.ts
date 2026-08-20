// src/mcp/tools/autonomous.ts
//
// `deckent_autonomous` MCP tool — control surface for the autonomous engine.
// AUT-8 (Sprint 260-009): mirrors the CLI `deckent autonomous` subcommands
// (status / start / stop / backlog / approve / reject) without reimplementing
// the underlying logic — delegates to existing backlog + approval-adapter APIs.
//
// ADR-022 (CLI/MCP parity), ADR-040 (Nervous System / autonomous engine).

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichResponse } from '../helpers/enrich.js';
import { backlogAdd, backlogList, backlogRemove } from '../../cli/commands/autonomous.js';
import { makeApprovalGate } from '../../orchestra/autonomous/approval-adapter.js';
import { autonomousPendingPath } from '../../core/constants.js';
import type { BacklogEntry } from '../../orchestra/autonomous/backlog-types.js';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { getMessage } from '../../cli/helpers/messages.js';
import { getMcpToolDescriptionLanguage, mcpToolDescription } from './description-catalog.js';

// ─── Filesystem layout (mirrors cli/commands/autonomous.ts) ──────────────────

function autonomousDir(root: string): string {
  return join(root, '.deckent', 'autonomous');
}


function stopMarkerPath(root: string): string {
  return join(autonomousDir(root), 'stop');
}

function eventsPath(root: string): string {
  return join(root, '.deckent', 'autonomous-events.jsonl');
}

function ensureAutonomousDir(root: string): void {
  const dir = autonomousDir(root);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loopPidPath(root: string): string {
  return join(autonomousDir(root), 'loop.pid');
}

interface LoopPidRecord {
  pid: number;
  startedAt: string;
}

/** Best-effort read of the recorded loop pid — null on any missing/corrupt state. */
function readLoopPid(root: string): LoopPidRecord | null {
  const path = loopPidPath(root);
  if (!existsSync(path)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    if (raw && typeof raw === 'object' && typeof (raw as { pid?: unknown }).pid === 'number') {
      return raw as LoopPidRecord;
    }
    return null;
  } catch {
    return null;
  }
}

/** Is `pid` a live process? EPERM (process exists, no signal permission) still counts as alive. */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Raw `autonomous.enabled` read straight off the project config file.
 * Deliberately NOT `loadConfig()` (core/config.ts) — that module's fs surface
 * (statSync + friends) goes beyond the existsSync/readFileSync pair this file
 * already uses everywhere else, which would force every caller/test of this
 * tool to mock a much wider fs API just to exercise `action=start`.
 */
function isAutonomousEnabled(root: string): boolean {
  const configPath = join(root, PROJECT_CONFIG_PATH);
  if (!existsSync(configPath)) return false;
  try {
    const doc: unknown = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (!doc || typeof doc !== 'object') return false;
    const autonomous = (doc as Record<string, unknown>)['autonomous'];
    return !!autonomous && typeof autonomous === 'object'
      && (autonomous as Record<string, unknown>)['enabled'] === true;
  } catch {
    return false;
  }
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerAutonomousTool(server: McpServer): void {
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_autonomous',
    {
      title: getMessage('autonomous.mcp_engine.title', registerLang),
      description: mcpToolDescription('deckent_autonomous'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        action: z.enum([
          'status',
          'start',
          'stop',
          'backlog_add',
          'backlog_list',
          'backlog_remove',
          'pending',
          'approve',
          'reject',
        ]).describe(getMessage('autonomous.mcp_engine.action_desc', registerLang)),
        root: z.string().optional().describe(getMessage('autonomous.mcp.root_desc', registerLang)),
        // backlog_add / backlog_remove / approve / reject
        id: z.string().optional().describe(getMessage('autonomous.mcp_engine.id_desc', registerLang)),
        // backlog_add
        title: z.string().optional().describe(getMessage('autonomous.mcp_engine.title_desc', registerLang)),
        kind: z.enum(['task', 'sprint', 'capability']).optional().default('task').describe(
          getMessage('autonomous.mcp_engine.kind_desc', registerLang),
        ),
        description: z.string().optional().default('').describe(
          getMessage('autonomous.mcp_engine.description_desc', registerLang),
        ),
        policy: z.enum(['auto', 'approval-required', 'risk-tagged']).optional().default('auto').describe(
          getMessage('autonomous.mcp_engine.policy_desc', registerLang),
        ),
        cron: z.string().optional().describe(
          getMessage('autonomous.mcp_engine.cron_desc', registerLang),
        ),
        capability: z.string().optional().describe(
          getMessage('autonomous.mcp_engine.capability_desc', registerLang),
        ),
        capabilityArgs: z.string().optional().describe(
          getMessage('autonomous.mcp_engine.capability_args_desc', registerLang),
        ),
        connector: z.string().optional().describe(
          getMessage('autonomous.mcp_engine.connector_desc', registerLang),
        ),
        // approve / reject (prefer `triggerId`, fall back to `id`)
        triggerId: z.string().optional().describe(
          getMessage('autonomous.mcp_engine.trigger_id_desc', registerLang),
        ),
        reason: z.string().optional().describe(getMessage('autonomous.mcp_engine.reason_desc', registerLang)),
      }),
    },
    async ({
      action,
      root: rootParam,
      id,
      title,
      kind,
      description,
      policy,
      cron,
      capability,
      capabilityArgs,
      connector,
      triggerId,
      reason,
    }) => {
      const root = rootParam ?? process.cwd();
      const lang = 'en';

      try {
        // ── status ───────────────────────────────────────────────────────────
        if (action === 'status') {
          const pf = autonomousPendingPath(root);
          let pendingCount = 0;
          if (existsSync(pf)) {
            try {
              const raw = JSON.parse(readFileSync(pf, 'utf-8'));
              if (Array.isArray(raw)) pendingCount = raw.length;
            } catch { /* tolerate corrupt pending file */ }
          }

          const ef = eventsPath(root);
          const recentAuditEvents: unknown[] = [];
          if (existsSync(ef)) {
            try {
              const lines = readFileSync(ef, 'utf-8')
                .split('\n')
                .filter((l) => l.trim().length > 0);
              for (const line of lines.slice(-5)) {
                try { recentAuditEvents.push(JSON.parse(line)); } catch { /* skip */ }
              }
            } catch { /* tolerate missing events file */ }
          }

          let backlog: BacklogEntry[] = [];
          try { backlog = backlogList({ root }); } catch { /* no backlog yet */ }
          const counts = { pending: 0, running: 0, parked: 0, done: 0, failed: 0 };
          for (const e of backlog) {
            if (e.status in counts) counts[e.status as keyof typeof counts]++;
          }

          const enriched = enrichResponse('autonomous', {
            action: 'status',
            pendingApprovals: pendingCount,
            stopMarkerPresent: existsSync(stopMarkerPath(root)),
            backlogTotal: backlog.length,
            backlogCounts: counts,
            recentAuditEvents,
          });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        // ── start ─────────────────────────────────────────────────────────────
        if (action === 'start') {
          ensureAutonomousDir(root);
          const stopFile = stopMarkerPath(root);
          const wasMarked = existsSync(stopFile);
          if (wasMarked) rmSync(stopFile);

          // Don't spawn a second loop over the same backlog — an already-alive
          // recorded pid wins over a fresh spawn.
          const existingPid = readLoopPid(root);
          if (existingPid && isPidAlive(existingPid.pid)) {
            const enriched = enrichResponse('autonomous', {
              action: 'start',
              spawned: false,
              alreadyRunning: true,
              pid: existingPid.pid,
              startedAt: existingPid.startedAt,
              stopMarkerCleared: wasMarked,
              message: getMessage('autonomous.mcp_engine.start_already_running', lang, {
                pid: String(existingPid.pid),
                startedAt: existingPid.startedAt,
              }),
            });
            return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
          }
          if (existingPid) {
            // Stale record (process no longer alive) — clear it before proceeding.
            try { rmSync(loopPidPath(root)); } catch { /* best-effort */ }
          }

          if (!isAutonomousEnabled(root)) {
            const enriched = enrichResponse('autonomous', {
              action: 'start',
              spawned: false,
              stopMarkerCleared: wasMarked,
              message: getMessage('autonomous.mcp_engine.start_disabled', lang),
            });
            return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
          }

          // Real spawn: fork the CLI's own `autonomous start` as a DETACHED background
          // process (mirrors deckent_start's Sprint-143 fix — see src/mcp/tools/start.ts)
          // so the long-running loop never blocks this MCP server's stdio transport, and
          // reuses handleStart's existing config/v1-v2/reactive/nervous wiring untouched.
          const entryPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cli', 'entry.js');
          let child: ChildProcess;
          try {
            child = spawn(process.execPath, [entryPath, 'autonomous', 'start', '--root', root], {
              detached: true,
              stdio: 'ignore',
              cwd: root,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const enriched = enrichResponse('autonomous', {
              action: 'start',
              spawned: false,
              stopMarkerCleared: wasMarked,
              message: getMessage('autonomous.mcp_engine.start_spawn_failed', lang, { message }),
            });
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
              isError: true,
            };
          }

          const pid = child.pid;
          const startedAt = new Date().toISOString();
          if (pid !== undefined) {
            writeFileSync(loopPidPath(root), JSON.stringify({ pid, startedAt }, null, 2), 'utf-8');
          }
          // A spawn failure surfaces asynchronously via 'error' (e.g. missing entry
          // point) — clear the pid record so the next start() doesn't report a phantom
          // "already running" loop. A normal loop exit (stop marker honored) does the same.
          child.on('error', () => { try { rmSync(loopPidPath(root)); } catch { /* best-effort */ } });
          child.on('exit', () => { try { rmSync(loopPidPath(root)); } catch { /* best-effort */ } });
          child.unref();

          const enriched = enrichResponse('autonomous', {
            action: 'start',
            spawned: true,
            pid,
            startedAt,
            stopMarkerCleared: wasMarked,
            message: pid !== undefined
              ? getMessage('autonomous.mcp_engine.start_spawned', lang, { pid: String(pid) })
              : getMessage('autonomous.mcp_engine.start_no_pid', lang),
          });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        // ── stop ──────────────────────────────────────────────────────────────
        if (action === 'stop') {
          ensureAutonomousDir(root);
          writeFileSync(stopMarkerPath(root), new Date().toISOString(), 'utf-8');
          const enriched = enrichResponse('autonomous', { action: 'stop', stopped: true });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        // ── backlog_add ───────────────────────────────────────────────────────
        if (action === 'backlog_add') {
          if (!id) throw new Error(getMessage('autonomous.mcp_engine.id_required_backlog_add', lang));
          if (!title) throw new Error(getMessage('autonomous.mcp_engine.title_required_backlog_add', lang));
          backlogAdd({
            root,
            id,
            title,
            kind: kind ?? 'task',
            description: description ?? '',
            policy: (policy ?? 'auto') as BacklogEntry['policy'],
            lang,
            cron,
            capability,
            capabilityArgs,
            connector,
          });
          const enriched = enrichResponse('autonomous', { action: 'backlog_add', id, added: true });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        // ── backlog_list ──────────────────────────────────────────────────────
        if (action === 'backlog_list') {
          const entries = backlogList({ root });
          const enriched = enrichResponse('autonomous', {
            action: 'backlog_list',
            count: entries.length,
            entries,
          });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        // ── backlog_remove ────────────────────────────────────────────────────
        if (action === 'backlog_remove') {
          if (!id) throw new Error(getMessage('autonomous.mcp_engine.id_required_backlog_remove', lang));
          backlogRemove({ root, id, lang });
          const enriched = enrichResponse('autonomous', { action: 'backlog_remove', id, removed: true });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        // ── pending ───────────────────────────────────────────────────────────
        if (action === 'pending') {
          const gate = makeApprovalGate({ pendingPath: autonomousPendingPath(root) });
          const items = gate.pending();
          const enriched = enrichResponse('autonomous', {
            action: 'pending',
            count: items.length,
            items: [...items],
          });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        // ── approve ───────────────────────────────────────────────────────────
        if (action === 'approve') {
          const tid = triggerId ?? id;
          if (!tid) throw new Error(getMessage('autonomous.mcp_engine.id_required_approve', lang));
          const gate = makeApprovalGate({ pendingPath: autonomousPendingPath(root) });
          gate.accept(tid, reason);
          const enriched = enrichResponse('autonomous', {
            action: 'approve',
            triggerId: tid,
            approved: true,
          });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        // ── reject ────────────────────────────────────────────────────────────
        if (action === 'reject') {
          const tid = triggerId ?? id;
          if (!tid) throw new Error(getMessage('autonomous.mcp_engine.id_required_reject', lang));
          const gate = makeApprovalGate({ pendingPath: autonomousPendingPath(root) });
          gate.reject(tid, reason);
          const enriched = enrichResponse('autonomous', {
            action: 'reject',
            triggerId: tid,
            rejected: true,
          });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: getMessage('autonomous.mcp_engine.unknown_action', lang, { action }),
            }),
          }],
          isError: true,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
