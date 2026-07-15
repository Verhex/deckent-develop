// ─── RunFlowCoordinator registry (SURF-1c) ───────────────────────────────────
// Per-root coordinator singletons: every surface (API routes, CLI controller,
// future Desktop bridge) resolves the SAME coordinator for a project root, so
// in-memory state, command-idempotency sets and the durable event log stay
// single-authority. Replaces run-flow-routes.ts's module-level FlowRecord Map.

import { createRunFlowCoordinator } from './run-flow-coordinator.js';
import type { RunFlowCoordinator, RunFlowCoordinatorDeps } from './run-flow-coordinator.js';

const coordinators = new Map<string, RunFlowCoordinator>();

export interface GetCoordinatorOptions {
  /** Optional live-event listener (SSE publish). Applied only when the
   *  coordinator for this root is FIRST created — subsequent callers share it. */
  onEvent?: RunFlowCoordinatorDeps['onEvent'];
}

/** Resolve (or lazily create) the coordinator for a project root. */
export function getRunFlowCoordinator(root: string, options: GetCoordinatorOptions = {}): RunFlowCoordinator {
  const existing = coordinators.get(root);
  if (existing) return existing;
  const created = createRunFlowCoordinator({
    root,
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
  });
  coordinators.set(root, created);
  return created;
}

/** Test-only seam — drops every cached coordinator (fresh fold on next get). */
export function _resetRunFlowCoordinatorsForTests(): void {
  coordinators.clear();
}
