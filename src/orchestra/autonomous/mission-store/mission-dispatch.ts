// Autonomous v2 — the real DispatchFn: execute a WorkItem by its kind.
//
// The scheduler (mission-scheduler.ts) consumes a `DispatchFn` as an injected
// dependency. This builder wires that DispatchFn over real execution primitives
// (runTask / runSprint / a capability broker) that are themselves INJECTED — the
// composition root (Task 7 cutover) passes the live functions; tests pass fakes.
//
// Kind-branch logic mirrors execute-dispatcher.ts (the v1 ActionHandler) but is a
// separate, inject-based, test-able builder — it does NOT import or touch the live
// dispatcher. Every branch resolves to a `ResultLike`; the dispatch never rejects
// (a thrown primitive is caught and reported as `{ ok: false }`), matching the
// scheduler's contract ("Resolve on completion").
import type { ResolvedConfig } from '../../../core/config-types.js';
import type { ExecutionBudget } from '../../../core/work-model.js';
import type { DispatchFn } from './mission-scheduler.js';
import type { MissionDispatchClaim, ResultLike, WorkItem } from './mission-types.js';

/** Context handed to the injected `runTask`. Built from the work item's `spec`. */
export interface MissionTaskContext {
  projectRoot: string;
  description: string;
  model?: string;
  provider?: string;
  scopeDir?: string;
  /** Request-level ceiling only; the owner worker policy remains authority. */
  budget?: ExecutionBudget;
  /** Exact host-issued attempt authority; provider admission/receipt binds to this identity. */
  dispatchClaim: MissionDispatchClaim;
}

/** Injected execution primitives. Live wire (cutover) passes the real runTask /
 *  runSprint / capability broker; hermetic tests pass fakes and assert the calls. */
export interface MissionDispatchDeps {
  projectRoot: string;
  config: ResolvedConfig;
  /** kind='task' — run a single worker for the item's description. Returns a ResultLike. */
  runTask: (ctx: MissionTaskContext) => Promise<ResultLike>;
  /** kind='sprint' — run the full sprint lifecycle. Success unless it throws. */
  runSprint: (projectRoot: string, config: ResolvedConfig) => Promise<unknown>;
  /** kind='capability' — non-code work (mail/db/http/erp) via a broker. Optional:
   *  when absent, capability items fail with a clear 'no capability broker' reason. */
  runCapability?: (target: unknown) => Promise<ResultLike>;
  /** kind='process' — run a process (ordered multi-step composite) via an injected
   *  runner. Optional: when absent, an inline `spec.steps[]` process is executed
   *  step-by-step via runTask (sequential, fail-stop); with neither, the item fails
   *  with a clear reason (no silent task-fallback). */
  runProcess?: (spec: Record<string, unknown>) => Promise<ResultLike>;
}

/** Narrow an unknown spec value to a non-empty string, else undefined. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Build a MissionTaskContext from a spec-like object (the work item's spec, or a
 *  single process step). Mirrors the task-branch rules: `description` falls back to
 *  `fallbackId`; optional model/provider/scopeDir are omitted when absent. */
function buildTaskContext(
  projectRoot: string,
  spec: Record<string, unknown>,
  fallbackId: string,
  dispatchClaim: MissionDispatchClaim,
): MissionTaskContext {
  const ctx: MissionTaskContext = {
    projectRoot,
    description: str(spec.description) ?? fallbackId,
    dispatchClaim,
  };
  const model = str(spec.model);
  const provider = str(spec.provider);
  const scopeDir = str(spec.scopeDir);
  const budget = spec.budget;
  if (model) ctx.model = model;
  if (provider) ctx.provider = provider;
  if (scopeDir) ctx.scopeDir = scopeDir;
  // Preserve malformed authored values so the canonical budget-policy validator
  // fails loudly; never silently drop a budget request at this adapter boundary.
  if (budget !== undefined) ctx.budget = budget as ExecutionBudget;
  return ctx;
}

/**
 * Build the real DispatchFn the scheduler runs per claimed work item.
 *
 * Map (WorkItem.kind → execution):
 *   - 'task'       → runTask({ description, model?, provider?, scopeDir? } from spec)
 *   - 'sprint'     → runSprint(projectRoot, config); resolves → { ok: true }, throws → { ok: false }
 *   - 'capability' → runCapability(spec.capabilityTarget); no broker → { ok: false, 'no capability broker' }
 *   - 'process'    → runProcess(spec) if injected; else inline spec.steps[] run sequentially
 *                    via runTask (fail-stop); else { ok: false, <reason> } (NOT a silent task-fallback)
 *   - default      → { ok: false, 'unknown work item kind: <k>' } (runtime-malformed guard)
 */
export function buildMissionDispatch(deps: MissionDispatchDeps): DispatchFn {
  const { projectRoot, config, runTask, runSprint, runCapability, runProcess } = deps;

  return async (item: WorkItem, claim: MissionDispatchClaim): Promise<ResultLike> => {
    const spec = item.spec ?? {};
    try {
      if (item.kind === 'task') {
        return await runTask(buildTaskContext(projectRoot, spec, item.id, claim));
      }

      if (item.kind === 'sprint') {
        // Sprint: the full lifecycle is a success unless it throws (the throw is
        // caught below and reported as { ok: false }).
        await runSprint(projectRoot, config);
        return { ok: true, reason: 'sprint completed' };
      }

      if (item.kind === 'capability') {
        if (!runCapability) {
          return { ok: false, reason: 'no capability broker' };
        }
        const target = spec.capabilityTarget;
        if (!target) {
          return { ok: false, reason: 'capability item has no spec.capabilityTarget' };
        }
        return await runCapability(target);
      }

      if (item.kind === 'process') {
        // A process is an ordered, multi-step composite. Precedence (no silent fallback):
        //   1. injected runProcess broker → delegate the whole spec to it.
        //   2. inline spec.steps[] → run each step as a task-dispatch, sequential, fail-stop.
        //   3. neither → explicit failure (a process with no runner and no steps is malformed).
        if (runProcess) {
          return await runProcess(spec);
        }
        const steps = Array.isArray(spec.steps) ? spec.steps : null;
        if (!steps || steps.length === 0) {
          return { ok: false, reason: 'process kind requires a runProcess broker or a non-empty spec.steps[]' };
        }
        for (let i = 0; i < steps.length; i++) {
          const raw = steps[i];
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { ok: false, reason: `process step ${i + 1} is not an object` };
          }
          const ctx = buildTaskContext(
            projectRoot,
            raw as Record<string, unknown>,
            `${item.id}#step${i + 1}`,
            claim,
          );
          const res = await runTask(ctx);
          if (!res.ok) {
            return { ok: false, reason: `process step ${i + 1} failed: ${res.reason ?? 'no reason'}` };
          }
        }
        return { ok: true, reason: `process completed (${steps.length} steps)` };
      }

      // Runtime-malformed guard: WorkItemKind is a closed union at the type level,
      // but a corrupt persisted row could carry an unknown kind.
      return { ok: false, reason: `unknown work item kind: ${String(item.kind)}` };
    } catch (e) {
      // Contract: a DispatchFn resolves (never rejects). A thrown primitive
      // (e.g. runSprint failure) is reported as a failed ResultLike.
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  };
}
