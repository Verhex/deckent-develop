import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DASHBOARD_FILE, TASKS_DIR } from '../../core/constants.js';
import { readLatestJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatStatusResponse, wrapResponse, type StatusData } from '../helpers/format.js';

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
      description: 'Get the current sprint dashboard status. Returns agent states, progress, usage metrics, alerts, and background job state.',
    },
    async () => {
      const root = process.cwd();
      const dashPath = join(root, DASHBOARD_FILE);

      const latestJob = readLatestJobState(root);

      if (!existsSync(dashPath)) {
        const noSprintData = { active: false, message: 'No active sprint.', job: latestJob };
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
        const sprint = state['sprint'] as { startedAt?: string } | undefined;

        const progressBar = buildProgressBar(done, total);
        const eta = computeEta(done, total, sprint?.startedAt);
        const workerSummary = `${agents?.length ?? 0} active`;
        const alertSummary = `${alerts?.length ?? 0} alert${(alerts?.length ?? 0) === 1 ? '' : 's'}`;

        const { agentAssignments, skillAssignments } = loadAgentSkillAssignments(root);

        const enrichedState = enrichResponse('status', {
          ...state,
          job: latestJob,
          progressBar,
          eta,
          workerSummary,
          alertSummary,
          agentAssignments,
          skillAssignments,
        });

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
        const errData = { active: false, message: 'Cannot parse dashboard file.', job: latestJob };
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
