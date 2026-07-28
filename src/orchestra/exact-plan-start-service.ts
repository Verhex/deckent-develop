// ═══ exact-plan-start-service — canonical exact-start effect authority ═══
//
// One approved Sprint, one digest, one durable start-attempt journal. Parent
// process birth stops at PROCESS_SPAWNED. The exact child publishes ADMITTED
// and the compatibility handle atomically only from runSprint's admission
// hook. No function in this module plans or mutates an approved Sprint.

import { createHash, randomUUID } from 'node:crypto';
import {
  isTerminalStartAttemptState,
  type ExactPlanReferenceV1,
  type PlanPreview,
  type RunHandle,
  type RunProposal,
  type StartAttemptLineage,
  type StartAttemptProcessIdentity,
  type StartAttemptRecord,
  type StartAttemptSettlement,
} from '../core/run-flow-contract.js';
import {
  admitStartAttempt,
  loadApprovedSnapshot,
  loadLatestStartAttempt,
  loadStartAttempt,
  prepareStartAttempt,
  recordStartAttemptProcessSpawned,
  RunFlowStoreError,
  settleStartAttempt,
  type StartAttemptCas,
  type StoredApprovedSnapshot,
} from '../core/run-flow-store.js';
import { processStartToken, verifyPidOwnership, type OwnershipStatus } from '../core/pid-ownership.js';
import type {
  ResolvedConfig,
  Sprint,
  SprintSizeRecommendation,
} from '../core/types.js';
import type { ActorContext, RequestOrigin } from '../core/work-model.js';
import {
  RunJobBudgetHoldError,
  RunJobDigestMismatchError,
  RunJobFlowNotApprovedError,
  RunJobTopologyHoldError,
  startApprovedRun,
} from './run-job-service.js';
import {
  planRunFlow,
  type PlanRunFlowResult,
  type RunFlowPlanSource,
} from './run-flow-plan-service.js';
import type { PlanPreviewOptions } from './plan-preview-service.js';
import {
  publishTaskArtifactsNoClobber,
  TaskArtifactProjectionError,
} from './task-artifact-projection.js';

const DEFAULT_PREPARE_LEASE_MS = 60_000;

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

export type ExactPlanStartErrorCode =
  | 'EXACT_START_REFERENCE_MISMATCH'
  | 'EXACT_START_LINEAGE_HOLD'
  | 'EXACT_START_LINEAGE_DENIED'
  | 'EXACT_START_ATTEMPT_ACTIVE'
  | 'EXACT_START_ATTEMPT_TERMINAL'
  | 'EXACT_START_PROCESS_EFFECT_UNKNOWN'
  | 'EXACT_START_PROCESS_OWNERSHIP_HOLD'
  | 'EXACT_START_PROCESS_IDENTITY_MISMATCH'
  | 'EXACT_START_CAPABILITY_DENIED'
  | 'EXACT_START_TASK_ID_INVALID'
  | 'EXACT_START_TASK_ARTIFACT_DRIFT'
  | 'EXACT_START_TASK_ARTIFACT_DURABILITY_HOLD'
  | 'EXACT_START_ADMISSION_REQUIRED'
  | 'EXACT_START_LIFECYCLE_PUBLICATION_HOLD'
  | 'EXACT_START_RUNTIME_FAILED';

export class ExactPlanStartError extends Error {
  constructor(
    readonly code: ExactPlanStartErrorCode,
    message: string,
    readonly flowId: string,
    readonly attemptId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExactPlanStartError';
  }
}

export interface ExactStartLineageInput {
  readonly tenantId: string;
  readonly actor: ActorContext;
  readonly origin: RequestOrigin;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly causationId?: string;
  readonly sourceId?: string;
  readonly authorization:
    | { readonly kind: 'approved-actor' }
    | {
        readonly kind: 'delegated';
        readonly authorityId: string;
        readonly decisionId: string;
      };
}

export type ExactStartAuthorizationVerifier = (input: {
  readonly exactRef: ExactPlanReferenceV1;
  readonly snapshot: StoredApprovedSnapshot;
  readonly actor: ActorContext;
  readonly origin: RequestOrigin;
  readonly authorityId: string;
  readonly decisionId: string;
}) =>
  | { readonly allowed: true; readonly authorityRef: string }
  | { readonly allowed: false; readonly reasonCode: string };

export interface ExactStartCapability extends ExactPlanReferenceV1 {
  readonly generation: number;
  readonly attemptId: string;
  readonly ownerNonce: string;
}

export interface ExactStartIdentityDeps {
  readonly isAlive?: (pid: number) => boolean;
  readonly startToken?: (pid: number) => string | null;
}

export interface SpawnExactProcessContext {
  readonly capability: ExactStartCapability;
  readonly sprint: Sprint;
  readonly lineage: StartAttemptLineage;
}

export interface SpawnExactProcessResult {
  readonly pid: number;
  /**
   * Omit to let the service inspect the spawned pid. Null is an honest
   * unavailable platform token, not evidence of ownership.
   */
  readonly startToken?: string | null;
}

interface PrepareExactRunBase {
  readonly root: string;
  readonly exactRef: ExactPlanReferenceV1;
  readonly approvedSnapshot: StoredApprovedSnapshot | undefined;
  readonly lineage: ExactStartLineageInput;
  readonly attemptId?: string;
  readonly ownerNonce?: string;
  readonly preparedAt?: string;
  readonly spawnedAt?: string;
  readonly leaseUntil?: string;
  readonly preparerProcess?: StartAttemptProcessIdentity;
  /** Explicitly authorizes a new generation; it must name the current one. */
  readonly retryFromAttemptId?: string;
  readonly identityDeps?: ExactStartIdentityDeps;
  readonly verifyStartAuthorization?: ExactStartAuthorizationVerifier;
  /** PREPARED is committed before this durable START_REQUESTED projection. */
  readonly onPrepared?: (input: {
    readonly attempt: StartAttemptRecord;
    readonly capability: ExactStartCapability;
  }) => void;
}

export interface PrepareAndSpawnExactRunInput extends PrepareExactRunBase {
  readonly spawnProcess: (context: SpawnExactProcessContext) => SpawnExactProcessResult;
}

export interface PrepareInProcessExactRunInput extends PrepareExactRunBase {
  readonly process?: StartAttemptProcessIdentity;
}

export type PrepareExactRunResult =
  | {
      readonly status: 'process-spawned';
      readonly attempt: StartAttemptRecord;
      readonly capability: ExactStartCapability;
      readonly sprint: Sprint;
    }
  | {
      readonly status: 'duplicate-admitted';
      readonly attempt: StartAttemptRecord;
      readonly capability: ExactStartCapability;
      readonly handle: RunHandle;
    }
  | {
      readonly status: 'duplicate-terminal';
      readonly attempt: StartAttemptRecord;
      readonly capability: ExactStartCapability;
    };

function sameExactReference(
  attempt: Pick<StartAttemptRecord, 'flowId' | 'revision' | 'planDigest'>,
  ref: ExactPlanReferenceV1,
): boolean {
  return attempt.flowId === ref.flowId
    && attempt.revision === ref.revision
    && attempt.planDigest === ref.planDigest;
}

function capabilityFor(attempt: StartAttemptRecord): ExactStartCapability {
  return {
    schemaVersion: 1,
    flowId: attempt.flowId,
    revision: attempt.revision,
    planDigest: attempt.planDigest,
    generation: attempt.generation,
    attemptId: attempt.attemptId,
    ownerNonce: attempt.owner.ownerNonce,
  };
}

function casFor(capability: ExactStartCapability): StartAttemptCas {
  return {
    flowId: capability.flowId,
    revision: capability.revision,
    planDigest: capability.planDigest,
    generation: capability.generation,
    attemptId: capability.attemptId,
    ownerNonce: capability.ownerNonce,
  };
}

function captureProcessIdentity(
  pid: number,
  deps: ExactStartIdentityDeps = {},
  suppliedToken?: string | null,
): StartAttemptProcessIdentity {
  const token = suppliedToken === undefined
    ? (deps.startToken ?? processStartToken)(pid)
    : suppliedToken;
  return token === null
    ? { pid, startToken: null, evidence: 'unavailable' }
    : { pid, startToken: token, evidence: 'verified' };
}

function classifyOwnership(
  identity: StartAttemptProcessIdentity,
  deps: ExactStartIdentityDeps = {},
): OwnershipStatus {
  if (identity.evidence === 'unavailable' || identity.startToken === null) return 'unknown';
  return verifyPidOwnership(
    { pid: identity.pid, startToken: identity.startToken },
    { isAlive: deps.isAlive, startToken: deps.startToken },
  );
}

function assertRefMatchesSnapshot(
  ref: ExactPlanReferenceV1,
  snapshot: StoredApprovedSnapshot | undefined,
): Sprint {
  return startApprovedRun({
    flowId: ref.flowId,
    expectedRevision: ref.revision,
    expectedPlanDigest: ref.planDigest,
    approvedSnapshot: snapshot,
  }).sprint;
}

function buildLineage(
  ref: ExactPlanReferenceV1,
  snapshot: StoredApprovedSnapshot,
  input: ExactStartLineageInput,
  verifyStartAuthorization?: ExactStartAuthorizationVerifier,
): StartAttemptLineage {
  const proposal = snapshot.proposal;
  const planLineage = snapshot.planLineage;
  if (!proposal || !planLineage) {
    throw new ExactPlanStartError(
      'EXACT_START_LINEAGE_HOLD',
      `exact-plan-start: approved snapshot '${ref.flowId}' has no durable proposal lineage`,
      ref.flowId,
    );
  }
  if (
    proposal.flowId !== ref.flowId
    || proposal.tenant !== input.tenantId
    || planLineage.tenantId !== proposal.tenant
    || canonicalJson(planLineage.actor) !== canonicalJson(proposal.actor)
    || planLineage.origin !== proposal.origin
    || planLineage.correlationId.trim().length === 0
    || planLineage.idempotencyKey.trim().length === 0
  ) {
    throw new ExactPlanStartError(
      'EXACT_START_LINEAGE_DENIED',
      `exact-plan-start: caller lineage does not match approved proposal '${ref.flowId}'`,
      ref.flowId,
    );
  }
  if (
    input.correlationId !== planLineage.correlationId
    && input.causationId !== planLineage.correlationId
  ) {
    throw new ExactPlanStartError(
      'EXACT_START_LINEAGE_DENIED',
      `exact-plan-start: cross-correlation start must causally reference plan '${planLineage.correlationId}'`,
      ref.flowId,
    );
  }
  let authorizationAuthority: string;
  if (input.authorization.kind === 'approved-actor') {
    if (canonicalJson(input.actor) !== canonicalJson(snapshot.approvedBy)) {
      throw new ExactPlanStartError(
        'EXACT_START_LINEAGE_DENIED',
        `exact-plan-start: start actor is neither the approving actor nor delegated`,
        ref.flowId,
      );
    }
    authorizationAuthority = `approved-actor:${snapshot.approvedBy.id}`;
  } else {
    const verdict = verifyStartAuthorization?.({
      exactRef: ref,
      snapshot,
      actor: input.actor,
      origin: input.origin,
      authorityId: input.authorization.authorityId,
      decisionId: input.authorization.decisionId,
    });
    if (!verdict?.allowed) {
      throw new ExactPlanStartError(
        'EXACT_START_LINEAGE_DENIED',
        `exact-plan-start: delegated start authority was not verified`,
        ref.flowId,
      );
    }
    authorizationAuthority = verdict.authorityRef;
  }
  return {
    tenantId: proposal.tenant,
    projectId: proposal.project,
    actor: { ...input.actor },
    origin: input.origin,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    parentPlanLineageHash: createHash('sha256').update(canonicalJson(planLineage)).digest('hex'),
    parentCorrelationId: planLineage.correlationId,
    authorizationAuthority,
    ...(input.causationId !== undefined ? { causationId: input.causationId } : {}),
    ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
  };
}

function assertAttemptCapability(
  attempt: StartAttemptRecord,
  capability: ExactStartCapability,
): void {
  if (
    !sameExactReference(attempt, capability)
    || attempt.generation !== capability.generation
    || attempt.attemptId !== capability.attemptId
    || attempt.owner.ownerNonce !== capability.ownerNonce
  ) {
    throw new ExactPlanStartError(
      'EXACT_START_CAPABILITY_DENIED',
      `exact-plan-start: capability does not match attempt '${capability.attemptId}'`,
      capability.flowId,
      capability.attemptId,
    );
  }
}

function classifyExisting(
  current: StartAttemptRecord,
  input: PrepareExactRunBase,
): PrepareExactRunResult | undefined {
  if (!sameExactReference(current, input.exactRef)) {
    throw new ExactPlanStartError(
      'EXACT_START_REFERENCE_MISMATCH',
      `exact-plan-start: flow '${input.exactRef.flowId}' has another active or terminal exact-plan generation`,
      input.exactRef.flowId,
      current.attemptId,
    );
  }
  const capability = capabilityFor(current);
  if (current.state === 'ADMITTED' && current.handle) {
    return {
      status: 'duplicate-admitted',
      attempt: current,
      capability,
      handle: current.handle,
    };
  }
  if (isTerminalStartAttemptState(current.state)) {
    if (input.retryFromAttemptId === current.attemptId) return undefined;
    return { status: 'duplicate-terminal', attempt: current, capability };
  }

  const identity = current.state === 'PREPARED'
    ? current.owner.process
    : current.process;
  const authorityKind = current.state === 'PREPARED'
    ? 'preparer-recovery' as const
    : 'process-recovery' as const;
  if (!identity) {
    throw new ExactPlanStartError(
      'EXACT_START_PROCESS_OWNERSHIP_HOLD',
      `exact-plan-start: attempt '${current.attemptId}' has no recoverable process identity`,
      current.flowId,
      current.attemptId,
    );
  }
  const ownership = classifyOwnership(identity, input.identityDeps);
  if (ownership === 'owned') {
    throw new ExactPlanStartError(
      'EXACT_START_ATTEMPT_ACTIVE',
      `exact-plan-start: attempt '${current.attemptId}' is already in flight`,
      current.flowId,
      current.attemptId,
    );
  }
  if (ownership === 'unknown') {
    throw new ExactPlanStartError(
      'EXACT_START_PROCESS_OWNERSHIP_HOLD',
      `exact-plan-start: attempt '${current.attemptId}' ownership is unavailable; duplicate spawn refused`,
      current.flowId,
      current.attemptId,
    );
  }
  if (input.retryFromAttemptId !== current.attemptId) {
    throw new ExactPlanStartError(
      'EXACT_START_ATTEMPT_ACTIVE',
      `exact-plan-start: attempt '${current.attemptId}' is recoverable but retry authority was not supplied`,
      current.flowId,
      current.attemptId,
    );
  }
  const settledAt = new Date().toISOString();
  settleStartAttempt(input.root, {
    ...casFor(capability),
    settlement: {
      state: 'FAILED',
      code: ownership === 'dead' ? 'START_PROCESS_DEAD' : 'START_PROCESS_REUSED',
      settledAt,
    },
    authority: {
      kind: authorityKind,
      observedOwnership: ownership,
      observedAt: settledAt,
    },
  });
  return undefined;
}

function prepareNewAttempt(
  input: PrepareExactRunBase,
): { attempt: StartAttemptRecord; sprint: Sprint; lineage: StartAttemptLineage } | PrepareExactRunResult {
  const sprint = assertRefMatchesSnapshot(input.exactRef, input.approvedSnapshot);
  const snapshot = input.approvedSnapshot!;
  const lineage = buildLineage(
    input.exactRef,
    snapshot,
    input.lineage,
    input.verifyStartAuthorization,
  );
  const current = loadLatestStartAttempt(input.root, input.exactRef.flowId);
  const existingResult = current ? classifyExisting(current, input) : undefined;
  if (existingResult) return existingResult;

  const preparedAt = input.preparedAt ?? new Date().toISOString();
  const leaseUntil = input.leaseUntil
    ?? new Date(Date.parse(preparedAt) + DEFAULT_PREPARE_LEASE_MS).toISOString();
  const preparerProcess = input.preparerProcess ?? captureProcessIdentity(process.pid, input.identityDeps);
  const result = prepareStartAttempt(input.root, {
    flowId: input.exactRef.flowId,
    revision: input.exactRef.revision,
    planDigest: input.exactRef.planDigest,
    attemptId: input.attemptId ?? randomUUID(),
    preparedAt,
    lineage,
    owner: {
      process: preparerProcess,
      ownerNonce: input.ownerNonce ?? randomUUID(),
      leaseUntil,
    },
    ...(current
      ? {
          expectedPrevious: {
            generation: current.generation,
            attemptId: current.attemptId,
          },
        }
      : {}),
  });
  if (!result.applied) {
    const replay = classifyExisting(result.attempt, input);
    if (replay) return replay;
    throw new ExactPlanStartError(
      'EXACT_START_ATTEMPT_TERMINAL',
      `exact-plan-start: idempotent replay did not authorize a new generation`,
      input.exactRef.flowId,
      result.attempt.attemptId,
    );
  }
  const capability = capabilityFor(result.attempt);
  if (input.onPrepared) {
    try {
      input.onPrepared({ attempt: result.attempt, capability });
    } catch (cause) {
      const settledAt = new Date().toISOString();
      settleStartAttempt(input.root, {
        ...casFor(capability),
        settlement: {
          state: 'BLOCKED',
          code: 'START_REQUESTED_PUBLICATION_UNCERTAIN',
          detail: cause instanceof Error ? cause.message : String(cause),
          settledAt,
        },
        authority: { kind: 'owner-capability' },
      });
      throw new ExactPlanStartError(
        'EXACT_START_LIFECYCLE_PUBLICATION_HOLD',
        `exact-plan-start: START_REQUESTED publication is uncertain for attempt '${capability.attemptId}'`,
        capability.flowId,
        capability.attemptId,
        { cause },
      );
    }
  }
  return { attempt: result.attempt, sprint, lineage };
}

function recordSpawned(
  input: PrepareExactRunBase,
  attempt: StartAttemptRecord,
  processIdentity: StartAttemptProcessIdentity,
  spawnedAt = input.spawnedAt ?? new Date().toISOString(),
): PrepareExactRunResult {
  const capability = capabilityFor(attempt);
  const recorded = recordStartAttemptProcessSpawned(input.root, {
    ...casFor(capability),
    process: processIdentity,
    spawnedAt,
  }).attempt;
  return {
    status: 'process-spawned',
    attempt: recorded,
    capability,
    sprint: input.approvedSnapshot!.sprint,
  };
}

export function prepareAndSpawnExactRun(input: PrepareAndSpawnExactRunInput): PrepareExactRunResult {
  const prepared = prepareNewAttempt(input);
  if ('status' in prepared) return prepared;
  const capability = capabilityFor(prepared.attempt);
  let spawned: SpawnExactProcessResult;
  try {
    spawned = input.spawnProcess({
      capability,
      sprint: prepared.sprint,
      lineage: prepared.lineage,
    });
  } catch (cause) {
    const settledAt = new Date().toISOString();
    settleStartAttempt(input.root, {
      ...casFor(capability),
      settlement: {
        state: 'UNKNOWN',
        code: 'SPAWN_EFFECT_OUTCOME_UNKNOWN',
        detail: cause instanceof Error ? cause.message : String(cause),
        settledAt,
      },
      authority: { kind: 'effect-unknown' },
    });
    throw new ExactPlanStartError(
      'EXACT_START_PROCESS_EFFECT_UNKNOWN',
      `exact-plan-start: spawn boundary outcome is unknown for attempt '${capability.attemptId}'`,
      capability.flowId,
      capability.attemptId,
      { cause },
    );
  }
  const identity = captureProcessIdentity(spawned.pid, input.identityDeps, spawned.startToken);
  if (identity.evidence === 'verified') {
    const ownership = classifyOwnership(identity, input.identityDeps);
    if (ownership !== 'owned') {
      const settledAt = new Date().toISOString();
      settleStartAttempt(input.root, {
        ...casFor(capability),
        settlement: {
          state: 'UNKNOWN',
          code: `SPAWN_PROCESS_${ownership.toUpperCase()}`,
          settledAt,
        },
        authority: { kind: 'effect-unknown' },
      });
      throw new ExactPlanStartError(
        'EXACT_START_PROCESS_OWNERSHIP_HOLD',
        `exact-plan-start: spawned process ownership is ${ownership}`,
        capability.flowId,
        capability.attemptId,
      );
    }
  }
  return recordSpawned(input, prepared.attempt, identity);
}

export function prepareInProcessExactRun(input: PrepareInProcessExactRunInput): PrepareExactRunResult {
  const prepared = prepareNewAttempt(input);
  if ('status' in prepared) return prepared;
  const identity = input.process ?? captureProcessIdentity(process.pid, input.identityDeps);
  return recordSpawned(input, prepared.attempt, identity);
}

export interface MaterializeExactPlanTaskArtifactsInput {
  readonly capability: ExactStartCapability;
  readonly approvedSnapshot: StoredApprovedSnapshot;
}

export interface ExactPlanTaskMaterialization {
  readonly taskIds: readonly string[];
  readonly created: readonly string[];
  readonly idempotent: readonly string[];
}

/**
 * Atomic no-clobber materialization. Existing exact content is idempotent;
 * conflicting content is a typed HOLD. Sibling/orphan artifacts are untouched.
 */
export function materializeExactPlanTaskArtifacts(
  root: string,
  input: MaterializeExactPlanTaskArtifactsInput,
): ExactPlanTaskMaterialization {
  const { capability, approvedSnapshot } = input;
  assertRefMatchesSnapshot(capability, approvedSnapshot);
  const attempt = loadStartAttempt(root, capability.attemptId);
  if (!attempt) {
    throw new ExactPlanStartError(
      'EXACT_START_CAPABILITY_DENIED',
      `exact-plan-start: attempt '${capability.attemptId}' does not exist`,
      capability.flowId,
      capability.attemptId,
    );
  }
  assertAttemptCapability(attempt, capability);
  if (attempt.state !== 'PROCESS_SPAWNED') {
    throw new ExactPlanStartError(
      'EXACT_START_ATTEMPT_ACTIVE',
      `exact-plan-start: task materialization requires PROCESS_SPAWNED, found ${attempt.state}`,
      capability.flowId,
      capability.attemptId,
    );
  }

  try {
    return publishTaskArtifactsNoClobber(
      root,
      approvedSnapshot.sprint.tasks,
      `exact-start:${capability.attemptId}`,
    );
  } catch (cause) {
    if (cause instanceof TaskArtifactProjectionError) {
      const code = cause.code === 'TASK_ARTIFACT_ID_INVALID'
        ? 'EXACT_START_TASK_ID_INVALID'
        : cause.code === 'TASK_ARTIFACT_DURABILITY_HOLD'
          ? 'EXACT_START_TASK_ARTIFACT_DURABILITY_HOLD'
          : 'EXACT_START_TASK_ARTIFACT_DRIFT';
      throw new ExactPlanStartError(
        code,
        `exact-plan-start: ${cause.code}`,
        capability.flowId,
        capability.attemptId,
        { cause },
      );
    }
    throw new ExactPlanStartError(
      'EXACT_START_TASK_ARTIFACT_DURABILITY_HOLD',
      'exact-plan-start: task artifact durability could not be proven',
      capability.flowId,
      capability.attemptId,
      { cause },
    );
  }
}

export interface AdmitExactRunAttemptInput {
  readonly root: string;
  readonly capability: ExactStartCapability;
  readonly approvedSnapshot: StoredApprovedSnapshot;
  readonly process: StartAttemptProcessIdentity;
  readonly handle: RunHandle;
  readonly admittedAt?: string;
  readonly gitBase?: string;
  /**
   * Required only when the platform cannot provide a process start token.
   * This is the one-shot parent→child capability; it is not adoption evidence.
   */
  readonly freshCapability?: {
    readonly attemptId: string;
    readonly ownerNonce: string;
  };
  readonly identityDeps?: ExactStartIdentityDeps;
  /** Runs only after ADMITTED+handle canonical commit. */
  readonly onAdmitted?: (input: {
    readonly attempt: StartAttemptRecord;
    readonly handle: RunHandle;
  }) => void;
}

export interface AdmitExactRunAttemptResult {
  readonly applied: boolean;
  readonly attempt: StartAttemptRecord;
  readonly handle: RunHandle;
  readonly lifecyclePublication:
    | { readonly status: 'published' | 'not-requested' }
    | { readonly status: 'uncertain'; readonly detail: string };
}

function assertProcessCanMutate(
  attempt: StartAttemptRecord,
  processIdentity: StartAttemptProcessIdentity,
  capability: ExactStartCapability,
  freshCapability: AdmitExactRunAttemptInput['freshCapability'],
  deps: ExactStartIdentityDeps | undefined,
): void {
  if (
    attempt.process?.pid !== processIdentity.pid
    || attempt.process.startToken !== processIdentity.startToken
    || attempt.process.evidence !== processIdentity.evidence
  ) {
    throw new ExactPlanStartError(
      'EXACT_START_PROCESS_IDENTITY_MISMATCH',
      `exact-plan-start: process identity does not match attempt '${attempt.attemptId}'`,
      attempt.flowId,
      attempt.attemptId,
    );
  }
  if (processIdentity.evidence === 'verified') {
    if (classifyOwnership(processIdentity, deps) === 'owned') return;
    throw new ExactPlanStartError(
      'EXACT_START_PROCESS_OWNERSHIP_HOLD',
      `exact-plan-start: process generation is not owned for attempt '${attempt.attemptId}'`,
      attempt.flowId,
      attempt.attemptId,
    );
  }
  if (
    freshCapability?.attemptId === capability.attemptId
    && freshCapability.ownerNonce === capability.ownerNonce
    && processIdentity.pid === attempt.process.pid
  ) return;
  throw new ExactPlanStartError(
    'EXACT_START_PROCESS_OWNERSHIP_HOLD',
    `exact-plan-start: platform process identity is unavailable; restart/adoption refused`,
    attempt.flowId,
    attempt.attemptId,
  );
}

export function admitExactRunAttempt(
  input: AdmitExactRunAttemptInput,
): AdmitExactRunAttemptResult {
  assertRefMatchesSnapshot(input.capability, input.approvedSnapshot);
  const attempt = loadStartAttempt(input.root, input.capability.attemptId);
  if (!attempt) {
    throw new ExactPlanStartError(
      'EXACT_START_CAPABILITY_DENIED',
      `exact-plan-start: attempt '${input.capability.attemptId}' does not exist`,
      input.capability.flowId,
      input.capability.attemptId,
    );
  }
  assertAttemptCapability(attempt, input.capability);
  if (attempt.state === 'ADMITTED' && attempt.handle) {
    assertProcessCanMutate(
      attempt,
      input.process,
      input.capability,
      input.freshCapability,
      input.identityDeps,
    );
    if (canonicalJson(attempt.handle) !== canonicalJson(input.handle)) {
      throw new ExactPlanStartError(
        'EXACT_START_CAPABILITY_DENIED',
        `exact-plan-start: admitted handle replay differs for attempt '${attempt.attemptId}'`,
        attempt.flowId,
        attempt.attemptId,
      );
    }
    if (input.onAdmitted) {
      try {
        input.onAdmitted({ attempt, handle: attempt.handle });
        return {
          applied: false,
          attempt,
          handle: attempt.handle,
          lifecyclePublication: { status: 'published' },
        };
      } catch (cause) {
        return {
          applied: false,
          attempt,
          handle: attempt.handle,
          lifecyclePublication: {
            status: 'uncertain',
            detail: cause instanceof Error ? cause.message : String(cause),
          },
        };
      }
    }
    return {
      applied: false,
      attempt,
      handle: attempt.handle,
      lifecyclePublication: { status: 'not-requested' },
    };
  }
  if (attempt.state !== 'PROCESS_SPAWNED') {
    throw new ExactPlanStartError(
      'EXACT_START_ADMISSION_REQUIRED',
      `exact-plan-start: attempt '${attempt.attemptId}' cannot admit from ${attempt.state}`,
      attempt.flowId,
      attempt.attemptId,
    );
  }
  assertProcessCanMutate(
    attempt,
    input.process,
    input.capability,
    input.freshCapability,
    input.identityDeps,
  );
  const result = admitStartAttempt(input.root, {
    ...casFor(input.capability),
    process: input.process,
    handle: input.handle,
    admittedAt: input.admittedAt ?? new Date().toISOString(),
    ...(input.gitBase !== undefined ? { gitBase: input.gitBase } : {}),
  });
  if (!input.onAdmitted) {
    return {
      ...result,
      handle: input.handle,
      lifecyclePublication: { status: 'not-requested' },
    };
  }
  try {
    input.onAdmitted({ attempt: result.attempt, handle: input.handle });
    return {
      ...result,
      handle: input.handle,
      lifecyclePublication: { status: 'published' },
    };
  } catch (cause) {
    return {
      ...result,
      handle: input.handle,
      lifecyclePublication: {
        status: 'uncertain',
        detail: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }
}

export interface SettleExactRunAttemptInput {
  readonly root: string;
  readonly capability: ExactStartCapability;
  readonly process: StartAttemptProcessIdentity;
  readonly settlement: StartAttemptSettlement;
  readonly freshCapability?: AdmitExactRunAttemptInput['freshCapability'];
  readonly identityDeps?: ExactStartIdentityDeps;
}

export function settleExactRunAttempt(
  input: SettleExactRunAttemptInput,
): { readonly applied: boolean; readonly attempt: StartAttemptRecord } {
  const attempt = loadStartAttempt(input.root, input.capability.attemptId);
  if (!attempt) {
    throw new ExactPlanStartError(
      'EXACT_START_CAPABILITY_DENIED',
      `exact-plan-start: attempt '${input.capability.attemptId}' does not exist`,
      input.capability.flowId,
      input.capability.attemptId,
    );
  }
  assertAttemptCapability(attempt, input.capability);
  if (isTerminalStartAttemptState(attempt.state)) {
    return { applied: false, attempt };
  }
  assertProcessCanMutate(
    attempt,
    input.process,
    input.capability,
    input.freshCapability,
    input.identityDeps,
  );
  return settleStartAttempt(input.root, {
    ...casFor(input.capability),
    settlement: input.settlement,
    authority: { kind: 'owner-capability' },
  });
}

// ═══ Canonical high-level facade ═════════════════════════════════════════

export interface CanonicalExactSprintExecutionIngress {
  readonly kind: 'goal' | 'mission' | 'flow' | 'run' | 'do' | 'autonomous' | 'process' | 'api' | 'terminal' | 'cli';
  readonly id: string;
  readonly intent?: string;
  readonly directives?: string;
}

export type CanonicalExactSprintExecutionSource =
  | {
      readonly kind: 'exact-ref';
      readonly ref: ExactPlanReferenceV1;
      readonly ingress: CanonicalExactSprintExecutionIngress;
    }
  | {
      readonly kind: 'unplanned';
      readonly proposal: RunProposal;
      readonly planSource: RunFlowPlanSource;
      readonly recommendation: SprintSizeRecommendation;
      readonly previewOptions?: PlanPreviewOptions;
      readonly acknowledgeScopePaths?: boolean;
      readonly ingress: CanonicalExactSprintExecutionIngress;
      readonly approvalAuthority?: {
        readonly kind: 'approval-broker';
        readonly token: string;
      };
    };

export interface CanonicalExactSprintExecutionInput {
  readonly projectRoot: string;
  readonly config: ResolvedConfig;
  readonly source: CanonicalExactSprintExecutionSource;
  readonly lineage: ExactStartLineageInput;
  readonly executionMode: 'in-process' | 'detached';
  readonly retryFromAttemptId?: string;
}

export interface CanonicalExactRuntimeContext {
  readonly projectRoot: string;
  readonly config: ResolvedConfig;
  readonly exactRef: ExactPlanReferenceV1;
  readonly snapshot: StoredApprovedSnapshot;
  readonly sprint: Sprint;
  readonly source: CanonicalExactSprintExecutionIngress;
  readonly capability: ExactStartCapability;
  readonly process: StartAttemptProcessIdentity;
  readonly onExactPlanMaterialize: () => ExactPlanTaskMaterialization;
  readonly onExecutionAdmitted: (handle: RunHandle, gitBase?: string) => void;
}

export interface CanonicalExactRuntimeResult {
  readonly terminalState: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'BLOCKED';
  readonly reasonCode: string;
  readonly detail?: string;
}

export interface CanonicalExactSprintExecutorDeps {
  readonly executeInProcess: (context: CanonicalExactRuntimeContext) => Promise<CanonicalExactRuntimeResult>;
  readonly spawnDetached: (
    context: SpawnExactProcessContext & {
      readonly projectRoot: string;
      readonly config: ResolvedConfig;
      readonly source: CanonicalExactSprintExecutionIngress;
    },
  ) => SpawnExactProcessResult;
  /**
   * ApprovalBroker/policy adapter. The unplanned path never treats a boolean
   * as authority; a token is resolved only after the exact digest exists.
   */
  readonly resolveApprovalAuthority?: (input: {
    readonly token: string;
    readonly plan: PlanRunFlowResult;
    readonly preview: PlanPreview;
  }) => Promise<
    | {
        readonly decision: 'approve';
        readonly actor: ActorContext;
        readonly acknowledgePromptGate?: boolean;
        readonly acknowledgeScopePaths?: boolean;
      }
    | { readonly decision: 'deny' | 'hold'; readonly reasonCode: string; readonly detail?: string }
  >;
  readonly now?: () => Date;
  readonly identityDeps?: ExactStartIdentityDeps;
  readonly verifyStartAuthorization?: ExactStartAuthorizationVerifier;
  readonly lifecycle: {
    readonly publishStartRequested: (input: {
      readonly projectRoot: string;
      readonly exactRef: ExactPlanReferenceV1;
      readonly attempt: StartAttemptRecord;
      readonly capability: ExactStartCapability;
    }) => void;
    readonly publishRunStarted: (input: {
      readonly projectRoot: string;
      readonly exactRef: ExactPlanReferenceV1;
      readonly attempt: StartAttemptRecord;
      readonly handle: RunHandle;
    }) => void;
  };
}

export type CanonicalExactSprintExecutionOutcome =
  | {
      readonly status: 'accepted';
      readonly exactRef: ExactPlanReferenceV1;
      readonly attempt: StartAttemptRecord;
      readonly capability: ExactStartCapability;
    }
  | {
      readonly status: 'settled';
      readonly exactRef: ExactPlanReferenceV1;
      readonly attempt: StartAttemptRecord;
      readonly handle: RunHandle;
      readonly settlement: StartAttemptSettlement;
      readonly lifecyclePublication?: AdmitExactRunAttemptResult['lifecyclePublication'];
    }
  | {
      readonly status: 'duplicate';
      readonly exactRef: ExactPlanReferenceV1;
      readonly attempt: StartAttemptRecord;
      readonly handle?: RunHandle;
    }
  | {
      readonly status: 'awaiting-approval' | 'held' | 'denied' | 'failed';
      readonly exactRef?: ExactPlanReferenceV1;
      readonly reasonCode: string;
      readonly detail?: string;
      readonly preview?: PlanPreview;
      readonly canonicalCommitState?: 'not-committed' | 'committed';
      readonly recoveryRef?: string;
      readonly attempt?: StartAttemptRecord;
      readonly handle?: RunHandle;
    };

export interface CanonicalExactSprintExecutor {
  execute(input: CanonicalExactSprintExecutionInput): Promise<CanonicalExactSprintExecutionOutcome>;
}

function refusalOutcome(
  ref: ExactPlanReferenceV1 | undefined,
  error: unknown,
): CanonicalExactSprintExecutionOutcome {
  if (error instanceof RunJobFlowNotApprovedError) {
    return { status: 'awaiting-approval', ...(ref ? { exactRef: ref } : {}), reasonCode: error.code, detail: error.message };
  }
  if (error instanceof RunJobBudgetHoldError || error instanceof RunJobTopologyHoldError) {
    return { status: 'held', ...(ref ? { exactRef: ref } : {}), reasonCode: error.code, detail: error.message };
  }
  if (error instanceof RunJobDigestMismatchError) {
    return { status: 'denied', ...(ref ? { exactRef: ref } : {}), reasonCode: error.code, detail: error.message };
  }
  if (error instanceof ExactPlanStartError) {
    const status = error.code === 'EXACT_START_LINEAGE_DENIED'
      || error.code === 'EXACT_START_REFERENCE_MISMATCH'
      || error.code === 'EXACT_START_CAPABILITY_DENIED'
      ? 'denied'
      : 'held';
    return { status, ...(ref ? { exactRef: ref } : {}), reasonCode: error.code, detail: error.message };
  }
  if (error instanceof RunFlowStoreError) {
    return {
      status: error.canonicalCommitState === 'committed' ? 'held' : 'failed',
      ...(ref ? { exactRef: ref } : {}),
      reasonCode: error.code,
      detail: error.message,
      canonicalCommitState: error.canonicalCommitState,
      ...(error.recoveryRef !== undefined ? { recoveryRef: error.recoveryRef } : {}),
    };
  }
  return {
    status: 'failed',
    ...(ref ? { exactRef: ref } : {}),
    reasonCode: 'EXACT_START_RUNTIME_FAILED',
    detail: error instanceof Error ? error.message : String(error),
  };
}

export function createCanonicalExactSprintExecutor(
  deps: CanonicalExactSprintExecutorDeps,
): CanonicalExactSprintExecutor {
  const now = deps.now ?? (() => new Date());

  async function resolveSource(
    input: CanonicalExactSprintExecutionInput,
  ): Promise<
    | {
        readonly status: 'ready';
        readonly exactRef: ExactPlanReferenceV1;
        readonly ingress: CanonicalExactSprintExecutionIngress;
      }
    | CanonicalExactSprintExecutionOutcome
  > {
    if (input.source.kind === 'exact-ref') {
      return { status: 'ready', exactRef: input.source.ref, ingress: input.source.ingress };
    }
    const planInput = {
      projectRoot: input.projectRoot,
      config: input.config,
      recommendation: input.source.recommendation,
      proposal: input.source.proposal,
      lineage: {
        tenantId: input.lineage.tenantId,
        actor: input.lineage.actor,
        origin: input.lineage.origin,
        correlationId: input.lineage.correlationId,
        idempotencyKey: input.lineage.idempotencyKey,
        ...(input.lineage.causationId !== undefined
          ? { causationId: input.lineage.causationId }
          : {}),
        sourceRef: input.lineage.sourceId ?? input.source.ingress.id,
      },
      source: input.source.planSource,
      ...(input.source.previewOptions !== undefined
        ? { previewOptions: input.source.previewOptions }
        : {}),
      ...(input.source.acknowledgeScopePaths !== undefined
        ? { acknowledgeScopePaths: input.source.acknowledgeScopePaths }
        : {}),
    } as const;
    let plan = await planRunFlow(planInput);
    const exactRef: ExactPlanReferenceV1 = {
      schemaVersion: 1,
      flowId: plan.flowId,
      revision: plan.revision,
      planDigest: plan.planDigest,
    };
    if (plan.approval === 'approved') {
      return { status: 'ready', exactRef, ingress: input.source.ingress };
    }
    const authorityRef = input.source.approvalAuthority;
    if (!authorityRef) {
      return {
        status: 'awaiting-approval',
        exactRef,
        reasonCode: 'EXACT_PLAN_APPROVAL_REQUIRED',
        preview: plan.preview,
      };
    }
    if (!deps.resolveApprovalAuthority) {
      return {
        status: 'held',
        exactRef,
        reasonCode: 'EXACT_PLAN_APPROVAL_AUTHORITY_UNAVAILABLE',
        preview: plan.preview,
      };
    }
    const authority = await deps.resolveApprovalAuthority({
      token: authorityRef.token,
      plan,
      preview: plan.preview,
    });
    if (authority.decision !== 'approve') {
      return {
        status: authority.decision === 'deny' ? 'denied' : 'held',
        exactRef,
        reasonCode: authority.reasonCode,
        ...(authority.detail !== undefined ? { detail: authority.detail } : {}),
        preview: plan.preview,
      };
    }
    plan = await planRunFlow({
      ...planInput,
      approval: {
        actor: authority.actor,
        ...(authority.acknowledgePromptGate !== undefined
          ? { acknowledgePromptGate: authority.acknowledgePromptGate }
          : {}),
        ...(authority.acknowledgeScopePaths !== undefined
          ? { acknowledgeScopePaths: authority.acknowledgeScopePaths }
          : {}),
      },
    });
    if (plan.approval !== 'approved') {
      return {
        status: 'held',
        exactRef,
        reasonCode: 'EXACT_PLAN_APPROVAL_NOT_COMMITTED',
        preview: plan.preview,
      };
    }
    return { status: 'ready', exactRef, ingress: input.source.ingress };
  }

  return {
    async execute(input): Promise<CanonicalExactSprintExecutionOutcome> {
      let exactRef: ExactPlanReferenceV1 | undefined;
      try {
        const source = await resolveSource(input);
        if (source.status !== 'ready') return source;
        const resolvedRef = source.exactRef;
        exactRef = resolvedRef;
        const snapshot = loadApprovedSnapshot(input.projectRoot, resolvedRef.flowId);
        if (!snapshot) {
          return {
            status: 'awaiting-approval',
            exactRef: resolvedRef,
            reasonCode: 'RUN_JOB_FLOW_NOT_APPROVED',
          };
        }
        const preparedAt = now().toISOString();
        const common: PrepareExactRunBase = {
          root: input.projectRoot,
          exactRef: resolvedRef,
          approvedSnapshot: snapshot,
          lineage: {
            ...input.lineage,
            sourceId: input.lineage.sourceId ?? source.ingress.id,
          },
          preparedAt,
          leaseUntil: new Date(now().getTime() + DEFAULT_PREPARE_LEASE_MS).toISOString(),
          ...(input.retryFromAttemptId !== undefined
            ? { retryFromAttemptId: input.retryFromAttemptId }
            : {}),
          ...(deps.identityDeps ? { identityDeps: deps.identityDeps } : {}),
          ...(deps.verifyStartAuthorization
            ? { verifyStartAuthorization: deps.verifyStartAuthorization }
            : {}),
          onPrepared: ({ attempt, capability }) => deps.lifecycle.publishStartRequested({
            projectRoot: input.projectRoot,
            exactRef: resolvedRef,
            attempt,
            capability,
          }),
        };
        if (input.executionMode === 'detached') {
          const prepared = prepareAndSpawnExactRun({
            ...common,
            spawnProcess: (context) => deps.spawnDetached({
              ...context,
              projectRoot: input.projectRoot,
              config: input.config,
              source: source.ingress,
            }),
          });
          if (prepared.status === 'duplicate-admitted' || prepared.status === 'duplicate-terminal') {
            return {
              status: 'duplicate',
              exactRef: resolvedRef,
              attempt: prepared.attempt,
              ...(prepared.status === 'duplicate-admitted' ? { handle: prepared.handle } : {}),
            };
          }
          return {
            status: 'accepted',
            exactRef: resolvedRef,
            attempt: prepared.attempt,
            capability: prepared.capability,
          };
        }

        const prepared = prepareInProcessExactRun(common);
        if (prepared.status === 'duplicate-admitted' || prepared.status === 'duplicate-terminal') {
          return {
            status: 'duplicate',
            exactRef: resolvedRef,
            attempt: prepared.attempt,
            ...(prepared.status === 'duplicate-admitted' ? { handle: prepared.handle } : {}),
          };
        }
        let admitted: StartAttemptRecord | undefined;
        let admittedHandle: RunHandle | undefined;
        let lifecyclePublication: AdmitExactRunAttemptResult['lifecyclePublication'] | undefined;
        const freshCapability = {
          attemptId: prepared.capability.attemptId,
          ownerNonce: prepared.capability.ownerNonce,
        };
        let runtimeResult: CanonicalExactRuntimeResult;
        try {
          runtimeResult = await deps.executeInProcess({
            projectRoot: input.projectRoot,
            config: input.config,
            exactRef: resolvedRef,
            snapshot,
            sprint: prepared.sprint,
            source: source.ingress,
            capability: prepared.capability,
            process: prepared.attempt.process!,
            onExactPlanMaterialize: () => materializeExactPlanTaskArtifacts(input.projectRoot, {
              capability: prepared.capability,
              approvedSnapshot: snapshot,
            }),
            onExecutionAdmitted: (handle, gitBase) => {
              const result = admitExactRunAttempt({
                root: input.projectRoot,
                capability: prepared.capability,
                approvedSnapshot: snapshot,
                process: prepared.attempt.process!,
                handle,
                freshCapability,
                ...(gitBase !== undefined ? { gitBase } : {}),
                ...(deps.identityDeps ? { identityDeps: deps.identityDeps } : {}),
                onAdmitted: ({ attempt, handle }) => deps.lifecycle.publishRunStarted({
                  projectRoot: input.projectRoot,
                  exactRef: resolvedRef,
                  attempt,
                  handle,
                }),
              });
              admitted = result.attempt;
              admittedHandle = result.handle;
              lifecyclePublication = result.lifecyclePublication;
            },
          });
        } catch (error) {
          const settlement = {
            state: 'FAILED',
            code: admitted ? 'EXACT_RUNTIME_FAILED_AFTER_ADMISSION' : 'EXACT_RUNTIME_FAILED_BEFORE_ADMISSION',
            detail: error instanceof Error ? error.message : String(error),
            settledAt: now().toISOString(),
          } as const;
          try {
            settleExactRunAttempt({
              root: input.projectRoot,
              capability: prepared.capability,
              process: prepared.attempt.process!,
              freshCapability,
              settlement,
              ...(deps.identityDeps ? { identityDeps: deps.identityDeps } : {}),
            });
          } catch (settleError) {
            return refusalOutcome(resolvedRef, settleError);
          }
          return {
            status: 'failed',
            exactRef: resolvedRef,
            reasonCode: settlement.code,
            detail: settlement.detail,
          };
        }
        if (!admitted || !admittedHandle) {
          const settlement = {
            state: 'BLOCKED',
            code: 'EXACT_START_ADMISSION_REQUIRED',
            detail: 'runtime returned before exact admission was committed',
            settledAt: now().toISOString(),
          } as const;
          const terminal = settleExactRunAttempt({
            root: input.projectRoot,
            capability: prepared.capability,
            process: prepared.attempt.process!,
            freshCapability,
            settlement,
            ...(deps.identityDeps ? { identityDeps: deps.identityDeps } : {}),
          }).attempt;
          return {
            status: 'held',
            exactRef: resolvedRef,
            reasonCode: settlement.code,
            detail: `${settlement.detail}; terminal attempt=${terminal.attemptId}`,
          };
        }
        const settlement: StartAttemptSettlement = {
          state: runtimeResult.terminalState,
          code: runtimeResult.reasonCode,
          ...(runtimeResult.detail !== undefined ? { detail: runtimeResult.detail } : {}),
          settledAt: now().toISOString(),
        };
        const terminal = settleExactRunAttempt({
          root: input.projectRoot,
          capability: prepared.capability,
          process: prepared.attempt.process!,
          freshCapability,
          settlement,
          ...(deps.identityDeps ? { identityDeps: deps.identityDeps } : {}),
        }).attempt;
        if (lifecyclePublication?.status === 'uncertain') {
          return {
            status: 'held',
            exactRef: resolvedRef,
            reasonCode: 'EXACT_START_LIFECYCLE_PUBLICATION_HOLD',
            detail: lifecyclePublication.detail,
            attempt: terminal,
            handle: admittedHandle,
          };
        }
        return {
          status: 'settled',
          exactRef: resolvedRef,
          attempt: terminal,
          handle: admittedHandle,
          settlement,
          ...(lifecyclePublication ? { lifecyclePublication } : {}),
        };
      } catch (error) {
        return refusalOutcome(exactRef, error);
      }
    },
  };
}
