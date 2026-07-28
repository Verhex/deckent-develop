// src/orchestra/autonomous/execute-dispatcher.ts
// The real ActionHandler that fills buildAutonomousRuntime's empty handler map.
// kind=task → runTaskMode (single worker); kind=sprint → canonical exact-plan executor.
// Execution primitives are injected for hermetic tests; composition root passes the real fns.
//
// Phase-1b gaps B+F:
//   Gap B: status-writeback — updateStatus('running') before, ('done'/'failed') after.
//          backlogPath + loadBacklog/updateStatus injected so tests don't need disk.
//   Gap F: completion tracking — waitForResult() after launch (CLI's waitForRunResult
//          primitive); result != null && selfAssessment DONE/GO_WITH_TECH_DEBT = success
//          (mirrors run.ts:320). null = timeout = failure.
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';
import type { ResolvedConfig } from '../../core/config-types.js';
import type { ActionHandler } from '../../nervous/executor.js';
import type { CapabilityRegistry } from '../../core/capability-broker.js';
import type { BacklogEntry, BacklogFile } from './backlog-types.js';
import { loadBacklog, updateStatus, cleanupAutonomousArtifacts, purgeCompletedBacklog } from './backlog.js';
import type { TaskResult } from '../../core/types.js';
import type { ExecutionPool } from './execution-pool.js';
import { writeAuditEvent } from '../../core/audit-writer.js';
import { readAuditEvents } from '../../core/audit-query.js';
import { needsJitDetail, generateItemDetail } from './jit-detail.js';
import type { LlmComplete } from './goal-planner-types.js';
import {
  evaluateBacklogResult, auditBacklogResult, crossVerifyBacklogResult, reconcileWithAudit,
  writeBrainAssessmentToResult,
  type BacklogEvaluation, type AuditVerdict, type CrossVerifyVerdict,
} from './backlog-eval.js';
import type { FlowReporter } from './flow-reporter.js';
import { getCurrentSprintId } from '../../core/event-stream.js';
import { runProcess } from '../process-runtime.js';
import { enrichResultTokenUsage } from '../result-collector.js';
import type { Task } from '../../core/task-types.js';
import { evaluatePolicy } from '../../core/policy-engine.js';
import type { PolicyActivationInput, PolicyConditionInput, PolicyRbacInput, PolicyInput } from '../../core/policy-engine.js';
import { resolveRiskClass } from '../../core/work-model.js';
import type { Capability } from '../../core/work-model.js';
import type { TaskResultSettlementRefV1 } from '../../core/task-result-settlement.js';
import { createHash } from 'node:crypto';
import { readContext } from '../sprint-planner.js';
import type {
  CanonicalExactSprintExecutionInput,
  CanonicalExactSprintExecutionOutcome,
  CanonicalExactSprintExecutor,
} from '../exact-plan-start-service.js';
import type { ExactPlanReferenceV1 } from '../../core/run-flow-contract.js';

/** Action id the backlog-trigger sets on every entry-driven trigger. */
export const AUTONOMOUS_EXECUTE_ACTION = 'autonomous.execute';

export type AutonomousProviderAuthorityHold = NonNullable<
  NonNullable<BacklogEntry['lastResult']>['providerAuthorityHold']
>;

export type AutonomousProviderExecutionAdmission =
  | { readonly decision: 'allow' }
  | {
      readonly decision: 'hold';
      readonly hold: AutonomousProviderAuthorityHold;
    };

/**
 * ENT-3: Read the hmac of the last written audit event for a sprint.
 * Used to establish causationId = parent-event-hmac in the result audit event.
 * Best-effort: returns undefined on I/O error or empty stream.
 */
function readLastAuditHmac(projectRoot: string, sprintId: string): string | undefined {
  try {
    const events = readAuditEvents(projectRoot, sprintId);
    return events.length > 0 ? events[events.length - 1]?.hmac : undefined;
  } catch {
    return undefined;
  }
}

/** Grace window for a late `.result` after the primary timeout (false-FAILURE fix):
 *  a real worker can finish seconds past the deadline; we re-poll once before failing. */
const GRACE_RESULT_MS = 30_000;

/** Persist the backlog with the project's durability contract (write-tmp → fsync
 *  → rename), matching every other backlog write in backlog.ts. */
function saveBacklogFile(path: string, bl: BacklogFile): void {
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}

export interface ExecuteDispatcherDeps {
  projectRoot: string;
  config: ResolvedConfig;
  /** Injected runTaskMode (kind=task). Returns TaskModeResult shape including taskId. */
  runTask: (
    ctx: { projectRoot: string; description: string; model?: string; provider?: string; scope?: { directories: string[] } },
    config: ResolvedConfig,
  ) => Promise<{ taskId?: string; settlementRef?: TaskResultSettlementRefV1 } | null | undefined>;
  /** Canonical plan-authoring + exact-start authority (kind=sprint). A fresh
   *  lifecycle function is intentionally not accepted at this boundary. */
  executeSprint: CanonicalExactSprintExecutor['execute'];
  /** Durable backlog path — used for Gap B status writeback. */
  backlogPath: string;
  /**
   * Wait for the task .result file to appear (Gap F completion tracking).
   * Injected for hermetic tests; live wire uses waitForRunResult from run.ts.
   * Returns the parsed TaskResult or null on timeout.
   */
  waitForResult: (
    projectRoot: string,
    taskId: string,
    timeoutMs: number,
    opts?: { settlementRef?: TaskResultSettlementRefV1 },
  ) => Promise<TaskResult | null>;
  /**
   * Max ms to wait for a task result before declaring failure.
   * Defaults to 600_000 (10 min) — ollama models can be slow to load.
   */
  resultTimeoutMs?: number;
  /**
   * Optional host-owned provider authority gate. When wired, every
   * provider-backed kind is admitted before JIT planning or execution. A
   * capability entry is provider-free and deliberately bypasses this gate.
   * Absent keeps the v1 rollout behavior unchanged.
   */
  admitProviderExecution?: (
    entry: BacklogEntry,
  ) => AutonomousProviderExecutionAdmission | Promise<AutonomousProviderExecutionAdmission>;
  /**
   * Optional concurrency pool. When provided, each action is routed through
   * pool.submit() to enforce bounded parallel execution. Absent → direct/serial
   * (backward-safe: all existing callers that pass no pool are unchanged).
   */
  pool?: ExecutionPool;
  /**
   * F8 broker dispatch: registry that fulfils `kind=capability` entries
   * (non-code work — mail/db/http/erp). Absent → capability entries fail with
   * a clear reason (backward-safe; composition root wires the real registry).
   */
  capabilityRegistry?: CapabilityRegistry;
  /** Goal-planner Phase 2: when present, a planned task/sprint with no detail is
   *  detailed JIT (and persisted) before it runs. Absent → planned entries run
   *  with description = title (back-compat). */
  jitComplete?: LlmComplete;
  /**
   * CORE-UNIFORMITY (slice 1): Brain-Eval / Auditor / Cross-Verify hooks. Default to the
   * real mode-independent kernels (backlog-eval.ts); injected as deterministic stubs in
   * hermetic dispatcher tests. A finished task is evaluated by the SAME core sprint mode uses.
   */
  evaluate?: (entry: BacklogEntry, result: TaskResult, projectRoot: string) => BacklogEvaluation | Promise<BacklogEvaluation>;
  audit?: (entry: BacklogEntry, result: TaskResult, projectRoot: string) => Promise<AuditVerdict>;
  crossVerify?: (
    entry: BacklogEntry, result: TaskResult, projectRoot: string,
    config: ResolvedConfig, evaluation: BacklogEvaluation,
  ) => Promise<CrossVerifyVerdict>;
  /** Rich dual-channel flow emitter (human terminal + AI JSONL). Absent → no flow. */
  flow?: FlowReporter;
  /**
   * CORE-UNIFORMITY (slice 2): mode-independent budgeted-decay used by the post-item
   * lifecycle hook. Absent → the hook lazily loads sprint-finalizer's `runBudgetedDecay`
   * (keeps the dispatcher's STATIC import graph free of the heavy finalizer/cli tree).
   * Injected as a stub in hermetic tests so they need no memory.db.
   */
  runBudgetedDecay?: (projectRoot: string, sprintId: string, opts: { memoryBudget?: number; decaySprints?: number }) => void | Promise<void>;
  /**
   * F10-001: policy-engine activation+condition gate (flag-gated default-off).
   * When enabled, each entry is evaluated through evaluatePolicy's activation and
   * condition layers before execution:
   *   - 'park' / 'deny' → entry status set to 'parked', execution aborted.
   *   - 'suggest'       → advisory warning only, execution proceeds.
   *   - 'permit'        → proceed silently.
   * The RBAC layer is NOT checked here (runtime-loop's policyGate already handles it).
   * Absent or enabled=false → no gate (backward-safe, v1-default).
   */
  policyEngine?: {
    enabled: boolean;
    /** Derive the activation layer input from this entry. Return undefined to skip. */
    buildActivationInput?: (entry: BacklogEntry) => PolicyActivationInput | undefined;
    /** Derive the condition-gate input from this entry. Return undefined to skip. */
    buildConditionInput?: (entry: BacklogEntry) => PolicyConditionInput | undefined;
    /** Derive the RBAC layer input from this entry. Return undefined to skip.
     *  When provided, the role authorization check is composed into the policy
     *  verdict (runtime-loop:332 pattern — activation+condition+rbac birlikte). */
    buildRbacInput?: (entry: BacklogEntry) => PolicyRbacInput | undefined;
  };
}

/**
 * CORE-UNIFORMITY (slice 2): mode-independent post-item lifecycle hook.
 *
 * Runs after an autonomous backlog item reaches its terminal status — the per-item
 * analogue of what sprint-finalizer runs at sprint end. Three steps, each independently
 * fail-safe (a thrown step is warned + skipped, never corrupting the item outcome):
 *   1. cleanupAutonomousArtifacts() — delete leaked `task-run-*` / `_*.pid` files
 *   2. purgeCompletedBacklog()      — trim completed entries (keep the most recent runs)
 *   3. runBudgetedDecay()           — decay brain memory when over budget
 *
 * Idempotent: re-running against an already-clean state is a no-op. The decay step
 * defaults to a lazily-imported `runBudgetedDecay` so the dispatcher's static graph
 * stays light; tests inject a stub to stay hermetic.
 */
export async function postItemLifecycle(deps: {
  projectRoot: string;
  backlogPath: string;
  config: ResolvedConfig;
  /** The just-completed item's run id — its task-run-* files (incl. the .result
   *  Brain-assessment writeback) are preserved; only stale prior-run artifacts are swept. */
  keepTaskId?: string;
  runBudgetedDecay?: (projectRoot: string, sprintId: string, opts: { memoryBudget?: number; decaySprints?: number }) => void | Promise<void>;
}): Promise<void> {
  // 1. Artifact cleanup — remove per-run task files and PID bookkeeping that would
  //    otherwise accumulate between autonomous items (keeping this run's own files).
  try {
    cleanupAutonomousArtifacts(deps.projectRoot, undefined, deps.keepTaskId);
  } catch (e) {
    console.warn(`[postItemLifecycle] artifact cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Backlog purge — trim completed (done/failed) entries, keeping the recent ones.
  try {
    purgeCompletedBacklog(deps.backlogPath, loadBacklog(deps.backlogPath));
  } catch (e) {
    console.warn(`[postItemLifecycle] backlog purge failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. Budgeted brain-memory decay — same mode-independent helper the sprint lifecycle
  //    uses. Lazy-import keeps the heavy finalizer/cli tree out of the static graph.
  try {
    const decay = deps.runBudgetedDecay
      ?? (await import('../sprint-finalizer.js')).runBudgetedDecay;
    // Current sprint id drives runDecay's retention-window math. In pure-autonomous
    // mode (no prior sprint) this is null → 'sprint-0' (conservative: no age-based decay).
    const sprintId = getCurrentSprintId(deps.projectRoot) ?? 'sprint-0';
    await decay(deps.projectRoot, sprintId, {
      memoryBudget: deps.config?.memory_budget,
      decaySprints: deps.config?.decay_after_sprints,
    });
  } catch (e) {
    console.warn(`[postItemLifecycle] decay failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function sameExactPlanRef(
  left: ExactPlanReferenceV1 | undefined,
  right: ExactPlanReferenceV1,
): boolean {
  return left?.schemaVersion === right.schemaVersion
    && left.flowId === right.flowId
    && left.revision === right.revision
    && left.planDigest === right.planDigest;
}

/**
 * Persist the facade-produced exact tuple before any autonomous settlement.
 * This is an exact row/source CAS: a concurrent status/source edit refuses the
 * write instead of adopting a plan produced for stale intent.
 */
function persistAutonomousExactPlanRef(
  deps: Pick<ExecuteDispatcherDeps, 'backlogPath'>,
  expected: Readonly<BacklogEntry>,
  exactRef: ExactPlanReferenceV1,
): boolean {
  const backlog = loadBacklog(deps.backlogPath);
  const current = backlog.entries.find(candidate => candidate.id === expected.id);
  if (!current || current.status !== 'running') return false;
  if (current.spec.exactPlanRef) return sameExactPlanRef(current.spec.exactPlanRef, exactRef);
  if (
    current.spec.directivesRef !== expected.spec.directivesRef
    || current.spec.intent !== expected.spec.intent
  ) return false;
  current.spec = { ...current.spec, exactPlanRef: exactRef };
  delete current.spec.directivesRef;
  delete current.spec.intent;
  saveBacklogFile(deps.backlogPath, backlog);
  return true;
}

function exactSprintFlowId(entry: Readonly<BacklogEntry>, tenantId: string): string {
  const digest = createHash('sha256')
    .update(['autonomous', tenantId, entry.id].join('\0'))
    .digest('hex')
    .slice(0, 32);
  return `autonomous-${digest}`;
}

function buildAutonomousExactSprintInput(
  deps: Pick<ExecuteDispatcherDeps, 'projectRoot' | 'config'>,
  entry: Readonly<BacklogEntry>,
): CanonicalExactSprintExecutionInput {
  const tenantId = entry.tenant ?? entry.actor?.tenantId ?? 'local';
  const actor = entry.actor ?? { id: 'autonomous-engine', tenantId };
  const origin = entry.origin ?? 'autonomous';
  const correlationId = entry.correlationId
    ?? `autonomous:${tenantId}:${entry.id}`;
  const lineage = {
    tenantId,
    actor,
    origin,
    correlationId,
    idempotencyKey: `autonomous:${tenantId}:${entry.id}:exact-plan-v1`,
    ...(entry.causationId !== undefined ? { causationId: entry.causationId } : {}),
    sourceId: entry.id,
    authorization: { kind: 'approved-actor' as const },
  };
  const ingress = {
    kind: origin === 'api' ? 'api' as const : origin === 'cli' ? 'cli' as const : 'autonomous' as const,
    id: entry.id,
    ...(entry.spec.intent !== undefined ? { intent: entry.spec.intent } : {}),
    ...(entry.spec.directivesRef !== undefined ? { directives: entry.spec.directivesRef } : {}),
  };
  if (entry.spec.exactPlanRef) {
    return {
      projectRoot: deps.projectRoot,
      config: deps.config,
      source: { kind: 'exact-ref', ref: entry.spec.exactPlanRef, ingress },
      lineage,
      executionMode: 'in-process',
    };
  }
  const unplannedIntent = entry.spec.intent ?? entry.title;
  const context = readContext(deps.projectRoot);
  const activeModeConfig = deps.config.activeModeConfig as { max_workers?: number } | undefined;
  const maxWorkers = typeof activeModeConfig?.max_workers === 'number'
    ? activeModeConfig.max_workers
    : 4;
  const flowId = exactSprintFlowId(entry, tenantId);
  return {
    projectRoot: deps.projectRoot,
    config: deps.config,
    source: {
      kind: 'unplanned',
      proposal: {
        flowId,
        tenant: tenantId,
        project: deps.config.projectName || 'deckent-project',
        actor,
        origin,
        revision: 1,
        intentSummary: unplannedIntent,
      },
      planSource: entry.spec.directivesRef !== undefined
        ? { sourceKind: 'directives', brainContext: context }
        : { sourceKind: 'intent', baseContext: context },
      recommendation: {
        size: 'full',
        maxWorkers,
        modelConstraint: null,
        reason: 'canonical exact-sprint ingress',
      },
      ingress,
    },
    lineage,
    executionMode: 'in-process',
  };
}

function classifyExactSprintOutcome(
  outcome: CanonicalExactSprintExecutionOutcome,
): { ok: boolean; parked: boolean; reason: string } {
  if (outcome.status === 'settled') {
    return {
      ok: outcome.settlement.state === 'COMPLETED',
      parked: outcome.settlement.state === 'BLOCKED',
      reason: outcome.settlement.code,
    };
  }
  if (outcome.status === 'duplicate') {
    const terminalState = outcome.attempt.settlement?.state;
    if (terminalState === 'COMPLETED') {
      return { ok: true, parked: false, reason: 'EXACT_SPRINT_DUPLICATE_COMPLETED' };
    }
    return {
      ok: false,
      parked: true,
      reason: terminalState
        ? `EXACT_SPRINT_DUPLICATE_${terminalState}`
        : 'EXACT_SPRINT_DUPLICATE_RECONCILIATION_REQUIRED',
    };
  }
  if (outcome.status === 'awaiting-approval' || outcome.status === 'held') {
    return { ok: false, parked: true, reason: outcome.reasonCode };
  }
  if (outcome.status === 'accepted') {
    return { ok: false, parked: true, reason: 'EXACT_SPRINT_DETACHED_ACCEPTED_RECONCILIATION_REQUIRED' };
  }
  return { ok: false, parked: false, reason: outcome.reasonCode };
}

/**
 * Derive the capability set of a BacklogEntry for risk classification.
 * Mirrors runtime-loop.ts `deriveEntryCapabilities`; duplicated here to avoid
 * a circular import (runtime-loop → execute-dispatcher → runtime-loop).
 * Pure; no I/O.
 */
function deriveCapabilitiesForRisk(entry: BacklogEntry): Capability[] {
  if (entry.kind !== 'capability') return ['fs-write'];
  const verb = (entry.spec.capabilityTarget?.capability ?? '').toLowerCase();
  const isWrite = /\.(write|create|update|delete|drop|exec|send|capture)\b/.test(verb);
  if (verb.startsWith('db.')) return isWrite ? ['db-write'] : ['db-query'];
  if (verb.startsWith('erp.')) return isWrite ? ['erp-write'] : ['erp-read'];
  if (verb.startsWith('fs.')) return isWrite ? ['fs-write'] : ['fs-read'];
  if (verb.startsWith('shell')) return ['shell'];
  if (verb.startsWith('mail.') || verb.startsWith('http.') || verb.startsWith('network')) return ['network'];
  return ['fs-read'];
}

export function makeExecuteDispatcher(deps: ExecuteDispatcherDeps): ActionHandler {
  const timeoutMs = deps.resultTimeoutMs ?? 600_000;

  return async (_actionId, payload) => {
    const entry = payload?.entry as BacklogEntry | undefined;
    if (!entry || typeof entry !== 'object') {
      return { outcome: 'failure', error: 'execute-dispatcher: no backlog entry in payload' };
    }

    // The full execution body is extracted into a job function so it can be submitted
    // to an optional bounded pool (deps.pool). When no pool is provided the job runs
    // directly — identical to the prior serial behavior (backward-safe).
    const job = async (): Promise<{ outcome: 'success' | 'failure'; error?: string }> => {
      // Gap B — mark running before any work begins (re-load so concurrent changes are seen)
      const bl0: BacklogFile = loadBacklog(deps.backlogPath);
      updateStatus(deps.backlogPath, bl0, entry.id, 'running', null);

      // Provider authority must precede JIT: the detailer is itself a remote
      // Brain invocation and may spend tokens before the eventual worker gate.
      // Capability entries are fulfilled by the provider-free capability
      // broker, so they remain reachable even while provider execution is held.
      if (entry.kind !== 'capability' && deps.admitProviderExecution) {
        try {
          const admission = await deps.admitProviderExecution(entry);
          if (admission.decision === 'hold') {
            const reason = `provider-authority: ${admission.hold.reasonCode}`;
            const blHold = loadBacklog(deps.backlogPath);
            updateStatus(deps.backlogPath, blHold, entry.id, 'parked', {
              ok: false,
              reason,
              providerAuthorityHold: admission.hold,
            });
            deps.flow?.step('parked', entry.id, reason);
            return { outcome: 'failure', error: reason };
          }
        } catch (err: unknown) {
          const reason = `provider-authority-admission-error: ${
            err instanceof Error ? err.message : String(err)
          }`;
          const blErr = loadBacklog(deps.backlogPath);
          updateStatus(deps.backlogPath, blErr, entry.id, 'failed', {
            ok: false,
            reason,
          });
          deps.flow?.step('failed', entry.id, reason);
          return { outcome: 'failure', error: reason };
        }
      }

      // Phase 2: detail a planned task/sprint just-in-time, then persist so the
      // worker prompt + audit see the full description (and a re-dispatch is stable).
      let live = entry;
      if (deps.jitComplete && needsJitDetail(entry)) {
        try {
          live = await generateItemDetail(entry, deps.jitComplete);
          const blJit = loadBacklog(deps.backlogPath);
          const idx = blJit.entries.findIndex((e) => e.id === entry.id);
          if (idx >= 0) {
            blJit.entries[idx] = { ...blJit.entries[idx]!, spec: live.spec };
            saveBacklogFile(deps.backlogPath, blJit);
            deps.flow?.step('jit_detail', entry.id, `detail generated (${(live.spec.description ?? '').length} chars)`);
          }
        } catch { /* JIT failure → fall back to the title-only description below */ }
      }

      // F10-001/002: policy-engine activation+condition+rbac gate + risk-gate (flag-gated default-off).
      // Runs after JIT detail (so the final description is available to builders) and
      // before kind-dispatch so a parked/denied entry never starts execution.
      if (deps.policyEngine?.enabled) {
        const policyInput: PolicyInput = {};
        const activInput = deps.policyEngine.buildActivationInput?.(live);
        if (activInput) policyInput.activation = activInput;
        const condInput = deps.policyEngine.buildConditionInput?.(live);
        if (condInput) policyInput.condition = condInput;
        // rbac layer for policyInput (runtime-loop:332 pattern — activation+condition+rbac birlikte)
        const rbacInput = deps.policyEngine.buildRbacInput?.(live);
        if (rbacInput) policyInput.rbac = rbacInput;
        // Always evaluate — empty input yields 'permit' (pure, no side effects).
        const verdict = evaluatePolicy(policyInput);
        if (verdict.decision === 'park' || verdict.decision === 'deny') {
          const parkReason = `policy-engine: ${verdict.decision} — ${verdict.reasons.join('; ')}`;
          const blPark = loadBacklog(deps.backlogPath);
          updateStatus(deps.backlogPath, blPark, entry.id, 'parked', { ok: false, reason: parkReason });
          deps.flow?.step('parked', entry.id, parkReason);
          return { outcome: 'failure', error: parkReason };
        }
        if (verdict.decision === 'suggest') {
          // Advisory: proceed with low-activation warning (non-blocking by design).
          console.warn(`[execute-dispatcher] policy-engine suggest for entry '${entry.id}': ${verdict.reasons.join('; ')}`);
        }
        // F10-002: risk-gate — permit + HIGH-risk verb + risk_gate_enabled → park (execute etme).
        // Fires only when all other layers pass ('permit'); catches high-risk capability verbs
        // (shell / db-write / erp-write) before they reach the worker spawn path.
        if (verdict.decision === 'permit' && deps.config.risk_gate_enabled) {
          const riskClass = resolveRiskClass({
            requirements: { capabilities: deriveCapabilitiesForRisk(live), resources: [] },
            capabilityTarget: live.spec.capabilityTarget,
          });
          if (riskClass === 'high') {
            const parkReason = `risk-gate: HIGH-risk entry parked (risk_gate_enabled=true, class=${riskClass}) — ${verdict.reasons.join('; ')}`;
            const blPark = loadBacklog(deps.backlogPath);
            updateStatus(deps.backlogPath, blPark, entry.id, 'parked', { ok: false, reason: parkReason });
            deps.flow?.step('parked', entry.id, parkReason);
            return { outcome: 'failure', error: parkReason };
          }
        }
      }

      // CORE-UNIFORMITY (slice 2): the just-completed item's own run id. The post-item
      // cleanup keeps this run's task-run-* files (its .result carries the Brain-assessment
      // writeback / traceability) and sweeps only stale artifacts from prior runs.
      let runTaskId: string | undefined;

      try {
        let ok = false;
        let reason = '';
        // Rich Brain+Auditor+CrossVerify verdict (task branch only). null → fall back to
        // the plain { ok, reason } for sprint/capability/process branches.
        let richResult: BacklogEntry['lastResult'] = null;

        if (entry.kind === 'sprint') {
          const outcome = await deps.executeSprint(
            buildAutonomousExactSprintInput(deps, live),
          );
          if (
            outcome.exactRef
            && !persistAutonomousExactPlanRef(deps, live, outcome.exactRef)
          ) {
            ok = false;
            reason = 'EXACT_SPRINT_REFERENCE_PERSISTENCE_CONFLICT';
          } else {
            const classified = classifyExactSprintOutcome(outcome);
            ok = classified.ok;
            reason = classified.reason;
            if (classified.parked) {
              const blPark = loadBacklog(deps.backlogPath);
              updateStatus(deps.backlogPath, blPark, entry.id, 'parked', {
                ok: false,
                reason,
              });
              deps.flow?.step('parked', entry.id, reason);
              return { outcome: 'failure', error: reason };
            }
          }
        } else if (entry.kind === 'capability') {
          // F8 broker dispatch: non-code work resolved through the capability
          // registry. The broker never throws — every path is a CapabilityResult.
          const target = entry.spec.capabilityTarget;
          if (!target) {
            ok = false;
            reason = 'capability entry has no spec.capabilityTarget';
          } else if (!deps.capabilityRegistry) {
            ok = false;
            reason = 'no capability registry wired into the dispatcher';
          } else {
            const result = await deps.capabilityRegistry.invoke(target, {
              projectRoot: deps.projectRoot,
              // Audit lineage: prefer the entry's real principal (OIDC sub) so the
              // audit hash-chain records WHO submitted; fall back to a tenant-scoped
              // 'system' actor (then bare 'system') for actor-less entries.
              actor: entry.actor ?? (entry.tenant ? { id: 'system', tenantId: entry.tenant } : { id: 'system' }),
              // ENT-3: propagate causal-lineage correlationId through the capability invocation
              // context so the audit bridge and handlers can carry it into downstream events.
              correlationId: entry.correlationId,
            });
            ok = result.ok;
            reason = result.ok
              ? `capability ${result.capability} fulfilled by handler '${result.handler}'`
              : `${result.code}: ${result.error}`;
          }
        } else if (entry.kind === 'process') {
          // F3-008 (mode-transition 3/3): a process is an ordered list of steps run
          // STRICTLY SEQUENTIALLY through the SAME runTask/capability primitives. The
          // runtime reports in the standard TaskResult envelope; an absent/invalid
          // definition is an honest NO_GO (never a silent success). The plain
          // { ok, reason } lastResult mirrors the capability/sprint branches — a
          // process composes already-evaluated sub-steps, so it is not re-run through
          // the per-worker Brain-Eval.
          const procResult = await runProcess(live, {
            projectRoot: deps.projectRoot,
            config: deps.config,
            runTask: deps.runTask,
            waitForResult: deps.waitForResult,
            resultTimeoutMs: timeoutMs,
            ...(deps.capabilityRegistry ? { capabilityRegistry: deps.capabilityRegistry } : {}),
            ...(deps.flow ? { flow: deps.flow } : {}),
          });
          ok = procResult.selfAssessment !== 'NO_GO';
          reason = procResult.notes || `process ${procResult.selfAssessment}`;
        } else {
          // Task: launch worker, then wait for real completion (Gap F).
          //
          // The dispatcher forwards the entry's full provider/model intent. The real
          // runTaskMode adapter maps these to the worker spawn; per-task provider routing
          // for single-task mode follows the same path sprint mode already uses via the
          // worker backend. Forwarding here preserves intent rather than silently dropping it.
          const r = await deps.runTask(
            {
              projectRoot: deps.projectRoot,
              description: live.spec.description ?? live.title,
              model: entry.model,
              provider: entry.provider,
              scope: { directories: [entry.spec.scopeDir ?? '.'] },
            },
            deps.config,
          );

          const taskId = r?.taskId;
          if (taskId) {
            runTaskId = taskId; // keep this run's artifacts during post-item cleanup
            deps.flow?.step('spawned', entry.id, `taskId=${taskId}`);

            // ENT-3: write a spawn audit event so downstream result events can reference
            // this event's hmac as their causationId (causal-lineage chain A→B).
            const entryCorrelationId = entry.correlationId;
            const auditSprintId = getCurrentSprintId(deps.projectRoot) ?? 'autonomous';
            writeAuditEvent(deps.projectRoot, auditSprintId, {
              tenantId: entry.tenant ?? entry.actor?.tenantId ?? 'local',
              actor: entry.actor?.id ?? 'system',
              action: 'task.spawned',
              target: taskId,
              correlationId: entryCorrelationId,
              metadata: { entryId: entry.id, kind: entry.kind },
            });
            // Read back the just-written spawn event's hmac — used as causationId for the
            // result event so buildCausalChain can reconstruct the spawn→result chain.
            const spawnEventHmac = readLastAuditHmac(deps.projectRoot, auditSprintId);
            // Gap F: wait for real done/failed (not just launched)
            const resultAuthority = r.settlementRef
              ? { settlementRef: r.settlementRef }
              : undefined;
            let result = resultAuthority
              ? await deps.waitForResult(deps.projectRoot, taskId, timeoutMs, resultAuthority)
              : await deps.waitForResult(deps.projectRoot, taskId, timeoutMs);
            if (!result) {
              // false-FAILURE fix: a real worker can write its .result seconds after the
              // window closes — observed 9s past a 600s timeout (2026-06-17 dogfood).
              // Grace re-poll once before failing (disk-verify outranks the timeout).
              result = resultAuthority
                ? await deps.waitForResult(deps.projectRoot, taskId, GRACE_RESULT_MS, resultAuthority)
                : await deps.waitForResult(deps.projectRoot, taskId, GRACE_RESULT_MS);
            }

            if (result) {
              // TOK-AUT: mirror the sprint path (result-collector.ts:632) — fill tokenUsage
              // from measured CLI log tokens when available; honest-zero when not (WP-4).
              // Best-effort: token enrichment must NEVER fail the task — a throw here was
              // caught by the dispatch try/catch and flipped a completed task to 'failed'
              // (Sprint 290 regression, found via process-controller.test.ts reversible-scope).
              try {
                const taskStub: Task | undefined = (entry.model || entry.provider)
                  ? { id: result.taskId ?? entry.id, provider: entry.provider, model: entry.model as Task['model'] } as unknown as Task
                  : undefined;
                enrichResultTokenUsage(result, taskStub, deps.projectRoot);
              } catch (e) {
                console.warn(`[execute-dispatcher] token enrichment failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
              }
              // CORE-UNIFORMITY: a finished autonomous task passes through the SAME
              // Brain-Eval + Auditor + Cross-Verify sprint mode applies (mode-independent
              // kernels). The Auditor + cross-verify verdicts are ADVISORY (never flip the
              // Brain decision, per ADR-037 V1.0); the rich verdict is persisted + flow-reported.
              const evaluate = deps.evaluate ?? evaluateBacklogResult;
              const audit = deps.audit ?? auditBacklogResult;
              const crossVerify = deps.crossVerify ?? crossVerifyBacklogResult;

              const evaluation = await evaluate(live, result, deps.projectRoot);
              deps.flow?.step('brain_verdict', entry.id,
                `${evaluation.decision} q=${evaluation.quality}${evaluation.reconciled ? ' (reconciled)' : ''}`);

              const verdict = await audit(live, result, deps.projectRoot);
              const boundaryNote = verdict.boundary === 'clean' ? 'clean' : `${verdict.boundary.length} violation(s)`;
              const adrNote = verdict.adr === 'ok' ? 'ok' : `${verdict.adr.length} issue(s)`;
              deps.flow?.step('audit_verdict', entry.id, `boundary ${boundaryNote} · ADR ${adrNote} · fn ${verdict.functional}`);

              const xv = await crossVerify(live, result, deps.projectRoot, deps.config, evaluation);
              deps.flow?.step('cross_verify', entry.id, xv.ran ? `verdict=${xv.verdict}` : 'skipped (no 2nd provider / disabled)');

              // Brain⇄Auditor reconciliation: the Auditor's independent functional-pass on
              // real, in-scope work overrides a Brain NO_GO that is a schema/coverage
              // technicality (live false-NO_GO fix — "Brain understands the work via the Auditor").
              const finalEval = reconcileWithAudit(evaluation, verdict, result);

              ok = finalEval.decision !== 'NO_GO';
              reason = finalEval.reason || `decision=${finalEval.decision}`;
              richResult = {
                ok,
                reason,
                decision: finalEval.decision,
                reconciled: finalEval.reconciled,
                quality: finalEval.quality,
                audit: {
                  boundary: verdict.boundary === 'clean' ? 'clean' : verdict.boundary.map((v) => v.detail),
                  adr: verdict.adr === 'ok' ? 'ok' : verdict.adr.map((v) => `${v.adrId}: ${v.violation}`),
                  functional: verdict.functional,
                },
                crossVerify: { ran: xv.ran, ...(xv.verdict ? { verdict: xv.verdict } : {}) },
              };
              // Brain-assessment writeback: attach the orchestrator's verdict to the worker
              // .result alongside the worker's selfAssessment (traceability + AI-operator data).
              writeBrainAssessmentToResult(deps.projectRoot, result.taskId, richResult);

              // ENT-3: write a result audit event with causationId = spawn event's hmac so
              // buildCausalChain can reconstruct the spawn→result causal link (A→B pattern).
              writeAuditEvent(deps.projectRoot, auditSprintId, {
                tenantId: entry.tenant ?? entry.actor?.tenantId ?? 'local',
                actor: entry.actor?.id ?? 'system',
                action: ok ? 'task.succeeded' : 'task.failed',
                target: taskId,
                correlationId: entryCorrelationId,
                causationId: spawnEventHmac,
                metadata: { entryId: entry.id, decision: finalEval.decision, quality: finalEval.quality },
              });
            } else {
              ok = false;
              reason = 'timeout — no result within limit (incl. grace re-poll)';
            }
          } else {
            // runTask returned no taskId — cannot track completion; treat as failure
            // to avoid false-done (the "wiring-% vs user-working" trap).
            ok = false;
            reason = 'runTask returned no taskId — completion not trackable';
          }
        }

        // Gap B — final writeback (re-load to avoid clobbering concurrent changes).
        // Task branch carries the rich Brain+Auditor+CrossVerify verdict; other kinds
        // keep the plain { ok, reason } (sprint already evaluates + cross-verifies).
        const blFinal: BacklogFile = loadBacklog(deps.backlogPath);
        updateStatus(deps.backlogPath, blFinal, entry.id, ok ? 'done' : 'failed', richResult ?? { ok, reason });
        deps.flow?.step(ok ? 'done' : 'failed', entry.id, reason);

        // CORE-UNIFORMITY (slice 2): mode-independent post-item lifecycle hygiene
        // (artifact cleanup + backlog purge + budgeted decay). Fully fail-safe —
        // never alters the item outcome returned below.
        await postItemLifecycle({
          projectRoot: deps.projectRoot, backlogPath: deps.backlogPath,
          config: deps.config, runBudgetedDecay: deps.runBudgetedDecay, keepTaskId: runTaskId,
        });

        return ok ? { outcome: 'success' } : { outcome: 'failure', error: reason };
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        // Gap B — error path writeback
        try {
          const blErr: BacklogFile = loadBacklog(deps.backlogPath);
          updateStatus(deps.backlogPath, blErr, entry.id, 'failed', { ok: false, reason });
        } catch {
          // Never let the writeback failure mask the original error
        }
        // Post-item lifecycle still runs on the error path — a crashed item can leak
        // task-run-* / _*.pid artifacts too. Idempotent + fail-safe.
        await postItemLifecycle({
          projectRoot: deps.projectRoot, backlogPath: deps.backlogPath,
          config: deps.config, runBudgetedDecay: deps.runBudgetedDecay, keepTaskId: runTaskId,
        });
        return { outcome: 'failure', error: reason };
      }
    };

    return deps.pool ? deps.pool.submit(job) : job();
  };
}
