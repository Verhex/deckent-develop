import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fork } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../core/config.js';
import { readContext, planSprint, BrainError } from '../../orchestra/brain.js';
import type { SprintSizeRecommendation } from '../../core/types.js';
import { writeJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatStartResponse, formatErrorResponse, wrapResponse } from '../helpers/format.js';
import { isSprintLocked } from '../../core/multi-ide.js';
import {
  getIpcDir,
  IPC_CONFIG_FILE,
  type SprintRunnerConfig,
} from '../../orchestra/sprint-runner-entry.js';

export function registerStartTool(server: McpServer): void {
  server.registerTool(
    'deckent_start',
    {
      title: 'Start Sprint',
      description: 'Start a full sprint in the background. Runs the complete lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP. Returns immediately with a jobId — the sprint continues asynchronously. Use deckent_status to monitor progress and deckent_review to evaluate results. Prerequisite: deckent_init + deckent_set_directives must have been run.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        autoApprove: z.boolean().optional().default(true).describe('Auto-approve all worker tool calls with --dangerously-skip-permissions. Deckent standard: workers MUST have full write permissions. Set false only for debugging.'),
        dryRun: z.boolean().optional().default(false).describe('Plan the sprint without spawning workers. Returns the planned tasks list so you can review before committing. No workers are started, no files are changed.'),
        force: z.boolean().optional().default(false).describe('Skip pre-flight doctor checks. Normally deckent_start runs health checks before spawning; use force=true to bypass when you know the environment is ready.'),
        timeout: z.number().int().positive().optional().describe('Sprint maximum duration in milliseconds (default: 30 minutes = 1800000). Sprint is marked TIMEOUT if workers do not complete within this window.'),
        sandbox: z.boolean().optional().default(false).describe('Run sprint in sandbox mode: stashes local git changes before spawning and restores them after the sprint completes. Safe experimentation — no permanent changes on failure.'),
      }),
    },
    async ({ dryRun, force, timeout, sandbox }) => {
      const root = process.cwd();
      // CLI/MCP Parity Notes:
      // - autoApprove: IMMUTABLE true. CLI hardcodes true; MCP now hardcodes true at runSprint call.
      //   The schema param is kept for API surface parity only (debugging use case).
      // - spawn_backend: Both CLI and MCP read from config via loadConfig() → sprint-controller
      //   uses config.spawn_backend automatically. No explicit handling needed here.
      // - timeout: Both pass timeoutMs to runSprint (undefined = 30min default in result-collector).
      //   CLI parses string→int; MCP accepts number directly. Behavior equivalent.
      // - force: CLI skips both sprint lock check AND doctor pre-flight checks.
      //   MCP skips only sprint lock check — no doctor check by design (non-interactive
      //   context; doctor imports are in cli/ layer and cannot be imported from mcp/).
      //   KNOWN DIVERGENCE: documented, acceptable for non-interactive MCP context.

      try {
        const config = await loadConfig(root);

        // ─── Sprint Lock Check ─────────────────────────────────────
        if (!force) {
          const lockInfo = isSprintLocked(root);
          if (lockInfo.locked) {
            const errData = {
              error: true,
              success: false,
              message: `Sprint already running (PID ${lockInfo.pid}, env: ${lockInfo.env}, sprint: ${lockInfo.sprintId}, started: ${lockInfo.acquiredAt}). Use force=true to override.`,
            };
            const errSummary = formatErrorResponse({ message: errData.message });
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(errData, errSummary)) }],
              isError: true,
            };
          }
        }

        // Dry-run mode: plan only, no spawn
        if (dryRun) {
          const context = readContext(root);
          const recommendation: SprintSizeRecommendation = {
            size: 'full',
            maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
            modelConstraint: null,
            reason: 'No usage constraints',
          };
          const sprint = await planSprint(root, config, context, recommendation, { dryRun: true });
          const taskList = sprint.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            model: t.model,
            effort: t.effort,
            assignedAgent: t.assignedAgent,
          }));
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(enrichResponse('start', {
                success: true,
                dryRun: true,
                sprintId: sprint.id,
                taskCount: sprint.tasks.length,
                tasks: taskList,
                message: 'Dry-run complete. No workers spawned. Review tasks, then call deckent_start without dryRun to execute.',
              })),
            }],
          };
        }

        const jobId = `sprint-${Date.now()}`;
        const startedAt = new Date().toISOString();

        writeJobState(root, { jobId, status: 'RUNNING', startedAt });

        // ─── Detached Sprint Runner (Sprint 143 — MCP Disconnect Fix) ──
        // Instead of running runSprint() in-process (which blocks the MCP
        // stdio event loop for long sprints), we fork a detached child process.
        // This frees the MCP server's stdio transport immediately.
        const ipcDir = getIpcDir(root, jobId);
        mkdirSync(ipcDir, { recursive: true });

        const runnerConfig: SprintRunnerConfig = {
          projectRoot: root,
          jobId,
          autoApprove: true, // Immutable — workers MUST have full write permissions
          sandboxMode: sandbox,
          timeoutMs: timeout,
        };
        writeFileSync(join(ipcDir, IPC_CONFIG_FILE), JSON.stringify(runnerConfig, null, 2), 'utf-8');

        // Resolve the compiled runner entry point
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const runnerPath = join(__dirname, '..', '..', 'orchestra', 'sprint-runner-entry.js');

        // Fork as detached child — unref() so MCP server can exit independently
        const child = fork(runnerPath, [ipcDir], {
          detached: true,
          stdio: 'ignore', // Don't inherit stdio — critical for MCP transport freedom
          cwd: root,
        });

        // IPC cleanup: success case — remove orphan dir so .deckent/ stays tidy.
        // Failure case keeps ipcDir for debugging; pre-flight cleaner sweeps later.
        child.on('exit', (code) => {
          if (code === 0) {
            try { rmSync(ipcDir, { recursive: true, force: true }); } catch { /* best-effort */ }
          }
        });

        child.unref();

        const startData = {
          success: true,
          jobId,
          status: 'RUNNING',
          message: 'Sprint started in background. Use deckent_status to track progress.',
          activeWorkers: 0,
          queuedTasks: 0,
          estimatedDuration: '~10-30 minutes',
        };

        const enrichedStart = enrichResponse('start', startData);
        const summary = formatStartResponse(startData);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(wrapResponse(enrichedStart, summary)),
          }],
        };
      } catch (error) {
        const message = error instanceof BrainError
          ? `Sprint failed at phase ${error.phase ?? 'unknown'}: ${error.message}`
          : error instanceof Error ? error.message : String(error);

        const errData = { error: true, success: false, message };
        const errSummary = formatErrorResponse({ message });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(errData, errSummary)) }],
          isError: true,
        };
      }
    },
  );
}
