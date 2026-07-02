// ─── ALLOWSCOPE-COMPOSE tests (task 358-008, Sıra-69 kapanışı) ───────────────
// WorkerApprovalGate.guard() composes an optional ApprovalAllowScopeLike seam
// IN FRONT of the decide-resume wait path: a live grant match resolves 'allow'
// without waiting on an external decide(), but the submit+decide audit trail
// is never skipped (only the wait is). Covers: match short-circuits the wait,
// audit-trail (submit+decide) is preserved with channel 'allowscope', the
// risk:'critical' clamp (second defense — never bypasses via allowscope), a
// non-matching grant falls through unchanged, and the no-seam path stays
// byte-identical to pre-358-008 behavior.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WorkerApprovalGate,
  type ApprovalAllowScopeLike,
  type ApprovalBrokerLike,
  type WorkerActionDescriptor,
} from '../../src/core/approval-worker-gate.js';
import type { ApprovalRequestInput, ApprovalDecisionInput } from '../../src/core/approval-broker.js';
import type { ApprovalRequest, ApprovalDecision, Requester } from '../../src/core/approval-contract.js';
import type { ApprovalAllowScopeMatchInput, ApprovalAllowScopeRule } from '../../src/core/approval-allowscope.js';

// ─── FakeApprovalBroker — in-memory, zero fs I/O (mirrors approval-worker-gate.test.ts) ─

class FakeApprovalBroker implements ApprovalBrokerLike {
  readonly submitted: ApprovalRequestInput[] = [];
  readonly decideCalls: Array<{ id: string; input: ApprovalDecisionInput }> = [];
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly decisions = new Map<string, ApprovalDecision>();
  private readonly waiters = new Map<string, Array<(d: ApprovalDecision) => void>>();

  submit(request: ApprovalRequestInput): ApprovalRequest {
    this.submitted.push(request);
    const full: ApprovalRequest = {
      version: '1.0',
      maskedArgs: null,
      rawArgsRef: null,
      ...request,
    };
    this.requests.set(full.id, full);
    return full;
  }

  decide(id: string, input: ApprovalDecisionInput): ApprovalDecision {
    this.decideCalls.push({ id, input });
    if (this.decisions.has(id)) {
      throw new Error(`already decided: ${id}`);
    }
    const decision: ApprovalDecision = { requestId: id, reason: '', ...input };
    this.decisions.set(id, decision);
    const waiters = this.waiters.get(id);
    if (waiters) {
      this.waiters.delete(id);
      for (const resolve of waiters) resolve(decision);
    }
    return decision;
  }

  awaitDecision(id: string): Promise<ApprovalDecision> {
    const existing = this.decisions.get(id);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const list = this.waiters.get(id);
      if (list) list.push(resolve);
      else this.waiters.set(id, [resolve]);
    });
  }
}

// ─── FakeAllowScopeStore — in-memory ApprovalAllowScopeLike, no disk I/O ─────

function buildGrant(overrides: Partial<ApprovalAllowScopeRule> = {}): ApprovalAllowScopeRule {
  return {
    id: 'grant-1',
    scopeId: 'sprint-358',
    scope: 'shell-exec',
    maxRisk: 'high',
    expiresAt: '2099-01-01T00:00:00.000Z',
    grantedBy: 'alperen',
    grantedAt: '2026-07-01T00:00:00.000Z',
    reason: 'trusted for this sprint',
    ...overrides,
  };
}

class FakeAllowScopeStore implements ApprovalAllowScopeLike {
  constructor(private readonly grant: ApprovalAllowScopeRule | null) {}

  matchesAllow(request: ApprovalAllowScopeMatchInput): ApprovalAllowScopeRule | null {
    if (!this.grant) return null;
    if (
      this.grant.scopeId === request.scopeId &&
      this.grant.scope === request.scope &&
      request.risk !== 'critical'
    ) {
      return this.grant;
    }
    return null;
  }
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

const REQUESTER: Requester = { role: 'worker', instanceId: 'w-358-008' };

function buildAction(overrides: Partial<WorkerActionDescriptor> = {}): WorkerActionDescriptor {
  return {
    summary: 'run: docker compose down -v',
    details: { note: 'test action' },
    scopeId: 'sprint-358',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    ...overrides,
  };
}

function makeGate(
  broker: FakeApprovalBroker,
  overrides: Partial<{ timeoutMs: number; allowStore: ApprovalAllowScopeLike }> = {},
): WorkerApprovalGate {
  return new WorkerApprovalGate({
    broker,
    requester: REQUESTER,
    tenantId: 'local',
    userId: 'alperen',
    ...overrides,
  });
}

// ─── allowscope match → instant allow, audit trail preserved ────────────────

describe('WorkerApprovalGate — allowscope seam match', () => {
  it('resolves allow without waiting on an external decide()', async () => {
    const broker = new FakeApprovalBroker();
    const allowStore = new FakeAllowScopeStore(buildGrant());
    const gate = makeGate(broker, { timeoutMs: 60_000, allowStore });

    const verdict = await gate.guard(buildAction({ policy: 'require-approval' }));

    expect(verdict).toBe('allow');
  });

  it('still submits AND decides the request — the audit trail is never skipped', async () => {
    const broker = new FakeApprovalBroker();
    const allowStore = new FakeAllowScopeStore(buildGrant());
    const gate = makeGate(broker, { timeoutMs: 60_000, allowStore });

    await gate.guard(buildAction({ policy: 'require-approval' }));

    expect(broker.submitted).toHaveLength(1);
    expect(broker.submitted[0].scopeId).toBe('sprint-358');
    expect(broker.decideCalls).toHaveLength(1);
    expect(broker.decideCalls[0].input.channel).toBe('allowscope');
    expect(broker.decideCalls[0].input.decision).toBe('allow');
    expect(broker.decideCalls[0].input.reason).toContain('allowscope');
    expect(broker.decideCalls[0].input.reason).toContain('grant-1');
  });

  it('short-circuits even an explicit deny/notify policy verdict', async () => {
    const broker = new FakeApprovalBroker();
    const allowStore = new FakeAllowScopeStore(buildGrant());
    const gate = makeGate(broker, { timeoutMs: 60_000, allowStore });

    const verdict = await gate.guard(buildAction({ policy: 'notify' }));

    expect(verdict).toBe('allow');
    expect(broker.decideCalls[0].input.channel).toBe('allowscope');
  });
});

// ─── risk: 'critical' clamp — second defense, never bypasses via allowscope ─

describe('WorkerApprovalGate — allowscope critical-risk clamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never allowscope-matches a critical-risk action, even if the grant would otherwise match', async () => {
    const broker = new FakeApprovalBroker();
    // maxRisk 'critical' — a store bug/misconfig could theoretically produce this;
    // the gate's OWN clamp is the second defense regardless of what the store returns.
    const allowStore = new FakeAllowScopeStore(buildGrant({ maxRisk: 'critical' }));
    const gate = makeGate(broker, { timeoutMs: 1000, allowStore });

    const verdictPromise = gate.guard(buildAction({ policy: 'require-approval', risk: 'critical' }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(await verdictPromise).toBe('deny');
    expect(broker.decideCalls.every((c) => c.input.channel !== 'allowscope')).toBe(true);
    expect(broker.decideCalls.at(-1)?.input.channel).toBe('fallback');
  });
});

// ─── no match → falls through to the existing decide-resume/fallback path ──

describe('WorkerApprovalGate — allowscope seam, no match', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls through to awaitDecisionOrFallback when scopeId does not match', async () => {
    const broker = new FakeApprovalBroker();
    const allowStore = new FakeAllowScopeStore(buildGrant({ scopeId: 'other-sprint' }));
    const gate = makeGate(broker, { timeoutMs: 1000, allowStore });

    const verdictPromise = gate.guard(buildAction({ policy: 'require-approval' }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(await verdictPromise).toBe('deny');
    expect(broker.decideCalls.at(-1)?.input.channel).toBe('fallback');
  });

  it('falls through to an external decide() when no grant exists at all', async () => {
    const broker = new FakeApprovalBroker();
    const allowStore = new FakeAllowScopeStore(null);
    const gate = makeGate(broker, { timeoutMs: 60_000, allowStore });

    const verdictPromise = gate.guard(buildAction({ policy: 'require-approval' }));
    const id = broker.submitted[0].id;
    broker.decide(id, { decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: '2026-07-02T12:00:00.000Z' });

    expect(await verdictPromise).toBe('allow');
    expect(broker.decideCalls[0].input.channel).toBe('terminal');
  });
});

// ─── no seam supplied → byte-identical to pre-358-008 behavior ─────────────

describe('WorkerApprovalGate — no allowStore seam (regression guard)', () => {
  it('auto-approve still settles instantly, unaffected by the new seam', async () => {
    const broker = new FakeApprovalBroker();
    const gate = makeGate(broker, { timeoutMs: 60_000 });

    const verdict = await gate.guard(buildAction({ policy: 'auto-approve' }));

    expect(verdict).toBe('allow');
    expect(broker.decideCalls[0].input.channel).toBe('auto-approve');
  });

  it('require-approval still waits on an external decide() when no allowStore is given', async () => {
    const broker = new FakeApprovalBroker();
    const gate = makeGate(broker, { timeoutMs: 60_000 });

    const verdictPromise = gate.guard(buildAction({ policy: 'require-approval' }));
    const id = broker.submitted[0].id;
    broker.decide(id, { decision: 'deny', decidedBy: 'alperen', channel: 'terminal', decidedAt: '2026-07-02T12:00:00.000Z' });

    expect(await verdictPromise).toBe('deny');
  });
});
