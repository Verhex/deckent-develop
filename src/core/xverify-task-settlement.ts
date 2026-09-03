import { createHash } from 'node:crypto';

/**
 * Host-owned settlement for one internal XVerify task dispatch.
 *
 * A provider's verdict is deliberately not an input arm.  A completed dispatch
 * can be settled only from a host-derived adjudication and a terminal transport
 * receipt which are bound to the same invocation, attempt, and generation.
 */
export const XVERIFY_TASK_SETTLEMENT_SCHEMA_VERSION = 1 as const;

export type XVerifyTaskVerdict = 'confirmed' | 'refuted' | 'unclear';
export type XVerifyTaskSettlementOutcome = XVerifyTaskVerdict | 'unavailable' | 'HOLD';

export interface XVerifyTaskInvocationIdentity {
  readonly taskId: string;
  readonly invocationId: string;
  readonly attemptId: string;
  readonly generation: number;
}

export interface XVerifyTerminalTransportReceipt extends XVerifyTaskInvocationIdentity {
  readonly terminal: true;
  readonly provider: string;
  readonly evidenceRef: string;
  readonly receiptDigest: string;
}

export interface XVerifyHostAdjudicationEvidence {
  readonly verdict: XVerifyTaskVerdict;
  readonly disposition: 'accepted' | 'fail-closed';
  readonly evidenceRef: string;
  readonly adjudicationDigest: string;
}

export type XVerifyTaskDispatchOutcome =
  | {
      readonly kind: 'adjudicated';
      readonly transportReceipt: Readonly<XVerifyTerminalTransportReceipt>;
      readonly hostAdjudication: Readonly<XVerifyHostAdjudicationEvidence>;
    }
  | {
      readonly kind: 'unavailable';
      readonly transportReceipt: Readonly<XVerifyTerminalTransportReceipt>;
      readonly reason: string;
      readonly evidenceRef: string;
    }
  | {
      readonly kind: 'hold';
      readonly reason: string;
      readonly evidenceRef: string;
      readonly resumeAuthority: {
        readonly resumeToken: string;
        readonly nextAttemptId: string;
        readonly nextGeneration: number;
      };
    };

export interface XVerifyNoReplayDisposition {
  readonly policy: 'consume-once';
  readonly replayKey: string;
  readonly onReplay: 'reject';
}

export type XVerifyTaskProjection =
  | { readonly terminal: true; readonly status: 'DONE' | 'NO_GO'; readonly resumable: false }
  | {
      readonly terminal: false;
      readonly status: 'HOLD';
      readonly resumable: true;
      readonly resumeToken: string;
      readonly nextAttemptId: string;
      readonly nextGeneration: number;
    };

export interface XVerifyTaskSettlementReceipt extends XVerifyTaskInvocationIdentity {
  readonly schemaVersion: typeof XVERIFY_TASK_SETTLEMENT_SCHEMA_VERSION;
  readonly state: 'settled';
  readonly outcome: XVerifyTaskSettlementOutcome;
  readonly producerProvider: string;
  readonly verifierProvider: string;
  /** Exact owner decision that admitted a below-tier author/verifier pair. */
  readonly authorityEvidenceRef?: string;
  readonly evidenceRefs: readonly string[];
  readonly projection: XVerifyTaskProjection;
  readonly noReplay: XVerifyNoReplayDisposition;
  readonly settlementDigest: string;
}

export interface CreateXVerifyTaskSettlementInput extends XVerifyTaskInvocationIdentity {
  readonly producerProvider: string;
  readonly verifierProvider: string;
  /** Exact owner decision that admitted a below-tier author/verifier pair. */
  readonly authorityEvidenceRef?: string;
  readonly dispatchOutcome: XVerifyTaskDispatchOutcome;
}

export class XVerifyTaskSettlementError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'XVerifyTaskSettlementError';
  }
}

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}

function fail(message: string): never {
  throw new XVerifyTaskSettlementError(message);
}

function assertId(label: string, value: string): void {
  if (!ID.test(value)) fail(`${label} is invalid`);
}

function assertEvidenceRef(label: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 4_096) {
    fail(`${label} is invalid`);
  }
}

function assertDigest(label: string, value: string): void {
  if (!SHA256.test(value)) fail(`${label} is invalid`);
}

function assertIdentity(identity: XVerifyTaskInvocationIdentity): void {
  assertId('taskId', identity.taskId);
  assertId('invocationId', identity.invocationId);
  assertId('attemptId', identity.attemptId);
  if (!Number.isSafeInteger(identity.generation) || identity.generation < 0) {
    fail('generation is invalid');
  }
}

function assertTransportReceipt(
  expected: XVerifyTaskInvocationIdentity,
  receipt: XVerifyTerminalTransportReceipt,
): void {
  assertIdentity(receipt);
  if (!receipt.terminal) fail('transport receipt is not terminal');
  if (receipt.taskId !== expected.taskId
    || receipt.invocationId !== expected.invocationId
    || receipt.attemptId !== expected.attemptId
    || receipt.generation !== expected.generation) {
    fail('transport receipt identity does not match this invocation attempt generation');
  }
  assertId('transport provider', receipt.provider);
  assertEvidenceRef('transport evidenceRef', receipt.evidenceRef);
  assertDigest('transport receiptDigest', receipt.receiptDigest);
}

function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

/**
 * Parse and independently re-derive a persisted XVerify settlement receipt.
 * Unknown fields, malformed projections, digest drift and replay-key drift all
 * fail closed; callers never gain authority from a type assertion over JSON.
 */
export function parseXVerifyTaskSettlement(
  value: unknown,
): Readonly<XVerifyTaskSettlementReceipt> | null {
  try {
    if (!isRecord(value)) return null;
    const hasAuthority = value.authorityEvidenceRef !== undefined;
    if (!hasExactKeys(value, [
      'schemaVersion',
      'state',
      'taskId',
      'invocationId',
      'attemptId',
      'generation',
      'outcome',
      'producerProvider',
      'verifierProvider',
      ...(hasAuthority ? ['authorityEvidenceRef'] : []),
      'evidenceRefs',
      'projection',
      'noReplay',
      'settlementDigest',
    ])) return null;
    if (value.schemaVersion !== XVERIFY_TASK_SETTLEMENT_SCHEMA_VERSION
      || value.state !== 'settled'
      || typeof value.taskId !== 'string'
      || typeof value.invocationId !== 'string'
      || typeof value.attemptId !== 'string'
      || typeof value.generation !== 'number'
      || typeof value.producerProvider !== 'string'
      || typeof value.verifierProvider !== 'string'
      || typeof value.settlementDigest !== 'string') return null;

    const identity: XVerifyTaskInvocationIdentity = {
      taskId: value.taskId,
      invocationId: value.invocationId,
      attemptId: value.attemptId,
      generation: value.generation,
    };
    assertIdentity(identity);
    assertId('producerProvider', value.producerProvider);
    assertId('verifierProvider', value.verifierProvider);
    if (value.producerProvider === value.verifierProvider) return null;
    if (hasAuthority) {
      if (typeof value.authorityEvidenceRef !== 'string') return null;
      assertEvidenceRef('authorityEvidenceRef', value.authorityEvidenceRef);
    }
    if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length === 0
      || value.evidenceRefs.some(ref => typeof ref !== 'string')) return null;
    const evidenceRefs = value.evidenceRefs as string[];
    for (const ref of evidenceRefs) assertEvidenceRef('evidenceRef', ref);
    if (new Set(evidenceRefs).size !== evidenceRefs.length) return null;
    if (hasAuthority && !evidenceRefs.includes(value.authorityEvidenceRef as string)) return null;

    if (!isRecord(value.projection)) return null;
    const outcome = value.outcome;
    let projection: XVerifyTaskProjection;
    if (outcome === 'HOLD') {
      if (!hasExactKeys(value.projection, [
        'terminal', 'status', 'resumable', 'resumeToken', 'nextAttemptId', 'nextGeneration',
      ])
        || value.projection.terminal !== false
        || value.projection.status !== 'HOLD'
        || value.projection.resumable !== true
        || typeof value.projection.resumeToken !== 'string'
        || typeof value.projection.nextAttemptId !== 'string'
        || typeof value.projection.nextGeneration !== 'number') return null;
      assertId('resumeToken', value.projection.resumeToken);
      assertId('nextAttemptId', value.projection.nextAttemptId);
      if (!Number.isSafeInteger(value.projection.nextGeneration)
        || value.projection.nextGeneration <= identity.generation
        || value.projection.nextAttemptId === identity.attemptId) return null;
      projection = {
        terminal: false,
        status: 'HOLD',
        resumable: true,
        resumeToken: value.projection.resumeToken,
        nextAttemptId: value.projection.nextAttemptId,
        nextGeneration: value.projection.nextGeneration,
      };
    } else {
      if (outcome !== 'confirmed' && outcome !== 'refuted'
        && outcome !== 'unclear' && outcome !== 'unavailable') return null;
      const expectedStatus = outcome === 'confirmed' ? 'DONE' : 'NO_GO';
      if (!hasExactKeys(value.projection, ['terminal', 'status', 'resumable'])
        || value.projection.terminal !== true
        || value.projection.status !== expectedStatus
        || value.projection.resumable !== false) return null;
      projection = { terminal: true, status: expectedStatus, resumable: false };
    }

    if (!isRecord(value.noReplay)
      || !hasExactKeys(value.noReplay, ['policy', 'replayKey', 'onReplay'])
      || value.noReplay.policy !== 'consume-once'
      || value.noReplay.onReplay !== 'reject'
      || typeof value.noReplay.replayKey !== 'string') return null;
    assertDigest('settlementDigest', value.settlementDigest);

    const parsedOutcome = outcome as XVerifyTaskSettlementOutcome;
    const body = {
      schemaVersion: XVERIFY_TASK_SETTLEMENT_SCHEMA_VERSION,
      state: 'settled' as const,
      ...identity,
      outcome: parsedOutcome,
      producerProvider: value.producerProvider,
      verifierProvider: value.verifierProvider,
      ...(hasAuthority ? { authorityEvidenceRef: value.authorityEvidenceRef as string } : {}),
      evidenceRefs: [...evidenceRefs],
      projection,
    };
    if (digest(body) !== value.settlementDigest) return null;
    const expectedReplayKey = digest({
      ...identity,
      settlementDigest: value.settlementDigest,
    });
    if (value.noReplay.replayKey !== expectedReplayKey) return null;

    return freeze({
      ...body,
      noReplay: {
        policy: 'consume-once',
        replayKey: value.noReplay.replayKey,
        onReplay: 'reject',
      },
      settlementDigest: value.settlementDigest,
    });
  } catch {
    return null;
  }
}

/**
 * Reduce every dispatch result to either a terminal task projection or an
 * explicit resumable HOLD.  The returned replay key is identity- and
 * settlement-bound, so it cannot authorize another generation.
 */
export function createXVerifyTaskSettlement(
  input: CreateXVerifyTaskSettlementInput,
): Readonly<XVerifyTaskSettlementReceipt> {
  assertIdentity(input);
  assertId('producerProvider', input.producerProvider);
  assertId('verifierProvider', input.verifierProvider);
  if (input.producerProvider === input.verifierProvider) {
    fail('same-provider self-settlement is forbidden');
  }
  if (input.authorityEvidenceRef !== undefined) {
    assertEvidenceRef('authorityEvidenceRef', input.authorityEvidenceRef);
  }

  let outcome: XVerifyTaskSettlementOutcome;
  let evidenceRefs: readonly string[];
  let projection: XVerifyTaskProjection;

  switch (input.dispatchOutcome.kind) {
    case 'adjudicated': {
      const { hostAdjudication, transportReceipt } = input.dispatchOutcome;
      assertTransportReceipt(input, transportReceipt);
      if (transportReceipt.provider !== input.verifierProvider) {
        fail('transport receipt provider does not match verifierProvider');
      }
      if (!['confirmed', 'refuted', 'unclear'].includes(hostAdjudication.verdict)) {
        fail('host adjudication verdict is invalid');
      }
      if (hostAdjudication.disposition !== 'accepted'
        && hostAdjudication.disposition !== 'fail-closed') {
        fail('host adjudication disposition is invalid');
      }
      if (hostAdjudication.disposition === 'fail-closed'
        && hostAdjudication.verdict !== 'unclear') {
        fail('fail-closed adjudication must be unclear');
      }
      assertEvidenceRef('adjudication evidenceRef', hostAdjudication.evidenceRef);
      assertDigest('adjudication digest', hostAdjudication.adjudicationDigest);
      outcome = hostAdjudication.verdict;
      evidenceRefs = [transportReceipt.evidenceRef, hostAdjudication.evidenceRef];
      projection = outcome === 'confirmed'
        ? { terminal: true, status: 'DONE', resumable: false }
        : { terminal: true, status: 'NO_GO', resumable: false };
      break;
    }
    case 'unavailable': {
      assertTransportReceipt(input, input.dispatchOutcome.transportReceipt);
      if (input.dispatchOutcome.transportReceipt.provider !== input.verifierProvider) {
        fail('transport receipt provider does not match verifierProvider');
      }
      assertEvidenceRef('unavailable evidenceRef', input.dispatchOutcome.evidenceRef);
      if (input.dispatchOutcome.reason.trim().length === 0) fail('unavailable reason is required');
      outcome = 'unavailable';
      evidenceRefs = [
        input.dispatchOutcome.transportReceipt.evidenceRef,
        input.dispatchOutcome.evidenceRef,
      ];
      projection = { terminal: true, status: 'NO_GO', resumable: false };
      break;
    }
    case 'hold': {
      const { resumeAuthority } = input.dispatchOutcome;
      assertEvidenceRef('hold evidenceRef', input.dispatchOutcome.evidenceRef);
      if (input.dispatchOutcome.reason.trim().length === 0) fail('hold reason is required');
      assertId('resumeToken', resumeAuthority.resumeToken);
      assertId('nextAttemptId', resumeAuthority.nextAttemptId);
      if (!Number.isSafeInteger(resumeAuthority.nextGeneration)
        || resumeAuthority.nextGeneration <= input.generation
        || resumeAuthority.nextAttemptId === input.attemptId) {
        fail('HOLD requires a fresh attempt and a later generation');
      }
      outcome = 'HOLD';
      evidenceRefs = [input.dispatchOutcome.evidenceRef];
      projection = {
        terminal: false,
        status: 'HOLD',
        resumable: true,
        ...resumeAuthority,
      };
      break;
    }
    default: {
      const exhaustive: never = input.dispatchOutcome;
      return exhaustive;
    }
  }

  const boundEvidenceRefs = [...new Set(input.authorityEvidenceRef === undefined
    ? evidenceRefs
    : [...evidenceRefs, input.authorityEvidenceRef])];
  const body = {
    schemaVersion: XVERIFY_TASK_SETTLEMENT_SCHEMA_VERSION,
    state: 'settled' as const,
    taskId: input.taskId,
    invocationId: input.invocationId,
    attemptId: input.attemptId,
    generation: input.generation,
    outcome,
    producerProvider: input.producerProvider,
    verifierProvider: input.verifierProvider,
    ...(input.authorityEvidenceRef !== undefined
      ? { authorityEvidenceRef: input.authorityEvidenceRef }
      : {}),
    evidenceRefs: boundEvidenceRefs,
    projection,
  };
  const settlementDigest = digest(body);
  return freeze({
    ...body,
    noReplay: {
      policy: 'consume-once',
      replayKey: digest({
        taskId: input.taskId,
        invocationId: input.invocationId,
        attemptId: input.attemptId,
        generation: input.generation,
        settlementDigest,
      }),
      onReplay: 'reject',
    },
    settlementDigest,
  });
}
