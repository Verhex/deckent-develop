import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, createHmac } from 'node:crypto';
import {
  writeAuditEvent,
  validateAuditEvent,
  verifyAuditChain,
  _resetChainHead,
  AUDIT_EVENT_CHANNEL,
  AUDIT_HMAC_SECRET,
  GENESIS_HMAC,
  canonicalJson,
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

// ─── Test 7 — A21: per-stream chain isolation (regression) ─────────
//
// Pre-fix: a single module-level chain head was shared across EVERY
// (projectRoot, sprintId). A second stream written in the same process chained
// its first event off the first stream's head (≠ GENESIS), so verifyAuditChain
// — which anchors index 0 at GENESIS — reported brokenAt:0 for it. These tests
// fail against the singleton and pass once the head is scoped per stream.

describe('verifyAuditChain — A21 per-stream chain isolation', () => {
  beforeEach(() => {
    _resetChainHead(); // clear all stream heads — deterministic GENESIS start
  });

  it('a second sprint stream written after a first still anchors at GENESIS', () => {
    // Stream A advances its own head within this process.
    writeAuditEvent(tmpRoot, 'sprint-A', { tenantId: 'acme', actor: 'u1', action: 'login' });
    writeAuditEvent(tmpRoot, 'sprint-A', { tenantId: 'acme', actor: 'u1', action: 'read' });

    // Stream B: a DIFFERENT sprint in the SAME process, no reset between.
    // Pre-fix this inherited sprint-A's head and broke at index 0.
    writeAuditEvent(tmpRoot, 'sprint-B', { tenantId: 'acme', actor: 'u2', action: 'deploy' });

    const { matched } = queryAudit(tmpRoot, 'sprint-B', { channel: AUDIT_EVENT_CHANNEL });
    const payloads = matched.map(e => e.payload as AuditEventPayload);

    const result = verifyAuditChain(payloads);
    expect(result.intact).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('a non-sprint audit partition interleaved with a sprint keeps each chain intact', () => {
    // Real-world: the autonomous loop writes to the 'autonomous' partition while
    // a sprint writes to 'sprint-X' — both via writeAuditEvent in one process.
    writeAuditEvent(tmpRoot, 'autonomous', { tenantId: 'local', actor: 'loop', action: 'tick' });
    writeAuditEvent(tmpRoot, 'sprint-X', { tenantId: 'local', actor: 'brain', action: 'eval' });
    writeAuditEvent(tmpRoot, 'autonomous', { tenantId: 'local', actor: 'loop', action: 'tick' });

    for (const stream of ['autonomous', 'sprint-X']) {
      const { matched } = queryAudit(tmpRoot, stream, { channel: AUDIT_EVENT_CHANNEL });
      const payloads = matched.map(e => e.payload as AuditEventPayload);
      const result = verifyAuditChain(payloads);
      expect(result.intact, `stream ${stream} chain should be intact`).toBe(true);
    }
  });

  it('restart that appends to an existing sprint stays contiguous (disk-seed)', () => {
    // First "process": two events, then simulate a restart by clearing the
    // in-memory heads. The on-disk chain already anchors at GENESIS.
    writeAuditEvent(tmpRoot, 'sprint-R', { tenantId: 'acme', actor: 'u1', action: 'a' });
    writeAuditEvent(tmpRoot, 'sprint-R', { tenantId: 'acme', actor: 'u1', action: 'b' });

    _resetChainHead(); // restart: in-memory heads gone, disk persists

    // Second "process": append — must seed from the last persisted hmac, not
    // GENESIS (pre-fix this wrote a second GENESIS-anchored event mid-stream).
    writeAuditEvent(tmpRoot, 'sprint-R', { tenantId: 'acme', actor: 'u1', action: 'c' });

    const { matched } = queryAudit(tmpRoot, 'sprint-R', { channel: AUDIT_EVENT_CHANNEL });
    const payloads = matched.map(e => e.payload as AuditEventPayload);

    expect(payloads).toHaveLength(3);
    const result = verifyAuditChain(payloads);
    expect(result.intact).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });
});

// ─── Test 8 — 323-013: export-compatible keyed-HMAC chain algorithm ──
//
// Faithful regression. The writer historically computed its chain `hmac` with
// UNKEYED sha256 (createHash), while audit-export.ts verifies with a KEYED
// HMAC-SHA256 (createHmac, default secret 'deckent-audit') — incompatible
// primitives, so a written record could not be verified under the export's
// algorithm ("export-verify FAIL"). Pre-fix the toBe(expectedHmac) assertion
// FAILS (stored value is unkeyed sha256); post-fix it passes.

describe('writeAuditEvent — 323-013 export-compatible HMAC chain algorithm', () => {
  beforeEach(() => {
    _resetChainHead();
  });

  /** Rebuild the authenticated base exactly as the writer hashes it: strip only
   *  the chain links (prevHmac/hmac); chainVersion stays in (it is authenticated). */
  function authenticatedBase(p: AuditEventPayload): Record<string, unknown> {
    const base: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) {
      if (k !== 'hmac' && k !== 'prevHmac') base[k] = v;
    }
    return base;
  }

  it('written hmac is keyed HMAC-SHA256 with the shared export secret, not unkeyed sha256', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'login' });

    const { matched } = queryAudit(tmpRoot, SPRINT_ID, { channel: AUDIT_EVENT_CHANNEL });
    const p = matched[0]!.payload as AuditEventPayload;

    const data = p.prevHmac! + canonicalJson(authenticatedBase(p));
    const expectedKeyed = createHmac('sha256', AUDIT_HMAC_SECRET).update(data).digest('hex');
    const legacyUnkeyed = createHash('sha256').update(data).digest('hex');

    // Same keyed-HMAC primitive + secret as audit-export → export-verifiable.
    expect(p.hmac).toBe(expectedKeyed);
    // Provably NOT the pre-fix unkeyed sha256 algorithm.
    expect(p.hmac).not.toBe(legacyUnkeyed);
    expect(p.chainVersion).toBe(2);
  });

  it('the writer-shared secret matches audit-export.ts default secret', () => {
    // The two modules must default to the SAME secret for cross-module
    // verifiability. This pins the literal that audit-export.ts hard-defaults to.
    expect(AUDIT_HMAC_SECRET).toBe('deckent-audit');
  });

  it('an independent verifier recomputes a multi-event chain entirely from the keyed HMAC', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'login' });
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'read' });
    writeAuditEvent(tmpRoot, SPRINT_ID, { tenantId: 'acme', actor: 'u1', action: 'logout' });

    const { matched } = queryAudit(tmpRoot, SPRINT_ID, { channel: AUDIT_EVENT_CHANNEL });
    const payloads = matched.map(e => e.payload as AuditEventPayload);

    let prev = GENESIS_HMAC;
    for (const p of payloads) {
      expect(p.prevHmac).toBe(prev);
      const data = p.prevHmac! + canonicalJson(authenticatedBase(p));
      const recomputed = createHmac('sha256', AUDIT_HMAC_SECRET).update(data).digest('hex');
      expect(p.hmac).toBe(recomputed);
      prev = p.hmac!;
    }
  });
});

// ─── Test 9 — 323-013: versioned-chain backward-compat / migration ──
//
// Switching the live algorithm to keyed HMAC must NOT make pre-323-013 records
// (unkeyed sha256, no chainVersion) unverifiable. verifyAuditChain selects the
// algorithm per record from its `chainVersion` (absent → v1), so legacy streams
// and streams that migrated v1→v2 mid-chain both verify, while tamper-evidence
// is preserved on every version.

describe('verifyAuditChain — 323-013 versioned-chain backward-compat', () => {
  /** Hand-build a legacy v1 record: unkeyed sha256, NO chainVersion field. */
  function legacyV1Event(base: Record<string, unknown>, prevHmac: string): AuditEventPayload {
    const hmac = createHash('sha256').update(prevHmac + canonicalJson(base)).digest('hex');
    return { ...base, prevHmac, hmac } as AuditEventPayload;
  }

  /** Hand-build a v2 record: keyed HMAC, chainVersion:2 authenticated. */
  function v2Event(base: Record<string, unknown>, prevHmac: string): AuditEventPayload {
    const withVer = { ...base, chainVersion: 2 };
    const hmac = createHmac('sha256', AUDIT_HMAC_SECRET)
      .update(prevHmac + canonicalJson(withVer))
      .digest('hex');
    return { ...withVer, prevHmac, hmac } as AuditEventPayload;
  }

  it('a legacy v1 (unkeyed sha256) record still verifies intact', () => {
    const ev = legacyV1Event(
      { tenantId: 'org', actor: 'old', action: 'legacy-act', timestamp: '2026-01-01T00:00:00.000Z' },
      GENESIS_HMAC,
    );
    const result = verifyAuditChain([ev]);
    expect(result.intact).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('a stream that migrated v1 → v2 mid-chain verifies end-to-end', () => {
    const e1 = legacyV1Event(
      { tenantId: 'org', actor: 'old', action: 'a', timestamp: '2026-01-01T00:00:00.000Z' },
      GENESIS_HMAC,
    );
    const e2 = v2Event(
      { tenantId: 'org', actor: 'new', action: 'b', timestamp: '2026-01-02T00:00:00.000Z' },
      e1.hmac!, // v2 record links to the legacy head
    );
    const e3 = v2Event(
      { tenantId: 'org', actor: 'new', action: 'c', timestamp: '2026-01-03T00:00:00.000Z' },
      e2.hmac!,
    );

    const result = verifyAuditChain([e1, e2, e3]);
    expect(result.intact).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('tampering a migrated v2 record still breaks the chain (tamper-evidence preserved)', () => {
    const e1 = legacyV1Event(
      { tenantId: 'org', actor: 'old', action: 'a', timestamp: '2026-01-01T00:00:00.000Z' },
      GENESIS_HMAC,
    );
    const e2 = v2Event(
      { tenantId: 'org', actor: 'new', action: 'b', timestamp: '2026-01-02T00:00:00.000Z' },
      e1.hmac!,
    );
    const tampered = { ...e2, action: 'TAMPERED' } as AuditEventPayload;

    const result = verifyAuditChain([e1, tampered]);
    expect(result.intact).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('relabeling a v2 record as chainVersion:1 fails (algorithm is bound to the authenticated version)', () => {
    const ev = v2Event(
      { tenantId: 'org', actor: 'u', action: 'a', timestamp: '2026-01-01T00:00:00.000Z' },
      GENESIS_HMAC,
    );
    // Keep the v2 HMAC but flip the declared version → verify recomputes with the
    // v1 (unkeyed) algorithm over a base that now says chainVersion:1 → mismatch.
    const downgraded = { ...ev, chainVersion: 1 } as AuditEventPayload;

    const result = verifyAuditChain([downgraded]);
    expect(result.intact).toBe(false);
    expect(result.brokenAt).toBe(0);
  });
});
