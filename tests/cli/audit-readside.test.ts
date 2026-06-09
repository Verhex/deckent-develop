// tests/cli/audit-readside.test.ts
// Gap #5 — audit read-side consumers: compliance report + SIEM export over the
// live ENT-3 audit chain. Hermetic: tmpdir root, events seeded via writeAuditEvent,
// HTTP forwarding via injected fetch (no real network).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runComplianceReport, runSiemExport, runSiemHttpForward } from '../../src/cli/commands/audit.js';
import { writeAuditEvent, _resetChainHead } from '../../src/core/audit-writer.js';
import type { SiemFetchLike } from '../../src/core/siem-transport-http.js';

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

describe('audit read-side — SIEM HTTP forward (--url path)', () => {
  const URL = 'https://siem.example.com/ingest';
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'audit-rs-http-'));
    _resetChainHead();
    writeAuditEvent(root, SPRINT, { tenantId: 'local', actor: 'system', action: 'capability.success', target: 'fs-read' });
    writeAuditEvent(root, SPRINT, { tenantId: 'acme', actor: 'cli', action: 'rbac.denied' });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('runSiemHttpForward POSTs the normalized records via the injected fetch and reports count + url', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl: SiemFetchLike = async (url, init) => {
      calls.push({ url, body: init.body });
      return { ok: true, status: 200 };
    };

    const result = await runSiemHttpForward(root, SPRINT, URL, fetchImpl);

    expect(result).toEqual({ count: 2, url: URL });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(URL);
    const batch = JSON.parse(calls[0]!.body) as Array<Record<string, unknown>>;
    expect(batch).toHaveLength(2);
    expect(batch[0]).toMatchObject({ actor: 'system', action: 'capability.success' });
    expect(batch[1]).toMatchObject({ actor: 'cli', action: 'rbac.denied' });
  });

  it('runSiemHttpForward on an empty sprint stream → count 0 and fetch is never called', async () => {
    const fetchImpl = vi.fn<SiemFetchLike>(async () => ({ ok: true, status: 200 }));

    const result = await runSiemHttpForward(root, 'sprint-empty', URL, fetchImpl);

    expect(result).toEqual({ count: 0, url: URL });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('runSiemHttpForward throws synchronously-validated errors (malformed URL) before forwarding', async () => {
    const fetchImpl = vi.fn<SiemFetchLike>(async () => ({ ok: true, status: 200 }));

    await expect(runSiemHttpForward(root, SPRINT, 'not a url', fetchImpl)).rejects.toThrow(/url/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('runSiemHttpForward does NOT reject on a failing endpoint — forwarder retries then drops (fail-safe)', async () => {
    // Forwarder default maxRetries = 3 → 4 transport attempts, then the batch is
    // dropped with a console.error; the CLI helper itself never throws.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn<SiemFetchLike>(async () => ({ ok: false, status: 503 }));

    const result = await runSiemHttpForward(root, SPRINT, URL, fetchImpl);

    expect(result).toEqual({ count: 2, url: URL });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(errSpy).toHaveBeenCalled();
  });
});
