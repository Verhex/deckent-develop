import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
import { enrichResponse } from '../helpers/enrich.js';
import { debugLog } from '../../core/utils.js';

interface TaskFileData {
  id?: string;
  status?: string;
  forceModel?: string;
}

function killTaskById(root: string, taskId: string): boolean {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return false;

  const files = readdirSync(tasksDir);
  const taskFile = files.find(
    (f) => f === `task-${taskId}.json` || (f.endsWith(`-${taskId}.json`) && f.startsWith('task-')),
  );
  if (!taskFile) return false;

  const taskPath = join(tasksDir, taskFile);
  try {
    const data = JSON.parse(readFileSync(taskPath, 'utf-8')) as TaskFileData;
    data.status = 'PAUSED';
    writeFileSync(taskPath, JSON.stringify(data, null, 2) + '\n');
  } catch {
    return false;
  }

  // Clean up heartbeat and lock files
  const hbFile = taskFile.replace('.json', '.hb');
  const hbPath = join(tasksDir, hbFile);
  if (existsSync(hbPath)) {
    try { unlinkSync(hbPath); } catch { /* ignore */ }
  }

  // Remove locks owned by this task
  const locksDir = join(root, LOCKS_DIR);
  if (existsSync(locksDir)) {
    try {
      for (const lockFile of readdirSync(locksDir)) {
        const lockPath = join(locksDir, lockFile);
        const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as { taskId?: string };
        if (lock.taskId === taskId) {
          unlinkSync(lockPath);
        }
      }
    } catch { /* ignore */ }
  }

  return true;
}

function killAllTasks(root: string): number {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return 0;

  const files = readdirSync(tasksDir).filter(
    (f) => f.startsWith('task-') && f.endsWith('.json'),
  );

  let killed = 0;
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as TaskFileData;
      if (data.status === 'EXECUTING' || data.status === 'CLAIMED' || data.status === 'TESTING') {
        const taskId = data.id ?? f.replace('task-', '').replace('.json', '');
        if (killTaskById(root, taskId)) killed++;
      }
    } catch { /* skip */ }
  }

  return killed;
}

export function registerKillTool(server: McpServer): void {
  server.registerTool(
    'deckent_kill',
    {
      title: 'Kill Worker',
      description: 'Stop one or all running workers. Sets task status to PAUSED, removes heartbeat files, and releases any file locks owned by the task. Use when a worker is stuck (stale heartbeat), consuming too many resources, or needs to be restarted. After killing, run deckent_cleanup to remove task artifacts, then deckent_start to restart. CLI parity (ADR-022-V2 + Sprint 189 T-009): force + userExplicit are pass-through panic-guard bypass markers — even when both are set the bypass is only logged (audit-trail), kill itself still requires explicit user intent (feedback_sprint_kill_always_ask_user).',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        taskId: z.string().optional().describe('Specific task ID to kill (e.g. "059-001"). The worker for this task is stopped and its locks released.'),
        all: z.boolean().optional().default(false).describe('Kill ALL active workers (status EXECUTING, CLAIMED, or TESTING). Use when sprint is stuck and needs a full restart.'),
        force: z.boolean().optional().describe('CLI --force parity (Sprint 189 T-009). Marks the kill as a panic-guard bypass attempt. Must be combined with userExplicit; on its own it does nothing. The kill itself still proceeds — this flag only flips the audit-trail breadcrumb.'),
        userExplicit: z.boolean().optional().describe('CLI --user-explicit parity. Explicit human confirmation required to mark the kill as a panic-guard override. Combined with force this writes a debug breadcrumb (mcp:kill:panic-bypass) so post-mortems can correlate the override. Alperen rule (feedback_sprint_kill_always_ask_user): kill default ALWAYS requires user approval — bypass is logged, never silent.'),
      }),
    },
    async ({ taskId, all, force, userExplicit }) => {
      const root = process.cwd();

      // ─── Panic-Guard Bypass Audit (Sprint 189 T-009) ─────────────
      // CLI cli/commands/kill.ts:303-307 exposes --force / --user-explicit
      // pass-through flags. MCP must accept the same shape and emit a
      // breadcrumb when both are true so audit-trail captures the override.
      // Per feedback_sprint_kill_always_ask_user the kill still proceeds —
      // this hook ONLY tags the action; it does not silently elevate trust.
      const bypassRequested = force === true && userExplicit === true;
      if (bypassRequested) {
        debugLog('mcp:kill:panic-bypass', {
          taskId: taskId ?? null,
          all: all === true,
          warn: 'force+userExplicit acknowledged — bypass logged but Alperen rule still requires explicit human intent (feedback_sprint_kill_always_ask_user)',
        });
      } else if (force === true || userExplicit === true) {
        // Partial flag — not enough to mark as bypass, but still noteworthy
        // (helps debugging when a caller forgets one of the pair).
        debugLog('mcp:kill:panic-bypass-partial', {
          taskId: taskId ?? null,
          all: all === true,
          force: force === true,
          userExplicit: userExplicit === true,
        });
      }

      try {
        if (!taskId && !all) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'Provide taskId or set all=true' }) }],
            isError: true,
          };
        }

        if (all) {
          const killed = killAllTasks(root);
          const enriched = enrichResponse('kill', { all: true, killedCount: killed, bypassRequested });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
          };
        }

        const success = killTaskById(root, taskId!);
        const enriched = enrichResponse('kill', { taskId, success, killedCount: success ? 1 : 0, bypassRequested });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
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
