import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeAuditSink } from '../../src/orchestra/autonomous/audit-adapter.js';
import type { AuditRecord } from '../../src/orchestra/autonomous-runtime.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    triggerId: 'trigger-001',
    action: 'mrp.refresh',
    requestedBy: 'tenant-acme',
    outcome: 'executed',
    reason: 'action executed',
    timestamp: '2026-06-04T00:00:00.000Z',
    ...overrides,
  };
}

function readEvents(root: string, sprintId: string = 'autonomous'): unknown[] {
  const filePath = join(root, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l));
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('makeAuditSink', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-audit-adapter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('record writes an event to the stream file (record→event written)', () => {
    const sink = makeAuditSink(testRoot);
    sink.record(makeRecord());

    const events = readEvents(testRoot);
    expect(events).toHaveLength(1);
  });

  it('all AuditRecord fields are preserved in the event payload', () => {
    const sink = makeAuditSink(testRoot);
    const record = makeRecord({
      triggerId: 'trig-42',
      action: 'deploy.run',
      requestedBy: 'tenant-xyz',
      outcome: 'denied',
      reason: 'RBAC: denied',
      timestamp: '2026-01-15T10:00:00.000Z',
    });
    sink.record(record);

    const events = readEvents(testRoot) as Array<{ payload: AuditRecord }>;
    const payload = events[0]!.payload;
    expect(payload.triggerId).toBe('trig-42');
    expect(payload.action).toBe('deploy.run');
    expect(payload.requestedBy).toBe('tenant-xyz');
    expect(payload.outcome).toBe('denied');
    expect(payload.reason).toBe('RBAC: denied');
    expect(payload.timestamp).toBe('2026-01-15T10:00:00.000Z');
  });

  it('each record() call is tmpdir-isolated — second sink sees zero events', () => {
    const sinkA = makeAuditSink(testRoot);
    sinkA.record(makeRecord({ triggerId: 'a-1' }));
    sinkA.record(makeRecord({ triggerId: 'a-2' }));

    const rootB = join(tmpdir(), `deckent-audit-adapter-test-B-${Date.now()}`);
    mkdirSync(join(rootB, '.deckent'), { recursive: true });
    try {
      const eventsB = readEvents(rootB);
      expect(eventsB).toHaveLength(0);

      const eventsA = readEvents(testRoot);
      expect(eventsA).toHaveLength(2);
    } finally {
      try { rmSync(rootB, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  });
});
