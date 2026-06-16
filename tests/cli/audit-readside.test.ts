// tests/cli/audit-readside.test.ts
// Gap #5 — audit read-side consumers: compliance report + SIEM export over the
// live ENT-3 audit chain, syslog forward (Sprint 266) and retention plan/apply.
// Hermetic: tmpdir root, events seeded via writeAuditEvent, HTTP forwarding via
// injected fetch, syslog via injected sendImpl (no real network/sockets).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runComplianceReport,
  runSiemExport,
  runSiemHttpForward,
  runSiemSyslogForward,
  runAuditRetention,
  parseSyslogTarget,
} from '../../src/cli/commands/audit.js';
import { readAuditEvents } from '../../src/core/audit-query.js';
import { writeAuditEvent, verifyAuditChain, _resetChainHead, AUDIT_EVENT_CHANNEL } from '../../src/core/audit-writer.js';
import { writeEvent, readEvents } from '../../src/orchestra/event-stream.js';
import type { SiemFetchLike } from '../../src/core/siem-transport-http.js';
import type { SyslogSendImpl } from '../../src/core/siem-transport-syslog.js';

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

describe('audit read-side — SIEM syslog forward (--syslog path)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'audit-rs-syslog-'));
    _resetChainHead();
    writeAuditEvent(root, SPRINT, { tenantId: 'local', actor: 'system', action: 'capability.success', target: 'fs-read' });
    writeAuditEvent(root, SPRINT, { tenantId: 'acme', actor: 'cli', action: 'rbac.denied' });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('runSiemSyslogForward ships one RFC 5424 message per record via the injected sendImpl', async () => {
    const batches: string[][] = [];
    const sendImpl: SyslogSendImpl = async (messages) => { batches.push(messages); };

    const result = await runSiemSyslogForward(root, SPRINT, 'siem.internal', 6514, 'udp', sendImpl);

    expect(result).toEqual({ count: 2, host: 'siem.internal', port: 6514, protocol: 'udp' });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    // PRI 110 = facility 13 ("log audit") × 8 + severity 6 (Informational), version 1.
    for (const message of batches[0]!) expect(message).toMatch(/^<110>1 /);
    expect(batches[0]![0]).toContain('"action":"capability.success"');
    expect(batches[0]![1]).toContain('"action":"rbac.denied"');
  });

  it('runSiemSyslogForward on an empty sprint stream → count 0 and sendImpl is never called', async () => {
    const sendImpl = vi.fn<SyslogSendImpl>(async () => {});

    const result = await runSiemSyslogForward(root, 'sprint-empty', 'siem.internal', 514, 'tcp', sendImpl);

    expect(result).toEqual({ count: 0, host: 'siem.internal', port: 514, protocol: 'tcp' });
    expect(sendImpl).not.toHaveBeenCalled();
  });

  it('runSiemSyslogForward rejects on invalid transport options (empty host) before any send', async () => {
    const sendImpl = vi.fn<SyslogSendImpl>(async () => {});

    await expect(runSiemSyslogForward(root, SPRINT, '', 514, 'udp', sendImpl)).rejects.toThrow(/host/i);
    expect(sendImpl).not.toHaveBeenCalled();
  });

  it('parseSyslogTarget parses host[:port] with the syslog default 514', () => {
    expect(parseSyslogTarget('siem.internal:6514')).toEqual({ host: 'siem.internal', port: 6514 });
    expect(parseSyslogTarget('siem.internal')).toEqual({ host: 'siem.internal', port: 514 });
    // Non-numeric suffix is not a port — the whole value is the host.
    expect(parseSyslogTarget('siem.internal:abc')).toEqual({ host: 'siem.internal:abc', port: 514 });
  });
});

describe('audit read-side — retention plan/apply (retention subcommand)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'audit-rs-ret-'));
    _resetChainHead();
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const streamPath = (): string => join(root, '.deckent', 'recently-works', `${SPRINT}-events.jsonl`);
  const archivePath = (): string => join(root, '.deckent', 'recently-works', `${SPRINT}-events-archive.jsonl`);

  function seedThree(): void {
    writeAuditEvent(root, SPRINT, { tenantId: 'local', actor: 'system', action: 'a1' });
    writeAuditEvent(root, SPRINT, { tenantId: 'local', actor: 'system', action: 'a2' });
    writeAuditEvent(root, SPRINT, { tenantId: 'local', actor: 'system', action: 'a3' });
  }

  it('dry-run reports the plan and writes NOTHING (stream byte-identical, no archive file)', () => {
    seedThree();
    const before = readFileSync(streamPath(), 'utf-8');

    const result = runAuditRetention(root, SPRINT, { maxCount: 2 }, false);

    expect(result).toEqual({ sprintId: SPRINT, scanned: 3, keep: 2, archive: 1, prune: 0, applied: false });
    expect(readFileSync(streamPath(), 'utf-8')).toBe(before);
    expect(existsSync(archivePath())).toBe(false);
  });

  it("compliance over a retained stream is ARCHIVE-AWARE: chain verifies across archive + live (hmac'd head archived)", () => {
    seedThree(); // a1..a3, all hmac-chained
    runAuditRetention(root, SPRINT, { maxCount: 2 }, true); // a1 → archive

    // The live stream alone is a truncated chain (kept head anchors to the
    // archived record) — compliance must verify across archive + live.
    const report = runComplianceReport(root, SPRINT, { rbacEnabled: false, tenantIsolation: false });

    expect(report.auditChainIntegrity).toEqual({ intact: true });
    expect(report.eventCount).toBe(3); // retained trail = 1 archived + 2 live
  });

  it('apply with maxCount: atomic rewrite — readAuditEvents returns the keep-set, dropped event is archived, non-audit events survive', () => {
    // Non-audit event first — retention must NEVER touch other channels.
    writeEvent(root, SPRINT, 'brain', '*', 'BRAIN→*:SPRINT_PHASE_CHANGE', { phase: 'PLAN' });
    seedThree();

    const result = runAuditRetention(root, SPRINT, { maxCount: 2 }, true);

    expect(result).toEqual({ sprintId: SPRINT, scanned: 3, keep: 2, archive: 1, prune: 0, applied: true });
    expect(existsSync(`${streamPath()}.tmp`)).toBe(false); // atomic rename — no tmp left behind
    const kept = readAuditEvents(root, SPRINT);
    expect(kept.map((e) => e.action)).toEqual(['a2', 'a3']);
    const allAfter = readEvents(root, SPRINT);
    expect(allAfter.some((e) => e.channel === 'BRAIN→*:SPRINT_PHASE_CHANGE')).toBe(true);
    const archived = readFileSync(archivePath(), 'utf-8').trim().split('\n').map((l) => JSON.parse(l) as { channel: string; payload: { action: string } });
    expect(archived).toHaveLength(1);
    expect(archived[0]!.channel).toBe(AUDIT_EVENT_CHANNEL);
    expect(archived[0]!.payload.action).toBe('a1');
  });

  it('apply pruning a legacy (hmac-less) head record keeps verifyAuditChain intact on the kept chain', () => {
    // Legacy head: raw audit-channel event with an old timestamp and no chain
    // fields — the backward-safe record shape verifyAuditChain skips. Pruning
    // it from the head preserves the genesis anchor of the surviving hmac chain.
    writeEvent(root, SPRINT, 'deckent', 'auditor', AUDIT_EVENT_CHANNEL, {
      tenantId: 'local', actor: 'legacy', action: 'legacy.write', timestamp: '2020-01-01T00:00:00.000Z',
    });
    writeAuditEvent(root, SPRINT, { tenantId: 'local', actor: 'system', action: 'fresh.one' });
    writeAuditEvent(root, SPRINT, { tenantId: 'local', actor: 'system', action: 'fresh.two' });

    const result = runAuditRetention(root, SPRINT, { maxAgeMs: 30 * 86_400_000 }, true);

    expect(result).toEqual({ sprintId: SPRINT, scanned: 3, keep: 2, archive: 0, prune: 1, applied: true });
    const kept = readAuditEvents(root, SPRINT);
    expect(kept.map((e) => e.action)).toEqual(['fresh.one', 'fresh.two']);
    expect(verifyAuditChain(kept)).toEqual({ intact: true });
    expect(existsSync(archivePath())).toBe(false); // pruned, not archived
  });

  it('apply with nothing to drop leaves the stream untouched (byte-identical)', () => {
    seedThree();
    const before = readFileSync(streamPath(), 'utf-8');

    const result = runAuditRetention(root, SPRINT, {}, true); // empty policy → keep everything

    expect(result).toEqual({ sprintId: SPRINT, scanned: 3, keep: 3, archive: 0, prune: 0, applied: true });
    expect(readFileSync(streamPath(), 'utf-8')).toBe(before);
    expect(existsSync(archivePath())).toBe(false);
  });

  it('empty stream → zero plan and apply creates no files', () => {
    const result = runAuditRetention(root, 'sprint-empty', { maxCount: 1 }, true);

    expect(result).toEqual({ sprintId: 'sprint-empty', scanned: 0, keep: 0, archive: 0, prune: 0, applied: true });
    expect(existsSync(join(root, '.deckent', 'recently-works', 'sprint-empty-events.jsonl'))).toBe(false);
    expect(existsSync(join(root, '.deckent', 'recently-works', 'sprint-empty-events-archive.jsonl'))).toBe(false);
  });
});
