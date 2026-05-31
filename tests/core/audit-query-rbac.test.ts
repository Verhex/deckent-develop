import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { queryAudit } from '../../src/core/audit-query.js';
import { can, Permission } from '../../src/core/rbac.js';
import type { DeckentEvent } from '../../src/orchestra/event-stream.js';

let tmpRoot: string;
const SPRINT_ID = 'sprint-rbac-test';

function writeEvents(root: string, events: DeckentEvent[]): void {
  const deckentDir = join(root, '.deckent');
  mkdirSync(deckentDir, { recursive: true });
  const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(join(deckentDir, `${SPRINT_ID}-events.jsonl`), lines, 'utf-8');
}

function makeEvent(overrides: Partial<DeckentEvent>): DeckentEvent {
  return {
    timestamp: '2026-05-31T10:00:00.000Z',
    sequence: 1,
    protocol_version: '1.0',
    source: 'brain',
    target: '*',
    channel: 'BRAIN→*:METRIC_EMITTED',
    payload: { name: 'test', value: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'audit-query-rbac-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── Test 1: viewer audit-read izin ───────────────────────────────

describe('RBAC — viewer audit-read izin', () => {
  it('viewer role (has READ permission) can query audit events', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha', action: 'start' } }),
      makeEvent({ sequence: 2, payload: { tenantId: 'alpha', action: 'end' } }),
    ]);

    const result = queryAudit(tmpRoot, SPRINT_ID, { tenantId: 'alpha' }, 'viewer');

    expect(result.sprintId).toBe(SPRINT_ID);
    expect(result.matched).toHaveLength(2);
    expect(result.totalScanned).toBe(2);
  });

  it('viewer role without tenantId in query defaults to local tenant', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { action: 'heartbeat' } }),
    ]);

    // viewer has READ permission on 'local' tenant (default) — gate should pass
    const result = queryAudit(tmpRoot, SPRINT_ID, {}, 'viewer');

    expect(result.sprintId).toBe(SPRINT_ID);
    // gate passed — events were scanned (even if none match local tenantId filter)
    expect(result.totalScanned).toBe(1);
  });
});

// ─── Test 2: viewer write reddi ───────────────────────────────────

describe('RBAC — viewer write reddi', () => {
  it('viewer role does NOT have WRITE permission (can() returns false)', () => {
    // Verify the RBAC gate correctly rejects WRITE for viewer
    expect(can('viewer', Permission.WRITE, 'alpha')).toBe(false);
    expect(can('viewer', Permission.ADMIN, 'alpha')).toBe(false);
    expect(can('viewer', Permission.EXECUTE, 'alpha')).toBe(false);
  });

  it('invalid role is rejected by RBAC gate — queryAudit returns empty', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha' } }),
    ]);

    // 'unknown-role' is not a valid Role → can() returns false → gate blocks
    const result = queryAudit(tmpRoot, SPRINT_ID, { tenantId: 'alpha' }, 'unknown-role');

    expect(result.matched).toHaveLength(0);
    expect(result.totalScanned).toBe(0);
  });
});

// ─── Test 3: admin tümü ───────────────────────────────────────────

describe('RBAC — admin tümü', () => {
  it('admin role can query audit events (has all permissions)', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha', action: 'start' } }),
      makeEvent({ sequence: 2, payload: { tenantId: 'alpha', action: 'end' } }),
      makeEvent({ sequence: 3, payload: { tenantId: 'alpha', action: 'cleanup' } }),
    ]);

    const result = queryAudit(tmpRoot, SPRINT_ID, { tenantId: 'alpha' }, 'admin');

    expect(result.matched).toHaveLength(3);
    expect(result.totalScanned).toBe(3);
  });

  it('admin has READ, WRITE, EXECUTE, AUDIT and ADMIN permissions', () => {
    expect(can('admin', Permission.READ, 'alpha')).toBe(true);
    expect(can('admin', Permission.WRITE, 'alpha')).toBe(true);
    expect(can('admin', Permission.EXECUTE, 'alpha')).toBe(true);
    expect(can('admin', Permission.AUDIT, 'alpha')).toBe(true);
    expect(can('admin', Permission.ADMIN, 'alpha')).toBe(true);
  });
});

// ─── Test 4: tenant izolasyon ─────────────────────────────────────

describe('RBAC — tenant izolasyon', () => {
  it('invalid tenantId in query is rejected by RBAC gate (fail-closed)', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha' } }),
    ]);

    // 'INVALID!!' fails isValidTenantId → can() returns false → gate blocks
    const result = queryAudit(tmpRoot, SPRINT_ID, { tenantId: 'INVALID!!' }, 'viewer');

    expect(result.matched).toHaveLength(0);
    expect(result.totalScanned).toBe(0);
  });

  it('no role (undefined) bypasses gate — existing behavior preserved', () => {
    writeEvents(tmpRoot, [
      makeEvent({ sequence: 1, payload: { tenantId: 'alpha' } }),
      makeEvent({ sequence: 2, payload: { tenantId: 'beta' } }),
    ]);

    // No role → gate skipped → backward compat
    const result = queryAudit(tmpRoot, SPRINT_ID, {});

    expect(result.totalScanned).toBe(2);
    expect(result.matched).toHaveLength(2);
  });
});
