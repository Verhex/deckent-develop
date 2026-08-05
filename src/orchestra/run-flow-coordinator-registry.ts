// ─── RunFlowCoordinator registry (SURF-1c) ───────────────────────────────────
// Per-root coordinator singletons: every surface (API routes, CLI controller,
// future Desktop bridge) resolves the SAME coordinator for a project root, so
// in-memory state, command-idempotency sets and the durable event log stay
// single-authority. Replaces run-flow-routes.ts's module-level FlowRecord Map.

import { createRunFlowCoordinator } from './run-flow-coordinator.js';
import type { RunFlowCoordinator, RunFlowCoordinatorDeps } from './run-flow-coordinator.js';

const coordinators = new Map<string, RunFlowCoordinator>();

// PROD-SSE-ONEVENT-WIRE-001: listeners live OUTSIDE the coordinator so any
// ingress order works. The coordinator is always created with one stable
// fan-out dispatcher over this per-root set; a publisher that arrives AFTER
// creation (e.g. the API route resolving a coordinator the plan-service
// already created) still attaches instead of being silently dropped.
const listeners = new Map<string, Set<NonNullable<RunFlowCoordinatorDeps['onEvent']>>>();

export interface GetCoordinatorOptions {
  /** Optional live-event listener (SSE publish). Attached idempotently on every
   *  call — function identity dedupes repeat registrations — regardless of
   *  whether the coordinator for this root already exists. */
  onEvent?: RunFlowCoordinatorDeps['onEvent'];
}

/** Resolve (or lazily create) the coordinator for a project root. */
export function getRunFlowCoordinator(root: string, options: GetCoordinatorOptions = {}): RunFlowCoordinator {
  let rootListeners = listeners.get(root);
  if (!rootListeners) {
    rootListeners = new Set();
    listeners.set(root, rootListeners);
  }
  if (options.onEvent) rootListeners.add(options.onEvent);
  const existing = coordinators.get(root);
  if (existing) return existing;
  const created = createRunFlowCoordinator({
    root,
    onEvent: (event) => {
      for (const listener of listeners.get(root) ?? []) {
        // Per-listener fail-soft: one throwing observer must affect neither the
        // command nor the other observers (same contract deps.onEvent already
        // has toward the coordinator, kept per listener across the fan-out).
        try {
          listener(event);
        } catch {
          /* listener errors are the listener's problem, never the flow's */
        }
      }
    },
  });
  coordinators.set(root, created);
  return created;
}

/** Test-only seam — drops every cached coordinator and listener set (fresh fold
 *  and fresh wiring on next get). */
export function _resetRunFlowCoordinatorsForTests(): void {
  coordinators.clear();
  listeners.clear();
}
