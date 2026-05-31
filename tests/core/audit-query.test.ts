import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { queryAudit } from '../../src/core/audit-query.js';
import type { DeckentEvent } from '../../src/orchestra/event-stream.js';

let tmpRoot: string;
const SPRINT_ID = 'sprint-test';

function writeEvents(root: string, events: DeckentEvent[]): void {
  const deckentDir = join(root, '.deckent');
  mkdirSync(deckentDir, { recursive: true });
  const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(join(deckentDir, `${SPRINT_ID}-events.jsonl`), lines, 'utf-8');
}

function makeEvent(
  overrides: Partial<DeckentEvent> & { payloadExtra?: Record<string, unknown> },
): DeckentEvent {
  const { payloadExtra, ...rest } = overrides;
  return {
    timestamp: '2026-05-31T10:00:00.000Z',
    sequence: 1,
    protocol_version: '1.0',
    source: 'brain',
    target: '*',
    channel: 'BRAIN→*:METRIC_EMITTED',
    payload: { name: 'test', value: 1, ...(payloadExtra ?? {}) },
    ...rest,
  };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'audit-query-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── Test 1 — tenant filter ────────────────────────────────────────

describe('queryAudit — tenant filter', () => {
  it('returns only events matching tenantId', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha', action: 'start' } }),
      makeEvent({ sequence: 2, payload: { tenantId: 'beta', action: 'stop' } }),
      makeEvent({ sequence: 3, payload: { tenantId: 'alpha', action: 'end' } }),
    ]);

    const result = queryAudit(tmpRoot, SPRINT_ID, { tenantId: 'alpha' });

    expect(result.totalScanned).toBe(3);
    expect(result.matched).toHaveLength(2);
    expect(result.matched.every(e => e.tenantId === 'alpha')).toBe(true);
  });

  it('returns empty array when no events match tenantId', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha' } }),
    ]);

    const result = queryAudit(tmpRoot, SPRINT_ID, { tenantId: 'nonexistent' });

    expect(result.matched).toHaveLength(0);
    expect(result.totalScanned).toBe(1);
  });
});

// ─── Test 2 — action/channel filter ───────────────────────────────

describe('queryAudit — channel filter', () => {
  it('returns only events matching the specified channel', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, channel: 'WORKER→BRAIN:RESULT' }),
      makeEvent({ sequence: 2, channel: 'BRAIN→*:SPRINT_PHASE_CHANGE' }),
      makeEvent({ sequence: 3, channel: 'WORKER→BRAIN:RESULT' }),
    ]);

    const result = queryAudit(tmpRoot, SPRINT_ID, { channel: 'WORKER→BRAIN:RESULT' });

    expect(result.matched).toHaveLength(2);
    expect(result.matched.every(e => e.channel === 'WORKER→BRAIN:RESULT')).toBe(true);
  });
});

// ─── Test 3 — time-range filter ───────────────────────────────────

describe('queryAudit — time-range filter', () => {
  it('returns only events within from/to range', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, timestamp: '2026-05-31T08:00:00.000Z' }),
      makeEvent({ sequence: 2, timestamp: '2026-05-31T10:00:00.000Z' }),
      makeEvent({ sequence: 3, timestamp: '2026-05-31T12:00:00.000Z' }),
      makeEvent({ sequence: 4, timestamp: '2026-05-31T14:00:00.000Z' }),
    ]);

    const result = queryAudit(tmpRoot, SPRINT_ID, {
      from: '2026-05-31T09:00:00.000Z',
      to: '2026-05-31T13:00:00.000Z',
    });

    expect(result.matched).toHaveLength(2);
    expect(result.matched[0]!.timestamp).toBe('2026-05-31T10:00:00.000Z');
    expect(result.matched[1]!.timestamp).toBe('2026-05-31T12:00:00.000Z');
  });
});

// ─── Test 4 — empty result (no events file) ────────────────────────

describe('queryAudit — empty result', () => {
  it('returns empty matched array when event stream does not exist', () => {
    // No event file written — just an empty tmpRoot
    const result = queryAudit(tmpRoot, SPRINT_ID, {});

    expect(result.matched).toHaveLength(0);
    expect(result.totalScanned).toBe(0);
    expect(result.sprintId).toBe(SPRINT_ID);
  });

  it('returns empty matched array when no events match combined filters', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, channel: 'WORKER→BRAIN:RESULT', payload: { tenantId: 'gamma' } }),
    ]);

    const result = queryAudit(tmpRoot, SPRINT_ID, {
      tenantId: 'gamma',
      channel: 'BRAIN→*:SPRINT_PHASE_CHANGE',
    });

    expect(result.matched).toHaveLength(0);
    expect(result.totalScanned).toBe(1);
  });
});
