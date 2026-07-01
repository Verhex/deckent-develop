// ─── Scope-Collision Decision (spawn-time guard) ───────────────────────────
//
// Sprint 168 C0c RC2 — the missing SCOPE_COLLISION_DETECTED subscriber.
//
// Sprint 167 events.jsonl evidence (seq #1, #2, #8):
//   Auditor emits AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED at plan-time when two
//   tasks claim the same scope.filesWrite entry — but the Brain spawn pipeline
//   had no consumer/subscriber, so tasks proceeded to TASK_ASSIGN anyway, causing
//   runtime lock contention and Worker output corruption.
//
// This module exposes that decision: the spawn pipeline calls handleScopeCollision()
// before the TASK_ASSIGN emit; if action === 'block' the spawn is skipped and a
// BRAIN→SPAWN:BLOCKED event is logged.
//
// File authority constraint: this is a *pure* decision function (no IO, no event
// emission). The spawn-time wire reads the SpawnDecision return value and emits
// the BLOCKED event itself.
//
// History: this API previously shared `decision-engine.ts` with the V1
// `DecisionOrchestrator` (ADR-028 keyword routing, deprecated Sprint 066). That
// V1 engine was fully removed by ROUTE-V1-PURGE (ADR-G-006) — production routing
// is `routeTaskV2` (`src/core/routing-engine.ts`) — and this live guard was moved
// to its own honestly-named file.

/** Payload emitted by Auditor when a scope.filesWrite collision is detected. */
export interface ScopeCollisionPayload {
  /** Task IDs that all claim at least one of the colliding files. */
  taskIds: string[];
  /** Files claimed by >1 task. */
  files: string[];
  /** When the collision was detected: 'plan-time' | 'spawn-time' | string. */
  detectedAt: string;
}

/** Decision returned to the spawn pipeline. */
export interface SpawnDecision {
  /**
   * - 'block': skip TASK_ASSIGN for the listed tasks (BRAIN→SPAWN:BLOCKED).
   * - 'replan': mark tasks as PENDING and trigger a re-plan (future use).
   * - 'continue': override the collision (forces TASK_ASSIGN, debug only).
   */
  action: 'block' | 'replan' | 'continue';
  reason: string;
  taskIds: string[];
}

/**
 * Sprint 168 C0c RC2 — handle an Auditor SCOPE_COLLISION_DETECTED alert.
 *
 * Pure function: deterministic block decision. The spawn pipeline is responsible
 * for consulting this before TASK_ASSIGN and for emitting the BRAIN→SPAWN:BLOCKED
 * event when action === 'block'.
 *
 * The deterministic 'block' policy is intentional for Sprint 168 — future sprints
 * can extend with priority-aware 'replan' for low-priority tasks.
 */
export function handleScopeCollision(payload: ScopeCollisionPayload): SpawnDecision {
  return {
    action: 'block',
    reason: `Scope collision: ${payload.files.join(', ')} held by multiple tasks`,
    taskIds: payload.taskIds,
  };
}
