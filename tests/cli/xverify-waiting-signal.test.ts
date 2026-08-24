// tests/cli/xverify-waiting-signal.test.ts
//
// Task 556-002 — the 16-minute silent block.
//
// `deckent xverify` used to sit inside the candidate-evidence approval poll
// loop with nothing on any stream: an operator could not tell a pending
// approval from a hung process, and `--timeout` bounded only the provider call,
// never the decision wait. This file pins the three contracts that fix it:
//
//   1. WAITING SIGNAL — one typed line per pending approval request, printed
//      exactly once, on stderr, only while the run is genuinely blocked.
//   2. BOUNDED WAIT — the EXISTING `--timeout` flag also caps the approval
//      decision window; expiry reports the existing typed `approval_undecided`
//      hold (no new outcome class, no exit-code change) naming the request id.
//   3. ADDITIVE `detail` — the hold detail reaches `--json`; every pre-existing
//      key keeps its exact position and value.
//
// Hermetic: fresh tmpdir project root, a fake approval authority, a fake
// preparation seam and a stubbed runner. No provider call, no Docker, no
// network, no real timer waits.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createApprovalWaitSignal,
  printXverifyWaitingApproval,
  resolveApprovalDecisionWindowMs,
  runXverifyCommand,
  runXverifyForResult,
  type XverifyDeps,
} from '../../src/cli/commands/xverify.js';
import { getLanguage, getMessage } from '../../src/cli/helpers/messages.js';
import type {
  CrossVerifyEvidencePreparationInput,
  CrossVerifyEvidencePreparationResult,
} from '../../src/orchestra/cross-verify-evidence-preparation.js';
import type { MandatoryCrossVerifyInvocationFactory } from '../../src/orchestra/cross-verify-runner.js';
import type { ApprovalAuthorityRuntimeService } from '../../src/core/approval-authority-runtime.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../src/core/provider-authority-composition.js';
import type { ResolvedConfig } from '../../src/core/types.js';

const REQUEST_A = 'aprp-556-002-a';
const REQUEST_B = 'aprp-556-002-b';
const VERIFIER_MODEL = 'gpt-5.6-sol';

const roots: string[] = [];
const priorExitCode = process.exitCode;

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = priorExitCode;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Fresh project root with auth_mode pinned — never inherits the host's config. */
function makeRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `deckent-xverify-wait-${prefix}-`));
  roots.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ auth_mode: 'subscription' }), 'utf-8');
  return root;
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 1,
      brain_model: 'claude-fable-5',
      default_model: 'claude-sonnet-5',
      haiku_allowed: false,
      brain_planning: 'structured',
    },
    modes: {},
    language: 'en',
    projectName: 'xverify-waiting-signal-test',
    projectRoot: '/unused',
    version: '1.0.0',
    auto_docs: { tier1: false, tier2: false, tier3: false },
    cross_verify: {
      enabled: true,
      high_stakes_only: false,
      verifier_priority: ['codex'],
      verifier_model: { codex: VERIFIER_MODEL },
      enforce_refuted: true,
    },
    approval: { authority: { enabled: true, tenant_id: 'local' } },
    ...overrides,
  } as unknown as ResolvedConfig;
}

/** Ready-shaped provider authority — only `terminationLedger` is ever touched. */
const readyProviderAuthority = {
  state: 'ready',
  service: { terminationLedger: {} },
} as unknown as ProviderAuthorityRuntimeServiceOpenResult;

/** The fake approval authority: exactly the `broker.list('pending')` surface. */
function fakeApprovalRuntime(pendingIds: readonly string[]): ApprovalAuthorityRuntimeService {
  return {
    broker: { list: () => pendingIds.map((id) => ({ id })) },
  } as unknown as ApprovalAuthorityRuntimeService;
}

const unusedInvocationFactory = {
  compose: async () => { throw new Error('the runner is stubbed; composition must not run'); },
} as unknown as MandatoryCrossVerifyInvocationFactory;

const stubRunner = vi.fn(async () => ({
  outcome: 'unavailable' as const,
  disposition: 'hold' as const,
  ran: false,
  skippedReason: 'stub-hold',
  refuted: false,
  blocked: false,
}));

/** Preparation that blocks for `sleeps` poll ticks, then holds undecided. */
function undecidedAfterPolling(sleeps: number, observed: { decisionWindowMs?: number } = {}) {
  return async (
    input: CrossVerifyEvidencePreparationInput,
  ): Promise<CrossVerifyEvidencePreparationResult> => {
    observed.decisionWindowMs = input.decisionWindowMs;
    for (let tick = 0; tick < sleeps; tick += 1) {
      await input.sleepFn?.(1);
    }
    return {
      state: 'hold',
      reasonCode: 'approval_undecided',
      detailCode: REQUEST_A,
      evidenceRefs: [],
      approvalRequestId: REQUEST_A,
    };
  };
}

/** Preparation whose decision was already on disk — never sleeps. */
const decidedFastPath = async (): Promise<CrossVerifyEvidencePreparationResult> => ({
  state: 'ready',
  reused: true,
  executionProfileRef: 'execution_profile.codex.subscription-cli',
  evidenceRefs: ['reachability:fresh'],
});

function approvalDeps(root: string, extra: Partial<XverifyDeps> = {}): XverifyDeps {
  return {
    resolveProjectRootFn: () => root,
    loadConfigFn: async () => makeConfig(),
    bootstrapProvidersFn: async () => undefined,
    runCrossVerifyFn: stubRunner,
    providerAuthority: readyProviderAuthority,
    mandatoryInvocationFactory: unusedInvocationFactory,
    openApprovalRuntimeFn: () => fakeApprovalRuntime([REQUEST_A, REQUEST_B]),
    sleepFn: async () => undefined,
    ...extra,
  };
}

// ─── 1. the waiting signal itself ───────────────────────────────────────

describe('xverify approval waiting signal', () => {
  it('announces each pending request exactly once, however many poll ticks pass', async () => {
    const announced: string[] = [];
    const sleepFn = vi.fn(async () => undefined);
    const signal = createApprovalWaitSignal({
      listPendingRequestIds: () => [REQUEST_A, REQUEST_B],
      onWaiting: (id) => { announced.push(id); },
      sleepFn,
    });

    await signal(2_000);
    await signal(2_000);
    await signal(2_000);

    expect(announced).toEqual([REQUEST_A, REQUEST_B]);
    expect(sleepFn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledWith(2_000);
  });

  it('announces a request that only becomes pending on a later tick', async () => {
    const announced: string[] = [];
    let pending: string[] = [];
    const signal = createApprovalWaitSignal({
      listPendingRequestIds: () => pending,
      onWaiting: (id) => { announced.push(id); },
      sleepFn: async () => undefined,
    });

    await signal(1);
    expect(announced).toEqual([]);
    pending = [REQUEST_A];
    await signal(1);
    await signal(1);

    expect(announced).toEqual([REQUEST_A]);
  });

  it('writes the typed line to stderr only, in both supported languages', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printXverifyWaitingApproval(REQUEST_A, 'en');
    printXverifyWaitingApproval(REQUEST_A, 'tr');

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr.mock.calls.map((call) => String(call[0]))).toEqual([
      `${getMessage('xverify.prepare.waiting_approval', 'en', { requestId: REQUEST_A })}\n`,
      `${getMessage('xverify.prepare.waiting_approval', 'tr', { requestId: REQUEST_A })}\n`,
    ]);
    // The line names the exact command that unblocks the run.
    expect(getMessage('xverify.prepare.waiting_approval', 'en', { requestId: REQUEST_A }))
      .toBe(`waiting-approval: ${REQUEST_A} — decide via \`deckent approvals decide ${REQUEST_A}\``);
    expect(getMessage('xverify.prepare.waiting_approval', 'tr', { requestId: REQUEST_A }))
      .toContain(`deckent approvals decide ${REQUEST_A}`);
  });
});

// ─── 2. the bounded approval wait ───────────────────────────────────────

describe('xverify approval-phase timeout — --timeout bounds, never extends', () => {
  it('takes the minimum of the authored window and the operator timeout', () => {
    expect(resolveApprovalDecisionWindowMs({ authoredWindowMs: 600_000, requestedTimeoutMs: 5_000 })).toBe(5_000);
    expect(resolveApprovalDecisionWindowMs({ authoredWindowMs: 5_000, requestedTimeoutMs: 600_000 })).toBe(5_000);
  });

  it('leaves the mechanism default untouched when neither bound exists', () => {
    expect(resolveApprovalDecisionWindowMs({ authoredWindowMs: undefined, requestedTimeoutMs: undefined }))
      .toBeUndefined();
  });

  it('keeps the authored window when no --timeout was given', () => {
    expect(resolveApprovalDecisionWindowMs({ authoredWindowMs: 120_000, requestedTimeoutMs: undefined }))
      .toBe(120_000);
  });

  it('bounds the decision window with --timeout and holds typed undecided with the request id', async () => {
    const root = makeRoot('undecided');
    const observed: { decisionWindowMs?: number } = {};
    const waiting: string[] = [];

    const result = await runXverifyForResult('Claim under a bounded approval wait.', {
      author: 'claude',
      verifier: 'codex',
      timeout: '7000',
      files: 'src/core/a.ts',
    }, approvalDeps(root, {
      prepareCandidateEvidenceFn: undecidedAfterPolling(3, observed),
      onApprovalWaiting: ({ requestId }) => { waiting.push(requestId); },
    }));

    // The wait was bounded by the operator's single existing flag.
    expect(observed.decisionWindowMs).toBe(7_000);
    // One line per pending request, once — three poll ticks, still two lines.
    expect(waiting).toEqual([REQUEST_A, REQUEST_B]);
    // The existing typed hold detail reaches the caller, naming the exact id.
    expect(result.detail).toBe(REQUEST_A);
    // No new outcome class, and holds still do not set a failure exit code.
    expect(result.outcome).toBe('unavailable');
    expect(result.skippedReason).toBe('stub-hold');
    expect(process.exitCode).toBe(priorExitCode);
  });

  it('prints no waiting line when the decision is already there (fast path)', async () => {
    const root = makeRoot('decided');
    const waiting: string[] = [];

    const result = await runXverifyForResult('Claim whose probe approval is already decided.', {
      author: 'claude',
      verifier: 'codex',
      files: 'src/core/a.ts',
    }, approvalDeps(root, {
      prepareCandidateEvidenceFn: decidedFastPath,
      onApprovalWaiting: ({ requestId }) => { waiting.push(requestId); },
    }));

    expect(waiting).toEqual([]);
    // Nothing held during preparation, so there is no preparation detail.
    expect(result.detail).toBeNull();
  });
});

// ─── 3. `--json` stays machine-clean and backward compatible ────────────

describe('xverify --json output', () => {
  /** Canonical machine payload order; `detail` remains the append-only tail. */
  const EXISTING_KEYS = [
    'id', 'author', 'authorModel', 'authorModelConfidence', 'verifier', 'verifierModel',
    'tierAdmission', 'tierDecisionRef', 'verdict', 'outcome', 'disposition', 'blocked',
    'skippedReason', 'reason', 'execution', 'assurance', 'adjudicationReceiptRef',
    'settlementRef', 'remedy', 'rejection', 'report',
  ];

  it('emits exactly one parseable document on stdout while the waiting signal goes to stderr', async () => {
    const root = makeRoot('json');
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });

    await runXverifyCommand('Claim verified over --json.', {
      author: 'claude',
      verifier: 'codex',
      timeout: '7000',
      files: 'src/core/a.ts',
      json: true,
    }, approvalDeps(root, { prepareCandidateEvidenceFn: undecidedAfterPolling(2) }));

    stdout.mockRestore();
    stderr.mockRestore();

    const parsed = JSON.parse(stdoutChunks.join('')) as Record<string, unknown>;

    // Additive only: every pre-existing key keeps its exact position, `detail`
    // is appended last, and `skippedReason` keeps its exact prior value.
    expect(Object.keys(parsed)).toEqual([...EXISTING_KEYS, 'detail']);
    expect(parsed['skippedReason']).toBe('stub-hold');
    expect(parsed['detail']).toBe(REQUEST_A);

    // Every diagnostic — waiting signal, bounded-expiry note, hold, remedy —
    // stayed off stdout.
    const lang = getLanguage(undefined);
    const stderrText = stderrChunks.join('');
    expect(stderrText).toContain(
      getMessage('xverify.prepare.waiting_approval', lang, { requestId: REQUEST_A }),
    );
    expect(stderrText).toContain(
      getMessage('xverify.prepare.waiting_approval', lang, { requestId: REQUEST_B }),
    );
    expect(stderrText).toContain(REQUEST_A);
    expect(stderrText).toContain('approval_undecided');
    expect(process.exitCode).toBe(priorExitCode);
  });
});
