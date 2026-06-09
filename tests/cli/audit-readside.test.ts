// tests/cli/audit-readside.test.ts
// Gap #5 — audit read-side consumers: compliance report + SIEM export over the
// live ENT-3 audit chain. Hermetic: tmpdir root, events seeded via writeAuditEvent.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runComplianceReport, runSiemExport } from '../../src/cli/commands/audit.js';
import { writeAuditEvent, _resetChainHead } from '../../src/core/audit-writer.js';

const SPRINT = 'sprint-rs';

describe('audit read-side — compliance + SIEM export', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'audit-rs-'));
    _resetChainHead();
    writeAuditEvent(root, SPRINT, { tenantId: 'local', actor: 'system', action: 'capability.success', target: 'fs-read' });
    writeAuditEvent(root, SPRINT, { tenantId: 'acme', actor: 'cli', action: 'rbac.denied' });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('runComplianceReport builds a report over the live audit chain', () => {
    const report = runComplianceReport(root, SPRINT, { rbacEnabled: true, tenantIsolation: false });
    expect(report.eventCount).toBe(2);
    expect(report.auditChainIntegrity.intact).toBe(true);
    expect(report.controls.auditChainIntact).toBe('ON');
    expect(report.controls.rbacEnforcement).toBe('ON');
    expect(report.controls.tenantIsolation).toBe('OFF');
    expect(report.actorBreakdown).toEqual({ system: 1, cli: 1 });
  });

  it('runComplianceReport on an empty sprint stream → zero events, intact chain', () => {
    const report = runComplianceReport(root, 'sprint-empty', { rbacEnabled: false, tenantIsolation: false });
    expect(report.eventCount).toBe(0);
    expect(report.auditChainIntegrity.intact).toBe(true);
  });

  it('runSiemExport writes normalized NDJSON records to the out file and reports the count', async () => {
    const out = join(root, 'siem-export.jsonl');
    const result = await runSiemExport(root, SPRINT, out);
    expect(result.count).toBe(2);
    expect(result.out).toBe(out);
    expect(existsSync(out)).toBe(true);
    const lines = readFileSync(out, 'utf-8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ actor: 'system', action: 'capability.success' });
    expect(lines[1]).toMatchObject({ actor: 'cli', action: 'rbac.denied' });
  });

  it('runSiemExport on an empty sprint stream → count 0, no file forced', async () => {
    const out = join(root, 'none.jsonl');
    const result = await runSiemExport(root, 'sprint-empty', out);
    expect(result.count).toBe(0);
  });
});
