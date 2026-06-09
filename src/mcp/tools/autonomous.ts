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
import { join } from 'node:path';
import { enrichResponse } from '../helpers/enrich.js';
import { backlogAdd, backlogList, backlogRemove } from '../../cli/commands/autonomous.js';
import { makeApprovalGate } from '../../orchestra/autonomous/approval-adapter.js';
import type { BacklogEntry } from '../../orchestra/autonomous/backlog-types.js';

// ─── Filesystem layout (mirrors cli/commands/autonomous.ts) ──────────────────

function autonomousDir(root: string): string {
  return join(root, '.deckent', 'autonomous');
}

function pendingPath(root: string): string {
  return join(autonomousDir(root), 'pending.json');
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

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerAutonomousTool(server: McpServer): void {
  server.registerTool(
    'deckent_autonomous',
    {
      title: 'Autonomous Engine',
      description:
        'Control the deckent autonomous execution engine: query status, start/stop ' +
        'the loop, manage the backlog (add/list/remove), and resolve approval gates ' +
        '(pending/approve/reject). Mirrors the `deckent autonomous` CLI subcommands. ' +
        'Note: `start` clears the stop marker and returns launch guidance — the loop ' +
        'process itself must be started via `deckent autonomous start` from a terminal.',
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
        ]).describe(
          'Action to perform. ' +
          'status=query engine state; start=clear stop marker (run loop via CLI); ' +
          'stop=write stop marker; backlog_add/list/remove=manage work queue; ' +
          'pending=list parked approvals; approve/reject=resolve a parked trigger.',
        ),
        root: z.string().optional().describe('Project root path (default: cwd)'),
        // backlog_add / backlog_remove / approve / reject
        id: z.string().optional().describe(
          'Entry/trigger id — required for backlog_add, backlog_remove, approve, reject',
        ),
        // backlog_add
        title: z.string().optional().describe('Entry title — required for backlog_add'),
        kind: z.enum(['task', 'sprint', 'capability']).optional().default('task').describe(
          'Entry kind (task=inline description, sprint=directives ref, capability=F8 broker verb). Default: task',
        ),
        description: z.string().optional().default('').describe(
          'Task description or directives ref — used by backlog_add',
        ),
        policy: z.enum(['auto', 'approval-required', 'risk-tagged']).optional().default('auto').describe(
          'Execution policy for backlog_add. Default: auto',
        ),
        cron: z.string().optional().describe(
          '5-field cron expression for backlog_add — entry recurs at this cadence (omit for one-off)',
        ),
        capability: z.string().optional().describe(
          'kind=capability: dotted verb to invoke (e.g. fs.read, db.query) — backlog_add',
        ),
        capabilityArgs: z.string().optional().describe(
          'kind=capability: JSON object of handler args — backlog_add',
        ),
        connector: z.string().optional().describe(
          'kind=capability: preferred backend/connector id (e.g. odoo, imap) — backlog_add',
        ),
        // approve / reject (prefer `triggerId`, fall back to `id`)
        triggerId: z.string().optional().describe(
          'Trigger ID to approve or reject (alternative to `id` for approve/reject)',
        ),
        reason: z.string().optional().describe('Reason recorded with approve/reject decision'),
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
          const pf = pendingPath(root);
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
          const enriched = enrichResponse('autonomous', {
            action: 'start',
            stopMarkerCleared: wasMarked,
            message:
              'Stop marker cleared. Launch the autonomous loop via: deckent autonomous start',
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
          if (!id) throw new Error('id is required for backlog_add');
          if (!title) throw new Error('title is required for backlog_add');
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
          if (!id) throw new Error('id is required for backlog_remove');
          backlogRemove({ root, id, lang });
          const enriched = enrichResponse('autonomous', { action: 'backlog_remove', id, removed: true });
          return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
        }

        // ── pending ───────────────────────────────────────────────────────────
        if (action === 'pending') {
          const gate = makeApprovalGate({ pendingPath: pendingPath(root) });
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
          if (!tid) throw new Error('triggerId (or id) is required for approve');
          const gate = makeApprovalGate({ pendingPath: pendingPath(root) });
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
          if (!tid) throw new Error('triggerId (or id) is required for reject');
          const gate = makeApprovalGate({ pendingPath: pendingPath(root) });
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
            text: JSON.stringify({ error: true, message: `Unknown action: ${action}` }),
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
