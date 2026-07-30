import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DASHBOARD_FILE, TASKS_DIR, DECKENT_DIR, RECENT_WORKS_DIR } from '../../core/constants.js';
import { readLatestJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatStatusResponse, wrapResponse, type StatusData } from '../helpers/format.js';
import { getCurrentSprintId } from '../../monitor/sprint-state.js';
import { readDashboardSafe } from '../../monitor/dashboard-manager.js';
import { debugLog } from '../../core/utils.js';
import { formatStatus, resolveOutputMode, type OutputMode } from '../../core/output-formatter.js';
import { readCanonicalRunStatus } from '../../core/run-status-authority.js';
import { readPendingApprovals } from '../../core/pending-approvals.js';
import { TaskStatus, type Task } from '../../core/types.js';
import {
  computeLogicalTaskProgress,
  foldTaskLineages,
} from '../../core/task-lineage.js';

/**
 * Read the last N events from the event stream JSONL file.
 * File-system based to avoid ADR-008 import cycle (status.ts must not import orchestra/).
 */
function readEventStreamTail(
  projectRoot: string,
  sprintId: string,
  maxLines = 20,
): unknown[] {
  const filePath = join(projectRoot, RECENT_WORKS_DIR, `${sprintId}-events.jsonl`);
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    const tail = maxLines > 0 ? lines.slice(-maxLines) : lines;
    return tail.map(line => {
      try { return JSON.parse(line) as unknown; }
      catch { return null; }
    }).filter(Boolean);
  } catch (e) {
    debugLog('status.ts:eventstream-read-error', e);
    return [];
  }
}

/**
 * Read worker output snapshot for a task (last N lines from output file).
 * File-system based to avoid ADR-008 import cycle.
 */
function readLastOutputs(
  projectRoot: string,
  sprintId: string,
  maxLines = 10,
): Record<string, string[]> {
  const outputDir = join(projectRoot, DECKENT_DIR, `${sprintId}-outputs`);
  if (!existsSync(outputDir)) return {};
  try {
    const entries = readdirSync(outputDir);
    const result: Record<string, string[]> = {};
    for (const f of entries) {
      if (!f.endsWith('.out')) continue;
      const taskId = f.replace(/^task-/, '').replace(/\.out$/, '');
      try {
        const content = readFileSync(join(outputDir, f), 'utf-8');
        const allLines = content.split('\n').filter(l => l.trim().length > 0);
        result[taskId] = maxLines > 0 ? allLines.slice(-maxLines) : allLines;
      } catch {
        // Skip unreadable files
      }
    }
    return result;
  } catch (e) {
    debugLog('status.ts:lastoutputs-read-error', e);
    return {};
  }
}

/**
 * Read metric snapshot for a sprint.
 * Tries per-sprint file first (sprint-NNN-metrics.jsonl), then falls back
 * to the flat metrics.jsonl filtered by sprintId tag.
 * File-system based to avoid ADR-008 import cycle.
 */
function readMetricSnapshot(
  projectRoot: string,
  sprintId: string,
): Record<string, unknown> {
  // Try per-sprint file first (written when perSprintFile is enabled)
  const perSprintPath = join(projectRoot, RECENT_WORKS_DIR, `${sprintId}-metrics.jsonl`);
  if (existsSync(perSprintPath)) {
    try {
      const raw = readFileSync(perSprintPath, 'utf-8');
      const lines = raw.split('\n').filter(l => l.trim().length > 0);
      const snapshot: Record<string, unknown> = {};
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { name?: string; value?: unknown };
          if (entry.name) snapshot[entry.name] = entry.value;
        } catch { /* skip */ }
      }
      return snapshot;
    } catch (e) {
      debugLog('status.ts:per-sprint-metrics-read-error', e);
    }
  }

  // Fallback: flat metrics file filtered by sprintId tag
  const flatPath = join(projectRoot, DECKENT_DIR, 'metrics.jsonl');
  if (!existsSync(flatPath)) return {};
  try {
    const raw = readFileSync(flatPath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    const snapshot: Record<string, unknown> = {};
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { name?: string; value?: unknown; tags?: Record<string, string> };
        // Only include entries tagged with the requested sprintId (or untagged for retro-compat)
        const entrySprintId = entry.tags?.sprintId;
        if (entrySprintId && entrySprintId !== sprintId) continue;
        if (entry.name) snapshot[entry.name] = entry.value;
      } catch { /* skip */ }
    }
    return snapshot;
  } catch (e) {
    debugLog('status.ts:metrics-read-error', e);
    return {};
  }
}

/**
 * Compute phase countdown in seconds from current phase timestamp.
 * Returns null if no phase data available.
 */
function computePhaseCountdown(
  state: Record<string, unknown>,
): { phase: string; elapsedSec: number } | null {
  const phase = state['phase'] as string | undefined;
  const phaseStartedAt = state['phaseStartedAt'] as string | undefined;
  if (!phase || !phaseStartedAt) return null;
  try {
    const elapsed = Math.floor((Date.now() - new Date(phaseStartedAt).getTime()) / 1000);
    return { phase, elapsedSec: elapsed };
  } catch {
    return null;
  }
}

/**
 * Build backend breakdown: counts of workers per backend type.
 * Reads from .tasks/*.json agent provider fields.
 */
function buildBackendBreakdown(root: string): Record<string, number> {
  const breakdown: Record<string, number> = {};
  try {
    const tasksDir = join(root, TASKS_DIR);
    if (!existsSync(tasksDir)) return breakdown;
    const entries = readdirSync(tasksDir);
    const files = (Array.isArray(entries) ? entries : []).filter(
      f => typeof f === 'string' && f.startsWith('task-') && f.endsWith('.json'),
    );
    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as {
          provider?: string;
          status?: string;
        };
        if (data.status === 'EXECUTING' || data.status === 'CLAIMED') {
          const prov = data.provider ?? 'unknown';
          breakdown[prov] = (breakdown[prov] ?? 0) + 1;
        }
      } catch { /* skip */ }
    }
  } catch {
    // ignore
  }
  return breakdown;
}

/**
 * Count tasks with status NO_GO from .tasks/*.json files.
 * File-system based to avoid ADR-008 import cycle (status.ts must not import orchestra/).
 */
function loadLogicalTaskLineages(root: string, sprintId?: string) {
  try {
    const tasksDir = join(root, TASKS_DIR);
    if (!existsSync(tasksDir)) return [];
    const entries = readdirSync(tasksDir);
    const files = (Array.isArray(entries) ? entries : []).filter(
      f => typeof f === 'string' && f.startsWith('task-') && f.endsWith('.json'),
    );
    const explicitlyScoped: Task[] = [];
    const legacyUnscoped: Task[] = [];
    for (const f of files) {
      try {
        const task = JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as Task;
        if (!sprintId || task.sprintId === sprintId) explicitlyScoped.push(task);
        else if (task.sprintId === undefined) legacyUnscoped.push(task);
      } catch { /* skip */ }
    }
    // Modern task files carry sprintId. If any current-sprint records exist,
    // they are authoritative and stale legacy files cannot contaminate status.
    // A fully legacy directory falls back as a set for backward compatibility.
    return foldTaskLineages(
      explicitlyScoped.length > 0 ? explicitlyScoped : legacyUnscoped,
    );
  } catch {
    return [];
  }
}

/**
 * Loads the persisted dependency graph for the given sprint from disk.
 * File-system based to avoid ADR-008 import cycle (status.ts must not import orchestra/).
 * Returns null if no graph is persisted yet (sprint has no dep data).
 */
function loadDepGraphFiles(
  projectRoot: string,
  sprintId: string,
): { format: 'mermaid'; content: string; json: unknown } | null {
  const mmdPath = join(projectRoot, DECKENT_DIR, `${sprintId}-depgraph.mmd`);
  const jsonPath = join(projectRoot, DECKENT_DIR, `${sprintId}-depgraph.json`);
  if (!existsSync(mmdPath) && !existsSync(jsonPath)) return null;

  let content = '';
  let json: unknown = null;

  if (existsSync(mmdPath)) {
    try {
      content = readFileSync(mmdPath, 'utf-8');
    } catch (e) {
      debugLog('status.ts:depgraph-mmd-read-error', e);
    }
  }
  if (existsSync(jsonPath)) {
    try {
      json = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    } catch (e) {
      debugLog('status.ts:depgraph-json-read-error', e);
    }
  }

  if (!content && !json) return null;
  return { format: 'mermaid', content, json };
}

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
      title: 'Run Status',
      description: 'Get the current run dashboard status. Returns: agents (active worker list with task assignments), progress (done/total counts + progress bar + ETA), alerts (stale workers, boundary violations, lock issues), job (background job state: RUNNING/COMPLETE/FAILED + sprintId + metrics), agentAssignments (which agent handles which tasks), skillAssignments (which skills are active). Call repeatedly to poll progress. No prerequisite — safe to call anytime.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        json: z.boolean().optional().default(false).describe('Return raw JSON data without the human-readable summary wrapper. Useful for programmatic consumption.'),
        verbose: z.boolean().optional().default(false).describe('Include verbose details: full agent assignment map, skill assignments, and per-task agent/skill breakdown.'),
        outputMode: z.enum(['explainatory', 'standart', 'verbose', 'json']).optional().describe('Render mode for formatted output: explainatory (emoji + Türkçe insight blocks), standart (markdown table), verbose (full snapshot with timestamps), json (raw JSON). Defaults to standart.'),
      }),
    },
    async ({ json, verbose, outputMode }) => {
      const root = process.cwd();
      const dashPath = join(root, DASHBOARD_FILE);
      // Use canonical sprint-state.json as single source of truth for sprintId
      const canonicalSprintId = getCurrentSprintId(root);
      const authority = readCanonicalRunStatus(root, { sprintIdHint: canonicalSprintId });
      const pendingApprovals = readPendingApprovals(root);

      const latestJob = readLatestJobState(root);

      if (!existsSync(dashPath)) {
        // Part C: when .tasks/ files are unavailable but job is COMPLETE with task data,
        // surface completed sprint results from the job file
        if (latestJob?.status === 'COMPLETE' && latestJob.tasks && latestJob.tasks.length > 0) {
          const completedData = {
            active: authority.active,
            completed: true,
            message: `Run ${canonicalSprintId ?? latestJob.sprintId ?? ''} completed.`,
            sprintId: canonicalSprintId ?? latestJob.sprintId,
            completedAt: latestJob.completedAt,
            job: latestJob,
            lifecycle: authority.lifecycle,
            resumable: authority.resumable,
            authority,
            pendingApprovals,
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
          active: authority.active,
          message: 'No active run.',
          sprintId: authority.sprintId ?? canonicalSprintId,
          job: latestJob,
          lifecycle: authority.lifecycle,
          resumable: authority.resumable,
          recoveryCommand: authority.recoveryCommand,
          finalizeCommand: authority.finalizeCommand,
          authority,
          pendingApprovals,
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

      // Use readDashboardSafe for validated read with auto-repair (Sprint 139 T-010)
      const dashResult = readDashboardSafe(root);

      if (!dashResult.valid) {
        // Log real error details instead of swallowing them (Fix A)
        const errorDetail = dashResult.error ?? 'unknown dashboard read error';
        debugLog('status.ts:dashboard-parse-error', errorDetail);

        const errData = {
          error: true,
          active: false,
          message: `Dashboard read error: ${errorDetail}`,
          repaired: dashResult.repaired,
          job: latestJob,
        };
        const summary = formatStatusResponse(errData);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(wrapResponse(errData, summary)),
          }],
          isError: true,
        };
      }

      // Dashboard file is valid — extract fields for display
      const state = dashResult.state as unknown as Record<string, unknown>;
      const progress = state['progress'] as { done?: number; total?: number } | undefined;
      const done = progress?.done ?? 0;
      const total = progress?.total ?? 0;
      const agents = state['agents'] as unknown[] | undefined;
      const alerts = state['alerts'] as unknown[] | undefined;
      const sprint = state['sprint'] as { id?: string; startedAt?: string } | undefined;

      // Prefer canonical sprint-state.json sprintId over potentially stale .dashboard sprint.id
      const resolvedSprintId = authority.sprintId ?? sprint?.id;

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
      const depGraph = verbose && resolvedSprintId
        ? loadDepGraphFiles(root, resolvedSprintId)
        : null;

      // Rich output fields (Sprint 139 T-047): always include when sprintId available
      const eventStreamTail = resolvedSprintId
        ? readEventStreamTail(root, resolvedSprintId, 20)
        : [];

      const lastOutputs = resolvedSprintId
        ? readLastOutputs(root, resolvedSprintId, 10)
        : {};

      const metricSnapshot = resolvedSprintId
        ? readMetricSnapshot(root, resolvedSprintId)
        : {};

      const phaseCountdown = computePhaseCountdown(state);
      const backendBreakdown = buildBackendBreakdown(root);
      const logicalTaskLineages = loadLogicalTaskLineages(root, resolvedSprintId);
      const noGoCount = logicalTaskLineages.filter(
        lineage => lineage.resolvedTask.status === TaskStatus.NO_GO,
      ).length;
      const logicalProgress = logicalTaskLineages.length > 0
        ? computeLogicalTaskProgress(logicalTaskLineages.flatMap(lineage => lineage.attempts))
        : undefined;

      const verboseFields = verbose ? {
        phase: state['phase'],
        workerDetails: agents,
        allAlerts: alerts,
        ...(depGraph ? { dependencyGraph: depGraph } : {}),
      } : {};

      const rawData = {
        ...state,
        ...(logicalProgress ? { progress: logicalProgress } : {}),
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
        failedTasks: noGoCount,
        taskLineages: logicalTaskLineages.map(lineage => ({
          taskId: lineage.rootId,
          resolvedTaskId: lineage.resolvedTask.id,
          status: lineage.resolvedTask.status,
          attemptIds: lineage.attemptIds,
          attemptCount: lineage.attempts.length,
        })),
        // Rich output fields (Sprint 139 T-047)
        eventStreamTail,
        lastOutputs,
        metricSnapshot,
        phaseCountdown,
        backendBreakdown,
        active: authority.active,
        lifecycle: authority.lifecycle,
        resumable: authority.resumable,
        recoveryCommand: authority.recoveryCommand,
        finalizeCommand: authority.finalizeCommand,
        authority,
        pendingApprovals,
        ...verboseFields,
      };

      if (json) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(rawData) }] };
      }

      // Resolve output mode — outputMode param overrides config default
      const resolvedMode: OutputMode = outputMode
        ? resolveOutputMode(outputMode)
        : resolveOutputMode();

      // If outputMode is explainatory/verbose/standart, use output-formatter for rich rendering
      if (resolvedMode !== 'standart') {
        const formatterData = {
          sprintId: resolvedSprintId,
          phase: (state['phase'] as string | undefined),
          totalTasks: total,
          completedTasks: done,
          failedTasks: noGoCount,
          activeWorkers: agents?.length ?? 0,
        };
        const formattedOutput = formatStatus(formatterData, resolvedMode);
        const enrichedState = enrichResponse('status', rawData);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ...wrapResponse(enrichedState, formattedOutput),
              _outputMode: resolvedMode,
            }),
          }],
        };
      }

      const enrichedState = enrichResponse('status', rawData);

      const summary = formatStatusResponse({
        sprint: sprint as StatusData['sprint'],
        progress: progress as StatusData['progress'],
        agents: agents as StatusData['agents'],
        alerts: alerts as StatusData['alerts'],
        eta,
        active: authority.active,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enrichedState, summary)) }],
      };
    },
  );
}
