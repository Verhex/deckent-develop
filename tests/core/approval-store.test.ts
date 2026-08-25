// ─── ApprovalStore tests (APR-STORE, task 353-002) ───────────────────────────
// Faithful behavior tests for the durable, restart-survive approval index:
// disk-only categorization, atomic transition(), prune(), and compatibility
// with the EXACT file shapes `ApprovalBroker` (approval-broker.ts) writes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ApprovalStore,
  ApprovalStoreError,
  type ApprovalStoreSnapshot,
} from '../../src/core/approval-store.js';
import { ApprovalBroker, ApprovalBrokerError } from '../../src/core/approval-broker.js';
import type { ApprovalRequestInput } from '../../src/core/approval-broker.js';
import type { ApprovalDecision, ApprovalRequest } from '../../src/core/approval-contract.js';

const CREATED_AT = '2099-07-01T21:00:00.000Z';
const FIXED_NOW = new Date('2099-07-01T21:05:00.000Z');

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-353-002' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-353',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: '2099-07-01T21:15:00.000Z',
    ...overrides,
  };
}

function idsOf(entries: ApprovalStoreSnapshot[keyof ApprovalStoreSnapshot]): string[] {
  return entries.map((e) => e.request.id).sort();
}

let projectRoot: string;
let storeDir: string;
let broker: ApprovalBroker;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-store-'));
  storeDir = join(projectRoot, 'approvals');
  broker = new ApprovalBroker(projectRoot, { storeDir });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── construction / default storeDir (schema compat) ─────────────────────────

describe('ApprovalStore — construction', () => {
  it('defaults storeDir to the same path ApprovalBroker defaults to', () => {
    const defaultRoot = mkdtempSync(join(tmpdir(), 'approval-store-default-'));
    try {
      const defaultBroker = new ApprovalBroker(defaultRoot);
      // Far-future expiresAt — this test asserts the default STOREDIR PATH,
      // not time-based categorization, so it must stay pending under the
      // real wall-clock `now` the constructor defaults to.
      defaultBroker.submit(buildRequest('apr-default-1', { expiresAt: '2100-01-01T00:00:00.000Z' }));

      const store = new ApprovalStore(defaultRoot);
      expect(idsOf(store.load().pending)).toEqual(['apr-default-1']);
      expect(existsSync(join(defaultRoot, '.deckent', 'approvals', 'apr-default-1.request.json'))).toBe(true);
    } finally {
      rmSync(defaultRoot, { recursive: true, force: true });
    }
  });

  it('keeps a missing storeDir lazy and starts with an empty snapshot', () => {
    const storeDir = join(projectRoot, 'fresh-approvals');
    const store = new ApprovalStore(projectRoot, { storeDir });
    expect(existsSync(storeDir)).toBe(false);
    expect(store.load()).toEqual({
      pending: [], approved: [], denied: [], expired: [], quarantined: [],
    });
  });
});

// ─── load / categorization against REAL broker-written fixtures ─────────────

describe('ApprovalStore — categorization from broker-written fixtures', () => {
  it('categorizes a still-open request as pending', () => {
    const req = broker.submit(buildRequest('apr-pending-1'));
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);

    expect(idsOf(store.load().pending)).toEqual([req.id]);
    expect(store.load().pending[0]!.decision).toBeNull();
  });

  it('categorizes an overdue, unswept request as expired (time-only, no decision file)', () => {
    broker.submit(buildRequest('apr-overdue-1', { expiresAt: '2099-07-01T21:00:01.000Z' }));
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(new Date('2099-07-01T22:00:00.000Z'));

    expect(idsOf(store.load().expired)).toEqual(['apr-overdue-1']);
    expect(store.load().expired[0]!.decision).toBeNull();
    expect(store.load().pending).toEqual([]);
  });

  it('categorizes a broker.decide("allow") result as approved', () => {
    const req = broker.submit(buildRequest('apr-allow-1'));
    broker.decide(req.id, { decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: FIXED_NOW.toISOString() });

    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);
    expect(idsOf(store.load().approved)).toEqual([req.id]);
    expect(store.load().approved[0]!.decision?.decision).toBe('allow');
  });

  it('categorizes broker.decide("deny"/"defer"/"escalate") results as denied', () => {
    const r1 = broker.submit(buildRequest('apr-deny-1'));
    const r2 = broker.submit(buildRequest('apr-deny-2'));
    const r3 = broker.submit(buildRequest('apr-deny-3'));
    broker.decide(r1.id, { decision: 'deny', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
    broker.decide(r2.id, { decision: 'defer', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
    broker.decide(r3.id, { decision: 'escalate', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });

    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);
    expect(idsOf(store.load().denied)).toEqual(['apr-deny-1', 'apr-deny-2', 'apr-deny-3']);
  });

  it('categorizes a broker.expire() TTL sweep as expired (channel ttl-expire)', () => {
    const req = broker.submit(buildRequest('apr-ttl-1', { defaultAction: 'deny' }));
    broker.expire(new Date('2099-07-01T21:20:00.000Z'));

    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(new Date('2099-07-01T21:25:00.000Z'));
    expect(idsOf(store.load().expired)).toEqual([req.id]);
    expect(store.load().expired[0]!.decision?.channel).toBe('ttl-expire');
  });

  it('static load(dir) is a pure one-shot equivalent of index()', () => {
    const req = broker.submit(buildRequest('apr-static-1'));
    const snapshot = ApprovalStore.load(storeDir, FIXED_NOW);
    expect(idsOf(snapshot.pending)).toEqual([req.id]);
  });

  it('skips a torn (invalid JSON) request file instead of throwing', () => {
    writeFileSync(join(storeDir, 'apr-torn.request.json'), '{"id": "apr-torn",', 'utf-8');
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);
    expect(store.load().pending).toEqual([]);
  });

  it('skips a decision file with no matching request file', () => {
    const orphan: ApprovalDecision = {
      requestId: 'apr-orphan',
      decision: 'allow',
      decidedBy: 'x',
      channel: 'cli',
      decidedAt: FIXED_NOW.toISOString(),
      reason: '',
    };
    writeFileSync(join(storeDir, 'apr-orphan.decision.json'), JSON.stringify(orphan), 'utf-8');
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);
    const all = [...store.load().pending, ...store.load().approved, ...store.load().denied, ...store.load().expired];
    expect(all).toEqual([]);
  });
});

// ─── restart-survive: a brand-new instance rebuilds full state from disk ─────

describe('ApprovalStore — restart simulation', () => {
  it('a brand-new instance recovers the exact same categorized state purely from disk', () => {
    const pending = broker.submit(buildRequest('apr-restart-pending', { expiresAt: '2099-07-01T22:00:00.000Z' }));
    const approved = broker.submit(buildRequest('apr-restart-approved'));
    broker.decide(approved.id, { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
    const denied = broker.submit(buildRequest('apr-restart-denied'));
    broker.decide(denied.id, { decision: 'deny', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
    broker.submit(buildRequest('apr-restart-ttl', { defaultAction: 'allow' }));
    broker.expire(new Date('2099-07-01T21:20:00.000Z'));

    // "Restart" = throw away every in-memory reference and construct fresh.
    const restarted = new ApprovalStore(projectRoot, { storeDir });
    restarted.index(new Date('2099-07-01T21:25:00.000Z'));
    const snap = restarted.load();

    expect(idsOf(snap.pending)).toEqual([pending.id]);
    expect(idsOf(snap.approved)).toEqual([approved.id]);
    expect(idsOf(snap.denied)).toEqual([denied.id]);
    expect(idsOf(snap.expired)).toEqual(['apr-restart-ttl']);
  });

  it('index() re-syncs an existing instance after an external writer touches storeDir', () => {
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);
    expect(store.load().pending).toEqual([]);

    // A second broker instance simulates a different process writing to the
    // SAME shared storeDir.
    const req = broker.submit(buildRequest('apr-external-1'));
    expect(store.load().pending).toEqual([]); // stale cache, not yet re-synced

    store.index(FIXED_NOW);
    expect(idsOf(store.load().pending)).toEqual([req.id]);
  });
});

// ─── transition ───────────────────────────────────────────────────────────────

describe('ApprovalStore.transition', () => {
  it('writes an "approved" decision atomically at the broker-compatible path', () => {
    const req = broker.submit(buildRequest('apr-trans-approve'));
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);

    const decision = store.transition(req.id, 'approved', {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'dashboard',
      decidedAt: FIXED_NOW.toISOString(),
    });

    expect(decision.requestId).toBe(req.id);
    const onDisk = JSON.parse(readFileSync(join(storeDir, `${req.id}.decision.json`), 'utf-8'));
    expect(onDisk).toEqual(decision);

    const leftoverTmp = readdirSync(storeDir).filter((f) => f.endsWith('.tmp'));
    expect(leftoverTmp).toEqual([]);

    expect(idsOf(store.load().approved)).toEqual([req.id]);
  });

  it('a decision transition()-written by the store is discovered by a live broker sharing storeDir', async () => {
    const req = broker.submit(buildRequest('apr-trans-discover'));
    const waiting = broker.awaitDecision(req.id);

    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);
    const decision = store.transition(req.id, 'denied', {
      decision: 'deny',
      decidedBy: 'alperen',
      channel: 'dashboard',
      decidedAt: FIXED_NOW.toISOString(),
    });

    expect(broker.checkForExternalDecisions()).toEqual([decision]);
    await expect(waiting).resolves.toEqual(decision);
  });

  it('writes an "expired" decision (channel ttl-expire) for an overdue pending request', () => {
    broker.submit(buildRequest('apr-trans-expire', { expiresAt: '2099-07-01T21:00:01.000Z' }));
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(new Date('2099-07-01T22:00:00.000Z'));

    const decision = store.transition('apr-trans-expire', 'expired', {
      decision: 'deny', decidedBy: 'system', channel: 'ttl-expire',
      decidedAt: new Date('2099-07-01T22:00:00.000Z').toISOString(),
    });

    expect(decision.channel).toBe('ttl-expire');
    expect(idsOf(store.load().expired)).toEqual(['apr-trans-expire']);
  });

  it('rejects transition() to "expired" without channel ttl-expire (category mismatch)', () => {
    const req = broker.submit(buildRequest('apr-trans-mismatch-1'));
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);

    expect(() =>
      store.transition(req.id, 'expired', { decision: 'deny', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() }),
    ).toThrow(ApprovalStoreError);
  });

  it('rejects transition() to "approved" with a non-allow decision (category mismatch)', () => {
    const req = broker.submit(buildRequest('apr-trans-mismatch-2'));
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);

    try {
      store.transition(req.id, 'approved', { decision: 'deny', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalStoreError);
      expect((err as ApprovalStoreError).code).toBe('APR_STORE_CATEGORY_MISMATCH');
    }
  });

  it('rejects transition() for an unknown id', () => {
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);
    try {
      store.transition('does-not-exist', 'approved', { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalStoreError);
      expect((err as ApprovalStoreError).code).toBe('APR_STORE_UNKNOWN_ID');
    }
  });

  it('rejects transition() for an already-decided id', () => {
    const req = broker.submit(buildRequest('apr-trans-already'));
    broker.decide(req.id, { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });

    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);
    try {
      store.transition(req.id, 'denied', { decision: 'deny', decidedBy: 'b', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalStoreError);
      expect((err as ApprovalStoreError).code).toBe('APR_STORE_ALREADY_TERMINAL');
    }
  });

  it('two stale store instances preserve the first terminal decision', () => {
    const req = broker.submit(buildRequest('apr-trans-race'));
    const storeA = new ApprovalStore(projectRoot, { storeDir });
    const storeB = new ApprovalStore(projectRoot, { storeDir });
    storeA.index(FIXED_NOW);
    storeB.index(FIXED_NOW);

    const winner = storeA.transition(req.id, 'approved', {
      decision: 'allow', decidedBy: 'first', channel: 'terminal', decidedAt: FIXED_NOW.toISOString(),
    });

    expect(() => storeB.transition(req.id, 'denied', {
      decision: 'deny', decidedBy: 'second', channel: 'dashboard', decidedAt: FIXED_NOW.toISOString(),
    })).toThrow(ApprovalStoreError);
    try {
      storeB.transition(req.id, 'denied', {
        decision: 'deny', decidedBy: 'second', channel: 'dashboard', decidedAt: FIXED_NOW.toISOString(),
      });
    } catch (error) {
      expect((error as ApprovalStoreError).code).toBe('APR_STORE_ALREADY_TERMINAL');
    }

    const durable = JSON.parse(readFileSync(join(storeDir, `${req.id}.decision.json`), 'utf-8'));
    expect(durable).toEqual(winner);
    expect(idsOf(storeB.load().approved)).toEqual([req.id]);
    expect(storeB.load().denied).toEqual([]);
  });

  it('rejects an invalid decision payload', () => {
    const req = broker.submit(buildRequest('apr-trans-invalid'));
    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);
    try {
      store.transition(req.id, 'approved', { decision: 'maybe-later' as never, decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalStoreError);
      expect((err as ApprovalStoreError).code).toBe('APR_STORE_INVALID_DECISION');
    }
  });
});

// ─── prune ────────────────────────────────────────────────────────────────────

describe('ApprovalStore.prune', () => {
  it('retires an old decision with a permanent tombstone before removing its files', () => {
    const req = broker.submit(buildRequest('apr-prune-old'));
    const decision = broker.decide(req.id, { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: '2026-06-01T00:00:00.000Z' });

    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);

    const pruned = store.prune(new Date('2026-06-15T00:00:00.000Z'));
    expect(pruned).toEqual([req.id]);
    expect(existsSync(join(storeDir, `${req.id}.request.json`))).toBe(false);
    expect(existsSync(join(storeDir, `${req.id}.decision.json`))).toBe(false);
    expect(existsSync(join(storeDir, `${req.id}.tombstone.json`))).toBe(true);
    expect(store.load().approved).toEqual([]);

    expect(() => broker.submit(buildRequest(req.id))).toThrowError(ApprovalBrokerError);

    // Even if physical cleanup was partial or stale files reappeared, the
    // tombstone remains the logical authority and the record stays retired.
    writeFileSync(join(storeDir, `${req.id}.request.json`), JSON.stringify(req), 'utf-8');
    writeFileSync(join(storeDir, `${req.id}.decision.json`), JSON.stringify(decision), 'utf-8');
    expect(ApprovalStore.load(storeDir, FIXED_NOW)).toEqual({
      pending: [], approved: [], denied: [], expired: [], quarantined: [],
    });
  });

  it('prevents a stale broker/store snapshot from resurrecting a pruned id', () => {
    const req = broker.submit(buildRequest('apr-prune-stale'));
    const staleBroker = new ApprovalBroker(projectRoot, { storeDir });
    const staleStore = new ApprovalStore(projectRoot, { storeDir });

    broker.decide(req.id, { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: '2026-06-01T00:00:00.000Z' });
    const pruningStore = new ApprovalStore(projectRoot, { storeDir });
    expect(pruningStore.prune(new Date('2026-06-15T00:00:00.000Z'))).toEqual([req.id]);

    try {
      staleBroker.decide(req.id, { decision: 'deny', decidedBy: 'b', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApprovalBrokerError);
      expect((error as ApprovalBrokerError).code).toBe('APR_ALREADY_DECIDED');
    }

    try {
      staleStore.transition(req.id, 'denied', {
        decision: 'deny', decidedBy: 'b', channel: 'cli', decidedAt: FIXED_NOW.toISOString(),
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApprovalStoreError);
      expect((error as ApprovalStoreError).code).toBe('APR_STORE_UNKNOWN_ID');
    }

    expect(existsSync(join(storeDir, `${req.id}.decision.json`))).toBe(false);
    expect(existsSync(join(storeDir, `${req.id}.tombstone.json`))).toBe(true);
  });

  it('hydrates a pruned tombstone winner for existing and restart waiters', async () => {
    const req = broker.submit(buildRequest('apr-retention-race'));
    const waitingBroker = new ApprovalBroker(projectRoot, { storeDir });
    const waiting = waitingBroker.awaitDecision(req.id);

    const decidingStore = new ApprovalStore(projectRoot, { storeDir });
    const winner = decidingStore.transition(req.id, 'approved', {
      decision: 'allow',
      decidedBy: 'operator',
      channel: 'terminal',
      decidedAt: '2026-06-01T00:00:00.000Z',
    });
    const pruningStore = new ApprovalStore(projectRoot, { storeDir });
    expect(pruningStore.prune(new Date('2026-06-15T00:00:00.000Z'))).toEqual([req.id]);

    expect(waitingBroker.checkForExternalDecisions()).toEqual([winner]);
    await expect(waiting).resolves.toEqual(winner);
    expect(waitingBroker.list('pending')).toEqual([]);
    expect(waitingBroker.list('decided')).toEqual([req]);

    const restarted = new ApprovalBroker(projectRoot, { storeDir });
    expect(restarted.list('all')).toEqual([]);
    await expect(restarted.awaitDecision(req.id)).resolves.toEqual(winner);
  });

  it('fails loud and preserves active files when an invalid tombstone occupies the id', () => {
    const req = broker.submit(buildRequest('apr-prune-conflict'));
    broker.decide(req.id, {
      decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: '2026-06-01T00:00:00.000Z',
    });
    writeFileSync(join(storeDir, `${req.id}.tombstone.json`), JSON.stringify({ invalid: true }), 'utf-8');

    const store = new ApprovalStore(projectRoot, { storeDir });
    try {
      store.prune(new Date('2026-06-15T00:00:00.000Z'));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApprovalStoreError);
      expect((error as ApprovalStoreError).code).toBe('APR_STORE_RETIREMENT_CONFLICT');
    }
    expect(existsSync(join(storeDir, `${req.id}.request.json`))).toBe(true);
    expect(existsSync(join(storeDir, `${req.id}.decision.json`))).toBe(true);
  });

  it('leaves a decided entry newer than the cutoff untouched', () => {
    const req = broker.submit(buildRequest('apr-prune-new'));
    broker.decide(req.id, { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: '2026-07-01T00:00:00.000Z' });

    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);

    const pruned = store.prune(new Date('2026-06-15T00:00:00.000Z'));
    expect(pruned).toEqual([]);
    expect(existsSync(join(storeDir, `${req.id}.request.json`))).toBe(true);
  });

  it('never prunes a pending or overdue-unswept entry regardless of age', () => {
    broker.submit(buildRequest('apr-prune-pending', { createdAt: '2020-01-01T00:00:00.000Z', expiresAt: '2020-01-01T00:10:00.000Z' }));

    const store = new ApprovalStore(projectRoot, { storeDir });
    store.index(FIXED_NOW);

    const pruned = store.prune(new Date('2026-06-15T00:00:00.000Z'));
    expect(pruned).toEqual([]);
    expect(existsSync(join(storeDir, 'apr-prune-pending.request.json'))).toBe(true);
  });
});
