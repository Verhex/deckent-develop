// src/orchestra/autonomous/backlog-types.ts
// Backlog data model for the autonomous engine. Durable, git-trackable.
// Spec: docs/superpowers/specs/2026-06-07-autonomous-execution-engine-design.md §5

import type { CapabilityTarget, ActorContext } from '../../core/work-model.js';
import type { ExactPlanReferenceV1 } from '../../core/run-flow-contract.js';

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
    /** Domain-general unplanned Sprint intent. Mutually exclusive with
     *  directivesRef and exactPlanRef at exact-plan admission. */
    intent?: string;
    scopeDir?: string;
    capabilityTarget?: CapabilityTarget;
    /** Canonical RunFlow snapshot identity for kind=sprint. The executable
     *  Sprint remains in RunFlowStore; backlog JSON never embeds a second plan. */
    exactPlanRef?: ExactPlanReferenceV1;
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
  /** Stable end-to-end lineage for plan, approval, execution and settlement.
   *  Ingresses should author this once; legacy rows without one fail closed at
   *  exact-sprint execution rather than receiving a new identity on replay. */
  correlationId?: string;
  /** Optional parent event/effect reference within the same correlation chain. */
  causationId?: string;
  /** Durable ingress provenance used by exact plan/start lineage. */
  origin?: 'cli' | 'mcp' | 'chat' | 'autonomous' | 'webhook' | 'scheduled' | 'api' | 'ide';
  /** Goal-planner (Phase 1): a lightweight, not-yet-detailed item. The full
   *  spec.description is generated just-in-time at dispatch (Phase 2). */
  planned?: boolean;
  /** Goal-planner: one-line WHAT for the plan table + JIT detail seed. */
  summary?: string;
  /** Goal-planner: parallel fan-out hint — run `concurrency` jobs over `over`. */
  fanOut?: { over: string; concurrency: number };
  lastRun: string | null;
  /**
   * Outcome of the last run. CORE-UNIFORMITY (slice 1): additively widened to
   * carry the rich Brain-Eval + Auditor + Cross-Verify verdict so a finished
   * autonomous task surfaces the SAME core evaluation sprint mode produces.
   * All fields beyond `ok`/`reason` are optional — pre-existing `{ ok, reason }`
   * writers and on-disk back-compat are preserved.
   */
  lastResult: {
    ok: boolean;
    reason: string;
    /** Brain decision (rubric + reconciliation). */
    decision?: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
    /** True when the worker self-reported NO_GO but disk-verify overrode it. */
    reconciled?: boolean;
    /** Rubric quality score (totalScore). */
    quality?: number;
    /** Auditor verdict (advisory — never flips status). */
    audit?: {
      boundary: 'clean' | string[];
      adr: 'ok' | string[];
      functional: 'pass' | 'fail' | 'skipped';
    };
    /** XVER-1 cross-provider verification (advisory; honest-skip → ran:false). */
    crossVerify?: { ran: boolean; verdict?: 'confirmed' | 'refuted' | 'unclear' };
    /**
     * Host-authored provider-authority HOLD for an execution that never reached
     * provider/bootstrap/backend dispatch. This is provenance, not an approval
     * request and never becomes an execution permit on replay.
     */
    providerAuthorityHold?: {
      readonly schemaVersion: 1;
      readonly executionId: string;
      readonly tenantId: string;
      readonly projectId: string | null;
      readonly reasonCode: string;
      readonly authorityEvidenceRefs: readonly string[];
      readonly heldAt: string;
    };
  } | null;
}

/** On-disk backlog file shape (.deckent/autonomous/backlog.json). */
export interface BacklogFile {
  _version: string;
  entries: BacklogEntry[];
}
