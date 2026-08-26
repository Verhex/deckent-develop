// ─── Worker Heartbeat Authority — fenced host-observed reducer ──────────────
// A worker may report a task verdict, but it never supplies authority for the
// observation clock. The host binds every observation to one exact attempt and
// advances it only when both host sequence and host-observed timestamp advance.

import { z } from 'zod';

export const WORKER_HEARTBEAT_AUTHORITY_SCHEMA_VERSION = 1 as const;

const nonEmpty = z.string().min(1);
const isoTimestampSchema = z.string().refine(value => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}, { message: 'hostObservedAt must be a canonical ISO-8601 timestamp' });

const identitySchema = z.object({
  runId: nonEmpty,
  taskId: nonEmpty,
  attemptId: nonEmpty,
  workerId: nonEmpty,
  // A host-issued fence makes a restarted or competing writer distinguishable
  // from the exact attempt it is trying to update.
  fence: z.string(),
});

const hostProcessOutcomeSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('running'), exitCode: z.null() }),
  z.object({ state: z.literal('exited'), exitCode: z.number().int() }),
]);

const workerTaskVerdictSchema = z.enum(['pending', 'done', 'no-go', 'hold']);
const livenessSchema = z.enum(['alive', 'not-alive', 'unknown']);

export const workerHeartbeatAuthorityObservationInputSchema = z.object({
  ...identitySchema.shape,
  // These fields are assigned by the host observer. There is deliberately no
  // worker-provided timestamp field in this authority boundary.
  hostSequence: z.number().int().min(0),
  hostObservedAt: isoTimestampSchema,
  hostProcessOutcome: hostProcessOutcomeSchema,
  workerTaskVerdict: workerTaskVerdictSchema,
  liveness: livenessSchema,
});

export type WorkerHeartbeatAuthorityIdentity = z.infer<typeof identitySchema>;
export type WorkerHeartbeatAuthorityObservationInput = z.infer<
  typeof workerHeartbeatAuthorityObservationInputSchema
>;

/** Structural validation only; domain disagreements become typed HOLDs. */
export function parseWorkerHeartbeatAuthorityObservation(
  raw: unknown,
): WorkerHeartbeatAuthorityObservationInput {
  return workerHeartbeatAuthorityObservationInputSchema.parse(raw);
}

export type WorkerHeartbeatAuthorityHoldReason =
  | 'missing-fence'
  | 'foreign-attempt'
  | 'foreign-writer'
  | 'stale-sequence'
  | 'stale-timestamp'
  | 'process-liveness-contradiction'
  | 'exit-code-task-verdict-contradiction';

export interface WorkerHeartbeatAuthorityHold {
  readonly state: 'HOLD';
  readonly reasonCode: WorkerHeartbeatAuthorityHoldReason;
  readonly attemptId: string;
  readonly hostSequence: number;
  readonly detail: string;
}

export interface WorkerHeartbeatAuthorityState {
  readonly schemaVersion: typeof WORKER_HEARTBEAT_AUTHORITY_SCHEMA_VERSION;
  readonly identity: WorkerHeartbeatAuthorityIdentity;
  readonly latest: WorkerHeartbeatAuthorityObservationInput | null;
  readonly holds: readonly WorkerHeartbeatAuthorityHold[];
}

export function createInitialWorkerHeartbeatAuthorityState(
  identity: WorkerHeartbeatAuthorityIdentity,
): WorkerHeartbeatAuthorityState {
  return {
    schemaVersion: WORKER_HEARTBEAT_AUTHORITY_SCHEMA_VERSION,
    identity,
    latest: null,
    holds: [],
  };
}

function appendHold(
  state: WorkerHeartbeatAuthorityState,
  observation: WorkerHeartbeatAuthorityObservationInput,
  reasonCode: WorkerHeartbeatAuthorityHoldReason,
  detail: string,
): WorkerHeartbeatAuthorityState {
  return {
    ...state,
    holds: [...state.holds, {
      state: 'HOLD',
      reasonCode,
      attemptId: observation.attemptId,
      hostSequence: observation.hostSequence,
      detail,
    }],
  };
}

function sameIdentity(
  expected: WorkerHeartbeatAuthorityIdentity,
  observed: WorkerHeartbeatAuthorityObservationInput,
): boolean {
  return expected.runId === observed.runId
    && expected.taskId === observed.taskId
    && expected.attemptId === observed.attemptId
    && expected.workerId === observed.workerId
    && expected.fence === observed.fence;
}

function sameAttempt(
  expected: WorkerHeartbeatAuthorityIdentity,
  observed: WorkerHeartbeatAuthorityObservationInput,
): boolean {
  return expected.runId === observed.runId
    && expected.taskId === observed.taskId
    && expected.attemptId === observed.attemptId;
}

function sameObservation(
  left: WorkerHeartbeatAuthorityObservationInput,
  right: WorkerHeartbeatAuthorityObservationInput,
): boolean {
  return left.hostSequence === right.hostSequence
    && left.hostObservedAt === right.hostObservedAt
    && left.hostProcessOutcome.state === right.hostProcessOutcome.state
    && left.hostProcessOutcome.exitCode === right.hostProcessOutcome.exitCode
    && left.workerTaskVerdict === right.workerTaskVerdict
    && left.liveness === right.liveness;
}

function contradiction(
  observation: WorkerHeartbeatAuthorityObservationInput,
): { readonly reasonCode: WorkerHeartbeatAuthorityHoldReason; readonly detail: string } | null {
  const { hostProcessOutcome, liveness, workerTaskVerdict } = observation;

  if (
    (hostProcessOutcome.state === 'running' && liveness !== 'alive')
    || (hostProcessOutcome.state === 'exited' && liveness === 'alive')
  ) {
    return {
      reasonCode: 'process-liveness-contradiction',
      detail: 'host process outcome and host-observed liveness disagree',
    };
  }

  if (
    (hostProcessOutcome.state === 'exited' && hostProcessOutcome.exitCode === 0 && workerTaskVerdict === 'no-go')
    || (hostProcessOutcome.state === 'exited' && hostProcessOutcome.exitCode !== 0 && workerTaskVerdict === 'done')
  ) {
    return {
      reasonCode: 'exit-code-task-verdict-contradiction',
      detail: 'host exit code conflicts with the independently reported worker task verdict',
    };
  }

  return null;
}

/**
 * Folds one host-observed heartbeat. The reducer is pure and does not read a
 * clock, filesystem, PID, or process table. Exact duplicates are idempotent;
 * every stale, foreign, or contradictory update becomes a typed HOLD while the
 * last accepted snapshot remains unchanged.
 */
export function foldWorkerHeartbeatAuthority(
  state: WorkerHeartbeatAuthorityState,
  raw: unknown,
): WorkerHeartbeatAuthorityState {
  const observation = parseWorkerHeartbeatAuthorityObservation(raw);

  if (observation.fence.trim() === '') {
    return appendHold(state, observation, 'missing-fence', 'host fence is empty or blank');
  }
  if (!sameIdentity(state.identity, observation)) {
    return appendHold(
      state,
      observation,
      sameAttempt(state.identity, observation) ? 'foreign-writer' : 'foreign-attempt',
      sameAttempt(state.identity, observation)
        ? 'worker identity or host-issued writer fence does not match authority'
        : 'observation identity does not match the fenced attempt',
    );
  }

  const invalid = contradiction(observation);
  if (invalid) return appendHold(state, observation, invalid.reasonCode, invalid.detail);

  if (state.latest !== null) {
    if (sameObservation(state.latest, observation)) return state;
    if (observation.hostSequence <= state.latest.hostSequence) {
      return appendHold(state, observation, 'stale-sequence', 'host sequence does not strictly advance');
    }
    if (Date.parse(observation.hostObservedAt) <= Date.parse(state.latest.hostObservedAt)) {
      return appendHold(state, observation, 'stale-timestamp', 'host-observed timestamp does not strictly advance');
    }
  }

  return { ...state, latest: observation };
}

/** Equivalent to repeatedly folding the observations in the supplied order. */
export function foldWorkerHeartbeatAuthorities(
  state: WorkerHeartbeatAuthorityState,
  observations: readonly unknown[],
): WorkerHeartbeatAuthorityState {
  return observations.reduce(foldWorkerHeartbeatAuthority, state);
}
