// ─── MCP Tools: autonomous-surface ────────────────────────────────────────────
// `deckent_autonomous_backlog` + `deckent_autonomous_status` (Sıra-74 parity
// slice, Sprint 359 Task 359-016).
//
// The existing `deckent_autonomous` tool (autonomous.ts) already covers
// backlog_list/add/remove + status, but does so by importing
// `backlogAdd/backlogList/backlogRemove` from `cli/commands/autonomous.js` —
// an `mcp/ -> cli/` import that ADR-D-004 C3 forbids ("Surfaces are thin and
// non-cross-importing ... MUST NOT import one another"). This module talks
// directly to `orchestra/autonomous/backlog.ts` (the compliant `mcp/ ->
// orchestra/` path) instead, mirroring backlog.ts's own callers.
//
// No `start` action: the autonomous loop (`runAutonomousLoop`) is a
// long-running process — starting it from an MCP tool handler in the same
// stdio process risks blocking the server (the `deckent_start` gotcha).
// `deckent_autonomous action=start` remains the one documented surface for
// that CLI-launch guidance.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';
import { loadBacklog, validateBacklogEntry } from '../../orchestra/autonomous/backlog.js';
import type { BacklogEntry, BacklogStatus } from '../../orchestra/autonomous/backlog-types.js';
import { nextRun } from '../../core/scheduled-flow.js';
import { autonomousPendingPath } from '../../core/constants.js';
import { loadConfig } from '../../core/config.js';
import { getLanguage, getMessage } from '../../cli/helpers/messages.js';
import { getMcpToolDescriptionLanguage, mcpToolDescription } from './description-catalog.js';

// ─── Filesystem layout (mirrors autonomous.ts / cli/commands/autonomous.ts) ──

function autonomousDir(root: string): string {
  return join(root, '.deckent', 'autonomous');
}

function backlogPath(root: string): string {
  return join(autonomousDir(root), 'backlog.json');
}

function stopMarkerPath(root: string): string {
  return join(autonomousDir(root), 'stop');
}


// ─── Shared response helpers (mirrors catalog-parity.ts) ────────────────────

function ok(data: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function fail(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
    isError: true,
  };
}

// ─── deckent_autonomous_backlog ───────────────────────────────────────────────

export function registerAutonomousBacklogTool(server: McpServer): void {
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_autonomous_backlog',
    {
      title: getMessage('autonomous.mcp_backlog.title', registerLang),
      description: mcpToolDescription('deckent_autonomous_backlog'),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        action: z.enum(['list', 'add', 'remove']).describe(getMessage('autonomous.mcp_backlog.action_desc', registerLang)),
        root: z.string().optional().describe(getMessage('autonomous.mcp.root_desc', registerLang)),
        id: z.string().optional().describe(getMessage('autonomous.mcp_backlog.id_desc', registerLang)),
        title: z.string().optional().describe(getMessage('autonomous.mcp_backlog.entry_title_desc', registerLang)),
        kind: z.enum(['task', 'sprint', 'capability']).optional().default('task').describe(
          getMessage('autonomous.mcp_backlog.kind_desc', registerLang),
        ),
        description: z.string().optional().default('').describe(
          getMessage('autonomous.mcp_backlog.description_desc', registerLang),
        ),
        policy: z.enum(['auto', 'approval-required', 'risk-tagged']).optional().default('auto').describe(
          getMessage('autonomous.mcp_backlog.policy_desc', registerLang),
        ),
        cron: z.string().optional().describe(
          getMessage('autonomous.mcp_backlog.cron_desc', registerLang),
        ),
      }),
    },
    async ({ action, root: rootParam, id, title, kind, description, policy, cron }) => {
      const root = rootParam ?? process.cwd();
      const path = backlogPath(root);
      const appConfig = await loadConfig(root);
      const lang = getLanguage(appConfig.language);

      try {
        if (action === 'list') {
          const bl = loadBacklog(path);
          return ok({ action, count: bl.entries.length, entries: bl.entries });
        }

        if (action === 'add') {
          if (!id) return fail(getMessage('autonomous.mcp_backlog.id_required_add', lang));
          if (!title) return fail(getMessage('autonomous.mcp_backlog.title_required_add', lang));
          if (cron !== undefined) {
            try {
              nextRun(cron, new Date());
            } catch (err) {
              return fail(getMessage('autonomous.mcp_backlog.invalid_cron', lang, {
                cron,
                error: err instanceof Error ? err.message : String(err),
              }));
            }
          }

          const bl = loadBacklog(path);
          if (bl.entries.some((e) => e.id === id)) {
            return fail(getMessage('autonomous.mcp_backlog.duplicate', lang, { id }));
          }

          const entry: BacklogEntry = {
            id,
            title,
            kind: kind ?? 'task',
            spec: { description: description ?? '' },
            policy: policy ?? 'auto',
            trigger: cron !== undefined ? { type: 'recurring', cron } : { type: 'one-off' },
            status: 'pending',
            lastRun: null,
            lastResult: null,
          };
          const validationError = validateBacklogEntry(entry);
          if (validationError) return fail(validationError);

          bl.entries.push(entry);
          mkdirSync(dirname(path), { recursive: true });
          atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
          return ok({ action, id, added: true });
        }

        // action === 'remove'
        if (!id) return fail(getMessage('autonomous.mcp_backlog.id_required_remove', lang));
        const bl = loadBacklog(path);
        const before = bl.entries.length;
        bl.entries = bl.entries.filter((e) => e.id !== id);
        if (bl.entries.length === before) {
          return fail(getMessage('autonomous.mcp_backlog.not_found', lang, { id }));
        }
        mkdirSync(dirname(path), { recursive: true });
        atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
        return ok({ action, id, removed: true });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ─── deckent_autonomous_status ────────────────────────────────────────────────

export function registerAutonomousStatusTool(server: McpServer): void {
  const registerLang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_autonomous_status',
    {
      title: getMessage('autonomous.mcp_status.title', registerLang),
      description: mcpToolDescription('deckent_autonomous_status'),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        root: z.string().optional().describe(getMessage('autonomous.mcp.root_desc', registerLang)),
      }),
    },
    async ({ root: rootParam }) => {
      const root = rootParam ?? process.cwd();

      try {
        let backlogTotal = 0;
        const backlogCounts: Record<BacklogStatus, number> = {
          pending: 0,
          running: 0,
          parked: 0,
          done: 0,
          failed: 0,
        };
        try {
          const bl = loadBacklog(backlogPath(root));
          backlogTotal = bl.entries.length;
          for (const e of bl.entries) backlogCounts[e.status]++;
        } catch {
          // tolerate a missing/corrupt backlog file — status is best-effort
        }

        let pendingApprovals = 0;
        const pf = autonomousPendingPath(root);
        if (existsSync(pf)) {
          try {
            const raw = JSON.parse(readFileSync(pf, 'utf-8'));
            if (Array.isArray(raw)) pendingApprovals = raw.length;
          } catch {
            // tolerate corrupt pending file
          }
        }

        return ok({
          stopMarkerPresent: existsSync(stopMarkerPath(root)),
          backlogTotal,
          backlogCounts,
          pendingApprovals,
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

// ─── Barrel Registration ────────────────────────────────────────────────────

export function registerAutonomousSurfaceTools(server: McpServer): void {
  registerAutonomousBacklogTool(server);
  registerAutonomousStatusTool(server);
}
