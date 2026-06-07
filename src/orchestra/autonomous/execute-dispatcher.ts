// src/orchestra/autonomous/execute-dispatcher.ts
// The real ActionHandler that fills buildAutonomousRuntime's empty handler map.
// kind=task → runTaskMode (single worker); kind=sprint → runSprint (full lifecycle).
// runTask/runSprint injected for hermetic tests; composition root passes the real fns.
import type { ResolvedConfig } from '../../core/config-types.js';
import type { ActionHandler } from '../../nervous/executor.js';
import type { BacklogEntry } from './backlog-types.js';

/** Action id the backlog-trigger sets on every entry-driven trigger. */
export const AUTONOMOUS_EXECUTE_ACTION = 'autonomous.execute';

export interface ExecuteDispatcherDeps {
  projectRoot: string;
  config: ResolvedConfig;
  /** Injected runTaskMode (kind=task). */
  runTask: (
    ctx: { projectRoot: string; description: string; model?: string; provider?: string; scope?: { directories: string[] } },
    config: ResolvedConfig,
  ) => unknown;
  /** Injected runSprint (kind=sprint). */
  runSprint: (projectRoot: string, config: ResolvedConfig) => Promise<unknown>;
}

export function makeExecuteDispatcher(deps: ExecuteDispatcherDeps): ActionHandler {
  return async (_actionId, payload) => {
    const entry = payload?.entry as BacklogEntry | undefined;
    if (!entry || typeof entry !== 'object') {
      return { outcome: 'failure', error: 'execute-dispatcher: no backlog entry in payload' };
    }
    try {
      if (entry.kind === 'sprint') {
        await deps.runSprint(deps.projectRoot, deps.config);
      } else {
        // The dispatcher forwards the entry's full provider/model intent. The real
        // runTaskMode adapter (wired in the composition root, engine task 7) maps these
        // to the worker spawn; per-task provider routing for single-task mode follows
        // the same path sprint mode already uses via the worker backend. Forwarding here
        // preserves intent rather than silently dropping it.
        deps.runTask(
          {
            projectRoot: deps.projectRoot,
            description: entry.spec.description ?? entry.title,
            model: entry.model,
            provider: entry.provider,
            scope: { directories: [entry.spec.scopeDir ?? '.'] },
          },
          deps.config,
        );
      }
      return { outcome: 'success' };
    } catch (err: unknown) {
      return { outcome: 'failure', error: err instanceof Error ? err.message : String(err) };
    }
  };
}
