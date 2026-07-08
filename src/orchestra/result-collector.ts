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

// ─── Shared Memory (Sprint 278 COMM-1 — worker-to-worker comms) ──
import { SharedMemory } from './shared-memory.js';

/**
 * Factory for SharedMemory with optional TTL.
 * TTL defaults to 1 hour when not provided.
 */
export function getSharedMemory(projectRoot: string, ttlMs?: number): SharedMemory {
  return new SharedMemory(projectRoot, ttlMs);
}

// ─── Task builder ─────────────────────────────────────────────────
import { buildWorkerPrompt } from './task-builder.js';

// ─── Agent prompt single-source resolution (ADR-048, Sprint 182 F4) ──
import { getAgentPrompt } from '../core/agent-pool.js';

// ─── tmux ─────────────────────────────────────────────────────────
import { spawnWorker, killWorker } from './tmux.js';
import { drainRespawnRequests } from '../nervous/respawn-request.js';

// ─── Token Counter (Sprint 196 — Task 196-005 / WP-4) ────────────
// Orchestrator-side token-usage fill. `mergeWithWorkerClaim` /
// `tryLoadCliLogTokens` are used directly; `extractTokenUsageFromClaudeCli`
// and `extractTokenUsageFromAnthropicResponse` are re-exported below so
// downstream consumers can reach them via the result-collector public
// surface (and the task goCriteria grep finds 2+ matches in
// `src/orchestra/`).
import {
  mergeWithWorkerClaim,
  tryLoadCliLogTokens,
  tryExtractUsageViaAdapter,
} from './token-counter.js';
import { providerRegistry } from '../core/provider.js';
import { loadCostConfig } from '../core/cost-config-loader.js';
import { calculateActualCost } from '../core/cost-calculator.js';
import { writeFileSync, renameSync } from 'node:fs';

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

// Re-export the extractors so downstream callers (and the goCriteria grep)
// can find them via the result-collector public surface. Re-export keeps
// the dependency direction one-way (token-counter has no result-collector
// dep) and satisfies the orchestrator-side wire contract.
export {
  extractTokenUsageFromClaudeCli,
  extractTokenUsageFromAnthropicResponse,
} from './token-counter.js';
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

// Sprint 183 W1-2 — DEPENDENCY_BLOCKED debounce cleanup helper
// Sprint 280 PLANOBS-001 — emitProgress emit-sites
import { clearDependencyBlockedState, writeEvent, emitProgress } from './event-stream.js';

// Sprint 195 195-001 (W-INTEGRITY) — disk-verify gate before synthetic NO_GO.
import { verifyDiskAgainstClaim, DISK_VS_CLAIM_MISMATCH_CHANNEL } from './disk-verify.js';
import { normalizeTaskResultShape, validateTaskResult } from '../core/task-result-schema.js';
import {
  sanitizeHostFacingFiles,
  CONTAINER_PATH_SANITIZED_CHANNEL,
} from './container-path-sanitizer.js';

// ═══ Container-Path Sanitizer Wire (Sprint 201, Layer-2 gate) ═════
//
// Rewrite leaked container `/workspace` paths in host-facing config files a
// worker may have written (hook commands, npm scripts, CI steps, compose,
// Makefile, shell scripts). The sweep is synchronous and acts only on the
// small host-facing subset of `filesChanged`; when it rewrites anything we
// emit a BRAIN→AUDITOR audit event mirroring the disk-verify pattern.
function sanitizeResultHostFacingFiles(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  filesChanged: string[] | undefined,
): void {
  if (!Array.isArray(filesChanged) || filesChanged.length === 0) return;
  const swept = sanitizeHostFacingFiles(projectRoot, filesChanged);
  if (swept.totalRewrites > 0) {
    writeEvent(projectRoot, sprintId, 'brain', 'auditor', CONTAINER_PATH_SANITIZED_CHANNEL, {
      taskId,
      files: swept.rewritten.map(r => r.file),
      totalRewrites: swept.totalRewrites,
    });
  }
}

// ═══ Result-Contract Drift Report (Sprint 369, Task 369-008 V1-STRICT-REPORT) ══
//
// Step-3 prep for the future hard-gate consumer reserved in
// WorkerOutputContractConfig's doc comment (config-types.ts). REPORT-ONLY:
// gated on `worker_output_contract.{enabled,strict_report}` — both must be
// true, the block is inert otherwise (config-types.ts's own contract). When
// on, a genuinely worker-produced `.result` (never a synthetic timeout/exit-
// no-result fabrication — those are already known-incomplete by construction
// and are not checked here) is validated against the strict TaskResultV1
// contract (task-result-schema.ts). A mismatch never blocks, never reshapes
// the result, and never changes selfAssessment/task status — it only emits a
// BRAIN→AUDITOR:RESULT_CONTRACT_DRIFT audit event + a debugLog line, mirroring
// the DISK_VS_CLAIM_MISMATCH_CHANNEL / CONTAINER_PATH_SANITIZED_CHANNEL
// pattern already used above.
export const RESULT_CONTRACT_DRIFT_CHANNEL = 'BRAIN→AUDITOR:RESULT_CONTRACT_DRIFT';

function reportResultContractDrift(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  result: TaskResult,
  config: ResolvedConfig | undefined,
): void {
  if (!config?.worker_output_contract?.enabled || !config.worker_output_contract.strict_report) return;
  try {
    const verdict = validateTaskResult(result);
    if (verdict.ok) return;
    writeEvent(projectRoot, sprintId, 'brain', 'auditor', RESULT_CONTRACT_DRIFT_CHANNEL, {
      taskId,
      missingFields: verdict.missingFields,
      errors: verdict.errors,
      emittedAt: new Date().toISOString(),
    });
    debugLog('reportResultContractDrift', `taskId=${taskId} RESULT_CONTRACT_DRIFT: ${verdict.errors.join('; ')}`);
  } catch (e) {
    debugLog('reportResultContractDrift', e);
  }
}

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

// ═══ TOPP B — Continuous Dispatch Planner (Sprint 178 / ADR-064) ══
// `planDispatch` is the PURE, flag-agnostic, unit-tested model of one dispatch
// tick — legacy FIFO drain + dep-pipeline re-evaluation — the canonical spec for
// the spawn/kill decision (supersedes ADR-045 §3 wave-barrier semantics).
//
// ⚠️ ADR-064-W (tracked): planDispatch is the pinned MODEL, NOT yet the live
// DRIVER. The runtime `dispatchTick` (below) still executes imperatively via
// `processQueue` + `maybeRespawn`; the latter delegates to `respawnEligibleTasks`,
// which ALSO emits DEPENDENCY_BLOCKED events, the `wave.respawn` metric, and sprint
// checkpoints. Routing execution through planDispatch must (a) port those
// side-effects — else an observability/checkpoint regression — and (b) account for
// planDispatch mutating `remainingQueue` (shift). That focused unification is
// tracked as ADR-064-W; until then the dispatch tests keep planDispatch and the
// imperative path logically equivalent.

/**
 * Input state for one dispatch tick.
 *
 * `remainingQueue` is a FIFO list of tasks that exceeded the initial fill
 *   from spawnWorkers — when DECKENT_LEGACY_FIFO=1 it drains one entry per
 *   completed task ID; in continuous mode it falls through to PENDING
 *   re-evaluation. The array is mutated in place (shift).
 */
export interface DispatchState {
  sprint: Sprint;
  config?: Pick<ResolvedConfig, 'dependency_pipeline_enabled'>;
  maxWorkers: number;
  /** Tasks already spawned in this waitForResults call (Bug F idempotency). */
  assignedTaskIds: ReadonlySet<string>;
  /** Tasks whose .result was already collected. */
  collectedIds: ReadonlySet<string>;
  /** FIFO queue of tasks that exceeded the initial spawn fill. Mutated. */
  remainingQueue: Task[];
  /** Newly collected task IDs in this tick (drives legacy-fifo drain). */
  completedTaskIds: readonly string[];
}

export interface DispatchPlan {
  toSpawn: Task[];
  /** Worker IDs to kill (legacy-fifo only). */
  toKill: string[];
  mode: 'continuous' | 'legacy-fifo';
}

/**
 * Pure dispatch planner — flag-agnostic core of TOPP B.
 *
 * Behavior:
 *   - DECKENT_LEGACY_FIFO=1 → legacy-fifo: drains one queue entry per
 *     completed task ID, kills the corresponding worker slot. This is the
 *     pre-Sprint-178 contract preserved as an escape hatch.
 *   - otherwise → continuous (default): every tick re-evaluates eligible
 *     PENDING tasks. Drains the queue first (respecting dep_pipeline
 *     dependencies when the flag is on), then fills remaining slots from
 *     PENDING tasks via the standard dep-aware filter.
 *
 * Mutates `state.remainingQueue` (shift). All other inputs are read-only.
 */
export function planDispatch(
  state: DispatchState,
  env: NodeJS.ProcessEnv = process.env,
): DispatchPlan {
  const legacy = env.DECKENT_LEGACY_FIFO === '1';
  return legacy ? planLegacyFifo(state) : planContinuous(state);
}

function planLegacyFifo(state: DispatchState): DispatchPlan {
  const toSpawn: Task[] = [];
  const toKill: string[] = [];
  for (const completedId of state.completedTaskIds) {
    const next = popEligibleFromQueue(state.remainingQueue, state.assignedTaskIds);
    if (!next) break; // queue exhausted — preserve "no kill when no work"
    toSpawn.push(next);
    toKill.push(completedId);
  }
  return { toSpawn, toKill, mode: 'legacy-fifo' };
}

function planContinuous(state: DispatchState): DispatchPlan {
  const currentlyExecuting = state.sprint.tasks.filter(t =>
    t.status === TaskStatus.EXECUTING
    || t.status === TaskStatus.CLAIMED
    || t.status === TaskStatus.TESTING,
  ).length;
  const slotsAvailable = Math.max(0, state.maxWorkers - currentlyExecuting);
  const toSpawn: Task[] = [];

  if (slotsAvailable === 0) {
    return { toSpawn, toKill: [], mode: 'continuous' };
  }

  const depPipelineEnabled = state.config?.dependency_pipeline_enabled === true;
  // Sprint 179 W0-1 (Bug A): aggregate-aware doneIds. When a fix task DONE
  // supersedes its original NO_GO (via Task.fixForTaskId), downstream tasks
  // that declared a dependency on the *original* id must see the dep as
  // resolved. The aggregate is computed inline here to keep planDispatch
  // pure (no MemoryStore reach). See getAggregateVerdict() for the canonical
  // domain helper invoked by Brain re-evaluation paths.
  const doneIds = new Set<string>();
  for (const t of state.sprint.tasks) {
    if (t.status !== TaskStatus.DONE) continue;
    doneIds.add(t.id);
    if (t.fixForTaskId) doneIds.add(t.fixForTaskId);
  }

  // Step 1 — drain the FIFO queue first (respecting deps if pipeline is on).
  //
  // born-452 dep-drop fix: an index-scan, NOT a shift-while-pop. The prior
  // implementation called popEligibleFromQueue() — which shift()s the head off
  // remainingQueue — and only THEN checked whether its dependencies were done,
  // `continue`-ing past a dep-blocked entry after it had already been removed
  // from the queue. That permanently dropped the task from remainingQueue (it
  // could only be recovered by the separate Step-2 PENDING scan below, which is
  // not guaranteed to still have a free slot by the time it runs). Here, an
  // entry is only ever spliced OUT when it is actually selected (spawn-eligible)
  // or already assigned elsewhere (which legitimately needs no requeue) — a
  // dep-not-ready entry is left in place in the queue and simply skipped this
  // tick, to be re-checked on a later tick once its dependency completes.
  let queueIndex = 0;
  while (toSpawn.length < slotsAvailable && queueIndex < state.remainingQueue.length) {
    const candidate = state.remainingQueue[queueIndex];
    if (!candidate) { queueIndex++; continue; }
    if (state.assignedTaskIds.has(candidate.id)) {
      state.remainingQueue.splice(queueIndex, 1); // already spawned elsewhere — drop, no requeue needed
      continue;
    }
    if (depPipelineEnabled && candidate.dependencies && candidate.dependencies.length > 0) {
      const allDone = candidate.dependencies.every(dep => doneIds.has(dep));
      if (!allDone) {
        queueIndex++; // deps not yet satisfied — stay queued, check the next entry
        continue;
      }
    }
    state.remainingQueue.splice(queueIndex, 1);
    toSpawn.push(candidate);
  }

  // Step 2 — fill remaining slots from PENDING tasks (dep-aware).
  const alreadyChosen = new Set(toSpawn.map(t => t.id));
  for (const task of state.sprint.tasks) {
    if (toSpawn.length >= slotsAvailable) break;
    if (task.status !== TaskStatus.PENDING) continue;
    if (state.assignedTaskIds.has(task.id)) continue;
    if (state.collectedIds.has(task.id)) continue;
    if (alreadyChosen.has(task.id)) continue;
    if (depPipelineEnabled && task.dependencies && task.dependencies.length > 0) {
      const allDone = task.dependencies.every(dep => doneIds.has(dep));
      if (!allDone) continue;
    }
    toSpawn.push(task);
  }

  return { toSpawn, toKill: [], mode: 'continuous' };
}

// Used by planLegacyFifo only — planContinuous's Step 1 uses its own dep-aware
// index-scan above (born-452 dep-drop fix) since this shift-while-pop shape
// has no notion of dependencies and would drop a dep-blocked entry.
function popEligibleFromQueue(
  queue: Task[],
  assigned: ReadonlySet<string>,
): Task | undefined {
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate) return undefined;
    if (assigned.has(candidate.id)) continue;
    return candidate;
  }
  return undefined;
}

// ═══ Ready-but-Undispatched Detection (Sprint 272 — Task 272-002) ═══
//
// The Sprint 271-013 live race: a PENDING task whose final blocking dependency
// lands in (or just before) the same poll cycle as the collection-done check
// can slip past the dispatcher entirely — `maybeRespawn()` is a no-op when
// `dependency_pipeline_enabled` is false, and `forceRescanIfIdle()` only fires
// after a 5-minute idle window. The task then sits PENDING until the sprint
// timeout, and EVALUATE writes a synthetic NO_GO for work that never ran.
//
// This pure helper names that set: PENDING tasks whose dependencies are ALL
// satisfied (aggregate-aware, mirroring `planContinuous`'s `fixForTaskId`
// roll-up) but which have neither been collected nor assigned a worker.
// `waitForResults` dispatches these IMMEDIATELY each tick so the invariant
// "every task is TERMINAL (result collected) OR dispatched-and-awaited" holds
// before the main loop may exit toward EVALUATE.
//
// Scope is deliberately narrow — only dependency-bearing tasks count. A no-dep
// PENDING overflow task keeps the existing force-rescan cadence (behavior
// preserved); this targets exactly the "dependencies newly satisfied" race.
export function findReadyUndispatchedTasks(
  sprint: Sprint,
  collectedIds: ReadonlySet<string>,
  assignedTaskIds: ReadonlySet<string>,
): Task[] {
  const doneIds = new Set<string>();
  for (const t of sprint.tasks) {
    if (t.status !== TaskStatus.DONE) continue;
    doneIds.add(t.id);
    if (t.fixForTaskId) doneIds.add(t.fixForTaskId);
  }
  const ready: Task[] = [];
  for (const task of sprint.tasks) {
    if (task.status !== TaskStatus.PENDING) continue;
    if (collectedIds.has(task.id)) continue;
    if (assignedTaskIds.has(task.id)) continue;
    if (!task.dependencies || task.dependencies.length === 0) continue;
    if (!task.dependencies.every(dep => doneIds.has(dep))) continue;
    ready.push(task);
  }
  return ready;
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
 * Enrich a TaskResult with tokenUsage data.
 *
 * Resolution order (Sprint 196 196-005 / WP-4 — measured-wins):
 *   1. Try to load a measured `TokenUsage` from the CLI side-channel log
 *      (`.tasks/task-{id}.cli-output.json` or `task-{id}.log`). When
 *      present, merge it with whatever the worker self-reported — measured
 *      counts override estimates, worker-provided `provider`/`model` are
 *      retained when the measurement omits them.
 *   2. A worker now reports a ZERO-count stub (WP-4: an LLM cannot count its
 *      own tokens, so the prompt tells it to leave the counts at 0 and let the
 *      orchestrator own them). A stub (inputTokens == 0 && outputTokens == 0) is
 *      treated as "fill me" → fall through to the estimate, preserving the
 *      worker-provided `provider`/`model`. A LEGACY claim with real non-zero
 *      counts is kept verbatim (back-compat).
 *   3. If no real claim is available, fall back to the heuristic
 *      (`estimateTokenUsage`) so downstream consumers always see a populated
 *      TokenUsage shape.
 *
 * Mutates the result in place for efficiency. `projectRoot` is optional —
 * when omitted, measured-fill is skipped and the function preserves the
 * original behavior (real claim wins, then heuristic). With no task context
 * and no real claim, tokenUsage is left as-is (undefined or the stub) —
 * downstream cost/metrics already tolerate a missing tokenUsage.
 */
/**
 * CLI-agent providers whose REAL per-task usage lands in `.tasks/task-{id}.log` as a
 * `--output-format json` / `--json` envelope (parsed by the provider adapter's
 * extractUsage). For these, the docker/tmux backend dumps the envelope to `.log` only
 * AFTER the container exits — which can lag the agent-written `.result` by a second or
 * two. {@link waitForCliLog} closes that race so enrichment reads the REAL envelope
 * instead of falling through to the fabricated heuristic.
 */
const CLI_USAGE_LOG_PROVIDERS = new Set(['claude', 'codex', 'gemini']);

/** Wait (bounded) for a CLI worker's `.log` to be written + non-empty. Returns as soon
 *  as it appears, or after `timeoutMs` (then enrichment falls back to the heuristic). */
export async function waitForCliLog(
  projectRoot: string,
  taskId: string,
  timeoutMs = 8000,
): Promise<void> {
  const logPath = join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const s = await stat(logPath);
      if (s.size > 0) return;
    } catch { /* not written yet */ }
    if (Date.now() >= deadline) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

export function enrichResultTokenUsage(
  result: TaskResult,
  task: Task | undefined,
  projectRoot?: string,
): void {
  // Step 0 (Worker Output Contract): provider-AGNOSTIC measured fill — the task's
  // provider adapter parses its OWN usage format. This is what finally captures
  // tokens for non-Claude providers (ollama/codex/gemini/openai-compatible),
  // where the Claude-CLI-specific tryLoadCliLogTokens below always returned null
  // (the long-standing "token counter never works" gap).
  if (projectRoot && task?.provider) {
    let adapter;
    try {
      adapter = providerRegistry.getProvider(task.provider);
    } catch {
      adapter = undefined;
    }
    const viaAdapter = tryExtractUsageViaAdapter(projectRoot, result.taskId, adapter);
    if (viaAdapter) {
      const merged = mergeWithWorkerClaim(result.tokenUsage, viaAdapter) ?? viaAdapter;
      result.tokenUsage = { ...merged, provider: task.provider };
      return;
    }
  }

  // Step 1 (Sprint 196 WP-4): orchestrator-side measured fill — always wins.
  if (projectRoot) {
    const measured = tryLoadCliLogTokens(projectRoot, result.taskId);
    if (measured) {
      result.tokenUsage = mergeWithWorkerClaim(result.tokenUsage, measured);
      return;
    }
  }

  // Step 2 (WP-4): keep a legacy claim with REAL counts; a zero stub means "fill me".
  const claim = result.tokenUsage;
  const hasRealCounts = !!claim && ((claim.inputTokens ?? 0) > 0 || (claim.outputTokens ?? 0) > 0);
  if (hasRealCounts) return;

  // Step 3: heuristic estimate (preserve the worker stub's provider/model when the
  // task lacks them). With no task context the stub/undefined is left untouched.
  if (!task) return;
  const estimated = estimateTokenUsage(task, result);
  result.tokenUsage = {
    ...estimated,
    provider: estimated.provider ?? claim?.provider,
    model: estimated.model ?? claim?.model,
  };
}

/**
 * Orchestrator-side cost fill (Worker Output Contract §1.4): compute the monetary
 * cost of a task's LLM usage from its captured `tokenUsage` + per-model pricing and
 * write it to `result.cost`. Self-hosted/local models (ollama) → `{ usd: 0,
 * isLocal: true }`.
 *
 * Best-effort + total: a missing tokenUsage / projectRoot, or a cost-config load
 * failure, leaves `result.cost` unset rather than throwing. Call AFTER
 * {@link enrichResultTokenUsage} so the finalized tokenUsage is in place.
 */
export function enrichResultCost(
  result: TaskResult,
  task: Task | undefined,
  projectRoot?: string,
): void {
  const usage = result.tokenUsage;
  if (!projectRoot || !usage) return;
  if ((usage.inputTokens ?? 0) === 0 && (usage.outputTokens ?? 0) === 0) return;
  try {
    const costConfig = loadCostConfig(projectRoot);
    const model = usage.model ?? task?.forceModel ?? 'unknown';
    const provider = usage.provider ?? task?.provider;
    result.cost = calculateActualCost(
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        // G6 fix: carry cache-CREATION tokens into cost. Anthropic prices cache-write
        // at 1.25× input (the limit-dominant cost per F1-TOK); dropping it silently
        // under-counted every cache-using task. calculateActualCost already prices it.
        cacheCreationTokens: usage.cacheCreationTokens,
      },
      model,
      provider,
      costConfig,
    );
  } catch (err) {
    debugLog('enrichResultCost', err);
  }
}

/**
 * Persist the orchestrator-enriched result (tokenUsage + cost) back to the
 * `.result` FILE. {@link enrichResultTokenUsage}/{@link enrichResultCost} mutate
 * the in-memory result only; without this write the on-disk `.result` keeps the
 * worker's 0/0 placeholder (the "token counter never shows in the file" bug).
 *
 * Side-effect-free + best-effort: a plain atomic write (temp + rename) — NOT
 * worker.ts `writeResult`, which also re-applies the honest-gate stub-downgrade
 * and a task-status update (wrong at collection time). A write failure is logged
 * and ignored so it never breaks collection.
 */
function persistEnrichedResult(projectRoot: string, result: TaskResult): void {
  try {
    const path = join(projectRoot, TASKS_DIR, `task-${result.taskId}.result`);
    const tmp = `${path}.enrich-tmp`;
    writeFileSync(tmp, JSON.stringify(result, null, 2), 'utf-8');
    renameSync(tmp, path);
  } catch (err) {
    debugLog('persistEnrichedResult', err);
  }
}

// ═══ Exported Functions ═══════════════════════════════════════════

/**
 * Resolve the agent prompt for a task's assigned agent.
 *
 * Single-source contract (ADR-048, Sprint 182 F4):
 *   PROMPT.md (canonical) > agent.json::systemPrompt (degraded fallback) > undefined.
 *
 * Concatenation is NOT performed. `agent.json::systemPrompt` is retained in
 * the schema for routing scoring + UI display but never co-exists with
 * PROMPT.md in the worker prompt block.
 */
export async function resolveAgentPrompt(projectRoot: string, task: Task): Promise<string | undefined> {
  const agentId = task.assignedAgent;
  if (!agentId || agentId === 'generic') return undefined;

  const resolution = getAgentPrompt(agentId, projectRoot);
  if (resolution.source === 'none') return undefined;
  return resolution.content;
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
    } catch (e) {
      // A skill assigned to the task whose SKILL.md could not be loaded is NOT
      // injected into the worker prompt — yet downstream outcome tracking still
      // credits it. Surface it (observability) rather than dropping it silently so
      // a missing/unsynced skill file is visible, not an invisible phantom credit.
      // (Phantom/typo'd ids are already stopped upstream at routing-engine's
      // forceSkills validation; this catches the residual "valid id, missing file".)
      metric('skill.prompt_load_failed', 1, { skillId });
      debugLog('resolveSkillPrompts:readSkillFile', e);
    }
  }
  return results;
}

/**
 * Build the write-scope tool-allowlist targets for a spawn.
 *
 * born-452 THROW-ADAYLARI: extracted so the undefined-scope throw path is
 * unit-testable in isolation. `task.scope.directories` / `task.scope.filesWrite`
 * are typed as required arrays, but a task loaded from a malformed/legacy
 * on-disk JSON is not runtime-validated — spreading an undefined array
 * (`...undefined`) throws "is not iterable". Defaulting both to `[]` here
 * closes that path without changing behavior for any well-formed task.
 */
export function buildSpawnWriteTargets(task: Pick<Task, 'scope'>): string[] {
  const directories = task.scope?.directories ?? [];
  const filesWrite = task.scope?.filesWrite ?? [];
  return ['.tasks/', ...directories, ...filesWrite].filter(Boolean);
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
  // born-452 tick-armor: a same-error escalation ceiling — see the main loop below.
  const MAX_CONSECUTIVE_SAME_TICK_ERRORS = 5;
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
        const result = normalizeTaskResultShape(readJsonSafe<TaskResult>(resultPath));
        if (result) {
          // Sprint 231 T1 — synthetic exit-0-no-result uniform disk-verify gate.
          // Docker EXIT trap (spawn-backend-docker.ts) writes a NO_GO `.result`
          // when the worker exits cleanly without producing one. Shape:
          //   selfAssessment="NO_GO" + filesChanged=[] +
          //   notes "Worker exited without writing result (exitCode=...)".
          // Without this gate the `.result`-exists branch would skip disk-verify
          // and mask real on-disk work — non-uniform with the timeout-path
          // (lines 543-613) which already runs verifyDiskAgainstClaim. Mirror
          // that pattern: if disk evidence exists, enrich filesChanged/linesAdded
          // in place, reclassify task status to MANUAL_REVIEW_REQUIRED, and
          // emit BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH. Disk-evidence absent →
          // NO_GO stays (legacy behavior preserved).
          const isSyntheticExitNoResult =
            result.selfAssessment === 'NO_GO'
            && (!result.filesChanged || result.filesChanged.length === 0)
            && typeof result.notes === 'string'
            && result.notes.includes('Worker exited without writing result');
          let reclassifyToManualReview = false;
          if (isSyntheticExitNoResult) {
            const taskForScope = taskMap.get(taskId);
            const diskVerify = taskForScope
              ? verifyDiskAgainstClaim(projectRoot, taskForScope.scope)
              : { hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] as string[] };
            if (diskVerify.hasDiskEvidence) {
              result.filesChanged = diskVerify.untrackedFiles;
              result.linesAdded = diskVerify.linesAdded;
              result.notes =
                `${result.notes} | disk-verify found evidence ` +
                `(linesAdded=${diskVerify.linesAdded}, ` +
                `untrackedFiles=${diskVerify.untrackedFiles.length}). ` +
                `Status reclassified as MANUAL_REVIEW_REQUIRED — see sprint events.`;
              reclassifyToManualReview = true;
              try {
                writeEvent(
                  projectRoot,
                  sprint.id,
                  'brain',
                  'auditor',
                  DISK_VS_CLAIM_MISMATCH_CHANNEL,
                  {
                    taskId,
                    linesAdded: diskVerify.linesAdded,
                    untrackedFiles: diskVerify.untrackedFiles,
                    cause: 'exit-0-no-result',
                    emittedAt: new Date().toISOString(),
                  },
                );
              } catch (e) { debugLog('collectResults:syntheticDiskVerifyEmit', e); }
            }
          }
          // Close the CLI-log race: the docker/tmux backend dumps the usage envelope to
          // .log only AFTER the container exits, which can lag the agent-written .result.
          // (subprocess streams it live → no race; tests pass no backend → no wait.)
          const enrichTask = taskMap.get(taskId);
          const backendName = spawnOpts?.spawnBackend?.name ?? config?.spawn_backend;
          const postExitLogBackend = backendName === 'docker' || backendName === 'tmux';
          if (enrichTask && postExitLogBackend && CLI_USAGE_LOG_PROVIDERS.has(enrichTask.provider as string)) {
            // The .log is dumped only after the container exits, which can lag the
            // agent-written .result by 20-30s on a multi-turn task — wait generously
            // (returns the instant the .log appears, so prompt dumps cost nothing).
            await waitForCliLog(projectRoot, taskId, 45000);
          }
          enrichResultTokenUsage(result, enrichTask, projectRoot);
          enrichResultCost(result, enrichTask, projectRoot);
          sanitizeResultHostFacingFiles(projectRoot, sprint.id, taskId, result.filesChanged);
          // Persist the orchestrator-enriched tokenUsage + cost back to the .result FILE.
          // enrichResultTokenUsage/enrichResultCost mutate the in-memory result only;
          // without this write the on-disk .result keeps the worker's 0/0 placeholder.
          persistEnrichedResult(projectRoot, result);
          reportResultContractDrift(projectRoot, sprint.id, taskId, result, config);
          results.push(result);
          collected.add(taskId);
          newlyCollected.push(taskId);
          syncTaskStatusFromResult(taskId, result);
          // Sprint 278 COMM-1 — write sharedNotes to SharedMemory (best-effort, opt-in)
          if (
            config?.worker_comms?.enabled
            && (result.selfAssessment === 'DONE' || result.selfAssessment === 'GO_WITH_TECH_DEBT')
            && Array.isArray(result.sharedNotes)
            && result.sharedNotes.length > 0
          ) {
            const sm = getSharedMemory(projectRoot, config.worker_comms.shared_memory_ttl_ms);
            for (const note of result.sharedNotes) {
              if (!note || typeof note.key !== 'string' || !note.key) continue;
              try {
                sm.write(note.key, note.value, taskId);
              } catch (e) {
                debugLog('collectResults:sharedNotes:write', e);
              }
            }
          }
          if (reclassifyToManualReview) {
            const taskRef = taskMap.get(taskId);
            if (taskRef) taskRef.status = TaskStatus.MANUAL_REVIEW_REQUIRED;
          }
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
        const lateResult = normalizeTaskResultShape(readJsonSafe<TaskResult>(lateResultPath));
        if (lateResult) {
          enrichResultTokenUsage(lateResult, taskMap.get(taskId), projectRoot);
          enrichResultCost(lateResult, taskMap.get(taskId), projectRoot);
          sanitizeResultHostFacingFiles(projectRoot, sprint.id, taskId, lateResult.filesChanged);
          // Persist enriched tokenUsage + cost to the .result FILE (see above).
          persistEnrichedResult(projectRoot, lateResult);
          reportResultContractDrift(projectRoot, sprint.id, taskId, lateResult, config);
          results.push(lateResult);
          collected.add(taskId);
          newlyCollected.push(taskId);
          syncTaskStatusFromResult(taskId, lateResult);
          debugLog('collectResults:lateResult', `taskId=${taskId} EXIT trap wrote .result (${lateResult.selfAssessment}), skipping synthetic NO_GO`);
          continue;
        }

        // Sprint 195 195-001 (W-INTEGRITY) — disk-verify gate.
        // Before writing a synthetic NO_GO, check whether the worker actually
        // produced code on disk. If so, convert to MANUAL_REVIEW_REQUIRED so a
        // human can review the partial work instead of losing it to a false NO_GO.
        const taskForScope = taskMap.get(taskId);
        const diskVerify = taskForScope
          ? verifyDiskAgainstClaim(projectRoot, taskForScope.scope)
          : { hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] as string[] };

        const syntheticResult: TaskResult = diskVerify.hasDiskEvidence
          ? {
              taskId,
              workerId: `w-${taskId}`,
              filesChanged: diskVerify.untrackedFiles,
              linesAdded: diskVerify.linesAdded,
              linesRemoved: 0,
              testsPassed: false,
              coverage: 0,
              selfAssessment: 'NO_GO',
              notes:
                `Worker timeout — process exceeded time limit and was killed; ` +
                `disk-verify found evidence (linesAdded=${diskVerify.linesAdded}, ` +
                `untrackedFiles=${diskVerify.untrackedFiles.length}). ` +
                `Status reclassified as MANUAL_REVIEW_REQUIRED — see sprint events.`,
              tokenUsage: {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                provider: taskForScope?.provider as TokenUsage['provider'],
                model: (taskForScope?.forceModel ?? taskForScope?.model) as TokenUsage['model'],
              },
            }
          : {
              taskId,
              workerId: `w-${taskId}`,
              filesChanged: [],
              linesAdded: 0,
              linesRemoved: 0,
              testsPassed: false,
              coverage: 0,
              selfAssessment: 'NO_GO',
              notes: 'Worker timeout — process exceeded time limit and was killed',
              tokenUsage: {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                provider: taskForScope?.provider as TokenUsage['provider'],
                model: (taskForScope?.forceModel ?? taskForScope?.model) as TokenUsage['model'],
              },
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

        if (diskVerify.hasDiskEvidence) {
          // Override the status mutation: NO_GO → MANUAL_REVIEW_REQUIRED so the
          // operator can triage on-disk work before cascade fix.
          const taskRef = taskMap.get(taskId);
          if (taskRef) taskRef.status = TaskStatus.MANUAL_REVIEW_REQUIRED;
          try {
            writeEvent(
              projectRoot,
              sprint.id,
              'brain',
              'auditor',
              DISK_VS_CLAIM_MISMATCH_CHANNEL,
              {
                taskId,
                linesAdded: diskVerify.linesAdded,
                untrackedFiles: diskVerify.untrackedFiles,
                cause: 'timeout-no-result',
                emittedAt: new Date().toISOString(),
              },
            );
          } catch (e) { debugLog('collectResults:diskVerifyEmit', e); }
        }
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
  //
  // Sprint 178 / ADR-064 — TOPP B: maybeRespawn now also short-circuits
  // when DECKENT_LEGACY_FIFO=1 is set. This is the documented rollback
  // escape hatch — operators can re-pin the old wave-barrier semantics
  // by setting the env var without changing any source code.
  const maybeRespawn = async (): Promise<void> => {
    if (process.env.DECKENT_LEGACY_FIFO === '1') return;
    if (!config?.dependency_pipeline_enabled) return;
    try {
      const respawnEligibleTasks = await loadRespawn();
      await respawnEligibleTasks(projectRoot, sprint, config, spawnOpts);
      // Sprint 183 W1-2 — clear DEPENDENCY_BLOCKED dedupe state for any task
      // that just moved out of PENDING (spawned or otherwise no longer
      // blocked). This frees the per-sprint Map of stale entries and ensures
      // that if a task is later re-blocked by a cascade it will emit a fresh
      // event instead of being silently suppressed by stale state.
      for (const task of sprint.tasks) {
        if (task.status !== TaskStatus.PENDING) {
          clearDependencyBlockedState(sprint.id, task.id);
        }
      }
    } catch (e) {
      debugLog('waitForResults:respawn', e);
    }
  };

  // ─── TOPP B continuous-dispatch tick (Sprint 178 / ADR-064) ────
  // Unified spawn entry that replaces the explicit dual-call sequence
  // (processQueue + maybeRespawn) in the main loop. Behavior:
  //   - DECKENT_LEGACY_FIFO=1 → legacy: only processQueue runs (the
  //     pre-Sprint-178 wave-barrier semantics).
  //   - default (continuous) → both run: queue is drained AND PENDING
  //     tasks are re-evaluated for the freed slot.
  // Kept as an internal closure so the existing main loop sequence is
  // preserved verbatim — callers that still invoke processQueue +
  // maybeRespawn directly (e.g. forceRescanIfIdle) are unaffected.
  const dispatchTick = async (newlyCollected: string[]): Promise<void> => {
    await processQueue(newlyCollected);
    await maybeRespawn();
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
    // born-452 THROW-ADAYLARI: the try/catch used to start only at the backend-spawn
    // call below, leaving prompt resolution + template rendering (resolveAgentPrompt /
    // resolveSkillPrompts / buildWorkerPrompt — the latter renders the full worker
    // prompt via buildTaskPrompt, which does unguarded property access on task.scope)
    // OUTSIDE it. A throw there propagated straight past this function with
    // `nextTask.id` already added to assignedTaskIds and never rolled back — a
    // permanent self-inflicted "assigned but never spawned" deadlock for that task,
    // matching row-452's "queued tasks never spawned" symptom independent of whether
    // the caller happens to survive the throw (e.g. via the main-loop tick-armor).
    // Widening the try/catch to cover the whole spawn attempt makes any failure in
    // this sequence retryable next tick instead of a silent permanent stall.
    try {
      const queueAgentPrompt = await resolveAgentPrompt(projectRoot, nextTask);
      const queueSkillPrompts = await resolveSkillPrompts(projectRoot, nextTask);
      const prompt = buildWorkerPrompt(nextTask, queueAgentPrompt, queueSkillPrompts);
      const writeTargets = buildSpawnWriteTargets(nextTask);
      const allowedTools = writeTargets.length > 0
        ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
        : 'Read,Write,Edit,Bash,Glob,Grep';
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
      // PLANOBS-001 emit-site: SPAWN — fail-safe, never throws
      emitProgress({ root: projectRoot, phase: 'SPAWN', detail: nextTask.id });
      return true;
    } catch (err) {
      debugLog('waitForResults:queue-spawn', `Failed to spawn queued task ${nextTask.id}: ${err instanceof Error ? err.message : String(err)}`);
      // Allow a future retry for this task (e.g. force re-scan).
      assignedTaskIds.delete(nextTask.id);
      return false;
    }
  };

  // ─── N3: cooperative nervous worker-respawn drain ────────────────────
  // The nervous WORKER_RESPAWN action does NOT kill+spawn workers itself (that
  // would race this loop, the single owner of worker lifecycle). It writes a
  // durable respawn-REQUEST; here — inside this loop, opt-in via
  // config.nervous_system.worker_respawn — we drain it and re-spawn the stale
  // task through the controller's OWN idempotent single-task spawn. No race.
  const drainNervousRespawns = async (): Promise<void> => {
    if (!config?.nervous_system?.worker_respawn) return;
    for (const reqTaskId of drainRespawnRequests(projectRoot)) {
      const task = taskMap.get(reqTaskId);
      if (!task) continue;
      // Only act on a live (stale) worker — never resurrect a settled task.
      if (
        task.status !== TaskStatus.EXECUTING
        && task.status !== TaskStatus.CLAIMED
        && task.status !== TaskStatus.TESTING
      ) continue;
      try {
        if (queueBackend) queueBackend.kill(reqTaskId);
        else killWorker(reqTaskId);
      } catch (e) {
        debugLog('drainNervousRespawns:kill', e);
      }
      assignedTaskIds.delete(reqTaskId);
      task.status = TaskStatus.PENDING;
      await spawnIfNotAssigned(task);
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

  // ─── Sprint 272 Task 272-002 — immediate ready-task dispatch ─────────
  // Dispatch any PENDING task whose dependencies were JUST satisfied right
  // now — not on forceRescanIfIdle's 5-minute cadence and not via the
  // dependency_pipeline-gated maybeRespawn (a no-op when the flag is off).
  // This closes the Sprint 271-013 race where such a task sat PENDING until
  // the sprint timeout and EVALUATE synthesised a NO_GO for work that never
  // ran.
  //
  // Bounded by the main loop's timeout: a task that cannot be spawned (spawn
  // error → spawnIfNotAssigned rolls back its assignedTaskIds entry and
  // returns false) is simply retried on later ticks and ultimately falls
  // through to the honest synthetic NO_GO at EVALUATE — no infinite wait.
  // Legacy callers without `config` are a no-op (existing behavior preserved).
  const dispatchReadyTasks = async (): Promise<void> => {
    if (!config) return;
    const ready = findReadyUndispatchedTasks(sprint, collected, assignedTaskIds);
    if (ready.length === 0) return;
    const { computeSlotsAvailable } = await loadProcessQueueHelpers();
    const maxWorkers = resolveEffectiveWorkers(config, getSystemProfile());
    let slots = computeSlotsAvailable(sprint, maxWorkers);
    for (const task of ready) {
      if (slots <= 0) break;
      const ok = await spawnIfNotAssigned(task);
      if (ok) {
        slots--;
        metric('queue.ready_dispatch', 1, { taskId: task.id });
      }
    }
  };

  // P0-A (lifecycle-robustness, sprint-323 hang fix): cascade-skip dead-blocked
  // tasks. Dispatch requires every dependency in `doneIds` (DONE / debt-DONE only,
  // see dispatchTick), so a task whose dependency reached a TERMINAL FAILED state
  // (NO_GO / MANUAL_REVIEW_REQUIRED) can NEVER become ready — it stays PENDING
  // forever and the `collected === taskIds.size` completion check never satisfies,
  // hanging EXECUTE so EVALUATE/FIX never run (sprint-323 hung at 28/31 on three
  // cleanups whose deps NO_GO'd). Write a synthetic cascade-skip NO_GO for each so
  // it is collected (deferred + re-runnable, NOT silently lost) and EXECUTE can
  // complete. The while-loop resolves transitivity in one call: a freshly-skipped
  // task becomes NO_GO, so its own dependents are skipped on the next scan.
  const cascadeSkipDeadBlocked = async (): Promise<number> => {
    let totalSkipped = 0;
    let changed = true;
    while (changed) {
      changed = false;
      const failedIds = new Set<string>();
      for (const t of sprint.tasks) {
        if (t.status === TaskStatus.NO_GO || t.status === TaskStatus.MANUAL_REVIEW_REQUIRED) {
          failedIds.add(t.id);
        }
      }
      if (failedIds.size === 0) break;
      for (const t of sprint.tasks) {
        if (collected.has(t.id)) continue;
        if (t.status !== TaskStatus.PENDING) continue;   // only un-dispatched
        if (assignedTaskIds.has(t.id)) continue;          // not actively running
        const failedDep = (t.dependencies ?? []).find(d => failedIds.has(d));
        if (!failedDep) continue;
        const skip: TaskResult = {
          taskId: t.id,
          workerId: `w-${t.id}`,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'NO_GO',
          notes:
            `Cascade-skipped (lifecycle-robustness P0-A): dependency ${failedDep} ended ` +
            `NO_GO/MANUAL_REVIEW, so this dependent was never dispatched. Re-run after the ` +
            `dependency is fixed.`,
          tokenUsage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            provider: t.provider as TokenUsage['provider'],
            model: (t.forceModel ?? t.model) as TokenUsage['model'],
          },
        };
        try {
          await writeFile(
            join(projectRoot, TASKS_DIR, `task-${t.id}.result`),
            JSON.stringify(skip, null, 2),
            'utf-8',
          );
        } catch (e) { debugLog('cascadeSkipDeadBlocked:write', e); }
        results.push(skip);
        collected.add(t.id);
        syncTaskStatusFromResult(t.id, skip);
        totalSkipped++;
        changed = true;
        debugLog('cascadeSkipDeadBlocked', `task ${t.id} skipped (dep ${failedDep} failed)`);
      }
    }
    return totalSkipped;
  };

  const initiallyCollected = await collectResults();
  // ADR-064 (TOPP B): unified dispatch tick — replaces the dual
  // `await processQueue(...); await maybeRespawn();` sequence so the
  // wave-barrier between Wave N completion and Wave N+1 spawn collapses
  // to a single function call. Initial pass — Wave 2 may be eligible
  // immediately if Wave 1 results were already on disk when entered.
  await dispatchTick(initiallyCollected);
  // Sprint 272 T2 — dispatch tasks whose deps were already satisfied at entry
  // before the early all-collected return, so the EVALUATE transition never
  // skips a runnable task.
  await dispatchReadyTasks();
  await cascadeSkipDeadBlocked();
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
  // born-452 tick-armor: a single tick-step throwing (collectResults /
  // drainNervousRespawns / dispatchTick / forceRescanIfIdle / dispatchReadyTasks /
  // cascadeSkipDeadBlocked) used to propagate straight out of this function —
  // sprint-351 EXECUTE died mid-run from exactly this (born-453 instrumented the
  // surfacing; this closes the survival gap). A tick that throws is now
  // debugLog'd + counted instead of killing the loop. Only when the SAME error
  // repeats on more than MAX_CONSECUTIVE_SAME_TICK_ERRORS consecutive ticks do we
  // rethrow — an infinite identical-error tight-loop is a real failure, not a
  // transient one, and the sprint-controller's EXECUTE-ERROR-SURFACE catch is the
  // right place to report it.
  let consecutiveTickErrors = 0;
  let lastTickErrorSignature: string | null = null;
  try {
    while (unlimited || Date.now() - startTime < timeout) {
      ipcWakeupPromise = makeIpcWakeupPromise();
      // Race: fs.watch / fallback-poll vs IPC heartbeat wakeup
      await Promise.race([watcher.waitForChange(), ipcWakeupPromise]);
      try {
        const newlyCollected = await collectResults();
        // N3: action any cooperative nervous respawn-requests before dispatch (no-op
        // unless config.nervous_system.worker_respawn). Single-owner — no race.
        await drainNervousRespawns();
        // ADR-064 (TOPP B): unified dispatch tick — main loop spawn entry.
        // Continuous dispatch — re-evaluate eligible Wave N+1 tasks each
        // tick when dependency_pipeline_enabled is true; honor
        // DECKENT_LEGACY_FIFO=1 rollback escape inside dispatchTick itself.
        await dispatchTick(newlyCollected);
        // Sprint 165 Bug Y — force re-scan idle slots for hayalet PENDING tasks
        // (legacy FIFO mode and dependency pipeline mode both benefit).
        await forceRescanIfIdle();
        // Sprint 272 T2 — dispatch dependency-just-satisfied PENDING tasks NOW so
        // the collection-done check below is only reached once every ready task
        // is dispatched-and-awaited (never a synthetic NO_GO for unran work).
        await dispatchReadyTasks();
        await cascadeSkipDeadBlocked();
        consecutiveTickErrors = 0;
        lastTickErrorSignature = null;
      } catch (tickErr) {
        const signature = tickErr instanceof Error
          ? `${tickErr.name}:${tickErr.message}`
          : String(tickErr);
        consecutiveTickErrors = signature === lastTickErrorSignature ? consecutiveTickErrors + 1 : 1;
        lastTickErrorSignature = signature;
        debugLog(
          'waitForResults:tickArmor',
          `tick step threw (consecutive-same-error=${consecutiveTickErrors}/${MAX_CONSECUTIVE_SAME_TICK_ERRORS}): ${signature}`,
        );
        metric('waitForResults.tick_error', 1, { consecutive: String(consecutiveTickErrors) });
        if (consecutiveTickErrors > MAX_CONSECUTIVE_SAME_TICK_ERRORS) {
          debugLog('waitForResults:tickArmor:escalate', `same error repeated >${MAX_CONSECUTIVE_SAME_TICK_ERRORS}× consecutively — escalating: ${signature}`);
          throw tickErr instanceof Error ? tickErr : new Error(signature);
        }
      }
      if (collected.size === taskIds.size) break;
      // Check for pending worker questions and auto-answer them
      // (sprintId → NPM-ADVISORY questions surface a human notification)
      checkWorkerQuestions(projectRoot, taskIds, collected, { sprintId: sprint.id });
      // Periodic progress log (every 5 minutes)
      const now = Date.now();
      if (now - lastProgressLog >= PROGRESS_LOG_INTERVAL_MS) {
        debugLog('waitForResults:progress', `Sprint devam ediyor — ${collected.size}/${taskIds.size} task tamamlandı (${Math.round((now - startTime) / 60000)}dk)`);
        // PLANOBS-001 emit-site: EXECUTE progress — fail-safe, never throws
        emitProgress({
          root: projectRoot,
          phase: 'EXECUTE',
          pct: taskIds.size > 0 ? Math.round((collected.size / taskIds.size) * 100) : 0,
          detail: `${collected.size}/${taskIds.size}`,
        });
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
      const result = normalizeTaskResultShape(readJsonSafe<TaskResult>(resultPath));
      if (result) {
        enrichResultTokenUsage(result, taskMap.get(taskId), projectRoot);
        enrichResultCost(result, taskMap.get(taskId), projectRoot);
        // Sprint 201 review-feedback — close the final-sweep race window: a
        // worker whose real .result lands only after the watcher closed is a
        // genuine worker-sourced filesChanged, same source as branches (a)/(b).
        // The helper is idempotent + guarded, so this is harmless if already swept.
        sanitizeResultHostFacingFiles(projectRoot, sprint.id, taskId, result.filesChanged);
        // Persist enriched tokenUsage + cost to the .result FILE (see above).
        persistEnrichedResult(projectRoot, result);
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
