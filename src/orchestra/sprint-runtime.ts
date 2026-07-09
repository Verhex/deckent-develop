// src/orchestra/sprint-runtime.ts
// ENT-1 — RBAC gate for sprint worker-spawn paths (ADR-037 V2 step).
// Flag-gated by `enforce_rbac` config key (default false → ADR-037 V1.0 soft-warn).
import { checkWorkerAuthority } from '../nervous/authority-matrix.js';
import type { WorkerAuthorityResult, AuthorityAuditContext } from '../nervous/authority-matrix.js';
import { inferRequirements } from './execution-request-builder.js';
import type { ExecutionRequest } from '../core/work-model.js';
import type { ResolvedConfig } from '../core/config-types.js';
import type { Task } from '../core/task-types.js';

// `enforce_rbac` IS declared on ResolvedConfig (config-types.ts:934).
// Intersection cast mirrors the sprint-spawner.ts token_throttle_ms pattern.
type ConfigWithRbac = ResolvedConfig & { enforce_rbac?: boolean };

/**
 * ENT-1 — RBAC gate for a sprint worker-spawn request.
 *
 * Reads the `enforce_rbac` config flag (default false → V1.0 soft-warn).
 * When false: warn only — `allowed:true` (backward-safe, V1.0).
 * When true:  hard-block if the actor role lacks the required capabilities.
 *
 * @param req  Actor + requirements slice of an ExecutionRequest.
 * @param config  Resolved project config carrying the optional enforce_rbac flag.
 * @param audit  Optional ENT-1 audit bridge — a violation writes `authority.denied`.
 * @returns {@link WorkerAuthorityResult} from checkWorkerAuthority.
 */
export function checkSprintSpawnRbac(
  req: Pick<ExecutionRequest, 'actor' | 'requirements'>,
  config: ResolvedConfig,
  audit?: AuthorityAuditContext,
): WorkerAuthorityResult {
  const enforceRbac = (config as ConfigWithRbac).enforce_rbac === true;
  return checkWorkerAuthority(req, { enforceRbac, audit });
}

/**
 * born-560 — collect the task ids the ADR-037 authority matrix denies at the
 * SPAWN mainline. Mirrors the autonomous runtime-loop's `kind=sprint` gate
 * (enforceEntryRbac) for the normal `deckent start` path: each task's required
 * capabilities are inferred from its scope (inferRequirements — the canonical
 * scope→capability map, shared with buildExecutionRequest) and checked against
 * its `actor.role` via checkSprintSpawnRbac.
 *
 * Dormant by default: `config.enforce_rbac=false` soft-warns (allowed:true), so
 * the returned array is empty and nothing is deferred. A task with no
 * `actor.role` always permits (permissive default). Only `enforce_rbac=true`
 * plus a role-denied capability adds a task id — deferred by the caller exactly
 * like a scope-collision loser.
 *
 * @param tasks  The spawn candidates (PENDING tasks).
 * @param config Resolved project config carrying the `enforce_rbac` flag.
 * @param audit  ENT-1 audit bridge — a violation writes `authority.denied`.
 * @returns The ids of tasks to defer (empty unless enforce_rbac hard-denies).
 */
export function collectRbacBlockedTaskIds(
  tasks: readonly Task[],
  config: ResolvedConfig,
  audit: AuthorityAuditContext,
): string[] {
  const blocked: string[] = [];
  for (const task of tasks) {
    const verdict = checkSprintSpawnRbac(
      { actor: task.actor, requirements: inferRequirements(task.scope) },
      config,
      { ...audit, tenantId: task.actor?.tenantId ?? audit.tenantId },
    );
    if (!verdict.allowed) blocked.push(task.id);
  }
  return blocked;
}
