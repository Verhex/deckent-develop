import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportAuditLog, verifyHmacChain } from '../../src/core/audit-export.js';
import type { AuditEntry } from '../../src/core/audit-query.js';
import type { DeckentEvent } from '../../src/orchestra/event-stream.js';

let tmpRoot: string;
const SPRINT_ID = 'sprint-test';

function writeEvents(root: string, events: DeckentEvent[]): void {
  const deckentDir = join(root, '.deckent', 'recently-works');
  mkdirSync(deckentDir, { recursive: true });
  const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(join(deckentDir, `${SPRINT_ID}-events.jsonl`), lines, 'utf-8');
}

function makeEvent(overrides: Partial<DeckentEvent> = {}): DeckentEvent {
  return {
    timestamp: '2026-05-31T10:00:00.000Z',
    sequence: 1,
    protocol_version: '1.0',
    source: 'brain',
    target: '*',
    channel: 'BRAIN→*:METRIC_EMITTED',
    payload: { tenantId: 'alpha', action: 'start' },
    ...overrides,
  };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'audit-export-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── Test 1 — JSON export ─────────────────────────────────────────

describe('exportAuditLog — json format', () => {
  it('returns valid JSON with correct entry count', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha', action: 'login' } }),
      makeEvent({ sequence: 2, payload: { tenantId: 'alpha', action: 'logout' } }),
    ]);

    const result = exportAuditLog(tmpRoot, SPRINT_ID, 'json');

    expect(result.format).toBe('json');
    expect(result.entryCount).toBe(2);
    const parsed = JSON.parse(result.data) as AuditEntry[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0].sequence).toBe(1);
    expect(parsed[1].sequence).toBe(2);
  });

  it('returns empty JSON array when no events', () => {
    writeEvents(tmpRoot, []);

    const result = exportAuditLog(tmpRoot, SPRINT_ID, 'json');

    expect(result.entryCount).toBe(0);
    expect(JSON.parse(result.data)).toEqual([]);
  });
});

// ─── Test 2 — CSV export ──────────────────────────────────────────

describe('exportAuditLog — csv format', () => {
  it('returns CSV with header and one data row per entry', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, source: 'brain', target: 'worker', channel: 'BRAIN→WORKER:TASK_ASSIGN', payload: { tenantId: 'beta' } }),
      makeEvent({ sequence: 2, source: 'worker', target: 'brain', channel: 'WORKER→BRAIN:RESULT', payload: { tenantId: 'beta' } }),
    ]);

    const result = exportAuditLog(tmpRoot, SPRINT_ID, 'csv');

    expect(result.format).toBe('csv');
    const lines = result.data.split('\n');
    expect(lines[0]).toBe('timestamp,sequence,source,target,channel,tenantId');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain('brain');
    expect(lines[2]).toContain('worker');
  });

  it('escapes commas in CSV cell values', () => {
    writeEvents(tmpRoot, [
      makeEvent({
        sequence: 1,
        channel: 'BRAIN,TEST:CHANNEL', // contains comma
        payload: { tenantId: 'alpha' },
      }),
    ]);

    const result = exportAuditLog(tmpRoot, SPRINT_ID, 'csv');

    const dataLine = result.data.split('\n')[1];
    expect(dataLine).toContain('"BRAIN,TEST:CHANNEL"');
  });
});

// ─── Test 3 — filter ──────────────────────────────────────────────

describe('exportAuditLog — filter', () => {
  it('applies tenantId filter and returns only matching entries', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha', action: 'read' } }),
      makeEvent({ sequence: 2, payload: { tenantId: 'beta', action: 'write' } }),
      makeEvent({ sequence: 3, payload: { tenantId: 'alpha', action: 'delete' } }),
    ]);

    const result = exportAuditLog(tmpRoot, SPRINT_ID, 'json', { tenantId: 'alpha' });

    expect(result.entryCount).toBe(2);
    const parsed = JSON.parse(result.data) as AuditEntry[];
    expect(parsed.every(e => e.tenantId === 'alpha')).toBe(true);
  });

  it('applies time-range filter', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, timestamp: '2026-05-01T00:00:00.000Z', payload: { tenantId: 'alpha' } }),
      makeEvent({ sequence: 2, timestamp: '2026-05-15T00:00:00.000Z', payload: { tenantId: 'alpha' } }),
      makeEvent({ sequence: 3, timestamp: '2026-05-30T00:00:00.000Z', payload: { tenantId: 'alpha' } }),
    ]);

    const result = exportAuditLog(tmpRoot, SPRINT_ID, 'json', {
      from: '2026-05-10T00:00:00.000Z',
      to: '2026-05-20T00:00:00.000Z',
    });

    expect(result.entryCount).toBe(1);
  });
});

// ─── Test 4 — HMAC chain verify ───────────────────────────────────

describe('verifyHmacChain', () => {
  it('verifies chain produced by exportAuditLog', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha' } }),
      makeEvent({ sequence: 2, payload: { tenantId: 'alpha' } }),
    ]);

    const result = exportAuditLog(tmpRoot, SPRINT_ID, 'json', {}, 'my-secret');
    const entries = JSON.parse(result.data) as AuditEntry[];

    expect(verifyHmacChain(entries, result.hmacChain, 'my-secret')).toBe(true);
  });

  it('returns false when a chain entry is tampered', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha' } }),
    ]);

    const result = exportAuditLog(tmpRoot, SPRINT_ID, 'json', {}, 'my-secret');
    const entries = JSON.parse(result.data) as AuditEntry[];
    const tamperedChain = [...result.hmacChain];
    tamperedChain[0] = 'deadbeef';

    expect(verifyHmacChain(entries, tamperedChain, 'my-secret')).toBe(false);
  });

  it('returns false when chain length differs from entries length', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha' } }),
      makeEvent({ sequence: 2, payload: { tenantId: 'alpha' } }),
    ]);

    const result = exportAuditLog(tmpRoot, SPRINT_ID, 'json');
    const entries = JSON.parse(result.data) as AuditEntry[];

    expect(verifyHmacChain(entries, result.hmacChain.slice(0, 1))).toBe(false);
  });

  it('returns false when wrong secret is used for verification', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha' } }),
    ]);

    const result = exportAuditLog(tmpRoot, SPRINT_ID, 'json', {}, 'correct-secret');
    const entries = JSON.parse(result.data) as AuditEntry[];

    expect(verifyHmacChain(entries, result.hmacChain, 'wrong-secret')).toBe(false);
  });
});
