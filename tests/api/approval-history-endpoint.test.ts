// ─── Approval History Endpoint — hermetic unit tests (362-005 APRHIST-DEBT-CLOSE) ──
// Closes the follow-up 359-013's own result notes recommended: the endpoint's
// core logic (buildApprovalHistoryPage, parseApprovalHistoryQuery) is a pure,
// dependency-free seam factored out specifically so it can be tested WITHOUT
// an HTTP server. tests/api/approval-history-wire.test.ts already covers the
// live route (server.ts dispatch, auth-gate, routing order) end-to-end; this
// file covers the module's own pure functions against a tmpdir ApprovalStore
// fixture — same pattern as tests/core/approval-store.test.ts. No behavior
// change: this is a test-only addition plus a stale-comment fix in the
// endpoint module (server.ts, wired in 360-013, is untouched).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalStore } from '../../src/core/approval-store.js';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import {
  buildApprovalHistoryPage,
  parseApprovalHistoryQuery,
  APPROVAL_HISTORY_DEFAULT_LIMIT,
  APPROVAL_HISTORY_MAX_LIMIT,
} from '../../src/api/approval-history-endpoint.js';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-362-005' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-362',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: '2026-07-02T00:00:00.000Z',
    expiresAt: '2030-01-01T00:00:00.000Z',
    maskedArgs: { command: '[REDACTED]' },
    rawArgsRef: null,
    ...overrides,
  };
}

let projectRoot: string;
let storeDir: string;
let broker: ApprovalBroker;
let store: ApprovalStore;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-history-endpoint-'));
  storeDir = join(projectRoot, 'approvals');
  broker = new ApprovalBroker(projectRoot, { storeDir });
  store = new ApprovalStore(projectRoot, { storeDir });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── parseApprovalHistoryQuery ───────────────────────────────────────────────

describe('parseApprovalHistoryQuery', () => {
  it('defaults to status=all, limit=20, offset=0 when nothing is provided', () => {
    const result = parseApprovalHistoryQuery({});
    expect(result).toEqual({ ok: true, status: 'all', limit: APPROVAL_HISTORY_DEFAULT_LIMIT, offset: 0 });
  });

  it('accepts each valid status filter', () => {
    for (const status of ['all', 'approved', 'denied', 'expired']) {
      const result = parseApprovalHistoryQuery({ status });
      expect(result).toEqual({ ok: true, status, limit: APPROVAL_HISTORY_DEFAULT_LIMIT, offset: 0 });
    }
  });

  it('rejects an unknown status filter', () => {
    const result = parseApprovalHistoryQuery({ status: 'bogus' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Invalid status filter/);
  });

  it('accepts limit at the boundaries (1 and max)', () => {
    expect(parseApprovalHistoryQuery({ limit: '1' })).toEqual({ ok: true, status: 'all', limit: 1, offset: 0 });
    expect(parseApprovalHistoryQuery({ limit: String(APPROVAL_HISTORY_MAX_LIMIT) })).toEqual({
      ok: true,
      status: 'all',
      limit: APPROVAL_HISTORY_MAX_LIMIT,
      offset: 0,
    });
  });

  it('rejects limit outside [1, max] and non-integer limit', () => {
    for (const bad of ['0', '-1', String(APPROVAL_HISTORY_MAX_LIMIT + 1), '3.5', 'abc']) {
      const result = parseApprovalHistoryQuery({ limit: bad });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/Invalid limit/);
    }
  });

  it('rejects a negative or non-integer offset', () => {
    for (const bad of ['-1', '1.5', 'abc']) {
      const result = parseApprovalHistoryQuery({ offset: bad });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/Invalid offset/);
    }
  });

  it('accepts offset 0 and positive offsets', () => {
    expect(parseApprovalHistoryQuery({ offset: '0' })).toEqual({ ok: true, status: 'all', limit: APPROVAL_HISTORY_DEFAULT_LIMIT, offset: 0 });
    expect(parseApprovalHistoryQuery({ offset: '5' })).toEqual({ ok: true, status: 'all', limit: APPROVAL_HISTORY_DEFAULT_LIMIT, offset: 5 });
  });
});

// ─── buildApprovalHistoryPage ────────────────────────────────────────────────

describe('buildApprovalHistoryPage', () => {
  it('returns an empty page when the store has no entries', () => {
    const page = buildApprovalHistoryPage(store, { status: 'all', limit: 20, offset: 0 });
    expect(page).toEqual({ entries: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } });
  });

  it('excludes pending entries and includes approved/denied, most-recent-first', () => {
    const approvedReq = broker.submit(buildRequest('h-approved-1'));
    broker.decide(approvedReq.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-02T00:05:00.000Z',
      reason: 'looks fine',
    });
    const deniedReq = broker.submit(buildRequest('h-denied-1'));
    broker.decide(deniedReq.id, {
      decision: 'deny',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-02T00:10:00.000Z',
      reason: 'nope',
    });
    broker.submit(buildRequest('h-pending-1')); // must NOT appear

    store.index();
    const page = buildApprovalHistoryPage(store, { status: 'all', limit: 20, offset: 0 });

    expect(page.pagination.total).toBe(2);
    // Most-recent decidedAt first: h-denied-1 (00:10) before h-approved-1 (00:05).
    expect(page.entries.map((e) => e.id)).toEqual(['h-denied-1', 'h-approved-1']);
    expect(page.entries.every((e) => e.id !== 'h-pending-1')).toBe(true);
  });

  it('filters by a single status category', () => {
    const approvedReq = broker.submit(buildRequest('h-cat-approved'));
    broker.decide(approvedReq.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-02T00:05:00.000Z',
      reason: 'ok',
    });
    const deniedReq = broker.submit(buildRequest('h-cat-denied'));
    broker.decide(deniedReq.id, {
      decision: 'deny',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-02T00:06:00.000Z',
      reason: 'no',
    });

    store.index();
    const page = buildApprovalHistoryPage(store, { status: 'denied', limit: 20, offset: 0 });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({ id: 'h-cat-denied', category: 'denied' });
  });

  it('serializes maskedArgs-only — rawArgsRef is never a field on the entry', () => {
    const req = broker.submit(buildRequest('h-masked-1', {
      maskedArgs: { secret: '[REDACTED]' },
      rawArgsRef: '.deckent/approvals/raw/h-masked-1.json',
    }));
    broker.decide(req.id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-02T00:05:00.000Z',
      reason: 'fine',
    });

    store.index();
    const page = buildApprovalHistoryPage(store, { status: 'all', limit: 20, offset: 0 });
    const entry = page.entries[0]!;
    expect(entry.maskedArgs).toEqual({ secret: '[REDACTED]' });
    expect(Object.keys(entry)).not.toContain('rawArgsRef');
    expect(JSON.stringify(entry)).not.toContain('raw/h-masked-1.json');
  });

  it('paginates: total/hasMore/offset slicing over 3 settled entries with limit=2', () => {
    for (const [id, minute] of [['h-p1', '01'], ['h-p2', '02'], ['h-p3', '03']] as const) {
      const req = broker.submit(buildRequest(id));
      broker.decide(req.id, {
        decision: 'deny',
        decidedBy: 'alperen',
        channel: 'terminal',
        decidedAt: `2026-07-02T00:${minute}:00.000Z`,
        reason: 'no',
      });
    }
    store.index();

    const page1 = buildApprovalHistoryPage(store, { status: 'all', limit: 2, offset: 0 });
    expect(page1.pagination).toEqual({ total: 3, limit: 2, offset: 0, hasMore: true });
    expect(page1.entries.map((e) => e.id)).toEqual(['h-p3', 'h-p2']); // most-recent-first

    const page2 = buildApprovalHistoryPage(store, { status: 'all', limit: 2, offset: 2 });
    expect(page2.pagination).toEqual({ total: 3, limit: 2, offset: 2, hasMore: false });
    expect(page2.entries.map((e) => e.id)).toEqual(['h-p1']);
  });

  it('orders an overdue-unswept expired entry by expiresAt (no decision yet)', () => {
    broker.submit(buildRequest('h-expired-unswept', { expiresAt: '2026-07-02T00:00:01.000Z' }));
    // Re-index at a fixed "now" well after expiresAt so it categorizes as expired.
    store.index(new Date('2026-07-02T01:00:00.000Z'));

    const page = buildApprovalHistoryPage(store, { status: 'expired', limit: 20, offset: 0 });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({ id: 'h-expired-unswept', category: 'expired', decidedAt: null });
  });
});
