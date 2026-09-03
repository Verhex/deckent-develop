import { describe, expect, it } from 'vitest';

import {
  createXVerifyTaskSettlement,
  parseXVerifyTaskSettlement,
  type CreateXVerifyTaskSettlementInput,
  type XVerifyTaskDispatchOutcome,
} from '../../src/core/xverify-task-settlement.js';

const hash = `sha256:${'a'.repeat(64)}`;
const base = {
  taskId: 'task-1',
  invocationId: 'invocation-1',
  attemptId: 'attempt-1',
  generation: 3,
  producerProvider: 'codex',
  verifierProvider: 'anthropic',
} as const;

function transport(overrides: Record<string, unknown> = {}) {
  return {
    taskId: base.taskId,
    invocationId: base.invocationId,
    attemptId: base.attemptId,
    generation: base.generation,
    terminal: true as const,
    provider: base.verifierProvider,
    evidenceRef: 'transport:terminal:1',
    receiptDigest: hash,
    ...overrides,
  };
}

function adjudicated(verdict: 'confirmed' | 'refuted' | 'unclear'): XVerifyTaskDispatchOutcome {
  return {
    kind: 'adjudicated',
    transportReceipt: transport(),
    hostAdjudication: {
      verdict,
      disposition: verdict === 'unclear' ? 'fail-closed' : 'accepted',
      evidenceRef: `host-adjudication:${verdict}`,
      adjudicationDigest: hash,
    },
  };
}

function settle(dispatchOutcome: XVerifyTaskDispatchOutcome) {
  return createXVerifyTaskSettlement({ ...base, dispatchOutcome });
}

describe('XVerify internal task settlement', () => {
  it('cryptographically binds exact owner tier authority provenance', () => {
    const withoutAuthority = settle(adjudicated('confirmed'));
    const withAuthority = createXVerifyTaskSettlement({
      ...base,
      authorityEvidenceRef: 'owner-live-2026-08-24-opus5-xverify-accepted',
      dispatchOutcome: adjudicated('confirmed'),
    });

    expect(withAuthority.authorityEvidenceRef)
      .toBe('owner-live-2026-08-24-opus5-xverify-accepted');
    expect(withAuthority.evidenceRefs)
      .toContain('owner-live-2026-08-24-opus5-xverify-accepted');
    expect(withAuthority.settlementDigest).not.toBe(withoutAuthority.settlementDigest);
    expect(() => createXVerifyTaskSettlement({
      ...base,
      authorityEvidenceRef: ' ',
      dispatchOutcome: adjudicated('confirmed'),
    })).toThrow('authorityEvidenceRef is invalid');
  });

  it.each([
    ['confirmed', 'DONE'],
    ['refuted', 'NO_GO'],
    ['unclear', 'NO_GO'],
  ] as const)('projects host-adjudicated %s as terminal %s', (verdict, status) => {
    const receipt = settle(adjudicated(verdict));
    expect(receipt).toMatchObject({
      state: 'settled',
      outcome: verdict,
      projection: { terminal: true, status, resumable: false },
      noReplay: { policy: 'consume-once', onReplay: 'reject' },
    });
    expect(receipt.noReplay.replayKey).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('projects unavailable as terminal NO_GO rather than a pending stub', () => {
    expect(settle({
      kind: 'unavailable',
      transportReceipt: transport(),
      reason: 'provider endpoint unavailable',
      evidenceRef: 'availability:probe:1',
    })).toMatchObject({
      outcome: 'unavailable',
      projection: { terminal: true, status: 'NO_GO', resumable: false },
    });
  });

  it('projects HOLD only with typed fresh-generation resume authority', () => {
    const receipt = settle({
      kind: 'hold',
      reason: 'owner authority required',
      evidenceRef: 'hold:authority:1',
      resumeAuthority: {
        resumeToken: 'resume-token-1',
        nextAttemptId: 'attempt-2',
        nextGeneration: 4,
      },
    });
    expect(receipt).toMatchObject({
      outcome: 'HOLD',
      projection: {
        terminal: false,
        status: 'HOLD',
        resumable: true,
        nextAttemptId: 'attempt-2',
        nextGeneration: 4,
      },
      noReplay: { policy: 'consume-once', onReplay: 'reject' },
    });
    expect(() => settle({
      kind: 'hold',
      reason: 'stale authority',
      evidenceRef: 'hold:authority:old',
      resumeAuthority: {
        resumeToken: 'resume-token-old',
        nextAttemptId: base.attemptId,
        nextGeneration: base.generation,
      },
    })).toThrow('HOLD requires a fresh attempt and a later generation');
  });

  it('rejects cross-generation transport receipt replay', () => {
    const dispatch = adjudicated('confirmed');
    if (dispatch.kind !== 'adjudicated') throw new Error('test setup');
    expect(() => settle({
      ...dispatch,
      transportReceipt: transport({ generation: 2 }),
    })).toThrow('transport receipt identity does not match');
  });

  it('does not accept a provider verdict alone as a receipt', () => {
    expect(() => createXVerifyTaskSettlement({
      ...base,
      dispatchOutcome: { kind: 'adjudicated', providerVerdict: 'confirmed' },
    } as unknown as CreateXVerifyTaskSettlementInput)).toThrow();
  });

  it('forbids same-provider self-settlement', () => {
    expect(() => createXVerifyTaskSettlement({
      ...base,
      verifierProvider: base.producerProvider,
      dispatchOutcome: adjudicated('confirmed'),
    })).toThrow('same-provider self-settlement is forbidden');
  });

  it('binds no-replay keys to generation and settlement outcome', () => {
    const confirmed = settle(adjudicated('confirmed'));
    const refuted = settle(adjudicated('refuted'));
    const nextGeneration = createXVerifyTaskSettlement({
      ...base,
      attemptId: 'attempt-2',
      generation: 4,
      dispatchOutcome: {
        ...adjudicated('confirmed'),
        transportReceipt: transport({ attemptId: 'attempt-2', generation: 4 }),
      },
    });
    expect(confirmed.noReplay.replayKey).not.toBe(refuted.noReplay.replayKey);
    expect(confirmed.noReplay.replayKey).not.toBe(nextGeneration.noReplay.replayKey);
  });

  it('round-trips only a byte-semantic valid persisted receipt', () => {
    const receipt = createXVerifyTaskSettlement({
      ...base,
      authorityEvidenceRef: 'owner-live:xverify-tier-authority',
      dispatchOutcome: adjudicated('confirmed'),
    });
    const parsed = parseXVerifyTaskSettlement(JSON.parse(JSON.stringify(receipt)));
    expect(parsed).toEqual(receipt);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    ['settlement digest', (receipt: Record<string, unknown>) => {
      receipt.settlementDigest = `sha256:${'b'.repeat(64)}`;
    }],
    ['replay key', (receipt: Record<string, unknown>) => {
      (receipt.noReplay as Record<string, unknown>).replayKey = `sha256:${'b'.repeat(64)}`;
    }],
    ['unknown field', (receipt: Record<string, unknown>) => {
      receipt.publicResultPath = '.tasks/task-1.result';
    }],
  ] as const)('rejects persisted %s tampering', (_label, mutate) => {
    const receipt = JSON.parse(JSON.stringify(settle(adjudicated('confirmed')))) as Record<string, unknown>;
    mutate(receipt);
    expect(parseXVerifyTaskSettlement(receipt)).toBeNull();
  });
});
