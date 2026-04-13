// ═══ Result Collector ═════════════════════════════════════════════
// Extracted from sprint-controller.ts — result collection, queue management,
// and worker prompt resolution for queue processing.
// Sprint 076: God Object Split Phase 3

// ─── Node Builtins ─────────────────────────────────────────────────
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// ─── Observability (Sprint 134) ───────────────────────────────────
import { metric } from '../core/observability.js';

// ─── Core Types ────────────────────────────────────────────────────
import type {
  Task, TaskResult, Sprint,
} from '../core/types.js';

import { TASKS_DIR } from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { readJsonSafe, debugLog } from '../core/utils.js';

// ─── Result watcher (fs.watch-based) ──────────────────────────────
import { createResultWatcher } from './result-watcher.js';

// ─── Worker IPC (canonical source: ipc-registry.ts) ──────────────
import type { ChannelRegistry } from '../agents/worker-ipc.js';
import {
  writeAnswerFile,
  checkWorkerQuestions,
} from './ipc-registry.js';
import type { BrainAnswer, WorkerQuestion, TokenUsage } from '../core/task-types.js';

// ─── Spawn backend abstraction ───────────────────────────────────
import type { SpawnBackend } from './spawn-backend.js';

// ─── Task builder ─────────────────────────────────────────────────
import { buildWorkerPrompt } from './task-builder.js';

// ─── tmux ─────────────────────────────────────────────────────────
import { spawnWorker, killWorker } from './tmux.js';

// ═══ Results Map Helper ═══════════════════════════════════════════

/**
 * Build a Map<taskId, TaskResult> index from a TaskResult array.
 * Provides O(1) lookup by taskId instead of O(n) linear scan.
 * If duplicate taskIds exist, the last entry wins (override behavior).
 */
export function buildResultsMap(results: TaskResult[]): Map<string, TaskResult> {
  const map = new Map<string, TaskResult>();
  for (const r of results) {
    map.set(r.taskId, r);
  }
  return map;
}

// ═══ Token Usage Enrichment ═══════════════════════════════════════

/**
 * Estimate token usage for a task result when the worker did not report it.
 * Uses task.estimatedTokens (prompt input) and result.linesAdded/linesRemoved
 * to build a heuristic TokenUsage object.
 *
 * Heuristic: inputTokens ≈ estimatedTokens (prompt size),
 * outputTokens ≈ linesAdded * 15 (avg tokens per generated line),
 * cacheReadTokens ≈ inputTokens * 4 (Claude typically cache-reads ~4x prompt).
 */
export function estimateTokenUsage(task: Task, result: TaskResult): TokenUsage {
  const inputTokens = task.estimatedTokens ?? Math.max((result.linesAdded + result.linesRemoved) * 10, 1000);
  const outputTokens = Math.max(result.linesAdded * 15, 500);
  const cacheReadTokens = Math.round(inputTokens * 4);
  const provider = task.provider as TokenUsage['provider'];
  const model = (task.forceModel ?? task.model) as TokenUsage['model'];

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
}

/**
 * Enrich a TaskResult with tokenUsage data if missing.
 * If the result already has tokenUsage, it is left unchanged.
 * Otherwise, a heuristic estimate is generated from the task metadata.
 * Mutates the result in place for efficiency.
 */
export function enrichResultTokenUsage(result: TaskResult, task: Task | undefined): void {
  if (result.tokenUsage) return; // worker already reported — keep as-is
  if (!task) return; // no task metadata — cannot estimate

  result.tokenUsage = estimateTokenUsage(task, result);
}

// ═══ Exported Functions ═══════════════════════════════════════════

/**
 * Resolve the agent prompt for a task's assigned agent.
 * Combines PROMPT.md (if exists) with systemPrompt + expertise from agent.json.
 * Returns undefined if the agent is 'generic' or no prompt material can be found.
 */
export async function resolveAgentPrompt(projectRoot: string, task: Task): Promise<string | undefined> {
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
      promptMd = await readFile(p, 'utf-8');
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
      const raw = JSON.parse(await readFile(p, 'utf-8')) as Record<string, unknown>;
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
export async function resolveSkillPrompts(
  projectRoot: string,
  task: Task,
): Promise<Array<{ name: string; content: string }>> {
  const skillIds = task.assignedSkills;
  if (!skillIds || skillIds.length === 0) return [];
  const results: Array<{ name: string; content: string }> = [];
  for (const skillId of skillIds) {
    const skillPath = join(projectRoot, '.deckent', 'skills', skillId, 'SKILL.md');
    try {
      const content = await readFile(skillPath, 'utf-8');
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
  const taskMap = new Map(sprint.tasks.map(t => [t.id, t]));
  const collected = new Set<string>();
  const remainingQueue: Task[] = queue ? [...queue] : [];

  const collectResults = async (): Promise<string[]> => {
    const collectStart = Date.now();
    const newlyCollected: string[] = [];
    for (const taskId of taskIds) {
      if (collected.has(taskId)) continue;
      const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
      const resultExists = await stat(resultPath).then(() => true, () => false);
      if (resultExists) {
        const result = readJsonSafe<TaskResult>(resultPath);
        if (result) {
          enrichResultTokenUsage(result, taskMap.get(taskId));
          results.push(result);
          collected.add(taskId);
          newlyCollected.push(taskId);
          metric('result.collected', 1, { taskId });
          continue;
        }
      }
      // Check for .timeout marker — worker exceeded time limit
      const timeoutPath = join(projectRoot, TASKS_DIR, `task-${taskId}.timeout`);
      const timeoutExists = await stat(timeoutPath).then(() => true, () => false);
      if (timeoutExists) {
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
          await writeFile(
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
    if (newlyCollected.length > 0) {
      metric('collect.batch', newlyCollected.length, { duration_ms: String(Date.now() - collectStart) });
    }
    return newlyCollected;
  };

  const queueBackend = spawnOpts?.spawnBackend;

  const processQueue = async (completedTaskIds: string[]): Promise<void> => {
    for (const taskId of completedTaskIds) {
      if (remainingQueue.length === 0) break;
      // Kill completed worker (clean up slot)
      try {
        if (queueBackend) queueBackend.kill(taskId);
        else killWorker(taskId);
      } catch (e) { debugLog('processQueue:killWorker', e); }
      const nextTask = remainingQueue.shift(); // length > 0 checked above
      if (!nextTask) break;
      const queueAgentPrompt = await resolveAgentPrompt(projectRoot, nextTask);
      const queueSkillPrompts = await resolveSkillPrompts(projectRoot, nextTask);
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

  const initiallyCollected = await collectResults();
  await processQueue(initiallyCollected);
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

      // Handle QUESTION messages via IPC — auto-answer and reply via IPC ANSWER
      channel.onMessage('QUESTION', (msg) => {
        const question = msg.payload as WorkerQuestion | undefined;
        const questionText = question?.question ?? '(no question text)';
        debugLog('ipc:question', `Worker question for task ${taskId}: "${questionText}"`);

        const answer: BrainAnswer = {
          taskId,
          action: 'continue',
          message: 'Auto-continue: Brain acknowledged question via IPC',
          timestamp: new Date().toISOString(),
        };

        // Reply via IPC channel
        channel.send('ANSWER', answer);
        // Also write file-based answer for compatibility
        writeAnswerFile(projectRoot, answer);

        debugLog('ipc:question:answered', `Auto-answered IPC question for task ${taskId}`);
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
      const newlyCollected = await collectResults();
      await processQueue(newlyCollected);
      if (collected.size === taskIds.size) break;
      // Check for pending worker questions and auto-answer them
      checkWorkerQuestions(projectRoot, taskIds, collected);
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
    const finalExists = await stat(resultPath).then(() => true, () => false);
    if (finalExists) {
      const result = readJsonSafe<TaskResult>(resultPath);
      if (result) {
        enrichResultTokenUsage(result, taskMap.get(taskId));
        results.push(result);
        collected.add(taskId);
      }
    }
  }
  return results;
}

// ═══ Worker Question Handling ════════════════════════════════════════
// Sprint 135 T-004: Moved to ipc-registry.ts. Re-exported here for backward compat.
export { handleWorkerQuestion, checkWorkerQuestions } from './ipc-registry.js';
