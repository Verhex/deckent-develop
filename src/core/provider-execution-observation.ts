// ─── Provider Execution Observation — evidence schema + pure reducers ────────
// Immutable start/end observations of a single provider-attributed execution
// window, bound to (executionId, runId, taskId, attemptId,
// providerPrincipalDigest, fence). This module derives attained concurrency, peak overlap and
// incomplete intervals from those observations. It is NOT settlement
// authority: a worker's own claim about its execution is untrusted input
// here, exactly like every other observation, and "container is running" is
// a distinct fact from "provider is running" — callers must not synthesize
// these events from container lifecycle alone. Reducers take every
// timestamp/sequence as injected data; they never read the wall clock or
// touch the filesystem. Retention is caller-bounded via
// pruneProviderExecutionObservationState — the reducer never grows state
// without an explicit prune call from the caller.

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const PROVIDER_EXECUTION_OBSERVATION_SCHEMA_VERSION = 2 as const;

const nonEmpty = z.string().min(1);

const isoTimestampSchema = z.string().refine(value => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}, { message: 'observedAt must be a canonical ISO-8601 timestamp' });

const providerExecutionOutcomeSchema = z.enum(['completed', 'failed', 'aborted']);

const identityFieldsSchema = {
  executionId: nonEmpty,
  runId: nonEmpty,
  taskId: nonEmpty,
  attemptId: nonEmpty,
  providerPrincipalDigest: nonEmpty,
  // Presence is required at the schema level; blank/whitespace is a domain-level
  // "missing fence" HOLD, not a structural rejection — checked in the reducer.
  fence: z.string(),
};

const providerExecutionStartInputSchema = z.object({
  type: z.literal('start'),
  ...identityFieldsSchema,
  sequence: z.number().int().min(0),
  observedAt: isoTimestampSchema,
});

const providerExecutionEndInputSchema = z.object({
  type: z.literal('end'),
  ...identityFieldsSchema,
  sequence: z.number().int().min(0),
  observedAt: isoTimestampSchema,
  outcome: providerExecutionOutcomeSchema,
});

export const providerExecutionObservationInputSchema = z.discriminatedUnion('type', [
  providerExecutionStartInputSchema,
  providerExecutionEndInputSchema,
]);

export type ProviderExecutionStartObservationInput = z.infer<typeof providerExecutionStartInputSchema>;
export type ProviderExecutionEndObservationInput = z.infer<typeof providerExecutionEndInputSchema>;
export type ProviderExecutionObservationInput = z.infer<typeof providerExecutionObservationInputSchema>;

/** Structural validation only — throws on a malformed shape (caller/programming error). */
export function parseProviderExecutionObservationInput(
  raw: unknown,
): ProviderExecutionObservationInput {
  return providerExecutionObservationInputSchema.parse(raw);
}

export interface ProviderExecutionObservation {
  readonly schemaVersion: typeof PROVIDER_EXECUTION_OBSERVATION_SCHEMA_VERSION;
  readonly eventId: string;
  readonly type: 'start' | 'end';
  readonly executionId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly providerPrincipalDigest: string;
  readonly fence: string;
  readonly sequence: number;
  readonly observedAt: string;
  readonly outcome?: 'completed' | 'failed' | 'aborted';
}

/** Content-addressable id: same identity+type+sequence+observedAt+outcome → same id. */
export function computeProviderExecutionObservationEventId(
  input: ProviderExecutionObservationInput,
): string {
  const canonical = [
    input.type,
    input.executionId,
    input.runId,
    input.taskId,
    input.attemptId,
    input.providerPrincipalDigest,
    input.fence,
    String(input.sequence),
    input.observedAt,
    input.type === 'end' ? input.outcome : '',
  ].join('');
  return createHash('sha256').update(canonical).digest('hex');
}

function toObservation(input: ProviderExecutionObservationInput): ProviderExecutionObservation {
  return {
    schemaVersion: PROVIDER_EXECUTION_OBSERVATION_SCHEMA_VERSION,
    eventId: computeProviderExecutionObservationEventId(input),
    type: input.type,
    executionId: input.executionId,
    runId: input.runId,
    taskId: input.taskId,
    attemptId: input.attemptId,
    providerPrincipalDigest: input.providerPrincipalDigest,
    fence: input.fence,
    sequence: input.sequence,
    observedAt: input.observedAt,
    ...(input.type === 'end' ? { outcome: input.outcome } : {}),
  };
}

function sameIdentity(a: ProviderExecutionObservation, b: ProviderExecutionObservation): boolean {
  return a.runId === b.runId
    && a.taskId === b.taskId
    && a.attemptId === b.attemptId
    && a.providerPrincipalDigest === b.providerPrincipalDigest
    && a.fence === b.fence;
}

export type ProviderExecutionObservationHoldReason =
  | 'missing-fence'
  | 'foreign-attempt'
  | 'end-before-start'
  | 'conflicting-replay';

export interface ProviderExecutionObservationHold {
  readonly reasonCode: ProviderExecutionObservationHoldReason;
  readonly executionId: string;
  readonly eventId: string;
  readonly detail: string;
}

export interface ProviderExecutionInterval {
  readonly executionId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly providerPrincipalDigest: string;
  readonly fence: string;
  readonly startedAtSequence: number;
  readonly startedAt: string;
}

interface ProviderExecutionRecord {
  readonly start: ProviderExecutionObservation;
  readonly end: ProviderExecutionObservation | null;
}

export interface ProviderExecutionObservationState {
  readonly schemaVersion: typeof PROVIDER_EXECUTION_OBSERVATION_SCHEMA_VERSION;
  readonly executions: ReadonlyMap<string, ProviderExecutionRecord>;
  readonly peakOverlap: number;
  readonly holds: readonly ProviderExecutionObservationHold[];
}

export function createInitialProviderExecutionObservationState(): ProviderExecutionObservationState {
  return {
    schemaVersion: PROVIDER_EXECUTION_OBSERVATION_SCHEMA_VERSION,
    executions: new Map(),
    peakOverlap: 0,
    holds: [],
  };
}

function countOpen(executions: ReadonlyMap<string, ProviderExecutionRecord>): number {
  let open = 0;
  for (const record of executions.values()) {
    if (record.end === null) open += 1;
  }
  return open;
}

function appendHold(
  state: ProviderExecutionObservationState,
  hold: ProviderExecutionObservationHold,
): ProviderExecutionObservationState {
  return { ...state, holds: [...state.holds, hold] };
}

function replaceExecution(
  state: ProviderExecutionObservationState,
  executionId: string,
  record: ProviderExecutionRecord,
  peakOverlap: number,
): ProviderExecutionObservationState {
  const executions = new Map(state.executions);
  executions.set(executionId, record);
  return { ...state, executions, peakOverlap };
}

/**
 * Fold one raw observation into state. Pure: no wall-clock or filesystem
 * access, no mutation of the input state. Structural shape errors throw;
 * every domain-level invalidity (missing fence, foreign attempt,
 * end-before-start, conflicting replay) is a typed HOLD appended to
 * `state.holds`, never a thrown error. An exact duplicate of a
 * already-accepted event is idempotent — it returns the same state
 * reference unchanged.
 */
export function foldProviderExecutionObservation(
  state: ProviderExecutionObservationState,
  raw: unknown,
): ProviderExecutionObservationState {
  const input = parseProviderExecutionObservationInput(raw);
  const observation = toObservation(input);

  if (input.fence.trim() === '') {
    return appendHold(state, {
      reasonCode: 'missing-fence',
      executionId: input.executionId,
      eventId: observation.eventId,
      detail: 'fence is empty or blank',
    });
  }

  const existing = state.executions.get(input.executionId) ?? null;

  if (input.type === 'start') {
    if (!existing) {
      const executions = new Map(state.executions);
      executions.set(input.executionId, { start: observation, end: null });
      const peakOverlap = Math.max(state.peakOverlap, countOpen(executions));
      return { ...state, executions, peakOverlap };
    }
    if (existing.start.eventId === observation.eventId) return state;
    if (!sameIdentity(existing.start, observation)) {
      return appendHold(state, {
        reasonCode: 'foreign-attempt',
        executionId: input.executionId,
        eventId: observation.eventId,
        detail: 'start identity does not match the execution owner already recorded',
      });
    }
    return appendHold(state, {
      reasonCode: 'conflicting-replay',
      executionId: input.executionId,
      eventId: observation.eventId,
      detail: 'start observation conflicts with a previously accepted start',
    });
  }

  // input.type === 'end'
  if (!existing) {
    return appendHold(state, {
      reasonCode: 'end-before-start',
      executionId: input.executionId,
      eventId: observation.eventId,
      detail: 'no start observation recorded for this execution',
    });
  }
  if (!sameIdentity(existing.start, observation)) {
    return appendHold(state, {
      reasonCode: 'foreign-attempt',
      executionId: input.executionId,
      eventId: observation.eventId,
      detail: 'end identity does not match the execution owner recorded at start',
    });
  }
  if (observation.sequence <= existing.start.sequence) {
    return appendHold(state, {
      reasonCode: 'end-before-start',
      executionId: input.executionId,
      eventId: observation.eventId,
      detail: 'end sequence does not follow the recorded start sequence',
    });
  }
  if (existing.end) {
    if (existing.end.eventId === observation.eventId) return state;
    return appendHold(state, {
      reasonCode: 'conflicting-replay',
      executionId: input.executionId,
      eventId: observation.eventId,
      detail: 'end observation conflicts with a previously accepted end',
    });
  }
  return replaceExecution(
    state,
    input.executionId,
    { start: existing.start, end: observation },
    state.peakOverlap,
  );
}

/** Fold an ordered batch of raw observations; equivalent to repeated single folds. */
export function foldProviderExecutionObservations(
  state: ProviderExecutionObservationState,
  raws: readonly unknown[],
): ProviderExecutionObservationState {
  return raws.reduce(foldProviderExecutionObservation, state);
}

/** Current count of executions observed started but not yet observed ended. */
export function getProviderExecutionAttainedConcurrency(
  state: ProviderExecutionObservationState,
): number {
  return countOpen(state.executions);
}

/** Every execution observed started with no matching end observation yet. */
export function listProviderExecutionIncompleteIntervals(
  state: ProviderExecutionObservationState,
): ProviderExecutionInterval[] {
  const incomplete: ProviderExecutionInterval[] = [];
  for (const [executionId, record] of state.executions) {
    if (record.end !== null) continue;
    incomplete.push({
      executionId,
      runId: record.start.runId,
      taskId: record.start.taskId,
      attemptId: record.start.attemptId,
      providerPrincipalDigest: record.start.providerPrincipalDigest,
      fence: record.start.fence,
      startedAtSequence: record.start.sequence,
      startedAt: record.start.observedAt,
    });
  }
  incomplete.sort((a, b) => a.startedAtSequence - b.startedAtSequence);
  return incomplete;
}

/**
 * Explicit, caller-driven retention bound. The reducer never prunes on its
 * own — a caller durably settling closed executions elsewhere calls this to
 * drop what it no longer needs tracked for idempotency/replay detection.
 * Open executions are always retained regardless of `retainClosedExecutionIds`.
 */
export function pruneProviderExecutionObservationState(
  state: ProviderExecutionObservationState,
  options: { readonly retainClosedExecutionIds?: ReadonlySet<string>; readonly clearHolds?: boolean } = {},
): ProviderExecutionObservationState {
  const retain = options.retainClosedExecutionIds ?? null;
  const executions = new Map<string, ProviderExecutionRecord>();
  for (const [executionId, record] of state.executions) {
    if (record.end === null || retain?.has(executionId)) {
      executions.set(executionId, record);
    }
  }
  return {
    ...state,
    executions,
    holds: options.clearHolds ? [] : state.holds,
  };
}
