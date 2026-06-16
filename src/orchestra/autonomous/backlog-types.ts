// src/orchestra/autonomous/backlog-types.ts
// Backlog data model for the autonomous engine. Durable, git-trackable.
// Spec: docs/superpowers/specs/2026-06-07-autonomous-execution-engine-design.md §5

import type { CapabilityTarget, ActorContext } from '../../core/work-model.js';

export type BacklogKind = 'task' | 'sprint' | 'capability' | 'process';
export type BacklogPolicy = 'auto' | 'approval-required' | 'risk-tagged';
export type BacklogStatus = 'pending' | 'running' | 'parked' | 'done' | 'failed';

export type BacklogTrigger =
  | { type: 'recurring'; cron: string }
  | { type: 'one-off' }
  | { type: 'reactive'; detector: string };

/** A single unit of autonomous work. */
export interface BacklogEntry {
  id: string;
  title: string;
  kind: BacklogKind;
  /** kind=task → inline description for runTaskMode; kind=sprint → directives ref;
   *  kind=capability → non-code work routed through the F8 capability broker. */
  spec: {
    description?: string;
    directivesRef?: string;
    scopeDir?: string;
    capabilityTarget?: CapabilityTarget;
  };
  policy: BacklogPolicy;
  provider?: string;
  model?: string;
  trigger: BacklogTrigger;
  status: BacklogStatus;
  tenant?: string;
  /** WHO submitted this work — RBAC identity (the real OIDC `sub`), role, and
   *  tenant. Carried into the capability invocation's actor so the audit
   *  hash-chain records the actual principal instead of a constant 'system'.
   *  Optional + additive: actor-less entries keep the prior 'system' fallback. */
  actor?: ActorContext;
  /** Goal-planner (Phase 1): a lightweight, not-yet-detailed item. The full
   *  spec.description is generated just-in-time at dispatch (Phase 2). */
  planned?: boolean;
  /** Goal-planner: one-line WHAT for the plan table + JIT detail seed. */
  summary?: string;
  /** Goal-planner: parallel fan-out hint — run `concurrency` jobs over `over`. */
  fanOut?: { over: string; concurrency: number };
  lastRun: string | null;
  lastResult: { ok: boolean; reason: string } | null;
}

/** On-disk backlog file shape (.deckent/autonomous/backlog.json). */
export interface BacklogFile {
  _version: string;
  entries: BacklogEntry[];
}
