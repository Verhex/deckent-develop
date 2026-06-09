// ═══ Compliance Report Generator ══════════════════════════════════════════════
// Pure function that generates a structured compliance summary from injected
// inputs. No I/O, no live DB coupling — fully deterministic and testable.
// ENT-5c, Sprint 262.

import { verifyAuditChain, type AuditEvent } from './audit-writer.js';

// ─── Types ────────────────────────────────────────────────────────

export type ControlStatus = 'ON' | 'OFF';

/** Actor → event count breakdown. */
export type ActorBreakdown = Record<string, number>;

/** Input shape for generateComplianceReport(). All injected — no live coupling. */
export interface ComplianceInput {
  /** Whether RBAC enforcement is active. */
  rbacEnabled: boolean;
  /** Whether tenant isolation is enforced. */
  tenantIsolation: boolean;
  /** Ordered audit events to analyze (may be empty). */
  auditEvents: AuditEvent[];
}

/** SOC2/ISO-style checklist of controls. */
export interface ComplianceControls {
  rbacEnforcement: ControlStatus;
  tenantIsolation: ControlStatus;
  /** Derived from audit chain integrity. */
  auditChainIntact: ControlStatus;
}

/** Structured compliance summary. Output is a typed object; rendering is a follow-up. */
export interface ComplianceReport {
  rbacStatus: ControlStatus;
  tenantIsolationStatus: ControlStatus;
  auditChainIntegrity: { intact: boolean; brokenAt?: number };
  eventCount: number;
  actorBreakdown: ActorBreakdown;
  controls: ComplianceControls;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Generate a structured compliance summary from injected inputs.
 * Pure function — deterministic, no side-effects.
 *
 * @param input - Compliance input: rbac flag, tenant-isolation flag, audit events
 * @returns ComplianceReport — typed compliance summary
 */
export function generateComplianceReport(input: ComplianceInput): ComplianceReport {
  const { rbacEnabled, tenantIsolation, auditEvents } = input;

  const rbacStatus: ControlStatus = rbacEnabled ? 'ON' : 'OFF';
  const tenantIsolationStatus: ControlStatus = tenantIsolation ? 'ON' : 'OFF';
  const auditChainIntegrity = verifyAuditChain(auditEvents);
  const eventCount = auditEvents.length;
  const actorBreakdown = buildActorBreakdown(auditEvents);

  const controls: ComplianceControls = {
    rbacEnforcement: rbacStatus,
    tenantIsolation: tenantIsolationStatus,
    auditChainIntact: auditChainIntegrity.intact ? 'ON' : 'OFF',
  };

  return {
    rbacStatus,
    tenantIsolationStatus,
    auditChainIntegrity,
    eventCount,
    actorBreakdown,
    controls,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────

function buildActorBreakdown(events: AuditEvent[]): ActorBreakdown {
  const breakdown: ActorBreakdown = {};
  for (const event of events) {
    const actor = event.actor;
    breakdown[actor] = (breakdown[actor] ?? 0) + 1;
  }
  return breakdown;
}
