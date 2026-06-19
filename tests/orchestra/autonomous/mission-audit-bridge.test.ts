import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  auditMissionLifecycle,
  readMissionAudit,
  MISSION_AUDIT_PARTITION,
} from '../../../src/orchestra/autonomous/mission-store/mission-audit-bridge.js';
import { writeAuditEvent, verifyAuditChain, _resetChainHead } from '../../../src/core/audit-writer.js';

// Hermetic: every test writes/reads under a fresh tmpdir projectRoot, and the
// module-level hmac chain head is reset for deterministic chain verification.
// Real writeAuditEvent / readAuditEvents are used — no mocks.

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'mission-audit-'));
  mkdirSync(join(tmpRoot, '.deckent'), { recursive: true });
  _resetChainHead(); // deterministic chain start
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── (a) write → read round-trip ────────────────────────────────────────────

describe('auditMissionLifecycle → readMissionAudit (round-trip)', () => {
  it('persists a mission lifecycle event readable by readMissionAudit', () => {
    auditMissionLifecycle(tmpRoot, {
      tenantId: 'acme',
      actor: 'cli',
      action: 'missions:create',
      missionId: 'list-001',
      metadata: { kind: 'list', title: 'audit smoke' },
    });

    const events = readMissionAudit(tmpRoot);
    expect(events).toHaveLength(1);

    const e = events[0]!;
    expect(e.tenantId).toBe('acme');
    expect(e.actor).toBe('cli');
    expect(e.action).toBe('missions:create');
    expect(e.target).toBe('list-001');
    expect((e.metadata as Record<string, unknown>)['kind']).toBe('list');

    // hmac-chain fields are present (tamper-evident).
    expect(typeof e.prevHmac).toBe('string');
    expect(typeof e.hmac).toBe('string');
  });

  it('writes under the stable autonomous-missions partition', () => {
    expect(MISSION_AUDIT_PARTITION).toBe('autonomous-missions');
    auditMissionLifecycle(tmpRoot, {
      tenantId: 'local',
      actor: 'scheduler',
      action: 'missions:settle',
      missionId: 'goal-9',
      metadata: { status: 'completed', ok: true },
    });
    const events = readMissionAudit(tmpRoot);
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe('missions:settle');
  });
});

// ─── (b) two consecutive events → hmac chain linked ──────────────────────────

describe('tamper-evident hmac chain', () => {
  it('links two consecutive events via prevHmac/hmac', () => {
    auditMissionLifecycle(tmpRoot, {
      tenantId: 'acme',
      actor: 'cli',
      action: 'missions:create',
      missionId: 'm-1',
    });
    auditMissionLifecycle(tmpRoot, {
      tenantId: 'acme',
      actor: 'scheduler',
      action: 'missions:settle',
      missionId: 'm-1',
      metadata: { status: 'completed', ok: true },
    });

    const events = readMissionAudit(tmpRoot);
    expect(events).toHaveLength(2);
    // Second event's prevHmac must equal the first event's hmac.
    expect(events[1]!.prevHmac).toBe(events[0]!.hmac);
    // Whole chain verifies intact (from genesis).
    expect(verifyAuditChain(events).intact).toBe(true);
  });
});

// ─── (c) fail-safe — never throws on a broken projectRoot ────────────────────

describe('fail-safe', () => {
  it('does not throw when the projectRoot is unwritable (ENOTDIR ancestor)', () => {
    // Make an ancestor a regular file so the audit write hits ENOTDIR — the
    // bridge must swallow it and never throw.
    const blocker = join(tmpRoot, 'blocker');
    writeFileSync(blocker, 'not-a-dir', 'utf-8');
    const brokenRoot = join(blocker, 'sub');

    expect(() =>
      auditMissionLifecycle(brokenRoot, {
        tenantId: 'acme',
        actor: 'cli',
        action: 'missions:create',
        missionId: 'm-x',
      }),
    ).not.toThrow();
  });
});

// ─── (d) readMissionAudit filters to missions:-prefixed actions ──────────────

describe('readMissionAudit — action prefix filter', () => {
  it('returns only missions:-prefixed actions on the shared partition', () => {
    // A non-mission audit event written to the SAME partition must be excluded.
    writeAuditEvent(tmpRoot, MISSION_AUDIT_PARTITION, {
      tenantId: 'acme',
      actor: 'auditor',
      action: 'sprint:start',
      target: 'other',
    });
    auditMissionLifecycle(tmpRoot, {
      tenantId: 'acme',
      actor: 'cli',
      action: 'missions:create',
      missionId: 'm-2',
    });

    const events = readMissionAudit(tmpRoot);
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe('missions:create');
    expect(events.every((e) => e.action.startsWith('missions:'))).toBe(true);
  });
});
