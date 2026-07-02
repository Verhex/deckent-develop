// ─── CKPT-QUESTION-BRIDGE-WIRE (358-007) ──────────────────────────────────────
// Governs: MASTER-PLAN Sıra-73 closure — threads the previously-unwired
// `bridgeQuestionToApproval` (question-approval-bridge.ts, task 357-004) into
// the live `handleWorkerQuestion` / `checkWorkerQuestions` poll loop
// (ipc-registry.ts) via an injected `{ bridge, broker, questionBridgeEnabled }`
// seam. These tests exercise ONLY the seam wiring in ipc-registry.ts — the
// bridge's own submit/mask/decide/timeout logic is already covered by
// question-approval-bridge.test.ts and is faked here (a `vi.fn()` standing in
// for `bridgeQuestionToApproval`) so these tests stay hermetic and fast.
//
// Coverage:
//  1. flag-off              → fake bridge NEVER called, byte-identical historical answer
//  2. flag-on, no seam      → same as (1) — seam is caller-opt-in on all three pieces
//  3. flag-on + seam        → fake bridge IS called; the written .answer comes from
//                             the bridge's resolved BrainAnswer, not the hardcoded one
//  4. NPM-ADVISORY          → fake bridge NEVER called even with the seam fully wired
//                             (deterministic policy branch always wins — born-454)
//  5. in-flight dedupe      → concurrent polls against a still-pending round-trip
//                             invoke the fake bridge exactly once
//  6. post-resolution reuse → a later call surfaces the already-settled answer
//                             without invoking the bridge again
//  7. checkWorkerQuestions  → the seam is forwarded end-to-end through the real
//                             poll-loop entrypoint, not just handleWorkerQuestion directly
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// NPM-ADVISORY (born-454) notifications must never hit real channels in tests.
vi.mock('../../src/core/notify.js', () => ({
  notifyAsync: vi.fn(),
}));

import {
  handleWorkerQuestion,
  checkWorkerQuestions,
  writeQuestionFile,
  readAnswerFile,
  getAnswerPath,
  NPM_ADVISORY_ANSWER_MESSAGE,
} from '../../src/orchestra/ipc-registry.js';
import type { ApprovalBrokerLike } from '../../src/core/approval-worker-gate.js';
import type { QuestionBridgeResult } from '../../src/orchestra/question-approval-bridge.js';
import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import type { BrainAnswer, WorkerQuestion } from '../../src/core/task-types.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

function mkTmp(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ipc-ckpt-bridge-wire-'));
  mkdirSync(join(tmpDir, '.tasks'), { recursive: true });
  return tmpDir;
}

function buildQuestion(taskId: string, overrides: Partial<WorkerQuestion> = {}): WorkerQuestion {
  return {
    taskId,
    workerId: `w-${taskId}`,
    question: 'Should I proceed with the risky rename?',
    timestamp: '2026-07-02T10:00:00.000Z',
    ...overrides,
  };
}

/** A fully-decided `bridged` result — mirrors what a real
 *  `bridgeQuestionToApproval` resolves to after a human `allow`/`deny`. */
function fakeBridgedResult(taskId: string, action: BrainAnswer['action']): QuestionBridgeResult {
  return {
    kind: 'bridged',
    answer: {
      taskId,
      action,
      message: `bridged-${action}`,
      timestamp: '2026-07-02T10:00:30.000Z',
    },
    decision: {
      requestId: `req-${taskId}`,
      decision: action === 'abort' ? 'deny' : 'allow',
      decidedBy: 'alperen',
      channel: 'terminal',
      decidedAt: '2026-07-02T10:00:30.000Z',
      reason: '',
    },
    // Unused by the seam (only `.answer` and `.decision.channel` are read) —
    // cast stands in for the full ApprovalRequest contract shape.
    request: {} as unknown as ApprovalRequest,
  };
}

/** The seam requires a `broker` value to activate, but a fully-faked `bridge`
 *  never actually touches it — every method throws if the seam's plumbing
 *  regresses into calling the real broker instead of the fake bridge. */
const NOOP_BROKER: ApprovalBrokerLike = {
  submit: () => { throw new Error('unexpected: broker.submit called — bridge should be fully faked in this test'); },
  decide: () => { throw new Error('unexpected: broker.decide called — bridge should be fully faked in this test'); },
  awaitDecision: () => Promise.reject(new Error('unexpected: broker.awaitDecision called — bridge should be fully faked in this test')),
};

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// ─── 1 & 2 — flag-off / seam-not-wired: byte-identical historical behavior ──

describe('handleWorkerQuestion — bridge seam OFF stays byte-identical', () => {
  it('flag-off: fake bridge is never called, historical continue answer is written', () => {
    const tmpDir = mkTmp();
    writeQuestionFile(tmpDir, buildQuestion('bw-off'));
    const bridge = vi.fn(() => Promise.resolve(fakeBridgedResult('bw-off', 'skip')));

    const answer = handleWorkerQuestion(tmpDir, 'bw-off', {
      bridge,
      broker: NOOP_BROKER,
      questionBridgeEnabled: false,
    });

    expect(bridge).not.toHaveBeenCalled();
    expect(answer).toBeDefined();
    expect(answer!.action).toBe('continue');
    expect(answer!.message).toBe('Auto-continue: Brain acknowledged question');
    expect(readAnswerFile(tmpDir, 'bw-off')?.action).toBe('continue');
  });

  it('flag-on without a bridge/broker supplied: seam inert, historical continue answer', () => {
    const tmpDir = mkTmp();
    writeQuestionFile(tmpDir, buildQuestion('bw-noseam'));

    const answer = handleWorkerQuestion(tmpDir, 'bw-noseam', { questionBridgeEnabled: true });

    expect(answer).toBeDefined();
    expect(answer!.action).toBe('continue');
    expect(answer!.message).toBe('Auto-continue: Brain acknowledged question');
  });

  it('flag-on with only a bridge (no broker): seam still inert', () => {
    const tmpDir = mkTmp();
    writeQuestionFile(tmpDir, buildQuestion('bw-nobroker'));
    const bridge = vi.fn(() => Promise.resolve(fakeBridgedResult('bw-nobroker', 'skip')));

    const answer = handleWorkerQuestion(tmpDir, 'bw-nobroker', { bridge, questionBridgeEnabled: true });

    expect(bridge).not.toHaveBeenCalled();
    expect(answer!.action).toBe('continue');
  });
});

// ─── 3 — flag-on + full seam: question is bridged ────────────────────────────

describe('handleWorkerQuestion — bridge seam ON delegates to the broker', () => {
  it('calls the bridge with the question + broker, and writes the resolved BrainAnswer', async () => {
    const tmpDir = mkTmp();
    writeQuestionFile(tmpDir, buildQuestion('bw-on', { suggestedAction: 'skip' }));
    let resolveBridge!: (r: QuestionBridgeResult) => void;
    const pending = new Promise<QuestionBridgeResult>((resolve) => { resolveBridge = resolve; });
    const bridge = vi.fn(() => pending);

    const first = handleWorkerQuestion(tmpDir, 'bw-on', {
      bridge,
      broker: NOOP_BROKER,
      questionBridgeEnabled: true,
    });

    // Fire-and-forget: no answer yet, nothing written, but the bridge WAS invoked.
    expect(first).toBeUndefined();
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge.mock.calls[0][0].taskId).toBe('bw-on');
    expect(bridge.mock.calls[0][1]).toBe(NOOP_BROKER);
    expect(existsSync(getAnswerPath(tmpDir, 'bw-on'))).toBe(false);

    resolveBridge(fakeBridgedResult('bw-on', 'skip'));
    await flushMicrotasks();

    const written = readAnswerFile(tmpDir, 'bw-on');
    expect(written).toBeDefined();
    expect(written!.action).toBe('skip');
    expect(written!.message).toBe('bridged-skip');
  });
});

// ─── 4 — NPM-ADVISORY always wins, bridge or not ─────────────────────────────

describe('handleWorkerQuestion — NPM-ADVISORY never crosses the bridge seam', () => {
  it('answers deterministically and never invokes the bridge, even fully wired', () => {
    const tmpDir = mkTmp();
    writeQuestionFile(tmpDir, buildQuestion('bw-npm', {
      question: '[NPM-ADVISORY] needs left-pad@1.3.0 for string alignment',
      suggestedAction: 'continue',
    }));
    const bridge = vi.fn(() => Promise.resolve(fakeBridgedResult('bw-npm', 'continue')));

    const answer = handleWorkerQuestion(tmpDir, 'bw-npm', {
      bridge,
      broker: NOOP_BROKER,
      questionBridgeEnabled: true,
    });

    expect(bridge).not.toHaveBeenCalled();
    expect(answer!.action).toBe('continue');
    expect(answer!.message).toBe(NPM_ADVISORY_ANSWER_MESSAGE);
  });
});

// ─── 5 — in-flight dedupe ─────────────────────────────────────────────────────

describe('handleWorkerQuestion — bridge seam in-flight dedupe', () => {
  it('a still-pending round-trip is not resubmitted by concurrent polls', () => {
    const tmpDir = mkTmp();
    writeQuestionFile(tmpDir, buildQuestion('bw-dedupe'));
    const bridge = vi.fn(() => new Promise<QuestionBridgeResult>(() => { /* never settles in this test */ }));

    handleWorkerQuestion(tmpDir, 'bw-dedupe', { bridge, broker: NOOP_BROKER, questionBridgeEnabled: true });
    handleWorkerQuestion(tmpDir, 'bw-dedupe', { bridge, broker: NOOP_BROKER, questionBridgeEnabled: true });
    handleWorkerQuestion(tmpDir, 'bw-dedupe', { bridge, broker: NOOP_BROKER, questionBridgeEnabled: true });

    expect(bridge).toHaveBeenCalledTimes(1);
  });
});

// ─── 6 — post-resolution reuse ────────────────────────────────────────────────

describe('handleWorkerQuestion — bridge seam post-resolution reuse', () => {
  it('a later call surfaces the settled answer without invoking the bridge again', async () => {
    const tmpDir = mkTmp();
    writeQuestionFile(tmpDir, buildQuestion('bw-settled'));
    const bridge = vi.fn(() => Promise.resolve(fakeBridgedResult('bw-settled', 'abort')));

    const first = handleWorkerQuestion(tmpDir, 'bw-settled', {
      bridge,
      broker: NOOP_BROKER,
      questionBridgeEnabled: true,
    });
    expect(first).toBeUndefined();
    await flushMicrotasks();
    expect(bridge).toHaveBeenCalledTimes(1);

    const second = handleWorkerQuestion(tmpDir, 'bw-settled', {
      bridge,
      broker: NOOP_BROKER,
      questionBridgeEnabled: true,
    });
    expect(second).toBeDefined();
    expect(second!.action).toBe('abort');
    expect(second!.message).toBe('bridged-abort');
    expect(bridge).toHaveBeenCalledTimes(1);
  });
});

// ─── 7 — checkWorkerQuestions forwards the seam end-to-end ───────────────────

describe('checkWorkerQuestions — forwards the bridge seam', () => {
  it('bridges a pending question for an uncollected task when flag+seam are supplied', async () => {
    const tmpDir = mkTmp();
    writeQuestionFile(tmpDir, buildQuestion('cwq-bridge'));
    const bridge = vi.fn(() => Promise.resolve(fakeBridgedResult('cwq-bridge', 'retry')));

    const answered = checkWorkerQuestions(tmpDir, new Set(['cwq-bridge']), new Set<string>(), {
      bridge,
      broker: NOOP_BROKER,
      questionBridgeEnabled: true,
    });

    // First tick: the round-trip is still in flight, nothing settled synchronously yet.
    expect(answered).toHaveLength(0);
    expect(bridge).toHaveBeenCalledTimes(1);

    await flushMicrotasks();

    expect(existsSync(getAnswerPath(tmpDir, 'cwq-bridge'))).toBe(true);
    const written = readAnswerFile(tmpDir, 'cwq-bridge');
    expect(written!.action).toBe('retry');
  });

  it('flag-off: checkWorkerQuestions answers synchronously with the historical continue, bridge unused', () => {
    const tmpDir = mkTmp();
    writeQuestionFile(tmpDir, buildQuestion('cwq-off'));
    const bridge = vi.fn(() => Promise.resolve(fakeBridgedResult('cwq-off', 'skip')));

    const answered = checkWorkerQuestions(tmpDir, new Set(['cwq-off']), new Set<string>(), {
      bridge,
      broker: NOOP_BROKER,
      questionBridgeEnabled: false,
    });

    expect(answered).toContain('cwq-off');
    expect(bridge).not.toHaveBeenCalled();
    expect(readAnswerFile(tmpDir, 'cwq-off')?.action).toBe('continue');
  });
});

// Note: each test above uses a unique taskId + a fresh tmpDir, so the
// module-level in-flight guard in ipc-registry.ts never leaks state across
// tests — no test-only reset hook is exported (would widen the public
// surface for zero production benefit).
