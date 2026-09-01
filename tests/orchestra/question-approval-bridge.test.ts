// ─── QuestionApprovalBridge tests (CKPT-1, task 357-004) ─────────────────────
// Fake-broker round-trip tests (no broker file I/O — approval-worker-gate.test.ts
// pattern): allow honors suggestedAction, deny aborts, timeout falls back to
// auto-continue (race-safe against an external decide), NPM-ADVISORY questions
// are rejected before ever touching the broker, and the raw context never
// reaches the request unmasked.
//
// 0-caller proof (goCriteria): the bridge module is imported ONLY by this test —
// `grep -rn "question-approval-bridge" src/` matches nothing outside the module
// itself; the `approval.question_bridge` flag is default-off and nothing in src/
// calls bridgeQuestionToApproval yet (wire is an explicit follow-up task).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bridgeQuestionToApproval,
  decisionToBrainAnswer,
  deriveQuestionRisk,
  isNpmAdvisoryQuestion,
  isQuestionBridgeEnabled,
  questionToApprovalRequest,
  NPM_ADVISORY_REJECTION_NOTE,
  QUESTION_BRIDGE_FALLBACK_CHANNEL,
} from '../../src/orchestra/question-approval-bridge.js';
import type { ApprovalBrokerLike } from '../../src/core/approval-worker-gate.js';
import type { ApprovalRequestInput, ApprovalDecisionInput } from '../../src/core/approval-broker.js';
import type { ApprovalDecision, ApprovalRequest } from '../../src/core/approval-contract.js';
import type { WorkerQuestion } from '../../src/core/task-types.js';
import type { QuestionApprovalExactAttemptBinding } from '../../src/orchestra/question-approval-bridge.js';

// ─── FakeApprovalBroker — in-memory, zero fs I/O ─────────────────────────────

class FakeApprovalBroker implements ApprovalBrokerLike {
  readonly submitted: ApprovalRequestInput[] = [];
  readonly decideCalls: Array<{ id: string; input: ApprovalDecisionInput }> = [];
  private readonly decisions = new Map<string, ApprovalDecision>();
  private readonly waiters = new Map<string, Array<(d: ApprovalDecision) => void>>();

  submit(request: ApprovalRequestInput): ApprovalRequest {
    this.submitted.push(request);
    return { version: '1.0', maskedArgs: null, rawArgsRef: null, ...request } as ApprovalRequest;
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

function buildQuestion(overrides: Partial<WorkerQuestion> = {}): WorkerQuestion {
  return {
    taskId: '357-004',
    workerId: 'w-357-004',
    question: 'Should I regenerate the fixture snapshots before asserting?',
    context: 'Two snapshot files disagree with the committed baseline.',
    timestamp: '2026-07-02T10:00:00.000Z',
    ...overrides,
  };
}

const DECIDED_AT = '2026-07-02T10:00:30.000Z';

// ─── Round-trip: allow ────────────────────────────────────────────────────────

describe('bridgeQuestionToApproval — allow path', () => {
  it('honors the suggestedAction on a human allow', async () => {
    const broker = new FakeApprovalBroker();
    const resultPromise = bridgeQuestionToApproval(
      buildQuestion({ suggestedAction: 'skip' }),
      broker,
      { timeoutMs: 60_000 },
    );

    const id = broker.submitted[0].id;
    broker.decide(id, { decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: DECIDED_AT });

    const result = await resultPromise;
    expect(result.kind).toBe('bridged');
    if (result.kind !== 'bridged') return;
    expect(result.answer.taskId).toBe('357-004');
    expect(result.answer.action).toBe('skip');
    expect(result.answer.message).toContain('alperen');
    expect(result.decision.decision).toBe('allow');
  });

  it('defaults to continue on a human allow without a suggestedAction', async () => {
    const broker = new FakeApprovalBroker();
    const resultPromise = bridgeQuestionToApproval(buildQuestion(), broker, { timeoutMs: 60_000 });

    broker.decide(broker.submitted[0].id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'dashboard',
      decidedAt: DECIDED_AT,
    });

    const result = await resultPromise;
    expect(result.kind).toBe('bridged');
    if (result.kind !== 'bridged') return;
    expect(result.answer.action).toBe('continue');
  });
});

// ─── Round-trip: deny ─────────────────────────────────────────────────────────

describe('bridgeQuestionToApproval — deny path', () => {
  it('maps deny to abort, even when the worker suggested continue', async () => {
    const broker = new FakeApprovalBroker();
    const resultPromise = bridgeQuestionToApproval(
      buildQuestion({ suggestedAction: 'continue' }),
      broker,
      { timeoutMs: 60_000 },
    );

    broker.decide(broker.submitted[0].id, {
      decision: 'deny',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: DECIDED_AT,
      reason: 'do not regenerate snapshots',
    });

    const result = await resultPromise;
    expect(result.kind).toBe('bridged');
    if (result.kind !== 'bridged') return;
    expect(result.answer.action).toBe('abort');
    expect(result.answer.message).toContain('do not regenerate snapshots');
  });
});

// ─── Round-trip: timeout ──────────────────────────────────────────────────────

describe('bridgeQuestionToApproval — timeout path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to continue and settles the broker on the fallback channel', async () => {
    const broker = new FakeApprovalBroker();
    const resultPromise = bridgeQuestionToApproval(
      // suggestedAction present — a timeout must NOT honor it.
      buildQuestion({ suggestedAction: 'abort' }),
      broker,
      { timeoutMs: 1000 },
    );
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.kind).toBe('bridged');
    if (result.kind !== 'bridged') return;
    expect(result.answer.action).toBe('continue');
    expect(result.answer.message).toContain('auto-continue fallback');
    expect(broker.decideCalls.at(-1)?.input.channel).toBe(QUESTION_BRIDGE_FALLBACK_CHANNEL);
    expect(broker.decideCalls.at(-1)?.input.decidedBy).toBe('system');
  });

  it('defers to a real decision that lands in the fallback race window', async () => {
    const broker = new FakeApprovalBroker();
    // Pre-empt the fallback's decide(): an external deny lands exactly when the
    // timer fires, so the fallback's own decide() throws and must defer to it.
    const originalDecide = broker.decide.bind(broker);
    let raced = false;
    vi.spyOn(broker, 'decide').mockImplementation((id, input) => {
      if (!raced && input.channel === QUESTION_BRIDGE_FALLBACK_CHANNEL) {
        raced = true;
        originalDecide(id, { decision: 'deny', decidedBy: 'race-winner', channel: 'terminal', decidedAt: DECIDED_AT });
      }
      return originalDecide(id, input);
    });

    const resultPromise = bridgeQuestionToApproval(buildQuestion(), broker, { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.kind).toBe('bridged');
    if (result.kind !== 'bridged') return;
    expect(result.decision.decidedBy).toBe('race-winner');
    expect(result.answer.action).toBe('abort');
  });

  it('does not fire the fallback when the broker decides before the timeout', async () => {
    const broker = new FakeApprovalBroker();
    const resultPromise = bridgeQuestionToApproval(buildQuestion(), broker, { timeoutMs: 5000 });

    broker.decide(broker.submitted[0].id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: DECIDED_AT,
    });
    await vi.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;
    expect(result.kind).toBe('bridged');
    if (result.kind !== 'bridged') return;
    expect(result.answer.action).toBe('continue');
    expect(
      broker.decideCalls.filter((c) => c.input.channel === QUESTION_BRIDGE_FALLBACK_CHANNEL),
    ).toHaveLength(0);
  });
});

// ─── NPM-ADVISORY — rejected before the broker ────────────────────────────────

describe('bridgeQuestionToApproval — NPM-ADVISORY guard', () => {
  it('rejects advisory questions without ever contacting the broker', async () => {
    const broker = new FakeApprovalBroker();
    const result = await bridgeQuestionToApproval(
      buildQuestion({ question: '[NPM-ADVISORY] needs better-sqlite3 for the new store' }),
      broker,
      { timeoutMs: 60_000 },
    );

    expect(result.kind).toBe('npm-advisory-rejected');
    if (result.kind !== 'npm-advisory-rejected') return;
    expect(result.note).toBe(NPM_ADVISORY_REJECTION_NOTE);
    expect(result.note).toContain('deterministic');
    expect(result.note).toContain('ipc-registry');
    expect(broker.submitted).toHaveLength(0);
    expect(broker.decideCalls).toHaveLength(0);
  });

  it('detects the marker after leading whitespace, matching handleWorkerQuestion', () => {
    expect(isNpmAdvisoryQuestion(buildQuestion({ question: '  [NPM-ADVISORY] zod bump' }))).toBe(true);
    expect(isNpmAdvisoryQuestion(buildQuestion({ question: 'mentions [NPM-ADVISORY] mid-text' }))).toBe(false);
  });
});

// ─── Masking — raw context never travels ──────────────────────────────────────

describe('questionToApprovalRequest — masking + shape', () => {
  const MAP_OPTS = {
    id: 'req-1',
    tenantId: 'local',
    userId: 'operator',
    createdAt: new Date('2026-07-02T10:00:00.000Z'),
    expiresAt: new Date('2026-07-02T10:01:00.000Z'),
  };

  it('masks secrets out of both maskedArgs and the summary; rawArgsRef stays null', () => {
    const secret = 'sk-ABCDEFGHIJKLMNOPQRSTUVWX1234567890';
    const request = questionToApprovalRequest(
      buildQuestion({
        question: `May I write the token ${secret} into the fixture?`,
        context: `env has API_KEY=${secret}`,
      }),
      MAP_OPTS,
    );

    expect(JSON.stringify(request.maskedArgs)).not.toContain(secret);
    expect(request.summary).not.toContain(secret);
    expect(request.rawArgsRef).toBeNull();
    // Raw content never rides along on details — metadata only.
    expect(JSON.stringify(request.details)).not.toContain(secret);
  });

  it('maps the checkpoint shape: lifecycle scope, require-approval, worker requester', () => {
    const request = questionToApprovalRequest(buildQuestion({ suggestedAction: 'skip' }), MAP_OPTS);

    expect(request.scope).toBe('lifecycle');
    expect(request.policy).toBe('require-approval');
    expect(request.requester).toEqual({ role: 'worker', instanceId: 'w-357-004' });
    expect(request.scopeId).toBe('357-004');
    expect(request.defaultAction).toBe('allow');
    expect(request.details).toMatchObject({ taskId: '357-004', suggestedAction: 'skip', source: 'worker-question' });
  });

  it('clamps an over-long question onto the 200-char summary ceiling', () => {
    const request = questionToApprovalRequest(buildQuestion({ question: 'x'.repeat(500) }), MAP_OPTS);
    expect(request.summary.length).toBeLessThanOrEqual(200);
    expect(request.summary.length).toBeGreaterThan(0);
  });

  it('falls back to a task-derived instanceId when workerId is blank', () => {
    const request = questionToApprovalRequest(buildQuestion({ workerId: '' }), MAP_OPTS);
    expect(request.requester.instanceId).toBe('w-357-004');
  });
});

// ─── Risk heuristic ───────────────────────────────────────────────────────────

describe('deriveQuestionRisk', () => {
  it('flags credential/secret content as critical', () => {
    expect(deriveQuestionRisk(buildQuestion({ question: 'Rotate the API_KEY in .env?' }))).toBe('critical');
  });

  it('flags destructive/outward operations as high', () => {
    expect(deriveQuestionRisk(buildQuestion({ question: 'OK to force push the rebased branch?' }))).toBe('high');
  });

  it('scans the context too, not just the question text', () => {
    expect(
      deriveQuestionRisk(buildQuestion({ question: 'Proceed?', context: 'This would delete 3 fixtures.' })),
    ).toBe('high');
  });

  it('elevates a worker-suggested abort to medium without a keyword hit', () => {
    expect(
      deriveQuestionRisk(buildQuestion({ question: 'Spec ambiguity — proceed?', context: undefined, suggestedAction: 'abort' })),
    ).toBe('medium');
  });

  it('defaults plain ambiguity questions to low', () => {
    expect(deriveQuestionRisk(buildQuestion({ question: 'Which naming convention applies here?', context: undefined }))).toBe('low');
  });
});

// ─── decisionToBrainAnswer — non-human channels never honor suggestedAction ──

describe('decisionToBrainAnswer — channel semantics', () => {
  const NOW = (): Date => new Date('2026-07-02T10:02:00.000Z');

  it('maps a TTL-expire allow to plain continue (never suggestedAction)', () => {
    const answer = decisionToBrainAnswer(
      {
        requestId: 'r1',
        decision: 'allow',
        decidedBy: 'system',
        channel: 'ttl-expire',
        decidedAt: DECIDED_AT,
        reason: 'TTL expired — defaultAction applied',
      },
      buildQuestion({ suggestedAction: 'abort' }),
      NOW,
    );
    expect(answer.action).toBe('continue');
  });

  it('maps defer/escalate to the auto-continue fallback', () => {
    for (const decision of ['defer', 'escalate'] as const) {
      const answer = decisionToBrainAnswer(
        { requestId: 'r1', decision, decidedBy: 'alperen', channel: 'terminal', decidedAt: DECIDED_AT, reason: '' },
        buildQuestion({ suggestedAction: 'skip' }),
        NOW,
      );
      expect(answer.action).toBe('continue');
    }
  });
});

// ─── Flag: approval.question_bridge (default-off) ─────────────────────────────

describe('isQuestionBridgeEnabled', () => {
  it('is off by default and only true for an explicit boolean true', () => {
    expect(isQuestionBridgeEnabled(undefined)).toBe(false);
    expect(isQuestionBridgeEnabled(null)).toBe(false);
    expect(isQuestionBridgeEnabled({})).toBe(false);
    expect(isQuestionBridgeEnabled({ approval: {} })).toBe(false);
    expect(isQuestionBridgeEnabled({ approval: null })).toBe(false);
    expect(isQuestionBridgeEnabled({ approval: { question_bridge: false } })).toBe(false);
    expect(isQuestionBridgeEnabled({ approval: { question_bridge: 'true' } })).toBe(false);
    expect(isQuestionBridgeEnabled({ approval: { question_bridge: 1 } })).toBe(false);
    expect(isQuestionBridgeEnabled({ approval: { question_bridge: true } })).toBe(true);
  });
});

// ─── Exact-attempt approval binding ─────────────────────────────────────────

const exactBinding: QuestionApprovalExactAttemptBinding = {
  schemaVersion: 2,
  projectRootSha256: 'a'.repeat(64),
  projectId: 'project-a',
  taskId: '357-004',
  attemptId: 'attempt-3',
  generation: 3,
  admissionReceiptDigest: `sha256:${'b'.repeat(64)}`,
  fenceDigest: `sha256:${'c'.repeat(64)}`,
  questionReceiptDigest: `sha256:${'d'.repeat(64)}`,
  questionEnvelopeDigest: `sha256:${'e'.repeat(64)}`,
  sequence: 2,
};

describe('question approval exact-attempt binding', () => {
  it('binds the approval request to exact attempt/fence/question receipt data', () => {
    const request = questionToApprovalRequest(buildQuestion(), {
      id: 'req-exact',
      tenantId: 'local',
      userId: 'operator',
      createdAt: new Date('2026-07-02T10:00:00.000Z'),
      expiresAt: new Date('2026-07-02T10:01:00.000Z'),
      exactAttemptBinding: exactBinding,
    });

    expect(request.scopeId).toMatch(/^ipc-question:[a-f0-9]{64}$/u);
    expect(request.details).toMatchObject({
      source: 'worker-question',
      exactAttempt: exactBinding,
    });
  });

  it('returns typed authority-hold when the exact question changes after the decision', async () => {
    const broker = new FakeApprovalBroker();
    const revalidate = vi.fn(() => false);
    const resultPromise = bridgeQuestionToApproval(
      buildQuestion({ suggestedAction: 'skip' }),
      broker,
      {
        timeoutMs: 60_000,
        exactAttemptBinding: exactBinding,
        revalidateExactAttemptBinding: revalidate,
      },
    );

    broker.decide(broker.submitted[0].id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: DECIDED_AT,
    });

    const result = await resultPromise;
    expect(revalidate).toHaveBeenCalledWith(exactBinding);
    expect(result).toEqual({
      kind: 'authority-hold',
      reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED',
    });
  });

  it('fails closed before broker submission when exact binding lacks revalidation', async () => {
    const broker = new FakeApprovalBroker();
    const result = await bridgeQuestionToApproval(
      buildQuestion(),
      broker,
      { exactAttemptBinding: exactBinding },
    );

    expect(result).toEqual({
      kind: 'authority-hold',
      reasonCode: 'EXACT_QUESTION_REVALIDATOR_UNAVAILABLE',
    });
    expect(broker.submitted).toHaveLength(0);
  });

  it('rejects extra-key and proxied exact bindings before durable approval submission', async () => {
    const extraKeyBroker = new FakeApprovalBroker();
    const extraKey = { ...exactBinding, injectedAuthority: 'worker-self-report' };
    await expect(bridgeQuestionToApproval(buildQuestion(), extraKeyBroker, {
      exactAttemptBinding: extraKey as QuestionApprovalExactAttemptBinding,
      revalidateExactAttemptBinding: () => true,
    })).resolves.toEqual({
      kind: 'authority-hold',
      reasonCode: 'EXACT_QUESTION_BINDING_INVALID',
    });
    expect(extraKeyBroker.submitted).toHaveLength(0);

    const proxiedBroker = new FakeApprovalBroker();
    const proxied = new Proxy(exactBinding, {});
    await expect(bridgeQuestionToApproval(buildQuestion(), proxiedBroker, {
      exactAttemptBinding: proxied,
      revalidateExactAttemptBinding: () => true,
    })).resolves.toEqual({
      kind: 'authority-hold',
      reasonCode: 'EXACT_QUESTION_BINDING_INVALID',
    });
    expect(proxiedBroker.submitted).toHaveLength(0);
  });

  it('snapshots exact binding before submit so caller mutation cannot alter durable details', async () => {
    const broker = new FakeApprovalBroker();
    const mutable = { ...exactBinding };
    const resultPromise = bridgeQuestionToApproval(buildQuestion(), broker, {
      exactAttemptBinding: mutable,
      revalidateExactAttemptBinding: () => true,
      timeoutMs: 60_000,
    });

    mutable.attemptId = 'mutated-after-submit';
    broker.decide(broker.submitted[0].id, {
      decision: 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: DECIDED_AT,
    });

    const result = await resultPromise;
    expect(result.kind).toBe('bridged');
    expect((broker.submitted[0].details as Record<string, unknown>)['exactAttempt'])
      .toMatchObject({ attemptId: 'attempt-3' });
  });
});
