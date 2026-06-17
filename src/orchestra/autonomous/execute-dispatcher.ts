// src/orchestra/autonomous/execute-dispatcher.ts
// The real ActionHandler that fills buildAutonomousRuntime's empty handler map.
// kind=task → runTaskMode (single worker); kind=sprint → runSprint (full lifecycle).
// runTask/runSprint injected for hermetic tests; composition root passes the real fns.
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
import { loadBacklog, updateStatus } from './backlog.js';
import type { TaskResult } from '../../core/types.js';
import type { ExecutionPool } from './execution-pool.js';
import { needsJitDetail, generateItemDetail } from './jit-detail.js';
import type { LlmComplete } from './goal-planner-types.js';
import {
  evaluateBacklogResult, auditBacklogResult, crossVerifyBacklogResult, reconcileWithAudit,
  writeBrainAssessmentToResult,
  type BacklogEvaluation, type AuditVerdict, type CrossVerifyVerdict,
} from './backlog-eval.js';
import type { FlowReporter } from './flow-reporter.js';

/** Action id the backlog-trigger sets on every entry-driven trigger. */
export const AUTONOMOUS_EXECUTE_ACTION = 'autonomous.execute';

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
  ) => Promise<unknown>;
  /** Injected runSprint (kind=sprint). */
  runSprint: (projectRoot: string, config: ResolvedConfig) => Promise<unknown>;
  /** Durable backlog path — used for Gap B status writeback. */
  backlogPath: string;
  /**
   * Wait for the task .result file to appear (Gap F completion tracking).
   * Injected for hermetic tests; live wire uses waitForRunResult from run.ts.
   * Returns the parsed TaskResult or null on timeout.
   */
  waitForResult: (projectRoot: string, taskId: string, timeoutMs: number) => Promise<TaskResult | null>;
  /**
   * Max ms to wait for a task result before declaring failure.
   * Defaults to 600_000 (10 min) — ollama models can be slow to load.
   */
  resultTimeoutMs?: number;
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
  evaluate?: (entry: BacklogEntry, result: TaskResult, projectRoot: string) => BacklogEvaluation;
  audit?: (entry: BacklogEntry, result: TaskResult, projectRoot: string) => Promise<AuditVerdict>;
  crossVerify?: (
    entry: BacklogEntry, result: TaskResult, projectRoot: string,
    config: ResolvedConfig, evaluation: BacklogEvaluation,
  ) => Promise<CrossVerifyVerdict>;
  /** Rich dual-channel flow emitter (human terminal + AI JSONL). Absent → no flow. */
  flow?: FlowReporter;
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

      try {
        let ok = false;
        let reason = '';
        // Rich Brain+Auditor+CrossVerify verdict (task branch only). null → fall back to
        // the plain { ok, reason } for sprint/capability/process branches.
        let richResult: BacklogEntry['lastResult'] = null;

        if (entry.kind === 'sprint') {
          // Sprint: runSprint awaits the full lifecycle — success unless it throws.
          await deps.runSprint(deps.projectRoot, deps.config);
          ok = true;
          reason = 'sprint completed';
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
            });
            ok = result.ok;
            reason = result.ok
              ? `capability ${result.capability} fulfilled by handler '${result.handler}'`
              : `${result.code}: ${result.error}`;
          }
        } else if (entry.kind === 'process') {
          ok = false;
          reason = 'process/workflow execution is not available yet (F3-008 Workflow Composer pending)';
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
          ) as { taskId?: string } | null | undefined;

          const taskId = r?.taskId;
          if (taskId) {
            deps.flow?.step('spawned', entry.id, `taskId=${taskId}`);
            // Gap F: wait for real done/failed (not just launched)
            let result = await deps.waitForResult(deps.projectRoot, taskId, timeoutMs);
            if (!result) {
              // false-FAILURE fix: a real worker can write its .result seconds after the
              // window closes — observed 9s past a 600s timeout (2026-06-17 dogfood).
              // Grace re-poll once before failing (disk-verify outranks the timeout).
              result = await deps.waitForResult(deps.projectRoot, taskId, GRACE_RESULT_MS);
            }

            if (result) {
              // CORE-UNIFORMITY: a finished autonomous task passes through the SAME
              // Brain-Eval + Auditor + Cross-Verify sprint mode applies (mode-independent
              // kernels). The Auditor + cross-verify verdicts are ADVISORY (never flip the
              // Brain decision, per ADR-037 V1.0); the rich verdict is persisted + flow-reported.
              const evaluate = deps.evaluate ?? evaluateBacklogResult;
              const audit = deps.audit ?? auditBacklogResult;
              const crossVerify = deps.crossVerify ?? crossVerifyBacklogResult;

              const evaluation = evaluate(live, result, deps.projectRoot);
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
        return { outcome: 'failure', error: reason };
      }
    };

    return deps.pool ? deps.pool.submit(job) : job();
  };
}
