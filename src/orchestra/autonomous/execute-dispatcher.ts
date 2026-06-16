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

/** Action id the backlog-trigger sets on every entry-driven trigger. */
export const AUTONOMOUS_EXECUTE_ACTION = 'autonomous.execute';

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
}

/** Determine whether a TaskResult represents success (mirrors run.ts:320). */
function isSuccess(result: TaskResult | null): boolean {
  if (!result) return false;
  const a = result.selfAssessment ?? 'NO_GO';
  return a === 'DONE' || a === 'GO_WITH_TECH_DEBT';
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
          if (idx >= 0) { blJit.entries[idx] = { ...blJit.entries[idx]!, spec: live.spec }; saveBacklogFile(deps.backlogPath, blJit); }
        } catch { /* JIT failure → fall back to the title-only description below */ }
      }

      try {
        let ok = false;
        let reason = '';

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
            // Gap F: wait for real done/failed (not just launched)
            const result = await deps.waitForResult(deps.projectRoot, taskId, timeoutMs);
            ok = isSuccess(result);
            reason = result
              ? `selfAssessment=${result.selfAssessment ?? 'NO_GO'}`
              : 'timeout — no result within limit';
          } else {
            // runTask returned no taskId — cannot track completion; treat as failure
            // to avoid false-done (the "wiring-% vs user-working" trap).
            ok = false;
            reason = 'runTask returned no taskId — completion not trackable';
          }
        }

        // Gap B — final writeback (re-load to avoid clobbering concurrent changes)
        const blFinal: BacklogFile = loadBacklog(deps.backlogPath);
        updateStatus(deps.backlogPath, blFinal, entry.id, ok ? 'done' : 'failed', { ok, reason });

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
