import { createHash } from 'node:crypto';

import {
  ExecutionLockError,
  acquireExecutionLock,
  assertExecutionLockAuthority,
  beginExecutionLockIrreversibleBoundary,
  checkExecutionLock,
  completeExecutionLockIrreversibleBoundary,
  quarantineExecutionLock,
  releaseExecutionLock,
  renewExecutionLock,
  type ExecutionLockFencingToken,
  type ExecutionLockInfo,
  type ExecutionLockOptions,
  type ExecutionLockQuarantineInfo,
  type ExecutionLockQuarantineReason,
} from './file-lock.js';

const MAX_ADMISSION_DETAIL_CODE_BYTES = 128;
const ADMISSION_DETAIL_CODE_PATTERN = /^[A-Za-z0-9._:-]+$/u;
const MAX_ADMISSION_EVIDENCE_REFS = 16;
const MAX_ADMISSION_REQUEST_EVIDENCE_REFS = 8;
const MAX_ADMISSION_REVALIDATION_EVIDENCE_REFS = 2;
const MAX_ADMISSION_RECOVERY_EVIDENCE_REFS = 2;
const MAX_ADMISSION_PHASE_EVIDENCE_REFS = 2;
const MAX_ADMISSION_BOUNDARY_EVIDENCE_REFS = 12;
const MAX_ADMISSION_EVIDENCE_REF_BYTES = 1_024;
const MAX_ADMISSION_EVIDENCE_TOTAL_BYTES = 8_192;
const MAX_ADMISSION_REQUEST_EVIDENCE_BYTES = 3_072;
const MAX_ADMISSION_REVALIDATION_EVIDENCE_BYTES = 1_024;
const MAX_ADMISSION_RECOVERY_EVIDENCE_BYTES = 1_024;
const MAX_ADMISSION_PHASE_EVIDENCE_BYTES = 1_024;
const MAX_ADMISSION_BOUNDARY_EVIDENCE_BYTES = 5_120;
const MAX_ADMISSION_PRE_DISPATCH_EVIDENCE_REFS = 14;
const MAX_ADMISSION_PRE_DISPATCH_EVIDENCE_BYTES = 6_144;

export type TaskExecutionAdmissionPhase =
  | 'acquire'
  | 'revalidate'
  | 'recovery-intent'
  | 'boundary'
  | 'prepare'
  | 'dispatch'
  | 'persist-dispatched'
  | 'verify-dispatched'
  | 'complete'
  | 'release';

export type TaskExecutionProcessState =
  | 'not-started'
  | 'adopted'
  | 'possibly-started'
  | 'dispatch-returned';

export interface TaskExecutionAdmissionRequest {
  readonly projectRoot: string;
  readonly taskId: string;
  readonly boundaryEvidenceRefs: readonly string[];
  readonly lockOptions?: ExecutionLockOptions;
}

export type TaskExecutionAdmissionRevalidation<T> =
  | {
    readonly decision: 'dispatch';
    readonly evidenceRefs: readonly string[];
  }
  | {
    readonly decision: 'adopt';
    readonly value: T;
    readonly evidenceRefs: readonly string[];
  }
  | {
    readonly decision: 'hold';
    readonly detailCode: string;
    readonly evidenceRefs: readonly string[];
  };

export interface TaskExecutionAdmissionHookContext {
  readonly taskId: string;
  readonly fencingToken: ExecutionLockFencingToken;
  readonly recoveryEvidenceRefs: readonly string[];
  readonly boundaryId?: string;
  readonly signal: AbortSignal;
  readonly phase: TaskExecutionAdmissionPhase;
  assertAuthority(): void;
}

export interface TaskExecutionAdmissionSyncHooks<T> {
  revalidate(
    context: TaskExecutionAdmissionHookContext,
  ): TaskExecutionAdmissionRevalidation<T>;
  /**
   * Persist a stable, exact-fence recovery locator before the durable
   * irreversible boundary is entered. The referenced journal must carry the
   * process idempotency identity needed to reconcile a coordinator crash.
   */
  persistRecoveryIntent(
    context: TaskExecutionAdmissionHookContext,
  ): readonly string[];
  verifyRecoveryIntent(
    evidenceRefs: readonly string[],
    context: TaskExecutionAdmissionHookContext,
  ): boolean;
  verifyAdopted?(
    value: T,
    evidenceRefs: readonly string[],
    context: TaskExecutionAdmissionHookContext,
  ): boolean;
  /**
   * Persist the caller-owned dispatch intent/projection after the durable
   * in-flight boundary exists and before the sole process-creation callback.
   */
  persistPrepared(
    context: TaskExecutionAdmissionHookContext,
  ): readonly string[];
  /** The sole callback in this admission that may create a process/container. */
  dispatch(context: TaskExecutionAdmissionHookContext): T;
  /**
   * Persist caller-owned post-dispatch evidence. Returning without at least
   * one bounded evidence reference is treated as uncertain dispatch.
   */
  persistDispatched(
    value: T,
    context: TaskExecutionAdmissionHookContext,
  ): readonly string[];
  verifyDispatched(
    value: T,
    evidenceRefs: readonly string[],
    context: TaskExecutionAdmissionHookContext,
  ): boolean;
}

type MaybePromise<T> = T | Promise<T>;

export interface TaskExecutionAdmissionAsyncHooks<T> {
  revalidate(
    context: TaskExecutionAdmissionHookContext,
  ): MaybePromise<TaskExecutionAdmissionRevalidation<T>>;
  persistRecoveryIntent(
    context: TaskExecutionAdmissionHookContext,
  ): MaybePromise<readonly string[]>;
  verifyRecoveryIntent(
    evidenceRefs: readonly string[],
    context: TaskExecutionAdmissionHookContext,
  ): MaybePromise<boolean>;
  verifyAdopted?(
    value: T,
    evidenceRefs: readonly string[],
    context: TaskExecutionAdmissionHookContext,
  ): MaybePromise<boolean>;
  persistPrepared(
    context: TaskExecutionAdmissionHookContext,
  ): MaybePromise<readonly string[]>;
  dispatch(context: TaskExecutionAdmissionHookContext): MaybePromise<T>;
  persistDispatched(
    value: T,
    context: TaskExecutionAdmissionHookContext,
  ): MaybePromise<readonly string[]>;
  verifyDispatched(
    value: T,
    evidenceRefs: readonly string[],
    context: TaskExecutionAdmissionHookContext,
  ): MaybePromise<boolean>;
}

export type TaskExecutionAdmissionOutcome<T> =
  | {
    readonly state: 'held';
    readonly phase: Extract<
      TaskExecutionAdmissionPhase,
      'acquire' | 'revalidate' | 'release'
    >;
    readonly processState: 'not-started';
    readonly detailCode: string;
    readonly evidenceRefs: readonly string[];
  }
  | {
    readonly state: 'adopted';
    readonly phase: 'release';
    readonly processState: 'adopted';
    readonly value: T;
    readonly evidenceRefs: readonly string[];
  }
  | {
    readonly state: 'dispatched';
    readonly phase: 'complete';
    readonly processState: 'dispatch-returned';
    readonly value: T;
    readonly fencingToken: ExecutionLockFencingToken;
    readonly quarantineId: string;
    readonly projectionCleanup: 'completed' | 'uncertain';
    readonly evidenceRefs: readonly string[];
  }
  | {
    readonly state: 'quarantined';
    readonly phase: TaskExecutionAdmissionPhase;
    readonly processState: Exclude<TaskExecutionProcessState, 'adopted'>;
    readonly detailCode: string;
    readonly lock: ExecutionLockInfo;
    readonly quarantine: ExecutionLockQuarantineInfo;
    readonly evidenceRefs: readonly string[];
  }
  | {
    readonly state: 'in-flight';
    readonly phase: TaskExecutionAdmissionPhase;
    readonly processState: Exclude<TaskExecutionProcessState, 'adopted'>;
    readonly detailCode: string;
    readonly lock: ExecutionLockInfo;
    readonly boundary: ExecutionLockQuarantineInfo;
    readonly evidenceRefs: readonly string[];
  }
  | {
    readonly state: 'uncertain';
    readonly phase: TaskExecutionAdmissionPhase;
    readonly processState: TaskExecutionProcessState;
    readonly detailCode: string;
    readonly lock?: ExecutionLockInfo;
    readonly evidenceRefs: readonly string[];
  };

interface MutableAdmissionState {
  lock: ExecutionLockInfo;
  phase: TaskExecutionAdmissionPhase;
  boundary?: ExecutionLockQuarantineInfo;
  recoveryEvidenceRefs: readonly string[];
  processState: Exclude<TaskExecutionProcessState, 'adopted'>;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' && value !== null)
    || typeof value === 'function'
  ) && typeof (value as { then?: unknown }).then === 'function';
}

function requireSync<T>(
  value: T,
  phase: TaskExecutionAdmissionPhase,
): Exclude<T, PromiseLike<unknown>> {
  if (isThenable(value)) {
    // A sync hook returning a rejected Promise is a contract violation, but
    // abandoning that Promise would surface a second, unhandled rejection
    // after admission has already quarantined the boundary.
    try {
      void Promise.resolve(value).catch(() => undefined);
    } catch {
      // A hostile thenable may throw while being assimilated. The typed sync
      // contract error below remains the sole admission outcome.
    }
    const error = new Error('E_TASK_EXECUTION_ADMISSION_SYNC_THENABLE');
    Object.assign(error, {
      code: 'E_TASK_EXECUTION_ADMISSION_SYNC_THENABLE',
      phase,
    });
    throw error;
  }
  return value as Exclude<T, PromiseLike<unknown>>;
}

function detailCode(error: unknown): string {
  const candidate = error instanceof ExecutionLockError
    ? `execution-lock:${error.reason}`
    : error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : 'E_TASK_EXECUTION_ADMISSION_OPERATION_FAILED';
  return validDetailCode(candidate)
    ? candidate
    : 'E_TASK_EXECUTION_ADMISSION_OPERATION_FAILED';
}

function validDetailCode(value: unknown): value is string {
  return typeof value === 'string'
    && ADMISSION_DETAIL_CODE_PATTERN.test(value)
    && Buffer.byteLength(value, 'utf8') <= MAX_ADMISSION_DETAIL_CODE_BYTES;
}

function validatedEvidenceRefs(
  refs: readonly string[],
  options: {
    readonly allowEmpty?: boolean;
    readonly maxRefs?: number;
    readonly maxTotalBytes?: number;
    readonly code?: string;
  } = {},
): readonly string[] {
  const code =
    options.code ?? 'E_TASK_EXECUTION_ADMISSION_EVIDENCE_INVALID';
  if (!Array.isArray(refs)) {
    throw Object.assign(new Error(code), { code });
  }
  const maxRefs = options.maxRefs ?? MAX_ADMISSION_EVIDENCE_REFS;
  const maxTotalBytes =
    options.maxTotalBytes ?? MAX_ADMISSION_EVIDENCE_TOTAL_BYTES;
  if (refs.length > maxRefs
    || (options.allowEmpty !== true && refs.length === 0)) {
    throw Object.assign(new Error(code), { code });
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  const normalized: string[] = [];
  for (const ref of refs) {
    if (typeof ref !== 'string'
      || ref.trim() !== ref
      || ref.length === 0
      || ref.includes('\0')) {
      throw Object.assign(new Error(code), { code });
    }
    const bytes = Buffer.byteLength(ref, 'utf8');
    totalBytes += bytes;
    if (bytes > MAX_ADMISSION_EVIDENCE_REF_BYTES
      || totalBytes > maxTotalBytes
      || seen.has(ref)) {
      throw Object.assign(new Error(code), { code });
    }
    seen.add(ref);
    normalized.push(ref);
  }
  return normalized.sort();
}

function mergeEvidenceRefs(
  groups: readonly (readonly string[])[],
  options: {
    readonly allowEmpty?: boolean;
    readonly maxRefs?: number;
    readonly maxTotalBytes?: number;
    readonly code?: string;
  } = {},
): readonly string[] {
  return validatedEvidenceRefs(groups.flat(), options);
}

function safeOutcomeEvidenceRefs(
  refs: readonly string[],
): readonly string[] {
  try {
    return validatedEvidenceRefs(refs, { allowEmpty: true });
  } catch {
    return [
      `admission-evidence-sha256:${createHash('sha256')
        .update(JSON.stringify(refs))
        .digest('hex')}`,
    ];
  }
}

function stableAdmissionRequest(
  request: TaskExecutionAdmissionRequest,
): TaskExecutionAdmissionRequest {
  const lockOptions = request.lockOptions
    ? Object.freeze({
      ...request.lockOptions,
      ...(request.lockOptions.runtimeIdentity
        ? {
          runtimeIdentity: Object.freeze({
            ...request.lockOptions.runtimeIdentity,
          }),
        }
        : {}),
    })
    : undefined;
  return Object.freeze({
    projectRoot: request.projectRoot,
    taskId: request.taskId,
    boundaryEvidenceRefs: Array.isArray(request.boundaryEvidenceRefs)
      ? Object.freeze([...request.boundaryEvidenceRefs])
      : request.boundaryEvidenceRefs,
    ...(lockOptions ? { lockOptions } : {}),
  });
}

function failureEvidenceRef(
  phase: TaskExecutionAdmissionPhase,
  code: string,
  evidenceRefs: readonly string[],
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      phase,
      code,
      evidenceRefs: safeOutcomeEvidenceRefs(evidenceRefs),
    }))
    .digest('hex');
  return `admission-failure-sha256:${digest}`;
}

function hookContext(
  request: TaskExecutionAdmissionRequest,
  state: MutableAdmissionState,
  signal: AbortSignal,
): TaskExecutionAdmissionHookContext {
  return {
    taskId: request.taskId,
    fencingToken: state.lock.fencingToken,
    recoveryEvidenceRefs: state.recoveryEvidenceRefs,
    ...(state.boundary
      ? { boundaryId: state.boundary.quarantineId }
      : {}),
    signal,
    phase: state.phase,
    assertAuthority: () => {
      assertExecutionLockAuthority(
        request.projectRoot,
        state.lock,
        request.lockOptions,
      );
    },
  };
}

function exactGeneration(
  left: Pick<ExecutionLockInfo, 'taskId' | 'ownerId' | 'fencingToken'>,
  right: Pick<ExecutionLockInfo, 'taskId' | 'ownerId' | 'fencingToken'>,
): boolean {
  return left.taskId === right.taskId
    && left.ownerId === right.ownerId
    && left.fencingToken.epoch === right.fencingToken.epoch
    && left.fencingToken.counter === right.fencingToken.counter
    && left.fencingToken.nonce === right.fencingToken.nonce;
}

function inspectedQuarantine(
  request: TaskExecutionAdmissionRequest,
  state: MutableAdmissionState,
): ExecutionLockQuarantineInfo | undefined {
  const inspected = checkExecutionLock(request.projectRoot, request.taskId);
  if (inspected.state === 'quarantined'
    && exactGeneration(inspected.lock, state.lock)) {
    // Renewal can commit canonical state and still surface a projection fault.
    // Refresh the full-JSON exact handle before any follow-up CAS.
    state.lock = inspected.lock;
    state.boundary = inspected.quarantine;
    return inspected.quarantine;
  }
  return undefined;
}

function releaseBeforeBoundary(
  request: TaskExecutionAdmissionRequest,
  state: MutableAdmissionState,
): boolean {
  try {
    if (releaseExecutionLock(
      request.projectRoot,
      request.taskId,
      state.lock.ownerId,
      request.lockOptions,
    )) {
      return true;
    }
  } catch {
    // A committed release can still surface a projection-cleanup fault.
  }
  return checkExecutionLock(request.projectRoot, request.taskId).state === 'absent';
}

function heldOutcome<T>(
  phase: Extract<
    TaskExecutionAdmissionPhase,
    'acquire' | 'revalidate' | 'release'
  >,
  code: string,
  evidenceRefs: readonly string[],
): TaskExecutionAdmissionOutcome<T> {
  return {
    state: 'held',
    phase,
    processState: 'not-started',
    detailCode: validDetailCode(code)
      ? code
      : 'E_TASK_EXECUTION_ADMISSION_HELD',
    evidenceRefs: safeOutcomeEvidenceRefs(evidenceRefs),
  };
}

function uncertainOutcome<T>(
  state: MutableAdmissionState | undefined,
  phase: TaskExecutionAdmissionPhase,
  processState: TaskExecutionProcessState,
  code: string,
  evidenceRefs: readonly string[],
): TaskExecutionAdmissionOutcome<T> {
  return {
    state: 'uncertain',
    phase,
    processState,
    detailCode: validDetailCode(code)
      ? code
      : 'E_TASK_EXECUTION_ADMISSION_AUTHORITY_UNCERTAIN',
    ...(state ? { lock: state.lock } : {}),
    evidenceRefs: safeOutcomeEvidenceRefs(evidenceRefs),
  };
}

function quarantineAfterBoundary<T>(
  request: TaskExecutionAdmissionRequest,
  state: MutableAdmissionState,
  error: unknown,
  evidenceRefs: readonly string[],
  reason: ExecutionLockQuarantineReason = 'authority-uncertain',
): TaskExecutionAdmissionOutcome<T> {
  const code = detailCode(error);
  inspectedQuarantine(request, state);
  const failureEvidence = [
    failureEvidenceRef(state.phase, code, evidenceRefs),
  ];
  try {
    const quarantine = quarantineExecutionLock(
      request.projectRoot,
      state.lock,
      {
        reason,
        evidenceRefs: failureEvidence,
      },
      request.lockOptions,
    );
    return {
      state: 'quarantined',
      phase: state.phase as Exclude<
        TaskExecutionAdmissionPhase,
        'acquire' | 'revalidate' | 'release'
      >,
      processState: state.processState,
      detailCode: code,
      lock: quarantine.lock,
      quarantine,
      evidenceRefs: quarantine.evidenceRefs,
    };
  } catch {
    const quarantine = inspectedQuarantine(request, state);
    if (quarantine?.state === 'quarantined') {
      return {
        state: 'quarantined',
        phase: state.phase as Exclude<
          TaskExecutionAdmissionPhase,
          'acquire' | 'revalidate' | 'release'
        >,
        processState: state.processState,
        detailCode: code,
        lock: quarantine.lock,
        quarantine,
        evidenceRefs: quarantine.evidenceRefs,
      };
    }
    if (quarantine?.state === 'in-flight') {
      return {
        state: 'in-flight',
        phase: state.phase as Exclude<
          TaskExecutionAdmissionPhase,
          'acquire' | 'revalidate' | 'release'
        >,
        processState: state.processState,
        detailCode: code,
        lock: quarantine.lock,
        boundary: quarantine,
        evidenceRefs: quarantine.evidenceRefs,
      };
    }
    return uncertainOutcome(
      state,
      state.phase,
      state.processState,
      code,
      failureEvidence,
    );
  }
}

function validateRevalidation<T>(
  value: TaskExecutionAdmissionRevalidation<T>,
): TaskExecutionAdmissionRevalidation<T> {
  if (!value || typeof value !== 'object' || !('decision' in value)) {
    throw Object.assign(
      new Error('E_TASK_EXECUTION_ADMISSION_REVALIDATION_INVALID'),
      { code: 'E_TASK_EXECUTION_ADMISSION_REVALIDATION_INVALID' },
    );
  }
  if (value.decision !== 'dispatch'
    && value.decision !== 'adopt'
    && value.decision !== 'hold') {
    throw Object.assign(
      new Error('E_TASK_EXECUTION_ADMISSION_REVALIDATION_INVALID'),
      { code: 'E_TASK_EXECUTION_ADMISSION_REVALIDATION_INVALID' },
    );
  }
  if (!Array.isArray(value.evidenceRefs)) {
    throw Object.assign(
      new Error('E_TASK_EXECUTION_ADMISSION_REVALIDATION_INVALID'),
      { code: 'E_TASK_EXECUTION_ADMISSION_REVALIDATION_INVALID' },
    );
  }
  validatedEvidenceRefs(value.evidenceRefs, {
    allowEmpty: value.decision !== 'adopt',
    maxRefs: MAX_ADMISSION_REVALIDATION_EVIDENCE_REFS,
    maxTotalBytes: MAX_ADMISSION_REVALIDATION_EVIDENCE_BYTES,
    code: 'E_TASK_EXECUTION_ADMISSION_REVALIDATION_EVIDENCE_INVALID',
  });
  if (value.decision === 'hold' && !validDetailCode(value.detailCode)) {
    throw Object.assign(
      new Error('E_TASK_EXECUTION_ADMISSION_REVALIDATION_INVALID'),
      { code: 'E_TASK_EXECUTION_ADMISSION_REVALIDATION_INVALID' },
    );
  }
  return value;
}

function acquireState<T>(
  request: TaskExecutionAdmissionRequest,
): MutableAdmissionState | TaskExecutionAdmissionOutcome<T> {
  try {
    validatedEvidenceRefs(request.boundaryEvidenceRefs, {
      maxRefs: MAX_ADMISSION_REQUEST_EVIDENCE_REFS,
      maxTotalBytes: MAX_ADMISSION_REQUEST_EVIDENCE_BYTES,
      code: 'E_TASK_EXECUTION_ADMISSION_BOUNDARY_EVIDENCE_INVALID',
    });
    return {
      lock: acquireExecutionLock(
        request.projectRoot,
        request.taskId,
        'dispatch',
        request.lockOptions,
      ),
      phase: 'revalidate',
      recoveryEvidenceRefs: Object.freeze([]),
      processState: 'not-started',
    };
  } catch (error) {
    if (error instanceof ExecutionLockError) {
      const inspected = checkExecutionLock(
        request.projectRoot,
        request.taskId,
      );
      if (inspected.state === 'quarantined') {
        const common = {
          phase: 'acquire' as const,
          processState: 'possibly-started' as const,
          detailCode: detailCode(error),
          lock: inspected.lock,
          evidenceRefs: inspected.quarantine.evidenceRefs,
        };
        return inspected.quarantine.state === 'in-flight'
          ? {
            state: 'in-flight',
            ...common,
            boundary: inspected.quarantine,
          }
          : {
            state: 'quarantined',
            ...common,
            quarantine: inspected.quarantine,
          };
      }
      if (error.recoveryLock) {
        return uncertainOutcome(
          {
            lock: error.recoveryLock,
            phase: 'acquire',
            recoveryEvidenceRefs: Object.freeze([]),
            processState: 'not-started',
          },
          'acquire',
          'not-started',
          detailCode(error),
          request.boundaryEvidenceRefs,
        );
      }
    }
    return heldOutcome(
      'acquire',
      detailCode(error),
      request.boundaryEvidenceRefs,
    );
  }
}

function handlePreBoundaryFailure<T>(
  request: TaskExecutionAdmissionRequest,
  state: MutableAdmissionState,
  error: unknown,
  evidenceRefs: readonly string[],
): TaskExecutionAdmissionOutcome<T> {
  const code = detailCode(error);
  if (releaseBeforeBoundary(request, state)) {
    return heldOutcome('revalidate', code, evidenceRefs);
  }
  return uncertainOutcome(
    state,
    'release',
    'not-started',
    code,
    evidenceRefs,
  );
}

function handleBoundaryEntryFailure<T>(
  request: TaskExecutionAdmissionRequest,
  state: MutableAdmissionState,
  error: unknown,
  evidenceRefs: readonly string[],
): TaskExecutionAdmissionOutcome<T> {
  const quarantine = inspectedQuarantine(request, state);
  if (quarantine) {
    state.boundary = quarantine;
    return quarantineAfterBoundary(request, state, error, evidenceRefs);
  }
  return handlePreBoundaryFailure(request, state, error, evidenceRefs);
}

function adoptOrHold<T>(
  request: TaskExecutionAdmissionRequest,
  state: MutableAdmissionState,
  revalidation: Exclude<
    TaskExecutionAdmissionRevalidation<T>,
    { readonly decision: 'dispatch' }
  >,
): TaskExecutionAdmissionOutcome<T> {
  let evidenceRefs: readonly string[];
  try {
    evidenceRefs = mergeEvidenceRefs([
      request.boundaryEvidenceRefs,
      revalidation.evidenceRefs,
    ]);
  } catch (error) {
    if (!releaseBeforeBoundary(request, state)) {
      return uncertainOutcome(
        state,
        'release',
        revalidation.decision === 'adopt' ? 'adopted' : 'not-started',
        detailCode(error),
        request.boundaryEvidenceRefs,
      );
    }
    return heldOutcome(
      'revalidate',
      detailCode(error),
      request.boundaryEvidenceRefs,
    );
  }
  if (!releaseBeforeBoundary(request, state)) {
    return uncertainOutcome(
      state,
      'release',
      revalidation.decision === 'adopt' ? 'adopted' : 'not-started',
      'E_TASK_EXECUTION_ADMISSION_RELEASE_UNCERTAIN',
      evidenceRefs,
    );
  }
  if (revalidation.decision === 'hold') {
    return heldOutcome(
      'revalidate',
      revalidation.detailCode,
      evidenceRefs,
    );
  }
  return {
    state: 'adopted',
    phase: 'release',
    processState: 'adopted',
    value: revalidation.value,
    evidenceRefs,
  };
}

/**
 * Synchronous exactly-once process admission. Every hook must be truly
 * synchronous; a thenable is rejected at runtime and can never escape as a
 * falsely completed dispatch.
 */
export function executeTaskExecutionAdmissionSync<T>(
  request: TaskExecutionAdmissionRequest,
  hooks: TaskExecutionAdmissionSyncHooks<T>,
): TaskExecutionAdmissionOutcome<T> {
  request = stableAdmissionRequest(request);
  const acquired = acquireState<T>(request);
  if ('state' in acquired) return acquired;
  const state = acquired;
  const abortController = new AbortController();
  let revalidation: TaskExecutionAdmissionRevalidation<T>;
  try {
    revalidation = validateRevalidation(requireSync(
      hooks.revalidate(hookContext(request, state, abortController.signal)),
      'revalidate',
    ));
  } catch (error) {
    return handlePreBoundaryFailure(
      request,
      state,
      error,
      request.boundaryEvidenceRefs,
    );
  }
  if (revalidation.decision === 'adopt') {
    try {
      const adoptionEvidence = mergeEvidenceRefs([
        request.boundaryEvidenceRefs,
        revalidation.evidenceRefs,
      ]);
      const verifier = hooks.verifyAdopted;
      const verified = verifier
        ? requireSync(
          verifier(
            revalidation.value,
            adoptionEvidence,
            hookContext(request, state, abortController.signal),
          ),
          'revalidate',
        )
        : false;
      if (verified !== true) {
        throw Object.assign(
          new Error('E_TASK_EXECUTION_ADMISSION_ADOPTION_UNVERIFIED'),
          { code: 'E_TASK_EXECUTION_ADMISSION_ADOPTION_UNVERIFIED' },
        );
      }
    } catch (error) {
      return handlePreBoundaryFailure(
        request,
        state,
        error,
        request.boundaryEvidenceRefs,
      );
    }
  }
  if (revalidation.decision !== 'dispatch') {
    return adoptOrHold(request, state, revalidation);
  }

  let recoveryEvidence: readonly string[];
  state.phase = 'recovery-intent';
  try {
    recoveryEvidence = validatedEvidenceRefs(requireSync(
      hooks.persistRecoveryIntent(
        hookContext(request, state, abortController.signal),
      ),
      'recovery-intent',
    ), {
      maxRefs: MAX_ADMISSION_RECOVERY_EVIDENCE_REFS,
      maxTotalBytes: MAX_ADMISSION_RECOVERY_EVIDENCE_BYTES,
      code: 'E_TASK_EXECUTION_ADMISSION_RECOVERY_EVIDENCE_INVALID',
    });
    const verified = requireSync(
      hooks.verifyRecoveryIntent(
        recoveryEvidence,
        hookContext(request, state, abortController.signal),
      ),
      'recovery-intent',
    );
    if (verified !== true) {
      throw Object.assign(
        new Error('E_TASK_EXECUTION_ADMISSION_RECOVERY_EVIDENCE_UNVERIFIED'),
        { code: 'E_TASK_EXECUTION_ADMISSION_RECOVERY_EVIDENCE_UNVERIFIED' },
      );
    }
    state.recoveryEvidenceRefs = recoveryEvidence;
  } catch (error) {
    return handlePreBoundaryFailure(
      request,
      state,
      error,
      request.boundaryEvidenceRefs,
    );
  }

  let boundaryEvidence: readonly string[];
  try {
    boundaryEvidence = mergeEvidenceRefs(
      [
        request.boundaryEvidenceRefs,
        revalidation.evidenceRefs,
        recoveryEvidence,
      ],
      {
        maxRefs: MAX_ADMISSION_BOUNDARY_EVIDENCE_REFS,
        maxTotalBytes: MAX_ADMISSION_BOUNDARY_EVIDENCE_BYTES,
      },
    );
  } catch (error) {
    return handlePreBoundaryFailure(
      request,
      state,
      error,
      request.boundaryEvidenceRefs,
    );
  }
  state.phase = 'boundary';
  try {
    state.lock = renewExecutionLock(
      request.projectRoot,
      request.taskId,
      state.lock.ownerId,
      request.lockOptions,
    );
    state.boundary = beginExecutionLockIrreversibleBoundary(
      request.projectRoot,
      state.lock,
      { evidenceRefs: boundaryEvidence },
      request.lockOptions,
    );
  } catch (error) {
    return handleBoundaryEntryFailure(
      request,
      state,
      error,
      boundaryEvidence,
    );
  }

  let preparedEvidence: readonly string[] = [];
  let dispatchedEvidence: readonly string[] = [];
  state.phase = 'prepare';
  try {
    preparedEvidence = validatedEvidenceRefs(requireSync(
      hooks.persistPrepared(
        hookContext(request, state, abortController.signal),
      ),
      'prepare',
    ), {
      maxRefs: MAX_ADMISSION_PHASE_EVIDENCE_REFS,
      maxTotalBytes: MAX_ADMISSION_PHASE_EVIDENCE_BYTES,
      code: 'E_TASK_EXECUTION_ADMISSION_PREPARED_EVIDENCE_INVALID',
    });
    mergeEvidenceRefs(
      [boundaryEvidence, preparedEvidence],
      {
        maxRefs: MAX_ADMISSION_PRE_DISPATCH_EVIDENCE_REFS,
        maxTotalBytes: MAX_ADMISSION_PRE_DISPATCH_EVIDENCE_BYTES,
        code: 'E_TASK_EXECUTION_ADMISSION_PREPARED_EVIDENCE_INVALID',
      },
    );
    state.phase = 'dispatch';
    state.processState = 'possibly-started';
    const value = requireSync(
      hooks.dispatch(hookContext(request, state, abortController.signal)),
      'dispatch',
    ) as T;
    state.processState = 'dispatch-returned';
    state.phase = 'persist-dispatched';
    dispatchedEvidence = validatedEvidenceRefs(requireSync(
      hooks.persistDispatched(
        value,
        hookContext(request, state, abortController.signal),
      ),
      'persist-dispatched',
    ), {
      maxRefs: MAX_ADMISSION_PHASE_EVIDENCE_REFS,
      maxTotalBytes: MAX_ADMISSION_PHASE_EVIDENCE_BYTES,
      code: 'E_TASK_EXECUTION_ADMISSION_DISPATCH_EVIDENCE_INVALID',
    });
    state.phase = 'verify-dispatched';
    const verified = requireSync(
      hooks.verifyDispatched(
        value,
        dispatchedEvidence,
        hookContext(request, state, abortController.signal),
      ),
      'verify-dispatched',
    );
    if (verified !== true) {
      throw Object.assign(
        new Error('E_TASK_EXECUTION_ADMISSION_DISPATCH_EVIDENCE_UNVERIFIED'),
        { code: 'E_TASK_EXECUTION_ADMISSION_DISPATCH_EVIDENCE_UNVERIFIED' },
      );
    }
    const completionEvidence = mergeEvidenceRefs([
      boundaryEvidence,
      preparedEvidence,
      dispatchedEvidence,
    ]);
    state.phase = 'complete';
    const completion = completeExecutionLockIrreversibleBoundary(
      request.projectRoot,
      state.lock,
      {
        quarantineId: state.boundary.quarantineId,
        evidenceRefs: completionEvidence,
      },
      request.lockOptions,
    );
    return {
      state: 'dispatched',
      phase: 'complete',
      processState: 'dispatch-returned',
      value,
      fencingToken: state.lock.fencingToken,
      quarantineId: completion.completed.quarantineId,
      projectionCleanup: completion.projectionCleanup,
      evidenceRefs: completionEvidence,
    };
  } catch (error) {
    return quarantineAfterBoundary(
      request,
      state,
      error,
      safeOutcomeEvidenceRefs([
        ...boundaryEvidence,
        ...preparedEvidence,
        ...dispatchedEvidence,
      ]),
    );
  }
}

interface ScheduledAdmissionHeartbeat {
  readonly id: number;
  readonly intervalMs: number;
  nextDueMs: number;
  active: boolean;
  failed: boolean;
  error: unknown;
  renew(): void;
  onFailure(error: unknown): void;
}

class AdmissionHeartbeatScheduler {
  private readonly heap: ScheduledAdmissionHeartbeat[] = [];
  private readonly active = new Map<number, ScheduledAdmissionHeartbeat>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private scheduledForMs: number | undefined;
  private nextId = 1;

  register(input: {
    readonly taskKey: string;
    readonly intervalMs: number;
    readonly renew: () => void;
    readonly onFailure: (error: unknown) => void;
  }): {
    stop(): void;
    failure(): { readonly failed: boolean; readonly error: unknown };
  } {
    const id = this.nextId;
    this.nextId += 1;
    const jitter = createHash('sha256')
      .update(input.taskKey)
      .digest()
      .readUInt16BE(0) % 400;
    const initialDelay = Math.max(
      1,
      Math.floor(input.intervalMs * (0.5 + (jitter / 1_000))),
    );
    const entry: ScheduledAdmissionHeartbeat = {
      id,
      intervalMs: input.intervalMs,
      nextDueMs: Date.now() + initialDelay,
      active: true,
      failed: false,
      error: undefined,
      renew: input.renew,
      onFailure: input.onFailure,
    };
    this.active.set(id, entry);
    this.push(entry);
    this.schedule();
    return {
      stop: () => {
        if (!entry.active) return;
        entry.active = false;
        this.active.delete(entry.id);
        if (this.active.size === 0) {
          if (this.timer) clearTimeout(this.timer);
          this.timer = undefined;
          this.scheduledForMs = undefined;
          this.heap.length = 0;
        } else if (this.peekActive()?.id !== entry.id) {
          // A lazy heap tombstone is removed when it reaches the root.
        } else {
          this.schedule(true);
        }
      },
      failure: () => ({ failed: entry.failed, error: entry.error }),
    };
  }

  diagnostics(): {
    readonly activeEntries: number;
    readonly heapEntries: number;
    readonly timerScheduled: boolean;
  } {
    return {
      activeEntries: this.active.size,
      heapEntries: this.heap.length,
      timerScheduled: this.timer !== undefined,
    };
  }

  private compare(
    left: ScheduledAdmissionHeartbeat,
    right: ScheduledAdmissionHeartbeat,
  ): number {
    return left.nextDueMs - right.nextDueMs || left.id - right.id;
  }

  private push(entry: ScheduledAdmissionHeartbeat): void {
    this.heap.push(entry);
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[parent]!, entry) <= 0) break;
      this.heap[index] = this.heap[parent]!;
      index = parent;
    }
    this.heap[index] = entry;
  }

  private pop(): ScheduledAdmissionHeartbeat | undefined {
    const first = this.heap[0];
    const last = this.heap.pop();
    if (!first || !last || this.heap.length === 0) return first;
    let index = 0;
    while (true) {
      const left = (index * 2) + 1;
      if (left >= this.heap.length) break;
      const right = left + 1;
      const child = right < this.heap.length
        && this.compare(this.heap[right]!, this.heap[left]!) < 0
        ? right
        : left;
      if (this.compare(last, this.heap[child]!) <= 0) break;
      this.heap[index] = this.heap[child]!;
      index = child;
    }
    this.heap[index] = last;
    return first;
  }

  private peekActive(): ScheduledAdmissionHeartbeat | undefined {
    while (this.heap[0] && !this.heap[0].active) this.pop();
    return this.heap[0];
  }

  private schedule(force = false): void {
    const next = this.peekActive();
    if (!next) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      this.scheduledForMs = undefined;
      return;
    }
    if (!force
      && this.timer
      && this.scheduledForMs !== undefined
      && this.scheduledForMs <= next.nextDueMs) {
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.max(0, next.nextDueMs - Date.now());
    this.scheduledForMs = next.nextDueMs;
    this.timer = setTimeout(() => this.tick(), delay);
    this.timer.unref();
  }

  private tick(): void {
    this.timer = undefined;
    this.scheduledForMs = undefined;
    let nowMs = Date.now();
    while (true) {
      const entry = this.peekActive();
      if (!entry || entry.nextDueMs > nowMs) break;
      this.pop();
      if (!entry.active) continue;
      try {
        entry.renew();
      } catch (error) {
        entry.failed = true;
        entry.error = error;
        entry.active = false;
        this.active.delete(entry.id);
        entry.onFailure(error);
        nowMs = Date.now();
        continue;
      }
      if (entry.active) {
        entry.nextDueMs = Date.now() + entry.intervalMs;
        this.push(entry);
      }
      nowMs = Date.now();
    }
    this.schedule();
  }
}

const admissionHeartbeatScheduler = new AdmissionHeartbeatScheduler();

/** @internal Deterministic timer-leak/scale proof seam. */
export function __taskExecutionAdmissionHeartbeatDiagnosticsForTests(): {
  readonly activeEntries: number;
  readonly heapEntries: number;
  readonly timerScheduled: boolean;
} {
  return admissionHeartbeatScheduler.diagnostics();
}

function startHeartbeat(
  request: TaskExecutionAdmissionRequest,
  state: MutableAdmissionState,
  abortController: AbortController,
): {
  stop(): void;
  failure(): { readonly failed: boolean; readonly error: unknown };
} {
  const leaseDurationMs = request.lockOptions?.leaseDurationMs ?? 30_000;
  const heartbeatIntervalMs =
    request.lockOptions?.heartbeatIntervalMs ?? 10_000;
  if (!Number.isSafeInteger(heartbeatIntervalMs)
    || heartbeatIntervalMs <= 0
    || (heartbeatIntervalMs * 3) > leaseDurationMs) {
    const error = new Error('E_TASK_EXECUTION_ADMISSION_HEARTBEAT_INVALID');
    Object.assign(error, {
      code: 'E_TASK_EXECUTION_ADMISSION_HEARTBEAT_INVALID',
    });
    return {
      stop: () => {},
      failure: () => ({ failed: true, error }),
    };
  }
  return admissionHeartbeatScheduler.register({
    taskKey: `${request.projectRoot}\u0000${request.taskId}`,
    intervalMs: heartbeatIntervalMs,
    renew: () => {
      state.lock = renewExecutionLock(
        request.projectRoot,
        request.taskId,
        state.lock.ownerId,
        request.lockOptions,
      );
    },
    onFailure: error => {
      abortController.abort(error);
    },
  });
}

/**
 * Asynchronous exactly-once process admission with a leased heartbeat before
 * and during the irreversible boundary. A post-boundary failure never becomes
 * an ordinary retry.
 */
export async function executeTaskExecutionAdmission<T>(
  request: TaskExecutionAdmissionRequest,
  hooks: TaskExecutionAdmissionAsyncHooks<T>,
): Promise<TaskExecutionAdmissionOutcome<T>> {
  request = stableAdmissionRequest(request);
  const acquired = acquireState<T>(request);
  if ('state' in acquired) return acquired;
  const state = acquired;
  const abortController = new AbortController();
  const heartbeat = startHeartbeat(request, state, abortController);
  let heartbeatFault = heartbeat.failure();
  if (heartbeatFault.failed) {
    return handlePreBoundaryFailure(
      request,
      state,
      heartbeatFault.error,
      request.boundaryEvidenceRefs,
    );
  }

  let revalidation: TaskExecutionAdmissionRevalidation<T>;
  try {
    revalidation = validateRevalidation(
      await hooks.revalidate(
        hookContext(request, state, abortController.signal),
      ),
    );
  } catch (error) {
    heartbeat.stop();
    return handlePreBoundaryFailure(
      request,
      state,
      error,
      request.boundaryEvidenceRefs,
    );
  }
  heartbeatFault = heartbeat.failure();
  if (heartbeatFault.failed) {
    heartbeat.stop();
    return handlePreBoundaryFailure(
      request,
      state,
      heartbeatFault.error,
      request.boundaryEvidenceRefs,
    );
  }
  if (revalidation.decision === 'adopt') {
    try {
      const adoptionEvidence = mergeEvidenceRefs([
        request.boundaryEvidenceRefs,
        revalidation.evidenceRefs,
      ]);
      const verified = hooks.verifyAdopted
        ? await hooks.verifyAdopted(
          revalidation.value,
          adoptionEvidence,
          hookContext(request, state, abortController.signal),
        )
        : false;
      if (verified !== true) {
        throw Object.assign(
          new Error('E_TASK_EXECUTION_ADMISSION_ADOPTION_UNVERIFIED'),
          { code: 'E_TASK_EXECUTION_ADMISSION_ADOPTION_UNVERIFIED' },
        );
      }
    } catch (error) {
      heartbeat.stop();
      return handlePreBoundaryFailure(
        request,
        state,
        error,
        request.boundaryEvidenceRefs,
      );
    }
  }
  if (revalidation.decision !== 'dispatch') {
    heartbeat.stop();
    return adoptOrHold(request, state, revalidation);
  }

  let recoveryEvidence: readonly string[];
  state.phase = 'recovery-intent';
  try {
    recoveryEvidence = validatedEvidenceRefs(
      await hooks.persistRecoveryIntent(
        hookContext(request, state, abortController.signal),
      ),
      {
        maxRefs: MAX_ADMISSION_RECOVERY_EVIDENCE_REFS,
        maxTotalBytes: MAX_ADMISSION_RECOVERY_EVIDENCE_BYTES,
        code: 'E_TASK_EXECUTION_ADMISSION_RECOVERY_EVIDENCE_INVALID',
      },
    );
    const verified = await hooks.verifyRecoveryIntent(
      recoveryEvidence,
      hookContext(request, state, abortController.signal),
    );
    if (verified !== true) {
      throw Object.assign(
        new Error('E_TASK_EXECUTION_ADMISSION_RECOVERY_EVIDENCE_UNVERIFIED'),
        { code: 'E_TASK_EXECUTION_ADMISSION_RECOVERY_EVIDENCE_UNVERIFIED' },
      );
    }
    state.recoveryEvidenceRefs = recoveryEvidence;
    heartbeatFault = heartbeat.failure();
    if (heartbeatFault.failed) throw heartbeatFault.error;
  } catch (error) {
    heartbeat.stop();
    return handlePreBoundaryFailure(
      request,
      state,
      error,
      request.boundaryEvidenceRefs,
    );
  }

  let boundaryEvidence: readonly string[];
  try {
    boundaryEvidence = mergeEvidenceRefs(
      [
        request.boundaryEvidenceRefs,
        revalidation.evidenceRefs,
        recoveryEvidence,
      ],
      {
        maxRefs: MAX_ADMISSION_BOUNDARY_EVIDENCE_REFS,
        maxTotalBytes: MAX_ADMISSION_BOUNDARY_EVIDENCE_BYTES,
      },
    );
  } catch (error) {
    heartbeat.stop();
    return handlePreBoundaryFailure(
      request,
      state,
      error,
      request.boundaryEvidenceRefs,
    );
  }
  state.phase = 'boundary';
  try {
    state.lock = renewExecutionLock(
      request.projectRoot,
      request.taskId,
      state.lock.ownerId,
      request.lockOptions,
    );
    state.boundary = beginExecutionLockIrreversibleBoundary(
      request.projectRoot,
      state.lock,
      { evidenceRefs: boundaryEvidence },
      request.lockOptions,
    );
  } catch (error) {
    heartbeat.stop();
    return handleBoundaryEntryFailure(
      request,
      state,
      error,
      boundaryEvidence,
    );
  }

  let preparedEvidence: readonly string[] = [];
  let dispatchedEvidence: readonly string[] = [];
  try {
    state.phase = 'prepare';
    preparedEvidence = validatedEvidenceRefs(
      await hooks.persistPrepared(
        hookContext(request, state, abortController.signal),
      ),
      {
        maxRefs: MAX_ADMISSION_PHASE_EVIDENCE_REFS,
        maxTotalBytes: MAX_ADMISSION_PHASE_EVIDENCE_BYTES,
        code: 'E_TASK_EXECUTION_ADMISSION_PREPARED_EVIDENCE_INVALID',
      },
    );
    mergeEvidenceRefs(
      [boundaryEvidence, preparedEvidence],
      {
        maxRefs: MAX_ADMISSION_PRE_DISPATCH_EVIDENCE_REFS,
        maxTotalBytes: MAX_ADMISSION_PRE_DISPATCH_EVIDENCE_BYTES,
        code: 'E_TASK_EXECUTION_ADMISSION_PREPARED_EVIDENCE_INVALID',
      },
    );
    heartbeatFault = heartbeat.failure();
    if (heartbeatFault.failed) throw heartbeatFault.error;

    state.phase = 'dispatch';
    state.processState = 'possibly-started';
    const value = await hooks.dispatch(
      hookContext(request, state, abortController.signal),
    );
    state.processState = 'dispatch-returned';
    heartbeatFault = heartbeat.failure();
    if (heartbeatFault.failed) throw heartbeatFault.error;

    state.phase = 'persist-dispatched';
    dispatchedEvidence = validatedEvidenceRefs(
      await hooks.persistDispatched(
        value,
        hookContext(request, state, abortController.signal),
      ),
      {
        maxRefs: MAX_ADMISSION_PHASE_EVIDENCE_REFS,
        maxTotalBytes: MAX_ADMISSION_PHASE_EVIDENCE_BYTES,
        code: 'E_TASK_EXECUTION_ADMISSION_DISPATCH_EVIDENCE_INVALID',
      },
    );
    heartbeatFault = heartbeat.failure();
    if (heartbeatFault.failed) throw heartbeatFault.error;

    state.phase = 'verify-dispatched';
    const verified = await hooks.verifyDispatched(
      value,
      dispatchedEvidence,
      hookContext(request, state, abortController.signal),
    );
    if (verified !== true) {
      throw Object.assign(
        new Error('E_TASK_EXECUTION_ADMISSION_DISPATCH_EVIDENCE_UNVERIFIED'),
        { code: 'E_TASK_EXECUTION_ADMISSION_DISPATCH_EVIDENCE_UNVERIFIED' },
      );
    }
    heartbeatFault = heartbeat.failure();
    if (heartbeatFault.failed) throw heartbeatFault.error;

    const completionEvidence = mergeEvidenceRefs([
      boundaryEvidence,
      preparedEvidence,
      dispatchedEvidence,
    ]);
    state.phase = 'complete';
    const completion = completeExecutionLockIrreversibleBoundary(
      request.projectRoot,
      state.lock,
      {
        quarantineId: state.boundary.quarantineId,
        evidenceRefs: completionEvidence,
      },
      request.lockOptions,
    );
    heartbeat.stop();
    return {
      state: 'dispatched',
      phase: 'complete',
      processState: 'dispatch-returned',
      value,
      fencingToken: state.lock.fencingToken,
      quarantineId: completion.completed.quarantineId,
      projectionCleanup: completion.projectionCleanup,
      evidenceRefs: completionEvidence,
    };
  } catch (error) {
    const terminalHeartbeatFault = heartbeat.failure();
    heartbeat.stop();
    return quarantineAfterBoundary(
      request,
      state,
      error,
      safeOutcomeEvidenceRefs([
        ...boundaryEvidence,
        ...preparedEvidence,
        ...dispatchedEvidence,
      ]),
      terminalHeartbeatFault.failed
        ? 'heartbeat-fault'
        : 'authority-uncertain',
    );
  }
}
