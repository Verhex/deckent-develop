// ═══ Task Mode Runner ════════════════════════════════════════════════
// Sprint 149 — Task 149-003
//
// Centralized one-shot task execution for `deckent_style === 'task'`.
// Bypasses the full sprint lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→COMPLETE)
// and runs a single task directly via the spawn backend.
//
// Used by:
//   - `deckent run "description"` CLI command (task mode)
//   - `deckent_run` MCP tool (task mode)
//   - Any future task-mode entrypoint

import { join } from 'node:path';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import type { ModelType, Task, TaskResult } from '../core/types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import type { ExecutionBudget } from '../core/work-model.js';
import type { AttendedExecutionApprovalAuthority } from '../core/attended-execution-approval.js';
import { createAttendedExecutionProposalMaterialFromTask } from '../core/attended-execution-proposal.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import {
  preflightProviderExecutionIngress,
  ProviderExecutionIngressHoldError,
} from '../core/provider-execution-ingress-authority.js';
import { resolveDefaultModel } from '../core/config.js';
import { applyWorkerExecutionBudgetPolicy } from '../core/execution-plan-digest.js';
import { orderedRoleProviders } from '../core/provider.js';
import { buildExecutionRequest, resolveExecutionModelIdentity, resolveToTask } from './execution-request-builder.js';
import { isModelExecutable } from '../core/model-equivalence.js';
import { DeckentError } from '../core/errors.js';
import { createRunTaskId } from '../cli/commands/run.js';
import { spawnWorkerMultiProvider } from '../cli/commands/spawn.js';
import { buildWorkerPrompt } from './task-builder.js';
import { enrichResultCost, enrichResultTokenUsage, resolveAgentPrompt, resolveSkillPrompts } from './result-collector.js';
import { eventBus } from './event-bus.js';
import { TASKS_DIR } from '../core/constants.js';
import type { UserOverride } from '../core/routing-types.js';
import { debugLog, readJsonSafe } from '../core/utils.js';
import { normalizeTaskResultShape } from '../core/task-result-schema.js';
import type { TaskResultSettlementRefV1 } from '../core/task-result-settlement.js';
import { writeEvent } from './event-stream.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface TaskModeContext {
  /** Human-readable description of what the task should accomplish */
  description: string;
  /** Optional scope constraints */
  scope?: {
    directories?: string[];
    filesWrite?: string[];
  };
  /** Model to use (default: config's canonical default-model, resolved via
   *  {@link resolveDefaultModel} — never a bare alias literal). */
  model?: ModelType;
  /**
   * Provider hint forwarded from the autonomous dispatcher's backlog entry.
   * When set to 'ollama', spawnWorkerMultiProvider calls ensureOllamaModelRegistered
   * before getProviderForModel so dynamic tags (e.g. qwen3.6:27b) resolve correctly.
   */
  provider?: string;
  /** Timeout in milliseconds (default: 300_000 = 5 minutes) */
  timeoutMs?: number;
  /** Auto-approve tool calls */
  autoApprove?: boolean;
  /** Optional request ceiling. Owner config remains authority; this may only narrow it. */
  budget?: ExecutionBudget;
  /** Trusted host composition; absence keeps attended hard-stop execution on HOLD. */
  attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
  /** Process-scoped provider authority; never constructed by the task runner. */
  providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  /** Exact tenant/run identity for an attended approval request. */
  executionTenantId?: string;
  executionRunId?: string;
  /** Project root override */
  projectRoot?: string;
}

export interface TaskModeResult {
  /** Unique task identifier */
  taskId: string;
  /** Backend used for spawning */
  backend: string;
  /** Provider used */
  provider: string;
  /** Effective root used to bind result authority. */
  projectRoot: string;
  /** Exact Docker attempt authority; absent for legacy/non-Docker backends. */
  settlementRef?: TaskResultSettlementRefV1;
}

// ─── Guard ──────────────────────────────────────────────────────────

/**
 * Validate that config is in task mode.
 * Throws if deckent_style !== 'task'.
 */
function assertTaskMode(config: ResolvedConfig): void {
  if (config.deckent_style !== 'task') {
    throw new Error(
      'runTaskMode called but config.deckent_style !== "task". ' +
      'Set deckent_style=task in config or run `deckent mode task`.',
    );
  }
}

// ─── Token-usage enrichment (357-013 / TOK-AUT) ────────────────────────

/**
 * Persist an enriched TaskResult back to disk (atomic temp+rename). Mirrors
 * result-collector.ts's private `persistEnrichedResult` — that helper is not
 * exported, so this is a minimal local equivalent (same on-disk contract:
 * `.tasks/task-{id}.result`). Best-effort: a write failure is logged, never thrown.
 */
function persistTaskModeResult(projectRoot: string, result: TaskResult): void {
  try {
    const path = join(projectRoot, TASKS_DIR, `task-${result.taskId}.result`);
    const tmp = `${path}.enrich-tmp`;
    writeFileSync(tmp, JSON.stringify(result, null, 2), 'utf-8');
    renameSync(tmp, path);
  } catch (err) {
    debugLog('task-mode-runner:persistTaskModeResult', err);
  }
}

/**
 * Enrich a task-mode `.result` file with real tokenUsage + cost data.
 *
 * The sprint lifecycle (result-collector.ts `waitForResults`) fills tokenUsage/cost
 * inline as part of its own result-collection loop. Task-mode has no equivalent
 * loop of its own — `spawnWorkerMultiProvider` is fire-and-forget (the backend
 * launches a detached docker/tmux/subprocess and returns immediately) and
 * `runTaskMode` returns right after spawn — so the worker's honest tokenUsage
 * 0/0/0 stub (Worker Output Contract) was never enriched and stayed 0/0/0 on
 * disk forever. Read-only reuse of result-collector.ts's exported enrichment
 * functions — same resolution order as the sprint path, no behavior change there.
 *
 * No-op (returns `undefined`) when the `.result` file does not exist yet.
 */
export function enrichTaskModeResult(
  projectRoot: string,
  task: Task,
): TaskResult | undefined {
  const resultPath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
  const result = normalizeTaskResultShape(readJsonSafe<TaskResult>(resultPath));
  if (!result) return undefined;
  enrichResultTokenUsage(result, task, projectRoot);
  enrichResultCost(result, task, projectRoot);
  persistTaskModeResult(projectRoot, result);
  return result;
}

/**
 * Poll for the task-mode worker's `.result` file and enrich it the moment it
 * appears. Runs detached from `runTaskMode`'s returned promise (spawn is
 * fire-and-forget, so the `.result` is written well after `runTaskMode` already
 * resolved) — callers must NOT await this from `runTaskMode` itself. Bounded by
 * `timeoutMs` and `.unref()`'d so a task that never finishes (or a test that
 * never produces a `.result`) cannot leak a polling loop past process exit.
 */
async function watchAndEnrichTaskModeResult(
  projectRoot: string,
  task: Task,
  timeoutMs: number,
): Promise<void> {
  // Never let this best-effort background watcher surface an unhandled
  // rejection — callers invoke it fire-and-forget (`void watch...(...)`), so
  // any throw here (e.g. a test harness mocking 'node:fs' without
  // existsSync) would otherwise escape as an unhandled promise rejection.
  try {
    const resultPath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
    const POLL_MS = 500;
    const deadline = Date.now() + timeoutMs;
    while (!existsSync(resultPath)) {
      if (Date.now() >= deadline) return;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, POLL_MS);
        t.unref?.();
      });
    }
    enrichTaskModeResult(projectRoot, task);
  } catch (err) {
    debugLog('task-mode-runner:watchAndEnrichTaskModeResult', err);
  }
}

// ─── Runner ─────────────────────────────────────────────────────────

/**
 * Execute a single task in task mode — bypasses the full sprint lifecycle.
 *
 * Flow:
 * 1. Validate task mode config
 * 2. Build task JSON from description
 * 3. Emit TASK_MODE_START event
 * 4. Spawn worker via multi-provider backend
 * 5. Return task ID + backend info
 */
export async function runTaskMode(
  ctx: TaskModeContext,
  config: ResolvedConfig,
): Promise<TaskModeResult> {
  assertTaskMode(config);

  const projectRoot = ctx.projectRoot ?? process.cwd();
  const scopeDir = ctx.scope?.directories?.[0] ?? '.';

  // 454-003: resolve + validate the model through the canonical registry
  // BEFORE any Task JSON write or spawn — same boundary CLI `deckent run` /
  // MCP `deckent_run` enforce (453-001). An omitted ctx.model resolves from
  // config's canonical default-model resolver (never a literal alias like
  // 'sonnet'); a legacy alias, an unknown ID without a provider, or a
  // provider/model mismatch all throw here (fail-before-disk/spawn).
  const requestedModel = ctx.model ?? resolveDefaultModel(config);
  const identity = resolveExecutionModelIdentity(requestedModel, ctx.provider);
  const model = identity.model;

  // OWNER-MODEL-POLICY-001: refuse an INACTIVE model at the pre-dispatch admission
  // boundary — before any Task JSON write, prompt, routing or provider/backend
  // spawn. Catches both a resolved default and an explicit ctx.model (the
  // resume / replay / autonomous / run / do paths) that names a model the owner
  // has not activated under an explicit-active provider. Typed HOLD; nothing
  // starts. Inert when no owner policy is injected (implicit-active default).
  if (!isModelExecutable(model, identity.provider)) {
    throw new DeckentError(
      'MODEL_INACTIVE',
      `Model '${model}' is not active for provider '${identity.provider}' under the owner `
      + 'model policy (explicit-active); activate it or select an active model before dispatch',
    );
  }

  // Build task — WM-1: unify on the canonical ExecutionRequest contract (sets
  // task.type, resolves provider via config, tags origin='autonomous').
  const taskId = createRunTaskId();
  const execReq = buildExecutionRequest({
    description: ctx.description,
    model,
    provider: identity.provider,
    scope: { directories: [scopeDir] },
    projectRoot,
    config,
    autoApprove: ctx.autoApprove ?? false,
    origin: 'autonomous',
    budget: ctx.budget,
  });
  const task = resolveToTask(execReq, taskId);

  // BUDGET-PRODUCER: every task-mode caller (Goal-v2/process included) binds the
  // same owner-authored worker policy as planner and `deckent run`. A request is
  // evidence only and can narrow, never widen, that authority. HOLD before
  // routing, Task JSON, prompt construction, or provider/backend side effects.
  const [budgetPolicy] = applyWorkerExecutionBudgetPolicy(
    [task],
    config.execution_budget,
    execReq.provider,
  );
  if (budgetPolicy?.state === 'hold') {
    throw new Error(`EXECUTION_BUDGET_HOLD:${budgetPolicy.reasonCode}:${budgetPolicy.profileRef}`);
  }

  if (ctx.providerAuthority) {
    const providerOrder = orderedRoleProviders('worker', config);
    const request = Object.freeze({
      role: 'worker' as const,
      purpose: 'worker-execution' as const,
      runId: ctx.executionRunId ?? task.sprintId ?? taskId,
      taskId,
      provider: identity.provider,
      model,
      configuredBackend: config.spawn_backend ?? 'auto',
      fallbackProviders: Object.freeze(
        [providerOrder.primary, ...providerOrder.fallbacks]
          .filter(candidate => candidate !== identity.provider),
      ),
      unattended: task.budgetPolicy?.admissionMode !== 'attended',
    });
    const providerAuthority = preflightProviderExecutionIngress(
      ctx.providerAuthority,
      request,
    );
    if (providerAuthority.decision === 'hold') {
      let durableEvidenceWritten = false;
      try {
        durableEvidenceWritten = Boolean(writeEvent(
          projectRoot,
          request.runId,
          'brain',
          'auditor',
          'BRAIN→AUDITOR:PROVIDER_AUTHORITY_HOLD',
          {
            ...request,
            reasonCode: providerAuthority.reasonCode,
            authorityEvidenceRefs: providerAuthority.authorityEvidenceRefs,
          },
        ));
      } catch (error) {
        debugLog('task-mode:provider-authority-hold-event', error);
      }
      throw new ProviderExecutionIngressHoldError(
        providerAuthority.reasonCode,
        providerAuthority.authorityEvidenceRefs,
        request,
        durableEvidenceWritten,
      );
    }
  }

  // WM-1b: V2 routing — assign the right agent + skills (fail-safe: any error keeps 'generic')
  try {
    const routingVersion = config.routing_engine ?? 'v3';
    if (routingVersion === 'v3') {

      const overrides: UserOverride[] = [];
      if (task.forceAgent || task.forceSkills || task.excludeSkills || task.excludeAgent) {
        overrides.push({
          source: 'task-directive',
          forceAgent: task.forceAgent,
          forceSkills: task.forceSkills,
          excludeSkills: task.excludeSkills,
          excludeAgents: task.excludeAgent,
          priority: 3,
        });
      }

      // ROUTING-V3 (S3 cut-over): the V2 engine is retired — single-task
      // routing goes through the vector pipeline (structural content, no LLM).
      const { routeSingleTaskV3 } = await import('./routing-plan-adapter.js');
      const v3 = await routeSingleTaskV3(task, projectRoot);
      task.assignedAgent = v3.agentId;
      task.assignedSkills = v3.skillIds;
    }
  } catch (routingErr) {
    debugLog('task-mode:routing', `V2 routing failed, using generic fallback: ${routingErr}`);
  }

  // Gap E: write task JSON so agentic-worker-entry can read its spec (mirrors run.ts:261-263)
  const tasksDir = join(projectRoot, TASKS_DIR);
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task, null, 2), 'utf-8');

  // Resolve agent and skill prompts for domain-expertise parity with sprint tasks.
  // Both resolve to undefined/[] for 'generic' agent or empty skills — backward-safe fallback.
  const agentPrompt = await resolveAgentPrompt(projectRoot, task);
  const skillPrompts = await resolveSkillPrompts(projectRoot, task);
  const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts, projectRoot, config);

  // Emit event for nervous system / observers
  try {
    eventBus.emit('deckent-event', {
      type: 'TASK_MODE_START',
      taskId,
      style: 'task',
      description: ctx.description,
      model,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Never let event emission break task execution
  }

  // Spawn worker — forward provider hint so dynamic ollama tags are pre-registered
  const { backend, provider, settlementRef } = await spawnWorkerMultiProvider(
    taskId,
    model,
    prompt,
    projectRoot,
    {
      autoApprove: ctx.autoApprove ?? false,
      spawnBackend: config.spawn_backend,
      dockerImage: config.docker_image,
      dockerTimeout: config.docker_timeout,
      provider: execReq.provider,
      executionBudget: task.budget,
      executionLandingPolicy: task.budgetPolicy?.landingPolicy,
      executionBudgetProfileRef: task.budgetPolicy?.profileRef,
      executionBudgetPolicyDigest: task.budgetPolicy?.policyDigest,
      executionAdmissionMode: task.budgetPolicy?.admissionMode,
      executionApprovalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
      executionApprovalProposal: task.budgetPolicy?.approvalProposal,
      executionApprovalMaterial: createAttendedExecutionProposalMaterialFromTask(
        task as unknown as Record<string, unknown>,
        prompt,
      ),
      attendedExecutionApprovalAuthority: ctx.attendedExecutionApprovalAuthority,
      executionTenantId: ctx.executionTenantId ?? task.actor?.tenantId,
      executionRunId: ctx.executionRunId ?? task.sprintId ?? taskId,
    },
  );

  // TOK-AUT (357-013): spawn above is fire-and-forget — the worker writes its
  // .result well after this function has already returned. Enrich it in the
  // background (real tokenUsage/cost via result-collector.ts, mirroring the
  // sprint path) so the on-disk .result isn't left at the worker's honest
  // 0/0/0 stub forever. Not awaited — must not delay runTaskMode's return.
  if (!settlementRef) {
    void watchAndEnrichTaskModeResult(projectRoot, task, ctx.timeoutMs ?? 300_000);
  }

  return {
    taskId,
    backend,
    provider,
    projectRoot,
    ...(settlementRef ? { settlementRef } : {}),
  };
}
