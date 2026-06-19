// ═══ Mission Lifecycle Audit Bridge — Sprint 298 (298-002) ════════════════════
// Bridges autonomous-v2 mission lifecycle events (create/settle) into the
// existing tamper-evident, hmac-chained enterprise audit stream
// (src/core/audit-writer.ts). Missions are not bound to a sprint, so a stable
// partition ('autonomous-missions') is used as the audit stream id.
//
// Fail-safe: auditMissionLifecycle NEVER throws — an audit write failure must
// not block the mission flow. writeAuditEvent already swallows I/O errors
// (writeEvent returns null, never throws); the try/catch here is defensive.

import { writeAuditEvent } from '../../../core/audit-writer.js';
import type { AuditEventPayload } from '../../../core/audit-writer.js';
import { readAuditEvents } from '../../../core/audit-query.js';

/** Stable audit partition for sprint-independent mission lifecycle events. */
export const MISSION_AUDIT_PARTITION = 'autonomous-missions';

/** A single mission lifecycle audit event (input shape). */
export interface MissionAuditEvent {
  /** Owning tenant (defaults to 'local' at the call sites). */
  tenantId: string;
  /** Who triggered the event — e.g. 'cli' (create), 'scheduler' (settle). */
  actor: string;
  /** Lifecycle action, e.g. 'missions:create' | 'missions:settle'. */
  action: string;
  /** The mission id — stored as the audit `target`. */
  missionId: string;
  /** Optional structured metadata (kind/title on create, status/ok on settle). */
  metadata?: Record<string, unknown>;
}

/**
 * Record a mission lifecycle event in the tamper-evident audit stream.
 *
 * Fail-safe: never throws. The mission flow must never be blocked by an audit
 * write failure.
 */
export function auditMissionLifecycle(projectRoot: string, e: MissionAuditEvent): void {
  try {
    writeAuditEvent(projectRoot, MISSION_AUDIT_PARTITION, {
      tenantId: e.tenantId,
      actor: e.actor,
      action: e.action,
      target: e.missionId,
      ...(e.metadata ? { metadata: e.metadata } : {}),
    });
  } catch {
    // Defensive fail-safe — never block the mission flow on an audit failure.
  }
}

/**
 * Read all mission lifecycle audit events from the stable partition.
 *
 * Only `missions:`-prefixed actions are returned — any other audit event that
 * happens to share the partition is excluded. Missing stream → `[]`.
 */
export function readMissionAudit(projectRoot: string): AuditEventPayload[] {
  return readAuditEvents(projectRoot, MISSION_AUDIT_PARTITION).filter(
    (e) => typeof e.action === 'string' && e.action.startsWith('missions:'),
  );
}
