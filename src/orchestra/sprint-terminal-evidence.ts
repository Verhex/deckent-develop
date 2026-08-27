/**
 * Pure, bounded evidence projection for sprint terminal settlement.
 *
 * This module deliberately owns no lifecycle decisions. Callers supply already
 * collected exact-attempt snapshots; the assembler folds and classifies them
 * without filesystem access, repository discovery, process control, cleanup,
 * or state mutation. A lifecycle finalizer may consume the projection, but it
 * remains the sole authority for completion and cleanup decisions.
 */

export const SPRINT_TERMINAL_EVIDENCE_VERSION = 1 as const;

export const SPRINT_TERMINAL_EVIDENCE_LIMITS = Object.freeze({
  attempts: 100_000,
  coordinatorEvidence: 100_000,
});

export type TerminalVerdict = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';

export interface ExactAttemptIdentity {
  readonly taskId: string;
  readonly attemptId: string;
}

export type AttemptTerminalAuthority =
  | {
      readonly state: 'ACTIVE' | 'UNSETTLED';
      readonly evidenceRef?: string | null;
    }
  | {
      readonly state: 'TERMINAL';
      readonly verdict: TerminalVerdict;
      readonly evidenceRef: string;
      readonly reasonCode?: string;
      /** Host-terminal NOT_DISPATCHED/cascade-skip class — policy-settled, worker never ran (3301). */
      readonly hostTerminalNotDispatched?: boolean;
    }
  | {
      readonly state: 'UNKNOWN';
      readonly evidenceRef?: string | null;
      readonly reasonCode: string;
    };

export type AttemptResultEvidence<TResult> =
  | { readonly state: 'ABSENT' }
  | {
      /** Host-confirmed zero-work terminal outcome; no worker result may be fabricated. */
      readonly state: 'NOT_APPLICABLE';
      readonly evidenceRef: string;
      readonly reasonCode: string;
    }
  | {
      readonly state: 'PARTIAL';
      readonly evidenceRef: string;
      readonly payload?: TResult;
      readonly reasonCode: string;
    }
  | {
      readonly state: 'COMPLETE';
      readonly verdict: TerminalVerdict;
      readonly evidenceRef: string;
      readonly payload: TResult;
    }
  | {
      readonly state: 'UNKNOWN' | 'CONTRADICTORY';
      readonly evidenceRef?: string | null;
      readonly payload?: TResult;
      readonly reasonCode: string;
    };

export type WorkAttributionEvidence =
  | {
      readonly state: 'VERIFIED';
      readonly evidenceRef: string;
      readonly filesChanged: readonly string[];
      readonly linesAdded: number;
      readonly linesRemoved: number;
    }
  | {
      readonly state: 'HOLD' | 'UNAVAILABLE';
      readonly evidenceRef?: string | null;
      readonly reasonCode: string;
      /** RCPT-1: paths the attempt CLAIMED to touch (e.g. out-of-scope claim
       *  list). Enables resolution-aware cleanup eligibility; absence means
       *  the claims are unknown and eligibility fails closed. */
      readonly claimedPaths?: readonly string[];
    };

export interface ExactAttemptEvidence<TResult = unknown> {
  readonly logicalTaskId: string;
  readonly identity: ExactAttemptIdentity;
  /** RCPT-1 supp: the attempt's declared write scope (exact file paths). A
   *  COMPLETED lineage's RESOLVING attempt attests the final state of its
   *  scope, so these paths join the accountability union for exclusions. */
  readonly writeScope?: readonly string[];
  /** The exact predecessor. Null/undefined identifies a lineage root. */
  readonly supersedes?: ExactAttemptIdentity | null;
  readonly authority: AttemptTerminalAuthority;
  readonly result: AttemptResultEvidence<TResult>;
  readonly attribution: WorkAttributionEvidence;
}

export interface CoordinatorTerminalEvidence {
  readonly evidenceId: string;
  readonly kind: string;
  readonly state: 'VERIFIED' | 'HOLD' | 'UNAVAILABLE';
  readonly evidenceRef?: string | null;
  readonly requiredForCleanup: boolean;
  readonly attempt?: ExactAttemptIdentity | null;
  readonly reasonCode?: string | null;
}

export interface SprintTerminalEvidenceLimits {
  readonly attempts?: number;
  readonly coordinatorEvidence?: number;
}

export interface AssembleSprintTerminalEvidenceInput<TResult = unknown> {
  readonly attempts: readonly ExactAttemptEvidence<TResult>[];
  readonly coordinatorEvidence: readonly CoordinatorTerminalEvidence[];
  /** Optional lower per-call bounds; values cannot raise the hard module caps. */
  readonly limits?: SprintTerminalEvidenceLimits;
}

export type SprintTerminalHoldCode =
  | 'INPUT_LIMIT_EXCEEDED'
  | 'INVALID_IDENTITY'
  | 'DUPLICATE_EXACT_ATTEMPT'
  | 'LINEAGE_PARENT_MISSING'
  | 'LINEAGE_PARENT_CROSS_BOUNDARY'
  | 'LINEAGE_CYCLE'
  | 'LINEAGE_BRANCH'
  | 'LINEAGE_ROOT_AMBIGUOUS'
  | 'LINEAGE_TIP_AMBIGUOUS'
  | 'MULTIPLE_LIVE_ATTEMPTS'
  | 'UNKNOWN_ATTEMPT_AUTHORITY'
  | 'TERMINAL_AUTHORITY_INCOMPLETE'
  | 'RESULT_EVIDENCE_UNKNOWN'
  | 'RESULT_EVIDENCE_CONTRADICTORY'
  | 'RESULT_WITHOUT_TERMINAL_AUTHORITY'
  | 'TERMINAL_RESULT_MISSING'
  | 'TERMINAL_RESULT_PARTIAL'
  | 'TERMINAL_VERDICT_CONTRADICTION'
  | 'ATTRIBUTION_EVIDENCE_INVALID'
  | 'DUPLICATE_COORDINATOR_EVIDENCE'
  | 'COORDINATOR_ATTEMPT_UNKNOWN'
  | 'COORDINATOR_EVIDENCE_INVALID'
  | 'COORDINATOR_EVIDENCE_HOLD';

export interface SprintTerminalHold {
  readonly code: SprintTerminalHoldCode;
  readonly scope: 'SPRINT' | 'LINEAGE' | 'ATTEMPT' | 'COORDINATOR';
  readonly logicalTaskId: string | null;
  readonly attempt: ExactAttemptIdentity | null;
  readonly evidenceId: string | null;
  readonly detail: string;
}

export interface ExactAttemptProjection {
  readonly logicalTaskId: string;
  readonly identity: ExactAttemptIdentity;
  readonly authorityState: AttemptTerminalAuthority['state'];
  readonly resultState: AttemptResultEvidence<unknown>['state'];
  readonly reasonCodes: readonly SprintTerminalHoldCode[];
}

export type SettledAttemptEvidenceState =
  | 'HOST_TERMINAL_NOT_DISPATCHED'
  | 'CASCADE_SKIP';

/** Host-authored terminal outcomes where no worker repair can or should run. */
export interface SettledAttemptProjection {
  readonly logicalTaskId: string;
  readonly identity: ExactAttemptIdentity;
  readonly evidenceState: SettledAttemptEvidenceState;
  readonly authorityEvidenceRef: string;
  readonly resultEvidenceRef: string;
}

export interface PartialResultProjection<TResult> {
  readonly logicalTaskId: string;
  readonly identity: ExactAttemptIdentity;
  readonly evidenceState: Exclude<AttemptResultEvidence<TResult>['state'], 'ABSENT'>;
  readonly evidenceRef: string | null;
  readonly payload: TResult | null;
  readonly reasonCodes: readonly SprintTerminalHoldCode[];
}

export interface AttributionExclusion {
  readonly logicalTaskId: string;
  readonly identity: ExactAttemptIdentity;
  readonly state: 'HOLD' | 'UNAVAILABLE';
  readonly reasonCode: string;
  readonly evidenceRef: string | null;
  readonly resultPayloadExcluded: boolean;
  /** RCPT-1: the attempt's claimed paths, when its attribution carried them. */
  readonly claimedPaths?: readonly string[];
  /** RCPT-1 (owner karar-turu 2026-08-08): true when a later VERIFIED
   *  resolution superseded this exclusion — it stays journaled as evidence
   *  but no longer blocks cleanup eligibility. */
  readonly supersededByVerifiedResolution?: boolean;
}

export interface VerifiedAttributionProjection {
  readonly identity: ExactAttemptIdentity;
  readonly evidenceRef: string;
  readonly filesChanged: readonly string[];
  readonly linesAdded: number;
  readonly linesRemoved: number;
}

export interface CompletedLogicalTask<TResult> {
  readonly logicalTaskId: string;
  readonly attemptCount: number;
  readonly attempts: readonly ExactAttemptIdentity[];
  readonly resolvedBy: ExactAttemptIdentity;
  readonly verdict: 'DONE' | 'GO_WITH_TECH_DEBT';
  readonly resultEvidenceRef: string;
  readonly result: TResult;
  readonly verifiedAttribution: readonly VerifiedAttributionProjection[];
  readonly excludedAttributionCount: number;
}

export type LogicalTaskTerminalState =
  | 'COMPLETED'
  | 'FAILED'
  | 'ACTIVE'
  | 'UNSETTLED'
  | 'PARTIAL'
  | 'HOLD';

export interface LogicalTaskTerminalEvidence {
  readonly logicalTaskId: string;
  readonly state: LogicalTaskTerminalState;
  /** FAILED-görünümlü ama policy-settled host-skip lineage (3301) — cleanup'ı bloklamaz. */
  readonly policySettledSkip?: boolean;
  readonly attemptCount: number;
  readonly attempts: readonly ExactAttemptIdentity[];
  readonly resolvingAttempt: ExactAttemptIdentity | null;
  readonly holdCodes: readonly SprintTerminalHoldCode[];
}

export type CleanupBlockReason =
  | 'NO_LOGICAL_TASKS'
  | 'LINEAGE_NOT_COMPLETED'
  | 'ACTIVE_OR_UNSETTLED_ATTEMPT'
  | 'PARTIAL_RESULT'
  | 'ATTRIBUTION_EXCLUDED'
  | 'COORDINATOR_EVIDENCE_INCOMPLETE'
  | 'TYPED_HOLD_PRESENT';

export interface CleanupEligibilityEvidence {
  /** Candidate is evidence only; lifecycle authority must still decide. */
  readonly state: 'CANDIDATE' | 'BLOCKED' | 'HOLD';
  readonly candidate: boolean;
  readonly reasons: readonly CleanupBlockReason[];
}

export interface SprintTerminalEvidence<TResult = unknown> {
  readonly version: typeof SPRINT_TERMINAL_EVIDENCE_VERSION;
  readonly summary: {
    /** Null means the input cap prevented a safe lineage count. */
    readonly logicalTaskCount: number | null;
    readonly observedAttemptCount: number;
    readonly completedLogicalTaskCount: number;
    readonly settledAttemptCount: number;
    readonly activeOrUnsettledAttemptCount: number;
    readonly partialResultCount: number;
    readonly attributionExclusionCount: number;
    readonly holdCount: number;
  };
  readonly logicalTasks: readonly LogicalTaskTerminalEvidence[];
  readonly completed: readonly CompletedLogicalTask<TResult>[];
  readonly settledAttempts: readonly SettledAttemptProjection[];
  readonly activeOrUnsettledAttempts: readonly ExactAttemptProjection[];
  readonly partialResults: readonly PartialResultProjection<TResult>[];
  readonly attributionExclusions: readonly AttributionExclusion[];
  readonly coordinatorEvidence: readonly CoordinatorTerminalEvidence[];
  readonly holds: readonly SprintTerminalHold[];
  readonly cleanupEligibility: CleanupEligibilityEvidence;
}

interface MutableAssembly<TResult> {
  completed: CompletedLogicalTask<TResult>[];
  logicalTasks: LogicalTaskTerminalEvidence[];
  settled: SettledAttemptProjection[];
  unsettled: ExactAttemptProjection[];
  partial: PartialResultProjection<TResult>[];
  exclusions: AttributionExclusion[];
  holds: SprintTerminalHold[];
}

function identityKey(identity: ExactAttemptIdentity): string {
  return `${identity.taskId}\u0000${identity.attemptId}`;
}

function compareIdentity(left: ExactAttemptIdentity, right: ExactAttemptIdentity): number {
  return left.taskId.localeCompare(right.taskId) || left.attemptId.localeCompare(right.attemptId);
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizedLimit(requested: number | undefined, hardLimit: number): number {
  if (requested === undefined) return hardLimit;
  if (!Number.isSafeInteger(requested) || requested < 0) return 0;
  return Math.min(requested, hardLimit);
}

function attemptProjection<TResult>(
  attempt: ExactAttemptEvidence<TResult>,
  codes: readonly SprintTerminalHoldCode[],
): ExactAttemptProjection {
  return {
    logicalTaskId: attempt.logicalTaskId,
    identity: { ...attempt.identity },
    authorityState: attempt.authority.state,
    resultState: attempt.result.state,
    reasonCodes: [...new Set(codes)].sort(),
  };
}

function hold(
  code: SprintTerminalHoldCode,
  scope: SprintTerminalHold['scope'],
  detail: string,
  logicalTaskId: string | null = null,
  attempt: ExactAttemptIdentity | null = null,
  evidenceId: string | null = null,
): SprintTerminalHold {
  return {
    code,
    scope,
    logicalTaskId,
    attempt: attempt ? { ...attempt } : null,
    evidenceId,
    detail,
  };
}

function overflowResult<TResult>(
  input: AssembleSprintTerminalEvidenceInput<TResult>,
  detail: string,
): SprintTerminalEvidence<TResult> {
  const overflowHold = hold('INPUT_LIMIT_EXCEEDED', 'SPRINT', detail);
  return {
    version: SPRINT_TERMINAL_EVIDENCE_VERSION,
    summary: {
      logicalTaskCount: null,
      observedAttemptCount: input.attempts.length,
      completedLogicalTaskCount: 0,
      settledAttemptCount: 0,
      activeOrUnsettledAttemptCount: 0,
      partialResultCount: 0,
      attributionExclusionCount: 0,
      holdCount: 1,
    },
    logicalTasks: [],
    completed: [],
    settledAttempts: [],
    activeOrUnsettledAttempts: [],
    partialResults: [],
    attributionExclusions: [],
    coordinatorEvidence: [],
    holds: [overflowHold],
    cleanupEligibility: {
      state: 'HOLD',
      candidate: false,
      reasons: ['TYPED_HOLD_PRESENT'],
    },
  };
}

function classifyAttempt<TResult>(
  attempt: ExactAttemptEvidence<TResult>,
  lineHolds: SprintTerminalHold[],
): SprintTerminalHoldCode[] {
  const codes: SprintTerminalHoldCode[] = [];
  const add = (code: SprintTerminalHoldCode, detail: string): void => {
    codes.push(code);
    lineHolds.push(hold(code, 'ATTEMPT', detail, attempt.logicalTaskId, attempt.identity));
  };

  if (!validText(attempt.logicalTaskId)
    || !validText(attempt.identity.taskId)
    || !validText(attempt.identity.attemptId)) {
    add('INVALID_IDENTITY', 'logical task, task, and attempt identifiers must be non-empty');
  }

  if (attempt.authority.state === 'UNKNOWN') {
    add('UNKNOWN_ATTEMPT_AUTHORITY', attempt.authority.reasonCode);
  } else if (attempt.authority.state === 'TERMINAL'
    && !validText(attempt.authority.evidenceRef)) {
    add('TERMINAL_AUTHORITY_INCOMPLETE', 'terminal authority has no evidence reference');
  }

  if (attempt.result.state === 'UNKNOWN') {
    add('RESULT_EVIDENCE_UNKNOWN', attempt.result.reasonCode);
  } else if (attempt.result.state === 'CONTRADICTORY') {
    add('RESULT_EVIDENCE_CONTRADICTORY', attempt.result.reasonCode);
  } else if (attempt.result.state === 'COMPLETE') {
    if (!validText(attempt.result.evidenceRef) || attempt.result.payload === undefined) {
      add('RESULT_EVIDENCE_UNKNOWN', 'complete result evidence is incomplete');
    }
    if (attempt.authority.state !== 'TERMINAL') {
      add('RESULT_WITHOUT_TERMINAL_AUTHORITY', 'complete result is not paired with terminal authority');
    } else if (attempt.authority.verdict !== attempt.result.verdict) {
      add('TERMINAL_VERDICT_CONTRADICTION', 'terminal authority and result verdict differ');
    }
  } else if (attempt.result.state === 'NOT_APPLICABLE') {
    if (!validText(attempt.result.evidenceRef) || !validText(attempt.result.reasonCode)) {
      add('RESULT_EVIDENCE_UNKNOWN', 'not-applicable result evidence is incomplete');
    }
    if (attempt.authority.state !== 'TERMINAL' || attempt.authority.verdict !== 'NO_GO') {
      add('TERMINAL_VERDICT_CONTRADICTION', 'not-applicable evidence requires terminal NO_GO authority');
    }
  } else if (attempt.authority.state === 'TERMINAL') {
    if (attempt.result.state === 'ABSENT') {
      add('TERMINAL_RESULT_MISSING', 'terminal authority has no result evidence');
    } else {
      add('TERMINAL_RESULT_PARTIAL', 'terminal authority is paired with a partial result');
    }
  }

  if (attempt.attribution.state === 'VERIFIED') {
    const validNumbers = Number.isSafeInteger(attempt.attribution.linesAdded)
      && attempt.attribution.linesAdded >= 0
      && Number.isSafeInteger(attempt.attribution.linesRemoved)
      && attempt.attribution.linesRemoved >= 0;
    if (!validText(attempt.attribution.evidenceRef)
      || !validNumbers
      || attempt.attribution.filesChanged.some(path => !validText(path))) {
      add('ATTRIBUTION_EVIDENCE_INVALID', 'verified attribution evidence is malformed');
    }
  }
  return codes;
}

function partialProjection<TResult>(
  attempt: ExactAttemptEvidence<TResult>,
  codes: readonly SprintTerminalHoldCode[],
): PartialResultProjection<TResult> | null {
  if (attempt.result.state === 'ABSENT' || attempt.result.state === 'NOT_APPLICABLE') return null;
  const terminalComplete = attempt.authority.state === 'TERMINAL'
    && attempt.result.state === 'COMPLETE'
    && attempt.authority.verdict === attempt.result.verdict
    && codes.length === 0;
  if (terminalComplete) return null;
  return {
    logicalTaskId: attempt.logicalTaskId,
    identity: { ...attempt.identity },
    evidenceState: attempt.result.state,
    evidenceRef: 'evidenceRef' in attempt.result ? attempt.result.evidenceRef ?? null : null,
    payload: 'payload' in attempt.result ? attempt.result.payload ?? null : null,
    reasonCodes: [...new Set(codes)].sort(),
  };
}

function settledAttemptProjection<TResult>(
  attempt: ExactAttemptEvidence<TResult>,
  codes: readonly SprintTerminalHoldCode[],
): SettledAttemptProjection | null {
  if (codes.length > 0
    || attempt.authority.state !== 'TERMINAL'
    || attempt.authority.verdict !== 'NO_GO') {
    return null;
  }
  if (attempt.authority.hostTerminalNotDispatched === true
    && attempt.result.state === 'NOT_APPLICABLE') {
    return {
      logicalTaskId: attempt.logicalTaskId,
      identity: { ...attempt.identity },
      evidenceState: 'HOST_TERMINAL_NOT_DISPATCHED',
      authorityEvidenceRef: attempt.authority.evidenceRef,
      resultEvidenceRef: attempt.result.evidenceRef,
    };
  }
  if (attempt.identity.attemptId === `host:cascade-skip:${attempt.identity.taskId}`
    && attempt.result.state === 'COMPLETE'
    && attempt.result.verdict === 'NO_GO') {
    return {
      logicalTaskId: attempt.logicalTaskId,
      identity: { ...attempt.identity },
      evidenceState: 'CASCADE_SKIP',
      authorityEvidenceRef: attempt.authority.evidenceRef,
      resultEvidenceRef: attempt.result.evidenceRef,
    };
  }
  return null;
}

function lineageHasCycle<TResult>(attempts: readonly ExactAttemptEvidence<TResult>[]): boolean {
  const byKey = new Map(attempts.map(attempt => [identityKey(attempt.identity), attempt]));
  for (const start of attempts) {
    const seen = new Set<string>();
    let current: ExactAttemptEvidence<TResult> | undefined = start;
    while (current) {
      const key = identityKey(current.identity);
      if (seen.has(key)) return true;
      seen.add(key);
      current = current.supersedes ? byKey.get(identityKey(current.supersedes)) : undefined;
    }
  }
  return false;
}

function coordinatorProjection(
  source: readonly CoordinatorTerminalEvidence[],
  knownAttempts: ReadonlySet<string>,
  holds: SprintTerminalHold[],
): CoordinatorTerminalEvidence[] {
  const counts = new Map<string, number>();
  for (const evidence of source) {
    counts.set(evidence.evidenceId, (counts.get(evidence.evidenceId) ?? 0) + 1);
  }
  const projected = source.map(evidence => ({
    ...evidence,
    ...(evidence.attempt ? { attempt: { ...evidence.attempt } } : {}),
  })).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));

  for (const evidence of projected) {
    if (!validText(evidence.evidenceId) || !validText(evidence.kind)
      || (evidence.state === 'VERIFIED' && !validText(evidence.evidenceRef))) {
      holds.push(hold(
        'COORDINATOR_EVIDENCE_INVALID', 'COORDINATOR',
        'coordinator evidence identity, kind, or verified reference is invalid',
        null, evidence.attempt ?? null, evidence.evidenceId || null,
      ));
    }
    if ((counts.get(evidence.evidenceId) ?? 0) > 1) {
      holds.push(hold(
        'DUPLICATE_COORDINATOR_EVIDENCE', 'COORDINATOR',
        'coordinator evidence identifier is not unique',
        null, evidence.attempt ?? null, evidence.evidenceId,
      ));
    }
    if (evidence.attempt && !knownAttempts.has(identityKey(evidence.attempt))) {
      holds.push(hold(
        'COORDINATOR_ATTEMPT_UNKNOWN', 'COORDINATOR',
        'coordinator evidence refers to an unknown exact attempt',
        null, evidence.attempt, evidence.evidenceId,
      ));
    }
    if (evidence.state === 'HOLD') {
      holds.push(hold(
        'COORDINATOR_EVIDENCE_HOLD', 'COORDINATOR',
        evidence.reasonCode ?? 'coordinator evidence is held',
        null, evidence.attempt ?? null, evidence.evidenceId,
      ));
    }
  }
  return projected;
}

/**
 * Fold caller-supplied exact-attempt evidence into a stable terminal projection.
 * The function is deterministic and does not mutate its inputs.
 */
export function assembleSprintTerminalEvidence<TResult = unknown>(
  input: AssembleSprintTerminalEvidenceInput<TResult>,
): SprintTerminalEvidence<TResult> {
  const attemptLimit = normalizedLimit(input.limits?.attempts, SPRINT_TERMINAL_EVIDENCE_LIMITS.attempts);
  const coordinatorLimit = normalizedLimit(
    input.limits?.coordinatorEvidence,
    SPRINT_TERMINAL_EVIDENCE_LIMITS.coordinatorEvidence,
  );
  if (input.attempts.length > attemptLimit || input.coordinatorEvidence.length > coordinatorLimit) {
    return overflowResult(
      input,
      `attempts=${input.attempts.length}/${attemptLimit}; coordinator=${input.coordinatorEvidence.length}/${coordinatorLimit}`,
    );
  }

  const attempts = [...input.attempts].sort((left, right) =>
    left.logicalTaskId.localeCompare(right.logicalTaskId)
      || compareIdentity(left.identity, right.identity));
  const mutable: MutableAssembly<TResult> = {
    completed: [], logicalTasks: [], settled: [], unsettled: [], partial: [], exclusions: [], holds: [],
  };
  const identityCounts = new Map<string, number>();
  for (const attempt of attempts) {
    const key = identityKey(attempt.identity);
    identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1);
  }
  const knownAttempts = new Set(identityCounts.keys());
  const uniqueAttempts = new Map<string, ExactAttemptEvidence<TResult>>();
  for (const attempt of attempts) {
    const key = identityKey(attempt.identity);
    if (identityCounts.get(key) === 1) uniqueAttempts.set(key, attempt);
  }
  const coordinatorEvidence = coordinatorProjection(
    input.coordinatorEvidence,
    knownAttempts,
    mutable.holds,
  );

  const groups = new Map<string, ExactAttemptEvidence<TResult>[]>();
  for (const attempt of attempts) {
    const group = groups.get(attempt.logicalTaskId) ?? [];
    group.push(attempt);
    groups.set(attempt.logicalTaskId, group);
  }

  for (const [logicalTaskId, lineage] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
    const lineHolds: SprintTerminalHold[] = [];
    const codesByAttempt = new Map<string, SprintTerminalHoldCode[]>();
    const byKey = new Map<string, ExactAttemptEvidence<TResult>>();
    const childCounts = new Map<string, number>();

    for (const attempt of lineage) {
      const key = identityKey(attempt.identity);
      const codes = classifyAttempt(attempt, lineHolds);
      codesByAttempt.set(key, codes);
      if ((identityCounts.get(key) ?? 0) > 1) {
        codes.push('DUPLICATE_EXACT_ATTEMPT');
        lineHolds.push(hold(
          'DUPLICATE_EXACT_ATTEMPT', 'ATTEMPT',
          'exact task/attempt identity occurs more than once',
          logicalTaskId, attempt.identity,
        ));
      } else {
        byKey.set(key, attempt);
      }

      const settledProjection = settledAttemptProjection(attempt, codes);
      if (settledProjection !== null) {
        mutable.settled.push(settledProjection);
        continue;
      }

      const malformedVerifiedAttribution = attempt.attribution.state === 'VERIFIED'
        && codes.includes('ATTRIBUTION_EVIDENCE_INVALID');
      if (malformedVerifiedAttribution) {
        mutable.exclusions.push({
          logicalTaskId,
          identity: { ...attempt.identity },
          state: 'HOLD',
          reasonCode: 'ATTRIBUTION_EVIDENCE_INVALID',
          evidenceRef: attempt.attribution.evidenceRef ?? null,
          resultPayloadExcluded: attempt.result.state !== 'ABSENT',
        });
      } else if (attempt.attribution.state !== 'VERIFIED') {
        mutable.exclusions.push({
          logicalTaskId,
          identity: { ...attempt.identity },
          state: attempt.attribution.state,
          reasonCode: attempt.attribution.reasonCode,
          evidenceRef: attempt.attribution.evidenceRef ?? null,
          resultPayloadExcluded: attempt.result.state !== 'ABSENT',
          ...(attempt.attribution.claimedPaths !== undefined
            ? { claimedPaths: [...attempt.attribution.claimedPaths].sort() }
            : {}),
        });
      }
    }

    for (const attempt of lineage) {
      if (!attempt.supersedes) continue;
      const parentKey = identityKey(attempt.supersedes);
      const parent = uniqueAttempts.get(parentKey);
      if (!parent) {
        lineHolds.push(hold(
          'LINEAGE_PARENT_MISSING', 'LINEAGE',
          'superseded exact attempt is absent or ambiguous',
          logicalTaskId, attempt.identity,
        ));
      } else if (parent.logicalTaskId !== logicalTaskId) {
        lineHolds.push(hold(
          'LINEAGE_PARENT_CROSS_BOUNDARY', 'LINEAGE',
          'superseded exact attempt belongs to a different logical task',
          logicalTaskId, attempt.identity,
        ));
      } else {
        childCounts.set(parentKey, (childCounts.get(parentKey) ?? 0) + 1);
      }
    }

    if (lineageHasCycle(lineage)) {
      lineHolds.push(hold('LINEAGE_CYCLE', 'LINEAGE', 'attempt lineage contains a cycle', logicalTaskId));
    }
    if ([...childCounts.values()].some(count => count > 1)) {
      lineHolds.push(hold('LINEAGE_BRANCH', 'LINEAGE', 'attempt lineage has multiple successors', logicalTaskId));
    }
    const roots = lineage.filter(attempt => !attempt.supersedes);
    if (roots.length !== 1) {
      lineHolds.push(hold(
        'LINEAGE_ROOT_AMBIGUOUS', 'LINEAGE',
        `expected one lineage root, observed ${roots.length}`,
        logicalTaskId,
      ));
    }
    const tips = lineage.filter(attempt => (childCounts.get(identityKey(attempt.identity)) ?? 0) === 0);
    if (tips.length !== 1) {
      lineHolds.push(hold(
        'LINEAGE_TIP_AMBIGUOUS', 'LINEAGE',
        `expected one lineage tip, observed ${tips.length}`,
        logicalTaskId,
      ));
    }
    const live = lineage.filter(attempt =>
      attempt.authority.state === 'ACTIVE' || attempt.authority.state === 'UNSETTLED');
    if (live.length > 1) {
      lineHolds.push(hold(
        'MULTIPLE_LIVE_ATTEMPTS', 'LINEAGE',
        `observed ${live.length} active or unsettled attempts`,
        logicalTaskId,
      ));
    }

    for (const attempt of lineage) {
      const codes = codesByAttempt.get(identityKey(attempt.identity)) ?? [];
      const settledProjection = settledAttemptProjection(attempt, codes);
      const unresolved = settledProjection === null && (attempt.authority.state !== 'TERMINAL'
        || codes.length > 0
        || (attempt.result.state !== 'COMPLETE' && attempt.result.state !== 'NOT_APPLICABLE'));
      if (unresolved) mutable.unsettled.push(attemptProjection(attempt, codes));
      const partial = settledProjection === null ? partialProjection(attempt, codes) : null;
      if (partial) mutable.partial.push(partial);
    }

    mutable.holds.push(...lineHolds);
    const lineCodes = [...new Set(lineHolds.map(item => item.code))].sort();
    const tip = tips.length === 1 ? tips[0]! : null;
    let state: LogicalTaskTerminalState = 'UNSETTLED';
    let policySettledSkip = false;
    let resolvingAttempt: ExactAttemptIdentity | null = null;

    if (lineHolds.length > 0) {
      state = 'HOLD';
    } else if (tip?.result.state === 'PARTIAL') {
      state = 'PARTIAL';
    } else if (tip?.authority.state === 'ACTIVE') {
      state = 'ACTIVE';
    } else if (tip?.authority.state === 'TERMINAL'
      && (tip.result.state === 'COMPLETE' || tip.result.state === 'NOT_APPLICABLE')) {
      resolvingAttempt = { ...tip.identity };
      if (tip.authority.verdict === 'NO_GO') {
        state = 'FAILED';
        if (settledAttemptProjection(
          tip,
          codesByAttempt.get(identityKey(tip.identity)) ?? [],
        ) !== null) policySettledSkip = true;
      } else if (tip.result.state === 'COMPLETE') {
        state = 'COMPLETED';
        const verifiedAttribution = lineage.flatMap(attempt => {
          if (attempt.attribution.state !== 'VERIFIED') return [];
          return [{
            identity: { ...attempt.identity },
            evidenceRef: attempt.attribution.evidenceRef,
            filesChanged: [...attempt.attribution.filesChanged].sort(),
            linesAdded: attempt.attribution.linesAdded,
            linesRemoved: attempt.attribution.linesRemoved,
          }];
        });
        mutable.completed.push({
          logicalTaskId,
          attemptCount: lineage.length,
          attempts: lineage.map(attempt => ({ ...attempt.identity })),
          resolvedBy: { ...tip.identity },
          verdict: tip.authority.verdict,
          resultEvidenceRef: tip.result.evidenceRef,
          result: tip.result.payload,
          verifiedAttribution,
          excludedAttributionCount: lineage.filter(attempt => attempt.attribution.state !== 'VERIFIED').length,
        });
      }
    }

    mutable.logicalTasks.push({
      logicalTaskId,
      state,
      ...(policySettledSkip ? { policySettledSkip: true } : {}),
      attemptCount: lineage.length,
      attempts: lineage.map(attempt => ({ ...attempt.identity })),
      resolvingAttempt,
      holdCodes: lineCodes,
    });
  }

  mutable.unsettled.sort((left, right) =>
    left.logicalTaskId.localeCompare(right.logicalTaskId) || compareIdentity(left.identity, right.identity));
  mutable.partial.sort((left, right) =>
    left.logicalTaskId.localeCompare(right.logicalTaskId) || compareIdentity(left.identity, right.identity));
  mutable.settled.sort((left, right) =>
    left.logicalTaskId.localeCompare(right.logicalTaskId) || compareIdentity(left.identity, right.identity));
  mutable.exclusions.sort((left, right) =>
    left.logicalTaskId.localeCompare(right.logicalTaskId) || compareIdentity(left.identity, right.identity));
  mutable.holds.sort((left, right) =>
    (left.logicalTaskId ?? '').localeCompare(right.logicalTaskId ?? '')
      || (left.attempt ? identityKey(left.attempt) : '').localeCompare(right.attempt ? identityKey(right.attempt) : '')
      || left.code.localeCompare(right.code)
      || (left.evidenceId ?? '').localeCompare(right.evidenceId ?? ''));

  // ─── RCPT-1 (owner karar-turu 2026-08-08): resolution-aware exclusions ──
  // An attribution exclusion used to block cleanup FOREVER — which meant no
  // FIX-recovered sprint could ever settle (measured on the first full-pass
  // run: one mid-lineage CLAIM_OUTSIDE_WRITE_SCOPE hold kept a 2/2-DONE
  // sprint at exit=1). An exclusion is now DEMOTED to journaled evidence —
  // it stays in the receipt, flagged — when ALL of the following hold:
  //   1. its logical task COMPLETED (a verified resolution exists),
  //   2. the excluded attempt is NOT the resolving attempt itself,
  //   3. its claimed paths are KNOWN (unknown claims fail closed), and
  //   4. every claimed path is covered by the sprint's union of VERIFIED
  //      attributions (someone accountable owns that path's final state).
  const completedByTask = new Map(mutable.logicalTasks
    .filter(item => item.state === 'COMPLETED')
    .map(item => [item.logicalTaskId, item]));
  const verifiedPathUnion = new Set<string>();
  for (const done of mutable.completed) {
    for (const attribution of done.verifiedAttribution) {
      for (const path of attribution.filesChanged) verifiedPathUnion.add(path);
    }
  }
  // RCPT-1 supp (CR6 ölçümü): a file can reach its verified final state
  // WITHOUT any later diff touching it (a worker honestly reports "already
  // correct, nothing to write"). The COMPLETED lineage's RESOLVING attempt
  // still attests its declared write scope — its DONE verdict is the
  // accountability for those exact paths — so resolver write-scopes join the
  // union. Non-resolving or non-completed scopes never do.
  const resolverKeys = new Set(mutable.logicalTasks
    .filter(item => item.state === 'COMPLETED' && item.resolvingAttempt !== null)
    .map(item => identityKey(item.resolvingAttempt!)));
  for (const [, lineage] of groups) {
    for (const attempt of lineage) {
      if (!resolverKeys.has(identityKey(attempt.identity))) continue;
      for (const path of attempt.writeScope ?? []) verifiedPathUnion.add(path);
    }
  }
  mutable.exclusions = mutable.exclusions.map(exclusion => {
    const lineage = completedByTask.get(exclusion.logicalTaskId);
    if (!lineage || lineage.resolvingAttempt === null) return exclusion;
    if (identityKey(lineage.resolvingAttempt) === identityKey(exclusion.identity)) return exclusion;
    if (exclusion.claimedPaths === undefined) return exclusion;
    const covered = exclusion.claimedPaths.every(path => verifiedPathUnion.has(path));
    if (!covered) return exclusion;
    return { ...exclusion, supersededByVerifiedResolution: true };
  });
  const blockingExclusions = mutable.exclusions
    .filter(exclusion => exclusion.supersededByVerifiedResolution !== true);

  const cleanupReasons = new Set<CleanupBlockReason>();
  if (groups.size === 0) cleanupReasons.add('NO_LOGICAL_TASKS');
  if (mutable.logicalTasks.some(item =>
    item.state !== 'COMPLETED' && item.policySettledSkip !== true,
  )) {
    cleanupReasons.add('LINEAGE_NOT_COMPLETED');
  }
  if (mutable.unsettled.length > 0) cleanupReasons.add('ACTIVE_OR_UNSETTLED_ATTEMPT');
  if (mutable.partial.length > 0) cleanupReasons.add('PARTIAL_RESULT');
  if (blockingExclusions.length > 0) cleanupReasons.add('ATTRIBUTION_EXCLUDED');
  if (coordinatorEvidence.some(item => item.requiredForCleanup && item.state !== 'VERIFIED')) {
    cleanupReasons.add('COORDINATOR_EVIDENCE_INCOMPLETE');
  }
  if (mutable.holds.length > 0) cleanupReasons.add('TYPED_HOLD_PRESENT');
  const reasons = [...cleanupReasons].sort();
  const cleanupState: CleanupEligibilityEvidence['state'] = mutable.holds.length > 0
    ? 'HOLD'
    : reasons.length > 0 ? 'BLOCKED' : 'CANDIDATE';

  return {
    version: SPRINT_TERMINAL_EVIDENCE_VERSION,
    summary: {
      logicalTaskCount: groups.size,
      observedAttemptCount: attempts.length,
      completedLogicalTaskCount: mutable.completed.length,
      settledAttemptCount: mutable.settled.length,
      activeOrUnsettledAttemptCount: mutable.unsettled.length,
      partialResultCount: mutable.partial.length,
      attributionExclusionCount: mutable.exclusions.length,
      holdCount: mutable.holds.length,
    },
    logicalTasks: mutable.logicalTasks,
    completed: mutable.completed,
    settledAttempts: mutable.settled,
    activeOrUnsettledAttempts: mutable.unsettled,
    partialResults: mutable.partial,
    attributionExclusions: mutable.exclusions,
    coordinatorEvidence,
    holds: mutable.holds,
    cleanupEligibility: {
      state: cleanupState,
      candidate: cleanupState === 'CANDIDATE',
      reasons,
    },
  };
}
