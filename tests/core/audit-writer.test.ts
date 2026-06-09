import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeAuditEvent,
  validateAuditEvent,
  verifyAuditChain,
  _resetChainHead,
  AUDIT_EVENT_CHANNEL,
  type AuditEventPayload,
} from '../../src/core/audit-writer.js';
import { queryAudit } from '../../src/core/audit-query.js';

let tmpRoot: string;
const SPRINT_ID = 'sprint-audit-writer-test';

function ensureDeckentDir(root: string): void {
  mkdirSync(join(root, '.deckent'), { recursive: true });
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'audit-writer-'));
  ensureDeckentDir(tmpRoot);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── Test 1 — writeAuditEvent persists an event ──────────────────

describe('writeAuditEvent — basic write', () => {
  it('returns true and writes an event readable by queryAudit', () => {
    const result = writeAuditEvent(tmpRoot, SPRINT_ID, {
      tenantId: 'acme',
      actor: 'user-001',
      action: 'sprint:start',
    });

    expect(result).toBe(true);

    const query = queryAudit(tmpRoot, SPRINT_ID, { tenantId: 'acme' });
    expect(query.matched).toHaveLength(1);
    expect(query.matched[0]!.tenantId).toBe('acme');
    expect(query.matched[0]!.channel).toBe(AUDIT_EVENT_CHANNEL);
  });

  it('payload contains actor and action fields', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, {
      tenantId: 'org-x',
      actor: 'admin',
      action: 'flow:manage',
      target: 'flow-001',
      metadata: { ip: '10.0.0.1' },
    });

    const query = queryAudit(tmpRoot, SPRINT_ID, { tenantId: 'org-x' });
    expect(query.matched).toHaveLength(1);

    const payload = query.matched[0]!.payload as Record<string, unknown>;
    expect(payload['actor']).toBe('admin');
    expect(payload['action']).toBe('flow:manage');
    expect(payload['target']).toBe('flow-001');
    expect((payload['metadata'] as Record<string, unknown>)['ip']).toBe('10.0.0.1');
  });
});

// ─── Test 2 — round-trip compatibility ───────────────────────────

describe('writeAuditEvent — round-trip with queryAudit', () => {
  it('multiple events are filterable by tenantId', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'alpha', actor: 'u1', action: 'read' });
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'beta', actor: 'u2', action: 'write' });
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'alpha', actor: 'u3', action: 'delete' });

    const alphaResult = queryAudit(tmpRoot, SPRINT_ID, { tenantId: 'alpha' });
    expect(alphaResult.totalScanned).toBe(3);
    expect(alphaResult.matched).toHaveLength(2);
    expect(alphaResult.matched.every(e => e.tenantId === 'alpha')).toBe(true);

    const betaResult = queryAudit(tmpRoot, SPRINT_ID, { tenantId: 'beta' });
    expect(betaResult.matched).toHaveLength(1);
  });

  it('events are filterable by channel using the AUDIT_EVENT_CHANNEL constant', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'local', actor: 'system', action: 'boot' });

    const byChannel = queryAudit(tmpRoot, SPRINT_ID, { channel: AUDIT_EVENT_CHANNEL });
    expect(byChannel.matched.length).toBeGreaterThanOrEqual(1);
    expect(byChannel.matched.every(e => e.channel === AUDIT_EVENT_CHANNEL)).toBe(true);
  });
});

// ─── Test 3 — tenant field required ──────────────────────────────

describe('writeAuditEvent — required field validation', () => {
  it('returns false and writes no event when tenantId is missing', () => {
    // @ts-expect-error intentional test of missing required field
    const result = writeAuditEvent(tmpRoot, SPRINT_ID, { actor: 'u1', action: 'read' });
    expect(result).toBe(false);

    const query = queryAudit(tmpRoot, SPRINT_ID);
    expect(query.matched).toHaveLength(0);
    expect(query.totalScanned).toBe(0);
  });

  it('returns false when tenantId is an empty string', () => {
    const result = writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: '', actor: 'u1', action: 'read' });
    expect(result).toBe(false);
  });

  it('returns false when actor is missing', () => {
    // @ts-expect-error intentional test of missing required field
    const result = writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'local', action: 'read' });
    expect(result).toBe(false);
  });

  it('returns false when action is missing', () => {
    // @ts-expect-error intentional test of missing required field
    const result = writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'local', actor: 'u1' });
    expect(result).toBe(false);
  });
});

// ─── Test 4 — validateAuditEvent standalone ──────────────────────

describe('validateAuditEvent', () => {
  it('returns true for a fully valid event', () => {
    expect(validateAuditEvent({ tenantId: 'org', actor: 'admin', action: 'create' })).toBe(true);
  });

  it('returns true with optional fields present', () => {
    expect(
      validateAuditEvent({ tenantId: 'org', actor: 'admin', action: 'create', target: 'res', metadata: {} }),
    ).toBe(true);
  });

  it('returns false for whitespace-only tenantId', () => {
    expect(validateAuditEvent({ tenantId: '   ', actor: 'u', action: 'a' })).toBe(false);
  });

  it('returns false for whitespace-only actor', () => {
    expect(validateAuditEvent({ tenantId: 'org', actor: '  ', action: 'a' })).toBe(false);
  });

  it('returns false for whitespace-only action', () => {
    expect(validateAuditEvent({ tenantId: 'org', actor: 'u', action: '  ' })).toBe(false);
  });
});

// ─── Test 5 — hash-chain via write path ──────────────────────────

describe('verifyAuditChain — chain links intact', () => {
  beforeEach(() => {
    _resetChainHead(); // deterministic start
  });

  it('single event forms a valid chain', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'login' });

    const { matched } = queryAudit(tmpRoot, SPRINT_ID, { channel: AUDIT_EVENT_CHANNEL });
    const payloads = matched.map(e => e.payload as AuditEventPayload);

    const result = verifyAuditChain(payloads);
    expect(result.intact).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('three consecutive events form a valid chain', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'login' });
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'read' });
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'logout' });

    const { matched } = queryAudit(tmpRoot, SPRINT_ID, { channel: AUDIT_EVENT_CHANNEL });
    const payloads = matched.map(e => e.payload as AuditEventPayload);

    expect(payloads).toHaveLength(3);
    // Each event should carry chain fields
    for (const p of payloads) {
      expect(typeof p.prevHmac).toBe('string');
      expect(typeof p.hmac).toBe('string');
    }

    const result = verifyAuditChain(payloads);
    expect(result.intact).toBe(true);
  });

  it('each event links to the previous via prevHmac', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'org', actor: 'a', action: 'x' });
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'org', actor: 'b', action: 'y' });

    const { matched } = queryAudit(tmpRoot, SPRINT_ID, { channel: AUDIT_EVENT_CHANNEL });
    const payloads = matched.map(e => e.payload as AuditEventPayload);

    expect(payloads[1]!.prevHmac).toBe(payloads[0]!.hmac);
  });
});

// ─── Test 6 — tamper detection ────────────────────────────────────

describe('verifyAuditChain — tamper detection', () => {
  beforeEach(() => {
    _resetChainHead();
  });

  it('modifying a payload field breaks the chain at that index', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'login' });
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'read' });
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'logout' });

    const { matched } = queryAudit(tmpRoot, SPRINT_ID, { channel: AUDIT_EVENT_CHANNEL });
    const payloads = matched.map(e => ({ ...(e.payload as AuditEventPayload) }));

    // Tamper the second event's action field
    payloads[1] = { ...payloads[1]!, action: 'TAMPERED' };

    const result = verifyAuditChain(payloads);
    expect(result.intact).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('modifying the first event breaks the chain at index 0', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'org', actor: 'x', action: 'do' });

    const { matched } = queryAudit(tmpRoot, SPRINT_ID, { channel: AUDIT_EVENT_CHANNEL });
    const payloads = matched.map(e => ({ ...(e.payload as AuditEventPayload) }));

    payloads[0] = { ...payloads[0]!, actor: 'EVIL' };

    const result = verifyAuditChain(payloads);
    expect(result.intact).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  it('injecting a foreign event with wrong prevHmac breaks the chain', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'org', actor: 'u', action: 'a' });
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'org', actor: 'u', action: 'b' });

    const { matched } = queryAudit(tmpRoot, SPRINT_ID, { channel: AUDIT_EVENT_CHANNEL });
    const payloads = matched.map(e => ({ ...(e.payload as AuditEventPayload) }));

    // Inject a foreign event at index 1 with a wrong prevHmac
    const foreign: AuditEventPayload = {
      tenantId: 'org',
      actor: 'attacker',
      action: 'inject',
      timestamp: new Date().toISOString(),
      prevHmac: 'deadbeef0000000000000000000000000000000000000000000000000000000',
      hmac: 'deadbeef1111111111111111111111111111111111111111111111111111111',
    };
    payloads.splice(1, 0, foreign);

    const result = verifyAuditChain(payloads);
    expect(result.intact).toBe(false);
    expect(result.brokenAt).toBe(1);
  });
});

// ─── Test 7 — missing-hmac backward-safe ─────────────────────────

describe('verifyAuditChain — missing-hmac backward-safe', () => {
  it('empty array returns intact: true', () => {
    const result = verifyAuditChain([]);
    expect(result.intact).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('legacy events without hmac are skipped (intact)', () => {
    const legacyEvents = [
      { tenantId: 'org', actor: 'u1', action: 'read' },
      { tenantId: 'org', actor: 'u2', action: 'write' },
    ];

    const result = verifyAuditChain(legacyEvents);
    expect(result.intact).toBe(true);
  });

  it('mix of legacy and chained events: chain portion is verified', () => {
    _resetChainHead();
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'org', actor: 'u', action: 'x' });

    const { matched } = queryAudit(tmpRoot, SPRINT_ID, { channel: AUDIT_EVENT_CHANNEL });
    const chained = matched.map(e => e.payload as AuditEventPayload);

    // Prepend a legacy event (no hmac field)
    const legacy = { tenantId: 'org', actor: 'old', action: 'legacy' };
    const mixed = [legacy, ...chained];

    const result = verifyAuditChain(mixed);
    expect(result.intact).toBe(true);
  });
});
