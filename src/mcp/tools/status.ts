import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DASHBOARD_FILE, TASKS_DIR } from '../../core/constants.js';
import { readLatestJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatStatusResponse, wrapResponse, type StatusData } from '../helpers/format.js';
import { getCurrentSprintId } from '../../monitor/sprint-state.js';

function buildProgressBar(done: number, total: number, width = 10): string {
  if (total <= 0) return '\u2591'.repeat(width);
  const filled = Math.round((done / total) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function computeEta(done: number, total: number, startedAt?: string): string {
  if (!startedAt || done <= 0 || total <= 0) return 'unknown';
  const elapsed = Date.now() - new Date(startedAt).getTime();
  const perTask = elapsed / done;
  const remaining = (total - done) * perTask;
  const mins = Math.round(remaining / 60000);
  if (mins <= 0) return 'finishing soon';
  return `~${mins} minute${mins === 1 ? '' : 's'}`;
}

interface TaskData {
  id?: string;
  assignedAgent?: string;
  assignedSkills?: string[];
}

function loadAgentSkillAssignments(root: string): {
  agentAssignments: Record<string, string[]>;
  skillAssignments: Record<string, string[]>;
} {
  const agentAssignments: Record<string, string[]> = {};
  const skillAssignments: Record<string, string[]> = {};

  try {
    const tasksDir = join(root, TASKS_DIR);
    if (!existsSync(tasksDir)) return { agentAssignments, skillAssignments };

    const entries = readdirSync(tasksDir);
    const files = (Array.isArray(entries) ? entries : []).filter(
      (f) => typeof f === 'string' && f.startsWith('task-') && f.endsWith('.json'),
    );

    for (const f of files) {
      try {
        // safe: task files written by createTask with Task shape; TaskData is a subset
        const data = JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as TaskData;
        const taskId = data.id ?? f.replace('.json', '');

        if (data.assignedAgent) {
          if (!agentAssignments[data.assignedAgent]) {
            agentAssignments[data.assignedAgent] = [];
          }
          agentAssignments[data.assignedAgent]?.push(taskId);
        }

        if (data.assignedSkills && Array.isArray(data.assignedSkills)) {
          for (const skill of data.assignedSkills) {
            if (!skillAssignments[skill]) {
              skillAssignments[skill] = [];
            }
            skillAssignments[skill]?.push(taskId);
          }
        }
      } catch {
        // Skip malformed task files
      }
    }
  } catch {
    // If reading tasks dir fails, just return empty assignments
  }

  return { agentAssignments, skillAssignments };
}

export function registerStatusTool(server: McpServer): void {
  server.registerTool(
    'deckent_status',
    {
      title: 'Sprint Status',
      description: 'Get the current sprint dashboard status. Returns: agents (active worker list with task assignments), progress (done/total counts + progress bar + ETA), alerts (stale workers, boundary violations, lock issues), job (background job state: RUNNING/COMPLETE/FAILED + sprintId + metrics), agentAssignments (which agent handles which tasks), skillAssignments (which skills are active). Call repeatedly to poll progress. No prerequisite — safe to call anytime.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        json: z.boolean().optional().default(false).describe('Return raw JSON data without the human-readable summary wrapper. Useful for programmatic consumption.'),
        verbose: z.boolean().optional().default(false).describe('Include verbose details: full agent assignment map, skill assignments, and per-task agent/skill breakdown.'),
      }),
    },
    async ({ json, verbose }) => {
      const root = process.cwd();
      const dashPath = join(root, DASHBOARD_FILE);

      const latestJob = readLatestJobState(root);

      // Use canonical sprint-state.json as single source of truth for sprintId
      const canonicalSprintId = getCurrentSprintId(root);

      if (!existsSync(dashPath)) {
        // Part C: when .tasks/ files are unavailable but job is COMPLETE with task data,
        // surface completed sprint results from the job file
        if (latestJob?.status === 'COMPLETE' && latestJob.tasks && latestJob.tasks.length > 0) {
          const completedData = {
            active: false,
            completed: true,
            message: `Sprint ${canonicalSprintId ?? latestJob.sprintId ?? ''} completed.`,
            sprintId: canonicalSprintId ?? latestJob.sprintId,
            completedAt: latestJob.completedAt,
            job: latestJob,
          };
          if (json) {
            return { content: [{ type: 'text' as const, text: JSON.stringify(completedData) }] };
          }
          const completedSummary = formatStatusResponse(completedData);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(wrapResponse(completedData, completedSummary)),
            }],
          };
        }
        const noSprintData = {
          active: false,
          message: 'No active sprint.',
          sprintId: canonicalSprintId,
          job: latestJob,
        };
        if (json) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(noSprintData) }] };
        }
        const summary = formatStatusResponse(noSprintData);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(wrapResponse(noSprintData, summary)),
          }],
        };
      }

      try {
        const content = readFileSync(dashPath, 'utf-8');
        // safe: dashboard file written by updateDashboard; accessing as Record for selective field reads
        const state = JSON.parse(content) as Record<string, unknown>;
        // safe: optional chaining + nullish coalescing guard every access — no crash on missing fields
        const progress = state['progress'] as { done?: number; total?: number } | undefined;
        const done = progress?.done ?? 0;
        const total = progress?.total ?? 0;
        const agents = state['agents'] as unknown[] | undefined;
        const alerts = state['alerts'] as unknown[] | undefined;
        const sprint = state['sprint'] as { id?: string; startedAt?: string } | undefined;

        // Prefer canonical sprint-state.json sprintId over potentially stale .dashboard sprint.id
        const resolvedSprintId = canonicalSprintId ?? sprint?.id;

        const progressBar = buildProgressBar(done, total);
        const eta = computeEta(done, total, sprint?.startedAt);
        const workerSummary = `${agents?.length ?? 0} active`;
        const alertSummary = `${alerts?.length ?? 0} alert${(alerts?.length ?? 0) === 1 ? '' : 's'}`;

        const { agentAssignments, skillAssignments } = loadAgentSkillAssignments(root);

        // Part B: when job is COMPLETE expose task summaries as top-level field
        const completedTasks = latestJob?.status === 'COMPLETE' && latestJob.tasks?.length
          ? latestJob.tasks
          : undefined;

        // verbose: include extra diagnostic fields beyond the standard set
        const verboseFields = verbose ? {
          phase: state['phase'],
          workerDetails: agents,
          allAlerts: alerts,
        } : {};

        const rawData = {
          ...state,
          // Override sprint.id with canonical source-of-truth value so dashboard
          // and MCP always report the same sprint, even when .dashboard is stale.
          sprint: sprint ? { ...sprint, id: resolvedSprintId } : { id: resolvedSprintId },
          job: latestJob,
          completedTasks,
          progressBar,
          eta,
          workerSummary,
          alertSummary,
          agentAssignments,
          skillAssignments,
          ...verboseFields,
        };

        if (json) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(rawData) }] };
        }

        const enrichedState = enrichResponse('status', rawData);

        const summary = formatStatusResponse({
          sprint: sprint as StatusData['sprint'],
          progress: progress as StatusData['progress'],
          agents: agents as StatusData['agents'],
          alerts: alerts as StatusData['alerts'],
          eta,
          active: true,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enrichedState, summary)) }],
        };
      } catch {
        const errData = { error: true, active: false, message: 'Cannot parse dashboard file.', job: latestJob };
        const summary = formatStatusResponse(errData);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(wrapResponse(errData, summary)),
          }],
          isError: true,
        };
      }
    },
  );
}
