// src/orchestra/sprint-runtime.ts
// ENT-1 — RBAC gate for sprint worker-spawn paths (ADR-037 V2 step).
// Flag-gated by `enforce_rbac` config key (default false → ADR-037 V1.0 soft-warn).
import { checkWorkerAuthority } from '../nervous/authority-matrix.js';
import type { WorkerAuthorityResult, AuthorityAuditContext } from '../nervous/authority-matrix.js';
import type { ExecutionRequest } from '../core/work-model.js';
import type { ResolvedConfig } from '../core/config-types.js';

// `enforce_rbac` is not yet declared on ResolvedConfig (MASTER-PLAN backlog).
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
