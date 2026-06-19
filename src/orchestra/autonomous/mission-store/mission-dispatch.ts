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
import type { DispatchFn } from './mission-scheduler.js';
import type { ResultLike, WorkItem } from './mission-types.js';

/** Context handed to the injected `runTask`. Built from the work item's `spec`. */
export interface MissionTaskContext {
  projectRoot: string;
  description: string;
  model?: string;
  provider?: string;
  scopeDir?: string;
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
}

/** Narrow an unknown spec value to a non-empty string, else undefined. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Build the real DispatchFn the scheduler runs per claimed work item.
 *
 * Map (WorkItem.kind → execution):
 *   - 'task'       → runTask({ description, model?, provider?, scopeDir? } from spec)
 *   - 'sprint'     → runSprint(projectRoot, config); resolves → { ok: true }, throws → { ok: false }
 *   - 'capability' → runCapability(spec.capabilityTarget); no broker → { ok: false, 'no capability broker' }
 *   - 'process'    → { ok: false, 'process kind not yet wired' } (explicitly NOT a silent task-fallback)
 *   - default      → { ok: false, 'unknown work item kind: <k>' } (runtime-malformed guard)
 */
export function buildMissionDispatch(deps: MissionDispatchDeps): DispatchFn {
  const { projectRoot, config, runTask, runSprint, runCapability } = deps;

  return async (item: WorkItem): Promise<ResultLike> => {
    const spec = item.spec ?? {};
    try {
      if (item.kind === 'task') {
        const ctx: MissionTaskContext = {
          projectRoot,
          description: str(spec.description) ?? item.id,
        };
        const model = str(spec.model);
        const provider = str(spec.provider);
        const scopeDir = str(spec.scopeDir);
        if (model) ctx.model = model;
        if (provider) ctx.provider = provider;
        if (scopeDir) ctx.scopeDir = scopeDir;
        return await runTask(ctx);
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
        // Phase-1: a process is an ordered, multi-step composite — running it as a
        // single task would be a false success. Flag it explicitly until wired.
        return { ok: false, reason: 'process kind not yet wired' };
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
