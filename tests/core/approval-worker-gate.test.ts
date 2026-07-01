// ─── WorkerApprovalGate tests (APR-WORKERGATE, task 353-004) ─────────────────
// Fake-broker behavior tests (no real broker file I/O): auto-approve settles
// instantly, every other policy awaits an external decide() ("decide-resume"),
// a timeout invokes the injected FallbackResolver seam (default deny), raw args
// never reach the request unmasked, and a fallback never overrides a decision
// that lands during the race window.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WorkerApprovalGate,
  DENY_FALLBACK_RESOLVER,
  type ApprovalBrokerLike,
  type FallbackResolver,
  type WorkerActionDescriptor,
} from '../../src/core/approval-worker-gate.js';
import type { ApprovalRequestInput, ApprovalDecisionInput } from '../../src/core/approval-broker.js';
import type { ApprovalRequest, ApprovalDecision, Requester } from '../../src/core/approval-contract.js';

// ─── FakeApprovalBroker — in-memory, zero fs I/O ─────────────────────────────

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

// ─── Test helpers ─────────────────────────────────────────────────────────────

const REQUESTER: Requester = { role: 'worker', instanceId: 'w-353-004' };

function buildAction(overrides: Partial<WorkerActionDescriptor> = {}): WorkerActionDescriptor {
  return {
    summary: 'run: docker compose down -v',
    details: { note: 'test action' },
    scopeId: 'sprint-353',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    ...overrides,
  };
}

function makeGate(
  broker: FakeApprovalBroker,
  overrides: Partial<{ timeoutMs: number; fallbackResolver: FallbackResolver; now: () => Date; idFactory: () => string }> = {},
): WorkerApprovalGate {
  return new WorkerApprovalGate({
    broker,
    requester: REQUESTER,
    tenantId: 'local',
    userId: 'alperen',
    ...overrides,
  });
}

// ─── auto-approve → instant allow ────────────────────────────────────────────

describe('WorkerApprovalGate — auto-approve policy', () => {
  it('settles instantly via allow, without waiting for an external decision', async () => {
    const broker = new FakeApprovalBroker();
    const gate = makeGate(broker, { timeoutMs: 60_000 });

    const verdict = await gate.guard(buildAction({ policy: 'auto-approve' }));

    expect(verdict).toBe('allow');
    expect(broker.decideCalls).toHaveLength(1);
    expect(broker.decideCalls[0].input.channel).toBe('auto-approve');
    expect(broker.decideCalls[0].input.decision).toBe('allow');
  });
});

// ─── require-approval (and other non-auto-approve policies) → decide-resume ─

describe('WorkerApprovalGate — require-approval policy (decide-resume)', () => {
  it('resolves allow once the broker is externally decided', async () => {
    const broker = new FakeApprovalBroker();
    const gate = makeGate(broker, { timeoutMs: 60_000 });

    const verdictPromise = gate.guard(buildAction({ policy: 'require-approval' }));
    const id = broker.submitted[0].id;
    broker.decide(id, { decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: '2026-07-01T21:00:00.000Z' });

    expect(await verdictPromise).toBe('allow');
  });

  it('resolves deny once the broker is externally decided deny', async () => {
    const broker = new FakeApprovalBroker();
    const gate = makeGate(broker, { timeoutMs: 60_000 });

    const verdictPromise = gate.guard(buildAction({ policy: 'require-approval' }));
    const id = broker.submitted[0].id;
    broker.decide(id, { decision: 'deny', decidedBy: 'alperen', channel: 'terminal', decidedAt: '2026-07-01T21:00:00.000Z' });

    expect(await verdictPromise).toBe('deny');
  });

  it('treats defer/escalate decisions as deny (fail-closed)', async () => {
    const broker = new FakeApprovalBroker();
    const gate = makeGate(broker, { timeoutMs: 60_000 });

    const verdictPromise = gate.guard(buildAction({ policy: 'notify' }));
    const id = broker.submitted[0].id;
    broker.decide(id, { decision: 'escalate', decidedBy: 'alperen', channel: 'terminal', decidedAt: '2026-07-01T21:00:00.000Z' });

    expect(await verdictPromise).toBe('deny');
  });
});

// ─── timeout → injected FallbackResolver seam ────────────────────────────────

describe('WorkerApprovalGate — timeout fallback seam', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to deny when no fallback resolver is injected', async () => {
    const broker = new FakeApprovalBroker();
    const gate = makeGate(broker, { timeoutMs: 1000 });

    const verdictPromise = gate.guard(buildAction({ policy: 'require-approval' }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(await verdictPromise).toBe('deny');
    expect(broker.decideCalls.at(-1)?.input.channel).toBe('fallback');
    expect(broker.decideCalls.at(-1)?.input.decision).toBe('deny');
  });

  it('DENY_FALLBACK_RESOLVER always resolves deny', () => {
    expect(
      DENY_FALLBACK_RESOLVER({
        requestId: 'x',
        summary: 's',
        scope: 'shell-exec',
        risk: 'high',
        policy: 'require-approval',
        defaultAction: 'deny',
      }),
    ).toBe('deny');
  });

  it('uses a custom injected fallback resolver on timeout', async () => {
    const broker = new FakeApprovalBroker();
    const customResolver: FallbackResolver = () => 'allow';
    const gate = makeGate(broker, { timeoutMs: 1000, fallbackResolver: customResolver });

    const verdictPromise = gate.guard(buildAction({ policy: 'require-approval' }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(await verdictPromise).toBe('allow');
  });

  it('never overrides a decision that lands during fallback resolution (race-safe)', async () => {
    const broker = new FakeApprovalBroker();
    const racyResolver: FallbackResolver = async (ctx) => {
      // Simulates an external actor (e.g. terminal) deciding JUST as the
      // fallback kicks in — the fallback's own guess below must be ignored.
      broker.decide(ctx.requestId, {
        decision: 'allow',
        decidedBy: 'race-winner',
        channel: 'terminal',
        decidedAt: '2026-07-01T21:10:00.000Z',
      });
      return 'deny';
    };
    const gate = makeGate(broker, { timeoutMs: 1000, fallbackResolver: racyResolver });

    const verdictPromise = gate.guard(buildAction({ policy: 'require-approval' }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(await verdictPromise).toBe('allow');
    expect(broker.decideCalls.filter((c) => c.input.channel === 'terminal')).toHaveLength(1);
  });

  it('does not fire the fallback if the broker decides before the timeout', async () => {
    const broker = new FakeApprovalBroker();
    const fallbackResolver = vi.fn<FallbackResolver>(() => 'deny');
    const gate = makeGate(broker, { timeoutMs: 5000, fallbackResolver });

    const verdictPromise = gate.guard(buildAction({ policy: 'require-approval' }));
    const id = broker.submitted[0].id;
    broker.decide(id, { decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: '2026-07-01T21:00:00.000Z' });
    await vi.advanceTimersByTimeAsync(5000);

    expect(await verdictPromise).toBe('allow');
    expect(fallbackResolver).not.toHaveBeenCalled();
  });
});

// ─── raw args never pass through the gate unmasked ───────────────────────────

describe('WorkerApprovalGate — raw args masking', () => {
  it('submits only maskedArgs; the raw value never appears on the request', async () => {
    const broker = new FakeApprovalBroker();
    const gate = makeGate(broker, { timeoutMs: 60_000 });

    await gate.guard(
      buildAction({
        policy: 'auto-approve',
        rawArgs: { token: 'sk-ABCDEFGHIJKLMNOPQRSTUVWX1234567890', cmd: 'deploy' },
      }),
    );

    const submitted = broker.submitted[0];
    expect(submitted.maskedArgs).not.toBeNull();
    expect(JSON.stringify(submitted.maskedArgs)).not.toContain('sk-ABCDEFGHIJKLMNOPQRSTUVWX1234567890');
    expect(submitted.rawArgsRef).toBeNull();
    expect(submitted).not.toHaveProperty('rawArgs');
  });

  it('submits maskedArgs: null when the action carries no rawArgs', async () => {
    const broker = new FakeApprovalBroker();
    const gate = makeGate(broker, { timeoutMs: 60_000 });

    await gate.guard(buildAction({ policy: 'auto-approve' }));

    expect(broker.submitted[0].maskedArgs).toBeNull();
  });
});
