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
  Task, TaskResult, Sprint, ResolvedConfig,
} from '../core/types.js';

// ─── Core (value imports — TaskStatus used at runtime for in-memory sync) ─
import { TaskStatus } from '../core/types.js';

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

// ─── Sprint Spawner (lazy import — avoid module init cycle) ──────
// ADR-045: respawnEligibleTasks wire — invoked at runtime only, never at
// module load. sprint-spawner.ts imports resolveAgentPrompt/resolveSkillPrompts
// from this file, so we use a dynamic import inside maybeRespawn to break the
// init-time cycle.
import type {
  respawnEligibleTasks as RespawnFn,
  computeSlotsAvailable as ComputeSlotsFn,
  selectEligibleForSpawn as SelectEligibleFn,
  pickFromQueue as PickFromQueueFn,
} from './sprint-spawner.js';
let cachedRespawn: typeof RespawnFn | undefined;
async function loadRespawn(): Promise<typeof RespawnFn> {
  if (!cachedRespawn) {
    const mod = await import('./sprint-spawner.js');
    cachedRespawn = mod.respawnEligibleTasks;
  }
  return cachedRespawn;
}

// Sprint 165 Bug Y — lazy helpers for processQueue stall fix
let cachedComputeSlots: typeof ComputeSlotsFn | undefined;
let cachedSelectEligible: typeof SelectEligibleFn | undefined;
let cachedPickFromQueue: typeof PickFromQueueFn | undefined;
async function loadProcessQueueHelpers(): Promise<{
  computeSlotsAvailable: typeof ComputeSlotsFn;
  selectEligibleForSpawn: typeof SelectEligibleFn;
  pickFromQueue: typeof PickFromQueueFn;
}> {
  if (!cachedComputeSlots || !cachedSelectEligible || !cachedPickFromQueue) {
    const mod = await import('./sprint-spawner.js');
    cachedComputeSlots = mod.computeSlotsAvailable;
    cachedSelectEligible = mod.selectEligibleForSpawn;
    cachedPickFromQueue = mod.pickFromQueue;
  }
  return {
    computeSlotsAvailable: cachedComputeSlots,
    selectEligibleForSpawn: cachedSelectEligible,
    pickFromQueue: cachedPickFromQueue,
  };
}

// Sprint 165 Bug Y — system-profile/config helper for force re-scan
import { getSystemProfile } from '../core/system-profile.js';
import { resolveEffectiveWorkers } from '../core/config.js';

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

// ═══ Status Mutation (ADR-045 Decision 1) ═════════════════════════

/**
 * Apply ADR-045 status mutation rules to a task ref based on a result.
 *
 *   selfAssessment === 'DONE'              → status = TaskStatus.DONE
 *   selfAssessment === 'GO_WITH_TECH_DEBT' → status = TaskStatus.DONE (debt-DONE)
 *   selfAssessment === 'NO_GO'             → status = TaskStatus.NO_GO
 *
 * `GO_WITH_TECH_DEBT` → `DONE` is intentional: the dependency filter in
 * `respawnEligibleTasks` checks `t.status === TaskStatus.DONE`, and debt
 * closures should not block dependents (see ADR-045 Consequences).
 *
 * Exported for unit testing — the in-memory call site lives inside
 * `waitForResults::collectResults`. Mutates the task ref in place.
 */
export function applyStatusMutation(taskRef: Task, result: TaskResult): void {
  if (result.selfAssessment === 'DONE') {
    taskRef.status = TaskStatus.DONE;
  } else if (result.selfAssessment === 'GO_WITH_TECH_DEBT') {
    taskRef.status = TaskStatus.DONE;
  } else if (result.selfAssessment === 'NO_GO') {
    taskRef.status = TaskStatus.NO_GO;
  }
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
  config?: ResolvedConfig,
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

  // ─── Sprint 165 Bug Y — duplicate spawn guard (Bug F) + force re-scan ────
  // Tracks task IDs that have already been TASK_ASSIGN'd in this waitForResults
  // call. Initially populated from tasks that spawnWorkers spawned (status
  // EXECUTING/CLAIMED/TESTING). spawnIfNotAssigned consults this set before
  // emitting another spawn — preventing the "duplicate TASK_ASSIGN" pattern
  // (Sprint 165 Bug F) seen when processQueue is invoked twice with the same
  // completedTaskIds, or when force re-scan races a queue drain.
  const assignedTaskIds = new Set<string>();
  for (const task of sprint.tasks) {
    if (
      task.status === TaskStatus.EXECUTING
      || task.status === TaskStatus.CLAIMED
      || task.status === TaskStatus.TESTING
    ) {
      assignedTaskIds.add(task.id);
    }
  }
  let lastSpawnAttempt = Date.now();
  const FORCE_RESCAN_IDLE_MS = 5 * 60 * 1000; // 5 minutes

  // ─── In-memory status sync (ADR-045 Decision 1) ─────────────────
  // Mutate the task object referenced by sprint.tasks so that
  // respawnEligibleTasks sees up-to-date `t.status === TaskStatus.DONE`
  // before EVALUATE phase persists status to disk.
  const syncTaskStatusFromResult = (taskId: string, result: TaskResult): void => {
    const taskRef = taskMap.get(taskId);
    if (!taskRef) return;
    applyStatusMutation(taskRef, result);
  };

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
          syncTaskStatusFromResult(taskId, result);
          metric('result.collected', 1, { taskId });
          continue;
        }
      }
      // Check for .timeout marker — worker exceeded time limit
      const timeoutPath = join(projectRoot, TASKS_DIR, `task-${taskId}.timeout`);
      const timeoutExists = await stat(timeoutPath).then(() => true, () => false);
      if (timeoutExists) {
        // Sprint 145: Check if EXIT trap already wrote a .result (e.g. TIMEOUT_WITH_WORK)
        // before overwriting with synthetic NO_GO. The EXIT trap runs between timeout kill
        // and result collection, so .result may appear after the first resultExists check.
        const lateResultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
        const lateResult = readJsonSafe<TaskResult>(lateResultPath);
        if (lateResult) {
          enrichResultTokenUsage(lateResult, taskMap.get(taskId));
          results.push(lateResult);
          collected.add(taskId);
          newlyCollected.push(taskId);
          syncTaskStatusFromResult(taskId, lateResult);
          debugLog('collectResults:lateResult', `taskId=${taskId} EXIT trap wrote .result (${lateResult.selfAssessment}), skipping synthetic NO_GO`);
          continue;
        }

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
        syncTaskStatusFromResult(taskId, syntheticResult);
      }
    }
    if (newlyCollected.length > 0) {
      metric('collect.batch', newlyCollected.length, { duration_ms: String(Date.now() - collectStart) });
    }
    return newlyCollected;
  };

  // ─── Dependency-aware respawn (ADR-045 Decision 2) ──────────────
  // After result collection + queue processing, re-evaluate eligible
  // tasks when dependency_pipeline_enabled is true. When config is
  // missing or flag is false, this is a no-op (legacy FIFO preserved).
  const maybeRespawn = async (): Promise<void> => {
    if (!config?.dependency_pipeline_enabled) return;
    try {
      const respawnEligibleTasks = await loadRespawn();
      await respawnEligibleTasks(projectRoot, sprint, config, spawnOpts);
    } catch (e) {
      debugLog('waitForResults:respawn', e);
    }
  };

  const queueBackend = spawnOpts?.spawnBackend;

  // ─── Sprint 165 Bug Y — single-task spawn helper (idempotent) ────────
  // Centralizes the spawn dance: prompt resolution, allowedTools build,
  // backend dispatch. Honors assignedTaskIds for Bug F idempotency: if the
  // task was already TASK_ASSIGN'd, this is a no-op.
  // Returns true when a new spawn was emitted, false on guard hit or error.
  const spawnIfNotAssigned = async (nextTask: Task): Promise<boolean> => {
    if (assignedTaskIds.has(nextTask.id)) return false;
    assignedTaskIds.add(nextTask.id);
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
      // Mark task in-memory so subsequent slot calculations see it as
      // occupying a slot. Disk persistence stays in spawnWorkers /
      // respawnEligibleTasks paths; legacy FIFO queue does not persist.
      nextTask.status = TaskStatus.EXECUTING;
      lastSpawnAttempt = Date.now();
      return true;
    } catch (err) {
      debugLog('waitForResults:queue-spawn', `Failed to spawn queued task ${nextTask.id}: ${err instanceof Error ? err.message : String(err)}`);
      // Allow a future retry for this task (e.g. force re-scan).
      assignedTaskIds.delete(nextTask.id);
      return false;
    }
  };

  // ─── Sprint 165 Bug Y — refactored processQueue ──────────────────────
  // Behavior preserved for backward compat with task-queue.test.ts:
  //   • For each completedTaskId, pick at most ONE eligible task from the
  //     FIFO remainingQueue.
  //   • If the queue is exhausted or its head was already assigned/collected
  //     (idempotency), do NOT kill the worker for that slot — the slot
  //     simply stays free until a later force re-scan or end of sprint.
  // Added in Sprint 165:
  //   • pickFromQueue skips entries already in assignedTaskIds (Bug F).
  //   • Spawn is funnelled through spawnIfNotAssigned (idempotency guard).
  const processQueue = async (completedTaskIds: string[]): Promise<void> => {
    const { pickFromQueue } = await loadProcessQueueHelpers();
    for (const taskId of completedTaskIds) {
      const nextTask = pickFromQueue(remainingQueue, assignedTaskIds);
      if (!nextTask) break; // queue exhausted — preserve "no kill when no work" contract
      try {
        if (queueBackend) queueBackend.kill(taskId);
        else killWorker(taskId);
      } catch (e) { debugLog('processQueue:killWorker', e); }
      await spawnIfNotAssigned(nextTask);
    }
  };

  // ─── Sprint 165 Bug Y — force re-scan idle slots ─────────────────────
  // When more than FORCE_RESCAN_IDLE_MS has elapsed since the last spawn
  // attempt and there are still uncollected tasks, scan PENDING tasks for
  // eligible ones the legacy `for (taskId of completedTaskIds)` loop never
  // reached (Sprint 161/164/165 hayalet replay).
  //
  // Required:
  //   • `config` available (resolveEffectiveWorkers needs it)
  //   • currentlyExecuting < maxWorkers (slots free)
  //   • at least one PENDING task that isn't already assigned/collected
  //     and whose dependencies (in pipeline mode) are DONE
  const forceRescanIfIdle = async (): Promise<void> => {
    if (!config) return; // legacy callers without config: skip force re-scan
    const elapsed = Date.now() - lastSpawnAttempt;
    if (elapsed < FORCE_RESCAN_IDLE_MS) return;
    const { computeSlotsAvailable, selectEligibleForSpawn } = await loadProcessQueueHelpers();
    const maxWorkers = resolveEffectiveWorkers(config, getSystemProfile());
    const slotsAvailable = computeSlotsAvailable(sprint, maxWorkers);
    if (slotsAvailable === 0) {
      // Reset to avoid hammering the rescan loop while slots remain full.
      lastSpawnAttempt = Date.now();
      return;
    }
    const eligible = selectEligibleForSpawn(sprint, config, slotsAvailable, assignedTaskIds, collected);
    if (eligible.length === 0) {
      lastSpawnAttempt = Date.now(); // nothing to do; reset cadence
      return;
    }
    debugLog(
      'forceRescanIfIdle',
      `slot idle for ${Math.round(elapsed / 1000)}s — respawning ${eligible.length} orphan PENDING task(s): ${eligible.map(t => t.id).join(', ')}`,
    );
    for (const orphan of eligible) {
      const ok = await spawnIfNotAssigned(orphan);
      if (ok) {
        metric('queue.force_rescan_spawn', 1, { taskId: orphan.id });
      }
    }
    lastSpawnAttempt = Date.now();
  };

  const initiallyCollected = await collectResults();
  await processQueue(initiallyCollected);
  // ADR-045 Decision 2: initial pass — Wave 2 may be eligible immediately
  // if Wave 1 results were already on disk when waitForResults entered.
  await maybeRespawn();
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
      // ADR-045 Decision 2: main loop — re-evaluate eligible Wave N+1 tasks
      // each tick when dependency_pipeline_enabled is true.
      await maybeRespawn();
      // Sprint 165 Bug Y — force re-scan idle slots for hayalet PENDING tasks
      // (legacy FIFO mode and dependency pipeline mode both benefit).
      await forceRescanIfIdle();
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
        syncTaskStatusFromResult(taskId, result);
      }
    }
  }
  return results;
}

// ═══ Worker Question Handling ════════════════════════════════════════
// Sprint 135 T-004: Moved to ipc-registry.ts. Re-exported here for backward compat.
export { handleWorkerQuestion, checkWorkerQuestions } from './ipc-registry.js';
