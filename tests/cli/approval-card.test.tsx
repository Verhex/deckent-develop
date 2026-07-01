// ═══ approval-card tests (APR-SHELLCLIENT, sprint-354 task 354-003) ═════════
//
// Why plain-logic tests, no Ink render / ink-testing-library: same reason as
// tests/cli/repl-confirm-queue.test.ts and tests/cli/repl/ink-stabilize.test.ts
// — ink-testing-library is not a project devDependency, and this environment's
// HOME is a disk-constrained tmpfs shared with other concurrently-running
// sprint-354 workers (a transient install was attempted and reverted — it
// churned ~75 shared node_modules packages, unsafe with parallel workers
// reading the same tree). Every interactive/decision behavior the card exposes
// (queue ordering, cross-decided retirement, approve-all-similar cascade, burst
// index/total counter, y/n/a/d key mapping) is implemented as pure, Ink-free
// functions in approval-card.tsx exactly so it can be exercised here directly.
//
// Environment note (flagged, not fixed here — outside this task's write scope):
// vitest.config.ts's `include: ['tests/**/*.test.ts']` does not match `.test.tsx`
// (verified empirically), so this file is not currently discovered by `npm test`.
// Verified locally via a scratch, uncommitted vitest config with
// `tests/cli/**/*.test.tsx` added to `include` (mirrors the pattern
// vitest.dashboard.config.ts already uses for tests/dashboard/**/*.test.tsx).

import { describe, it, expect } from 'vitest';
import {
  createApprovalCardQueue,
  mapApprovalKey,
  type ApprovalCardQueue,
} from '../../src/cli/repl/approval-card.js';
import { validateApprovalRequest, type ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalStreamEvent } from '../../src/core/approval-eventstream.js';

const CREATED_AT = '2026-07-01T21:00:00.000Z';
const EXPIRES_AT = '2026-07-01T21:15:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  const result = validateApprovalRequest({
    id,
    requester: { role: 'worker', instanceId: 'w-354-003' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-354',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    maskedArgs: { cmd: '***REDACTED***' },
    ...overrides,
  });
  if (!result.ok) throw new Error(`invalid fixture: ${result.errors.join('; ')}`);
  return result.value;
}

function pendingEvent(request: ApprovalRequest): ApprovalStreamEvent {
  return { kind: 'pending', request };
}

function crossDecidedEvent(request: ApprovalRequest): ApprovalStreamEvent {
  return {
    kind: 'cross-decided',
    request,
    decision: {
      requestId: request.id,
      decision: 'allow',
      decidedBy: 'dashboard-user',
      channel: 'dashboard',
      decidedAt: CREATED_AT,
      reason: '',
    },
    message: 'dashboard kanalında karar verildi',
  };
}

// ─── createApprovalCardQueue ────────────────────────────────────────────────

describe('createApprovalCardQueue — ingest ordering + burst counter', () => {
  it('returns null head / size 0 when empty', () => {
    const q = createApprovalCardQueue(() => {});
    expect(q.head()).toBeNull();
    expect(q.size()).toBe(0);
  });

  it('ingest(pending) appends in arrival order; head() is the oldest', () => {
    const q = createApprovalCardQueue(() => {});
    q.ingest(pendingEvent(buildRequest('a')));
    q.ingest(pendingEvent(buildRequest('b')));
    q.ingest(pendingEvent(buildRequest('c')));
    expect(q.size()).toBe(3);
    expect(q.head()).toMatchObject({ request: { id: 'a' }, index: 1, total: 3 });
  });

  it('ingest(pending) with a repeated id upserts — does not duplicate in order', () => {
    const q = createApprovalCardQueue(() => {});
    q.ingest(pendingEvent(buildRequest('a', { summary: 'first' })));
    q.ingest(pendingEvent(buildRequest('a', { summary: 'second' })));
    expect(q.size()).toBe(1);
    expect(q.head()!.request.summary).toBe('second');
  });

  it('ingest(dropped) is a no-op — queue state and onChange both unaffected', () => {
    let changes = 0;
    const q = createApprovalCardQueue(() => { changes += 1; });
    q.ingest(pendingEvent(buildRequest('a')));
    expect(changes).toBe(1);
    q.ingest({ kind: 'dropped', droppedCount: 3 });
    expect(changes).toBe(1); // no additional onChange
    expect(q.size()).toBe(1);
    expect(q.head()!.request.id).toBe('a');
  });

  it('ingest(cross-decided) retires the request even when it is NOT the current head', () => {
    const q = createApprovalCardQueue(() => {});
    const a = buildRequest('a');
    const b = buildRequest('b');
    q.ingest(pendingEvent(a));
    q.ingest(pendingEvent(b));
    q.ingest(crossDecidedEvent(b)); // resolved by another channel (e.g. dashboard)
    expect(q.size()).toBe(1);
    expect(q.head()!.request.id).toBe('a');
  });

  it('resolve(id) retires the head and advances the burst index/total', () => {
    const q = createApprovalCardQueue(() => {});
    q.ingest(pendingEvent(buildRequest('a')));
    q.ingest(pendingEvent(buildRequest('b')));
    q.ingest(pendingEvent(buildRequest('c')));
    expect(q.head()).toMatchObject({ request: { id: 'a' }, index: 1, total: 3 });

    q.resolve('a');
    expect(q.head()).toMatchObject({ request: { id: 'b' }, index: 2, total: 3 });

    q.resolve('b');
    expect(q.head()).toMatchObject({ request: { id: 'c' }, index: 3, total: 3 });

    q.resolve('c');
    expect(q.head()).toBeNull();
    expect(q.size()).toBe(0);
  });

  it('resolve() on an unknown id is a defensive no-op', () => {
    let changes = 0;
    const q = createApprovalCardQueue(() => { changes += 1; });
    q.ingest(pendingEvent(buildRequest('a')));
    expect(changes).toBe(1);
    q.resolve('does-not-exist');
    expect(changes).toBe(1); // no spurious change
    expect(q.size()).toBe(1);
  });

  it('burst counter resets to 0 once the queue fully drains, then restarts at 1', () => {
    const q = createApprovalCardQueue(() => {});
    q.ingest(pendingEvent(buildRequest('a')));
    q.resolve('a');
    expect(q.head()).toBeNull();

    q.ingest(pendingEvent(buildRequest('b')));
    expect(q.head()).toMatchObject({ request: { id: 'b' }, index: 1, total: 1 });
  });

  it('mid-burst arrival: a new pending item grows total while the head stays put', () => {
    const q = createApprovalCardQueue(() => {});
    q.ingest(pendingEvent(buildRequest('a')));
    q.ingest(pendingEvent(buildRequest('b')));
    expect(q.head()).toMatchObject({ request: { id: 'a' }, index: 1, total: 2 });

    q.resolve('a');
    expect(q.head()).toMatchObject({ request: { id: 'b' }, index: 2, total: 2 });

    q.ingest(pendingEvent(buildRequest('c'))); // arrives mid-burst
    expect(q.head()).toMatchObject({ request: { id: 'b' }, index: 2, total: 3 });
  });
});

// ─── similarTo / resolveSimilar (approve-all-similar cascade) ───────────────

describe('createApprovalCardQueue — approve-all-similar cascade (scopeId match)', () => {
  function seedThreeSameScope(q: ApprovalCardQueue): void {
    q.ingest(pendingEvent(buildRequest('a', { scopeId: 'bash' })));
    q.ingest(pendingEvent(buildRequest('b', { scopeId: 'write-file' }))); // different scope
    q.ingest(pendingEvent(buildRequest('c', { scopeId: 'bash' })));
  }

  it('similarTo(id) returns only OTHER pending requests sharing scopeId', () => {
    const q = createApprovalCardQueue(() => {});
    seedThreeSameScope(q);
    const similar = q.similarTo('a');
    expect(similar.map((r) => r.id)).toEqual(['c']);
  });

  it('similarTo(id) on an unknown id returns empty', () => {
    const q = createApprovalCardQueue(() => {});
    seedThreeSameScope(q);
    expect(q.similarTo('does-not-exist')).toEqual([]);
  });

  it('resolveSimilar(id) resolves the target AND every same-scopeId match, leaving the rest', () => {
    const q = createApprovalCardQueue(() => {});
    seedThreeSameScope(q);
    const resolved = q.resolveSimilar('a');
    expect(resolved.map((r) => r.id)).toEqual(['a', 'c']);
    expect(q.size()).toBe(1);
    expect(q.head()!.request.id).toBe('b'); // different scopeId — still pending
  });

  it('resolveSimilar(id) on an unknown id resolves nothing', () => {
    const q = createApprovalCardQueue(() => {});
    seedThreeSameScope(q);
    expect(q.resolveSimilar('does-not-exist')).toEqual([]);
    expect(q.size()).toBe(3);
  });

  it('resolveSimilar with no same-scope siblings resolves only the target', () => {
    const q = createApprovalCardQueue(() => {});
    seedThreeSameScope(q);
    const resolved = q.resolveSimilar('b');
    expect(resolved.map((r) => r.id)).toEqual(['b']);
    expect(q.size()).toBe(2);
  });
});

// ─── mapApprovalKey ──────────────────────────────────────────────────────────

describe('mapApprovalKey — y/n/a/d key mapping', () => {
  it.each([
    ['y', 'approve'],
    ['Y', 'approve'],
    ['n', 'deny'],
    ['N', 'deny'],
    ['a', 'approve-all'],
    ['A', 'approve-all'],
    ['d', 'details'],
    ['D', 'details'],
  ] as const)('maps %s -> %s', (input, expected) => {
    expect(mapApprovalKey(input)).toBe(expected);
  });

  it.each(['x', '', 'q', '1', ''])('unmapped key %j is a no-op (null)', (input) => {
    expect(mapApprovalKey(input)).toBeNull();
  });
});
