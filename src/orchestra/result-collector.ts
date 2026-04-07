// ═══ Result Collector ═════════════════════════════════════════════
// Extracted from sprint-controller.ts — result collection, queue management,
// and worker prompt resolution for queue processing.
// Sprint 076: God Object Split Phase 3

// ─── Node Builtins ─────────────────────────────────────────────────
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Core Types ────────────────────────────────────────────────────
import type {
  Task, TaskResult, Sprint,
} from '../core/types.js';

import { TASKS_DIR } from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { readJsonSafe, debugLog } from '../core/utils.js';

// ─── Result watcher (fs.watch-based) ──────────────────────────────
import { createResultWatcher } from './result-watcher.js';

// ─── Worker IPC ───────────────────────────────────────────────────
import type { ChannelRegistry } from '../agents/worker-ipc.js';

// ─── Spawn backend abstraction ───────────────────────────────────
import type { SpawnBackend } from './spawn-backend.js';

// ─── Task builder ─────────────────────────────────────────────────
import { buildWorkerPrompt } from './task-builder.js';

// ─── tmux ─────────────────────────────────────────────────────────
import { spawnWorker, killWorker } from './tmux.js';

// ═══ Exported Functions ═══════════════════════════════════════════

/**
 * Resolve the agent prompt for a task's assigned agent.
 * Combines PROMPT.md (if exists) with systemPrompt + expertise from agent.json.
 * Returns undefined if the agent is 'generic' or no prompt material can be found.
 */
export function resolveAgentPrompt(projectRoot: string, task: Task): string | undefined {
  const agentId = task.assignedAgent;
  if (!agentId || agentId === 'generic') return undefined;

  // Try to load PROMPT.md
  let promptMd: string | undefined;
  const promptPaths = [
    join(projectRoot, '.deckent', 'agents', agentId, 'PROMPT.md'),
    join(projectRoot, TASKS_DIR, 'agents', agentId, 'PROMPT.md'),
  ];
  for (const p of promptPaths) {
    try {
      promptMd = readFileSync(p, 'utf-8');
      break;
    } catch (e) { debugLog('resolveAgentPrompt:readFile', e); }
  }

  // Load systemPrompt + expertise from agent.json
  let systemPrompt: string | undefined;
  let expertise = '';
  const agentJsonPaths = [
    join(projectRoot, '.deckent', 'agents', agentId, 'agent.json'),
    join(projectRoot, TASKS_DIR, 'agents', agentId, 'agent.json'),
  ];
  for (const p of agentJsonPaths) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
      systemPrompt = raw['systemPrompt'] as string | undefined;
      expertise = Array.isArray(raw['expertise']) ? (raw['expertise'] as string[]).join(', ') : '';
      break;
    } catch (e) { debugLog('resolveAgentPrompt:readFile', e); }
  }

  // Combine: PROMPT.md + systemPrompt + expertise
  const parts: string[] = [];
  if (systemPrompt) parts.push(systemPrompt);
  if (expertise) parts.push(`Expertise: ${expertise}`);
  if (promptMd) parts.push(promptMd);

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/**
 * Resolve SKILL.md content for all skills assigned to a task.
 * Returns an array of { name, content } for each loadable skill.
 */
export function resolveSkillPrompts(
  projectRoot: string,
  task: Task,
): Array<{ name: string; content: string }> {
  const skillIds = task.assignedSkills;
  if (!skillIds || skillIds.length === 0) return [];
  const results: Array<{ name: string; content: string }> = [];
  for (const skillId of skillIds) {
    const skillPath = join(projectRoot, '.deckent', 'skills', skillId, 'SKILL.md');
    try {
      const content = readFileSync(skillPath, 'utf-8');
      results.push({ name: skillId, content });
    } catch (e) { debugLog('resolveSkillPrompts:readSkillFile', e); }
  }
  return results;
}

/**
 * Wait for task result files to appear on disk using fs.watch with fallback polling.
 * Supports queued task execution: as workers finish, queued tasks are spawned.
 * @param projectRoot - Project root directory
 * @param sprint - Sprint whose results to wait for
 * @param timeoutMs - Maximum wait time in ms (default: 30 minutes)
 * @param queue - Optional queued tasks to spawn as slots open
 * @param spawnOpts - Optional spawn settings for queued task execution
 * @param channelRegistry - Optional IPC channel registry for heartbeat wakeups
 * @returns Array of collected task results
 */
export async function waitForResults(
  projectRoot: string,
  sprint: Sprint,
  timeoutMs?: number,
  queue?: Task[],
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
  channelRegistry?: ChannelRegistry,
): Promise<TaskResult[]> {
  // 0 = unlimited (no timeout). undefined falls back to 30min for backward compat.
  const timeout = timeoutMs !== undefined ? timeoutMs : 30 * 60 * 1000;
  const unlimited = timeout === 0;
  const WATCH_FALLBACK_MS = 5_000;
  const PROGRESS_LOG_INTERVAL_MS = 5 * 60 * 1000; // 5 min
  const startTime = Date.now();
  let lastProgressLog = startTime;
  const results: TaskResult[] = [];
  const taskIds = new Set(sprint.tasks.map(t => t.id));
  const collected = new Set<string>();
  const remainingQueue: Task[] = queue ? [...queue] : [];

  const collectResults = (): string[] => {
    const newlyCollected: string[] = [];
    for (const taskId of taskIds) {
      if (collected.has(taskId)) continue;
      const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
      if (existsSync(resultPath)) {
        const result = readJsonSafe<TaskResult>(resultPath);
        if (result) {
          results.push(result);
          collected.add(taskId);
          newlyCollected.push(taskId);
          continue;
        }
      }
      // Check for .timeout marker — worker exceeded time limit
      const timeoutPath = join(projectRoot, TASKS_DIR, `task-${taskId}.timeout`);
      if (existsSync(timeoutPath)) {
        const syntheticResult: TaskResult = {
          taskId,
          workerId: `w-${taskId}`,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'NO_GO',
          notes: 'Worker timeout — process exceeded time limit and was killed',
        };
        // Write synthetic result to disk so evaluate phase can also read it
        try {
          writeFileSync(
            join(projectRoot, TASKS_DIR, `task-${taskId}.result`),
            JSON.stringify(syntheticResult, null, 2),
            'utf-8',
          );
        } catch (e) { debugLog('collectResults:writeTimeoutResult', e); }
        results.push(syntheticResult);
        collected.add(taskId);
        newlyCollected.push(taskId);
      }
    }
    return newlyCollected;
  };

  const queueBackend = spawnOpts?.spawnBackend;

  const processQueue = (completedTaskIds: string[]): void => {
    for (const taskId of completedTaskIds) {
      if (remainingQueue.length === 0) break;
      // Kill completed worker (clean up slot)
      try {
        if (queueBackend) queueBackend.kill(taskId);
        else killWorker(taskId);
      } catch (e) { debugLog('processQueue:killWorker', e); }
      const nextTask = remainingQueue.shift(); // length > 0 checked above
      if (!nextTask) break;
      const queueAgentPrompt = resolveAgentPrompt(projectRoot, nextTask);
      const queueSkillPrompts = resolveSkillPrompts(projectRoot, nextTask);
      const prompt = buildWorkerPrompt(nextTask, queueAgentPrompt, queueSkillPrompts);
      const writeTargets = ['.tasks/', ...nextTask.scope.directories, ...nextTask.scope.filesWrite].filter(Boolean);
      const allowedTools = writeTargets.length > 0
        ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
        : 'Read,Write,Edit,Bash,Glob,Grep';
      try {
        if (queueBackend) {
          queueBackend.spawn(nextTask.id, nextTask.model, prompt, {
            allowedTools,
            autoApprove: spawnOpts?.autoApprove ?? false,
            projectDir: projectRoot,
          });
        } else {
          spawnWorker(nextTask.id, nextTask.model, prompt, projectRoot, {
            allowedTools,
            autoApprove: spawnOpts?.autoApprove ?? false,
          });
        }
      } catch (err) {
        debugLog('waitForResults:queue-spawn', `Failed to spawn queued task ${nextTask.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const initiallyCollected = collectResults();
  processQueue(initiallyCollected);
  if (collected.size === taskIds.size) return results;

  // IPC dual-mode: register HEARTBEAT listeners for any channels in registry
  const ipcWakeup = { resolve: (_: void) => {}, pending: false };
  let ipcWakeupPromise: Promise<void> | null = null;

  const setupIpcListeners = (): void => {
    if (!channelRegistry) return;
    for (const taskId of taskIds) {
      if (collected.has(taskId)) continue;
      const channel = channelRegistry.get(taskId);
      if (!channel) continue;

      channel.onMessage('HEARTBEAT', () => {
        if (ipcWakeup.pending) {
          ipcWakeup.pending = false;
          ipcWakeup.resolve();
        }
      });
    }
  };

  const makeIpcWakeupPromise = (): Promise<void> => {
    ipcWakeup.pending = true;
    return new Promise<void>(resolve => { ipcWakeup.resolve = resolve; });
  };

  setupIpcListeners();

  // Use fs.watch with fallback polling (5s instead of 15s)
  const watcher = createResultWatcher(projectRoot, WATCH_FALLBACK_MS);
  try {
    while (unlimited || Date.now() - startTime < timeout) {
      ipcWakeupPromise = makeIpcWakeupPromise();
      // Race: fs.watch / fallback-poll vs IPC heartbeat wakeup
      await Promise.race([watcher.waitForChange(), ipcWakeupPromise]);
      const newlyCollected = collectResults();
      processQueue(newlyCollected);
      if (collected.size === taskIds.size) break;
      // Periodic progress log (every 5 minutes)
      const now = Date.now();
      if (now - lastProgressLog >= PROGRESS_LOG_INTERVAL_MS) {
        debugLog('waitForResults:progress', `Sprint devam ediyor — ${collected.size}/${taskIds.size} task tamamlandı (${Math.round((now - startTime) / 60000)}dk)`);
        lastProgressLog = now;
      }
    }
  } finally {
    watcher.close();
  }
  // Final sweep: collect any real .result files written during/after the last poll cycle
  // Note: Only read .result files here (not .timeout) to avoid side effects in edge cases
  for (const taskId of taskIds) {
    if (collected.has(taskId)) continue;
    const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    if (existsSync(resultPath)) {
      const result = readJsonSafe<TaskResult>(resultPath);
      if (result) {
        results.push(result);
        collected.add(taskId);
      }
    }
  }
  return results;
}
