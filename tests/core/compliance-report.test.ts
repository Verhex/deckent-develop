import { describe, it, expect } from 'vitest';
import {
  generateComplianceReport,
  type ComplianceInput,
  type ComplianceReport,
} from '../../src/core/compliance-report.js';
import { type AuditEvent } from '../../src/core/audit-writer.js';

// ─── Helpers ──────────────────────────────────────────────────────

/** Build a legacy audit event (no hmac — backward-safe, always intact). */
function legacyEvent(actor: string, action: string, tenantId = 'acme'): AuditEvent {
  return { tenantId, actor, action };
}

/** Build a chained event pair with a deliberate prevHmac mismatch (broken chain). */
function brokenChainEvents(): AuditEvent[] {
  return [
    {
      tenantId: 'acme',
      actor: 'user-1',
      action: 'login',
      prevHmac: 'deckent-audit-genesis-0000000000000000000000000000000000000000',
      hmac: 'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111',
    },
    {
      tenantId: 'acme',
      actor: 'user-1',
      action: 'read',
      // prevHmac intentionally wrong (doesn't match first event's hmac)
      prevHmac: 'deadbeef00000000000000000000000000000000000000000000000000000000',
      hmac: 'deadbeef11111111111111111111111111111111111111111111111111111111',
    },
  ];
}

// ─── Test 1 — RBAC controls ON/OFF ───────────────────────────────

describe('generateComplianceReport — rbac control', () => {
  it('rbacStatus is ON when rbacEnabled is true', () => {
    const input: ComplianceInput = {
      rbacEnabled: true,
      tenantIsolation: false,
      auditEvents: [],
    };
    const report: ComplianceReport = generateComplianceReport(input);
    expect(report.rbacStatus).toBe('ON');
    expect(report.controls.rbacEnforcement).toBe('ON');
  });

  it('rbacStatus is OFF when rbacEnabled is false', () => {
    const input: ComplianceInput = {
      rbacEnabled: false,
      tenantIsolation: true,
      auditEvents: [],
    };
    const report = generateComplianceReport(input);
    expect(report.rbacStatus).toBe('OFF');
    expect(report.controls.rbacEnforcement).toBe('OFF');
  });
});

// ─── Test 2 — Tenant isolation control ON/OFF ─────────────────────

describe('generateComplianceReport — tenant isolation control', () => {
  it('tenantIsolationStatus is ON when tenantIsolation is true', () => {
    const report = generateComplianceReport({
      rbacEnabled: false,
      tenantIsolation: true,
      auditEvents: [],
    });
    expect(report.tenantIsolationStatus).toBe('ON');
    expect(report.controls.tenantIsolation).toBe('ON');
  });

  it('tenantIsolationStatus is OFF when tenantIsolation is false', () => {
    const report = generateComplianceReport({
      rbacEnabled: true,
      tenantIsolation: false,
      auditEvents: [],
    });
    expect(report.tenantIsolationStatus).toBe('OFF');
    expect(report.controls.tenantIsolation).toBe('OFF');
  });
});

// ─── Test 3 — Audit chain integrity ──────────────────────────────

describe('generateComplianceReport — audit chain integrity', () => {
  it('intact chain (legacy events) → auditChainIntact ON', () => {
    const events = [
      legacyEvent('admin', 'sprint:start'),
      legacyEvent('admin', 'task:create'),
    ];
    const report = generateComplianceReport({
      rbacEnabled: true,
      tenantIsolation: true,
      auditEvents: events,
    });
    expect(report.auditChainIntegrity.intact).toBe(true);
    expect(report.auditChainIntegrity.brokenAt).toBeUndefined();
    expect(report.controls.auditChainIntact).toBe('ON');
  });

  it('intact chain (empty events) → auditChainIntact ON', () => {
    const report = generateComplianceReport({
      rbacEnabled: true,
      tenantIsolation: true,
      auditEvents: [],
    });
    expect(report.auditChainIntegrity.intact).toBe(true);
    expect(report.controls.auditChainIntact).toBe('ON');
  });

  it('broken chain → auditChainIntact OFF and brokenAt set', () => {
    const report = generateComplianceReport({
      rbacEnabled: true,
      tenantIsolation: true,
      auditEvents: brokenChainEvents(),
    });
    expect(report.auditChainIntegrity.intact).toBe(false);
    expect(typeof report.auditChainIntegrity.brokenAt).toBe('number');
    expect(report.controls.auditChainIntact).toBe('OFF');
  });
});

// ─── Test 4 — Event count and actor breakdown ─────────────────────

describe('generateComplianceReport — event count + actor breakdown', () => {
  it('eventCount matches number of provided events', () => {
    const events = [
      legacyEvent('alice', 'read'),
      legacyEvent('bob', 'write'),
      legacyEvent('alice', 'delete'),
    ];
    const report = generateComplianceReport({
      rbacEnabled: true,
      tenantIsolation: true,
      auditEvents: events,
    });
    expect(report.eventCount).toBe(3);
  });

  it('actorBreakdown counts events per actor', () => {
    const events = [
      legacyEvent('alice', 'read'),
      legacyEvent('bob', 'write'),
      legacyEvent('alice', 'delete'),
      legacyEvent('alice', 'login'),
      legacyEvent('bob', 'logout'),
    ];
    const report = generateComplianceReport({
      rbacEnabled: true,
      tenantIsolation: true,
      auditEvents: events,
    });
    expect(report.actorBreakdown['alice']).toBe(3);
    expect(report.actorBreakdown['bob']).toBe(2);
  });

  it('empty events → eventCount 0, empty actorBreakdown', () => {
    const report = generateComplianceReport({
      rbacEnabled: false,
      tenantIsolation: false,
      auditEvents: [],
    });
    expect(report.eventCount).toBe(0);
    expect(Object.keys(report.actorBreakdown)).toHaveLength(0);
  });
});

// ─── Test 5 — Full report shape ───────────────────────────────────

describe('generateComplianceReport — full report shape', () => {
  it('report contains all required fields', () => {
    const report = generateComplianceReport({
      rbacEnabled: true,
      tenantIsolation: true,
      auditEvents: [legacyEvent('sys', 'boot')],
    });

    expect(report).toHaveProperty('rbacStatus');
    expect(report).toHaveProperty('tenantIsolationStatus');
    expect(report).toHaveProperty('auditChainIntegrity');
    expect(report).toHaveProperty('eventCount');
    expect(report).toHaveProperty('actorBreakdown');
    expect(report).toHaveProperty('controls');
    expect(report.controls).toHaveProperty('rbacEnforcement');
    expect(report.controls).toHaveProperty('tenantIsolation');
    expect(report.controls).toHaveProperty('auditChainIntact');
  });

  it('all controls OFF when both flags false and no events', () => {
    const report = generateComplianceReport({
      rbacEnabled: false,
      tenantIsolation: false,
      auditEvents: [],
    });
    expect(report.controls.rbacEnforcement).toBe('OFF');
    expect(report.controls.tenantIsolation).toBe('OFF');
    expect(report.controls.auditChainIntact).toBe('ON'); // empty chain is intact
  });
});
