import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import { runSprint, BrainError, readContext, planSprint } from '../../orchestra/brain.js';
import type { SprintSizeRecommendation } from '../../core/types.js';
import { writeJobState, buildTaskSummaries } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatStartResponse, formatErrorResponse, wrapResponse } from '../helpers/format.js';
import { isSprintLocked } from '../../core/multi-ide.js';

function formatJobDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function registerStartTool(server: McpServer): void {
  server.registerTool(
    'deckent_start',
    {
      title: 'Start Sprint',
      description: 'Start a full sprint in the background. Runs the complete lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP. Returns immediately with a jobId — the sprint continues asynchronously. Use deckent_status to monitor progress and deckent_review to evaluate results. Prerequisite: deckent_init + deckent_set_directives must have been run.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        autoApprove: z.boolean().optional().default(false).describe('Auto-approve all worker tool calls with --dangerously-skip-permissions. Use only in trusted environments — skips Claude permission prompts for file writes, shell commands, etc.'),
        dryRun: z.boolean().optional().default(false).describe('Plan the sprint without spawning workers. Returns the planned tasks list so you can review before committing. No workers are started, no files are changed.'),
        force: z.boolean().optional().default(false).describe('Skip pre-flight doctor checks. Normally deckent_start runs health checks before spawning; use force=true to bypass when you know the environment is ready.'),
        timeout: z.number().int().positive().optional().describe('Sprint maximum duration in milliseconds (default: 30 minutes = 1800000). Sprint is marked TIMEOUT if workers do not complete within this window.'),
        sandbox: z.boolean().optional().default(false).describe('Run sprint in sandbox mode: stashes local git changes before spawning and restores them after the sprint completes. Safe experimentation — no permanent changes on failure.'),
      }),
    },
    async ({ autoApprove, dryRun, force, timeout, sandbox }) => {
      const root = process.cwd();
      // force: MCP does not run pre-flight checks by default (non-interactive context).
      // The parameter is present for CLI parity — set force=true to document intent.

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

        // Bootstrap provider adapters before sprint operations
        const bootstrap = await bootstrapProviders(config, root);

        const jobId = `sprint-${Date.now()}`;
        const startedAt = new Date().toISOString();

        writeJobState(root, { jobId, status: 'RUNNING', startedAt });

        // Fire and forget — don't await. Sprint runs in background.
        runSprint(root, config, { autoApprove, sandboxMode: sandbox, timeoutMs: timeout, connector: bootstrap?.connector }).then(sprint => {
          const tasks = buildTaskSummaries(root, sprint.tasks);
          const sm = sprint.metrics;
          const duration = sm ? formatJobDuration(sm.durationMs) : '?';
          const metrics = sm ? {
            totalTasks: sm.totalTasks,
            done: sm.completedTasks,
            techDebt: sm.techDebtTasks,
            noGo: sm.noGoTasks,
            duration,
          } : undefined;

          // Build agent breakdown: agentId → task count
          const agentBreakdown: Record<string, number> = {};
          for (const t of sprint.tasks) {
            const agent = t.assignedAgent ?? 'generic';
            agentBreakdown[agent] = (agentBreakdown[agent] ?? 0) + 1;
          }

          // Build human-readable summary
          const total = sm?.totalTasks ?? sprint.tasks.length;
          const done = sm?.completedTasks ?? 0;
          const techDebt = sm?.techDebtTasks ?? 0;
          const noGo = sm?.noGoTasks ?? 0;
          const agentParts = Object.entries(agentBreakdown).map(([a, c]) => `${a}(${c})`).join(', ');
          const summary = `Sprint ${sprint.id} tamamlandı (${duration}) — ${done + techDebt}/${total} task: ${done} DONE, ${techDebt} TECH_DEBT, ${noGo} NO_GO | Agent: ${agentParts}`;

          writeJobState(root, {
            jobId,
            status: 'COMPLETE',
            startedAt,
            completedAt: new Date().toISOString(),
            sprintId: sprint.id,
            tasks,
            metrics,
            summary,
            agentBreakdown,
          });
        }).catch(err => {
          const message = err instanceof BrainError
            ? `Sprint failed at phase ${err.phase ?? 'unknown'}: ${err.message}`
            : err instanceof Error ? err.message : String(err);

          writeJobState(root, {
            jobId,
            status: 'FAILED',
            startedAt,
            completedAt: new Date().toISOString(),
            error: message,
          });
        });

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
