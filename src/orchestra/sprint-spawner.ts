// ═══ Sprint Spawner ════════════════════════════════════════════════
// Extracted from sprint-controller.ts — worker spawn functions:
//   spawnWorkers(), respawnEligibleTasks(), validateTaskDependencies(),
//   routeSprintTasks()

// ─── Node Builtins ─────────────────────────────────────────────────
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ─── Core (value imports — enums used at runtime) ──────────────────
import {
  TaskStatus, AgentStatus, SprintPhase,
} from '../core/types.js';
import { BrainError } from './sprint-lifecycle.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, Sprint, ResolvedConfig,
  AgentInfo, ProviderName,
} from '../core/types.js';
import type { RunFlowPlanSourceAuthority } from '../core/run-flow-contract.js';

import { TASKS_DIR } from '../core/constants.js';
import { canonicalJson } from '../core/audit-writer.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { debugLog } from '../core/utils.js';
import {
  assertExecutionLandingSupport,
  assertLiveUsageBudgetSupport,
  hasLiveUsageCeiling,
} from '../core/live-execution-budget.js';
import { applyWorkerExecutionBudgetPolicy } from '../core/execution-plan-digest.js';
import { getProviderCommandSpec, resolveToolScopeEnforcement, resolveWriteScopeShellEscape } from '../core/provider-command-spec.js';
import {
  attendedExecutionProjectId,
  type AttendedExecutionApprovalAuthority,
  type AttendedExecutionApprovalExpectedDispatch,
} from '../core/attended-execution-approval.js';
import { createTaskResultSettlementRefForAttempt } from '../core/task-result-settlement.js';
import { createHostPreDispatchNoGoResult } from '../core/pre-dispatch-settlement.js';
import {
  assertAttendedExecutionProposalMaterial,
  createAttendedExecutionProposalMaterialFromTask,
} from '../core/attended-execution-proposal.js';

// ─── Core — config ────────────────────────────────────────────────
import { resolveEffectiveWorkers, resolveLiveTraceEnabled } from '../core/config.js';

// ─── Token Quota (Sprint 202 Task 202-004 — computeBackoff wire) ──
// `token_throttle_ms` (config.ts default 500) is the inter-worker pacing floor;
// `nextDelayMs` reads it and combines with `computeBackoff` (anthropic-http-
// client.ts) so the dead-code path of Sprint 141 becomes live (Sprint 198 30k
// tpm Tier-1 felaketi önleyici).
import { nextDelayMs, sleep } from '../core/token-quota.js';
import type { RateLimitState } from '../core/token-quota.js';

// ─── Provider Overflow Gate (F1-010, Sprint 333 Task 333-002) ──────
// Pre-spawn dynamic subscription→API overflow decision (flag-gated, default-off).
// Tier-preservation is delegated to resolveWithOverflow inside the gate.
import {
  decidePreSpawnOverflow,
  type ProviderOverflowConfig,
} from '../core/provider-overflow-gate.js';

/**
 * Read `token_throttle_ms` from a ResolvedConfig via a local cast — the field
 * is attached by `loadConfig`/`mergeConfigs` (config.ts intersection type) but
 * is not yet declared on `ResolvedConfig` itself (config-types.ts is out of
 * Sprint 202 Task 202-004 scope). Inlined here instead of as a helper in
 * config.ts to avoid breaking the many `vi.mock('../../src/core/config.js')`
 * partial mocks that don't enumerate new exports.
 *
 * Defaults to 500 ms (Sprint 198 Tier-1 burst mitigation).
 */
function readTokenThrottleMs(config: ResolvedConfig): number {
  const raw = (config as ResolvedConfig & { token_throttle_ms?: number }).token_throttle_ms;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 500;
  return raw;
}

/**
 * Read `retry_transient_failures` from a ResolvedConfig via a local cast.
 * The field is not yet promoted to config-types.ts (Sprint 324 Task 006 scope).
 * Pattern mirrors `readTokenThrottleMs` above.
 *
 * Default: false (feature is opt-in, default-off per T0 spec).
 */
function readRetryTransientFailures(config: ResolvedConfig | undefined): boolean {
  if (!config) return false;
  return (config as ResolvedConfig & { retry_transient_failures?: boolean }).retry_transient_failures === true;
}

/**
 * Read the `provider_overflow` block (F1-010 dynamic subs→API overflow) from a
 * ResolvedConfig via a local cast. The field is not yet promoted to
 * config-types.ts (out of Sprint 333 Task 333-002 scope). Pattern mirrors
 * `readTokenThrottleMs` / `readRetryTransientFailures` above.
 *
 * Returns `undefined` when absent or malformed → the gate stays disabled
 * (default-off), so the spawn path is byte-for-byte unchanged.
 */
function readProviderOverflowConfig(config: ResolvedConfig): ProviderOverflowConfig | undefined {
  const raw = (config as ResolvedConfig & { provider_overflow?: ProviderOverflowConfig }).provider_overflow;
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    dynamic: raw.dynamic === true,
    apiProvider: typeof raw.apiProvider === 'string'
      ? (raw.apiProvider as ProviderOverflowConfig['apiProvider'])
      : undefined,
  };
}

// ─── Core — system profile ────────────────────────────────────────
import { getSystemProfile } from '../core/system-profile.js';

// ─── Sprint Utilities ─────────────────────────────────────────────
import {
  now,
  isTmuxProvider, isAdapterProvider, resolveTaskProvider, getProviderAdapterForTask,
} from './sprint-utils.js';

// ─── Spawn backend abstraction ───────────────────────────────────
import type { SpawnBackend } from './spawn-backend.js';
import { SpawnBackendFactory } from './spawn-backend.js';
// Row 4061 WRITE-SCOPE-SSOT — the single write-target authority (see below).
import { deriveWorkerWriteTargets, formatAllowedToolsFlag } from './spawn-backend-docker.js';
import { resolveReasoningEffort } from '../core/reasoning-effort.js';
import { bootstrapProviders } from '../core/provider.js';

// ─── Canonical Spawn Executor (SCHED3, born-634/635) ──────────────
import {
  assertSprintWorkerProviderAuthority,
  executeSpawnTask,
  describeSpawnSkip,
  spawnSkipFromDisposition,
  publishSchedulerSpawnSkips,
  type SchedulerSpawnSkip,
} from './scheduler-effects.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';

// ─── Tmux ────────────────────────────────────────────────────────
import { ensureSession, spawnWorker } from './tmux.js';

// ─── Auditor ──────────────────────────────────────────────────────
import { updateDashboard } from '../monitor/auditor.js';

// ─── Result Collector ─────────────────────────────────────────────
import { resolveAgentPrompt, resolveSkillPrompts } from './result-collector.js';

// ─── Task Builder ─────────────────────────────────────────────────
import { buildWorkerPrompt } from './task-builder.js';

// ─── Planner dependency normalization (323-031 wire) ──────────────
import { normalizePlannerDependencies } from './planner.js';

export interface ExactPlanSpawnAuthority {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly sourceAuthority?: RunFlowPlanSourceAuthority;
}

// ─── Exact-plan drift diagnosability (RECOVERY-DO-DOGFOOD visibility) ───────
// Measured on the first real dogfood run (2026-08-09): the spawn phase died with
// a bare `EXACT_PLAN_TASK_ARTIFACT_DRIFT` — no task id in the operator output, no
// indication of WHICH field drifted — and `buildSpawnRetryHint` fell through to
// its generic branch, telling the operator to "check provider credentials and
// system resources" for what is actually an artifact-identity refusal. Diagnosis
// then required reading source. The same class was already fixed twice
// (KN4 landing-scope, KN2 execution-budget: "the generic credentials hint was
// wrong"); this is the third. The detail rides the Error MESSAGE, so every run
// surface (start / run / runs / do / goal / process) inherits it by construction
// — they all render the same phase error. Behaviour-neutral: the gate decision is
// unchanged, it only becomes explainable.

/** One field whose canonical value differs between the approved plan task and the
 *  materialized on-disk artifact. Values are truncated — this rides an operator
 *  message, it is not a data channel. */
export interface ExactPlanDriftField {
  readonly path: string;
  readonly planValue: string;
  readonly diskValue: string;
}

/** Keep a drift message readable in a terminal; a whole task blob would bury it. */
const DRIFT_VALUE_MAX_CHARS = 120;

function driftValue(value: unknown): string {
  if (value === undefined) return '(absent)';
  const json = canonicalJson(value);
  return json.length > DRIFT_VALUE_MAX_CHARS
    ? `${json.slice(0, DRIFT_VALUE_MAX_CHARS)}…`
    : json;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Field-level canonical diff between the approved plan task and the on-disk
 * artifact. Recurses ONE level into plain objects so the report names
 * `scope.filesWrite` rather than dumping the whole `scope` blob. Pure — exported
 * for unit tests and for any surface that wants the structured form.
 */
export function computeExactPlanDrift(
  planTask: unknown,
  diskTask: unknown,
): ExactPlanDriftField[] {
  const drift: ExactPlanDriftField[] = [];
  const plan = isPlainObject(planTask) ? planTask : {};
  const disk = isPlainObject(diskTask) ? diskTask : {};
  for (const key of [...new Set([...Object.keys(plan), ...Object.keys(disk)])].sort()) {
    const planValue = plan[key];
    const diskValue = disk[key];
    if (canonicalJson(planValue) === canonicalJson(diskValue)) continue;
    if (isPlainObject(planValue) && isPlainObject(diskValue)) {
      for (const nested of computeExactPlanDrift(planValue, diskValue)) {
        drift.push({ ...nested, path: `${key}.${nested.path}` });
      }
      continue;
    }
    drift.push({
      path: key,
      planValue: driftValue(planValue),
      diskValue: driftValue(diskValue),
    });
  }
  return drift;
}

/** Compose the operator-facing message. The code stays the FIRST token so every
 *  existing `message.includes('EXACT_PLAN_…')` consumer keeps matching. */
function buildExactPlanAuthorityMessage(
  code: ExactPlanSpawnAuthorityError['code'],
  taskId?: string,
  driftFields?: readonly ExactPlanDriftField[],
): string {
  let message = code;
  if (taskId) message += ` (task ${taskId})`;
  if (driftFields && driftFields.length > 0) {
    const rendered = driftFields
      .map((f) => `${f.path}: plan=${f.planValue} disk=${f.diskValue}`)
      .join('; ');
    message += ` — ${driftFields.length} field(s) drifted: ${rendered}`;
  }
  return message;
}

export class ExactPlanSpawnAuthorityError extends Error {
  readonly code:
    | 'EXACT_PLAN_DEPENDENCY_DRIFT'
    | 'EXACT_PLAN_TASK_ARTIFACT_MISSING'
    | 'EXACT_PLAN_TASK_ARTIFACT_DRIFT'
    | 'EXACT_PLAN_RUNTIME_ROUTE_DRIFT';
  readonly taskId?: string;
  /** Field-level drift, present for artifact-drift refusals. */
  readonly driftFields?: readonly ExactPlanDriftField[];

  constructor(
    code: ExactPlanSpawnAuthorityError['code'],
    taskId?: string,
    driftFields?: readonly ExactPlanDriftField[],
  ) {
    super(buildExactPlanAuthorityMessage(code, taskId, driftFields));
    this.name = 'ExactPlanSpawnAuthorityError';
    this.code = code;
    this.taskId = taskId;
    if (driftFields && driftFields.length > 0) this.driftFields = driftFields;
  }
}

export function assertExactPlanDependencies(tasks: readonly Task[]): void {
  const normalized: Task[] = structuredClone([...tasks]);
  const before = canonicalJson(normalized);
  const result = normalizePlannerDependencies(normalized);
  if (
    result.dropped.length > 0
    || canonicalJson(normalized) !== before
  ) {
    throw new ExactPlanSpawnAuthorityError('EXACT_PLAN_DEPENDENCY_DRIFT');
  }
}

export function readSpawnTaskAuthority(
  projectRoot: string,
  task: Task,
  exactPlanAuthority?: ExactPlanSpawnAuthority,
): Task {
  const freshPath = join(projectRoot, TASKS_DIR, `task-${task.id}.json`);
  try {
    const diskTask = JSON.parse(readFileSync(freshPath, 'utf-8')) as Task;
    if (
      exactPlanAuthority
      && canonicalJson(diskTask) !== canonicalJson(task)
    ) {
      throw new ExactPlanSpawnAuthorityError(
        'EXACT_PLAN_TASK_ARTIFACT_DRIFT',
        task.id,
        computeExactPlanDrift(task, diskTask),
      );
    }
    return diskTask;
  } catch (error) {
    if (error instanceof ExactPlanSpawnAuthorityError) throw error;
    if (exactPlanAuthority) {
      throw new ExactPlanSpawnAuthorityError(
        'EXACT_PLAN_TASK_ARTIFACT_MISSING',
        task.id,
      );
    }
    debugLog('spawnWorkers:freshTaskRead', error);
    return task;
  }
}

export function assertExactPlanTaskUnchanged(
  task: Task,
  canonicalTaskBefore: string | null,
): void {
  if (
    canonicalTaskBefore !== null
    && canonicalJson(task) !== canonicalTaskBefore
  ) {
    throw new ExactPlanSpawnAuthorityError(
      'EXACT_PLAN_RUNTIME_ROUTE_DRIFT',
      task.id,
    );
  }
}

export function captureExactPlanTaskAuthority(
  task: Task,
  exactPlanAuthority?: ExactPlanSpawnAuthority,
): string | null {
  return exactPlanAuthority ? canonicalJson(task) : null;
}

// ─── Parallel Pipeline ───────────────────────────────────────────
import { ParallelPipelineManager } from './parallel-pipeline.js';

// ─── Task Router ────────────────────────────────────────────────
import { ProviderRoutingError, routeTask, emitTimeoutEvents } from './task-router.js';
import { aggregateSprintHistory } from './timeout-estimator.js';

// ─── Routing-Decision-Journal (409-003 ROUTING-TEK-OTORİTE) ──────
// Reuses the path convention from core/routing-engine.ts's born-622 journal
// (`.deckent/routing/decisions/<sprintId>.jsonl`). The append itself is
// re-implemented locally (routing-engine.ts's own appendRoutingDecisionRecord
// is unexported and out of this task's write scope) using the same fail-soft
// contract (ADR-G-009): a journal-write fault must never affect spawn.
// S3: the V2 routing-engine is retired — its born-622 journal-path convention
// and candidate record shape live on here (spawn-time records only).
import { join as joinPath } from 'node:path';
interface RoutingDecisionCandidate { agentId: string; totalScore: number; signals: Record<string, number>; bypass: boolean }
function routingDecisionJournalPath(projectRoot: string, sprintId: string): string {
  return joinPath(projectRoot, '.deckent', 'routing', 'decisions', `${sprintId}.jsonl`);
}

export const PROVIDER_FALLBACK_SELECTED_CHANNEL = 'BRAIN→AUDITOR:PROVIDER_FALLBACK_SELECTED';

// Sprint 280 root-cause fix: adaptive per-task timeout is wired into every spawn
// path (emitTimeoutEvents was a 0-caller dormant function, so docker_timeout
// silently capped every worker at ~20min).
// Sprint 319 B-HISTORYSCALE: history-scaling is now sourced from the REAL
// past-sprint average task duration (aggregateSprintHistory reads `.brain/sprints/`
// logs), computed once per spawn wave and passed to emitTimeoutEvents. Previously
// a hardcoded zero-fill pinned historyFactor to 1.0 (no learning). On the first
// sprint (no logs) the aggregator returns the same zero-fill, so the
// effort×loc×scope×backend estimate is used unchanged.

// ─── Observability ──────────────────────────────────────────────
import { metric } from '../core/observability.js';

// ─── Collision Detection (Sprint 138 ADR-035) ──────────────────
import { deriveExecutionTopology } from '../core/execution-topology.js';
import { writeEvent, CHANNELS, getCurrentSprintId, readSequence } from './event-stream.js';
import { collectRbacBlockedTaskIds } from './sprint-runtime.js';

// ─── Decision Engine (Sprint 168 W2.5 — C0c wire) ──────────────
// Wire: handleScopeCollision() is the pure decision function from C0c RC2.
// Imported directly to avoid the sprint-controller ↔ sprint-spawner import
// cycle that would arise if consultCollisionDecision() (its sprint-controller
// wrapper) were imported here. The BRAIN→SPAWN:BLOCKED emit logic mirrors
// the wrapper inline so callers of consultCollisionDecision (recovery paths)
// remain functional and the spawn pipeline gets the same closure semantics.
import { handleScopeCollision } from './scope-collision.js';
import type { ScopeCollisionPayload } from './scope-collision.js';

// ─── Dependency Scheduler (Sprint 139 Task 028 + 029) ───────────
import {
  buildDependencyGraph,
  enforceWaveDependency,
  applyFailureCascade,
  unblockDependents,
} from './dependency-scheduler.js';

// ─── Sprint Checkpoint (Sprint 138 Long-Running Resume) ─────────
import { writeCheckpoint } from './sprint-checkpoint.js';

// ─── Worker Lifecycle State Machine (Sprint 139 Task 015) ────────
import {
  createWorkerStateMachine,
  getWorkerStateMachine,
  getAllWorkerStates,
  isWorkerStoppable,
  removeWorkerStateMachine,
  type WorkerLifecycleState,
} from '../agents/worker.js';
import { buildWorkerApprovalGateEnv } from '../agents/worker-approval-env.js';
import type { WorkerBackendKind } from './heartbeat-monitor.js';
import { computeEffectiveDependencyState } from './scheduler-state.js';

// ─── Runtime vs Code Discriminator (Sprint 139 Task 024) ─────────
import {
  decideCascadeAction,
  type FailureContext,
  type CascadeDecision,
} from './result-evaluator.js';

// ─── Transient Retry Re-queue (Sprint 324 Task 006) ──────────────
// flag-gated (config.retry_transient_failures, default-off):
// RUNTIME/AMBIGUOUS failures → createRetryTask + exponential backoff + re-queue PENDING.
import {
  createRetryTask,
  getRetryCount,
  getTransientRetryDelayMs,
  MAX_RETRY_COUNT,
  type RetryableTask,
} from './task-retry.js';

// ─── Fresh-Eyes Rotation (Sprint 156 Task 012) ───────────────────
import type { FreshEyesRotationStrategy } from './debt-manager.js';

// ─── Skill Pool (487-023 FORCED-SKILL-LINEAGE — inactive-skill check) ────
import { SkillPoolManager } from '../core/skill-pool.js';

// ═══ Scope Path Utilities ══════════════════════════════════════════

// Row 4061 (WRITE-SCOPE-SSOT): the scope-path normalizer and the write-target
// deriver used to live here AND in spawn-backend-docker.ts with divergent rules
// (this side merged scope.directories into the write list unconditionally, the
// docker side treated an explicit filesWrite list as the sole write authority),
// so the same task got a different write scope depending on the backend that ran
// it. Both now come from the single authority in spawn-backend-docker.ts — see
// the WRITE-SCOPE AUTHORITY block there for the canonical rule and for why that
// module hosts it (the reverse import direction is a cycle).
export { normalizeScopePath } from './spawn-backend-docker.js';

// FIX-5 (B-COLLISION-HANG re-notify debounce): tracks the last-emitted scope
// collision signature so a persisting collision (re-detected every dispatch tick)
// emits its SCOPE_COLLISION_DETECTED / SPAWN_BLOCKED events — and thus triggers a
// nervous proposal — only ONCE per collision-state, not every ~5-min tick.
let lastCollisionSignature: string | null = null;

/** Reset the collision-emit debounce. Call at sprint start (and in tests) so a
 *  new sprint re-emits its collisions even if a prior sprint left the same key. */
export function resetCollisionDebounce(): void {
  lastCollisionSignature = null;
}

/**
 * Build the list of write targets for a worker's --allowedTools scope.
 *
 * Shape adapter only: it unwraps `task.scope` and hands it to the canonical
 * deriver (`deriveWorkerWriteTargets`, spawn-backend-docker.ts). It makes NO
 * scope decision of its own — the directories-into-write-scope rule, `.tasks/`
 * prepending, normalization and dedup all live in that one authority, so this
 * path and the docker backend derive byte-identical targets for a given task
 * (row 4061; parity asserted by tests/orchestra/write-scope-backend-parity.test.ts).
 *
 * @param task - The task whose scope is being resolved
 * @returns Deduplicated, normalized write target paths
 */
export function buildAllowedWriteTargets(task: Pick<Task, 'scope'>): string[] {
  return deriveWorkerWriteTargets(task.scope);
}

// ═══ Scope Equivalence Normalization (Sprint 169 W3.1) ════════════

/**
 * Normalize a list of scope file paths to canonical form for equivalence-class
 * collision detection. Resolves the following variants to a single canonical key:
 *   - Leading `./` prefix  (`./src/foo.ts` → `src/foo.ts`)
 *   - Repeated slashes     (`src//foo.ts`  → `src/foo.ts`)
 *   - Trailing slash       (`src/foo.ts/`  → `src/foo.ts`)
 * Empty and whitespace-only entries are dropped.
 *
 * Intentionally simpler than normalizeScopePath: no extension-only rejection, no
 * ADR-013 protected-path exclusion — those checks belong to the build-time scope
 * builder. This helper is concerned only with path equivalence for collision detection.
 */
export function normalizeScopeFiles(files: readonly string[]): string[] {
  const result: string[] = [];
  for (const f of files) {
    const trimmed = f.trim();
    if (!trimmed) continue;
    const canonical = trimmed
      .replace(/^\.\//, '')   // strip leading ./
      .replace(/\/+/g, '/')   // collapse repeated slashes
      .replace(/\/$/, '');    // strip trailing slash
    if (canonical) result.push(canonical);
  }
  return result;
}

/**
 * MF-2 (Sprint 250): write an honest NO_GO `.result` when a host-only provider
 * (codex/gemini/ollama, per `isAdapterProvider`) has no registered/available
 * host adapter at spawn time.
 *
 * Without this, the spawn chain falls through to the docker backend, which
 * silently degrades non-claude work to the `claude` CLI (Sprint 249 root cause:
 * gemini/ollama FIX-respawns ran as claude and produced misleading claude-labeled
 * results). An honest NO_GO is read by the result-collector like any worker
 * result and surfaces the real problem (provider not available) instead of a
 * fabricated success on the wrong provider.
 */
function writeProviderUnavailableNoGo(task: Task, projectRoot: string): void {
  const reason =
    `Provider "${task.provider}" requires a host adapter (isAdapterProvider) but none is `
    + `registered/available at spawn time. Refusing to silently degrade to the claude CLI via the `
    + `docker backend. Ensure the provider is available at bootstrap (CLI logged in / daemon reachable) `
    + `so its host adapter is registered.`;
  const result = createHostPreDispatchNoGoResult(
    task,
    'PROVIDER_ADAPTER_UNAVAILABLE',
    reason,
  );
  try {
    writeFileSync(
      join(projectRoot, TASKS_DIR, `task-${task.id}.result`),
      JSON.stringify(result, null, 2),
      'utf-8',
    );
  } catch (e) {
    debugLog('writeProviderUnavailableNoGo', e);
  }
}

/**
 * 486-018 (FORCED-SKILL-PRESERVE): write an honest NO_GO `.result` when an
 * operator's explicit `- Skills:` forceSkills names a skill whose SKILL.md
 * could not be resolved (resolveSkillPrompts already stripped it from
 * task.assignedSkills — result-collector.ts's own documented contract for an
 * unreadable skill file). That silent-drop is correct for an auto-selected
 * skill, but spawning a forced skill's task without its content anyway would
 * be a silent degrade of an explicit operator directive. An honest NO_GO here
 * surfaces the exact missing skill id(s) as a typed unavailable, mirroring
 * writeProviderUnavailableNoGo's honest-fail contract above.
 */
function writeForcedSkillUnavailableNoGo(
  task: Task,
  projectRoot: string,
  missingSkillIds: string[],
  inactiveSkillIds: string[] = [],
): void {
  const reasonParts: string[] = [];
  if (missingSkillIds.length > 0) {
    reasonParts.push(
      `forceSkills declared [${missingSkillIds.join(', ')}] but SKILL.md content could not be resolved `
      + `for ${missingSkillIds.length === 1 ? 'it' : 'them'}. Ensure the skill exists at `
      + `.deckent/skills/<id>/SKILL.md.`,
    );
  }
  if (inactiveSkillIds.length > 0) {
    // 487-023 FORCED-SKILL-LINEAGE: a forced skill whose SKILL.md loaded fine
    // but is administratively disabled in the pool (manifest.json enabled:false)
    // must not silently activate anyway — same honest-fail contract as a
    // missing file, distinct typed reason so the two causes are never conflated.
    reasonParts.push(
      `forceSkills declared [${inactiveSkillIds.join(', ')}] but ${inactiveSkillIds.length === 1 ? 'it is' : 'they are'} `
      + `administratively disabled (enabled:false in .deckent/skills/<id>/manifest.json). An explicit `
      + `operator request cannot silently run on a disabled/inactive skill.`,
    );
  }
  const reason =
    `Refusing to spawn without every explicitly forced skill active. ${reasonParts.join(' ')}`;
  const result = createHostPreDispatchNoGoResult(
    task,
    'FORCED_SKILL_UNAVAILABLE',
    reason,
  );
  try {
    writeFileSync(
      join(projectRoot, TASKS_DIR, `task-${task.id}.result`),
      JSON.stringify(result, null, 2),
      'utf-8',
    );
  } catch (e) {
    debugLog('writeForcedSkillUnavailableNoGo', e);
  }
}

// ═══ Exported Functions ════════════════════════════════════════════

/**
 * Stable priority order for pending work. Generated fixes lead ordinary
 * pending tasks so a dependency-blocked dependant cannot win a shared-write
 * collision against the fix that would unblock it.
 */
export function prioritizePendingFixTasks(tasks: readonly Task[]): Task[] {
  const pending = tasks.filter(task => task.status === TaskStatus.PENDING);
  return [
    ...pending.filter(task => task.isPriorityFix === true && Boolean(task.fixForTaskId)),
    ...pending.filter(task => task.isPriorityFix !== true || !task.fixForTaskId),
  ];
}

/**
 * Spawn worker agents for sprint tasks via the configured backend.
 * Respects max_workers limit; excess tasks are returned as a queue.
 * @param projectRoot - Project root directory
 * @param sprint - Sprint containing tasks to execute
 * @param config - Resolved project configuration
 * @param spawnOpts - Optional spawn settings (auto-approve, usage tracker, backend)
 * @returns Array of queued tasks that exceeded the worker limit
 */
export async function spawnWorkers(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: {
    autoApprove?: boolean;
    spawnBackend?: SpawnBackend;
    attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
    providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
    exactPlanAuthority?: ExactPlanSpawnAuthority;
  },
): Promise<Task[]> {
  const backend = spawnOpts?.spawnBackend;

  let needsTmuxSession = false;

  const systemProfile = getSystemProfile();
  const maxWorkers = resolveEffectiveWorkers(config, systemProfile);

  // ─── Dependency normalization (Task 323-031 wire — closes the sprint-hang root) ──
  // The AI planner emits each task.dependencies entry as free text — usually a
  // sibling TITLE, occasionally a slot id. Left raw, those titles reach
  // buildDependencyGraph (respawnEligibleTasks / cascade / unblock) as
  // UNRESOLVABLE refs — the exact dependency-pipeline gap behind the sprint-323
  // EXECUTE-hang (P0-A cascade-skip treated the symptom; this closes the root).
  // normalizePlannerDependencies rewrites every ref to a concrete same-sprint id
  // IN PLACE — idempotent and behaviour-preserving for plans that already use
  // correct ids (each ref resolves to itself, nothing dropped). Run ONCE here at
  // the single SPAWN entry so every downstream graph build sees clean ids;
  // self-healing on resume (re-runs each spawn from the persisted title-deps).
  // Until this wire the 323-031 normalizer had ZERO production callers.
  if (spawnOpts?.exactPlanAuthority) {
    assertExactPlanDependencies(sprint.tasks);
  }

  const depNorm = spawnOpts?.exactPlanAuthority
    ? { resolvedCount: 0, dropped: [] }
    : normalizePlannerDependencies(sprint.tasks);
  if (depNorm.resolvedCount > 0 || depNorm.dropped.length > 0) {
    debugLog(
      'spawnWorkers:normalizeDeps',
      `resolved=${depNorm.resolvedCount} dropped=${depNorm.dropped.length}` +
      (depNorm.dropped.length
        ? ` [unresolvable: ${depNorm.dropped.map(d => `${d.taskId}←"${d.ref}"`).join(', ')}]`
        : ''),
    );
  }

  // ─── Plan-Time Collision Detection (Sprint 138 ADR-035) ───────
  // Sprint 168 W2.5 — C0c wire: build a blockedTaskIds set from
  // handleScopeCollision() decisions and emit BRAIN→SPAWN:BLOCKED events.
  // Blocked tasks short-circuit before TASK_ASSIGN below.
  //
  // Sprint 169 W3.1 fix: normalize filesWrite paths before collision detection
  // so equivalence-class variants (./src/foo.ts vs src/foo.ts, double slashes,
  // trailing slash) resolve to the same canonical key and trigger the >=2
  // writer threshold correctly.
  const pendingTasks = prioritizePendingFixTasks(sprint.tasks);
  const normalizedPendingTasks = pendingTasks.map(t => ({
    ...t,
    scope: { ...t.scope, filesWrite: normalizeScopeFiles(t.scope.filesWrite) },
  }));
  const blockedTaskIds = new Set<string>();
  // Runtime serialization must account for writers that already left PENDING.
  // A genuinely active writer blocks every pending writer for that path.
  // Pending-vs-pending order is resolved below from `pendingTasks`; applying
  // original plan slot order here would let a blocked dependant pre-block its
  // own dynamically appended fix.
  const fullRuntimeTopology = deriveExecutionTopology(sprint.tasks, { maxWorkers });
  for (const collision of fullRuntimeTopology.collisions) {
    const hasActiveWriter = collision.writerSlots.some(slot => {
      const status = sprint.tasks[slot - 1]?.status;
      return status === TaskStatus.EXECUTING
        || status === TaskStatus.CLAIMED
        || status === TaskStatus.TESTING
        || status === TaskStatus.DOCUMENTING;
    });
    if (hasActiveWriter) {
      for (const slot of collision.writerSlots) {
        const task = sprint.tasks[slot - 1];
        if (task?.status === TaskStatus.PENDING) blockedTaskIds.add(task.id);
      }
    }
  }
  const runtimeTopology = deriveExecutionTopology(pendingTasks, { maxWorkers });
  const collisionResult = {
    collisions: new Map(runtimeTopology.collisions.map(collision => [
      collision.path,
      collision.writerSlots.map(slot => pendingTasks[slot - 1]!.id),
    ])),
    collisionCount: runtimeTopology.collisions.length,
    collidingPairs: runtimeTopology.collisions.flatMap(collision => {
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i < collision.writerSlots.length; i++) {
        for (let j = i + 1; j < collision.writerSlots.length; j++) {
          pairs.push([
            pendingTasks[collision.writerSlots[i]! - 1]!.id,
            pendingTasks[collision.writerSlots[j]! - 1]!.id,
          ]);
        }
      }
      return pairs;
    }),
  };
  if (collisionResult.collisionCount > 0) {
    const sprintId = getCurrentSprintId(projectRoot) ?? sprint.id;
    // FIX-5 (B-COLLISION-HANG re-notify debounce — B-STALEMD pattern): the
    // detector re-runs every dispatch tick, so a persisting collision re-emitted
    // these events every tick → the nervous proposer re-minted a fresh proposal
    // each time → notification spam (sprint-319: a new Telegram "scope collision"
    // every 5 min). Emit only when the collision SET changes; the serialize logic
    // below still runs each tick (only the observability/nervous-trigger emits
    // are debounced).
    const collisionSignature = sprintId + '|' + [...collisionResult.collisions.entries()]
      .map(([f, w]) => `${f}:${[...w].sort().join(',')}`)
      .sort()
      .join(';');
    const emitCollision = collisionSignature !== lastCollisionSignature;
    if (emitCollision) lastCollisionSignature = collisionSignature;
    for (const [file, writers] of collisionResult.collisions) {
      if (emitCollision) {
        writeEvent(
          projectRoot, sprintId, 'auditor', 'brain',
          CHANNELS.SCOPE_COLLISION_DETECTED,
          { taskIds: writers, files: [file], detectedAt: 'plan-time' },
        );
      }
      debugLog('spawnWorkers:collision', `File "${file}" written by tasks: ${writers.join(', ')}`);

      // Sprint 168 W2.5 — consult collision decision (C0c RC2) + emit BLOCKED
      const payload: ScopeCollisionPayload = {
        taskIds: writers,
        files: [file],
        detectedAt: 'plan-time',
      };
      const decision = handleScopeCollision(payload);
      if (decision.action === 'block') {
        // FIX-3 (B-COLLISION-HANG — Sprint 319 forensics): SERIALIZE instead of
        // block-all. Among the colliding writers the lowest-id task dispatches
        // this tick (the "winner"); only the rest are deferred and re-dispatch on
        // a later tick once the winner completes and the collision clears.
        // Blocking ALL writers deadlocked the sprint — neither completed, so the
        // collision never cleared (sprint-319 hung 7h). A deterministic sort
        // guarantees forward progress: the globally-lowest writer is the winner
        // of every collision it is in, so it is never blocked. Only the winner
        // writes the shared file this tick → concurrent-write safety is preserved
        // (the original goal of the block), without the deadlock or any
        // approval-gate (the serialize order is deterministic, not a decision).
        const ordered = [...writers];
        const winner = ordered[0];
        const deferred = ordered.slice(1);
        for (const id of deferred) blockedTaskIds.add(id);
        if (emitCollision) {
          try {
            writeEvent(
              projectRoot, sprintId, 'brain', 'worker',
              CHANNELS.SPAWN_BLOCKED,
              {
                taskIds: deferred,
                winner,
                serialized: true,
                files: payload.files,
                reason: decision.reason,
                detectedAt: payload.detectedAt,
              },
            );
          } catch (e) {
            debugLog('spawnWorkers:writeBlockedEvent', e);
          }
        }
      }
    }
    metric('collision.detected', collisionResult.collisionCount, {
      pairs: String(collisionResult.collidingPairs.length),
    });
  } else {
    // FIX-5: no collisions this tick → clear the debounce so a future collision
    // (even one with an identical signature) re-emits exactly once.
    lastCollisionSignature = null;
  }

  // ─── RBAC Authority Gate (born-560, ADR-037 spawn-MAINLINE wire) ─────────────
  // checkSprintSpawnRbac was wired only into the autonomous runtime-loop
  // (enforceEntryRbac, kind=sprint); the normal `deckent start` SPAWN mainline
  // never ran the ADR-037 authority matrix. Wire it here through the same
  // helper. Dormant by default: config.enforce_rbac=false → soft-warn + audit,
  // allowed, nothing deferred (dogfood behaviour unchanged). A task with no
  // actor.role always permits (permissive default). Only enforce_rbac=true
  // HARD-defers a task whose actor.role lacks a scope-inferred capability —
  // added to blockedTaskIds so it is skipped exactly like a scope-collision
  // loser and re-dispatches on a later wave if policy later permits.
  const rbacSprintId = getCurrentSprintId(projectRoot) ?? sprint.id;
  for (const id of collectRbacBlockedTaskIds(normalizedPendingTasks, config, { projectRoot, sprintId: rbacSprintId })) {
    blockedTaskIds.add(id);
    debugLog('spawnWorkers:rbac-blocked', `Task ${id} deferred by ADR-037 authority gate (enforce_rbac)`);
  }

  // Dependency pipeline guard: when enabled, only spawn tasks whose dependencies are all DONE
  //
  // Row 3309: every branch below can move a spawnable PENDING task into
  // `queuedTasks` — and, before this wire, said nothing about it anywhere on
  // disk. `waveSkips` collects the typed reason for each such task and is
  // published to the scheduler journal at the end of the wave. Collection only:
  // no predicate below is changed.
  const waveSkips: SchedulerSpawnSkip[] = [];
  let activeTasks: Task[];
  let queuedTasks: Task[];
  if (config.dependency_pipeline_enabled) {
    const doneTasks = new Set(
      sprint.tasks.filter(t => t.status === TaskStatus.DONE).map(t => t.id),
    );
    const eligibleTasks = pendingTasks.filter(t => {
      if (!t.dependencies || t.dependencies.length === 0) return true;
      return t.dependencies.every(dep => doneTasks.has(dep));
    });
    const eligibleIds = new Set(eligibleTasks.map(t => t.id));
    for (const t of pendingTasks) {
      if (eligibleIds.has(t.id)) continue;
      const unresolved = (t.dependencies ?? []).filter(dep => !doneTasks.has(dep));
      waveSkips.push(describeSpawnSkip(
        t,
        'dependency-unsatisfied',
        `dependencies not yet DONE at wave time: ${unresolved.join(', ')}`,
      ));
    }
    const dispatchableTasks = eligibleTasks.filter(task => !blockedTaskIds.has(task.id));
    activeTasks = dispatchableTasks.slice(0, maxWorkers);
    const activeIds = new Set(activeTasks.map(task => task.id));
    queuedTasks = eligibleTasks.filter(task => !activeIds.has(task.id));
  } else {
    // Legacy FIFO still obeys the task lifecycle contract. A preplanned
    // recovery sprint intentionally carries terminal tasks for evaluation and
    // dependency evidence; spawning the full array here would execute those
    // DONE/NO_GO tasks a second time.
    const eligibleTasks = pendingTasks;
    const dispatchableTasks = eligibleTasks.filter(task => !blockedTaskIds.has(task.id));
    activeTasks = dispatchableTasks.slice(0, maxWorkers);
    const activeIds = new Set(activeTasks.map(task => task.id));
    queuedTasks = eligibleTasks.filter(task => !activeIds.has(task.id));
  }

  // Row 3309 — the two remaining ways a dependency-clear task ends the wave
  // un-dispatched. `SPAWN_BLOCKED` already covers the collision case on the
  // event stream, but it is debounced by collision signature, so a block that
  // PERSISTS across ticks stops being announced; the journal line below is the
  // durable statement of the same fact.
  for (const t of queuedTasks) {
    waveSkips.push(blockedTaskIds.has(t.id)
      ? describeSpawnSkip(
        t,
        'scope-collision-blocked',
        'deferred this wave as a scope-collision serialization loser or by the ADR-037 RBAC gate',
      )
      : describeSpawnSkip(
        t,
        'worker-slot-exhausted',
        `wave capacity ${maxWorkers} was filled by ${activeTasks.length} dispatched task(s) on this pass`,
      ));
  }

  // Pre-check: do any active tasks need tmux?
  if (!backend) {
    needsTmuxSession = activeTasks.some(task => {
      const provider = resolveTaskProvider(task);
      return isTmuxProvider(provider);
    });
    if (needsTmuxSession) {
      ensureSession();
    }
  }

  // Observability: wave start metric
  const waveId = config.dependency_pipeline_enabled ? 'dep-pipeline' : 'legacy';
  metric('wave.start', 0, { wave: waveId, count: String(activeTasks.length) });

  // Sprint 202 Task 202-004 — inter-worker token throttle.
  // Resolved here once so the throttle is consistent across the whole wave.
  const throttleFloorMs = readTokenThrottleMs(config);
  // Sprint 319 B-HISTORYSCALE — aggregate real past-sprint avg-task-duration once
  // per wave (file I/O); feeds the historyFactor in emitTimeoutEvents below.
  const sprintHistory = aggregateSprintHistory(projectRoot);
  let spawnedThisWave = 0;
  const spawnedTasks: Task[] = [];

  for (const task of activeTasks) {
    // Sprint 168 W2.5 — C0c wire: skip blocked tasks (collision spawn-block).
    // BRAIN→SPAWN:BLOCKED was already emitted above; no TASK_ASSIGN, no spawn.
    if (blockedTaskIds.has(task.id)) {
      debugLog('spawnWorkers:skipBlocked', `Task ${task.id} blocked by scope collision`);
      continue;
    }

    // Sprint 202 Task 202-004 — pace spawns by token_throttle_ms (skip first).
    // No RateLimitState is available at spawn-time (workers own the API call),
    // so we pass `null` and let `nextDelayMs` fall back to the configured floor.
    // computeBackoff will dominate if a future caller supplies a non-null state.
    if (spawnedThisWave > 0 && throttleFloorMs > 0) {
      const delayMs = nextDelayMs(null, 0, throttleFloorMs);
      await sleep(delayMs);
    }

    // Sprint 168 W2.5 — C0c wire: fresh disk read of task.json (RC3).
    // Operator manual patches between PLAN and SPAWN (--resume, recovery,
    // race with Auditor) must be reflected in TASK_ASSIGN. We attempt a
    // fresh read; on missing/corrupt file we fall back to the in-memory
    // task to preserve resilience (fail-safe per ADR-035).
    let freshTask: Task = task;
    const exactTaskBefore = captureExactPlanTaskAuthority(
      task,
      spawnOpts?.exactPlanAuthority,
    );
    freshTask = readSpawnTaskAuthority(
      projectRoot,
      task,
      spawnOpts?.exactPlanAuthority,
    );

    // Sprint 361 Task 361-005 (FIX-MODEL-PRESERVE, born-476): a fix-task must
    // inherit the original task's provider/backend/modelEffort/forceModel pins
    // before those fields are resolved below (resolveTaskProvider inference on
    // a missing pin is exactly how born-476 silently respawned a codex/gpt-5
    // task's fix on claude/opus). Runs BEFORE the overflow gate below so a
    // genuinely conscious overflow decision still applies on top afterward.
    preserveFixTaskRoutingFields(projectRoot, sprint.id, task);

    // ─── F1-010 — Dynamic pre-spawn subs→API overflow gate (flag-gated) ──
    // When `config.provider_overflow.dynamic === true` AND this worker's
    // subscription provider is currently rate-limited AND an API overflow target
    // is configured, overflow THIS worker onto an equivalent-tier API model so
    // the fleet keeps throughput. Default (undefined/off) → the block is skipped
    // entirely → spawn behavior is byte-for-byte unchanged. Tier-preservation is
    // delegated to the gate (→ resolveWithOverflow); never re-implemented here.
    // Applied BEFORE the prompt/model/provider are read below so the swap flows
    // into buildWorkerPrompt, `model`, resolveTaskProvider and the persisted json.
    //
    // TODO(phase2): plumb a live pre-spawn RateLimitState into `overflowSignal`.
    // There is no global rate-limit tracker today (workers own the API call), so
    // the signal is null at spawn-time and the gate returns no_limit (no-op) —
    // the FIX-phase reactive failover (mid-sprint-adapter.applyRateLimitFailover)
    // covers the post-429 path until the pre-spawn signal + multi-worker
    // rebalancing land. See provider-overflow-gate.ts TODO(phase2).
    const overflowConfig = readProviderOverflowConfig(config);
    if (overflowConfig?.dynamic === true) {
      const overflowSignal: RateLimitState | null = null; // TODO(phase2): live signal
      const decision = decidePreSpawnOverflow({
        task,
        rateLimitState: overflowSignal,
        providerConfig: overflowConfig,
      });
      if (decision.overflowProvider) {
        debugLog(
          'spawnWorkers:overflow',
          `Task ${task.id}: pre-spawn overflow ${String(task.provider)}/${task.model} → `
          + `${String(decision.overflowProvider)}/${decision.overflowModel ?? task.model} (${decision.reason})`,
        );
        task.provider = decision.overflowProvider;
        if (decision.overflowModel) task.model = decision.overflowModel as Task['model'];
        task.authMode = 'api';
      } else if (decision.advisory) {
        debugLog('spawnWorkers:overflow', `Task ${task.id}: ${decision.advisory}`);
      }
    }

    assertExactPlanTaskUnchanged(task, exactTaskBefore);

    assertSprintWorkerProviderAuthority({
      authority: spawnOpts?.providerAuthority,
      projectRoot,
      task,
      config,
      sprintFallbackId: sprint.id,
      backend,
    });

    const agentPrompt = await resolveAgentPrompt(projectRoot, task);
    const taskSkillPrompts = await resolveSkillPrompts(projectRoot, task);

    // 486-018 FORCED-SKILL-PRESERVE: an operator's explicit forceSkills whose
    // SKILL.md content failed to resolve (resolveSkillPrompts already dropped
    // it from task.assignedSkills) is a typed HOLD, not a silent spawn short a
    // forced piece of context. Skip this task's spawn and write an honest
    // NO_GO instead — same honest-fail shape as writeProviderUnavailableNoGo.
    const forcedSkillIdsForSpawn = task.forceSkills ?? [];
    if (forcedSkillIdsForSpawn.length > 0) {
      const resolvedSkillNames = new Set(taskSkillPrompts.map(p => p.name));
      const missingForcedSkillIds = forcedSkillIdsForSpawn.filter(id => !resolvedSkillNames.has(id));
      // 487-023 FORCED-SKILL-LINEAGE: a forced skill whose content resolved but
      // is administratively disabled in the pool (enabled:false) is a distinct
      // typed HOLD from "missing" — silently activating a disabled skill just
      // because its SKILL.md happens to still be readable on disk would defeat
      // the point of disabling it. Skip ids already flagged missing (no double-count).
      const skillPool = new SkillPoolManager(projectRoot);
      const inactiveForcedSkillIds = forcedSkillIdsForSpawn.filter(id => {
        if (missingForcedSkillIds.includes(id)) return false;
        const skill = skillPool.getSkill(id);
        return skill !== undefined && skill.enabled === false;
      });
      if (missingForcedSkillIds.length > 0 || inactiveForcedSkillIds.length > 0) {
        writeForcedSkillUnavailableNoGo(task, projectRoot, missingForcedSkillIds, inactiveForcedSkillIds);
        task.status = TaskStatus.NO_GO;
        try {
          writeFileSync(
            join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
            JSON.stringify(task, null, 2),
            'utf-8',
          );
        } catch (e) { debugLog('spawnWorkers:forcedSkillHoldWrite', e); }
        continue;
      }
    }

    const prompt = buildWorkerPrompt(
      task,
      agentPrompt,
      taskSkillPrompts,
      projectRoot,
      config,
      spawnOpts?.exactPlanAuthority,
    );
    const model = task.model;
    // Row 4061: same authority, same formatter as every other backend. The
    // canonical deriver always returns at least `.tasks/`, so the historical
    // "empty targets → unrestricted Write/Edit" fall-open branch is gone: a
    // scope-less task narrows to `.tasks/` instead of getting the widest grant.
    const writeTargets = buildAllowedWriteTargets(task);
    const allowedTools = formatAllowedToolsFlag(writeTargets);

    const taskProvider = resolveTaskProvider(task);

    // ─── Worker State Machine init (Sprint 139) ─────────────────
    const wid = `w-${task.id}`;
    const sm = createWorkerStateMachine(wid);
    // SPAWNING → STARTING (backend spawn call is about to happen)
    sm.transition('STARTING');

    // ─── TASK_ASSIGN event (Brain → Worker, Protocol 1.0) ────────
    // Emitted before spawn so the event stream records task intent
    // even if the spawn process fails (observable pre-condition state).
    // Sprint 168 W2.5: payload reads scope from freshTask (disk-fresh).
    const sprintIdForAssign = getCurrentSprintId(projectRoot) ?? sprint.id;
    writeEvent(
      projectRoot, sprintIdForAssign, 'brain', 'worker',
      CHANNELS.TASK_ASSIGN,
      {
        taskId: task.id,
        workerId: wid,
        model: task.model,
        agent: freshTask.assignedAgent ?? task.assignedAgent ?? 'generic',
        skills: freshTask.assignedSkills ?? task.assignedSkills ?? [],
        scope: {
          directories: freshTask.scope?.directories ?? task.scope?.directories ?? [],
          filesWrite: freshTask.scope?.filesWrite ?? task.scope?.filesWrite ?? [],
        },
        provider: resolveTaskProvider(task),
        // TOOL-AUTHORITY-001 T1: carry the runtime tool-scope enforcement TRUTH
        // on the assignment event so a silent full surface (codex/gemini with a
        // write-scope but no allowedToolsFlag) is typed + auditable, not hidden.
        // Advisory only — the spawn is not blocked (ADR-G-020 advisory-mode).
        toolScope: resolveToolScopeEnforcement(
          taskProvider,
          freshTask.scope?.filesWrite ?? task.scope?.filesWrite ?? [],
        ),
        // TOOL-AUTHORITY-001 filesystem-write-guard: even when Write()/Edit()
        // are path-scoped, the worker allowlist UNCONDITIONALLY co-grants an
        // unscoped `Bash` that can write outside the scope via shell. Carry that
        // escape TRUTH typed + auditable on the assignment event so ADR-G-020's
        // write-scope is not silently advisory. Advisory only (ADR-G-020); real
        // shell-scope enforcement is a named residual on TOOL-AUTHORITY-001.
        writeScopeShellEscape: resolveWriteScopeShellEscape(
          allowedTools,
          freshTask.scope?.filesWrite ?? task.scope?.filesWrite ?? [],
        ),
      },
    );
    {
      const toolScope = resolveToolScopeEnforcement(
        taskProvider,
        freshTask.scope?.filesWrite ?? task.scope?.filesWrite ?? [],
      );
      if (toolScope.reasonCode === 'RUNTIME_TOOL_SCOPE_UNENFORCED') {
        debugLog(
          'spawn:tool-scope-advisory',
          `task ${task.id} provider ${taskProvider}: write-scope present but the provider carries no runtime tool-scope flag — full surface is advisory-only (TOOL-AUTHORITY-001 T1)`,
        );
      }
      const writeEscape = resolveWriteScopeShellEscape(
        allowedTools,
        freshTask.scope?.filesWrite ?? task.scope?.filesWrite ?? [],
      );
      if (writeEscape.reasonCode === 'WRITE_SCOPE_DEFEATED_BY_SHELL') {
        debugLog(
          'spawn:write-scope-shell-escape',
          `task ${task.id}: path-scoped Write/Edit co-granted with unscoped ${writeEscape.shellTools.join(',')} — the write-scope is escapable via shell and enforced only advisorily (TOOL-AUTHORITY-001 filesystem-write-guard)`,
        );
      }
    }

    // Single spawn path — NEVER spawn the same task twice.
    //
    // Sprint 234 AS-2 Faz 2: host-HTTP adapter providers (`isAdapterProvider`)
    // bypass any configured backend. The previous priority order let a docker
    // backend silently swallow Ollama tasks and route them toward Docker CLI
    // binary selection. That boundary now rejects adapter-only providers;
    // host-adapter routing remains the sole valid path.
    // Now: if the task's provider is a host-HTTP adapter and its adapter is
    // registered, refresh dynamic model acceptance and use `adapter.spawn`.
    // `refreshSupportedModels` is optional (`?.`) so non-Ollama adapters that
    // do not implement it remain compatible.
    // Sprint 252 (PSL-1 verify): `- Backend: docker|tmux|subprocess` forces a
    // host-adapter provider (codex/gemini/ollama) onto a real spawn backend
    // instead of its host CLI — exercises the ProviderCommandSpec + per-provider
    // OAuth mount in the container. Uses the existing backend vocabulary (no
    // invented 'host' value; host-vs-cloud is a separate axis). Default
    // (undefined) keeps host-adapter routing unchanged.
    // Honest per-task backend resolution: when `- Backend:` is set and DIFFERS
    // from the configured spawn_backend, resolve THAT backend (so the override is
    // truthful, not silently the configured one). When it matches config (the
    // common case, e.g. `- Backend: docker` under spawn_backend=docker), reuse the
    // already-resolved/injected `backend` — preserves the spawnOpts injection
    // path (tests, controller) and avoids re-creating an identical backend.
    const effectiveBackend: SpawnBackend | undefined =
      task.backend && task.backend !== config.spawn_backend
        ? SpawnBackendFactory.create({
            backend: task.backend,
            projectDir: projectRoot,
            dockerImage: config.docker_image,
            dockerTimeoutSeconds: config.docker_timeout,
            dockerMemoryLimit: config.worker_memory_limit,
            dockerHomeTmpfsSize: config.worker_home_tmpfs_size, // WORKER-ENV-TMPFS-001
            dockerMemorySwap: config.worker_memory_swap,
            dockerKindMemoryLimits: config.worker_memory_limit_by_kind,
          })
        : backend;
    const finalOnlyUsageContainment =
      effectiveBackend?.name === 'docker'
      && getProviderCommandSpec(taskProvider)?.liveUsage === 'final-only'
      && hasLiveUsageCeiling(task.budget)
        ? task.budgetPolicy?.finalOnlyUsage
        : undefined;
    // An owner grant for a final-only provider is executable only inside the
    // Docker wall-clock containment boundary. Without that exact grant, the
    // normal host-adapter path remains fail-closed at live-usage admission.
    const wantsHostAdapter =
      isAdapterProvider(taskProvider)
      && !task.backend
      && !finalOnlyUsageContainment;
    // F1-RE (Sprint 252): resolve the model reasoning-effort (opt-in, provider-
    // validated) once; passed to every spawn path below. undefined → no flag.
    const reasoningEffort = resolveReasoningEffort(taskProvider, task.modelEffort);
    // F3.1: prefix-stable claude system prompt (config-global, default true). Passed
    // to every spawn path; only claude arg-builders emit the flag, others ignore it.
    const excludeDynamicPromptSections = config.prompt?.exclude_dynamic_system_prompt_sections !== false;
    const approvalExpectedDispatch = (
      backendName: string,
    ): AttendedExecutionApprovalExpectedDispatch | undefined => {
      if (!task.budget
        || !task.budgetPolicy?.landingPolicy
        || !task.budgetPolicy.policyDigest
        || !task.budgetPolicy.approvalProposal) {
        return undefined;
      }
      assertAttendedExecutionProposalMaterial(
        createAttendedExecutionProposalMaterialFromTask(
          task as unknown as Record<string, unknown>,
          prompt,
        ),
        task.budgetPolicy.approvalProposal,
      );
      return {
        ...task.budgetPolicy.approvalProposal,
        tenantId: task.actor?.tenantId ?? 'local',
        projectId: attendedExecutionProjectId(projectRoot),
        runId: task.sprintId ?? sprint.id,
        taskId: task.id,
        provider: taskProvider,
        model,
        backend: backendName,
        budget: task.budget,
        policy: {
          profileRef: task.budgetPolicy.profileRef,
          policyDigest: task.budgetPolicy.policyDigest,
          landing: task.budgetPolicy.landingPolicy,
        },
      };
    };
    // Sprint 280 root-cause fix: compute + emit the adaptive per-task timeout and
    // pass it to the spawn backend below as `taskTimeoutSeconds`, so docker_timeout
    // is the FALLBACK (not the de-facto ~20min cap). emitTimeoutEvents was dormant.
    // Fail-safe: the estimate is best-effort — any fault (e.g. a partial config
    // with no `timeout` block) must NOT abort the spawn; leave taskTimeoutSeconds
    // undefined so the backend uses its static docker_timeout fallback.
    let taskTimeoutSeconds: number | undefined;
    try {
      taskTimeoutSeconds = emitTimeoutEvents(
        task, config, sprintHistory, projectRoot, getCurrentSprintId(projectRoot) ?? sprint.id,
      );
    } catch (e) { debugLog('spawn:timeoutEstimate', e); }
    let adapterRouted = wantsHostAdapter
      ? getProviderAdapterForTask(taskProvider)
      : null;
    // MF-2 lazy re-check (Sprint 252): a host-only provider may not have been
    // registered at bootstrap (e.g. the ollama daemon came up AFTER sprint start,
    // or a transient detection miss). Re-run the idempotent bootstrap ONCE and
    // re-resolve — this lets a now-available provider run instead of honest-failing
    // it. Best-effort: on fault we keep null and fall through to the honest-fail.
    if (wantsHostAdapter && !adapterRouted) {
      try {
        await bootstrapProviders(config, projectRoot);
        adapterRouted = getProviderAdapterForTask(taskProvider);
      } catch (e) {
        debugLog('spawn:lazyAdapterRebootstrap', e);
      }
    }
    if (adapterRouted) {
      // `refreshSupportedModels` is optional on the ProviderAdapter contract
      // (OllamaAdapter implements it for `/api/tags` dynamic acceptance; others
      // may not). Structural narrow lets us call it without widening the core
      // interface.
      const refresh = (adapterRouted as { refreshSupportedModels?: () => Promise<void> }).refreshSupportedModels;
      if (typeof refresh === 'function') {
        await refresh.call(adapterRouted);
      }
      assertLiveUsageBudgetSupport(
        task.budget,
        adapterRouted.liveUsageBudgetSupport,
        adapterRouted.name,
        adapterRouted.executionCostClass,
      );
      assertExecutionLandingSupport({
        budget: task.budget,
        policy: task.budgetPolicy?.landingPolicy,
        mode: task.budgetPolicy?.admissionMode,
        capability: adapterRouted.executionLandingCapability,
        executor: adapterRouted.name,
        approvalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
        approvalAuthority: spawnOpts?.attendedExecutionApprovalAuthority,
        approvalExpectedDispatch: approvalExpectedDispatch('host-adapter'),
        executionCostClass: adapterRouted.executionCostClass,
      });
      adapterRouted.spawn(task.id, model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
        reasoningEffort,
        excludeDynamicPromptSections,
        taskTimeoutSeconds,
        executionBudget: task.budget,
        executionLandingPolicy: task.budgetPolicy?.landingPolicy,
        executionAdmissionMode: task.budgetPolicy?.admissionMode,
        executionApprovalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
        env: buildWorkerApprovalGateEnv(config.approval?.gate_enabled === true, task.sprintId, task.id),
      });
    } else if (wantsHostAdapter) {
      // MF-2 (Sprint 250): host-only provider (codex/gemini/ollama) but its
      // adapter is not registered/available right now. Do NOT fall through to
      // the docker backend, which silently degrades non-claude work to the
      // claude CLI. Write an honest NO_GO and skip this task's spawn.
      writeProviderUnavailableNoGo(task, projectRoot);
      task.status = TaskStatus.NO_GO;
      try {
        writeFileSync(
          join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
          JSON.stringify(task, null, 2),
          'utf-8',
        );
      } catch (e) { debugLog('spawnWorkers:honestFailWrite', e); }
      waveSkips.push(describeSpawnSkip(
        task,
        'provider-unavailable',
        `provider "${String(task.provider)}" has no registered host adapter; the host wrote a pre-dispatch NO_GO instead of degrading the spawn`,
      ));
      continue;
    } else if (effectiveBackend) {
      if (!finalOnlyUsageContainment) {
        assertLiveUsageBudgetSupport(
          task.budget,
          effectiveBackend.liveUsageBudgetSupport,
          effectiveBackend.name,
        );
      }
      const approvalGrant = assertExecutionLandingSupport({
        budget: task.budget,
        policy: task.budgetPolicy?.landingPolicy,
        mode: task.budgetPolicy?.admissionMode,
        capability: effectiveBackend.executionLandingCapability,
        executor: effectiveBackend.name,
        approvalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
        approvalAuthority: spawnOpts?.attendedExecutionApprovalAuthority,
        approvalExpectedDispatch: approvalExpectedDispatch(effectiveBackend.name),
      });
      const settlementRef = effectiveBackend.name === 'docker' && approvalGrant
        ? createTaskResultSettlementRefForAttempt(
          projectRoot,
          task.id,
          approvalGrant.receipt.binding.attemptId,
        )
        : undefined;
      effectiveBackend.spawn(task.id, model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
        reasoningEffort,
        excludeDynamicPromptSections,
        taskTimeoutSeconds,
        executionBudget: task.budget,
        executionLandingPolicy: task.budgetPolicy?.landingPolicy,
        executionAdmissionMode: task.budgetPolicy?.admissionMode,
        executionApprovalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
        executionApprovalGrant: approvalGrant,
        executionApprovalExpectedDispatch: approvalExpectedDispatch(effectiveBackend.name),
        settlementRef,
        ...(finalOnlyUsageContainment ? { finalOnlyUsageContainment } : {}),
        // SURF-3 S2/S3 — live tool-by-tool activity (flag-gated; no-op when
        // off). 583/N5: env-twin aware — an interactive-origin coordinator
        // (DECKENT_LIVE_TRACE=1) streams live without a global config flip.
        liveTraceEnabled: resolveLiveTraceEnabled(config),
        sprintId: task.sprintId,
      });
    } else if (!isTmuxProvider(taskProvider)) {
      const adapter = getProviderAdapterForTask(taskProvider);
      if (adapter) {
        assertLiveUsageBudgetSupport(
          task.budget,
          adapter.liveUsageBudgetSupport,
          adapter.name,
          adapter.executionCostClass,
        );
        assertExecutionLandingSupport({
          budget: task.budget,
          policy: task.budgetPolicy?.landingPolicy,
          mode: task.budgetPolicy?.admissionMode,
          capability: adapter.executionLandingCapability,
          executor: adapter.name,
          approvalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
          approvalAuthority: spawnOpts?.attendedExecutionApprovalAuthority,
          approvalExpectedDispatch: approvalExpectedDispatch('host-adapter'),
          executionCostClass: adapter.executionCostClass,
        });
        adapter.spawn(task.id, model, prompt, {
          allowedTools,
          autoApprove: spawnOpts?.autoApprove ?? false,
          projectDir: projectRoot,
          executionBudget: task.budget,
          executionLandingPolicy: task.budgetPolicy?.landingPolicy,
          executionAdmissionMode: task.budgetPolicy?.admissionMode,
          executionApprovalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
          env: buildWorkerApprovalGateEnv(config.approval?.gate_enabled === true, task.sprintId, task.id),
        });
      }
    } else {
      assertLiveUsageBudgetSupport(task.budget, undefined, 'tmux');
      assertExecutionLandingSupport({
        budget: task.budget,
        policy: task.budgetPolicy?.landingPolicy,
        mode: task.budgetPolicy?.admissionMode,
        capability: 'unsupported',
        executor: 'tmux',
        approvalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
        approvalAuthority: spawnOpts?.attendedExecutionApprovalAuthority,
        approvalExpectedDispatch: approvalExpectedDispatch('tmux'),
      });
      spawnWorker(task.id, model, prompt, projectRoot, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        excludeDynamicPromptSections,
      });
    }

    // STARTING → EXECUTING (spawn call succeeded)
    sm.transition('EXECUTING');

    // TT553 (task 418-002): capture the worker's HOST-liveness backend at the
    // SSOT spawn point, so the host-liveness layer (heartbeat-monitor.ts) can
    // dispatch the right probe (docker→container-state, tmux→pane, subprocess/
    // host-adapter→process-pid) instead of re-deriving it from scattered spawn
    // signals downstream. Additive on the HEARTBEAT event payload — a host-adapter
    // (ollama/codex/gemini) runs as a host subprocess, so it maps to 'subprocess'.
    const livenessBackend: WorkerBackendKind = adapterRouted
      ? 'subprocess'
      : effectiveBackend
        ? (effectiveBackend.name === 'docker' ? 'docker'
          : effectiveBackend.name === 'tmux' ? 'tmux' : 'subprocess')
        : isTmuxProvider(taskProvider) ? 'tmux' : 'subprocess';

    // Emit lifecycle state to event stream
    const sprintIdForEvent = getCurrentSprintId(projectRoot) ?? sprint.id;
    writeEvent(
      projectRoot, sprintIdForEvent, 'worker', 'brain',
      CHANNELS.HEARTBEAT,
      { workerId: wid, taskId: task.id, lifecycleState: sm.state, backend: livenessBackend },
    );

    // Update task status to EXECUTING and persist to disk
    task.status = TaskStatus.EXECUTING;
    try {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
    } catch (e) { debugLog('spawnWorkers:writeTaskFile', e); }

    spawnedThisWave++;
    spawnedTasks.push(task);
  }

  const agents: AgentInfo[] = spawnedTasks.map(task => ({
    id: `w-${task.id}`,
    role: 'worker' as const,
    status: AgentStatus.EXECUTING,
    model: task.model,
    tmuxWindow: `w-${task.id}`,
    taskId: task.id,
    currentAction: `Starting [${resolveTaskProvider(task)}]`,
    spawnedAt: now(),
  }));

  updateDashboard(projectRoot, {
    sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
    agents,
    progress: {
      done: 0,
      active: spawnedTasks.length,
      blocked: queuedTasks.filter(task => blockedTaskIds.has(task.id)).length,
      total: sprint.tasks.length,
    },
    alerts: [],
    updatedAt: now(),
  });

  publishSchedulerSpawnSkips(
    projectRoot,
    getCurrentSprintId(projectRoot) ?? sprint.id,
    'initial-wave',
    spawnedTasks.map(task => task.id),
    waveSkips,
  );

  return queuedTasks;
}

/**
 * Re-evaluate and spawn tasks that are now eligible because their dependencies are DONE.
 * Called after a task completes (finalizeTaskResult) when dependency_pipeline_enabled is true.
 * Each respawn event can optionally emit a wave.transition metric via the provided callback.
 * @returns Array of newly spawned task IDs
 */
export async function respawnEligibleTasks(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: {
    autoApprove?: boolean;
    spawnBackend?: SpawnBackend;
    attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
    providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  },
  onWaveTransition?: (durationMs: number, fromWave: string, toWave: string) => void,
): Promise<string[]> {
  if (!config.dependency_pipeline_enabled) {
    // Row 3309 S5: the earliest and quietest exit — a queued FIX task is never
    // even looked at on this pass. Name the tasks that are waiting so the
    // config cause is readable from the journal instead of being inferred.
    publishSchedulerSpawnSkips(
      projectRoot,
      getCurrentSprintId(projectRoot) ?? sprint.id,
      'respawn-wave',
      [],
      sprint.tasks
        .filter(t => t.status === TaskStatus.PENDING)
        .map(t => describeSpawnSkip(
          t,
          'dependency-pipeline-disabled',
          'this pass returns before the queue is read because config.dependency_pipeline_enabled is not true',
        )),
    );
    return [];
  }

  const waveStart = Date.now();
  // Row 3309: typed reasons for every queued task this pass declines to spawn,
  // published to the scheduler journal before each return path below.
  const passSkips: SchedulerSpawnSkip[] = [];

  // born-610 SINGLE-TRUTH: dependency satisfaction comes from ONE predicate
  // (scheduler-truth.ts). MRR is NO LONGER satisfying — it is unverified
  // partial work (Alperen decision 2026-07-10); its dependents are cascade-
  // skipped by cascadeSkipDeadBlocked instead of being spawned on top of an
  // unreviewed foundation. Sprint-280's FIX-deadlock (the original reason MRR
  // was counted as done here) stays solved via that skip path: nothing waits
  // forever, the sprint completes, the human reviews afterwards.
  //
  // SCHED1 (born-634/635, docs/analysis/scheduler-unify-design-2026-07-11.md):
  // aggregate-aware via the single scheduler-state helper — INTENTIONAL
  // behavior change, this was previously the one caller WITHOUT one-level
  // fix-aggregation (a DONE `<id>-fix` now also satisfies `<id>` here, same as
  // it already did in findReadyUndispatchedTasks/planContinuous). Pinned by
  // scheduler-effective-dependencies.test.ts.
  const { satisfyingIds: doneTasks } = computeEffectiveDependencyState(sprint.tasks, waveStart);

  // Build dependency graph for enforcement (Sprint 139 Task 028)
  const graph = buildDependencyGraph(sprint.tasks, /* includeCollisions */ true);
  const pendingIds = sprint.tasks
    .filter(t => t.status === TaskStatus.PENDING || t.status === TaskStatus.PAUSED)
    .map(t => t.id);

  const enforcement = enforceWaveDependency(graph, pendingIds, new Set(doneTasks));

  // Emit blocked events to event stream
  const sprintIdForDeps = getCurrentSprintId(projectRoot) ?? sprint.id;
  const tasksByIdForSkips = new Map(sprint.tasks.map(t => [t.id, t]));
  for (const [blockedId, unresolvedDeps] of enforcement.reasons) {
    writeEvent(
      projectRoot, sprintIdForDeps, 'brain', 'worker',
      'BRAIN→WORKER:DEPENDENCY_BLOCKED',
      { taskId: blockedId, unresolvedDeps, reason: 'dependencies not yet DONE' },
    );
    const blockedTask = tasksByIdForSkips.get(blockedId);
    if (blockedTask) {
      passSkips.push(describeSpawnSkip(
        blockedTask,
        'dependency-unsatisfied',
        `dependencies not yet satisfying: ${unresolvedDeps.join(', ')}`,
      ));
    }
  }

  const nowEligible = sprint.tasks.filter(t => enforcement.eligible.includes(t.id));

  if (nowEligible.length === 0) {
    publishSchedulerSpawnSkips(projectRoot, sprintIdForDeps, 'respawn-wave', [], passSkips);
    return [];
  }

  const systemProfile = getSystemProfile();
  const maxWorkers = resolveEffectiveWorkers(config, systemProfile);
  const currentlyExecuting = sprint.tasks.filter(
    t => t.status === TaskStatus.EXECUTING || t.status === TaskStatus.CLAIMED || t.status === TaskStatus.TESTING,
  ).length;
  const slotsAvailable = Math.max(0, maxWorkers - currentlyExecuting);

  const toSpawn = nowEligible.slice(0, slotsAvailable);
  // Row 3309 S6/S7 — the measured stall: dependency-clear, unblocked, and still
  // not spawned because the fleet is full. Previously this returned an empty
  // array with no trace at all, which is exactly what the 92 empty watcher
  // decisions looked like from disk.
  for (const overflow of nowEligible.slice(slotsAvailable)) {
    passSkips.push(describeSpawnSkip(
      overflow,
      'worker-slot-exhausted',
      `no free worker slot: ${currentlyExecuting} of ${maxWorkers} slot(s) are occupied by live workers`,
    ));
  }
  if (toSpawn.length === 0) {
    publishSchedulerSpawnSkips(projectRoot, sprintIdForDeps, 'respawn-wave', [], passSkips);
    return [];
  }

  // Dependency descendants are parked PAUSED while their failed lineage is
  // repaired. Once every dependency is satisfying, reopening is an explicit
  // durable transition before dispatch — never an implicit spawn of a paused
  // task.
  for (const task of toSpawn) {
    if (task.status !== TaskStatus.PAUSED) continue;
    task.status = TaskStatus.PENDING;
    writeFileSync(
      join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
      JSON.stringify(task, null, 2),
      'utf-8',
    );
    writeEvent(
      projectRoot,
      sprintIdForDeps,
      'brain',
      'worker',
      'BRAIN→WORKER:DEPENDENCY_REPAIR_UNBLOCKED',
      { taskId: task.id, dependencies: task.dependencies ?? [] },
    );
  }

  const backend = spawnOpts?.spawnBackend;

  // Sprint 202 Task 202-004 — same inter-worker throttle as spawnWorkers().
  const throttleFloorMs = readTokenThrottleMs(config);
  // Sprint 319 B-HISTORYSCALE — same real past-sprint history aggregation as
  // spawnWorkers(), computed once per respawn wave.
  const sprintHistory = aggregateSprintHistory(projectRoot);
  let spawnedThisWave = 0;
  const spawnedTaskIds: string[] = [];
  const collectedIds = new Set(
    sprint.tasks
      .filter(task => task.status === TaskStatus.DONE || task.status === TaskStatus.NO_GO)
      .map(task => task.id),
  );

  for (const task of toSpawn) {
    if (spawnedThisWave > 0 && throttleFloorMs > 0) {
      const delayMs = nextDelayMs(null, 0, throttleFloorMs);
      await sleep(delayMs);
    }

    // KN2 backstop (GR-2026-08-08-DOGFOOD-KN2-01): a task file that predates
    // the plan-time budget stamping (stale/legacy projection) reaches spawn
    // with NO budget-policy snapshot, which the remote-class admission below
    // refuses with a message that used to be unactionable. Run the SAME
    // policy applier the planner uses — single decision source, typed log; the
    // outcome (allow-with-ceilings or typed hold) is the policy's own verdict,
    // never a bypass. Values all come from effective config (ADR-G-036).
    if (task.budgetPolicy === undefined) {
      try {
        applyWorkerExecutionBudgetPolicy([task], config.execution_budget, config.worker_provider);
        debugLog('spawn:budget-backstop', `stamped policy snapshot for stale/legacy task ${task.id}`);
      } catch (e) {
        debugLog('spawn:budget-backstop', e);
      }
    }

    // Sprint 156 Task 012 — observability for fresh-eyes rotation on fix tasks.
    // Kept here (wave-level metric side effect) — SCHED3 dilim-3 explicitly
    // does not move metrics/events into the canonical executor.
    emitRotationMetricIfApplicable(projectRoot, sprint.id, task);

    // Sprint 280 root-cause fix: compute + emit the adaptive per-task timeout
    // and forward it to executeSpawnTask as `taskTimeoutSeconds`, so
    // docker_timeout is the FALLBACK (not the de-facto ~20min cap).
    // Fail-safe: the estimate is best-effort — any fault (e.g. a partial
    // config with no `timeout` block) must NOT abort the spawn; leave
    // taskTimeoutSeconds undefined so the backend uses its static fallback.
    let taskTimeoutSeconds: number | undefined;
    try {
      taskTimeoutSeconds = emitTimeoutEvents(
        task, config, sprintHistory, projectRoot, getCurrentSprintId(projectRoot) ?? sprint.id,
      );
    } catch (e) { debugLog('spawn:timeoutEstimate', e); }

    // SCHED3 (born-634/635, docs/analysis/scheduler-unify-design-2026-07-11.md):
    // single canonical executor — fix-routing-lineage inheritance, prompt/
    // provider/backend/reasoning-effort resolution, backend dispatch, and
    // task persistence all happen inside executeSpawnTask now (previously
    // duplicated inline here AND diverged from the local queue path's
    // spawnIfNotAssigned in result-collector.ts).
    const disposition = await executeSpawnTask(
      { task, taskTimeoutSeconds },
      {
        projectRoot,
        sprintFallbackId: sprint.id,
        config,
        spawnOpts,
        backend,
        resolveAgentPrompt,
        resolveSkillPrompts,
        buildWriteTargets: buildAllowedWriteTargets,
        collisionAuthority: { tasks: sprint.tasks, collectedIds },
      },
    );

    if (disposition.kind !== 'spawned') {
      if (disposition.kind === 'routing-lineage-missing') {
        debugLog('respawnEligibleTasks:routingLineageMissing', disposition.detail);
      }
      // Row 3309 S8: admission refused this task for a real reason — keep the
      // refusal (semantics unchanged) and publish WHICH refusal it was.
      const skip = spawnSkipFromDisposition(disposition, task);
      if (skip) passSkips.push(skip);
      continue;
    }

    spawnedThisWave++;
    spawnedTaskIds.push(task.id);
  }

  const waveDuration = Date.now() - waveStart;
  metric('wave.transition', waveDuration, { from_wave: 'dep-wait', to_wave: `wave-${spawnedTaskIds.length}` });
  if (onWaveTransition) {
    try {
      onWaveTransition(waveDuration, 'dep-wait', `wave-${spawnedTaskIds.length}`);
    } catch (e) { debugLog('respawnEligibleTasks:onWaveTransition', e); }
  }

  // ─── METRIC_EMITTED: wave respawn metrics ────────────────────────
  // Emit a METRIC_EMITTED event so Auditor/Dashboard can track wave progress
  // without polling the file system. Written in parallel with metrics.jsonl.
  const sprintIdForMetric = getCurrentSprintId(projectRoot) ?? sprint.id;
  writeEvent(
    projectRoot, sprintIdForMetric, 'brain', '*',
    CHANNELS.METRIC_EMITTED,
    {
      name: 'wave.respawn',
      value: spawnedTaskIds.length,
      durationMs: waveDuration,
      spawnedTaskIds,
      totalDone: sprint.tasks.filter(t => t.status === TaskStatus.DONE).length,
      totalPending: sprint.tasks.filter(t => t.status === TaskStatus.PENDING).length,
    },
  );

  // ─── Checkpoint every N completed tasks (Sprint 138 Long-Running Resume) ──
  // Sprint 139 override: sprint_checkpoint_interval=3 (default 5) for higher-risk sprints
  const CHECKPOINT_INTERVAL = config.sprint_checkpoint_interval ?? 5;
  const terminalCount = sprint.tasks.filter(t =>
    t.status === TaskStatus.DONE || t.status === TaskStatus.NO_GO,
  ).length;
  if (terminalCount > 0 && terminalCount % CHECKPOINT_INTERVAL === 0) {
    const sprintId = getCurrentSprintId(projectRoot) ?? sprint.id;
    const eventOffset = readSequence(projectRoot, sprintId);
    writeCheckpoint(projectRoot, sprint, eventOffset);
    debugLog('respawnEligibleTasks:checkpoint', `Checkpoint written at ${terminalCount} completed tasks`);
  }

  publishSchedulerSpawnSkips(projectRoot, sprintIdForDeps, 'respawn-wave', spawnedTaskIds, passSkips);

  debugLog('respawnEligibleTasks', `Spawned ${spawnedTaskIds.length} newly eligible tasks: ${spawnedTaskIds.join(', ')}`);
  return spawnedTaskIds;
}

// ─── Sprint 165 Bug Y — processQueue Stall Fix Helpers ──────────────
// Pure functions used by waitForResults::processQueue to fix the
// Sprint 161/164/165 hayalet-task regression (legacy FIFO stall +
// duplicate spawn). Exported for unit testing.

/**
 * Count tasks currently occupying a worker slot.
 * A task is "executing" if its status is EXECUTING, CLAIMED, or TESTING.
 *
 * Sprint 165 Bug Y fix — used by force re-scan and slot-aware spawn
 * to detect when slots are available without actually killing a worker.
 */
export function countCurrentlyExecuting(sprint: Sprint): number {
  return sprint.tasks.filter(t =>
    t.status === TaskStatus.EXECUTING
    || t.status === TaskStatus.CLAIMED
    || t.status === TaskStatus.TESTING,
  ).length;
}

/**
 * Compute how many worker slots are free right now.
 * Returns max(0, maxWorkers - countCurrentlyExecuting(sprint)).
 *
 * Sprint 165 Bug Y fix — used by force re-scan to decide whether to
 * scan PENDING tasks for spawn.
 */
export function computeSlotsAvailable(sprint: Sprint, maxWorkers: number): number {
  return Math.max(0, maxWorkers - countCurrentlyExecuting(sprint));
}

/**
 * Select PENDING tasks eligible for spawn, respecting dependency_pipeline_enabled.
 * Skips tasks already in assignedTaskIds (idempotency / Bug F guard) and
 * those in collectedIds (already produced a result).
 *
 * - Legacy FIFO mode (`dependency_pipeline_enabled: false`): dependencies are
 *   ignored — all PENDING tasks not in assigned/collected sets are eligible.
 * - Dependency pipeline mode: each PENDING task is eligible only when all
 *   its dependencies are in the done set.
 *
 * The function returns at most `slotsAvailable` tasks, in their natural
 * sprint.tasks ordering (caller decides whether to use FIFO or another order).
 *
 * Sprint 165 Bug Y fix — used by force re-scan path to detect orphan PENDING
 * tasks that the legacy `for (taskId of completedTaskIds)` loop missed.
 *
 * SCHED1 (born-634/635): dependency satisfaction + retry-backoff eligibility
 * are now sourced from the single `computeEffectiveDependencyState` helper.
 * INTENTIONAL behavior change vs. the prior hardcoded `status === DONE` set:
 * a DONE `<id>-fix` now also satisfies `<id>` here (previously only true in
 * findReadyUndispatchedTasks/planContinuous — see scheduler-unify design doc
 * overlap matrix "Fix aggregation" row). Pinned by
 * scheduler-effective-dependencies.test.ts.
 */
export function selectEligibleForSpawn(
  sprint: Sprint,
  config: Pick<ResolvedConfig, 'dependency_pipeline_enabled'> | undefined,
  slotsAvailable: number,
  assignedTaskIds: ReadonlySet<string>,
  collectedIds: ReadonlySet<string>,
  nowMs: number = Date.now(),
): Task[] {
  if (slotsAvailable <= 0) return [];

  const depPipelineEnabled = config?.dependency_pipeline_enabled === true;
  const { satisfyingIds, retryEligibleIds } = computeEffectiveDependencyState(sprint.tasks, nowMs);

  const eligible: Task[] = [];
  for (const task of sprint.tasks) {
    if (eligible.length >= slotsAvailable) break;
    if (task.status !== TaskStatus.PENDING) continue;
    if (assignedTaskIds.has(task.id)) continue;
    if (collectedIds.has(task.id)) continue;
    // Transient-retry backoff: skip task until retryAfter timestamp passes
    if (!retryEligibleIds.has(task.id)) continue;
    if (depPipelineEnabled && task.dependencies && task.dependencies.length > 0) {
      const allDone = task.dependencies.every(dep => satisfyingIds.has(dep));
      if (!allDone) continue;
    }
    eligible.push(task);
  }
  return eligible;
}

/**
 * Pop the first eligible task from a FIFO queue, skipping any that are
 * already assigned. Mutates `remainingQueue` (shift).
 *
 * Used by processQueue to drain the queue while enforcing the idempotency
 * guard against duplicate TASK_ASSIGN (Bug F). Returns undefined when the
 * queue is exhausted or no eligible entry remains.
 *
 * Note: we deliberately do NOT skip on `collectedIds`. A task that is in
 * `remainingQueue` has not yet been spawned, so its presence in the
 * collected set indicates a synthetic test scenario or a race that should
 * still drain the slot (preserving the contract of the original
 * `for (taskId of completedTaskIds)` loop in task-queue.test.ts).
 *
 * Sprint 165 Bug Y fix.
 */
export function pickFromQueue(
  remainingQueue: Task[],
  assignedTaskIds: ReadonlySet<string>,
): Task | undefined {
  while (remainingQueue.length > 0) {
    const candidate = remainingQueue.shift();
    if (!candidate) return undefined;
    if (assignedTaskIds.has(candidate.id)) continue;
    return candidate;
  }
  return undefined;
}

/**
 * Validate task dependencies using topological sort.
 * Throws DependencyCycleError (DECKENT_E049) if circular dependencies are detected.
 * @returns ExecutionWave[] for informational purposes
 */
export function validateTaskDependencies(tasks: Task[]): import('./parallel-pipeline.js').ExecutionWave[] {
  const pipeline = new ParallelPipelineManager();
  return pipeline.createPipeline(
    tasks.map(t => ({ id: t.id, dependencies: t.dependencies ?? [] })),
  );
}

/**
 * Append one spawn-time agent-fallback decision to the sprint's routing-
 * decision journal (`.deckent/routing/decisions/<sprintId>.jsonl`, same file
 * routing-engine.ts's born-622 journal writes to — path reused via
 * `routingDecisionJournalPath`). Tagged `source: 'spawn-fallback'` so it is
 * distinguishable from plan-time `selectBestAgent` decision records sharing
 * the file. Fires ONLY when `routeSprintTasks` actually reassigns
 * `task.assignedAgent` (see call site) — the normal, plan-time-pinned case
 * never reaches here, so this journal stays a faithful "invisible decision"
 * audit trail rather than noise on every task.
 *
 * Fail-soft (ADR-G-009), mirrors routing-engine.ts's own
 * `appendRoutingDecisionRecord`: an agent-journal write fault must never
 * affect spawn. No-op when a non-production caller omits `journalContext`;
 * `runSprint` threads the real project/sprint context. Provider fallback
 * provenance below has the stricter fail-closed contract.
 */
function appendSpawnFallbackRoutingDecision(
  journalContext: { projectRoot: string; sprintId: string } | undefined,
  taskId: string,
  agentId: string,
  reason: string,
): void {
  if (!journalContext) return;
  try {
    const candidates: RoutingDecisionCandidate[] = [
      { agentId, totalScore: 0, signals: {}, bypass: false },
    ];
    const record = {
      taskId,
      sprintId: journalContext.sprintId,
      ts: new Date().toISOString(),
      candidates,
      winner: agentId,
      reason,
      cached: false,
      source: 'spawn-fallback' as const,
    };
    const filePath = routingDecisionJournalPath(journalContext.projectRoot, journalContext.sprintId);
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  } catch {
    // Fail-soft (ADR-G-009): a decision-journal write error must never affect spawn.
  }
}

/**
 * Route all sprint tasks to providers using the TaskRouter.
 * Sets task.provider, task.assignedAgent, and task.assignedSkills based on routing decisions.
 * Exported for testability — called from runSprint Phase 1.5.
 *
 * 409-003 ROUTING-TEK-OTORİTE — single-authority pin: plan-time routing
 * (sprint-planner.ts's routeTaskV2 → selectBestAgent, now live per born-641)
 * already resolves `task.assignedAgent` with full multi-signal context
 * (skill affinity, learning bonus, forceAgent override, user-surface bonus —
 * routing-engine.ts's `getUserSurfaceBonus` feeds selectBestAgent directly).
 * `routeTask`'s own `applyUserSurfaceBonus` reapplies that SAME surface
 * signal in isolation and can disagree with the already-decided winner
 * (proven by tests/orchestra/router-surface-wire.test.ts, whose fixtures
 * intentionally show routeTask returning a different agent than a
 * pre-existing `assignedAgent`) — previously this function overwrote
 * `task.assignedAgent` unconditionally whenever `routing.agent !== 'generic'`,
 * a silent, un-journaled second authority on top of plan-time's decision.
 * Now: a task that already carries a meaningful (non-empty, non-'generic')
 * plan-time assignment keeps it — spawn-time only fills in when plan-time
 * left nothing real (routing-failure swallow, or a genuine 'generic'
 * verdict), and that fallback is journaled (tagged, fail-soft) so it is
 * never an invisible decision.
 *
 * @param tasks - Array of tasks to route
 * @param config - Resolved config with skill_routing overrides
 * @param availableProviders - List of available provider names (from Connector or registry)
 * @param journalContext - projectRoot/sprintId for durable fallback provenance.
 *   Optional only for no-fallback callers; a selected provider fallback fails
 *   closed when this context is absent.
 */
export function routeSprintTasks(
  tasks: Task[],
  config: ResolvedConfig,
  availableProviders: ProviderName[],
  journalContext?: { projectRoot: string; sprintId: string },
): void {
  for (const task of tasks) {
    const routing = routeTask(task, config, availableProviders);
    if (routing.providerFallback) {
      if (!journalContext) {
        throw new ProviderRoutingError(
          'E_PROVIDER_FALLBACK_PROVENANCE_REQUIRED',
          routing.providerFallback.selectedProvider,
        );
      }
      const persisted = writeEvent(
        journalContext.projectRoot,
        journalContext.sprintId,
        'brain',
        'auditor',
        PROVIDER_FALLBACK_SELECTED_CHANNEL,
        {
          taskId: task.id,
          ...routing.providerFallback,
        },
      );
      if (!persisted) {
        throw new ProviderRoutingError(
          'E_PROVIDER_FALLBACK_PROVENANCE_WRITE_FAILED',
          routing.providerFallback.selectedProvider,
        );
      }
    }
    task.provider = routing.provider;
    const hasPlanTimeAssignment =
      task.assignedAgent != null && task.assignedAgent !== '' && task.assignedAgent !== 'generic';
    if (!hasPlanTimeAssignment && routing.agent !== 'generic') {
      task.assignedAgent = routing.agent;
      appendSpawnFallbackRoutingDecision(journalContext, task.id, routing.agent, routing.reason);
    }
    if (routing.skills.length > 0) task.assignedSkills = routing.skills;
    // 486-018 FORCED-SKILL-PRESERVE: this is the single spawn-routing choke
    // point every task (plan-time V3, debt-manager FIX rotation, mid-sprint
    // reroute) passes through before buildWorkerPrompt. Routing above may add
    // compatible skills, but an operator's explicit forceSkills must never be
    // silently replaced by a routing-derived (or otherwise upstream-corrupted)
    // set — union it back in rather than trusting it survived unchanged.
    const forcedSkillIds = task.forceSkills ?? [];
    if (forcedSkillIds.length > 0) {
      const current = task.assignedSkills ?? [];
      const missingForced = forcedSkillIds.filter(id => !current.includes(id));
      if (missingForced.length > 0) {
        task.assignedSkills = Array.from(new Set([...current, ...forcedSkillIds]));
      }
    }
  }
}

/**
 * Apply the legacy PLAN→SPAWN routing projection only when execution is not
 * bound to an approved exact plan.
 *
 * Exact plans already bind the effective provider/model/backend/auth tuple in
 * their execution-plan digest. Their approved task artifacts are materialized
 * before this boundary and must remain byte/semantic stable. Re-running the
 * mutable legacy router here would turn a digest-derived provider into a new
 * task field after approval (or select a fallback from transient availability),
 * causing the runtime to reject its own artifact as drift. Exact execution
 * therefore consumes the approved task as-is; provider ingress resolves the
 * bound provider from the task/model and fails closed if it cannot execute.
 */
export function routeSprintTasksForExecution(
  tasks: Task[],
  config: ResolvedConfig,
  availableProviders: ProviderName[],
  journalContext: { projectRoot: string; sprintId: string },
  exactPlanAuthority?: ExactPlanSpawnAuthority,
): void {
  if (exactPlanAuthority) return;
  routeSprintTasks(tasks, config, availableProviders, journalContext);
}

// ─── State-Aware Worker Stop (Sprint 139 Task 015) ──────────────

/**
 * Stop a worker only if it's in a stoppable lifecycle state.
 *
 * This prevents the "No such container" race condition from Sprint 138:
 * worker writes DONE → container exits → Brain calls docker stop → container gone → error.
 *
 * @param taskId - Task ID (used to derive worker ID: `w-${taskId}`)
 * @param backend - Spawn backend with kill() method
 * @returns Object with `stopped` flag and the worker's lifecycle state
 */
export function stopWorkerIfStoppable(
  taskId: string,
  backend: SpawnBackend | undefined,
): { stopped: boolean; state: WorkerLifecycleState | 'UNKNOWN' } {
  const wid = `w-${taskId}`;

  if (!isWorkerStoppable(wid)) {
    // getAllWorkerStates().get() returns undefined if worker was already cleaned up
    const existingSm = getAllWorkerStates().get(wid);
    const currentState = existingSm?.state ?? 'UNKNOWN' as const;
    debugLog('stopWorkerIfStoppable:skip', `worker ${wid} in ${currentState} — skip stop`);
    return { stopped: false, state: currentState };
  }

  const sm = getWorkerStateMachine(wid);

  // Transition to ERROR before stopping (worker is being forcefully terminated)
  if (sm.canTransition('ERROR')) {
    sm.transition('ERROR');
  }

  if (backend) {
    backend.kill(taskId);
  }

  // Transition to EXITED after stop
  if (sm.canTransition('EXITED')) {
    sm.transition('EXITED');
  }

  // Cleanup state machine from registry
  removeWorkerStateMachine(wid);

  debugLog('stopWorkerIfStoppable:done', `worker ${wid} stopped and cleaned up`);
  return { stopped: true, state: 'EXITED' };
}

/**
 * Transition a worker's lifecycle state and emit to event stream.
 * Convenience wrapper used by Brain/result-collector when processing worker heartbeats.
 *
 * @param projectRoot - Project root for event stream
 * @param taskId - Task ID
 * @param newState - Target lifecycle state
 * @returns true if transition succeeded, false if invalid
 */
export function transitionWorkerState(
  projectRoot: string,
  taskId: string,
  newState: WorkerLifecycleState,
): boolean {
  const wid = `w-${taskId}`;
  const sm = getWorkerStateMachine(wid);

  if (!sm.canTransition(newState)) {
    debugLog('transitionWorkerState:invalid', `${wid}: ${sm.state} → ${newState} not allowed`);
    return false;
  }

  sm.transition(newState);

  const sprintId = getCurrentSprintId(projectRoot);
  if (sprintId) {
    writeEvent(
      projectRoot, sprintId, 'worker', 'brain',
      CHANNELS.HEARTBEAT,
      { workerId: wid, taskId, lifecycleState: sm.state },
    );
  }

  return true;
}

// ─── Runtime vs Code Discriminator — Cross-Dep Action (Sprint 139 Task 024) ─

/**
 * Evaluate a failed task and emit the correct cross-dependency action to the event stream.
 *
 * This is the entry point for the Runtime vs Code Discriminator in the spawner.
 * Called after a task is evaluated as NO_GO, before deciding whether to:
 *   - Retry the task (RUNTIME / AMBIGUOUS)
 *   - Cascade-block its dependents (CODE)
 *   - Spawn a fix worker (CODE)
 *
 * The classification and decision are emitted to the event stream so the
 * Auditor can observe and Brain can reconcile cascades.
 *
 * @param projectRoot - Project root for event stream writes
 * @param taskId - ID of the failed task
 * @param ctx - Failure context (exitCode, notes, errorOutput, resultFilePresent)
 * @returns CascadeDecision — callers use shouldRetry, shouldCascade, spawnFixWorker
 */
export function evaluateFailureCascade(
  projectRoot: string,
  taskId: string,
  ctx: FailureContext,
): CascadeDecision {
  const decision = decideCascadeAction(taskId, ctx);

  const sprintId = getCurrentSprintId(projectRoot);
  if (sprintId) {
    writeEvent(
      projectRoot, sprintId, 'brain', 'brain',
      CHANNELS.FIX_REQUEST,
      {
        taskId,
        failureCategory: decision.category,
        shouldRetry: decision.shouldRetry,
        shouldCascade: decision.shouldCascade,
        spawnFixWorker: decision.spawnFixWorker,
        reason: decision.reason,
        signals: (ctx.notes ?? '').slice(0, 200),
      },
    );
  }

  debugLog('evaluateFailureCascade', `task ${taskId}: ${decision.category} → retry=${decision.shouldRetry} cascade=${decision.shouldCascade}`);

  return decision;
}

// ─── Cascade Application Wire (Sprint 139 Task 029) ─────────────────────────

/**
 * Apply cascade blocking to a sprint after a task fails.
 *
 * Integrates evaluateFailureCascade (Task 024 discriminator) with
 * applyFailureCascade (Task 029 scheduler). Respects Alperen's Q1 risk-taking:
 *   - CODE failure → cascade block PENDING dependents → PAUSED
 *   - RUNTIME / AMBIGUOUS → no cascade; when retry_transient_failures=true,
 *     re-queue as a retry task with exponential backoff (Sprint 324 Task 006).
 *
 * Each PENDING → PAUSED transition is written to the event stream via
 * SCOPE_COLLISION_DETECTED channel (re-used as blocking signal) so the
 * Auditor can track blocked tasks.
 *
 * @param projectRoot - Project root for event stream writes
 * @param sprint - Sprint with tasks to potentially block
 * @param failedTaskId - Task evaluated as NO_GO
 * @param ctx - Failure context for classification
 * @param config - Optional resolved config; required for retry_transient_failures flag
 * @returns CascadeDecision, list of newly blocked task IDs, and optional retry task ID
 */
export function applyCascadeToSprint(
  projectRoot: string,
  sprint: Sprint,
  failedTaskId: string,
  ctx: FailureContext,
  config?: ResolvedConfig,
): { decision: CascadeDecision; blockedTaskIds: string[]; retryTaskId?: string } {
  const decision = evaluateFailureCascade(projectRoot, failedTaskId, ctx);

  if (!decision.shouldCascade) {
    // RUNTIME or AMBIGUOUS: no cascade — attempt transient re-queue if enabled
    const retryTaskId = readRetryTransientFailures(config)
      ? _enqueueTransientRetry(projectRoot, sprint, failedTaskId)
      : undefined;
    return { decision, blockedTaskIds: [], retryTaskId };
  }

  // CODE failure: build graph and cascade-block transitive dependents
  const graph = buildDependencyGraph(sprint.tasks, /* includeCollisions */ false);
  const sprintId = getCurrentSprintId(projectRoot) ?? sprint.id;

  const cascadeResult = applyFailureCascade(graph, failedTaskId, sprint.tasks, {
    shouldCascade: decision.shouldCascade,
    failureCategory: decision.category,
    onTransition: (event) => {
      // Write each BLOCKED transition to event stream
      writeEvent(
        projectRoot, sprintId, 'auditor', 'brain',
        CHANNELS.SCOPE_COLLISION_DETECTED, // repurposed as cascade block signal
        {
          transition: event.transition,
          taskId: event.taskId,
          triggerTaskId: event.triggerTaskId,
          failureCategory: event.failureCategory,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          blockedBy: failedTaskId,
        },
      );
    },
  });

  debugLog(
    'applyCascadeToSprint',
    `Cascade applied: ${failedTaskId} (CODE) → ${cascadeResult.totalBlocked} tasks blocked`,
  );

  return { decision, blockedTaskIds: cascadeResult.blockedTaskIds };
}

/**
 * Internal helper: create and enqueue a retry task for a transient (RUNTIME/AMBIGUOUS) failure.
 *
 * Conditions checked here (all must hold for a retry task to be queued):
 *   1. The failing task exists in sprint.tasks
 *   2. Its current retryCount < MAX_RETRY_COUNT
 *
 * On success:
 *   - Creates a new task with id suffix `-r<N>`, status PENDING, retryCount+1
 *   - Sets `retryAfter` to enforce exponential backoff before spawning
 *   - Writes the retry task JSON to `.tasks/task-<id>.json`
 *   - Appends the retry task to sprint.tasks (in-memory mutation)
 *   - Emits a FIX_REQUEST event to the event stream so the Auditor can observe
 *
 * @returns The retry task id, or undefined if the task is ineligible for retry
 */
function _enqueueTransientRetry(
  projectRoot: string,
  sprint: Sprint,
  failedTaskId: string,
): string | undefined {
  const failedTask = sprint.tasks.find(t => t.id === failedTaskId);
  if (!failedTask) {
    debugLog('_enqueueTransientRetry', `task ${failedTaskId} not found in sprint.tasks — skip`);
    return undefined;
  }

  const retryCount = getRetryCount(failedTask as RetryableTask);
  if (retryCount >= MAX_RETRY_COUNT) {
    debugLog('_enqueueTransientRetry', `task ${failedTaskId} retryCount=${retryCount} >= MAX=${MAX_RETRY_COUNT} — no more retries`);
    return undefined;
  }

  const backoffMs = getTransientRetryDelayMs(retryCount);
  const retryTask = createRetryTask(failedTask as RetryableTask, retryCount) as RetryableTask;

  if (backoffMs > 0) {
    retryTask.retryAfter = Date.now() + backoffMs;
  }

  // Persist retry task to disk
  try {
    writeFileSync(
      join(projectRoot, TASKS_DIR, `task-${retryTask.id}.json`),
      JSON.stringify(retryTask, null, 2),
      'utf-8',
    );
  } catch (e) {
    debugLog('_enqueueTransientRetry:writeTaskFile', e);
  }

  // Append to sprint.tasks so downstream spawn picks it up
  sprint.tasks.push(retryTask as unknown as Task);

  // Emit observability event
  const sprintId = getCurrentSprintId(projectRoot) ?? sprint.id;
  try {
    writeEvent(
      projectRoot, sprintId, 'brain', 'worker',
      CHANNELS.FIX_REQUEST,
      {
        taskId: retryTask.id,
        originalTaskId: failedTaskId,
        retryCount: retryTask.retryCount,
        backoffMs,
        retryAfter: retryTask.retryAfter,
        reason: `Transient retry ${retryTask.retryCount}/${MAX_RETRY_COUNT} for ${failedTaskId} — RUNTIME/AMBIGUOUS failure`,
      },
    );
  } catch (e) {
    debugLog('_enqueueTransientRetry:writeEvent', e);
  }

  debugLog(
    '_enqueueTransientRetry',
    `Queued retry task ${retryTask.id} (backoff ${backoffMs}ms, retryAfter=${retryTask.retryAfter})`,
  );

  return retryTask.id;
}

/**
 * Apply unblocking to a sprint after a previously failed task is resolved.
 *
 * When a fix worker resolves a failed task (status → DONE), PAUSED dependents
 * whose all dependencies are now satisfied are re-enabled (PAUSED → PENDING).
 * Each UNBLOCKED transition is written to the event stream.
 *
 * @param projectRoot - Project root for event stream writes
 * @param sprint - Sprint with tasks to potentially unblock
 * @param resolvedTaskId - Task that was just resolved (DONE)
 * @returns List of task IDs that were unblocked (PAUSED → PENDING)
 */
export function applyUnblockToSprint(
  projectRoot: string,
  sprint: Sprint,
  resolvedTaskId: string,
): string[] {
  const graph = buildDependencyGraph(sprint.tasks, /* includeCollisions */ false);
  const doneTasks = new Set(
    sprint.tasks.filter(t => t.status === TaskStatus.DONE).map(t => t.id),
  );
  const sprintId = getCurrentSprintId(projectRoot) ?? sprint.id;

  const unblockResult = unblockDependents(graph, resolvedTaskId, sprint.tasks, doneTasks, (event) => {
    // ─── DEPENDENCY_UNBLOCKED: separate channel from BLOCKED ──────
    // ADR-037: Brain broadcasts unblock events so workers can resume
    // and Auditor can track the full BLOCKED→UNBLOCKED lifecycle.
    writeEvent(
      projectRoot, sprintId, 'brain', 'worker',
      'BRAIN→WORKER:DEPENDENCY_UNBLOCKED',
      {
        transition: event.transition,
        taskId: event.taskId,
        triggerTaskId: event.triggerTaskId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        unblockedBy: resolvedTaskId,
      },
    );
  });

  debugLog(
    'applyUnblockToSprint',
    `Unblocked ${unblockResult.totalUnblocked} tasks after ${resolvedTaskId} resolved`,
  );

  return unblockResult.unblockedTaskIds;
}

// ─── Fix-Task Routing-Field Inheritance (Sprint 361 Task 361-005, born-476) ──

/** Execution-identity fields a fix-task must inherit from its original when left unset. */
type FixExecutionField = 'forceModel' | 'provider' | 'backend' | 'modelEffort' | 'type';
const FIX_EXECUTION_FIELDS: readonly FixExecutionField[] = [
  'forceModel',
  'provider',
  'backend',
  'modelEffort',
  'type',
];

/**
 * Ensure a fix-task inherits its original task's `forceModel` / `provider` /
 * `backend` / `modelEffort` pins whenever the fix-task producer left them
 * unset (born-476: a NO_GO fix-task object built by debt-manager.ts /
 * sprint-planner.ts carries `model`/`forceModel` forward but never copies
 * `provider`/`backend`/`modelEffort` — so a gpt-5/codex/subprocess original's
 * fix silently fell back to registry model-inference and respawned on
 * claude/opus). This runs at the SPAWN boundary — the one place every
 * fix-task, regardless of which producer created it, must pass through —
 * so the inheritance guarantee holds independent of the producer.
 *
 * Only fields the fix-task left `undefined` are inherited; a field the
 * fix-task already set to something DIFFERENT from the original (a conscious
 * override — e.g. fresh-eyes model rotation already applied, or a
 * provider-fallback decision) is left untouched but still reported, so no
 * change here is ever silent.
 *
 * No-op for non-fix tasks or when the original task file cannot be read.
 * Mutates `task` in place (the caller resolves provider/backend/reasoning
 * effort from this same object afterward) and best-effort persists the
 * reconciled task back to disk. All I/O is try/catch wrapped — a failure
 * here must never block worker spawn.
 *
 * @param projectRoot - Project root for task file + event stream reads/writes
 * @param sprintFallbackId - Sprint ID fallback when getCurrentSprintId returns null
 * @param task - Task about to be spawned (only isPriorityFix tasks are touched)
 */
export function preserveFixTaskRoutingFields(
  projectRoot: string,
  sprintFallbackId: string,
  task: Task,
): void {
  if (!task.isPriorityFix || !task.fixForTaskId) return;
  try {
    const originalPath = join(projectRoot, TASKS_DIR, `task-${task.fixForTaskId}.json`);
    const raw = readFileSafely(originalPath);
    if (!raw) return;
    const original = JSON.parse(raw) as Task;
    const taskRecord = task as unknown as Record<FixExecutionField, unknown>;
    const originalRecord = original as unknown as Record<FixExecutionField, unknown>;

    const inherited: Partial<Record<FixExecutionField, unknown>> = {};
    const overridden: Partial<Record<FixExecutionField, { from: unknown; to: unknown }>> = {};

    for (const field of FIX_EXECUTION_FIELDS) {
      const originalValue = originalRecord[field];
      if (originalValue === undefined) continue; // nothing pinned on the original to inherit
      const fixValue = taskRecord[field];
      if (fixValue === undefined) {
        // Silent-drop protection: the producer never carried this field
        // forward — inherit it now so spawn resolution below sees the pin.
        taskRecord[field] = originalValue;
        inherited[field] = originalValue;
      } else if (fixValue !== originalValue) {
        // Already a conscious, explicit value on the fix-task — never
        // silently overwritten, but always surfaced below.
        overridden[field] = { from: originalValue, to: fixValue };
      }
    }

    const inheritedKeys = Object.keys(inherited);
    const overriddenKeys = Object.keys(overridden);
    if (inheritedKeys.length === 0 && overriddenKeys.length === 0) return;

    debugLog(
      'preserveFixTaskRoutingFields',
      `task ${task.id} (fixFor=${task.fixForTaskId}): inherited=${JSON.stringify(inherited)} ` +
      `overridden=${JSON.stringify(overridden)}`,
    );

    const sprintId = getCurrentSprintId(projectRoot) ?? sprintFallbackId;
    writeEvent(
      projectRoot, sprintId, 'brain', '*',
      CHANNELS.METRIC_EMITTED,
      {
        name: 'fix.routing.preserved',
        value: 1,
        taskId: task.id,
        fixForTaskId: task.fixForTaskId,
        inherited,
        overridden,
      },
    );
    metric('fix.routing.preserved', 1, {
      task_id: task.id,
      fields_inherited: String(inheritedKeys.length),
      fields_overridden: String(overriddenKeys.length),
    });

    if (inheritedKeys.length > 0) {
      try {
        writeFileSync(
          join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
          JSON.stringify(task, null, 2),
          'utf-8',
        );
      } catch (e) {
        debugLog('preserveFixTaskRoutingFields:persist', e);
      }
    }
  } catch (e) {
    debugLog('preserveFixTaskRoutingFields', e);
  }
}

// ─── Fresh-Eyes Rotation Emit (Sprint 156 Task 012) ─────────────────────────

/**
 * Read a fix task's persisted `rotationStrategy` from the task JSON file and
 * emit a METRIC_EMITTED event if present.
 *
 * The strategy is written by `applyFreshEyesRotation` in debt-manager.ts when
 * a NO_GO fix task is created. This helper provides spawn-time observability
 * so dashboards can see *when* rotation actually took effect.
 *
 * Failure of the rotation emit must never break worker spawn — all I/O is
 * try/catch wrapped and logged via debugLog.
 *
 * @param projectRoot - Project root for event stream + task file location
 * @param sprintFallbackId - Sprint ID fallback when getCurrentSprintId returns null
 * @param task - Task being spawned (only fix tasks emit; others are no-ops)
 */
export function emitRotationMetricIfApplicable(
  projectRoot: string,
  sprintFallbackId: string,
  task: Task,
): void {
  if (!task.isPriorityFix) return;
  try {
    const taskFilePath = join(projectRoot, TASKS_DIR, `task-${task.id}.json`);
    const raw = readFileSafely(taskFilePath);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const strategy = parsed['rotationStrategy'] as FreshEyesRotationStrategy | undefined;
    if (!strategy || !strategy.enabled) return;

    const sprintId = getCurrentSprintId(projectRoot) ?? sprintFallbackId;
    writeEvent(
      projectRoot, sprintId, 'brain', '*',
      CHANNELS.METRIC_EMITTED,
      {
        name: 'fix.rotation.applied',
        value: 1,
        taskId: task.id,
        originalModel: strategy.originalModel,
        rotatedModel: strategy.rotatedModel,
        originalAgent: strategy.originalAgent,
        rotatedAgent: strategy.rotatedAgent,
        addedSkills: strategy.addedSkills,
      },
    );
    metric('fix.rotation.applied', 1, {
      task_id: task.id,
      from_model: strategy.originalModel,
      to_model: strategy.rotatedModel,
      from_agent: strategy.originalAgent,
      to_agent: strategy.rotatedAgent,
    });
  } catch (e) {
    debugLog('emitRotationMetricIfApplicable', e);
  }
}

/** Read a file's contents synchronously, returning null on any I/O error. */
function readFileSafely(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch { return null; }
}

// ─── Re-exports for external consumers ────────────────────────────
export { detectScopeCollisions, buildCollisionAwareWaves } from './conflict-resolver.js';
export type { CollisionResult, CollisionMap } from './conflict-resolver.js';
export type { FailureContext, CascadeDecision, FailureClassification, FailureCategory } from './result-evaluator.js';

// ─── Fresh-Eyes Rotation re-exports (Sprint 156 Task 012) ────────
export {
  applyFreshEyesRotation,
  rotateModelForFix,
  rotateAgentForFix,
} from './debt-manager.js';
export type { FreshEyesRotationStrategy } from './debt-manager.js';

// ─── Dependency Scheduler re-exports (Sprint 139 Task 028 + 029) ──
export {
  buildDependencyGraph,
  enforceWaveDependency,
  cascadeBlockDependents,
  unblockDependents,
  applyFailureCascade,
} from './dependency-scheduler.js';
export type {
  DependencyGraph,
  DependencyWave,
  EnforcementResult,
  CascadeResult,
  UnblockResult,
  CascadeBlockOptions,
  ApplyFailureCascadeResult,
  CascadeTransitionEvent,
  CascadeEventCallback,
} from './dependency-scheduler.js';


// ═══ KN3 — task projection parity (GR-2026-08-08-DOGFOOD-KN3-01) ════════════

export class TaskProjectionParityError extends BrainError {
  constructor(sprintId: string, missingOnDisk: string[], strayOnDisk: string[]) {
    const parts: string[] = [
      `Task projection diverged for ${sprintId}: the in-memory plan and the on-disk .tasks/ files do not agree.`,
    ];
    if (missingOnDisk.length > 0) parts.push(`planned but MISSING on disk: [${missingOnDisk.join(', ')}]`);
    if (strayOnDisk.length > 0) parts.push(`on disk but NOT in this plan: [${strayOnDisk.join(', ')}]`);
    parts.push(
      'Remedy: re-plan through deckent (`deckent plan` → approval) so the projection is rewritten atomically. '
      + 'Do NOT hand-delete task files.',
    );
    super(parts.join(' '), SprintPhase.SPAWN);
    this.name = 'TaskProjectionParityError';
  }
}

/**
 * Compare the planned task-id set against the on-disk task files. Both
 * directions are integrity failures: a planned id with no file means workers
 * have nothing to claim (the vacuous-spawn hollow sprint); a file sharing a
 * planned id's sprint-segment but absent from the plan means an abandoned
 * projection would leak into this run. The sprint segment is derived from the
 * PLANNED ids themselves (the leading `NNN-` segment), never from the sprint
 * id string — sprint ids are free-form. Cross-sprint files are ignored (same
 * rule as the planner's orphan cleanup).
 */
export function assertTaskProjectionParity(projectRoot: string, sprint: Sprint): void {
  const tasksPath = join(projectRoot, TASKS_DIR);
  const plannedIds = new Set(sprint.tasks.map((t) => t.id));
  if (plannedIds.size === 0) return; // nothing planned — nothing to compare

  const missingOnDisk = [...plannedIds]
    .filter((id) => !existsSync(join(tasksPath, `task-${id}.json`)))
    .sort();

  // Stray scan: only files whose leading segment matches a PLANNED id's
  // leading segment (this sprint's namespace) participate.
  const segments = new Set([...plannedIds].map((id) => id.split('-')[0]));
  let strayOnDisk: string[] = [];
  if (existsSync(tasksPath)) {
    strayOnDisk = readdirSync(tasksPath)
      .filter((f) => f.startsWith('task-') && f.endsWith('.json'))
      .map((f) => f.slice('task-'.length, -'.json'.length))
      .filter((id) => segments.has(id.split('-')[0]!) && !plannedIds.has(id))
      .sort();
  }

  if (missingOnDisk.length > 0 || strayOnDisk.length > 0) {
    throw new TaskProjectionParityError(sprint.id, missingOnDisk, strayOnDisk);
  }
}
